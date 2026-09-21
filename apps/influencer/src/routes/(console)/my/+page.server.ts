import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import type { Database } from '@sellery/db/database.types';
import { isPlatform } from '@sellery/db/partner/signup-rules';
import { parseShippingInput, parseStoredShipping } from '@sellery/db/partner/sample-rules';
import { cleanText } from '@sellery/db/text';
import { createAdminClient, type Admin } from '$lib/server/db';
import { notifySlack, rateLimit, requireSeller, saveSampleAddress, sellerPath, type SellerReady } from '$lib/server/partner';

/**
 * `/my` — 마이페이지 2단계 (web influencer/my/page.tsx + actions.ts 1:1 · docs/inf-console-plan.md §4.7 · §6 `/my` · docs/monorepo-migration.md §2.4 · §5.2).
 * load: 프로필(활동명·핸들·등급·🥬·추천 코드) + 채널 목록 3칩(✓ 인증됨 / 인증 대기 / 미인증) + 인증 패널 (프로토타입 vMy · channelModal · verifyModal). 정산 정보 폼은 5단계 `/settle` — 여기는 등록 여부 요약 + 링크만.
 *   ?verify=<id>  인증 패널(코드 + 방법 1 프로필 bio · 방법 2 @sellery.official DM) — vcode 가 있는 본인 채널만
 *   ?edit=<id> | ?add=1  채널 폼   ?msg=<code>  안내 문구(MY_MESSAGES)
 * 칩 규칙(§4.7): verified → "✓ 인증됨", vcode_confirmed_at → "인증 대기"(운영자 확인 중), 그 외 → "미인증". 읽기는 service role + seller_id 필터.
 *
 * actions(web 서버 액션 5개 → 이름 있는 form actions, 폼은 `action="?/issueVerifyCode"`): 전부 requireSeller() → rate limit → `seller_id` 필터로만 읽고 쓴다
 * (클라이언트가 보낸 채널 id 는 본인 행일 때만 통과). 결과는 `redirect(303, /influencer/my?msg=<code>)`(web `back(ctx, query)`). CSRF 는 SvelteKit 내장.
 *   issueVerifyCode  [인증하기]  vcode 'SLRY-XXXX' 발급·저장(이미 있으면 재사용) → /my?verify=<id>
 *   confirmVerify    [인증 확인]  **vcode_confirmed_at=now() 만 기록** — verified=true 전환은 운영자(partner-admin.mjs verify-channel)만
 *   setPrimaryCh     [메인 SNS로 설정]  verified 채널만 · sellers.platform/handle/followers 동기화
 *   saveChannel      추가·수정  핸들/플랫폼이 바뀌면 verified=false, vcode=null, vcode_confirmed_at=null (primary 는 유지)
 *   deleteChannel    삭제  primary 불가
 *   saveAddress      샘플 배송지(3단계)  `parseShippingInput` → `saveSampleAddress`(sellers.sample_address) — 상품 상세 무상 요청 폼 · 4단계 결제 폼의 프리필
 */
type Ch = Database['public']['Tables']['seller_channels']['Row'];

export type MyMessage = { tone: 'ok' | 'danger' | 'info'; text: string };

