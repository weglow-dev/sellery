"use client";

/**
 * 체크아웃 폼 필드 `.fld` (ux-spec §3.4 3 — 라벨 Mono 10.5 uppercase). 소유: D.
 * invalid 이면 테두리를 danger 색 노치 프레임으로 바꾸고 aria-invalid 를 붙인다.
 */
import type { CSSProperties, InputHTMLAttributes } from "react";

const INVALID_FRAME: CSSProperties = {
  boxShadow:
    "0 -2px 0 0 var(--color-danger), 0 2px 0 0 var(--color-danger), -2px 0 0 0 var(--color-danger), 2px 0 0 0 var(--color-danger)",
};

export type FieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  /** 라벨 뒤 보조 표기 (예: "선택") */
  optional?: boolean;
  hint?: string;
  /** 입력 오른쪽에 붙는 버튼 등 */
  trailing?: React.ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange">;

export function Field({ id, label, value, onChange, invalid = false, optional = false, hint, trailing, style, ...rest }: FieldProps) {
  const input = (
    <input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid || undefined}
      style={invalid ? { ...INVALID_FRAME, ...style } : style}
      {...rest}
    />
  );
  return (
    <div className="fld">
      <label htmlFor={id}>
        {label}
        {optional ? <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: "none" }}> (선택)</span> : null}
      </label>
      {trailing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{input}</div>
          {trailing}
        </div>
      ) : (
        input
      )}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}
