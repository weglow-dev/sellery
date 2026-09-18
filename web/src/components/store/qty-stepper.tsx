"use client";

/**
 * 수량 `.qty` `− {q} +` (ux-spec §1.4 · §1.6 수량 1 ≤ q ≤ 10 클램프). 소유: C.
 */
export const QTY_MIN = 1;
export const QTY_MAX = 10;

export function clampQty(q: number): number {
  if (!Number.isFinite(q)) return QTY_MIN;
  return Math.min(QTY_MAX, Math.max(QTY_MIN, Math.trunc(q)));
}

export function QtyStepper({ value, onChange, sm = false }: { value: number; onChange: (q: number) => void; sm?: boolean }) {
  return (
    <div className={sm ? "qty sm" : "qty"} role="group" aria-label="수량">
      <button type="button" aria-label="수량 줄이기" onClick={() => onChange(clampQty(value - 1))} disabled={value <= QTY_MIN}>
        −
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" aria-label="수량 늘리기" onClick={() => onChange(clampQty(value + 1))} disabled={value >= QTY_MAX}>
        +
      </button>
    </div>
  );
}
