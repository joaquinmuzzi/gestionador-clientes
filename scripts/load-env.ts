// Imported first by CLI scripts so .env is loaded before any module reads it.
// In Docker the variables come from Compose, so a missing file is fine.
try {
  process.loadEnvFile();
} catch {}
