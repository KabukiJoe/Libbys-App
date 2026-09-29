import { useState } from 'react';
import { checkPassword, storePassword, UnauthorizedError } from './api.js';

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
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col justify-center gap-3">
      <input
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="h-14 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-lg focus:outline-2 focus:outline-blue-600 dark:border-gray-700 dark:bg-gray-800"
      />
      <button
        type="submit"
        disabled={!password || checking}
        className="h-14 rounded-xl bg-blue-600 text-lg font-semibold text-white disabled:opacity-50"
      >
        {checking ? 'Checking…' : 'Unlock'}
      </button>
      <p className="m-0 min-h-[1.2em] text-center text-sm text-red-600 dark:text-red-400">{error}</p>
    </form>
  );
}
