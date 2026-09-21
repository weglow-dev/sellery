<script lang="ts">
	/* 파트너 로그인 (login.html) — 이메일 · 구글(데모 선택). 카카오는 고객 전용이라 없음. */
	import { S, D_, LOGO_ICON, persistSession, toast, type Session } from '@sellery/core';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	/* `home` = 로그인 뒤 갈 데모 홈(접두 없는 경로) — 콘솔과 겹치지 않게 (demo) 그룹이 홈을 옮긴 앱은 '/demo' 를 넘긴다 */
	let { role: initRole = 'seller', home = '/' }: { role?: 'seller' | 'brand'; home?: string } = $props();
	let role = $state<'seller' | 'brand'>(initRole);
	let mode = $state<'login' | 'join' | 'reset'>('login');
	let email = $state(''), pw = $state(''), name = $state(''), msg = $state('');
	const ADMIN = { role: 'admin' as const, id: 'admin', name: '셀러리 운영팀', email: 'admin@sellery.co.kr' };
	const accounts = $derived<(Session & { label: string })[]>([
		...D_().sellers.filter((s) => s.email).map((s) => ({ role: 'seller' as const, id: s.id, name: s.name, email: s.email!, label: `${s.name} ${s.handle}` })),
		...D_().brands.filter((b) => b.email).map((b) => ({ role: 'brand' as const, id: b.id, name: b.name, email: b.email!, label: b.name })),
		{ ...ADMIN, label: '관리자' }
	]);
	const demo = $derived(accounts.filter((a) => a.role === role || a.role === 'admin'));
	function finish(ss: Session) {
		persistSession(ss); S.session = ss;
		if (ss.role === 'seller') S.actingSeller = ss.id; if (ss.role === 'brand') S.actingBrand = ss.id;
		toast(`${ss.name}님, 로그인했어요`); goto(base + home);
	}
	function login() {
		const e = email.trim().toLowerCase(); if (!e) { msg = '이메일을 입력해주세요'; return; }
		if (pw.length < 8) { msg = '비밀번호는 8자 이상이에요 (데모: 아무 문자열)'; return; }
		const acc = accounts.find((a) => (a.email || "").toLowerCase() === e); if (!acc) { msg = '등록되지 않은 이메일이에요 — 가입 탭에서 만들어주세요'; return; }
		if (acc.role !== 'admin' && acc.role !== role) { msg = `이 계정은 ${acc.role === 'seller' ? '인플루언서' : '브랜드'} 계정이에요 — 탭을 바꿔주세요`; return; }
		finish({ role: acc.role, id: acc.id, name: acc.name, email: acc.email });
	}
	function join() {
		const e = email.trim().toLowerCase(); if (!e || !name.trim() || pw.length < 8) { msg = '이름 · 이메일 · 8자 이상 비밀번호를 입력해주세요'; return; }
		if (accounts.some((a) => (a.email || "").toLowerCase() === e)) { msg = '이미 가입된 이메일이에요 — 로그인해주세요'; return; }
		finish({ role, id: role === 'seller' ? 's1' : 'b1', name: name.trim(), email: e }); // 프로토타입: 신규는 데모 첫 계정 데이터로 입장
	}
	function googleDemo(a: Session & { label: string }) { finish({ role: a.role, id: a.id, name: a.name, email: a.email, google: true }); }
	function fill(a: Session & { label: string }) { email = a.email!; pw = 'sellery2026'; }
</script>

<div class="login-wrap">
	<div>
		<div class="wordmark" style="display:inline-flex">{@html LOGO_ICON}SELLERY<span class="dot">.</span></div>
		<div class="ey" style="font-family:var(--font-mono);font-size:11px;letter-spacing:.3em;color:var(--red);font-weight:700;margin:26px 0 10px">→ SELLERY PARTNER CENTER</div>
		<h1 class="font-display" style="font-size:30px;font-weight:800;margin:0 0 12px;line-height:1.3">{role === 'seller' ? '인플루언서 센터에 로그인하세요.' : '브랜드 센터에 로그인하세요.'}</h1>
		<p style="font-size:13.5px;color:var(--mute);max-width:46ch">파트너 로그인은 이메일 기반이에요. 카카오 로그인은 고객 판매센터에서만 씁니다. 관리자 계정은 어느 탭에서든 로그인됩니다.</p>
		<div class="lbl-sm" style="margin:22px 0 8px">프로토타입 데모 계정 — 비밀번호는 8자 이상 아무거나</div>
		<div class="demo-list">{#each demo as a}<div class="acc"><span><b>{a.label}</b> <span style="color:var(--mute)">{a.email}</span></span><button class="sm ghost" onclick={() => fill(a)}>채우기</button></div>{/each}</div>
	</div>
	<div class="card" style="padding:22px">
		<div class="roletab"><button class={role === 'seller' ? 'on' : ''} onclick={() => (role = 'seller')}>인플루언서 센터</button><button class={role === 'brand' ? 'on' : ''} onclick={() => (role = 'brand')}>브랜드 센터</button></div>
		<div class="flex gap-2" style="margin-bottom:10px;font-size:12px">{#each [['login', '로그인'], ['join', '가입'], ['reset', '비밀번호 재설정']] as [k, l]}<button class="sm {mode === k ? '' : 'ghost'}" onclick={() => { mode = k as typeof mode; msg = ''; }}>{l}</button>{/each}</div>
		{#if mode === 'join'}<div class="fld"><label for="lg-name">이름 · 채널명</label><input id="lg-name" bind:value={name} placeholder="예: 지유" /></div>{/if}
		<div class="fld"><label for="lg-email">이메일</label><input id="lg-email" bind:value={email} type="email" placeholder="name@company.com" onkeydown={(e) => e.key === 'Enter' && login()} /></div>
		{#if mode !== 'reset'}<div class="fld"><label for="lg-pw">비밀번호</label><input id="lg-pw" bind:value={pw} type="password" placeholder="8자 이상" onkeydown={(e) => e.key === 'Enter' && (mode === 'login' ? login() : join())} /></div>{/if}
		{#if msg}<div style="font-size:12.5px;color:var(--danger);margin-bottom:10px">{msg}</div>{/if}
		{#if mode === 'login'}<button class="pri" style="width:100%" onclick={login}>로그인 →</button>
		{:else if mode === 'join'}<button class="pri" style="width:100%" onclick={join}>가입하고 시작하기 →</button>
		{:else}<button class="pri" style="width:100%" onclick={() => { toast('재설정 링크를 이메일로 보냈어요 (시뮬레이션)'); mode = 'login'; }}>재설정 메일 보내기</button>{/if}
		<div style="text-align:center;color:var(--mute);font-size:11.5px;margin:14px 0 10px">또는</div>
		<div class="lbl-sm" style="margin-bottom:6px">Google 계정으로 계속 (데모 — 계정을 고르면 바로 로그인)</div>
		<div class="demo-list">{#each demo.filter((a) => a.role !== 'admin') as a}<button class="acc" style="cursor:pointer;text-align:left" onclick={() => googleDemo(a)}><span><b>{a.name}</b> <span style="color:var(--mute)">{a.email}</span></span><span style="font-size:11px;color:var(--mute)">Google</span></button>{/each}</div>
		<p style="font-size:11px;color:var(--mute);margin-top:12px">실서비스: Google Identity Services 클라이언트 ID를 넣으면 실제 Google 계정 선택 창이 열립니다. 이메일 인증·비밀번호 재설정은 메일 발송으로 처리됩니다.</p>
	</div>
</div>
