import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "./cookie";

// Short sessions: 8 hours at most, and 1 hour without activity logs you out.
const MAX_AGE_MS = 8 * 60 * 60 * 1000;
const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
// Avoid a database write on every request just to refresh lastSeenAt.
const TOUCH_INTERVAL_MS = 60 * 1000;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  meta: { ipAddress: string; userAgent: string | null },
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + MAX_AGE_MS);
  await db.session.create({
    data: { id: hashToken(token), userId, expiresAt, ...meta },
  });
  (await cookies()).set(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, expires: expiresAt });
}

// Validates the session cookie against the database. Cached per request.
export const getCurrentSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const id = hashToken(token);
  const session = await db.session.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now || session.lastSeenAt.getTime() + IDLE_TIMEOUT_MS <= now) {
    await db.session.deleteMany({ where: { id } });
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id }, data: { lastSeenAt: new Date(now) } });
  }
  return { id: session.id, user: session.user };
});

// Call this in every page, Server Action and Route Handler that touches data.
// The proxy only checks that the cookie exists; this is the real check.
export async function requireUser() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session.user;
}

export async function deleteCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  // Same attributes as when it was set, or the browser ignores the removal.
  store.set(SESSION_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
}
