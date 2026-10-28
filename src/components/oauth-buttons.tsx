"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { kakaoTalkExternalUrl, type InAppBrowser } from "@/lib/in-app-browser";
import { KAKAO_LOGIN_ENABLED } from "@/lib/login-providers";

type Provider = "kakao" | "google";

// 카카오·구글 로그인 버튼. 카카오는 설정을 켰을 때만 보인다 (lib/login-providers).
// next: 로그인을 마친 뒤 돌아갈 경로 (예: /signup/<초대코드>)
// inApp: 앱 안 브라우저인지 (서버에서 User-Agent로 판단해 넘겨준다)
export function OAuthButtons({ next, inApp }: { next: string; inApp: InAppBrowser }) {
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(provider: Provider) {
    setPending(provider);
    setError(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: signInError } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (signInError) {
      setPending(null);
      setError("로그인 화면을 열지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  function openInExternalBrowser() {
    window.location.href = kakaoTalkExternalUrl(window.location.href);
  }

  return (
    <div className="flex flex-col gap-3">
      {KAKAO_LOGIN_ENABLED && (
        <button
          type="button"
          onClick={() => signIn("kakao")}
          disabled={pending !== null}
          className="h-12 rounded-lg bg-kakao text-[15px] font-bold text-black/85 disabled:opacity-60"
        >
          {pending === "kakao" ? "카카오로 이동 중…" : "카카오 로그인"}
        </button>
      )}

      {inApp === null && (
        <button
          type="button"
          onClick={() => signIn("google")}
          disabled={pending !== null}
          className="h-12 rounded-lg border border-field bg-white text-[15px] font-bold text-ink disabled:opacity-60"
        >
          {pending === "google" ? "Google로 이동 중…" : "Google로 로그인"}
        </button>
      )}

      {inApp === "kakaotalk" && (
        <div className="flex flex-col gap-2 rounded-lg bg-ground p-4 text-sm leading-relaxed text-body">
          <p>
            카카오톡 안에서는 Google 로그인이 막혀 있어요. Google로 로그인하려면 기본 브라우저(Chrome, Safari)로 열어
            주세요.
          </p>
          <button
            type="button"
            onClick={openInExternalBrowser}
            className="h-11 rounded-lg border border-field bg-white font-bold text-ink"
          >
            기본 브라우저로 열기
          </button>
        </div>
      )}

      {inApp === "other" && (
        <p className="rounded-lg bg-ground p-4 text-sm leading-relaxed text-body">
          앱 안의 브라우저에서는 Google 로그인이 막혀 있어요. 화면 메뉴에서 &lsquo;다른 브라우저로 열기&rsquo;를 눌러
          Chrome이나 Safari로 열어 주세요.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
    </div>
  );
}
