import type { CSSProperties } from "react";

/** MailEdge 单色信封 Logo（品牌蓝）。 */
export default function Logo({ size = 20, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      fill="#111827"
      style={style}
      aria-hidden="true"
    >
      <path d="m29.84 8.64v.48l-12.71 8a2.0997 2.0997 0 0 1 -2.26 0l-12.71-8a3.02176 3.02176 0 0 1 2.96005-3.43h21.76a2.9512 2.9512 0 0 1 2.95995 2.95zm-13.84 10.81a4.1535 4.1535 0 0 1 -2.2-.63l-11.64-7.34v11.88a2.9512 2.9512 0 0 0 2.96 2.95h21.76a2.9512 2.9512 0 0 0 2.96-2.95v-11.88l-11.64 7.34a4.1535 4.1535 0 0 1 -2.2.63z" />
    </svg>
  );
}
