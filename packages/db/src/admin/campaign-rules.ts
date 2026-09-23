/**
 * 캠페인 상태 — 관리자 대시보드의 상태 칩 · 필터 칩. **순수 모듈**(DB 접근 없음).
 *
 * 라벨·톤은 데모 `packages/core/src/constants.ts` 의 `ST` 를 그대로 옮긴 것이다 — 같은 상태를
 * 관리자·인플루언서·브랜드가 다른 말로 부르면 안 된다. 톤 값(`blue` `amber` `green` `live` `red` `gray`)은
 * `packages/ui/css/site.css` 의 `.st.*` 클래스와 1:1 이다.
 *
 * `DECLINED` · `REJECTED` · `PASSED` 는 종결 상태라 흐름 순서에서 빠져 있고, 필터 칩에는
 * 실제로 존재하는 상태만 나온다(0건인 상태는 화면이 걸러낸다).
 */
export const CAMPAIGN_FLOW = [
  "SAMPLE_REQUESTED",
  "INVITED",
  "SAMPLE_APPROVED",
  "SAMPLE_PURCHASED",
  "SAMPLE_SHIPPED",
  "TESTING",
  "SCHEDULE_PROPOSED",
  "SCHEDULE_CONFIRMED",
  "LIVE",
  "CLEARING",
  "SETTLED",
  "DECLINED",
  "REJECTED",
  "PASSED",
] as const;

export type CampaignStatusKey = (typeof CAMPAIGN_FLOW)[number];

export type CampaignStatusTone = "blue" | "amber" | "green" | "live" | "red" | "gray";

/** 데모 `ST[k].l` */
export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatusKey, string> = {
  SAMPLE_REQUESTED: "샘플 요청",
  INVITED: "브랜드 제안 · 수락 대기",
  DECLINED: "제안 거절",
  REJECTED: "거절됨",
  SAMPLE_APPROVED: "샘플 발송 대기",
  SAMPLE_PURCHASED: "샘플 구매 · 발송 대기",
  SAMPLE_SHIPPED: "샘플 배송중",
  TESTING: "테스트 중",
  PASSED: "인플루언서 패스",
  SCHEDULE_PROPOSED: "일정 승인 대기",
  SCHEDULE_CONFIRMED: "일정 확정",
  LIVE: "판매 진행중",
  CLEARING: "교환·환불 기간",
  SETTLED: "정산 완료",
};

/** 데모 `ST[k].c` */
export const CAMPAIGN_STATUS_TONES: Record<CampaignStatusKey, CampaignStatusTone> = {
  SAMPLE_REQUESTED: "blue",
  INVITED: "blue",
  DECLINED: "gray",
  REJECTED: "red",
  SAMPLE_APPROVED: "blue",
  SAMPLE_PURCHASED: "blue",
  SAMPLE_SHIPPED: "blue",
  TESTING: "amber",
  PASSED: "gray",
  SCHEDULE_PROPOSED: "amber",
  SCHEDULE_CONFIRMED: "green",
  LIVE: "live",
  CLEARING: "amber",
  SETTLED: "green",
};

/** 모르는 상태는 원문 그대로 회색 — DB 에 새 상태가 들어와도 화면이 깨지지 않게 한다 */
export function campaignStatusChip(status: string): { label: string; tone: CampaignStatusTone } {
  const s = status as CampaignStatusKey;
  return CAMPAIGN_FLOW.includes(s)
    ? { label: CAMPAIGN_STATUS_LABELS[s], tone: CAMPAIGN_STATUS_TONES[s] }
    : { label: status, tone: "gray" };
}

/** `?status=` — 대시보드 캠페인 필터. 빈 값·모르는 값은 null(전체) */
export function parseCampaignStatusFilter(raw: string | null | undefined): CampaignStatusKey | null {
  return CAMPAIGN_FLOW.includes(raw as CampaignStatusKey) ? (raw as CampaignStatusKey) : null;
}

/**
 * 필터 칩 정렬 — 흐름 순서(`CAMPAIGN_FLOW`)대로. 데모 `stCounts` 는 `Object.keys(ST)` 순서였는데 같은 순서다.
 * 0건인 상태는 넣지 않는다.
 */
export function sortCampaignStatusCounts(counts: { status: string; n: number }[]): { status: string; label: string; tone: CampaignStatusTone; n: number }[] {
  const order = new Map(CAMPAIGN_FLOW.map((s, i) => [s as string, i]));
  return counts
    .filter((c) => c.n > 0)
    .sort((a, b) => (order.get(a.status) ?? 999) - (order.get(b.status) ?? 999))
    .map((c) => ({ status: c.status, n: c.n, ...campaignStatusChip(c.status) }));
}

/** 기간 표기 "9/21–9/25" — 날짜가 없으면 "—"(데모와 같다) */
export function campaignPeriodLabel(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const md = (d: string) => {
    const [, m, day] = d.split("-");
    return `${Number(m)}/${Number(day)}`;
  };
  return `${md(start)}–${md(end)}`;
}
