import { getPendingCount } from "../pending-count";
import { PeopleTabs } from "./people-tabs";

// 회원 화면: 회원 목록·가입 승인·초대 링크를 한 화면에서 탭으로 오간다.
// 탭을 바꾸면 아래 내용만 바뀌고 제목과 탭은 그대로 있다.
export default async function PeopleLayout({ children }: { children: React.ReactNode }) {
  const pendingCount = await getPendingCount();
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">회원</h1>
      <PeopleTabs pendingCount={pendingCount} />
      {children}
    </>
  );
}
