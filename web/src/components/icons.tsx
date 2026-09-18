/**
 * 아이콘 · 로고 SVG — 프로토타입 js/02-state.js 의 문자열을 그대로 React 로 옮김. 소유: A (app-plan §9.3).
 *   LOGO_ICON (28×32 셀러리 잎, 워드마크 전용) · CEL (15×17 인라인 셀러리) · KAKAO_ICON (16×16)
 *   PLAT_ICONS {instagram, youtube, naver, tiktok} · GICON (등급 7종 방패) · USER_ICON (마이페이지)
 * 이름은 프로토타입 상수명을 유지한다 (대문자라 JSX 컴포넌트로 바로 쓸 수 있다).
 */
import type { ReactElement, SVGProps } from "react";

type SvgProps = SVGProps<SVGSVGElement>;

/* 셀러리 잎 본체 — LOGO_ICON · CEL · 파비콘(public/favicon.svg) 이 같은 path 를 공유한다 */
const CELERY_PATHS = (
  <>
    <ellipse cx="7" cy="9" rx="4.6" ry="5.4" fill="#7cc142" transform="rotate(-28 7 9)" />
    <ellipse cx="21" cy="9" rx="4.6" ry="5.4" fill="#7cc142" transform="rotate(28 21 9)" />
    <ellipse cx="14" cy="7.4" rx="5.4" ry="6.2" fill="#93d64f" />
    <path d="M14 3.6v7.2M6.6 6.2l1.8 5.2M21.4 6.2l-1.8 5.2" stroke="#3f7a24" strokeWidth="1.2" />
    <path d="M7.2 13h4.6v12.6a2.3 2.3 0 0 1-4.6 0z" fill="#d6ecad" />
    <path d="M16.2 13h4.6v12.6a2.3 2.3 0 0 1-4.6 0z" fill="#d6ecad" />
    <path d="M11.7 12.4h4.6v15a2.3 2.3 0 0 1-4.6 0z" fill="#eaf6cf" />
    <path d="M9.5 15.5v8.5M14 15v11M18.5 15.5v8.5" stroke="#b5dc85" strokeWidth="1.2" />
  </>
);

/** 로고 전용 일러스트 셀러리 (28×32). 크기·회전은 CSS `.celogo` 가 정한다 (워드마크 −14°). */
export function LOGO_ICON({ className = "celogo", ...props }: SvgProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 28 32"
      aria-hidden="true"
      fill="none"
      stroke="#2f5a1a"
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
      {...props}
    >
      {CELERY_PATHS}
    </svg>
  );
}

/** 인라인 셀러리 (15×17) — 인증 띠 · "인증 확인" · 푸터 · hero `ey` 앞. */
export function CEL({ className = "celic", ...props }: SvgProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 28 32"
      width="15"
      height="17"
      role="img"
      aria-label="셀러리"
      fill="none"
      stroke="#2f5a1a"
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
      {...props}
    >
      {CELERY_PATHS}
    </svg>
  );
}

/** 카카오 말풍선 (16×16, #191919). */
export function KAKAO_ICON({ className = "kico", ...props }: SvgProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
      <path
        fill="#191919"
        d="M12 3C6.5 3 2 6.4 2 10.6c0 2.7 1.8 5 4.5 6.4l-1 3.6c-.1.3.3.6.5.4l4.3-2.9c.6.1 1.1.1 1.7.1 5.5 0 10-3.4 10-7.6S17.5 3 12 3z"
      />
    </svg>
  );
}

/** 마이페이지 사람 아이콘 (index.html `.iconbtn`). */
export function USER_ICON(props: SvgProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
    </svg>
  );
}

/* ---------------- 플랫폼 아이콘 ---------------- */

export type Platform = "instagram" | "youtube" | "naver" | "tiktok";

export const PLATFORM_NAMES: Record<Platform, string> = {
  instagram: "인스타그램",
  youtube: "유튜브",
  naver: "네이버 블로그",
  tiktok: "틱톡",
};

export const PLAT_ICONS: Record<Platform, (props: SvgProps) => ReactElement> = {
  instagram: (props) => (
    <svg className="plic" viewBox="0 0 24 24" width="14" height="14" role="img" aria-label="Instagram" {...props}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="#C13584" strokeWidth="2.4" />
      <circle cx="12" cy="12" r="4.4" fill="none" stroke="#C13584" strokeWidth="2.4" />
      <circle cx="17.6" cy="6.4" r="1.5" fill="#C13584" />
    </svg>
  ),
  youtube: (props) => (
    <svg className="plic" viewBox="0 0 24 24" width="15" height="15" role="img" aria-label="YouTube" {...props}>
      <rect x="1.5" y="5" width="21" height="14" rx="4" fill="#FF0000" />
      <path d="M10 9.3v5.4l4.8-2.7z" fill="#fff" />
    </svg>
  ),
  naver: (props) => (
    <svg className="plic" viewBox="0 0 24 24" width="13" height="13" role="img" aria-label="Naver Blog" {...props}>
      <rect width="24" height="24" rx="4" fill="#03C75A" />
      <path d="M6.5 5.5h3.6l3.3 5V5.5h4.1v13h-3.6l-3.3-5v5H6.5z" fill="#fff" />
    </svg>
  ),
  tiktok: (props) => (
    <svg className="plic" viewBox="0 0 24 24" width="13" height="13" role="img" aria-label="TikTok" {...props}>
      <path
        d="M15.2 2c.4 2.4 1.9 4 4.3 4.3v3.2c-1.7 0-3.2-.5-4.3-1.4v6.9a5.8 5.8 0 11-5.8-5.8c.4 0 .7 0 1.1.1v3.3a2.6 2.6 0 101.6 2.4V2h3.1z"
        fill="#191919"
      />
    </svg>
  ),
};

