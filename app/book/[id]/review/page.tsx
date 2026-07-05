import Link from "next/link";
import { notFound } from "next/navigation";
import { getBook, listPages, getPage } from "@/lib/db";
import Workspace from "./workspace";

export const dynamic = "force-dynamic";

export default async function ReviewPage(
  props: PageProps<"/book/[id]/review">,
) {
  const { id } = await props.params;
  const book = await getBook(id);
  if (!book) notFound();

  const pages = await listPages(book);
  const initialPage = await getPage(book, pages[0]?.idx ?? 0);

  return (
    <div>
      <div className="mb-6">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Bookshelf
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{book.title}</h1>
        <p className="text-sm text-zinc-500">
          Compare each page against its layout scan, fix any OCR mistakes, then
          approve.
        </p>
      </div>
      {pages.length === 0 ? (
        <p className="text-sm text-zinc-500">No content to review yet.</p>
      ) : (
        <Workspace
          id={book.id}
          total={pages.length}
          initialPage={initialPage}
          hasImages={pages.some((p) => p.hasImage)}
        />
      )}
    </div>
  );
}
