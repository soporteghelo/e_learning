import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Play } from 'lucide-react';

interface CapsuleCarouselProps {
  videos: string[];
  getThumb: (url: string) => string;
  onOpen: (url: string) => void;
}

/**
 * Carrusel de video cápsulas de una lección.
 *
 * Los textos sobre la miniatura usan `text-[#fff]` y no `text-white`: el modo
 * claro reescribe `.text-white` a un color oscuro y los dejaba ilegibles.
 */
export default function CapsuleCarousel({ videos, getThumb, onOpen }: CapsuleCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [vistas, setVistas] = useState<Set<number>>(new Set());

  const total = videos.length;

  const medir = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const hijos = Array.from(el.children) as HTMLElement[];
    if (hijos.length === 0) return;

    const alInicio = el.scrollLeft <= 4;
    const alFinal = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    setCanPrev(!alInicio);
    setCanNext(!alFinal);

    // La cápsula activa es la más cercana al borde izquierdo; al llegar al
    // final se marca la última, que nunca alcanza ese borde.
    const base = hijos[0].offsetLeft;
    let mejor = 0;
    let distancia = Infinity;
    hijos.forEach((h, i) => {
      const d = Math.abs(h.offsetLeft - base - el.scrollLeft);
      if (d < distancia) { distancia = d; mejor = i; }
    });
    setActive(alFinal && !alInicio ? hijos.length - 1 : mejor);
  }, []);

  useEffect(() => {
    medir();
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [medir, total]);

  const irA = (idx: number) => {
    const el = trackRef.current;
    if (!el) return;
    const hijos = Array.from(el.children) as HTMLElement[];
    const destino = hijos[Math.max(0, Math.min(idx, hijos.length - 1))];
    if (!destino) return;
    el.scrollTo({ left: destino.offsetLeft - hijos[0].offsetLeft, behavior: 'smooth' });
  };

  const desplazar = (direccion: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: direccion * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  const abrir = (url: string, idx: number) => {
    setVistas(prev => new Set(prev).add(idx));
    onOpen(url);
  };

  const desplazable = canPrev || canNext;
  // En móvil se ve una cápsula y asoma la siguiente; en pantallas anchas, 2 o 3 completas.
  const ancho = total === 2
    ? 'w-[84%] sm:w-[calc((100%-0.75rem)/2)]'
    : 'w-[84%] sm:w-[calc((100%-0.75rem)/2)] lg:w-[calc((100%-1.5rem)/3)]';

  return (
    <div className="mb-4">
      {/* Cabecera: título, avance y flechas */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
          <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest truncate">
            {total} Cápsulas de Video
          </span>
          {vistas.size > 0 && (
            <span className="text-[10px] font-bold text-emerald-500 whitespace-nowrap">
              · {vistas.size} de {total} vistas
            </span>
          )}
        </div>
        {desplazable && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => desplazar(-1)}
              disabled={!canPrev}
              aria-label="Cápsulas anteriores"
              className="w-8 h-8 rounded-full bg-blue-600 text-[#fff] flex items-center justify-center transition-all hover:bg-blue-500 active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => desplazar(1)}
              disabled={!canNext}
              aria-label="Más cápsulas"
              className="w-8 h-8 rounded-full bg-blue-600 text-[#fff] flex items-center justify-center transition-all hover:bg-blue-500 active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Pista deslizable */}
      <div
        ref={trackRef}
        onScroll={medir}
        className="relative flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide py-1"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {videos.map((videoUrl, idx) => {
          const thumbUrl = getThumb(videoUrl);
          const vista = vistas.has(idx);
          return (
            <button
              key={`vid-${idx}`}
              type="button"
              onClick={() => abrir(videoUrl, idx)}
              aria-label={`Reproducir cápsula ${idx + 1} de ${total}`}
              className={`group relative flex-shrink-0 snap-start overflow-hidden rounded-2xl bg-slate-900 border transition-all shadow-lg active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${ancho} ${
                vista ? 'border-emerald-500/60' : 'border-white/10 hover:border-blue-500/60'
              }`}
              style={{ aspectRatio: '16/9' }}
            >
              {thumbUrl ? (
                <img
                  src={thumbUrl}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-blue-900 to-slate-950" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/30 group-hover:via-black/5 transition-all duration-300" />

              {/* Número de cápsula */}
              <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                <span className="min-w-7 h-7 px-2 rounded-full bg-blue-600 text-[#fff] text-xs font-black flex items-center justify-center shadow-lg">
                  {idx + 1}
                </span>
                {vista && (
                  <span className="h-7 px-2.5 rounded-full bg-emerald-600 text-[#fff] text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg">
                    <Check className="w-3 h-3" /> Vista
                  </span>
                )}
              </div>

              {/* Botón de reproducción */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/55 backdrop-blur border-2 border-white/40 flex items-center justify-center group-hover:bg-blue-600 group-hover:border-blue-400 group-hover:scale-110 transition-all duration-300 shadow-2xl">
                  <Play className="w-5 h-5 sm:w-6 sm:h-6 text-[#fff] fill-white ml-0.5" />
                </div>
              </div>

              {/* Pie */}
              <div className="absolute bottom-0 inset-x-0 px-3 py-2.5 flex items-end justify-between gap-2 text-left">
                <span className="text-xs sm:text-sm font-black text-[#fff] leading-tight">
                  Cápsula {idx + 1}
                  <span className="font-semibold opacity-70"> de {total}</span>
                </span>
                <span className="text-[10px] font-bold text-[#fff] opacity-80 uppercase tracking-wider whitespace-nowrap">
                  {vista ? 'Ver de nuevo' : 'Reproducir'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Indicadores */}
      {desplazable && (
        <div className="flex items-center justify-center gap-1 mt-2">
          {videos.map((_, idx) => (
            <button
              key={`dot-${idx}`}
              type="button"
              onClick={() => irA(idx)}
              aria-label={`Ir a la cápsula ${idx + 1}`}
              aria-current={idx === active}
              className="p-1.5"
            >
              <span className={`block h-1.5 rounded-full transition-all duration-300 ${
                idx === active ? 'w-6 bg-blue-500' : vistas.has(idx) ? 'w-1.5 bg-emerald-500' : 'w-1.5 bg-slate-500/50'
              }`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
