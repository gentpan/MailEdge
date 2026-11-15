import { useState } from "react";
import { useI18n } from "../../i18n";
import { type CornerStyle, getCornerStyle, setCornerStyle } from "../../lib/corners";
import SettingsPanel from "./SettingsPanel";
import SettingsSection from "./SettingsSection";

const OPTIONS: Array<{
  value: CornerStyle;
  labelKey: "appearance.corners.squircle" | "appearance.corners.square";
}> = [
  { value: "squircle", labelKey: "appearance.corners.squircle" },
  { value: "square", labelKey: "appearance.corners.square" },
];

/** 外观设置：圆角风格在超椭圆与直角之间切换，立即生效并记在本机。 */
export default function AppearancePanel() {
  const { t } = useI18n();
  const [corners, setCorners] = useState<CornerStyle>(getCornerStyle);

  function choose(style: CornerStyle) {
    setCornerStyle(style);
    setCorners(style);
  }

  return (
    <SettingsPanel title={t("settings.nav.appearance")} description={t("appearance.description")}>
      <SettingsSection title={t("appearance.corners.title")} description={t("appearance.corners.hint")}>
        <div className="tabs appearance-corners" role="group" aria-label={t("appearance.corners.title")}>
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={corners === option.value}
              className={`tab${corners === option.value ? " tab--active" : ""}`}
              onClick={() => choose(option.value)}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </SettingsSection>
    </SettingsPanel>
  );
}
