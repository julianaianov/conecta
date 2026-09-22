"use client";

import { barPercent, formatIndicator } from "@/lib/app/government";

/**
 * Gráfico de barras acessível (T22): as barras são decoração
 * (`aria-hidden`) e a **tabela** ao lado é o conteúdo real, sempre presente —
 * quem usa leitor de tela, teclado ou impressão lê os mesmos números. Nada
 * depende de cor para ser entendido: cada linha tem rótulo e valor em texto.
 */
export function IndicatorBarChart({
  caption, rows, columns, id,
}: {
  caption: string;
  id: string;
  /** Colunas extras da tabela, depois do total. */
  columns?: { key: string; label: string }[];
  rows: { label: string; value: number; extras?: Record<string, number> }[];
}) {
  const max = rows.reduce((acc, row) => Math.max(acc, row.value), 0);
  const extraColumns = columns ?? [];

  if (!rows.length) {
    return (
      <p className="text-sm" style={{ color: "var(--th-muted)" }}>
        Nenhum dado no recorte e no período escolhidos.
      </p>
    );
  }

  return (
    <figure className="m-0">
      <table className="w-full border-collapse text-sm">
        <caption className="mb-2 text-left text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>
          {caption}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="py-1 text-left font-semibold" style={{ color: "var(--th-muted)" }}>Item</th>
            <th scope="col" className="py-1 text-right font-semibold" style={{ color: "var(--th-muted)" }}>Total</th>
            {extraColumns.map((column) => (
              <th key={column.key} scope="col" className="py-1 text-right font-semibold" style={{ color: "var(--th-muted)" }}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${id}-${row.label}`} className="border-t" style={{ borderColor: "var(--th-border)" }}>
              <th scope="row" className="py-2 pr-3 text-left font-medium" style={{ color: "var(--th-text)" }}>
                {row.label}
                <span
                  aria-hidden="true"
                  className="mt-1 block h-2 rounded-full"
                  style={{ width: `${barPercent(row.value, max)}%`, background: "#2e7ba8", minWidth: row.value > 0 ? "0.5rem" : 0 }}
                />
              </th>
              <td className="py-2 text-right font-numeric font-bold" style={{ color: "var(--th-text)" }}>
                {formatIndicator(row.value)}
              </td>
              {extraColumns.map((column) => (
                <td key={column.key} className="py-2 text-right font-numeric" style={{ color: "var(--th-muted)" }}>
                  {formatIndicator(row.extras?.[column.key] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Número do painel, com a frase que diz de onde ele sai (slide 25: só dado verificável). */
export function IndicatorCard({ label, value, source }: { label: string; value: number; source?: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)", background: "var(--th-card)" }}>
      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>{label}</p>
      <p className="font-numeric text-2xl font-bold" style={{ color: "var(--th-text)" }}>{formatIndicator(value)}</p>
      {source && <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--th-muted)" }}>{source}</p>}
    </div>
  );
}
