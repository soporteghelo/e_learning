/** Paginador compacto para tablas grandes. */
export default function Pager({ page, totalPages, total, onPage, pageSize = 25 }: { page: number; totalPages: number; total: number; onPage: (p: number) => void; pageSize?: number }) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-[#f3f4f5]">
      <span className="text-[10px] text-[#737781]">{from}–{to} de {total}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}
          className="px-2 py-1 rounded-md bg-white border border-[#e1e3e4] text-[10px] font-bold text-[#424750] hover:bg-[#f3f4f5] disabled:opacity-40 disabled:cursor-not-allowed">‹ Ant.</button>
        <span className="text-[10px] font-bold text-[#424750] px-1">Pág. {page}/{totalPages}</span>
        <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
          className="px-2 py-1 rounded-md bg-white border border-[#e1e3e4] text-[10px] font-bold text-[#424750] hover:bg-[#f3f4f5] disabled:opacity-40 disabled:cursor-not-allowed">Sig. ›</button>
      </div>
    </div>
  );
}
