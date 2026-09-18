import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { consolePath } from "@/lib/hosts";

/**
 * 콘솔 루트 — inf 호스트의 `/` 가 `/influencer` 로 리라이트돼 여기 착지한다 (docs/inf-console-plan.md §2.1).
 * 로그인 상태면 홈으로. 미로그인은 proxy(규칙 5)가 이미 `/login?next=/` 로 보냈다.
 * 요청 host 기준 `consolePath` — 호스트 모드 `/home`, 경로 모드(`*.vercel.app`·Preview·로컬) `/influencer/home`.
 */
export const dynamic = "force-dynamic";

export default async function InfluencerRootPage() {
  const host = (await headers()).get("host");
  redirect(consolePath("seller", "/home", host));
}
