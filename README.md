# Club Crumbs — Desktop

Electron wrapper around the live Club Crumbs website. The UI and features come
from the website, so a website deploy shows up in the app with no reinstall.
The shell itself updates through GitHub Releases.

## Contract with the website repo

Changing any of these breaks installed apps.

| Key | Value |
|---|---|
| `PRODUCTION_URL` | `https://club-crumbs.vercel.app` |
| App ID | `com.clubcrumbs.desktop` |
| URL scheme | `clubcrumbs://` |
| Website routes the app depends on | `/desktop-auth`, `/desktop-callback`, `POST /api/desktop-auth/token` |

## Sign-in flow

Google blocks OAuth inside Electron, so:

1. The app opens `https://club-crumbs.vercel.app/desktop-auth` in the system browser.
2. The student signs in with Google as usual; the page mints a 60-second, single-use Clerk sign-in token.
3. The browser opens `clubcrumbs://auth?ticket=…`, which the app catches.
4. The app loads `/desktop-callback?ticket=…`, which redeems the ticket and opens the dashboard.

## Install (students)

Download `Club-Crumbs-Setup-x.y.z.exe` from [Releases](https://github.com/VidwathN-Karanth/Club-Crumbs-DesktopApp/releases/latest).
The installer is unsigned, so Windows shows "Windows protected your PC" once:
click **More info → Run anyway**. After that the app updates itself.

## Develop

```bash
npm install
npm start                                     # runs against production
CLUB_CRUMBS_URL=http://localhost:4000 npm start   # against a local website (dev only)
npm run dist                                  # build the installer into release/ without publishing
```

Logs: `%APPDATA%\Club Crumbs\logs\main.log`.

## Ship an update

1. Bump `version` in `package.json` and commit.
2. `git tag v1.0.1 && git push --tags`
3. GitHub Actions builds the installer and publishes it to Releases.
4. Installed apps download it in the background and offer a restart.

Website changes need none of this — they show up in the app on the next load.

## Layout

| File | Job |
|---|---|
| `src/main.ts` | Window, navigation allowlist, menu, single-instance, deep links, offline fallback |
| `src/auth.ts` | Allowlist rules, system-browser sign-in, `clubcrumbs://` ticket handling |
| `src/updater.ts` | electron-updater against GitHub Releases |
| `src/offline.html` | Shown when the site can't be reached; Retry reloads it |
| `electron-builder.yml` | NSIS installer + GitHub publish config |
| `.github/workflows/release.yml` | Builds and publishes on `v*` tags |
