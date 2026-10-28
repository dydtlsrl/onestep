"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { chunk } from "@/lib/chunk";
import { actionError } from "@/lib/error-log";
import { generateInviteCode } from "@/lib/invite-code";
import { parseRoster } from "@/lib/roster";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { memberStatusByPhone } from "./member-status";

// 아래 기능은 모두 DB 권한 규칙(RLS)이 대표인지 다시 확인한다

export interface RosterState {
  error?: string;
  ok?: string;
}

export interface LinkState {
  error?: string;
  link?: string;
  until?: string | null;
}

const MAX_ROWS = 2000;
// 빈 이름은 초대 링크에서 "모든 명단"이라는 뜻이라 명단 이름은 꼭 정한다
const listName = z.string().trim().min(1, "명단 이름을 적어 주세요. (예: 핵심 인력)").max(40, "명단 이름은 40자까지 쓸 수 있어요.");

const days = z.enum(["3", "7", "14", "30"]);

function refresh() {
  revalidatePath("/admin/roster");
  revalidatePath("/admin/invites");
  revalidatePath("/admin/applications");
}

const expiresAt = (d: string) => new Date(Date.now() + Number(d) * 24 * 60 * 60 * 1000);
const untilLabel = (date: Date) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }).format(date);

// 명단 넣기. 붙여 넣은 글을 서버에서 다시 읽고, 같은 번호는 새 내용으로 고쳐 쓴다.
export async function importRoster(_prev: RosterState, formData: FormData): Promise<RosterState> {
  const list = listName.safeParse(formData.get("listName") ?? "");
  if (!list.success) return { error: list.error.issues[0]?.message };
  const tier = formData.get("defaultTier") === "core" ? "core" : "general";
  const { rows } = parseRoster(String(formData.get("text") ?? ""), tier);
  if (rows.length === 0) return { error: "읽은 사람이 없어요. 엑셀에서 이름과 휴대폰 칸을 복사해 붙여 넣어 주세요." };
  if (rows.length > MAX_ROWS) return { error: `한 번에 ${MAX_ROWS.toLocaleString()}명까지 넣을 수 있어요.` };

  const supabase = await createClient();
  let updated = 0;
  for (const part of chunk(rows.map((r) => r.phone))) {
    const { count, error } = await supabase.from("roster").select("id", { count: "exact", head: true }).in("phone", part);
    if (error) return { error: await actionError(error) };
    updated += count ?? 0;
  }
  const { error } = await supabase
    .from("roster")
    .upsert(rows.map((r) => ({ ...r, list_name: list.data })), { onConflict: "phone" });
  if (error) return { error: await actionError(error) };

  refresh();
  return { ok: `${rows.length}명을 넣었어요.${updated ? ` (이미 있던 ${updated}명은 새 내용으로 고쳤어요)` : ""}` };
}

// 명단으로 단체 링크. 최대 가입 수는 그 명단에서 아직 가입하지 않은 사람 수.
export async function createGroupLink(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const list = listName.safeParse(formData.get("listName") ?? "");
  const d = days.safeParse(formData.get("days"));
  if (!list.success || !d.success) return { error: "잘못된 요청이에요." };
  const rosterOnly = formData.get("rosterOnly") === "on";

  const supabase = await createClient();
  const { data: rows, error: rowsError } = await supabase.from("roster").select("phone").eq("list_name", list.data).returns<{ phone: string }[]>();
  if (rowsError) return { error: await actionError(rowsError) };
  const phones = (rows ?? []).map((r) => r.phone);
  const { map: joined, error: membersError } = await memberStatusByPhone(supabase, phones);
  if (membersError) return { error: await actionError(membersError) };
  const remaining = phones.filter((p) => !joined.has(p)).length;
  if (remaining === 0) return { error: "이 명단의 사람은 모두 가입 신청을 했어요." };

  const code = generateInviteCode();
  const until = expiresAt(d.data);
  const { error } = await supabase.from("invites").insert({
    code,
    memo: `${list.data || "명단"} (${remaining}명)`.slice(0, 100),
    max_uses: remaining,
    expires_at: until.toISOString(),
    roster_only: rosterOnly,
    roster_list: list.data,
  });
  if (error) return { error: await actionError(error) };

  refresh();
  return { link: `${await getSiteUrl()}/join/${code}`, until: untilLabel(until) };
}

// 한 사람의 1회용 개인 링크. 그 사람 번호로만 가입할 수 있다.
export async function createPersonalLink(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const id = z.uuid().safeParse(formData.get("rosterId"));
  if (!id.success) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data: row } = await supabase.from("roster").select("id, name").eq("id", id.data).maybeSingle<{ id: string; name: string }>();
  if (!row) return { error: "명단에서 찾을 수 없어요. 새로고침해 주세요." };

  // 예전 개인 링크는 끈다 (한 사람에게 쓸 수 있는 링크는 하나만)
  await supabase.from("invites").update({ is_active: false }).eq("roster_id", row.id);
  const code = generateInviteCode();
  const until = expiresAt("14");
  const { error } = await supabase.from("invites").insert({
    code,
    memo: `개인: ${row.name}`.slice(0, 100),
    max_uses: 1,
    expires_at: until.toISOString(),
    roster_id: row.id,
  });
  if (error) return { error: await actionError(error) };

  refresh();
  return { link: `${await getSiteUrl()}/join/${code}`, until: untilLabel(until) };
}

// 가입이 끝난(승인된) 사람은 회원 정보와 겹치므로 명단에서 지운다
export async function removeJoined(): Promise<RosterState> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase.from("roster").select("phone").returns<{ phone: string }[]>();
  if (error) return { error: await actionError(error) };
  const { map, error: membersError } = await memberStatusByPhone(supabase, (rows ?? []).map((r) => r.phone));
  if (membersError) return { error: await actionError(membersError) };
  const joined = [...map].filter(([, status]) => status === "active" || status === "restricted").map(([phone]) => phone);
  let removed = 0;
  for (const part of chunk(joined)) {
    const { error: deleteError, count } = await supabase.from("roster").delete({ count: "exact" }).in("phone", part);
    if (deleteError) {
      refresh();
      return { error: `${removed}명만 지우고 멈췄어요. ${await actionError(deleteError)}` };
    }
    removed += count ?? 0;
  }
  refresh();
  return { ok: `가입한 ${removed}명을 명단에서 지웠어요.` };
}

export async function removeRosterRows(_prev: RosterState, formData: FormData): Promise<RosterState> {
  const supabase = await createClient();
  const id = z.uuid().safeParse(formData.get("rosterId"));
  if (id.success) {
    const { error } = await supabase.from("roster").delete().eq("id", id.data);
    if (error) return { error: await actionError(error) };
    refresh();
    return { ok: "지웠어요." };
  }
  const list = listName.safeParse(formData.get("listName"));
  if (!list.success || formData.get("confirm") !== "on") return { error: "지울 명단을 확인하고 체크해 주세요." };
  const { error } = await supabase.from("roster").delete().eq("list_name", list.data);
  if (error) return { error: await actionError(error) };
  refresh();
  return { ok: `「${list.data || "이름 없는 명단"}」을 지웠어요.` };
}
