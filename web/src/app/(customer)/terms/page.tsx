/**
 * /terms — 이용약관. 본문은 `src/content/legal/terms.ts`(데이터), 렌더는 components/legal-doc.tsx.
 * 세션·DB 를 읽지 않으므로 정적 렌더 가능 — force-dynamic 없음. 색인 허용 (robots.ts allow).
 */
import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal-doc";
import { TERMS } from "@/content/legal/terms";

export const metadata: Metadata = {
  title: "이용약관",
  description: "셀러리 서비스 이용약관 — 통신판매중개 플랫폼 셀러리의 이용 조건과 주문·결제·청약철회 규정.",
};

export default function TermsPage() {
  return <LegalDoc doc={TERMS} />;
}
