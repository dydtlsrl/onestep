"use client";

import { useFormStatus } from "react-dom";

// 폼 제출 중에는 눌리지 않게 막고 문구를 바꾼다
export function SubmitButton({
  children,
  pendingText = "처리 중…",
  variant = "primary",
  className = "",
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const { pending } = useFormStatus();
  const look =
    variant === "primary"
      ? "bg-brand text-white hover:bg-brand-strong disabled:bg-line disabled:text-muted"
      : "border border-field bg-white text-ink hover:bg-ground disabled:text-muted";
  return (
    <button
      type="submit"
      disabled={pending}
      className={`h-11 rounded-lg px-4 text-sm font-bold transition-colors ${look} ${className}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}
