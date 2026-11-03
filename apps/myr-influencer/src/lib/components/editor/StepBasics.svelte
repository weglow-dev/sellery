<script lang="ts">
	import { TILE_BG, TILE_KEYS, type ProductDraft } from '$lib/data';
	import { MAX_IMAGES, formatPriceInput, imageHelp, marginText, parsePrice } from '$lib/rules';
	import { app } from '$lib/state.svelte';
	import { INPUT_LG, INPUT_SM, LABEL } from '$lib/ui';
	import Icon from '../Icon.svelte';
	import StepHead from './StepHead.svelte';

	/** 1단계 기본 정보 → 샵 구매 패널: 제품명 · 판매가 · 내용량 · 카테고리 · 이미지(최대 6장 · 첫 장이 대표) · 태그 3개 · 예상 정산 */
	let { ed = $bindable() }: { ed: ProductDraft } = $props();
	const uid = $props.id();

	let catAdding = $state(false);
	let catDraft = $state('');
	const TAG_PH = ['짜먹는', '스틱포', '레몬맛'];

	function addCat() {
		const id = app.addCategory(catDraft);
		if (!id) return;
		ed.cat = id;
		catAdding = false;
		catDraft = '';
	}

	/** 사진은 아직 업로드하지 않고 브라우저 미리보기 URL 로만 들고 있다(UI 단계) — 저장소 업로드는 상품 RPC 와 함께 */
	function pickImages(e: Event & { currentTarget: HTMLInputElement }) {
		const files = Array.from(e.currentTarget.files ?? []).slice(0, Math.max(0, MAX_IMAGES - ed.images.length));
		e.currentTarget.value = '';
		if (!files.length) return;
		ed.images = [...ed.images, ...files.map((f) => URL.createObjectURL(f))].slice(0, MAX_IMAGES);
	}
	function makeCover(i: number) {
		if (i === 0) return;
		const arr = [...ed.images];
		const [m] = arr.splice(i, 1);
		ed.images = [m, ...arr];
	}
	function removeImage(i: number) {
		URL.revokeObjectURL(ed.images[i]);
		ed.images = ed.images.filter((_, j) => j !== i);
	}
</script>

<StepHead n={1} name="기본 정보" title={'어떤 제품을\n올릴까요?'} desc="제품명, 가격, 카테고리 — 샵 오른쪽 구매 패널에 보이는 정보예요." where="구매 패널" />

