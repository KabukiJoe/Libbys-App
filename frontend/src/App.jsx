import { useState } from 'react';
import { getStoredPassword, sendMessage, storePassword, UnauthorizedError } from './api.js';
import PasswordScreen from './PasswordScreen.jsx';
import ActionButton from './components/ActionButton.jsx';
import Bubble from './components/Bubble.jsx';
import TypingIndicator from './components/TypingIndicator.jsx';

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
    </svg>
  );
}

export default function App() {
  const [text, setText] = useState('');
  // 'locked' | 'compose' | 'sending' | 'reply' | 'error'
  const [phase, setPhase] = useState(() => (getStoredPassword() ? 'compose' : 'locked'));
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');

  const trimmed = text.trim();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!trimmed) return;

    setPhase('sending');
    try {
      const data = await sendMessage(trimmed);
      setReply(data.reply);
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

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-violet-100 via-fuchsia-50 to-sky-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-gray-900 dark:from-gray-950 dark:via-violet-950 dark:to-gray-950 dark:text-gray-50">
      <header className="mb-4 flex h-11 items-center justify-between">
        <h1 className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-2xl font-bold text-transparent dark:from-violet-400 dark:to-fuchsia-400">
          Libby
        </h1>

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

      {phase !== 'locked' && phase !== 'compose' && (
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
    </div>
  );
}
