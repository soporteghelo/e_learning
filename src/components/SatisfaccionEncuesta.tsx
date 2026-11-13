import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Send, Star } from 'lucide-react';
import { SATISFACCION_PREGUNTAS, saveCursoEncuesta } from '../services/sheetsService';
import type { LearnTopic, SatisfaccionRating, UserSession } from '../types';

const OPCIONES: { valor: SatisfaccionRating; emoji: string }[] = [
  { valor: 'Excelente', emoji: '😀' },
  { valor: 'Bueno', emoji: '🙂' },
  { valor: 'Regular', emoji: '😐' },
  { valor: 'Malo', emoji: '🙁' },
];

/** Marca local para no volver a pedir la encuesta del mismo curso al reintentar el quiz. */
export function encuestaStorageKey(topicId: string, dni?: string): string {
  return `ldc_encuesta_${topicId}_${dni || 'anon'}`;
}

export function yaRespondioEncuesta(topicId: string, dni?: string): boolean {
  try {
    return localStorage.getItem(encuestaStorageKey(topicId, dni)) === 'true';
  } catch {
    return false;
  }
}

interface SatisfaccionEncuestaProps {
  topic: LearnTopic;
  nota: number;
  userSession?: UserSession;
  onDone: () => void;
}

/**
 * Encuesta breve que se muestra al cerrar el quiz de un curso. El envío no
 * bloquea la salida: si falla la red, `saveCursoEncuesta` encola la respuesta y
 * el trabajador continúa igual.
 */
export default function SatisfaccionEncuesta({ topic, nota, userSession, onDone }: SatisfaccionEncuestaProps) {
  const [respuestas, setRespuestas] = useState<(SatisfaccionRating | null)[]>(
    Array(SATISFACCION_PREGUNTAS.length).fill(null)
  );
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const respondidas = respuestas.filter(Boolean).length;

  const handleSubmit = async () => {
    if (respuestas.some(r => r === null)) {
      setError('Responde las 4 preguntas para continuar.');
      return;
    }
    setError('');
    setEnviando(true);
    try {
      await saveCursoEncuesta({
        dni: userSession?.dni || '',
        apellidos: userSession?.apellidos || '',
        nombres: userSession?.nombres || '',
        topicId: topic.id,
        courseTitle: topic.title,
        nota,
        respuestas: respuestas as SatisfaccionRating[],
        comentario: comentario.trim(),
      });
      try { localStorage.setItem(encuestaStorageKey(topic.id, userSession?.dni), 'true'); } catch { /* cuota llena */ }
    } finally {
      setEnviando(false);
      onDone();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 safe-area-top safe-area-bottom overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass-card rounded-3xl p-7 shadow-2xl my-6"
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center flex-shrink-0">
            <Star className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white leading-tight">Encuesta de satisfacción</h2>
            <p className="text-[11px] text-slate-400 font-medium">Tu opinión mejora las próximas capacitaciones</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-4 mb-5">
          {SATISFACCION_PREGUNTAS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${respuestas[i] ? 'bg-emerald-500' : 'bg-white/10'}`} />
          ))}
          <span className="text-[10px] font-black text-slate-500 tabular-nums ml-1">{respondidas}/{SATISFACCION_PREGUNTAS.length}</span>
        </div>

        <div className="space-y-5">
          {SATISFACCION_PREGUNTAS.map((pregunta, i) => (
            <div key={i}>
              <p className="text-[13px] font-semibold text-slate-100 mb-2 leading-snug">{i + 1}. {pregunta}</p>
              <div className="grid grid-cols-4 gap-1.5">
                {OPCIONES.map(op => {
                  const activo = respuestas[i] === op.valor;
                  return (
                    <button
                      key={op.valor}
                      onClick={() => {
                        setRespuestas(prev => prev.map((r, idx) => (idx === i ? op.valor : r)));
                        setError('');
                      }}
                      className={`flex flex-col items-center gap-0.5 py-2 rounded-xl border text-[9px] font-black uppercase tracking-wide transition-all active:scale-95 ${
                        activo
                          ? 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-900/40'
                          : 'bg-white/5 text-slate-400 border-white/10 hover:border-white/25 hover:text-slate-200'
                      }`}
                    >
                      <span className="text-base leading-none">{op.emoji}</span>
                      {op.valor}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div>
            <label className="block text-[13px] font-semibold text-slate-100 mb-2">
              Comentarios o sugerencias <span className="text-slate-500 font-medium">(opcional)</span>
            </label>
            <textarea
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              rows={3}
              placeholder="¿Qué mejorarías de este curso?"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-slate-600 focus:border-blue-500/50 outline-none transition-all resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-rose-500/10 rounded-xl border border-rose-500/20">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <p className="text-xs text-rose-300 font-medium">{error}</p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={enviando}
            className="w-full btn-primary py-4 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            {enviando ? 'Enviando…' : 'Enviar y finalizar'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
