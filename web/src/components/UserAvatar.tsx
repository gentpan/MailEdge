import { useState } from "react";

interface Props {
  /** 显示首字母用：昵称优先，没有就用邮箱 */
  label: string;
  avatarUrl?: string | null;
  className?: string;
  size?: number;
}

/** 用户头像：有上传的头像就显示图片，加载失败或没有时显示首字母。 */
export default function UserAvatar({ label, avatarUrl, className = "user-card__avatar", size }: Props) {
  // 换了头像地址就重新尝试加载（记住的是哪个地址失败了）
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = Boolean(avatarUrl) && failedUrl === avatarUrl;
  const initial = Array.from(label.trim())[0]?.toUpperCase() ?? "?";
  const style = size ? { width: size, height: size, fontSize: Math.round(size * 0.42) } : undefined;
  return (
    <span className={`${className} user-avatar`} style={style} aria-hidden="true">
      {avatarUrl && !failed ? (
        <img
          className="user-avatar__image"
          src={avatarUrl}
          alt=""
          onError={() => setFailedUrl(avatarUrl ?? null)}
        />
      ) : (
        initial
      )}
    </span>
  );
}
