import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans_KR } from "next/font/google";

/* ---- 폰트 (app-plan §9.2): Galmuri 픽셀 폰트는 적재하지 않는다 ----
   두 root layout(`(customer)/layout.tsx` · `(partner)/layout.tsx`)과 `global-not-found.tsx` 가 같은 정의를 쓴다.
   next/font 의 IBM Plex Sans KR subsets 는 latin/latin-ext 만 선언 가능 — 한글 unicode-range 조각은
   Google CSS 그대로 전부 self-host 되고, **preload 도 한글 조각까지 전부 실린다**(`next start` 실측:
   `<link rel="preload" as="font">` 329개 — 고객 `/` 와 콘솔 `/login` 동일). 줄이려면 plexKr 에 `preload: false`
   (모노·Archivo 는 유지)를 두고 콘솔·고객 홈에서 FOUT 를 눈으로 확인한 뒤 결정한다. */
export const plexKr = IBM_Plex_Sans_KR({
  weight: ["300", "400", "500", "600", "700"], // 700 이 최대 — 한글 굵기는 font-bold 까지
  subsets: ["latin"],
  variable: "--font-plex-kr",
  display: "swap",
});
export const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});
export const archivo = Archivo({
  weight: "variable", // 500~900 을 한 파일로 (wght 축)
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

/** `<html className>` 에 붙이는 CSS 변수 클래스 3개 */
export const fontVars = `${plexKr.variable} ${plexMono.variable} ${archivo.variable}`;
