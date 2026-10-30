// Log a sighting (/live/log-a-sighting/): the old site's intake form (wahoobay-net-frontend,
// src/pages/intake/IntakeForm.js) on the Java API's own endpoints, which it already used. Hydrated at once
// (client:load): on mount it asks GET /intake/status whether submissions are open; photos go one by one to
// POST /upload (multipart, field `file`), whose {storage_key, url} the sighting then carries; the sighting is
// POST /sightings, its body built by buildPayload in src/lib/sighting.mjs. The API is public and limits writes per
// address itself (30 a minute); nothing here signs in or holds a key.
// The camera's stream plays in YouTube's IFrame API player from youtube-nocookie.com, the site's privacy-enhanced
// embed; the API's script loads with this island only, and the stream never starts by itself. "Mark this moment"
// records where the player is (getCurrentTime()) and how far that is behind the live edge, which is what the API
// needs to keep a clip of it.
// The species box offers the committed snapshot (src/data/species.json) as a datalist; a name that is not in it is sent
// as typed, as the old form allowed. The form is the design's controls (.wb-field, .wb-label, .wb-input, .wb-select,
// .wb-textarea, .wb-help, .wb-error) and notices (.wb-notice); the island sets no style of its own.
// The words are the old form's, except the notices' new sentences, each marked for Katie.
import { useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react';
import { API, LIFE_STAGES, MAX_NOTES, MAX_PHOTOS, MESSAGES, buildPayload, findSpecies, formState, speciesLabel, validate } from '../lib/sighting.mjs';

export interface Camera {
  id: number;
  name: string;
  /** The camera's YouTube video id (the datasource's link). */
  video: string;
}

export interface Species {
  id: number;
  common_name: string | null;
  scientific_name: string | null;
}

interface Props {
  cameras: Camera[];
  species: Species[];
  /** The build's environment (PUBLIC_SITE_ENV); every submission from a build that is not production's is labelled. */
  env: string;
}

// The old form's words (IntakeForm.js). A label is its label and hint as the old form showed them together ("Notes
// (optional)"; the species box's "Search by common or scientific name — not listed? just type it" is its help here,
// under "Species", the old section's name). Left out: the ✓ before "Mark this moment", the first sentence of the
// mark's help (it names rewind buttons and a clip range this form does not have) and the rest of the photos hint
// ("— optional; the marked moment above is linked too", now "(optional)").
const CAMERA = 'Camera';
const CAMERA_NONE = 'Select a camera…';
const PLAYER_LOADING = 'Loading live controls…';
const MARK = 'Mark this moment';
// katie: review: the old form's promise; it holds when the API's clip capture runs (it is best-effort)
const MARK_HELP = 'A single mark saves the 15 seconds before and after. Reviewers jump straight to it.';
const UNMARKED = 'Nothing marked yet — the live camera is linked by default.';
const marked = (time: string) => `Marked moment ${time} — reviewers open right here.`;
const SPECIES = 'Species';
const SPECIES_HELP = 'Search by common or scientific name — not listed? just type it';
const SPECIES_EXAMPLE = 'e.g. angelfish, snook, Tursiops…';
const LIFE_STAGE = 'Life stage';
const LIFE_STAGE_NONE = 'Select…';
const NOTES = 'Notes (optional)';
const NOTES_EXAMPLE = 'Describe what you observed — behavior, size, markings, quantity…';
const PHOTOS = 'Photos (optional)';
const PHOTOS_HELP = 'JPG, PNG, HEIC — you can add several';
const SUBMIT = 'Submit Sighting';
const PAUSED = 'Submissions paused';
const SUBMIT_ANOTHER = 'Submit another';

// The notices. Their words are the old form's own; the API's reason ("Sighting submissions are temporarily paused.
// Please check back soon.", "Too many requests. Please slow down and try again shortly.", a photo's "Unsupported image
// type.") is shown instead when its answer gives one, a photo's after the photo's file name.
// katie: review: the closed notice, when the API gives no reason
const CLOSED = 'Sighting submissions are temporarily unavailable. Please check back soon.';
// katie: review: the error notice, when the API gives no reason
const SEND_FAILED = 'Something went wrong submitting your sighting. Please try again.';
// katie: review: the success notice (the old form's success card, its heading first, without its emoji)
const SENT = 'Sighting submitted!';
// katie: review
const SENT_THANKS = 'Thank you for contributing to the Wahoo Bay marine database.';
// katie: review
const sentQueue = (id: number | string) => `Your sighting (#${id}) is now in the review queue.`;
// katie: review
const SENT_NEW = 'First time this species has been recorded at this camera!';

// The API's own word for a failed upload, when its answer has none.
const UPLOAD_FAILED = 'Upload failed.';

// The YouTube IFrame API, as much of it as the form uses.
interface YouTubePlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getIframe(): HTMLIFrameElement;
  destroy(): void;
}
interface YouTubeEvent {
  target: YouTubePlayer;
}
interface YouTubeApi {
  Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayer;
}
declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YOUTUBE_API = 'https://www.youtube.com/iframe_api';
let youtube: Promise<YouTubeApi> | undefined;
/** The IFrame API, loaded once, when the form first needs it. */
const loadYouTube = () =>
  (youtube ??= new Promise<YouTubeApi>((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const before = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      before?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = YOUTUBE_API;
    script.async = true;
    script.onerror = () => {
      youtube = undefined;
      reject(new Error('the YouTube IFrame API did not load'));
    };
    document.head.append(script);
  }));

