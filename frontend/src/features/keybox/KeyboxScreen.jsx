import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import ActionButton from '../../components/ActionButton.jsx';
import Header from '../../components/Header.jsx';
import {
  backupKeyboxLockData,
  endKeyboxGrant,
  fetchKeyboxCredentials,
  getKeyboxStatus,
  requestKeyboxOpen,
} from '../../api.js';
import { initialState, keyboxReducer } from './keyboxState.js';
import { DENIED_TEXT, EXPIRED_TEXT, formatRemaining, gateReducer, initialGate, remainingMs } from './gateState.js';
import { clearLockData, loadLockData, parseLockData } from './lockDataStore.js';
import { describeError } from './errors.js';
import { KeyboxError, messageFor, runCommand } from './runCommand.js';

const STEP_TEXT = {
  searching: 'Looking for the box…',
  connecting: 'Connecting…',
  sending: 'Sending command…',
  done: 'Done…',
};

const DONE_TEXT = { open: 'Box opened' };

const ERROR_BOX =
  'rounded-2xl bg-red-50 px-4 py-3 text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900';

const FIELD =
  'field-sizing-content w-full resize-none rounded-2xl bg-white/80 p-4 text-lg shadow-lg shadow-slate-900/5 ring-1 ring-slate-200 backdrop-blur placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-500 dark:bg-white/10 dark:ring-white/10 dark:placeholder:text-gray-500';

