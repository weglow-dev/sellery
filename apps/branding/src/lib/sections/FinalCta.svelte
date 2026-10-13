<script lang="ts">
	import { reveal } from '../reveal';
	import { startApply } from '../cta.svelte';
</script>

<section id="start" use:reveal class="scroll-mt-16 bg-bg px-5 py-24 md:py-32">
	<div
		data-reveal
		class="mx-auto max-w-5xl rounded-[2.5rem] px-6 py-20 text-center text-fg md:py-28"
		style="background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-2) 65%, #140c24 100%)"
	>
		<h2 class="text-[32px] leading-[1.22] font-extrabold tracking-[-0.02em] md:text-[46px]">
			다음 웰니스 브랜드의<br />주인공은 당신이에요
		</h2>
		<p class="mx-auto mt-5 max-w-md text-[17px] leading-relaxed text-white/80">
			제조의뢰를 남기면 전담 매니저가 사흘 안에 연락드려요.
			상담은 무료이고, 아무 의무도 생기지 않아요.
		</p>
		<button
			onclick={startApply}
			class="mt-10 rounded-2xl bg-bg px-9 py-4.5 text-lg font-bold text-fg shadow-xl shadow-black/30 transition hover:-translate-y-0.5 hover:bg-black active:scale-95"
		>
			제조의뢰 시작하기
		</button>
	</div>
</section>
