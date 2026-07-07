import { notFound } from "next/navigation";
import Link from "next/link";
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/"
          className="text-sm text-primary underline underline-offset-4"
        >
          ← Bookshelf
        </Link>
        <h2 className="text-2xl font-semibold">{book.title}</h2>
        <p className="text-muted-foreground">
          Compare each page against its layout scan, fix any OCR mistakes, then
          approve.
        </p>
      </div>
      {pages.length === 0 ? (
        <p className="text-muted-foreground">No content to review yet.</p>
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
