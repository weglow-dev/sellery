"use client";

/**
 * 옵션 선택 `.opts` / `.opt` (ux-spec §1.4 · §3.1.2). 소유: C.
 * 각 행 `<span>{n}</span><b>₩{price}</b>`, 선택 `.on`. 순서·가격·이름은 RPC `product.options` 원본 순서.
 */
import { won, type ResolvedOption } from "@/lib/campaign";

export function OptionPicker({ options, value, onChange }: { options: ResolvedOption[]; value: number; onChange: (i: number) => void }) {
  return (
    <div className="opts" role="radiogroup" aria-label="옵션 선택">
      {options.map((o, i) => (
        <button
          key={`${i}:${o.n}`}
          type="button"
          role="radio"
          aria-checked={i === value}
          className={i === value ? "opt on" : "opt"}
          onClick={() => onChange(i)}
        >
          <span>{o.n}</span>
          <b>{won(o.price)}</b>
        </button>
      ))}
    </div>
  );
}
