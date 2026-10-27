import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { decryptPii } from "@/lib/crypto";

interface Row {
  id: string;
  member_id: string;
  gross: number;
  income_tax: number;
  local_tax: number;
  net: number;
  member: { name: string } | null;
  event: { title: string } | null;
}

// 엑셀에서 수식으로 실행되지 않게 = + - @ 로 시작하는 값 앞에 ' 를 붙인다
function cell(value: string | number): string {
  let v = String(value);
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// 지급일별 파일 내려받기 (대표만)
//   kind=transfer: 은행 대량이체용 (은행, 계좌번호, 예금주, 금액, 받는 분 통장 표시)
//   kind=tax: 세무 신고용 (이름, 주민등록번호, 세전 금액, 소득세, 지방소득세, 실지급액)
// 주민번호·계좌 원문은 이 순간에만 풀어서 파일에 넣고, DB에는 열람 기록이 남는다.
export async function GET(request: NextRequest) {
  const { supabase } = await requireAdmin();
  const date = z.iso.date().safeParse(request.nextUrl.searchParams.get("date"));
  const kind = request.nextUrl.searchParams.get("kind") === "tax" ? "tax" : "transfer";
  if (!date.success) return new NextResponse("날짜가 올바르지 않아요.", { status: 400 });

  const { data } = await supabase
    .from("payments")
    .select("id, member_id, gross, income_tax, local_tax, net, member:profiles!payments_member_id_fkey(name), event:events(title)")
    .eq("pay_date", date.data)
    .in("status", kind === "transfer" ? ["scheduled"] : ["scheduled", "paid"])
    .order("member_id")
    .returns<Row[]>();
  const rows = data ?? [];
  if (rows.length === 0) return new NextResponse("이 날짜에 내려받을 정산이 없어요. (지급 예정인 정산만 들어가요)", { status: 404 });

  const memberIds = [...new Set(rows.map((r) => r.member_id))];
  const [{ data: secrets, error }, { data: privs }] = await Promise.all([
    supabase.rpc("admin_private_secrets", { p_member_ids: memberIds, p_purpose: "transfer" }),
    supabase.from("member_private").select("member_id, bank_name, account_holder").in("member_id", memberIds).returns<{ member_id: string; bank_name: string; account_holder: string }[]>(),
  ]);
  if (error) return new NextResponse("개인정보를 읽지 못했어요.", { status: 403 });
  const secretOf = new Map(((secrets ?? []) as { member_id: string; rrn_enc: string; account_enc: string }[]).map((s) => [s.member_id, s]));
  const privOf = new Map((privs ?? []).map((p) => [p.member_id, p]));

  const open = (value: string | undefined) => {
    if (!value) return "(미등록)";
    try {
      return decryptPii(value);
    } catch {
      return "(복호화 실패: 암호화 키 확인)";
    }
  };

  let lines: (string | number)[][];
  let total = 0;
  if (kind === "transfer") {
    // 같은 사람이 같은 날 여러 일정을 받으면 한 줄로 합친다
    const byMember = new Map<string, { name: string; net: number; titles: string[] }>();
    for (const r of rows) {
      const m = byMember.get(r.member_id) ?? { name: r.member?.name ?? "", net: 0, titles: [] };
      m.net += r.net;
      if (r.event) m.titles.push(r.event.title);
      byMember.set(r.member_id, m);
    }
    lines = [["은행", "계좌번호", "예금주", "금액", "받는 분 통장 표시", "이름", "내용"]];
    for (const [memberId, m] of byMember) {
      const p = privOf.get(memberId);
      total += m.net;
      lines.push([p?.bank_name ?? "(미등록)", open(secretOf.get(memberId)?.account_enc), p?.account_holder ?? "", m.net, "원스텝", m.name, m.titles.join(", ")]);
    }
  } else {
    lines = [["이름", "주민등록번호", "일정", "세전 금액", "소득세", "지방소득세", "실지급액"]];
    for (const r of rows) {
      total += r.net;
      lines.push([r.member?.name ?? "", open(secretOf.get(r.member_id)?.rrn_enc), r.event?.title ?? "", r.gross, r.income_tax, r.local_tax, r.net]);
    }
  }

  await supabase.rpc("log_payment_export", { p_pay_date: date.data, p_count: lines.length - 1, p_total: total });

  const csv = "﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
  const name = `${kind === "transfer" ? "이체" : "원천징수"}_${date.data}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
