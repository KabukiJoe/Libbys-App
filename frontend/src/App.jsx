import { useState } from 'react';
import { sendMessage } from './api.js';

export default function App() {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState('compose'); // 'compose' | 'sending' | 'reply' | 'error'
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
    <div className="flex h-full flex-col bg-gray-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-gray-900 dark:bg-gray-900 dark:text-gray-50">
      {phase === 'compose' && (
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-3">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your message…"
            className="w-full flex-1 resize-none rounded-xl border border-gray-300 bg-white p-3.5 text-lg focus:outline-2 focus:outline-blue-600 dark:border-gray-700 dark:bg-gray-800"
          />
          <button
            type="submit"
            disabled={!trimmed}
            className="h-14 rounded-xl bg-blue-600 text-lg font-semibold text-white disabled:opacity-50"
          >
            Send
          </button>
        </form>
      )}

      {phase === 'sending' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4" role="status">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-lg opacity-70">Sending…</p>
        </div>
      )}

      {phase === 'reply' && (
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl border border-gray-300 bg-white p-3.5 text-lg dark:border-gray-700 dark:bg-gray-800">
            {reply}
          </div>
          <button
            type="button"
            onClick={() => reset({ keepText: false })}
            className="h-14 rounded-xl bg-blue-600 text-lg font-semibold text-white"
          >
            New message
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-lg text-red-600 dark:text-red-400">Failed: {error}</p>
          <button
            type="button"
            onClick={() => reset({ keepText: true })}
            className="h-14 w-full rounded-xl bg-blue-600 text-lg font-semibold text-white"
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}
