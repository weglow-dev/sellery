/**
 * 캠페인 카드 타입 + 순수 함수 — 계약 docs/app-plan.md §10.0. 소유: C.
 *
 * 타입은 0008 `campaign_card(p_code)` 의 jsonb_build_object 키와 1:1 (컬럼 nullability 는 database.types.ts 기준).
 * 이 모듈은 브라우저·서버 양쪽에서 import 된다 — Next/Supabase 를 import 하지 않는다 (순수 함수만).
 * 화면 규칙 원문: ux-spec §1.6(포맷·D-day·잔여) · §1.8(상태) · §1.10(보는 중) · §1.11(★ 추천) · 프로토타입 js/60-customer.js.
 */
import { CLEAR_DAYS } from "@sellery/core/constants";
import type { CampaignStatus } from "./types";
import { daysBetween } from "./dates";

/** 확정 옵션 — 0008 resolve_product_options() 결과 원소. 라벨 예: '1개' · '2개 세트 · 5% 추가 할인' */
export type ResolvedOption = { n: string; price: number };

export type CampaignCard = {
  campaign: {
    id: string;
    code: string;
    status: CampaignStatus;
    start_date: string | null;
    end_date: string | null;
    /** SETTLED 이면 null (실적 비공개) */
    qty: number | null;
    /** SETTLED 이면 null */
    sold_qty: number | null;
    home_featured_at: string | null;
    /** 서버 기준일 YYYY-MM-DD (Asia/Seoul) — D-day·구매 가능 판정의 기준 */
    today: string;
  };
  product: {
    id: string;
    code: string | null;
    name: string;
    description: string | null;
    emoji: string;
    thumb_url: string | null;
    image_urls: string[];
    category: string;
    consumer_price: number;
    sale_price: number;
    /** 항상 비어 있지 않은 확정 배열 — 앱은 가격 규칙을 복제하지 않는다 */
    options: ResolvedOption[];
    /** 브랜드 등록 원본 (디버깅·브랜드 센터용) */
    options_raw: unknown;
    status: string;
  };
  seller: {
    id: string;
    code: string | null;
    name: string;
    /** DB 값은 '@jiyu_beauty' 처럼 '@' 를 포함한다 — URL 에는 normalizeHandle() 결과만 쓴다 */
    handle: string;
    platform: string;
    avatar_url: string | null;
    grade: string | null;
  };
  brand: {
    id: string;
    code: string | null;
    name: string;
    logo_url: string | null;
    grade: string | null;
    biz_no: string | null;
    mail_order_no: string | null;
  };
  /** verified 채널만, primary 우선 — hidden 인플루언서는 빈 배열 */
  channels: { platform: string; handle: string; url: string | null }[];
  settings: {
    clear_days: number;
    link_protect_days: number;
    home_feature_days: number;
  };
};

/**
 * 홈 · "다른 판매" 카드 — anon 테이블 조인(campaigns → products/sellers/brands 공개 컬럼) 결과.
 * custVisible() 에는 `{ seller_id, product_id, category: product.category }` 를 넘긴다.
 */
export type HomeCard = {
  id: string;
  code: string;
  status: CampaignStatus;
  start_date: string | null;
  end_date: string | null;
  qty: number;
  sold_qty: number;
  home_featured_at: string | null;
  seller_id: string;
  product_id: string;
  brand_id: string;
  product: {
    id: string;
    name: string;
    description: string | null;
    emoji: string;
    thumb_url: string | null;
    category: string;
    consumer_price: number;
    sale_price: number;
  };
  seller: {
    id: string;
    /** 홈 `?seller=` 필터 키 (ux-spec §3.2.1 — seller.code) */
    code: string | null;
    name: string;
    handle: string;
    platform: string;
    avatar_url: string | null;
    grade: string | null;
  };
  brand: { id: string; name: string };
};

/** 캠페인 code 형식 — 링크 쿠키(B `LINK_CODE_RE`)와 같은 규칙. 통과하지 못한 URL 세그먼트는 RPC 호출 없이 404. */
export const CAMPAIGN_CODE_RE = /^[a-z0-9_-]{1,32}$/;

const CAMPAIGN_STATUSES: readonly CampaignStatus[] = ["SCHEDULE_CONFIRMED", "LIVE", "CLEARING", "SETTLED"];

/** 정책 기본값 — RPC settings 가 비정상일 때만 (0008 campaign_card 의 coalesce 기본값과 동일 · clear_days 는 `@sellery/core/constants` CLEAR_DAYS) */
export const DEFAULT_SETTINGS: CampaignCard["settings"] = { clear_days: CLEAR_DAYS, link_protect_days: 7, home_feature_days: 7 };

