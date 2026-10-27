import { redirect } from "next/navigation";
import { Card, Notice, PageShell } from "@/components/page-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentMember, type MemberStatus } from "@/lib/auth";

const COPY: Record<Exclude<MemberStatus, "active">, { title: string; body: string }> = {
  pending: {
    title: "가입 신청이 완료되었어요",
    body: "대표님이 신청 내용을 확인한 뒤 승인하면 이용할 수 있어요. 승인 여부는 이 주소에 다시 접속하면 확인할 수 있어요.",
  },
  rejected: {
    title: "가입이 승인되지 않았어요",
    body: "궁금한 점은 원스텝 대표님께 문의해 주세요.",
  },
  restricted: {
    title: "이용이 제한된 계정이에요",
    body: "자세한 내용은 원스텝 대표님께 문의해 주세요.",
  },
  withdrawn: {
    title: "탈퇴한 계정이에요",
    body: "다시 활동하려면 원스텝 대표님께 문의해 주세요.",
  },
};

// 승인 전이거나 활동할 수 없는 상태일 때 보는 화면
export default async function PendingPage() {
  const { userId, profile } = await getCurrentMember();
  if (!userId) redirect("/login");
  if (!profile) redirect("/");
  if (profile.status === "active") redirect("/");

  const copy = COPY[profile.status];

  return (
    <PageShell>
      <Card>
        <h1 className="text-xl font-bold">{copy.title}</h1>
        <p className="text-[15px] leading-relaxed text-body">{copy.body}</p>
        {profile.status === "pending" && <Notice>{profile.name}님의 신청서를 대표님이 확인하고 있어요.</Notice>}
      </Card>
      <SignOutButton />
    </PageShell>
  );
}
