<script lang="ts">
	/**
	 * 샘플 배송지 폼 필드 — 콘솔 3단계 (docs/inf-console-plan.md §6 `/products/[code]` requestFreeSample · `/my` saveSampleAddress).
	 * 체크아웃 `AddressFields.svelte` 의 **평범한 POST 폼** 판: name 이 `parseShippingInput(FormData)`(@sellery/db/partner/sample-rules) 의 키와 같고
	 * JS 없이도 제출된다. 다음 우편번호 스크립트는 같은 방식으로 1회 로드 — 없거나 실패하면 우편번호·주소를 직접 입력한다(readOnly 로 막지 않는다).
	 * `invalid` 는 서버가 돌려준 실패 필드(첫 번째 하나) — 해당 `.fld` 에 danger 프레임.
	 */
	import { onMount } from 'svelte';
	import type { Shipping } from '@sellery/db/types';
	import { SHIPPING_FIELD_LABELS, SHIPPING_MAX, type ShippingField } from '@sellery/db/partner/sample-rules';
	import { showToast } from '../toast.svelte';

	const DAUM_SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
	const DAUM_SCRIPT_ID = 'daum-postcode';

	type DaumPostcodeData = { zonecode: string; roadAddress: string; jibunAddress: string; buildingName?: string };
	type DaumWindow = Window & { daum?: { Postcode: new (opts: { oncomplete: (data: DaumPostcodeData) => void }) => { open: () => void } } };

	let {
		value = null,
		invalid = null,
		idPrefix = 'sh',
		disabled = false
	}: {
		/** 프리필 — 저장된 배송지(sellers.sample_address) 또는 실패한 제출값 */
		value?: Partial<Shipping> | null;
		invalid?: ShippingField | string | null;
		idPrefix?: string;
		disabled?: boolean;
	} = $props();

	// 입력값은 폼이 소유한다 — 프리필만 $state 로 들고 그 뒤로는 DOM 이 진실 (평범한 POST)
	// svelte-ignore state_referenced_locally
	let postcode = $state(value?.postcode ?? '');
	// svelte-ignore state_referenced_locally
	let address1 = $state(value?.address1 ?? '');
	let postcodeReady = $state(false);
	const daum = () => (window as DaumWindow).daum;
	const id = (f: ShippingField) => `${idPrefix}-${f}`;
	const bad = (f: ShippingField) => invalid === f;

	onMount(() => {
		const onLoad = () => (postcodeReady = !!daum()?.Postcode);
		if (daum()?.Postcode) {
			const t = window.setTimeout(onLoad, 0);
			return () => window.clearTimeout(t);
		}
		const existing = document.getElementById(DAUM_SCRIPT_ID) as HTMLScriptElement | null;
		if (existing) {
			existing.addEventListener('load', onLoad);
			return () => existing.removeEventListener('load', onLoad);
		}
		const s = document.createElement('script');
		s.id = DAUM_SCRIPT_ID;
		s.src = DAUM_SRC;
		s.async = true;
		s.addEventListener('load', onLoad);
		document.body.appendChild(s);
		return () => s.removeEventListener('load', onLoad);
	});

	function openPostcode() {
		const d = daum();
		if (!d?.Postcode) {
			showToast('우편번호 검색을 불러오는 중이에요 — 직접 입력해도 돼요');
			document.getElementById(id('postcode'))?.focus();
			return;
		}
		new d.Postcode({
			oncomplete: (data) => {
				const road = data.roadAddress || data.jibunAddress || '';
				const building = data.buildingName ? ` (${data.buildingName})` : '';
				postcode = data.zonecode;
				address1 = `${road}${building}`;
				document.getElementById(id('address2'))?.focus();
			}
		}).open();
	}
</script>

<div class="fld" class:invalid={bad('recipient')}>
	<label for={id('recipient')}>{SHIPPING_FIELD_LABELS.recipient}</label>
	<input id={id('recipient')} name="recipient" value={value?.recipient ?? ''} placeholder="홍길동" autocomplete="name" maxlength={SHIPPING_MAX.recipient} required aria-invalid={bad('recipient') || undefined} {disabled} />
</div>
<div class="fld" class:invalid={bad('phone')}>
	<label for={id('phone')}>{SHIPPING_FIELD_LABELS.phone}</label>
	<input id={id('phone')} name="phone" value={value?.phone ?? ''} placeholder="01012345678" type="tel" inputmode="tel" autocomplete="tel" maxlength={20} required aria-invalid={bad('phone') || undefined} {disabled} />
	<div class="hint">숫자만 8~15자리 · 하이픈은 자동으로 제거돼요</div>
</div>
<div class="fld" class:invalid={bad('postcode')}>
	<label for={id('postcode')}>{SHIPPING_FIELD_LABELS.postcode}</label>
	<div class="trail">
		<div><input id={id('postcode')} name="postcode" bind:value={postcode} placeholder="00000" inputmode="numeric" autocomplete="postal-code" maxlength={SHIPPING_MAX.postcode} required aria-invalid={bad('postcode') || undefined} {disabled} /></div>
		<button type="button" class="sm" onclick={openPostcode} {disabled}>우편번호 검색</button>
	</div>
	{#if !postcodeReady}<div class="hint">검색이 준비되지 않았으면 우편번호와 주소를 직접 입력해주세요</div>{/if}
</div>
<div class="fld" class:invalid={bad('address1')}>
	<label for={id('address1')}>{SHIPPING_FIELD_LABELS.address1}</label>
	<input id={id('address1')} name="address1" bind:value={address1} placeholder="도로명 주소" autocomplete="address-line1" maxlength={SHIPPING_MAX.address1} required aria-invalid={bad('address1') || undefined} {disabled} />
</div>
<div class="fld" class:invalid={bad('address2')}>
	<label for={id('address2')}>{SHIPPING_FIELD_LABELS.address2}<span style="font-weight:400;letter-spacing:0;text-transform:none"> (선택)</span></label>
	<input id={id('address2')} name="address2" value={value?.address2 ?? ''} placeholder="동·호수 등" autocomplete="address-line2" maxlength={SHIPPING_MAX.address2} {disabled} />
</div>
<div class="fld" class:invalid={bad('memo')}>
	<label for={id('memo')}>{SHIPPING_FIELD_LABELS.memo}<span style="font-weight:400;letter-spacing:0;text-transform:none"> (선택)</span></label>
	<input id={id('memo')} name="memo" value={value?.memo ?? ''} placeholder="부재 시 문 앞에 두세요" maxlength={SHIPPING_MAX.memo} {disabled} />
</div>
