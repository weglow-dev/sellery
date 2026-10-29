/** 휴대폰 번호 입력 정규화 — apps/myr/src/lib/utils/phone.ts 와 같은 규칙(숫자 11자리 · 010-0000-0000).
 *  M4 에서 서버 검증(normalizePhone)과 짝이 된다. */
export function formatPhone(raw: string): string {
	const d = raw.replace(/\D/g, '').slice(0, 11);
	if (d.length < 4) return d;
	if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
	if (d.length < 11) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
	return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

export const PHONE_RE = /^01[016789]-\d{3,4}-\d{4}$/;

/** oninput 핸들러 — 되쓰기 전 커서 앞 숫자 개수를 세어 새 문자열의 같은 숫자 뒤로 커서를 되돌린다
 *  (가운데를 고칠 때 커서가 맨 뒤로 튀지 않게 · 랜딩 연락처 칸과 같은 처리). 반환값이 새 값. */
export function formatPhoneInput(el: HTMLInputElement): string {
	const before = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, '').length;
	const next = formatPhone(el.value);
	el.value = next;
	let seen = 0;
	let pos = next.length;
	for (let i = 0; i < next.length; i++) {
		if (/\d/.test(next[i])) seen++;
		if (seen === before) {
			pos = i + 1;
			break;
		}
	}
	if (before === 0) pos = 0;
	el.setSelectionRange(pos, pos);
	return next;
}
