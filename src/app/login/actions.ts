"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyCredentials } from "@/lib/auth/login";
import { clientIp, isLoginRateLimited, recordLoginAttempt } from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth/session";

export type LoginState = { error?: string; email?: string };

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(1).max(256),
  // Authenticator apps sometimes show the code as "123 456".
  code: z
    .string()
    .transform((value) => value.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/)),
});

const INVALID_CREDENTIALS = "Email, contraseña o código incorrectos.";
const RATE_LIMITED = "Demasiados intentos fallidos. Esperá 15 minutos y probá de nuevo.";
const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = String(formData.get("email") ?? "").slice(0, 254);
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    return { error: "Completá email, contraseña y el código de 6 dígitos.", email: rawEmail };
  }
  const { email, password, code } = parsed.data;

  const requestHeaders = await headers();
  const ipAddress = clientIp(requestHeaders);
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 512) ?? null;

  if (await isLoginRateLimited(email, ipAddress)) {
    return { error: RATE_LIMITED, email };
  }

  const user = await verifyCredentials(email, password, code);
  if (!user) {
    await recordLoginAttempt(email, ipAddress, "INVALID");
    return { error: INVALID_CREDENTIALS, email };
  }

  await recordLoginAttempt(email, ipAddress, "SUCCESS");
  await createSession(user.id, { ipAddress, userAgent });

  // Housekeeping, cheap enough to do on each successful login.
  const now = Date.now();
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
  await db.loginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(now - AUDIT_RETENTION_MS) } },
  });

  redirect("/");
}
