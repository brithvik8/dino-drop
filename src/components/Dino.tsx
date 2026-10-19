interface DinoProps {
  className?: string;
}

// Original pixel-art-style dinosaur. Not derived from any existing
// artwork. Built from rounded rects so it scales cleanly.
export function Dino({ className }: DinoProps) {
  return (
    <svg
      viewBox="0 0 220 220"
      className={className}
      role="img"
      aria-label="Pixel art dinosaur. Click to copy text to clipboard."
      focusable="false"
    >
      {/* Tail */}
      <rect x="8" y="150" width="40" height="14" rx="3" fill="#3f4a52" />
      <rect x="20" y="138" width="28" height="14" rx="3" fill="#3f4a52" />
      {/* Body */}
      <rect x="48" y="110" width="110" height="60" rx="10" fill="#4a5760" />
      <rect x="52" y="114" width="102" height="10" rx="4" fill="#5a6a74" />
      {/* Belly stripes */}
      <rect x="70" y="130" width="70" height="4" rx="2" fill="#39424a" />
      <rect x="70" y="142" width="70" height="4" rx="2" fill="#39424a" />
      <rect x="70" y="154" width="60" height="4" rx="2" fill="#39424a" />
      {/* Back spikes */}
      <rect x="70" y="96" width="10" height="18" rx="2" fill="#3f4a52" />
      <rect x="90" y="90" width="10" height="24" rx="2" fill="#3f4a52" />
      <rect x="112" y="92" width="10" height="22" rx="2" fill="#3f4a52" />
      <rect x="134" y="100" width="10" height="16" rx="2" fill="#3f4a52" />
      {/* Head */}
      <rect x="150" y="58" width="60" height="64" rx="12" fill="#4a5760" />
      <rect x="154" y="62" width="52" height="10" rx="4" fill="#5a6a74" />
      {/* Eye socket */}
      <rect x="186" y="78" width="14" height="14" rx="3" fill="#ffffff" />
      <rect x="190" y="82" width="7" height="7" rx="1.5" fill="#1f262c" />
      <rect x="191" y="82" width="2" height="2" fill="#ffffff" />
      {/* Snout / nostril */}
      <rect x="196" y="96" width="4" height="4" rx="1" fill="#1f262c" />
      {/* Mouth */}
      <rect x="176" y="104" width="30" height="5" rx="2.5" fill="#1f262c" />
      <rect x="184" y="106" width="6" height="3" fill="#e8b9b0" />
      {/* Legs */}
      <rect x="64" y="168" width="24" height="34" rx="4" fill="#4a5760" />
      <rect x="68" y="196" width="20" height="8" rx="3" fill="#3f4a52" />
      <rect x="116" y="168" width="24" height="34" rx="4" fill="#4a5760" />
      <rect x="120" y="196" width="20" height="8" rx="3" fill="#3f4a52" />
      {/* Arm */}
      <rect x="120" y="128" width="22" height="10" rx="4" fill="#3f4a52" />
      <rect x="136" y="124" width="8" height="14" rx="3" fill="#3f4a52" />
    </svg>
  );
}
