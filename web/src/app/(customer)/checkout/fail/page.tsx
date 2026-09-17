/**
 * /checkout/fail?code&message&orderId&c&o&q — 토스 failUrl 랜딩 (app-plan §6.1 · ux-spec §3.5). 소유: D.
 * 위젯 단계 실패(고객 취소 · 카드사 거절)만 온다. PAY_PROCESS_CANCELED → "결제를 취소했어요…", 그 외 토스 message + 코드.
 * "다시 시도" → /checkout?c&o&q (failUrl 에 실어 보낸 값) · "판매 페이지로" → 정식 URL (campaign_card 로 확인, 없으면 홈).
 */
import Link from "next/link";
import { fetchCampaignCard } from "@/lib/campaign-server";
import { canonicalStoreUrl } from "@/lib/campaign";
import { COMPANY } from "@/lib/company";
import { checkoutHref, failPageReason, parseCheckoutParams, TOSS_KEY_RE } from "@/components/checkout/rules";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function CheckoutFailPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  // 공개 URL 파라미터 반사 — code/message 는 failPageReason 이 형식·길이·스푸핑 패턴을 거르고, orderId 는 형식 통과값만 표시
  const code = (first(sp.code) ?? "").slice(0, 80);
  const reason = failPageReason(code, first(sp.message));
  const orderIdRaw = first(sp.orderId) ?? "";
  const orderId = TOSS_KEY_RE.test(orderIdRaw) ? orderIdRaw : "";

  const params = parseCheckoutParams(sp);
  const card = params ? await fetchCampaignCard(params.code) : null;
  const storeHref = card ? canonicalStoreUrl(card) : "/";
  const retryHref = params && card ? checkoutHref(params.code, params.optionIndex, params.qty) : null;
  const external = /^https?:\/\//.test(COMPANY.csUrl);

  return (
    <div className="store">
      <div className="card static">
        <h3>결제에 실패했어요</h3>
        <div className="notice danger" role="alert" style={{ margin: "0 0 10px" }}>
          {reason}
        </div>
        <div className="meta">
          결제는 진행되지 않았습니다 — 카드·간편결제로 다시 시도할 수 있어요.
          {orderId ? (
            <>
              {" "}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>주문 {orderId}</span>
            </>
          ) : null}
        </div>
        <div className="btnrow" style={{ justifyContent: "flex-end", marginTop: 18 }}>
          <a href={COMPANY.csUrl} className="btn" target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
            문의하기
          </a>
          <Link href={storeHref} className="btn">
            판매 페이지로
          </Link>
          {retryHref ? (
            <Link href={retryHref} className="btn pri">
              다시 시도
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
