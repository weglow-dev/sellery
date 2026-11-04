/**
 * 휴대폰 번호 — 입력 정규화 · 형식 판정 · 커서 위치. 크리에이터 가입 폼(apps/myr-influencer)과 이후 운영 화면이 같은 규칙을 쓴다.
 * 규칙은 랜딩 제조의뢰 폼(apps/myr lib/utils/phone.ts — 독립 앱이라 패키지를 쓰지 않는다)과 같다: 숫자만 최대 11자리 → 010-0000-0000.
 */

/** 숫자만 남기고 최대 11자리, 010-0000-0000 꼴로 하이픈. 10자리(01x-xxx-xxxx)는 3-3-4 */
export function formatPhone(raw: string): string {
	const d = String(raw ?? '').replace(/\D/g, '').slice(0, 11);
	if (d.length < 4) return d;
	if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
	if (d.length < 11) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
	return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** formatPhone 을 거친 값이 완성된 휴대폰 번호인지 */
export const PHONE_RE = /^01[016789]-\d{3,4}-\d{4}$/;

/** 하이픈 없는 숫자만 — 저장 · 비교용 */
export const phoneDigits = (v: string): string => String(v ?? '').replace(/\D/g, '');

/**
 * 다시 쓴 뒤 커서 위치 — 커서 앞에 있던 **숫자 개수**를 세어, 새 문자열에서 같은 개수의 숫자 바로 뒤로 둔다.
 * 가운데 숫자를 고칠 때 커서가 맨 뒤로 튀지 않게(랜딩 제조의뢰 폼과 같은 동작).
 */
export function caretAfterFormat(before: string, caret: number, after: string): number {
	const digitsBefore = phoneDigits(before.slice(0, Math.max(0, caret))).length;
	if (digitsBefore === 0) return 0;
	let seen = 0;
	for (let i = 0; i < after.length; i++) {
		if (/\d/.test(after[i])) seen++;
		if (seen === digitsBefore) return i + 1;
	}
	return after.length;
}
