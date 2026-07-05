// Kick off the Modal batch converter for a book. Fire-and-forget: Modal updates
// the book's status/progress/content directly in the DB as it works.
export async function triggerConvert(bookId: string, pdfUrl: string): Promise<void> {
  const url = process.env.MODAL_CONVERT_URL;
  if (!url) {
    console.warn("MODAL_CONVERT_URL not set — book left as 'queued'.");
    return;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book_id: bookId, pdf_url: pdfUrl }),
    });
  } catch (err) {
    console.error("Modal convert trigger failed:", err);
  }
}

// Kick off the Modal bilingual-merge job. Same fire-and-forget pattern as convert:
// Modal interleaves the ZH book under the EN book and writes pages/status to the DB.
export async function triggerCombine(
  bookId: string,
  enBookId: string,
  zhBookId: string,
): Promise<void> {
  const url = process.env.MODAL_COMBINE_URL;
  if (!url) {
    console.warn("MODAL_COMBINE_URL not set — book left as 'queued'.");
    return;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book_id: bookId, en_book_id: enBookId, zh_book_id: zhBookId }),
    });
  } catch (err) {
    console.error("Modal combine trigger failed:", err);
  }
}

// Kick off the Modal document converter (EPUB/DOCX/HTML/MOBI/AZW3 -> markdown).
// Same fire-and-forget pattern as triggerConvert.
export async function triggerDocConvert(
  bookId: string,
  sourceUrl: string,
  ext: string,
): Promise<void> {
  const url = process.env.MODAL_DOCCONVERT_URL;
  if (!url) {
    console.warn("MODAL_DOCCONVERT_URL not set — book left as 'queued'.");
    return;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book_id: bookId, source_url: sourceUrl, ext }),
    });
  } catch (err) {
    console.error("Modal doc-convert trigger failed:", err);
  }
}
