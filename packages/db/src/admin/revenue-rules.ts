/**
 * 관리자 "매출·순수익" — 순수 모듈(DB 접근 없음).
 * 데모 `(demo)/revenue`(프로토타입 `vAdminRevenue`)의 파서 · 운영비 계산 · 문구.
 *
 * 금액 규칙은 여기서 다시 구현하지 않는다 — `app_admin_revenue()`(0022)가 이미 계산해서 준다.
 * 이 모듈이 계산하는 것은 **운영 비용(OPEX)** 뿐이다. 데모가 화면에서 하던 식(`varCost` · `bep`)을 옮긴 것이고,
 * 서버에 둘 수 없다 — 사용자가 입력을 바꾸면 저장하지 않고도 즉시 다시 계산되어야 한다.
 */

/* ---------------------------------------------------------------- 운영 비용 ---------------------------------------------------------------- */

/** `platform_settings.opex_default` 의 키 — 0022 `app_admin_save_opex` 가 받는 키와 같아야 한다 */
export const OPEX_KEYS = ["server", "db", "cs", "domain", "misc", "pgFixed", "kakaoPer", "claudePerCrawl", "claudePerMatch"] as const;

export type OpexKey = (typeof OPEX_KEYS)[number];
export type Opex = Record<OpexKey, number>;

/** 데모 `OPEX_DEF` 와 같은 값 — DB 에 `opex_default` 가 없을 때만 쓰는 폴백 */
export const OPEX_FALLBACK: Opex = {
  server: 30000,
  db: 35000,
  cs: 50000,
  domain: 15000,
  misc: 30000,
  pgFixed: 0,
  kakaoPer: 15,
  claudePerCrawl: 120,
  claudePerMatch: 300,
};

/** 입력 라벨 · 부연 — 데모 `OX_ROWS` */
export const OPEX_ROWS: { key: OpexKey; label: string; note?: string }[] = [
  { key: "server", label: "서버·호스팅 (Vercel Pro)" },
  { key: "db", label: "DB·스토리지·인증 (Supabase Pro)" },
  { key: "cs", label: "CS 툴 (채널톡)" },
  { key: "domain", label: "도메인·이메일·모니터링" },
  { key: "misc", label: "기타 SaaS·회계" },
  { key: "pgFixed", label: "PG 월 고정비 (토스 지급대행)" },
  { key: "kakaoPer", label: "알림톡 단가 (₩/건)", note: "주문당 결제·배송·정산 3건" },
  { key: "claudePerCrawl", label: "Claude API · 인플루언서 크롤링 분석 (₩/명·일)", note: "외부 판매 감지·반응 지표" },
  { key: "claudePerMatch", label: "Claude API · 자동 매칭/예상 매출 추론 (₩/건)" },
];

/** 모르는 키 · 음수 · 숫자가 아닌 값을 버린다(0022 `app_admin_save_opex` 와 같은 규칙) */
export function parseOpex(raw: unknown): Opex {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = {} as Opex;
  for (const k of OPEX_KEYS) {
    const n = Number(src[k]);
    out[k] = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }
  return out;
}

/** 화면 입력(FormData) → 저장할 값 */
export function parseOpexForm(fd: { get(name: string): unknown }): Opex {
  const obj: Record<string, unknown> = {};
  for (const k of OPEX_KEYS) obj[k] = fd.get(k);
  return parseOpex(obj);
}

export type OpexInput = {
  opex: Opex;
  /** 알림톡 건수 기준 — 전체 주문 수 */
  orders: number;
  /** Claude 크롤링 기준 — 인플루언서 수 × 30일 */
  sellers: number;
  /** Claude 추론 기준 — 자동 제안 캠페인 + 외부 판매 감지 건수 */
  inferences: number;
  /** 🥬 로 낸 샘플값을 브랜드에 원화로 지급한 금액(플랫폼 비용) */
  celCover: number;
};

export type OpexBreakdown = {
  fixed: number;
  kakao: number;
  claude: number;
  pgFixed: number;
  celCover: number;
  variable: number;
  total: number;
};

