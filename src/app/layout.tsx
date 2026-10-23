import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

// Self-hosted by Next.js at build time: the browser never asks Google.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
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
      className={`h-full antialiased ${plexSans.variable} ${plexMono.variable}`}
    >
      <body className="flex min-h-full flex-col bg-neutral-50 font-sans text-neutral-900">
        {children}
      </body>
    </html>
  );
}
