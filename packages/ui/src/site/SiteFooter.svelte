<script lang="ts">
	/**
	 * 전역 푸터 (ux-spec §2.3 · web footer.tsx):
	 *   1행 [원문] 통신판매중개자 고지 · 고객센터(이메일) · sellery.life
	 *   2행 (주)위글로우 사업자 정보 — @sellery/db company.ts (플레이스홀더는 "확인 중" 으로 노출)
	 *   3행 셀러리 소개(/about) · 인플루언서(/influencers) · 이용약관 · 개인정보처리방침 — 문서 URL 이 비어 있으면 링크 대신 텍스트
	 * 링크 페이지는 이 위에 페이지 전용 `.store-foot`(브랜드명 · #광고) 가 한 번 더 온다 (StoreView).
	 */
	import { COMPANY, warnIfCompanyPending } from '@sellery/db/company';
	import Cel from './icons/Cel.svelte';
	warnIfCompanyPending();
	const external = /^https?:\/\//.test(COMPANY.csUrl);
</script>

<footer class="site-footer">
	<div class="store-foot">
		<Cel /> <b>SELLERY</b> · 셀러리는 통신판매중개자로 거래 당사자가 아니며, 상품·거래 정보의 책임은 공급 브랜드에 있습니다 ·
		<a href={COMPANY.csUrl} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>{COMPANY.csLabel}</a>
		· {COMPANY.siteHost}
	</div>
	<div class="store-foot">
		{COMPANY.name} · 대표 {COMPANY.ceo} · 사업자등록번호 {COMPANY.bizNo} · 통신판매업신고 {COMPANY.mailOrderNo} · 주소 {COMPANY.address} · 이메일 <a href="mailto:{COMPANY.email}">{COMPANY.email}</a>
	</div>
	<div class="store-foot">
		<a href="/about">셀러리 소개</a> · <a href="/influencers">인플루언서</a>
		· {#if COMPANY.termsUrl}<a href={COMPANY.termsUrl}>이용약관</a>{:else}<span>이용약관</span>{/if}
		· {#if COMPANY.privacyUrl}<a href={COMPANY.privacyUrl}>개인정보처리방침</a>{:else}<span>개인정보처리방침</span>{/if}
	</div>
</footer>
