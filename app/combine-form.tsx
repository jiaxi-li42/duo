"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { id: string; title: string };

// Pick an EN book + its ZH counterpart and merge them into one bilingual book.
export default function CombineForm({ books }: { books: Option[] }) {
  const router = useRouter();
  const [en, setEn] = useState("");
  const [zh, setZh] = useState("");
  const [open, setOpen] = useState(false);
  const invalid = !en || !zh || en === zh;

  async function submit() {
    if (invalid) return;
    await fetch("/api/books/combine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enId: en, zhId: zh }),
    });
    setOpen(false);
    setEn("");
    setZh("");
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Combine bilingual
      </Button>
    );
  }

  const pick = (
    value: string,
    onValueChange: (v: string) => void,
    placeholder: string,
  ) => (
    <Select value={value} onValueChange={(v) => onValueChange(v ?? "")}>
      <SelectTrigger className="w-44">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {books.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Card className="flex-row flex-wrap items-center gap-2 p-3">
      {pick(en, setEn, "English book…")}
      {pick(zh, setZh, "中文书…")}
      <Button disabled={invalid} onClick={submit}>
        Combine
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </Card>
  );
}
