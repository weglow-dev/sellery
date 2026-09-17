import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans_KR } from "next/font/google";
import "./globals.css";
import { AppBar } from "@/components/app-bar";
import { SubNav } from "@/components/sub-nav";
import { Footer } from "@/components/footer";
import { ToastHost } from "@/components/toast";
import { displayName, getSessionUser } from "@/lib/auth";

/* ---- 폰트 (app-plan §9.2): Galmuri 픽셀 폰트는 적재하지 않는다 ----
   next/font 의 IBM Plex Sans KR subsets 는 latin/latin-ext 만 선언 가능 — 한글 unicode-range 조각은
   Google CSS 그대로 전부 self-host 되고, preload 만 latin 이다. */
const plexKr = IBM_Plex_Sans_KR({
  weight: ["300", "400", "500", "600", "700"], // 700 이 최대 — 한글 굵기는 font-bold 까지
  subsets: ["latin"],
  variable: "--font-plex-kr",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});
const archivo = Archivo({
  weight: "variable", // 500~900 을 한 파일로 (wght 축)
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

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
    <html lang="ko" className={`${plexKr.variable} ${plexMono.variable} ${archivo.variable}`}>
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
