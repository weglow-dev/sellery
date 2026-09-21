/**
 * 브랜드 상품 규칙 — 등록·수정 폼(`/brand/products/new` · `/[code]`)과 서버(form action → `app_brand_upsert_product` 0015)가 **같은 규칙**을 쓴다
 * (docs/brand-console-plan.md §4 "0015" · §8 열린 결정 · 인플루언서 `../partner/sample-rules.ts` 의 브랜드 판). 순수 모듈 — DB 호출은
 * `../server/brand/products.server.ts`.
 *
 * 프로토타입 원본: packages/core/src/actions.ts createProduct · saveProduct · deleteProduct · toggleListing(잠금 · 재검수 · 삭제 가드),
 * helpers.ts optsOf(자동 옵션) · allocated · stockLeft, packages/ui/src/modals/ProductModal.svelte(폼 필드 · 총 수수료율 = 플랫폼 10%p + 인플루언서).
 *
 *   parseProductInput(form)        FormData · 객체 → `ProductInput`(RPC p_input 과 1:1) — 첫 실패 필드 + 문구. DB 함수가 같은 조건을 다시 검사한다.
 *   parseOptionLines(text)         "옵션명 | 가격" 줄 → [{n, price}] (데모 parseOpts)
 *   autoOptions(salePrice)         옵션이 비었을 때 1개 / 2개 −5% / 3개 −10% (0008 resolve_product_options 와 같은 결과 — 표시용, 저장은 [])
 *   totalRateToCommission(pct)     총 요율(%) → 인플루언서 수수료율(소수, ≥ 0.05) · commissionToTotalRate(rate) 역변환(폼 프리필)
 *   isProductLocked(statuses) · allocatedOf(campaigns) · stockLeftOf(stock, allocated)   잠금 · 배정량 (표시용 — 판정은 SQL)
 *   productStatusChip(status)      pending · listed · paused · rejected → 칩
 *   PRODUCT_FAIL_MESSAGES · productFailMessage(result)   RPC {ok:false, code, field} → 사용자 문구
 */
import { GRADES } from "@sellery/core/constants";
import type { StatusTone } from "../order-status";
import { cleanText } from "../text";

/* ---------------- 상수 (0015 · 0002 제약과 같은 값) ---------------- */

/** 플랫폼 몫 10%p — 브랜드가 입력하는 총 수수료율에 포함 (@sellery/core PLAT_RATE) */
export const PLATFORM_RATE_PP = 10;
/** 인플루언서 수수료율 하한 — platform_settings.min_seller_rate 와 같은 값 (데모 `Math.max(5, …)`) */
export const MIN_SELLER_RATE = 0.05;
/** 총 수수료율 폼 힌트(문구) — 상한은 정책이 아니다(§8) */
export const TOTAL_RATE_HINT = { min: 11, max: 50, default: 30 } as const;

export const PRODUCT_NAME_MAX = 80;
export const PRODUCT_DESC_MAX = 300;
export const PRODUCT_EMOJI_MAX = 8;
export const SAMPLE_TEXT_MAX = 60;
export const SAMPLE_TEXT_DEFAULT = "무상 1개";
export const EXCLUSIVE_LABEL_MAX = 80;
export const OPTION_NAME_MAX = 60;
export const OPTIONS_MAX = 20;
export const IMAGE_URLS_MAX = 4;
export const IMAGE_URL_MAX = 500;
export const PRICE_MAX = 100_000_000;
export const STOCK_MAX = 10_000_000;

