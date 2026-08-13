interface LegalFooterLinksProps {
  className?: string;
}

const footerLinks = [
  { href: '/legal/imprint', label: 'Legal Notice' },
  { href: '/legal/terms', label: 'Terms' },
  { href: '/legal/privacy', label: 'Privacy' },
  { href: '/legal/cookies', label: 'Cookies' },
  { href: '/legal', label: 'Legal Center' },
] as const;

export function LegalFooterLinks({ className = '' }: LegalFooterLinksProps) {
  return (
    <nav
      aria-label="Legal"
      className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 ${className}`}
    >
      {footerLinks.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded text-current transition-colors hover:text-accent-cyan focus:outline-none focus:ring-2 focus:ring-accent-cyan"
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}
