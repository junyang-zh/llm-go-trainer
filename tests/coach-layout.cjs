const { app, BrowserWindow } = require('electron');
const express = require('express');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const fixture = require('./fixtures/coach-markup.cjs');
const layoutApi = require('./fixtures/layout-api.cjs');
const profile = mkdtempSync(join(tmpdir(), 'go-coach-layout-'));
app.setPath('userData', profile);
app.on('window-all-closed', () => {});
process.on('exit', () => rmSync(profile, { recursive: true, force: true }));

async function check() {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (predicate, name) => {
    for (let i = 0; i < 150; i++) {
      if (predicate()) return;
      await delay(20);
    }
    throw new Error(name);
  };
  const button = (text) =>
    [...document.querySelectorAll('button')].find((el) => el.textContent === text);
  const marker = (point) => document.querySelector(`.coach-board-mark[data-point="${point}"]`);
  await until(() => button('变化一'), 'Answer missing');
  const log = document.querySelector('.chat-log');
  log.scrollTop = log.scrollHeight;
  button('变化一').click();
  await until(() => marker('C2') && marker('B2') && marker('D4'), 'Visible group missing');
  if (marker('A19') || marker('T19') || marker('T18') || marker('T17') || marker('B3'))
    throw new Error('Inactive or hidden text rendered on board');
  const text = document.querySelector('[data-go-point="C2"]');
  const paragraph = text.parentElement;
  paragraph.style.whiteSpace = 'nowrap';
  paragraph.style.width = '8px';
  paragraph.style.overflow = 'hidden';
  window.dispatchEvent(new Event('resize'));
  await until(() => !marker('C2'), 'Nested clipping was ignored');
  paragraph.style.removeProperty('white-space');
  paragraph.style.removeProperty('width');
  paragraph.style.removeProperty('overflow');
  window.dispatchEvent(new Event('resize'));
  await until(() => marker('C2'), 'Nested clipping restore failed');
  const rect = text.getBoundingClientRect();
  const before = marker('C2').getAttribute('stroke');
  text.dispatchEvent(
    new PointerEvent('pointermove', {
      bubbles: true,
      clientX: rect.left + 3,
      clientY: rect.top + 3,
    }),
  );
  await until(() => document.querySelector('.coach-guide'), 'Text hover guide missing');
  if (marker('C2').getAttribute('stroke') === before)
    throw new Error('Proximity brightness did not change');
  const target = document.querySelector('[data-board-point="C2"]');
  const boardRect = target.getBoundingClientRect();
  const mark = marker('C2');
  if (Math.abs(+mark.getAttribute('cx') - boardRect.left - boardRect.width / 2) > 1)
    throw new Error('Marker is misaligned');
  target.dispatchEvent(
    new PointerEvent('pointermove', {
      bubbles: true,
      clientX: boardRect.left + boardRect.width / 2,
      clientY: boardRect.top + boardRect.height / 2,
    }),
  );
  await delay(50);
  if (!document.querySelector('.coach-guide')) throw new Error('Board hover guide missing');
  log.scrollTop = 0;
  await until(() => !marker('C2') && marker('A19'), 'Scroll clipping did not update');
  if (document.querySelector('.coach-guide')) throw new Error('Offscreen guide survived');
  log.scrollTop = log.scrollHeight;
  await until(() => marker('C2'), 'Scroll restore failed');
  button('变化二').click();
  await until(() => marker('B3') && !marker('C2') && !marker('B2'), 'Groups are not exclusive');
  if (!document.querySelector('[aria-label="C2 试下"]'))
    throw new Error('Branch cursor did not navigate');
  button('变化二').click();
  await until(() => !marker('B3'), 'Toggle off failed');
  button('变化一').click();
  await until(() => marker('C2'), 'Toggle back failed');
  document.querySelector('[aria-label="收起对话面板"]').click();
  await until(
    () => !document.querySelector('.coach-board-mark'),
    'Collapsed panel still renders markers',
  );
  document.querySelector('[aria-label="展开对话面板"]').click();
  await until(() => marker('C2'), 'Expanded panel failed to restore');
  document.querySelector('[data-go-point="C2"]').focus();
  await until(() => document.querySelector('.coach-guide'), 'Keyboard focus guide missing');
  const focused = document.activeElement;
  await delay(1600);
  if (document.activeElement !== focused || !document.querySelector('.coach-guide'))
    throw new Error(
      'Status polling lost focus or guide ' +
        JSON.stringify({
          focus: document.activeElement.outerHTML,
          connected: focused.isConnected,
          guide: !!document.querySelector('.coach-guide'),
          hasFocus: document.hasFocus(),
          hidden: document.hidden,
        }),
    );
  document.querySelector('[aria-label="下一手"]').click();
  await until(() => !marker('C2'), 'Stale marks survived board navigation');
  return {
    size: [innerWidth, innerHeight],
    passed: 'groups, branch navigation, proximity, hover/focus, clipping, collapse, context',
  };
}
app.whenReady().then(async () => {
  let server,
    code = 0;
  try {
    const site = express();
    site.use('/api', layoutApi());
    site.use(express.static(join(__dirname, '../dist')));
    server = site.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    for (const [kind, record] of [
      ['games', fixture.game],
      ['conversations', fixture.conversation],
    ])
      await fetch(`${url}/api/library/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    for (const [width, height] of [
      [1280, 800],
      [900, 540],
      [640, 480],
    ]) {
      const win = new BrowserWindow({
        width,
        height,
        useContentSize: true,
        show: true,
        webPreferences: {
          partition: `coach-${width}`,
          backgroundThrottling: false,
          sandbox: true,
          contextIsolation: true,
        },
      });
      try {
        await win.loadURL(url);
        await win.webContents.executeJavaScript(
          "localStorage.setItem('go-trainer-language-v1', 'zh-CN')",
        );
        await win.loadURL(win.webContents.getURL());
        console.log(await win.webContents.executeJavaScript(`(${check.toString()})()`));
      } finally {
        win.destroy();
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
