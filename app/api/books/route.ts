import { NextResponse } from "next/server";
import { createBook } from "@/lib/db";

// Create a book row, then kick off the Modal batch converter (which updates
// status/progress/content directly in the DB as it works).
export async function POST(request: Request) {
  const { title, author, pdfUrl } = await request.json();
  if (!title || !pdfUrl) {
    return NextResponse.json(
      { error: "title and pdfUrl are required" },
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  await createBook({ id, title, author: author || null, source_pdf_url: pdfUrl });

  const convertUrl = process.env.MODAL_CONVERT_URL;
  if (convertUrl) {
    try {
      await fetch(convertUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book_id: id, pdf_url: pdfUrl }),
      });
    } catch (err) {
      console.error("Modal convert trigger failed:", err);
    }
  } else {
    console.warn("MODAL_CONVERT_URL not set — book left as 'queued'.");
  }

  return NextResponse.json({ id });
}
