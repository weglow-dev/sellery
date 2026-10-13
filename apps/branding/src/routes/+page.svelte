<script lang="ts">
	let scrollY = $state(0);
	const scrolled = $derived(scrollY > 8);

	let toastShown = $state(false);
	let toastTimer: ReturnType<typeof setTimeout> | undefined;

	/** 모든 CTA 가 모이는 단일 진입점 — 제조의뢰 폼이 생기면 여기서 goto('/apply') 로 교체한다. */
	function startApply() {
		toastShown = true;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toastShown = false), 2800);
	}

	/** [data-reveal] 스크롤 리빌 — 화면에 들어오면 .revealed 를 붙이고 관찰을 끝낸다. */
	function reveal(node: HTMLElement) {
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) {
						(e.target as HTMLElement).classList.add('revealed');
						io.unobserve(e.target);
					}
				}
			},
			{ threshold: 0.15 }
		);
		for (const el of node.querySelectorAll<HTMLElement>('[data-reveal]')) io.observe(el);
		return { destroy: () => io.disconnect() };
	}

	const zeros = [
		{
			num: '0',
			unit: '박스',
			title: '재고 부담',
			desc: '생산량 결정도, 창고도, 남는 재고도 셀러리가 책임져요. 당신 집에 박스가 쌓일 일은 없어요.'
		},
		{
			num: '0',
			unit: '원',
			title: '초기 비용',
			desc: '제조 비용은 셀러리가 먼저 부담해요. 판매가 일어난 만큼만 정산하면 돼요.'
		},
		{
			num: '0',
			unit: '장',
			title: '준비 서류',
			desc: '인허가, 표시·광고 검토, 세금 처리 — 복잡한 행정은 전부 셀러리가 대신해요.'
		}
	];

	const steps = [
		{
			no: '01',
			title: '제조의뢰',
			desc: '만들고 싶은 제품을 알려주세요. 폼 하나 작성이면 충분해요.'
		},
		{
			no: '02',
			title: '컨셉 · 샘플',
			desc: '전담 매니저와 브랜드 컨셉을 잡고, 샘플을 직접 받아 확인해요.'
		},
		{
			no: '03',
			title: '생산 · 입고',
			desc: '검증된 제조 파트너가 생산하고, 셀러리 물류센터로 바로 입고돼요.'
		},
		{
			no: '04',
			title: '내 샵 오픈',
			desc: '내 이름을 건 샵이 열려요. 링크 하나 공유하면 판매 시작이에요.'
		}
	];

	const ops = [
		{ title: '주문 · 결제', desc: '결제 시스템과 주문 관리는 이미 준비돼 있어요.' },
		{ title: '포장 · 출고', desc: '주문이 들어오면 물류센터에서 바로 포장하고 보내요.' },
		{ title: '고객 CS', desc: '교환, 환불, 문의 응대까지 셀러리 운영팀이 맡아요.' },
		{ title: '정산 리포트', desc: '얼마나 팔렸는지, 얼마가 들어오는지 투명하게 보여드려요.' }
	];
</script>

<svelte:head>
	<title>셀러리 브랜딩 — 내 이름을 건 웰니스 브랜드</title>
	<meta
		name="description"
		content="재고 부담, 제조 비용, 행정 리스크 없이 나만의 다이어트·피부·웰니스 브랜드를 만들고 판매를 시작하세요. 제조부터 배송, CS까지 셀러리가 맡습니다."
	/>
	<meta property="og:title" content="셀러리 브랜딩 — 내 이름을 건 웰니스 브랜드" />
	<meta
		property="og:description"
		content="팔로워가 있다면, 브랜드도 가질 수 있어요. 제조·재고·운영은 전부 셀러리가 할게요."
	/>
</svelte:head>

<svelte:window bind:scrollY />

<!-- ───────── 헤더 ───────── -->
<header
	class="fixed inset-x-0 top-0 z-50 transition-all duration-300 {scrolled
		? 'border-b border-line bg-white/85 backdrop-blur-xl'
		: 'border-b border-transparent bg-transparent'}"
>
	<div class="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
		<a href="/" class="flex items-center gap-2 text-[17px] font-bold tracking-tight">
			<span class="grid size-7 place-items-center rounded-lg bg-blue text-sm font-extrabold text-white">B</span>
			Sellery&nbsp;Branding
		</a>
		<button
			onclick={startApply}
			class="rounded-xl bg-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-deep active:scale-95"
		>
			제조의뢰 시작하기
		</button>
	</div>
</header>

