import { useState } from 'react';
import { checkPassword, storePassword, UnauthorizedError } from '../api.js';

export default function PasswordScreen({ onUnlock }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password || checking) return;

    setChecking(true);
    setError('');
    try {
      await checkPassword(password);
      storePassword(password);
      onUnlock();
    } catch (err) {
      setError(err instanceof UnauthorizedError ? 'Wrong password' : `Failed: ${err.message}`);
    } finally {
      setChecking(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex animate-fade-up flex-col gap-3">
      <input
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="h-14 w-full rounded-2xl bg-white/80 px-4 text-lg shadow-lg shadow-violet-900/5 ring-1 ring-violet-200 backdrop-blur focus:outline-none focus:ring-2 focus:ring-violet-500 dark:bg-white/10 dark:ring-white/10"
      />
      <button
        type="submit"
        disabled={!password || checking}
        className="h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-lg font-semibold text-white shadow-lg shadow-violet-600/30 transition active:scale-95 disabled:opacity-40 disabled:shadow-none"
      >
        {checking ? 'Checking…' : 'Unlock'}
      </button>
      <p className="m-0 min-h-[1.2em] text-center text-sm text-red-600 dark:text-red-400">{error}</p>
    </form>
  );
}
