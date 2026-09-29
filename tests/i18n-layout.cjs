const { app, BrowserWindow } = require('electron');
const express = require('express');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const fixture = require('./fixtures/i18n-api.cjs');
const profile = mkdtempSync(join(tmpdir(), 'go-i18n-layout-'));
app.setPath('userData', profile);
app.on('window-all-closed', () => {});
process.on('exit', () => rmSync(profile, { recursive: true, force: true }));

async function check(locale, messages) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function until(predicate, name) {
    for (let i = 0; i < 200; i++) {
      if (predicate()) return;
      await delay(20);
    }
    throw new Error(`${locale}: ${name}`);
  }
  const click = (selector) => document.querySelector(selector).click();
  const bounds = (selector) => document.querySelector(selector).getBoundingClientRect();
  const checkOverflow = (selector) => {
    const element = document.querySelector(selector);
    if (element.scrollWidth > element.clientWidth + 1)
      throw new Error(
        `${locale}: horizontal overflow in ${selector}: ${element.scrollWidth}/${element.clientWidth}`,
      );
  };
  const change = (element, value) => {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const search = async (stage, count = 0) => {
    await fetch('/api/fixture/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, count }),
    });
    await delay(80);
  };
  await until(() => !document.querySelector('.auto-play-toggle input')?.disabled, 'app not ready');
  click('.settings-trigger');
  await until(() => document.querySelector('.settings-tabs'), 'settings missing');
  click('.settings-tabs button');
  await until(
    () => document.querySelector('.general-settings select'),
    'language selector missing',
  );
  change(document.querySelector('.general-settings select'), locale);
  await until(() => document.documentElement.lang === locale, 'language did not change');
  for (const index of [0, 1, 2, 3]) {
    document.querySelectorAll('.settings-tabs button')[index].click();
    await delay(150);
    for (const selector of ['.dialog-scroll', '.settings-tabs']) checkOverflow(selector);
    if (index === 1) {
      await until(() => document.querySelector('.katago-model-card'), 'model card missing');
      for (const selector of ['.katago-model-card', '.model-active-summary'])
        checkOverflow(selector);
      if (
        !document
          .querySelector('.model-notice')
          ?.textContent.includes(messages.runtimeModelSettingsRecovered)
      )
        throw new Error('Model recovery notice was not translated');
      const modelError = document.querySelector('.katago-model-card .error')?.textContent;
      if (!modelError?.includes(messages.runtimeMainArtifact) || !modelError.includes('503'))
        throw new Error('Model download error was not translated');
      if (!document.querySelector('.model-metadata')?.textContent.includes(messages.runtimeCustom))
        throw new Error('Model architecture was not translated');
      document.querySelector('.model-custom').open = true;
      checkOverflow('.model-custom');
    }
    if (index === 3) {
      await until(() => document.querySelector('.provider-config'), 'provider form missing');
      for (const details of document.querySelectorAll('.provider-config')) {
        if (!details.open) details.querySelector('summary').click();
        await delay(30);
      }
      checkOverflow('.llm-settings');
    }
  }
  click('.dialog-toolbar button');
  await search('pending');
  // Start a fresh game to exercise a genuinely empty -> partial -> complete panel.
  document.querySelectorAll('.board-toolbar > button')[1].click();
  await until(() => document.querySelector('dialog[open] form'), 'new game dialog missing');
  checkOverflow('.dialog-scroll');
  click('dialog form .primary');
  await until(() => !document.querySelector('dialog[open]'), 'new game did not start');
  if (document.querySelector('.evaluation-toggle').getAttribute('aria-expanded') === 'false')
    click('.evaluation-toggle');
  await delay(250);
  const initial = bounds('.evaluation');
  const board = bounds('.board-frame');
  const chat = bounds('.conversation-toolbar');
  let samples = 0;
  const issues = new Set();
  let animation;
  const sample = () => {
    samples++;
    for (const [selector, reference] of [
      ['.evaluation', initial],
      ['.board-frame', board],
      ['.conversation-toolbar', chat],
    ]) {
      const current = bounds(selector);
      if (
        ['x', 'y', 'width', 'height'].some((key) => Math.abs(reference[key] - current[key]) > 0.5)
      )
        issues.add(`${selector} shifted`);
    }
    animation = requestAnimationFrame(sample);
  };
  sample();
  try {
    if (!document.querySelector('.evaluation-candidates'))
      throw new Error('No reserved candidate space');
    for (const count of [0, 1, 3]) {
      await search('partial', count);
      await until(
        () => document.querySelectorAll('.candidates button').length === count,
        'candidate count mismatch',
      );
    }
    await search('done', 3);
    await until(
      () => document.querySelector('.evaluation-current')?.textContent.includes('65.0%'),
      'win rate missing',
    );
    if (!document.querySelector('.evaluation-toggle .evaluation-current'))
      throw new Error('Win rate is outside header');
    if (
      !document.querySelector('.evaluation-actions .evaluation-search')?.textContent.includes('600')
    )
      throw new Error('Search speed is outside progress row');
    const title = bounds('.evaluation-toggle > span:first-child');
    const current = bounds('.evaluation-current');
    if (Math.abs(title.y - current.y) > 1 || title.right > current.left + 1)
      throw new Error('Header wraps or overlaps');
    for (const selector of [
      '.evaluation-body',
      '.evaluation-actions',
      '.board-panel',
      '.board-tools',
      '.conversation-toolbar',
      '.chat-input',
    ])
      checkOverflow(selector);
    if (
      document.documentElement.scrollWidth > innerWidth ||
      document.documentElement.scrollHeight > innerHeight
    )
      throw new Error('Page exceeds viewport');
    if (Math.abs(board.width - board.height) > 1) throw new Error('Board is not square');
    const stage = bounds('.board-stage');
    if (board.right > stage.right + 1 || board.bottom > stage.bottom + 1)
      throw new Error('Board exceeds stage');
  } finally {
    cancelAnimationFrame(animation);
  }
  if (issues.size) throw new Error(`${locale}: ${[...issues].join(', ')}`);
  const panelHeight = initial.height;
  click('.evaluation-toggle');
  await until(
    () => !document.querySelector('.evaluation-current'),
    'Collapsed win rate is visible',
  );
  click('.evaluation-toggle');
  // Navigate away from cached results and verify error and retry also keep the frame stable.
  await search('pending');
  document
    .querySelector('[data-board-point="Q4"]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await delay(250);
  const pendingHeight = bounds('.evaluation').height;
  await search('error');
  await until(() => document.querySelector('.evaluation-body .error'), 'error missing');
  if (Math.abs(pendingHeight - bounds('.evaluation').height) > 0.5)
    throw new Error('Error changed panel height');
  await search('done', 1);
  document.querySelectorAll('.evaluation-actions button')[1].click();
  await until(() => !document.querySelector('.evaluation-body .error'), 'retry failed');
  return { locale, viewport: [innerWidth, innerHeight], panelHeight, samples };
}
app.whenReady().then(async () => {
  let server,
    exit = 0;
  try {
    const site = express();
    site.use('/api', fixture());
    site.use(express.static(join(__dirname, '../dist')));
    server = site.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
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
        show: false,
        webPreferences: {
          partition: `i18n-${width}`,
          backgroundThrottling: false,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      try {
        await win.loadURL(`http://127.0.0.1:${server.address().port}`);
        for (const locale of ['en', 'zh-CN', 'zh-TW', 'ja', 'ko']) {
          console.log(
            await win.webContents.executeJavaScript(
              `(${check.toString()})(${JSON.stringify(locale)}, ${JSON.stringify(require(`../src/locales/${locale}.json`))})`,
            ),
          );
          if (process.env.GO_LAYOUT_SCREENSHOTS) {
            writeFileSync(
              join(process.env.GO_LAYOUT_SCREENSHOTS, `go-${locale}-${width}.png`),
              (await win.webContents.capturePage()).toPNG(),
            );
          }
        }
      } finally {
        win.destroy();
      }
    }
  } catch (error) {
    console.error(error);
    exit = 1;
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    app.exit(exit);
  }
});
