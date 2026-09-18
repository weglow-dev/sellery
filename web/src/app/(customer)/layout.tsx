import type { Metadata, Viewport } from "next";
import "../globals.css";
import { fontVars } from "@/app/fonts";
import { AppBar } from "@/components/app-bar";
import { SubNav } from "@/components/sub-nav";
import { Footer } from "@/components/footer";
import { ToastHost } from "@/components/toast";
import { displayName, getSessionUser } from "@/lib/auth";

/**
 * 고객 사이트 root layout — 앱의 **첫 번째 root layout** (두 번째는 콘솔 `(partner)/layout.tsx`, docs/inf-console-plan.md 결정 2).
 * 최상위 `app/layout.tsx` 는 없다 — 있으면 콘솔이 이 AppBar·Footer 를 상속하거나 html/body 가 중복된다.
 * 고객 라우트(page · s · c · checkout · account · terms · privacy · login · not-found)는 이 그룹 안에 있고 URL 은 그대로다.
 * 폰트 정의는 `src/app/fonts.ts`(두 root layout 공유).
 */
function siteUrl(): URL {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: "셀러리", template: "%s — 셀러리" },
  description: "인증된 인플루언서가 직접 써 보고 고른 웰니스. 브랜드가 바로 보내고, 결제 대금은 판매 종료 후 21일까지 셀러리가 보관합니다.",
  icons: { icon: "/favicon.svg" },
  openGraph: { siteName: "셀러리", locale: "ko_KR", type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#eef3dc",
  width: "device-width",
  initialScale: 1,
};

/** 네비 persona 용 세션 (app-plan §4.1 "서버 컴포넌트 getUser()"). 세션 조회 실패는 로그아웃 상태로 취급 — 레이아웃이 죽으면 전 페이지가 죽는다. */
async function navUser(): Promise<{ name: string } | null> {
  try {
    const user = await getSessionUser();
    return user ? { name: displayName(user) } : null;
  } catch (e) {
    if (process.env.NODE_ENV !== "production") console.warn("[layout] getSessionUser failed — 로그아웃 상태로 렌더", e);
    return null;
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await navUser();
  return (
    <html lang="ko" className={fontVars}>
      {/* body 에 Tailwind 폰트 스무딩 유틸을 붙이지 않는다 (Windows subpixel AA 유지 — §9.1) */}
      <body>
        <a href="#main" className="skip">
          본문으로 건너뛰기
        </a>
        <AppBar signedIn={user !== null} />
        <SubNav user={user} />
        <main id="main" className="site-main">
          {children}
        </main>
        <Footer />
        <ToastHost />
      </body>
    </html>
  );
}