/**
 * 운영 비용 집계 — 데모 `fixedTotal` · `varCost` · `opexTotal`.
 * 알림톡은 주문당 3건(결제·배송·정산), 크롤링은 인플루언서 1명당 30일로 본다(데모와 같은 가정).
 */
export function opexBreakdown(i: OpexInput): OpexBreakdown {
  const o = i.opex;
  const fixed = o.server + o.db + o.cs + o.domain + o.misc;
  const kakao = o.kakaoPer * i.orders * 3;
  const claude = o.claudePerCrawl * i.sellers * 30 + o.claudePerMatch * i.inferences;
  const celCover = Math.max(0, Math.round(i.celCover));
  const variable = kakao + claude + o.pgFixed + celCover;
  return { fixed, kakao, claude, pgFixed: o.pgFixed, celCover, variable, total: fixed + variable };
}

export type ProfitSummary = {
  /** 플랫폼 순수익(VAT 제외) − 운영 비용 */
  finalNet: number;
  /** 순 테이크레이트 = 플랫폼 순수익 / 확정 매출. 매출이 0 이면 null */
  takeRate: number | null;
  /** 손익분기 월 GMV = 운영비 ÷ 순 테이크레이트. 테이크레이트가 0 이하면 null(계산 불가) */
  breakEvenGmv: number | null;
  /** 운영비율 = 운영비 ÷ 확정 매출. 매출이 0 이면 null */
  opexRatio: number | null;
};

export function profitSummary(net: number, platformNet: number, opexTotal: number): ProfitSummary {
  const takeRate = net > 0 ? platformNet / net : null;
  return {
    finalNet: Math.round(platformNet - opexTotal),
    takeRate,
    breakEvenGmv: takeRate !== null && takeRate > 0 ? Math.round(opexTotal / takeRate) : null,
    opexRatio: net > 0 ? opexTotal / net : null,
  };
}

/* ---------------------------------------------------------------- 파서 ---------------------------------------------------------------- */

/** 손익 요약 19항목 + 건수 — `app_admin_revenue()` totals */
export type RevenueTotals = {
  gross: number;
  refunds: number;
  net: number;
  sample_net: number;
  pg_fee: number;
  seller_fee: number;
  seller_bonus: number;
  ref_boost: number;
  ref_reward: number;
  brand_ref_boost: number;
  brand_ref_reward: number;
  brand_discount: number;
  platform_fee_gross: number;
  costs: number;
  platform_fee: number;
  vat: number;
  platform_net: number;
  seller_fee_total: number;
  brand_payout: number;
  paid_count: number;
  refund_count: number;
  /**
   * 정산 후 환불 (0050) — 정산이 끝난 뒤 들어온 환불의 합계. 주문은 `CANCELED` 가 되고
   * 정산 스냅샷에는 반영될 수 없다(스냅샷은 지급액의 계약 · 0008:544).
   * `net`·`platform_net` 은 스냅샷 그대로이고 **실제 금액은 `*_adjusted`** 다 —
   * 환불액은 플랫폼 몫에서 빠진다(브랜드·인플루언서 지급액은 확정이라 줄지 않는다).
   */
  post_refunds: number;
  post_refund_count: number;
  /** `net − post_refunds` */
  net_adjusted: number;
  /** `platform_net − post_refunds` */
  platform_net_adjusted: number;
};

export type RevenueRow = RevenueTotals & {
  campaign_id: string;
  campaign_code: string | null;
  campaign_status: string;
  /** `live` 계산값 · `snapshot` 정산 확정값 · `none` 정산됐지만 스냅샷이 없어 금액을 모른다 */
  source: "live" | "snapshot" | "none";
  product_name: string | null;
  product_code: string | null;
  seller_name: string | null;
  seller_handle: string | null;
  brand_name: string | null;
  brand_code: string | null;
  sample_cel_cover: number;
  /** 샘플 구매만 있고 아직 판매가 열리지 않은 건 — 브랜드 지급 규칙이 미정이다(0019:45) */
  samplePending: boolean;
};

export type RevenueCelery = {
  topup_won: number;
  topup_net: number;
  topup_count: number;
  granted: number;
  earned: number;
  spent: number;
  balance: number;
  cel_won_unit: number;
};

