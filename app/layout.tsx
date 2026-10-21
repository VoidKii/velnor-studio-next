import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Velnor Studio — Make your next video matter",
  description: "A quieter, more thoughtful workspace for independent video creators.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
