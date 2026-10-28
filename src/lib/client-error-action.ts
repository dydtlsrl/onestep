"use server";

import { z } from "zod";
import { reportError } from "@/lib/error-log";

const schema = z.object({
  kind: z.enum(["render", "window", "promise"]),
  name: z.string().max(100),
  message: z.string().max(1000),
  path: z.string().max(300),
  stack: z.string().max(2000),
});

// 브라우저(휴대폰·PC)에서 난 오류를 받아 남긴다. 로그인 전 화면에서도 부른다.
// 누구나 부를 수 있으므로 모양이 틀리면 버리고, 개수 제한은 DB 함수(log_app_error)가 한다.
export async function reportClientError(input: unknown): Promise<void> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return;
  const { kind, name, message, path, stack } = parsed.data;
  await reportError({ source: "client", level: "error", code: name || "Error", message, path, detail: { kind, stack } });
}
