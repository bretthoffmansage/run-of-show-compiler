import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Run of Show Compiler | SAGE",
  description: "An internal event operations workspace for reviewable run-of-show compilation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
