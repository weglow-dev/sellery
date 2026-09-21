<script lang="ts">
	/**
	 * 데모 띠 — brand · admin · influencer 데모 앱의 맨 위 한 줄 (docs/monorepo-migration.md §6 · 결정 D · S4 PR-7).
	 * S4 부터 sellery.life/brand · /admin 이 프로덕션 경로에 노출되므로 "실제 서비스가 아니다 · 데이터는 이 브라우저(localStorage)에만 있다" 를 항상 보인다.
	 * 닫기 버튼 없음(세션·쿠키로 숨기지 않는다). 색은 theme.css(legacy skin) 토큰 — 윈도우 타이틀바와 같은 --bar / --bar-fg, 픽셀 폰트 --px11.
	 * 검색 제외는 각 앱 app.html 의 <meta name="robots" content="noindex, nofollow"> + routes/robots.txt/+server.ts 가 맡는다(이 컴포넌트는 화면 표시만).
	 */
	let { siteUrl = 'https://sellery.life' }: { siteUrl?: string } = $props();
</script>

<div class="demo-banner" role="note" aria-label="데모 화면 안내">
	<span class="demo-banner-tag">DEMO</span>
	<span class="demo-banner-text">데모 화면 · 데이터는 이 브라우저에만 저장됩니다 · 실제 서비스는 <a href={siteUrl}>sellery.life</a></span>
</div>

<style>
	.demo-banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		flex-wrap: wrap;
		padding: 6px 14px;
		background: var(--bar);
		color: var(--bar-fg);
		font-family: var(--px11);
		font-size: 12px;
		line-height: 1.5;
		letter-spacing: 0;
		text-align: center;
		word-break: keep-all;
	}
	.demo-banner-tag {
		display: inline-block;
		padding: 1px 7px;
		background: var(--yellow);
		color: var(--ink);
		font-size: 11px;
		letter-spacing: 1px;
	}
	.demo-banner a {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.demo-banner a:hover {
		color: #fff;
	}
</style>
