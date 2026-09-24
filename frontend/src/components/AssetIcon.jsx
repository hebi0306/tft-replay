import { useState } from 'react';
export default function AssetIcon({ src, name, fallback = '◇', className = '' }) {
  const [failed, setFailed] = useState(null);
  return src && failed !== src ? <img className={`asset-icon ${className}`} src={src} alt={name} loading="lazy" onError={() => setFailed(src)} /> : <span className={`asset-fallback ${className}`} aria-label={name}>{fallback}</span>;
}
