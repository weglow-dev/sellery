<script lang="ts">
	/** 제조의뢰 폼 선택지(제형 · 알약 종류 · 패키지) 앞에 붙는 24px 라인 아이콘.
	 *  stroke 가 currentColor 라 칩이 선택되면(주황 배경·어두운 글자) 아이콘도 같이 색이 바뀐다.
	 *  이름이 표에 없으면 아무것도 그리지 않으므로 ChipGroup 은 모든 옵션에 안심하고 붙일 수 있다. */
	let { name, size = 18 }: { name: string; size?: number } = $props();

	// 고정 문자열만 담는 표 — 사용자 입력이 섞이지 않으므로 {@html} 이 안전하다
	const ICONS: Record<string, string> = {
		// 제형
		알약: '<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M12 8v8"/>',
		// 젤리 병 — 뚜껑 · 병 몸통 · 뚜껑에서 흘러내리는 한 방울 · 바닥에 고인 젤리(물결선)
		젤리:
			'<rect x="5" y="3" width="14" height="4" rx="1.5"/><path d="M6 7v11a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7"/><path d="M12.5 7v3a1.3 1.3 0 1 1-2.6 0"/><path d="M6 15.5c1.5-1 3-1 4.5 0s3 1 4.5 0 2.2-.6 3 0"/>',
		분말: '<circle cx="9" cy="15" r="5"/><path d="M13 11l7-7"/><path d="M7.5 15h.01M10 13.5h.01M10 16.5h.01"/>',
		액상: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
		필름: '<rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M7.5 7v10M12 7v10M16.5 7v10"/>',
		캔디: '<circle cx="12" cy="12" r="4"/><path d="M8 12 4 8v8zM16 12l4-4v8z"/>',
		// 알약 종류
		'타정(딱딱한 정제)': '<circle cx="12" cy="12" r="7"/><path d="M5 12h14"/>',
		'분말 캡슐': '<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M12 8v8"/><path d="M6.5 12h.01M9 10.5h.01M9 13.5h.01"/>',
		연질캡슐: '<ellipse cx="12" cy="12" rx="8" ry="5"/><path d="M8 10.5c1.2-1 2.6-1.3 4-1"/>',
		// 패키지
		// 멀티팩 — 위에 캡슐이 든 뚜껑 칸 + 아래 음료 병이 한 몸인 제품(오쏘몰류) 한 개
		멀티팩:
			'<rect x="7" y="2.5" width="10" height="7" rx="2"/><circle cx="9.9" cy="6" r="1"/><circle cx="14.1" cy="6" r="1"/><path d="M8.5 9.5v10a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2v-10"/><path d="M8.5 14.5h7"/>',
		PTP: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="9.5" r="1.2"/><circle cx="12" cy="9.5" r="1.2"/><circle cx="16" cy="9.5" r="1.2"/><circle cx="8" cy="14.5" r="1.2"/><circle cx="12" cy="14.5" r="1.2"/><circle cx="16" cy="14.5" r="1.2"/>',
		병: '<path d="M9 3h6v3l1.5 1.5V20a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V7.5L9 6z"/><path d="M8 12h8"/>',
		스틱: '<rect x="8" y="3" width="8" height="18" rx="1.5"/><path d="M8 6.5h8M8 17.5h8"/>',
		파우치: '<path d="M6 8h12l1.5 12h-15z"/><path d="M6 8V5h12v3"/><path d="M8.5 11.5h7"/>',
		// 구미 — 앉아 있는 곰 젤리: 머리 밖으로만 그린 두 귀 · 눈 두 점(가는 선) · 아래로 넓어지는 몸통 · 배 옆으로 내려오는 양팔
		구미:
			'<path d="M8.6 6.9a1.9 1.9 0 1 1 1.6-2.7M15.4 6.9a1.9 1.9 0 1 0-1.6-2.7"/><circle cx="12" cy="8.2" r="3.5"/><path d="M10.7 7.9h.01M13.3 7.9h.01" stroke-width="1.3"/><path d="M9.4 11.7h5.2c1.6 0 2.9 1.1 3.1 2.7l.6 4.6a2 2 0 0 1-2 2.3H7.7a2 2 0 0 1-2-2.3l.6-4.6c.2-1.6 1.5-2.7 3.1-2.7z"/><path d="M8.3 14.2c0 1.3.6 2.3 1.7 2.7M15.7 14.2c0 1.3-.6 2.3-1.7 2.7"/>',
		카라멜: '<rect x="8" y="8" width="8" height="8" rx="1"/><path d="M8 10 3 7v10l5-3M16 10l5-3v10l-5-3"/>'
	};

	const markup = $derived(ICONS[name]);
</script>

{#if markup}
	<svg
		aria-hidden="true"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="shrink-0"
	>
		{@html markup}
	</svg>
{/if}
