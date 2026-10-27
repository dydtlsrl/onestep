"use client";

// 브라우저 인쇄 창을 연다. 인쇄 대상에서 "PDF로 저장"을 고르면 PDF 파일이 된다.
export function PrintButton({ label = "인쇄 · PDF로 저장" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-11 rounded-lg border border-field bg-white px-4 text-sm font-bold text-ink hover:bg-ground print:hidden"
    >
      {label}
    </button>
  );
}
