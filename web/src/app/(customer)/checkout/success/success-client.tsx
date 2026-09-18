"use client";

/**
 * 성공 URL 랜딩 — POST /api/payments/confirm 을 정확히 1회 호출하고 주문 완료 / 실패 뷰를 렌더. 소유: D.
 *   · 셋 중 하나라도 없거나 amount 가 ^\d+$ 가 아니면 즉시 실패 뷰 (rules.parseSuccessParams — Number() 파싱 금지)
 *   · useRef 가드로 StrictMode 이중 실행에도 1회 (서버는 app_claim_checkout 으로 멱등)
 *   · 409 CONFIRMING → 1.5초 후 1회 재시도, 그래도 409 면 "확인 중" 안내 + 내 주문 링크 (app-plan §7.2)
 *   · 401 → 세션 만료: 로그인 후 같은 URL 로 복귀 (confirm 이 그때 실행된다)
 *   · 실패 code → 문구 매핑은 rules.failText (app-plan §6.3 표 전부)
 * 성공 뷰 = 프로토타입 orderDoneModal (js/80-actions.js L730-737, L736 데모 문장 제외). 주문번호는 orders.code 대문자.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProductIcon } from "@/components/campaign-card";
import { failText, parseCheckoutReturn, parseSuccessParams, RETURN_KEY, type CheckoutReturn, type FailText } from "@/components/checkout/rules";
import { DEFAULT_SETTINGS, won } from "@/lib/campaign";
import { COMPANY } from "@/lib/company";

/** /api/payments/confirm 성공 응답의 card (E buildSuccessCard) — 조회 실패 시 null */
type ConfirmCard = {
  product: string;
  emoji: string | null;
  thumbUrl: string | null;
  option: string;
  qty: number;
  amount: number;
  seller: string;
  handle: string;
  brand: string;
  code: string;
  storeUrl: string;
  buyerName: string;
};

type ConfirmOk = { ok: true; orderCode: string; already?: boolean; card: ConfirmCard | null };
type ConfirmFail = { ok: false; code: string; message?: string };

type State =
  | { kind: "loading" }
  | { kind: "ok"; orderCode: string; already: boolean; card: ConfirmCard | null; amount: number }
  | { kind: "fail"; fail: FailText; code: string };

const RETRY_DELAY_MS = 1500;

