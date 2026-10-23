import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestionador de Clientes",
  description: "Documentación de la infraestructura de cada cliente, como un mapa.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}
