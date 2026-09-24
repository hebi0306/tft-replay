const { app, BrowserWindow } = require('electron');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

let server;
app.setName('TFT Replay');

async function createWindow() {
  const root = resolve(__dirname, '..', '..');
  const { startAppServer } = await import(pathToFileURL(join(root, 'desktop', 'appServer.js')).href);
  server = await startAppServer({ root, port: 0 });
  const window = new BrowserWindow({
    title: 'TFT Replay', width: 1400, height: 900, minWidth: 1100, minHeight: 700,
    autoHideMenuBar: true, icon: join(root, 'frontend', 'assets', 'icon.ico'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  await window.loadURL(`http://127.0.0.1:${server.address().port}`);
}

app.whenReady().then(createWindow).catch(error => { console.error(error); app.quit(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => server?.close());
