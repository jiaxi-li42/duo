import type { BookStatus } from "@/lib/db";

// A short status line under the book, styled like the author caption. Only the
// three states worth surfacing; ready/review show nothing (implied by the shelf).
const LABEL: Partial<Record<BookStatus, string>> = {
  queued: "Queued",
  processing: "Processing",
  error: "Failed",
};

export function StatusCaption({ status }: { status: BookStatus }) {
  const label = LABEL[status];
  if (!label) return null;
  return (
    <span className="line-clamp-1 text-sm text-muted-foreground">{label}</span>
  );
}
