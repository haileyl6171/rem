import type { Metadata } from "next";
import { Geist, Playfair_Display } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "rem",
  description: "transform moments into 3d gaussian splat memories",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} ${playfair.variable} h-full`}>
      <body suppressHydrationWarning className="h-full bg-[#EEF2F6] text-[#2A323B] antialiased">
        {children}
      </body>
    </html>
  );
}
