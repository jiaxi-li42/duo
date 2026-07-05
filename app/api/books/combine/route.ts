import { NextResponse } from "next/server";
import { getBook, createBook } from "@/lib/db";
import { triggerCombine } from "@/lib/convert";

// Create a new bilingual book from a ready EN book + ready ZH book, then kick off
// the Modal merge job (which fills pages/status in the DB as it aligns chapters).
export async function POST(request: Request) {
  const { enId, zhId } = await request.json();
  if (!enId || !zhId || enId === zhId) {
    return NextResponse.json(
      { error: "two different book ids (enId, zhId) are required" },
      { status: 400 },
    );
  }

  const [en, zh] = await Promise.all([getBook(enId), getBook(zhId)]);
  if (!en || !zh) {
    return NextResponse.json({ error: "source book not found" }, { status: 404 });
  }
  if (en.status !== "ready" || zh.status !== "ready") {
    return NextResponse.json(
      { error: "both source books must be ready" },
      { status: 409 },
    );
  }

  const id = crypto.randomUUID();
  await createBook({ id, title: `${en.title} (中英对照)`, author: en.author });
  await triggerCombine(id, enId, zhId);

  return NextResponse.json({ id });
}
