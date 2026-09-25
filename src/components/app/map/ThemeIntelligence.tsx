import Link from "next/link";
import type { ThemeIntelligence as ThemeIntelligenceData } from "@/lib/app/types";

/**
 * Inteligência territorial por eixo temático (T26; Apresentação, slide 26:
 * "identificar padrões, prioridades e oportunidades de atuação por território").
 * Lê `GET /demands/themes/intelligence` com o mesmo recorte do mapa. Tabelas
 * com barras decorativas (`aria-hidden`): o número serve leitor de tela,
 * teclado e impressão. Sem dado pessoal: só contagens e nomes de lugar.
 */
export function ThemeIntelligence({ data, crossingsMax = 20 }: { data: ThemeIntelligenceData | null; crossingsMax?: number }) {
  if (!data) return null;
  const max = Math.max(1, ...data.themes.map((t) => t.total));
  const crossings = data.byTerritory.slice(0, crossingsMax);
  const withTheme = data.demandsWithTheme;

  return (
    <section className="app-card rounded-2xl p-4" aria-labelledby="theme-intelligence-title">
      <h2 id="theme-intelligence-title" className="text-sm font-bold" style={{ color: "var(--th-text)" }}>
        Inteligência territorial por eixo temático
      </h2>
      <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
        {withTheme.toLocaleString("pt-BR")} de {data.demandsTotal.toLocaleString("pt-BR")} demanda{data.demandsTotal === 1 ? "" : "s"} do
        recorte com eixo marcado pelo Agente. Uma demanda pode ter mais de um eixo; sem eixo, ela não entra nesta leitura.
      </p>

      <div className="mt-3 overflow-x-auto rounded-xl border" style={{ borderColor: "var(--th-border)" }}>
        <table className="w-full min-w-[30rem] text-left text-sm">
          <caption className="sr-only">Demandas por eixo temático</caption>
          <thead style={{ background: "var(--th-card-alt)", color: "var(--th-muted)" }}>
            <tr className="text-xs uppercase tracking-wide">
              <th scope="col" className="px-3 py-2">Eixo</th>
              <th scope="col" className="px-3 py-2 text-right">Demandas</th>
              <th scope="col" className="px-3 py-2 text-right">Urgentes</th>
              <th scope="col" className="px-3 py-2 text-right">Concluídas</th>
              <th scope="col" className="px-3 py-2 text-right">Territórios</th>
            </tr>
          </thead>
          <tbody>
            {data.themes.map((t) => (
              <tr key={t.theme} className="border-t" style={{ borderColor: "var(--th-border)", color: "var(--th-text)" }}>
                <th scope="row" className="px-3 py-2 font-semibold">
                  <Link href={`/mapa?theme=${t.theme}`} className="hover:underline">{t.label}</Link>
                  <span aria-hidden="true" className="mt-1 block h-1.5 rounded-full" style={{ width: `${Math.round((t.total / max) * 100)}%`, minWidth: t.total ? 4 : 0, background: "#2e7ba8" }} />
                </th>
                <td className="px-3 py-2 text-right font-numeric font-semibold">{t.total.toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2 text-right font-numeric">{t.urgent.toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2 text-right font-numeric">{t.concluded.toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2 text-right font-numeric">{t.territories.toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {crossings.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Eixo × território (maiores concentrações)</h3>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {crossings.map((c) => (
              <li key={`${c.theme}-${c.slug}`} className="flex items-baseline justify-between gap-2 text-sm" style={{ color: "var(--th-text)" }}>
                <span className="min-w-0 truncate">
                  <strong>{c.label}</strong> em{" "}
                  <Link href={`/mapa/${encodeURIComponent(c.slug)}`} className="hover:underline">
                    {[c.territory, c.municipality, c.uf].filter(Boolean).join(", ")}
                  </Link>
                </span>
                <span className="shrink-0 font-numeric text-xs" style={{ color: "var(--th-muted)" }}>
                  {c.total.toLocaleString("pt-BR")}{c.urgent ? ` · ${c.urgent} urgente${c.urgent === 1 ? "" : "s"}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {(data.truncated || data.byTerritory.length > crossings.length) && (
            <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>Mostrando as {crossings.length} maiores concentrações.</p>
          )}
        </>
      )}
    </section>
  );
}
