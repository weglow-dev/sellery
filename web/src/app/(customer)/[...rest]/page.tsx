import { notFound } from "next/navigation";

/**
 * 고객 사이트의 미매치 경로를 고객 root layout(AppBar · Footer) 안의 `(customer)/not-found.tsx` 로 보낸다.
 * root layout 이 둘이 된 뒤(inf-console-plan 결정 2) 앱 전체의 미매치 URL 은 셸 없는 `global-not-found.tsx` 가 받으므로,
 * 이 catch-all 이 없으면 `/없는경로` 가 헤더·푸터 없는 404 로 바뀐다(회귀). 정적 라우트·`(partner)/influencer/**` 가
 * 더 구체적이라 먼저 매치되고, 나머지만 여기로 온다.
 */
export const dynamic = "force-dynamic";

export default function CustomerCatchAll() {
  notFound();
}
