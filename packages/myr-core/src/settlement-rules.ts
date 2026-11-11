/**
 * MYR 정산 — 순수(날짜 · 회차 달). docs/myr.md §9-6.
 * **정산 비율 · 정산금 · 보증금 비율은 여기 두지 않는다** — DB(0087 platform_settings 'myr_settlement' · 0092 myr_settlement_amount)가 한 곳.
 * 화면(상품 등록 "예상 정산" · 로그인 소개)은 서버 `settlementUnit`(myr_app_settlement_unit)을 부른다(백엔드 원칙 1).
 */
/** 정산일 — 매월 1일(지난달 배송 완료분) · 크론 일정(apps/myr-shop vercel.json)과 같은 날 */
export const SETTLEMENT_DAY = 1;

/** 정산 크론 시각 — 매월 1일 13:00(KST) = 04:00 UTC (apps/myr-shop vercel.json `0 4 1 * *` · 2026-11-10 결정) */
export const SETTLEMENT_CRON_KST = '매월 1일 오후 1시';

/** 정산할 달(KST 지난달의 1일, 'YYYY-MM-01') — 크론이 이 값으로 회차를 돌린다 */
export function previousSettlementMonth(now: Date | number = Date.now()): string {
	const kst = new Date((typeof now === 'number' ? now : now.getTime()) + 9 * 60 * 60 * 1000);
	const y = kst.getUTCFullYear();
	const m = kst.getUTCMonth(); // 0-based 이번 달 → 지난달
	const py = m === 0 ? y - 1 : y;
	const pm = m === 0 ? 12 : m;
	return `${py}-${String(pm).padStart(2, '0')}-01`;
}

/** 'YYYY-MM' 또는 'YYYY-MM-DD' → 'YYYY-MM-01' · 틀리면 null (운영 스크립트 · 크론 ?month=) */
export function parseSettlementMonth(v: unknown): string | null {
	if (typeof v !== 'string') return null;
	const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(v.trim());
	if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
	return `${m[1]}-${m[2]}-01`;
}
