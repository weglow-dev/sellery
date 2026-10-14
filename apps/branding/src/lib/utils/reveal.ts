/** 숫자를 from → to 로 세는 연출 — reduced-motion 이면 바로 최종값을 보여준다. */
function animateCount(el: HTMLElement, to: number) {
	const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const from = Number(el.dataset.countFrom ?? 0);
	if (reduce) {
		el.textContent = to.toLocaleString('ko-KR');
		return;
	}
	const duration = 1400;
	const start = performance.now();
	function tick(now: number) {
		const p = Math.min(1, (now - start) / duration);
		const eased = 1 - Math.pow(1 - p, 3);
		el.textContent = Math.round(from + (to - from) * eased).toLocaleString('ko-KR');
		if (p < 1) requestAnimationFrame(tick);
	}
	requestAnimationFrame(tick);
}

/** [data-reveal] 스크롤 리빌 액션 — 섹션 컴포넌트의 루트에 `use:reveal` 로 붙이면
 *  그 안의 [data-reveal] 요소가 화면에 들어올 때 .revealed 를 붙이고, data-count-to 가 있으면 숫자도 센다. */
export function reveal(node: HTMLElement) {
	const io = new IntersectionObserver(
		(entries) => {
			for (const e of entries) {
				if (!e.isIntersecting) continue;
				const el = e.target as HTMLElement;
				el.classList.add('revealed');
				if (el.dataset.countTo !== undefined) animateCount(el, Number(el.dataset.countTo));
				io.unobserve(el);
			}
		},
		{ threshold: 0.2 }
	);
	for (const el of node.querySelectorAll<HTMLElement>('[data-reveal]')) io.observe(el);
	return { destroy: () => io.disconnect() };
}
