import Link from "next/link";
import type { ReactNode } from "react";
import type { LegalBlock, LegalDoc as LegalDocument } from "@/lib/legal";

/**
 * 법적 고지 문서 렌더러 (/terms · /privacy). 서버 컴포넌트 — `src/content/legal/*.ts` 데이터를 그대로 그린다.
 *   .store > .card.static > article.legal : h1(title) · 버전/시행일 meta · intro · 목차(nav) · 조문(h2#id + 블록) · 부칙
 *   블록 문자열 안의 `[텍스트](/경로)` 만 링크로 바꾼다 (lib/legal.ts 계약) —
 *     내부 경로(`/…`)는 next/link, 같은 페이지 앵커(`#…`)·mailto:·https: 는 <a>, 그 외 스킴은 텍스트로 남긴다.
 *   dangerouslySetInnerHTML 은 쓰지 않는다 — 문서는 HTML 이 아니라 문자열 블록이고, 문구 편집자가 태그를 넣을 수 없어야 한다.
 *   sections 가 비어 있으면(초안 스텁) 제목·시행일과 "준비 중" 안내만 렌더한다.
 */

/** `[텍스트](대상)` — 라벨에 대괄호, 대상에 괄호·공백은 허용하지 않는다 (중첩·오탐 방지) */
const LINK_RE = /\[([^[\]]+)\]\(([^()\s]+)\)/g;

function linkNode(label: string, href: string, key: string): ReactNode {
  if (href.startsWith("/") && !href.startsWith("//")) {
    return (
      <Link key={key} href={href}>
        {label}
      </Link>
    );
  }
  if (href.startsWith("#") || href.startsWith("mailto:")) {
    return (
      <a key={key} href={href}>
        {label}
      </a>
    );
  }
  if (href.startsWith("https://")) {
    return (
      <a key={key} href={href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    );
  }
  // javascript: · data: · http: 등 — 링크로 만들지 않고 라벨만 남긴다
  return label;
}

/** 문자열 → 텍스트와 링크 노드의 배열. 링크가 없으면 원문 한 조각. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(LINK_RE.source, "g");
  let last = 0;
  let n = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(linkNode(m[1], m[2], `${keyPrefix}-l${n++}`));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** 'YYYY-MM-DD' → 'YYYY년 M월 D일' (형식이 어긋나면 원문) */
function fmtEffective(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

function Block({ block, k }: { block: LegalBlock; k: string }) {
  switch (block.type) {
    case "p":
      return <p>{inline(block.text, k)}</p>;
    case "ol":
      return (
        <ol>
          {block.items.map((t, i) => (
            <li key={i}>{inline(t, `${k}-${i}`)}</li>
          ))}
        </ol>
      );
    case "ul":
      return (
        <ul>
          {block.items.map((t, i) => (
            <li key={i}>{inline(t, `${k}-${i}`)}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="legal-tblw">
          <table>
            {block.caption ? <caption>{block.caption}</caption> : null}
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th key={i} scope="col">
                    {inline(h, `${k}-h${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{inline(cell, `${k}-r${ri}c${ci}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "note":
      return <div className="notice">{inline(block.text, k)}</div>;
    default:
      return null;
  }
}

function Blocks({ blocks, k }: { blocks: LegalBlock[]; k: string }) {
  return (
    <>
      {blocks.map((b, i) => (
        <Block key={i} block={b} k={`${k}-b${i}`} />
      ))}
    </>
  );
}

const APPENDIX_ID = "appendix";

export function LegalDoc({ doc }: { doc: LegalDocument }) {
  const hasAppendix = (doc.appendix?.length ?? 0) > 0;
  const hasBody = doc.sections.length > 0 || hasAppendix;

  return (
    <div className="store">
      <div className="card static">
        <article className="legal">
          <h1>{doc.title}</h1>
          <p className="meta legal-meta">
            버전 {doc.version} · 시행일 {fmtEffective(doc.effectiveDate)}
          </p>
          {doc.intro ? <p className="legal-intro">{inline(doc.intro, "intro")}</p> : null}

          {hasBody ? (
            <nav className="legal-toc" aria-label="목차">
              <div className="lbl-sm">목차</div>
              <ol>
                {doc.sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`}>{s.heading}</a>
                  </li>
                ))}
                {hasAppendix ? (
                  <li>
                    <a href={`#${APPENDIX_ID}`}>부칙</a>
                  </li>
                ) : null}
              </ol>
            </nav>
          ) : (
            <div className="empty">문서를 준비하고 있어요 — 게시되면 이 페이지에서 볼 수 있습니다</div>
          )}

          {doc.sections.map((s) => (
            <section key={s.id} className="legal-sec">
              <h2 id={s.id}>{s.heading}</h2>
              <Blocks blocks={s.blocks} k={s.id} />
            </section>
          ))}

          {hasAppendix ? (
            <section className="legal-sec legal-appendix">
              <h2 id={APPENDIX_ID}>부칙</h2>
              <Blocks blocks={doc.appendix ?? []} k={APPENDIX_ID} />
            </section>
          ) : null}
        </article>
      </div>
    </div>
  );
}
