// 정산 정보(주민번호·계좌) 입력값 확인. 서버 액션에서 쓴다.
import { z } from "zod";
import { BANKS, maskAccount, maskRrn, normalizeAccount, normalizeRrn } from "@/lib/private-info";

const schema = z.object({
  rrn: z.string().trim().max(20),
  bank: z.enum(BANKS, { error: "은행을 골라 주세요." }),
  account: z.string().trim().max(30),
  holder: z.string().trim().min(1, "예금주를 적어 주세요.").max(30, "예금주는 30자까지 적을 수 있어요."),
  address: z.string().trim().max(200, "주소는 200자까지 적을 수 있어요."),
});

export interface PrivateInput {
  rrn: string | null; // 비우면 저장된 값을 그대로 둔다 (처음 등록할 때는 필수)
  account: string | null;
  bank: string;
  holder: string;
  address: string;
}

export function readPrivateForm(formData: FormData, hasExisting: boolean): { data?: PrivateInput; error?: string } {
  const parsed = schema.safeParse({
    rrn: formData.get("rrn") ?? "",
    bank: formData.get("bank") ?? "",
    account: formData.get("account") ?? "",
    holder: formData.get("holder") ?? "",
    address: formData.get("address") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력한 내용을 다시 확인해 주세요." };
  const v = parsed.data;

  let rrn: string | null = null;
  if (v.rrn) {
    rrn = normalizeRrn(v.rrn);
    if (!rrn) return { error: "주민등록번호 13자리를 정확히 적어 주세요." };
  } else if (!hasExisting) return { error: "주민등록번호를 적어 주세요." };

  let account: string | null = null;
  if (v.account) {
    account = normalizeAccount(v.account);
    if (!account) return { error: "계좌번호는 숫자(8~16자리)로 적어 주세요." };
  } else if (!hasExisting) return { error: "계좌번호를 적어 주세요." };

  return { data: { rrn, account, bank: v.bank, holder: v.holder, address: v.address } };
}

export { maskAccount, maskRrn };
