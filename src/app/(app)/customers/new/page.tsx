import type { Metadata } from "next";
import { createCustomer } from "../actions";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "Nuevo cliente · Gestionador de Clientes" };

// No data to read: the Server Action checks the session when the form is sent.
export default function NewCustomerPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-lg font-semibold">Nuevo cliente</h1>
      <CustomerForm action={createCustomer} submitLabel="Crear cliente" cancelHref="/" />
    </div>
  );
}
