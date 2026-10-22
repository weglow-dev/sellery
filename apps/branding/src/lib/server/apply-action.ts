import { fail, type Actions } from '@sveltejs/kit';
import {
	CATEGORIES,
	DOSAGE_FORMS,
	FLAVORS,
	HONEYPOT_FIELD,
	MAX_LEN,
	MEETING_SLOTS,
	MIN_QTY,
	UNSURE,
	needsFlavor,
	packagingOptionsFor,
	subTypesFor,
	type ApplyErrors,
	type ApplyValues
} from '$lib/utils/apply-options';
import { escapeSlack, notifySlack } from './slack';
import { sendMetaLeadEvent } from './meta-capi';
import { publicUrlOf } from '$lib/site';
import { formatPhone, PHONE_RE } from '$lib/utils/phone';
import { RATE_LIMIT_MESSAGE, rateLimit } from './rate-limit';

/** 제조의뢰 접수 폼 액션 — `/`(랜딩+퍼널)와 `/apply`(퍼널 바로 진입) 두 라우트가 같은 액션을 re-export 한다.
 *  검증 통과 시 슬랙 웹훅이 유일한 접수 경로라 전송 실패를 성공으로 보여주지 않고 입력값과 함께 돌려보낸다.
 *
 *  스팸 방어(메타 광고로 공개 트래픽이 들어오는 폼이라 — 2026-10-22):
 *    1. 허니팟(HONEYPOT_FIELD) 이 채워져 있으면 슬랙·메타 전환을 보내지 않고 성공 화면만 돌려준다.
 *    2. IP 기준 레이트리밋(30분 5회 · shop 의 /orders/lookup 과 같은 값) — 넘으면 429 + 연락처 화면 배너.
 *    3. 자유 입력(활동명 · 성분 · 메모)은 MAX_LEN 을 넘으면 거부, 선택지(카테고리 · 세부 종류 · 패키지 · 맛)는 목록과 대조.
 *    4. 슬랙 텍스트에 넣는 입력값은 escapeSlack — `<!channel>` 같은 제어 시퀀스가 채널을 호출하지 못하게.
 *  막힌 제출은 success 가 아니므로 퍼널의 픽셀 Lead 도 안 나가고, 서버 전환 API 도 호출하지 않는다 — 봇 접수가 메타 Lead 전환으로 잡히지 않는다. */

function str(v: FormDataEntryValue | null) {
	return typeof v === 'string' ? v.trim() : '';
}

/** 한 줄 칸 — 줄바꿈·연속 공백을 공백 하나로 (슬랙 메시지의 줄 구조를 입력값이 흉내 내지 못하게) */
function line(v: FormDataEntryValue | null) {
	return str(v).replace(/\s+/g, ' ');
}

/** 메모(여러 줄) — 줄바꿈은 두되 CR 과 3줄 이상 빈 줄은 정리 */
function multiline(v: FormDataEntryValue | null) {
	return str(v).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
}

/** 선택지 칸 — 목록(또는 미정)에 없는 값은 빈 값으로. 퍼널은 늘 목록 값만 보내므로 사람에게는 영향이 없다 */
function oneOf(v: string, options: readonly string[], allowUnsure = true): string {
	if (allowUnsure && v === UNSURE) return v;
	return options.includes(v) ? v : '';
}

/** 어댑터에 따라 getClientAddress 가 throw 할 수 있다(프리렌더·로컬) */
function safeClientAddress(get: () => string): string | null {
	try {
		return get() || null;
	} catch {
		return null;
	}
}

/** 리라이트(sellery.life → sellery-branding) 뒤라 x-forwarded-for 의 첫 값이 방문자 IP — 레이트리밋 키와 메타 전환 API 가 같은 값을 쓴다 */
function clientIp(request: Request, getClientAddress: () => string): string | null {
	return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || safeClientAddress(getClientAddress);
}

/** 슬랙 한 줄용 — 미정 선택은 그렇게 보이게, 빈 값은 호출부가 정한 대체 문구로, 사용자 입력은 이스케이프 */
function show(v: string, empty: string) {
	if (v === UNSURE) return '(미정 — 미팅 때 결정)';
	return v ? escapeSlack(v) : empty;
}

