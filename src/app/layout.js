import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Soul's Checker",
  description: "Word checker and Shared list",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      {/* suppressHydrationWarning prevents React complaining if client-side extensions mutate attributes */}
      <body suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
