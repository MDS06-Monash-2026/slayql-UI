import React, { useState } from 'react';

// Brand logos from public/logos. Open logos (Simple Icons, Devicon) are bundled; AutoCount and
// Monash University need their official files (public/logos/autocount.svg, public/logos/monash.svg)
// supplied by the team. Until a file exists, `fallback` is shown instead (a text wordmark or nothing).
export const LOGOS = {
  autocount: { src: '/logos/autocount.svg', name: 'AutoCount' },
  monash: { src: '/logos/monash.svg', name: 'Monash University' },
  sqlserver: { src: '/logos/sqlserver.svg', name: 'Microsoft SQL Server' },
  postgresql: { src: '/logos/postgresql.svg', name: 'PostgreSQL' },
  supabase: { src: '/logos/supabase.svg', name: 'Supabase' },
  mysql: { src: '/logos/mysql.svg', name: 'MySQL' },
  sqlite: { src: '/logos/sqlite.svg', name: 'SQLite' },
  github: { src: '/logos/github.svg', name: 'GitHub' },
};

export default function BrandLogo({ brand, className = 'h-8 w-8', fallback = null, decorative = true, onMissing }) {
  const [failed, setFailed] = useState(false);
  const logo = LOGOS[brand];
  if (!logo || failed) return fallback;
  return (
    <img
      src={logo.src}
      alt={decorative ? '' : logo.name}
      aria-hidden={decorative ? 'true' : undefined}
      className={`object-contain ${className}`}
      loading="lazy"
      onError={() => { setFailed(true); if (onMissing) onMissing(); }}
    />
  );
}
