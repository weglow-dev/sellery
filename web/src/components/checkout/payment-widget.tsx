"use client";

/**
 * 토스 결제위젯 v2 — 결제 수단 카드(#payment-method) + 약관 동의 카드(#agreement). 소유: D.
 * 사용법은 reuse-map §2.1(glo checkout-client.tsx) 그대로:
 *   loadTossPayments(NEXT_PUBLIC_TOSS_CLIENT_KEY) → widgets({ customerKey: user.id }) → setAmount → renderPaymentMethods + renderAgreement
 *   금액이 바뀌면 setAmount 만 다시 호출(재렌더 없음). 언마운트(StrictMode 이중 실행 포함) 시 렌더된 위젯을 destroy.
 * variantKey = NEXT_PUBLIC_TOSS_WIDGET_VARIANT || "DEFAULT-2" · 약관 "AGREEMENT" (app-plan §3 · §10.0).
 * 테스트 키(test_)면 안내 문구를 보여 준다 (reuse-map §4-3 IS_TEST_KEY).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { loadTossPayments, type TossPaymentsWidgets, type WidgetAgreementWidget, type WidgetPaymentMethodWidget } from "@tosspayments/tosspayments-sdk";

const CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";
const IS_TEST_KEY = CLIENT_KEY.startsWith("test_");
const VARIANT_KEY = process.env.NEXT_PUBLIC_TOSS_WIDGET_VARIANT || "DEFAULT-2";
const AGREEMENT_VARIANT_KEY = "AGREEMENT";

export const PAYMENT_METHOD_SELECTOR = "#payment-method";
export const AGREEMENT_SELECTOR = "#agreement";

export type PaymentWidgetProps = {
  /** 토스 customerKey — 로그인 사용자 id (UUID, 2~50자 규칙 충족) */
  customerKey: string;
  /** 현재 표시 금액 — 서버 확정 금액은 결제 직전 부모가 setAmount 로 다시 넣는다 */
  amount: number;
  onReady: (widgets: TossPaymentsWidgets) => void;
  /** 위젯 로드 실패 (사용자 문구) */
  onError: (message: string) => void;
  /** 필수 약관 동의 상태 (agreementStatusChange) */
  onAgreementChange?: (agreedRequiredTerms: boolean) => void;
  /** 약관 카드 안, 토스 약관 UI 아래에 붙는 추가 항목 (통신판매중개자 확인 체크박스) */
  agreementExtra?: ReactNode;
};

export function PaymentWidget({ customerKey, amount, onReady, onError, onAgreementChange, agreementExtra }: PaymentWidgetProps) {
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
  const [ready, setReady] = useState(false);
  // 클라이언트 키는 빌드 시 상수 — 없으면 처음부터 실패 상태
  const [failed, setFailed] = useState(() => !CLIENT_KEY);
  // 콜백은 ref 로 — 부모가 매 렌더마다 새 함수를 넘겨도 위젯을 다시 만들지 않는다 (렌더 중이 아니라 커밋 후 갱신)
  const cb = useRef({ onReady, onError, onAgreementChange });
  useEffect(() => {
    cb.current = { onReady, onError, onAgreementChange };
  });
  const initialAmount = useRef(amount);

  useEffect(() => {
    if (!CLIENT_KEY) {
      cb.current.onError("결제 위젯 설정이 없어요 (NEXT_PUBLIC_TOSS_CLIENT_KEY)");
      return;
    }
    let cancelled = false;
    let methods: WidgetPaymentMethodWidget | null = null;
    let agreement: WidgetAgreementWidget | null = null;

    (async () => {
      const toss = await loadTossPayments(CLIENT_KEY);
      if (cancelled) return;
      const widgets = toss.widgets({ customerKey });
      await widgets.setAmount({ currency: "KRW", value: initialAmount.current });
      if (cancelled) return;
      [methods, agreement] = await Promise.all([
        widgets.renderPaymentMethods({ selector: PAYMENT_METHOD_SELECTOR, variantKey: VARIANT_KEY }),
        widgets.renderAgreement({ selector: AGREEMENT_SELECTOR, variantKey: AGREEMENT_VARIANT_KEY }),
      ]);
      if (cancelled) {
        // StrictMode 이중 실행: 늦게 끝난 첫 렌더는 지운다 (두 번째 실행이 다시 그린다)
        void methods.destroy().catch(() => {});
        void agreement.destroy().catch(() => {});
        return;
      }
      agreement.on("agreementStatusChange", (st) => cb.current.onAgreementChange?.(st.agreedRequiredTerms));
      widgetsRef.current = widgets;
      setReady(true);
      cb.current.onReady(widgets);
    })().catch((e: unknown) => {
      if (cancelled) return;
      console.error("[checkout] toss widget load failed", e);
      setFailed(true);
      cb.current.onError("결제 위젯을 불러오지 못했어요 — 새로고침 후 다시 시도해주세요");
    });

    return () => {
      cancelled = true;
      widgetsRef.current = null;
      setReady(false);
      if (methods) void methods.destroy().catch(() => {});
      if (agreement) void agreement.destroy().catch(() => {});
    };
  }, [customerKey]);

  // 표시 금액 변경 → setAmount 만 (마운트 시 금액은 초기화 경로에서 넣었다)
  useEffect(() => {
    if (!ready || !widgetsRef.current) return;
    void widgetsRef.current.setAmount({ currency: "KRW", value: amount }).catch((e: unknown) => {
      console.error("[checkout] setAmount failed", e);
    });
  }, [amount, ready]);

  return (
    <>
      <div className="card static">
        <h4>결제 수단</h4>
        {IS_TEST_KEY ? (
          <div className="notice" style={{ margin: "0 0 10px" }}>
            테스트 환경입니다 — 실제 결제가 발생하지 않습니다.
          </div>
        ) : null}
        {!ready && !failed ? (
          <div className="empty" style={{ padding: 18 }} aria-live="polite">
            결제 수단을 불러오는 중…
          </div>
        ) : null}
        {failed ? (
          <div className="notice danger" style={{ margin: 0 }}>
            결제 위젯을 불러오지 못했어요 — 새로고침 후 다시 시도해주세요
          </div>
        ) : null}
        <div id="payment-method" />
      </div>
      <div className="card static">
        <h4>약관 동의</h4>
        <div id="agreement" />
        {agreementExtra ? <div style={{ marginTop: 10 }}>{agreementExtra}</div> : null}
      </div>
    </>
  );
}
