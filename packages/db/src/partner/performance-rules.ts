/**
 * 상품별 익명 실적 표 규칙 — 순수 모듈 (브라우저 `.svelte` 와 서버 양쪽에서 import).
 * DB 호출은 `../server/partner/performance.server.ts`.
 *
 * 게이트·익명 처리는 **DB 가 한다**(0039 `app_seller_product_performance`). 여기서는 그 jsonb 를
 * 타입으로 좁히고(`parsePerformance`) 화면 문구로 바꾼다 — 프로토타입
 * `packages/ui/modals/ProductDetailModal.svelte` 의 실적 표를 그대로 옮긴다.
 *
 * **잠긴 행에는 지표가 없다.** 프로토타입은 CSS 블러(`blurrow`)로 가렸지만 값이 HTML 에 남았다.
 * 0039 는 서버가 `null` 로 보내므로 블러는 "잠겨 있다" 를 알리는 표시일 뿐이다 —
 * 랭킹(0026) · 갤러리(0035) 와 같은 방식.
 *
 * 인플루언서 이름·핸들은 **아예 오지 않는다**(표 제목도 "인플루언서 익명").
 */

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function int(v: unknown): number {
  return num(v) ?? 0;
}

/** 실적 표 한 행. 잠겨 있으면(`open: false`) 지표가 전부 null 이다. */
export type PerformanceRow = {
  rank: number;
  /** 내 캠페인 — 확인권과 무관하게 항상 열린다. */
  isMe: boolean;
  /** 지표가 담겼나. 확인권 보유 · 첫 행 · 내 캠페인일 때 true. */
  open: boolean;
  status: string;
  followers: number | null;
  likesAvg: number | null;
  /** 참여율 % */
  engagement: number | null;
  startDate: string | null;
  endDate: string | null;
  /** 확정 순매출 (정산 전이면 주문에서 계산). */
  net: number | null;
  soldQty: number | null;
};

export type ProductPerformanceView = {
  /** 매출 데이터 확인권 보유 (영구 · 계정 단위). */
  hasPass: boolean;
  /** 확인권 가격 🥬. */
  priceCel: number;
  campaigns: number;
  soldQty: number;
  /** 잠긴 행 수 — "N건 더 보기" 안내에 쓴다. */
  locked: number;
  rows: PerformanceRow[];
};

export function parsePerformance(payload: unknown): ProductPerformanceView | null {
  const o = (payload ?? {}) as Record<string, unknown>;
  if (o.ok !== true) return null;
  const rows = Array.isArray(o.rows) ? (o.rows as Record<string, unknown>[]) : [];
  return {
    hasPass: o.has_pass === true,
    priceCel: int(o.price_cel) || 2,
    campaigns: int(o.campaigns),
    soldQty: int(o.sold_qty),
    locked: int(o.locked),
    rows: rows.flatMap((r) => {
      const rank = num(r.rank);
      if (rank === null) return [];
      const open = r.open === true;
      return [
        {
          rank,
          isMe: r.is_me === true,
          open,
          status: str(r.status) ?? "",
          // 잠긴 행은 지표를 버린다 — DB 도 안 보내지만 한 번 더 막는다
          followers: open ? num(r.followers) : null,
          likesAvg: open ? num(r.likes_avg) : null,
          engagement: open ? num(r.engagement) : null,
          startDate: open ? str(r.start_date) : null,
          endDate: open ? str(r.end_date) : null,
          net: open ? num(r.net) : null,
          soldQty: open ? num(r.sold_qty) : null,
        },
      ];
    }),
  };
}

/** 확인권 구매 버튼 문구 — 프로토타입 원문. */
export function dataPassCta(v: ProductPerformanceView): string {
  return `🥬 ${v.priceCel} · 매출 데이터 확인권으로 전체 실적 보기`;
}

/** 잠긴 행 안내. 잠긴 게 없으면 null. */
export function lockedNote(v: ProductPerformanceView): string | null {
  if (v.locked <= 0) return null;
  return `다른 인플루언서 ${v.locked}건의 지표가 잠겨 있어요 — 확인권은 1회 구매로 계정에 영구 적용돼요.`;
}

export const PERFORMANCE_TITLE_SUB = "인플루언서 익명";
export const PERFORMANCE_EMPTY = "아직 진행된 판매가 없습니다 — 첫 인플루언서가 되어보세요";
/** 내 행 배지. */
export const PERFORMANCE_ME = "MY";

/** 기간 표시 — 'M/D–M/D'. 날짜가 없으면 '—'(일정 미확정). */
export function periodLabel(r: PerformanceRow): string {
  if (!r.startDate || !r.endDate) return "—";
  const md = (d: string) => {
    const [, m, day] = d.split("-");
    return `${Number(m)}/${Number(day)}`;
  };
  return `${md(r.startDate)}–${md(r.endDate)}`;
}
