<script lang="ts">
	/**
	 * 내 정보 — 프로토타입 demo-my(vBrandMy 브랜드 정보 카드 · 로고 · 담당자 · 추천 코드) + BrandGrade(등급 피라미드 · 다음 등급까지 · 혜택표) 를 props 로 이식 (docs/brand-console-plan.md §5 `/brand/my`).
	 *   브랜드 카드: 로고(업로드 `?/uploadLogo` · 제거 `?/removeLogo`) · 상호 · 카테고리 · 담당자 이름/연락처 · 소개 → `?/saveProfile`(실패 시 값 유지 · 필드 강조).
	 *   등급 카드(0019 app_brand_grade_card): 현재 등급(`brandGradeLine`) · 누적 GMV · 다음 등급까지 막대(`next`) · 수수료 할인(`brandDiscountLine`) · 무료 열람(`freeRefLine`) · 🥬 잔액 · 피라미드(tiers — 데모 pyrHtml).
	 *   추천 코드(`ref_code` + CopyButton) · 정산 정보 요약 → /settle · 계정(이메일 · 로그아웃 — 셸의 `POST /brand/auth/signout`).
	 *   `grade_cached`(정산 실행이 갱신하는 brands.grade) 가 실시간 등급과 다르면 작은 안내(§8 "실시간 등급").
	 */
	import { brandDiscountLine, brandGradeLine, freeRefLine } from '@sellery/db/brand/settle-rules';
	import { fmtNum, imageSrc } from '@sellery/db/campaign';
	import { consolePath } from '@sellery/db/console-paths';
	import { CopyButton, GradeBox, GradeIcon, StatusChip } from '@sellery/ui/site';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const p = $derived(data.profile);
	const card = $derived(data.card);
	const profileForm = $derived(form?.form === 'profile' ? form : null);
	const v = (k: string, fallback = '') => profileForm?.values?.[k] ?? fallback;
	const invalid = (k: string) => profileForm?.field === k;
	const logo = $derived(imageSrc(p?.logo_url));
	const joined = $derived(new Date(p?.created_at ?? data.brand.created_at));
	const nextPct = $derived(card?.next ? Math.min(100, Math.round((card.gmv / card.next.min_gmv) * 100)) : 100);
	const signoutAction = `${consolePath('brand', '/auth/signout')}?next=${encodeURIComponent(consolePath('brand', '/login'))}`;
	// 피라미드 — 데모 Pyramid.svelte: 위(블랙)에서 아래(스타터)로 넓어진다 · tiers 는 sort_order 오름차순(스타터 0 → 블랙 6)
	const pyramid = $derived([...(card?.tiers ?? [])].sort((a, b) => b.sort_order - a.sort_order));
</script>

<svelte:head>
	<title>내 정보 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>내 정보</h2>
	<span class="cel" title="셀러리 포인트 잔액">🥬 {data.balance}</span>
</div>

