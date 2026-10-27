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
  SETTING_NOT_FOUND: "계산 규칙이 아직 없어요. 세 번째 마이그레이션 파일을 적용했는지 확인해 주세요.",
  POSITIONS_REQUIRED: "모집 역할을 하나 이상 넣어 주세요.",
  EVENT_NOT_FOUND: "일정을 찾을 수 없어요. 목록에서 다시 열어 주세요.",
  EVENT_LOCKED: "완료되었거나 취소된 일정이라 바꿀 수 없어요.",
  POSITION_IN_USE: "신청자가 있는 역할은 지울 수 없어요. 인원만 바꿔 주세요.",
  INVALID_TRANSITION: "지금 상태에서는 그렇게 바꿀 수 없어요. 화면을 새로고침해 주세요.",
  EVENT_NOT_OPEN: "지금은 신청을 받지 않는 일정이에요.",
  DEADLINE_PASSED: "신청이 마감되었어요.",
  NOT_ACTIVE_MEMBER: "활동 중인 회원만 신청할 수 있어요.",
  APPLICATION_NOT_FOUND: "취소할 신청이 없어요. 화면을 새로고침해 주세요.",
  ASK_ADMIN: "확정된 일정은 직접 취소할 수 없어요. 대표님께 연락해 주세요.",
  NOT_SELECTED: "확정된 사람만 출석을 확인할 수 있어요.",
};

export function messageForError(error: { message?: string } | null | undefined): string {
  const code = error?.message?.trim() ?? "";
  return MESSAGES[code] ?? "문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
}
