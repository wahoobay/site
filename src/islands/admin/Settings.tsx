// Settings (#/settings): the intake switch, read from the public GET /intake/status and written with
// PATCH /admin/settings/intake, which opens or closes the live sighting form for everyone, so it asks first in a
// .wb-dialog. What shows and what is sent is src/lib/admin/housekeeping.mjs's; a 401 on the write, and a failed one,
// goes to the shell's notify.
import { useState } from 'react';
import type { ScreenProps } from '../AdminApp';
import { toReact } from '../vdom-react';
import { INTAKE_CONFIRM, intakeNode, intakeOutcome, intakeRequest, intakeStatusRequest, intakeView, settingsActions } from '../../lib/admin/housekeeping.mjs';
import { ConfirmDialog, NO_TOKEN, send, useAnswer, useOneAtATime } from './shared';

export default function Settings({ session, notify }: ScreenProps) {
  const [round, setRound] = useState(0);
  const [written, setWritten] = useState<boolean | null>(null);
  const [confirm, setConfirm] = useState<boolean | null>(null);
  const { busy, run } = useOneAtATime();
  const status = useAnswer(intakeStatusRequest().path, NO_TOKEN, notify, round);
  const view = intakeView(written !== null ? { enabled: written } : status.state === 'done' ? status.value : null);
  const actions = settingsActions(session.user, view, busy !== null);

  const write = () => {
    const next = confirm;
    if (next === null) return;
    void run(
      'intake',
      async () => {
        const open = intakeOutcome(await send(intakeRequest(next), session.token), next);
        setWritten(open);
        setConfirm(null);
        notify(open ? 'The sighting form is open.' : 'The sighting form is closed.');
      },
      (error) => {
        setConfirm(null);
        notify(error);
      },
    );
  };

  return (
    <section className="site-admin__screen" aria-labelledby="settings-title">
      <h2 id="settings-title">Settings</h2>
      <div className="site-admin__column">
        <h3>The sighting form</h3>
        <p>Closing the form stops every new sighting, on the live site, until it is opened again. It is there to stop abuse or a runaway cost.</p>
        {written === null && status.state === 'loading' ? (
          <p role="status">Checking the sighting form…</p>
        ) : written === null && status.state === 'failed' ? (
          <div className="wb-notice wb-notice--error site-admin__notice" role="alert">
            <p>{view.text}</p>
            <button className="wb-btn wb-btn--action" type="button" onClick={() => setRound((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : (
          toReact(intakeNode(view, { settingsHref: null }))
        )}
        {actions.intake.shown && (
          <div>
            <button
              className={`wb-btn ${actions.intake.next ? 'wb-btn--action' : 'wb-btn--ghost'}${busy === 'intake' ? ' wb-btn--busy' : ''}`}
              type="button"
              disabled={!actions.intake.enabled}
              onClick={() => setConfirm(actions.intake.next)}
            >
              {actions.intake.label}
            </button>
          </div>
        )}
      </div>
      <ConfirmDialog id="settings-intake" confirm={confirm === null ? null : INTAKE_CONFIRM(confirm)} busy={busy !== null} onConfirm={write} onCancel={() => setConfirm(null)} />
    </section>
  );
}
