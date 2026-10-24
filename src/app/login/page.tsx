import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar · Gestionador de Clientes" };

export default function LoginPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-sm border border-neutral-300 bg-white p-8 shadow-sm">
        <span className="mb-4 flex size-10 items-center justify-center rounded-sm bg-accent text-white">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            aria-hidden="true"
            className="size-5"
          >
            <rect x="3" y="3" width="6" height="5" />
            <rect x="15" y="3" width="6" height="5" />
            <rect x="9" y="16" width="6" height="5" />
            <path d="M6 8v4h12V8M12 12v4" />
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
