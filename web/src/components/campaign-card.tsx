"use client";

/**
 * 판매 카드 `custCard` (프로토타입 js/60-customer.js L9-23 · ux-spec §3.2.3) — 홈 · 링크 페이지 "다른 판매". 소유: C.
 *   .ph(클릭 → 링크 페이지) [p3d 누끼 | emoji] + trendbadge(★ 추천 | D-day | 오픈 D-n | 판매 종료)
 *   인플루언서 행 · .nm · .meta({description} · {brand}) · .prices · .meta(기간·잔여·판매됨·보는 중) · .btnrow
 * 링크는 정식 URL(/s/{handle}/{code}) 로 바로 간다 — 내부 이동은 proxy 가 쿠키를 덮어쓰지 않는다 (app-plan §8).
 * 기준일 `today` 는 서버가 넘긴다 (KST). "보는 중" 은 <Viewers/> 가 20초마다 갱신.
 */
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { PlatIcon, CEL } from "@/components/icons";
import { GradeBox } from "@/components/grade-box";
import { Tilt } from "@/components/tilt";
import { VerifyLauncher } from "@/components/verify-modal";
import { useToast } from "@/components/toast";
import { badgeTone, ddayLabelFor, discountPct, fmtNum, imageSrc, isHomeFeat, storeUrl, viewersOf, won, type HomeCard } from "@/lib/campaign";
import { md } from "@/lib/dates";

/** 오픈 알림 토스트 원문 (끝의 '(시뮬레이션)' 제거 — ux-spec §5). 저장소 없음 (§3.1.8). */
export const NOTIFY_TOAST = "오픈 알림 신청 완료 — 판매 시작 시 카카오 알림톡으로 안내";

/** 상품 아이콘 `pIcon` (js/50-admin.js L54): 썸네일이 있으면 .picon img, 없으면 이모지 */
export function ProductIcon({ thumbUrl, emoji, size = 38 }: { thumbUrl: string | null; emoji: string; size?: number }) {
  const src = imageSrc(thumbUrl);
  const style: CSSProperties = { width: size, height: size, fontSize: Math.round(size * 0.62) };
  return (
    <span className="picon" style={style} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- 시드 썸네일은 data: URI·정적 webp (최적화 대상 아님) */}
      {src ? <img src={src} alt="" /> : emoji}
    </span>
  );
}

/** 인플루언서 아바타 `.sc-av` — 이미지 없으면 👤 */
export function SellerAvatar({ avatarUrl, size }: { avatarUrl: string | null; size: number }) {
  const src = imageSrc(avatarUrl);
  const style: CSSProperties = src
    ? { width: size, height: size, backgroundImage: `url(${src})` }
    : { width: size, height: size, fontSize: Math.round(size / 2) };
  return (
    <span className={src ? "sc-av" : "sc-av em"} style={style} aria-hidden="true">
      {src ? null : "👤"}
    </span>
  );
}

/** "보는 중" 의사난수 (ux-spec §1.10) — SSR 값은 서버 버킷, 클라이언트에서 20초마다 갱신. offset: 예정 카드 `🔔 알림 {12 + n}명`. */
export function Viewers({ code, offset = 0 }: { code: string; offset?: number }) {
  // SSR 값(서버 버킷)으로 시작하고 20초 타이머(외부 시스템 구독)에서만 갱신 — 자정·버킷 경계의 서버/클라이언트 차이는 suppressHydrationWarning
  const [n, setN] = useState(() => viewersOf(code));
  useEffect(() => {
    const t = window.setInterval(() => setN(viewersOf(code)), 20000);
    return () => window.clearInterval(t);
  }, [code]);
  return <span suppressHydrationWarning>{fmtNum(n + offset)}</span>;
}

