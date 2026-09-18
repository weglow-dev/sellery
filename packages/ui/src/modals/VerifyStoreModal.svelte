<script lang="ts">
	import { camp, prod, seller, brand, gname, bgname, gfull, platIcon, PLAT_ICONS, md, P, CEL, CLEAR_DAYS, closeModal } from '@sellery/core';
	import Modal from '../components/Modal.svelte';
	let { cid }: { cid: string } = $props();
	const c = $derived(camp(cid)!), p = $derived(prod(c.productId)), s = $derived(seller(c.sellerId)), b = $derived(brand(p.brandId));
	const ch = $derived((s.channels || []).filter((x) => x.verified));
</script>

<Modal title="{CEL} 셀러리 판매 인증">
	<div class="notice" style="margin:8px 0 12px">이 판매 페이지는 셀러리가 발급한 정식 링크입니다. 사칭 링크는 이 인증 정보를 표시할 수 없습니다.</div>
	<table class="stmt" style="min-width:0;font-size:13px"><tbody>
		<tr><td>인증 링크</td><td class="num">sellery.co.kr/s/{s.handle.slice(1)}/{cid} <span class="st green" style="animation:none">유효</span></td></tr>
		<tr><td>판매 인플루언서</td><td class="num">{@html platIcon(s)} {s.name} {s.handle} · <span class="gradebox sm">{@html gfull(gname(s))}</span></td></tr>
		<tr><td>인증 채널</td><td class="num">{#each ch as x}{@html PLAT_ICONS[x.platform] || ''} {x.handle} ✓<br />{:else}—{/each}</td></tr>
		<tr><td>공급 브랜드</td><td class="num">{b.name} · <span class="gradebox sm">{@html gfull(bgname(b))}</span>{b.settleInfo && b.settleInfo.bizNo ? ` · 사업자 ${b.settleInfo.bizNo}` : ' · 인증 브랜드'}</td></tr>
		<tr><td>판매 기간</td><td class="num">{c.start ? md(P(c.start)) + ' – ' + md(P(c.end!)) : '—'}</td></tr>
		<tr><td>결제·정산</td><td class="num">셀러리 에스크로 보관 · 종료 후 {CLEAR_DAYS}일 환불 보호</td></tr>
	</tbody></table>
	<div class="foot"><button class="pri" onclick={closeModal}>닫기</button></div>
</Modal>
