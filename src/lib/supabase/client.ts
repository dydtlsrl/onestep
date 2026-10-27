// 브라우저(클라이언트 컴포넌트)에서 쓰는 Supabase 연결
import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "@/lib/env";

export function createClient() {
  const { url, key } = getSupabaseEnv();
  return createBrowserClient(url, key);
}
