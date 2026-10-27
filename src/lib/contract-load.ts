// 계약서 화면에서 주민번호를 어떻게 보여 줄지 정한다. 서버에서만 쓴다.
import "server-only";
import { decryptPii } from "@/lib/crypto";
import type { RrnDisplay } from "@/lib/contract";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// 설정이 "전체 표시"면 암호문을 받아 풀고, 아니면 가린 값을 쓴다.
// 대표가 남의 계약서를 볼 때는 admin_private_secrets가 열람 기록을 남긴다.
export async function contractRrn(
  supabase: Supabase,
  opts: { display: RrnDisplay; memberId: string; viewerId: string; masked: string },
): Promise<string> {
  if (opts.display !== "full" || !opts.masked) return opts.masked;
  try {
    if (opts.memberId === opts.viewerId) {
      const { data } = await supabase.rpc("my_private_secrets");
      const row = (data as { rrn_enc: string }[] | null)?.[0];
      return row ? decryptPii(row.rrn_enc) : opts.masked;
    }
    const { data } = await supabase.rpc("admin_private_secrets", { p_member_ids: [opts.memberId], p_purpose: "contract" });
    const row = (data as { rrn_enc: string }[] | null)?.[0];
    return row ? decryptPii(row.rrn_enc) : opts.masked;
  } catch {
    // 키가 없거나 바뀌었으면 가린 값으로 보여 준다
    return opts.masked;
  }
}
