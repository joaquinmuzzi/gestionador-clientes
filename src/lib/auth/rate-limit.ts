import { db } from "@/lib/db";

// Failed logins allowed in the window, counted per IP and per email. The email
// limit still holds if an attacker rotates IPs.
export const LOGIN_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  maxFailuresPerIp: 5,
  maxFailuresPerEmail: 10,
};

export async function isLoginRateLimited(email: string, ipAddress: string): Promise<boolean> {
  const since = new Date(Date.now() - LOGIN_RATE_LIMIT.windowMs);
  const failed = { outcome: "INVALID", createdAt: { gte: since } } as const;
  const [byIp, byEmail] = await Promise.all([
    db.loginAttempt.count({ where: { ...failed, ipAddress } }),
    db.loginAttempt.count({ where: { ...failed, email } }),
  ]);
  return (
    byIp >= LOGIN_RATE_LIMIT.maxFailuresPerIp || byEmail >= LOGIN_RATE_LIMIT.maxFailuresPerEmail
  );
}

export async function recordLoginAttempt(
  email: string,
  ipAddress: string,
  outcome: "SUCCESS" | "INVALID",
): Promise<void> {
  await db.loginAttempt.create({ data: { email, ipAddress, outcome } });
}

// The client IP as seen by the closest proxy: the last X-Forwarded-For entry.
// Without a reverse proxy in front the header can be forged, which only
// weakens the per-IP limit; the per-email limit doesn't depend on it.
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return (last || headers.get("x-real-ip") || "unknown").slice(0, 64);
}
