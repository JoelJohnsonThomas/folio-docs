export function Logo({ size = 28, withText = false }: { size?: number; withText?: boolean }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="var(--accent)" />
        <path d="M10 8h9l5 5v11a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" fill="white" />
        <path d="M12 16h8M12 20h6" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {withText && <span className="logo-text">Folio</span>}
    </span>
  );
}
