// Shared with src/proxy.ts, so keep this module free of server-only imports.
// The __Host- prefix makes the browser refuse the cookie unless it's Secure,
// host-only and path=/, which only works over HTTPS (or localhost).
export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-session" : "session";