/* ---------------- 런타임 가드 ---------------- */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const intOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);

function parseOptions(v: unknown): ResolvedOption[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: ResolvedOption[] = [];
  for (const e of v) {
    const o = obj(e);
    const n = o ? str(o.n) : null;
    const price = o ? intOrNull(o.price) : null;
    if (!o || n === null || price === null || price < 0) return null;
    out.push({ n, price });
  }
  return out;
}

function parseSettings(v: unknown): CampaignCard["settings"] {
  const o = obj(v);
  const pick = (k: keyof CampaignCard["settings"]) => {
    const n = o ? intOrNull(o[k]) : null;
    return n !== null && n >= 0 ? n : DEFAULT_SETTINGS[k];
  };
  return { clear_days: pick("clear_days"), link_protect_days: pick("link_protect_days"), home_feature_days: pick("home_feature_days") };
}

/** campaign_card() jsonb → CampaignCard. 형식이 어긋나면 null (런타임 가드 — `Json` 타입을 좁힌다). */
export function parseCampaignCard(json: unknown): CampaignCard | null {
  const root = obj(json);
  if (!root) return null;
  const c = obj(root.campaign);
  const p = obj(root.product);
  const s = obj(root.seller);
  const b = obj(root.brand);
  if (!c || !p || !s || !b) return null;

  const status = str(c.status);
  if (!status || !(CAMPAIGN_STATUSES as readonly string[]).includes(status)) return null;
  const cId = str(c.id);
  const cCode = str(c.code);
  const today = str(c.today);
  if (!cId || !cCode || !today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;

  const pId = str(p.id);
  const pName = str(p.name);
  const pCat = str(p.category);
  const cp = intOrNull(p.consumer_price);
  const gp = intOrNull(p.sale_price);
  const options = parseOptions(p.options);
  if (!pId || !pName || !pCat || cp === null || gp === null || !options) return null;
  const imageUrls = Array.isArray(p.image_urls) ? p.image_urls.filter((u): u is string => typeof u === "string") : [];

  const sId = str(s.id);
  const sName = str(s.name);
  const sHandle = str(s.handle);
  if (!sId || !sName || !sHandle) return null;

  const bId = str(b.id);
  const bName = str(b.name);
  if (!bId || !bName) return null;

  const channels: CampaignCard["channels"] = [];
  if (Array.isArray(root.channels)) {
    for (const e of root.channels) {
      const ch = obj(e);
      const platform = ch ? str(ch.platform) : null;
      const handle = ch ? str(ch.handle) : null;
      if (ch && platform && handle) channels.push({ platform, handle, url: strOrNull(ch.url) });
    }
  }

  return {
    campaign: {
      id: cId,
      code: cCode,
      status: status as CampaignStatus,
      start_date: strOrNull(c.start_date),
      end_date: strOrNull(c.end_date),
      qty: intOrNull(c.qty),
      sold_qty: intOrNull(c.sold_qty),
      home_featured_at: strOrNull(c.home_featured_at),
      today,
    },
    product: {
      id: pId,
      code: strOrNull(p.code),
      name: pName,
      description: strOrNull(p.description),
      emoji: str(p.emoji) || "📦",
      thumb_url: strOrNull(p.thumb_url),
      image_urls: imageUrls,
      category: pCat,
      consumer_price: cp,
      sale_price: gp,
      options,
      options_raw: p.options_raw ?? null,
      status: str(p.status) || "",
    },
    seller: {
      id: sId,
      code: strOrNull(s.code),
      name: sName,
      handle: sHandle,
      platform: str(s.platform) || "",
      avatar_url: strOrNull(s.avatar_url),
      grade: strOrNull(s.grade),
    },
    brand: {
      id: bId,
      code: strOrNull(b.code),
      name: bName,
      logo_url: strOrNull(b.logo_url),
      grade: strOrNull(b.grade),
      biz_no: strOrNull(b.biz_no),
      mail_order_no: strOrNull(b.mail_order_no),
    },
    channels,
    settings: parseSettings(root.settings),
  };
}

/* ---------------- 핸들 · URL ---------------- */

/**
 * '@' 제거 · 소문자 · [a-z0-9._-] 만 남김 · 최대 40자. 결과가 2자 미만이면 '_' (정식 URL 이 비지 않게 — 항상 리다이렉트 대상).
 * URL 세그먼트와 DB handle('@jiyu_beauty') 양쪽에 적용해 비교한다.
 */
export function normalizeHandle(h: string): string {
  const cleaned = (h ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 40);
  return cleaned.length >= 2 ? cleaned : "_";
}

/** "/s/" + normalizeHandle(card.seller.handle) + "/" + card.campaign.code — DB handle 은 '@' 포함이므로 반드시 이 함수로 만든다. */
export function canonicalStoreUrl(card: CampaignCard): string {
  return storeUrl(card.seller.handle, card.campaign.code);
}

/** HomeCard 등 (handle, code) 쌍으로 정식 URL — 홈 카드 링크는 /c/ 를 거치지 않고 바로 정식 URL 로 간다 (app-plan §8 내부 이동은 쿠키 유지). */
export function storeUrl(handle: string, code: string): string {
  return `/s/${normalizeHandle(handle)}/${encodeURIComponent(code)}`;
}

/** 화면 표시용 주소 (프로토타입 원문 `sellery.life/s/{handle}/{code}`) */
export function displayStoreUrl(card: CampaignCard, host = "sellery.life"): string {
  return `${host}${canonicalStoreUrl(card)}`;
}

/* ---------------- 상태 · D-day · 재고 ---------------- */

type Dated = { status: CampaignStatus; start_date: string | null; end_date: string | null };

/** LIVE 인데 end_date < today (스케줄러 지연) → 화면은 종료로 취급 (ux-spec §1.8) */
export function isEnded(c: Dated, today: string): boolean {
  if (c.status === "CLEARING" || c.status === "SETTLED") return true;
  if (c.status === "LIVE" && c.end_date) {
    const past = daysBetween(c.end_date, today);
    return !Number.isNaN(past) && past > 0;
  }
  return false;
}

/**
 * '오늘 마감' | 'D-3 마감' | '오픈 D-2' | '판매 종료' | '오픈 준비 중' (ux-spec §1.6·§1.8).
 *   LIVE:  dd = (end − today) + 1 → dd ≤ 1 이면 '오늘 마감' (종료일 당일까지 구매 가능) · end < today 면 '판매 종료'
 *   예정:  start ≤ today 면 '오픈 준비 중' (UI 가 DB 상태보다 앞서 열지 않는다) · 아니면 '오픈 D-{start − today}'
 */
export function ddayLabelFor(c: Dated, today: string): string {
  if (isEnded(c, today)) return "판매 종료";
  if (c.status === "LIVE") {
    if (!c.end_date) return "판매 중";
    const dd = daysBetween(today, c.end_date) + 1;
    if (Number.isNaN(dd)) return "판매 중";
    return dd <= 1 ? "오늘 마감" : `D-${dd} 마감`;
  }
  // SCHEDULE_CONFIRMED
  if (!c.start_date) return "오픈 준비 중";
  const dd = daysBetween(today, c.start_date);
  if (Number.isNaN(dd) || dd <= 0) return "오픈 준비 중";
  return `오픈 D-${dd}`;
}

/** ddayLabelFor(card.campaign, card.campaign.today) */
export function ddayLabel(card: CampaignCard): string {
  return ddayLabelFor(card.campaign, card.campaign.today);
}

/** 배지 톤 — trendbadge 클래스 접미 ('' 빨강 D-day · soon 검정/라임 · end 회색 · feat 라임 ★ 추천) */
export function badgeTone(label: string): "" | "soon" | "end" {
  if (label === "판매 종료") return "end";
  if (label.startsWith("오픈")) return "soon";
  return "";
}

/** qty − sold_qty (소프트 예약은 서버 API 에서만 차감). SETTLED(qty null) 이면 0. 음수 가능 — 표시는 Math.max(0, …). */
export function stockLeft(card: CampaignCard): number {
  const { qty, sold_qty } = card.campaign;
  if (qty === null) return 0;
  return qty - (sold_qty ?? 0);
}

/** LIVE + start_date ≤ card.campaign.today ≤ end_date + 재고. 실패 문구는 프로토타입 원문 (js/80-actions.js buyNow). */
export function isBuyable(
  card: CampaignCard,
  qty: number,
): { ok: true } | { ok: false; code: "NOT_LIVE" | "SOLD_OUT"; message: string } {
  const c = card.campaign;
  const inPeriod =
    c.status === "LIVE" &&
    !!c.start_date &&
    !!c.end_date &&
    daysBetween(c.start_date, c.today) >= 0 &&
    daysBetween(c.today, c.end_date) >= 0;
  if (!inPeriod) return { ok: false, code: "NOT_LIVE", message: "현재 판매 중이 아닙니다" };
  const left = stockLeft(card);
  const want = Number.isInteger(qty) && qty > 0 ? qty : 1;
  if (left < want) return { ok: false, code: "SOLD_OUT", message: `남은 수량이 부족합니다 (잔여 ${Math.max(0, left)}개)` };
  return { ok: true };
}

/** `home_featured_at` 이 있고 (today − featured) < home_feature_days → ★ 추천 상단 고정 (ux-spec §1.11) */
export function isHomeFeat(c: { home_featured_at: string | null }, today: string, featureDays = DEFAULT_SETTINGS.home_feature_days): boolean {
  if (!c.home_featured_at) return false;
  const d = daysBetween(c.home_featured_at, today);
  return !Number.isNaN(d) && d < featureDays;
}

/* ---------------- 포맷 ---------------- */

/** 29900 → '29,900' (프로토타입 fmt: 반올림 후 ko-KR 천 단위) */
export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

/** '₩29,900' — 화면 규칙 (₩ 리터럴 + fmt). E 의 formatKRW('29,900원') 와는 표기가 다르다. */
export function won(n: number): string {
  return `₩${fmtNum(n)}`;
}

/** ≥1억 → '4.7억' · ≥1만 → '1,234만' · 그 외 fmt (프로토타입 fmtKR — 홈 누적 판매액) */
export function fmtKR(v: number): string {
  if (v >= 1e8) return (v / 1e8).toFixed(1).replace(/\.0$/, "") + "억";
  if (v >= 1e4) return Math.round(v / 1e4).toLocaleString("ko-KR") + "만";
  return fmtNum(v);
}

/** cp > gp 일 때만 `-{n}%` (round((1 − gp/cp) × 100)), 아니면 null */
export function discountPct(cp: number, gp: number): number | null {
  if (!(cp > gp) || cp <= 0) return null;
  return Math.round((1 - gp / cp) * 100);
}

/**
 * 상품 썸네일 src — 시드 `thumb_url` 은 프로토타입 상대 경로('assets/x.webp'), data: URI, 또는 절대 URL.
 * 상대 경로는 apps/shop/static/assets/ 의 파일을 가리키도록 '/' 를 붙인다.
 */
export function imageSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(data:|https?:\/\/|\/)/.test(url)) return url;
  return `/${url.replace(/^\.?\//, "")}`;
}

