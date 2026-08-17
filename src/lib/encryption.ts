import Cryptr from "cryptr";

// No `import "server-only"` guard here (unlike src/trpc/server.tsx): it
// throws when bun:test imports this module directly, since bun test never
// sets Next's server-component marker. The real leak risk it guards
// against is already closed — Next strips non-NEXT_PUBLIC_ env vars from
// the client bundle, so an accidental client import would fail loudly
// with a missing key, not leak one. Only import this from server code.
if (!process.env.ENCRYPTION_KEY) {
  throw new Error(
    "ENCRYPTION_KEY is not set. Generate one (e.g. `openssl rand -hex 32`) and add it to .env.",
  );
}

const cryptr = new Cryptr(process.env.ENCRYPTION_KEY);

export const encrypt = (text: string) => cryptr.encrypt(text);
export const decrypt = (text: string) => cryptr.decrypt(text);
