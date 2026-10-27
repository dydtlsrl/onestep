import { requireAdmin } from "@/lib/auth";
import { CreateRoleForm, RoleItem, type RoleRow } from "./rate-forms";

// 단가표: 역할별 인력 1회 보수. 일정을 등록할 때 이 값을 불러온다.
export default async function RatesPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("job_roles")
    .select("id, name, description, default_rate, sort_order, is_active")
    .order("is_active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .returns<RoleRow[]>();
  const roles = data ?? [];
  const nextOrder = roles.reduce((max, r) => Math.max(max, r.sort_order), 0) + 1;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">단가표</h1>
        <p className="text-sm leading-relaxed text-muted">
          역할별로 인력에게 주는 1회 근무 보수(세금 공제 전)예요. 고객사와 계약한 금액이 아니에요. 일정을 등록할 때 이
          값을 불러오고, 일정마다 바꿀 수 있어요.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
        <h2 className="text-lg font-bold">새 역할</h2>
        <CreateRoleForm nextOrder={nextOrder} />
      </section>

      {error && <p className="text-sm font-bold text-warn">단가표를 불러오지 못했어요. 새로고침해 주세요.</p>}

      <section className="flex flex-col rounded-xl border border-line bg-white px-5 py-2">
        <ul className="flex flex-col">
          {roles.map((role) => (
            <RoleItem key={role.id} role={role} />
          ))}
          {!error && roles.length === 0 && (
            <li className="py-8 text-center text-sm text-muted">아직 등록한 역할이 없어요. 위에서 첫 역할을 추가해 주세요.</li>
          )}
        </ul>
      </section>
      <p className="text-[13px] leading-relaxed text-muted">
        숨긴 역할은 새 일정에서 고를 수 없지만, 이미 등록한 일정의 금액에는 영향이 없어요. 지난 기록을 지키기 위해 역할은
        지우지 않고 숨겨요.
      </p>
    </>
  );
}