export type AdminRevenue = {
  totals: RevenueTotals;
  rows: RevenueRow[];
  counts: { campaigns: number; no_snapshot: number };
  celery: RevenueCelery;
  celCover: number;
  opex: Opex;
};

const TOTAL_KEYS: (keyof RevenueTotals)[] = [
  "gross",
  "refunds",
  "net",
  "sample_net",
  "pg_fee",
  "seller_fee",
  "seller_bonus",
  "ref_boost",
  "ref_reward",
  "brand_ref_boost",
  "brand_ref_reward",
  "brand_discount",
  "platform_fee_gross",
  "costs",
  "platform_fee",
  "vat",
  "platform_net",
  "seller_fee_total",
  "brand_payout",
  "paid_count",
  "refund_count",
  // 정산 후 환불 조정 (0050) — RPC 가 조정분이 있을 때만 채우므로 없으면 num() 이 0 으로 둔다
  "post_refunds",
  "post_refund_count",
  "net_adjusted",
  "platform_net_adjusted",
];

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function parseTotals(raw: unknown): RevenueTotals {
  const o = obj(raw) ?? {};
  const out = {} as RevenueTotals;
  for (const k of TOTAL_KEYS) out[k] = num(o[k]);
  // 정산 후 환불 조정(0050)은 RPC 가 **조정분이 있는 행에만** 넣는다 — 없으면 조정 전과 같다.
  // 그대로 두면 일반 캠페인의 `net_adjusted` 가 0 으로 보인다(num() 기본값).
  if (o.net_adjusted === undefined || o.net_adjusted === null) out.net_adjusted = out.net;
  if (o.platform_net_adjusted === undefined || o.platform_net_adjusted === null) out.platform_net_adjusted = out.platform_net;
  return out;
}

/** `LIVE`·`CLEARING`·`SETTLED` 밖인데 집계에 든 건 = 샘플 구매만 있는 캠페인 */
const REVENUE_STATES = new Set(["LIVE", "CLEARING", "SETTLED"]);

export function parseAdminRevenue(raw: unknown): AdminRevenue | null {
  const o = obj(raw);
  if (!o || o.ok !== true) return null;

  const rows: RevenueRow[] = (Array.isArray(o.rows) ? o.rows : []).flatMap((r) => {
    const x = obj(r);
    if (!x) return [];
    const status = String(x.campaign_status ?? "");
    const src = x.source === "snapshot" ? "snapshot" : x.source === "none" ? "none" : "live";
    return [
      {
        ...parseTotals(x),
        campaign_id: String(x.campaign_id ?? ""),
        campaign_code: str(x.campaign_code),
        campaign_status: status,
        source: src as RevenueRow["source"],
        product_name: str(x.product_name),
        product_code: str(x.product_code),
        seller_name: str(x.seller_name),
        seller_handle: str(x.seller_handle),
        brand_name: str(x.brand_name),
        brand_code: str(x.brand_code),
        sample_cel_cover: num(x.sample_cel_cover),
        samplePending: !REVENUE_STATES.has(status),
      },
    ];
  });

  const c = obj(o.counts) ?? {};
  const cel = obj(o.celery) ?? {};

  return {
    totals: parseTotals(o.totals),
    rows,
    counts: { campaigns: num(c.campaigns), no_snapshot: num(c.no_snapshot) },
    celery: {
      topup_won: num(cel.topup_won),
      topup_net: num(cel.topup_net),
      topup_count: num(cel.topup_count),
      granted: num(cel.granted),
      earned: num(cel.earned),
      spent: num(cel.spent),
      balance: num(cel.balance),
      cel_won_unit: num(cel.cel_won_unit) || 20000,
    },
    celCover: num(o.cel_cover),
    opex: parseOpex(o.opex),
  };
}

/** 저장 결과 문구 — 화면이 `?msg=` 로 바꿔 띄운다 */
export const OPEX_MESSAGES: Record<string, string> = {
  saved: "운영 비용을 저장했습니다 — 최종 순이익을 다시 계산했습니다.",
  reset: "운영 비용을 기본값으로 되돌렸습니다.",
  err_BAD_INPUT: "운영 비용 값을 다시 확인해주세요.",
  err_DB_ERROR: "저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
};
