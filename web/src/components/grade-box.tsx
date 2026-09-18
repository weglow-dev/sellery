import { GradeIcon } from "@/components/icons";

/**
 * 등급 박스 `.gradebox` / `.gradebox.sm` — Archivo 800 · 라임 배경 · 등급 아이콘 + 등급명 (ux-spec §1.4).
 * RPC `seller.grade` / `brand.grade` 가 null 이면 아무것도 렌더하지 않는다.
 */
export function GradeBox({ grade, sm = false, className }: { grade: string | null | undefined; sm?: boolean; className?: string }) {
  if (!grade) return null;
  const cls = ["gradebox", sm ? "sm" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <span className={cls} title={`${grade} 등급`}>
      <GradeIcon grade={grade} /> {grade}
    </span>
  );
}
