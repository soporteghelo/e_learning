import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Play, Pause, RotateCcw, Volume2, VolumeX,
  ChevronLeft, ChevronRight, Zap, Check, AlertCircle, BookOpen, FastForward, ChevronDown,
} from 'lucide-react';
import type { QuizQuestion } from '../types';
import { youtubeVideoId, youtubeThumbUrl, loadYouTubeApi } from '../lib/youtube';
import { driveEmbedUrl, driveFileId, driveVideoProxyUrl } from '../lib/drive';

interface CapsuleStoriesProps {
  videos: string[];
  startIndex: number;
  /** Tema de la lección, para la cabecera. */
  tema: string;
  /** Preguntas de la categoría de esta lección; se gasta una por cápsula. */
  preguntas: QuizQuestion[];
  onCapsuleDone: (index: number) => void;
  onClose: () => void;
  onNextLesson?: () => void;
}

type Letra = 'A' | 'B' | 'C' | 'D';
/** Por qué se abrió la pregunta: tras adelantar, o al acabar la cápsula. */
type Motivo = 'adelanto' | 'fin';

/** Margen (s) sobre lo ya visto antes de considerar que el usuario adelantó. */
const TOLERANCIA_ADELANTO = 3;
/** Desplazamiento vertical (px) que cuenta como deslizar. */
const UMBRAL_DESLIZ = 60;

