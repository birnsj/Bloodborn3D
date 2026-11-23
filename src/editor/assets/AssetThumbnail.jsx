/** Lightweight thumbnail for Content Browser tiles / Asset Viewer. */
export function AssetThumbnail({ asset, size = 48 }) {
  const preview = asset?.preview || {};
  const style = { width: size, height: size };

  if (preview.kind === 'image' && preview.url) {
    return (
      <div className="bb-asset-thumb bb-asset-thumb--image" style={style} aria-hidden>
        <img src={preview.url} alt="" />
      </div>
    );
  }

  if (preview.kind === 'swatch') {
    return (
      <div
        className="bb-asset-thumb bb-asset-thumb--swatch"
        style={{
          ...style,
          background: `linear-gradient(135deg, ${preview.color || '#666'} 0 50%, ${preview.secondary || '#333'} 50% 100%)`,
        }}
        aria-hidden
      />
    );
  }

  if (preview.kind === 'checker') {
    const a = preview.color || '#bbb';
    const b = preview.secondary || '#444';
    return (
      <div
        className="bb-asset-thumb bb-asset-thumb--checker"
        style={{
          ...style,
          backgroundImage: `linear-gradient(45deg, ${a} 25%, transparent 25%), linear-gradient(-45deg, ${a} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${a} 75%), linear-gradient(-45deg, transparent 75%, ${a} 75%)`,
          backgroundSize: '12px 12px',
          backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0',
          backgroundColor: b,
        }}
        aria-hidden
      />
    );
  }

  return (
    <div
      className={`bb-asset-thumb bb-asset-thumb--${asset?.type || 'unknown'}`}
      style={style}
      aria-hidden
    >
      <span>{typeGlyph(asset?.type)}</span>
    </div>
  );
}

function typeGlyph(type) {
  switch (type) {
    case 'mesh': return 'M';
    case 'material': return 'Mat';
    case 'texture': return 'Tx';
    case 'prefab': return 'Pf';
    case 'audio': return 'Au';
    case 'ai': return 'AI';
    default: return '?';
  }
}
