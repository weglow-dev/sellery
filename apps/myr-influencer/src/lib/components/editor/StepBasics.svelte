<script lang="ts">
	import { isComposing } from '$lib/ime';
	import { MYR_CATEGORIES } from '@sellery/myr-core/categories';
	import { PRODUCT_IMAGE_ACCEPT, PRODUCT_IMAGE_MAX_BYTES } from '@sellery/myr-core/product-images';
	import { TILE_BG, TILE_KEYS, type ProductDraft } from '$lib/data';
	import { MAX_IMAGES, formatPriceInput, imageHelp, marginText, parsePrice } from '$lib/rules';
	import { app } from '$lib/state.svelte';
	import { INPUT_LG, INPUT_SM, LABEL } from '$lib/ui';
	import Icon from '../Icon.svelte';
	import StepHead from './StepHead.svelte';

	/** 1단계 기본 정보 → 샵 구매 패널: 제품명 · 판매가 · 내용량 · 카테고리(MYR 6개 고정) · 이미지(최대 6장 · 첫 장이 대표) · 태그 3개 · 예상 정산 */
	let { ed = $bindable() }: { ed: ProductDraft } = $props();
	const uid = $props.id();

	const TAG_PH = ['짜먹는', '스틱포', '레몬맛'];

	/** 판매가 — 숫자만 · 천 단위 콤마. 한글 입력이 조합 중(isComposing)일 때는 값을 다시 쓰지 않는다 — 조합 중에 값을 바꾸면
	 *  덜 끝난 글자("ㅇ")가 다음 칸(내용량)으로 넘어가는 문제가 있었다(2026-11-05). 조합이 끝날 때(compositionend) · 칸을 벗어날 때 정리한다 */
	function onPriceInput(e: Event & { currentTarget: HTMLInputElement }) {
		if (isComposing(e)) return;
		const next = formatPriceInput(e.currentTarget.value);
		if (e.currentTarget.value !== next) e.currentTarget.value = next;
		ed.price = next;
	}

	/** 사진 — 고르는 즉시 1장씩 서버로 올린다(POST /api/products/photos → 공개 URL · 0073). 올리는 동안은 브라우저 미리보기(blob:)로 보여주고,
	 *  끝나면 그 자리를 공개 URL 로 바꾼다. 실패하면 빼고 안내. 미리보기가 남아 있으면 저장을 막는다(에디터 save) */
	async function uploadOne(file: File, preview: string) {
		const fail = (msg: string) => {
			ed.images = ed.images.filter((u) => u !== preview);
			URL.revokeObjectURL(preview);
			app.showToast(msg);
		};
		if (file.size > PRODUCT_IMAGE_MAX_BYTES) return fail('사진은 한 장에 4MB 까지 올릴 수 있어요');
		try {
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch('/api/products/photos', { method: 'POST', body: fd });
			const r = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; code?: string } | null;
			if (!r?.ok || !r.url) return fail(r?.code === 'BAD_FILE' ? 'JPG · PNG · WEBP 사진만 올릴 수 있어요' : '사진을 올리지 못했어요. 다시 시도해주세요');
			ed.images = ed.images.map((u) => (u === preview ? r.url! : u));
			URL.revokeObjectURL(preview);
		} catch {
			fail('사진을 올리지 못했어요. 인터넷 연결을 확인해주세요');
		}
	}
	function pickImages(e: Event & { currentTarget: HTMLInputElement }) {
		const files = Array.from(e.currentTarget.files ?? []).slice(0, Math.max(0, MAX_IMAGES - ed.images.length));
		e.currentTarget.value = '';
		if (!files.length) return;
		const previews = files.map((f) => URL.createObjectURL(f));
		ed.images = [...ed.images, ...previews].slice(0, MAX_IMAGES);
		files.forEach((f, i) => uploadOne(f, previews[i]));
	}
	function makeCover(i: number) {
		if (i === 0) return;
		const arr = [...ed.images];
		const [m] = arr.splice(i, 1);
		ed.images = [m, ...arr];
	}
	/** 목록에서만 뺀다 — 이미 올린 파일은 저장소에 남는다(고아 정리는 운영 작업 · 다른 상품 · 수정본과 섞이지 않게 지우지 않는다) */
	function removeImage(i: number) {
		if (ed.images[i].startsWith('blob:')) URL.revokeObjectURL(ed.images[i]);
		ed.images = ed.images.filter((_, j) => j !== i);
	}
</script>

