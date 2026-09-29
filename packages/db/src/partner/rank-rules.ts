/**
 * 랭킹 · 추천 프로그램 규칙 — 순수 모듈 (브라우저 `.svelte` 와 서버 양쪽에서 import).
 * DB 호출은 `../server/partner/{ranking,referral}.server.ts`.
 *
 * 숫자·순위·익명 처리는 **DB 가 한다**(0026 `app_seller_ranking` · `app_seller_referral`). 여기서는 그 jsonb 를
 * 타입으로 좁히고(`parse*`) 화면 문구로 바꾼다 — 프로토타입 `(demo)/rank/+page.svelte` ·
 * `(demo)/ref/+page.svelte` 의 문구를 그대로 쓴다.
 *
 * **익명 규칙**: 리더보드 행의 `name`·`handle` 은 내 행에만 있다(0026 이 남의 이름을 아예 내려보내지 않는다).
 * `anonLabel` 은 그 계약을 화면에서 한 번 더 지킨다 — 남의 이름이 들어와도 ○○○ 으로 덮는다.
 */
import { REF_RATE, REF_BOOST } from "@sellery/core/constants";

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function int(v: unknown): number {
  return num(v) ?? 0;
}
function rows(payload: unknown, key = "rows"): Record<string, unknown>[] {
  const o = (payload ?? {}) as Record<string, unknown>;
  return Array.isArray(o[key]) ? (o[key] as Record<string, unknown>[]) : [];
}

/* ---------------- 랭킹 ---------------- */

/** 리더보드 한 행. 내 행이 아니면 `name`·`handle` 은 항상 null (익명). */
export type RankingRow = {
  rank: number;
  isMe: boolean;
  name: string | null;
  handle: string | null;
  category: string | null;
  m3Sales: number;
  followers: number | null;
  likesAvg: number | null;
  /** 매출/팔로워. 팔로워가 0이면 null. */
  perFollower: number | null;
  /** 매출/좋아요. 좋아요가 0이면 null. */
  perLike: number | null;
  grade: string | null;
};

export type RankingTier = {
  name: string;
  minM3Sales: number;
  topPct: number | null;
  bonusPp: number | null;
  perk: string | null;
  isMine: boolean;
};

export type RankingMe = {
  grade: string | null;
  /** 이 등급의 표시용 "상위 n%". */
  topPct: number | null;
  perk: string | null;
  bonusPp: number | null;
  m3Sales: number;
  /** 전체에서 내 순위 (정지 제외). */
  rank: number | null;
  total: number;
  nextGrade: string | null;
  nextMin: number | null;
  nextPerk: string | null;
  /** 다음 등급까지 남은 금액. 최고 등급이면 null. */
  nextGap: number | null;
  /** 다음 등급까지 진행률 0~100. 최고 등급이면 100. */
  nextPct: number;
};

export type Ranking = { me: RankingMe; tiers: RankingTier[]; rows: RankingRow[] };

export function parseRanking(payload: unknown): Ranking | null {
  const o = (payload ?? {}) as Record<string, unknown>;
  if (o.ok !== true) return null;
  const m = (o.me ?? {}) as Record<string, unknown>;
  return {
    me: {
      grade: str(m.grade),
      topPct: num(m.top_pct),
      perk: str(m.perk),
      bonusPp: num(m.bonus_pp),
      m3Sales: int(m.m3_sales),
      rank: num(m.rank),
      total: int(m.total),
      nextGrade: str(m.next_grade),
      nextMin: num(m.next_min),
      nextPerk: str(m.next_perk),
      nextGap: num(m.next_gap),
      nextPct: num(m.next_pct) ?? 100,
    },
    tiers: rows(o, "tiers").flatMap((t) => {
      const name = str(t.name);
      if (!name) return [];
      return [
        {
          name,
          minM3Sales: int(t.min_m3_sales),
          topPct: num(t.top_pct),
          bonusPp: num(t.bonus_pp),
          perk: str(t.perk),
          isMine: t.is_mine === true,
        },
      ];
    }),
    rows: rows(o).flatMap((r) => {
      const rank = num(r.rank);
      if (rank === null) return [];
      const isMe = r.is_me === true;
      return [
        {
          rank,
          isMe,
          // 익명 계약을 한 번 더 지킨다 — 내 행이 아니면 이름을 버린다
          name: isMe ? str(r.name) : null,
          handle: isMe ? str(r.handle) : null,
          category: str(r.category),
          m3Sales: int(r.m3_sales),
          followers: num(r.followers),
          likesAvg: num(r.likes_avg),
          perFollower: num(r.per_follower),
          perLike: num(r.per_like),
          grade: str(r.grade),
        },
      ];
    }),
  };
}

