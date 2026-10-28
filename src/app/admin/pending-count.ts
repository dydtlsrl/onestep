import { cache } from "react";
import { requireAdmin } from "@/lib/auth";

// 승인을 기다리는 가입 신청 수. 왼쪽 메뉴와 회원 화면의 탭에 같이 쓰므로 요청당 한 번만 센다.
export const getPendingCount = cache(async () => {
  const { supabase } = await requireAdmin();
  const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending");
  return count ?? 0;
});
