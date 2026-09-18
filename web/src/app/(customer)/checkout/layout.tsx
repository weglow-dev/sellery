/** /checkout* — 색인 제외 (app-plan §2 · reuse-map §4-14). 소유: D. */
export const metadata = { robots: { index: false, follow: false } };

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
