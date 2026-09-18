import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { consolePath } from "@/lib/hosts";
import { NewPasswordForm } from "./new-password-form";

/**
 * 새 비밀번호 — /auth/confirm(type=recovery · invite) 이 세션을 만든 뒤 착지 (docs/inf-console-plan.md §4.1 · §4.7).
 * 공개 경로지만 세션이 있어야 `updateUser({ password })` 가 된다 — 없으면 재요청 안내. 게이트(`requireSeller`)는 두지 않는다:
 * 초대 계정은 /auth/confirm 이 시드 행에 연결한 뒤 여기서 비밀번호를 정하고 /home 으로 간다.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "새 비밀번호" };

export default async function NewPasswordPage() {
  const host = (await headers()).get("host");
  const user = await getSessionUser();

  return (
    <div className="console-auth">
      <section className="card static">
        <div className="lbl-sm">인플루언서 콘솔</div>
        <h2 className="console-title">새 비밀번호 설정</h2>
        {user ? (
          <>
            <p className="meta">
              <b>{user.email ?? "내 계정"}</b> 의 비밀번호를 새로 정합니다. 영문과 숫자를 포함해 8자 이상.
            </p>
            <NewPasswordForm homePath={consolePath("seller", "/home", host)} />
          </>
        ) : (
          <>
            <p className="meta">링크가 만료됐거나 세션이 없어요. 재설정 메일을 다시 요청해주세요 — 링크는 받은 뒤 1시간 안에 열어야 합니다.</p>
            <div className="btnrow" style={{ marginTop: 14 }}>
              <Link href={consolePath("seller", "/password", host)} className="btn pri sm">
                재설정 메일 다시 받기
              </Link>
              <Link href={consolePath("seller", "/login", host)} className="btn ghost sm">
                로그인으로
              </Link>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
