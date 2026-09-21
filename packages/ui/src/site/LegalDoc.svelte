<script lang="ts">
	/**
	 * 법적 고지 문서 렌더러 (/terms · /privacy · web legal-doc.tsx) — `@sellery/db/legal/{terms,privacy}` 데이터를 그대로 그린다.
	 *   .store > .card.static > article.legal : h1(title) · 버전/시행일 meta · intro · 목차(nav) · 조문(h2#id + 블록) · 부칙
	 *   블록 문자열 안의 `[텍스트](/경로)` 만 링크로 (legal/inline.ts) — `{@html}` 은 쓰지 않는다: 문서는 HTML 이 아니라 문자열 블록이고, 문구 편집자가 태그를 넣을 수 없어야 한다.
	 *   sections 가 비어 있으면(초안 스텁) 제목·시행일과 "준비 중" 안내만 렌더한다.
	 */
	import type { LegalDoc } from '@sellery/db/legal';
	import { APPENDIX_ID, fmtEffective } from './legal/inline';
	import LegalInline from './legal/LegalInline.svelte';
	import LegalBlock from './legal/LegalBlock.svelte';
	let { doc }: { doc: LegalDoc } = $props();
	const hasAppendix = $derived((doc.appendix?.length ?? 0) > 0);
	const hasBody = $derived(doc.sections.length > 0 || hasAppendix);
</script>

<div class="store">
	<div class="card static">
		<article class="legal">
			<h1>{doc.title}</h1>
			<p class="meta legal-meta">버전 {doc.version} · 시행일 {fmtEffective(doc.effectiveDate)}</p>
			{#if doc.intro}<p class="legal-intro"><LegalInline text={doc.intro} /></p>{/if}

			{#if hasBody}
				<nav class="legal-toc" aria-label="목차">
					<div class="lbl-sm">목차</div>
					<ol>
						{#each doc.sections as s (s.id)}<li><a href="#{s.id}">{s.heading}</a></li>{/each}
						{#if hasAppendix}<li><a href="#{APPENDIX_ID}">부칙</a></li>{/if}
					</ol>
				</nav>
			{:else}
				<div class="empty">문서를 준비하고 있어요 — 게시되면 이 페이지에서 볼 수 있습니다</div>
			{/if}

			{#each doc.sections as s (s.id)}
				<section class="legal-sec">
					<h2 id={s.id}>{s.heading}</h2>
					{#each s.blocks as b, i (i)}<LegalBlock block={b} />{/each}
				</section>
			{/each}

			{#if hasAppendix}
				<section class="legal-sec legal-appendix">
					<h2 id={APPENDIX_ID}>부칙</h2>
					{#each doc.appendix ?? [] as b, i (i)}<LegalBlock block={b} />{/each}
				</section>
			{/if}
		</article>
	</div>
</div>