export const PRODUCT_STATUSES = ["pending", "listed", "paused", "rejected"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export function isProductStatus(v: unknown): v is ProductStatus {
  return typeof v === "string" && (PRODUCT_STATUSES as readonly string[]).includes(v);
}

/** 독점 오퍼 기준 등급 — 상위 4단계 (0002 products_exclusive_grade_top4 · GRADES.slice(0, 4)) */
export const EXCLUSIVE_GRADES = ["블랙", "다이아", "플래티넘", "골드"] as const;
export type ExclusiveGrade = (typeof EXCLUSIVE_GRADES)[number];

export const SAMPLE_BUY_MODES = ["auto", "fixed"] as const;
export type SampleBuyMode = (typeof SAMPLE_BUY_MODES)[number];

/** 무상 샘플 기준 등급 셀렉트 — 스타터 → 블랙 순 (데모 `GRADES.slice().reverse()`) */
export function sampleTierOptions(): readonly string[] {
  return GRADES.map((t) => t.g).reverse();
}

/** 데모 ProductModal 기본 무상 등급 */
export const SAMPLE_FREE_GRADE_DEFAULT = "실버";

/* ---------------- 잠금 · 배정 (표시용 — 판정은 0015 product_is_locked · product_allocated) ---------------- */

/** 가격·요율·옵션 잠금을 만드는 캠페인 상태 (saveProduct `locked`) */
export const LOCKING_STATUSES = ["SCHEDULE_CONFIRMED", "LIVE", "CLEARING"] as const;
/** 재고 배정량에 들어가는 상태 (helpers.ts allocated) */
export const ALLOCATING_STATUSES = ["SCHEDULE_CONFIRMED", "LIVE"] as const;
/** 삭제를 막지 않는 종결 상태 (deleteProduct) — SETTLED 는 이력이라 막는다 */
export const DELETABLE_WITH_STATUSES = ["REJECTED", "PASSED", "DECLINED"] as const;

export function isProductLocked(campaignStatuses: readonly string[]): boolean {
  return campaignStatuses.some((s) => (LOCKING_STATUSES as readonly string[]).includes(s));
}

export function allocatedOf(campaigns: readonly { status: string; qty: number }[]): number {
  return campaigns.reduce((a, c) => a + ((ALLOCATING_STATUSES as readonly string[]).includes(c.status) ? Math.max(0, c.qty | 0) : 0), 0);
}

export function stockLeftOf(stock: number, allocated: number): number {
  return Math.max(0, (stock | 0) - (allocated | 0));
}

export function canDeleteProduct(campaignStatuses: readonly string[]): boolean {
  return campaignStatuses.every((s) => (DELETABLE_WITH_STATUSES as readonly string[]).includes(s));
}

/* ---------------- 수수료율 · 옵션 ---------------- */

/**
 * 총 수수료율(%) → 인플루언서 수수료율(소수 4자리). 데모 `Math.max(5, totalRate − 10) / 100` — 총 요율이 15 미만이면 하한 0.05.
 * 총 요율 ≤ 10 은 폼이 먼저 막는다(parseProductInput total_rate).
 */
export function totalRateToCommission(totalPct: number): number {
  const v = Math.max(MIN_SELLER_RATE, totalPct / 100 - PLATFORM_RATE_PP / 100);
  return Math.round(v * 10000) / 10000;
}

/** 인플루언서 수수료율(소수) → 총 수수료율(%) — 수정 폼 프리필 (데모 `Math.round((rate + PLAT_RATE) * 100)`) */
export function commissionToTotalRate(rate: number): number {
  return Math.round((rate + PLATFORM_RATE_PP / 100) * 1000) / 10;
}

export type ProductOption = { n: string; price: number };

/** 기본 번들 — platform_settings option_bundle_defaults 와 같은 값 (optsOf L42) */
export const OPTION_BUNDLE_DEFAULTS: readonly { n: number; disc: number }[] = [
  { n: 1, disc: 0 },
  { n: 2, disc: 0.05 },
  { n: 3, disc: 0.1 },
];

/** 옵션이 비었을 때의 자동 옵션 — 라벨·반올림(100원) 은 0008 resolve_product_options 와 동일. 표시용(저장은 `[]`). */
export function autoOptions(salePrice: number, bundles: readonly { n: number; disc: number }[] = OPTION_BUNDLE_DEFAULTS, roundUnit = 100): ProductOption[] {
  const gp = Math.max(0, salePrice | 0);
  return bundles.map((b) => ({
    n: b.disc === 0 ? `${b.n}개` : `${b.n}개 세트 · ${Math.round(b.disc * 100)}% 추가 할인`,
    price: Math.round((gp * b.n * (1 - b.disc)) / roundUnit) * roundUnit,
  }));
}

/**
 * 폼 textarea("옵션명 | 가격" 한 줄에 하나) → 옵션 배열. 데모 parseOpts: 가격의 숫자 외 문자는 버리고, 이름·가격이 없는 줄은 건너뛴다.
 * 이름은 cleanText(이모지 제거 · 공백 정리). 검증(길이 · 개수 · 가격 > 0)은 parseProductInput 에서.
 */
export function parseOptionLines(text: string): ProductOption[] {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.split("|"))
    .filter((a) => a.length >= 2)
    .map((a) => ({ n: cleanText(a[0] ?? ""), price: Number((a[1] ?? "").replace(/[^\d]/g, "")) }))
    .filter((o) => o.n && Number.isFinite(o.price) && o.price > 0);
}

