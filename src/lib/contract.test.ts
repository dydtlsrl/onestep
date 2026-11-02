import { describe, expect, it } from "vitest";
import { parseCompany, parseTerms, placeholderValues, renderTemplate, unknownPlaceholders, type ContractTerms } from "./contract";

const terms: ContractTerms = {
  kind: "employment",
  period: { start: "2026-11-07", end: "2026-11-08" },
  company: parseCompany({ name: "원스텝", ceo: "홍길동" }),
  member: { name: "서하늘", phone: "01000000000" },
  event: { title: "공사 필기시험", location: "OO중학교", address: "" },
  days: [
    { label: "11/7(토) 세팅", time: "14:00–18:00", role: "", pay: "시급", amount: 44000 },
    { label: "11/8(일) 진행", time: "08:00–17:00", role: "감독", pay: "시급", amount: 99000 },
  ],
  extras: [],
  total: 143000,
  pay_date: "2026-11-15",
  rrn_display: "masked",
};

describe("contract", () => {
  it("빈칸을 채운다 (공백 허용, 모르는 빈칸은 그대로)", () => {
    const out = renderTemplate("{{회사명}}와 {{ 이름 }}은 {{행사명}}({{일자}}) {{금액}}, {{지급예정일}}, {{역할}}, {{없음}}", placeholderValues(terms));
    expect(out).toBe("원스텝와 서하늘은 공사 필기시험(11/7(토) 세팅, 11/8(일) 진행) 143,000원, 2026년 11월 15일, 감독, {{없음}}");
  });

  it("역할이 없으면 현장 배정, 지급일이 없으면 안내 문구", () => {
    const v = placeholderValues({ ...terms, days: [terms.days[0]], pay_date: null });
    expect(v.역할).toBe("현장 배정");
    expect(v.지급예정일).toBe("회사가 정한 지급일");
  });

  it("근로계약기간: 첫날~마지막 날, 하루면 (1일), 없으면 표를 가리킨다", () => {
    expect(placeholderValues(terms).근로계약기간).toBe("2026년 11월 7일부터 2026년 11월 8일까지");
    expect(placeholderValues({ ...terms, period: { start: "2026-11-08", end: "2026-11-08" } }).근로계약기간).toBe("2026년 11월 8일 (1일)");
    expect(placeholderValues({ ...terms, period: null }).근로계약기간).toBe("위 표의 날짜");
  });

  it("모르는 빈칸을 찾는다", () => {
    expect(unknownPlaceholders("{{이름}} {{이룸}} {{이룸}}")).toEqual(["이룸"]);
  });

  it("저장된 내용 읽기", () => {
    expect(parseTerms(null)).toBeNull();
    expect(parseTerms(terms)?.total).toBe(143000);
    // 예전에 보낸 계약서(종류·기간 없음)는 용역계약서로 읽는다
    const old = { ...terms, kind: undefined, period: undefined };
    expect(parseTerms(old)).toMatchObject({ kind: "service", period: null });
  });
});
