// The pill button in the header (Send / New message / Back).
export default function ActionButton({ children, ...props }) {
  return (
    <button
      {...props}
      className="flex h-11 items-center gap-2 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 px-5 font-semibold text-white shadow-lg shadow-violet-600/30 transition active:scale-95 disabled:opacity-40 disabled:shadow-none"
    >
      {children}
    </button>
  );
}
