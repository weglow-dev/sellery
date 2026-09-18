/**
 * 법적 고지 문서(이용약관 · 개인정보처리방침)의 공통 자료형. 소유: A.
 * 문서 본문은 `src/content/legal/{terms,privacy}.ts` 에 데이터로 두고, `components/legal-doc.tsx` 가 렌더한다.
 * — 비개발자가 문구만 고칠 수 있도록 JSX 가 아니라 문자열 블록으로 둔다. 링크는 `[텍스트](/경로)` 마크다운 링크 1종만 허용.
 */

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "ol"; items: string[] }
  | { type: "ul"; items: string[] }
  | { type: "table"; caption?: string; head: string[]; rows: string[][] }
  /** 강조 박스 — 고객이 꼭 봐야 할 요약(예: 청약철회 제한, 제3자 제공 상대) */
  | { type: "note"; text: string };

export type LegalSection = {
  /** 앵커 id (영문 kebab-case) — 다른 페이지에서 `/privacy#third-party` 처럼 링크한다 */
  id: string;
  heading: string;
  blocks: LegalBlock[];
};

export type LegalDoc = {
  slug: "terms" | "privacy";
  title: string;
  /** 문서 버전 (예: "1.0") */
  version: string;
  /** 시행일 YYYY-MM-DD */
  effectiveDate: string;
  /** 문서 상단 한 줄 안내 (선택) */
  intro?: string;
  sections: LegalSection[];
  /** 부칙 · 이전 버전 안내 등 (선택) */
  appendix?: LegalBlock[];
};
