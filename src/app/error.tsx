"use client";

import Link from "next/link";
import { useEffect } from "react";
import { sendClientError } from "@/components/error-listener";

// 화면을 그리다 오류가 나면 이 안내를 보여 준다. 오류는 개발자 화면(/dev)의 오류 기록에 남는다.
// 서버에서 난 오류(digest가 있음)는 서버가 이미 남겼으므로 브라우저에서 난 것만 보낸다.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : "";

  useEffect(() => {
    if (!digest) sendClientError("render", error);
  }, [error, digest]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-12">
      <h1 className="text-xl font-bold">화면을 보여 주지 못했어요</h1>
      <p className="text-[15px] leading-relaxed text-body">
        잠시 후 다시 시도해 주세요. 계속 안 되면 대표님께 알려 주세요. 오류는 자동으로 기록되었어요.
      </p>
      {digest && <p className="text-[13px] text-muted">오류 번호: {digest}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => retry()} className="h-11 rounded-lg bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong">
          다시 시도
        </button>
        <Link href="/" className="flex h-11 items-center rounded-lg border border-field bg-white px-4 text-sm font-bold">
          첫 화면으로
        </Link>
      </div>
    </main>
  );
}
