import { db } from "@/lib/db";
import { verifyAgainstDummy, verifyPassword } from "./password";
import { verifyTotp } from "./totp";
import { readTotpKey } from "./users";

// Checks email + password + TOTP code. Returns the user only if all three are
// right; the caller shows one generic error otherwise, so a failure doesn't
// reveal which part was wrong or whether the email exists.
export async function verifyCredentials(
  email: string,
  password: string,
  code: string,
): Promise<{ id: string } | null> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    await verifyAgainstDummy(password);
    return null;
  }

  if (!(await verifyPassword(user.passwordHash, password))) return null;

  const step = verifyTotp(readTotpKey(user), code, user.totpLastUsedStep);
  if (step === null) return null;

  // Claim the step atomically so two concurrent logins can't both use the code.
  const claimed = await db.user.updateMany({
    where: {
      id: user.id,
      OR: [{ totpLastUsedStep: null }, { totpLastUsedStep: { lt: step } }],
    },
    data: { totpLastUsedStep: step },
  });
  return claimed.count === 1 ? { id: user.id } : null;
}
