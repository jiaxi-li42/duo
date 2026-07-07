import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Button } from "@/components/ui/button";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Duo",
  description: "Turn scanned PDF books into readable digital ones.",
};

// ponytail: follow the OS colour scheme by toggling shadcn's `.dark` class from
// matchMedia — no theme-toggle UI or next-themes dep, since the app has always
// just tracked the system setting. Inlined so it runs before paint (no flash);
// suppressHydrationWarning on <html> covers the class it adds.
const darkModeScript = `(function(){try{var m=matchMedia('(prefers-color-scheme: dark)');var a=function(){document.documentElement.classList.toggle('dark',m.matches)};a();m.addEventListener('change',a)}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col">
        <script dangerouslySetInnerHTML={{ __html: darkModeScript }} />
        <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/80 px-6 py-3 backdrop-blur">
          <Link href="/" className="text-lg font-semibold">
            📚 Duo
          </Link>
          <Button nativeButton={false} render={<Link href="/upload">Upload PDF</Link>} />
        </header>
        <main className="min-h-0 flex-1 overflow-auto p-6">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </body>
    </html>
  );
}
