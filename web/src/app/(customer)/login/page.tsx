import { redirect } from "next/navigation";
import { getSessionUser, safeNext } from "@/lib/auth";
import { LoginClient } from "./login-client";

/**
 * /login — 카카오 로그인 (app-plan §4.1 · ux-spec §3.3).
 * 서버에서 먼저 `next` 를 safeNext 로 정규화하고, 이미 로그인이면 즉시 그곳으로 보낸다
 * (`/login?next=https://evil` 은 `/` 로). 폼·OAuth 시작은 클라이언트 컴포넌트.
 */
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next));

  const user = await getSessionUser();
  if (user) redirect(next);

  return <LoginClient next={next} authError={first(sp.error) === "auth"} />;
}
