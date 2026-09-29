// A chat bubble. `from="me"` sits on the right, `from="kin"` on the left.
export default function Bubble({ from, children }) {
  const mine = from === 'me';
  return (
    <div className={`flex animate-fade-up ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-lg shadow-sm ${
          mine
            ? 'rounded-br-md bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white'
            : 'rounded-bl-md bg-white/80 text-gray-900 backdrop-blur dark:bg-white/10 dark:text-gray-50'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
