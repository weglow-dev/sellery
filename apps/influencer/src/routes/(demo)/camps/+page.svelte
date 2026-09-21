<script lang="ts">
	import { S, D_ } from '@sellery/core';
	import { CampRow, Calendar } from '@sellery/ui';
	const mine = $derived(D_().campaigns.filter((c) => c.sellerId === S.actingSeller).sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1)));
</script>
<h2 class="pg">내 캠페인 <small>클릭하면 캠페인 스레드로 이동</small></h2>
<div class="listcard">{#each mine as c}<CampRow {c} />{:else}<div class="empty">캠페인이 없습니다</div>{/each}</div>
<Calendar list={mine} />
