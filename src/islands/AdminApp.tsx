// The sighting review (/admin/, src/pages/admin/index.astro): one island, rendered in the browser only, with a hash
// router inside it. Everything it decides is in tested plain modules: the session (src/lib/admin/session.mjs), the
// routes and their guard (routes.mjs), the state machine, the sidebar, the notices and the Test ribbon (shell.mjs);
// this file only keeps the state, follows the address bar and draws. The sign-in and the change of password are the
// shell's own; every other screen is a component in SCREENS, by its route's screen name (routes.mjs), and receives
// { session, params, navigate, notify }. A screen hands `notify` words, { tone, text } or an error: a SessionExpired
// (any 401) ends the session and returns to the sign-in, which opens the same screen again afterwards.
// The forms are the design's controls (.wb-field, .wb-label, .wb-input, .wb-help, .wb-error, .wb-btn--action); the
// island sets no style of its own.
import { useCallback, useEffect, useReducer, useRef, useState, type ComponentType, type ReactNode, type SubmitEvent } from 'react';
import { toReact } from './vdom-react';
import { SessionExpired } from '../lib/java-api.mjs';
import { changePassword, clear, load, save, signIn } from '../lib/admin/session.mjs';
import { NO_ACCESS, errorText, noticeNode, passwordErrors, reduce, ribbonNode, sidebar, signInErrors, start, view } from '../lib/admin/shell.mjs';
import Dashboard from './admin/Dashboard';
import Queue from './admin/Queue';
import Sightings from './admin/Sightings';
import Review from './admin/Review';
import Species from './admin/Species';
import SpeciesDetail from './admin/SpeciesDetail';
import Media from './admin/Media';
import Recycle from './admin/Recycle';
import Activity from './admin/Activity';
import Users from './admin/Users';
import Settings from './admin/Settings';

/** A signed-in reviewer, as POST /auth/signin answers (session.mjs keeps it). */
export interface Session {
  token: string;
  user: { name: string; email: string | null; role: string; permissions?: string[]; mustChangePassword: boolean };
}

/** What every screen receives. */
export interface ScreenProps {
  session: Session;
  /** The route's parameters, as text (`id` for #/review/:id and #/species/:id). */
  params: Record<string, string>;
  /** Open another screen by its address ("#/review/42"). */
  navigate: (hash: string) => void;
  /** Show a notice: words, { tone: 'info' | 'error', text }, or an error (a SessionExpired signs the reviewer out). */
  notify: (notice: unknown) => void;
}

/**
 * The screens, by their route's screen name (src/lib/admin/routes.mjs). The later tasks add their screens here, and
 * nothing else in the shell changes. A route whose screen is not here yet says so.
 */
const SCREENS: Partial<Record<string, ComponentType<ScreenProps>>> = {
  dashboard: Dashboard,
  queue: Queue,
  sightings: Sightings,
  review: Review,
  species: Species,
  speciesDetail: SpeciesDetail,
  media: Media,
  recycle: Recycle,
  activity: Activity,
  users: Users,
  settings: Settings,
};

const NOT_READY = 'This screen is not ready yet.';

/** The build's environment (set by each deploy job; staging when unset): every build but production's shows the Test ribbon. */
const ENV: string | undefined = import.meta.env.PUBLIC_SITE_ENV;

/** The id of a field's error, for its control's aria-describedby. */
const errorId = (id: string) => `${id}-error`;
const describedBy = (...ids: (string | false | undefined)[]) => ids.filter(Boolean).join(' ') || undefined;

