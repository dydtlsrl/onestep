// 자동 테스트 도우미: 테스트용 로그인 계정 만들기, 그 계정으로 로그인된 브라우저 열기.
// 실제 서비스는 카카오·Google로만 로그인하지만, 테스트용 Supabase에서는 이메일·비밀번호 계정을 만들어
// 같은 로그인 쿠키를 브라우저에 넣는다. 앱은 쿠키만 보고 누구인지 알기 때문에 실제 로그인과 똑같이 동작한다.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Browser, Page } from "@playwright/test";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 없어요. supabase status -o env 값을 넣어 주세요.`);
  return value;
}

const url = () => env("NEXT_PUBLIC_SUPABASE_URL");

// 권한 규칙(RLS)을 거치지 않는 관리용 연결 (테스트용 Supabase에서만 쓴다)
export function serviceClient() {
  return createClient(url(), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

export interface Account {
  id: string;
  email: string;
  password: string;
}

export async function createAccount(label: string): Promise<Account> {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@e2e.test`;
  const password = `pw-${Math.random().toString(36).slice(2)}-A1`;
  const { data, error } = await serviceClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`테스트 계정을 만들지 못했어요: ${error?.message}`);
  return { id: data.user.id, email, password };
}

// 이 계정으로 로그인했을 때 앱이 쓰는 쿠키 (@supabase/ssr과 같은 이름·모양)
async function sessionCookies(account: Account) {
  const jar: { name: string; value: string }[] = [];
  const supabase = createServerClient(url(), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    cookies: {
      getAll: () => jar,
      setAll: (cookies) => {
        for (const c of cookies) {
          const i = jar.findIndex((x) => x.name === c.name);
          if (i >= 0) jar.splice(i, 1);
          if (c.value) jar.push({ name: c.name, value: c.value });
        }
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email: account.email, password: account.password });
  if (error) throw new Error(`테스트 로그인 실패: ${error.message}`);
  return jar;
}

// 로그인된 새 브라우저 창. 확인 창(confirm)은 모두 "확인"으로 누른다.
export async function openAs(browser: Browser, account: Account): Promise<Page> {
  const context = await browser.newContext();
  const cookies = await sessionCookies(account);
  await context.addCookies(cookies.map((c) => ({ ...c, domain: "localhost", path: "/", sameSite: "Lax" as const })));
  const page = await context.newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  return page;
}

// 실패했을 때 GitHub Actions 로그에서 바로 원인을 볼 수 있게 화면 글자를 남긴다
export async function dumpPage(page: Page, label: string) {
  const text = await page.locator("body").innerText().catch(() => "(읽지 못함)");
  console.log(`\n----- ${label}: ${page.url()} -----\n${text.slice(0, 3000)}\n-----`);
}
