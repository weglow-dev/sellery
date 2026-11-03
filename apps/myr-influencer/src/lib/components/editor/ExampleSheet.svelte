<script lang="ts">
	import type { Snippet } from 'svelte';
	import { STEP_NAMES } from '$lib/rules';
	import Icon from '../Icon.svelte';

	/** 에디터 [예시] 바텀시트 — 완성된 상세페이지 예시(소이 비오틴 캡슐)에서 지금 쓰는 단계 섹션을 강조하고 그 자리로 스크롤한다.
	 *  예시 내용은 디자인 고정 문구다(실제 상품이 아니다). */
	let { step, onclose }: { step: number; onclose: () => void } = $props();

	let scroller: HTMLDivElement | undefined = $state();
	let first = true;
	$effect(() => {
		const el = scroller?.querySelector<HTMLElement>(`[data-ex="${step}"]`);
		if (!scroller || !el) return;
		scroller.scrollTo({ top: Math.max(0, el.offsetTop - 12), behavior: first ? 'auto' : 'smooth' });
		first = false;
	});

	const INGREDIENTS = [
		['비오틴 5000㎍', '핵심 기능성 성분이에요', '주성분'],
		['맥주효모', '흡수와 효과를 돕는 보조 성분이에요', '보조'],
		['케라틴', '매일 필요한 기본 영양소예요', '기본'],
		['아연', '안정성과 밸런스를 위해 넣었어요', '밸런스']
	];
	const STEPS = [
		['01', '하루 한 번', '하루 1캡슐을 물과 함께 드세요.'],
		['02', '꾸준히', '최소 4주 이상 루틴으로 이어가 주세요.'],
		['03', '보관', '직사광선을 피해 서늘한 곳에 보관하세요.']
	];
	const INFO = [
		['제품명', '소이 비오틴 캡슐'],
		['제형 / 포장', '알약 / PTP'],
		['내용량', '60캡슐 / 2개월'],
		['제조', 'MYR 파트너 제조시설 (식약처 인증)'],
		['유통기한', '제조일로부터 24개월'],
		['보관', '직사광선을 피해 서늘한 곳']
	];
	const FAQ = [
		['언제 먹는 게 좋아요?', '하루 1캡슐을 물과 함께 드세요.'],
		['다른 영양제와 같이 먹어도 되나요?', '네, 일반적인 영양제와 함께 드셔도 괜찮아요. 복용 중인 약이 있다면 전문가와 상의하세요.'],
		['하루 두 알 먹어도 되나요?', '1일 1정을 권장해요. 그 이상은 효과가 커지지 않아요.']
	];

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window {onkeydown} />

