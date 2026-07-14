import { NextResponse } from "next/server";
import { setProgress } from "@/lib/db";

async function save(
  request: Request,
  ctx: RouteContext<"/api/books/[id]/progress">,
) {
  const { id } = await ctx.params;
  const { position, fraction, seconds } = await request.json();
  await setProgress(
    id,
    position != null ? String(position) : null,
    Number(fraction) || 0,
    Number(seconds) || 0,
  );
  return NextResponse.json({ ok: true });
}

// PUT for fetch callers; POST because navigator.sendBeacon (used on pagehide to
// flush the last reading position) can only send POST.
export const PUT = save;
export const POST = save;
