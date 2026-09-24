import { app, BrowserWindow, Menu, dialog, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import log from 'electron-log/main';

import {
  APP_URL,
  PROTOCOL,
  handleDeepLink,
  isAllowedInWindow,
  isGoogleSignIn,
  openExternalSafe,
  startSignIn,
} from './auth';
import { checkForUpdatesManually, initUpdater } from './updater';

log.initialize();
process.on('uncaughtException', (err) => log.error('Uncaught:', err));

let win: BrowserWindow | null = null;
const deepLinkFrom = (argv: string[]) => argv.find((a) => a.startsWith(`${PROTOCOL}://`));

// Windows delivers a deep link by launching a second copy; the lock routes it
// to the running one instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const link = deepLinkFrom(argv);
    if (link) handleDeepLink(link, win);
    else if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.on('open-url', (e, url) => {
    e.preventDefault();
    handleDeepLink(url, win);
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}

// Under `electron .` the exe is electron.exe, so it needs the app path too.
if (process.defaultApp && process.argv[1]) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}
// Windows shows notifications only for an app with an AppUserModelID.
app.setAppUserModelId('com.clubcrumbs.desktop');

// ---- window size/position, remembered between launches ----
type WinState = { width: number; height: number; x?: number; y?: number; maximized?: boolean };
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadState(): WinState {
  try {
    return { width: 1280, height: 800, ...JSON.parse(fs.readFileSync(stateFile(), 'utf8')) };
  } catch {
    return { width: 1280, height: 800 };
  }
}

function saveState(w: BrowserWindow): void {
  try {
    const b = w.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: w.isMaximized() }));
  } catch (e) {
    log.warn('Could not save window state', e);
  }
}

function showOffline(w: BrowserWindow): void {
  void w.loadFile(path.join(__dirname, '..', 'src', 'offline.html'), { query: { url: APP_URL } });
}

function createWindow(): void {
  const state = loadState();
  win = new BrowserWindow({
    ...state,
    minWidth: 400,
    minHeight: 500,
    title: 'Club Crumbs',
    backgroundColor: '#16181C',
    autoHideMenuBar: true, // same look as the site; Alt shows the menu
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  if (state.maximized) win.maximize();
  win.once('ready-to-show', () => win?.show());
  win.on('close', () => win && saveState(win));
  win.on('closed', () => (win = null));

  const wc = win.webContents;

  // Navigation allowlist. Google sign-in is diverted to the system browser.
  const guard = (e: Electron.Event, url: string) => {
    if (isAllowedInWindow(url)) return;
    e.preventDefault();
    if (isGoogleSignIn(url)) startSignIn();
    else openExternalSafe(url);
  };
  wc.on('will-navigate', guard);
  wc.on('will-redirect', guard);

  // target=_blank / window.open: the site's own pages stay in the app window,
  // anything else opens in the system browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (isAllowedInWindow(url) && !isGoogleSignIn(url)) void wc.loadURL(url);
    else if (isGoogleSignIn(url)) startSignIn();
    else openExternalSafe(url);
    return { action: 'deny' };
  });

  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    // -3 is ERR_ABORTED: a navigation we (or the page) cancelled, not an outage.
    if (!isMainFrame || code === -3) return;
    log.warn(`Load failed (${code} ${desc})`, new URL(url).origin);
    if (win) showOffline(win);
  });

  const initialLink = deepLinkFrom(process.argv);
  if (initialLink) handleDeepLink(initialLink, win);
  else void win.loadURL(APP_URL);

  buildMenu();
  initUpdater();
}

// Only what the site actually uses; everything else is refused.
app.whenReady().then(() => {
  const allowed = new Set(['notifications', 'clipboard-sanitized-write', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(allowed.has(permission) && isAllowedInWindow(wc.getURL()));
  });
});

async function signInAgain(): Promise<void> {
  // Drop the current session so the returning ticket starts fresh.
  await session.defaultSession.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb'] });
  await win?.loadURL(APP_URL);
  startSignIn();
}

function buildMenu(): void {
  const wc = () => win?.webContents;
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'File',
        submenu: [
          { label: 'Sign in again', click: () => void signInAgain() },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          { label: 'Back', accelerator: 'Alt+Left', click: () => wc()?.navigationHistory.goBack() },
          { label: 'Forward', accelerator: 'Alt+Right', click: () => wc()?.navigationHistory.goForward() },
          { type: 'separator' },
          { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => void win?.loadURL(currentOrHome()) },
          { role: 'forceReload' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' as const }]),
        ],
      },
      {
        label: 'Help',
        submenu: [
          { label: 'Check for updates', click: () => void checkForUpdatesManually() },
          {
            label: 'About Club Crumbs',
            click: () =>
              void dialog.showMessageBox({
                title: 'About Club Crumbs',
                message: 'Club Crumbs',
                detail: `Version ${app.getVersion()}\nElectron ${process.versions.electron}`,
              }),
          },
        ],
      },
    ])
  );
}

/** Reload from the offline page goes back to the site, not to the offline file. */
function currentOrHome(): string {
  const url = win?.webContents.getURL() || '';
  return isAllowedInWindow(url) ? url : APP_URL;
}
