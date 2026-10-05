import { shop } from "../data/store";

// Instagram / Pinterest / WhatsApp as clickable brand icons.
export const SOCIAL_LINKS = [
  { label: "Instagram", href: shop.social.instagram, icon: "/icons/instagram.svg" },
  { label: "Pinterest", href: shop.social.pinterest, icon: "/icons/pinterest.webp" },
  shop.contact.whatsapp && {
    label: "WhatsApp",
    href: `https://wa.me/${shop.contact.whatsapp}`,
    icon: "/icons/whatsapp.webp",
  },
].filter(Boolean);

export default function SocialIcons({ size = 28, className = "" }) {
  return (
    <div className={`social-icons ${className}`}>
      {SOCIAL_LINKS.map((s) => (
        <a
          key={s.label}
          href={s.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Fanaar on ${s.label}`}
          title={s.label}
        >
          <img src={s.icon} alt="" width={size} height={size} loading="lazy" />
        </a>
      ))}
    </div>
  );
}
