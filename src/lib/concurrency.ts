/**
 * `Promise.all(items.map(fn))` pero con a lo sumo `limit` tareas a la vez, para
 * no disparar cientos de descargas simultáneas (p.ej. las firmas de un registro
 * F62 con mucha asistencia). Conserva el orden de `items` en el resultado y avisa
 * el avance con `onProgress(hechas, total)`. Si `isCancelled()` pasa a true deja
 * de lanzar tareas nuevas (las que ya están en curso terminan igual).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  opts: { onProgress?: (done: number, total: number) => void; isCancelled?: () => boolean } = {},
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length && !opts.isCancelled?.()) {
      const i = next++;
      results[i] = await fn(items[i], i);
      done++;
      opts.onProgress?.(done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}
