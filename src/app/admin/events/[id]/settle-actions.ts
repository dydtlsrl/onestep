"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { placeholderValues, renderTemplate } from "@/lib/contract";
import { messageForError } from "@/lib/errors";
import { sumItems, type PaymentItemKind } from "@/lib/settlement";
import { contractTerms, loadSettlement, type MemberSettlement, type Settlement } from "@/lib/settlement-load";
import { createClient } from "@/lib/supabase/server";
import { calculateTax } from "@/lib/tax";

export interface SettleState {
  error?: string;
  ok?: string;
}

// 아래 기능은 모두 DB 함수가 대표인지 다시 확인한다

function refresh(eventId: string) {
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin/payments");
}

// 계약 ------------------------------------------------------------------------

// 아직 계약서가 없는 확정자 모두에게 (또는 고른 사람에게) 계약서를 보낸다
export async function requestContracts(_prev: SettleState, formData: FormData): Promise<SettleState> {
  const eventId = z.uuid().safeParse(formData.get("eventId"));
  if (!eventId.success) return { error: "잘못된 요청이에요." };
  const only = formData.getAll("memberId").map(String);

  const supabase = await createClient();
  const [s, { data: template }, { data: active }] = await Promise.all([
    loadSettlement(supabase, eventId.data),
    supabase.from("contract_templates").select("id, title, body").order("version", { ascending: false }).limit(1).maybeSingle<{ id: string; title: string; body: string }>(),
    supabase.from("contracts").select("member_id").eq("event_id", eventId.data).neq("status", "voided").returns<{ member_id: string }[]>(),
  ]);
  if (!s) return { error: messageForError({ message: "EVENT_NOT_FOUND" }) };
  if (!template) return { error: "계약서 양식이 없어요. 마이그레이션 9를 적용했는지 확인해 주세요." };

  const sent = new Set((active ?? []).map((c) => c.member_id));
  const targets = s.members.filter((m) => !sent.has(m.memberId) && (only.length === 0 || only.includes(m.memberId)));
  if (targets.length === 0) return { error: "계약서를 보낼 확정자가 없어요. 이미 모두 보냈어요." };

  let done = 0;
  for (const m of targets) {
    const terms = contractTerms(s, m);
    const { error } = await supabase.rpc("request_contract", {
      p_event_id: s.event.id,
      p_member_id: m.memberId,
      p_template_id: template.id,
      p_title: template.title,
      p_body: renderTemplate(template.body, placeholderValues(terms)),
      p_terms: terms,
    });
    if (error) {
      refresh(s.event.id);
      return { error: `${m.name}님에게 보내다 멈췄어요 (${done}명 보냄): ${messageForError(error)}` };
    }
    done += 1;
  }
  refresh(s.event.id);
  return { ok: `${done}명에게 계약서를 보냈어요. 알림이 갔어요.` };
}

