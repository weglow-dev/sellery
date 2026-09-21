<script lang="ts">
	/**
	 * 상품 등록·수정 폼 — 프로토타입 `packages/ui/src/modals/ProductModal.svelte`(js/70-campaign.js productModal) 를 페이지 폼으로 (docs/brand-console-plan.md §5 `/brand/products/new` `/[code]`).
	 * 필드 이름 = `@sellery/db/brand/product-rules` ProductInput 키(샘플 정책은 평면 `sample_*`) — 서버(`$lib/server/product-form` saveProductAction)가 `parseProductInput(FormData)` 로 같은 규칙을 검사한다.
	 * 평범한 multipart POST(`?/save`) — 실패는 `fail(400)` 의 values 로 되돌아와 입력값 유지 · 실패 필드 `.fld.invalid` 강조. JS 가 있으면 총 수수료율 계산 문구만 실시간(데모 rateCalc 원문).
	 * 잠긴 상품(진행 중·확정 판매 — `locked`)은 판매가·소비자가·수수료율·옵션을 disabled + hidden 으로 원래 값을 함께 보낸다(서버 함수가 바뀐 값만 LOCKED_FIELD). 재고는 배정량(`allocated`) 이 하한.
	 */
	import { GRADES } from '@sellery/core/constants';
	import { fmtNum, imageSrc } from '@sellery/db/campaign';
	import { EXCLUSIVE_GRADES, IMAGE_URLS_MAX, PLATFORM_RATE_PP, autoOptions, sampleTierOptions, type ProductField } from '@sellery/db/brand/product-rules';

	type Category = { name: string; group_name: string; description: string | null; examples: string | null };
	let {
		values,
		thumbUrl,
		imageUrls,
		categories,
		locked = false,
		allocated = 0,
		exclusiveSellerLocked = false,
		isNew,
		field = null,
		message = null,
		imageAccept,
		imageMaxMb,
		listPath
	}: {
		values: Record<string, string>;
		thumbUrl: string | null;
		imageUrls: string[];
		categories: Category[];
		locked?: boolean;
		allocated?: number;
		/** 독점 인플루언서가 확정됨 — 오퍼 해제는 서버가 무시한다 (안내만) */
		exclusiveSellerLocked?: boolean;
		isNew: boolean;
		field?: ProductField | 'image_files' | null;
		message?: string | null;
		imageAccept: string;
		imageMaxMb: number;
		/** 취소 → 상품 목록 */
		listPath: string;
	} = $props();

	const v = (k: string) => values[k] ?? '';
	const inv = (k: string) => (field === k ? 'invalid' : '');
	const topBonus = GRADES[0]?.bonus ?? 3;
	const tiers = sampleTierOptions();

	// 총 수수료율 → 인플루언서 수수료 문구 (데모 rateCalc 원문) — 입력 중 실시간. 초기값만 props 에서 (평범한 POST 라 실패 시 페이지가 다시 그려진다).
	// svelte-ignore state_referenced_locally
	let totalRate = $state(Number(values.total_rate) || 0);
	// svelte-ignore state_referenced_locally
	let salePrice = $state(Number(String(values.sale_price ?? '').replace(/,/g, '')) || 0);
	// svelte-ignore state_referenced_locally
	let buyMode = $state(values.sample_buy_mode || 'auto');
	const sellerPct = $derived(+(totalRate - PLATFORM_RATE_PP).toFixed(1));
	const auto = $derived(autoOptions(salePrice));
	const thumb = $derived(imageSrc(thumbUrl));
</script>