/** The `error` the API's JSON answer carries, if it has one. */
const reasonOf = async (res: Response) => {
  try {
    const body = await res.json();
    return typeof body?.error === 'string' && body.error ? (body.error as string) : null;
  } catch {
    return null;
  }
};

/** A failed request, with the words the form shows for it. */
class Failure extends Error {}

/** One photo to POST /upload; the sighting carries its {storage_key, url}. */
const upload = async (file: File) => {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`${API}/upload`, { method: 'POST', body });
  if (!res.ok) throw new Failure(`${file.name}: ${(await reasonOf(res)) ?? UPLOAD_FAILED}`);
  const { storage_key, url } = (await res.json()) as { storage_key: string; url: string };
  return { storage_key, url };
};

/** The moment marked: where the player was, how far that was behind live, and when it was marked (epoch ms). */
interface Moment {
  seconds: number;
  behind: number;
  at: number;
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const ID = {
  camera: 'sighting-camera',
  species: 'sighting-species',
  list: 'sighting-species-list',
  lifeStage: 'sighting-life-stage',
  notes: 'sighting-notes',
  photos: 'sighting-photos',
};

export default function SightingForm({ cameras, species, env }: Props) {
  const [state, setState] = useState<'open' | 'closed'>('open');
  const [closedReason, setClosedReason] = useState('');
  const [cameraId, setCameraId] = useState(cameras[0] ? String(cameras[0].id) : '');
  const [speciesText, setSpeciesText] = useState('');
  const [lifeStage, setLifeStage] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileInput, setFileInput] = useState(0);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [player, setPlayer] = useState<'loading' | 'ready' | 'unplayable' | 'failed'>('loading');
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState<{ id: number | string; isNew: boolean } | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const sentRef = useRef<HTMLDivElement>(null);

  const camera = cameras.find((c) => String(c.id) === cameraId);
  const video = camera?.video ?? null;
  const picked = useMemo(() => findSpecies(species, speciesText), [species, speciesText]);
  const fields = { speciesId: picked?.id ?? null, speciesName: speciesText, cameraId, notes };
  const errors = tried ? validate(fields) : [];
  const closed = state === 'closed';

  // Is the form taking sightings? Until the answer comes, it is.
  useEffect(() => {
    let alive = true;
    (async () => {
      let status: { enabled?: boolean; message?: string } | null = null;
      let failed: number | undefined;
      try {
        const res = await fetch(`${API}/intake/status`);
        if (res.ok) status = await res.json();
        else failed = res.status;
      } catch {
        failed = 0;
      }
      if (!alive) return;
      setState(formState({ status, failed }));
      setClosedReason(typeof status?.message === 'string' ? status.message : '');
    })();
    return () => {
      alive = false;
    };
  }, []);