/** 리더보드에 쓸 표시 이름. 남은 항상 ○○○ 인플루언서 — 순위와 지표만 공개한다. */
export function anonLabel(r: RankingRow): string {
  return r.isMe ? (r.name ?? "나") : "○○○ 인플루언서";
}

export const RANK_ANON_NOTE = "※ 타 인플루언서는 익명(○○○)으로만 노출됩니다 — 순위와 지표만 공개, 저격 불가.";

/** "다음 등급 플래티넘까지 ₩14,400,000 남음" 같은 한 줄. 최고 등급이면 혜택 문구. */
export function nextGradeLine(me: RankingMe, fmt: (n: number) => string): string {
  if (me.nextGrade === null || me.nextGap === null) {
    return `최고 등급입니다${me.perk ? ` · ${me.perk}` : ""}`;
  }
  const tail = me.nextPerk ? ` — 달성 시 ${me.nextPerk}` : "";
  return `다음 등급 ${me.nextGrade}까지 ₩${fmt(me.nextGap)} 남음${tail}`;
}

/* ---------------- 추천 프로그램 ---------------- */

/** 내가 추천한 인플루언서 한 명. 직접 데려온 사람이라 실명을 보여준다. */
export type ReferralRow = {
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
  /** 보상 대상 판매 진행 횟수 (최대 `times`). */
  used: number;
  times: number;
  /** 이 사람에게서 발생한 누적 수익. */
  amount: number;
  joinedAt: string | null;
};

/** 내가 추천받아 가입한 경우의 부스트 상태. */
export type ReferralBoost = {
  name: string | null;
  handle: string | null;
  used: number;
  /** 남은 부스트 횟수. */
  left: number;
};

export type Referral = {
  refCode: string | null;
  /** 보상 대상 판매 횟수 (REF_TIMES). */
  times: number;
  /** 누적 추천 수익. */
  total: number;
  /** 내가 추천한 인원 수. */
  count: number;
  rows: ReferralRow[];
  /** 내가 피추천인이면 부스트 정보, 아니면 null. */
  boost: ReferralBoost | null;
};

export function parseReferral(payload: unknown): Referral | null {
  const o = (payload ?? {}) as Record<string, unknown>;
  if (o.ok !== true) return null;
  const times = int(o.times) || 5;
  const by = o.referred_by as Record<string, unknown> | null | undefined;
  return {
    refCode: str(o.ref_code),
    times,
    total: int(o.total),
    count: int(o.count),
    rows: rows(o).map((r) => ({
      name: str(r.name),
      handle: str(r.handle),
      avatarUrl: str(r.avatar_url),
      used: int(r.used),
      times: int(r.times) || times,
      amount: int(r.amount),
      joinedAt: str(r.joined_at),
    })),
    boost:
      by && typeof by === "object"
        ? { name: str(by.name), handle: str(by.handle), used: int(by.used), left: int(by.left) }
        : null,
  };
}

/**
 * 보상 구조 설명 — 프로토타입 `(demo)/ref` 의 "보상 구조" 카드 3줄.
 * 요율은 `@sellery/core/constants`(REF_RATE 2% · REF_BOOST 1%p) 가 정답이다.
 */
export function referralTerms(times: number): string[] {
  const rate = (REF_RATE * 100).toFixed(0);
  const boost = (REF_BOOST * 100).toFixed(0);
  return [
    `나 (추천인) — 새 인플루언서의 첫 ${times}회 판매, 확정 매출의 ${rate}% 지급`,
    `새 인플루언서 — 첫 ${times}회 판매, 수수료 +${boost}%p`,
    "새 인플루언서의 수수료율은 절대 깎이지 않음 — 보상은 플랫폼 수수료에서 지급",
  ];
}

/** 부스트 배너 한 줄. */
export function boostLine(b: ReferralBoost, times: number): string {
  return `${b.name ?? "추천인"}님 추천으로 가입했어요. 첫 ${times}회 판매 수수료 +${(REF_BOOST * 100).toFixed(0)}%p (남은 횟수 ${b.left}회). 기본 수수료율은 그대로 — 보상은 셀러리가 부담합니다.`;
}

export const REFERRAL_EMPTY = "아직 추천한 인플루언서가 없습니다 — 코드를 공유해보세요";
export const REFERRAL_TOTAL_NOTE = "정산 완료 기준 · 진행 중 판매는 정산 시 지급";
