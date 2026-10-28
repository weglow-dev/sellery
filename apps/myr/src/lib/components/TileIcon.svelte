<script lang="ts">
	/** 타일 카드(카테고리 · 제형 · 세부 종류 · 패키지)와 랜딩 카테고리 타일에 들어가는 48px 투톤 아이콘.
	 *  선은 currentColor, 포인트 면은 --color-accent 라 카드 상태와 무관하게 같은 인상을 준다.
	 *  이름이 표에 없으면 아무것도 그리지 않으므로 어떤 옵션에도 안심하고 붙일 수 있다. */
	let { name, size = 36 }: { name: string; size?: number } = $props();

	const A = 'var(--color-accent)';
	const P = 'var(--color-panel)';
	const B = 'var(--color-bg)';

	// 고정 문자열만 담는 표 — 사용자 입력이 섞이지 않으므로 {@html} 이 안전하다
	const ICONS: Record<string, string> = {
		// 카테고리 (퍼널)
		다이어트: `<circle cx="19" cy="23" r="11"/><circle cx="19" cy="23" r="3.5" fill="${A}" stroke="none"/><path d="M19 34h21v-7"/><path d="M26 34v-3M31 34v-3M36 34v-3"/>`,
		피부: `<path d="M22 9c6 8 11 14 11 20a11 11 0 0 1-22 0c0-6 5-12 11-20z" fill="${A}" opacity="0.35" stroke="none"/><path d="M22 9c6 8 11 14 11 20a11 11 0 0 1-22 0c0-6 5-12 11-20z"/><path d="M38 6v8M34 10h8" stroke="${A}"/><path d="M17 30a5 5 0 0 0 5 5"/>`,
		건강: `<path d="M24 39s-14-8-14-18a7.5 7.5 0 0 1 14-3.7A7.5 7.5 0 0 1 38 21c0 10-14 18-14 18z"/><path d="M13 25h7l2.5-5 4 9 2.5-4h6" stroke="${A}"/>`,
		기타: `<rect x="9" y="9" width="12" height="12" rx="3.5"/><rect x="27" y="9" width="12" height="12" rx="3.5" fill="${A}" stroke="none"/><rect x="9" y="27" width="12" height="12" rx="3.5"/><rect x="27" y="27" width="12" height="12" rx="3.5"/>`,
		// 랜딩 카테고리 타일 전용 (이너뷰티 · 멘탈 · 맨즈 — 다이어트는 퍼널과 공유)
		이너뷰티: `<path d="M24 40s-13-8-13-18a7 7 0 0 1 13-3.5A7 7 0 0 1 37 22c0 10-13 18-13 18z" fill="${A}" opacity="0.35" stroke="none"/><path d="M24 40s-13-8-13-18a7 7 0 0 1 13-3.5A7 7 0 0 1 37 22c0 10-13 18-13 18z"/><path d="M38 6v6M35 9h6" stroke="${A}"/><path d="M18 22c0 3 2 5.5 5 6.5"/>`,
		멘탈: `<path d="M36 29a13 13 0 1 1-17-17 10 10 0 0 0 17 17z" fill="${A}" opacity="0.35" stroke="none"/><path d="M36 29a13 13 0 1 1-17-17 10 10 0 0 0 17 17z"/><path d="M33 8v6M30 11h6" stroke="${A}"/><circle cx="39" cy="20" r="1.5" fill="${A}" stroke="none"/>`,
		맨즈: `<circle cx="20" cy="28" r="11"/><circle cx="20" cy="28" r="4" fill="${A}" stroke="none"/><path d="M28 20L40 8" stroke="${A}"/><path d="M31 8h9v9" stroke="${A}"/>`,
		// 제형
		알약: `<g transform="rotate(-40 24 24)"><path d="M24 17h9a7 7 0 0 1 0 14h-9z" fill="${A}" stroke="none"/><rect x="8" y="17" width="32" height="14" rx="7"/><path d="M24 17v14"/></g>`,
		// 젤리 병 — 뚜껑(포인트 면) · 병 몸통 · 흘러내리는 한 방울 · 바닥에 고인 젤리
		젤리: `<g transform="scale(2)" stroke-width="1"><rect x="5" y="3" width="14" height="4" rx="1.5" fill="${A}" stroke="none"/><rect x="5" y="3" width="14" height="4" rx="1.5"/><path d="M6 7v11a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7"/><path d="M12.5 7v3a1.3 1.3 0 1 1-2.6 0"/><path d="M6 15.5c1.5-1 3-1 4.5 0s3 1 4.5 0 2.2-.6 3 0"/></g>`,
		분말: `<path d="M8 37c3.5-8.5 9.5-13 16-13s12.5 4.5 16 13z" fill="${A}" stroke="none"/><path d="M6 37h36"/><circle cx="19" cy="15" r="1.6" fill="currentColor" stroke="none"/><circle cx="27" cy="11" r="1.6" fill="currentColor" stroke="none"/><circle cx="25" cy="18" r="1.6" fill="currentColor" stroke="none"/><circle cx="31" cy="17" r="1.2" fill="currentColor" stroke="none"/>`,
		액상: `<path d="M16 27h16v11a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4z" fill="${A}" stroke="none"/><path d="M20 6h8v7l4 6v19a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V19l4-6z"/><path d="M20 10h8"/>`,
		필름: `<rect x="9" y="15" width="20" height="26" rx="2.5" transform="rotate(-12 19 28)" fill="${A}" opacity="0.4" stroke="none"/><rect x="9" y="15" width="20" height="26" rx="2.5" transform="rotate(-12 19 28)"/><rect x="19" y="7" width="20" height="26" rx="2.5" transform="rotate(8 29 20)" fill="${P}"/><path d="M24 14h9M24 19h7" transform="rotate(8 29 20)"/>`,
		캔디: `<path d="M15 24l-8-6v12z"/><path d="M33 24l8-6v12z"/><circle cx="24" cy="24" r="9" fill="${A}" stroke="none"/><circle cx="24" cy="24" r="9"/><path d="M19 20.5c2.5 2 7.5 5 10 7"/>`,
		// 세부 종류
		타정: `<path d="M10 22v5c0 3.9 6.3 7 14 7s14-3.1 14-7v-5"/><ellipse cx="24" cy="22" rx="14" ry="7" fill="${A}" opacity="0.4" stroke="none"/><ellipse cx="24" cy="22" rx="14" ry="7"/><path d="M17 22h14"/>`,
		'분말 캡슐': `<path d="M24 16h10a8 8 0 0 1 0 16H24z" fill="${A}" stroke="none"/><rect x="6" y="16" width="36" height="16" rx="8"/><path d="M24 16v16"/><circle cx="13" cy="22" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="26" r="1.3" fill="currentColor" stroke="none"/><circle cx="12.5" cy="27" r="1.1" fill="currentColor" stroke="none"/><circle cx="19" cy="20.5" r="1.1" fill="currentColor" stroke="none"/>`,
		연질캡슐: `<ellipse cx="24" cy="24" rx="16" ry="10" transform="rotate(-30 24 24)" fill="${A}" opacity="0.6" stroke="none"/><ellipse cx="24" cy="24" rx="16" ry="10" transform="rotate(-30 24 24)"/><path d="M15 25c1.5-3.5 4.5-6 8.5-7.5"/>`,
		// 구미 — 앉아 있는 곰 젤리: 머리 밖으로만 그린 두 귀 · 눈 두 점 · 아래로 넓어지는 몸통(포인트 면) · 배 옆 양팔
		구미: `<g transform="scale(2)" stroke-width="1"><path d="M8.6 6.9a1.9 1.9 0 1 1 1.6-2.7M15.4 6.9a1.9 1.9 0 1 0-1.6-2.7"/><circle cx="12" cy="8.2" r="3.5"/><path d="M10.7 7.9h.01M13.3 7.9h.01" stroke-width="1.3"/><path d="M9.4 11.7h5.2c1.6 0 2.9 1.1 3.1 2.7l.6 4.6a2 2 0 0 1-2 2.3H7.7a2 2 0 0 1-2-2.3l.6-4.6c.2-1.6 1.5-2.7 3.1-2.7z" fill="${A}" opacity="0.45" stroke="none"/><path d="M9.4 11.7h5.2c1.6 0 2.9 1.1 3.1 2.7l.6 4.6a2 2 0 0 1-2 2.3H7.7a2 2 0 0 1-2-2.3l.6-4.6c.2-1.6 1.5-2.7 3.1-2.7z"/><path d="M8.3 14.2c0 1.3.6 2.3 1.7 2.7M15.7 14.2c0 1.3-.6 2.3-1.7 2.7"/></g>`,
		카라멜: `<path d="M13 17l11-5.5 11 5.5v13l-11 5.5-11-5.5z" fill="${A}" opacity="0.45" stroke="none"/><path d="M13 17l11-5.5 11 5.5v13l-11 5.5-11-5.5z"/><path d="M13 17l11 5.5 11-5.5M24 22.5v13"/>`,
		// 패키지
		// 멀티팩 — 캡슐 두 알이 든 뚜껑 칸(포인트 면) + 아래 음료 병이 한 몸인 제품 한 개
		멀티팩: `<g transform="scale(2)" stroke-width="1"><rect x="7" y="2.5" width="10" height="7" rx="2" fill="${A}" stroke="none"/><circle cx="9.9" cy="6" r="1" stroke="${B}"/><circle cx="14.1" cy="6" r="1" stroke="${B}"/><path d="M8.5 9.5v10a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2v-10"/><path d="M8.5 14.5h7"/></g>`,
		PTP: `<rect x="9" y="7" width="30" height="34" rx="4"/><circle cx="18" cy="15.5" r="3.5"/><circle cx="30" cy="15.5" r="3.5"/><circle cx="18" cy="24" r="3.5"/><circle cx="30" cy="24" r="3.5" fill="${A}" stroke="none"/><circle cx="18" cy="32.5" r="3.5"/><circle cx="30" cy="32.5" r="3.5"/>`,
		병: `<rect x="17" y="5" width="14" height="7" rx="2" fill="${A}" stroke="none"/><rect x="12" y="22" width="24" height="11" fill="${A}" opacity="0.35" stroke="none"/><path d="M15 12h18a3 3 0 0 1 3 3v23a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V15a3 3 0 0 1 3-3z"/>`,
		스틱: `<g transform="rotate(-22 24 24)"><rect x="18" y="5" width="12" height="38" rx="2" fill="${A}" opacity="0.4" stroke="none"/><rect x="18" y="5" width="12" height="38" rx="2"/><path d="M18 10h12M18 38h12"/></g>`,
		파우치: `<path d="M13 9h22l-1.5 29a4 4 0 0 1-4 3.8H18.5a4 4 0 0 1-4-3.8z" fill="${A}" opacity="0.35" stroke="none"/><path d="M13 9h22l-1.5 29a4 4 0 0 1-4 3.8H18.5a4 4 0 0 1-4-3.8z"/><path d="M14 15.5h20" stroke="${A}" stroke-dasharray="2 3"/>`
	};

	const markup = $derived(ICONS[name]);
</script>

{#if markup}
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 48 48"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="shrink-0"
	>
		{@html markup}
	</svg>
{/if}
