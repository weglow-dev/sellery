"use client";

/**
 * 체크아웃 화면 (ux-spec §3.4 · app-plan §7.1 브라우저 단계). 소유: D.
 *   좌: 주문 상품 · 배송 정보 · 결제 수단(#payment-method) · 약관 동의(#agreement + 통신판매중개자 확인)
 *   우: 결제 금액 박스 + [₩{total} 결제하기] · ≤640px 는 하단 고정 결제 바
 * 결제하기: 배송지 검증(토스트) → POST /api/checkout → 응답 {orderId, amount, orderName, phone, email} 로
 *   widgets.setAmount(amount) → requestPayment({ successUrl: origin + "/checkout/success", failUrl: origin + "/checkout/fail?c&o&q",
 *   customerName: recipient, customerEmail?, customerMobilePhone: phone(서버 정규화값 — 숫자만) }).
 * 금액은 서버가 계산한다 — 클라이언트 합계는 표시용, 결제되는 값은 응답의 amount (reuse-map §4-4).
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TossPaymentsWidgets } from "@tosspayments/tosspayments-sdk";
import { PlatIcon } from "@/components/icons";
import { ProductIcon } from "@/components/campaign-card";
import { useToast } from "@/components/toast";
import { AddressFields } from "@/components/checkout/address-fields";
import { PaymentWidget } from "@/components/checkout/payment-widget";
import { OrderSummary, PayBar } from "@/components/checkout/order-summary";
import {
  checkoutHref,
  mediatorText,
  PRIVACY_THIRD_PARTY_HREF,
  RETURN_KEY,
  thirdPartyText,
  validateShipping,
  type ShippingDraft,
  type ShippingField,
} from "@/components/checkout/rules";
import { won, type CampaignCard } from "@/lib/campaign";
import { md } from "@/lib/dates";

type CheckoutApiOk = {
  ok: true;
  sessionId: string;
  orderId: string;
  amount: number;
  orderName: string;
  customerKey: string;
  phone: string;
  email: string | null;
};
type CheckoutApiFail = { ok: false; code: string; message: string };

export type CheckoutClientProps = {
  card: CampaignCard;
  optionIndex: number;
  qty: number;
  /** 토스 customerKey = user.id */
  customerKey: string;
  email: string | null;
  defaults: ShippingDraft;
  storeUrl: string;
};

