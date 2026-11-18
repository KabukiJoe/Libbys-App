import ActionButton from '../../components/ActionButton.jsx';

export default function MantraBanner({ onOpen, onDismiss }) {
  return (
    <div className="mb-4 flex animate-fade-up items-center gap-3 rounded-2xl bg-white/80 p-3 pl-4 shadow-lg shadow-slate-900/5 ring-1 ring-slate-200 backdrop-blur dark:bg-white/10 dark:ring-white/10">
      <p className="flex-1 font-semibold">🧘 New mantra</p>
      <ActionButton type="button" onClick={onOpen}>
        Open
      </ActionButton>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="px-2 text-2xl leading-none opacity-60">
        ×
      </button>
    </div>
  );
}
