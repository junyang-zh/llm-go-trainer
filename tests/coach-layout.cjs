const { app, BrowserWindow } = require('electron');
const express = require('express');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
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
    throw new Error(typeof name === 'function' ? name() : name);
  };
  const button = (text) =>
    [...document.querySelectorAll('button')].find((el) => el.textContent === text);
  const marker = (point) => document.querySelector(`.coach-board-mark[data-point="${point}"]`);
  const region = () => document.querySelector('.coach-board-region[data-points="P4 Q3 Q4 R2 R3"]');
  await until(() => button('变化一'), 'Answer missing');
  const log = document.querySelector('.chat-log');
  log.scrollTop = log.scrollHeight;
  button('变化一').click();
  await until(() => marker('C2') && marker('B2') && marker('D4'), 'Visible group missing');
  await until(() => region(), 'Visible region missing');
  if (document.querySelectorAll('.coach-board-region').length !== 1 || marker('P4') || marker('Q3'))
    throw new Error('Region was duplicated or rendered as individual point marks');
  if (!region().getAttribute('filter') || region().getAttribute('stroke'))
    throw new Error('Region must be a blurred patch without a ring');
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
  await until(
    () => document.querySelector('.coach-guide'),
    () =>
      'Text hover guide missing ' +
      JSON.stringify({
        rect: rect.toJSON(),
        currentRect: text.getBoundingClientRect().toJSON(),
        connected: text.isConnected,
        hovered: document.elementFromPoint(rect.left + 3, rect.top + 3)?.outerHTML,
        mark: marker('C2')?.outerHTML,
        clip: log.getBoundingClientRect().toJSON(),
      }),
  );
  if (marker('C2').getAttribute('stroke') === before)
    throw new Error('Proximity brightness did not change');
  const curve = document
    .querySelector('.coach-guide')
    .getAttribute('d')
    .match(/-?\d+(?:\.\d+)?/g)
    .map(Number);
  const pointMark = marker('C2');
  if (
    curve[0] <= +pointMark.getAttribute('cx') ||
    curve[1] <= +pointMark.getAttribute('cy') ||
    curve[2] <= curve[0] ||
    curve[3] <= curve[1]
  )
    throw new Error('Guide must start on the lower-right rim and head down-right');
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
  await until(() => document.querySelector('.coach-guide'), 'Board hover guide missing');
  const regionText = document.querySelector('[data-go-region="P4 Q4 Q3 R3 R2"]');
  const regionRect = regionText.getBoundingClientRect();
  const faint = +region().getAttribute('opacity');
  regionText.dispatchEvent(
    new PointerEvent('pointermove', {
      bubbles: true,
      clientX: regionRect.left + regionRect.width / 2,
      clientY: regionRect.top + regionRect.height / 2,
    }),
  );
  await until(() => +region().getAttribute('opacity') > faint, 'Region proximity did not change');
  if (document.querySelector('.coach-guide')) throw new Error('Region hover created a guide');
  const regionTarget = document.querySelector('[data-board-point="P4"]');
  const regionBoard = regionTarget.getBoundingClientRect();
  const px = regionBoard.left + regionBoard.width / 2,
    py = regionBoard.top + regionBoard.height / 2;
  regionTarget.dispatchEvent(
    new PointerEvent('pointermove', { bubbles: true, clientX: px, clientY: py }),
  );
  const nearestText = Math.min(
    ...[...document.querySelectorAll('[data-go-region]')]
      .filter((el) => el.dataset.goRegion.includes('P4'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return Math.hypot(px - r.left - r.width / 2, py - r.top - r.height / 2);
      }),
  );
  const expected = 0.16 + (1 - Math.min(1, nearestText / 550)) * 0.2;
  await until(
    () => Math.abs(+region().getAttribute('opacity') - expected) < 0.001,
    'Region reacted to board instead of text distance',
  );
  if (document.querySelector('.coach-guide')) throw new Error('Region board hover created a guide');
  regionText.focus();
  await until(() => +region().getAttribute('opacity') === 0.36, 'Region keyboard focus missing');
  if (document.querySelector('.coach-guide')) throw new Error('Region focus created a guide');
  regionText.blur();
  const regionParagraph = regionText.parentElement;
  regionParagraph.style.overflow = 'hidden';
  regionParagraph.style.height = '0';
  window.dispatchEvent(new Event('resize'));
  await until(() => !region(), 'Region nested clipping ignored');
  regionParagraph.style.removeProperty('overflow');
  regionParagraph.style.removeProperty('height');
  window.dispatchEvent(new Event('resize'));
  await until(() => region(), 'Region clipping restore failed');
  log.scrollTop = 0;
  await until(() => !marker('C2') && marker('A19'), 'Scroll clipping did not update');
  if (region()) throw new Error('Offscreen region survived');
  await until(
    () => document.querySelector('.coach-board-region[data-points="A18 B18"]'),
    'Ungrouped region missing',
  );
  if (document.querySelector('.coach-guide')) throw new Error('Offscreen guide survived');
  log.scrollTop = log.scrollHeight;
  await until(() => marker('C2'), 'Scroll restore failed');
  button('变化二').click();
  await until(() => marker('B3') && !marker('C2') && !marker('B2'), 'Groups are not exclusive');
  if (region()) throw new Error('Inactive region group survived');
  if (!document.querySelector('[aria-label="C2 试下"]'))
    throw new Error('Branch cursor did not navigate');
  button('变化二').click();
  await until(() => !marker('B3'), 'Toggle off failed');
  button('变化一').click();
  await until(() => marker('C2'), 'Toggle back failed');
  document.querySelector('[aria-label="收起对话面板"]').click();
  await until(
    () => !document.querySelector('.coach-board-mark, .coach-board-region'),
    'Collapsed panel still renders markers',
  );
  document.querySelector('[aria-label="展开对话面板"]').click();
  await until(() => marker('C2'), 'Expanded panel failed to restore');
  document.querySelector('[data-go-point="C2"]').focus();
  await until(
    () => document.querySelector('.coach-guide'),
    () =>
      'Keyboard focus guide missing ' +
      JSON.stringify({
        size: [innerWidth, innerHeight],
        active: document.activeElement?.outerHTML,
        hidden: document.hidden,
        point: document.querySelector('[data-go-point="C2"]')?.getBoundingClientRect().toJSON(),
        clip: log.getBoundingClientRect().toJSON(),
        mark: marker('C2')?.outerHTML,
      }),
  );
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
  await until(() => !marker('C2') && !region(), 'Stale marks survived board navigation');
  return {
    size: [innerWidth, innerHeight],
    passed:
      'groups, regions, text-only fog proximity, lower-right Bézier, branch navigation, hover/focus, clipping, collapse, context',
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
        if (process.env.GO_TRAINER_LAYOUT_SCREENSHOTS) {
          await win.webContents.executeJavaScript(`(async () => {
            [...document.querySelectorAll('button')].find(el => el.textContent === '变化一').click();
            const log = document.querySelector('.chat-log');
            log.scrollTop = log.scrollHeight;
            await new Promise(resolve => setTimeout(resolve, 100));
            document.querySelector('[data-go-region="P4 Q4 Q3 R3 R2"]').focus();
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          })()`);
          writeFileSync(
            join(process.env.GO_TRAINER_LAYOUT_SCREENSHOTS, `coach-region-${width}.png`),
            (await win.webContents.capturePage()).toPNG(),
          );
        }
      } catch (error) {
        if (process.env.GO_TRAINER_LAYOUT_SCREENSHOTS)
          writeFileSync(
            join(process.env.GO_TRAINER_LAYOUT_SCREENSHOTS, `coach-failure-${width}.png`),
            (await win.webContents.capturePage()).toPNG(),
          );
        throw error;
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
