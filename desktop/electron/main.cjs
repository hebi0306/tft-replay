const { app, BrowserWindow, ipcMain } = require('electron');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

const { createCaptureBridge } = require('./captureBridge.cjs');
let server, capture, quitting = false;
app.setName('TFT Replay');

async function createWindow() {
  const root = resolve(__dirname, '..', '..');
  const { startAppServer } = await import(pathToFileURL(join(root, 'desktop', 'appServer.js')).href);
  server = await startAppServer({ root, port: 0 });
  capture = createCaptureBridge({ root, resources: process.resourcesPath, dataPath: join(app.getPath('userData'), 'recordings'), packaged: app.isPackaged });
  const window = new BrowserWindow({
    title: 'TFT Replay', width: 1400, height: 900, minWidth: 1100, minHeight: 700,
    autoHideMenuBar: true, icon: join(root, 'frontend', 'assets', 'icon.ico'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: join(__dirname, 'preload.cjs') },
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  ipcMain.handle('local-replay', async (event, method, args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error('Forbidden');
    try { return { result: await capture.request(method, args) }; }
    catch (error) { return { error: error.message }; }
  });
  await window.loadURL(origin);
}

if (app.requestSingleInstanceLock()) {
  app.whenReady().then(createWindow).catch(error => { console.error(error); app.quit(); });
  app.on('second-instance', () => { const window = BrowserWindow.getAllWindows()[0]; window?.restore(); window?.focus(); });
} else { app.quit(); }
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); quitting = true;
  Promise.race([capture?.close(), new Promise(resolve => setTimeout(resolve, 18000))])
    .catch(console.error).finally(() => { server?.close(); app.quit(); });
});