/** 홈 `👀 지금 보는 중` = Σ viewersOf(LIVE & custVisible) + 41 (ux-spec §1.10) */
export function ViewersSum({ codes, base = 41 }: { codes: string[]; base?: number }) {
  const key = codes.join("|");
  const [n, setN] = useState(() => codes.reduce((a, code) => a + viewersOf(code), 0) + base);
  useEffect(() => {
    const list = key ? key.split("|") : [];
    const t = window.setInterval(() => setN(list.reduce((a, code) => a + viewersOf(code), 0) + base), 20000);
    return () => window.clearInterval(t);
  }, [key, base]);
  return <span suppressHydrationWarning>{fmtNum(n)}</span>;
}

export function CampaignCard({ c, today, featureDays = 7, allowFeat = true }: { c: HomeCard; today: string; featureDays?: number; allowFeat?: boolean }) {
  const toast = useToast();
  const href = storeUrl(c.seller.handle, c.code);
  const live = c.status === "LIVE";
  const soon = c.status === "SCHEDULE_CONFIRMED";
  const left = c.qty - c.sold_qty;
  const feat = allowFeat && isHomeFeat(c, today, featureDays);
  const dd = ddayLabelFor(c, today);
  const tone = badgeTone(dd);
  const disc = discountPct(c.product.consumer_price, c.product.sale_price);
  const thumb = imageSrc(c.product.thumb_url);

  return (
    <div className="card prod">
      <Link href={href} className="ph" aria-label={`${c.product.name} 판매 페이지`}>
        <Tilt>
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- 시드 썸네일은 data: URI·정적 webp
            <img src={thumb} alt="" style={{ maxHeight: "92%", maxWidth: "78%", objectFit: "contain", pointerEvents: "none" }} />
          ) : (
            c.product.emoji
          )}
        </Tilt>
        {feat ? <span className="trendbadge feat">★ 추천</span> : <span className={tone ? `trendbadge ${tone}` : "trendbadge"}>{dd}</span>}
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <SellerAvatar avatarUrl={c.seller.avatar_url} size={28} />
        <span style={{ fontSize: 12.5 }}>
          <b>{c.seller.name}</b>{" "}
          <span style={{ color: "var(--color-mute)" }}>
            <PlatIcon platform={c.seller.platform} /> {c.seller.handle}
          </span>
        </span>
        <GradeBox grade={c.seller.grade} sm />
      </div>
      <Link href={href} className="nm">
        {c.product.name}
      </Link>
      <div className="meta">
        {c.product.description ? `${c.product.description} · ` : ""}
        {c.brand.name}
      </div>
      <div className="prices">
        <span className="gp">{won(c.product.sale_price)}</span>
        <span className="cp">{won(c.product.consumer_price)}</span>
        {disc !== null ? <span className="disc">-{disc}%</span> : null}
      </div>
      <div className="meta">
        {live ? (
          <>
            {c.start_date ? md(c.start_date) : "—"}–{c.end_date ? md(c.end_date) : "—"} · 잔여 {fmtNum(Math.max(0, left))}개 ·{" "}
            <b>{fmtNum(c.sold_qty)}개 판매됨</b> ·{" "}
            <span style={{ color: "var(--color-danger)" }}>
              👀 <Viewers code={c.code} />명 보는 중
            </span>
          </>
        ) : soon ? (
          <>
            {c.start_date ? md(c.start_date) : "—"} 오픈 예정 · 한정 {fmtNum(c.qty)}개 · 🔔 알림 <Viewers code={c.code} offset={12} />명
          </>
        ) : (
          <>
            {c.start_date ? md(c.start_date) : "—"}–{c.end_date ? md(c.end_date) : "—"} · <b>{fmtNum(c.sold_qty)}개 판매됨</b> · 판매 종료
          </>
        )}
      </div>
      <div className="btnrow">
        {live ? (
          <Link href={href} className="btn pri sm">
            구매하기
          </Link>
        ) : soon ? (
          <button type="button" className="sm ghost" onClick={() => toast(NOTIFY_TOAST)}>
            🔔 오픈 알림
          </button>
        ) : (
          <Link href={href} className="btn sm ghost">
            판매 페이지
          </Link>
        )}
        <VerifyLauncher code={c.code} className="sm ghost">
          <CEL /> 인증 확인
        </VerifyLauncher>
      </div>
    </div>
  );
}
