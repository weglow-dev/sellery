/**
 * /privacy — 개인정보처리방침. 본문은 `src/content/legal/privacy.ts`(데이터), 렌더는 components/legal-doc.tsx.
 * 체크아웃의 제3자 제공 고지가 `/privacy#third-party` 로 링크한다 (섹션 id 계약 — lib/legal.ts).
 * 세션·DB 를 읽지 않으므로 정적 렌더 가능 — force-dynamic 없음. 색인 허용 (robots.ts allow).
 */
import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal-doc";
import { PRIVACY } from "@/content/legal/privacy";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "셀러리 개인정보처리방침 — 수집 항목과 이용 목적, 보유 기간, 제3자 제공·처리위탁, 이용자의 권리.",
};

export default function PrivacyPage() {
  return <LegalDoc doc={PRIVACY} />;
}
