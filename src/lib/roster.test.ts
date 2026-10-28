import { describe, expect, it } from "vitest";
import { inviteMessage, parseRoster, readPhone, smsHref } from "./roster";

describe("readPhone", () => {
  it("여러 모양의 휴대폰 번호", () => {
    expect(readPhone("010-1234-5678")).toBe("01012345678");
    expect(readPhone("010 1234 5678")).toBe("01012345678");
    expect(readPhone("1012345678")).toBe("01012345678"); // 엑셀이 0을 지운 것
    expect(readPhone("+82 10-1234-5678")).toBe("01012345678");
    expect(readPhone("02-123-4567")).toBeNull();
    expect(readPhone("김하늘")).toBeNull();
    expect(readPhone("3")).toBeNull();
  });
});

describe("parseRoster", () => {
  it("엑셀에서 복사한 표 (탭), 제목 줄은 건너뜀", () => {
    const r = parseRoster("이름\t연락처\t등급\t지역\n김하늘\t010-1111-2222\t핵심\t서울\n이도윤\t01033334444\t\t부산\n");
    expect(r.rows).toEqual([
      { name: "김하늘", phone: "01011112222", tier: "core", memo: "서울" },
      { name: "이도윤", phone: "01033334444", tier: "general", memo: "부산" },
    ]);
    expect(r.skipped).toEqual([]);
  });

  it("열 순서가 달라도, 쉼표로 나눠도 읽는다", () => {
    const r = parseRoster('"010-5555-6666",박서연,일반,"감독 5회"', "core");
    expect(r.rows).toEqual([{ name: "박서연", phone: "01055556666", tier: "general", memo: "감독 5회" }]);
  });

  it("등급 칸이 없으면 고른 기본 등급", () => {
    expect(parseRoster("최민준\t010-7777-8888", "core").rows[0].tier).toBe("core");
  });

  it("못 읽은 줄은 이유와 함께 알려 준다", () => {
    const r = parseRoster("김하늘\t010-1111-2222\n정하은\t02-123-4567\n김하늘(중복)\t01011112222\n\t010-9999-0000");
    expect(r.rows).toHaveLength(1);
    expect(r.skipped.map((s) => [s.line, s.reason])).toEqual([
      [2, "휴대폰 번호를 찾지 못했어요"],
      [3, "위 줄과 같은 번호예요"],
      [4, "이름이 없어요"],
    ]);
  });
});

describe("문자 보내기", () => {
  it("받는 사람과 내용을 채운 주소", () => {
    const body = inviteMessage("김하늘", "https://x.app/join/abc", "11월 15일");
    expect(body).toContain("김하늘님");
    expect(body).toContain("11월 15일까지, 1회용");
    expect(smsHref("01011112222", body)).toBe(`sms:01011112222?&body=${encodeURIComponent(body)}`);
  });
});
