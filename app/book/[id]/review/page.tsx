import Link from "next/link";
import { notFound } from "next/navigation";
import { getBook } from "@/lib/db";
import Editor from "./editor";

export const dynamic = "force-dynamic";

export default async function ReviewPage(
  props: PageProps<"/book/[id]/review">,
) {
  const { id } = await props.params;
  const book = await getBook(id);
  if (!book) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Bookshelf
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{book.title}</h1>
        <p className="text-sm text-zinc-500">
          Review the converted text, fix any OCR mistakes, then approve.
        </p>
      </div>
      <Editor id={book.id} initial={book.content ?? ""} />
    </div>
  );
}
