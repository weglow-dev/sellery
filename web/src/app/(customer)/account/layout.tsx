/** /account/** — 본인 주문·계정 화면. 검색 노출 금지 (app-plan §2 · robots.ts 와 이중). 소유: F. */
export const metadata = { robots: { index: false, follow: false } };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
