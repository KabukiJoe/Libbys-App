import Header from '../components/Header.jsx';

// Features shown on the home screen. `ready: false` shows the tile as "Coming soon".
const FEATURES = [
  { id: 'permission', title: 'Permission', emoji: '🙋', ready: true },
  { id: 'mantra', title: 'Mantra', emoji: '🧘', ready: true },
];

export default function HomeScreen({ onOpen }) {
  return (
    <>
      <Header title="Libby" />
      <div className="grid animate-fade-up grid-cols-2 gap-3">
        {FEATURES.map((feature) => (
          <button
            key={feature.id}
            type="button"
            disabled={!feature.ready}
            onClick={() => onOpen(feature.id)}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-3xl bg-white/80 p-4 shadow-lg shadow-violet-900/5 ring-1 ring-violet-200 backdrop-blur transition active:scale-95 disabled:opacity-50 disabled:active:scale-100 dark:bg-white/10 dark:ring-white/10"
          >
            <span className="text-5xl" aria-hidden="true">
              {feature.emoji}
            </span>
            <span className="text-lg font-semibold">{feature.title}</span>
            {!feature.ready && <span className="text-xs opacity-70">Coming soon</span>}
          </button>
        ))}
      </div>
    </>
  );
}
