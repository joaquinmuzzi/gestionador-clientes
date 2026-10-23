import { defineConfig } from "prisma/config";

// The Prisma CLI doesn't read .env on its own. In Docker the variables come
// from Compose, so a missing file is fine.
try {
  process.loadEnvFile();
} catch {}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
