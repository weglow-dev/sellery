<script lang="ts">
	/**
	 * 체크아웃 폼 필드 `.fld` (ux-spec §3.4 3 — 라벨 Mono 10.5 uppercase · web components/checkout/field.tsx).
	 * invalid 이면 테두리를 danger 색 노치 프레임으로 바꾸고 aria-invalid 를 붙인다. 나머지 속성(type · placeholder · autocomplete · maxlength …)은 input 으로 전달.
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	const INVALID_FRAME = '0 -2px 0 0 var(--color-danger), 0 2px 0 0 var(--color-danger), -2px 0 0 0 var(--color-danger), 2px 0 0 0 var(--color-danger)';

	let {
		id,
		label,
		value,
		onChange,
		invalid = false,
		optional = false,
		hint,
		trailing,
		...rest
	}: {
		id: string;
		label: string;
		value: string;
		onChange: (v: string) => void;
		invalid?: boolean;
		/** 라벨 뒤 보조 표기 " (선택)" */
		optional?: boolean;
		hint?: string;
		/** 입력 오른쪽에 붙는 버튼 등 */
		trailing?: Snippet;
	} & Omit<HTMLInputAttributes, 'id' | 'value' | 'onchange' | 'oninput'> = $props();
</script>

{#snippet input()}
	<input {id} {value} oninput={(e) => onChange(e.currentTarget.value)} aria-invalid={invalid || undefined} style={invalid ? `box-shadow:${INVALID_FRAME}` : undefined} {...rest} />
{/snippet}

<div class="fld">
	<label for={id}>{label}{#if optional}<span style="font-weight:400;letter-spacing:0;text-transform:none"> (선택)</span>{/if}</label>
	{#if trailing}
		<div style="display:flex;align-items:center;gap:6px">
			<div style="flex:1;min-width:0">{@render input()}</div>
			{@render trailing()}
		</div>
	{:else}
		{@render input()}
	{/if}
	{#if hint}<div class="hint">{hint}</div>{/if}
</div>
