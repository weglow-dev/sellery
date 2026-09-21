<script lang="ts" module>
	/** 수량 1 ≤ q ≤ 10 클램프 (ux-spec §1.6 · web store/qty-stepper.tsx) */
	export const QTY_MIN = 1;
	export const QTY_MAX = 10;
	export function clampQty(q: number): number {
		if (!Number.isFinite(q)) return QTY_MIN;
		return Math.min(QTY_MAX, Math.max(QTY_MIN, Math.trunc(q)));
	}
</script>

<script lang="ts">
	/** 수량 `.qty` `− {q} +` (ux-spec §1.4) */
	let { value, onChange, sm = false }: { value: number; onChange: (q: number) => void; sm?: boolean } = $props();
</script>

<div class={sm ? 'qty sm' : 'qty'} role="group" aria-label="수량">
	<button type="button" aria-label="수량 줄이기" onclick={() => onChange(clampQty(value - 1))} disabled={value <= QTY_MIN}>−</button>
	<span aria-live="polite">{value}</span>
	<button type="button" aria-label="수량 늘리기" onclick={() => onChange(clampQty(value + 1))} disabled={value >= QTY_MAX}>+</button>
</div>
