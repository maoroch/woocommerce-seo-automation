import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "SEO Proof Desk",
  description: "WooCommerce SEO operations — sync, review, ship.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex">
        <Sidebar />
        <main className="flex-1 min-h-screen">{children}</main>
      </body>
    </html>
  );
}
