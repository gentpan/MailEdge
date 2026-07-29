import { useI18n } from "../i18n";

/** 中/英切换。两段式胶囊，当前语言高亮。 */
export default function LanguageToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button
        type="button"
        className={`lang-toggle__btn${lang === "zh" ? " lang-toggle__btn--active" : ""}`}
        onClick={() => setLang("zh")}
      >
        中
      </button>
      <button
        type="button"
        className={`lang-toggle__btn${lang === "en" ? " lang-toggle__btn--active" : ""}`}
        onClick={() => setLang("en")}
      >
        EN
      </button>
    </div>
  );
}
