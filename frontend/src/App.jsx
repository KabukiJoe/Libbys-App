import { useEffect, useState } from 'react';
import { getStoredPassword } from './api.js';
import MantraBanner from './features/mantra/MantraBanner.jsx';
import MantraScreen from './features/mantra/MantraScreen.jsx';
import { initPush, syncPush } from './features/mantra/push.js';
import PermissionScreen from './features/permission/PermissionScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import PasswordScreen from './screens/PasswordScreen.jsx';
import Header from './components/Header.jsx';

export default function App() {
  const [unlocked, setUnlocked] = useState(() => Boolean(getStoredPassword()));
  // 'home' | 'permission' | 'mantra'
  const [screen, setScreen] = useState('home');
  const [banner, setBanner] = useState(false); // a mantra arrived while the app was open

  // Registered at startup so tapping a notification that cold-starts the app still lands on the mantra.
  useEffect(() => {
    initPush({
      onOpenMantra: () => {
        setBanner(false);
        setScreen('mantra');
      },
      onMantraReceived: () => setBanner(true),
    });
  }, []);

  useEffect(() => {
    if (unlocked) syncPush().catch((err) => console.error('Push sync failed:', err));
  }, [unlocked]);

  const goHome = () => setScreen('home');

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-violet-100 via-fuchsia-50 to-sky-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-gray-900 dark:from-gray-950 dark:via-violet-950 dark:to-gray-950 dark:text-gray-50">
      {!unlocked && (
        <>
          <Header title="Libby" />
          <PasswordScreen onUnlock={() => setUnlocked(true)} />
        </>
      )}

      {unlocked && banner && screen !== 'mantra' && (
        <MantraBanner
          onOpen={() => {
            setBanner(false);
            setScreen('mantra');
          }}
          onDismiss={() => setBanner(false)}
        />
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
