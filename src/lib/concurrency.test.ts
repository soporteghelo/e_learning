import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from './concurrency';

const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('mapWithConcurrency', () => {
  it('respeta el límite de tareas simultáneas y conserva el orden', async () => {
    let enCurso = 0;
    let maximo = 0;
    const avance: number[] = [];
    const res = await mapWithConcurrency([5, 1, 4, 2, 3, 1, 2], 3, async (n) => {
      enCurso++; maximo = Math.max(maximo, enCurso);
      await espera(n);
      enCurso--;
      return n * 10;
    }, { onProgress: (d) => avance.push(d) });
    expect(res).toEqual([50, 10, 40, 20, 30, 10, 20]);
    expect(maximo).toBe(3);
    expect(avance).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('deja de lanzar tareas nuevas al cancelar', async () => {
    let lanzadas = 0;
    let cancelado = false;
    await mapWithConcurrency(Array.from({ length: 10 }), 2, async () => {
      lanzadas++;
      if (lanzadas === 2) cancelado = true;
      await espera(1);
    }, { isCancelled: () => cancelado });
    expect(lanzadas).toBe(2);
  });

  it('no falla con una lista vacía', async () => {
    expect(await mapWithConcurrency([], 6, async () => 1)).toEqual([]);
  });
});
