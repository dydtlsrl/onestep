import Link from "next/link";
import { requireDeveloper } from "@/lib/auth";
import { reportLoadError } from "@/lib/error-log";
import {
  describeDevice,
  flowForPath,
  groupErrors,
  groupKey,
  SOURCE_LABEL,
  summarizeFlows,
  type ErrorRow,
} from "@/lib/error-report";
import { formatDateTime } from "@/lib/format";
import { ResolveForm } from "./resolve-form";

const DAYS = [1, 7, 30, 90] as const;
const LEVELS = { all: "모두", error: "버그 의심", warn: "안내한 오류" } as const;
const STATUSES = { open: "처리 안 함", all: "처리한 것도" } as const;

type Level = keyof typeof LEVELS;
type Status = keyof typeof STATUSES;

function pick<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

const LEVEL_BADGE: Record<ErrorRow["level"], { label: string; className: string }> = {
  error: { label: "버그 의심", className: "bg-warn-soft text-warn" },
  warn: { label: "안내한 오류", className: "bg-ground text-body" },
};

const ROLE_LABEL: Record<string, string> = { admin: "대표", member: "회원", developer: "개발자" };

function who(r: ErrorRow): string {
  if (!r.user_id) return "로그인 전";
  return r.user_name ? `${r.user_name} (${ROLE_LABEL[r.user_role ?? ""] ?? "회원"})` : ROLE_LABEL[r.user_role ?? ""] ?? "가입 신청 전";
}

