import { useState } from 'react';
import { getStoredPassword } from './api.js';
import MantraScreen from './features/mantra/MantraScreen.jsx';
import PermissionScreen from './features/permission/PermissionScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import PasswordScreen from './screens/PasswordScreen.jsx';
import Header from './components/Header.jsx';

// Tapping a mantra notification opens /?open=mantra.
function initialScreen() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('open') !== 'mantra') return 'home';
  window.history.replaceState(null, '', window.location.pathname);
  return 'mantra';
}

export default function App() {
  const [unlocked, setUnlocked] = useState(() => Boolean(getStoredPassword()));
  // 'home' | 'permission' | 'mantra'
  const [screen, setScreen] = useState(initialScreen);

  const goHome = () => setScreen('home');

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-violet-100 via-fuchsia-50 to-sky-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-gray-900 dark:from-gray-950 dark:via-violet-950 dark:to-gray-950 dark:text-gray-50">
      {!unlocked && (
        <>
          <Header title="Libby" />
          <PasswordScreen onUnlock={() => setUnlocked(true)} />
        </>
      )}

      {unlocked && screen === 'home' && <HomeScreen onOpen={setScreen} />}

      {unlocked && screen === 'permission' && (
        <PermissionScreen onHome={goHome} onLocked={() => setUnlocked(false)} />
      )}

      {unlocked && screen === 'mantra' && (
        <MantraScreen onHome={goHome} onLocked={() => setUnlocked(false)} />
      )}
    </div>
  );
}
