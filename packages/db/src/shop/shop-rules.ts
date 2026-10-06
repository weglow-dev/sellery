/**
 * 셀러리 샵 규칙 — 순수 모듈 (브라우저 `.svelte` 와 서버 양쪽에서 import).
 * DB 호출은 `../server/shop.server.ts`(인플루언서·브랜드 공용 — 카탈로그가 역할별 배열이라 RPC 하나로 끝난다).
 *
 * 카탈로그·가격·보유 판정은 **DB 가 한다**(0037 `app_shop_catalog` · `app_shop_buy` ·
 * `shop_item_active`). 여기서는 그 jsonb 를 타입으로 좁히고(`parse*`) 화면 문구로 바꾼다 —
 * 프로토타입 `packages/ui/views/Shop.svelte` · actions.ts `buyItem` 의 문구를 그대로 쓴다.
 *
 * **충전(topup) 은 없다** — 유상 충전을 도입하지 않기로 결정됐으므로(`points-policy.md` §0)
 * 프로토타입 샵의 충전 카드를 가져오지 않는다. 🥬 는 가입 축하 · 이벤트 지급 · 확정 매출 적립으로만 생긴다.
 */
import { CELERY_PER, SAMPLE_CEL_WON } from "@sellery/core/constants";

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function int(v: unknown): number {
  return num(v) ?? 0;
}

/* ---------------- 카탈로그 ---------------- */

export type ShopItem = {
  id: string;
  name: string | null;
  desc: string | null;
  /** 숫자면 🥬 수, 문자열이면 'grade'(등급별) 같은 안내값. */
  price: number | string | null;
  /** 기간형이면 일수, 영구형이면 null. */
  days: number | null;
  /** 사용 시 자동 차감되는 아이템 — 구매 버튼이 없다. */
  auto: boolean;
  /** 지금 보유 중인가 (기간형은 만료 전). */
  active: boolean;
  /** 만료일 (기간형 · 보유 중일 때). */
  expiresOn: string | null;
  /** 효과가 붙어 구매할 수 있는 아이템인가 (0037 — 아직 효과가 없는 것은 false). */
  available: boolean;
};

export type Shop = {
  balance: number;
  /** 유상(충전)분 — 충전을 도입하지 않았으므로 지금은 항상 0 (0034). */
  paidBalance: number;
  freeBalance: number;
  today: string | null;
  items: ShopItem[];
  ledger: ShopLedgerRow[];
};

export type ShopLedgerRow = {
  delta: number;
  reason: string | null;
  memo: string | null;
  createdAt: string | null;
};

export function parseShop(payload: unknown): Shop | null {
  const o = (payload ?? {}) as Record<string, unknown>;
  if (o.ok !== true) return null;
  const items = Array.isArray(o.items) ? (o.items as Record<string, unknown>[]) : [];
  const ledger = Array.isArray(o.ledger) ? (o.ledger as Record<string, unknown>[]) : [];
  return {
    balance: int(o.balance),
    paidBalance: int(o.paid_balance),
    freeBalance: int(o.free_balance),
    today: str(o.today),
    items: items.flatMap((i) => {
      const id = str(i.id);
      if (!id) return [];
      const price = typeof i.price === "number" ? i.price : typeof i.price === "string" ? i.price : null;
      return [
        {
          id,
          name: str(i.name),
          desc: str(i.desc),
          price,
          days: num(i.days),
          auto: i.auto === true,
          active: i.active === true,
          expiresOn: str(i.expires_on),
          available: i.available === true,
        },
      ];
    }),
    ledger: ledger.map((l) => ({
      delta: int(l.delta),
      reason: str(l.reason),
      memo: str(l.memo),
      createdAt: str(l.created_at),
    })),
  };
}

/* ---------------- 화면 문구 ---------------- */

/** 아이템 버튼 상태. */
export type ShopButton =
  | { kind: "auto"; label: string }
  | { kind: "active"; label: string }
  | { kind: "buy"; label: string; enabled: boolean }
  | { kind: "soon"; label: string };

/**
 * 아이템 카드의 버튼. 프로토타입 `Shop.svelte` 분기 순서 그대로 +
 * `available: false`(효과 미구현)는 "준비 중" 으로 막는다 — 돈 받고 아무 일도 안 하는 걸 방지한다.
 */
export function shopButton(it: ShopItem, balance: number, today: string | null): ShopButton {
  if (it.auto) return { kind: "auto", label: "사용 시 자동 차감" };
  if (it.active) {
    const left = daysLeft(it.expiresOn, today);
    return { kind: "active", label: left !== null ? `보유 중 · ${left}일 남음` : "보유 중" };
  }
  if (!it.available) return { kind: "soon", label: "준비 중" };
  const price = typeof it.price === "number" ? it.price : null;
  if (price === null) return { kind: "soon", label: "준비 중" };
  return { kind: "buy", label: `🥬 ${price} 로 구매`, enabled: balance >= price };
}