/** 옵션 배열 → textarea 프리필 (데모 `options.map(o => o.n + ' | ' + o.price).join('\n')`) */
export function optionLines(options: readonly ProductOption[]): string {
  return options.map((o) => `${o.n} | ${o.price}`).join("\n");
}

/* ---------------- 폼 입력 → RPC p_input ---------------- */

export type SamplePolicyInput = {
  free_grade: string;
  buy_mode: SampleBuyMode;
  fixed_price: number;
  refund: boolean;
};

/** `app_brand_upsert_product` p_input 과 1:1 (0015 헤더의 키 목록) */
export type ProductInput = {
  name: string;
  description: string | null;
  emoji: string | null;
  category: string;
  consumer_price: number;
  sale_price: number;
  /** 총 수수료율(%) — 플랫폼 10%p 포함 */
  total_rate: number;
  stock: number;
  sample_text: string;
  sample_policy: SamplePolicyInput | null;
  exclusive_grade: ExclusiveGrade | null;
  exclusive_label: string | null;
  options: ProductOption[];
  /** 서버가 Storage 에 올린 뒤 채운다 — 폼에서 오는 값은 기존 URL(유지) */
  thumb_url: string | null;
  image_urls: string[];
};

export type ProductField =
  | "name"
  | "description"
  | "emoji"
  | "category"
  | "consumer_price"
  | "sale_price"
  | "total_rate"
  | "stock"
  | "sample_text"
  | "sample_policy"
  | "exclusive_grade"
  | "exclusive_label"
  | "options"
  | "thumb_url"
  | "image_urls";

export const PRODUCT_FIELD_MESSAGES: Record<ProductField, string> = {
  name: `상품명을 입력해주세요 (${PRODUCT_NAME_MAX}자 이내)`,
  description: `한 줄 설명은 ${PRODUCT_DESC_MAX}자 이내로 입력해주세요`,
  emoji: "이모지는 한 글자만 넣어주세요",
  category: "카테고리를 선택해주세요 — 건강·웰니스 범위 안의 카테고리만 등록할 수 있어요",
  consumer_price: "소비자가를 확인해주세요 (0 이상)",
  sale_price: "판매가를 입력해주세요 (1원 이상)",
  total_rate: `총 수수료율은 플랫폼 몫(${PLATFORM_RATE_PP}%)보다 커야 해요`,
  stock: "재고를 확인해주세요 (0 이상)",
  sample_text: `샘플 내용은 ${SAMPLE_TEXT_MAX}자 이내로 입력해주세요`,
  sample_policy: "샘플 정책을 확인해주세요 — 지정가를 고르면 금액을 입력해야 해요",
  exclusive_grade: "독점권 기준 등급은 골드 이상만 고를 수 있어요",
  exclusive_label: `독점권 내용은 ${EXCLUSIVE_LABEL_MAX}자 이내로 입력해주세요`,
  options: `구매 옵션은 "옵션명 | 가격" 형식으로 ${OPTIONS_MAX}개까지, 가격은 1원 이상이어야 해요`,
  thumb_url: "썸네일 이미지 주소가 올바르지 않아요",
  image_urls: `상세 이미지는 ${IMAGE_URLS_MAX}장까지 올릴 수 있어요`,
};

export type ParsedProductInput = { ok: true; input: ProductInput } | { ok: false; field: ProductField; message: string };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);

