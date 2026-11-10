/**
 * MYR 정산 숫자(docs/myr.md §9-6 · 2026-11-09 결정) — 순수. 화면(상품 등록 "예상 정산" · 로그인 패널)이 이 파일 하나를 쓴다.
 *   - 정산 금액 = 판매가(부가세 포함 · 공구가로 팔렸으면 공구가)의 65% − PG 수수료 5%(모든 셀러 고정) = **60%**
 *   - 매월 1일에 지난달 배송 완료분 · 제조금액 상계(상품별) · 보증금 = 제조금액의 25%
 * 정산 계산 · 확정은 DB(0087)가 `platform_settings` 'myr_settlement' { pct, deposit_pct } 로 한다 — 여기 숫자는 화면 표시용 거울(상품 등록 "예상 정산" · 로그인 패널).
 * 비율을 바꾸면 platform_settings 와 여기를 같이 바꾼다(회차 줄에는 그때 비율이 남는다).
 * 퍼센트를 정수로 둔다(0.65 − 0.05 같은 소수 오차를 피한다).
 */
export const SETTLEMENT_GROSS_PCT = 65;
export const PG_FEE_PCT = 5;
/** 크리에이터 정산 비율(%) = 65 − 5 */
export const SETTLEMENT_PCT = SETTLEMENT_GROSS_PCT - PG_FEE_PCT;
/** 보증금 = 제조금액의 25% */
export const DEPOSIT_PCT = 25;
/** 정산일 — 매월 1일(지난달 배송 완료분) */
export const SETTLEMENT_DAY = 1;

/** 판매가(원) → 예상 정산(원) — 화면 추정값(제조금액 상계 전) · 원 단위 반올림 */
export const settlementOf = (price: number): number => (Number.isFinite(price) && price > 0 ? Math.round((price * SETTLEMENT_PCT) / 100) : 0);

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