/** OG 이미지로 쓸 수 있는 URL 만 (data: URI 제외) */
export function ogImageSrc(url: string | null | undefined): string | null {
  const src = imageSrc(url);
  return src && !src.startsWith("data:") ? src : null;
}

/* ---------------- "보는 중" 의사난수 (ux-spec §1.10) ---------------- */

/** seed = Σ charCode(code) · t = floor(now/20s) · 14 + ((seed×31 + t×7) % 53) → 14~66 */
export function viewersOf(code: string, now = Date.now()): number {
  const seed = [...String(code)].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const t = Math.floor(now / 20000);
  return 14 + ((seed * 31 + t * 7) % 53);
}

/* ---------------- 카테고리 (프로토타입 js/20-seller.js CATS · CAT_INFO 원문) ---------------- */

export const CATS = ["전체", "다이어트·체형", "이너뷰티·피부", "비타민·영양", "눈·뇌 건강", "장·소화", "활력·수면", "웰니스 푸드"] as const;
export type Cat = (typeof CATS)[number];

export const CAT_INFO: Record<Exclude<Cat, "전체">, { en: string; desc: string; ex: string }> = {
  "다이어트·체형": { en: "Body", desc: "체지방·탄수화물 컷·식욕 조절", ex: "가르시니아, 시서스, 프로틴 쉐이크" },
  "이너뷰티·피부": { en: "Inner Beauty", desc: "먹는 피부 관리와 더마 스킨케어", ex: "콜라겐, 글루타치온, 히알루론산, 세라마이드" },
  "비타민·영양": { en: "Nutrition", desc: "매일 채우는 기본 영양", ex: "멀티비타민, 오메가3, 마그네슘, 비타민D" },
  "눈·뇌 건강": { en: "Eye & Brain", desc: "눈 피로·집중력·기억력", ex: "루테인, 아스타잔틴, 포스파티딜세린" },
  "장·소화": { en: "Gut", desc: "장 건강과 소화 편안함", ex: "프로바이오틱스, 식이섬유, 소화효소" },
  "활력·수면": { en: "Energy & Sleep", desc: "피로 회복과 편안한 밤", ex: "홍삼, 테아닌, 마그네슘, 밀크씨슬" },
  "웰니스 푸드": { en: "Wellness Food", desc: "건강한 식습관을 위한 식품", ex: "저당 간식, 곤약, 단백질 식품, 건강차" },
};

export function isCat(v: string | null | undefined): v is Cat {
  return (CATS as readonly string[]).includes(v ?? "");
}
