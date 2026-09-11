import { useEffect, useState } from 'react';
import { Bug, Clock, Type } from 'lucide-react';
import { toPlainText, useBibliography } from '@/citation';
import { useCitations } from '@/state';

/**
 * The line along the bottom: how much bibliography there is, and roughly what
 * it saved.
 *
 * The time figure is an estimate and is labelled as one. Formatting a
 * reference by hand from a style manual is a few minutes of work; three is a
 * conservative number for it, and multiplying is honest as long as nobody is
 * told it was measured.
 */
const MINUTES_SAVED_PER_REFERENCE = 3;

export function StatusBar() {
  const citations = useCitations();
  const bibliography = useBibliography();

  const words = (bibliography.result?.entries ?? [])
    .map(toPlainText)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;

  return (
    <footer className="flex items-center gap-4 border-t border-border px-4 py-1.5 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5" title="Words in the formatted bibliography">
        <Type className="h-3 w-3" />
        <span className="tabular-nums">{words}</span> {words === 1 ? 'word' : 'words'}
      </span>

      <span
        className="flex items-center gap-1.5"
        title={`An estimate: about ${MINUTES_SAVED_PER_REFERENCE} minutes per reference formatted by hand`}
      >
        <Clock className="h-3 w-3" />
        <span className="tabular-nums">
          {formatDuration(citations.length * MINUTES_SAVED_PER_REFERENCE * 60)}
        </span>{' '}
        saved
      </span>

      <SessionClock />

      <a
        href="https://github.com/KianDaga/OpenCite/issues/new"
        target="_blank"
        rel="noreferrer noopener"
        title="Report a problem"
        className="ml-auto rounded p-1 hover:bg-accent hover:text-foreground"
      >
        <Bug className="h-3.5 w-3.5" />
        <span className="sr-only">Report a problem</span>
      </a>
    </footer>
  );
}

/** Everything is written to disk as it changes, so "saved" is always now. */
function SessionClock() {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="hidden sm:inline" title="Your library is stored in this browser">
      Saved locally
    </span>
  );
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
