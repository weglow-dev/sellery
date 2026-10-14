import { fail } from '@sveltejs/kit';
import { DOSAGE_FORMS, MIN_QTY, PACKAGING_BY_FORM, type DosageForm } from './apply-options';
import { notifySlack } from '$lib/server/slack';
import { formatPhone, PHONE_RE } from '$lib/utils/phone';
import type { Actions } from './$types';

/** 폼 액션이 있는 페이지는 프리렌더할 수 없다 — 이 라우트만 서버에서 매 요청마다 처리한다. */
export const prerender = false;

function str(v: FormDataEntryValue | null) {
	return typeof v === 'string' ? v.trim() : '';
}

function isDosageForm(v: string): v is DosageForm {
	return (DOSAGE_FORMS as readonly string[]).includes(v);
}

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();

		const name = str(form.get('name'));
		// JS 없이 제출돼 하이픈이 없거나 공백이 섞여 와도 같은 모양으로 맞춘다
		const phone = formatPhone(str(form.get('phone')));
		const category = str(form.get('category'));
		const categoryCustom = str(form.get('categoryCustom'));
		const ingredient = str(form.get('ingredient'));
		const dosageForm = str(form.get('dosageForm'));
		const pillType = str(form.get('pillType'));
		const packaging = str(form.get('packaging'));
		const flavor = str(form.get('flavor'));
		const flavorCustom = str(form.get('flavorCustom'));
		const note = str(form.get('note'));
		const agree = form.get('agree') === 'on';

		const values = { name, phone, category, categoryCustom, ingredient, dosageForm, pillType, packaging, flavor, flavorCustom, note };
		const errors: Partial<Record<keyof typeof values | 'agree' | 'form', string>> = {};

		if (!name) errors.name = '활동명 또는 브랜드명을 입력해주세요.';
		if (!phone) errors.phone = '연락처를 입력해주세요.';
		else if (!PHONE_RE.test(phone)) errors.phone = '연락처는 010-0000-0000 형식으로 입력해주세요.';
		if (!category) errors.category = '카테고리를 선택해주세요.';
		if (!dosageForm || !isDosageForm(dosageForm)) errors.dosageForm = '제형을 선택해주세요.';
		if (dosageForm === '알약' && !pillType) errors.pillType = '알약 종류를 선택해주세요.';
		const needsPackaging = isDosageForm(dosageForm) && PACKAGING_BY_FORM[dosageForm].length > 0;
		if (needsPackaging && !packaging) errors.packaging = '패키지를 선택해주세요.';
		if (!agree) errors.agree = '개인정보 수집에 동의해주세요.';

		if (Object.keys(errors).length > 0) {
			return fail(400, { errors, values });
		}

		const flavorLine = flavor === '기타' ? flavorCustom || '기타(상세 미입력)' : flavor;

		const delivered = await notifySlack(
			[
				'*새 제조의뢰 접수* [셀러리 브랜딩]',
				`• 활동명/브랜드명: ${name}`,
				`• 연락처: ${phone}`,
				`• 카테고리: ${category === '기타' && categoryCustom ? `기타(${categoryCustom})` : category}`,
				ingredient ? `• 메인 성분: ${ingredient}` : '• 메인 성분: (미정 — 미팅 때 결정)',
				`• 제형: ${dosageForm}${pillType ? ` (${pillType})` : ''}`,
				packaging ? `• 패키지: ${packaging}` : '• 패키지: (해당 없음)',
				flavorLine ? `• 맛: ${flavorLine}` : '• 맛: (미정)',
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

		return { success: true };
	}
};
