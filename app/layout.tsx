import type { Metadata } from "next";
import "./globals.css";
import NavigationClickSound from "./NavigationClickSound";

export const metadata: Metadata = {
  title: "Online AD Report",
  description: "Automated reporting dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        {children}
        <NavigationClickSound />
      </body>
    </html>
  );
}
