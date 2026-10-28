// 오류 기록을 사람이 읽기 좋게 정리한다 (개발자 화면 /dev).
// 어느 흐름(가입·신청·계약 등)에서, 어떤 기기에서 났는지 붙이고, 같은 오류끼리 묶는다.
import { detectInAppBrowser } from "@/lib/in-app-browser";

// 주소에서 경로만 남긴다. 쿼리(?next=...)와 다른 사이트 주소는 버린다.
export function cleanPath(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const path = new URL(value, "http://x").pathname;
    return path.slice(0, 300);
  } catch {
    return "";
  }
}

const FLOWS: [RegExp, string][] = [
  [/^\/(join|signup|pending|login|auth)(\/|$)/, "가입·로그인"],
  [/^\/events(\/|$)/, "일정 신청"],
  [/^\/contracts(\/|$)/, "계약 서명"],
  [/^\/payments(\/|$)/, "정산 확인"],
  [/^\/me(\/|$)/, "내 정보"],
  [/^\/notifications(\/|$)/, "알림"],
  [/^\/(withdraw|privacy)(\/|$)/, "탈퇴·처리방침"],
  [/^\/admin\/events(\/|$)/, "대표: 일정·선발·계약"],
  [/^\/admin\/payments(\/|$)/, "대표: 정산"],
  [/^\/admin\/(applications|members|invites|roster)(\/|$)/, "대표: 회원·가입 승인"],
  [/^\/admin\/(rates|contracts|settings)(\/|$)/, "대표: 단가·양식·설정"],
  [/^\/admin(\/|$)/, "대표: 기타"],
  [/^\/dev(\/|$)/, "개발자 화면"],
  [/^\/$/, "첫 화면 (내 일정)"],
];

export function flowForPath(path: string): string {
  const p = cleanPath(path);
  return FLOWS.find(([re]) => re.test(p))?.[1] ?? (p ? "기타" : "알 수 없음");
}

// "iPhone · 카카오톡 안" 처럼 기기와 앱 안 브라우저 여부
export function describeDevice(userAgent: string): string {
  if (!userAgent) return "알 수 없음";
  const os = /iPhone/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Windows/.test(userAgent)
          ? "Windows PC"
          : /Macintosh/.test(userAgent)
            ? "Mac"
            : "기타 기기";
  const inApp = detectInAppBrowser(userAgent);
  return inApp === "kakaotalk" ? `${os} · 카카오톡 안` : inApp === "other" ? `${os} · 앱 안 브라우저` : os;
}

export interface ErrorRow {
  id: number;
  created_at: string;
  source: "server" | "action" | "client" | "auth";
  level: "error" | "warn";
  code: string;
  message: string;
  path: string;
  digest: string;
  user_agent: string;
  detail: Record<string, unknown>;
  resolved_at: string | null;
  resolved_note: string;
  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
}

export const SOURCE_LABEL: Record<ErrorRow["source"], string> = {
  server: "화면 열기",
  action: "버튼·저장",
  client: "브라우저",
  auth: "로그인",
};

export interface ErrorGroup {
  key: string;
  level: ErrorRow["level"];
  source: ErrorRow["source"];
  code: string;
  message: string;
  flows: string[];
  count: number;
  openIds: number[]; // 아직 처리하지 않은 기록
  resolvedIds: number[];
  users: number; // 겪은 사람 수 (로그인 전은 한 사람으로)
  devices: string[];
  lastAt: string;
  resolvedNote: string;
}

// 같은 종류·코드·문구끼리 묶는다. 처리 안 한 묶음 → 버그 의심 → 최근 것 순서.
export const groupKey = (r: ErrorRow) => `${r.level}|${r.source}|${r.code}|${r.message}`;

export function groupErrors(rows: ErrorRow[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup & { userSet: Set<string>; flowSet: Set<string>; deviceSet: Set<string> }>();
  for (const r of rows) {
    const key = groupKey(r);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        level: r.level,
        source: r.source,
        code: r.code,
        message: r.message,
        flows: [],
        count: 0,
        openIds: [],
        resolvedIds: [],
        users: 0,
        devices: [],
        lastAt: r.created_at,
        resolvedNote: "",
        userSet: new Set(),
        flowSet: new Set(),
        deviceSet: new Set(),
      };
      groups.set(key, g);
    }
    g.count += 1;
    if (!r.resolved_at) g.openIds.push(r.id);
    else {
      g.resolvedIds.push(r.id);
      if (!g.resolvedNote) g.resolvedNote = r.resolved_note;
    }
    g.userSet.add(r.user_id ?? "로그인 전");
    g.flowSet.add(flowForPath(r.path));
    g.deviceSet.add(describeDevice(r.user_agent));
    if (r.created_at > g.lastAt) g.lastAt = r.created_at;
  }
  return [...groups.values()]
    .map(({ userSet, flowSet, deviceSet, ...g }) => ({ ...g, users: userSet.size, flows: [...flowSet], devices: [...deviceSet] }))
    .sort(
      (a, b) =>
        Number(b.openIds.length > 0) - Number(a.openIds.length > 0) ||
        Number(b.level === "error") - Number(a.level === "error") ||
        b.lastAt.localeCompare(a.lastAt),
    );
}

export interface FlowSummary {
  flow: string;
  errors: number;
  warns: number;
  open: number;
  lastAt: string;
}

export function summarizeFlows(rows: ErrorRow[]): FlowSummary[] {
  const map = new Map<string, FlowSummary>();
  for (const r of rows) {
    const flow = flowForPath(r.path);
    const s = map.get(flow) ?? { flow, errors: 0, warns: 0, open: 0, lastAt: r.created_at };
    if (r.level === "error") s.errors += 1;
    else s.warns += 1;
    if (!r.resolved_at) s.open += 1;
    if (r.created_at > s.lastAt) s.lastAt = r.created_at;
    map.set(flow, s);
  }
  return [...map.values()].sort((a, b) => b.errors - a.errors || b.warns - a.warns);
}