export function isPlatform(p: string | null | undefined): p is Platform {
  return p === "instagram" || p === "youtube" || p === "naver" || p === "tiktok";
}

/** `seller.platform` / `channels[].platform` 문자열로 아이콘 — 모르는 값이면 null. */
export function PlatIcon({ platform, ...props }: { platform: string | null | undefined } & SvgProps) {
  if (!isPlatform(platform)) return null;
  const Icon = PLAT_ICONS[platform];
  return <Icon {...props} />;
}

/* ---------------- 등급 아이콘 (방패 → 셰브런 → 별 → 날개 → 왕관) ---------------- */

export const GRADE_NAMES = ["스타터", "브론즈", "실버", "골드", "플래티넘", "다이아", "블랙"] as const;
export type GradeName = (typeof GRADE_NAMES)[number];

function Shield({ fill }: { fill: string }) {
  return (
    <path
      d="M10 1.3 14.2 2.9v3.9c0 2.6-1.7 4.4-4.2 5.3-2.5-.9-4.2-2.7-4.2-5.3V2.9z"
      fill={fill}
      stroke="#141414"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  );
}
function Star({ fill }: { fill: string }) {
  return <path d="M10 3.9 10.8 5.7 12.7 5.9 11.3 7.2 11.7 9.1 10 8.1 8.3 9.1 8.7 7.2 7.3 5.9 9.2 5.7z" fill={fill} />;
}
const WING2 = (
  <path d="M5.2 4.8H2.6M5.2 6.9H3.6M14.8 4.8h2.6M14.8 6.9h1.6" stroke="#141414" strokeWidth="1.3" strokeLinecap="round" />
);
const WING3 = (
  <path
    d="M5.2 4.2H1.6M5.2 6.2H2.6M5.2 8.2H3.6M14.8 4.2h3.6M14.8 6.2h2.6M14.8 8.2h1.6"
    stroke="#141414"
    strokeWidth="1.3"
    strokeLinecap="round"
  />
);
const CROWN = (
  <path d="M7.6 1 8.7-.9 10 .7 11.3-.9 12.4 1z" fill="#f7df3e" stroke="#141414" strokeWidth=".9" strokeLinejoin="round" />
);

function gsvg(inner: ReactElement, props: SvgProps) {
  return (
    <svg className="gi" viewBox="0 -2 20 16" width="17" height="13.6" aria-hidden="true" {...props}>
      {inner}
    </svg>
  );
}

export const GICON: Record<GradeName, (props: SvgProps) => ReactElement> = {
  스타터: (p) => gsvg(<Shield fill="#e6e3d2" />, p),
  브론즈: (p) =>
    gsvg(
      <>
        <Shield fill="#cd8f5a" />
        <path d="M8.2 5.6 10 7.1 11.8 5.6" fill="none" stroke="#141414" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </>,
      p,
    ),
  실버: (p) =>
    gsvg(
      <>
        <Shield fill="#cdd2da" />
        <path
          d="M8.2 4.6 10 6.1 11.8 4.6M8.2 6.8 10 8.3 11.8 6.8"
          fill="none"
          stroke="#141414"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>,
      p,
    ),
  골드: (p) =>
    gsvg(
      <>
        <Shield fill="#f2a91d" />
        <Star fill="#fff" />
      </>,
      p,
    ),
  플래티넘: (p) =>
    gsvg(
      <>
        {WING2}
        <Shield fill="#9fd8d3" />
        <Star fill="#141414" />
      </>,
      p,
    ),
  다이아: (p) =>
    gsvg(
      <>
        {WING3}
        <Shield fill="#a9c6ff" />
        <path d="M10 3.7 12 6.2 10 8.7 8 6.2z" fill="#fff" stroke="#141414" strokeWidth=".7" />
      </>,
      p,
    ),
  블랙: (p) =>
    gsvg(
      <>
        {WING3}
        {CROWN}
        <Shield fill="#17150f" />
        <Star fill="#f7df3e" />
      </>,
      p,
    ),
};

export function isGradeName(g: string | null | undefined): g is GradeName {
  return (GRADE_NAMES as readonly string[]).includes(g ?? "");
}

/** RPC `seller.grade` / `brand.grade` 문자열로 등급 아이콘 — 모르는 값이면 null. */
export function GradeIcon({ grade, ...props }: { grade: string | null | undefined } & SvgProps) {
  if (!isGradeName(grade)) return null;
  const Icon = GICON[grade];
  return <Icon {...props} />;
}