const MY_MESSAGES: Record<string, MyMessage> = {
	confirmed: { tone: 'ok', text: '인증 확인을 요청했어요 — 운영팀이 프로필 또는 DM 에서 코드를 확인하면 ✓ 인증됨 으로 바뀝니다 (보통 1영업일 이내).' },
	already_verified: { tone: 'info', text: '이미 인증된 채널이에요.' },
	primary: { tone: 'ok', text: '메인 SNS 를 바꿨어요 — 갤러리·필터에 이 채널 기준으로 노출됩니다.' },
	primary_nosync: { tone: 'info', text: '메인 SNS 는 바뀌었지만 프로필 핸들 동기화는 건너뛰었어요 — 같은 핸들을 다른 인플루언서가 쓰고 있어요.' },
	saved: { tone: 'ok', text: '채널을 수정했어요.' },
	saved_reverify: { tone: 'info', text: '채널을 수정했어요 — 사칭 방지를 위해 재인증이 필요합니다.' },
	added: { tone: 'ok', text: '채널을 추가했어요 — 인증을 진행해주세요.' },
	deleted: { tone: 'ok', text: '채널을 삭제했어요.' },
	err_primary_delete: { tone: 'danger', text: '메인 SNS 채널은 삭제할 수 없어요 — 먼저 다른 채널을 메인으로 설정하세요.' },
	err_not_verified: { tone: 'danger', text: '인증된 채널만 메인 SNS 로 설정할 수 있어요.' },
	err_handle_taken: { tone: 'danger', text: '같은 플랫폼에 이미 등록된 핸들이에요.' },
	address_saved: { tone: 'ok', text: '샘플 배송지를 저장했어요 — 상품 상세의 무상 샘플 요청 폼에 기본값으로 채워집니다.' },
	err_address: { tone: 'danger', text: '배송지를 확인해주세요 — 수취인 · 연락처(숫자 8~15자리) · 우편번호 · 주소는 필수예요.' },
	err_input: { tone: 'danger', text: '입력값을 확인해주세요.' },
	err_rate: { tone: 'danger', text: '요청이 너무 많아요 — 잠시 후 다시 시도해주세요.' },
	err_db: { tone: 'danger', text: '저장 중 문제가 생겼어요 — 잠시 후 다시 시도해주세요.' }
};

const CHANNEL_COLS = 'id, code, platform, handle, url, followers, verified, is_primary, vcode, vcode_confirmed_at, created_at';

export const load: PageServerLoad = async (event) => {
	const r = await requireSeller(event, { next: '/my' });
	if (!r.ok) redirect(303, r.location);
	const { seller, balance } = r.ctx;

	const admin = createAdminClient();
	const { data: channels, error } = await admin
		.from('seller_channels')
		.select(CHANNEL_COLS)
		.eq('seller_id', seller.id)
		.order('is_primary', { ascending: false })
		.order('created_at', { ascending: true });
	if (error) throw new Error(`seller_channels read failed: ${error.message}`);
	const list = channels ?? [];

	const sp = event.url.searchParams;
	const msg = MY_MESSAGES[sp.get('msg') ?? ''] ?? null;
	const verifyId = sp.get('verify');
	const verifying = verifyId ? (list.find((c) => c.id === verifyId && c.vcode && !c.verified) ?? null) : null;
	const editId = sp.get('edit');
	const editing = editId ? (list.find((c) => c.id === editId) ?? null) : null;
	const adding = sp.get('add') === '1';

	return {
		seller,
		balance,
		channels: list,
		msg,
		verifying,
		editing,
		adding,
		shipping: parseStoredShipping(seller.sample_address),
		invalidField: sp.get('field'),
		myPath: sellerPath('/my'),
		settlePath: sellerPath('/settle')
	};
};

// ------------------------------------------------------------
// form actions
// ------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VCODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0010 partner_random_code 와 같은 알파벳 (0/O · 1/I 제외)

function newVcode(): string {
	const buf = new Uint8Array(4);
	crypto.getRandomValues(buf);
	let out = '';
	for (const b of buf) out += VCODE_ALPHABET[b % VCODE_ALPHABET.length];
	return `SLRY-${out}`;
}

function idOf(formData: FormData): string | null {
	const v = formData.get('id');
	return typeof v === 'string' && UUID_RE.test(v) ? v : null;
}

/** web `back(ctx, query)` — 항상 /influencer/my 로 303 */
function back(query: string): never {
	redirect(303, `${sellerPath('/my')}${query ? `?${query}` : ''}`);
}

