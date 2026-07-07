import { NextResponse } from "next/server";
import { setProgress } from "@/lib/db";

async function save(
  request: Request,
  ctx: RouteContext<"/api/books/[id]/progress">,
) {
  const { id } = await ctx.params;
  const { position } = await request.json();
  await setProgress(id, String(position));
  return NextResponse.json({ ok: true });
}

// PUT for fetch callers; POST because navigator.sendBeacon (used on pagehide to
// flush the last reading position) can only send POST.
export const PUT = save;
export const POST = save;
