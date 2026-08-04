import { BookOpen, Code2, Copyright, ExternalLink, Github, Scale, Shapes } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../i18n";
import Logo from "./Logo";

const PROJECT_URL = "https://github.com/gentpan/MailEdge";
const COMMITS_URL = "https://github.com/gentpan/MailEdge/commits/main";
const PROFILE_URL = "https://github.com/gentpan";
const BLOG_URL = "https://westlife.net";
const LICENSE_URL = "https://github.com/gentpan/MailEdge/blob/main/LICENSE";
const LUCIDE_URL = "https://lucide.dev/icons";
const LUCIDE_LICENSE_URL = "https://github.com/lucide-icons/lucide/blob/main/LICENSE";

interface Props {
  className?: string;
}

function ExternalAnchor({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="legal-overview__link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ExternalLink size={14} aria-hidden="true" />
    </a>
  );
}

export default function LegalOverview({ className = "" }: Props) {
  const { lang, t } = useI18n();
  const zh = lang === "zh";

  return (
    <div className={`legal-overview${className ? ` ${className}` : ""}`}>
      <header className="legal-overview__header">
        <div className="legal-overview__eyebrow">
          <span>{zh ? "开源项目 · 版权与来源" : "OPEN SOURCE · CREDITS"}</span>
          <span className="legal-overview__year">2026</span>
        </div>
        <div className="legal-overview__heading">
          <div>
            <h1>{t("legal.title")}</h1>
            <p>{t("legal.subtitle")}</p>
          </div>
          <div className="legal-overview__heading-mark" aria-hidden="true">
            <Copyright size={28} />
          </div>
        </div>
      </header>

      <section className="legal-overview__identity" aria-label="MailEdge">
        <div className="legal-overview__identity-mark">
          <Logo size={42} variant="blue" />
        </div>
        <div>
          <div className="legal-overview__identity-name">MailEdge</div>
          <p>{t("legal.identity")}</p>
        </div>
      </section>

      <div className="legal-overview__grid">
        <section className="legal-overview__card legal-overview__card--project">
          <div className="legal-overview__card-icon" aria-hidden="true">
            <Github size={22} />
          </div>
          <div className="legal-overview__card-body">
            <div className="legal-overview__card-kicker">GITHUB</div>
            <h2>{t("legal.project.title")}</h2>
            <p>{t("legal.project.body")}</p>
            <div className="legal-overview__links">
              <ExternalAnchor href={PROJECT_URL}>{t("legal.project.repository")}</ExternalAnchor>
              <ExternalAnchor href={COMMITS_URL}>{t("legal.project.commits")}</ExternalAnchor>
              <ExternalAnchor href={PROFILE_URL}>{t("legal.project.profile")}</ExternalAnchor>
            </div>
          </div>
        </section>

        <section className="legal-overview__card">
          <div className="legal-overview__card-icon legal-overview__card-icon--violet" aria-hidden="true">
            <BookOpen size={22} />
          </div>
          <div className="legal-overview__card-body">
            <div className="legal-overview__card-kicker">BLOG</div>
            <h2>{t("legal.blog.title")}</h2>
            <p>{t("legal.blog.body")}</p>
            <div className="legal-overview__links">
              <ExternalAnchor href={BLOG_URL}>{t("legal.blog.visit")}</ExternalAnchor>
            </div>
          </div>
        </section>

        <section className="legal-overview__card">
          <div className="legal-overview__card-icon legal-overview__card-icon--green" aria-hidden="true">
            <Scale size={22} />
          </div>
          <div className="legal-overview__card-body">
            <div className="legal-overview__card-kicker">LICENSE</div>
            <h2>{t("legal.mailEdge.title")}</h2>
            <p>{t("legal.mailEdge.body")}</p>
            <div className="legal-overview__links">
              <ExternalAnchor href={LICENSE_URL}>{t("legal.license.view")}</ExternalAnchor>
            </div>
          </div>
        </section>

        <section className="legal-overview__card">
          <div className="legal-overview__card-icon legal-overview__card-icon--orange" aria-hidden="true">
            <Shapes size={22} />
          </div>
          <div className="legal-overview__card-body">
            <div className="legal-overview__card-kicker">UI ICONS</div>
            <h2>{t("legal.icons.title")}</h2>
            <p>{t("legal.icons.body")}</p>
            <div className="legal-overview__links">
              <ExternalAnchor href={LUCIDE_URL}>{t("legal.icons.attribution")}</ExternalAnchor>
              <ExternalAnchor href={LUCIDE_LICENSE_URL}>ISC License</ExternalAnchor>
            </div>
          </div>
        </section>

        <section className="legal-overview__card legal-overview__card--notice">
          <div className="legal-overview__card-icon legal-overview__card-icon--blue" aria-hidden="true">
            <Code2 size={22} />
          </div>
          <div className="legal-overview__card-body">
            <div className="legal-overview__card-kicker">NOTICE</div>
            <h2>{t("legal.notice.title")}</h2>
            <p>{t("legal.notice.body")}</p>
          </div>
        </section>
      </div>

      <footer className="legal-overview__footer">
        <span>© 2026 MailEdge · {t("legal.footer.rights")}</span>
        <span>{t("legal.footer.maintained")}</span>
      </footer>
    </div>
  );
}
