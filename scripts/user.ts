// User management from the terminal. There's no sign-up page on purpose.
//
//   npm run user:create -- <email>        create the user and enroll 2FA
//   npm run user:reset-2fa -- <email>     new 2FA key (lost phone)
//   npm run user:set-password -- <email>  new password
//
// In Docker: docker compose run --rm migrate npm run user:create -- <email>

import "./load-env";
import { createInterface } from "node:readline/promises";
import { encodeBase32NoPadding } from "@oslojs/encoding";
import QRCode from "qrcode";
import { z } from "zod";
import { generateTotpKey, totpKeyUri, verifyTotp } from "@/lib/auth/totp";
import {
  createUser,
  normalizeEmail,
  replacePassword,
  replaceTotpKey,
} from "@/lib/auth/users";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { db } from "@/lib/db";

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

// Reads a line without echoing it (passwords). Needs an interactive terminal.
function askHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return Promise.reject(new Error("Corré este comando en una terminal interactiva."));
  }
  process.stdout.write(question);
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (done: () => void) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
      done();
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") return finish(() => resolve(value));
        if (char === "\u0003") return finish(() => reject(new Error("Cancelado.")));
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function askNewPassword(): Promise<string> {
  const password = await askHidden(`Contraseña (mínimo ${MIN_PASSWORD_LENGTH} caracteres): `);
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if ((await askHidden("Repetila: ")) !== password) {
    throw new Error("Las contraseñas no coinciden.");
  }
  return password;
}

// Shows the QR and asks for a code, so the key is only saved once the
// authenticator app is known to work. Returns the key and the code's step.
async function enrollTotp(email: string): Promise<{ key: Uint8Array; step: number }> {
  const key = generateTotpKey();
  const uri = totpKeyUri(email, key);
  console.log("\nEscaneá este QR con tu app de autenticación (Google Authenticator, Aegis, 1Password…):\n");
  console.log(await QRCode.toString(uri, { type: "terminal", small: true }));
  console.log(`Si no podés escanearlo, cargá esta clave a mano: ${encodeBase32NoPadding(key)}\n`);

  const code = (await ask("Código de 6 dígitos que muestra la app: ")).replace(/\s/g, "");
  const step = verifyTotp(key, code, null);
  if (step === null) {
    throw new Error("El código no coincide. No se guardó nada; probá de nuevo.");
  }
  return { key, step };
}

async function findUser(email: string) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No existe un usuario con el email ${email}.`);
  return user;
}

async function main() {
  const [command, rawEmail] = process.argv.slice(2);
  if (!command || !rawEmail) {
    throw new Error("Uso: npm run user:create|user:reset-2fa|user:set-password -- <email>");
  }
  const email = normalizeEmail(rawEmail);
  if (!z.email().safeParse(email).success) throw new Error(`Email inválido: ${email}`);

  switch (command) {
    case "create": {
      if (await db.user.findUnique({ where: { email } })) {
        throw new Error(`Ya existe un usuario con el email ${email}.`);
      }
      const password = await askNewPassword();
      const { key, step } = await enrollTotp(email);
      await createUser({ email, password, totpKey: key, totpLastUsedStep: step });
      console.log(`Listo: usuario ${email} creado con 2FA.`);
      break;
    }
    case "reset-2fa": {
      const user = await findUser(email);
      const { key, step } = await enrollTotp(email);
      await replaceTotpKey(user.id, key, step);
      console.log("Listo: 2FA nuevo guardado. Se cerraron todas las sesiones abiertas.");
      break;
    }
    case "set-password": {
      const user = await findUser(email);
      await replacePassword(user.id, await askNewPassword());
      console.log("Listo: contraseña cambiada. Se cerraron todas las sesiones abiertas.");
      break;
    }
    default:
      throw new Error(`Comando desconocido: ${command}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
