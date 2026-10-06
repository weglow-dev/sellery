/**
 * 관리자 "매칭 · 자동 제안" — 순수 모듈(DB 접근 없음).
 * 데모 `(demo)/match`(프로토타입 `vAdminMatch`)의 `growthOf` · `catFit` · `autoMatches` 이식.
 *
 * **점수·적격 규칙을 여기 한 곳에만 둔다.** 다만 실제 제안 발송은 `app_brand_invite_seller`(0016)가
 * 자기 게이트로 다시 검사한다 — 이 모듈이 후보로 올린 사람을 그 RPC 가 거절할 수 있고, 그때는 화면이
 * 실패 사유를 그대로 보여준다(권위는 RPC 에 있다).
 *
 * 데모와 다른 점(실서비스 게이트가 더 많다 · `app_brand_invite_candidates`(0016) 와 같은 조건):
 *   · **비공개(hidden) 인플루언서 제외** — 익명 스카우트는 6단계다. 데모는 후보에 넣고 점수만 −5 했다.
 *   · **우선권 등급(플래티넘 · 다이아 · 블랙) 제외** — 🥬 제안권이 6단계(`grade_tiers.invite_cost_cel`).
 *     데모 안내문 "다이아·블랙 대상은 브랜드 🥬 10 자동 차감" 이 그 게이트다.
 *   · **메인 채널 인증 필요** — 데모에는 없던 조건.
 */

/* ---------------------------------------------------------------- 성장세 ---------------------------------------------------------------- */

/**
 * 최근 게시물 반응 성장률 % — 데모 `growthOf`.
 * 후반 평균 / 전반 평균 − 1. 표본이 2개 미만이거나 전반 평균이 0 이면 0(계산 불가).
 */
export function growthOf(recentLikes: readonly number[] | null | undefined): number {
  const r = (recentLikes ?? []).filter((n) => Number.isFinite(n));
  if (r.length < 2) return 0;
  const half = Math.ceil(r.length / 2);
  const mean = (x: readonly number[]) => x.reduce((a, b) => a + b, 0) / x.length;
  const first = mean(r.slice(0, half));
  if (first === 0) return 0;
  return (mean(r.slice(half)) / first - 1) * 100;
}

/* ---------------------------------------------------------------- 매칭 점수 ---------------------------------------------------------------- */

export type ScoreInput = {
  growth: number;
  m3Sales: number;
  followers: number;
  /** 비공개 계정은 데모에서 −5 였다. 실서비스는 후보에서 아예 빠지므로 항상 false 다 */
  hidden?: boolean;
};

/**
 * 매칭 점수 — 데모 `autoMatches` 의 식 그대로.
 *   growth × 0.6 + (m3Sales / followers) / 10 + (hidden ? 0 : 5)
 * 팔로워 0 이면 두 번째 항은 0(0 으로 나누지 않는다).
 */
export function matchScore(i: ScoreInput): number {
  const perFollower = i.followers > 0 ? i.m3Sales / i.followers / 10 : 0;
  return Math.round(i.growth * 0.6 + perFollower + (i.hidden ? 0 : 5));
}

/* ---------------------------------------------------------------- 카테고리 적합 ---------------------------------------------------------------- */

/** 카테고리 → 그룹(`categories.group_name`) */
export type CategoryGroups = Record<string, string | null>;

/**
 * 같은 카테고리 **그룹**이면 적합 — 데모 `catFit`(`CATMAP` 그룹 비교)의 DB 판.
 * 어느 쪽 그룹이라도 모르면 false.
 */
export function categoryFit(productCategory: string | null, sellerCategory: string | null, groups: CategoryGroups): boolean {
  if (!productCategory || !sellerCategory) return false;
  const pg = groups[productCategory];
  const sg = groups[sellerCategory];
  return !!pg && !!sg && pg === sg;
}

/* ---------------------------------------------------------------- 후보 ---------------------------------------------------------------- */

export type MatchSeller = {
  id: string;
  code: string | null;
  name: string;
  handle: string;
  platform: string | null;
  category: string | null;
  grade: string | null;
  m3Sales: number;
  followers: number;
  growth: number;
};

export type MatchProduct = {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  brandId: string;
  brandCode: string | null;
  brandName: string;
};

export type MatchCandidate = {
  product: MatchProduct;
  seller: MatchSeller;
  score: number;
  /** 제안권 비용 🥬 (0036 · 인플루언서 등급별). 0 이면 무료. */
  costCel: number;
  /** 브랜드 잔액으로 이 제안이 가능한가 (0036). false 면 실행이 "셀러리 부족" 으로 건너뛴다. */
  affordable: boolean;
};

/** 상품별 상위 N 명 — 데모는 2 명 */
export const CANDIDATES_PER_PRODUCT = 2;

/** 한 번 실행에 보내는 최대 건수 — 데모 `runAutoPropose` 는 상위 5건 */
export const AUTO_PROPOSE_BATCH = 5;

