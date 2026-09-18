import { PlatIcon } from "@/components/icons";

/**
 * 인플루언서 표기 `**{name}** {platIcon} {handle}` (ux-spec §3.2.3 · §4.1) — 소유: A.
 * DB `sellers.handle` 은 '@' 를 포함하므로 그대로 보여 준다 (URL 에는 normalizeHandle(), 여기서는 표시만).
 * name 을 주면 굵게 앞에, 없으면 아이콘 + 핸들만.
 */
export function PlatformHandle({
  platform,
  handle,
  name,
  className,
}: {
  platform: string | null | undefined;
  handle: string;
  name?: string | null;
  className?: string;
}) {
  return (
    <span className={className ? `who-cell ${className}` : "who-cell"}>
      {name ? <b>{name}</b> : null}
      {name ? " " : null}
      <PlatIcon platform={platform} />
      <span className="hd">{handle}</span>
    </span>
  );
}
