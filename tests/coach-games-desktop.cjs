const { app, BrowserWindow } = require('electron');
const { createServer } = require('node:http');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const managementProvider = require('./fixtures/game-management-provider.cjs');

// Bundled UI/API, real coach tools and disk persistence; only the LLM is a fixture.
// The engine stays unavailable. No mock evaluations are used.
const profile = mkdtempSync(join(tmpdir(), 'go-coach-games-desktop-'));
app.setPath('userData', profile);
Object.assign(process.env, {
  GO_TRAINER_EMBEDDED: '1',
  GO_TRAINER_BUNDLED_RECORDS: join(profile, 'absent-records'),
  GO_TRAINER_ENV: join(profile, 'absent.env'),
  GO_TRAINER_DATA_DIR: join(profile, 'engine'),
  GO_TRAINER_SETTINGS_DIR: join(profile, 'settings'),
  GO_TRAINER_RECORDS_DIR: join(profile, 'records'),
  GO_TRAINER_HISTORY_DIR: join(profile, 'history'),
  KATAGO_PATH: join(profile, 'absent-engine'),
  KATAGO_MODEL: join(profile, 'absent-model'),
  KATAGO_HUMAN_MODEL: '',
  KATAGO_CONFIG: join(__dirname, '../config/katago/analysis.cfg'),
  DEEPSEEK_API_KEY: 'test-only',
  DEEPSEEK_MODEL: 'fixture',
  CODEX_PATH: join(profile, 'absent-codex'),
  CLAUDE_PATH: join(profile, 'absent-claude'),
  CODEX_SCRIPT: '',
  CLAUDE_SCRIPT: '',
});

async function exercise() {
  const until = async (predicate) => {
    const deadline = Date.now() + 15000;
    while (!(await predicate())) {
      if (Date.now() > deadline)
        throw new Error('Coach games UI timeout: ' + document.body.innerText.slice(-2000));
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };
  const button = (label) =>
    [...document.querySelectorAll('button')].find((node) => node.textContent === label);
  await until(() => !document.querySelector('[aria-label="AI 自动落子"]')?.disabled);
  const input = document.querySelector('.chat-input textarea');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(
    input,
    'fixture:manage-games',
  );
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await until(() => !button('发送')?.disabled);
  document
    .querySelector('.chat-input')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await until(() =>
    document
      .querySelector('.chat-log')
      ?.textContent.includes('已加载第二局、保存变化并改名为 Agent 研究。'),
  );
  await until(() => document.querySelectorAll('.agent-tool.done').length === 6);
  if (!document.querySelector('[aria-label="D4 黑子"]') || document.querySelector('.trial-stone'))
    throw new Error('Saved board was not selected');
  if (document.querySelector('.timeline').value !== '1') throw new Error('Wrong saved cursor');
  if (document.querySelectorAll('.chat-log article').length !== 1)
    throw new Error('Chat was replaced');
  await until(() => !button('棋谱').disabled);
  button('棋谱').click();
  await until(() => document.querySelector('.record-library')?.textContent.includes('Agent 研究'));
  const records = await (await fetch('/api/library')).json();
  const saved = records.games.find((record) => record.title === 'Agent 研究');
  if (
    !saved ||
    saved.sourceId !== '22222222-2222-4222-8222-222222222222' ||
    saved.game.moves.length !== 1 ||
    saved.game.metadata.GN !== saved.title
  )
    throw new Error('Missing saved record or lineage');
  if (records.games.find((record) => record.id === saved.sourceId).game.moves.length !== 0)
    throw new Error('Source overwritten');
  return saved.id;
}

app.whenReady().then(async () => {
  let backend, win;
  const provider = createServer(managementProvider());
  let code = 0;
  try {
    await new Promise((resolve, reject) => {
      provider.once('error', reject);
      provider.listen(0, '127.0.0.1', resolve);
    });
    process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${provider.address().port}`;
    const { startServer } = await import(
      pathToFileURL(join(__dirname, '../dist-server/index.js')).href
    );
    backend = await startServer(0);
    const url = `http://127.0.0.1:${backend.port}`;
    for (const [id, title, moves] of [
      ['22222222-2222-4222-8222-222222222222', '第二局', []],
      ['11111111-1111-4111-8111-111111111111', '第一局', [{ color: 'B', point: 'C3' }]],
    ]) {
      const response = await fetch(url + '/api/library/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Go-Trainer': '1' },
        body: JSON.stringify({
          id,
          title,
          updatedAt: new Date().toISOString(),
          game: {
            size: 9,
            komi: 7.5,
            rules: 'chinese',
            initialPlayer: 'B',
            initialStones: [],
            moves,
            metadata: { GN: title },
          },
        }),
      });
      if (!response.ok) throw new Error('Could not seed fixture');
    }
    win = new BrowserWindow({
      width: 1280,
      height: 800,
      show: false,
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
    const id = await win.webContents.executeJavaScript(`(${exercise.toString()})()`);
    writeFileSync(
      join(tmpdir(), 'go-coach-games-desktop.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    win.destroy();
    win = undefined;
    await backend.close();
    backend = await startServer(0);
    const restored = await (await fetch(`http://127.0.0.1:${backend.port}/api/library`)).json();
    if (
      !restored.games.some(
        (game) => game.id === id && game.title === 'Agent 研究' && game.game.moves.length === 1,
      )
    )
      throw new Error('Saved game lost after restart');
    console.log(
      'Electron coach games: load, save branch, rename, board/chat sync, source preservation and disk restart passed',
    );
  } catch (error) {
    console.error(error);
    code = 1;
  } finally {
    win?.destroy();
    await backend?.close();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
    app.exit(code);
  }
});
app.on('window-all-closed', () => {});
process.on('exit', () => rmSync(profile, { recursive: true, force: true }));
