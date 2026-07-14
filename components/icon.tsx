import { cn } from "@/lib/utils";

// A Material Symbols (Rounded) glyph. `name` is the ligature (e.g. "delete",
// "dark_mode"); size follows the current font-size — pass a text-* class to set it.
// Lives outside app/ because app/icon.tsx is a reserved Next favicon route.
export function Icon({
  name,
  fill,
  className,
}: {
  name: string;
  /** Use the filled variant (FILL axis). */
  fill?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("material-symbols-rounded", fill && "fill", className)}
    >
      {name}
    </span>
  );
}