<StepHead n={1} name="기본 정보" title={'어떤 제품을 올릴까요?'} desc="제품명, 가격, 카테고리 — 샵 오른쪽 구매 패널에 보이는 정보예요." where="구매 패널" />

<div class="mt-4 flex flex-col gap-3.5 lg:mt-5 lg:gap-4">
	<div class="flex flex-col gap-2">
		<label class={LABEL} for="{uid}-name">판매 제품명</label>
		<input id="{uid}-name" class={INPUT_LG} bind:value={ed.name} placeholder="예: 민지 글루타치온 스틱 — 레몬" maxlength="60" />
	</div>

	<div class="grid grid-cols-2 gap-2.5 lg:gap-3">
		<div class="flex flex-col gap-2">
			<label class={LABEL} for="{uid}-price">판매가</label>
			<div class="relative">
				<span class="absolute top-1/2 left-4 -translate-y-1/2 text-[16px] font-bold text-white/50" aria-hidden="true">₩</span>
				<input
					id="{uid}-price"
					class="{INPUT_LG} pl-[34px] font-bold tabular-nums"
					inputmode="numeric"
					value={ed.price}
					oninput={onPriceInput}
					oncompositionend={onPriceInput}
					onblur={onPriceInput}
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
			{#each MYR_CATEGORIES as c (c.id)}
				{@const on = ed.cat === c.id}
				<button
					type="button"
					aria-pressed={on}
					onclick={() => (ed.cat = c.id)}
					class="rounded-full border px-3 py-[9px] text-[13px] font-bold transition-all lg:px-3.5 {on ? 'border-accent bg-accent/12 text-accent' : 'border-white/12 text-white/80'}">{c.name}</button
				>
			{/each}
		</div>
	</div>

	<div class="flex flex-col gap-2">
		<span class={LABEL}>제품 이미지 <span class="font-medium text-white/45">({ed.images.length}/{MAX_IMAGES})</span></span>
		<div class="no-bar flex gap-2 overflow-x-auto pt-0.5 pb-1 lg:flex-wrap lg:gap-2.5 lg:overflow-visible">
			{#each ed.images as src, i (src)}
				<div class="relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-[18px] border-2 lg:h-[104px] lg:w-[104px] {i === 0 ? 'border-accent' : 'border-white/12'}">
					<button type="button" onclick={() => makeCover(i)} class="block h-full w-full" aria-label={i === 0 ? '대표 이미지' : `${i + 1}번째 사진을 대표로`}>
						<img {src} alt="" class="h-full w-full object-cover {src.startsWith('blob:') ? 'opacity-50' : ''}" />
					</button>
					{#if src.startsWith('blob:')}<span class="pointer-events-none absolute inset-0 m-auto h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-label="올리는 중"></span>{/if}
					<span class="pointer-events-none absolute top-1.5 left-1.5 rounded-full px-[7px] py-[3px] text-[10px] font-extrabold {i === 0 ? 'bg-accent text-bg' : 'bg-bg/70 text-fg'}">{i === 0 ? '대표' : i + 1}</span>
					<button type="button" onclick={() => removeImage(i)} aria-label="사진 삭제" class="absolute top-[5px] right-[5px] flex h-[22px] w-[22px] items-center justify-center rounded-full bg-bg/70 text-fg">
						<Icon id="x" size={11} sw={3} />
					</button>
				</div>
			{/each}
			{#if ed.images.length < MAX_IMAGES}
				<label class="relative flex h-[92px] w-[92px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[18px] border-[1.5px] border-dashed border-white/28 bg-white/3 text-white/80 transition-colors lg:h-[104px] lg:w-[104px] lg:hover:border-accent">
					<input type="file" accept={PRODUCT_IMAGE_ACCEPT} multiple onchange={pickImages} class="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="제품 사진 추가" />
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
		<div class="grid grid-cols-3 gap-2 lg:max-w-[480px]">
			{#each ed.chips as _, i (i)}
				<input class="{INPUT_SM} text-center font-semibold" bind:value={ed.chips[i]} placeholder={TAG_PH[i]} aria-label="태그 {i + 1}" maxlength="10" />
			{/each}
		</div>
	</div>
</div>

<div class="mt-4 flex items-center gap-3 rounded-2xl border border-white/7 bg-white/3 px-4 py-3.5 lg:mt-[18px]">
	<span class="shrink-0 text-[12px] text-white/50">예상 정산</span>
	<span class="flex-1 text-[13px] text-white/75">판매가 − 플랫폼 수수료 10%</span>
	<span class="text-[15px] font-extrabold whitespace-nowrap text-accent">{marginText(parsePrice(ed.price))}</span>
</div>
