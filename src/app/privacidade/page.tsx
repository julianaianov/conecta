import React from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { metadataForPage } from "@/lib/seo/site";
import {
  CONSENT_DOCUMENTS, DATA_INVENTORY, DATA_SHARING, EXPORT_RETENTION_DAYS, NOT_COLLECTED,
  PRIVACY_PATH, REQUEST_TYPES, REQUEST_TYPE_DESCRIPTIONS, REQUEST_TYPE_LABELS,
  RESPONSE_DEADLINE_DAYS, RETENTION_ACTION_LABELS, RETENTION_RULES,
} from "@/lib/app/privacy";

export const metadata = metadataForPage({
  title: "Privacidade e dados — DM Conecta",
  description:
    "O que o DM Conecta guarda de cada conta, para quê, com quem compartilha e como exercer os direitos da LGPD.",
  path: "/privacidade",
});

const VISIBILITY_LABELS = {
  "público": "Aparece publicamente",
  privado: "Só você e, quando preciso, a equipe",
  equipe: "Só a equipe, com acesso auditado",
} as const;

/**
 * Página pública de privacidade (T24). A lista do que é coletado é **derivada
 * do schema real** dos três bancos (`src/lib/app/privacy.ts`, com a origem de
 * cada bloco anotada) — nada aqui é promessa: é o que as tabelas guardam.
 *
 * Fonte: Apresentação Institucional, slide 25 — LGPD em toda a coleta, uso e
 * compartilhamento; só dados verificáveis são publicados.
 */
export default function PrivacidadePublicaPage() {
  return (
    <div className="flex min-h-screen flex-col justify-between bg-slate-900 text-slate-100">
      <Navbar />
      <main className="mx-auto max-w-4xl flex-1 px-4 py-12">
        <h1 className="mb-2 text-3xl font-bold text-emerald-400 md:text-4xl">Privacidade e dados</h1>
        <p className="mb-8 text-sm text-slate-400">
          Atualizado em 22 de setembro de 2026 · complementa a{" "}
          <Link href="/politica-de-privacidade" className="text-emerald-400 hover:underline">Política de Privacidade</Link>{" "}
          e os <Link href="/termos-de-uso" className="text-emerald-400 hover:underline">Termos de Uso</Link>.
        </p>

        <section className="space-y-4 leading-relaxed text-slate-300">
          <p>
            Esta página lista, item por item, <strong>o que o DM Conecta realmente guarda</strong>. A lista é
            derivada do banco de dados da plataforma: cada bloco indica a tabela de origem. Se um dado não está
            aqui, a plataforma não o coleta.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-xl font-semibold text-white">1. O que é coletado</h2>
          <div className="space-y-4">
            {DATA_INVENTORY.map((entry) => (
              <article key={entry.group} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-white">{entry.group}</h3>
                  <span className="text-xs text-slate-400">
                    {VISIBILITY_LABELS[entry.visibility]}
                    {entry.optional ? " · depende do seu consentimento" : ""}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-300">{entry.purpose}</p>
                <ul className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-sm text-slate-400">
                  {entry.fields.map((field) => (
                    <li key={field} className="rounded-full bg-slate-800 px-2 py-0.5">{field}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500">Origem: {entry.source}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-xl font-semibold text-white">2. O que não é coletado</h2>
          <ul className="list-inside list-disc space-y-1 pl-4 text-slate-300">
            {NOT_COLLECTED.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-xl font-semibold text-white">3. Com quem os dados são compartilhados</h2>
          <ul className="space-y-2 text-slate-300">
            {DATA_SHARING.map((item) => (
              <li key={item.who}>
                <strong className="text-white">{item.who}</strong> — {item.what}
                {item.note ? <span className="text-slate-400"> ({item.note})</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-400">
            A plataforma não vende dados e não os compartilha com anunciantes.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-xl font-semibold text-white">4. Consentimento</h2>
          <p className="text-slate-300">
            Criar conta exige aceitar os documentos vigentes. Cada aceite é registrado com a versão, a data e a
            origem, e o registro nunca é alterado. Quando um documento muda de versão, o portal pede o aceite de
            novo. Documentos vigentes:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 pl-4 text-slate-300">
            {CONSENT_DOCUMENTS.map((doc) => (
              <li key={doc.key}>
                <Link href={doc.path} className="text-emerald-400 hover:underline">{doc.label}</Link> — versão {doc.version}, de {doc.date}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-slate-300">
            Consentimentos <strong>opcionais</strong> (exibir seu nome nos rankings e nos apoios que você registrou)
            podem ser dados e revogados a qualquer momento em Privacidade, na sua conta. Revogar não altera os
            números da plataforma: a sua participação continua contando, sem identificação.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-xl font-semibold text-white">5. Seus direitos (LGPD, art. 18)</h2>
          <ul className="space-y-2 text-slate-300">
            {REQUEST_TYPES.map((type) => (
              <li key={type}>
                <strong className="text-white">{REQUEST_TYPE_LABELS[type]}</strong> — {REQUEST_TYPE_DESCRIPTIONS[type]}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-slate-300">
            Os pedidos são feitos em{" "}
            <Link href={PRIVACY_PATH} className="text-emerald-400 hover:underline">Privacidade</Link>, na sua conta.
            Cada um gera um protocolo e é respondido em até {RESPONSE_DEADLINE_DAYS} dias corridos (art. 19, II).
            O arquivo de acesso e portabilidade é entregue por link temporário e some do nosso armazenamento em{" "}
            {EXPORT_RETENTION_DAYS} dias.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-xl font-semibold text-white">6. O que fica guardado depois da eliminação</h2>
          <p className="text-slate-300">
            Eliminar a conta significa <strong>anonimizar</strong>: a identificação sai, e o que a lei e o interesse
            público mandam reter — demanda publicada, prestação de contas, auditoria — permanece sem apontar para
            você. A trilha imutável nunca é apagada nem reescrita.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Regra de retenção por tipo de dado</caption>
              <thead>
                <tr className="text-slate-400">
                  <th scope="col" className="py-2 pr-3">Dado</th>
                  <th scope="col" className="py-2 pr-3">O que acontece</th>
                  <th scope="col" className="py-2 pr-3">Regra</th>
                  <th scope="col" className="py-2">Base legal</th>
                </tr>
              </thead>
              <tbody>
                {RETENTION_RULES.map((rule) => (
                  <tr key={rule.key} className="border-t border-slate-800 align-top">
                    <th scope="row" className="py-2 pr-3 font-medium text-white">{rule.data}</th>
                    <td className="py-2 pr-3 text-slate-200">{RETENTION_ACTION_LABELS[rule.action]}</td>
                    <td className="py-2 pr-3 text-slate-400">{rule.rule}</td>
                    <td className="py-2 text-xs text-slate-500">{rule.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-xl font-semibold text-white">7. Em desenvolvimento</h2>
          <p className="text-slate-300">
            Para não prometer o que ainda não existe: a plataforma <strong>não processa pagamento</strong> (o apoio
            financeiro é valor declarado e conferido entre as partes), a recuperação de senha por e-mail ainda não
            está disponível e os recursos de inteligência artificial previstos no projeto não estão em operação.
          </p>
        </section>

        <div className="mt-12 border-t border-slate-800 pt-6">
          <Link href="/feed" className="font-medium text-emerald-400 hover:text-emerald-300">
            ← Voltar para o DM Conecta
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
