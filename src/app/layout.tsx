import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Music from "@/components/music";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "流浪星球",
  description: "流浪星球，寻找属于你的星球",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Music></Music>
        {children}
      </body>
    </html>
  );
}
