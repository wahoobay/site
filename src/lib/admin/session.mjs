// The admin session: the reviewer's token and profile in localStorage, and sign-in / change-password against the Java
// API (AuthController). Every storage access is guarded: a blocked or missing localStorage is a signed-out page.
import { apiFetch, ApiError } from '../java-api.mjs';

export const TOKEN_KEY = 'wb.admin.token';
export const USER_KEY = 'wb.admin.user';

/** A sign-in the API refused; the message is fit to show the person. */
export class SignInFailed extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'SignInFailed';
  }
}

/** A change of password the API (or this client) refused; the message is fit to show the person. */
export class PasswordChangeFailed extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'PasswordChangeFailed';
  }
}

const MIN_PASSWORD = 10;

/** @returns {{ token: string, user: any } | null} */
export function load() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const raw = localStorage.getItem(USER_KEY);
    if (!token || !raw) return null;
    const user = JSON.parse(raw);
    if (!user || typeof user !== 'object') return null;
    return { token, user };
  } catch {
    return null;
  }
}

/** @param {{ token: string, user: any }} session */
export function save({ token, user }) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // storage blocked: the session lasts as long as the page
  }
}

export function clear() {
  for (const key of [TOKEN_KEY, USER_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // nothing to clear
    }
  }
}

/**
 * POST /auth/signin. Answers `{ token, user }` (the caller saves it). The API answers a refusal as 200 `Failure`
 * (blank fields), 401 (wrong password) or 404 (disabled account); all are SignInFailed. Other failures (500, no answer)
 * pass through as ApiError.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ token: string, user: any }>}
 */
export async function signIn(username, password) {
  let res;
  try {
    res = await apiFetch('/auth/signin', { method: 'POST', body: { username, password } });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) throw new SignInFailed('This account is disabled');
    if (e instanceof ApiError && e.status === 401) throw new SignInFailed('Check your username and password');
    throw e;
  }
  const token = res?.data?.token;
  const user = res?.data?.user;
  if (res?.status !== 'Success' || !token || !user) throw new SignInFailed('Check your username and password');
  return { token, user };
}

/**
 * POST /auth/change-password. Rejects before any call when the new password is under 10 characters (the API trims it
 * first, so this does too). A 200 `Failure` throws its message; success clears a stored mustChangePassword flag.
 * @param {string} token
 * @param {string} current
 * @param {string} next
 */
export async function changePassword(token, current, next) {
  if (String(next).trim().length < MIN_PASSWORD) throw new PasswordChangeFailed(`The new password must be at least ${MIN_PASSWORD} characters`);
  const res = await apiFetch('/auth/change-password', { method: 'POST', token, body: { currentPassword: current, newPassword: next } });
  if (res?.status !== 'Success') throw new PasswordChangeFailed(res?.message || 'The password was not changed');
  const session = load();
  if (session) save({ token: session.token, user: { ...session.user, mustChangePassword: false } });
}
