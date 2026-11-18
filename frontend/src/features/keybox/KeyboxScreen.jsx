import { useEffect, useReducer, useRef, useState } from 'react';
import ActionButton from '../../components/ActionButton.jsx';
import Header from '../../components/Header.jsx';
import { initialState, keyboxReducer } from './keyboxState.js';
import { loadLockData, parseLockData, saveLockData } from './lockDataStore.js';
import { describeError } from './errors.js';
import { KeyboxError, messageFor, runCommand } from './runCommand.js';

const STEP_TEXT = {
  searching: 'Suche Box…',
  connecting: 'Verbinde…',
  sending: 'Sende Befehl…',
  done: 'Fertig…',
};

const DONE_TEXT = { open: 'Box geöffnet', close: 'Box geschlossen' };

export default function KeyboxScreen({ onHome }) {
  const [state, dispatch] = useReducer(keyboxReducer, initialState);
  const [lockData, setLockData] = useState(null);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [replacing, setReplacing] = useState(false);
  const mounted = useRef(true);
  const running = useRef(false);

  useEffect(() => {
    mounted.current = true;
    loadLockData().then((data) => {
      if (!mounted.current) return;
      setLockData(data);
      dispatch({ type: 'loaded', payload: data });
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  async function handleImport(e) {
    e.preventDefault();
    try {
      const lock = parseLockData(importText);
      await saveLockData(lock);
      if (!mounted.current) return;
      setLockData(lock);
      setImportError('');
      setImportText('');
      setReplacing(false);
      dispatch({ type: 'loaded', payload: lock });
    } catch (err) {
      if (mounted.current) setImportError(err.message);
    }
  }

  async function handleCommand(kind) {
    if (running.current || !lockData) return;
    running.current = true;
    dispatch({ type: 'start', payload: kind });
    try {
      await runCommand(kind, lockData, {
        onState: (s) => mounted.current && dispatch({ type: 'step', payload: s }),
      });
      if (mounted.current) dispatch({ type: 'succeeded' });
    } catch (err) {
      const reason = err instanceof KeyboxError ? err.reason : 'failed';
      const detail = err instanceof KeyboxError ? err.detail : describeError(err);
      if (mounted.current) dispatch({ type: 'failed', payload: messageFor(reason), detail });
    } finally {
      running.current = false;
    }
  }

  const busy = state.phase === 'busy';
  const hasData = state.phase !== 'loading' && state.phase !== 'no-data';
  const showImport = state.phase === 'no-data' || (hasData && replacing && !busy);

  return (
    <>
      <Header title="Keybox" onBack={busy ? undefined : onHome} />

      {showImport && (
        <form onSubmit={handleImport} className="flex animate-fade-up flex-col gap-3">
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Inhalt der lockData.json hier einfügen"
            className="field-sizing-content min-h-32 max-h-[40vh] w-full resize-none rounded-2xl bg-white/80 p-4 text-lg shadow-lg shadow-slate-900/5 ring-1 ring-slate-200 backdrop-blur placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-500 dark:bg-white/10 dark:ring-white/10 dark:placeholder:text-gray-500"
          />
          {importError && (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900">
              {importError}
            </p>
          )}
          <ActionButton type="submit" disabled={busy || !importText.trim()}>
            Speichern
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
              Abbrechen
            </ActionButton>
          )}
        </form>
      )}

      {hasData && (
        <div className="flex animate-fade-up flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <ActionButton type="button" disabled={busy} onClick={() => handleCommand('open')}>
              Öffnen
            </ActionButton>
            <ActionButton type="button" disabled={busy} onClick={() => handleCommand('close')}>
              Schließen
            </ActionButton>
          </div>

          <div aria-live="polite">
            {busy && <p className="text-center opacity-70">{STEP_TEXT[state.step] ?? 'Suche Box…'}</p>}
            {state.phase === 'done' && state.lastAction && (
              <p className="text-center font-semibold">{DONE_TEXT[state.lastAction]}</p>
            )}
            {state.phase === 'failed' && (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900">
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
              Lock-Daten ersetzen
            </ActionButton>
          )}
        </div>
      )}
    </>
  );
}
