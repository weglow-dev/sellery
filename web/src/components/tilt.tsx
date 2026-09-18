"use client";

/**
 * 상품 누끼 3D 틸트 `.p3d` (프로토타입 js/90-boot.js · ux-spec §1.4). 소유: C.
 *   호스트(`.ph` 또는 `.store-hero` — 가장 가까운 조상)의 mousemove 로 rotateX/Y(±11°) translateZ(14px) scale(1.05)
 *   + drop-shadow 반대 이동, mouseleave 로 초기화. 호스트에 `.tilting` 을 붙여 transition 을 짧게(.06s).
 *   터치·hover 없는 기기(`(hover: none)`)는 무동작. reduced-motion 도 무동작.
 * 렌더는 `<span class="p3d">{children}</span>` 하나 — 호스트 요소는 부모가 만든다 (Link 가 호스트여도 된다).
 */
import { useEffect, useRef, type ReactNode } from "react";

const MAX = 11;

export function Tilt({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window.matchMedia !== "function") return;
    if (window.matchMedia("(hover: none)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const host = el.closest<HTMLElement>(".ph, .store-hero") ?? el.parentElement;
    if (!host) return;

    const reset = () => {
      el.style.transform = "";
      el.style.filter = "";
      host.classList.remove("tilting");
    };
    const onMove = (e: MouseEvent) => {
      const r = host.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const dx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      const dy = ((e.clientY - r.top) / r.height - 0.5) * 2;
      el.style.transform = `perspective(700px) rotateX(${(-dy * MAX).toFixed(2)}deg) rotateY(${(dx * MAX).toFixed(2)}deg) translateZ(14px) scale(1.05)`;
      el.style.filter = `drop-shadow(${(-dx * 10).toFixed(1)}px ${(10 - dy * 6).toFixed(1)}px 8px rgba(28,42,20,.22))`;
      host.classList.add("tilting");
    };
    host.addEventListener("mousemove", onMove);
    host.addEventListener("mouseleave", reset);
    return () => {
      host.removeEventListener("mousemove", onMove);
      host.removeEventListener("mouseleave", reset);
      reset();
    };
  }, []);

  return (
    <span ref={ref} className={className ? `p3d ${className}` : "p3d"}>
      {children}
    </span>
  );
}
