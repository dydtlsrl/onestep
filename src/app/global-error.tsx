"use client";

import { useEffect } from "react";
import { sendClientError } from "@/components/error-listener";

// 맨 바깥 틀(layout)까지 오류가 난 경우. 전체 스타일이 없으므로 글자 크기·여백만 직접 준다.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : "";

  useEffect(() => {
    if (!digest) sendClientError("render", error);
  }, [error, digest]);

  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f4f5f7", color: "#1a1d21" }}>
        <main style={{ maxWidth: 448, margin: "0 auto", padding: "48px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>화면을 보여 주지 못했어요</h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0 }}>잠시 후 다시 시도해 주세요. 오류는 자동으로 기록되었어요.</p>
          {digest && <p style={{ fontSize: 13, color: "#5b6470", margin: 0 }}>오류 번호: {digest}</p>}
          <button
            type="button"
            onClick={() => retry()}
            style={{ height: 44, borderRadius: 8, border: 0, background: "#2557d6", color: "#fff", fontWeight: 700, fontSize: 14 }}
          >
            다시 시도
          </button>
        </main>
      </body>
    </html>
  );
}
