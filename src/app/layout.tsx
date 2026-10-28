import type { Metadata } from "next";
import { DM_Sans, Fraunces, Nunito_Sans } from "next/font/google";
import "./globals.css";

const serif = Fraunces({ subsets: ["latin"], variable: "--font-serif", display: "swap", axes: ["opsz"] });
const sans = Nunito_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });

export const metadata: Metadata = {
  title: "LifeWeaver",
  description: "Turn your photos and notes into a memory library and source-linked stories, written by Gemma 4.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${dmSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
