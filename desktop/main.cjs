const { app, BrowserWindow, dialog, shell } = require('electron');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
let backend;
let quitting = false;
process.env.GO_TRAINER_EMBEDDED = '1';

app
  .whenReady()
  .then(async () => {
    process.env.GO_TRAINER_HISTORY_DIR ||= join(app.getPath('userData'), 'history');
    // Packaged app reads user configuration from its private application-data folder.
    if (app.isPackaged) {
      process.env.GO_TRAINER_ENV = join(app.getPath('userData'), '.env');
      process.env.GO_TRAINER_DATA_DIR = join(app.getPath('userData'), 'katago');
      process.env.GO_TRAINER_SETTINGS_DIR = join(app.getPath('userData'), 'settings');
    }
    const { startServer } = await import(
      pathToFileURL(join(__dirname, '../dist-server/index.js')).href
    );
    backend = await startServer(0);
    const url = `http://127.0.0.1:${backend.port}`;
    function createWindow() {
      const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 760,
        minHeight: 480,
        backgroundColor: '#f1f2ed',
        title: 'LLM Go Trainer',
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
      });
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
  if (quitting || !backend) return;
  event.preventDefault();
  quitting = true;
  void backend.close().finally(() => app.quit());
});