function Stat({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <section className="flex flex-col gap-1 rounded-xl border border-line bg-white p-4">
      <h2 className="text-sm font-bold text-body">{label}</h2>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      <p className="text-[13px] text-muted">{help}</p>
    </section>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex h-10 items-center rounded-full border px-3.5 text-sm ${active ? "border-navy bg-navy font-bold text-white" : "border-field bg-white text-body hover:bg-ground"}`}
    >
      {children}
    </Link>
  );
}

// 오류 기록. 사용자가 어느 흐름에서 막혔는지, 버그가 어디서 나는지 묶어서 본다.
export default async function DevErrorsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await requireDeveloper();
  const params = await searchParams;
  const days = Number(pick(params.days, DAYS.map(String), "7"));
  const level = pick<Level>(params.level, ["all", "error", "warn"], "all");
  const status = pick<Status>(params.status, ["open", "all"], "open");

  const { data, error } = await supabase.rpc("dev_errors", { p_days: days });
  await reportLoadError("/dev", error);
  const all = (data as ErrorRow[] | null) ?? [];
  const rows = all.filter((r) => level === "all" || r.level === level);
  const visible = status === "open" ? rows.filter((r) => !r.resolved_at) : rows;

  const groups = groupErrors(rows).filter((g) => status === "all" || g.openIds.length > 0);
  const rowsByGroup = new Map<string, ErrorRow[]>();
  for (const r of rows) rowsByGroup.set(groupKey(r), [...(rowsByGroup.get(groupKey(r)) ?? []), r]);
  const flows = summarizeFlows(visible);

  const openErrors = all.filter((r) => r.level === "error" && !r.resolved_at).length;
  const warns = all.filter((r) => r.level === "warn").length;
  const people = new Set(all.map((r) => r.user_id ?? `anon:${r.user_agent}`)).size;

  const href = (over: Partial<{ days: number; level: Level; status: Status }>) => {
    const q = new URLSearchParams({ days: String(over.days ?? days), level: over.level ?? level, status: over.status ?? status });
    return `/dev?${q.toString()}`;
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">오류 기록</h1>
        <p className="text-sm leading-relaxed text-muted">
          <b className="text-body">버그 의심</b>은 앱이 예상하지 못한 오류예요. 고쳐야 할 수 있어요. <b className="text-body">안내한 오류</b>는 앱이 사용자에게
          안내 문구를 보여 준 경우(예: 신청 마감, 만료된 초대 링크)로, 많이 나오면 사용 흐름에서 사람들이 막히는 곳이에요. 대표와 회원에게는 이 화면이 보이지
          않아요.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-warn-soft px-4 py-3 text-sm leading-relaxed text-warn">
          오류 기록을 불러오지 못했어요. Supabase SQL Editor에서 <code>20261106000000_dev_console.sql</code>(11번)을 실행했는지 확인해 주세요.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="처리 안 한 버그 의심" value={`${openErrors}건`} help={`최근 ${days}일`} />
        <Stat label="안내한 오류" value={`${warns}건`} help="사용자가 막힌 횟수" />
        <Stat label="오류를 겪은 사람" value={`${people}명`} help="로그인 전은 기기별로 셈" />
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-12 text-sm font-bold">기간</span>
          {DAYS.map((d) => (
            <FilterLink key={d} href={href({ days: d })} active={d === days}>
              {d === 1 ? "오늘·어제" : `${d}일`}
            </FilterLink>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-12 text-sm font-bold">종류</span>
          {(Object.keys(LEVELS) as Level[]).map((l) => (
            <FilterLink key={l} href={href({ level: l })} active={l === level}>
              {LEVELS[l]}
            </FilterLink>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-12 text-sm font-bold">상태</span>
          {(Object.keys(STATUSES) as Status[]).map((s) => (
            <FilterLink key={s} href={href({ status: s })} active={s === status}>
              {STATUSES[s]}
            </FilterLink>
          ))}
        </div>
      </div>

      {flows.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
          <h2 className="text-lg font-bold">흐름별</h2>
          <div className="overflow-x-auto">
            <table className="stack-table w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-[#f8f9fa] text-left text-[13px] text-body">
                  <th scope="col" className="px-3 py-3 font-bold">흐름</th>
                  <th scope="col" className="px-3 py-3 font-bold">버그 의심</th>
                  <th scope="col" className="px-3 py-3 font-bold">안내한 오류</th>
                  <th scope="col" className="px-3 py-3 font-bold">마지막</th>
                </tr>
              </thead>
              <tbody>
                {flows.map((f) => (
                  <tr key={f.flow} className="border-b border-[#eef0f3] last:border-0">
                    <td className="stack-first px-3 py-3 font-bold">{f.flow}</td>
                    <td data-label="버그 의심" className={`px-3 py-3 ${f.errors ? "font-bold text-warn" : "text-muted"}`}>{f.errors}건</td>
                    <td data-label="안내한 오류" className="px-3 py-3">{f.warns}건</td>
                    <td data-label="마지막" className="whitespace-nowrap px-3 py-3 text-muted">{formatDateTime(f.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">같은 오류끼리 ({groups.length}가지)</h2>
        {groups.length === 0 && (
          <div className="rounded-xl border border-line bg-white p-8 text-center text-[15px] text-muted">
            {status === "open" ? "처리할 오류가 없어요." : "이 기간에 기록된 오류가 없어요."}
          </div>
        )}
        {groups.map((g) => {
          const items = rowsByGroup.get(g.key) ?? [];
          const badge = LEVEL_BADGE[g.level];
          return (
            <article key={g.key} className={`flex flex-col gap-3 rounded-xl border bg-white p-4 ${g.openIds.length ? "border-line" : "border-line opacity-70"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${badge.className}`}>{badge.label}</span>
                <span className="rounded-md border border-line px-2 py-0.5 text-xs text-body">{SOURCE_LABEL[g.source]}</span>
                <code className="text-sm font-bold">{g.code || "(코드 없음)"}</code>
                {g.openIds.length === 0 && <span className="text-xs font-bold text-brand-strong">처리함{g.resolvedNote && ` · ${g.resolvedNote}`}</span>}
              </div>
              {g.message && g.message !== g.code && <p className="break-words text-sm text-ink">{g.message}</p>}
              <p className="text-[13px] leading-relaxed text-muted">
                {g.count}건 · {g.users}명 · {g.flows.join(", ")} · {g.devices.join(", ")} · 마지막 {formatDateTime(g.lastAt)}
              </p>
              {g.openIds.length > 0 ? <ResolveForm ids={g.openIds} resolved /> : <ResolveForm ids={g.resolvedIds} resolved={false} />}
              <details className="group">
                <summary className="min-h-10 cursor-pointer py-2 text-sm text-brand underline-offset-4 hover:underline">언제·누가·어디서 ({items.length}건)</summary>
                <ul className="flex flex-col divide-y divide-[#eef0f3] text-[13px]">
                  {items.slice(0, 30).map((r) => (
                    <li key={r.id} className="flex flex-col gap-0.5 py-2">
                      <span className="font-bold text-ink">
                        {formatDateTime(r.created_at)} · {who(r)} · {describeDevice(r.user_agent)}
                        {r.resolved_at && <span className="ml-1 font-normal text-brand-strong">처리함</span>}
                      </span>
                      <span className="break-all text-body">
                        {flowForPath(r.path)} <code>{r.path || "—"}</code>
                        {r.digest && <> · 오류 번호 <code>{r.digest}</code></>}
                      </span>
                      {Object.keys(r.detail ?? {}).length > 0 && (
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-ground p-2 text-[12px] text-body">
                          {JSON.stringify(r.detail, null, 1)}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
                {items.length > 30 && <p className="text-[13px] text-muted">최근 30건만 보여요.</p>}
              </details>
            </article>
          );
        })}
      </section>
    </>
  );
}
