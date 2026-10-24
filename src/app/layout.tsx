import type { Metadata } from "next";
import { Source_Code_Pro, Source_Sans_3 } from "next/font/google";
import "./globals.css";

// Self-hosted by Next.js at build time: the browser never asks Google.
const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-source-sans",
});
const sourceCode = Source_Code_Pro({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-source-code",
});

export const metadata: Metadata = {
  title: "Gestionador de Clientes",
  description: "Documentación de la infraestructura de cada cliente, como un mapa.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`h-full antialiased ${sourceSans.variable} ${sourceCode.variable}`}
    >
      <body className="flex min-h-full flex-col bg-chrome font-sans text-[13.5px] text-neutral-900">
        {children}
      </body>
    </html>
  );
}
