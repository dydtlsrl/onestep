// 페이지를 보여 주기 전에 로그인 세션을 갱신한다. (src/proxy.ts에서 호출)
// 접근 권한 판단은 여기서 하지 않고 각 페이지에서 한다.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = getSupabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // 로그인 쿠키가 담긴 응답이 캐시되어 다른 사람에게 가지 않도록 한다
        Object.entries(headers).forEach(([headerName, value]) => response.headers.set(headerName, value));
      },
    },
  });

  // 만료가 가까운 세션을 여기서 갱신한다. 이 줄과 createServerClient 사이에 다른 코드를 넣지 않는다.
  await supabase.auth.getClaims();

  return response;
}