<form method="post" action="?/save" enctype="multipart/form-data" class="console-form console-prodform" novalidate>
	{#if message}
		<p class="notice danger" role="alert">{message}</p>
	{/if}
	{#if locked}
		<div class="notice">
			진행 중·확정된 판매가 있어 <b>판매가·수수료율·구매 옵션은 변경할 수 없습니다</b>(신뢰 보호). 재고·샘플 정책·이미지·독점권은 수정 가능합니다.{#if allocated > 0}{' '}재고는 배정된 <b>{fmtNum(allocated)}개</b>보다 적게 줄일 수 없어요.{/if}
		</div>
	{/if}

	<div class="fld {inv('name')}">
		<label for="pf-name">상품명</label>
		<input id="pf-name" name="name" value={v('name')} placeholder="예: 콜라겐 부스터 샷" maxlength="80" required />
	</div>
	<div class="fld {inv('description')}">
		<label for="pf-desc">한 줄 설명</label>
		<input id="pf-desc" name="description" value={v('description')} placeholder="예: 저분자 콜라겐 · 30포" maxlength="300" />
	</div>

	<div class="console-grid2">
		<div class="fld {inv('thumb_url')}">
			<label for="pf-thumb">썸네일 이미지 <span class="font-normal">— 누끼(배경 제거) PNG 권장 · {imageMaxMb}MB 이하</span></label>
			{#if thumb}
				<div class="console-imgrow">
					<img src={thumb} alt="현재 썸네일" />
					<input type="hidden" name="thumb_url" value={thumbUrl} />
					<label class="console-imgdel"><input type="checkbox" name="remove_thumb" /> 삭제</label>
				</div>
			{/if}
			<input id="pf-thumb" name="thumb_file" type="file" accept={imageAccept} />
			<div class="hint">{thumb ? '새 파일을 고르면 교체됩니다' : '미첨부 — 이모지 아이콘으로 표시됩니다'}</div>
		</div>
		<div class="fld {inv('image_urls')} {inv('image_files')}">
			<label for="pf-imgs">상세페이지 이미지 <span class="font-normal">(최대 {IMAGE_URLS_MAX}장 · 각 {imageMaxMb}MB 이하)</span></label>
			{#if imageUrls.length}
				<div class="console-imgrow">
					{#each imageUrls as u (u)}
						<span class="console-img">
							<img src={imageSrc(u)} alt="" />
							<input type="hidden" name="image_urls" value={u} />
							<label class="console-imgdel"><input type="checkbox" name="remove_images" value={u} /> 삭제</label>
						</span>
					{/each}
				</div>
			{/if}
			<input id="pf-imgs" name="image_files" type="file" accept={imageAccept} multiple disabled={imageUrls.length >= IMAGE_URLS_MAX} />
			<div class="hint">{imageUrls.length}장 등록됨{imageUrls.length >= IMAGE_URLS_MAX ? ' — 지우고 추가하세요' : ` · ${IMAGE_URLS_MAX - imageUrls.length}장 더 추가 가능`}</div>
		</div>
	</div>

	<div class="console-grid2">
		<div class="fld {inv('exclusive_grade')}">
			<label for="pf-exg">독점권 오퍼 <span class="font-normal">(선택 · 등급 기준)</span></label>
			<select id="pf-exg" name="exclusive_grade" disabled={exclusiveSellerLocked}>
				<option value="" selected={!v('exclusive_grade')}>사용 안 함</option>
				{#each EXCLUSIVE_GRADES as g (g)}<option value={g} selected={v('exclusive_grade') === g}>{g} 등급 이상</option>{/each}
			</select>
			{#if exclusiveSellerLocked}
				<input type="hidden" name="exclusive_grade" value={v('exclusive_grade')} />
				<div class="hint">독점 인플루언서가 확정된 상품은 오퍼를 해제할 수 없어요</div>
			{/if}
		</div>
		<div class="fld {inv('exclusive_label')}">
			<label for="pf-exl">독점권 내용</label>
			<input id="pf-exl" name="exclusive_label" value={v('exclusive_label')} placeholder="예: 인스타그램 판매 독점권 · 3개월" maxlength="80" />
		</div>
	</div>

	<div class="fld {inv('category')}">
		<label for="pf-cat">카테고리 <span class="font-normal">— 건강·웰니스만 등록 가능</span></label>
		<select id="pf-cat" name="category" required>
			<option value="" selected={!v('category')} disabled>카테고리 선택</option>
			{#each categories as c (c.name)}
				<option value={c.name} selected={v('category') === c.name}>{c.name}{c.description ? ` — ${c.description}` : ''}{c.examples ? ` (${c.examples})` : ''}</option>
			{/each}
		</select>
		<div class="hint">셀러리는 건강기능식품·이너뷰티 등 건강·웰니스 상품만 취급합니다. 범위 밖 상품은 검수에서 반려됩니다.</div>
	</div>

	<div class="console-grid2">
		<div class="fld {inv('consumer_price')}">
			<label for="pf-cp">소비자가 (₩)</label>
			<input id="pf-cp" name="consumer_price" type="number" inputmode="numeric" value={v('consumer_price')} step="1000" min="0" disabled={locked} />
			{#if locked}<input type="hidden" name="consumer_price" value={v('consumer_price')} />{/if}
		</div>
		<div class="fld {inv('sale_price')}">
			<label for="pf-gp">판매가 (₩)</label>
			<input id="pf-gp" name="sale_price" type="number" inputmode="numeric" bind:value={salePrice} step="100" min="1" disabled={locked} required />
			{#if locked}<input type="hidden" name="sale_price" value={v('sale_price')} />{/if}
		</div>
		<div class="fld {inv('total_rate')}">
			<label for="pf-rate">총 수수료율 (%) — 플랫폼 {PLATFORM_RATE_PP}%p 포함</label>
			<input id="pf-rate" name="total_rate" type="number" inputmode="decimal" bind:value={totalRate} min="11" max="50" step="0.5" disabled={locked} required />
			{#if locked}<input type="hidden" name="total_rate" value={v('total_rate')} />{/if}
			<div class="hint">
				{#if totalRate > PLATFORM_RATE_PP}
					→ 플랫폼 <b>{PLATFORM_RATE_PP}%p</b> + 제안 수수료 <b class="console-accent">{sellerPct}%</b> · 등급 보너스 포함 최대 <b>{+(sellerPct + topBonus).toFixed(1)}%</b> (블랙, 보너스는 플랫폼 부담)
				{:else}
					<span class="console-danger">총 수수료율은 플랫폼 몫({PLATFORM_RATE_PP}%)보다 커야 합니다</span>
				{/if}
			</div>
		</div>
		<div class="fld {inv('stock')}">
			<label for="pf-stock">재고</label>
			<input id="pf-stock" name="stock" type="number" inputmode="numeric" value={v('stock')} step="100" min={allocated} />
			{#if allocated > 0}<div class="hint">배정된 {fmtNum(allocated)}개가 하한 (확정·진행 중 판매)</div>{/if}
		</div>
	</div>

	<div class="fld {inv('sample_text')}">
		<label for="pf-sample">샘플 내용</label>
		<input id="pf-sample" name="sample_text" value={v('sample_text')} placeholder="예: 무상 1박스" maxlength="60" />
	</div>

	<div class="card static console-subcard {inv('sample_policy') ? 'invalid' : ''}">
		<div class="lbl-sm" style="margin-bottom:8px">🎁 샘플 정책</div>
		<div class="console-grid2">
			<div class="fld">
				<label for="pf-sfg">무상 샘플 기준 등급 <span class="font-normal">(이상 · 1회)</span></label>
				<select id="pf-sfg" name="sample_free_grade">
					{#each tiers as g (g)}<option value={g} selected={v('sample_free_grade') === g}>{g} 이상</option>{/each}
				</select>
				<div class="hint">권장: 3만원 미만 브론즈 · 3~8만원 실버 · 8만원 이상 골드</div>
			</div>
			<div class="fld {inv('sample_policy')}">
				<label for="pf-sbm">등급 미달 시 샘플 구매가</label>
				<select id="pf-sbm" name="sample_buy_mode" bind:value={buyMode}>
					<option value="auto">자동 — 판매가 − 인플루언서 수수료</option>
					<option value="fixed">브랜드 지정가 (1회 한정)</option>
				</select>
				<input name="sample_fixed_price" type="number" inputmode="numeric" step="100" min="0" value={v('sample_fixed_price')} placeholder="지정가 (₩) — 지정가 선택 시" style="margin-top:6px" required={buyMode === 'fixed'} aria-label="샘플 지정가" />
			</div>
		</div>
		<label class="console-check" style="margin:4px 0 0"><input type="checkbox" name="sample_refund" checked={v('sample_refund') === 'on'} /> <span>판매 확정 시 샘플 구매액 환급 (신규 인플루언서 유입용)</span></label>
		<div class="hint" style="font-size:11px;color:var(--color-mute);margin-top:6px">샘플 구매는 인플루언서 수수료 0의 판매 1건으로 정산됩니다(플랫폼 10% 동일). 인플루언서는 현금 또는 셀러리(1🥬=₩20,000)로 결제합니다.</div>
	</div>

	<div class="fld {inv('options')}">
		<label for="pf-opts">구매 옵션 <span class="font-normal">— 한 줄에 하나, "옵션명 | 가격" (비우면 1개/2개 세트/3개 세트 자동 생성)</span></label>
		<textarea id="pf-opts" name="options" rows="3" disabled={locked} placeholder={'1박스 (30포) | 29900\n2박스 세트 | 56800\n3박스 + 쉐이커 | 79900'}>{v('options')}</textarea>
		{#if locked}<input type="hidden" name="options" value={v('options')} />{/if}
		{#if !v('options').trim() && salePrice > 0}
			<div class="hint">자동 옵션 미리보기: {auto.map((o) => `${o.n} ₩${fmtNum(o.price)}`).join(' · ')}</div>
		{/if}
	</div>

	<p class="meta" style="margin:0 3px 12px">
		{isNew
			? '등록 후 플랫폼 검수를 통과하면 인플루언서에게 노출됩니다. 고객 구매 페이지에는 옵션·가격·상세 이미지가 그대로 노출됩니다.'
			: '수정한 내용은 저장 즉시 인플루언서·고객 화면에 반영됩니다. 판매가·수수료율을 바꾸면 재검수가 필요할 수 있습니다.'}
	</p>
	<div class="btnrow">
		<button type="submit" class="pri">{isNew ? '검수 요청' : '저장'}</button>
		<a href={listPath} class="btn ghost">취소</a>
	</div>
</form>
