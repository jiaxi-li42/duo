import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";
import { ThemeToggle } from "@/app/theme-toggle";
import { ScrollArea } from "@/app/scroll-area";
import { Toaster } from "@/components/ui/sonner";

// Söhne — the app's sans (UI) face. German weight names map to CSS weights.
const sohne = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    { path: "./fonts/test-soehne-buch.woff2", weight: "400", style: "normal" },
    { path: "./fonts/test-soehne-buch-kursiv.woff2", weight: "400", style: "italic" },
    { path: "./fonts/test-soehne-kraftig.woff2", weight: "500", style: "normal" },
    { path: "./fonts/test-soehne-kraftig-kursiv.woff2", weight: "500", style: "italic" },
    { path: "./fonts/test-soehne-halbfett.woff2", weight: "600", style: "normal" },
    { path: "./fonts/test-soehne-halbfett-kursiv.woff2", weight: "600", style: "italic" },
    { path: "./fonts/test-soehne-dreiviertelfett.woff2", weight: "700", style: "normal" },
    { path: "./fonts/test-soehne-dreiviertelfett-kursiv.woff2", weight: "700", style: "italic" },
  ],
});

// Louize — the serif face (font-serif utility; the reader loads its own copies
// from /public/fonts). preload:false — it's not the body font, so don't force
// it onto every page.
const louize = localFont({
  variable: "--font-serif",
  display: "swap",
  preload: false,
  src: [
    { path: "./fonts/LouizeTrial-Regular.otf", weight: "400", style: "normal" },
    { path: "./fonts/LouizeTrial-Italic.otf", weight: "400", style: "italic" },
    { path: "./fonts/LouizeTrial-Medium.otf", weight: "500", style: "normal" },
    { path: "./fonts/LouizeTrial-MediumItalic.otf", weight: "500", style: "italic" },
    { path: "./fonts/LouizeTrial-Bold.otf", weight: "700", style: "normal" },
    { path: "./fonts/LouizeTrial-BoldItalic.otf", weight: "700", style: "italic" },
  ],
});

export const metadata: Metadata = {
  title: "Duo",
  description: "Turn scanned PDF books into readable digital ones.",
};

// Apply the saved theme before paint (no flash), falling back to the OS setting
// when the user hasn't chosen one. ThemeToggle writes localStorage.theme.
// suppressHydrationWarning on <html> covers the class this adds.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sohne.variable} ${louize.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Full-width bar + backdrop; inner row capped to the same max-w-7xl
            column as the page content so Duo/toggle align with it. The overlay
            scrollbar takes no layout space, so no gutter juggling needed. */}
        <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-serif text-2xl">
              Duo
            </Link>
            <nav className="flex items-center gap-4">
              <Link
                href="/about"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                about
              </Link>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <ScrollArea className="min-h-0 flex-1">
          {/* min-h-full keeps the footer pinned to the bottom on short pages. */}
          <div className="flex min-h-full flex-col py-4">
            <div className="mx-auto w-full max-w-7xl flex-1 px-4">{children}</div>
            {/* Hairline inset from the viewport edges instead of full-bleed. */}
            <div className="mx-4 border-t" />
            {/* Placeholder links for now (x.com / instagram.com / jess.email). */}
            <footer className="mx-auto w-full max-w-7xl px-4 py-8 text-sm text-muted-foreground">
              Made by Jess with love. You can find me on{" "}
              <a
                href="https://x.com"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                X/Twitter
              </a>
              ,{" "}
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Instagram
              </a>{" "}
              or reach me via{" "}
              <a
                href="mailto:contact@jess.email"
                className="underline underline-offset-4 hover:text-foreground"
              >
                contact@jess.email
              </a>
            </footer>
          </div>
        </ScrollArea>
        <Toaster />
      </body>
    </html>
  );
}
