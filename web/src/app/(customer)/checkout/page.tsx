/**
 * /checkout?c={code}&o={optIdx}&q={qty} — 서버 검증 후 CheckoutClient (app-plan §6.1 · ux-spec §3.4). 소유: D.
 *   · 파라미터 결측/형식 불일치 → 홈(코드 없음) 또는 판매 페이지(옵션·수량 범위 밖)로 redirect
 *   · 미로그인 → /login?next=/checkout?c&o&q (app-plan §4.1 보호 라우트)
 *   · anon campaign_card(code) → null 이면 notFound()
 *   · isBuyable(card, qty) 실패(LIVE 아님 · today 범위 밖 · 재고 부족) → .notice(danger) + ← 판매 페이지로, 위젯 렌더 안 함
 *   · user 클라이언트로 customers(address, phone) 읽어 배송지 프리필 (RLS customers_select_own)
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { displayName, getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCampaignCard } from "@/lib/campaign-server";
import { canonicalStoreUrl, isBuyable } from "@/lib/campaign";
import { checkoutHref, EMPTY_DRAFT, parseCheckoutParams, type ShippingDraft } from "@/components/checkout/rules";
import { CheckoutClient } from "./checkout-client";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

/** customers.address jsonb + phone → 폼 초기값 (키가 문자열이 아니면 빈 문자열) */
function draftFrom(address: unknown, phone: string | null, name: string): ShippingDraft {
  const o = address && typeof address === "object" && !Array.isArray(address) ? (address as Record<string, unknown>) : {};
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  return {
    recipient: s("recipient") || name,
    phone: s("phone") || phone || "",
    postcode: s("postcode"),
    address1: s("address1"),
    address2: s("address2"),
    memo: s("memo"),
  };
}

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const params = parseCheckoutParams(sp);
  if (!params) {
    // 코드가 있으면 그 판매 페이지로(짧은 주소 /c/ 가 정식 URL 로 308), 없으면 홈
    const c = typeof sp.c === "string" ? sp.c.trim().toLowerCase() : "";
    redirect(/^[a-z0-9_-]{1,32}$/.test(c) ? `/c/${encodeURIComponent(c)}` : "/");
  }
  const { code, optionIndex, qty } = params;

  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(checkoutHref(code, optionIndex, qty))}`);

  const card = await fetchCampaignCard(code);
  if (!card) notFound();
  const storeUrl = canonicalStoreUrl(card);
  if (optionIndex >= card.product.options.length) redirect(storeUrl);

  const buyable = isBuyable(card, qty);
  if (!buyable.ok) {
    return (
      <div className="store">
        <h2 className="pg">결제하기</h2>
        <div className="notice danger" role="alert">
          {buyable.message}
        </div>
        <Link href={storeUrl} className="btn ghost sm">
          ← 판매 페이지로
        </Link>
      </div>
    );
  }

  // 기본 배송지 프리필 — user 클라이언트 (RLS 본인 행). 실패해도 빈 폼으로 진행.
  let defaults: ShippingDraft = { ...EMPTY_DRAFT, recipient: displayName(user) };
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("customers").select("address, phone").eq("user_id", user.id).maybeSingle();
    if (data) defaults = draftFrom(data.address, data.phone, displayName(user));
  } catch (e) {
    console.error("[checkout] customers prefill failed", e instanceof Error ? e.message : e);
  }

  return (
    <CheckoutClient
      card={card}
      optionIndex={optionIndex}
      qty={qty}
      customerKey={user.id}
      email={user.email ?? null}
      defaults={defaults}
      storeUrl={storeUrl}
    />
  );
}