/** 만료까지 남은 일수. 영구형이나 날짜가 없으면 null. */
export function daysLeft(expiresOn: string | null, today: string | null): number | null {
  if (!expiresOn || !today) return null;
  const a = Date.parse(`${expiresOn}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((a - b) / 86_400_000));
}

/** 획득 규칙 안내 — 확정 매출 ₩500만당 1🥬 (`CELERY_PER`). */
export function earnRuleLine(): string {
  return `확정 매출 ₩${(CELERY_PER / 10_000).toLocaleString("ko-KR")}만 = 1🥬`;
}

/** 1🥬 의 가치 안내 (`SAMPLE_CEL_WON`). */
export function celeryWorthLine(): string {
  return `1🥬 ≈ ₩${SAMPLE_CEL_WON.toLocaleString("ko-KR")} 가치`;
}

/**
 * 가격 칩 문구. 숫자면 `🥬 N`, 등급별('grade')·자동 아이템(null)은 말로 적는다 —
 * 프로토타입은 `'1–5'` · `'1 = ₩20,000'` 같은 문자열을 상수에 박아뒀지만 DB 카탈로그는
 * `price: null` · `'grade'` 로만 들고 있어 여기서 문구를 만든다.
 */
export function priceLabel(it: ShopItem): string {
  if (typeof it.price === "number") return `🥬 ${it.price}`;
  if (it.price === "grade") return "🥬 1–5 (등급별)";
  // 샘플 구매 결제 — 가격이 아니라 환산율이다
  if (it.id === "samplepay") return `🥬 1 = ₩${SAMPLE_CEL_WON.toLocaleString("ko-KR")}`;
  return "사용 시 차감";
}

export const SHOP_SUB = "판매로 모은 셀러리로 프리미엄 기능을 사용하세요";
/** 충전이 없으므로 "어떻게 모으나" 를 대신 적는다. */
export const SHOP_EARN_NOTE = "셀러리는 가입 축하 · 이벤트 지급 · 확정 매출 적립으로 쌓여요 — 따로 구매하지 않아요.";

/* ---------------- 구매 결과 ---------------- */

export type ShopBuyResult =
  | { ok: true; already: boolean; itemId: string | null; name: string | null; charged: number; balance: number | null; expiresOn: string | null; applied: number }
  | { ok: false; code: string; priceCel: number | null };

export function parseShopBuy(payload: unknown): ShopBuyResult {
  const o = (payload ?? {}) as Record<string, unknown>;
  if (o.ok !== true) {
    return { ok: false, code: str(o.code) ?? "ERROR", priceCel: num(o.price_cel) };
  }
  return {
    ok: true,
    already: o.already === true,
    itemId: str(o.item_id),
    name: str(o.name),
    charged: int(o.charged),
    balance: num(o.balance),
    expiresOn: str(o.expires_on),
    applied: int(o.applied),
  };
}

export const SHOP_FAIL_MESSAGES: Record<string, string> = {
  CEL_INSUFFICIENT: "셀러리가 부족해요 — 판매가 쌓이면 자동으로 적립됩니다",
  NO_ITEM: "없는 아이템이에요",
  AUTO_ITEM: "이 아이템은 사용할 때 자동으로 차감돼요",
  NOT_AVAILABLE: "아직 준비 중인 아이템이에요",
  NO_PRICE: "가격이 설정되지 않은 아이템이에요",
  // 적용 대상이 없으면 차감하지 않는다 (프로토타입과 같다)
  NO_TARGET_CAMPAIGN: "노출할 진행 중·예정 판매가 없어 적용하지 않았어요 — 셀러리는 차감되지 않았어요",
  NO_TARGET_PRODUCT: "노출 중인 상품이 없어 적용하지 않았어요 — 셀러리는 차감되지 않았어요",
  BAD_ROLE: "처리하지 못했어요",
  ERROR: "구매하지 못했어요. 잠시 후 다시 시도해주세요",
};

/** 구매 직후 안내 — 프로토타입 `buyItem` 토스트. */
export function shopBuyMessage(r: ShopBuyResult): string {
  if (!r.ok) return SHOP_FAIL_MESSAGES[r.code] ?? SHOP_FAIL_MESSAGES.ERROR;
  if (r.already) return "이미 보유 중인 아이템이에요";
  const tail = r.applied > 0 ? ` · ${r.applied}건에 적용` : "";
  return `✓ ${r.name ?? "아이템"} 구매 완료 (−🥬 ${r.charged})${tail}`;
}

/** 원장 한 줄의 표시 문구 — memo 가 있으면 그대로, 없으면 사유 라벨. */
export const LEDGER_REASON_LABEL: Record<string, string> = {
  earned: "확정 매출 적립",
  signup_bonus: "가입 축하 지급",
  onboarding_bonus: "입점 이벤트 지급",
  admin_grant: "관리자 이벤트 지급",
  topup: "셀러리 충전",
  shop_item: "샵 아이템 구매",
  data_unlock: "인플루언서 데이터 열람",
  ref_unlock: "익명 레퍼런스 열람",
  sample_purchase: "샘플 구매",
  sample_refund: "샘플 구매 환급",
  invite: "인플루언서 제안권",
  auto_invite: "자동 제안권",
  invite_refund: "제안 거절 환급",
  adjust: "운영 조정",
};

export function ledgerLabel(r: ShopLedgerRow): string {
  return r.memo ?? LEDGER_REASON_LABEL[r.reason ?? ""] ?? "셀러리 변동";
}