/** 공통 진입 — 게이트 · 레이트리밋 (실패 시 /my?msg=err_rate) · 폼 파싱 */
async function enter(event: RequestEvent, action: string): Promise<{ ctx: SellerReady; admin: Admin; formData: FormData }> {
	const r = await requireSeller(event, { next: '/my' });
	if (!r.ok) redirect(303, r.location);
	if (!rateLimit(`${action}:${r.ctx.user.id}`)) back('msg=err_rate');
	return { ctx: r.ctx, admin: createAdminClient(), formData: await event.request.formData() };
}

async function ownChannel(admin: Admin, ctx: SellerReady, id: string): Promise<Ch | null> {
	const { data, error } = await admin.from('seller_channels').select('*').eq('id', id).eq('seller_id', ctx.seller.id).maybeSingle();
	if (error) {
		console.error('[my] channel read failed:', error.message);
		return null;
	}
	return data ?? null;
}

export const actions: Actions = {
	issueVerifyCode: async (event) => {
		const { ctx, admin, formData } = await enter(event, 'verify');
		const id = idOf(formData);
		if (!id) back('msg=err_input');
		const ch = await ownChannel(admin, ctx, id);
		if (!ch) back('msg=err_input');
		if (ch.verified) back('msg=already_verified');
		if (!ch.vcode) {
			const { error } = await admin.from('seller_channels').update({ vcode: newVcode() }).eq('id', ch.id).eq('seller_id', ctx.seller.id);
			if (error) {
				console.error('[my] issueVerifyCode failed:', error.message);
				back('msg=err_db');
			}
		}
		back(`verify=${ch.id}`);
	},

	confirmVerify: async (event) => {
		const { ctx, admin, formData } = await enter(event, 'verify');
		const id = idOf(formData);
		if (!id) back('msg=err_input');
		const ch = await ownChannel(admin, ctx, id);
		if (!ch) back('msg=err_input');
		if (ch.verified) back('msg=already_verified');
		if (!ch.vcode) back(`verify=${ch.id}`);
		const { error } = await admin
			.from('seller_channels')
			.update({ vcode_confirmed_at: new Date().toISOString() })
			.eq('id', ch.id)
			.eq('seller_id', ctx.seller.id);
		if (error) {
			console.error('[my] confirmVerify failed:', error.message);
			back('msg=err_db');
		}
		// 이메일·핸들·URL 없이 (§4.3)
		void notifySlack(`[셀러리] 채널 인증 확인 요청 · ${ch.code ?? ch.id} · ${ch.platform} · ${ctx.seller.code ?? ctx.seller.id}`);
		back('msg=confirmed');
	},

	setPrimaryCh: async (event) => {
		const { ctx, admin, formData } = await enter(event, 'channel');
		const id = idOf(formData);
		if (!id) back('msg=err_input');
		const ch = await ownChannel(admin, ctx, id);
		if (!ch) back('msg=err_input');
		if (!ch.verified) back('msg=err_not_verified');
		if (ch.is_primary) back('msg=primary');

		// 부분 유니크 (seller_id) where is_primary — 먼저 내리고 올린다
		const unset = await admin.from('seller_channels').update({ is_primary: false }).eq('seller_id', ctx.seller.id).eq('is_primary', true);
		if (unset.error) {
			console.error('[my] setPrimaryCh unset failed:', unset.error.message);
			back('msg=err_db');
		}
		const set = await admin.from('seller_channels').update({ is_primary: true }).eq('id', ch.id).eq('seller_id', ctx.seller.id);
		if (set.error) {
			console.error('[my] setPrimaryCh set failed:', set.error.message);
			back('msg=err_db');
		}
		const sync: Database['public']['Tables']['sellers']['Update'] = { platform: ch.platform, handle: ch.handle };
		if (ch.followers > 0) sync.followers = ch.followers;
		const s = await admin.from('sellers').update(sync).eq('id', ctx.seller.id);
		if (s.error) {
			// sellers.handle unique 충돌(다른 인플루언서가 같은 핸들) 등 — primary 는 바뀌었으므로 안내만
			console.error('[my] setPrimaryCh sellers sync failed:', s.error.message);
			back('msg=primary_nosync');
		}
		back('msg=primary');
	},

	saveChannel: async (event) => {
		const { ctx, admin, formData } = await enter(event, 'channel');
		const rawId = formData.get('id');
		const id = typeof rawId === 'string' && rawId ? (UUID_RE.test(rawId) ? rawId : null) : null;
		if (typeof rawId === 'string' && rawId && !id) back('msg=err_input');

		const platformRaw = formData.get('platform');
		const platform = typeof platformRaw === 'string' ? platformRaw.trim().toLowerCase() : '';
		if (!isPlatform(platform)) back('msg=err_input');
		const handleRaw = formData.get('handle');
		const handle = cleanText(typeof handleRaw === 'string' ? handleRaw : '').slice(0, 60);
		if (!handle) back('msg=err_input');
		const urlRaw = formData.get('url');
		const url = cleanText(typeof urlRaw === 'string' ? urlRaw : '').slice(0, 200) || null;
		const folRaw = formData.get('followers');
		const followers = typeof folRaw === 'string' && folRaw.trim() ? Number.parseInt(folRaw.replace(/[^\d]/g, ''), 10) : 0;
		if (!Number.isFinite(followers) || followers < 0 || followers > 1_000_000_000) back('msg=err_input');

		if (id) {
			const ch = await ownChannel(admin, ctx, id);
			if (!ch) back('msg=err_input');
			const changed = ch.handle !== handle || ch.platform !== platform;
			const patch: Database['public']['Tables']['seller_channels']['Update'] = { platform, handle, url, followers };
			if (changed) {
				// 사칭 방지 — 재인증 대기로 초기화 (primary 는 유지, 0001 주석)
				patch.verified = false;
				patch.vcode = null;
				patch.vcode_confirmed_at = null;
			}
			const { error } = await admin.from('seller_channels').update(patch).eq('id', ch.id).eq('seller_id', ctx.seller.id);
			if (error) {
				console.error('[my] saveChannel update failed:', error.message);
				back(error.code === '23505' ? 'msg=err_handle_taken' : 'msg=err_db');
			}
			back(changed ? 'msg=saved_reverify' : 'msg=saved');
		}

		// 추가 — 채널이 하나도 없으면 첫 채널을 메인으로
		const { count } = await admin.from('seller_channels').select('id', { count: 'exact', head: true }).eq('seller_id', ctx.seller.id);
		const { error } = await admin.from('seller_channels').insert({
			seller_id: ctx.seller.id,
			platform,
			handle,
			url,
			followers,
			verified: false,
			is_primary: (count ?? 0) === 0
		});
		if (error) {
			console.error('[my] saveChannel insert failed:', error.message);
			back(error.code === '23505' ? 'msg=err_handle_taken' : 'msg=err_db');
		}
		back('msg=added');
	},

	deleteChannel: async (event) => {
		const { ctx, admin, formData } = await enter(event, 'channel');
		const id = idOf(formData);
		if (!id) back('msg=err_input');
		const ch = await ownChannel(admin, ctx, id);
		if (!ch) back('msg=err_input');
		if (ch.is_primary) back('msg=err_primary_delete');
		const { error } = await admin.from('seller_channels').delete().eq('id', ch.id).eq('seller_id', ctx.seller.id);
		if (error) {
			console.error('[my] deleteChannel failed:', error.message);
			back('msg=err_db');
		}
		back('msg=deleted');
	},

	saveAddress: async (event) => {
		const { ctx, formData } = await enter(event, 'address');
		const parsed = parseShippingInput(formData);
		if (!parsed.ok) back(`msg=err_address&field=${parsed.field}#address`);
		const res = await saveSampleAddress(ctx.seller.id, parsed.shipping);
		if (!res.ok) back('msg=err_db');
		back('msg=address_saved#address');
	}
};
