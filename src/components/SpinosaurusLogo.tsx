import { useState } from 'react';
import { Dino } from './Dino';

interface SpinosaurusLogoProps {
  className?: string;
  imgClassName?: string;
  alt?: string;
}

// Uses the uploaded Spinosaurus logo at /spinosaurus.png. If the file
// is missing (e.g. not yet added to /public), falls back to the inline
// Dino SVG so the page still renders.
export function SpinosaurusLogo({
  className = '',
  imgClassName = '',
  alt = 'DinoDrop Spinosaurus logo',
}: SpinosaurusLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <Dino className={className} />;
  }

  return (
    <img
      src="/animal.png"
      alt={alt}
      onError={() => setFailed(true)}
      className={`${className} ${imgClassName}`}
      style={{ objectFit: 'contain' }}
    />
  );
}
