export const formatDate = (ms) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function HistoryList({ entries, onSelect }) {
  if (entries.length === 0) {
    return <p className="animate-fade-up text-center opacity-60">No messages yet.</p>;
  }

  return (
    <ul className="flex flex-1 animate-fade-up flex-col gap-2 overflow-y-auto">
      {entries.map((entry) => (
        <li key={entry.id}>
          <button
            type="button"
            onClick={() => onSelect(entry)}
            className="w-full rounded-2xl bg-white/80 px-4 py-3 text-left shadow-sm ring-1 ring-violet-200 backdrop-blur transition active:scale-[0.98] dark:bg-white/10 dark:ring-white/10"
          >
            <span className="block text-xs opacity-50">{formatDate(entry.at)}</span>
            <span className="block truncate font-semibold">{entry.message}</span>
            <span className="block truncate text-sm opacity-70">{entry.reply}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
