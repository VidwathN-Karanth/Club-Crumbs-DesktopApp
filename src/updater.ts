import { app, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log/main';

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
let prompted = false;

/**
 * Background updates from GitHub Releases. Downloads silently; when one is
 * ready, offers a restart, otherwise it installs on quit. Update failures are
 * logged and never surface as crashes.
 */
export function initUpdater(): void {
  if (!app.isPackaged) return;
  autoUpdater.logger = log;

  autoUpdater.on('error', (err) => log.error('Updater error:', err?.message ?? err));
  autoUpdater.on('update-downloaded', async (info) => {
    if (prompted) return;
    prompted = true;
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Club Crumbs ${info.version} is ready to install.`,
      detail: 'Restart now, or it will install the next time you quit.',
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  const check = () => autoUpdater.checkForUpdates().catch((e) => log.error('Update check failed:', e?.message ?? e));
  void check();
  setInterval(check, CHECK_EVERY_MS);
}

/** Menu → Check for updates. */
export async function checkForUpdatesManually(): Promise<void> {
  if (!app.isPackaged) {
    await dialog.showMessageBox({ message: 'Updates only run in the installed app.' });
    return;
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result?.isUpdateAvailable) {
      await dialog.showMessageBox({ message: `You're on the latest version (${app.getVersion()}).` });
    } else {
      await dialog.showMessageBox({ message: `Downloading ${result.updateInfo.version} in the background…` });
    }
  } catch (e) {
    log.error('Manual update check failed:', e);
    await dialog.showMessageBox({ type: 'error', message: 'Could not check for updates. Try again later.' });
  }
}
