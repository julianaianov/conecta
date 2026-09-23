"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import {
  CONSENT_DOCUMENTS, CONSENT_ORIGIN_LABELS, DESCRIPTION_MAX, ERASURE_CONFIRMATION,
  EXPORT_RETENTION_DAYS, PUBLIC_PRIVACY_PATH, REQUEST_STATUS_LABELS, REQUEST_TYPES,
  REQUEST_TYPE_DESCRIPTIONS, REQUEST_TYPE_LABELS, RESPONSE_DEADLINE_DAYS, RETENTION_ACTION_LABELS,
  RETENTION_RULES, SELF_SERVICE_TYPES,
  type ConsentRecord, type DataSubjectRequestType,
} from "@/lib/app/privacy";
import type { DataExportDownload, DataSubjectRequest, MySupportItem } from "@/lib/app/types";
import { AuthPrompt } from "../AuthPrompt";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { InDevelopment } from "../InDevelopment";
import { Card, SectionTitle } from "../ui";

const date = (value: string | null | undefined) =>
  (value ? new Date(value).toLocaleDateString("pt-BR") : "—");
const dateTime = (value: string | null | undefined) =>
  (value ? new Date(value).toLocaleString("pt-BR") : "—");

/**
 * "Privacidade": um lugar só para consentimento, consentimentos opcionais e os
 * direitos do titular (T24). Tudo o que é mostrado aqui vem do servidor — o
 * aceite versionado do auth-service, os consentimentos opcionais do
 * post-service e a fila de solicitações do user-service.
 */
