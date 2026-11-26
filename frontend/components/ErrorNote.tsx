import type { FriendlyError } from "@/lib/errors";

export function ErrorNote({ error, onDismiss }: { error: FriendlyError; onDismiss?: () => void }) {
  return (
    <div role="alert" className="note flex flex-col gap-1">
      <p className="font-semibold text-error">{error.title}</p>
      <p className="text-sm">{error.body}</p>
      <p className="break-all font-mono text-xs text-muted">{error.code}</p>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="mt-1 min-h-11 self-start font-semibold text-accent underline underline-offset-4 hover:text-accent-deep active:text-ink">
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
