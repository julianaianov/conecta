// Denúncia de publicação, comentário, demanda e perfil (T6.3): vocabulário,
// rótulos e tipos da interface. Espelha
// services/post-service/src/report/constants.js (report.test.mjs compara as
// listas). O servidor é quem decide; aqui só se orienta a tela.
//
// Fonte: 01-apresentacao-institucional.html, slide 26 (Governança: LGPD,
// neutralidade político-partidária e publicação apenas de dados verificáveis).
//
// A tela nunca mostra o desfecho da denúncia — nem para quem denunciou, nem
// para quem foi denunciado. A confirmação diz só que a denúncia foi recebida.

export type ReportTargetKind = "publicacao" | "comentario" | "demanda" | "perfil";

export type ReportReason =
  | "conteudo_improprio"
  | "informacao_falsa"
  | "spam"
  | "discurso_de_odio"
  | "dado_pessoal_indevido"
  | "outro";

/** O que quem denunciou vê: em apuração ou já analisada. Nunca o resultado. */
export type ReportReporterState = "em_apuracao" | "analisada";

export const REPORT_TARGET_KINDS: ReportTargetKind[] = [
  "publicacao",
  "comentario",
  "demanda",
  "perfil",
];

export const REPORT_TARGET_LABELS: Record<ReportTargetKind, string> = {
  publicacao: "Publicação",
  comentario: "Comentário",
  demanda: "Demanda",
  perfil: "Perfil",
};

export const REPORT_REASONS: ReportReason[] = [
  "conteudo_improprio",
  "informacao_falsa",
  "spam",
  "discurso_de_odio",
  "dado_pessoal_indevido",
  "outro",
];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  conteudo_improprio: "Conteúdo impróprio",
  informacao_falsa: "Informação falsa",
  spam: "Spam",
  discurso_de_odio: "Discurso de ódio",
  dado_pessoal_indevido: "Dado pessoal indevido",
  outro: "Outro",
};

/** Ajuda curta de cada motivo, para a escolha não depender só do rótulo. */
export const REPORT_REASON_HINTS: Record<ReportReason, string> = {
  conteudo_improprio: "Violência, conteúdo sexual ou qualquer coisa fora das regras de convivência.",
  informacao_falsa: "Dado, número ou afirmação que não se sustenta e engana quem lê.",
  spam: "Repetição, propaganda ou conteúdo comercial fora de lugar.",
  discurso_de_odio: "Ataque a pessoa ou grupo por raça, religião, origem, gênero, orientação ou deficiência.",
  dado_pessoal_indevido: "Telefone, endereço, documento, foto ou outro dado pessoal exposto sem autorização (LGPD).",
  outro: "Descreva o que houve — a descrição é obrigatória neste motivo.",
};

export const REPORT_REASON_REQUIRING_DESCRIPTION: ReportReason = "outro";

export const REPORT_DESCRIPTION_MAX = 2000;

/** Limite de taxa por conta; o servidor confere de novo antes de gravar. */
export const REPORT_RATE_LIMIT = { perHour: 5, perDay: 20 };

export const REPORT_STATE_LABELS: Record<ReportReporterState, string> = {
  em_apuracao: "Em apuração",
  analisada: "Analisada",
};

export const REPORT_CONFIRMATION_NOTICE =
  "Denúncia recebida. A equipe de moderação analisa cada caso e o resultado"
  + " não é divulgado a quem denunciou nem a quem foi denunciado.";

export type MyReport = {
  id: string;
  targetKind: ReportTargetKind;
  targetId: string;
  reason: ReportReason;
  description: string | null;
  state: ReportReporterState;
  createdAt: string;
};

export type ReportContext = {
  targetKind: ReportTargetKind;
  targetId: string;
  alreadyReported: boolean;
  canReport: boolean;
  remaining: { hour: number; day: number };
  notice: string;
};

export type ReportInput = {
  targetKind: ReportTargetKind;
  targetId: string;
  reason: ReportReason;
  description?: string;
};

export function reportTargetLabel(kind: ReportTargetKind): string {
  return REPORT_TARGET_LABELS[kind] ?? kind;
}

export function reportReasonLabel(reason: ReportReason): string {
  return REPORT_REASON_LABELS[reason] ?? reason;
}

/** A descrição é obrigatória só no motivo "Outro". */
export function reportDescriptionRequired(reason: ReportReason | null): boolean {
  return reason === REPORT_REASON_REQUIRING_DESCRIPTION;
}

/** Mensagem de erro do servidor traduzida para a tela. */
export function reportErrorMessage(code: string | null, fallback: string): string {
  switch (code) {
    case "report_already_open":
      return "Você já denunciou este conteúdo e a análise ainda está em andamento.";
    case "report_rate_limited":
      return "Você enviou muitas denúncias em pouco tempo. Tente de novo mais tarde.";
    default:
      return fallback;
  }
}