function miniatura(url: string): string {
  const yt = youtubeThumbUrl(url);
  if (yt) return yt;
  const id = driveFileId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1280` : '';
}

function reloj(segundos: number): string {
  if (!isFinite(segundos) || segundos < 0) return '0:00';
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function CapsuleStories({
  videos, startIndex, tema, preguntas, onCapsuleDone, onClose, onNextLesson,
}: CapsuleStoriesProps) {
  const total = videos.length;
  const [idx, setIdx] = useState(Math.max(0, Math.min(startIndex, total - 1)));
  const [fase, setFase] = useState<'video' | 'pregunta'>('video');

  const [tiempo, setTiempo] = useState(0);
  const [duracion, setDuracion] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [silencio, setSilencio] = useState(false);
  const [necesitaToque, setNecesitaToque] = useState(false);
  const [driveFallo, setDriveFallo] = useState(false);
  const [completas, setCompletas] = useState<Set<number>>(new Set());

  // Pregunta: una por cápsula. `preguntadas` evita que vuelva a salir en la
  // misma cápsula; `usadas` evita repetir la misma al fallar.
  const [preguntadas, setPreguntadas] = useState<Set<number>>(new Set());
  const [usadas, setUsadas] = useState<Set<string>>(new Set());
  const [preguntaActual, setPreguntaActual] = useState<QuizQuestion | null>(null);
  const [motivo, setMotivo] = useState<Motivo>('fin');
  const [elegida, setElegida] = useState<Letra | null>(null);
  const [reanudarEn, setReanudarEn] = useState<number | null>(null);

  // Arrastre de la barra de avance
  const [arrastrando, setArrastrando] = useState(false);
  const [preview, setPreview] = useState(0);

  // En horizontal el video llena la pantalla, así que los controles se
  // esconden solos tras unos segundos y vuelven al tocar.
  const [controles, setControles] = useState(true);
  const [esHorizontal, setEsHorizontal] = useState(false);
  const ocultarRef = useRef<number>(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  // Contenedor estable: YT.Player REEMPLAZA el nodo que recibe por su iframe,
  // así que se le pasa un hijo desechable y nunca el div de React.
  const ytContRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const barraRef = useRef<HTMLDivElement>(null);
  // Punto máximo visto de corrido: adelantar más allá dispara la pregunta.
  const maxVistoRef = useRef(0);
  const deslizRef = useRef<{ y: number; movido: boolean } | null>(null);
  const avanzarRef = useRef<() => void>(() => {});
  const finRef = useRef<() => void>(() => {});

  const url = videos[idx] || '';
  const ytId = youtubeVideoId(url);
  const esYouTube = !!ytId;
  const fondo = miniatura(url);
  const embedFallback = driveEmbedUrl(url);
  // El iframe /preview de Drive no da eventos: ni barra ni auto-salto.
  const sinTelemetria = !esYouTube && driveFallo;

  const marcarVista = useCallback((i: number) => {
    setCompletas(prev => (prev.has(i) ? prev : new Set(prev).add(i)));
    onCapsuleDone(i);
  }, [onCapsuleDone]);

  // ── Control del reproductor ──────────────────────────────────────────────
  const pausar = useCallback(() => {
    if (esYouTube) ytPlayerRef.current?.pauseVideo?.();
    else videoRef.current?.pause();
  }, [esYouTube]);

  const reproducir = useCallback(() => {
    if (esYouTube) ytPlayerRef.current?.playVideo?.();
    else videoRef.current?.play().catch(() => setNecesitaToque(true));
  }, [esYouTube]);

  const buscar = useCallback((t: number) => {
    const destino = Math.max(0, duracion ? Math.min(t, duracion - 0.3) : t);
    if (esYouTube) ytPlayerRef.current?.seekTo?.(destino, true);
    else if (videoRef.current) videoRef.current.currentTime = destino;
    setTiempo(destino);
  }, [esYouTube, duracion]);

  // ── Navegación entre cápsulas ────────────────────────────────────────────
  const reiniciarCapsula = () => {
    setTiempo(0);
    setDuracion(0);
    maxVistoRef.current = 0;
    setDriveFallo(false);
    setNecesitaToque(false);
    setPausado(false);
  };

  const avanzar = useCallback(() => {
    setFase('video');
    setPreguntaActual(null);
    setElegida(null);
    setReanudarEn(null);
    if (idx < total - 1) {
      setIdx(i => i + 1);
      reiniciarCapsula();
    } else {
      onClose();
    }
  }, [idx, total, onClose]);

  const retroceder = useCallback(() => {
    if (fase === 'pregunta') return;
    if (idx > 0) {
      setIdx(i => i - 1);
      reiniciarCapsula();
    }
  }, [fase, idx]);

  useEffect(() => { avanzarRef.current = avanzar; }, [avanzar]);

  // ── Preguntas ────────────────────────────────────────────────────────────
  const disponibles = useMemo(
    () => preguntas.filter(q => !usadas.has(q.idQuiz)),
    [preguntas, usadas],
  );

  const tomarPregunta = useCallback((): QuizQuestion | null => {
    if (disponibles.length === 0) return null;
    return disponibles[0];
  }, [disponibles]);

  /**
   * Abre la pregunta de esta cápsula. `volverA` es el segundo al que regresar
   * tras responder (cuando se disparó por adelantar); null si fue al final.
   */
  const abrirPregunta = useCallback((porque: Motivo, volverA: number | null) => {
    if (preguntadas.has(idx)) {
      // Ya respondió en esta cápsula: el adelanto se permite sin preguntar.
      if (volverA != null) buscar(volverA);
      else avanzarRef.current();
      return;
    }
    const q = tomarPregunta();
    if (!q) {
      if (volverA != null) buscar(volverA);
      else avanzarRef.current();
      return;
    }
    pausar();
    setPreguntadas(prev => new Set(prev).add(idx));
    setUsadas(prev => new Set(prev).add(q.idQuiz));
    setPreguntaActual(q);
    setMotivo(porque);
    setElegida(null);
    setReanudarEn(volverA);
    setFase('pregunta');
  }, [idx, preguntadas, tomarPregunta, pausar, buscar]);

  /** Tras fallar: otra pregunta distinta del mismo banco. */
  const otraPregunta = useCallback(() => {
    const q = tomarPregunta();
    if (!q) return;
    setUsadas(prev => new Set(prev).add(q.idQuiz));
    setPreguntaActual(q);
    setElegida(null);
  }, [tomarPregunta]);

  const terminarCapsula = useCallback(() => {
    marcarVista(idx);
    setTiempo(duracion || 0);
    abrirPregunta('fin', null);
  }, [idx, marcarVista, duracion, abrirPregunta]);

  useEffect(() => { finRef.current = terminarCapsula; }, [terminarCapsula]);

  /** Continuar tras responder: volver al punto adelantado o pasar de cápsula. */
  const continuar = useCallback(() => {
    if (reanudarEn != null) {
      const destino = reanudarEn;
      setFase('video');
      setPreguntaActual(null);
      setElegida(null);
      setReanudarEn(null);
      maxVistoRef.current = Math.max(maxVistoRef.current, destino);
      // El reproductor nunca se destruyó: el salto es inmediato.
      buscar(destino);
      reproducir();
    } else {
      avanzar();
    }
  }, [reanudarEn, buscar, reproducir, avanzar]);

  // ── Reproductor de YouTube ───────────────────────────────────────────────
  // Sin `fase` en las dependencias: la pregunta se dibuja encima y el
  // reproductor sigue montado. Destruirlo al preguntar impedía recrearlo
  // después, porque el contenedor aún no existía al volver.
  useEffect(() => {
    if (!esYouTube) return;
    let cancelado = false;

    loadYouTubeApi().then(YT => {
      if (cancelado || !ytContRef.current) return;
      const hueco = document.createElement('div');
      hueco.style.width = '100%';
      hueco.style.height = '100%';
      ytContRef.current.appendChild(hueco);
      ytPlayerRef.current = new YT.Player(hueco, {
        videoId: ytId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          autoplay: 1, controls: 0, rel: 0, modestbranding: 1,
          playsinline: 1, disablekb: 1, fs: 0, iv_load_policy: 3,
        },
        events: {
          onReady: (e: any) => {
            if (cancelado) return;
            setDuracion(e.target.getDuration() || 0);
            e.target.playVideo();
            if (silencio) e.target.mute();
          },
          onStateChange: (e: any) => {
            if (cancelado) return;
            if (e.data === YT.PlayerState.ENDED) finRef.current();
            else if (e.data === YT.PlayerState.PLAYING) {
              setPausado(false);
              setNecesitaToque(false);
              setDuracion(d => d || e.target.getDuration() || 0);
            } else if (e.data === YT.PlayerState.PAUSED) setPausado(true);
            else if (e.data === YT.PlayerState.UNSTARTED) setNecesitaToque(true);
          },
          onError: () => { if (!cancelado) setNecesitaToque(true); },
        },
      });
    }).catch(() => { if (!cancelado) setNecesitaToque(true); });

    const tick = () => {
      const p = ytPlayerRef.current;
      if (p && typeof p.getCurrentTime === 'function') {
        const t = p.getCurrentTime() || 0;
        const d = p.getDuration() || 0;
        if (d > 0) setDuracion(prev => (Math.abs(prev - d) > 0.5 ? d : prev));
        setTiempo(t);
        if (t > maxVistoRef.current && t - maxVistoRef.current < 2) maxVistoRef.current = t;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelado = true;
      cancelAnimationFrame(rafRef.current);
      try { ytPlayerRef.current?.destroy?.(); } catch { /* el iframe ya se fue */ }
      ytPlayerRef.current = null;
      // El hijo desechable se va con el player; se limpia por si quedó algo.
      if (ytContRef.current) ytContRef.current.innerHTML = '';
    };
    // `silencio` se aplica aparte para no recrear el player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esYouTube, ytId]);

  useEffect(() => {
    const p = ytPlayerRef.current;
    if (!p) return;
    try { silencio ? p.mute?.() : p.unMute?.(); } catch { /* aún no listo */ }
  }, [silencio]);

  // ── Reproductor de Drive ─────────────────────────────────────────────────
  useEffect(() => {
    if (esYouTube || driveFallo) return;
    const v = videoRef.current;
    if (!v) return;
    v.play().then(() => setNecesitaToque(false)).catch(() => setNecesitaToque(true));
  }, [esYouTube, idx, driveFallo]);

  const alternarPausa = useCallback(() => {
    if (necesitaToque) { setNecesitaToque(false); reproducir(); return; }
    if (pausado) reproducir(); else pausar();
    setPausado(p => !p);
  }, [necesitaToque, pausado, reproducir, pausar]);

  const retroceder10 = useCallback(() => {
    buscar(Math.max(0, tiempo - 10));
  }, [buscar, tiempo]);

  // ── Ocultar controles en horizontal ──────────────────────────────────────
  const SEGUNDOS_OCULTAR = 5000;

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    const aplicar = () => setEsHorizontal(mq.matches);
    aplicar();
    mq.addEventListener('change', aplicar);
    return () => mq.removeEventListener('change', aplicar);
  }, []);

  /** Muestra los controles y reinicia la cuenta para esconderlos. */
  const despertarControles = useCallback(() => {
    setControles(true);
    window.clearTimeout(ocultarRef.current);
    // Solo se esconden mientras el video corre: en pausa estorban menos que
    // perder el control de reproducción.
    if (esHorizontal && fase === 'video' && !pausado && !necesitaToque && !arrastrando) {
      ocultarRef.current = window.setTimeout(() => setControles(false), SEGUNDOS_OCULTAR);
    }
  }, [esHorizontal, fase, pausado, necesitaToque, arrastrando]);

  useEffect(() => {
    despertarControles();
    return () => window.clearTimeout(ocultarRef.current);
  }, [despertarControles, idx]);

  // ── Barra de avance (adelantar) ──────────────────────────────────────────
  const fraccionEn = (clientX: number) => {
    const r = barraRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };

  /** Aplica el destino: si va más allá de lo visto, primero pide la pregunta. */
  const aplicarBusqueda = useCallback((destino: number) => {
    if (destino > maxVistoRef.current + TOLERANCIA_ADELANTO && !preguntadas.has(idx)) {
      abrirPregunta('adelanto', destino);
    } else {
      buscar(destino);
      if (destino > maxVistoRef.current) maxVistoRef.current = destino;
    }
  }, [idx, preguntadas, abrirPregunta, buscar]);

  useEffect(() => {
    if (!arrastrando) return;
    const mover = (e: PointerEvent) => setPreview(fraccionEn(e.clientX));
    const soltar = (e: PointerEvent) => {
      setArrastrando(false);
      if (duracion > 0) aplicarBusqueda(fraccionEn(e.clientX) * duracion);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    return () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
    };
  }, [arrastrando, duracion, aplicarBusqueda]);

  // Teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (fase !== 'video') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); aplicarBusqueda(tiempo + 10); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); buscar(Math.max(0, tiempo - 10)); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); marcarVista(idx); avanzar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); retroceder(); }
      else if (e.key === ' ') { e.preventDefault(); alternarPausa(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fase, idx, tiempo, aplicarBusqueda, buscar, avanzar, retroceder, alternarPausa, onClose, marcarVista]);

  // ── Gestos sobre el video ────────────────────────────────────────────────
  const onPointerDownZona = (e: React.PointerEvent<HTMLDivElement>) => {
    deslizRef.current = { y: e.clientY, movido: false };
  };
  const onPointerUpZona = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = deslizRef.current;
    deslizRef.current = null;
    if (!d) return;
    const dy = e.clientY - d.y;
    // Deslizar hacia abajo: siguiente cápsula. Hacia arriba: anterior.
    if (dy > UMBRAL_DESLIZ) { marcarVista(idx); avanzar(); return; }
    if (dy < -UMBRAL_DESLIZ) { retroceder(); return; }
    // Con los controles escondidos, el primer toque solo los devuelve.
    if (!controles) { despertarControles(); return; }
    // Toque: izquierda atrás, derecha adelante 10 s, centro pausa.
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 0.28) buscar(Math.max(0, tiempo - 10));
    else if (x > 0.72) aplicarBusqueda(tiempo + 10);
    else alternarPausa();
    despertarControles();
  };

  const correcta = preguntaActual?.correctAnswer;
  const acerto = elegida != null && elegida === correcta;
  const opciones: { letra: Letra; texto: string }[] = preguntaActual
    ? ([
        { letra: 'A' as Letra, texto: preguntaActual.optionA },
        { letra: 'B' as Letra, texto: preguntaActual.optionB },
        { letra: 'C' as Letra, texto: preguntaActual.optionC },
        { letra: 'D' as Letra, texto: preguntaActual.optionD },
      ].filter(o => o.texto && o.texto.trim()))
    : [];
  const quedanPreguntas = disponibles.length > 0;

  const fraccion = arrastrando ? preview : duracion > 0 ? Math.min(1, tiempo / duracion) : 0;
  const fraccionVista = duracion > 0 ? Math.min(1, maxVistoRef.current / duracion) : 0;
  const ultimaCapsula = idx === total - 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="media-overlay fixed inset-0 bg-black select-none"
      style={{ zIndex: 99999 }}
      // Mover el ratón (escritorio) también devuelve los controles.
      onPointerMove={() => { if (!controles) despertarControles(); }}
    >
      {fondo && fase === 'video' && (
        <div
          key={`bg-${idx}`}
          className="absolute inset-0 bg-center bg-cover"
          style={{ backgroundImage: `url(${fondo})`, filter: 'blur(28px) brightness(0.3)', transform: 'scale(1.15)' }}
        />
      )}
      <div className="absolute inset-0 bg-black/40" />

      {/* Capa de video: SIEMPRE montada. La pregunta se dibuja encima en vez
          de reemplazarla, porque destruir el reproductor impedía volver a
          crearlo (el contenedor aún no existía al regresar). */}
      <div className="absolute inset-0" aria-hidden={fase === 'pregunta'}>
            {/* ── Reproductor ── */}
            <div className="absolute inset-0 flex items-center justify-center px-0">
              {esYouTube ? (
                // Caja 16:9 centrada: en vertical el fondo difuminado se ve
                // arriba y abajo en vez de dos franjas negras.
                <div className="w-full max-h-full" style={{ aspectRatio: '16 / 9' }}>
                  <div ref={ytContRef} className="w-full h-full" />
                </div>
              ) : driveFallo ? (
                embedFallback ? (
                  <iframe
                    key={embedFallback}
                    src={embedFallback}
                    className="w-full border-0"
                    style={{ height: 'min(100vh, 100vw)' }}
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
                    <h3 className="text-xl font-bold text-[#fff] mb-2">No se pudo cargar el video</h3>
                    <p className="text-slate-400 max-w-sm text-sm">Verifica tu conexión o que el archivo sea público.</p>
                  </div>
                )
              ) : (
                <video
                  key={url}
                  ref={videoRef}
                  src={driveVideoProxyUrl(url)}
                  playsInline
                  muted={silencio}
                  className="w-full h-full object-contain"
                  onLoadedMetadata={e => setDuracion(e.currentTarget.duration || 0)}
                  onTimeUpdate={e => {
                    const v = e.currentTarget;
                    setTiempo(v.currentTime);
                    if (v.currentTime > maxVistoRef.current && v.currentTime - maxVistoRef.current < 2) {
                      maxVistoRef.current = v.currentTime;
                    }
                  }}
                  onEnded={() => finRef.current()}
                  onPlay={() => { setPausado(false); setNecesitaToque(false); }}
                  onPause={() => setPausado(true)}
                  onError={() => setDriveFallo(true)}
                />
              )}
            </div>

            {/* ── Zona de gestos ── */}
            {/* Con los controles ocultos la zona cubre todo, para que
                cualquier toque los devuelva. */}
            <div
              className="absolute inset-x-0 cursor-pointer touch-none"
              style={controles ? { top: 104, bottom: 128 } : { top: 0, bottom: 0 }}
              onPointerDown={onPointerDownZona}
              onPointerUp={onPointerUpZona}
              aria-hidden
            />

            {necesitaToque && (
              <button
                onClick={alternarPausa}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/50"
              >
                <span className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center shadow-2xl">
                  <Play className="w-9 h-9 text-[#fff] fill-white ml-1" />
                </span>
                <span className="text-[#fff] text-sm font-black uppercase tracking-widest">Toca para reproducir</span>
              </button>
            )}

            {/* ── Barras de cápsulas + cabecera ── */}
            <div className={`absolute top-0 inset-x-0 z-30 px-3 pt-3 pb-8 bg-gradient-to-b from-black/80 to-transparent pointer-events-none transition-opacity duration-300 ${controles ? 'opacity-100' : 'opacity-0'}`}>
              <div className="flex items-center gap-1">
                {videos.map((_, i) => {
                  const llenado = i < idx || completas.has(i) ? 1 : i === idx ? (sinTelemetria ? 0 : fraccion) : 0;
                  return (
                    <div key={`bar-${i}`} className="flex-1 h-1 rounded-full bg-white/25 overflow-hidden">
                      <div
                        className="h-full bg-[#fff] rounded-full"
                        style={{ width: `${llenado * 100}%`, transition: i === idx && !arrastrando ? 'width 120ms linear' : 'none' }}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="flex items-start justify-between gap-3 mt-3 pointer-events-auto">
                <div className="min-w-0">
                  <p className="text-[#fff] text-sm font-black leading-tight truncate drop-shadow">{tema}</p>
                  <p className="text-[11px] font-bold text-white/70 mt-0.5">
                    Cápsula {idx + 1} de {total}
                    {!preguntadas.has(idx) && quedanPreguntas && (
                      <span className="text-amber-400"> · con pregunta</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="flex-shrink-0 w-9 h-9 rounded-full bg-black/40 border border-white/20 text-[#fff] flex items-center justify-center backdrop-blur-sm hover:bg-[#fff] hover:text-slate-950 active:scale-90 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ── Barra de avance + controles ── */}
            <div className={`absolute bottom-0 inset-x-0 z-30 px-4 pb-5 pt-10 bg-gradient-to-t from-black/85 via-black/50 to-transparent transition-opacity duration-300 ${controles ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              {!sinTelemetria && (
                <div className="mb-3">
                  <div
                    ref={barraRef}
                    role="slider"
                    aria-label="Avance del video"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(duracion)}
                    aria-valuenow={Math.round(arrastrando ? preview * duracion : tiempo)}
                    tabIndex={0}
                    onPointerDown={e => {
                      e.preventDefault();
                      setPreview(fraccionEn(e.clientX));
                      setArrastrando(true);
                    }}
                    className="relative h-8 flex items-center cursor-pointer touch-none"
                  >
                    <div className="relative w-full h-1.5 rounded-full bg-white/25 overflow-hidden">
                      {/* Tramo ya visto: adelantar más allá pide la pregunta */}
                      <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${fraccionVista * 100}%` }} />
                      <div className="absolute inset-y-0 left-0 bg-blue-500" style={{ width: `${fraccion * 100}%` }} />
                    </div>
                    <div
                      className={`absolute rounded-full bg-[#fff] shadow-lg transition-transform ${arrastrando ? 'w-5 h-5' : 'w-3.5 h-3.5'}`}
                      style={{ left: `calc(${fraccion * 100}% - ${arrastrando ? 10 : 7}px)` }}
                    />
                  </div>
                  <div className="flex items-center justify-between -mt-1">
                    <span className="text-[10px] font-bold text-white/70 tabular-nums">
                      {reloj(arrastrando ? preview * duracion : tiempo)}
                    </span>
                    {!preguntadas.has(idx) && quedanPreguntas && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400">
                        <FastForward className="w-3 h-3" /> Adelantar activa la pregunta
                      </span>
                    )}
                    <span className="text-[10px] font-bold text-white/70 tabular-nums">{reloj(duracion)}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={alternarPausa}
                    aria-label={pausado ? 'Reproducir' : 'Pausar'}
                    className="w-11 h-11 rounded-full bg-white/15 border border-white/25 text-[#fff] flex items-center justify-center backdrop-blur-sm hover:bg-white/25 active:scale-90 transition-all"
                  >
                    {pausado ? <Play className="w-5 h-5 fill-current ml-0.5" /> : <Pause className="w-5 h-5 fill-current" />}
                  </button>
                  <button
                    onClick={retroceder10}
                    aria-label="Retroceder 10 segundos"
                    className="w-11 h-11 rounded-full bg-white/15 border border-white/25 text-[#fff] flex items-center justify-center backdrop-blur-sm hover:bg-white/25 active:scale-90 transition-all"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setSilencio(s => !s)}
                    aria-label={silencio ? 'Activar sonido' : 'Silenciar'}
                    className="w-11 h-11 rounded-full bg-white/15 border border-white/25 text-[#fff] flex items-center justify-center backdrop-blur-sm hover:bg-white/25 active:scale-90 transition-all"
                  >
                    {silencio ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                </div>

                {/* Anterior y siguiente se reparten el mismo ancho */}
                <div className="flex items-center gap-2 flex-1 max-w-[260px]">
                  <button
                    onClick={retroceder}
                    disabled={idx === 0}
                    className="flex-1 flex items-center justify-center gap-1 h-11 px-2 rounded-full bg-white/15 border border-white/25 text-[#fff] text-[11px] font-black uppercase tracking-wider hover:bg-white/25 active:scale-95 transition-all disabled:opacity-25 disabled:pointer-events-none"
                  >
                    <ChevronLeft className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">Anterior</span>
                  </button>
                  <button
                    onClick={() => { marcarVista(idx); avanzar(); }}
                    className="flex-1 flex items-center justify-center gap-1 h-11 px-2 rounded-full bg-blue-600 text-[#fff] text-[11px] font-black uppercase tracking-wider hover:bg-blue-500 active:scale-95 transition-all shadow-lg"
                  >
                    <span className="truncate">{ultimaCapsula ? 'Terminar' : 'Siguiente'}</span>
                    <ChevronRight className="w-4 h-4 flex-shrink-0" />
                  </button>
                </div>
              </div>

              {/* Solo en móvil: en escritorio el gesto no aplica y el texto
                  chocaría con los subtítulos del propio video. */}
              <p className="sm:hidden flex items-center justify-center gap-1.5 text-[10px] text-white/45 font-semibold mt-2">
                <ChevronDown className="w-3 h-3" />
                {sinTelemetria ? 'Avanza manualmente al terminar' : 'Desliza hacia abajo para la siguiente'}
              </p>
              {sinTelemetria && (
                <p className="hidden sm:block text-[10px] text-white/45 font-semibold text-center mt-2">
                  Avanza manualmente al terminar
                </p>
              )}
            </div>
      </div>

      {/* ── Pregunta: overlay opaco sobre el video pausado ── */}
      <AnimatePresence>
        {fase === 'pregunta' && (
          <motion.div
            key="fase-pregunta"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            // bg-[#0f172a] literal: el modo claro reescribe `.bg-slate-950` y
            // dejaría la tarjeta clara con el texto blanco encima, ilegible.
            className="absolute inset-0 z-40 overflow-y-auto bg-[#0f172a]"
          >
            <div className="min-h-full flex flex-col items-center justify-center p-5 py-10">
              <div className="w-full max-w-lg">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                    {motivo === 'adelanto'
                      ? <FastForward className="w-4 h-4 text-amber-400" />
                      : <Zap className="w-4 h-4 text-amber-400" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                      {motivo === 'adelanto' ? 'Adelantaste el video' : 'Fin de la cápsula'}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {tema} · Cápsula {idx + 1} de {total}
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    aria-label="Cerrar"
                    className="ml-auto w-9 h-9 rounded-full bg-white/5 border border-white/10 text-slate-300 flex items-center justify-center hover:bg-white/10 active:scale-90 transition-all flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-[#fff] leading-snug mb-6">
                  {preguntaActual?.question}
                </h2>

                <div className="space-y-2.5">
                  {opciones.map(o => {
                    const esElegida = elegida === o.letra;
                    const esCorrecta = correcta === o.letra;
                    const revelado = elegida != null;
                    let estilo = 'border-white/10 bg-white/5 hover:border-blue-500/50 hover:bg-white/10';
                    if (revelado && esCorrecta) estilo = 'border-emerald-500 bg-emerald-500/15';
                    else if (revelado && esElegida) estilo = 'border-red-500 bg-red-500/15';
                    else if (revelado) estilo = 'border-white/5 bg-white/[0.02] opacity-50';
                    return (
                      <button
                        key={`${preguntaActual?.idQuiz}-${o.letra}`}
                        disabled={revelado}
                        onClick={() => setElegida(o.letra)}
                        className={`w-full flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.99] disabled:cursor-default ${estilo}`}
                      >
                        <span className={`w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-black ${
                          revelado && esCorrecta ? 'bg-emerald-500 text-[#fff]'
                          : revelado && esElegida ? 'bg-red-500 text-[#fff]'
                          : 'bg-white/10 text-slate-300'
                        }`}>
                          {revelado && esCorrecta ? <Check className="w-4 h-4" /> : o.letra}
                        </span>
                        <span className="text-sm font-semibold text-slate-100 leading-snug pt-0.5">{o.texto}</span>
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence mode="wait">
                  {elegida != null && (
                    <motion.div
                      key={`res-${preguntaActual?.idQuiz}`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-5"
                    >
                      <div className={`p-4 rounded-2xl border ${acerto ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                        <p className={`text-sm font-black mb-1 ${acerto ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {acerto ? '¡Correcto!' : `La respuesta correcta es ${correcta}`}
                        </p>
                        {preguntaActual?.explanation && (
                          <p className="text-[13px] text-slate-300 leading-relaxed">{preguntaActual.explanation}</p>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2.5 mt-4">
                        {/* Al fallar se ofrece otra pregunta distinta del banco */}
                        {!acerto && quedanPreguntas && (
                          <button
                            onClick={otraPregunta}
                            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-amber-500 text-[#0f172a] text-xs font-black uppercase tracking-wider hover:bg-amber-400 active:scale-[0.98] transition-all shadow-lg"
                          >
                            <Zap className="w-4 h-4" /> Otra pregunta
                          </button>
                        )}
                        <button
                          onClick={continuar}
                          className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider active:scale-[0.98] transition-all ${
                            acerto || !quedanPreguntas
                              ? 'bg-blue-600 text-[#fff] hover:bg-blue-500 shadow-lg'
                              : 'border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
                          }`}
                        >
                          {reanudarEn != null
                            ? <><FastForward className="w-4 h-4" /> Continuar viendo</>
                            : ultimaCapsula
                              ? <><BookOpen className="w-4 h-4" /> Volver a la lección</>
                              : <>Siguiente cápsula <ChevronRight className="w-4 h-4" /></>}
                        </button>
                      </div>

                      {ultimaCapsula && reanudarEn == null && onNextLesson && (
                        <button
                          onClick={onNextLesson}
                          className="w-full mt-2.5 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-600 text-[#fff] text-xs font-black uppercase tracking-wider hover:bg-blue-500 active:scale-[0.98] transition-all shadow-lg"
                        >
                          Siguiente lección <ChevronRight className="w-4 h-4" />
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
