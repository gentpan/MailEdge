import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const THEME_KEY = "mailedge-app-theme";

/** 深色/浅色主题切换：body 加 .theme-dark，localStorage 记忆，默认跟随系统 */
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    apply(saved ? saved === "dark" : prefersDark);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(isDark: boolean) {
    document.body.classList.toggle("theme-dark", isDark);
    setDark(isDark);
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  }

  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      onClick={() => apply(!dark)}
      title={dark ? "切换到浅色" : "切换到深色"}
      aria-label={dark ? "切换到浅色" : "切换到深色"}
    >
      {dark ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
