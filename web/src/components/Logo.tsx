import type { CSSProperties } from "react";

type LogoVariant = "blue" | "black";

/** MailEdge logo：使用统一的 Lamé 超级椭圆 SVG 资源。 */
export default function Logo({
  size = 20,
  style,
  variant = "blue",
}: {
  size?: number;
  style?: CSSProperties;
  variant?: LogoVariant;
}) {
  return (
    <img
      width={size}
      height={size}
      src={variant === "black" ? "/api/brand/logo.svg?variant=black" : "/api/brand/logo.svg?variant=blue"}
      alt=""
      aria-hidden="true"
      style={{ display: "block", ...style }}
    />
  );
}
