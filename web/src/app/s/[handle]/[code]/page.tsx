/**
 * 판매 링크 페이지 `/s/[handle]/[code]` (프로토타입 vStore · ux-spec §3.1 · app-plan §6.1). 소유: C.
 *   · anon campaign_card(code) → null 이면 notFound() (not-found.tsx "판매 페이지를 찾을 수 없습니다")
 *   · URL 핸들이 정식 핸들(normalizeHandle(seller.handle) — '@' 없음)과 다르면 permanentRedirect(canonicalStoreUrl) 308
 *     (정식 URL 재요청은 raw 세그먼트 === 정식 핸들이라 200 — 무한 리다이렉트 없음)
 *   · force-dynamic (쿠키·재고) — 캐시하지 않는다. 링크 쿠키는 proxy 가 이 경로에서 세팅한다 (B).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CEL, PlatIcon } from "@/components/icons";
import { GradeBox } from "@/components/grade-box";
import { TrustBand } from "@/components/trust-band";
import { Tilt } from "@/components/tilt";
import { CampaignCard, SellerAvatar } from "@/components/campaign-card";
import { fetchCampaignCard, fetchSellerOtherCampaigns } from "@/lib/campaign-server";
import { badgeTone, canonicalStoreUrl, ddayLabel, displayStoreUrl, imageSrc, isEnded, normalizeHandle, ogImageSrc, type CampaignCard as Card } from "@/lib/campaign";
import { getSessionUser } from "@/lib/auth";
import { COMPANY } from "@/lib/company";
import { StoreClient } from "./store-client";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ handle: string; code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const card = await fetchCampaignCard(code);
  if (!card) return { title: "판매 페이지를 찾을 수 없습니다", robots: { index: false, follow: false } };
  const ended = isEnded(card.campaign, card.campaign.today);
  const og = ogImageSrc(card.product.thumb_url);
  const description = [card.product.description, card.brand.name, `${card.seller.name}님의 셀러리 인증 판매`].filter(Boolean).join(" · ");
  return {
    title: `${card.product.name} · ${card.seller.name}`,
    description,
    alternates: { canonical: canonicalStoreUrl(card) },
    robots: ended ? { index: false, follow: true } : undefined,
    openGraph: {
      title: `${card.product.name} · ${card.seller.name} — 셀러리`,
      description,
      url: canonicalStoreUrl(card),
      ...(og ? { images: [{ url: og }] } : {}),
    },
  };
}

export default async function StorePage({ params }: Params) {
  const { handle, code } = await params;
  const card = await fetchCampaignCard(code);
  if (!card) notFound();
  if (handle !== normalizeHandle(card.seller.handle)) permanentRedirect(canonicalStoreUrl(card));

  const [others, user] = await Promise.all([
    fetchSellerOtherCampaigns(card.seller.id, card.campaign.id),
    getSessionUser().catch(() => null),
  ]);
  const { campaign, product, seller, brand } = card;
  const today = campaign.today;
  const dd = ddayLabel(card);
  const tone = badgeTone(dd);
  const hero = imageSrc(product.thumb_url);

  return (
    <div className="store">
      {/* 1. 상단 행 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <Link href="/" className="btn ghost sm">
          ← 셀러리 홈
        </Link>
        <span style={{ fontSize: 11.5, color: "var(--color-mute)" }}>{displayStoreUrl(card, COMPANY.siteHost)}</span>
      </div>

      {/* 2. 인증 띠 */}
      <TrustBand card={card} />

      {/* 3. 상품 카드 */}
      <div className="card flat" style={{ overflow: "hidden" }}>
        <div className="store-hero">
          <Tilt className="store-em">
            {hero ? (
              // eslint-disable-next-line @next/next/no-img-element -- 시드 썸네일은 data: URI·정적 webp
              <img src={hero} alt={product.name} style={{ maxHeight: 220, maxWidth: "80%", objectFit: "contain" }} />
            ) : (
              product.emoji
            )}
          </Tilt>
          <span className={tone ? `trendbadge ${tone}` : "trendbadge"}>{dd}</span>
        </div>
        <div className="store-body">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <SellerAvatar avatarUrl={seller.avatar_url} size={40} />
            <div style={{ flex: 1, minWidth: 160 }}>
              <div>
                <b>{seller.name}</b>{" "}
                <span style={{ color: "var(--color-mute)", fontSize: 12 }}>
                  <PlatIcon platform={seller.platform} /> {seller.handle}
                </span>{" "}
                <GradeBox grade={seller.grade} sm />
              </div>
              <div style={{ fontSize: 11.5, color: "var(--color-mute)" }}>셀러리 인증 인플루언서 × {brand.name} 공식 공급</div>
            </div>
            {others.length && seller.code ? (
              <Link href={`/?seller=${encodeURIComponent(seller.code)}`} className="btn sm ghost">
                다른 판매 보기
              </Link>
            ) : null}
          </div>
          <h2 style={{ margin: "6px 0 4px", fontSize: 22 }}>{product.name}</h2>
          <div className="meta" style={{ marginBottom: 12 }}>
            {product.description ? `${product.description} · ` : ""}
            {product.category}
          </div>
          <StoreClient card={card} signedIn={user !== null} />
        </div>
      </div>

      {/* 4. 상세 정보 */}
      <div className="card">
        <h4>상세 정보</h4>
        {product.image_urls.length ? (
          <div className="store-detail" style={{ padding: 0 }}>
            {product.image_urls.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- 브랜드 등록 상세 이미지 (크기 미상)
              <img key={`${i}:${u}`} src={imageSrc(u) ?? u} alt="" />
            ))}
          </div>
        ) : (
          <div className="store-detail">
            <div className="store-em" aria-hidden="true">
              {product.emoji}
            </div>
            {product.description ? <p>{product.description}</p> : null}
            <p style={{ color: "var(--color-mute)", fontSize: 12.5 }}>
              브랜드가 등록한 상세페이지 이미지가 여기에 노출됩니다 ({brand.name} 제공 · 표시광고 사전심의 완료)
            </p>
          </div>
        )}
      </div>

      {/* 5. 배송 · 교환 · 환불 */}
      <ShippingPolicyCard card={card} />

      {/* 6. 판매자 정보 (신규 §3.1.7) */}
      <SellerInfoCard card={card} />

      {/* 7. 다른 판매 */}
      {others.length ? (
        <>
          <div className="sec">{seller.name}님의 다른 판매</div>
          <div className="grid g3">
            {others.map((c) => (
              <CampaignCard key={c.id} c={c} today={today} featureDays={card.settings.home_feature_days} />
            ))}
          </div>
        </>
      ) : null}

      {/* 8. 페이지 전용 .store-foot (전역 푸터는 layout) */}
      <div className="store-foot">
        <CEL /> <b>SELLERY</b> · 셀러리는 통신판매중개자로 거래 당사자가 아니며, 상품·거래 정보의 책임은 공급 브랜드({brand.name})에 있습니다 · #광고 ·
        인플루언서는 판매 수수료를 받습니다
      </div>
    </div>
  );
}