function str(src: Obj, k: string): string {
  const v = src[k];
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

/** 숫자 필드 — "29,900" · "29900" · 29900 허용 · 비면 null · 형식 밖이면 NaN */
function num(src: Obj, k: string): number | null {
  const v = src[k];
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : Number.NaN;
  if (typeof v !== "string") return Number.NaN;
  const s = v.replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return Number.NaN;
  return Number(s);
}

function bool(src: Obj, k: string): boolean {
  const v = src[k];
  return v === true || v === "true" || v === "on" || v === "1" || v === 1;
}

function fail(field: ProductField): ParsedProductInput {
  return { ok: false, field, message: PRODUCT_FIELD_MESSAGES[field] };
}

/**
 * FormData(폼 필드 이름 = ProductInput 키 · 샘플 정책은 `sample_free_grade` `sample_buy_mode` `sample_fixed_price` `sample_refund` · 옵션은 `options`
 * textarea 또는 배열 · `image_urls` 는 반복 필드 또는 배열) 또는 객체 → ProductInput. 실패하면 첫 어긋난 필드와 문구(폼 순서).
 * `sample_policy_enabled`(체크박스) 가 없거나 `sample_free_grade` 가 비면 sample_policy = null(전부-또는-없음 · spOf 기본값 사용).
 */
export function parseProductInput(raw: unknown): ParsedProductInput {
  let src: Obj | null;
  let imageList: unknown[] | null = null;
  if (typeof FormData !== "undefined" && raw instanceof FormData) {
    src = {};
    for (const [k, v] of raw.entries()) if (typeof v === "string" && !(k in src)) src[k] = v;
    imageList = raw.getAll("image_urls").filter((v): v is string => typeof v === "string");
  } else {
    src = obj(raw);
  }
  if (!src) return fail("name");

  const name = cleanText(str(src, "name"));
  if (!name || name.length > PRODUCT_NAME_MAX) return fail("name");

  const descRaw = cleanText(str(src, "description"));
  if (descRaw.length > PRODUCT_DESC_MAX) return fail("description");
  const description = descRaw || null;

  const emojiRaw = str(src, "emoji").trim();
  if (emojiRaw.length > PRODUCT_EMOJI_MAX) return fail("emoji");
  const emoji = emojiRaw || null;

  const category = str(src, "category").trim();
  if (!category) return fail("category");

  const consumer_price = num(src, "consumer_price");
  if (consumer_price === null || !Number.isInteger(consumer_price) || consumer_price < 0 || consumer_price > PRICE_MAX) return fail("consumer_price");

  const sale_price = num(src, "sale_price");
  if (sale_price === null || !Number.isInteger(sale_price) || sale_price <= 0 || sale_price > PRICE_MAX) return fail("sale_price");

  const total_rate = num(src, "total_rate");
  if (total_rate === null || !Number.isFinite(total_rate) || total_rate <= PLATFORM_RATE_PP || total_rate > 100) return fail("total_rate");

  const stockRaw = num(src, "stock");
  const stock = stockRaw === null ? 0 : stockRaw;
  if (!Number.isInteger(stock) || stock < 0 || stock > STOCK_MAX) return fail("stock");

  const sampleTextRaw = cleanText(str(src, "sample_text"));
  if (sampleTextRaw.length > SAMPLE_TEXT_MAX) return fail("sample_text");
  const sample_text = sampleTextRaw || SAMPLE_TEXT_DEFAULT;

  // 샘플 정책 — 객체(sample_policy) 또는 평면 필드(sample_free_grade …). 등급이 비면 null.
  let sample_policy: SamplePolicyInput | null = null;
  const spObj = obj(src.sample_policy);
  const spSrc: Obj = spObj ?? { free_grade: src.sample_free_grade, buy_mode: src.sample_buy_mode, fixed_price: src.sample_fixed_price, refund: src.sample_refund };
  const freeGrade = str(spSrc, "free_grade").trim();
  const spEnabled = "sample_policy_enabled" in src ? bool(src, "sample_policy_enabled") : true;
  if (spEnabled && freeGrade) {
    if (!sampleTierOptions().includes(freeGrade)) return fail("sample_policy");
    const buyMode = str(spSrc, "buy_mode").trim() || "auto";
    if (!(SAMPLE_BUY_MODES as readonly string[]).includes(buyMode)) return fail("sample_policy");
    const fixedRaw = num(spSrc, "fixed_price");
    const fixed_price = fixedRaw === null ? 0 : fixedRaw;
    if (!Number.isInteger(fixed_price) || fixed_price < 0 || fixed_price > PRICE_MAX) return fail("sample_policy");
    if (buyMode === "fixed" && fixed_price <= 0) return fail("sample_policy");
    sample_policy = { free_grade: freeGrade, buy_mode: buyMode as SampleBuyMode, fixed_price, refund: bool(spSrc, "refund") };
  }

  const exGradeRaw = str(src, "exclusive_grade").trim();
  if (exGradeRaw && !(EXCLUSIVE_GRADES as readonly string[]).includes(exGradeRaw)) return fail("exclusive_grade");
  const exclusive_grade = (exGradeRaw || null) as ExclusiveGrade | null;
  const exLabelRaw = cleanText(str(src, "exclusive_label"));
  if (exLabelRaw.length > EXCLUSIVE_LABEL_MAX) return fail("exclusive_label");
  const exclusive_label = exclusive_grade ? exLabelRaw || `${exclusive_grade} 등급 독점권` : null;

  // 옵션 — textarea 문자열 또는 [{n, price}] 배열
  let options: ProductOption[];
  const optRaw = src.options;
  if (Array.isArray(optRaw)) {
    options = [];
    for (const o of optRaw) {
      const oo = obj(o);
      if (!oo) return fail("options");
      const n = cleanText(str(oo, "n"));
      const price = num(oo, "price");
      if (!n || n.length > OPTION_NAME_MAX || price === null || !Number.isInteger(price) || price <= 0 || price > PRICE_MAX) return fail("options");
      options.push({ n, price });
    }
  } else {
    options = parseOptionLines(typeof optRaw === "string" ? optRaw : "");
    if (options.some((o) => o.n.length > OPTION_NAME_MAX || o.price > PRICE_MAX)) return fail("options");
  }
  if (options.length > OPTIONS_MAX) return fail("options");

  const thumbRaw = str(src, "thumb_url").trim();
  if (thumbRaw.length > IMAGE_URL_MAX || /\s/.test(thumbRaw)) return fail("thumb_url");
  const thumb_url = thumbRaw || null;

  const imgsRaw = imageList ?? (Array.isArray(src.image_urls) ? src.image_urls : typeof src.image_urls === "string" ? [src.image_urls] : []);
  const image_urls: string[] = [];
  for (const u of imgsRaw) {
    if (typeof u !== "string") return fail("image_urls");
    const t = u.trim();
    if (!t) continue;
    if (t.length > IMAGE_URL_MAX || /\s/.test(t)) return fail("image_urls");
    image_urls.push(t);
  }
  if (image_urls.length > IMAGE_URLS_MAX) return fail("image_urls");

  return {
    ok: true,
    input: {
      name,
      description,
      emoji,
      category,
      consumer_price,
      sale_price,
      total_rate,
      stock,
      sample_text,
      sample_policy,
      exclusive_grade,
      exclusive_label,
      options,
      thumb_url,
      image_urls,
    },
  };
}

/* ---------------- 상태 칩 ---------------- */

/** 데모 admin PSTATS · pstChip 문구 */
export function productStatusChip(status: string): { label: string; tone: StatusTone } {
  switch (status) {
    case "pending":
      return { label: "검수 대기", tone: "amber" };
    case "listed":
      return { label: "노출 중", tone: "green" };
    case "paused":
      return { label: "노출 중단", tone: "gray" };
    case "rejected":
      return { label: "반려", tone: "red" };
    default:
      return { label: status, tone: "gray" };
  }
}

/* ---------------- RPC 실패 코드 → 문구 ---------------- */

/** 0015 app_brand_upsert_product · set_listing · delete_product 의 ok:false 코드 + 앱 쪽 코드 */
export type ProductFailCode = "INVALID_INPUT" | "LOCKED_FIELD" | "STOCK_BELOW_ALLOCATED" | "NOT_FOUND" | "NOT_REVIEWED" | "HAS_ACTIVE_CAMPAIGNS" | "BAD_FILE" | "DB_ERROR";

export const PRODUCT_FAIL_CODES: readonly ProductFailCode[] = [
  "INVALID_INPUT",
  "LOCKED_FIELD",
  "STOCK_BELOW_ALLOCATED",
  "NOT_FOUND",
  "NOT_REVIEWED",
  "HAS_ACTIVE_CAMPAIGNS",
  "BAD_FILE",
  "DB_ERROR",
];

export function isProductFailCode(v: unknown): v is ProductFailCode {
  return typeof v === "string" && (PRODUCT_FAIL_CODES as readonly string[]).includes(v);
}

/** 데모 토스트 원문 (saveProduct 잠금 안내 · deleteProduct · toggleListing) */
export const PRODUCT_FAIL_MESSAGES: Record<ProductFailCode, string> = {
  INVALID_INPUT: "입력 내용을 확인해주세요",
  LOCKED_FIELD: "진행 중·확정된 판매가 있어 판매가·수수료율·옵션은 변경할 수 없어요 (신뢰 보호) — 재고·샘플 정책·이미지·독점권은 수정할 수 있어요",
  STOCK_BELOW_ALLOCATED: "재고를 이미 배정된 수량보다 적게 줄일 수 없어요",
  NOT_FOUND: "상품을 찾을 수 없어요",
  NOT_REVIEWED: "검수가 끝나기 전에는 노출을 바꿀 수 없어요",
  HAS_ACTIVE_CAMPAIGNS: "진행 이력이 있는 상품은 삭제할 수 없어요 — 노출 중단을 사용해주세요",
  BAD_FILE: "이미지는 JPG · PNG · WEBP · GIF, 10MB 이하만 올릴 수 있어요",
  DB_ERROR: "저장 중 문제가 생겼어요 — 잠시 후 다시 시도해주세요",
};

const LOCKED_FIELD_LABELS: Record<string, string> = { consumer_price: "소비자가", sale_price: "판매가", total_rate: "수수료율", options: "구매 옵션" };

/** {code, field?, allocated?} → 문구. INVALID_INPUT 은 필드 문구, LOCKED_FIELD 는 필드명, STOCK_BELOW_ALLOCATED 는 배정량을 붙인다. */
export function productFailMessage(r: { code: string; field?: string | null; allocated?: number | null }): string {
  if (r.code === "INVALID_INPUT" && r.field && r.field in PRODUCT_FIELD_MESSAGES) return PRODUCT_FIELD_MESSAGES[r.field as ProductField];
  if (r.code === "LOCKED_FIELD") {
    const f = r.field ? LOCKED_FIELD_LABELS[r.field] : null;
    return f ? `진행 중·확정된 판매가 있어 ${f}은(는) 변경할 수 없어요 (신뢰 보호)` : PRODUCT_FAIL_MESSAGES.LOCKED_FIELD;
  }
  if (r.code === "STOCK_BELOW_ALLOCATED" && typeof r.allocated === "number") {
    return `재고는 배정된 ${r.allocated.toLocaleString("ko-KR")}개보다 적게 줄일 수 없어요`;
  }
  return isProductFailCode(r.code) ? PRODUCT_FAIL_MESSAGES[r.code] : PRODUCT_FAIL_MESSAGES.DB_ERROR;
}

/** 저장 성공 토스트 (createProduct · saveProduct 원문) */
export function productSavedMessage(r: { created: boolean; rereview?: boolean; status: string }, name: string): string {
  if (r.created) return "검수 요청 완료 — 관리자 승인 후 노출";
  if (r.rereview) return `${name} 수정 저장 — 판매가·수수료율 변경으로 재검수 대기로 전환됩니다`;
  return r.status === "pending" ? `${name} 수정 저장 — 재검수 요청됨` : `${name} 수정 저장 완료`;
}
