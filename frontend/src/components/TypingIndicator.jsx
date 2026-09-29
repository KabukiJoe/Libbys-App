import Bubble from './Bubble.jsx';

export default function TypingIndicator() {
  return (
    <Bubble from="kin">
      <span className="flex h-7 items-center gap-1.5" role="status" aria-label="Waiting for reply">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-2.5 w-2.5 animate-bounce rounded-full bg-violet-500"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    </Bubble>
  );
}
