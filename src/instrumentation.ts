// Next.js가 서버에서 잡은 오류(화면 만들기, 서버 액션, 라우트, proxy)를 오류 기록(app_errors)에 남긴다.
// 개발자 화면(/dev)에서 본다. 사용자에게 보이는 화면은 app/error.tsx가 맡는다.
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { logAppError } = await import("@/lib/error-log");
  const header = (name: string) => {
    const value = request.headers[name];
    return Array.isArray(value) ? value.join("; ") : (value ?? "");
  };
  const error = err instanceof Error ? err : new Error(String(err));
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : "";

  await logAppError(
    {
      source: context.routeType === "action" ? "action" : "server",
      level: "error",
      code: error.name || "Error",
      message: error.message,
      path: request.path,
      digest,
      userAgent: header("user-agent"),
      detail: { method: request.method, route: context.routePath, type: context.routeType },
    },
    header("cookie"),
  );
};