{#if data.msg}
	<p class={`notice ${data.msg.tone === 'ok' ? 'ok' : data.msg.tone === 'danger' ? 'danger' : ''}`} role="status">{data.msg.text}</p>
{/if}
{#if !p}
	<p class="notice danger" role="status">브랜드 정보를 불러오지 못했어요 — 잠시 후 새로고침해주세요.</p>
{/if}

<!-- ---------------- 브랜드 정보 ---------------- -->
<div class="sec" id="profile">브랜드 정보</div>
<section class="card static console-form console-brand-profile">
	<div class="console-brand-logo-row">
		<div class="console-brand-logo" aria-hidden={logo ? undefined : 'true'}>
			{#if logo}
				<img src={logo} alt="{p?.name ?? data.brand.name} 로고" />
			{:else}
				<span class="ph">{(p?.name ?? data.brand.name).slice(0, 1)}</span>
			{/if}
		</div>
		<div class="grow">
			<div class="nm">{p?.name ?? data.brand.name} <span class="chip brand">{p?.category ?? ''}</span> <GradeBox grade={card?.grade ?? data.brand.grade} sm /></div>
			<p class="meta" style="margin:4px 0 0">담당 {p?.manager_name ?? '—'}{#if p?.manager_phone}{' '}· {p.manager_phone}{/if} · 브랜드 코드 <b>{p?.code ?? data.brand.code ?? '—'}</b> · 입점 {joined.getFullYear()}.{joined.getMonth() + 1}.{joined.getDate()}</p>
			{#if form?.form === 'logo' && form.message}
				<p class="notice danger" role="alert" style="margin:8px 0 0">{form.message}</p>
			{/if}
			<div class="console-brand-logo-forms">
				<form method="post" action="?/uploadLogo" enctype="multipart/form-data" class="console-inline" style="margin-top:8px">
					<input id="my-logo" name="logo" type="file" accept={data.logoAccept} required aria-label="로고 파일" />
					<button type="submit" class="sm">{logo ? '로고 변경' : '로고 등록'}</button>
				</form>
				{#if logo}
					<form method="post" action="?/removeLogo" style="margin:0">
						<button type="submit" class="sm ghost">로고 지우기</button>
					</form>
				{/if}
			</div>
			<div class="hint">정사각형 PNG 권장 · JPG · PNG · WebP · GIF, {data.logoMaxMb}MB 이하 — 상품 상세 · 인플루언서 갤러리에 보여요.</div>
		</div>
	</div>

	{#if profileForm?.message}
		<p class="notice danger" role="alert">{profileForm.message}</p>
	{/if}
	<form method="post" action="?/saveProfile">
		<div class="console-grid2">
			<div class="fld" class:invalid={invalid('name')}>
				<label for="my-name">상호</label>
				<input id="my-name" name="name" value={v('name', p?.name ?? data.brand.name)} maxlength={data.limits.name} autocomplete="organization" required />
			</div>
			<div class="fld" class:invalid={invalid('category')}>
				<label for="my-category">카테고리</label>
				<select id="my-category" name="category" value={v('category', p?.category ?? '')} required>
					{#each data.categories as c (c)}
						<option value={c}>{c}</option>
					{/each}
				</select>
			</div>
			<div class="fld" class:invalid={invalid('manager_name')}>
				<label for="my-manager">담당자 이름</label>
				<input id="my-manager" name="manager_name" value={v('manager_name', p?.manager_name ?? '')} maxlength={data.limits.manager} autocomplete="name" required />
			</div>
			<div class="fld" class:invalid={invalid('manager_phone')}>
				<label for="my-phone">담당자 연락처 <span class="font-normal">(선택)</span></label>
				<input id="my-phone" name="manager_phone" value={v('manager_phone', p?.manager_phone ?? '')} inputmode="tel" autocomplete="tel" placeholder="010-1234-5678" maxlength={30} />
				<div class="hint">인플루언서에게는 보이지 않아요 — 운영팀 연락용.</div>
			</div>
		</div>
		<div class="fld" class:invalid={invalid('description')}>
			<label for="my-desc">브랜드 소개 <span class="font-normal">(선택 · {data.limits.description}자 이내)</span></label>
			<textarea id="my-desc" name="description" rows="4" maxlength={data.limits.description} placeholder="브랜드 철학 · 대표 상품 · 인플루언서에게 전하고 싶은 한마디">{v('description', p?.description ?? '')}</textarea>
		</div>
		<div class="btnrow" style="justify-content:flex-end">
			<button type="submit" class="pri sm">브랜드 정보 저장</button>
		</div>
	</form>
	<p class="meta" style="margin:10px 0 0">사업자등록번호 <span class="console-mask">{p?.biz_no_masked ?? '—'}</span> · 이메일 {data.email ?? '—'} 은 가입 정보라 여기서 바꾸지 않아요 — 변경이 필요하면 운영팀에 알려주세요.</p>
</section>

<!-- ---------------- 등급 카드 ---------------- -->
<div class="sec" style="margin-top:22px">브랜드 등급{#if card}{' '}— 상위 {card.top_pct}%{/if}</div>
{#if card}
	<div class="console-grid2 console-brand-grade">
		<div class="card static">
			<div class="lbl-sm">내 브랜드 등급</div>
			<div class="console-brand-grade-head">
				<GradeBox grade={card.grade} />
				<span class="gmv">₩{fmtNum(card.gmv)}</span>
				<span class="meta">누적 확정 매출</span>
			</div>
			<p class="meta" style="margin:0 0 8px">{brandGradeLine(card)}</p>
			{#if card.next}
				<div class="meter" role="progressbar" aria-valuenow={nextPct} aria-valuemin={0} aria-valuemax={100} aria-label="다음 등급까지"><span style="width:{nextPct}%"></span></div>
				<p class="meta" style="margin:7px 0 0">다음 등급 <b>{card.next.grade}</b>까지 <b style="color:var(--color-plat)">₩{fmtNum(card.next.remaining)}</b> · 누적 ₩{fmtNum(card.next.min_gmv)} 부터</p>
			{:else}
				<p class="meta" style="margin:0">최고 등급{#if card.perk}{' '}· {card.perk}{/if}</p>
			{/if}
			<dl class="console-kv" style="margin-top:12px">
				<dt>수수료 할인</dt>
				<dd>{brandDiscountLine(card.fee_discount)}</dd>
				<dt>데이터 열람</dt>
				<dd>{freeRefLine(card)}</dd>
				<dt>셀러리</dt>
				<dd>🥬 {card.celery_balance} <span class="meta">(확정 매출 ₩{fmtNum(card.celery_per_won)}당 1🥬 · 입점 이벤트 포함)</span></dd>
				{#if card.perk}
					<dt>혜택</dt>
					<dd>{card.perk}</dd>
				{/if}
			</dl>
			{#if card.grade_cached && card.grade_cached !== card.grade}
				<p class="meta" style="margin:10px 0 0">정산 실행 기준 등급은 <b>{card.grade_cached}</b> 예요 — 다음 정산 실행 때 {card.grade} 로 갱신돼요.</p>
			{/if}
		</div>
		<div class="card static">
			<div class="lbl-sm">등급별 혜택 — 브랜드</div>
			<div class="console-pyr" role="list" aria-label="브랜드 등급 피라미드">
				{#each pyramid as t, i (t.name)}
					<div class="console-pyr-row" class:me={t.name === card.grade} role="listitem" style="width:calc(128px + {(i * 11).toFixed(1)}%)">
						<span><GradeIcon grade={t.name} /> {t.name}{#if t.name === card.grade} <span class="mebadge">MY</span>{/if}</span><span class="pct">상위 {t.top_pct}%</span>
					</div>
				{/each}
			</div>
			<div class="console-brand-tiers">
				{#each card.tiers as t (t.name)}
					<div class="row" class:me={t.name === card.grade}>
						<span class="g"><GradeIcon grade={t.name} /> {t.name}</span>
						<span class="min">₩{fmtNum(t.min_gmv)}+</span>
						<span class="perk">{t.perk ?? (t.fee_discount > 0 ? `수수료 −${Math.round(t.fee_discount * 1000) / 10}%p` : '할인 없음')}{#if t.free_ref_per_month > 0 && !(t.perk ?? '').includes('열람')}{' '}· 무료 열람 월 {t.free_ref_per_month}회{/if}</span>
					</div>
				{/each}
			</div>
			<p class="meta" style="margin:12px 0 0">수수료 할인은 플랫폼 중개 수수료(10%)에서 차감 · 누적 확정 매출(GMV) 기준 · 정산 실행 때 등급이 갱신돼요.</p>
		</div>
	</div>
{:else}
	<p class="notice danger" role="status">등급 정보를 불러오지 못했어요 — 잠시 후 새로고침해주세요.</p>
{/if}

<!-- ---------------- 추천 코드 ---------------- -->
{#if p?.ref_code}
	<div class="sec" style="margin-top:22px">브랜드 추천 코드</div>
	<section class="card static">
		<div class="console-inline" style="margin-top:0">
			<span class="console-code lg">{p.ref_code}</span>
			<CopyButton text={p.ref_code} label="코드 복사" />
		</div>
		<ul class="console-privacy" style="margin-top:10px">
			<li><b>나 (추천 브랜드)</b> — 새 브랜드의 첫 3회 판매, <b>확정 매출의 1%</b> 리워드</li>
			<li><b>새 브랜드</b> — 가입 폼에 코드 입력 시 첫 3회 판매 <b>플랫폼 수수료 −1%p</b></li>
			<li>둘 다 <b>플랫폼 수수료에서 부담</b> — 인플루언서 수수료엔 영향 없음</li>
		</ul>
	</section>
{/if}

<!-- ---------------- 정산 정보 · 계정 ---------------- -->
<div class="sec" style="margin-top:22px">
	정산 정보
	{#if data.settle}
		<StatusChip tone={data.settle.complete ? 'green' : 'red'}>{data.settle.complete ? '등록 완료' : '미등록 — 등록 전까지 정산 지급 보류'}</StatusChip>
	{/if}
</div>
<section class="card static">
	<div class="mini-stats" style="margin:0 0 10px">
		<div><span class="ms-l">정산 계좌</span><span class="ms-v">{data.settle?.has_bank_info ? '등록 완료' : '미등록'}</span><span class="ms-s">판매 종료 D+21 지급</span></div>
		<div><span class="ms-l">사업자등록번호</span><span class="ms-v">{data.settle?.has_biz_no ? '등록 완료' : '미등록'}</span><span class="ms-s">가입 정보 · 변경은 운영팀</span></div>
		<div><span class="ms-l">사업자등록증</span><span class="ms-v">{data.settle?.has_biz_doc ? '등록됨' : '미등록'}</span><span class="ms-s">비공개 저장소</span></div>
		<div><span class="ms-l">세금계산서 정보</span><span class="ms-v">{data.settle?.has_tax_info ? '등록 완료' : '미등록'}</span><span class="ms-s">상호 · 대표자 · 이메일</span></div>
	</div>
	<p class="meta" style="margin:0 0 10px">계좌 · 사업자등록증 · 세금계산서 수신 정보는 정산 화면에서 등록하고, 정산 내역과 실시간 매출도 거기서 확인해요.</p>
	<div class="btnrow">
		<a href={data.settlePath} class="btn {data.settle?.complete ? 'ghost' : 'pri'} sm">{data.settle?.complete ? '정산 정보 · 내역 보기' : '정산 정보 등록'}</a>
		<a href={data.salesPath} class="btn ghost sm">실시간 매출</a>
	</div>
</section>

<div class="sec" style="margin-top:22px">계정</div>
<section class="card static">
	<dl class="console-kv">
		<dt>이메일</dt>
		<dd>{data.email ?? '—'}</dd>
		<dt>브랜드 코드</dt>
		<dd>{p?.code ?? data.brand.code ?? '—'}</dd>
	</dl>
	<div class="btnrow" style="margin-top:12px">
		<form method="post" action={signoutAction} style="margin:0">
			<button type="submit" class="ghost sm">로그아웃</button>
		</form>
	</div>
</section>
