"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";

/**
 * 콘솔 하단 탭 (Client Component — 활성 판정에 usePathname). href 는 셸이 `consolePath` 로 만든 최종 상대 경로.
 * `usePathname` 은 브라우저 URL 기준이라 호스트 모드에서는 `/home`, 경로 모드에서는 `/influencer/home` 이 온다 —
 * href 도 같은 기준으로 만들어지므로 그대로 비교한다.
 */
export type ConsoleTabIcon = "home" | "box" | "flag" | "chart" | "user";
export type ConsoleTab = { href: string; label: string; icon: ConsoleTabIcon };

const ICONS: Record<ConsoleTabIcon, ReactElement> = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </svg>
  ),
  box: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
    </svg>
  ),
  flag: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 21V4" />
      <path d="M5 4h13l-3 4.5 3 4.5H5" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h16" />
      <path d="M7 16v-5M12 16V7M17 16v-8" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  ),
};

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ConsoleTabs({ tabs }: { tabs: ConsoleTab[] }) {
  const pathname = usePathname();
  return (
    <nav className="console-tabs" aria-label="콘솔 메뉴">
      {tabs.map((t) => {
        const active = isActive(pathname, t.href);
        return (
          <Link key={t.href} href={t.href} className="console-tab" aria-current={active ? "page" : undefined}>
            {ICONS[t.icon]}
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
