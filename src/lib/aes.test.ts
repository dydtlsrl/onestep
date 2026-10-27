import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptWith, encryptWith, parseKey } from "./aes";

describe("aes", () => {
  const key = randomBytes(32);

  it("암호화한 값을 같은 키로 되살린다", () => {
    const enc = encryptWith(key, "900101-1234567");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain("900101");
    expect(decryptWith(key, enc)).toBe("900101-1234567");
  });

  it("같은 값도 매번 다르게 암호화한다", () => {
    expect(encryptWith(key, "123")).not.toBe(encryptWith(key, "123"));
  });

  it("다른 키나 바뀐 값은 오류", () => {
    const enc = encryptWith(key, "1002-123-456789");
    expect(() => decryptWith(randomBytes(32), enc)).toThrow();
    const tampered = enc.slice(0, -4) + (enc.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decryptWith(key, tampered)).toThrow();
    expect(() => decryptWith(key, "plain")).toThrow("PII_FORMAT");
  });

  it("키는 32바이트 base64만 받는다", () => {
    expect(parseKey(undefined)).toBeNull();
    expect(parseKey("short")).toBeNull();
    expect(parseKey(randomBytes(32).toString("base64"))?.length).toBe(32);
  });
});
