// 오류를 DB(app_errors)에 남긴다. 개발자 화면(/dev)에서 본다. 서버에서만 쓴다.
// 기록이 실패해도 사용자 화면에는 영향을 주지 않는다 (서버 로그에만 남긴다).
import "server-only";
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { headers } from "next/headers";
import { after } from "next/server";
import { getSupabaseEnv } from "@/lib/env";
import { isKnownError, messageForError } from "@/lib/errors";
import { cleanPath } from "@/lib/error-report";

export interface AppErrorEntry {
  source: "server" | "action" | "client" | "auth";
  level: "error" | "warn";
  code: string;
  message: string;
  path: string;
  digest?: string;
  userAgent?: string;
  detail?: Record<string, unknown>;
}

function clientFor(cookieHeader: string) {
  const { url, key } = getSupabaseEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => parseCookieHeader(cookieHeader).map((c) => ({ name: c.name, value: c.value ?? "" })),
      setAll: () => {},
    },
  });
}

// 쿠키로 누가 겪었는지 함께 남긴다. 로그인이 만료되어 거절되면 로그인 전 사람으로 한 번 더 남긴다.
export async function logAppError(entry: AppErrorEntry, cookieHeader: string): Promise<void> {
  console.error(`[${entry.source}] ${entry.path} ${entry.code}: ${entry.message}`);
  const args = {
    p_source: entry.source,
    p_level: entry.level,
    p_code: entry.code.slice(0, 100),
    p_message: entry.message.slice(0, 1000),
    p_path: cleanPath(entry.path),
    p_digest: (entry.digest ?? "").slice(0, 100),
    p_user_agent: (entry.userAgent ?? "").slice(0, 500),
    p_detail: entry.detail ?? {},
  };
  try {
    let { error } = await clientFor(cookieHeader).rpc("log_app_error", args);
    if (error && cookieHeader) ({ error } = await clientFor("").rpc("log_app_error", args));
    if (error) console.error("[오류 기록 실패]", error.message);
  } catch (err) {
    console.error("[오류 기록 실패]", err);
  }
}

// 지금 요청의 쿠키·기기 정보를 읽어 두고, 응답을 보낸 뒤에 기록한다 (화면이 느려지지 않게).
// 서버 컴포넌트·서버 액션·라우트 핸들러 어디서나 부를 수 있다.
export async function reportError(entry: AppErrorEntry): Promise<void> {
  const h = await headers();
  const cookie = h.get("cookie") ?? "";
  const userAgent = entry.userAgent ?? h.get("user-agent") ?? "";
  after(() => logAppError({ ...entry, userAgent }, cookie));
}

// 서버 액션에서 DB 함수가 거절했을 때. 사용자에게 보여 줄 문장을 돌려주고 오류를 남긴다.
//   - 앱이 아는 코드(예: DEADLINE_PASSED): 사용자에게 안내한 것이므로 warn. 사용 흐름에서 막힌 곳을 보는 데 쓴다.
//   - 모르는 오류: 버그일 수 있으므로 error
export async function actionError(error: { message?: string; code?: string } | null | undefined): Promise<string> {
  const message = error?.message?.trim() ?? "";
  const known = isKnownError(message);
  const h = await headers();
  await reportError({
    source: "action",
    level: known ? "warn" : "error",
    code: known ? message : error?.code || "UNKNOWN",
    message,
    // 서버 액션은 버튼을 누른 화면 주소로 들어온다
    path: h.get("referer") ?? "",
  });
  return messageForError(error);
}

// 화면을 만들 때 목록을 못 불러온 경우 (화면에는 "불러오지 못했어요"만 보이고 오류가 묻히는 곳)
export async function reportLoadError(path: string, error: { message?: string; code?: string } | null | undefined): Promise<void> {
  if (!error) return;
  await reportError({ source: "server", level: "error", code: error.code || "LOAD_FAILED", message: error.message ?? "", path });
}
