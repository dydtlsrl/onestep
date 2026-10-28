import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { parsePayRules } from "@/lib/pay";
import { PayCalculator } from "./pay-calculator";
import { PayRulesForm } from "./pay-rules-form";
import { CreateRoleForm, RoleItem, type RoleRow } from "./rate-forms";
import { reportLoadError } from "@/lib/error-log";

interface SettingRow {
  value: unknown;
  version: number;
  updated_at: string;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">{title}</h2>
        {description && <p className="text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

// 단가표: 자주 쓰는 보수 조건(시급·일급) 모음과 공통 계산 규칙. 일정을 만들 때 이 값을 불러온다.
export default async function RatesPage() {
  const { supabase } = await requireAdmin();
  const [{ data, error }, { data: setting }] = await Promise.all([
    supabase
      .from("job_roles")
      .select("id, name, description, pay_type, default_rate, min_paid_hours, overtime_rate, sort_order, is_active, default_for")
      .order("is_active", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .returns<RoleRow[]>(),
    supabase.from("app_settings").select("value, version, updated_at").eq("key", "pay_rules").maybeSingle<SettingRow>(),
  ]);
  // numeric 컬럼은 문자열로 올 수 있어 숫자로 바꾼다
  const roles = (data ?? []).map((r) => ({ ...r, min_paid_hours: r.min_paid_hours === null ? null : Number(r.min_paid_hours) }));
  const rules = parsePayRules(setting?.value);
  const nextOrder = roles.reduce((max, r) => Math.max(max, r.sort_order), 0) + 1;
  const activeRoles = roles.filter((r) => r.is_active);

  await reportLoadError("/admin/rates", error);
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">단가표</h1>
        <p className="text-sm leading-relaxed text-muted">
          자주 쓰는 보수 조건을 이름 붙여 저장해 두는 곳이에요 (인력에게 주는 금액, 세금 공제 전). 일정을 만들 때 날짜마다
          버튼 한 번으로 불러오고, ★ 세팅일 기본·진행일 기본으로 정한 것은 날짜를 추가하면 자동으로 들어가요.
        </p>
      </div>

      <Section
        title="공통 계산 규칙"
        description={
          setting
            ? `모든 역할에 같이 적용돼요. 버전 ${setting.version} · ${formatDate(setting.updated_at)} 저장. 이미 정산한 금액은 바뀌지 않아요.`
            : "설정을 불러오지 못했어요. 세 번째 마이그레이션(20261029000000_pay_rules.sql)을 적용했는지 확인해 주세요."
        }
      >
        <PayRulesForm rules={rules} />
      </Section>

      <Section title="새 단가">
        <CreateRoleForm nextOrder={nextOrder} rules={rules} />
      </Section>

      {error && <p className="text-sm font-bold text-warn">단가표를 불러오지 못했어요. 새로고침해 주세요.</p>}

      <section className="flex flex-col rounded-xl border border-line bg-white px-5 py-2">
        <ul className="flex flex-col">
          {roles.map((role) => (
            <RoleItem key={role.id} role={role} rules={rules} />
          ))}
          {!error && roles.length === 0 && (
            <li className="py-8 text-center text-sm text-muted">아직 저장한 단가가 없어요. 위에서 첫 단가를 추가해 주세요.</li>
          )}
        </ul>
      </section>

      <Section title="계산해 보기" description="단가와 근무 시간을 넣으면 받게 될 보수를 미리 볼 수 있어요.">
        <PayCalculator roles={activeRoles} rules={rules} />
      </Section>

      <p className="text-[13px] leading-relaxed text-muted">
        일정에는 불러온 순간의 금액이 복사돼요. 단가를 고치거나 숨겨도 이미 만든 일정의 금액은 그대로예요. 지난 기록을 지키기
        위해 지우지 않고 숨겨요.
      </p>
    </>
  );
}
