import { NextResponse } from "next/server";
import { getBook, createBook, updateBook } from "@/lib/db";
import { triggerCombine } from "@/lib/convert";

// Create a new bilingual book from a ready EN book + ready ZH book, then kick off
// the Modal merge job (which fills pages/status in the DB as it aligns chapters).
export async function POST(request: Request) {
  const { enId, zhId, title, coverUrl } = await request.json();
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
  const name =
    (typeof title === "string" && title.trim()) || `${en.title} (Bilingual)`;
  await createBook({ id, title: name, author: en.author });
  // Custom cover (a small data URI, like Modal-generated ones); the merge job
  // only fills cover_url when it's still NULL, so this one sticks.
  if (
    typeof coverUrl === "string" &&
    coverUrl.startsWith("data:image/") &&
    coverUrl.length < 500_000
  ) {
    await updateBook(id, { cover_url: coverUrl });
  }
  // Same guard as /api/books: don't strand the new row in "queued" forever.
  try {
    await triggerCombine(id, enId, zhId);
  } catch {
    await updateBook(id, {
      status: "error",
      error: "Merge never started — the converter couldn't be reached.",
    });
    return NextResponse.json(
      { error: "merge failed to start — the book is marked as failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({ id });
}
