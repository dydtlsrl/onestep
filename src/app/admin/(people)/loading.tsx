// 탭을 바꾸는 동안 제목과 탭은 그대로 두고 아래 내용 자리만 회색 뼈대로 보여 준다
export default function PeopleLoading() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
      <p role="status" className="text-sm text-muted">
        불러오는 중…
      </p>
      {["w-1/3", "w-full", "w-full", "w-2/3"].map((w, i) => (
        <div key={i} className={`h-5 animate-pulse rounded-md bg-line ${w}`} />
      ))}
    </div>
  );
}
