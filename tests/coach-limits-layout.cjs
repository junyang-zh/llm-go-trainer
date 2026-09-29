const { app, BrowserWindow } = require('electron');
const express = require('express');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const layoutApi = require('./fixtures/layout-api.cjs');
const limitsApi = require('./fixtures/coach-limits-api.cjs');
const profile = mkdtempSync(join(tmpdir(), 'go-coach-limits-'));
app.setPath('userData', profile);
app.on('window-all-closed', () => {});
process.on('exit', () => rmSync(profile, { recursive: true, force: true }));
async function check() {
  const until = async (predicate, name) => {
    for (let i = 0; i < 150; i++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(name);
  };
  const button = (text) =>
    [...document.querySelectorAll('button')].find((el) => el.textContent === text);
  const value = (input, text) => {
    Object.getOwnPropertyDescriptor(
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value',
    ).set.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  await until(() => document.querySelector('[aria-label="设置"]'), 'App missing');
  document.querySelector('[aria-label="设置"]').click();
  await until(() => button('连接 LLM'), 'Settings tabs missing');
  button('连接 LLM').click();
  const summary = () =>
    [...document.querySelectorAll('summary')].find((el) => el.textContent === 'Agent 工作量上限');
  await until(summary, 'Work limits missing');
  summary().click();
  const input = () =>
    [...document.querySelectorAll('.llm-settings input')].find((el) =>
      el.parentElement.textContent.includes('最长用时'),
    );
  if (input().value !== '' || input().placeholder !== '无限制')
    throw new Error('Default must be unlimited');
  if (getComputedStyle(summary()).justifyContent !== 'flex-start')
    throw new Error('Limit summary must align left');
  if (getComputedStyle(input()).textAlign !== 'left')
    throw new Error('Limit input must align left');
  if (document.querySelectorAll('.llm-divider').length !== 2)
    throw new Error('LLM section dividers missing');
  value(input(), '600');
  await until(() => input().value === '600', 'Draft not updated');
  button('保存工作量上限').click();
  await until(
    () => document.querySelector('.llm-settings-footer [role="status"]'),
    'Save did not finish',
  );
  if ((await (await fetch('/api/llm/settings')).json()).limits.timeoutSeconds !== 600)
    throw new Error('Limit was not saved');
  value(input(), '');
  await until(() => input().value === '', 'Limit did not clear');
  button('保存工作量上限').click();
  await until(() => !button('保存工作量上限').disabled, 'Cleared limit save did not finish');
  if ((await (await fetch('/api/llm/settings')).json()).limits.timeoutSeconds !== 0)
    throw new Error('Clearing limit must save unlimited');
  document.querySelector('[aria-label="关闭设置"]').click();
  await until(() => !document.querySelector('dialog'), 'Dialog did not close');
  const textarea = document.querySelector('.chat-input textarea');
  value(textarea, '摆一个定式');
  await until(() => !button('发送')?.disabled, 'Send disabled');
  document
    .querySelector('.chat-input')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await until(
    () => button('继续') && !button('继续').disabled,
    'Continue button missing or still locked',
  );
  if (!document.querySelector('.message-status.paused').textContent.includes('超时'))
    throw new Error('Timeout reason missing');
  const box = button('继续').getBoundingClientRect();
  if (box.width > 75 || box.height > 35) throw new Error('Continue button is not compact');
  const count = document.querySelectorAll('.chat-log article').length;
  button('继续').click();
  await until(
    () => document.querySelector('.chat-log').textContent.includes('继续完成。'),
    'Continuation did not finish',
  );
  await until(() => !button('继续'), 'Continue button remains after completion');
  if (document.querySelectorAll('.chat-log article').length !== count)
    throw new Error('Continuation created another message');
  if (!document.querySelector('.chat-log').textContent.includes('第一段。'))
    throw new Error('Partial text was lost');
  return {
    size: [innerWidth, innerHeight],
    passed: 'settings persistence, timeout hint, compact continue, same-message completion',
  };
}
app.whenReady().then(async () => {
  let server,
    code = 0;
  try {
    for (const [width, height] of [
      [1280, 800],
      [640, 480],
    ]) {
      const site = express();
      site.use('/api', limitsApi(), layoutApi());
      site.use(express.static(join(__dirname, '../dist')));
      server = site.listen(0, '127.0.0.1');
      await new Promise((resolve) => server.once('listening', resolve));
      const win = new BrowserWindow({
        width,
        height,
        useContentSize: true,
        show: true,
        webPreferences: {
          partition: `limits-${width}`,
          backgroundThrottling: false,
          sandbox: true,
          contextIsolation: true,
        },
      });
      try {
        await win.loadURL(`http://127.0.0.1:${server.address().port}`);
        console.log(await win.webContents.executeJavaScript(`(${check.toString()})()`));
      } finally {
        win.destroy();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        server = undefined;
      }
    }
  } catch (error) {
    console.error(error);
    code = 1;
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    app.exit(code);
  }
});
