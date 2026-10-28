// DB 함수가 돌려주는 오류 코드를 화면에 보여 줄 한국어 문장으로 바꾼다.
// 코드 목록은 supabase/migrations의 raise exception 문과 같아야 한다.

const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: "로그인이 필요해요. 다시 로그인해 주세요.",
  PRIVACY_REQUIRED: "개인정보 수집·이용에 동의해야 가입 신청을 할 수 있어요.",
  ALREADY_APPLIED: "이미 가입 신청을 했어요.",
  ALREADY_APPLIED_EVENT: "이미 이 일정에 신청했어요.",
  INVITE_INVALID: "초대 링크가 만료되었거나 더 이상 쓸 수 없어요. 대표님께 새 링크를 요청해 주세요.",
  INVALID_INPUT: "입력한 내용을 다시 확인해 주세요.",
  PHONE_TAKEN: "이미 가입된 휴대폰 번호예요. 다른 방법(카카오/구글)으로 가입한 적이 있는지 확인해 주세요.",
  NOT_ADMIN: "대표 계정만 할 수 있어요.",
  NOT_PENDING: "이미 처리된 가입 신청이에요. 화면을 새로고침해 주세요.",
  MEMBER_NOT_FOUND: "활동 중이거나 제한된 회원만 등급을 바꿀 수 있어요.",
  REASON_REQUIRED: "제한 사유를 적어 주세요. (500자까지)",
  CANNOT_TARGET_ADMIN: "대표 계정은 제한할 수 없어요.",
  NOT_ACTIVE: "활동 중인 회원만 제한할 수 있어요. 화면을 새로고침해 주세요.",
  NOT_RESTRICTED: "제한된 회원이 아니에요. 화면을 새로고침해 주세요.",
  SETTING_NOT_FOUND: "설정이 아직 없어요. 마이그레이션 파일을 모두 적용했는지 확인해 주세요.",
  DAYS_REQUIRED: "날짜를 하나 이상 넣어 주세요.",
  CHOOSE_DAYS: "참여할 날짜를 골라 주세요.",
  ALL_DAYS_REQUIRED: "이 일정은 모든 날짜에 참여할 수 있는 분만 신청할 수 있어요.",
  EVENT_NOT_FOUND: "일정을 찾을 수 없어요. 목록에서 다시 열어 주세요.",
  EVENT_LOCKED: "완료되었거나 취소된 일정이라 바꿀 수 없어요.",
  DAY_IN_USE: "신청이 있는 날짜는 뺄 수 없어요. 시간이나 인원만 바꿔 주세요.",
  INVALID_TRANSITION: "지금 상태에서는 그렇게 바꿀 수 없어요. 화면을 새로고침해 주세요.",
  EVENT_NOT_OPEN: "지금은 신청을 받지 않는 일정이에요.",
  DEADLINE_PASSED: "신청이 마감되었어요.",
  NOT_ACTIVE_MEMBER: "활동 중인 회원만 신청할 수 있어요.",
  APPLICATION_NOT_FOUND: "취소할 신청이 없어요. 화면을 새로고침해 주세요.",
  ASK_ADMIN: "확정된 일정은 직접 취소할 수 없어요. 대표님께 연락해 주세요.",
  NOT_SELECTED: "확정된 사람만 처리할 수 있어요. 화면을 새로고침해 주세요.",
  CONTRACT_EXISTS: "이미 보낸 계약서가 있어요. 내용을 바꾸려면 먼저 무효로 해 주세요.",
  CONTRACT_NOT_FOUND: "계약서를 찾을 수 없어요. 화면을 새로고침해 주세요.",
  CONTRACT_NOT_OPEN: "이미 서명했거나 무효가 된 계약서예요.",
  PRIVATE_REQUIRED: "서명하기 전에 주민등록번호와 계좌를 먼저 등록해 주세요.",
  SIGNATURE_REQUIRED: "서명란에 서명해 주세요.",
  PAYMENT_LOCKED: "지급 완료되었거나 보류 중인 정산은 고칠 수 없어요. 보류를 먼저 풀어 주세요.",
  NOT_DEVELOPER: "개발자 계정만 할 수 있어요.",
  PII_KEY_MISSING: "암호화 키(PII_ENCRYPTION_KEY)가 설정되지 않았어요. 대표님께 알려 주세요.",
};

// 앱이 사용자에게 안내하는 오류 코드인지 (모르는 오류는 버그일 수 있다)
export function isKnownError(code: string): boolean {
  return Object.hasOwn(MESSAGES, code);
}

export function messageForError(error: { message?: string } | null | undefined): string {
  const code = error?.message?.trim() ?? "";
  return MESSAGES[code] ?? "문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
}
