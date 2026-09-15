"use client";

/**
 * 서브내비 (ux-spec §2.2): `진행 중인 판매`(/) · `내 주문`(/account/orders, 로그인 시만) · 우측 persona.
 * 슬라이스 1 은 `인플루언서` · `장바구니` · `셀러리 소개` 항목 없음.
 * `.on` = 현재 경로 (링크 페이지 /s/… 에서는 아무것도 on 아님). 경로는 usePathname 으로 — 레이아웃은 pathname 을 못 읽는다.
 * persona: 로그아웃 상태 [카카오 로그인] → /login?next={현재 경로} · 로그인 상태 [kv-av] **{name}**님 [로그아웃](B 의 SignOutButton).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/app/account/sign-out-button";
import { KAKAO_ICON } from "@/components/icons";

export type NavUser = { name: string } | null;

type Tab = { href: string; label: string };

function isOn(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function SubNav({ user }: { user: NavUser }) {
  const pathname = usePathname() || "/";
  const tabs: Tab[] = [{ href: "/", label: "진행 중인 판매" }];
  if (user) tabs.push({ href: "/account/orders", label: "내 주문" });
  const initial = (user?.name || "고객").slice(0, 1);

  return (
    <nav className="subnav" aria-label="주요 메뉴">
      {tabs.map((t) => {
        const on = isOn(pathname, t.href);
        return (
          <Link key={t.href} href={t.href} className={on ? "tab on" : "tab"} aria-current={on ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
      <div className="persona">
        {user ? (
          <>
            <span className="kv-av" aria-hidden="true">
              {initial}
            </span>
            <span className="who">
              <b>{user.name}</b>님
            </span>
            <SignOutButton className="sm ghost" />
          </>
        ) : (
          <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="btn sm kakao">
            <KAKAO_ICON /> 카카오 로그인
          </Link>
        )}
      </div>
    </nav>
  );
}
