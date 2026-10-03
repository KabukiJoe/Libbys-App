import { useState } from 'react';
import { sendMessage, storePassword, UnauthorizedError } from '../../api.js';
import ActionButton from '../../components/ActionButton.jsx';
import Bubble from '../../components/Bubble.jsx';
import Header, { IconButton } from '../../components/Header.jsx';
import TypingIndicator from '../../components/TypingIndicator.jsx';
import { addToHistory, loadHistory } from './history.js';
import HistoryList, { formatDate } from './HistoryList.jsx';

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

export default function PermissionScreen({ onHome, onLocked }) {
  const [text, setText] = useState('');
  // 'compose' | 'sending' | 'reply' | 'error' | 'history' | 'history-entry'
  const [phase, setPhase] = useState('compose');
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
        onLocked();
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

  // Back arrow: history views step back one level, everything else returns home.
  // Hidden while sending so the request isn't abandoned mid-way.
  let onBack = onHome;
  if (phase === 'history') onBack = () => setPhase('compose');
  if (phase === 'history-entry') onBack = () => setPhase('history');
  if (phase === 'sending') onBack = undefined;

  return (
    <>
      <Header title={phase.startsWith('history') ? 'History' : 'Permission'} onBack={onBack}>
        {(phase === 'compose' || phase === 'reply') && (
          <IconButton label="History" onClick={openHistory}>
            <HistoryIcon />
          </IconButton>
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
            Edit
          </ActionButton>
        )}
      </Header>

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
    </>
  );
}