{#snippet section(n: number, tag: string, body: Snippet)}
	{@const on = step === n}
	<div data-ex={n} class="relative mt-3.5 rounded-[18px] border-[1.5px] p-3.5 transition-colors duration-300 {on ? 'border-accent bg-accent/7' : 'border-white/6 bg-transparent'}">
		<span class="absolute -top-[9px] left-3 rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-[0.02em] {on ? 'bg-accent text-bg' : 'bg-white/8 text-white/55'}">{tag}</span>
		{@render body()}
	</div>
{/snippet}

<div class="absolute inset-0 z-30 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="완성된 상세페이지 예시">
	<button type="button" class="absolute inset-0 bg-black/62" aria-label="닫기" onclick={onclose}></button>
	<div class="relative flex h-[90%] animate-up-in flex-col rounded-t-[28px] border-t border-white/12 bg-[#0d0e12]">
		<div class="flex shrink-0 justify-center pt-2"><span class="h-1 w-10 rounded-sm bg-white/20"></span></div>
		<div class="flex shrink-0 items-center gap-2.5 px-5 py-3">
			<span class="rounded-lg bg-accent/14 px-[9px] py-[5px] text-[11px] font-extrabold tracking-[0.06em] text-accent">예시</span>
			<div class="min-w-0 flex-1">
				<p class="text-[15px] font-extrabold">완성된 상세페이지</p>
				<p class="mt-0.5 text-[12px] text-white/55">지금 작성 중 · <b class="font-bold text-accent">{STEP_NAMES[step - 1]}</b></p>
			</div>
			<button type="button" onclick={onclose} aria-label="닫기" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/6 text-fg">
				<Icon id="x" size={18} sw={2.2} />
			</button>
		</div>

		<div bind:this={scroller} class="no-bar relative min-h-0 flex-1 overflow-y-auto px-5 pt-1.5 pb-12">
			<p class="mb-2.5 text-[11px] text-white/45">홈 / 헤어 &amp; 바디 / 소이 비오틴 캡슐</p>

			{#snippet s1()}
				<div class="relative flex aspect-[16/10] items-center justify-center rounded-2xl text-white/95" style="background:linear-gradient(145deg,#FFF0A8,#E6C04A)">
					<Icon id="pill" set="tile" size={84} />
					<div class="absolute bottom-2.5 left-2.5 flex gap-[5px]">
						{#each ['캡슐', 'PTP', '2개월분'] as c (c)}<span class="rounded-full bg-bg/55 px-[9px] py-1 text-[10px] font-bold">{c}</span>{/each}
					</div>
				</div>
				<div class="mt-3 flex items-center gap-2">
					<span class="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#F5D58E] text-[10px] font-extrabold text-bg">소</span>
					<span class="text-[12px] font-bold">소이 클린 <span class="font-medium text-white/45">@soy.clean</span></span>
				</div>
				<p class="mt-2 text-[20px] font-extrabold tracking-[-0.03em]">소이 비오틴 캡슐</p>
				<p class="mt-1.5 text-[18px] font-extrabold">₩24,000 <span class="text-[11px] font-medium text-white/45">60캡슐 / 2개월</span></p>
			{/snippet}
			{@render section(1, '01 기본 정보 · 구매 패널', s1)}

			{#snippet s2()}
				<div class="rounded-3xl border border-accent/18 bg-accent/7 px-5 pt-[22px] pb-6">
					<p class="text-[12px] font-bold tracking-[0.01em] text-accent">소이 클린의 레시피 노트</p>
					<p class="mt-3.5 text-[15px] leading-[1.7] font-medium text-pretty">"한 알로 끝내고 싶은 사람을 위한 가장 심플한 구성. 대신 함량은 타협 안 했어요."</p>
				</div>
			{/snippet}
			{@render section(2, '02 레시피 노트', s2)}

			{#snippet s3()}
				<p class="text-[10px] font-bold tracking-[0.08em] text-accent">01 · 왜 만들었나요</p>
				<p class="mt-1.5 text-[17px] font-extrabold tracking-[-0.02em]">매일 챙기기 쉬운 것만 남겼어요</p>
				<p class="mt-2 text-[12px] leading-[1.7] text-white/68">제가 직접 매일 먹고 바르는 것 중에서 꼭 필요한 것만 골랐어요. 성분은 단순하게, 함량은 타협 없이. 팔로워분들이 "이건 뭐예요?" 물어보던 질문에 제품으로 답한 거예요.</p>
			{/snippet}
			{@render section(3, '03 왜 만들었나요', s3)}

			{#snippet s4()}
				<p class="text-[10px] font-bold tracking-[0.08em] text-accent">02 · 무엇이 들어있나요</p>
				<p class="mt-1.5 mb-2.5 text-[17px] font-extrabold tracking-[-0.02em]">성분표에 모르는 이름이 없게</p>
				<div class="overflow-hidden rounded-[14px] border border-white/8">
					{#each INGREDIENTS as [name, why, tag], i (name)}
						<div class="grid grid-cols-[1.1fr_1.6fr_auto] items-center gap-2.5 bg-white/2 px-3 py-2.5 {i ? 'border-t border-white/7' : ''}">
							<span class="text-[12px] font-bold">{name}</span>
							<span class="text-[11px] text-white/55">{why}</span>
							<span class="text-[11px] font-bold whitespace-nowrap text-accent">{tag}</span>
						</div>
					{/each}
				</div>
			{/snippet}
			{@render section(4, '04 성분', s4)}

			{#snippet s5()}
				<p class="mb-2.5 text-[10px] font-bold tracking-[0.08em] text-accent">03 · 이렇게 드세요</p>
				<div class="grid grid-cols-3 gap-1.5">
					{#each STEPS as [n, t, d] (n)}
						<div class="flex flex-col gap-1.5 rounded-xl border border-white/8 bg-white/4 p-2.5">
							<span class="flex h-5 w-5 items-center justify-center rounded-[7px] bg-accent/14 text-[10px] font-extrabold text-accent">{n}</span>
							<span class="text-[12px] font-bold">{t}</span>
							<span class="text-[10px] leading-normal text-white/55">{d}</span>
						</div>
					{/each}
				</div>
			{/snippet}
			{@render section(5, '05 섭취법', s5)}

			{#snippet s6()}
				<p class="mb-2.5 text-[10px] font-bold tracking-[0.08em] text-accent">04 · 제품 정보</p>
				<div class="overflow-hidden rounded-xl border border-white/8">
					{#each INFO as [k, v], i (k)}
						<div class="grid grid-cols-[72px_minmax(0,1fr)] gap-2 bg-white/2 px-3 py-2 text-[11px] {i ? 'border-t border-white/7' : ''}">
							<span class="text-white/50">{k}</span><span class="text-white/85">{v}</span>
						</div>
					{/each}
				</div>
			{/snippet}
			{@render section(6, '06 제품 정보', s6)}

			{#snippet s7()}
				<p class="mb-2.5 text-[10px] font-bold tracking-[0.08em] text-accent">05 · 자주 묻는 질문</p>
				<div class="flex flex-col gap-1.5">
					{#each FAQ as [q, a] (q)}
						<div class="rounded-xl border border-white/8 bg-white/3 px-3 py-2.5">
							<p class="text-[12px] font-bold"><span class="mr-1.5 text-accent">Q</span>{q}</p>
							<p class="mt-[5px] ml-4 text-[11px] leading-[1.55] text-white/62">{a}</p>
						</div>
					{/each}
				</div>
			{/snippet}
			{@render section(7, '07 FAQ', s7)}
		</div>
	</div>
</div>
