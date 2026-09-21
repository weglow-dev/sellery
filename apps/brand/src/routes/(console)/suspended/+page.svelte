<script lang="ts">
	/** 이용 정지 안내 카드 — apps/influencer `(console)/suspended/+page.svelte` 의 브랜드 판. 폼 없음(고객센터 이메일 안내) · 로그아웃만 (콘솔 전용 auth/signout). */
	import { consolePath } from '@sellery/db/console-paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const signoutAction = `${consolePath('brand', '/auth/signout')}?next=${encodeURIComponent(consolePath('brand', '/login'))}`;
</script>

<svelte:head>
	<title>이용 정지 — 셀러리 파트너</title>
</svelte:head>

<div class="console-auth">
	<section class="card static">
		<div class="lbl-sm">브랜드 콘솔</div>
		<h2 class="console-title">이용이 정지되었습니다</h2>
		<p class="meta"><b>{data.name}</b> 의 브랜드 계정은 현재 이용이 정지된 상태예요. 진행 중이던 캠페인·주문·정산은 셀러리 운영팀이 별도로 안내드립니다.</p>
		<p class="meta" style="margin-top:8px">정지 사유 확인이나 이의 신청은 가입한 이메일로 <a href={data.company.csUrl}>{data.company.email}</a> 에 보내주세요.</p>
		<div class="foot">
			<span>{data.email}</span>
			<form method="post" action={signoutAction}>
				<button type="submit" class="ghost sm">로그아웃</button>
			</form>
		</div>
	</section>
</div>
