import "server-only";
import { argon2id, argon2Verify } from "hash-wasm";
import { randomBytes } from "crypto";

// Argon2id en WebAssembly : même format d'empreinte (PHC) que le module natif
// `argon2`, mais sans binaire à compiler — le module natif ne se charge pas
// sur Vercel. Paramètres identiques aux défauts de `argon2` (t=3, m=64 Mo, p=4).
export async function hashPassword(password: string): Promise<string> {
  return argon2id({
    password,
    salt: randomBytes(16),
    iterations: 3,
    memorySize: 65536,
    parallelism: 4,
    hashLength: 32,
    outputType: "encoded",
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash });
  } catch {
    return false;
  }
}