export default function AdminApp() {
  const [state, dispatch] = useReducer(reduce, null, () => start(load(), window.location.hash));
  const v = view(state);
  const main = useRef<HTMLDivElement>(null);
  const shown = useRef<string | null>(null);

  // The router follows the address bar.
  useEffect(() => {
    const onHash = () => dispatch({ type: 'navigate', hash: window.location.hash });
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // When the guard opened something else (the dashboard, the forced change of password), the address bar says so.
  useEffect(() => {
    if (v.hash && v.hash !== (window.location.hash || '#/')) window.history.replaceState(window.history.state, '', v.hash);
  }, [v.hash]);

  // Signed out, or the session ended: nothing of it stays in storage.
  useEffect(() => {
    if (!state.session) clear();
  }, [state.session]);

  // A new screen takes the focus at its heading, so a screen reader reads on from there (not on the page's first draw).
  useEffect(() => {
    const key = `${v.screen} ${v.hash}`;
    if (shown.current !== null && shown.current !== key) {
      const heading = main.current?.querySelector<HTMLElement>('h2');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      } else main.current?.focus();
    }
    shown.current = key;
  }, [v.screen, v.hash]);

  const navigate = useCallback((hash: string) => {
    dispatch({ type: 'navigate', hash });
    if (window.location.hash !== hash) window.location.hash = hash;
  }, []);
  const notify = useCallback((notice: unknown) => dispatch({ type: 'notify', notice }), []);
  const dismiss = useCallback(() => dispatch({ type: 'dismiss' }), []);
  const signOut = useCallback(() => {
    clear();
    dispatch({ type: 'signedOut' });
    window.history.replaceState(window.history.state, '', '#/');
  }, []);
  const signedIn = useCallback((session: Session) => {
    save(session);
    dispatch({ type: 'signedIn', session });
  }, []);
  const passwordChanged = useCallback(() => dispatch({ type: 'passwordChanged' }), []);

  let screen: ReactNode;
  if (v.screen === 'signin' || !v.session) screen = <SignIn onSignedIn={signedIn} />;
  else if (v.screen === 'password') screen = <ChangePassword session={v.session} forced={v.forced} onChanged={passwordChanged} notify={notify} />;
  else if (v.screen === 'noAccess') screen = <div className="wb-notice"><p>{NO_ACCESS}</p></div>;
  else {
    const Screen = SCREENS[v.screen];
    screen = Screen ? <Screen key={v.hash} session={v.session} params={v.params} navigate={navigate} notify={notify} /> : <p>{NOT_READY}</p>;
  }

  const signedInView = v.screen !== 'signin';
  return (
    <div className="site-admin">
      {toReact(ribbonNode(ENV))}
      <div className={signedInView ? 'site-admin__body site-admin__body--nav' : 'site-admin__body'}>
        {signedInView && toReact(sidebar(v, { onSignOut: signOut }))}
        <div className="site-admin__main" ref={main} tabIndex={-1}>
          {toReact(noticeNode(v.notice, { onDismiss: dismiss }))}
          {screen}
        </div>
      </div>
    </div>
  );
}

// --- the sign-in ----------------------------------------------------------------------------------------------------

const SIGN_IN = { username: 'admin-username', password: 'admin-password' };

function SignIn({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const errors = tried ? signInErrors({ username, password }) : {};

  useEffect(() => {
    if (failure) failureRef.current?.focus();
  }, [failure]);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    setTried(true);
    setFailure(null);
    const missing = signInErrors({ username, password });
    if (missing.username || missing.password) {
      document.getElementById(missing.username ? SIGN_IN.username : SIGN_IN.password)?.focus();
      return;
    }
    setSending(true);
    try {
      const session = (await signIn(username.trim(), password)) as Session;
      onSignedIn(session);
    } catch (error) {
      setPassword('');
      setFailure(errorText(error));
      setSending(false);
    }
  };

  return (
    <form className="site-admin__form" noValidate aria-busy={sending} onSubmit={submit}>
      <h2>Sign in</h2>
      <p>Sign in with the account you were given for the sighting review.</p>
      <div className="wb-field">
        <label className="wb-label" htmlFor={SIGN_IN.username}>Username</label>
        <input
          className="wb-input"
          id={SIGN_IN.username}
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          aria-invalid={errors.username ? true : undefined}
          aria-describedby={describedBy(errors.username && errorId(SIGN_IN.username))}
          onChange={(e) => setUsername(e.target.value)}
        />
        {errors.username && <p className="wb-error" id={errorId(SIGN_IN.username)}>{errors.username}</p>}
      </div>
      <div className="wb-field">
        <label className="wb-label" htmlFor={SIGN_IN.password}>Password</label>
        <input
          className="wb-input"
          id={SIGN_IN.password}
          type="password"
          autoComplete="current-password"
          value={password}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={describedBy(errors.password && errorId(SIGN_IN.password))}
          onChange={(e) => setPassword(e.target.value)}
        />
        {errors.password && <p className="wb-error" id={errorId(SIGN_IN.password)}>{errors.password}</p>}
      </div>
      {failure && (
        <div className="wb-notice wb-notice--error" role="alert" tabIndex={-1} ref={failureRef}>
          <p>{failure}</p>
        </div>
      )}
      <div>
        <button className={`wb-btn wb-btn--action${sending ? ' wb-btn--busy' : ''}`} type="submit" disabled={sending}>
          {sending ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
    </form>
  );
}

// --- the change of password -----------------------------------------------------------------------------------------

const PASSWORD_FIELDS = { current: 'admin-current-password', next: 'admin-new-password', confirm: 'admin-confirm-password' };

function ChangePassword({ session, forced, onChanged, notify }: { session: Session; forced: boolean; onChanged: () => void; notify: (notice: unknown) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const errors = tried ? passwordErrors({ current, next, confirm }) : {};

  useEffect(() => {
    if (failure) failureRef.current?.focus();
  }, [failure]);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    setTried(true);
    setFailure(null);
    const missing = passwordErrors({ current, next, confirm });
    const first = (['current', 'next', 'confirm'] as const).find((field) => missing[field]);
    if (first) {
      document.getElementById(PASSWORD_FIELDS[first])?.focus();
      return;
    }
    setSending(true);
    try {
      await changePassword(session.token, current, next);
      onChanged();
    } catch (error) {
      if (error instanceof SessionExpired) {
        notify(error);
        return;
      }
      setFailure(errorText(error));
      setSending(false);
    }
  };

  const field = (name: keyof typeof PASSWORD_FIELDS, label: string, value: string, set: (value: string) => void, autoComplete: string, help?: string) => {
    const id = PASSWORD_FIELDS[name];
    const error = errors[name];
    return (
      <div className="wb-field">
        <label className="wb-label" htmlFor={id}>{label}</label>
        <input
          className="wb-input"
          id={id}
          type="password"
          autoComplete={autoComplete}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(help && `${id}-help`, error && errorId(id))}
          onChange={(e) => set(e.target.value)}
        />
        {help && <p className="wb-help" id={`${id}-help`}>{help}</p>}
        {error && <p className="wb-error" id={errorId(id)}>{error}</p>}
      </div>
    );
  };

  return (
    <form className="site-admin__form" noValidate aria-busy={sending} onSubmit={submit}>
      <h2>Change your password</h2>
      {forced && <p>Your account was given a starting password. Choose your own before you go on.</p>}
      {field('current', 'Current password', current, setCurrent, 'current-password')}
      {field('next', 'New password', next, setNext, 'new-password', 'At least 10 characters.')}
      {field('confirm', 'Type the new password again', confirm, setConfirm, 'new-password')}
      {failure && (
        <div className="wb-notice wb-notice--error" role="alert" tabIndex={-1} ref={failureRef}>
          <p>{failure}</p>
        </div>
      )}
      <div>
        <button className={`wb-btn wb-btn--action${sending ? ' wb-btn--busy' : ''}`} type="submit" disabled={sending}>
          {sending ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </form>
  );
}