/** 3.1.6 배송 · 교환 · 환불 카드 [원문]. 문의 버튼은 슬라이스 1 에서 고객센터 채널 링크로 안내 (cs-modal 은 F — /api/cs 없음). */
function ShippingPolicyCard({ card }: { card: Card }) {
  const external = /^https?:\/\//.test(COMPANY.csUrl);
  const days = card.settings.clear_days;
  return (
    <div className="card">
      <h4>배송 · 교환 · 환불</h4>
      <div className="btnrow" style={{ margin: "0 0 11px" }}>
        <a href={COMPANY.csUrl} className="btn sm" target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
          💬 판매자에게 문의하기
        </a>
      </div>
      <ul className="store-ul">
        <li>
          결제 후 2–3일 내 <b>{card.brand.name}</b>에서 직배송, 운송장은 셀러리 알림톡으로 안내
        </li>
        <li>
          판매 종료 후 <b>{days}일</b> 동안 교환·환불 신청 가능 (단순 변심 7일 · 하자 {days}일)
        </li>
        <li>
          대금은 정산 전까지 <b>셀러리</b>가 보관하므로 환불이 지연되지 않습니다
        </li>
        <li>문의: 셀러리 고객센터(이메일) — 인플루언서 DM이 아닌 셀러리로 접수</li>
      </ul>
    </div>
  );
}

/** 3.1.7 브랜드 사업자 정보 카드 [신규] — biz_no · mail_order_no 가 null 이면 행 생략 */
function SellerInfoCard({ card }: { card: Card }) {
  const { brand, seller } = card;
  return (
    <div className="card">
      <h4>판매자 정보</h4>
      <table className="stmt" style={{ minWidth: 0, fontSize: 13 }}>
        <tbody>
          <tr>
            <td style={{ whiteSpace: "nowrap" }}>공급 브랜드</td>
            <td>
              {brand.name} <GradeBox grade={brand.grade} sm />
              {!brand.biz_no ? " · 인증 브랜드" : null}
            </td>
          </tr>
          {brand.biz_no ? (
            <tr>
              <td style={{ whiteSpace: "nowrap" }}>사업자등록번호</td>
              <td>{brand.biz_no}</td>
            </tr>
          ) : null}
          {brand.mail_order_no ? (
            <tr>
              <td style={{ whiteSpace: "nowrap" }}>통신판매업신고</td>
              <td>{brand.mail_order_no}</td>
            </tr>
          ) : null}
          <tr>
            <td style={{ whiteSpace: "nowrap" }}>판매 인플루언서</td>
            <td>
              {seller.name} <PlatIcon platform={seller.platform} /> {seller.handle} · 셀러리 인증
            </td>
          </tr>
          <tr>
            <td style={{ whiteSpace: "nowrap" }}>통신판매중개</td>
            <td>{COMPANY.name} · 셀러리 — 사업자 정보는 페이지 하단 참조</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
