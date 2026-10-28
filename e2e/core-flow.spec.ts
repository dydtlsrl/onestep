// 핵심 흐름 한 바퀴: 초대 → 가입 신청 → 승인 → 일정 등록·공개 → 신청 → 확정·알림 → 계약서 보내기 → 정산 정보 등록·서명
// → 출석 → 세금 설정 → 정산 만들기 → 지급 완료 → 회원이 받은 금액 확인.
// 대표와 회원이 각자 브라우저 창을 열고 실제 화면의 버튼을 누른다.
import { expect, test, type Page } from "@playwright/test";
import { createAccount, dumpPage, openAs, serviceClient } from "./support";

// 한국 시간 기준 n일 뒤 (2026-11-05)
function kstDate(daysFromToday: number): string {
  const d = new Date(Date.now() + 9 * 3600_000 + daysFromToday * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const pages: Record<string, Page> = {};

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    for (const [label, page] of Object.entries(pages)) await dumpPage(page, label);
  }
});

test("대표와 회원이 일정 하나를 가입부터 지급까지 처리한다", async ({ browser }) => {
  const suffix = Date.now().toString().slice(-7);
  const memberName = `테스트회원${suffix.slice(-3)}`;
  const memberPhone = `0109${suffix}`;
  const title = `E2E 필기시험 ${suffix}`;

  // 대표 계정: 처음 대표 계정은 SQL로 만드는 것과 같게 회원 정보를 직접 넣는다 (README 9단계)
  const adminAccount = await createAccount("admin");
  const { error: adminError } = await serviceClient()
    .from("profiles")
    .insert({ id: adminAccount.id, name: "테스트대표", phone: `0108${suffix}`, role: "admin", status: "active", tier: "core", privacy_agreed_at: new Date().toISOString(), approved_at: new Date().toISOString() });
  expect(adminError).toBeNull();
  const memberAccount = await createAccount("member");

  const admin = (pages.admin = await openAs(browser, adminAccount));
  const member = (pages.member = await openAs(browser, memberAccount));

  let inviteLink = "";
  await test.step("대표: 초대 링크 만들기", async () => {
    await admin.goto("/admin/invites");
    await admin.getByLabel("메모 (어디에 보낼 링크인지)").fill("E2E 테스트");
    await admin.getByRole("button", { name: "링크 만들기" }).click();
    const link = admin.getByRole("status").filter({ hasText: "/join/" });
    await expect(link).toBeVisible();
    inviteLink = (await link.locator("span").first().innerText()).trim();
    expect(inviteLink).toMatch(/\/join\/[A-Za-z0-9_-]+$/);
  });

  await test.step("회원: 초대 링크로 가입 신청", async () => {
    await member.goto(new URL(inviteLink).pathname);
    await expect(member).toHaveURL(/\/signup\//);
    await member.locator("#name").fill(memberName);
    await member.locator("#phone").fill(memberPhone);
    await member.locator("#careerYears").fill("2");
    await member.locator("#privacy").check();
    await member.getByRole("button", { name: "가입 신청하기" }).click();
    await expect(member).toHaveURL(/\/pending/);
    // 제목으로 찾는다 (Next.js가 화면을 옮길 때 숨은 안내 칸에 같은 글자를 넣기 때문)
    await expect(member.getByRole("heading", { name: "가입 신청이 완료되었어요" })).toBeVisible();
  });

  await test.step("대표: 핵심 인력으로 승인", async () => {
    await admin.goto("/admin/applications");
    const card = admin.locator("li").filter({ hasText: memberName });
    await card.getByLabel("핵심").check();
    await card.getByRole("button", { name: "승인", exact: true }).click();
    await expect(admin.locator("li").filter({ hasText: memberName })).toHaveCount(0);
  });

  let eventPath = "";
  await test.step("대표: 일정 만들고 전체 공개", async () => {
    await admin.goto("/admin/events/new");
    await admin.locator("#title").fill(title);
    await admin.locator("#day-1-date").fill(kstDate(7));
    await admin.locator("#day-1-start").fill("08:00");
    await admin.locator("#day-1-end").fill("17:00");
    await admin.locator("#day-1-count").fill("2");
    await admin.getByRole("button", { name: "임시저장으로 만들기" }).click();
    await expect(admin).toHaveURL(/\/admin\/events\/[0-9a-f-]{36}/);
    eventPath = new URL(admin.url()).pathname;
    await admin.getByRole("button", { name: "바로 전체 공개" }).click();
    await expect(admin.getByRole("button", { name: "모집 마감" })).toBeVisible();
  });

  const eventId = eventPath.split("/").pop()!;

  await test.step("회원: 일정 신청", async () => {
    await member.goto(`/events/${eventId}`);
    await expect(member.getByRole("heading", { name: title })).toBeVisible();
    await member.getByRole("button", { name: "신청하기" }).click();
    // 버튼 글자는 저장 중에도 바뀌므로, 저장이 끝난 뒤에만 나오는 "신청 취소하기"를 기다린다
    await expect(member.getByRole("button", { name: "신청 취소하기" })).toBeVisible();
  });

  await test.step("대표: 확정하고 선발 결과 알림 보내기", async () => {
    await admin.goto(eventPath);
    await admin.getByRole("button", { name: "확정", exact: true }).first().click();
    await expect(admin.getByRole("button", { name: /알림 보내기 \(1명\)/ })).toBeVisible();
    await admin.getByRole("button", { name: /알림 보내기 \(1명\)/ }).click();
    await expect(admin.getByRole("button", { name: /알림 보내기 \(0명\)/ })).toBeVisible();
  });

  await test.step("대표: 계약서 보내기", async () => {
    await admin.goto(`${eventPath}?tab=contracts`);
    await admin.getByRole("button", { name: /안 보낸 1명에게 계약서 보내기/ }).click();
    await expect(admin.getByRole("button", { name: "모두 보냈어요" })).toBeVisible();
  });

  await test.step("회원: 정산 정보 등록하고 계약서 서명", async () => {
    await member.goto("/contracts");
    await member.getByRole("link", { name: new RegExp(title) }).first().click();
    await expect(member).toHaveURL(/\/contracts\/[0-9a-f-]{36}/);
    await member.locator("#pi-rrn").fill("900101-1234567");
    await member.locator("#pi-bank").selectOption("KB국민은행");
    await member.locator("#pi-account").fill("12345678901234");
    await member.getByRole("button", { name: "정산 정보 등록하기" }).click();

    const pad = member.locator("canvas").first();
    await expect(pad).toBeVisible();
    const box = (await pad.boundingBox())!;
    await member.mouse.move(box.x + 20, box.y + box.height / 2);
    await member.mouse.down();
    for (let i = 1; i <= 10; i++) await member.mouse.move(box.x + 20 + i * 20, box.y + box.height / 2 + (i % 2 ? 15 : -15));
    await member.mouse.up();
    await member.locator('input[name="agree"]').check();
    await member.getByRole("button", { name: "서명 완료" }).click();
    // 서명이 저장되면 "아래에서 서명해 주세요" 안내와 서명란이 사라진다
    await expect(member.getByText("내용을 끝까지 읽고 아래에서 서명해 주세요", { exact: false })).toHaveCount(0);
    await expect(member.getByRole("button", { name: /서명/ })).toHaveCount(0);
  });

  await test.step("대표: 출석 확인", async () => {
    await admin.goto(`${eventPath}?tab=attendance`);
    const row = admin.locator("form").filter({ hasText: memberName }).first();
    await row.getByText("참석", { exact: true }).click();
    await row.getByRole("button", { name: "저장" }).click();
    // 저장되면 바뀐 것이 없어져 "저장" 버튼이 다시 꺼진다
    await expect(row.getByRole("button", { name: "저장" })).toBeDisabled();
  });

  await test.step("대표: 세금 처리 방식 정하기", async () => {
    await admin.goto("/admin/settings");
    await admin.getByText("기타소득 (8.8%)", { exact: true }).click();
    await admin.getByRole("button", { name: "세금 설정 저장" }).click();
    await expect(admin.getByText("저장했어요.").first()).toBeVisible();
  });

  await test.step("대표: 출석 기록으로 정산 만들기", async () => {
    await admin.goto(`${eventPath}?tab=payments`);
    await admin.getByRole("button", { name: "출석 기록으로 정산 만들기" }).click();
    await expect(admin.getByRole("button", { name: "출석 기록으로 다시 계산" })).toBeVisible();
  });

  await test.step("대표: 지급 완료로 바꾸기", async () => {
    await admin.goto("/admin/payments");
    await admin.getByLabel(`${memberName} 고르기`).check();
    await admin.getByRole("button", { name: "지급 완료로 바꾸기" }).click();
    await expect(admin.getByLabel(`${memberName} 고르기`)).toHaveCount(0);
  });

  await test.step("회원: 받은 금액 확인", async () => {
    await member.goto("/payments");
    const row = member.locator("li").filter({ hasText: title });
    await expect(row).toBeVisible();
    await expect(row.getByText("받은 금액")).toBeVisible();
  });

  // 화면만 보고 지나치지 않게, DB에 실제로 남은 결과를 한 번 더 확인한다
  await test.step("DB: 저장된 결과 확인", async () => {
    const db = serviceClient();
    const memberId = memberAccount.id;
    const [{ data: profile }, { data: apps }, { data: contracts }, { data: payments }, { data: priv }] = await Promise.all([
      db.from("profiles").select("status, tier").eq("id", memberId).single(),
      db.from("applications").select("status, attendance").eq("event_id", eventId).eq("member_id", memberId),
      db.from("contracts").select("status, signed_at").eq("event_id", eventId).eq("member_id", memberId),
      db.from("payments").select("status, gross, income_tax, net").eq("event_id", eventId).eq("member_id", memberId),
      db.from("member_private").select("rrn_masked, account_masked").eq("member_id", memberId).single(),
    ]);
    expect(profile).toEqual({ status: "active", tier: "core" });
    expect(apps).toEqual([{ status: "selected", attendance: "attended" }]);
    expect(contracts).toHaveLength(1);
    expect(contracts![0].status).toBe("signed");
    expect(payments).toHaveLength(1);
    expect(payments![0].status).toBe("paid");
    // 08:00~17:00, 시급 11,000원 → 9시간 99,000원. 기타소득 8.8%는 125,000원 이하라 세금 0원 (과세최저한)
    expect(payments![0]).toMatchObject({ gross: 99000, income_tax: 0, net: 99000 });
    expect(priv).toEqual({ rrn_masked: "900101-1******", account_masked: "****1234" });
  });
});
