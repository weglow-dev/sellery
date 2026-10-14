<script lang="ts">
	/** 라디오 칩 그룹 — 진행성 향상이 되는 실제 <input type="radio"> 라서 JS 없이도 폼 제출이 된다. */
	let {
		name,
		options,
		value = $bindable(''),
		label,
		required = false
	}: {
		name: string;
		options: readonly string[];
		value?: string;
		label?: string;
		required?: boolean;
	} = $props();
</script>

<div role="radiogroup" aria-label={label} class="flex flex-wrap gap-2">
	{#each options as opt (opt)}
		<label
			class="cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold transition {value === opt
				? 'border-accent bg-accent text-bg'
				: 'border-line bg-white/[0.02] text-fg-soft hover:border-white/20'}"
		>
			<input type="radio" {name} value={opt} bind:group={value} {required} class="sr-only" />
			{opt}
		</label>
	{/each}
</div>