async function postConfirm(body: { paymentKey: string; orderId: string; amount: number }): Promise<{ status: number; data: ConfirmOk | ConfirmFail | null }> {
  const res = await fetch("/api/payments/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as ConfirmOk | ConfirmFail | null;
  return { status: res.status, data };
}

export function Confirming() {
  return (
    <div className="store">
      <div className="card static">
        <div className="empty" role="status" aria-live="polite">
          <span className="pulse" aria-hidden="true" style={{ color: "var(--color-accent)" }} />
          결제를 확인하고 있어요…
        </div>
      </div>
    </div>
  );
}

function readReturn(): CheckoutReturn | null {
  try {
    return parseCheckoutReturn(window.sessionStorage.getItem(RETURN_KEY));
  } catch {
    return null; // 저장소 접근 불가 — 홈으로 대체
  }
}

export function SuccessClient() {
  const params = useSearchParams();
  // 셋 중 하나라도 없거나 amount 형식이 어긋나면 confirm 호출 없이 즉시 실패 뷰 (렌더 시점에 결정 — 이펙트에서 setState 하지 않는다)
  const parsed = useMemo(
    () => parseSuccessParams(params.get("paymentKey"), params.get("orderId"), params.get("amount")),
    [params],
  );
  const [state, setState] = useState<State>(() =>
    parsed ? { kind: "loading" } : { kind: "fail", code: "BAD_REQUEST", fail: failText("BAD_REQUEST") },
  );
  const [ret, setRet] = useState<CheckoutReturn | null>(null);
  const confirmedRef = useRef(false);

  useEffect(() => {
    // sessionStorage 는 외부 시스템 — 커밋 뒤 다음 틱에 읽는다 (SSR 과 첫 렌더는 null)
    const t = window.setTimeout(() => setRet(readReturn()), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!parsed) return;
    if (confirmedRef.current) return; // confirm 은 정확히 1회 (StrictMode 이중 실행 방어)
    confirmedRef.current = true;

    (async () => {
      let r = await postConfirm(parsed);
      if (r.status === 409) {
        // 다른 요청이 진행 중(신선한 CONFIRMING) — 1.5초 뒤 1회 재시도
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        r = await postConfirm(parsed);
      }
      if (r.status === 401) {
        const here = window.location.pathname + window.location.search;
        window.location.replace(`/login?next=${encodeURIComponent(here)}`);
        return;
      }
      const d = r.data;
      if (r.status >= 200 && r.status < 300 && d && d.ok === true) {
        setState({ kind: "ok", orderCode: d.orderCode, already: d.already === true, card: d.card ?? null, amount: parsed.amount });
        return;
      }
      const code = d && d.ok === false && d.code ? d.code : r.status === 409 ? "CONFIRMING" : "UNKNOWN";
      const message = d && d.ok === false ? d.message : undefined;
      setState({ kind: "fail", code, fail: failText(code, message) });
    })().catch((e: unknown) => {
      console.error("[checkout/success] confirm failed", e);
      // 네트워크 오류 — 서버가 처리했을 수 있다: FAILED 로 단정하지 않고 "확인 중" 으로 안내
      setState({ kind: "fail", code: "CONFIRMING", fail: failText("CONFIRMING") });
    });
  }, [parsed]);

  if (state.kind === "loading") return <Confirming />;
  if (state.kind === "fail") return <FailView fail={state.fail} code={state.code} ret={ret} />;
  return <DoneView orderCode={state.orderCode} card={state.card} amount={state.amount} ret={ret} />;
}

/* ---------------- 주문 완료 (orderDoneModal 원문) ---------------- */

function DoneView({ orderCode, card, amount, ret }: { orderCode: string; card: ConfirmCard | null; amount: number; ret: CheckoutReturn | null }) {
  const storeHref = card?.storeUrl ?? ret?.store ?? "/";
  const external = /^https?:\/\//.test(COMPANY.csUrl);
  return (
    <div className="store">
      <div className="card static">
        <h3>주문 완료 ✓</h3>
        <div className="notice" style={{ margin: "0 0 12px" }}>
          결제 금액은 <b>셀러리</b>가 안전하게 보관하고, 판매 종료 후 교환/환불 기간({DEFAULT_SETTINGS.clear_days}일)이 지나면 브랜드·인플루언서에게
          정산됩니다.
        </div>
        <table className="stmt" style={{ minWidth: 0, fontSize: 13 }}>
          <tbody>
            <tr>
              <td style={{ whiteSpace: "nowrap", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{orderCode.toUpperCase()}</td>
              <td className="num" style={{ whiteSpace: "normal" }}>
                {card ? (
                  <>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <ProductIcon thumbUrl={card.thumbUrl} emoji={card.emoji ?? "📦"} size={28} />
                      <span>
                        {card.product} · {card.option} × {card.qty} · <b>{won(card.amount)}</b>
                      </span>
                    </span>
                    <div style={{ fontSize: 11.5, color: "var(--color-mute)", fontWeight: 400 }}>
                      {card.seller} {card.handle} · {card.brand} 직배송
                    </div>
                  </>
                ) : (
                  <b>{won(amount)}</b>
                )}
              </td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: "var(--color-mute)", marginTop: 10 }}>
          {card?.buyerName ? (
            <>
              <b>{card.buyerName}</b>님의 <b>내 주문</b>에서 배송·환불을 관리할 수 있어요.{" "}
            </>
          ) : (
            <>
              <b>내 주문</b>에서 배송·환불을 관리할 수 있어요.{" "}
            </>
          )}
          운송장은 카카오 알림톡으로 안내됩니다.
        </p>
        <div className="btnrow" style={{ justifyContent: "flex-end", marginTop: 18 }}>
          <a href={COMPANY.csUrl} className="btn" target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
            문의하기
          </a>
          <Link href="/account/orders" className="btn">
            내 주문
          </Link>
          <Link href={storeHref} className="btn pri">
            확인
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 실패 뷰 (app-plan §6.3 표) ---------------- */

function FailView({ fail, code, ret }: { fail: FailText; code: string; ret: CheckoutReturn | null }) {
  const external = /^https?:\/\//.test(COMPANY.csUrl);
  const pending = fail.kind === "pending";
  return (
    <div className="store">
      <div className="card static">
        <h3>{pending ? "결제 확인 중" : "주문을 완료하지 못했어요"}</h3>
        <div className={pending ? "notice" : "notice danger"} role="alert" style={{ margin: "0 0 10px" }}>
          {fail.text}
        </div>
        {fail.money ? (
          <div className="meta" style={{ marginBottom: 6 }}>
            결제 상태: {fail.money}
          </div>
        ) : null}
        <div className="meta" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
          코드 {code}
        </div>
        <div className="btnrow" style={{ justifyContent: "flex-end", marginTop: 18 }}>
          <a href={COMPANY.csUrl} className="btn" target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
            문의하기
          </a>
          {pending ? (
            <Link href="/account/orders" className="btn pri">
              내 주문
            </Link>
          ) : (
            <>
              {ret?.retry && code !== "NOT_LIVE" && code !== "SOLD_OUT" ? (
                <Link href={ret.retry} className="btn">
                  다시 시도
                </Link>
              ) : null}
              <Link href={ret?.store ?? "/"} className="btn pri">
                판매 페이지로
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
