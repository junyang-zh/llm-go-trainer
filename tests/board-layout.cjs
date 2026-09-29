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
  if (
    document.querySelector('[role="tab"][aria-selected="true"]')?.textContent !== '通用' ||
    !document.querySelector('[aria-label="通用设置"]')
  )
    throw new Error('General settings are not the default tab');
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
  const timeline = document.querySelector('.timeline');
  const track = document.querySelector('.timeline-control');
  async function seek(value) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(timeline, value);
    timeline.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(30);
  }
  await seek(2);
  document
    .querySelector('[aria-label="C4 空点"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await until(() => document.querySelector('[aria-label="C4 试下"]'));
  if (timeline.value !== '3' || timeline.max !== '3')
    throw new Error('Trial timeline does not end at the current trial move');
  if (!document.querySelector('[aria-label="下一手"]').disabled)
    throw new Error('Trial allows advancing into future history');
  const trackWidth = track.getBoundingClientRect().width;
  const trialWidth = timeline.getBoundingClientRect().width;
  if (Math.abs(trialWidth - (16 + (trackWidth - 16) / 2)) > 1)
    throw new Error('Trial thumb is not aligned with its position on the full history scale');
  const trackBackground = getComputedStyle(track, '::before').backgroundImage;
  if (
    !['75, 112, 86', '196, 79, 67', '203, 209, 198'].every((color) =>
      trackBackground.includes(color),
    )
  )
    throw new Error('History, trial, and future timeline segments are missing');
  await seek(6);
  if (timeline.value !== '3') throw new Error('Trial slider entered future history');
  document
    .querySelector('[aria-label="E4 空点"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await until(() => timeline.value === '4');
  const beforeRewind = timeline.getBoundingClientRect();
  document.querySelector('[aria-label="上一手"]').click();
  await until(() => timeline.value === '3');
  const afterRewind = timeline.getBoundingClientRect();
  if (timeline.max !== '4' || Math.abs(beforeRewind.width - afterRewind.width) > 0.1)
    throw new Error('Rewinding changed the recoverable trial scale');
  const segments = getComputedStyle(track);
  for (const [name, expected] of [
    ['--history-progress', 100 / 3],
    ['--trial-progress', 50],
    ['--trial-end', 200 / 3],
  ]) {
    if (Math.abs(parseFloat(segments.getPropertyValue(name)) - expected) > 0.1)
      throw new Error(`Incorrect four-segment boundary: ${name}`);
  }
  if (!getComputedStyle(track, '::before').backgroundImage.includes('203, 167, 161'))
    throw new Error('Recoverable trial segment is missing');
  document.querySelector('[aria-label="下一手"]').click();
  await until(() => timeline.value === '4');
  if (!document.querySelector('[aria-label="E4 试下"]'))
    throw new Error('Next did not restore the trial move');
  await seek(3);
  for (const point of ['E4', 'F4', 'G4', 'H4']) {
    document
      .querySelector(`[aria-label="${point} 空点"]`)
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await until(() => document.querySelector(`[aria-label="${point} 试下"]`));
  }
  if (
    timeline.value !== '7' ||
    Math.abs(timeline.getBoundingClientRect().width - track.getBoundingClientRect().width) > 1
  )
    throw new Error('Trial beyond the original history does not extend the timeline');
  document.querySelector('[aria-label="上一手"]').click();
  await until(() => timeline.value === '6');
  if (document.querySelector('[aria-label="H4 试下"]'))
    throw new Error('Previous move did not undo the latest trial stone');
  await seek(3);
  if (document.querySelectorAll('.trial-stone').length !== 1)
    throw new Error('Slider did not rewind the trial');
  if (timeline.max !== '7') throw new Error('Rewinding beyond history shortened the trial');
  await seek(7);
  if (document.querySelectorAll('.trial-stone').length !== 5)
    throw new Error('Could not restore the full trial');
  await seek(1);
  if (document.querySelector('.trial-stone') || timeline.max !== '6')
    throw new Error('Seeking into history did not exit the trial');
  await seek(6);
  await until(() => document.querySelector('.candidates button')?.textContent.includes('C4'));
  document.querySelector('.candidates button').click();
  await until(() => timeline.value === '8');
  function checkNumber(point, number, fill) {
    const label = document.querySelector(`[aria-label="${point} 试下"]`);
    if (!label || label.tagName !== 'text' || label.textContent !== String(number))
      throw new Error(`Missing centered trial number ${number} at ${point}`);
    if (fill && label.getAttribute('fill') !== fill)
      throw new Error(`Trial number at ${point} is not in the opposite stone color`);
  }
  checkNumber('C4', 1, '#fffefa');
  checkNumber('D5', 2, '#222620');
  if (document.querySelector('[aria-label="变化下一手"]'))
    throw new Error('Candidate still uses the separate variation preview');
  document
    .querySelector('[aria-label="E3 空点"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await until(() => timeline.value === '9');
  checkNumber('E3', 3);
  await until(() => document.querySelector('.candidates button')?.textContent.includes('E4'));
  document.querySelector('.candidates button').click();
  await until(() => timeline.value === '11');
  checkNumber('E4', 4);
  checkNumber('F4', 5);
  document.querySelector('[aria-label="上一手"]').click();
  await until(() => timeline.value === '10');
  if (document.querySelector('[aria-label="F4 试下"]'))
    throw new Error('Could not undo a move from the candidate continuation');
  await seek(6);
  if (document.querySelector('.trial-stone') || timeline.max !== '11')
    throw new Error('Trial origin did not preserve the recoverable continuation');
  return { viewport: [innerWidth, innerHeight], board: initial.width, samples };
}

async function checkTimelinePointer(win) {
  const read = () =>
    win.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('.timeline');
    const rect = input.getBoundingClientRect();
    return { value: +input.value, max: +input.max, x: rect.x, width: rect.width, y: rect.y + rect.height / 2 };
  })()`);
  const settle = () =>
    win.webContents.executeJavaScript(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
  const initial = await read();
  const x = (value) => Math.round(initial.x + 8 + ((initial.width - 16) * value) / initial.max);
  const y = Math.round(initial.y);
  const mouse = async (type, value) => {
    win.webContents.sendInputEvent({
      type,
      x: x(value),
      y,
      button: 'left',
      clickCount: 1,
      modifiers: type === 'mouseUp' ? [] : ['leftButtonDown'],
    });
    await settle();
  };
  // A native track click used to shrink max on pointer-down and jump again on pointer-up.
  await mouse('mouseDown', 8);
  await mouse('mouseUp', 8);
  let state = await read();
  if (state.value !== 8 || state.max !== 11 || Math.abs(state.width - initial.width) > 0.1)
    throw new Error(`Native trial click changed its scale: ${JSON.stringify(state)}`);
  await mouse('mouseDown', 8);
  for (const value of [7, 9, 11, 8]) {
    await mouse('mouseMove', value);
    state = await read();
    if (state.value !== value || state.max !== 11 || Math.abs(state.width - initial.width) > 0.1)
      throw new Error(`Native trial drag jumped at ${value}: ${JSON.stringify(state)}`);
  }
  // Exiting into original history must retain the pointer scale until the gesture ends.
  await mouse('mouseMove', 5);
  state = await read();
  if (state.value !== 5 || state.max !== 11)
    throw new Error('Crossing into history changed the scale during a drag');
  await mouse('mouseUp', 5);
  state = await read();
  if (state.value !== 5 || state.max !== 6)
    throw new Error('Releasing in history did not restore the original timeline');
  return 'native trial click/drag/restore passed';
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
        await win.webContents.executeJavaScript(
          "localStorage.setItem('go-trainer-language-v1', 'zh-CN')",
        );
        await win.loadURL(win.webContents.getURL());
        const result = await win.webContents.executeJavaScript(`(${checkLayout.toString()})()`);
        console.log({ ...result, pointer: await checkTimelinePointer(win) });
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
