import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar · Gestionador de Clientes" };

export default function LoginPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-900">Gestionador de Clientes</h1>
        <p className="mt-1 mb-6 text-sm text-neutral-600">
          Ingresá con tu email, tu contraseña y el código de tu app de autenticación.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
