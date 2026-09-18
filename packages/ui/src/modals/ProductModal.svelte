<script lang="ts">
	/* 상품 등록·수정 (js/70-campaign.js productModal) */
	import { D_, prod, spOf, exGradeOf, CATS, CAT_INFO, CAT_POLICY, GRADES, PLAT_RATE, act, closeModal, type Product, type SamplePolicy } from '@sellery/core';
	import Modal from '../components/Modal.svelte';
	let { pid }: { pid: string | null } = $props();
	const ed: Product | null = pid ? prod(pid) : null;
	const sp0 = ed ? spOf(ed) : { freeGrade: '실버', buyMode: 'auto', fixedPrice: 0, refund: false } as SamplePolicy;
	const locked = !!ed && D_().campaigns.some((c) => c.productId === ed.id && ['SCHEDULE_CONFIRMED', 'LIVE', 'CLEARING'].includes(c.status));
	let f = $state({
		name: ed?.name || '', desc: ed?.desc || '', cat: ed?.cat || '다이어트·체형', cp: ed?.cp || 39000, gp: ed?.gp || 29900,
		totalRate: ed ? Math.round((ed.rate + PLAT_RATE) * 100) : 30, stock: ed?.stock ?? 1000, sample: ed?.sample || '무상 1개',
		opts: ed?.options ? ed.options.map((o) => o.n + ' | ' + o.price).join('\n') : '',
		samplePolicy: { ...sp0 } as SamplePolicy, exclGrade: ed?.exclusive ? (exGradeOf(ed) as string) : '', exclLabel: ed?.exclusive?.label || '',
		thumb: ed?.thumb || null as string | null, imgs: ed?.imgs ? ed.imgs.slice() : [] as string[]
	});
	const rateCalc = $derived(f.totalRate > 10 ? `→ 플랫폼 <b>10%p</b> + 제안 수수료 <b style="color:var(--red)">${+(f.totalRate - 10).toFixed(1)}%</b> · 등급 보너스 포함 최대 <b>${+(f.totalRate - 10 + GRADES[0].bonus).toFixed(1)}%</b> (블랙, 보너스는 플랫폼 부담)` : '<span style="color:var(--danger)">총 수수료율은 플랫폼 몫(10%)보다 커야 합니다</span>');
	function pickThumb(e: Event) { const file = (e.target as HTMLInputElement).files?.[0]; if (file) act.fileToDataURL(file, 360, (u) => (f.thumb = u)); }
	function pickImgs(e: Event) { [...((e.target as HTMLInputElement).files || [])].slice(0, 4 - f.imgs.length).forEach((file) => act.fileToDataURL(file, 700, (u) => f.imgs.push(u))); }
	const submit = () => (ed ? act.saveProduct(ed.id, $state.snapshot(f)) : act.createProduct($state.snapshot(f)));
</script>

