/**
 * MYR 파트너팀 톡(0125) — 크리에이터 ↔ 운영 대화방(크리에이터마다 방 하나 · 순수 · 브라우저 · 서버 공용).
 * 판정(안 읽음 · 운영이 답할 차례 · 본문)은 DB 함수가 한다(myr_partner_*). 여기는 응답 읽기 · 입력 형식(화면이 빨리 알려 주기) · 문구만.
 */

export type PartnerSender = 'seller' | 'admin';
export type PartnerMessage = { id: string; sender: PartnerSender; body: string; createdAt: string };

/** 본문 최대 글자 수 — 입력 형식(서버 myr_partner_body_ok 가 최종 판정 · 화면은 빨리 알려 주기만) · 서버 myr_partner_body_max() 와 같은 값(check-boundaries (j)) */
export const PARTNER_BODY_MAX = 2000;
/** 입력 형식 — 앞뒤 공백 뺀 1~2000자(서버와 같은 형식 검사 · CLAUDE.md 원칙 1 예외 "입력 형식 규칙") */
export const partnerBodyOk = (v: string): boolean => {
	const n = v.trim().length;
	return n >= 1 && n <= PARTNER_BODY_MAX;
};

/** 대화 페이지 주소 — 상단 메신저 아이콘 · "문의" 버튼 */
export const PARTNER_TALK_HREF = '/messages';

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export function partnerMessageFromJson(v: unknown): PartnerMessage | null {
	const o = obj(v);
	if (!o || typeof o.id !== 'string' || typeof o.body !== 'string' || typeof o.created_at !== 'string') return null;
	if (o.sender !== 'seller' && o.sender !== 'admin') return null;
	return { id: o.id, sender: o.sender, body: o.body, createdAt: o.created_at };
}

export function partnerMessagesFromJson(v: unknown): PartnerMessage[] {
	return Array.isArray(v) ? v.map(partnerMessageFromJson).filter((m): m is PartnerMessage => m !== null) : [];
}

/** 보내기 실패 코드 → 문구(서버 거부 코드 그대로) */
export function partnerFailMessage(code: string | null | undefined): string {
	switch (code) {
		case 'BAD_BODY':
			return `메시지는 1~${PARTNER_BODY_MAX.toLocaleString('ko-KR')}자로 써 주세요`;
		case 'TOO_FAST':
			return '너무 빠르게 보내고 있어요. 잠시 뒤 다시 보내 주세요';
		case 'UNAUTHORIZED':
			return '다시 로그인해 주세요';
		default:
			return '보내지 못했어요. 잠시 뒤 다시 시도해 주세요';
	}
}
