import { SignJWT, jwtVerify } from "jose";

const textEncoder = new TextEncoder();

function secretKey(secret: string): Uint8Array {
  return textEncoder.encode(secret);
}

export async function signToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .sign(secretKey(secret));
}

export async function verifyToken<T>(token: string, secret: string): Promise<T | null> {
  try {
    const result = await jwtVerify(token, secretKey(secret));
    return result.payload as T;
  } catch {
    return null;
  }
}

export async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(input));
  return Buffer.from(digest).toString("base64url");
}

export function randomString(bytes = 32): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Buffer.from(array).toString("base64url");
}
