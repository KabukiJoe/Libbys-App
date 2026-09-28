import { useState } from 'react';
import { sendMessage } from './api.js';

export default function App() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);

  const trimmed = text.trim();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!trimmed || sending) return;

    setSending(true);
    setStatus('Sending…');
    try {
      await sendMessage(trimmed);
      setText('');
      setStatus('Sent');
    } catch (err) {
      setStatus(`Failed: ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-gray-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-gray-900 dark:bg-gray-900 dark:text-gray-50">
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
          disabled={!trimmed || sending}
          className="h-14 rounded-xl bg-blue-600 text-lg font-semibold text-white disabled:opacity-50"
        >
          Send
        </button>
        <p className="m-0 min-h-[1.2em] text-center text-sm opacity-70">{status}</p>
      </form>
    </div>
  );
}
