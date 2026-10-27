// 일정 등록·수정 폼 입력값 검사. DB 함수(create_event, update_event)에 넘길 모양으로 바꾼다.
import { z } from "zod";
import { kstLocalToIso } from "@/lib/events";

const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "시간을 확인해 주세요.");
const optionalTime = z.union([z.literal(""), time]);
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

export const eventFormSchema = z
  .object({
    type: z.enum(["written_exam", "interview", "event", "other"]),
    title: z.string().trim().min(1, "일정 제목을 적어 주세요.").max(80, "제목은 80자까지예요."),
    clientName: z.string().trim().max(60, "고객사 이름은 60자까지예요."),
    eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 골라 주세요."),
    gatherTime: optionalTime,
    startTime: time,
    endTime: time,
    locationName: z.string().trim().max(80),
    address: z.string().trim().max(200),
    notice: z.string().trim().max(2000, "안내사항은 2,000자까지예요."),
    chatLink: z.union([z.literal(""), z.string().trim().regex(/^https:\/\//, "톡방 링크는 https://로 시작해야 해요.").max(300)]),
    applyDeadline: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "신청 마감 시각을 확인해 주세요.")]),
    payDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
    memo: z.string().trim().max(1000),
    positions: z.array(positionSchema).min(1, "모집 역할을 하나 이상 넣어 주세요.").max(20),
    transportOn: z.boolean(),
    transportAmount: money("교통비"),
    regionalOn: z.boolean(),
    regionalCore: money("핵심 지방비"),
    regionalGeneral: money("일반 지방비"),
  })
  .refine((v) => v.endTime > v.startTime, { message: "끝나는 시간이 시작 시간보다 늦어야 해요.", path: ["endTime"] })
  .refine((v) => !v.gatherTime || v.gatherTime <= v.startTime, {
    message: "집합 시간은 시작 시간보다 빠르거나 같아야 해요.",
    path: ["gatherTime"],
  });

export type EventFormInput = z.infer<typeof eventFormSchema>;

const digits = (value: FormDataEntryValue | null) => String(value ?? "").replace(/[^0-9]/g, "") || "0";

export function readEventForm(formData: FormData) {
  let positions: unknown = [];
  try {
    positions = JSON.parse(String(formData.get("positions") ?? "[]"));
  } catch {
    positions = [];
  }
  return eventFormSchema.safeParse({
    type: formData.get("type"),
    title: formData.get("title") ?? "",
    clientName: formData.get("clientName") ?? "",
    eventDate: formData.get("eventDate") ?? "",
    gatherTime: formData.get("gatherTime") ?? "",
    startTime: formData.get("startTime") ?? "",
    endTime: formData.get("endTime") ?? "",
    locationName: formData.get("locationName") ?? "",
    address: formData.get("address") ?? "",
    notice: formData.get("notice") ?? "",
    chatLink: String(formData.get("chatLink") ?? "").trim(),
    applyDeadline: formData.get("applyDeadline") ?? "",
    payDate: formData.get("payDate") ?? "",
    memo: formData.get("memo") ?? "",
    positions,
    transportOn: formData.get("transportOn") === "on",
    transportAmount: digits(formData.get("transportAmount")),
    regionalOn: formData.get("regionalOn") === "on",
    regionalCore: digits(formData.get("regionalCore")),
    regionalGeneral: digits(formData.get("regionalGeneral")),
  });
}

// DB 함수 인자 모양으로 바꾼다
export function toEventRpcArgs(v: EventFormInput) {
  const event = {
    type: v.type,
    title: v.title,
    event_date: v.eventDate,
    gather_time: v.gatherTime,
    start_time: v.startTime,
    end_time: v.endTime,
    location_name: v.locationName,
    address: v.address,
    notice: v.notice,
    chat_link: v.chatLink,
    apply_deadline: kstLocalToIso(v.applyDeadline) ?? "",
    pay_date: v.payDate,
  };
  const positions = v.positions.map((p) => ({
    ...(p.id ? { id: p.id } : {}),
    role_id: p.roleId ?? null,
    role_name: p.roleName,
    pay_type: p.payType,
    rate: p.rate,
    min_paid_hours: p.payType === "hourly" && p.minPaidHours !== "" && p.minPaidHours != null ? p.minPaidHours : null,
    overtime_rate: p.payType === "daily" && p.overtimeRate !== "" && p.overtimeRate != null ? p.overtimeRate : null,
    headcount: p.headcount,
  }));
  const extras = [
    ...(v.transportOn && v.transportAmount > 0 ? [{ type: "transport", tier: "all", amount: v.transportAmount }] : []),
    ...(v.regionalOn && v.regionalCore > 0 ? [{ type: "regional", tier: "core", amount: v.regionalCore }] : []),
    ...(v.regionalOn && v.regionalGeneral > 0 ? [{ type: "regional", tier: "general", amount: v.regionalGeneral }] : []),
  ];
  return { event, positions, extras, clientName: v.clientName, memo: v.memo };
}
