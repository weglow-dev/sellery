/**
 * /checkout/success?paymentKey&orderId&amount — successUrl 랜딩 (app-plan §6.1 · ux-spec §3.5). 소유: D.
 * useSearchParams 를 쓰는 클라이언트 트리를 Suspense 로 감싼다 (Next 16: 빌드 시 CSR bailout 오류 방지).
 */
import { Suspense } from "react";
import { Confirming, SuccessClient } from "./success-client";

export const dynamic = "force-dynamic";

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<Confirming />}>
      <SuccessClient />
    </Suspense>
  );
}
