// 초대 링크 코드. 추측할 수 없도록 무작위 16바이트를 URL에 쓸 수 있는 22글자로 만든다.
import { randomBytes } from "node:crypto";

export function generateInviteCode(): string {
  return randomBytes(16).toString("base64url");
}

export function isInviteCodeFormat(code: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(code);
}
