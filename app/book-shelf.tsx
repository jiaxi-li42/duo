import type { ReactNode } from "react";

// A titled shelf row: heading, then a responsive grid capped at 6-up.
// The children are the tiles — this only owns the header and grid layout.
export function BookShelf({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-2xl">{title}</h2>
      {/* Max 6 per row; steps down on narrower viewports. */}
      <div className="mt-8 grid grid-cols-2 justify-items-center gap-8 pb-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {children}
      </div>
    </section>
  );
}
