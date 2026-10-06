/**
 * 브랜드 인플루언서 갤러리 · 🥬 데이터 열람 규칙 — 순수 모듈 (브라우저 `.svelte` 와 서버 양쪽에서 import).
 * DB 호출은 `../server/brand/gallery.server.ts`.
 *
 * 가격·무료 판정·익명 처리는 **DB 가 한다**(0035 `app_brand_gallery` · `app_brand_unlock_data` ·
 * `brand_data_free_reason`). 여기서는 그 jsonb 를 타입으로 좁히고(`parse*`) 화면 문구로 바꾼다 —
 * 프로토타입 `(demo)/gallery/+page.svelte` · `packages/ui/SellerCard.svelte` 문구를 그대로 쓴다.
 *
 * **익명 계약**: 비공개(`hidden`) 인플루언서는 열람 전 이름·핸들·아바타가 DB 에서 아예 오지 않는다.
 * `parseScoutRow` 가 `unlocked` 가 아니면 들어온 값도 버린다(랭킹 `parseRanking` 과 같은 이중 방어).
 */

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function int(v: unknown): number {
  return num(v) ?? 0;
}
function arr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

/* ---------------- 무료 열람 사유 ---------------- */

/** 과금 없이 볼 수 있는 이유. null 이면 🥬 를 내야 한다. */
export type FreeReason = "VIEWED" | "WORKED" | "QUOTA" | null;

export function asFreeReason(v: unknown): FreeReason {
  return v === "VIEWED" || v === "WORKED" || v === "QUOTA" ? v : null;
}

/** 카드에 붙는 무료 사유 배지. null 이면 배지 없음. */
export function freeReasonBadge(r: FreeReason): string | null {
  if (r === "WORKED") return "함께 판매 · 데이터 무료";
  if (r === "QUOTA") return "등급 혜택 · 무료 열람";
  return null; // VIEWED 는 이미 열린 상태라 배지를 달지 않는다
}

/* ---------------- 외부 판매 감지 ---------------- */

/** 크롤링 기반 가계산 — 공식은 프로토타입 `estExternal`(helpers.ts). 화면에 "(가계산)" 을 함께 적는다. */
export type ExternalSale = {
  source: string | null;
  name: string | null;
  brand: string | null;
  seenOn: string | null;
  price: number;
  estOrders: number;
  estLow: number;
  estHigh: number;
};

export const EXTERNAL_NOTE = "크롤링 기반 가계산 — 실데이터 확보 후 계산식 확정 예정";

function parseExternal(v: unknown): ExternalSale[] {
  return arr(v).map((x) => ({
    source: str(x.source),
    name: str(x.name),
    brand: str(x.brand),
    seenOn: str(x.seen_on),
    price: int(x.price),
    estOrders: int(x.est_orders),
    estLow: int(x.est_low),
    estHigh: int(x.est_high),
  }));
}

/* ---------------- 공개 인플루언서 카드 ---------------- */

/** 잠겨 있으면 null. DB 가 지표를 담지 않는다(화면에서 가리는 게 아니다). */
export type GalleryStats = {
  m3Sales: number;
  likesAvg: number | null;
  /** 참여율 %. 팔로워가 0이면 null. */
  engagement: number | null;
  /** 매출/팔로워. */
  perFollower: number | null;
  /** 최근 게시물 좋아요 추이 (스파크라인). */
  recentLikes: number[];
  campaignsDone: number;
  /** 판매당 평균 확정 매출. 정산 이력이 없으면 null. */
  avgNet: number | null;
  external: ExternalSale[];
};

export type GalleryRow = {
  id: string;
  code: string | null;
  name: string | null;
  handle: string | null;
  platform: string | null;
  avatarUrl: string | null;
  intro: string | null;
  category: string | null;
  followers: number | null;
  grade: string | null;
  /** 이 인플루언서 데이터를 여는 데 드는 🥬 (등급별). */
  priceCel: number;
  freeReason: FreeReason;
  unlocked: boolean;
  /** 내 브랜드 카테고리군과 맞나. */
  categoryFit: boolean;
  stats: GalleryStats | null;
};

