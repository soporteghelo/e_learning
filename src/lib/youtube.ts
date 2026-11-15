/**
 * Soporte de enlaces de YouTube para las cápsulas de video, en paralelo a Drive.
 * Reconoce watch?v=, youtu.be/, /embed/, /shorts/ y /live/.
 */
export function youtubeVideoId(rawUrl?: string | null): string {
  const url = String(rawUrl || '').trim();
  if (!/(^|\/\/|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)\//i.test(url)) return '';
  const m =
    url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i) ||
    url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) ||
    url.match(/\/(?:embed|shorts|live|v)\/([a-zA-Z0-9_-]{11})/i);
  return m ? m[1] : '';
}

/** Segundo de inicio si el enlace trae ?t=90, ?t=1m30s o ?start=90. */
function youtubeStartSeconds(url: string): number {
  const m = url.match(/[?&#](?:t|start)=([0-9hms]+)/i);
  if (!m) return 0;
  if (/^\d+$/.test(m[1])) return parseInt(m[1], 10);
  const p = m[1].match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i);
  return p ? (+(p[1] || 0)) * 3600 + (+(p[2] || 0)) * 60 + (+(p[3] || 0)) : 0;
}

/** URL incrustable (sin videos relacionados de otros canales), o '' si no es de YouTube. */
export function youtubeEmbedUrl(rawUrl?: string | null): string {
  const id = youtubeVideoId(rawUrl);
  if (!id) return '';
  const start = youtubeStartSeconds(String(rawUrl));
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1${start ? `&start=${start}` : ''}`;
}

export function youtubeThumbUrl(rawUrl?: string | null): string {
  const id = youtubeVideoId(rawUrl);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
}

export function youtubeWatchUrl(rawUrl?: string | null): string {
  const id = youtubeVideoId(rawUrl);
  return id ? `https://www.youtube.com/watch?v=${id}` : '';
}

/**
 * Carga la IFrame Player API de YouTube una sola vez y resuelve con `window.YT`.
 * El visor de cápsulas la necesita para leer el avance y saber cuándo termina
 * un video: el iframe /embed por sí solo no avisa de nada.
 */
let apiPromesa: Promise<any> | null = null;

export function loadYouTubeApi(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('sin window'));
  const w = window as any;
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT);
  if (apiPromesa) return apiPromesa;

  apiPromesa = new Promise((resolve, reject) => {
    const anterior = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (typeof anterior === 'function') anterior();
      resolve(w.YT);
    };
    const existente = document.querySelector('script[src*="youtube.com/iframe_api"]');
    if (!existente) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => { apiPromesa = null; reject(new Error('no se pudo cargar la API de YouTube')); };
      document.head.appendChild(s);
    }
    setTimeout(() => {
      if (w.YT && w.YT.Player) resolve(w.YT);
      else { apiPromesa = null; reject(new Error('tiempo de espera agotado')); }
    }, 10000);
  });
  return apiPromesa;
}
