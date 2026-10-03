function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

// Round, borderless icon button used in the header.
export function IconButton({ label, children, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      {...props}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-violet-700 transition active:scale-95 active:bg-violet-200/60 dark:text-violet-300 dark:active:bg-white/10"
    >
      {children}
    </button>
  );
}

// Top bar: optional back arrow, title, and actions on the right.
export default function Header({ title, onBack, children }) {
  return (
    <header className="mb-4 flex h-11 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1">
        {onBack && (
          <IconButton label="Back" onClick={onBack}>
            <BackIcon />
          </IconButton>
        )}
        <h1 className="truncate bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-2xl font-bold text-transparent dark:from-violet-400 dark:to-fuchsia-400">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}