export async function remindContracts(_prev: SettleState, formData: FormData): Promise<SettleState> {
  const eventId = z.uuid().safeParse(formData.get("eventId"));
  if (!eventId.success) return { error: "잘못된 요청이에요." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remind_contracts", { p_event_id: eventId.data });
  if (error) return { error: messageForError(error) };
  refresh(eventId.data);
  return { ok: data ? `서명하지 않은 ${data}명에게 다시 알렸어요.` : "서명을 기다리는 사람이 없어요." };
}

export async function voidContract(_prev: SettleState, formData: FormData): Promise<SettleState> {
  const eventId = z.uuid().safeParse(formData.get("eventId"));
  const contractId = z.uuid().safeParse(formData.get("contractId"));
  if (!eventId.success || !contractId.success) return { error: "잘못된 요청이에요." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "무효로 하는 이유를 적어 주세요." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_contract", { p_contract_id: contractId.data, p_reason: reason.slice(0, 300) });
  if (error) return { error: messageForError(error) };
  refresh(eventId.data);
  return { ok: "무효로 했어요. 필요하면 다시 보낼 수 있어요." };
}

// 정산 ------------------------------------------------------------------------

async function savePayment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  s: Settlement,
  m: MemberSettlement,
  items: { kind: PaymentItemKind; label: string; amount: number; day_id: string | null }[],
  opts: { payDate: string; edited: boolean; memo: string },
) {
  const { workAmount, extraAmount } = sumItems(items);
  const tax = calculateTax(workAmount, extraAmount, s.tax);
  return supabase.rpc("save_payment", {
    p_event_id: s.event.id,
    p_member_id: m.memberId,
    p_pay_date: opts.payDate,
    p_items: items,
    p_tax: { type: tax.type, rule: { ...tax.rule, base: tax.base, exempt: tax.exempt }, income_tax: tax.incomeTax, local_tax: tax.localTax },
    p_edited: opts.edited,
    p_memo: opts.memo,
  });
}

// 출석 기록으로 확정자 모두의 정산을 만들거나 다시 계산한다.
// 지급 완료·보류된 사람과, 직접 고친 사람(reset이 아니면)은 건드리지 않는다.
export async function generatePayments(_prev: SettleState, formData: FormData): Promise<SettleState> {
  const eventId = z.uuid().safeParse(formData.get("eventId"));
  if (!eventId.success) return { error: "잘못된 요청이에요." };
  const only = formData.get("memberId") ? String(formData.get("memberId")) : null;
  const reset = formData.get("reset") === "1";

  const supabase = await createClient();
  const s = await loadSettlement(supabase, eventId.data);
  if (!s) return { error: messageForError({ message: "EVENT_NOT_FOUND" }) };
  const { data: existing } = await supabase
    .from("payments")
    .select("member_id, status, edited, pay_date")
    .eq("event_id", s.event.id)
    .returns<{ member_id: string; status: string; edited: boolean; pay_date: string }[]>();
  const current = new Map((existing ?? []).map((p) => [p.member_id, p]));

  let done = 0;
  let skipped = 0;
  for (const m of s.members) {
    if (only && m.memberId !== only) continue;
    const p = current.get(m.memberId);
    if (p && (p.status === "paid" || p.status === "held" || (p.edited && !reset))) {
      skipped += 1;
      continue;
    }
    if (m.actual.items.length === 0) {
      skipped += 1;
      continue;
    }
    const { error } = await savePayment(supabase, s, m, m.actual.items, { payDate: p?.pay_date ?? s.payDate, edited: false, memo: "" });
    if (error) {
      refresh(s.event.id);
      return { error: `${m.name}님 정산에서 멈췄어요 (${done}명 완료): ${messageForError(error)}` };
    }
    done += 1;
  }
  refresh(s.event.id);
  if (done === 0) return { error: skipped > 0 ? "새로 계산할 사람이 없어요. (지급 완료·보류·직접 고친 정산은 그대로 둬요)" : "확정된 사람이 없어요." };
  return { ok: `${done}명의 정산을 계산했어요.${skipped > 0 ? ` ${skipped}명은 그대로 뒀어요.` : ""}` };
}

const itemSchema = z.object({
  kind: z.enum(["work", "overtime", "transport", "regional", "other"]),
  label: z.string().trim().min(1, "항목 이름을 적어 주세요.").max(60, "항목 이름은 60자까지예요."),
  amount: z.number().int("금액은 원 단위 숫자로 적어 주세요.").min(0, "금액은 0원 이상이에요.").max(10_000_000, "금액이 너무 커요."),
  day_id: z.uuid().nullable(),
});

// 한 사람의 지급 항목을 직접 고친다 (세금은 설정대로 다시 계산)
export async function saveEditedPayment(_prev: SettleState, formData: FormData): Promise<SettleState> {
  const eventId = z.uuid().safeParse(formData.get("eventId"));
  const memberId = z.uuid().safeParse(formData.get("memberId"));
  const payDate = z.iso.date().safeParse(formData.get("payDate"));
  if (!eventId.success || !memberId.success) return { error: "잘못된 요청이에요." };
  if (!payDate.success) return { error: "지급 예정일을 골라 주세요." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "잘못된 요청이에요." };
  }
  const items = z.array(itemSchema).min(1, "항목을 하나 이상 넣어 주세요.").max(100).safeParse(raw);
  if (!items.success) return { error: items.error.issues[0]?.message ?? "입력한 내용을 다시 확인해 주세요." };
  const memo = String(formData.get("memo") ?? "").trim().slice(0, 300);

  const supabase = await createClient();
  const s = await loadSettlement(supabase, eventId.data);
  const m = s?.members.find((x) => x.memberId === memberId.data);
  if (!s || !m) return { error: messageForError({ message: "NOT_SELECTED" }) };

  const { error } = await savePayment(supabase, s, m, items.data, { payDate: payDate.data, edited: true, memo });
  if (error) return { error: messageForError(error) };
  refresh(s.event.id);
  return { ok: `${m.name}님 정산을 저장했어요.` };
}
