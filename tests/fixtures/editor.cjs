const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('force-renderer-accessibility');
app.whenReady().then(() => {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'LingoLeaf Test Editor',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.setMenu(null);
  window.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(
        `<!doctype html><html lang="en"><title>LingoLeaf Test Editor</title><style>body{padding:32px;background:#f6f8f5;color:#234b40;font:16px Segoe UI}h1{font-size:26px}textarea,input{box-sizing:border-box;width:100%;padding:18px;border:1px solid #becbc0;border-radius:10px;font:22px Segoe UI;margin:8px 0 22px}textarea{height:100px}small{color:#77857a}</style><h1>LingoLeaf · Synthetic test editor</h1><small>This disposable editor contains only sample text. No user documents are opened.</small><p>Grammar sample</p><textarea aria-label="Grammar sample">She go to school every day.</textarea><p>Translation sample</p><textarea aria-label="Translation sample">今天天气怎么样</textarea><label>Test password field (synthetic)<input aria-label="Test password field" type="password" value="synthetic-only"></label></html>`,
      ),
  );
});
app.on('window-all-closed', () => app.quit());
