import { Wordmark } from "@/components/wordmark";
import { GradeBox } from "@/components/grade-box";
import { consolePath, type ConsoleRole } from "@/lib/hosts";
import { ConsoleTabs, type ConsoleTab } from "./console-tabs";

/**
 * 파트너 콘솔 셸 (docs/inf-console-plan.md §2.1 partner-shell): 상단 바(워드마크 + 콘솔 라벨 + 우측 활동명·등급·🥬·로그아웃) ·
 * 본문 · 모바일 하단 탭 5개. role 별 탭 목록을 여기서 고르고, href 는 요청 host 기준 `consolePath` 로 만든다
 * (호스트 모드 `/home`, 경로 모드 `/influencer/home`). 스타일은 globals.css `.console-*` (@layer components).
 *
 * 우측 자리(`.console-bar-right`)는 layout 이 `getSellerContext()`(DB 게이트 아님 — 표시용) 로 채운 `me` 를 받는다. 세션이 없거나
 * 행이 없으면 비워 둔다(공개 페이지). 로그아웃은 고객 사이트와 같은 `POST /auth/signout`(303 → 콘솔 로그인, auth/signout/route.ts).
 * 게이트는 셸이 아니라 각 page 의 `requireSeller()` 다(결정 6).
 */
const ROLE_LABEL: Record<ConsoleRole, string> = {
  seller: "인플루언서 콘솔",
  brand: "브랜드 콘솔",
};

/* 탭 href 는 접두 없는 콘솔 경로. 아직 없는 페이지(상품·캠페인·매출)도 disabled 로 두지 않고 링크를 유지한다 —
   3·5단계에서 페이지가 생기면 그대로 살아나고, 그 전에는 콘솔 404(`influencer/not-found.tsx`)가 떠도 괜찮다. */
const TABS: Record<ConsoleRole, ConsoleTab[]> = {
  seller: [
    { href: "/home", label: "홈", icon: "home" },
    { href: "/products", label: "상품", icon: "box" },
    { href: "/campaigns", label: "캠페인", icon: "flag" },
    { href: "/sales", label: "매출", icon: "chart" },
    { href: "/my", label: "내 정보", icon: "user" },
  ],
  // 브랜드 콘솔 때 확정(inf-console-plan §9) — 지금은 인플루언서와 같은 골격
  brand: [
    { href: "/home", label: "홈", icon: "home" },
    { href: "/products", label: "상품", icon: "box" },
    { href: "/campaigns", label: "캠페인", icon: "flag" },
    { href: "/sales", label: "매출", icon: "chart" },
    { href: "/my", label: "내 정보", icon: "user" },
  ],
};

/** 상단 바 우측 표시값 — 세션·행이 있을 때만 (suspended 는 이름만, 잔액 없음) */
export type ShellMe = { name: string; grade: string | null; balance: number | null };

export function PartnerShell({
  role,
  host,
  me,
  children,
}: {
  role: ConsoleRole;
  /** 요청 Host 헤더 — `consolePath` 의 호스트/경로 모드 판정에 쓴다 */
  host: string | null;
  me?: ShellMe | null;
  children: React.ReactNode;
}) {
  const tabs = TABS[role].map((t) => ({ ...t, href: consolePath(role, t.href, host) }));
  return (
    <>
      <a href="#main" className="skip">
        본문으로 건너뛰기
      </a>
      <header className="console-bar">
        <Wordmark href={consolePath(role, "/home", host)} />
        <span className="console-label">{ROLE_LABEL[role]}</span>
        <div className="console-bar-right">
          {me ? (
            <div className="console-me">
              <span className="nm" title={me.name}>
                {me.name}
              </span>
              <GradeBox grade={me.grade} sm />
              {me.balance !== null && (
                <span className="cel" title="셀러리 포인트 잔액">
                  🥬 {me.balance}
                </span>
              )}
              <form method="post" action="/auth/signout">
                <button type="submit" className="ghost sm" aria-label="로그아웃">
                  로그아웃
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </header>
      <main id="main" className="console-main">
        {children}
      </main>
      <ConsoleTabs tabs={tabs} />
    </>
  );
}