function parseStats(v: unknown): GalleryStats | null {
  if (v === null || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return {
    m3Sales: int(o.m3_sales),
    likesAvg: num(o.likes_avg),
    engagement: num(o.engagement),
    perFollower: num(o.per_follower),
    recentLikes: Array.isArray(o.recent_likes) ? (o.recent_likes as unknown[]).map((x) => int(x)) : [],
    campaignsDone: int(o.campaigns_done),
    avgNet: num(o.avg_net),
    external: parseExternal(o.external),
  };
}

function parseGalleryRow(o: Record<string, unknown>): GalleryRow | null {
  const id = str(o.id);
  if (!id) return null;
  const unlocked = o.unlocked === true;
  return {
    id,
    code: str(o.code),
    name: str(o.name),
    handle: str(o.handle),
    platform: str(o.platform),
    avatarUrl: str(o.avatar_url),
    intro: str(o.intro),
    category: str(o.category),
    followers: num(o.followers),
    grade: str(o.grade),
    priceCel: int(o.price_cel),
    freeReason: asFreeReason(o.free_reason),
    unlocked,
    categoryFit: o.category_fit === true,
    // 잠겨 있으면 지표를 버린다 — DB 도 안 보내지만 한 번 더 막는다
    stats: unlocked ? parseStats(o.stats) : null,
  };
}

/* ---------------- 익명 스카우트 카드 ---------------- */

/** 비공개 인플루언서. 열람 전에는 등급·카테고리·3개월 매출만 보인다. */
export type ScoutRow = {
  id: string;
  grade: string | null;
  category: string | null;
  /** 익명 카드도 매출은 공개한다(프로토타입과 같다 — 가치 판단의 근거). */
  m3Sales: number;
  priceCel: number;
  freeReason: FreeReason;
  unlocked: boolean;
  /** 열람 후에만 채워진다. */
  name: string | null;
  handle: string | null;
  platform: string | null;
  avatarUrl: string | null;
  stats: { followers: number | null; likesAvg: number | null; engagement: number | null; perFollower: number | null } | null;
};

function parseScoutRow(o: Record<string, unknown>): ScoutRow | null {
  const id = str(o.id);
  if (!id) return null;
  const unlocked = o.unlocked === true;
  const s = (o.stats ?? null) as Record<string, unknown> | null;
  return {
    id,
    grade: str(o.grade),
    category: str(o.category),
    m3Sales: int(o.m3_sales),
    priceCel: int(o.price_cel),
    freeReason: asFreeReason(o.free_reason),
    unlocked,
    // 익명 계약을 한 번 더 지킨다 — 열람 전이면 신원을 버린다
    name: unlocked ? str(o.name) : null,
    handle: unlocked ? str(o.handle) : null,
    platform: unlocked ? str(o.platform) : null,
    avatarUrl: unlocked ? str(o.avatar_url) : null,
    stats:
      unlocked && s
        ? {
            followers: num(s.followers),
            likesAvg: num(s.likes_avg),
            engagement: num(s.engagement),
            perFollower: num(s.per_follower),
          }
        : null,
  };
}

/* ---------------- 갤러리 전체 ---------------- */

export type Gallery = {
  brand: { name: string | null; category: string | null; grade: string | null };
  /** 이번 달 남은 무료 열람 횟수 (다이아·블랙만 > 0). */
  freeLeft: number;
  rows: GalleryRow[];
  scout: ScoutRow[];
  /** 맞춤 추천 인플루언서 id (rows 안의 id). */
  recommendedIds: string[];
};

export function parseGallery(payload: unknown): Gallery | null {
  const o = (payload ?? {}) as Record<string, unknown>;
  if (o.ok !== true) return null;
  const b = (o.brand ?? {}) as Record<string, unknown>;
  return {
    brand: { name: str(b.name), category: str(b.category), grade: str(b.grade) },
    freeLeft: int(o.free_left),
    rows: arr(o.public).flatMap((r) => {
      const row = parseGalleryRow(r);
      return row ? [row] : [];
    }),
    scout: arr(o.scout).flatMap((r) => {
      const row = parseScoutRow(r);
      return row ? [row] : [];
    }),
    recommendedIds: Array.isArray(o.recommended) ? (o.recommended as unknown[]).flatMap((x) => (str(x) ? [str(x)!] : [])) : [],
  };
}

/** 익명 카드 표시 이름 — 열람 전이면 ○○○. */
export function scoutLabel(r: ScoutRow): string {
  return r.unlocked ? (r.name ?? "○○○ 인플루언서") : "○○○ 인플루언서";
}

/* ---------------- 열람 결과 ---------------- */

export type UnlockResult =
  | { ok: true; already: boolean; charged: number; reason: FreeReason | "PAID"; freeLeft: number | null; balance: number | null }
  | { ok: false; code: string; priceCel: number | null };

export function parseUnlockResult(payload: unknown): UnlockResult {
  const o = (payload ?? {}) as Record<string, unknown>;
  if (o.ok !== true) {
    return { ok: false, code: str(o.code) ?? "ERROR", priceCel: num(o.price_cel) };
  }
  const reason = o.reason === "PAID" ? "PAID" : asFreeReason(o.reason);
  return {
    ok: true,
    already: o.already === true,
    charged: int(o.charged),
    reason,
    freeLeft: num(o.free_left),
    balance: num(o.balance),
  };
}

/** 열람 직후 안내 문구 — 프로토타입 `unlockSellerData`/`unlockRef` 의 토스트. */
export function unlockMessage(r: UnlockResult, kind: "data" | "ref", name?: string | null): string {
  if (!r.ok) return UNLOCK_FAIL_MESSAGES[r.code] ?? UNLOCK_FAIL_MESSAGES.ERROR;
  if (r.already) return "이미 열람한 인플루언서예요";
  if (r.reason === "WORKED") return "함께 판매한 인플루언서라 무료로 열렸어요";
  if (r.reason === "QUOTA") {
    const left = r.freeLeft !== null ? ` (이달 ${r.freeLeft}회 남음)` : "";
    return `등급 혜택 — 무료 열람${left}`;
  }
  if (kind === "ref") return `🥬 ${r.charged} 사용 — 레퍼런스 상세 지표가 공개됐어요`;
  return `🥬 ${r.charged} 사용 — ${name ?? "인플루언서"}님의 성과 데이터가 열렸어요`;
}

export const UNLOCK_FAIL_MESSAGES: Record<string, string> = {
  CEL_INSUFFICIENT: "셀러리가 부족해요 — 판매가 쌓이면 자동으로 적립됩니다",
  KIND_MISMATCH: "열람 종류가 맞지 않아요 — 새로고침 후 다시 시도해주세요",
  NOT_FOUND: "인플루언서를 찾을 수 없어요",
  ERROR: "열람하지 못했어요. 잠시 후 다시 시도해주세요",
};

/* ---------------- 화면 안내 문구 (프로토타입 원문) ---------------- */

export const GALLERY_SUB = "건강·웰니스 판매 레퍼런스가 인증된 인플루언서 · 이력·반응 데이터를 보고 직접 제안하세요";
export const SCOUT_NOTE =
  "프로필 비공개 인플루언서입니다. 레퍼런스 열람권(건당)을 구매하면 상세 지표를 확인하고 제안을 보낼 수 있습니다. 제안이 수락되는 순간 신원이 공개됩니다.";
export const GALLERY_EMPTY = "조건에 맞는 인플루언서가 없습니다 — 필터를 넓혀보세요";

/** 등급 필터 — 프로토타입 `(demo)/gallery` 의 칩. "이상" 비교는 DB 의 sort_order 와 같은 순서. */
export const GRADE_FILTERS = ["전체", "실버", "골드", "플래티넘", "다이아"] as const;
export const PLATFORM_FILTERS: readonly (readonly [string, string])[] = [
  ["all", "전체"],
  ["instagram", "인스타그램"],
  ["youtube", "유튜브"],
  ["tiktok", "틱톡"],
  ["naver", "네이버 블로그"],
];

/** 등급 순위 — 낮을수록 높은 등급(DB `grade_tiers.sort_order` 와 같다). */
const GRADE_ORDER = ["블랙", "다이아", "플래티넘", "골드", "실버", "브론즈", "스타터"];

/** `grade` 가 `min` 등급 이상인가. */
export function gradeAtLeast(grade: string | null, min: string): boolean {
  if (min === "전체") return true;
  const gi = GRADE_ORDER.indexOf(grade ?? "");
  const mi = GRADE_ORDER.indexOf(min);
  return gi > -1 && mi > -1 && gi <= mi;
}

/** 추천 이유 한 줄 — 프로토타입 `recs` 의 reason. */
export function recommendReason(r: GalleryRow, brandCategory: string | null, fmt: (n: number) => string): string {
  const head = r.categoryFit && brandCategory ? `${brandCategory}와 카테고리 적합` : "매출 효율 상위";
  // 매출/팔로워는 잠긴 카드에서는 보여주지 않는다 (지표가 null)
  const tail = r.stats?.perFollower != null ? ` · 매출/팔로워 ₩${fmt(r.stats.perFollower)}` : "";
  return `${head}${tail}`;
}
