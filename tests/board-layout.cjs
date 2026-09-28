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
  await until(() => document.querySelector('.candidates'));
  await delay(100);
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
    const mode = document.querySelector('[aria-label="对局模式"]');
    mode.value = 'play';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    for (const [index, point] of ['D4', 'Q4', 'C3'].entries()) {
      document
        .querySelector(`[aria-label="${point} 空点"]`)
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await until(() => document.querySelector('.board-status')?.textContent.includes('搜索中'));
      await until(() => +document.querySelector('.timeline').value === (index + 1) * 2);
      await delay(250);
      document.querySelector('[aria-label="关闭通知"]').click();
      await delay(50);
    }
    document
      .querySelector('[aria-label="D4 黑子"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await until(() => document.querySelector('.board-status[role="alert"]'));
    await delay(50);
    document.querySelector('[aria-label="关闭通知"]').click();
    document.querySelector('.evaluation-toggle').click();
    const explain = [...document.querySelectorAll('.quick-actions button')].find(
      (button) => button.textContent === '解释这一手',
    );
    explain.click();
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
    await until(() => document.querySelector('.agent-tool.running'));
    [...document.querySelectorAll('.chat-input button')]
      .find((button) => button.textContent === '停止')
      .click();
    await until(() => document.querySelector('.agent-tool.stopped'));
    await delay(400);
    if (document.querySelector('.agent-tool.running'))
      throw new Error('Stopped tool is still running');
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
    ]) {
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
