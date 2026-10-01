const { app, BrowserWindow } = require('electron');
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const profile = mkdtempSync(join(tmpdir(), 'go-study-desktop-'));
Object.assign(process.env, {
  GO_TRAINER_EMBEDDED: '1',
  GO_TRAINER_ENV: join(profile, 'absent-env'),
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
async function exercise(base64, filename) {
  const delay = (ms) => new Promise((done) => setTimeout(done, ms));
  const until = async (predicate) => {
    const deadline = Date.now() + 10000;
    while (!(await predicate())) {
      if (Date.now() > deadline)
        throw new Error('Study timeout: ' + document.body.innerText.slice(-2000));
      await delay(40);
    }
  };
  const click = async (label, scope = document) => {
    const button = [...scope.querySelectorAll('button')].find((item) => item.textContent === label);
    if (!button || button.disabled) throw new Error('Missing study button: ' + label);
    button.click();
    await delay(50);
  };
  const treeReady = () =>
    !document.querySelector('.record-tree [role="status"]') &&
    document.querySelector('.record-tree-board svg');
  await until(() => !document.querySelector('[aria-label="AI 自动落子"]')?.disabled);
  const before = await (await fetch('/api/library')).json();
  if (before.games.some((game) => game.tree)) throw new Error('Unexpected preloaded SGF');
  await click('棋谱');
  const input = document.querySelector('input[type="file"]');
  const transfer = new DataTransfer();
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  transfer.items.add(new File([bytes], filename, { type: 'application/x-go-sgf' }));
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await until(treeReady);
  const saved = await (await fetch('/api/library')).json();
  const imported = saved.games.filter((game) => game.tree);
  if (imported.length !== 1) throw new Error('Import must create exactly one file entry');
  const rootId = imported[0].id;
  const root = await (await fetch('/api/library/games/' + rootId + '/tree')).json();
  if (
    document.body.innerText.includes('规则未注明') ||
    document.body.innerText.includes('Rules are unspecified')
  )
    throw new Error('Removed warning still visible');
  if (document.querySelectorAll('.record-tree-children button').length !== root.children.length)
    throw new Error('Lost top-level variations');
  await click('星', document.querySelector('.record-tree-children'));
  await until(
    () => treeReady() && document.querySelector('[aria-current="step"]')?.textContent === '星',
  );
  const next = document.querySelector('.record-tree-children button');
  const nextTitle = next.textContent;
  next.click();
  await until(
    () => treeReady() && document.querySelector('[aria-current="step"]')?.textContent === nextTitle,
  );
  if (
    !document.querySelector('.record-tree-comment') ||
    !document.querySelector('.record-tree-children button')
  )
    throw new Error('Lost comments/variations');
  await click('返回上层');
  await until(
    () => treeReady() && document.querySelector('[aria-current="step"]')?.textContent === '星',
  );
  document.querySelector('.record-tree-children button').click();
  await until(
    () => treeReady() && document.querySelector('[aria-current="step"]')?.textContent === nextTitle,
  );
  await click('打开此局面');
  await until(() => !document.querySelector('dialog'));
  if (document.querySelector('.timeline').value !== '2') throw new Error('Opened wrong move');
  const point = document.querySelector('[data-board-point="D4"]');
  point.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await until(() => document.querySelector('[aria-label="D4 试下"]'));
  await click('保存试下为新棋局');
  const library = async () => (await fetch('/api/library')).json();
  await until(async () => (await library()).games.some((item) => item.sourceId));
  const branch = (await library()).games.find((item) => item.sourceId);
  if (branch.forkTurn !== 2 || branch.groupId !== rootId)
    throw new Error('Study branch lost source');
  await click('棋谱');
  await until(() => document.querySelectorAll('.record-entry').length === 3);
  const entry = [...document.querySelectorAll('.record-entry')].find(
    (item) => item.querySelector('b')?.textContent === imported[0].title,
  );
  if (!entry) throw new Error('Imported file missing in history');
  entry.querySelector('article button').click();
  await until(treeReady);
  await click(root.children[1].title, document.querySelector('.record-tree-children'));
  await until(
    () =>
      treeReady() &&
      document.querySelector('[aria-current="step"]')?.textContent === root.children[1].title,
  );
  return { branchId: branch.id, rootId, rootChildren: root.children.length };
}
app.whenReady().then(async () => {
  let backend,
    win,
    code = 0;
  try {
    const { startServer } = await import(
      pathToFileURL(resolve(__dirname, '../dist-server/index.js')).href
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
      "localStorage.setItem('go-trainer-language-v1','zh-CN')",
    );
    await win.loadURL(url);
    const filename = process.env.GO_TRAINER_TEST_SGF || join(__dirname, 'fixtures/study-tree.sgf');
    const bytes = readFileSync(filename);
    const data = bytes.toString('base64');
    const result = await win.webContents.executeJavaScript(
      `(${exercise.toString()})(${JSON.stringify(data)}, ${JSON.stringify(require('node:path').basename(filename))})`,
    );
    writeFileSync(
      join(tmpdir(), 'go-study-desktop.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    win.setContentSize(640, 480);
    await new Promise((done) => setTimeout(done, 200));
    const overflow = await win.webContents.executeJavaScript(
      'document.querySelector(".dialog-scroll").scrollWidth > document.querySelector(".dialog-scroll").clientWidth + 1',
    );
    if (overflow) throw new Error('Narrow study browser overflows');
    writeFileSync(
      join(tmpdir(), 'go-study-desktop-narrow.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    win.destroy();
    win = undefined;
    await backend.close();
    backend = await startServer(0);
    const saved = await (await fetch(`http://127.0.0.1:${backend.port}/api/library`)).json();
    if (!saved.games.some((item) => item.id === result.branchId))
      throw new Error('Study branch lost after restart');
    if (saved.games.filter((item) => item.tree).length !== 1)
      throw new Error('Imported tree lost after restart');
    const root = await (
      await fetch(`http://127.0.0.1:${backend.port}/api/library/games/${result.rootId}/tree`)
    ).json();
    if (root.children.length !== result.rootChildren)
      throw new Error('Branches lost after restart');
    console.log(
      'Electron study tree passed:',
      JSON.stringify(result),
      'comments, sibling browsing, selected position, trial save, restart, 1280/640 layouts',
    );
  } catch (error) {
    if (win)
      writeFileSync(
        join(tmpdir(), 'go-study-desktop-failure.png'),
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
