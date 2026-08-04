import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import LegalOverview from "../components/LegalOverview";
import { useI18n } from "../i18n";

/** 开源许可与第三方图标署名页，避免把归属信息藏在源码或构建产物里。 */
export default function LicensePage() {
  const { t } = useI18n();

  return (
    <main className="license-page">
      <div className="license-page__topbar">
        <Link className="btn btn--secondary" to="/dashboard">
          <ArrowLeft size={16} />
          {t("legal.back")}
        </Link>
      </div>

      <LegalOverview />
    </main>
  );
}
