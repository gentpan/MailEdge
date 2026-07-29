import type { ReactNode } from "react";

interface Props {
  label: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}

/** 行式表单：标签在左，控件在右，控件不再全宽铺开 */
export default function FormRow({ label, hint, wide, children }: Props) {
  return (
    <div className="form-row">
      <div className="form-row__label">
        {label}
        {hint && <span className="form-row__hint">{hint}</span>}
      </div>
      <div className={`form-row__control${wide ? " form-row__control--wide" : ""}`}>{children}</div>
    </div>
  );
}
