import { Zap } from "lucide-react";
import type { MailProviderType } from "../../../../src/mail/types";

/**
 * 各发信服务商的品牌 logo（原始 SVG）。未提供的回退到通用图标。
 * SVG 自带配色，容器为白底，small padding 留白。
 */
const LOGOS: Partial<Record<MailProviderType, string>> = {
  cloudflare: `<svg viewBox="0 0 256 116" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid"><path fill="#FFF" d="m202.357 49.394-5.311-2.124C172.085 103.434 72.786 69.289 66.81 85.997c-.996 11.286 54.227 2.146 93.706 4.059 12.039.583 18.076 9.671 12.964 24.484l10.069.031c11.615-36.209 48.683-17.73 50.232-29.68-2.545-7.857-42.601 0-31.425-35.497Z"/><path fill="#F4811F" d="M176.332 108.348c1.593-5.31 1.062-10.622-1.593-13.809-2.656-3.187-6.374-5.31-11.154-5.842L71.17 87.634c-.531 0-1.062-.53-1.593-.53-.531-.532-.531-1.063 0-1.594.531-1.062 1.062-1.594 2.124-1.594l92.946-1.062c11.154-.53 22.839-9.56 27.087-20.182l5.312-13.809c0-.532.531-1.063 0-1.594C191.203 20.182 166.772 0 138.091 0 111.535 0 88.697 16.995 80.73 40.896c-5.311-3.718-11.684-5.843-19.12-5.31-12.747 1.061-22.838 11.683-24.432 24.43-.531 3.187 0 6.374.532 9.56C16.996 70.107 0 87.103 0 108.348c0 2.124 0 3.718.531 5.842 0 1.063 1.062 1.594 1.594 1.594h170.489c1.062 0 2.125-.53 2.125-1.594l1.593-5.842Z"/><path fill="#FAAD3F" d="M205.544 48.863h-2.656c-.531 0-1.062.53-1.593 1.062l-3.718 12.747c-1.593 5.31-1.062 10.623 1.594 13.809 2.655 3.187 6.373 5.31 11.153 5.843l19.652 1.062c.53 0 1.062.53 1.593.53.53.532.53 1.063 0 1.594-.531 1.063-1.062 1.594-2.125 1.594l-20.182 1.062c-11.154.53-22.838 9.56-27.087 20.182l-1.063 4.78c-.531.532 0 1.594 1.063 1.594h70.108c1.062 0 1.593-.531 1.593-1.593 1.062-4.25 2.124-9.03 2.124-13.81 0-27.618-22.838-50.456-50.456-50.456"/></svg>`,
  resend: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M14.679 0c4.648 0 7.413 2.765 7.413 6.434s-2.765 6.434-7.413 6.434H12.33L24 24h-8.245l-8.88-8.44c-.636-.588-.93-1.273-.93-1.86 0-.831.587-1.565 1.713-1.883l4.574-1.224c1.737-.465 2.936-1.81 2.936-3.572 0-2.153-1.761-3.4-3.939-3.4H0V0z"/></svg>`,
  sendflare: `<svg viewBox="0 0 416.643 416.643" xmlns="http://www.w3.org/2000/svg" fill="#7c3aed"><polygon points="144.458,145.839 0,1.381 144.458,1.381"/><polygon points="83.035,415.261 83.035,298.478 141.433,356.864"/><polygon points="144.458,349.578 84.545,289.665 144.458,229.733"/><polygon points="151.755,346.541 151.755,6.537 321.757,176.539"/><polygon points="323.267,167.738 265.782,110.241 323.267,52.75"/><polygon points="330.565,133.667 330.565,47.595 416.643,47.595"/></svg>`,
  // SMTP 主要用于 Gmail 代发，用 Gmail 图标
  smtp: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" fill="none"><path fill="url(#me-a)" d="M146 44h38v110c0 6.627-5.373 12-12 12h-20a6 6 0 0 1-6-6z"/><path fill="#fc413d" d="M46 44H8v110c0 6.627 5.373 12 12 12h20a6 6 0 0 0 6-6z"/><path fill="url(#me-b)" d="M39.226 30.456c-8.033-6.752-20.018-5.714-26.77 2.319-6.752 8.032-5.714 20.017 2.319 26.77l76.078 63.949a8 8 0 0 0 10.295 0l76.078-63.95c8.032-6.752 9.07-18.737 2.318-26.77-6.752-8.032-18.737-9.07-26.769-2.318L96 78.18z"/><defs><linearGradient id="me-a" x1="165" x2="165" y1="44" y2="166" gradientUnits="userSpaceOnUse"><stop stop-color="#60d673"/><stop offset=".17" stop-color="#42c868"/><stop offset=".39" stop-color="#0ebc5f"/><stop offset=".62" stop-color="#00a9bb"/><stop offset=".86" stop-color="#3c90ff"/><stop offset="1" stop-color="#3186ff"/></linearGradient><linearGradient id="me-b" x1="8" x2="184" y1="46.13" y2="46.13" gradientUnits="userSpaceOnUse"><stop offset=".08" stop-color="#ff63a0"/><stop offset=".3" stop-color="#fc413d"/><stop offset=".5" stop-color="#fc413d"/><stop offset=".65" stop-color="#fc413d"/><stop offset=".72" stop-color="#fc5c30"/><stop offset=".86" stop-color="#feb10c"/><stop offset=".91" stop-color="#fec700"/><stop offset=".96" stop-color="#ffdb0f"/></linearGradient></defs></svg>`,
};

interface Props {
  type: MailProviderType;
}

export default function ProviderLogo({ type }: Props) {
  const svg = LOGOS[type];
  if (svg) {
    return (
      <span
        className="provider-logo"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG 是本文件里的常量，不含任何外部输入
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  // 仅 Sendflare 暂无 logo，回退到闪电图标
  return (
    <span className="provider-logo provider-logo--fallback">
      <Zap size={18} />
    </span>
  );
}
