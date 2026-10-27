// 로그아웃. /auth/signout 으로 POST 요청을 보낸다.
export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button type="submit" className="text-sm text-muted underline underline-offset-4 hover:text-ink">
        로그아웃
      </button>
    </form>
  );
}