<main use:reveal>
	<!-- ───────── 히어로 ───────── -->
	<section class="relative overflow-hidden">
		<div
			class="pointer-events-none absolute -top-40 left-1/2 h-150 w-225 -translate-x-1/2 rounded-full bg-blue-soft opacity-60 blur-3xl"
		></div>
		<div class="relative mx-auto grid max-w-5xl gap-14 px-5 pt-36 pb-24 md:grid-cols-[1.15fr_0.85fr] md:items-center md:pt-44 md:pb-32">
			<div>
				<p
					data-reveal
					class="mb-5 inline-flex items-center gap-1.5 rounded-full bg-blue-soft px-3.5 py-1.5 text-[13px] font-semibold text-blue-deep"
				>
					<span class="size-1.5 rounded-full bg-blue"></span>
					인플루언서 전용 브랜드 메이킹
				</p>
				<h1
					data-reveal
					style="--reveal-delay: 0.08s"
					class="text-[40px] leading-[1.18] font-extrabold tracking-[-0.02em] md:text-[56px]"
				>
					팔로워가 있다면,<br />브랜드도 가질 수 있어요
				</h1>
				<p data-reveal style="--reveal-delay: 0.16s" class="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">
					다이어트, 피부, 웰니스 — 내 이름을 건 브랜드와 나만의 샵.
					만드는 일도, 쌓이는 재고도, 복잡한 행정도 전부 셀러리가 맡을게요.
				</p>
				<div data-reveal style="--reveal-delay: 0.24s" class="mt-9 flex flex-wrap items-center gap-3">
					<button
						onclick={startApply}
						class="rounded-2xl bg-blue px-7 py-4 text-[17px] font-bold text-white shadow-lg shadow-blue/25 transition hover:-translate-y-0.5 hover:bg-blue-deep hover:shadow-xl hover:shadow-blue/30 active:scale-95"
					>
						제조의뢰 시작하기
					</button>
					<a
						href="#how"
						class="rounded-2xl px-6 py-4 text-[17px] font-semibold text-ink-soft transition hover:bg-fill active:scale-95"
					>
						어떻게 진행되나요?
					</a>
				</div>
			</div>

			<!-- 내 샵 미리보기 목업 -->
			<div data-reveal style="--reveal-delay: 0.2s" class="relative mx-auto w-full max-w-70">
				<div class="float-slow rounded-[2.2rem] border border-line bg-white p-3 shadow-2xl shadow-ink/10">
					<div class="overflow-hidden rounded-[1.7rem] bg-fill">
						<div class="bg-gradient-to-br from-blue to-blue-deep px-5 pt-6 pb-5 text-white">
							<p class="text-[11px] font-semibold tracking-widest opacity-80">MY BRAND SHOP</p>
							<p class="mt-1 text-xl font-extrabold">JIYU WELLNESS</p>
							<p class="mt-0.5 text-xs opacity-80">@jiyu.daily · 팔로워 128K</p>
						</div>
						<div class="space-y-2.5 p-3.5">
							<div class="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
								<div class="size-12 shrink-0 rounded-xl bg-gradient-to-br from-blue-soft to-fill-deep"></div>
								<div class="min-w-0">
									<p class="truncate text-[13px] font-bold">글로우 콜라겐 젤리</p>
									<p class="text-xs text-ink-faint">피부 탄력 · 30일분</p>
									<p class="mt-0.5 text-[13px] font-extrabold text-blue">29,000원</p>
								</div>
							</div>
							<div class="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
								<div class="size-12 shrink-0 rounded-xl bg-gradient-to-br from-fill-deep to-blue-soft"></div>
								<div class="min-w-0">
									<p class="truncate text-[13px] font-bold">라이트핏 포만 쉐이크</p>
									<p class="text-xs text-ink-faint">식사 대용 · 14회분</p>
									<p class="mt-0.5 text-[13px] font-extrabold text-blue">34,000원</p>
								</div>
							</div>
							<div class="rounded-2xl bg-blue py-3 text-center text-sm font-bold text-white">구매하기</div>
						</div>
					</div>
				</div>
				<div
					class="float-badge absolute -top-4 -right-3 rounded-2xl border border-line bg-white px-3.5 py-2 text-[13px] font-bold shadow-lg"
				>
					🎉 오늘 오픈
				</div>
				<div
					class="float-badge2 absolute -bottom-4 -left-4 rounded-2xl border border-line bg-white px-3.5 py-2 text-[13px] font-bold shadow-lg"
				>
					📦 재고는 셀러리가
				</div>
			</div>
		</div>
	</section>

	<!-- ───────── 0 · 0 · 0 ───────── -->
	<section class="bg-fill py-24 md:py-32">
		<div class="mx-auto max-w-5xl px-5">
			<p data-reveal class="text-[15px] font-bold text-blue">부담은 셀러리가</p>
			<h2 data-reveal style="--reveal-delay: 0.06s" class="mt-3 text-[30px] leading-[1.25] font-extrabold tracking-[-0.02em] md:text-[40px]">
				시작하는 데 필요한 건<br />당신의 이름뿐이에요
			</h2>
			<div class="mt-12 grid gap-4 md:grid-cols-3">
				{#each zeros as z, i (z.title)}
					<div
						data-reveal
						style="--reveal-delay: {0.08 * i}s"
						class="group rounded-3xl bg-white p-8 shadow-sm transition duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-ink/8"
					>
						<p class="flex items-baseline gap-1">
							<span class="text-[52px] leading-none font-extrabold tracking-tight text-blue transition-transform duration-300 group-hover:scale-110 group-hover:[transform-origin:left_bottom]">
								{z.num}
							</span>
							<span class="text-lg font-bold text-ink-faint">{z.unit}</span>
						</p>
						<p class="mt-4 text-xl font-bold">{z.title}</p>
						<p class="mt-2 leading-relaxed text-ink-soft">{z.desc}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ───────── 진행 과정 ───────── -->
	<section id="how" class="scroll-mt-16 py-24 md:py-32">
		<div class="mx-auto max-w-5xl px-5">
			<p data-reveal class="text-[15px] font-bold text-blue">진행 과정</p>
			<h2 data-reveal style="--reveal-delay: 0.06s" class="mt-3 text-[30px] leading-[1.25] font-extrabold tracking-[-0.02em] md:text-[40px]">
				브랜드가 되기까지,<br />네 단계면 돼요
			</h2>
			<div class="mt-12 grid gap-4 md:grid-cols-4">
				{#each steps as s, i (s.no)}
					<div
						data-reveal
						style="--reveal-delay: {0.08 * i}s"
						class="group relative rounded-3xl border border-line p-7 transition duration-300 hover:border-blue hover:bg-blue-soft/40"
					>
						<p class="text-sm font-extrabold text-ink-faint transition-colors group-hover:text-blue">{s.no}</p>
						<p class="mt-3 text-lg font-bold">{s.title}</p>
						<p class="mt-2 text-[15px] leading-relaxed text-ink-soft">{s.desc}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ───────── 판매 이후 운영 ───────── -->
	<section class="bg-fill py-24 md:py-32">
		<div class="mx-auto grid max-w-5xl gap-12 px-5 md:grid-cols-[0.9fr_1.1fr] md:items-center">
			<div>
				<p data-reveal class="text-[15px] font-bold text-blue">판매가 시작된 뒤에도</p>
				<h2 data-reveal style="--reveal-delay: 0.06s" class="mt-3 text-[30px] leading-[1.25] font-extrabold tracking-[-0.02em] md:text-[40px]">
					당신은 콘텐츠만,<br />운영은 셀러리가
				</h2>
				<p data-reveal style="--reveal-delay: 0.12s" class="mt-5 max-w-sm leading-relaxed text-ink-soft">
					샵이 열린 뒤의 모든 일은 셀러리 몫이에요. 당신은 팔로워와 만나는 일에만 집중하세요.
				</p>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each ops as o, i (o.title)}
					<div
						data-reveal
						style="--reveal-delay: {0.07 * i}s"
						class="rounded-3xl bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-ink/8"
					>
						<p class="grid size-9 place-items-center rounded-xl bg-blue-soft text-[15px] font-extrabold text-blue">✓</p>
						<p class="mt-4 font-bold">{o.title}</p>
						<p class="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{o.desc}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ───────── 마지막 CTA ───────── -->
	<section id="start" class="scroll-mt-16 px-5 py-24 md:py-32">
		<div
			data-reveal
			class="mx-auto max-w-5xl rounded-[2.5rem] bg-ink px-6 py-20 text-center text-white md:py-28"
		>
			<h2 class="text-[32px] leading-[1.22] font-extrabold tracking-[-0.02em] md:text-[46px]">
				다음 웰니스 브랜드의<br />주인공은 당신이에요
			</h2>
			<p class="mx-auto mt-5 max-w-md text-[17px] leading-relaxed text-white/70">
				제조의뢰를 남기면 전담 매니저가 사흘 안에 연락드려요.
				상담은 무료이고, 아무 의무도 생기지 않아요.
			</p>
			<button
				onclick={startApply}
				class="mt-10 rounded-2xl bg-blue px-9 py-4.5 text-lg font-bold text-white shadow-lg shadow-blue/30 transition hover:-translate-y-0.5 hover:bg-blue-deep active:scale-95"
			>
				제조의뢰 시작하기
			</button>
		</div>
	</section>
</main>

<footer class="border-t border-line">
	<div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-10 text-sm text-ink-faint">
		<p class="font-semibold">Sellery Branding</p>
		<p>© 2026 Sellery. All rights reserved.</p>
	</div>
</footer>

<!-- CTA 토스트 — 제조의뢰 폼이 붙기 전까지의 임시 응답 -->
{#if toastShown}
	<div
		class="toast-in fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-ink px-5 py-3.5 text-[15px] font-semibold text-white shadow-2xl"
	>
		제조의뢰 폼을 준비하고 있어요 · 곧 열려요 🙌
	</div>
{/if}

<style>
	.float-slow {
		animation: float 6s ease-in-out infinite;
	}
	.float-badge {
		animation: float 5s ease-in-out 0.6s infinite;
	}
	.float-badge2 {
		animation: float 7s ease-in-out 1.2s infinite;
	}
	@keyframes float {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-10px);
		}
	}
	.toast-in {
		animation: toast-in 0.3s cubic-bezier(0.22, 1, 0.36, 1);
	}
	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translate(-50%, 12px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.float-slow,
		.float-badge,
		.float-badge2,
		.toast-in {
			animation: none;
		}
	}
</style>
