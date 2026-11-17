/** A small, code-native character shared by the wordmark and cost card. */
export function Daisy({
  tone = "yellow",
  className = "",
}: {
  tone?: "yellow" | "lilac";
  className?: string;
}) {
  return (
    <svg
      className={`daisy daisy-${tone} ${className}`}
      viewBox="0 0 160 160"
      fill="none"
      aria-hidden="true"
    >
      <g className="daisy-petals" fill="currentColor">
        <circle cx="80" cy="35" r="28" />
        <circle cx="112" cy="48" r="28" />
        <circle cx="125" cy="80" r="28" />
        <circle cx="112" cy="112" r="28" />
        <circle cx="80" cy="125" r="28" />
        <circle cx="48" cy="112" r="28" />
        <circle cx="35" cy="80" r="28" />
        <circle cx="48" cy="48" r="28" />
        <circle cx="80" cy="80" r="44" />
      </g>
      <ellipse cx="80" cy="85" rx="43" ry="33" fill="white" fillOpacity=".6" />
      <g className="daisy-eyes" fill="#30283B">
        <ellipse cx="66" cy="78" rx="4" ry="6" />
        <ellipse cx="95" cy="78" rx="4" ry="6" />
      </g>
      <ellipse cx="52" cy="91" rx="7" ry="4.5" fill="#F3A3B4" />
      <ellipse cx="108" cy="91" rx="7" ry="4.5" fill="#F3A3B4" />
      <path
        d="M72 91C74 101 87 101 90 91"
        stroke="#30283B"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
