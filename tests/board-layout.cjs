const { app, BrowserWindow } = require('electron');
const express = require('express');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const layoutApi = require('./fixtures/layout-api.cjs');

// Use the built UI in Electron, with isolated storage and no real engine or LLM.
const profile = mkdtempSync(join(tmpdir(), 'go-board-layout-'));
app.setPath('userData', profile);
let server;

async function checkLayout() {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function until(predicate) {
    const deadline = performance.now() + 4000;
    while (!predicate()) {
      if (performance.now() > deadline) throw new Error('Timed out waiting for the UI');
      await delay(20);
    }
  }
  await until(() => !document.querySelector('[aria-label="AI 自动落子"]').disabled);
  if (document.querySelector('.candidates') || document.querySelector('.evaluation-current'))
    throw new Error('Evaluation details should be hidden initially');
  await delay(100);
  const toolbar = document.querySelector('.board-toolbar').getBoundingClientRect();
  const notification = document.querySelector('.workspace-status').getBoundingClientRect();
  if (Math.abs(toolbar.top + toolbar.height / 2 - notification.top - notification.height / 2) > 1)
    throw new Error('Notification is not aligned with the toolbar');
  if (innerWidth >= 640 && toolbar.right > notification.left)
    throw new Error('Toolbar overlaps the notification');
  const settings = document.querySelector('.settings-trigger');
  if (!settings.querySelector('.board-logo')) throw new Error('Logo is not the settings entry');
  settings.click();
  await until(() => document.querySelector('dialog[open]'));
  document.querySelector('.dialog-toolbar button').click();
  await until(() => !document.querySelector('dialog[open]'));
  const frame = document.querySelector('.board-frame');
  const stage = document.querySelector('.board-stage');
  const initial = frame.getBoundingClientRect();
  let samples = 0;
  const issues = new Set();
  let animation;
  function sample() {
    const board = frame.getBoundingClientRect();
    const available = stage.getBoundingClientRect();
    samples++;
    if (['x', 'y', 'width', 'height'].some((key) => Math.abs(board[key] - initial[key]) > 0.1))
      issues.add(`Board moved/resized: ${initial.width} -> ${board.width}`);
    if (Math.abs(board.width - board.height) > 0.1) issues.add('Board is not square');
    if (
      board.left < available.left - 0.1 ||
      board.top < available.top - 0.1 ||
      board.right > available.right + 0.1 ||
      board.bottom > available.bottom + 0.1
    )
      issues.add('Board exceeds its available space');
    if (
      document.documentElement.scrollHeight > innerHeight ||
      document.documentElement.scrollWidth > innerWidth
    )
      issues.add('Page overflows the viewport');
    animation = requestAnimationFrame(sample);
  }
  animation = requestAnimationFrame(sample);
  try {
    document.querySelector('[aria-label="AI 自动落子"]').click();
    for (const [index, point] of ['D4', 'Q4', 'C3'].entries()) {
      document
        .querySelector(`[aria-label="${point} 空点"]`)
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await until(() =>
        document.querySelector('.workspace-status')?.textContent.includes('搜索中'),
      );
      await until(() => +document.querySelector('.timeline').value === (index + 1) * 2);
      await delay(250);
      document.querySelector('[aria-label="关闭通知"]').click();
      await delay(50);
    }
    document
      .querySelector('[aria-label="D4 黑子"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await until(() => document.querySelector('.workspace-status[role="alert"]'));
    await delay(50);
    document.querySelector('[aria-label="关闭通知"]').click();
    document.querySelector('.evaluation-toggle').click();
    const explain = [...document.querySelectorAll('.quick-actions button')].find(
      (button) => button.textContent === '解释这一手',
    );
    explain.click();
    await until(() => document.querySelector('textarea').value === '解释这一手');
    if (document.querySelector('.agent-tool.running'))
      throw new Error('Quick prompt sent without confirmation');
    document.querySelector('.chat-input button.primary').click();
    await until(() => document.querySelector('.agent-tool.running'));
    document.querySelector('.agent-tool summary').click();
    if (!document.querySelector('.agent-tool').open) throw new Error('Tool details did not expand');
    await until(() => document.querySelector('.agent-tool.done'));
    if (!document.querySelector('.agent-tool-detail').textContent.includes('黑胜率 60.0%'))
      throw new Error('Tool evaluation did not render');
    if (!document.querySelector('.chat-message strong'))
      throw new Error('Agent answer did not render Markdown');
    await until(() => !explain.disabled);
    explain.click();
    await until(() => document.querySelector('textarea').value === '解释这一手');
    if (document.querySelector('.agent-tool.running'))
      throw new Error('Quick prompt sent without confirmation');
    document.querySelector('.chat-input button.primary').click();
    await until(() => document.querySelector('.agent-tool.running'));
    [...document.querySelectorAll('.chat-input button')]
      .find((button) => button.textContent === '停止')
      .click();
    await until(() => document.querySelector('.agent-tool.stopped'));
    await delay(400);
    if (document.querySelector('.agent-tool.running'))
      throw new Error('Stopped tool is still running');
    document.querySelector('[aria-label="AI 自动落子"]').click();
    document.querySelector('[aria-label="上一手"]').click();
    await delay(100);
    document
      .querySelector('[aria-label="C4 空点"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await until(() => document.querySelector('[aria-label="C4 试下"]'));
    await delay(100);
    [...document.querySelectorAll('.trial-bar button')]
      .find((button) => button.textContent === '清空试下')
      .click();
    await until(() => !document.querySelector('[aria-label="C4 试下"]'));
    document.querySelector('[aria-label="下一手"]').click();
    await delay(100);
  } finally {
    cancelAnimationFrame(animation);
  }
  if (issues.size) throw new Error([...issues].join('; '));
  return { viewport: [innerWidth, innerHeight], board: initial.width, samples };
}

app.whenReady().then(async () => {
  let exitCode = 0;
  try {
    const site = express();
    site.use('/api', layoutApi());
    site.use(express.static(join(__dirname, '../dist')));
    server = site.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    for (const [width, height] of [
      [1280, 800],
      [1280, 600],
      [900, 540],
      [760, 480],
      [640, 800],
      [640, 480],
    ]) {
      await fetch(`http://127.0.0.1:${server.address().port}/api/fixture/reset`, {
        method: 'POST',
      });
      const win = new BrowserWindow({
        width,
        height,
        useContentSize: true,
        show: false,
        webPreferences: {
          partition: `layout-${width}-${height}`,
          backgroundThrottling: false,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      try {
        await win.loadURL(`http://127.0.0.1:${server.address().port}`);
        console.log(await win.webContents.executeJavaScript(`(${checkLayout.toString()})()`));
      } finally {
        win.destroy();
      }
    }
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    app.exit(exitCode);
  }
});
app.on('window-all-closed', () => {});
process.on('exit', () => rmSync(profile, { recursive: true, force: true }));
