/**
 * Utilidades para enlaces de Google Drive (videos y PDF de las lecciones).
 */

/** ID de archivo de un enlace de Drive (o un ID suelto), o '' si no se reconoce. */
export function driveFileId(url?: string | null): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  for (const p of [/\/file\/d\/([a-zA-Z0-9_-]+)/, /id=([a-zA-Z0-9_-]+)/, /\/d\/([a-zA-Z0-9_-]+)/]) {
    const m = trimmed.match(p);
    if (m) return m[1];
  }
  return /^[a-zA-Z0-9_-]{25,}$/.test(trimmed) ? trimmed : '';
}

/**
 * URL /preview incrustable de Drive. Si no hay ID pero ya es una URL absoluta, la
 * devuelve tal cual; si no, '' (evita rutas relativas rotas).
 */
export function driveEmbedUrl(url?: string | null): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  const id = driveFileId(trimmed);
  if (id) return `https://drive.google.com/file/d/${id}/preview`;
  return trimmed.startsWith('http') ? trimmed : '';
}

/** Reproducción directa por nuestro proxy (respeta Range y evita el CORS de Google). */
export function driveVideoProxyUrl(url: string): string {
  return `/api/drive-video?url=${encodeURIComponent(url)}`;
}
