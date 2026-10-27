import { describe, expect, it } from "vitest";
import { detectInAppBrowser, kakaoTalkExternalUrl } from "./in-app-browser";

const KAKAO_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 11.0.0";
const KAKAO_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36;KAKAOTALK 2410100";
const INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0";
const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

describe("detectInAppBrowser", () => {
  it("카카오톡 브라우저를 알아본다 (iOS, 안드로이드)", () => {
    expect(detectInAppBrowser(KAKAO_IOS)).toBe("kakaotalk");
    expect(detectInAppBrowser(KAKAO_ANDROID)).toBe("kakaotalk");
  });

  it("다른 앱 안 브라우저를 알아본다", () => {
    expect(detectInAppBrowser(INSTAGRAM)).toBe("other");
  });

  it("일반 브라우저는 null", () => {
    expect(detectInAppBrowser(SAFARI)).toBeNull();
    expect(detectInAppBrowser(CHROME_ANDROID)).toBeNull();
    expect(detectInAppBrowser(null)).toBeNull();
  });
});

describe("kakaoTalkExternalUrl", () => {
  it("주소를 인코딩해 외부 브라우저 열기 링크를 만든다", () => {
    expect(kakaoTalkExternalUrl("https://onestep.example/join/abc?x=1")).toBe(
      "kakaotalk://web/openExternal?url=https%3A%2F%2Fonestep.example%2Fjoin%2Fabc%3Fx%3D1",
    );
  });
});
