import { useState } from 'react';
import { getStoredPassword, sendMessage, storePassword, UnauthorizedError } from './api.js';
import { addToHistory, loadHistory } from './history.js';
import PasswordScreen from './PasswordScreen.jsx';
import ActionButton from './components/ActionButton.jsx';
import Bubble from './components/Bubble.jsx';
import HistoryList, { formatDate } from './components/HistoryList.jsx';
import TypingIndicator from './components/TypingIndicator.jsx';

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

const conversationPhases = ['sending', 'reply', 'error'];

export default function App() {
  const [text, setText] = useState('');
  // 'locked' | 'compose' | 'sending' | 'reply' | 'error' | 'history' | 'history-entry'
  const [phase, setPhase] = useState(() => (getStoredPassword() ? 'compose' : 'locked'));
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState(loadHistory);
  const [selectedEntry, setSelectedEntry] = useState(null);

  const trimmed = text.trim();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!trimmed) return;

    setPhase('sending');
    try {
      const data = await sendMessage(trimmed);
      setReply(data.reply);
      setHistory(addToHistory(trimmed, data.reply));
      setPhase('reply');
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        storePassword('');
        setPhase('locked');
        return;
      }
      setError(err.message);
      setPhase('error');
    }
  }

  function reset({ keepText }) {
    if (!keepText) setText('');
    setReply('');
    setError('');
    setPhase('compose');
  }

  function openHistory() {
    // Coming from a finished reply, start fresh afterwards; from compose, keep the draft.
    if (phase === 'reply') reset({ keepText: false });
    setPhase('history');
  }

  function openEntry(entry) {
    setSelectedEntry(entry);
    setPhase('history-entry');
  }

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-violet-100 via-fuchsia-50 to-sky-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-gray-900 dark:from-gray-950 dark:via-violet-950 dark:to-gray-950 dark:text-gray-50">
      <header className="mb-4 flex h-11 items-center justify-between gap-2">
        <h1 className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-2xl font-bold text-transparent dark:from-violet-400 dark:to-fuchsia-400">
          {phase.startsWith('history') ? 'History' : 'Libby'}
        </h1>

        <div className="flex items-center gap-2">
          {(phase === 'compose' || phase === 'reply') && (
            <button
              type="button"
              onClick={openHistory}
              aria-label="History"
              className="flex h-11 w-11 items-center justify-center rounded-full text-violet-700 transition active:scale-95 active:bg-violet-200/60 dark:text-violet-300 dark:active:bg-white/10"
            >
              <HistoryIcon />
            </button>
          )}

          {phase === 'compose' && (
            <ActionButton type="submit" form="compose" disabled={!trimmed}>
              Send <SendIcon />
            </ActionButton>
          )}
          {phase === 'reply' && (
            <ActionButton type="button" onClick={() => reset({ keepText: false })}>
              New message
            </ActionButton>
          )}
          {phase === 'error' && (
            <ActionButton type="button" onClick={() => reset({ keepText: true })}>
              Back
            </ActionButton>
          )}
          {phase === 'history' && (
            <ActionButton type="button" onClick={() => setPhase('compose')}>
              Back
            </ActionButton>
          )}
          {phase === 'history-entry' && (
            <ActionButton type="button" onClick={() => setPhase('history')}>
              Back
            </ActionButton>
          )}
        </div>
      </header>

      {phase === 'locked' && <PasswordScreen onUnlock={() => setPhase('compose')} />}

      {phase === 'compose' && (
        <form id="compose" onSubmit={handleSubmit} className="animate-fade-up">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your message…"
            className="field-sizing-content min-h-32 max-h-[40vh] w-full resize-none rounded-2xl bg-white/80 p-4 text-lg shadow-lg shadow-violet-900/5 ring-1 ring-violet-200 backdrop-blur placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:bg-white/10 dark:ring-white/10 dark:placeholder:text-gray-500"
          />
        </form>
      )}

      {conversationPhases.includes(phase) && (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <Bubble from="me">{trimmed}</Bubble>

          {phase === 'sending' && <TypingIndicator />}

          {phase === 'reply' && (
            <Bubble from="kin">
              {reply || <span className="opacity-50">(No reply text received)</span>}
            </Bubble>
          )}

          {phase === 'error' && (
            <p className="animate-fade-up rounded-2xl bg-red-50 px-4 py-3 text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900">
              Failed: {error}
            </p>
          )}
        </div>
      )}

      {phase === 'history' && <HistoryList entries={history} onSelect={openEntry} />}

      {phase === 'history-entry' && selectedEntry && (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <p className="text-center text-xs opacity-50">{formatDate(selectedEntry.at)}</p>
          <Bubble from="me">{selectedEntry.message}</Bubble>
          <Bubble from="kin">
            {selectedEntry.reply || <span className="opacity-50">(No reply text received)</span>}
          </Bubble>
        </div>
      )}
    </div>
  );
}
