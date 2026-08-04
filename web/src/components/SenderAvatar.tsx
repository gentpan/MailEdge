import { useEffect, useMemo, useState } from "react";

interface Address {
  email: string;
  name?: string;
}

const AVATAR_COLORS = ["blue", "green", "rose", "violet", "slate", "amber"] as const;
type AvatarColor = (typeof AVATAR_COLORS)[number];

/** 企业头像：优先使用域名 favicon，失败时使用稳定的首字母和颜色。 */
export default function SenderAvatar({ address }: { address: Address }) {
  const domain = getDomain(address.email);
  const label = address.name?.trim() || address.email.split("@")[0] || address.email;
  const initial = Array.from(label.trim())[0]?.toUpperCase() ?? "?";
  const color = useMemo(() => colorFor(domain || label), [domain, label]);
  const [imageFailed, setImageFailed] = useState(!domain);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageFailed(!domain);
    setImageLoaded(false);
  }, [domain]);

  if (!imageFailed && domain) {
    return (
      <span
        className={`sender-avatar sender-avatar--${color} sender-avatar--with-image${imageLoaded ? " sender-avatar--image-loaded" : ""}`}
        title={domain}
        role="img"
        aria-label={address.email}
      >
        {!imageLoaded && initial}
        <img
          className="sender-avatar__image"
          src={`/api/brand/avatar?domain=${encodeURIComponent(domain)}`}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={`sender-avatar sender-avatar--${color}`}
      title={address.email}
      role="img"
      aria-label={address.email}
    >
      {initial}
    </span>
  );
}

function getDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  const domain =
    at === -1
      ? ""
      : email
          .slice(at + 1)
          .trim()
          .toLowerCase()
          .replace(/\.$/, "");
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9-]{2,63})+$/i.test(domain) ? domain : null;
}

function colorFor(value: string): AvatarColor {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? "blue";
}
