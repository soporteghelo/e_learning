import { motion } from 'framer-motion';
import { DatabaseZap } from 'lucide-react';

/**
 * Brillo que recorre un bloque gris de izquierda a derecha (esqueleto de carga).
 * Es un <span> para poder ir dentro de un <p> (la versión en línea vive en el
 * texto de las tarjetas).
 */
function Shimmer({ className = '' }: { className?: string }) {
  return (
    <span className={`relative block overflow-hidden rounded-md bg-[#eceef1] ${className}`}>
      <motion.span
        className="absolute inset-y-0 block w-1/2 bg-gradient-to-r from-transparent via-white/80 to-transparent"
        initial={{ x: '-100%' }}
        animate={{ x: '250%' }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </span>
  );
}

/** Puntos suspensivos animados para los textos "Extrayendo información…". */
function Dots() {
  return (
    <span className="inline-flex w-4">
      {[0, 1, 2].map(i => (
        <motion.span key={i} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}>.</motion.span>
      ))}
    </span>
  );
}

/**
 * Animación de "extrayendo información" para las cargas largas del PAC (padrón
 * de personal, resultados, firmas). Con `progress` muestra una barra real; sin
 * él, una barra indeterminada. `rows` dibuja filas esqueleto debajo, que sugieren
 * la tabla que está por aparecer.
 */
export default function ExtractingLoader({ label, detail, progress, rows = 3 }: {
  label: string;
  detail?: string;
  progress?: { done: number; total: number };
  rows?: number;
}) {
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;
  return (
    <div className="flex flex-col items-center gap-3 py-6 w-full" role="status" aria-live="polite">
      <div className="relative w-12 h-12 flex items-center justify-center">
        {[0, 1].map(i => (
          <motion.span key={i} className="absolute inset-0 rounded-full border-2 border-[#1b4d89]/40"
            initial={{ scale: 0.6, opacity: 0.8 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }} />
        ))}
        <div className="relative w-10 h-10 rounded-full bg-[#1b4d89]/10 flex items-center justify-center">
          <DatabaseZap className="w-5 h-5 text-[#1b4d89]" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-xs font-bold text-[#00366b]">{label}<Dots /></p>
        {(detail || pct !== null) && (
          <p className="text-[10px] text-[#737781] mt-0.5">
            {detail}{detail && pct !== null ? ' · ' : ''}{pct !== null ? `${progress!.done}/${progress!.total} (${pct}%)` : ''}
          </p>
        )}
      </div>
      <div className="w-56 max-w-full h-1.5 rounded-full bg-[#e1e3e4] overflow-hidden">
        {pct !== null ? (
          <motion.div className="h-full bg-[#1b4d89] rounded-full" animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} />
        ) : (
          <motion.div className="h-full w-1/3 bg-[#1b4d89] rounded-full"
            initial={{ x: '-100%' }} animate={{ x: '300%' }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }} />
        )}
      </div>
      {rows > 0 && (
        <div className="w-full max-w-xl space-y-2 mt-1">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Shimmer className="h-3 w-16" />
              <Shimmer className="h-3 flex-1" />
              <Shimmer className="h-3 w-12" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Versión en línea (una pastilla) para contadores dentro de una tarjeta. */
export function ExtractingInline({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#1b4d89] align-middle">
      <Shimmer className="h-2.5 w-10" />
      {label}<Dots />
    </span>
  );
}
