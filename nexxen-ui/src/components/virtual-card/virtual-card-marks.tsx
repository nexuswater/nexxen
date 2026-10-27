export function EmvChip() {
  return (
    <svg className="nvc-chip" viewBox="0 0 48 36" aria-hidden="true">
      <rect x="1" y="1" width="46" height="34" rx="5" fill="#d7b56a" />
      <rect x="2" y="2" width="44" height="32" rx="4" fill="none" stroke="#8d6828" strokeWidth="1" />
      <path
        d="M16 2v32M32 2v32M2 12h14M32 12h14M2 24h14M32 24h14"
        fill="none"
        stroke="#8d6828"
        strokeWidth="1"
      />
      <rect x="16" y="12" width="16" height="12" fill="#e6c98a" stroke="#8d6828" />
    </svg>
  );
}

export function ContactlessIcon() {
  return (
    <svg className="nvc-contactless" viewBox="0 0 32 24" aria-hidden="true">
      <path
        d="M6 19.5c2.6-2.8 4-5.6 4-8.5s-1.4-5.7-4-8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M13 21c3.4-3.5 5.2-7 5.2-10S16.4 4.5 13 1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M20 22c4.2-4.2 6.4-8.2 6.4-11S24.2 4.2 20 .2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Accessible stand-in. The repo has no licensed Mastercard artwork, so this
 * is not the interlocking-circles symbol and must not be read as one.
 */
export function MastercardPlaceholder() {
  return (
    <span
      className="nvc-mc"
      role="img"
      aria-label="Mastercard network mark placeholder. Official artwork is not included."
    >
      <span className="nvc-mc-kicker">Placeholder</span>
      <span className="nvc-mc-name">Mastercard</span>
    </span>
  );
}
