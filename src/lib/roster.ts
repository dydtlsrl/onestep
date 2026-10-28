// 기존 인력 명단 (MEM-07). 엑셀에서 복사해 붙여 넣은 글을 읽는다.
// 열 순서가 달라도 되게: 휴대폰 번호처럼 생긴 칸, 등급 낱말(핵심·일반) 칸을 찾고, 남은 첫 칸을 이름, 나머지를 메모로 본다.
import type { MemberTier } from "@/lib/tier";
import { isValidMobile } from "@/lib/phone";

export interface RosterRow {
  name: string;
  phone: string;
  tier: MemberTier;
  memo: string;
}

export interface RosterSkip {
  line: number; // 1부터
  text: string;
  reason: string;
}

export interface RosterParse {
  rows: RosterRow[];
  skipped: RosterSkip[];
}

const TIER_WORDS: Record<string, MemberTier> = { 핵심: "core", core: "core", 일반: "general", general: "general" };
const HEADER = /이름|성명|휴대폰|전화|연락처|번호|phone|name/i;

// 엑셀이 앞의 0을 지운 번호(1012345678)와 +82 번호도 고쳐 읽는다
export function readPhone(cell: string): string | null {
  const compact = cell.replace(/[\s\-.()]/g, "");
  if (!/^\+?\d{9,13}$/.test(compact)) return null;
  let digits = compact.replace(/\D/g, "");
  if (digits.startsWith("82")) digits = `0${digits.slice(2)}`;
  if (/^1[016789]\d{7,8}$/.test(digits)) digits = `0${digits}`;
  return isValidMobile(digits) ? digits : null;
}

function splitLine(line: string): string[] {
  const cells = line.includes("\t") ? line.split("\t") : line.split(",");
  return cells.map((c) => c.trim().replace(/^"(.*)"$/, "$1").trim());
}

export function parseRoster(text: string, defaultTier: MemberTier = "general"): RosterParse {
  const rows: RosterRow[] = [];
  const skipped: RosterSkip[] = [];
  const seen = new Set<string>();

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const cells = splitLine(line);
    const phoneIndex = cells.findIndex((c) => readPhone(c) !== null);
    if (phoneIndex < 0) {
      // 첫 줄의 제목 줄(이름, 휴대폰 …)은 조용히 건너뛴다
      if (!(rows.length === 0 && HEADER.test(line))) skipped.push({ line: i + 1, text: line, reason: "휴대폰 번호를 찾지 못했어요" });
      return;
    }
    const phone = readPhone(cells[phoneIndex])!;
    if (seen.has(phone)) {
      skipped.push({ line: i + 1, text: line, reason: "위 줄과 같은 번호예요" });
      return;
    }

    let tier = defaultTier;
    const rest: string[] = [];
    cells.forEach((c, j) => {
      if (j === phoneIndex || !c) return;
      const t = TIER_WORDS[c.toLowerCase()];
      if (t && tier === defaultTier) tier = t;
      else rest.push(c);
    });
    const name = rest.shift() ?? "";
    if (!name || name.length > 40) {
      skipped.push({ line: i + 1, text: line, reason: name ? "이름이 40자를 넘어요" : "이름이 없어요" });
      return;
    }
    seen.add(phone);
    rows.push({ name, phone, tier, memo: rest.join(" · ").slice(0, 200) });
  });

  return { rows, skipped };
}

// 휴대폰 문자 앱을 받는 사람 번호와 내용이 채워진 채로 연다 (아이폰·안드로이드 모두 되는 모양)
export function smsHref(phone: string, body: string): string {
  return `sms:${phone}?&body=${encodeURIComponent(body)}`;
}

export function inviteMessage(name: string, link: string, until: string | null): string {
  return `[원스텝] ${name}님, 원스텝 인력 관리 앱 가입 링크예요. 아래 링크를 눌러 가입 신청해 주세요.${until ? ` (${until}까지, 1회용)` : " (1회용)"}\n${link}`;
}
