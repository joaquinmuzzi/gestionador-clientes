import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar · Gestionador de Clientes" };

export default function LoginPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-accent text-white">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="size-5"
          >
            <circle cx="5" cy="6" r="2.5" />
            <circle cx="19" cy="6" r="2.5" />
            <circle cx="12" cy="18" r="2.5" />
            <path d="M7 7.5l3.5 8.5M17 7.5l-3.5 8.5M7.5 6h9" />
          </svg>
        </span>
        <h1 className="text-xl font-semibold text-neutral-900">Gestionador de Clientes</h1>
        <p className="mt-1 mb-6 text-sm text-neutral-600">
          Ingresá con tu email, tu contraseña y el código de tu app de autenticación.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