export function PrivacyClient() {
  const { user, status } = useAuth();

  const [consents, setConsents] = useState<{ accepted: ConsentRecord[]; pending: typeof CONSENT_DOCUMENTS } | null>(null);
  const [rankingConsent, setRankingConsent] = useState<{ consent: boolean; updatedAt: string | null; notice: string } | null>(null);
  const [supports, setSupports] = useState<MySupportItem[] | null>(null);
  const [requests, setRequests] = useState<DataSubjectRequest[] | null>(null);
  const [anonymized, setAnonymized] = useState(false);
  const [download, setDownload] = useState<DataExportDownload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [c, panel] = await Promise.allSettled([api.myConsents(), api.privacyPanel()]);
    if (c.status === "fulfilled") setConsents({ accepted: c.value.accepted ?? [], pending: c.value.pending ?? [] });
    if (panel.status === "fulfilled") {
      setRequests(panel.value.requests ?? []);
      setAnonymized(Boolean(panel.value.anonymized));
    }
    if (c.status === "rejected" && panel.status === "rejected") {
      setError("Não foi possível carregar seus dados de privacidade agora.");
    }
    api.rankingConsent().then(setRankingConsent).catch(() => setRankingConsent(null));
    api.mySupportedDemands().then(setSupports).catch(() => setSupports([]));
  }, []);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [status, load]);

  if (status === "unknown") return <p className="p-4 text-sm" style={{ color: "var(--th-muted)" }}>Carregando…</p>;
  if (!user) return <AuthPrompt action="ver e exercer seus direitos sobre os seus dados" returnTo="/perfil/privacidade" />;

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir agora.");
    } finally {
      setBusy(null);
    }
  }

  const acceptPending = () => run("consents", async () => {
    const body = await api.acceptConsents(consents!.pending.map((d) => d.key), "nova_versao");
    setConsents({ accepted: body.accepted ?? [], pending: body.pending ?? [] });
    setMessage("Aceite registrado com a versão e a data.");
  });

  const toggleRanking = (next: boolean) => run("ranking", async () => {
    setRankingConsent(await api.setRankingConsent(next));
    setMessage(next
      ? "Seu nome volta a aparecer nos rankings públicos."
      : "Seu nome sai dos rankings; a conta continua contando nos números.");
  });

  const toggleSupport = (item: MySupportItem, next: boolean) => run(`apoio:${item.id}`, async () => {
    await api.updateSupportConsent(item.demand.id, item.id, { displayConsent: next });
    setSupports((list) => (list ?? []).map((s) => (s.id === item.id ? { ...s, displayConsent: next } : s)));
    setMessage(next
      ? "O apoio volta a aparecer com o seu nome no histórico público."
      : "O apoio continua no histórico público, agora sem o seu nome.");
  });

  const openRequest = (type: DataSubjectRequestType) => run(`pedido:${type}`, async () => {
    const body = await api.createPrivacyRequest(type);
    setRequests((list) => [body.request, ...(list ?? [])]);
    setDownload(body.download);
    setMessage(body.download
      ? `Arquivo pronto. O protocolo ${body.request.protocol} fica registrado para a equipe.`
      : `Solicitação registrada com o protocolo ${body.request.protocol}. A equipe responde em até ${RESPONSE_DEADLINE_DAYS} dias.`);
  });

  const refreshExport = (request: DataSubjectRequest) => run(`export:${request.id}`, async () => {
    const body = await api.refreshPrivacyExport(request.id);
    setRequests((list) => (list ?? []).map((r) => (r.id === request.id ? body.request : r)));
    setDownload(body.download);
    setMessage("Link novo gerado.");
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Privacidade</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          Seus consentimentos e seus direitos sobre os seus dados, num lugar só.{" "}
          <Link href={PUBLIC_PRIVACY_PATH} className="font-semibold underline" style={{ color: "#f4841a" }}>
            Veja o que o DM Conecta coleta
          </Link>.
        </p>
      </header>

      {error && <p role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(229,57,53,0.10)", color: "#e53935" }}>{error}</p>}
      {message && <p role="status" className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(46,123,168,0.10)", color: "#2e7ba8" }}>{message}</p>}

      {anonymized && (
        <Card>
          <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>Esta conta foi anonimizada a seu pedido.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
            O que a lei e o interesse público mandam reter continua registrado, sem identificar você.
          </p>
        </Card>
      )}

      {/* ── Consentimento dos documentos ─────────────────── */}
      <Card>
        <SectionTitle icon="shield">Termos e Política de Privacidade</SectionTitle>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          Cada aceite fica registrado com a versão do documento, a data e a origem. A trilha não é apagada:
          é a prova de qual texto você aceitou.
        </p>

        {consents?.pending.length ? (
          <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "rgba(46,123,168,0.35)", background: "rgba(46,123,168,0.08)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>Há versão nova para aceitar</p>
            <ul className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
              {consents.pending.map((doc) => (
                <li key={doc.key}>
                  <Link href={doc.path} target="_blank" className="underline">{doc.label}</Link> — versão {doc.version}, de {doc.date}
                </li>
              ))}
            </ul>
            <Button className="mt-2" size="sm" onClick={acceptPending} loading={busy === "consents"}>Aceitar</Button>
          </div>
        ) : null}

        <ul className="mt-3 space-y-2">
          {CONSENT_DOCUMENTS.map((doc) => {
            const rows = (consents?.accepted ?? []).filter((r) => r.document === doc.key);
            const current = rows.find((r) => r.version === doc.version);
            return (
              <li key={doc.key} className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={doc.path} className="text-sm font-semibold underline" style={{ color: "var(--th-text)" }}>
                    {doc.label}
                  </Link>
                  <span className="text-xs" style={{ color: current ? "#2e7d32" : "#b45c09" }}>
                    {current ? `Aceita a versão ${doc.version}` : `Versão ${doc.version} pendente`}
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs" style={{ color: "var(--th-muted)" }}>
                  {rows.length === 0 && <li>Nenhum aceite registrado.</li>}
                  {rows.map((row) => (
                    <li key={`${row.document}:${row.version}`}>
                      Versão {row.version} (documento de {row.documentDate}) · {CONSENT_ORIGIN_LABELS[row.origin]} em {dateTime(row.acceptedAt)}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ── Consentimentos opcionais ─────────────────────── */}
      <Card>
        <SectionTitle icon="trophy">Consentimentos opcionais</SectionTitle>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          Você escolhe onde o seu nome aparece. Revogar não muda os números: a sua participação continua sendo
          contada, só deixa de ser identificada.
        </p>

        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={Boolean(rankingConsent?.consent)}
              disabled={!rankingConsent || busy === "ranking"}
              onChange={(e) => toggleRanking(e.target.checked)}
            />
            <span>
              <span className="font-semibold" style={{ color: "var(--th-text)" }}>Exibir meu nome nos rankings públicos</span>
              <span className="mt-0.5 block text-xs" style={{ color: "var(--th-muted)" }}>
                {rankingConsent?.notice ?? "Sem consentimento, a sua conta aparece sem nome e sem foto."}
                {rankingConsent?.updatedAt ? ` Última mudança em ${dateTime(rankingConsent.updatedAt)}.` : ""}
              </span>
            </span>
          </label>
        </div>

        <div className="mt-3">
          <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>Exibir meu nome nos apoios que registrei</p>
          {supports === null && <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>Carregando…</p>}
          {supports?.length === 0 && (
            <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>Você ainda não registrou apoio a nenhuma demanda.</p>
          )}
          <ul className="mt-2 space-y-2">
            {(supports ?? []).map((item) => (
              <li key={item.id} className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={item.displayConsent}
                    disabled={busy === `apoio:${item.id}`}
                    onChange={(e) => toggleSupport(item, e.target.checked)}
                  />
                  <span className="min-w-0">
                    <Link href={`/demandas/${item.demand.id}`} className="font-semibold underline" style={{ color: "var(--th-text)" }}>
                      {item.demand.title}
                    </Link>
                    <span className="mt-0.5 block text-xs" style={{ color: "var(--th-muted)" }}>
                      {item.description} · registrado em {date(item.createdAt)}
                      {item.displayConsent ? "" : " · aparece sem o seu nome"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {/* ── Direitos do titular ──────────────────────────── */}
      <Card>
        <SectionTitle icon="inventory">Seus direitos (LGPD, art. 18)</SectionTitle>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          Cada pedido gera um protocolo e um prazo de {RESPONSE_DEADLINE_DAYS} dias corridos, o mesmo prazo que a
          equipe cumpre. Acesso e portabilidade são atendidos na hora, aqui mesmo.
        </p>

        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {REQUEST_TYPES.map((type) => (
            <li key={type} className="flex flex-col rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>{REQUEST_TYPE_LABELS[type]}</span>
              <span className="mt-1 flex-1 text-xs" style={{ color: "var(--th-muted)" }}>{REQUEST_TYPE_DESCRIPTIONS[type]}</span>
              <div className="mt-2">
                {type === "correcao" ? (
                  <Link href="/perfil" className="text-xs font-semibold underline" style={{ color: "#f4841a" }}>
                    Editar meu perfil
                  </Link>
                ) : type === "eliminacao" ? (
                  <a href="#eliminar" className="text-xs font-semibold underline" style={{ color: "#e53935" }}>
                    Ir para a eliminação
                  </a>
                ) : (
                  <Button
                    size="sm"
                    variant={SELF_SERVICE_TYPES.includes(type) ? "primary" : "ghost"}
                    loading={busy === `pedido:${type}`}
                    onClick={() => openRequest(type)}
                  >
                    {SELF_SERVICE_TYPES.includes(type) ? "Gerar agora" : "Solicitar"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {download && (
          <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "rgba(46,125,50,0.35)", background: "rgba(46,125,50,0.08)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>Seu arquivo está pronto</p>
            <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
              O link vale poucos minutos e o arquivo é apagado do nosso armazenamento em {EXPORT_RETENTION_DAYS} dias.
              Soma de verificação (SHA-256): <code className="break-all">{download.sha256}</code>
            </p>
            <a
              href={download.url}
              className="mt-2 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: "#2e7d32" }}
            >
              <Icon name="download" size={14} aria-hidden /> Baixar {download.fileName}
            </a>
          </div>
        )}
      </Card>

      {/* ── Solicitações ─────────────────────────────────── */}
      <Card>
        <SectionTitle icon="inventory">Minhas solicitações</SectionTitle>
        {requests === null && <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>Carregando…</p>}
        {requests?.length === 0 && (
          <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>Nenhuma solicitação registrada.</p>
        )}
        <ul className="mt-2 space-y-2">
          {(requests ?? []).map((r) => (
            <li key={r.id} className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>
                  {REQUEST_TYPE_LABELS[r.type]} · {r.protocol}
                </span>
                <span className="text-xs font-semibold" style={{ color: "var(--th-muted)" }}>{REQUEST_STATUS_LABELS[r.status]}</span>
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
                Recebida em {date(r.receivedAt)} · prazo até {date(r.dueAt)}
                {r.fulfilledAt ? ` · atendida pelo portal em ${date(r.fulfilledAt)}` : ""}
                {r.respondedAt ? ` · respondida em ${date(r.respondedAt)}` : ""}
              </p>
              {r.response && <p className="mt-1 text-sm" style={{ color: "var(--th-text)" }}>{r.response}</p>}
              {r.export && (
                <Button
                  className="mt-2"
                  size="sm"
                  variant="ghost"
                  loading={busy === `export:${r.id}`}
                  onClick={() => refreshExport(r)}
                >
                  {r.export.expired ? "Gerar link novo" : "Baixar de novo"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {/* ── Regra de retenção e eliminação ───────────────── */}
      <Card>
        <SectionTitle icon="shield">O que acontece com cada dado se você eliminar a conta</SectionTitle>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          A conta é anonimizada, não apagada: ela é a chave de toda a trilha do portal. O que a lei e o interesse
          público mandam reter — demanda publicada, prestação de contas e auditoria — permanece sem identificar você,
          e a trilha imutável nunca é apagada nem reescrita.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr style={{ color: "var(--th-muted)" }}>
                <th scope="col" className="py-1 pr-3 font-semibold">Dado</th>
                <th scope="col" className="py-1 pr-3 font-semibold">O que acontece</th>
                <th scope="col" className="py-1 pr-3 font-semibold">Regra</th>
                <th scope="col" className="py-1 font-semibold">Base legal</th>
              </tr>
            </thead>
            <tbody>
              {RETENTION_RULES.map((rule) => (
                <tr key={rule.key} className="border-t align-top" style={{ borderColor: "var(--th-border)" }}>
                  <th scope="row" className="py-2 pr-3 font-medium" style={{ color: "var(--th-text)" }}>{rule.data}</th>
                  <td className="py-2 pr-3" style={{ color: "var(--th-text)" }}>{RETENTION_ACTION_LABELS[rule.action]}</td>
                  <td className="py-2 pr-3" style={{ color: "var(--th-muted)" }}>{rule.rule}</td>
                  <td className="py-2 text-xs" style={{ color: "var(--th-muted)" }}>{rule.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {!anonymized && <ErasureCard busy={busy} onDone={() => { setDownload(null); void load(); }} onError={setError} onMessage={setMessage} />}

      <InDevelopment title="Em desenvolvimento">
        Recuperação de senha por e-mail e pagamento dentro da plataforma ainda não existem. Enquanto isso, o apoio
        financeiro é <strong>valor declarado</strong> (a plataforma não processa pagamento) e a troca de senha é feita
        pela equipe, pelo canal de contato da Política de Privacidade.
      </InDevelopment>
    </div>
  );
}

/** Eliminação: senha e confirmação escrita, porque não tem volta. */
function ErasureCard({
  busy, onDone, onError, onMessage,
}: {
  busy: string | null;
  onDone: () => void;
  onError: (message: string | null) => void;
  onMessage: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [running, setRunning] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setRunning(true);
    onError(null);
    onMessage(null);
    try {
      const result = await api.requestAccountErasure({
        password, confirmation, description: reason.trim() || undefined,
      });
      onMessage(`${result.notice} Protocolo ${result.request.protocol}.`);
      setOpen(false);
      setPassword("");
      setConfirmation("");
      setReason("");
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Não foi possível concluir a eliminação.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <span id="eliminar" />
      <SectionTitle icon="close">Eliminar minha conta</SectionTitle>
      <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
        A eliminação anonimiza a sua conta e o seu perfil, remove o seu nome das publicações e dos comentários e
        revoga os consentimentos de exibição. <strong>Não tem volta</strong> e você perde o acesso na hora.
      </p>

      {!open ? (
        <Button className="mt-3" size="sm" variant="ghost" onClick={() => setOpen(true)}>
          Quero eliminar minha conta
        </Button>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="font-semibold" style={{ color: "var(--th-text)" }}>Sua senha</span>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="app-input mt-1" autoComplete="current-password"
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold" style={{ color: "var(--th-text)" }}>
              Digite {ERASURE_CONFIRMATION} para confirmar
            </span>
            <input
              required value={confirmation} onChange={(e) => setConfirmation(e.target.value)}
              className="app-input mt-1" placeholder={ERASURE_CONFIRMATION}
            />
          </label>
          <label className="block text-sm">
            <span className="font-semibold" style={{ color: "var(--th-text)" }}>Motivo (opcional)</span>
            <textarea
              value={reason} onChange={(e) => setReason(e.target.value)} maxLength={DESCRIPTION_MAX}
              rows={2} className="app-input mt-1"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="danger" loading={running || busy === "erasure"}>Eliminar definitivamente</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
