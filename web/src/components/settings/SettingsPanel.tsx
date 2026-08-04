import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** 所有设置页共用的页面框架，保证标题、说明、操作区和内容间距一致。 */
export default function SettingsPanel({ title, description, action, children, className = "" }: Props) {
  return (
    <section className={`settings-panel${className ? ` ${className}` : ""}`}>
      <header className="settings-panel__header">
        <div className="settings-panel__heading">
          <h1 className="settings-panel__title">{title}</h1>
          {description && <p className="settings-panel__description">{description}</p>}
        </div>
        {action && <div className="settings-panel__action">{action}</div>}
      </header>
      <div className="settings-panel__content">{children}</div>
    </section>
  );
}
