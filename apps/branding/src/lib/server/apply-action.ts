import { fail, type Actions } from '@sveltejs/kit';
import {
	DOSAGE_FORMS,
	MEETING_SLOTS,
	MIN_QTY,
	UNSURE,
	needsFlavor,
	packagingOptionsFor,
	subTypesFor,
	type ApplyErrors,
	type ApplyValues
} from '$lib/apply-options';
import { notifySlack } from './slack';
import { formatPhone, PHONE_RE } from '$lib/utils/phone';

/** 제조의뢰 접수 폼 액션 — `/`(랜딩+퍼널)와 `/apply`(퍼널 바로 진입) 두 라우트가 같은 액션을 re-export 한다.
 *  검증 통과 시 슬랙 웹훅이 유일한 접수 경로라 전송 실패를 성공으로 보여주지 않고 입력값과 함께 돌려보낸다. */

function str(v: FormDataEntryValue | null) {
	return typeof v === 'string' ? v.trim() : '';
}

/** 슬랙 한 줄용 — 미정 선택은 그렇게 보이게, 빈 값은 호출부가 정한 대체 문구로 */
function show(v: string, empty: string) {
	if (v === UNSURE) return '(미정 — 미팅 때 결정)';
	return v || empty;
}

export const applyActions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();

		const name = str(form.get('name'));
		// JS 없이 제출돼 하이픈이 없거나 공백이 섞여 와도 같은 모양으로 맞춘다
		const phone = formatPhone(str(form.get('phone')));
		const category = str(form.get('category'));
		const ingredient = str(form.get('ingredient'));
		const dosageForm = str(form.get('dosageForm'));
		const subType = str(form.get('subType'));
		const packaging = str(form.get('packaging'));
		const flavor = str(form.get('flavor'));
		const note = str(form.get('note'));
		const slotRaw = str(form.get('slot'));
		const slotDef = MEETING_SLOTS.find((s) => s.value === slotRaw);
		const slot = slotDef?.value ?? '';
		const agree = form.get('agree') === 'on';

		const values: ApplyValues = { name, phone, category, ingredient, dosageForm, subType, packaging, flavor, note, slot };
		const errors: ApplyErrors = {};

		if (!name) errors.name = '활동명 또는 채널을 입력해주세요.';
		if (!phone) errors.phone = '연락처를 입력해주세요.';
		else if (!PHONE_RE.test(phone)) errors.phone = '연락처는 010-0000-0000 형식으로 입력해주세요.';
		if (!category) errors.category = '카테고리를 선택해주세요.';
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
				`• 활동명/채널: ${name}`,
				`• 연락처: ${phone}`,
				`• 카테고리: ${category}`,
				`• 메인 성분: ${ingredient || '(미정 — 미팅 때 결정)'}`,
				`• 제형: ${show(dosageForm, '')}${subType ? ` (${show(subType, '')})` : ''}`,
				`• 패키지: ${show(packaging, '(해당 없음)')}`,
				`• 맛: ${flavorLine}`,
				`• 미팅 선호 시간대: ${slotDef ? `${slotDef.value}(${slotDef.hint})` : '상관없음'}`,
				`• 최소수량: ${MIN_QTY.toLocaleString('ko-KR')}개 (고정)`,
				note ? `• 추가 요청: ${note}` : null
			]
				.filter((l): l is string => l !== null)
				.join('\n')
		);

		// 슬랙이 유일한 접수 경로라, 전송에 실패하면 성공으로 보여주지 않고 입력값을 돌려보내 다시 시도하게 한다
		if (!delivered) {
			errors.form = '접수 전송에 실패했어요. 잠시 후 다시 시도해주세요 — 입력하신 내용은 그대로 남아 있어요.';
			return fail(502, { errors, values });
		}

		// JS 없이 새로고침되는 경로에서도 완료 화면의 요약이 채워지도록 값을 함께 돌려준다
		return { success: true, values };
	}
};
