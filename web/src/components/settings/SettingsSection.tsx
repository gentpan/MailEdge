import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/** 设置页内部的分组容器，避免每个面板重复实现标题和边框。 */
export default function SettingsSection({ title, description, children, className = "" }: Props) {
  return (
    <section className={`settings-section${className ? ` ${className}` : ""}`}>
      <header className="settings-section__header">
        <h2 className="settings-section__title">{title}</h2>
        {description && <p className="settings-section__description">{description}</p>}
      </header>
      <div className="settings-section__content">{children}</div>
    </section>
  );
}
