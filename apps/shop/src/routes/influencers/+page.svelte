<script lang="ts">
	import { S, D_, custVisible, gname, platIcon, fmt, go } from '@sellery/core';
	import { Avatar, GradeBox } from '@sellery/ui';
	const list = $derived(D_().sellers.filter((s) => !s.hidden));
</script>

<h2 class="pg">인플루언서 <small>셀러리 인증 인플루언서 — 진행 중·예정 판매를 확인하세요</small></h2>
<div class="grid g3">
	{#each list as s}{@const cs = D_().campaigns.filter((c) => c.sellerId === s.id && custVisible(c))}{@const live = cs.filter((c) => c.status === 'LIVE').length}{@const soon = cs.filter((c) => c.status === 'SCHEDULE_CONFIRMED').length}{@const done = cs.filter((c) => ['SETTLED', 'CLEARING'].includes(c.status)).length}
		<div class="card" role="button" tabindex="0" style="cursor:pointer" onclick={() => { S.ui.custSel = s.id; go.screen('home'); }} onkeydown={(e) => e.key === 'Enter' && (S.ui.custSel = s.id, go.screen('home'))}>
			<div class="flex gap-3 items-center"><Avatar {s} sz={52} /><div><div><b style="font-size:15px">{s.name}</b> <GradeBox g={gname(s)} /></div><div style="font-size:12px;color:var(--mute)">{@html platIcon(s)} {s.handle} · 팔로워 {fmt(s.followers)} · 채널 인증 ✓</div></div></div>
			<div class="meta" style="margin-top:8px">{s.intro}</div>
			<div class="flex gap-1.5 flex-wrap" style="margin-top:10px"><span class="st {live ? 'green' : 'gray'}" style="animation:none">진행 중 {live}</span><span class="st blue" style="animation:none">오픈 예정 {soon}</span><span class="st gray" style="animation:none">완료 {done}</span></div>
		</div>
	{/each}
</div>
