<script lang="ts">
	/**
	 * 배송 정보 폼 (ux-spec §3.4 3 · web components/checkout/address-fields.tsx): 받는 분 · 연락처 · 우편번호(다음 우편번호 검색) · 주소 · 상세 주소 · 배송 메모.
	 *
	 * 다음 우편번호 API 는 슬라이스 1 에서 스크립트 로드만 한다 (app-plan §13 사용 승인 대기) — 스크립트가 없거나 아직 로드 전이면
	 * 우편번호·주소를 직접 입력할 수 있다 (readOnly 로 막지 않는다). 검색 완료 시 zonecode/roadAddress 를 채우고 상세 주소로 포커스.
	 * phone 은 placeholder `01012345678`, 제출 시 validateShipping → normalizePhone 으로 하이픈 제거 (app-plan §10.0).
	 */
	import { onMount } from 'svelte';
	import { MEMO_MAX, type ShippingDraft, type ShippingField } from '@sellery/payments/checkout-rules';
	import Field from './Field.svelte';
	import { showToast } from '../toast.svelte';

	const DAUM_SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
	const DAUM_SCRIPT_ID = 'daum-postcode';

	type DaumPostcodeData = { zonecode: string; roadAddress: string; jibunAddress: string; buildingName?: string };
	type DaumWindow = Window & { daum?: { Postcode: new (opts: { oncomplete: (data: DaumPostcodeData) => void }) => { open: () => void } } };

	let {
		value,
		onChange,
		invalid,
		clearInvalid,
		disabled = false
	}: {
		value: ShippingDraft;
		onChange: (patch: Partial<ShippingDraft>) => void;
		invalid: Partial<Record<ShippingField, boolean>>;
		clearInvalid: (field: ShippingField) => void;
		disabled?: boolean;
	} = $props();

	let postcodeReady = $state(false);
	const daum = () => (window as DaumWindow).daum;

	// 다음 우편번호 스크립트 — 1회 로드 (id 로 중복 삽입 방지). 실패해도 수동 입력으로 진행.
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

	const set = (field: ShippingField) => (v: string) => {
		onChange({ [field]: v });
		clearInvalid(field);
	};

	function openPostcode() {
		const d = daum();
		if (!d?.Postcode) {
			showToast('우편번호 검색을 불러오는 중이에요 — 직접 입력해도 돼요');
			document.getElementById('ck-postcode')?.focus();
			return;
		}
		new d.Postcode({
			oncomplete: (data) => {
				const road = data.roadAddress || data.jibunAddress || '';
				const building = data.buildingName ? ` (${data.buildingName})` : '';
				onChange({ postcode: data.zonecode, address1: `${road}${building}` });
				clearInvalid('postcode');
				clearInvalid('address1');
				document.getElementById('ck-address2')?.focus();
			}
		}).open();
	}
</script>

<div>
	<Field id="ck-recipient" label="받는 분" value={value.recipient} onChange={set('recipient')} invalid={invalid.recipient} placeholder="홍길동" autocomplete="name" maxlength={50} {disabled} />
	<Field
		id="ck-phone"
		label="연락처"
		value={value.phone}
		onChange={set('phone')}
		invalid={invalid.phone}
		placeholder="01012345678"
		type="tel"
		inputmode="tel"
		autocomplete="tel"
		maxlength={20}
		hint="숫자만 8~15자리 · 하이픈은 자동으로 제거돼요"
		{disabled}
	/>
	<Field
		id="ck-postcode"
		label="우편번호"
		value={value.postcode}
		onChange={set('postcode')}
		invalid={invalid.postcode}
		placeholder="00000"
		inputmode="numeric"
		autocomplete="postal-code"
		maxlength={5}
		{disabled}
		hint={postcodeReady ? undefined : '검색이 준비되지 않았으면 우편번호와 주소를 직접 입력해주세요'}
	>
		{#snippet trailing()}
			<button type="button" class="sm" onclick={openPostcode} {disabled}>우편번호 검색</button>
		{/snippet}
	</Field>
	<Field id="ck-address1" label="주소" value={value.address1} onChange={set('address1')} invalid={invalid.address1} placeholder="도로명 주소" autocomplete="address-line1" maxlength={200} {disabled} />
	<Field id="ck-address2" label="상세 주소" optional value={value.address2} onChange={set('address2')} placeholder="동·호수 등" autocomplete="address-line2" maxlength={200} {disabled} />
	<Field id="ck-memo" label="배송 메모" optional value={value.memo} onChange={set('memo')} invalid={invalid.memo} placeholder="부재 시 문 앞에 두세요" maxlength={MEMO_MAX} hint="{value.memo.length}/{MEMO_MAX}" {disabled} />
</div>
