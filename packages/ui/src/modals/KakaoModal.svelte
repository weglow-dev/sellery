<script lang="ts">
	import { KAKAO_DEMO, KAKAO_ICON, act } from '@sellery/core';
	import Modal from '../components/Modal.svelte';
</script>

<Modal>
	<div class="kwin">
		<div class="khd">{@html KAKAO_ICON} <b>카카오계정으로 로그인</b><div class="ksub">셀러리 고객 로그인은 카카오만 지원해요</div></div>
		<div class="klist">
			{#each KAKAO_DEMO as a}<button onclick={() => act.kakaoPick(a.id)}><span class="kav">{a.name[0]}</span><span><b>{a.name}</b><small>{a.email}</small></span></button>{/each}
			<button onclick={() => act.kakaoPick('__other')}><span class="kav" style="background:#eee;color:#555">+</span><span><b>다른 카카오계정</b><small>데모 — 이름만 입력</small></span></button>
		</div>
		<div class="kft">데모 화면 · 실서비스에서는 카카오 로그인 창이 열리고 동의 후 바로 로그인됩니다</div>
	</div>
</Modal>
