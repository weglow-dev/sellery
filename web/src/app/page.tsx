/**
 * 고객 홈 `/` (프로토타입 vCustHome · ux-spec §3.2 · app-plan §6.1 최소판). 소유: C.
 *   입력: ?cat= (기본 '전체') · ?seller= (seller.code) · 쿠키 slry_linkctx (B readLinkCtx → custVisible 필터)
 *   데이터: anon 조인 fetchHomeCampaigns · fetchPublicSellers · public_stats(60초 캐시) · 세션(하단 카드)
 *   링크 보호(app-plan §8): 진행 중·오픈 예정·카테고리 건수·순위에 custVisible 적용. 보호 중에는 타 인플루언서 ★ 추천 상단 고정 해제.
 *   안내 문구는 ux-spec §3.2.2 ② 원문 + '(판매 종료 후 {link_protect_days}일까지 유지)' (app-plan §8).
 */
import Link from "next/link";
import { CEL, KAKAO_ICON, PlatIcon } from "@/components/icons";
import { GradeBox } from "@/components/grade-box";
import { CampaignCard, ProductIcon, ViewersSum } from "@/components/campaign-card";
import { fetchCampaignCard, fetchHomeCampaigns, fetchPublicSellers, fetchPublicStats } from "@/lib/campaign-server";
import { CATS, CAT_INFO, DEFAULT_SETTINGS, fmtKR, fmtNum, isCat, isHomeFeat, storeUrl, type HomeCard } from "@/lib/campaign";
import { custVisible, readLinkCtx } from "@/lib/linkctx";
import { kstToday } from "@/lib/dates";
import { displayName, getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Search = Promise<{ cat?: string | string[]; seller?: string | string[] }>;

const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** 링크 보호 중 정렬 키: 타 인플루언서의 ★ 추천은 상단 고정하지 않는다 (제안서 "다른 브랜드의 추천·배너 ✕") */
function featOf(c: HomeCard, today: string, featureDays: number, protectedSellerId: string | null): number {
  if (protectedSellerId && c.seller_id !== protectedSellerId) return 0;
  return isHomeFeat(c, today, featureDays) ? 1 : 0;
}

export default async function Home({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const catParam = first(sp.cat);
  const cat = isCat(catParam) ? catParam : "전체";
  const sellerCode = first(sp.seller)?.trim() || null;

  const [all, pubSellers, stats, L, user] = await Promise.all([
    fetchHomeCampaigns(),
    fetchPublicSellers(),
    fetchPublicStats(),
    readLinkCtx().catch(() => null),
    getSessionUser().catch(() => null),
  ]);
  // 보호 중인 링크의 정책값(link_protect_days · home_feature_days) — campaign_card 는 요청당 캐시라 readLinkCtx 와 중복 비용이 작다
  const linkCard = L ? await fetchCampaignCard(L.code) : null;
  const settings = linkCard?.settings ?? DEFAULT_SETTINGS;
  const today = stats.today ?? kstToday();
  const protectedSellerId = L?.sellerId ?? null;

  const visible = all.filter((c) => custVisible({ seller_id: c.seller_id, product_id: c.product_id, category: c.product.category }, L));
  const sel = sellerCode ? (pubSellers.find((s) => s.code === sellerCode) ?? null) : null;
  const inSel = (c: HomeCard) => !sel || c.seller_id === sel.id;
  const inCat = (c: HomeCard) => cat === "전체" || c.product.category === cat;
  const feat = (c: HomeCard) => featOf(c, today, settings.home_feature_days, protectedSellerId);

  const live = visible
    .filter((c) => c.status === "LIVE" && inSel(c) && inCat(c))
    .sort((a, b) => feat(b) - feat(a) || b.sold_qty - a.sold_qty);
  const soon = visible
    .filter((c) => c.status === "SCHEDULE_CONFIRMED" && inSel(c) && inCat(c))
    .sort((a, b) => feat(b) - feat(a) || (a.start_date ?? "").localeCompare(b.start_date ?? ""));
  const allLive = visible.filter((c) => c.status === "LIVE");
  const catCount = (k: string) =>
    visible.filter((c) => (c.status === "LIVE" || c.status === "SCHEDULE_CONFIRMED") && (k === "전체" || c.product.category === k)).length;
  const rank = [...visible].sort((a, b) => b.sold_qty - a.sold_qty).slice(0, 5);
  const mxq = rank.length ? Math.max(1, rank[0].sold_qty) : 1;
  const name = user ? displayName(user) : null;

  const qs = (next: { cat?: string; seller?: string | null }) => {
    const p = new URLSearchParams();
    const c = next.cat ?? cat;
    const s = next.seller === undefined ? sellerCode : next.seller;
    if (c && c !== "전체") p.set("cat", c);
    if (s) p.set("seller", s);
    const q = p.toString();
    return q ? `/?${q}` : "/";
  };

  return (
    <>
      {/* 1. 히어로 */}
      <div className="hero-band">
        <div className="ey">
          <CEL /> SELLERY — 검증된 사람이 고른 웰니스
        </div>
        {sel ? (
          <h1>
            {sel.name}님이 추천하는 <em>진행 중인 상품</em>
          </h1>
        ) : (
          <h1>
            셀러리에 오신 고객님, <em>환영합니다.</em>
          </h1>
        )}
        {!sel ? (
          <div className="tagline">
            지금 진행 중인 <b>최저가 상품</b>을 소개합니다.
          </div>
        ) : null}
        <div className="sub">
          {sel ? (
            <Link href={qs({ seller: null })} className="btn sm ghost" style={{ marginLeft: 0 }}>
              전체 보기
            </Link>
          ) : (
            <>
              인증된 인플루언서가 직접 써 보고 고른 웰니스. 브랜드가 바로 보내고, 결제 대금은 판매 종료 후 <b>{settings.clear_days}일</b>까지 <b>셀러리</b>가
              보관합니다.
            </>
          )}
        </div>
        <div className="cstats">
          <div>
            <span className="cs-l">👀 지금 보는 중</span>
            <span className="cs-v">
              <span className="pulse" style={{ color: "var(--color-danger)" }} aria-hidden="true" />
              <ViewersSum codes={allLive.map((c) => c.code)} />명
            </span>
          </div>
          <div>
            <span className="cs-l">오늘 판매</span>
            <span className="cs-v">{fmtNum(stats.today_qty)}개</span>
          </div>
          <div>
            <span className="cs-l">누적 판매액</span>
            <span className="cs-v">₩{fmtKR(stats.gmv)}</span>
          </div>
          <div>
            <span className="cs-l">인증 인플루언서 · 브랜드</span>
            <span className="cs-v">
              {fmtNum(stats.sellers)}명 · {fmtNum(stats.brands)}개
            </span>
          </div>
        </div>
      </div>

      {/* 2. 링크 보호 안내 */}
      {L ? (
        <div className="notice" style={{ marginBottom: 14 }}>
          🔗 <b>{L.sellerName}</b>님의 판매 링크로 들어오셨어요 — 이 판매와 같은 상품·카테고리의 다른 판매는 표시되지 않습니다. (판매 종료 후{" "}
          {settings.link_protect_days}일까지 유지)
        </div>
      ) : null}

      {/* 3. 카테고리 칩 */}
      <div className="cats" style={{ margin: "0 0 6px" }} role="navigation" aria-label="카테고리">
        {CATS.map((k) => (
          <Link key={k} href={qs({ cat: k })} className={cat === k ? "catchip on" : "catchip"} aria-current={cat === k ? "page" : undefined}>
            {k} <span className="n">{catCount(k)}</span>
          </Link>
        ))}
      </div>
      {/* 4. 카테고리 안내 */}
      <div className="catguide">
        {cat === "전체" ? (
          <>
            <b>건강·웰니스만 다룹니다</b> — 건강기능식품, 이너뷰티, 더마 스킨케어, 웰니스 푸드. 그 밖의 품목은 취급하지 않습니다.
          </>
        ) : (
          <>
            <b>{cat}</b> <span className="en">{CAT_INFO[cat].en}</span> — {CAT_INFO[cat].desc} · 예: {CAT_INFO[cat].ex}
          </>
        )}
      </div>

      {/* 5. 목록 + 우측 */}
      <div className="custgrid">
        <div>
          <div className="sec" style={{ marginTop: 8 }}>
            진행 중 <span className="badge">{live.length}</span>
          </div>
          <div className="grid g2">
            {live.length ? (
              live.map((c) => <CampaignCard key={c.id} c={c} today={today} featureDays={settings.home_feature_days} allowFeat={feat(c) === 1} />)
            ) : (
              <div className="empty" style={{ gridColumn: "1 / -1" }}>
                이 카테고리에 진행 중인 판매가 없습니다
              </div>
            )}
          </div>
          <div className="sec" style={{ marginTop: 22 }}>
            오픈 예정 <span className="badge">{soon.length}</span>
          </div>
          <div className="grid g2">
            {soon.length ? (
              soon.map((c) => <CampaignCard key={c.id} c={c} today={today} featureDays={settings.home_feature_days} allowFeat={feat(c) === 1} />)
            ) : (
              <div className="empty" style={{ gridColumn: "1 / -1" }}>
                예정된 판매가 없습니다
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="sec" style={{ marginTop: 8 }}>
            실시간 판매 순위
          </div>
          <div className="card">
            <div style={{ fontSize: 11, color: "var(--color-mute)", marginBottom: 10 }}>판매 수량 기준 · 실시간 집계</div>
            {rank.length ? (
              rank.map((c, i) => (
                <Link key={c.id} href={storeUrl(c.seller.handle, c.code)} className="hb-row">
                  <span className="hb-nm">
                    {i + 1}. <ProductIcon thumbUrl={c.product.thumb_url} emoji={c.product.emoji} size={20} /> {c.product.name}{" "}
                    <span className="n">· {c.seller.name}</span>
                  </span>
                  <div className="hb-track">
                    <div className={i === 0 ? "hb-bar top" : "hb-bar"} style={{ width: `${Math.max(6, (c.sold_qty / mxq) * 100)}%` }} />
                  </div>
                  <span className="hb-val">{fmtNum(c.sold_qty)}개</span>
                </Link>
              ))
            ) : (
              <div className="empty">순위 집계 중</div>
            )}
          </div>
          <div className="sec" style={{ marginTop: 22 }}>
            인플루언서
          </div>
          <div className="card">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {pubSellers.map((s) => (
                <Link
                  key={s.id}
                  href={s.code ? qs({ seller: s.code }) : "/"}
                  className={sel?.id === s.id ? "catchip on" : "catchip"}
                  aria-current={sel?.id === s.id ? "page" : undefined}
                >
                  <PlatIcon platform={s.platform} /> {s.name} <GradeBox grade={s.grade} sm />
                </Link>
              ))}
              {!pubSellers.length ? <span className="meta">인증 인플루언서를 준비 중입니다</span> : null}
            </div>
          </div>
        </div>
      </div>

      {/* 6. 셀러리가 다른 이유 */}
      <div className="sec" style={{ marginTop: 26 }}>
        셀러리가 다른 이유
      </div>
      <div className="why">
        <WhyCard icon="🥬" title="건강·웰니스만" text="건강기능식품, 이너뷰티, 더마 스킨케어, 웰니스 푸드. 한 분야를 깊게 검증합니다." />
        <WhyCard
          icon="✅"
          title="검증된 상품"
          text="브랜드 사업자 확인과 상품 검수(표시광고 기준)를 거친 상품만 노출됩니다. 판매가는 브랜드가 셀러리에 등록한 가격 그대로입니다."
        />
        <WhyCard icon="🛡️" title="인증 인플루언서" text="채널 소유 인증과 실제 판매 실적에 따른 7단계 등급. 모든 판매 페이지에 인증 마크가 표시됩니다." />
        <WhyCard
          icon="🔒"
          title={`안전 결제 · ${settings.clear_days}일 환불 보호`}
          text={`결제 대금은 셀러리가 보관하고, 판매 종료 후 ${settings.clear_days}일의 환불 보호 기간이 지난 뒤 정산됩니다.`}
        />
        <WhyCard icon="🚚" title="브랜드 직배송" text="중간 유통 없이 브랜드가 직접 발송합니다. 운송장은 알림톡으로, 문의는 셀러리 고객센터로 받습니다." />
        <WhyCard icon="⏱️" title="기간 한정 가격" text="인플루언서 판매 기간에만 열리는 가격입니다. 같은 기간, 다른 곳에서 더 낮은 가격은 없습니다." />
      </div>

      {/* 7. 하단 카드 */}
      <div className="card" style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "16px 20px" }}>
        {name ? (
          <>
            <div>
              <b>{name}님</b>{" "}
              <span className="meta">
                주문·배송·환불은 <b>내 주문</b>에서 한곳에 관리돼요
              </span>
            </div>
            <div className="btnrow" style={{ margin: 0 }}>
              <Link href="/account/orders" className="btn pri sm">
                내 주문 보기
              </Link>
            </div>
          </>
        ) : (
          <>
            <div>
              <b>셀러리 회원이 되면</b> <span className="meta">오픈 알림 · 주문·배송·환불 통합 관리 · 인플루언서 팔로우 · 인증 이력</span>
            </div>
            <div className="btnrow" style={{ margin: 0 }}>
              <Link href={`/login?next=${encodeURIComponent("/")}`} className="btn sm kakao">
                <KAKAO_ICON /> 카카오로 시작하기
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function WhyCard({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="card">
      <div className="why-i" aria-hidden="true">
        {icon}
      </div>
      <b>{title}</b>
      <div className="meta">{text}</div>
    </div>
  );
}
