import "./globals.css";
import type { ReactNode } from "react";
import { SessionProvider } from "zenyauth/next";
import { Unbounded, Space_Mono } from "next/font/google";

const unbounded = Unbounded({
  subsets: ["latin"],
  weight: ["900"],
  variable: "--font-unbounded"
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono"
});

export const metadata = {
  title: "ZenyAuth Demo",
  description: "Demo app for the ZenyAuth Next.js auth library"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${unbounded.variable} ${spaceMono.variable}`}>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
