import type { ReactNode } from "react";

/**
 * 상태 칩 `.st` — Mono 10.5px 700 · 앞 6px 점 (ux-spec §1.4). 색은 skin 최종값:
 *   green(액센트/흰 글자 — 결제 완료 · 유효) · gray(환불 완료) · blue · amber · red · live(잉크/라임 + "LIVE" 점멸)
 * lib/order-status.ts(F) 의 StatusTone 과 호환되는 상위 집합.
 */
export type ChipTone = "green" | "gray" | "blue" | "amber" | "red" | "live";

export function StatusChip({ tone, children, className, title }: { tone: ChipTone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span className={className ? `st ${tone} ${className}` : `st ${tone}`} title={title}>
      {children}
    </span>
  );
}
