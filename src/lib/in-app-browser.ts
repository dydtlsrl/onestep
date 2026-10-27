// 앱 안에 들어 있는 브라우저(카카오톡, 인스타그램 등) 감지.
// 구글은 이런 브라우저에서 로그인을 막으므로, 외부 브라우저로 열도록 안내해야 한다.

export type InAppBrowser = "kakaotalk" | "other" | null;

const OTHER_IN_APP = /Instagram|FBAN|FBAV|NAVER\(inapp|Line\/|DaumApps|everytimeApp|; wv\)/i;

export function detectInAppBrowser(userAgent: string | null | undefined): InAppBrowser {
  if (!userAgent) return null;
  if (/KAKAOTALK/i.test(userAgent)) return "kakaotalk";
  if (OTHER_IN_APP.test(userAgent)) return "other";
  return null;
}

// 카카오톡 안에서 이 주소를 열면 기기의 기본 브라우저로 같은 페이지가 열린다
export function kakaoTalkExternalUrl(url: string): string {
  return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
}
