/** Marque GFP : trois dépenses triées, de la plus grosse à la plus petite. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="6" y="11" width="52" height="12" rx="6" fill="#EE8E7E" />
      <rect x="6" y="27" width="38" height="12" rx="6" fill="#A99BE3" />
      <rect x="6" y="43" width="24" height="12" rx="6" fill="#7CC59A" />
    </svg>
  );
}

export default function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="logo" aria-label="GFP">
      <Mark size={size} />
      <span>GFP</span>
    </span>
  );
}
