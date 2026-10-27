// DB 함수가 돌려주는 오류 코드를 화면에 보여 줄 한국어 문장으로 바꾼다.
// 코드 목록은 supabase/migrations의 raise exception 문과 같아야 한다.

const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: "로그인이 필요해요. 다시 로그인해 주세요.",
  PRIVACY_REQUIRED: "개인정보 수집·이용에 동의해야 가입 신청을 할 수 있어요.",
  ALREADY_APPLIED: "이미 가입 신청을 했어요.",
  INVITE_INVALID: "초대 링크가 만료되었거나 더 이상 쓸 수 없어요. 대표님께 새 링크를 요청해 주세요.",
  INVALID_INPUT: "입력한 내용을 다시 확인해 주세요.",
  PHONE_TAKEN: "이미 가입된 휴대폰 번호예요. 다른 방법(카카오/구글)으로 가입한 적이 있는지 확인해 주세요.",
  NOT_ADMIN: "대표 계정만 할 수 있어요.",
  NOT_PENDING: "이미 처리된 가입 신청이에요. 화면을 새로고침해 주세요.",
};

export function messageForError(error: { message?: string } | null | undefined): string {
  const code = error?.message?.trim() ?? "";
  return MESSAGES[code] ?? "문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
}
