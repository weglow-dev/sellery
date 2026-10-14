<script lang="ts">
	import { onMount } from 'svelte';

	/** 커서를 따라 점·선이 이어지는 컨스텔레이션 데코.
	 *  데코 컨테이너가 pointer-events-none 이어도 동작하도록 포인터는 window 에서 받는다. */
	let {
		count = 34,
		color = '#E9B458',
		linkRadius = 110,
		dotLinkDist = 90
	}: { count?: number; color?: string; linkRadius?: number; dotLinkDist?: number } = $props();

	const SIZE = 420; // viewBox 크기

	let svgEl = $state<SVGSVGElement>();

	onMount(() => {
		const svg = svgEl;
		if (!svg) return;

		const NS = 'http://www.w3.org/2000/svg';
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		const lineGroup = document.createElementNS(NS, 'g');
		svg.appendChild(lineGroup);

		type Dot = {
			el: SVGCircleElement;
			bx: number;
			by: number;
			x: number;
			y: number;
			phase: number;
			amp: number;
			speed: number;
		};
		const dots: Dot[] = [];
		for (let i = 0; i < count; i++) {
			const bx = 25 + Math.random() * (SIZE - 50);
			const by = 25 + Math.random() * (SIZE - 50);
			const el = document.createElementNS(NS, 'circle');
			el.setAttribute('r', (2 + Math.random() * 2).toFixed(1));
			el.setAttribute('fill', color);
			el.setAttribute('fill-opacity', '0.7');
			svg.appendChild(el);
			dots.push({
				el,
				bx,
				by,
				x: bx,
				y: by,
				phase: Math.random() * Math.PI * 2,
				amp: 5 + Math.random() * 8,
				speed: 0.3 + Math.random() * 0.4
			});
		}

		// 움직임 최소화 설정이면 점만 제자리에 그리고 끝낸다
		if (reduced) {
			for (const d of dots) {
				d.el.setAttribute('cx', d.bx.toFixed(1));
				d.el.setAttribute('cy', d.by.toFixed(1));
			}
			return;
		}

		let mouse = { x: -9999, y: -9999 };
		const onMove = (e: PointerEvent) => {
			const r = svg.getBoundingClientRect();
			mouse = {
				x: ((e.clientX - r.left) / r.width) * SIZE,
				y: ((e.clientY - r.top) / r.height) * SIZE
			};
		};
		window.addEventListener('pointermove', onMove);

		let raf: number;
		const t0 = performance.now();

		const tick = (now: number) => {
			const t = (now - t0) / 1000;

			// 점 부유
			for (const d of dots) {
				d.x = d.bx + Math.cos(t * d.speed + d.phase) * d.amp;
				d.y = d.by + Math.sin(t * d.speed * 0.9 + d.phase) * d.amp;
				d.el.setAttribute('cx', d.x.toFixed(1));
				d.el.setAttribute('cy', d.y.toFixed(1));
			}

			// 선 다시 그리기
			while (lineGroup.firstChild) lineGroup.removeChild(lineGroup.firstChild);
			const R = linkRadius;

			for (let i = 0; i < dots.length; i++) {
				const a = dots[i];
				const dist = Math.hypot(a.x - mouse.x, a.y - mouse.y);
				if (dist >= R) continue;

				// 커서 ↔ 점
				const ln = document.createElementNS(NS, 'line');
				ln.setAttribute('x1', String(a.x));
				ln.setAttribute('y1', String(a.y));
				ln.setAttribute('x2', String(mouse.x));
				ln.setAttribute('y2', String(mouse.y));
				ln.setAttribute('stroke', color);
				ln.setAttribute('stroke-width', '1');
				ln.setAttribute('stroke-opacity', ((1 - dist / R) * 0.6).toFixed(2));
				lineGroup.appendChild(ln);

				// 커서 근처 점 ↔ 점
				for (let k = i + 1; k < dots.length; k++) {
					const b = dots[k];
					if (Math.hypot(b.x - mouse.x, b.y - mouse.y) >= R) continue;
					const ab = Math.hypot(a.x - b.x, a.y - b.y);
					if (ab < dotLinkDist) {
						const l2 = document.createElementNS(NS, 'line');
						l2.setAttribute('x1', String(a.x));
						l2.setAttribute('y1', String(a.y));
						l2.setAttribute('x2', String(b.x));
						l2.setAttribute('y2', String(b.y));
						l2.setAttribute('stroke', color);
						l2.setAttribute('stroke-width', '0.8');
						l2.setAttribute('stroke-opacity', ((1 - ab / dotLinkDist) * 0.35).toFixed(2));
						lineGroup.appendChild(l2);
					}
				}
			}

			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('pointermove', onMove);
		};
	});
</script>

<svg bind:this={svgEl} viewBox="0 0 {SIZE} {SIZE}" aria-hidden="true" class="block h-auto w-full"></svg>