  // The camera's stream, in a player the IFrame API makes inside the frame (React owns the frame, never the player).
  useEffect(() => {
    if (!host || !video) return;
    let cancelled = false;
    let made: YouTubePlayer | undefined;
    setPlayer('loading');
    const target = document.createElement('div');
    host.append(target);
    loadYouTube()
      .then((YT) => {
        if (cancelled) return;
        made = new YT.Player(target, {
          host: 'https://www.youtube-nocookie.com',
          videoId: video,
          playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
          events: {
            onReady: (event: YouTubeEvent) => {
              if (cancelled) return;
              event.target.getIframe().title = `${camera?.name ?? CAMERA}, live stream`;
              playerRef.current = event.target;
              setPlayer('ready');
            },
            // The player shows why it cannot play; the form goes on without a mark.
            onError: () => {
              if (!cancelled) setPlayer('unplayable');
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setPlayer('failed');
      });
    return () => {
      cancelled = true;
      playerRef.current = null;
      made?.destroy();
      host.replaceChildren();
    };
  }, [host, video]);

  useEffect(() => {
    if (failure) failureRef.current?.focus();
  }, [failure]);
  useEffect(() => {
    if (sent) sentRef.current?.focus();
  }, [sent]);

  const mark = () => {
    const p = playerRef.current;
    if (!p) return;
    const current = p.getCurrentTime();
    const duration = p.getDuration();
    if (!Number.isFinite(current)) return;
    const behind = current > 0 && duration > 0 ? Math.max(0, Math.round(duration - current)) : 0;
    setMoment({ seconds: Math.floor(current), behind, at: Date.now() });
  };

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending || closed) return;
    setTried(true);
    setFailure(null);
    const missing = validate(fields);
    if (missing.length) {
      // The first field that needs something, in the form's order.
      const first = [
        [MESSAGES.camera, ID.camera],
        [MESSAGES.species, ID.species],
        [MESSAGES.notes, ID.notes],
      ].find(([message]) => missing.includes(message));
      if (first) document.getElementById(first[1])?.focus();
      return;
    }
    setSending(true);
    try {
      const photos = [];
      for (const file of files) photos.push(await upload(file));
      const payload = buildPayload({
        speciesId: picked?.id ?? null,
        speciesName: speciesText,
        cameraId,
        videoId: video,
        momentSeconds: moment?.seconds,
        // How far the moment is behind the live edge now, when the API starts recording from there.
        behindLive: moment ? moment.behind + Math.round((Date.now() - moment.at) / 1000) : undefined,
        momentWall: moment ? moment.at - moment.behind * 1000 : undefined,
        lifeStage,
        notes,
        photos,
        env,
      });
      const res = await fetch(`${API}/sightings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const out = (await res.json()) as { sighting_id?: number; is_new_at_location?: boolean };
        setSent({ id: out.sighting_id ?? '—', isNew: Boolean(out.is_new_at_location) });
      } else if (res.status === 403) {
        // Paused between the page's load and the submit: the API says so, and enforces it.
        setClosedReason((await reasonOf(res)) ?? '');
        setState('closed');
      } else {
        throw new Failure((await reasonOf(res)) ?? SEND_FAILED);
      }
    } catch (error) {
      setFailure(error instanceof Failure ? error.message : SEND_FAILED);
    } finally {
      setSending(false);
    }
  };

  const another = () => {
    setSent(null);
    setSpeciesText('');
    setLifeStage('');
    setNotes('');
    setFiles([]);
    setFileInput((n) => n + 1);
    setMoment(null);
    setTried(false);
    setFailure(null);
  };

  if (sent) {
    return (
      <div className="site-sighting__sent">
        <div className="wb-notice" role="status" tabIndex={-1} ref={sentRef}>
          <p>
            <strong>{SENT}</strong> {SENT_THANKS} {sentQueue(sent.id)}
            {sent.isNew && ` ${SENT_NEW}`}
          </p>
        </div>
        <div>
          <button className="wb-btn wb-btn--ghost" type="button" onClick={another}>
            {SUBMIT_ANOTHER}
          </button>
        </div>
      </div>
    );
  }

  const has = (message: string) => errors.includes(message);
  const describedBy = (...ids: (string | false)[]) => ids.filter(Boolean).join(' ') || undefined;

  return (
    <form className="site-sighting" noValidate aria-busy={sending} onSubmit={submit}>
      {closed && (
        <div className="wb-notice site-sighting__wide" role="status">
          <p>{closedReason || CLOSED}</p>
        </div>
      )}
      <div className="site-sighting__column">
        <div className="wb-field">
          <label className="wb-label" htmlFor={ID.camera}>{CAMERA}</label>
          <select
            className="wb-select"
            id={ID.camera}
            value={cameraId}
            aria-invalid={has(MESSAGES.camera) || undefined}
            aria-describedby={describedBy(has(MESSAGES.camera) && `${ID.camera}-error`)}
            onChange={(e) => {
              setCameraId(e.target.value);
              setMoment(null);
            }}
          >
            <option value="">{CAMERA_NONE}</option>
            {cameras.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
          {has(MESSAGES.camera) && <p className="wb-error" id={`${ID.camera}-error`}>{MESSAGES.camera}</p>}
        </div>
        {video && player !== 'failed' && (
          <>
            <div className="site-sighting__frame">
              <div className="wb-video" ref={setHost} />
              {player === 'loading' && <p className="site-sighting__status" role="status">{PLAYER_LOADING}</p>}
            </div>
            <div className="site-sighting__mark">
              <button className="wb-btn wb-btn--ghost" type="button" disabled={player !== 'ready'} aria-describedby="sighting-mark-help" onClick={mark}>
                {MARK}
              </button>
              <p className="wb-help" role="status">{moment ? marked(clock(moment.at - moment.behind * 1000)) : UNMARKED}</p>
              <p className="wb-help" id="sighting-mark-help">{MARK_HELP}</p>
            </div>
          </>
        )}
      </div>
      <div className="site-sighting__column">
        <div className="wb-field">
          <label className="wb-label" htmlFor={ID.species}>{SPECIES}</label>
          <input
            className="wb-input"
            id={ID.species}
            type="text"
            list={ID.list}
            autoComplete="off"
            placeholder={SPECIES_EXAMPLE}
            value={speciesText}
            aria-invalid={has(MESSAGES.species) || undefined}
            aria-describedby={describedBy(`${ID.species}-help`, has(MESSAGES.species) && `${ID.species}-error`)}
            onChange={(e) => setSpeciesText(e.target.value)}
          />
          <datalist id={ID.list}>
            {species.map((s) => (
              <option key={s.id} value={speciesLabel(s)} />
            ))}
          </datalist>
          <p className="wb-help" id={`${ID.species}-help`}>{SPECIES_HELP}</p>
          {has(MESSAGES.species) && <p className="wb-error" id={`${ID.species}-error`}>{MESSAGES.species}</p>}
        </div>
        <div className="wb-field">
          <label className="wb-label" htmlFor={ID.lifeStage}>{LIFE_STAGE}</label>
          <select className="wb-select" id={ID.lifeStage} value={lifeStage} onChange={(e) => setLifeStage(e.target.value)}>
            <option value="">{LIFE_STAGE_NONE}</option>
            {LIFE_STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="wb-field">
          <label className="wb-label" htmlFor={ID.notes}>{NOTES}</label>
          <textarea
            className="wb-textarea"
            id={ID.notes}
            maxLength={MAX_NOTES}
            placeholder={NOTES_EXAMPLE}
            value={notes}
            aria-invalid={has(MESSAGES.notes) || undefined}
            aria-describedby={describedBy(has(MESSAGES.notes) && `${ID.notes}-error`)}
            onChange={(e) => setNotes(e.target.value)}
          />
          {has(MESSAGES.notes) && <p className="wb-error" id={`${ID.notes}-error`}>{MESSAGES.notes}</p>}
        </div>
        <div className="wb-field">
          <label className="wb-label" htmlFor={ID.photos}>{PHOTOS}</label>
          <input
            className="wb-input"
            id={ID.photos}
            type="file"
            accept="image/*"
            multiple
            key={fileInput}
            aria-describedby={`${ID.photos}-help`}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS))}
          />
          <p className="wb-help" id={`${ID.photos}-help`}>{PHOTOS_HELP}</p>
        </div>
        {failure && (
          <div className="wb-notice wb-notice--error" role="alert" tabIndex={-1} ref={failureRef}>
            <p>{failure}</p>
          </div>
        )}
        <div>
          <button className="wb-btn wb-btn--action" type="submit" disabled={sending || closed}>
            {closed ? PAUSED : SUBMIT}
          </button>
        </div>
      </div>
    </form>
  );
}
