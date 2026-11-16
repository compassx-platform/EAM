export type PrintPiece =
  | { type: 'text'; text: string }
  | { type: 'image'; src: string; alt: string };

function listLiteral(text: string): string | null {
  if (!text.startsWith('[') || !text.endsWith(']')) return null;
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return null;
    return piecesFrom(parsed).filter((piece) => piece.type === 'text').map((piece) => piece.text).join(', ');
  } catch {
    const inner = text.slice(1, -1).trim();
    if (!inner) return '';
    const parts = inner.split(',').map((part) => part.trim().replace(/^['"]|['"]$/g, ''));
    if (parts.some((part) => part === '')) return null;
    return parts.join(', ');
  }
}

function piecesFrom(value: unknown): PrintPiece[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'boolean') return [{ type: 'text', text: value ? 'Yes' : 'No' }];
  if (typeof value === 'number') return [{ type: 'text', text: String(value) }];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed === 'true') return [{ type: 'text', text: 'Yes' }];
    if (trimmed === 'false') return [{ type: 'text', text: 'No' }];
    if (trimmed.startsWith('data:image')) return [{ type: 'image', src: trimmed, alt: 'Image' }];
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return piecesFrom(JSON.parse(trimmed));
      } catch {
        const literal = listLiteral(trimmed);
        if (literal !== null) return literal ? [{ type: 'text', text: literal }] : [];
      }
    }
    return [{ type: 'text', text: trimmed }];
  }
  if (Array.isArray(value)) {
    const pieces = value.flatMap((item) => piecesFrom(item));
    const images = pieces.filter((piece) => piece.type === 'image');
    const texts = pieces.filter((piece): piece is { type: 'text'; text: string } => piece.type === 'text' && piece.text !== '');
    if (images.length > 0) return [...texts, ...images];
    return texts.length ? [{ type: 'text', text: texts.map((piece) => piece.text).join(', ') }] : [];
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const src = typeof record.dataUrl === 'string' ? record.dataUrl : typeof record.src === 'string' ? record.src : '';
    const name = String(record.name || record.file_name || record.filename || record.title || '').trim();
    if (src.startsWith('data:image')) return [{ type: 'image', src, alt: name || 'Image' }];
    if (name) return [{ type: 'text', text: name }];
    const asset = String(record.asset_id || record.assetnum || '').trim();
    if (asset) return [{ type: 'text', text: asset }];
  }
  return [];
}

export function printPieces(value: unknown): PrintPiece[] {
  const pieces = piecesFrom(value);
  return pieces.length > 0 ? pieces : [{ type: 'text', text: '' }];
}