<div class="mt-4 flex flex-col gap-3.5">
	<div class="flex flex-col gap-2">
		<label class={LABEL} for="{uid}-name">판매 제품명</label>
		<input id="{uid}-name" class={INPUT_LG} bind:value={ed.name} placeholder="예: 민지 글루타치온 스틱 — 레몬" maxlength="60" />
	</div>

	<div class="grid grid-cols-2 gap-2.5">
		<div class="flex flex-col gap-2">
			<label class={LABEL} for="{uid}-price">판매가</label>
			<div class="relative">
				<span class="absolute top-1/2 left-4 -translate-y-1/2 text-[16px] font-bold text-white/50" aria-hidden="true">₩</span>
				<input
					id="{uid}-price"
					class="{INPUT_LG} pl-[34px] font-bold tabular-nums"
					inputmode="numeric"
					value={ed.price}
					oninput={(e) => (ed.price = formatPriceInput(e.currentTarget.value))}
					placeholder="36,000"
				/>
			</div>
		</div>
		<div class="flex flex-col gap-2">
			<label class={LABEL} for="{uid}-unit">내용량 · 구성</label>
			<input id="{uid}-unit" class={INPUT_LG} bind:value={ed.unit} placeholder="예: 14포 / 2주분" />
		</div>
	</div>

	<div class="flex flex-col gap-2">
		<span class={LABEL} id="{uid}-cat">카테고리</span>
		<div class="flex flex-wrap gap-1.5" role="group" aria-labelledby="{uid}-cat">
			{#each app.categories as c (c.id)}
				{@const on = ed.cat === c.id}
				<button
					type="button"
					aria-pressed={on}
					onclick={() => (ed.cat = c.id)}
					class="rounded-full border px-3 py-[9px] text-[13px] font-bold transition-all {on ? 'border-accent bg-accent/12 text-accent' : 'border-white/12 text-white/80'}">{c.name}</button
				>
			{/each}
			{#if !catAdding}
				<button type="button" onclick={() => (catAdding = true)} class="rounded-full border-[1.5px] border-dashed border-white/25 px-3 py-[9px] text-[13px] font-bold text-white/75">+ 추가</button>
			{/if}
		</div>
		{#if catAdding}
			<div class="mt-0.5 flex items-center gap-2">
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="h-[46px] min-w-0 flex-1 rounded-xl border-[1.5px] border-accent bg-accent/6 px-3.5 text-[15px] text-fg outline-none"
					bind:value={catDraft}
					onkeydown={(e) => e.key === 'Enter' && addCat()}
					placeholder="새 카테고리 이름 (예: 운동 보충)"
					aria-label="새 카테고리 이름"
					autofocus
				/>
				<button type="button" onclick={addCat} class="h-[46px] shrink-0 rounded-xl bg-accent px-4 text-[14px] font-extrabold text-bg">등록</button>
				<button type="button" onclick={() => ((catAdding = false), (catDraft = ''))} aria-label="취소" class="h-[46px] w-10 shrink-0 text-[18px] text-white/45">×</button>
			</div>
		{/if}
	</div>

	<div class="flex flex-col gap-2">
		<span class={LABEL}>제품 이미지 <span class="font-medium text-white/45">({ed.images.length}/{MAX_IMAGES})</span></span>
		<div class="no-bar flex gap-2 overflow-x-auto pt-0.5 pb-1">
			{#each ed.images as src, i (src)}
				<div class="relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-[18px] border-2 {i === 0 ? 'border-accent' : 'border-white/12'}">
					<button type="button" onclick={() => makeCover(i)} class="block h-full w-full" aria-label={i === 0 ? '대표 이미지' : `${i + 1}번째 사진을 대표로`}>
						<img {src} alt="" class="h-full w-full object-cover" />
					</button>
					<span class="pointer-events-none absolute top-1.5 left-1.5 rounded-full px-[7px] py-[3px] text-[10px] font-extrabold {i === 0 ? 'bg-accent text-bg' : 'bg-bg/70 text-fg'}">{i === 0 ? '대표' : i + 1}</span>
					<button type="button" onclick={() => removeImage(i)} aria-label="사진 삭제" class="absolute top-[5px] right-[5px] flex h-[22px] w-[22px] items-center justify-center rounded-full bg-bg/70 text-fg">
						<Icon id="x" size={11} sw={3} />
					</button>
				</div>
			{/each}
			{#if ed.images.length < MAX_IMAGES}
				<label class="relative flex h-[92px] w-[92px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[18px] border-[1.5px] border-dashed border-white/28 bg-white/3 text-white/80">
					<input type="file" accept="image/*" multiple onchange={pickImages} class="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="제품 사진 추가" />
					<Icon id="plus" size={20} sw={2.2} />
					<span class="text-[11px] font-bold">사진 추가</span>
				</label>
			{/if}
		</div>
		<p class="text-[12px] leading-normal text-white/55">{imageHelp(ed.images.length)}</p>
		{#if !ed.images.length}
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-[12px] text-white/50">사진이 없으면</span>
				{#each TILE_KEYS as k (k)}
					<button
						type="button"
						onclick={() => (ed.tile = k)}
						aria-label="타일 색 {k}"
						aria-pressed={ed.tile === k}
						class="h-[26px] w-[26px] rounded-lg border-2 p-0 {ed.tile === k ? 'border-fg' : 'border-transparent'}"
						style:background={TILE_BG[k]}
					></button>
				{/each}
			</div>
		{/if}
	</div>

	<div class="flex flex-col gap-2">
		<span class={LABEL}>태그 3개</span>
		<div class="grid grid-cols-3 gap-2">
			{#each ed.chips as _, i (i)}
				<input class="{INPUT_SM} text-center font-semibold" bind:value={ed.chips[i]} placeholder={TAG_PH[i]} aria-label="태그 {i + 1}" maxlength="10" />
			{/each}
		</div>
	</div>
</div>

<div class="mt-4 flex items-center gap-3 rounded-2xl border border-white/7 bg-white/3 px-4 py-3.5">
	<span class="shrink-0 text-[12px] text-white/50">예상 정산</span>
	<span class="flex-1 text-[13px] text-white/75">판매가 − 플랫폼 수수료 10%</span>
	<span class="text-[15px] font-extrabold whitespace-nowrap text-accent">{marginText(parsePrice(ed.price))}</span>
</div>
