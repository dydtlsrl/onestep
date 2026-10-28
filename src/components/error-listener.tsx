"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-error-action";

const seen = new Set<string>();
const MAX_PER_PAGE = 10;

// 휴대폰·PC 브라우저에서 화면 밖으로 새어 나온 오류를 서버에 알린다. 같은 오류는 한 번만, 한 화면에 10건까지.
export function sendClientError(kind: "render" | "window" | "promise", error: unknown) {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : JSON.stringify(error) ?? "알 수 없는 오류");
  const key = `${kind}|${err.name}|${err.message}`;
  if (seen.has(key) || seen.size >= MAX_PER_PAGE) return;
  seen.add(key);
  reportClientError({
    kind,
    name: err.name.slice(0, 100),
    message: err.message.slice(0, 1000),
    path: window.location.pathname.slice(0, 300),
    stack: (err.stack ?? "").slice(0, 2000),
  }).catch(() => {});
}

// 브라우저 확장 프로그램 등 우리 코드가 아닌 곳의 오류, 의미 없는 경고는 뺀다
function isNoise(event: ErrorEvent): boolean {
  if (/ResizeObserver loop/.test(event.message)) return true;
  if (event.filename && !event.filename.startsWith(window.location.origin)) return true;
  return false;
}

export function ErrorListener() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (!isNoise(event)) sendClientError("window", event.error ?? event.message);
    };
    const onRejection = (event: PromiseRejectionEvent) => sendClientError("promise", event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
