import { useCallback, useEffect, useRef, useState } from 'react';
import { answerMantra, getMantra, storePassword, UnauthorizedError } from '../../api.js';
import ActionButton from '../../components/ActionButton.jsx';
import Header from '../../components/Header.jsx';
import { enablePush, pushPermission, syncPush } from './push.js';

const POLL_MS = 15_000;

const card =
  'rounded-2xl bg-white/80 p-4 shadow-lg shadow-violet-900/5 ring-1 ring-violet-200 backdrop-blur dark:bg-white/10 dark:ring-white/10';

function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function MantraScreen({ onHome, onLocked }) {
  const [status, setStatus] = useState(null); // server status from GET /api/mantra
  const [loadError, setLoadError] = useState('');
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null); // response of the last answer, shown until dismissed
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [permission, setPermission] = useState(pushPermission);
  const [pushError, setPushError] = useState('');
  const clockOffset = useRef(0); // server time minus phone time

  const handleError = useCallback(
    (err) => {
      if (err instanceof UnauthorizedError) {
        storePassword('');
        onLocked();
        return true;
      }
      return false;
    },
    [onLocked],
  );

  const refresh = useCallback(async () => {
    try {
      const data = await getMantra();
      clockOffset.current = data.now - Date.now();
      setStatus(data);
      setLoadError('');
    } catch (err) {
      if (!handleError(err)) setLoadError(err.message);
    }
  }, [handleError]);

  // Load now, poll, and reload when the app comes back to the foreground.
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    syncPush().catch(() => {});
  }, []);

  const open = result ? null : status?.open;
  const remaining = open ? open.deadline - (now + clockOffset.current) : 0;
  const timeUp = open && remaining <= 0;

  // Tick the countdown while a mantra is open; once time is up, let the server mark it failed.
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (timeUp) {
      setResult({ result: 'failed', reason: 'timeout', expected: open.text });
      setAnswer('');
      refresh();
    }
  }, [timeUp, open, refresh]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!open || !answer.trim() || submitting) return;

    setSubmitting(true);
    try {
      const data = await answerMantra(open.id, answer);
      setResult({ ...data, answer });
      setAnswer('');
      refresh();
    } catch (err) {
      if (!handleError(err)) {
        setResult({ result: 'failed', reason: 'error', expected: open.text, error: err.message });
        refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEnablePush() {
    setPushError('');
    try {
      await enablePush();
    } catch (err) {
      if (!handleError(err)) setPushError(err.message);
    }
    setPermission(pushPermission());
  }

  return (
    <>
      <Header title="Mantra" onBack={onHome}>
        {open && (
          <ActionButton type="submit" form="mantra" disabled={!answer.trim() || submitting}>
            Check
          </ActionButton>
        )}
        {result && (
          <ActionButton type="button" onClick={() => setResult(null)}>
            Done
          </ActionButton>
        )}
      </Header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {open && (
          <form id="mantra" onSubmit={handleSubmit} className="flex animate-fade-up flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="opacity-70">Type it exactly:</span>
              <span
                className={`rounded-full px-3 py-1 font-mono font-semibold tabular-nums ${
                  remaining < 60_000
                    ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                    : 'bg-violet-100 text-violet-700 dark:bg-white/10 dark:text-violet-200'
                }`}
              >
                ⏱ {formatCountdown(remaining)}
              </span>
            </div>
            <p className={`${card} select-none whitespace-pre-wrap text-lg font-medium`}>{open.text}</p>
            <textarea
              autoFocus
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Type the mantra…"
              className="field-sizing-content min-h-28 max-h-[35vh] w-full resize-none rounded-2xl bg-white/80 p-4 text-lg shadow-lg shadow-violet-900/5 ring-1 ring-violet-200 backdrop-blur placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:bg-white/10 dark:ring-white/10 dark:placeholder:text-gray-500"
            />
          </form>
        )}

        {result && <Result result={result} />}

        {!open && !result && status && (
          <div className={`${card} animate-fade-up text-center`}>
            <p className="text-4xl" aria-hidden="true">
              🧘
            </p>
            <p className="mt-2 text-lg font-semibold">No mantra right now</p>
            <p className="mt-1 text-sm opacity-70">
              {status.today.remaining > 0
                ? `${status.today.remaining} more coming today.`
                : 'All done for today.'}
            </p>
          </div>
        )}

        {loadError && <p className="text-center text-sm text-red-600 dark:text-red-400">Failed: {loadError}</p>}

        {status && (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Successful" value={status.stats.success} emoji="✅" />
            <Stat label="Failed" value={status.stats.failed} emoji="❌" />
          </div>
        )}

        {permission !== 'granted' && (
          <div className={`${card} text-center text-sm`}>
            {permission === 'unsupported' ? (
              <p className="opacity-70">Notifications need the installed app on https.</p>
            ) : permission === 'denied' ? (
              <p className="opacity-70">Notifications are blocked. Allow them in the phone's app settings.</p>
            ) : (
              <button type="button" onClick={handleEnablePush} className="font-semibold text-violet-700 dark:text-violet-300">
                🔔 Enable notifications
              </button>
            )}
            {pushError && <p className="mt-1 text-red-600 dark:text-red-400">{pushError}</p>}
          </div>
        )}
      </div>
    </>
  );
}

function Result({ result }) {
  const success = result.result === 'success';
  const title = success ? 'Perfect!' : result.reason === 'timeout' ? "Time's up" : 'Not quite';

  return (
    <div
      className={`animate-fade-up rounded-2xl p-4 ring-1 ${
        success
          ? 'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-100 dark:ring-emerald-900'
          : 'bg-red-50 text-red-900 ring-red-200 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900'
      }`}
    >
      <p className="text-xl font-bold">
        {success ? '✅' : '❌'} {title}
      </p>
      {!success && (
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="opacity-70">Mantra</dt>
            <dd className="whitespace-pre-wrap font-medium">{result.expected}</dd>
          </div>
          {result.answer !== undefined && (
            <div>
              <dt className="opacity-70">You typed</dt>
              <dd className="whitespace-pre-wrap font-medium">{result.answer}</dd>
            </div>
          )}
          {result.error && <p className="opacity-70">{result.error}</p>}
        </dl>
      )}
    </div>
  );
}

function Stat({ label, value, emoji }) {
  return (
    <div className={`${card} text-center`}>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-sm opacity-70">
        {emoji} {label}
      </p>
    </div>
  );
}
