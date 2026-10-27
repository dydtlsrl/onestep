// 주민등록번호·계좌번호 암호화. 서버에서만 쓴다.
// 키는 환경변수 PII_ENCRYPTION_KEY(32바이트를 base64로)에 둔다. DB와 GitHub에는 절대 넣지 않는다.
// 키를 잃어버리면 저장된 값을 되살릴 수 없으니, 호스팅 비밀 환경변수와 안전한 곳에 같이 보관한다.
import "server-only";
import { decryptWith, encryptWith, parseKey } from "@/lib/aes";

function loadKey(): Buffer {
  const key = parseKey(process.env.PII_ENCRYPTION_KEY);
  if (!key) throw new Error("PII_KEY_MISSING");
  return key;
}

export function hasPiiKey(): boolean {
  return parseKey(process.env.PII_ENCRYPTION_KEY) !== null;
}

export function encryptPii(plain: string): string {
  return encryptWith(loadKey(), plain);
}

export function decryptPii(value: string): string {
  return decryptWith(loadKey(), value);
}
