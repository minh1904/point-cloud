import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Exposes --font-inter, which @atelier/tokens maps to font-sans.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Point Cloud",
  description: "Turn a photo into a living particle field.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Browser extensions inject attributes into <html>/<body> before hydration;
    // suppressHydrationWarning only ignores attribute diffs on these two elements.
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
