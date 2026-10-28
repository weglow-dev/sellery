/** 휴대폰 번호 입력 정규화 — 숫자만 남기고 최대 11자리, 010-0000-0000 꼴로 하이픈을 넣는다.
 *  폼 입력(oninput)과 서버 검증(+page.server.ts)이 같은 함수를 써서 저장되는 값이 항상 같은 모양이 되게 한다. */
export function formatPhone(raw: string): string {
	const d = raw.replace(/\D/g, '').slice(0, 11);
	if (d.length < 4) return d;
	if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
	// 10자리(01x-xxx-xxxx) 는 3-3-4, 11자리(010-xxxx-xxxx) 는 3-4-4
	if (d.length < 11) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
	return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** formatPhone 을 거친 값이 완성된 휴대폰 번호인지 */
export const PHONE_RE = /^01[016789]-\d{3,4}-\d{4}$/;
