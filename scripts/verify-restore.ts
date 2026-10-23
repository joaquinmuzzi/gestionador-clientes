// Checks a restored backup: run by scripts/restore-test.sh against the throwaway restore-db
// database and the restored attachments, never against the live data.
//
//   DATABASE_URL=<restore-db> ATTACHMENTS_DIR=<restored files> npx tsx scripts/verify-restore.ts
//
// A dump that loads is not enough: the secrets and the screenshots must also decrypt with the
// ENCRYPTION_KEY kept apart from the backups, or the copy is useless. Every TOTP key, secret field
// and attachment file is decrypted; nothing decrypted is printed.

import "./load-env";
import { readAttachmentFile } from "@/lib/attachments/storage";
import { readTotpKey } from "@/lib/auth/users";
import { decryptString } from "@/lib/crypto";
import { fieldValueContext } from "@/lib/devices/input";
import { db } from "@/lib/db";

const MAX_LISTED_PROBLEMS = 10;

async function main(): Promise<number> {
  const problems: string[] = [];
  let decrypted = 0;

  const users = await db.user.findMany({ select: { id: true, email: true, totpSecret: true } });
  for (const user of users) {
    try {
      readTotpKey(user);
      decrypted++;
    } catch {
      problems.push(`the 2FA key of user ${user.email} does not decrypt`);
    }
  }

  const secretFields = await db.deviceField.findMany({
    where: { isSecret: true },
    select: { id: true, encryptedValue: true },
  });
  for (const field of secretFields) {
    try {
      decryptString(field.encryptedValue ?? "", fieldValueContext(field.id));
      decrypted++;
    } catch {
      problems.push(`secret field ${field.id} does not decrypt`);
    }
  }

  const attachments = await db.attachment.findMany({
    select: { id: true, storageKey: true, size: true },
  });
  for (const attachment of attachments) {
    try {
      const bytes = await readAttachmentFile(attachment.storageKey, attachment.id);
      if (bytes.length !== attachment.size) {
        problems.push(`attachment ${attachment.id} decrypts to a different size`);
      } else {
        decrypted++;
      }
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      problems.push(`attachment ${attachment.id} ${missing ? "has no file" : "does not decrypt"}`);
    }
  }

  const counts = {
    users: users.length,
    customers: await db.customer.count(),
    "end users": await db.endUser.count(),
    devices: await db.device.count(),
    connections: await db.connection.count(),
    "device fields": await db.deviceField.count(),
    "secret fields": secretFields.length,
    attachments: attachments.length,
    incidents: await db.incident.count(),
    vulnerabilities: await db.vulnerability.count(),
    "agenda items": await db.agendaItem.count(),
    "audit entries": await db.auditLog.count(),
  };
  for (const [name, count] of Object.entries(counts)) {
    console.log(`${name.padEnd(16)} ${count}`);
  }
  console.log(`${"decrypted".padEnd(16)} ${decrypted}`);

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):`);
    for (const problem of problems.slice(0, MAX_LISTED_PROBLEMS)) console.error(`- ${problem}`);
    if (problems.length > MAX_LISTED_PROBLEMS) {
      console.error(`- ... and ${problems.length - MAX_LISTED_PROBLEMS} more`);
    }
    if (decrypted === 0) {
      console.error("Nothing decrypts: ENCRYPTION_KEY is probably not the key of this backup.");
    }
    return 1;
  }
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
