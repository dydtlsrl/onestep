import { Card, PageShell } from "@/components/page-shell";

export function InvalidInvite() {
  return (
    <PageShell>
      <Card>
        <h1 className="text-xl font-bold">쓸 수 없는 초대 링크예요</h1>
        <p className="text-[15px] leading-relaxed text-body">
          링크가 만료되었거나, 사용 가능한 횟수를 넘었거나, 대표님이 링크를 껐을 수 있어요. 대표님께 새 초대 링크를
          요청해 주세요.
        </p>
      </Card>
    </PageShell>
  );
}
