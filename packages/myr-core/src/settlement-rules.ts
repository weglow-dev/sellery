/**
 * MYR 정산 — 순수(날짜 · 회차 달). docs/myr.md §9-6.
 * **정산 비율 · 정산금 · 보증금 비율은 여기 두지 않는다** — DB(0087 platform_settings 'myr_settlement' · 0092 myr_settlement_amount)가 한 곳.
 * 화면(상품 등록 "예상 정산" · 로그인 소개)은 서버 `settlementUnit`(myr_app_settlement_unit)을 부른다(백엔드 원칙 1).
 */
/** 정산일 — 매월 1일(지난달 배송 완료분) · 크론 일정(apps/myr-shop vercel.json)과 같은 날 */
export const SETTLEMENT_DAY = 1;

/** 정산 시각 — 매월 1일 13:00(KST) = 04:00 UTC (2026-11-10 결정). 크론은 매일 같은 시각에 돈다(apps/myr-shop vercel.json `0 4 * * *` · 0106) —
 *  정산할 달은 DB myr_settlement_due 가 정한다(평소 1일에 지난달 · 실패하면 다음 날 따라잡기). 여기서 달을 계산하지 않는다 */
export const SETTLEMENT_CRON_KST = '매월 1일 오후 1시';

/** 크리에이터 안내 — 정산 확정 · 지급(2026-11-13 결정 · 자동 이체 매일 오후 1시 · 세금계산서까지 확인된 지급 건부터 · 0111).
 *  "정산일"이라고 쓰면 그날 돈이 들어온다고 읽혀서, 금액이 정해지는 날(정산 확정)과 돈이 들어오는 날(지급)을 나눠 쓴다.
 *  실제 날짜 · 시각은 서버 값(정산 확정 예정 settle_at · 지급 예정 pay_due_at)을 쓰고, 이 문장들은 규칙 안내에만 쓴다 */
export const SETTLE_CONFIRM_TEXT = '매월 1일 오후 1시 정산금이 정해져요';
export const PAYOUT_RULE_TEXT = '세금계산서가 확인된 다음 날 오후 1시에 정산금이 입금돼요';
export const PAYOUT_BLOCK_TEXT = '세금계산서가 확인되지 않으면 지급되지 않아요';

/** 'YYYY-MM' 또는 'YYYY-MM-DD' → 'YYYY-MM-01' · 틀리면 null (운영 스크립트 · 크론 ?month=) */
export function parseSettlementMonth(v: unknown): string | null {
	if (typeof v !== 'string') return null;
	const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(v.trim());
	if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
	return `${m[1]}-${m[2]}-01`;
}
