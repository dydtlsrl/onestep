// 서버(서버 컴포넌트, 서버 액션, 라우트 핸들러)에서 쓰는 Supabase 연결.
// 요청마다 새로 만든다. 로그인 정보는 쿠키에 들어 있다.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseEnv();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 src/proxy.ts가 하므로 무시해도 된다.
        }
      },
    },
  });
}
