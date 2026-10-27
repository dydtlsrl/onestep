"use client";

import { useEffect, useRef, useState } from "react";

// 손가락이나 마우스로 서명한다. 서명 이미지를 name 이름의 숨은 칸에 PNG(data URL)로 넣는다.
export function SignaturePad({ name, onChange }: { name: string; onChange?: (signed: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokes = useRef(0);
  const [value, setValue] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1d21";
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) * canvas.width) / rect.width, y: ((e.clientY - rect.top) * canvas.height) / rect.height };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function end(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    strokes.current += 1;
    const url = e.currentTarget.toDataURL("image/png");
    setValue(url);
    onChange?.(true);
  }

  function clear() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    strokes.current = 0;
    setValue("");
    onChange?.(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={600}
        height={220}
        aria-label="서명란. 손가락이나 마우스로 이름을 써 주세요."
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="h-[180px] w-full touch-none rounded-lg border-2 border-dashed border-field bg-white"
      />
      <input type="hidden" name={name} value={value} />
      <div className="flex items-center justify-between text-[13px] text-muted">
        <span>{value ? "서명했어요. 다시 하려면 지우기를 눌러 주세요." : "위 칸에 이름을 정자로 써 주세요."}</span>
        <button type="button" onClick={clear} className="h-9 rounded-md border border-field bg-white px-3 text-sm font-bold text-ink">
          지우기
        </button>
      </div>
    </div>
  );
}
