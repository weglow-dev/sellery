/**
 * 셀러리 샵 — 카탈로그 · 구매 (0037 `app_shop_catalog` · `app_shop_buy`).
 * 인플루언서(`owner_type='seller'`)와 브랜드(`'brand'`)가 같은 RPC 를 쓴다 — 카탈로그는
 * `platform_settings.shop_items` 의 역할별 배열이다.
 * 프로토타입 원본: `packages/ui/views/Shop.svelte` · actions.ts `buyItem`.
 *
 * 전부 service role + **owner_id = requireSeller/requireBrand 의 id** — 클라이언트 값은 믿지 않는다.
 *   getShop(ownerType, ownerId)              카탈로그 + 보유 상태 + 잔액 + 최근 원장 8건
 *   buyShopItem(ownerType, ownerId, itemId)  구매 — 효과는 RPC 가 바로 적용한다
 *
 * **충전은 없다** — 유상 충전 미도입(`points-policy.md` §0). 잔액은 무상 지급분뿐이다.
 * 효과가 아직 없는 아이템은 RPC 가 `NOT_AVAILABLE` 로 막고 카탈로그도 `available: false` 로 준다.
 * 순수 규칙·문구는 `../shop/shop-rules.ts`.
 */
import { parseShop, parseShopBuy, type Shop, type ShopBuyResult } from "../shop/shop-rules";
import { createAdminClient, type Admin } from "./admin.server";

export type ShopOwner = "seller" | "brand";

/** 샵 화면 한 번에. 역할이 잘못되면 null. */
export async function getShop(
  ownerType: ShopOwner,
  ownerId: string,
  admin: Admin = createAdminClient(),
): Promise<Shop | null> {
  const { data, error } = await admin.rpc("app_shop_catalog", {
    p_owner_type: ownerType,
    p_owner_id: ownerId,
  });
  if (error) throw new Error(`app_shop_catalog failed: ${error.message}`);
  return parseShop(data);
}

/**
 * 아이템 구매. 효과는 RPC 가 바로 적용한다(프로필 상단 노출 · 고객 홈 노출 · 상품 부스트 ·
 * 데이터 패스). 적용 대상이 없으면 `NO_TARGET_*` 로 실패하고 **차감하지 않는다**.
 */
export async function buyShopItem(
  ownerType: ShopOwner,
  ownerId: string,
  itemId: string,
  admin: Admin = createAdminClient(),
): Promise<ShopBuyResult> {
  const { data, error } = await admin.rpc("app_shop_buy", {
    p_owner_type: ownerType,
    p_owner_id: ownerId,
    p_item_id: itemId,
  });
  if (error) throw new Error(`app_shop_buy failed: ${error.message}`);
  return parseShopBuy(data);
}
