const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { existsSync, readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { DesktopUpdates, RELEASES_URL } = require('../dist-desktop/updater.cjs');
let backend;
let updates;
let quitting = false;
process.env.GO_TRAINER_EMBEDDED = '1';
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window?.isMinimized()) window.restore();
  window?.focus();
});

app
  .whenReady()
  .then(async () => {
    if (!ownsInstance) return;
    const icon = app.isPackaged
      ? join(process.resourcesPath, 'app-icon.png')
      : join(__dirname, '../.local/icons/icon.png');
    if (process.platform === 'darwin' && !app.isPackaged) app.dock.setIcon(icon);
    process.env.GO_TRAINER_RECORDS_DIR ||= join(app.getPath('userData'), 'records');
    process.env.GO_TRAINER_HISTORY_DIR ||= join(app.getPath('userData'), 'history');
    // Packaged app reads user configuration from its private application-data folder.
    if (app.isPackaged) {
      process.env.GO_TRAINER_ENV = join(app.getPath('userData'), '.env');
      process.env.GO_TRAINER_DATA_DIR = join(app.getPath('userData'), 'katago');
      process.env.GO_TRAINER_SETTINGS_DIR = join(app.getPath('userData'), 'settings');
      process.env.GO_TRAINER_BUNDLED_RECORDS = join(process.resourcesPath, 'records', 'cwi');
      process.env.GO_TRAINER_BUNDLED_MODELS = join(process.resourcesPath, 'katago-models');
      process.env.GO_TRAINER_BUNDLED_RUNTIME = join(process.resourcesPath, 'katago-runtime');
    }
    const { startServer } = await import(
      pathToFileURL(join(__dirname, '../dist-server/index.js')).href
    );
    backend = await startServer(0);
    const url = `http://127.0.0.1:${backend.port}`;
    const metadata = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
    const edition = metadata.goTrainerEdition === 'minimal' ? 'minimal' : 'standard';
    const supported =
      app.isPackaged &&
      ((process.platform === 'darwin' && process.arch === 'arm64') ||
        (process.platform === 'win32' && process.arch === 'x64'));
    let canInstall = supported;
    let reason = supported ? undefined : '请使用安装版桌面应用检查和安装更新';
    if (supported && process.platform === 'darwin') {
      const signature = spawnSync(
        '/usr/bin/codesign',
        ['-dv', '--verbose=4', app.getAppPath().replace(/\/Contents\/Resources\/app\.asar$/, '')],
        { encoding: 'utf8' },
      );
      canInstall =
        signature.status === 0 && /^Authority=Developer ID Application:/m.test(signature.stderr);
      if (!canInstall)
        reason =
          '此 macOS 安装包未使用 Developer ID 签名，请打开 GitHub Release 下载并手动安装更新';
    }
    const { autoUpdater } = supported ? require('electron-updater') : {};
    updates = new DesktopUpdates({
      version: metadata.version,
      edition,
      platform: process.platform,
      supported,
      canInstall,
      reason,
      settingsFile: join(app.getPath('userData'), 'updates.json'),
      updater: autoUpdater,
      hasCachedModels: () => backend.hasCachedModels(),
      hasBundledRecords: () =>
        !!process.env.GO_TRAINER_BUNDLED_RECORDS &&
        existsSync(join(process.env.GO_TRAINER_BUNDLED_RECORDS, 'index.json')),
      beforeInstall: async () => {
        await backend.close();
        quitting = true;
      },
    });
    await updates.load();
    const handle = (name, action) =>
      ipcMain.handle(`updates:${name}`, (event, ...args) => {
        // Only the app's top-level renderer may request updates or installation.
        if (
          event.senderFrame !== event.sender.mainFrame ||
          new URL(event.senderFrame.url).origin !== url
        )
          throw new Error('Untrusted update request');
        return action(...args);
      });
    handle('status', () => updates.status());
    handle('check', () => updates.check());
    handle('download', () => updates.download());
    handle('install', () => updates.install());
    handle('automatic', (value) => updates.automatic(value));
    handle('open-release', () => shell.openExternal(RELEASES_URL));
    function createWindow() {
      const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 640,
        minHeight: 480,
        backgroundColor: '#f1f2ed',
        title: 'LLM Go Trainer',
        icon,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          preload: join(__dirname, 'preload.cjs'),
        },
      });
      if (process.platform === 'win32') win.removeMenu();
      win.webContents.setWindowOpenHandler(({ url }) => {
        // Markdown links open in the system browser; never execute custom/file protocols.
        if (/^https?:\/\//i.test(url)) void shell.openExternal(url).catch(() => {});
        return { action: 'deny' };
      });
      win.webContents.on('will-navigate', (event, target) => {
        if (new URL(target).origin !== url) event.preventDefault();
      });
      win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      win.loadURL(url);
    }
    createWindow();
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  })
  .catch((error) => {
    dialog.showErrorBox('启动失败', error.message);
    app.quit();
  });
app.on('window-all-closed', () => {
  app.quit();
});
app.on('before-quit', (event) => {
  updates?.dispose();
  if (quitting || !backend) return;
  event.preventDefault();
  quitting = true;
  void backend.close().finally(() => app.quit());
});
