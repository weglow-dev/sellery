import Link from "next/link";
import { LOGO_ICON } from "@/components/icons";

/**
 * 워드마크 — 앱 안에서 SELLERY 로고는 이 컴포넌트로만 렌더한다 (app-plan §9.3, glo 교훈 15).
 * 스타일 = css/skin.css 252–258 최종: Archivo 800 18px .06em uppercase · 흰 박스 · 로고 24×28 rotate(−14°).
 */
export function Wordmark({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={className ? `wordmark ${className}` : "wordmark"} aria-label="Sellery 홈">
      <LOGO_ICON className="celogo" />
      SELLERY
      <span className="dot">.</span>
    </Link>
  );
}
