const { app, BrowserWindow } = require('electron');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const fixture = require('./fixtures/fox.json');

// Exercise the bundled app and real local API/storage. Only the Fox HTTP boundary
// uses a fixture by default; FOX_LIVE_USERNAME enables an actual provider check.
const keyword = process.env.FOX_LIVE_USERNAME || fixture.user.username;
const live = !!process.env.FOX_LIVE_USERNAME;
const profile = mkdtempSync(join(tmpdir(), 'go-fox-desktop-'));
app.setPath('userData', profile);
Object.assign(process.env, {
  GO_TRAINER_EMBEDDED: '1',
  GO_TRAINER_ENV: join(profile, 'absent.env'),
  GO_TRAINER_DATA_DIR: join(profile, 'engine'),
  GO_TRAINER_SETTINGS_DIR: join(profile, 'settings'),
  GO_TRAINER_RECORDS_DIR: join(profile, 'records'),
  GO_TRAINER_BUNDLED_RECORDS: join(profile, 'absent-records'),
  GO_TRAINER_HISTORY_DIR: join(profile, 'history'),
  KATAGO_PATH: join(profile, 'absent-engine'),
  KATAGO_MODEL: join(profile, 'absent-model'),
  KATAGO_HUMAN_MODEL: '',
  KATAGO_CONFIG: join(__dirname, '../config/katago/analysis.cfg'),
  DEEPSEEK_API_KEY: '',
  CODEX_PATH: join(profile, 'absent-codex'),
  CLAUDE_PATH: join(profile, 'absent-claude'),
  CODEX_SCRIPT: '',
  CLAUDE_SCRIPT: '',
});
const originalFetch = globalThis.fetch;
let offline = false,
  requests = 0;
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  if (['newframe.foxwq.com', 'h5.foxwq.com'].includes(url.hostname)) {
    requests++;
    if (offline) throw new Error('Fox offline during cache verification');
    if (!live)
      return Response.json(
        url.pathname.includes('QueryUserInfoPanel')
          ? fixture.user
          : url.pathname.includes('FetchChessList')
            ? fixture.list
            : fixture.sgf,
      );
  }
  return originalFetch(input, options);
};

async function exercise(keyword, restore) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (predicate) => {
    const deadline = Date.now() + 55000;
    while (!(await predicate())) {
      if (document.querySelector('.fox-records [role="alert"]'))
        throw new Error(document.querySelector('.fox-records [role="alert"]').textContent);
      if (Date.now() > deadline)
        throw new Error('Fox UI timeout: ' + document.body.innerText.slice(-1600));
      await delay(50);
    }
  };
  const click = (label) => {
    const button = [...document.querySelectorAll('button')].find(
      (item) => item.textContent === label,
    );
    if (!button || button.disabled) throw new Error('Missing button: ' + label);
    button.click();
  };
  await until(() => !document.querySelector('[aria-label="AI 自动落子"]')?.disabled);
  click('棋谱');
  await until(() => document.querySelector('.record-library'));
  click('野狐对局');
  await until(() => {
    const input = document.querySelector('.fox-records input');
    return input && !input.disabled;
  });
  if (!restore) {
    const input = document.querySelector('.fox-records input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, keyword);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(50);
    click('查询对局');
  }
  await until(
    () =>
      document.querySelector('.fox-records article button') &&
      !document.querySelector('.fox-records article button').disabled,
  );
  if (
    restore &&
    !document.querySelector('.fox-records article button').textContent.includes('已保存')
  )
    throw new Error('Downloaded state lost');
  const dialog = document.querySelector('.dialog-scroll');
  if (dialog.scrollWidth > dialog.clientWidth + 1) throw new Error('Fox list overflows');
  document.querySelector('.fox-records article button').click();
  await until(() => !document.querySelector('dialog'));
  const library = await (await fetch('/api/library')).json();
  const imported = library.games.filter((game) => game.game.metadata.SO?.startsWith('Fox'));
  if (imported.length !== 1) throw new Error('Import missing or duplicated');
  if (document.querySelector('.timeline').value !== String(imported[0].game.moves.length))
    throw new Error('Board did not load imported game');
  click('棋谱');
  await until(() => document.querySelector('.record-library'));
  if (!document.querySelector('.history-list').textContent.includes(imported[0].title))
    throw new Error('New import missing from history');
  click('野狐对局');
  await until(() =>
    document.querySelector('.fox-records article button')?.textContent.includes('已保存'),
  );
  return { id: imported[0].id, moves: imported[0].game.moves.length, komi: imported[0].game.komi };
}

app.whenReady().then(async () => {
  let backend,
    win,
    code = 0;
  try {
    const { startServer } = await import(
      pathToFileURL(join(__dirname, '../dist-server/index.js')).href
    );
    backend = await startServer(0);
    win = new BrowserWindow({
      width: 1280,
      height: 800,
      show: false,
      useContentSize: true,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    const load = async () => {
      const url = `http://127.0.0.1:${backend.port}`;
      await win.loadURL(url);
      await win.webContents.executeJavaScript(
        "localStorage.setItem('go-trainer-language-v1', 'zh-CN')",
      );
      await win.loadURL(url);
    };
    const post = (body, extra = {}) =>
      originalFetch(`http://127.0.0.1:${backend.port}/api/library/fox/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Go-Trainer': '1', ...extra },
        body: JSON.stringify(body),
      });
    if ((await post({ keyword: '' })).status !== 400) throw new Error('Missing validation');
    if ((await post({ keyword }, { Origin: 'https://hostile.example' })).status !== 403)
      throw new Error('Missing origin protection');
    await load();
    const result = await win.webContents.executeJavaScript(
      `(${exercise.toString()})(${JSON.stringify(keyword)}, false)`,
    );
    if (requests !== 3)
      throw new Error(`Expected one lookup, list and SGF request, got ${requests}`);
    writeFileSync(
      join(tmpdir(), 'go-fox-desktop.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    offline = true;
    await backend.close();
    backend = await startServer(0);
    win.setContentSize(640, 480);
    await load();
    const restored = await win.webContents.executeJavaScript(
      `(${exercise.toString()})(${JSON.stringify(keyword)}, true)`,
    );
    if (restored.id !== result.id || requests !== 3) throw new Error('Offline cache failed');
    writeFileSync(
      join(tmpdir(), 'go-fox-desktop-narrow.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    console.log(
      JSON.stringify({
        provider: live ? 'Fox live' : 'Fox fixture',
        ...result,
        requests,
        validation:
          'query, import, board, history, API guards, restart, offline cache, 1280/640 layouts passed',
      }),
    );
  } catch (error) {
    if (win)
      writeFileSync(
        join(tmpdir(), 'go-fox-desktop-failure.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
    console.error(error);
    code = 1;
  } finally {
    win?.destroy();
    await backend?.close();
    app.exit(code);
  }
});
app.on('window-all-closed', () => {});
process.on('exit', () => rmSync(profile, { recursive: true, force: true }));
