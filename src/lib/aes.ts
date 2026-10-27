// AES-256-GCM 암호화 도구. 키를 다루는 crypto.ts가 쓰고, 테스트도 이 파일로 한다.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "v1:";

// 32바이트 키를 base64 문자열에서 읽는다. 형식이 틀리면 null
export function parseKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  const key = Buffer.from(raw.trim(), "base64");
  return key.length === 32 ? key : null;
}

// 결과: v1:base64(iv 12바이트 + 인증 태그 16바이트 + 암호문)
export function encryptWith(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

// 키가 다르거나 값이 바뀌었으면 오류를 낸다
export function decryptWith(key: Buffer, value: string): string {
  if (!value.startsWith(PREFIX)) throw new Error("PII_FORMAT");
  const data = Buffer.from(value.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}
