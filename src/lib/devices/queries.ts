import { attachmentSelect } from "@/lib/attachments/queries";
import { db } from "@/lib/db";

// What the device sheet shows when it opens. A secret field comes without its
// value (`encryptedValue` is never selected): it reaches the browser only
// through revealSecretField, which logs it. Callers check the session first
// (requireUser).
export async function getDeviceSheet(customerId: string, deviceId: string) {
  const device = await db.device.findFirst({
    where: { id: deviceId, customerId },
    select: {
      id: true,
      type: true,
      name: true,
      roles: true,
      notes: true,
      fields: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, value: true, isSecret: true },
      },
      attachments: { orderBy: { createdAt: "asc" }, select: attachmentSelect },
    },
  });
  return device;
}

export type DeviceSheet = NonNullable<Awaited<ReturnType<typeof getDeviceSheet>>>;
export type SheetField = DeviceSheet["fields"][number];
