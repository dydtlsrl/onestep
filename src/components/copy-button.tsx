"use client";

import { useState } from "react";

export function CopyButton({ value, label = "링크 복사" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("아래 주소를 복사해 주세요.", value);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="h-9 shrink-0 rounded-md border border-field bg-white px-3 text-sm font-bold text-ink hover:bg-ground"
    >
      {copied ? "복사됨" : label}
    </button>
  );
}
