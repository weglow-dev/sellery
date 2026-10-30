// MYR 상품 운영 스크립트(myr-products.mjs) 순수 부분 — 검증 · 핸들 정규화 · 상세 템플릿 · 행 조립. 테스트: src/test/myr-products-plan.test.ts
// DB 를 만지지 않는다. 상세 템플릿 문구는 apps/myr-shop/src/lib/data.ts genericDetail 과 같아야 한다(둘 다 바꿀 것).

export const CATEGORIES = ["diet", "inner", "derma", "hair", "mental", "mens"];
export const STATUSES = ["pending", "listed", "paused", "rejected"];
export const CODE_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

/** '@Minji.Routine ' → '@minji.routine' (sellers.handle 은 '@' 포함 소문자) */
export const normHandle = (h) => "@" + String(h ?? "").trim().replace(/^@+/, "").toLowerCase();

const WHY = ["핵심 기능성 성분이에요", "흡수와 효과를 돕는 보조 성분이에요", "매일 필요한 기본 영양소예요", "안정성과 밸런스를 위해 넣었어요"];
const ROLE = ["주성분", "보조", "기본", "밸런스"];

/** 상세 섹션이 비어 있으면 기본 템플릿 — 있는 섹션은 그대로 */
export function withDetail(p) {
  const ingredients = Array.isArray(p.ingredients) ? p.ingredients : [];
  return {
    story_title: p.story_title ?? "매일 챙기기 쉬운 것만 남겼어요",
    story: p.story ?? '제가 직접 매일 먹고 바르는 것 중에서 꼭 필요한 것만 골랐어요. 성분은 단순하게, 함량은 타협 없이. 팔로워분들이 "이건 뭐예요?" 물어보던 질문에 제품으로 답한 거예요.',
    ingredient_rows: p.ingredient_rows ?? ingredients.map((n, i) => ({ name: n, why: WHY[i % 4], amount: ROLE[i % 4] })),
    howto_steps: p.howto_steps ?? [
      { t: "하루 한 번", d: p.howto ?? "" },
      { t: "꾸준히", d: "최소 4주 이상 루틴으로 이어가 주세요." },
      { t: "보관", d: "직사광선을 피해 서늘한 곳에 보관하세요." },
    ],
    faq: p.faq ?? [
      { q: "언제 먹는 게 좋아요?", a: p.howto ?? "" },
      { q: "다른 영양제와 같이 먹어도 되나요?", a: "네, 일반적인 영양제와 함께 드셔도 괜찮아요. 복용 중인 약이 있다면 전문가와 상의하세요." },
      { q: "환불·교환이 되나요?", a: "미개봉 제품은 수령 후 7일 이내 교환·환불이 가능해요." },
    ],
  };
}

/** 시드 JSON 의 상품 1건 검증 — 문제 없으면 [] · 있으면 사람이 읽을 메시지 목록 */
export function validateProduct(p) {
  const errors = [];
  const code = String(p?.code ?? "").trim().toLowerCase();
  if (!CODE_RE.test(code)) errors.push(`code 형식(소문자·숫자·하이픈 1~48): ${p?.code}`);
  if (!String(p?.creator ?? "").trim()) errors.push("creator(핸들) 필요");
  if (!CATEGORIES.includes(p?.category)) errors.push(`category 는 ${CATEGORIES.join("|")} 중 하나: ${p?.category}`);
  if (!String(p?.name ?? "").trim()) errors.push("name 필요");
  if (!Number.isInteger(p?.price) || p.price < 0) errors.push("price 는 0 이상 정수");
  if (p?.stock !== undefined && (!Number.isInteger(p.stock) || p.stock < 0)) errors.push("stock 은 0 이상 정수");
  if (p?.tag !== undefined && !["", "BEST", "NEW"].includes(p.tag)) errors.push("tag 는 '' | BEST | NEW");
  if (p?.seller_margin_rate !== undefined && (typeof p.seller_margin_rate !== "number" || p.seller_margin_rate < 0 || p.seller_margin_rate > 1)) errors.push("seller_margin_rate 는 0~1");
  return errors;
}

/** 검증을 통과한 상품 → myr_products upsert 행 (seller_id 는 호출부가 핸들로 찾아 넣는다) */
export function toRow(p, sellerId, status) {
  if (!STATUSES.includes(status)) throw new Error(`status: ${status}`);
  return {
    code: String(p.code).trim().toLowerCase(),
    seller_id: sellerId,
    category: p.category,
    name: String(p.name).trim(),
    unit: p.unit ?? "",
    price: p.price,
    options: Array.isArray(p.options) ? p.options : [],
    tile: p.tile ?? null,
    thumb_url: p.thumb_url ?? null,
    icon: p.icon ?? "pill",
    form: p.form ?? "",
    pack: p.pack ?? "",
    flavor: p.flavor ?? "",
    tag: p.tag ?? "",
    chips: p.chips ?? [],
    ingredients: p.ingredients ?? [],
    note: p.note ?? "",
    howto: p.howto ?? "",
    ...withDetail(p),
    stock: Number.isInteger(p.stock) ? p.stock : 0,
    status,
    seller_margin_rate: typeof p.seller_margin_rate === "number" ? p.seller_margin_rate : null,
  };
}
