/**
 * 법적 고지 본문의 인라인 링크 파서 — web/src/components/legal-doc.tsx 의 `inline()` · `linkNode()` 를 순수 함수로.
 * 블록 문자열 안의 `[텍스트](/경로)` 만 링크로 바꾼다 (@sellery/db legal.ts 계약):
 *   내부 경로(`/…`) · 같은 페이지 앵커(`#…`) · mailto: 는 <a>, https: 는 새 창 <a>, 그 외 스킴(javascript: · data: · http:)은 텍스트로 남긴다.
 * HTML 을 만들지 않는다 — 렌더는 LegalInline.svelte 가 조각 배열로 한다({@html} 금지).
 */

/** `[텍스트](대상)` — 라벨에 대괄호, 대상에 괄호·공백은 허용하지 않는다 (중첩·오탐 방지) */
const LINK_RE = /\[([^[\]]+)\]\(([^()\s]+)\)/g;

export type InlinePart = { kind: 'text'; text: string } | { kind: 'link'; label: string; href: string; external: boolean };

function linkPart(label: string, href: string): InlinePart {
	if (href.startsWith('/') && !href.startsWith('//')) return { kind: 'link', label, href, external: false };
	if (href.startsWith('#') || href.startsWith('mailto:')) return { kind: 'link', label, href, external: false };
	if (href.startsWith('https://')) return { kind: 'link', label, href, external: true };
	return { kind: 'text', text: label };
}

/** 문자열 → 텍스트와 링크 조각의 배열. 링크가 없으면 원문 한 조각. */
export function inlineParts(text: string): InlinePart[] {
	const out: InlinePart[] = [];
	const re = new RegExp(LINK_RE.source, 'g');
	let last = 0;
	for (let m = re.exec(text); m !== null; m = re.exec(text)) {
		if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
		out.push(linkPart(m[1], m[2]));
		last = m.index + m[0].length;
	}
	if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
	return out;
}

/** 'YYYY-MM-DD' → 'YYYY년 M월 D일' (형식이 어긋나면 원문) */
export function fmtEffective(ymd: string): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
	if (!m) return ymd;
	return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

export const APPENDIX_ID = 'appendix';
