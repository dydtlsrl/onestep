"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { messageForError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export interface PayStatusState {
  error?: string;
  ok?: string;
}

const LABEL = { paid: "지급 완료로", held: "보류로", scheduled: "지급 예정으로" } as const;

// 고른 정산을 지급 완료·보류·지급 예정으로 바꾼다. 지급 완료면 회원에게 알림이 간다.
export async function setPaymentStatus(_prev: PayStatusState, formData: FormData): Promise<PayStatusState> {
  const ids = z.array(z.uuid()).min(1).max(500).safeParse(formData.getAll("paymentId"));
  const status = z.enum(["paid", "held", "scheduled"]).safeParse(formData.get("status"));
  if (!status.success) return { error: "잘못된 요청이에요." };
  if (!ids.success) return { error: "처리할 사람을 골라 주세요." };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (status.data === "held" && !reason) return { error: "보류 사유를 적어 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_payment_status", { p_payment_ids: ids.data, p_status: status.data, p_reason: reason });
  if (error) return { error: messageForError(error) };
  revalidatePath("/admin/payments");
  revalidatePath("/admin/events", "layout");
  const skipped = ids.data.length - Number(data ?? 0);
  return {
    ok: `${data}명을 ${LABEL[status.data]} 바꿨어요.${skipped > 0 ? ` ${skipped}명은 지금 상태에서 바꿀 수 없어 그대로 뒀어요. (확정 전은 세금 설정이 필요해요)` : ""}`,
  };
}