export const applyActions: Actions = {
	default: async ({ request, url, cookies, getClientAddress }) => {
		const form = await request.formData();
		// 메타 전환 API 중복 제거용 — 브라우저(use:enhance)가 넣어 보낸다. JS 없는 제출은 서버가 만든다
		const eventIdRaw = str(form.get('event_id'));
		const eventId = /^[A-Za-z0-9-]{8,64}$/.test(eventIdRaw) ? eventIdRaw : crypto.randomUUID();

		const name = line(form.get('name'));
		// JS 없이 제출돼 하이픈이 없거나 공백이 섞여 와도 같은 모양으로 맞춘다
		const phone = formatPhone(str(form.get('phone')));
		const category = line(form.get('category'));
		const ingredient = line(form.get('ingredient'));
		const dosageForm = line(form.get('dosageForm'));
		const subType = oneOf(line(form.get('subType')), subTypesFor(dosageForm));
		const packaging = oneOf(line(form.get('packaging')), packagingOptionsFor(dosageForm));
		const flavor = oneOf(line(form.get('flavor')), FLAVORS);
		const note = multiline(form.get('note'));
		const slotRaw = str(form.get('slot'));
		const slotDef = MEETING_SLOTS.find((s) => s.value === slotRaw);
		const slot = slotDef?.value ?? '';
		const agree = form.get('agree') === 'on';

		const values: ApplyValues = { name, phone, category, ingredient, dosageForm, subType, packaging, flavor, note, slot };
		const errors: ApplyErrors = {};

		// 허니팟 — 보이지 않는 칸이 채워져 있으면 봇. 슬랙·메타 전환 없이 성공 화면만 (막혔다는 신호를 주지 않는다)
		if (str(form.get(HONEYPOT_FIELD))) {
			console.warn('[apply] honeypot filled — dropped');
			return { success: true, values };
		}

		const ip = clientIp(request, getClientAddress);
		if (ip && !rateLimit(`apply:${ip}`)) {
			errors.form = RATE_LIMIT_MESSAGE;
			return fail(429, { errors, values });
		}

		if (!name) errors.name = '활동명 또는 채널을 입력해주세요.';
		else if (name.length > MAX_LEN.name) errors.name = `활동명은 ${MAX_LEN.name}자까지 입력할 수 있어요.`;
		if (!phone) errors.phone = '연락처를 입력해주세요.';
		else if (!PHONE_RE.test(phone)) errors.phone = '연락처는 010-0000-0000 형식으로 입력해주세요.';
		if (!(CATEGORIES as readonly string[]).includes(category)) errors.category = '카테고리를 선택해주세요.';
		if (ingredient.length > MAX_LEN.ingredient) errors.ingredient = `성분은 ${MAX_LEN.ingredient}자까지 입력할 수 있어요.`;
		if (note.length > MAX_LEN.note) errors.note = `추가 요청은 ${MAX_LEN.note}자까지 입력할 수 있어요.`;
		const knownForm = (DOSAGE_FORMS as readonly string[]).includes(dosageForm) || dosageForm === UNSURE;
		if (!knownForm) errors.dosageForm = '제형을 선택해주세요.';
		if (subTypesFor(dosageForm).length > 0 && !subType) errors.subType = '종류를 선택해주세요.';
		// 선택지가 둘 이상일 때만 묻는다(젤리처럼 하나뿐이면 폼이 자동으로 채워 보낸다)
		if (packagingOptionsFor(dosageForm).length > 1 && !packaging) errors.packaging = '패키지를 선택해주세요.';
		if (!agree) errors.agree = '개인정보 수집에 동의해주세요.';

		if (Object.keys(errors).length > 0) {
			return fail(400, { errors, values });
		}

		const flavorLine = needsFlavor(dosageForm, subType) ? show(flavor, '(미정)') : '(해당 없음 — 캡슐 제형)';

		const delivered = await notifySlack(
			[
				'*새 제조의뢰 접수* [셀러리 브랜딩]',
				`• 활동명/채널: ${escapeSlack(name)}`,
				`• 연락처: ${phone}`,
				`• 카테고리: ${category}`,
				`• 메인 성분: ${ingredient ? escapeSlack(ingredient) : '(미정 — 미팅 때 결정)'}`,
				`• 제형: ${show(dosageForm, '')}${subType ? ` (${show(subType, '')})` : ''}`,
				`• 패키지: ${show(packaging, '(해당 없음)')}`,
				`• 맛: ${flavorLine}`,
				`• 미팅 선호 시간대: ${slotDef ? `${slotDef.value}(${slotDef.hint})` : '상관없음'}`,
				`• 최소수량: ${MIN_QTY.toLocaleString('ko-KR')}개 (고정)`,
				note ? `• 추가 요청: ${escapeSlack(note)}` : null
			]
				.filter((l): l is string => l !== null)
				.join('\n')
		);

		// 슬랙이 유일한 접수 경로라, 전송에 실패하면 성공으로 보여주지 않고 입력값을 돌려보내 다시 시도하게 한다
		if (!delivered) {
			errors.form = '접수 전송에 실패했어요. 잠시 후 다시 시도해주세요 — 입력하신 내용은 그대로 남아 있어요.';
			return fail(502, { errors, values });
		}

		// 메타 전환 API(Lead) — 픽셀과 같은 event_id. 실패해도 접수는 성공이다(로그만)
		// event_source_url 은 실제로 접수한 페이지(홈 `/influencer/oem` 또는 바로 가기 `/influencer/oem/apply`) — 요청 경로를 공개 주소로 바꿔 넣는다
		await sendMetaLeadEvent({
			eventId,
			phone,
			category,
			sourceUrl: publicUrlOf(url.pathname),
			ip,
			userAgent: request.headers.get('user-agent'),
			fbp: cookies.get('_fbp') ?? null,
			fbc: cookies.get('_fbc') ?? null
		});

		// JS 없이 새로고침되는 경로에서도 완료 화면의 요약이 채워지도록 값을 함께 돌려준다
		return { success: true, values };
	}
};