export type PickInput = {
  products: readonly MatchProduct[];
  sellers: readonly MatchSeller[];
  groups: CategoryGroups;
  /** `${productId}:${sellerId}` — 이미 진행 중인 쌍(재요청 가능 상태는 제외하고 넣는다) */
  activePairs: ReadonlySet<string>;
  /** 상품별 독점 확정 인플루언서 — 있으면 그 사람만 후보 */
  exclusiveOf: Record<string, string | null>;
  perProduct?: number;
  /** 제안권 비용 🥬 (0036 · `grade_tiers.invite_cost_cel`). 없으면 전부 무료로 본다. */
  costOf?: (seller: MatchSeller) => number;
  /** 브랜드 🥬 잔액 (0036). 없으면 0 — 유료 후보는 `affordable: false` 가 된다. */
  balanceOf?: (brandId: string) => number;
};

/**
 * 자동 제안 후보 — 데모 `autoMatches()`.
 * 상품마다 카테고리 적합 + 진행 중 캠페인 없음 인플루언서를 점수순으로 상위 N 명. 전체를 다시 점수순으로 정렬한다.
 * 적격 필터(active · 비공개 · 채널 인증)는 **호출자가 이미 걸러서 `sellers` 로 넘긴다**.
 * 0036: 제안권 비용은 `costOf(seller)` · 브랜드 잔액은 `balanceOf(brandId)` 로 받아 후보에 담는다 —
 *   우선권 등급(다이아·블랙)은 더 이상 제외가 아니라 **유료**다. 잔액이 모자라면 `affordable: false`
 *   로 담아 두고 실행 단계가 건너뛴다(프로토타입 `runAutoPropose` 의 "브랜드 셀러리 부족으로 보류").
 */
export function pickCandidates(i: PickInput): MatchCandidate[] {
  const perProduct = i.perProduct ?? CANDIDATES_PER_PRODUCT;
  const out: MatchCandidate[] = [];

  for (const p of i.products) {
    const ex = i.exclusiveOf[p.id] ?? null;
    const picked = i.sellers
      .filter((s) => {
        if (ex && ex !== s.id) return false;
        if (i.activePairs.has(`${p.id}:${s.id}`)) return false;
        return categoryFit(p.category, s.category, i.groups);
      })
      .map((s) => {
        const costCel = i.costOf?.(s) ?? 0;
        const bal = i.balanceOf?.(p.brandId) ?? 0;
        return {
          product: p,
          seller: s,
          costCel,
          affordable: costCel === 0 || bal >= costCel,
          score: matchScore({ growth: s.growth, m3Sales: s.m3Sales, followers: s.followers }),
        };
      })
      .sort((a, b) => b.score - a.score || a.seller.name.localeCompare(b.seller.name))
      .slice(0, perProduct);
    out.push(...picked);
  }

  return out.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
}

/** 요즘 뜨는 인플루언서 — 성장세 상위 N 명(데모는 6명). 적격 여부와 무관하게 **전원**을 본다(관리자는 비공개도 실명) */
export function risingSellers(sellers: readonly MatchSeller[], limit = 6): MatchSeller[] {
  return [...sellers].sort((a, b) => b.growth - a.growth || a.name.localeCompare(b.name)).slice(0, limit);
}

/* ---------------------------------------------------------------- 실행 결과 문구 ---------------------------------------------------------------- */

/** `app_brand_invite_seller` 가 돌려주는 실패 코드 → 사람이 읽는 말 (0016 헤더) */
export const INVITE_FAIL_MESSAGES: Record<string, string> = {
  NOT_FOUND: "상품을 찾을 수 없습니다",
  NOT_LISTED: "노출 중인 상품이 아닙니다",
  SELLER_NOT_FOUND: "없거나 정지된 인플루언서입니다",
  SELLER_HIDDEN: "비공개 인플루언서입니다 — 갤러리 열람(6단계) 뒤에 제안할 수 있습니다",
  PRIORITY_INVITE_GATED: "우선권 등급(플래티넘 이상)은 🥬 제안권(6단계)이 필요합니다",
  EXCLUSIVE_LOCKED: "다른 인플루언서에게 독점권이 확정된 상품입니다",
  ALREADY_ACTIVE: "이미 진행 중인 제안·캠페인이 있습니다",
  BAD_MESSAGE: "제안 메시지가 너무 깁니다",
  DB_ERROR: "처리에 실패했습니다",
};

export function inviteFailMessage(code: string): string {
  return INVITE_FAIL_MESSAGES[code] ?? INVITE_FAIL_MESSAGES.DB_ERROR;
}

/** 자동 제안 실행 결과 한 줄 */
export type AutoProposeOutcome = {
  productCode: string | null;
  productName: string;
  sellerName: string;
  sellerHandle: string;
  ok: boolean;
  /** 실패 사유(사람이 읽는 말) · 성공이면 null */
  reason: string | null;
  campaignCode: string | null;
};

/** 실행 요약 문구 — "3건 발송 · 2건 실패" */
export function autoProposeSummary(rows: readonly AutoProposeOutcome[]): string {
  const sent = rows.filter((r) => r.ok).length;
  const failed = rows.length - sent;
  if (rows.length === 0) return "보낼 후보가 없습니다";
  return failed === 0 ? `${sent}건 발송` : `${sent}건 발송 · ${failed}건 실패`;
}
