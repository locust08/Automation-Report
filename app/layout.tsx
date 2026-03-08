import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Automation Reporting System",
  description:
    "Multi-page automated reporting dashboard connected to Meta Ads Manager and Google Ads Manager data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
