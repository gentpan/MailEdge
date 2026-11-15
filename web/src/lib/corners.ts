/** 圆角主题：squircle（超椭圆，默认）或 square（直角）。写在 <html data-corners>，样式见 app.css。 */
export type CornerStyle = "squircle" | "square";

const CORNER_KEY = "mailedge-corner-style";

export function getCornerStyle(): CornerStyle {
  try {
    return localStorage.getItem(CORNER_KEY) === "square" ? "square" : "squircle";
  } catch {
    return "squircle";
  }
}

export function applyCornerStyle(style: CornerStyle): void {
  document.documentElement.dataset.corners = style;
}

export function setCornerStyle(style: CornerStyle): void {
  applyCornerStyle(style);
  try {
    localStorage.setItem(CORNER_KEY, style);
  } catch {
    // 隐私模式下无法持久化时仍保留本次页面切换
  }
}
