// 회원 화면의 기본 틀: 휴대폰 폭에 맞춘 가운데 정렬 카드
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
      <header className="text-lg font-bold tracking-tight">원스텝</header>
      {children}
    </main>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">{children}</section>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: React.ReactNode }) {
  const color = tone === "warn" ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand-strong";
  return <div className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${color}`}>{children}</div>;
}
