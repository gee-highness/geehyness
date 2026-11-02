// Offline desktop shell: serves dist/app/browser over a privileged app:// scheme (no network needed).
const {app, BrowserWindow, protocol, net} = require('electron');
const path = require('path');
const {pathToFileURL} = require('url');

const root = path.join(__dirname, '..', 'dist', 'app', 'browser');
protocol.registerSchemesAsPrivileged([
  {scheme: 'app', privileges: {standard: true, secure: true, supportFetchAPI: true, stream: true}},
]);

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p === '/' || !path.extname(p)) p = '/index.html';
    const f = path.normalize(path.join(root, p));
    if (!f.startsWith(root)) return new Response('forbidden', {status: 403});
    return net.fetch(pathToFileURL(f).toString());
  });
  const win = new BrowserWindow({
    width: 1280, height: 720, backgroundColor: '#09090b', autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
  });
  win.loadURL('app://shesha/');
  win.webContents.on('before-input-event', (_e, i) => {
    if (i.type === 'keyDown' && i.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
});
app.on('window-all-closed', () => app.quit());
