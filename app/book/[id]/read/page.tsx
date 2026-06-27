import Link from "next/link";
import { notFound } from "next/navigation";
import { getBook, getProgress } from "@/lib/db";
import Reader from "./reader";

export const dynamic = "force-dynamic";

export default async function ReadPage(props: PageProps<"/book/[id]/read">) {
  const { id } = await props.params;
  const book = await getBook(id);
  if (!book) notFound();

  const position = Number((await getProgress(id)) ?? 0);

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:underline">
            ← Bookshelf
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{book.title}</h1>
          {book.author && (
            <p className="text-sm text-zinc-500">{book.author}</p>
          )}
        </div>
        <Link
          href={`/book/${id}/review`}
          className="text-sm text-zinc-500 hover:underline"
        >
          Edit
        </Link>
      </div>
      <Reader
        id={book.id}
        content={book.content ?? "*No content.*"}
        initialPosition={position}
      />
    </div>
  );
}
