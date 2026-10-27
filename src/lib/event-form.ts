// 일정 등록·수정 폼 입력값 검사. DB 함수(create_event, update_event)에 넘길 모양으로 바꾼다.
import { z } from "zod";
import { kstLocalToIso } from "@/lib/events";

const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "시간을 확인해 주세요.");
const optionalTime = z.union([z.literal(""), time]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 골라 주세요.");
const money = (label: string) =>
  z.coerce.number({ error: `${label}은(는) 숫자로 적어 주세요.` }).int().min(0).max(10_000_000, `${label}이(가) 너무 커요.`);

const positionSchema = z.object({
  id: z.uuid().optional(),
  roleId: z.uuid().nullable().optional(),
  roleName: z.string().trim().min(1, "역할 이름을 적어 주세요.").max(30, "역할 이름은 30자까지예요."),
  payType: z.enum(["hourly", "daily"]),
  rate: money("단가"),
  minPaidHours: z.union([z.literal(""), z.null(), z.coerce.number().min(0).max(24)]).optional(),
  overtimeRate: z.union([z.literal(""), z.null(), money("초과 금액")]).optional(),
  headcount: z.coerce.number({ error: "모집 인원을 숫자로 적어 주세요." }).int().min(1, "모집 인원은 1명 이상이에요.").max(500),
});

const daySchema = z
  .object({
    id: z.uuid().optional(),
    dayDate: date,
    kind: z.enum(["setup", "main", "other"]),
    recruit: z.enum(["open", "assign"]),
    gatherTime: optionalTime,
    startTime: time,
    endTime: time,
    positions: z.array(positionSchema).min(1, "날짜마다 모집 역할을 하나 이상 넣어 주세요.").max(20),
  })
  .refine((d) => d.endTime > d.startTime, { message: "끝나는 시간이 시작 시간보다 늦어야 해요.", path: ["endTime"] })
  .refine((d) => !d.gatherTime || d.gatherTime <= d.startTime, {
    message: "집합 시간은 시작 시간보다 빠르거나 같아야 해요.",
    path: ["gatherTime"],
  });

export const eventFormSchema = z.object({
  type: z.enum(["written_exam", "interview", "event", "other"]),
  title: z.string().trim().min(1, "일정 제목을 적어 주세요.").max(80, "제목은 80자까지예요."),
  clientName: z.string().trim().max(60, "고객사 이름은 60자까지예요."),
  locationName: z.string().trim().max(80),
  address: z.string().trim().max(200),
  notice: z.string().trim().max(2000, "안내사항은 2,000자까지예요."),
  chatLink: z.union([z.literal(""), z.string().trim().regex(/^https:\/\//, "톡방 링크는 https://로 시작해야 해요.").max(300)]),
  applyDeadline: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "신청 마감 시각을 확인해 주세요.")]),
  payDate: z.union([z.literal(""), date]),
  memo: z.string().trim().max(1000),
  days: z.array(daySchema).min(1, "날짜를 하나 이상 넣어 주세요.").max(31, "날짜는 31개까지예요."),
  allDaysRequired: z.boolean(),
  transportOn: z.boolean(),
  transportAmount: money("교통비"),
  transportPerDay: z.boolean(),
  regionalOn: z.boolean(),
  regionalCore: money("핵심 지방비"),
  regionalGeneral: money("일반 지방비"),
  regionalPerDay: z.boolean(),
});

export type EventFormInput = z.infer<typeof eventFormSchema>;

const digits = (value: FormDataEntryValue | null) => String(value ?? "").replace(/[^0-9]/g, "") || "0";

export function readEventForm(formData: FormData) {
  let days: unknown = [];
  try {
    days = JSON.parse(String(formData.get("days") ?? "[]"));
  } catch {
    days = [];
  }
  return eventFormSchema.safeParse({
    type: formData.get("type"),
    title: formData.get("title") ?? "",
    clientName: formData.get("clientName") ?? "",
    locationName: formData.get("locationName") ?? "",
    address: formData.get("address") ?? "",
    notice: formData.get("notice") ?? "",
    chatLink: String(formData.get("chatLink") ?? "").trim(),
    applyDeadline: formData.get("applyDeadline") ?? "",
    payDate: formData.get("payDate") ?? "",
    memo: formData.get("memo") ?? "",
    days,
    allDaysRequired: formData.get("allDaysRequired") === "on",
    transportOn: formData.get("transportOn") === "on",
    transportAmount: digits(formData.get("transportAmount")),
    transportPerDay: formData.get("transportUnit") !== "once",
    regionalOn: formData.get("regionalOn") === "on",
    regionalCore: digits(formData.get("regionalCore")),
    regionalGeneral: digits(formData.get("regionalGeneral")),
    regionalPerDay: formData.get("regionalUnit") !== "once",
  });
}

// 입력 오류를 "2일차: 끝나는 시간이..."처럼 어느 날짜의 문제인지 붙여 보여 준다
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "입력한 내용을 확인해 주세요.";
  const dayIndex = issue.path[0] === "days" && typeof issue.path[1] === "number" ? issue.path[1] : null;
  return dayIndex === null ? issue.message : `${dayIndex + 1}일차: ${issue.message}`;
}

// DB 함수 인자 모양으로 바꾼다
export function toEventRpcArgs(v: EventFormInput) {
  const event = {
    type: v.type,
    title: v.title,
    location_name: v.locationName,
    address: v.address,
    notice: v.notice,
    chat_link: v.chatLink,
    apply_deadline: kstLocalToIso(v.applyDeadline) ?? "",
    pay_date: v.payDate,
    // 공개 모집 날짜가 둘 이상일 때만 의미가 있다
    all_days_required: v.allDaysRequired && v.days.filter((d) => d.recruit === "open").length > 1,
  };
  const days = v.days.map((d) => ({
    ...(d.id ? { id: d.id } : {}),
    day_date: d.dayDate,
    kind: d.kind,
    recruit: d.recruit,
    gather_time: d.gatherTime,
    start_time: d.startTime,
    end_time: d.endTime,
    positions: d.positions.map((p) => ({
      ...(p.id ? { id: p.id } : {}),
      role_id: p.roleId ?? null,
      role_name: p.roleName,
      pay_type: p.payType,
      rate: p.rate,
      min_paid_hours: p.payType === "hourly" && p.minPaidHours !== "" && p.minPaidHours != null ? p.minPaidHours : null,
      overtime_rate: p.payType === "daily" && p.overtimeRate !== "" && p.overtimeRate != null ? p.overtimeRate : null,
      headcount: p.headcount,
    })),
  }));
  const extras = [
    ...(v.transportOn && v.transportAmount > 0 ? [{ type: "transport", tier: "all", amount: v.transportAmount, per_day: v.transportPerDay }] : []),
    ...(v.regionalOn && v.regionalCore > 0 ? [{ type: "regional", tier: "core", amount: v.regionalCore, per_day: v.regionalPerDay }] : []),
    ...(v.regionalOn && v.regionalGeneral > 0 ? [{ type: "regional", tier: "general", amount: v.regionalGeneral, per_day: v.regionalPerDay }] : []),
  ];
  return { event, days, extras, clientName: v.clientName, memo: v.memo };
}
