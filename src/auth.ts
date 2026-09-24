import { app, BrowserWindow, shell } from 'electron';
import log from 'electron-log/main';

/** Part of the contract with the website repo — see README. */
export const APP_URL =
  (!app.isPackaged && process.env.CLUB_CRUMBS_URL) || 'https://club-crumbs.vercel.app';
export const PROTOCOL = 'clubcrumbs';

const APP_HOST = new URL(APP_URL).host;
// Clerk's frontend API + hosted pages (dev instance). Clerk redirects through
// these during its session handshake, so they must load in-window.
const CLERK_HOSTS = ['one-moose-3463.clerk.accounts.dev', 'one-moose-3463.accounts.dev'];

/** May this URL load inside the app window? Everything else goes to the system browser. */
export function isAllowedInWindow(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && !app.isPackaged)) return false;
    return u.host === APP_HOST || CLERK_HOSTS.includes(u.host);
  } catch {
    return false;
  }
}

/** Google refuses OAuth in embedded browsers, so these trigger the system-browser flow. */
export function isGoogleSignIn(url: string): boolean {
  try {
    return new URL(url).hostname === 'accounts.google.com';
  } catch {
    return false;
  }
}

/** Only hand safe schemes to the OS — never file:, javascript:, or custom handlers. */
export function openExternalSafe(url: string): void {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:') void shell.openExternal(url);
  } catch {
    /* malformed — ignore */
  }
}

export function startSignIn(): void {
  log.info('Opening system browser for sign-in');
  openExternalSafe(`${APP_URL}/desktop-auth`);
}

// Clerk sign-in tokens are URL-safe strings; anything else is not ours.
const TICKET_RE = /^[A-Za-z0-9._-]{20,4096}$/;

/** Handles clubcrumbs://auth?ticket=… from the browser. Never logs the ticket. */
export function handleDeepLink(link: string, win: BrowserWindow | null): void {
  if (!win) return;
  let ticket: string | null = null;
  try {
    const u = new URL(link);
    if (u.protocol === `${PROTOCOL}:` && u.hostname === 'auth') ticket = u.searchParams.get('ticket');
  } catch {
    /* fall through */
  }
  if (!ticket || !TICKET_RE.test(ticket)) {
    log.warn('Ignored a malformed deep link');
    return;
  }
  log.info('Received sign-in ticket via deep link');
  void win.loadURL(`${APP_URL}/desktop-callback?ticket=${encodeURIComponent(ticket)}`);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