export default function KeyboxScreen({ onHome }) {
  const [state, dispatch] = useReducer(keyboxReducer, initialState);
  const [gate, gateDispatch] = useReducer(gateReducer, initialGate);
  const [hasLock, setHasLock] = useState(false);
  // Set only while the lock state is still unknown (first status fetch failed).
  const [statusError, setStatusError] = useState('');
  const knownLock = useRef(null);
  const [note, setNote] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const mounted = useRef(true);
  const running = useRef(false);

  // Asks the server for the lock and window state; failures show in the gate's error box.
  const refreshStatus = useCallback(async () => {
    try {
      const status = await getKeyboxStatus();
      if (!mounted.current) return;
      const has = Boolean(status.hasLock);
      setStatusError('');
      setHasLock(has);
      // Only on first load or a real change, so a refetch does not clear the 'Box opened' message.
      if (knownLock.current !== has) dispatch({ type: 'loaded', payload: has });
      knownLock.current = has;
      const at = Date.now();
      setNow(at);
      gateDispatch({ type: 'status', payload: { grant: status.grant }, now: at });
    } catch (err) {
      if (!mounted.current) return;
      // Never pretend there is no lock, and never drop an open window, on a failed fetch.
      if (knownLock.current === null) setStatusError(err.message);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      // Migration: a lock still stored on this phone moves to the server; the phone copy is
      // cleared only after the upload succeeded.
      try {
        const legacy = await loadLockData();
        if (legacy) {
          await backupKeyboxLockData(legacy);
          await clearLockData();
        }
      } catch {
        // Keep the phone copy; the next visit retries.
      }
      if (mounted.current) await refreshStatus();
    })();

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshStatus();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshStatus]);

  // Countdown: one tick per second, only while a window is open.
  useEffect(() => {
    if (gate.phase !== 'approved') return undefined;
    const id = setInterval(() => {
      const at = Date.now();
      setNow(at);
      gateDispatch({ type: 'tick', now: at });
    }, 1000);
    return () => clearInterval(id);
  }, [gate.phase]);

  async function handleImport(e) {
    e.preventDefault();
    setImporting(true);
    try {
      const lock = parseLockData(importText);
      await backupKeyboxLockData(lock);
      if (!mounted.current) return;
      setImportError('');
      setImportText('');
      setReplacing(false);
      await refreshStatus();
    } catch (err) {
      if (mounted.current) setImportError(err.message);
    } finally {
      if (mounted.current) setImporting(false);
    }
  }

  async function handleAsk() {
    if (gate.phase === 'asking') return;
    gateDispatch({ type: 'ask' });
    try {
      const result = await requestKeyboxOpen(note);
      if (!mounted.current) return;
      const at = Date.now();
      setNow(at);
      gateDispatch({ type: 'answered', payload: result, now: at });
    } catch (err) {
      if (mounted.current) gateDispatch({ type: 'failed', payload: err.message });
    }
  }

  async function handleOpen() {
    if (running.current) return;
    running.current = true;
    dispatch({ type: 'start', payload: 'open' });
    try {
      // Credentials live only in this local variable.
      let lockData;
      try {
        ({ lockData } = await fetchKeyboxCredentials());
      } catch (err) {
        if (err.status === 403) {
          // The window ended while the screen was open.
          dispatch({ type: 'cancel' });
          running.current = false;
          await refreshStatus();
          return;
        }
        throw err;
      }
      await runCommand('open', lockData, {
        onState: (s) => mounted.current && dispatch({ type: 'step', payload: s }),
      });
      if (mounted.current) dispatch({ type: 'succeeded' });
      try {
        await endKeyboxGrant();
      } catch {
        // The window lapses on its own.
      }
      if (mounted.current) gateDispatch({ type: 'ended' });
    } catch (err) {
      const reason = err instanceof KeyboxError ? err.reason : 'failed';
      const detail = err instanceof KeyboxError ? err.detail : describeError(err);
      if (mounted.current) dispatch({ type: 'failed', payload: messageFor(reason), detail });
    } finally {
      running.current = false;
    }
  }

  const busy = state.phase === 'busy';
  const loading = state.phase === 'loading';
  const approved = gate.phase === 'approved';
  const asking = gate.phase === 'asking';
  const statusUnknown = loading && Boolean(statusError);
  const showImport = !loading && (!hasLock || (replacing && !busy));

  return (
    <>
      <Header title="Keybox" onBack={busy ? undefined : onHome} />

      {statusUnknown && (
        <div className="flex animate-fade-up flex-col gap-3">
          <p className={ERROR_BOX}>{statusError}</p>
          <ActionButton
            type="button"
            onClick={() => {
              setStatusError('');
              refreshStatus();
            }}
          >
            Retry
          </ActionButton>
        </div>
      )}

      {showImport && (
        <form onSubmit={handleImport} className="flex animate-fade-up flex-col gap-3">
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste the contents of lockData.json here"
            className={`${FIELD} min-h-32 max-h-[40vh]`}
          />
          {importError && <p className={ERROR_BOX}>{importError}</p>}
          <ActionButton type="submit" disabled={importing || !importText.trim()}>
            Save
          </ActionButton>
          {replacing && (
            <ActionButton
              type="button"
              onClick={() => {
                setReplacing(false);
                setImportText('');
                setImportError('');
              }}
            >
              Cancel
            </ActionButton>
          )}
        </form>
      )}

      {hasLock && (
        <div className="flex animate-fade-up flex-col gap-4">
          {!approved && !busy && (
            <div className="flex flex-col gap-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="Reason (optional)"
                className={`${FIELD} min-h-20 max-h-[40vh]`}
              />
              <ActionButton type="button" disabled={asking} onClick={handleAsk}>
                {asking ? 'Asking Libby…' : 'Ask Libby'}
              </ActionButton>
            </div>
          )}

          <div aria-live="polite" className="flex flex-col gap-3">
            {gate.phase === 'denied' && (
              <div className={ERROR_BOX}>
                <p>{DENIED_TEXT}</p>
                {gate.reply && <p className="mt-1 break-words opacity-80">{gate.reply}</p>}
              </div>
            )}
            {gate.phase === 'error' && <p className={ERROR_BOX}>{gate.error}</p>}
            {gate.phase === 'expired' && <p className="text-center opacity-70">{EXPIRED_TEXT}</p>}
          </div>

          {approved && (
            <>
              {gate.reply && <p className="break-words text-center">{gate.reply}</p>}
              <ActionButton type="button" disabled={busy} onClick={handleOpen}>
                {`Open box (${formatRemaining(remainingMs(gate, now))})`}
              </ActionButton>
            </>
          )}

          <div aria-live="polite">
            {busy && <p className="text-center opacity-70">{STEP_TEXT[state.step] ?? 'Looking for the box…'}</p>}
            {state.phase === 'done' && state.lastAction && (
              <p className="text-center font-semibold">{DONE_TEXT[state.lastAction]}</p>
            )}
            {state.phase === 'failed' && (
              <div className={ERROR_BOX}>
                <p>{state.message}</p>
                {state.detail && <p className="mt-1 break-words text-sm opacity-70">{state.detail}</p>}
              </div>
            )}
          </div>

          {!busy && !replacing && (
            <ActionButton
              type="button"
              onClick={() => {
                setImportError('');
                setReplacing(true);
              }}
            >
              Replace lock data
            </ActionButton>
          )}
        </div>
      )}
    </>
  );
}
