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
