// 가입 신청서 입력값 검사. 서버에서도 같은 규칙으로 한 번 더 검사한다(DB 함수).
import { z } from "zod";
import { isValidMobile, normalizePhone } from "@/lib/phone";

export const signupSchema = z.object({
  code: z.string().min(1),
  name: z.string().trim().min(1, "이름을 입력해 주세요.").max(40, "이름은 40자까지 쓸 수 있어요."),
  phone: z
    .string()
    .transform(normalizePhone)
    .refine(isValidMobile, "휴대폰 번호를 확인해 주세요. (예: 010-1234-5678)"),
  region: z.string().trim().max(40, "40자까지 쓸 수 있어요."),
  careerYears: z.coerce
    .number({ error: "숫자로 입력해 주세요." })
    .int("숫자로 입력해 주세요.")
    .min(0, "0 이상으로 입력해 주세요.")
    .max(60, "60 이하로 입력해 주세요."),
  careerNote: z.string().trim().max(1000, "1,000자까지 쓸 수 있어요."),
  referrerName: z.string().trim().max(40, "40자까지 쓸 수 있어요."),
  privacy: z.literal("on", { error: "개인정보 수집·이용에 동의해 주세요." }),
});

export type SignupInput = z.infer<typeof signupSchema>;

export function readSignupForm(formData: FormData) {
  return signupSchema.safeParse({
    code: formData.get("code") ?? "",
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
    region: formData.get("region") ?? "",
    careerYears: formData.get("careerYears") ?? "",
    careerNote: formData.get("careerNote") ?? "",
    referrerName: formData.get("referrerName") ?? "",
    privacy: formData.get("privacy") ?? undefined,
  });
}
