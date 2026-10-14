<script lang="ts">
	import OptionIcon from './OptionIcon.svelte';

	/** 라디오 칩 그룹 — 진행성 향상이 되는 실제 <input type="radio"> 라서 JS 없이도 폼 제출이 된다.
	 *  icons 를 켜면 옵션 이름에 맞는 OptionIcon 이 앞에 붙는다(표에 없는 이름은 아이콘 없이 글자만). */
	let {
		name,
		options,
		value = $bindable(''),
		label,
		required = false,
		icons = false
	}: {
		name: string;
		options: readonly string[];
		value?: string;
		label?: string;
		required?: boolean;
		icons?: boolean;
	} = $props();
</script>

<div role="radiogroup" aria-label={label} class="flex flex-wrap gap-2">
	{#each options as opt (opt)}
		<label
			class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition {value === opt
				? 'border-accent bg-accent text-bg'
				: 'border-line bg-white/[0.02] text-fg-soft hover:border-white/20'}"
		>
			<input type="radio" {name} value={opt} bind:group={value} {required} class="sr-only" />
			{#if icons}<OptionIcon name={opt} />{/if}
			{opt}
		</label>
	{/each}
</div>