export function CheckoutClient({ card, optionIndex, qty, customerKey, email, defaults, storeUrl }: CheckoutClientProps) {
  const toast = useToast();
  const { product, seller, brand, campaign } = card;
  const option = product.options[Math.min(optionIndex, product.options.length - 1)];
  const total = option.price * qty;

  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
  const [ready, setReady] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** NOT_LIVE / SOLD_OUT 등 결제를 더 진행할 수 없는 서버 응답 — 위젯 대신 안내 */
  const [blocked, setBlocked] = useState<string | null>(null);
  const [agreedRequired, setAgreedRequired] = useState(true); // 토스 약관 UI 가 이벤트를 주기 전에는 위젯 자체가 거절하도록 둔다
  const [agreeMediator, setAgreeMediator] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);

  const [draft, setDraft] = useState<ShippingDraft>(defaults);
  const [invalid, setInvalid] = useState<Partial<Record<ShippingField, boolean>>>({});
  const patchDraft = useCallback((patch: Partial<ShippingDraft>) => setDraft((d) => ({ ...d, ...patch })), []);
  const clearInvalid = useCallback((f: ShippingField) => setInvalid((s) => (s[f] ? { ...s, [f]: false } : s)), []);

  const onReady = useCallback((w: TossPaymentsWidgets) => {
    widgetsRef.current = w;
    setReady(true);
  }, []);
  const onWidgetError = useCallback((m: string) => setWidgetError(m), []);
  const onAgreementChange = useCallback((v: boolean) => setAgreedRequired(v), []);

  // 결제창 진입 뒤 성공 페이지가 "판매 페이지로"·"다시 시도" 링크에 쓸 복귀 정보 (successUrl 은 쿼리 없이 고정 — rules.RETURN_KEY)
  const retryHref = checkoutHref(campaign.code, optionIndex, qty);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(RETURN_KEY, JSON.stringify({ store: storeUrl, retry: retryHref }));
    } catch {
      /* 저장 불가(프라이빗 모드 등) — 성공 페이지가 홈으로 대체 */
    }
  }, [storeUrl, retryHref]);

  async function handlePay() {
    const widgets = widgetsRef.current;
    if (!widgets || submitting || blocked) return;

    const v = validateShipping(draft);
    if (!v.ok) {
      setInvalid({ [v.field]: true });
      toast(v.message);
      document.getElementById(`ck-${v.field}`)?.focus();
      return;
    }
    if (!agreeMediator) {
      toast("통신판매중개자 확인에 동의해주세요");
      document.getElementById("ck-mediator")?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: campaign.code,
          optionIndex,
          qty,
          recipient: v.shipping.recipient,
          phone: v.shipping.phone,
          postcode: v.shipping.postcode,
          address1: v.shipping.address1,
          address2: v.shipping.address2 ?? "",
          memo: v.shipping.memo ?? "",
          saveAddress,
        }),
      });
      const data = (await res.json().catch(() => null)) as CheckoutApiOk | CheckoutApiFail | null;

      if (res.status === 401) {
        // 결제 도중 세션 만료 — 로그인 후 이 화면으로 복귀
        window.location.assign(`/login?next=${encodeURIComponent(retryHref)}`);
        return;
      }
      if (!res.ok || !data || data.ok !== true) {
        const code = data && data.ok === false ? data.code : "";
        const message = (data && data.ok === false && data.message) || "결제 준비에 실패했어요 — 잠시 후 다시 시도해주세요";
        if (code === "NOT_LIVE" || code === "SOLD_OUT" || code === "NOT_FOUND") setBlocked(message);
        else toast(message);
        setSubmitting(false);
        return;
      }

      // 결제되는 금액은 서버 값 — 화면 합계와 다르면 위젯 금액을 서버 값으로 맞춘다
      if (data.amount !== total) toast(`결제 금액이 ${won(data.amount)}로 갱신되었어요`);
      await widgets.setAmount({ currency: "KRW", value: data.amount });

      const origin = window.location.origin;
      const failQs = `c=${encodeURIComponent(campaign.code)}&o=${optionIndex}&q=${qty}`;
      await widgets.requestPayment({
        orderId: data.orderId,
        orderName: data.orderName,
        successUrl: `${origin}/checkout/success`,
        failUrl: `${origin}/checkout/fail?${failQs}`,
        customerName: v.shipping.recipient.slice(0, 100),
        customerEmail: data.email || email || undefined,
        customerMobilePhone: data.phone || undefined,
      });
      // Redirect 방식: 여기 아래는 결제창이 닫히지 않는 한 실행되지 않는다
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : "결제 요청에 실패했어요 — 다시 시도해주세요";
      toast(message);
      setSubmitting(false);
    }
  }

  const payDisabled = !ready || !!widgetError || !!blocked || !agreedRequired;
  const pay = { total, disabled: payDisabled, submitting, onPay: handlePay };

  return (
    <div className="max-[640px]:pb-24">
      <h2 className="pg">
        결제하기 <small>기간 한정 가격 — 판매가 끝난 상품은 결제에서 자동으로 빠집니다</small>
      </h2>

      <div className="cartgrid">
        <div>
          {/* 주문 상품 */}
          <div className="card static">
            <h4>주문 상품</h4>
            <div className="rowitem cart-row" style={{ padding: "6px 0 2px", borderBottom: 0 }}>
              <ProductIcon thumbUrl={product.thumb_url} emoji={product.emoji} size={48} />
              <div className="grow">
                <div className="nm">
                  {product.name} <span className="sub">· {brand.name}</span>
                </div>
                <div className="sub">
                  {option.n} · <PlatIcon platform={seller.platform} /> {seller.name} {seller.handle}
                  {campaign.end_date ? ` · ${md(campaign.end_date)} 마감` : ""}
                </div>
              </div>
              <div className="cart-sum">{won(total)}</div>
            </div>
            <div className="meta" style={{ marginTop: 6 }}>
              수량 {qty}개 · 수량·옵션 변경은{" "}
              <Link href={storeUrl} style={{ textDecoration: "underline" }}>
                판매 페이지
              </Link>
              에서
            </div>
          </div>

          {/* 배송 정보 */}
          <div className="card static">
            <h4>배송 정보</h4>
            <AddressFields value={draft} onChange={patchDraft} invalid={invalid} clearInvalid={clearInvalid} disabled={submitting} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer" }}>
              <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} disabled={submitting} />
              기본 배송지로 저장
            </label>
          </div>

          {/* 결제 수단 · 약관 동의 (토스 위젯) */}
          {blocked ? (
            <div className="card static">
              <div className="notice danger" role="alert" style={{ margin: "0 0 10px" }}>
                {blocked}
              </div>
              <Link href={storeUrl} className="btn ghost sm">
                ← 판매 페이지로
              </Link>
            </div>
          ) : (
            <PaymentWidget
              customerKey={customerKey}
              amount={total}
              onReady={onReady}
              onError={onWidgetError}
              onAgreementChange={onAgreementChange}
              agreementExtra={
                <label htmlFor="ck-mediator" style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12.5, lineHeight: 1.55, cursor: "pointer" }}>
                  <input
                    id="ck-mediator"
                    type="checkbox"
                    checked={agreeMediator}
                    onChange={(e) => setAgreeMediator(e.target.checked)}
                    disabled={submitting}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    {mediatorText(brand.name)}. {thirdPartyText(brand.name)} (
                    <Link href={PRIVACY_THIRD_PARTY_HREF} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                      자세히
                    </Link>
                    )
                  </span>
                </label>
              }
            />
          )}
        </div>

        <OrderSummary summary={{ productName: product.name, qty, total, clearDays: card.settings.clear_days }} pay={pay} />
      </div>

      <PayBar {...pay} />
    </div>
  );
}