<Modal title={ed ? '상품 수정 — ' + ed.name : '새 상품 등록'} wide>
	{#if locked}<div class="notice" style="margin:0 0 12px">진행 중·확정된 판매가 있어 <b>판매가·수수료율은 변경할 수 없습니다</b>(신뢰 보호). 재고·샘플 정책·옵션·이미지·독점권은 수정 가능합니다.</div>{/if}
	<div class="fld"><label>상품명</label><input bind:value={f.name} placeholder="예: 콜라겐 부스터 샷" /></div>
	<div class="fld"><label>한 줄 설명</label><input bind:value={f.desc} placeholder="예: 저분자 콜라겐 · 30포" /></div>
	<div class="grid g2">
		<div class="fld"><label>썸네일 이미지 <span class="font-normal">— 누끼(배경 제거) PNG 권장</span></label>
			<div class="btnrow items-center"><label class="sm ghost" style="cursor:pointer"><input type="file" accept="image/*" hidden onchange={pickThumb} /><span>이미지 선택</span></label><span style="font-size:11.5px;color:var(--mute)">{#if f.thumb}✓ 첨부됨 <img src={f.thumb} alt="" style="height:28px;vertical-align:middle;margin-left:6px;border:1px solid var(--soft-line)" />{:else}미첨부{/if}</span></div></div>
		<div class="fld"><label>상세페이지 이미지 <span class="font-normal">(최대 4장)</span></label>
			<div class="btnrow items-center"><label class="sm ghost" style="cursor:pointer"><input type="file" accept="image/*" multiple hidden onchange={pickImgs} /><span>이미지 추가</span></label><span style="font-size:11.5px;color:var(--mute)">{f.imgs.length}장</span></div></div>
	</div>
	<div class="grid g2">
		<div class="fld"><label>독점권 오퍼 <span class="font-normal">(선택 · 등급 기준)</span></label>
			<select bind:value={f.exclGrade}><option value="">사용 안 함</option>{#each GRADES.slice(0, 4) as t}<option value={t.g}>{t.g} 등급 이상</option>{/each}</select></div>
		<div class="fld"><label>독점권 내용</label><input bind:value={f.exclLabel} placeholder="예: 인스타그램 판매 독점권 · 3개월" /></div>
	</div>
	<div class="fld"><label>카테고리 <span class="font-normal">— 건강·웰니스만 등록 가능</span></label><select bind:value={f.cat}>{#each CATS.filter((c) => c !== '전체') as c}<option value={c}>{c} — {CAT_INFO[c].desc} ({CAT_INFO[c].ex})</option>{/each}</select>
		<div style="font-size:11.5px;color:var(--mute);margin-top:5px">{CAT_POLICY} 범위 밖 상품은 검수에서 반려됩니다.</div></div>
	<div class="grid g2">
		<div class="fld"><label>소비자가 (₩)</label><input type="number" bind:value={f.cp} step="1000" disabled={locked} /></div>
		<div class="fld"><label>판매가 (₩)</label><input type="number" bind:value={f.gp} step="100" disabled={locked} /></div>
		<div class="fld"><label>총 수수료율 (%) — 플랫폼 10%p 포함</label><input type="number" bind:value={f.totalRate} min="11" max="50" disabled={locked} />
			<div style="font-size:11.5px;margin-top:5px;color:var(--mute)">{@html rateCalc}</div></div>
		<div class="fld"><label>재고</label><input type="number" bind:value={f.stock} step="100" /></div>
	</div>
	<div class="fld"><label>샘플 내용</label><input bind:value={f.sample} placeholder="예: 무상 1박스" /></div>
	<div class="card" style="padding:14px 16px;margin:4px 0 12px;background:var(--surface-2)"><div class="lbl-sm" style="margin-bottom:8px">🎁 샘플 정책</div>
		<div class="grid g2">
			<div class="fld"><label>무상 샘플 기준 등급 <span class="font-normal">(이상 · 1회)</span></label><select bind:value={f.samplePolicy.freeGrade}>{#each GRADES.slice().reverse() as t}<option value={t.g}>{t.g} 이상</option>{/each}</select>
				<div style="font-size:11px;color:var(--mute);margin-top:4px">권장: 3만원 미만 브론즈 · 3~8만원 실버 · 8만원 이상 골드</div></div>
			<div class="fld"><label>등급 미달 시 샘플 구매가</label><select bind:value={f.samplePolicy.buyMode}><option value="auto">자동 — 판매가 − 인플루언서 수수료</option><option value="fixed">브랜드 지정가 (1회 한정)</option></select>
				<input type="number" step="100" bind:value={f.samplePolicy.fixedPrice} placeholder="지정가 (₩) — 지정가 선택 시" style="margin-top:6px" /></div>
		</div>
		<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin-top:4px"><input type="checkbox" bind:checked={f.samplePolicy.refund} style="width:auto;margin:0" /> 판매 확정 시 샘플 구매액 환급 (신규 인플루언서 유입용)</label>
		<div style="font-size:11px;color:var(--mute);margin-top:6px">샘플 구매는 인플루언서 수수료 0의 판매 1건으로 정산됩니다(플랫폼 10% 동일). 인플루언서는 현금 또는 셀러리(1🥬=₩20,000)로 결제합니다.</div>
	</div>
	<div class="fld"><label>구매 옵션 <span class="font-normal">— 한 줄에 하나, "옵션명 | 가격" (비우면 1개/2개 세트/3개 세트 자동 생성)</span></label>
		<textarea rows="3" bind:value={f.opts} placeholder={'1박스 (30포) | 29900\n2박스 세트 | 56800\n3박스 + 쉐이커 | 79900'}></textarea></div>
	<p style="font-size:12px;color:var(--mute)">{ed ? '수정한 내용은 저장 즉시 인플루언서·고객 화면에 반영됩니다. 판매가·수수료율을 바꾸면 재검수가 필요할 수 있습니다.' : '등록 후 플랫폼 검수(관리자 탭)를 통과하면 인플루언서에게 노출됩니다. 고객 구매 페이지에는 옵션·가격·상세 이미지가 그대로 노출됩니다.'}</p>
	<div class="foot"><button onclick={closeModal}>취소</button>{#if ed}<button class="danger" onclick={() => act.deleteProduct(ed.id)}>삭제</button>{/if}<button class="pri" onclick={submit}>{ed ? '저장' : '검수 요청'}</button></div>
</Modal>
