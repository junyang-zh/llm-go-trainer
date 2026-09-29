const { writeRecordFixture } = require('./fixtures/record-catalog.cjs');
const { app, BrowserWindow } = require('electron');
const { mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

// Real bundled UI, API and disk storage; no engine output or provider credentials.
const profile = mkdtempSync(join(tmpdir(), 'go-records-desktop-'));
app.setPath('userData', profile);
writeRecordFixture(join(profile, 'bundled'));
Object.assign(process.env, {
  GO_TRAINER_EMBEDDED: '1',
  GO_TRAINER_BUNDLED_RECORDS: join(profile, 'bundled'),
  GO_TRAINER_ENV: join(profile, 'absent.env'),
  GO_TRAINER_DATA_DIR: join(profile, 'engine'),
  GO_TRAINER_SETTINGS_DIR: join(profile, 'settings'),
  GO_TRAINER_RECORDS_DIR: join(profile, 'records'),
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

async function exerciseRecords() {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (predicate) => {
    const deadline = Date.now() + 6000;
    while (!(await predicate())) {
      if (Date.now() > deadline)
        throw new Error(
          'Timed out waiting for records UI: ' +
            predicate.toString() +
            '\n' +
            document.body.innerText.slice(-1500),
        );
      await delay(25);
    }
  };
  const click = async (label) => {
    const button = [...document.querySelectorAll('button')].find(
      (item) => item.textContent === label,
    );
    if (!button || button.disabled) throw new Error(`Missing enabled button: ${label}`);
    button.click();
    await delay(50);
  };
  const library = async () => (await fetch('/api/library')).json();
  const play = async (point) => {
    const node = document.querySelector(`[aria-label="${point} 空点"]`);
    if (!node) throw new Error(`Missing point: ${point}`);
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await until(() => document.querySelector(`[aria-label="${point} 试下"]`));
  };
  await until(() => !document.querySelector('[aria-label="AI 自动落子"]')?.disabled);
  await click('棋谱');
  if (
    document.querySelector('.record-help') ||
    [...document.querySelectorAll('.record-filters button')].some(
      (item) => item.textContent === '全部',
    )
  )
    throw new Error('Removed UI still present');
  await click('经典名局');
  await until(() => document.querySelectorAll('.record-entry').length === 20);
  if (!document.querySelector('.record-pagination').textContent.includes('41'))
    throw new Error('Full catalog is missing');
  await click('下一页');
  await until(() => document.querySelector('.record-pagination')?.textContent.includes('21–40'));
  const search = document.querySelector('input[type="search"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
    search,
    'fixture/1.sgf',
  );
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => document.querySelectorAll('.record-entry').length === 1);
  if (!document.querySelector('.record-details a').href.includes('cwi.nl'))
    throw new Error('Missing source');
  document.querySelector('.history-list article button').click();
  await until(() => !document.querySelector('dialog'));
  if (document.querySelector('.timeline').value !== '0')
    throw new Error('Preset should open at root');
  await play('D4');
  await click('保存试下为新棋局');
  await until(async () => (await library()).games.some((item) => item.sourceId));
  const first = (await library()).games.find((item) => item.sourceId);
  if (first.forkTurn !== 0 || first.groupId !== first.sourceId || !first.game.metadata.CP)
    throw new Error('Missing lineage or rights');
  await click('棋谱');
  if (!document.querySelector('.record-group h3')?.textContent.includes('同源棋谱组（2）'))
    throw new Error('Missing source group');
  await click('改名');
  const name = document.querySelector('[aria-label="棋谱名称"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
    name,
    '测试试下研究',
  );
  name.dispatchEvent(new Event('input', { bubbles: true }));
  await click('保存名称');
  await until(async () => (await library()).games.some((item) => item.title === '测试试下研究'));
  first.title = '测试试下研究';
  const branchButton = [...document.querySelectorAll('.history-list article button')].find(
    (button) => button.textContent.includes(first.title),
  );
  branchButton.click();
  await until(() => !document.querySelector('dialog'));
  await play('E4');
  await click('保存试下为新棋局');
  await until(async () => (await library()).games.some((item) => item.sourceId === first.id));
  const second = (await library()).games.find((item) => item.sourceId === first.id);
  if (second.groupId !== first.groupId || second.forkTurn !== 1)
    throw new Error('Descendant lost group');
  if ((await library()).games.find((item) => item.id === first.id).game.moves.length !== 1)
    throw new Error('Original overwritten');
  await click('棋谱');
  await click('下载棋谱');
  await until(() => document.querySelector('.record-source')?.textContent.includes('已随应用预置'));
  await click('死活题');
  if (document.querySelectorAll('.record-entry').length)
    throw new Error('Authored problems remain');
  await click('定式');
  if (document.querySelectorAll('.record-entry').length) throw new Error('Authored joseki remain');
  await click('经典名局');
  await until(() => document.querySelectorAll('.record-entry').length === 20);
  const finalSearch = document.querySelector('input[type="search"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
    finalSearch,
    'fixture/1.sgf',
  );
  finalSearch.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => document.querySelectorAll('.record-entry').length === 1);
  await delay(100);
  const dialog = document.querySelector('.dialog-scroll');
  if (
    dialog.scrollWidth > dialog.clientWidth + 1 ||
    document.documentElement.scrollWidth > innerWidth
  )
    throw new Error('Records overflow');
  return { width: innerWidth, height: innerHeight, groupId: second.groupId, branchId: second.id };
}

async function exerciseMinimal(install) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (predicate, timeout = 6000) => {
    const deadline = Date.now() + timeout;
    while (!(await predicate())) {
      if (Date.now() > deadline)
        throw new Error('Minimal UI timeout: ' + document.body.innerText.slice(-2000));
      await delay(100);
    }
  };
  const click = async (label) => {
    const button = [...document.querySelectorAll('button')].find(
      (item) => item.textContent === label,
    );
    if (!button || button.disabled) throw new Error('Missing minimal button: ' + label);
    button.click();
    await delay(100);
  };
  await until(() => !document.querySelector('[aria-label="AI 自动落子"]')?.disabled);
  await click('棋谱');
  await click('经典名局');
  await until(() =>
    document.querySelector('.record-library')?.textContent.includes('没有匹配的棋谱'),
  );
  await click('下载棋谱');
  await until(() => document.querySelector('.record-source'));
  if (document.querySelector('.record-source').textContent.includes('已安装'))
    throw new Error('Minimal preinstalled records');
  if (
    document.querySelector('.dialog-scroll').scrollWidth >
    document.querySelector('.dialog-scroll').clientWidth + 1
  )
    throw new Error('Downloader overflows');
  if (install) {
    await click('下载');
    await until(
      () => document.querySelector('.record-source')?.textContent.includes('已安装'),
      300000,
    );
    await click('经典名局');
    await until(() => document.querySelectorAll('.record-entry').length === 20);
    if (!document.querySelector('.record-pagination').textContent.includes('96143'))
      throw new Error('Downloaded catalog incomplete');
    if (
      document.querySelector('.record-library').textContent.match(/公共领域|使用依据|日本规则终局/)
    )
      throw new Error('Unwanted catalog text');
    await click('下载棋谱');
  }
  return install;
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
    const url = `http://127.0.0.1:${backend.port}`;
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
    await win.loadURL(url);
    await win.webContents.executeJavaScript(
      "localStorage.setItem('go-trainer-language-v1', 'zh-CN')",
    );
    await win.loadURL(url);
    const result = await win.webContents.executeJavaScript(`(${exerciseRecords.toString()})()`);
    writeFileSync(
      join(tmpdir(), 'go-records-desktop.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    win.setContentSize(640, 480);
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (
      await win.webContents.executeJavaScript(
        'document.querySelector(".dialog-scroll").scrollWidth > document.querySelector(".dialog-scroll").clientWidth + 1',
      )
    )
      throw new Error('Narrow dialog overflow');
    writeFileSync(
      join(tmpdir(), 'go-records-desktop-narrow.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    win.destroy();
    win = undefined;
    await backend.close();
    process.env.GO_TRAINER_BUNDLED_RECORDS = join(profile, 'absent-records');
    backend = await startServer(0);
    const saved = await (await fetch(`http://127.0.0.1:${backend.port}/api/library`)).json();
    if (!saved.games.some((item) => item.id === result.branchId && item.groupId === result.groupId))
      throw new Error('Group lost after restart');
    const minimalUrl = `http://127.0.0.1:${backend.port}`;
    if ((await (await fetch(minimalUrl + '/api/library/presets')).json()).total !== 0)
      throw new Error('Minimal contains bundled catalog');
    const archive = process.env.GO_TRAINER_TEST_CWI_ARCHIVE;
    if (archive) {
      mkdirSync(join(profile, 'records/downloads'), { recursive: true });
      copyFileSync(
        archive,
        join(
          profile,
          'records/downloads/935522a59817c12b37227e843cd3b4bc8d702e32e0e6fbc80b66d828dbbffcad',
        ),
      );
    }
    win = new BrowserWindow({
      width: 640,
      height: 480,
      show: false,
      useContentSize: true,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    await win.loadURL(minimalUrl);
    await win.webContents.executeJavaScript(
      "localStorage.setItem('go-trainer-language-v1', 'zh-CN')",
    );
    await win.loadURL(minimalUrl);
    await win.webContents.executeJavaScript(`(${exerciseMinimal.toString()})(${!!archive})`);
    writeFileSync(
      join(tmpdir(), 'go-records-downloader.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    if (archive) {
      await backend.close();
      backend = await startServer(0);
      if (
        (await (await fetch(`http://127.0.0.1:${backend.port}/api/library/presets`)).json())
          .total !== 96143
      )
        throw new Error('Downloaded catalog lost after restart');
    }
    console.log(
      'Electron records: browsing, clean metadata, rename, source cards, trials, descendants, disk restart, minimal absence, downloader and 1280/640 layouts passed',
    );
  } catch (error) {
    if (win)
      writeFileSync(
        join(tmpdir(), 'go-records-desktop-failure.png'),
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
