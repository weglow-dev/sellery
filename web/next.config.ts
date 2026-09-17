import type { NextConfig } from "next";

/**
 * 도메인 이전(sellery.life → sellery-app) 시 프로토타입 경로 리다이렉트를 여기(`redirects()`)에 둔다 (docs/app-plan.md §13).
 */
const nextConfig: NextConfig = {
  /* 로컬 호스트 모드 검증(docs/inf-console-plan.md §2.2): `.env.local` 에 `NEXT_PUBLIC_INF_HOST=inf.localhost:3000` 을
     두고 http://inf.localhost:3000 으로 연다. dev 서버는 기동 호스트(localhost) 밖 오리진의 dev 자산 요청을 막으므로
     허용 목록에 넣는다 (node_modules/next/dist/docs/.../allowedDevOrigins.md). */
  allowedDevOrigins: ["inf.localhost"],
  experimental: {
    /* root layout 이 둘((customer) · (partner))이라 매치되지 않는 URL 의 404 는 `src/app/global-not-found.tsx` 가
       html/body 째로 렌더한다 (node_modules/next/dist/docs/.../not-found.md "global-not-found.js"). 이 플래그가 없으면
       Next 가 빈 기본 레이아웃으로 영문 404 를 낸다. */
    globalNotFound: true,
  },
};

export default nextConfig;
