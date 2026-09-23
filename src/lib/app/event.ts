// Eventos do território e inscrições (T25): vocabulário, rótulos, tipos e
// formatação da interface. Espelha services/post-service/src/event/constants.js
// (event.test.mjs compara as listas). O servidor é quem decide; aqui só se
// orienta a tela.
//
// Fonte: 01-apresentacao-institucional.html, slide 9 (Membros da Comunidade:
// "Inscrever-se em eventos", "Oferecer voluntariado"), slide 18 (conteúdos do
// território: eventos, oficinas culturais, mutirões, ações ambientais, aulas
// esportivas), slide 19 (mapa com demandas e conteúdos) e slide 20
// ("Financiar eventos"). Decisão 5: a plataforma não processa pagamento.

export type EventKind = "evento" | "oficina_cultural" | "mutirao" | "acao_ambiental" | "aula_esportiva";
export type EventStatus = "rascunho" | "publicado" | "cancelado";
export type EventPricing = "gratuito" | "pago";
export type EventSignupStatus = "inscrito" | "lista_de_espera" | "cancelado";
export type EventAccessibility =
  | "acesso_para_cadeirantes"
  | "banheiro_acessivel"
  | "piso_tatil"
  | "interprete_de_libras"
  | "audiodescricao"
  | "acompanhante_permitido"
  | "transporte_acessivel"
  | "espaco_para_caes_guia";

export const EVENT_KINDS: EventKind[] = [
  "evento", "oficina_cultural", "mutirao", "acao_ambiental", "aula_esportiva",
];

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  evento: "Evento",
  oficina_cultural: "Oficina cultural",
  mutirao: "Mutirão",
  acao_ambiental: "Ação ambiental",
  aula_esportiva: "Aula esportiva",
};

export const EVENT_STATUSES: EventStatus[] = ["rascunho", "publicado", "cancelado"];

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  rascunho: "Rascunho",
  publicado: "Publicado",
  cancelado: "Cancelado",
};

export const EVENT_PUBLIC_STATUSES: EventStatus[] = ["publicado", "cancelado"];

export const EVENT_PRICING: EventPricing[] = ["gratuito", "pago"];

export const EVENT_PRICING_LABELS: Record<EventPricing, string> = {
  gratuito: "Gratuito",
  pago: "Pago (cobrança fora da plataforma)",
};

export const EVENT_ACCESSIBILITY: EventAccessibility[] = [
  "acesso_para_cadeirantes", "banheiro_acessivel", "piso_tatil",
  "interprete_de_libras", "audiodescricao", "acompanhante_permitido",
  "transporte_acessivel", "espaco_para_caes_guia",
];

export const EVENT_ACCESSIBILITY_LABELS: Record<EventAccessibility, string> = {
  acesso_para_cadeirantes: "Acesso para cadeirantes",
  banheiro_acessivel: "Banheiro acessível",
  piso_tatil: "Piso tátil",
  interprete_de_libras: "Intérprete de Libras",
  audiodescricao: "Audiodescrição",
  acompanhante_permitido: "Acompanhante permitido",
  transporte_acessivel: "Transporte acessível",
  espaco_para_caes_guia: "Espaço para cães-guia",
};

export const EVENT_SIGNUP_STATUSES: EventSignupStatus[] = ["inscrito", "lista_de_espera", "cancelado"];

export const EVENT_SIGNUP_STATUS_LABELS: Record<EventSignupStatus, string> = {
  inscrito: "Inscrito",
  lista_de_espera: "Lista de espera",
  cancelado: "Cancelado",
};

/** Quem publica evento (slides 8 e 11). */
export const EVENT_ORGANIZER_ROLES = ["agent", "government"] as const;

/** Quem se inscreve: Membros da Comunidade (slide 9). */
export const EVENT_SIGNUP_ROLES = ["member"] as const;

/**
 * A plataforma ainda não tem serviço de envio de e-mail: a confirmação da
 * inscrição fica na própria tela e em "Minhas inscrições". Governança, slide
 * 26 — funcionalidade em desenvolvimento aparece identificada como tal.
 */
export const EVENT_EMAIL_NOTIFICATIONS = {
  available: false,
  state: "em_desenvolvimento",
  label: "Confirmação por e-mail",
  note: 'A plataforma ainda não envia e-mail: a confirmação da inscrição aparece aqui e em "Minhas inscrições".',
} as const;

export interface EventEmailNotice {
  available: boolean;
  state: string;
  label: string;
  note: string;
}

export interface PublicEvent {
  id: string;
  demandId: string | null;
  demandTitle: string | null;
  organizerId: string;
  organizerName: string | null;
  organizerAvatar: string | null;
  organizerCategory: "agente" | "poder_publico";
  kind: EventKind;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  locationName: string;
  cep: string | null;
  street: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  district: string | null;
  municipality: string | null;
  uf: string | null;
  territory: string | null;
  latitude: number | null;
  longitude: number | null;
  audience: string;
  capacity: number | null;
  waitlistEnabled: boolean;
  pricing: EventPricing;
  priceCents: number | null;
  priceNote: string | null;
  accessibility: EventAccessibility[];
  accessibilityNotes: string | null;
  photoUrl: string | null;
  status: EventStatus;
  publishedAt: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  signupsCount: number;
  waitlistCount: number;
  seatsLeft: number | null;
  postId: string | null;
}

/** O evento visto pelo organizador: a projeção pública + presença. */
export interface OrganizerEvent extends PublicEvent {
  attendedCount: number;
  organizationId: string | null;
}

export interface EventSignupSummary {
  capacity: number | null;
  waitlistEnabled?: boolean;
  signupsCount: number;
  waitlistCount: number;
  seatsLeft: number | null;
  full: boolean;
}

export interface MyEventSignup {
  id: string;
  eventId: string;
  status: EventSignupStatus;
  waitlistPosition: number | null;
  note: string | null;
  attended: boolean;
  attendedAt: string | null;
  signedUpAt: string;
  canceledAt: string | null;
}

/** Inscrito visto pelo organizador (LGPD: o mínimo necessário). */
export interface EventAttendee {
  id: string;
  name: string;
  userCategory: string;
  profileType: string | null;
  status: EventSignupStatus;
  waitlistPosition: number | null;
  note: string | null;
  attended: boolean;
  attendedAt: string | null;
  signedUpAt: string;
  canceledAt: string | null;
}

export interface EventSignupContext {
  signup: MyEventSignup | null;
  summary: EventSignupSummary;
  canSignUp: boolean;
  allowed: boolean;
  isOrganizer: boolean;
  open: boolean;
  emailNotifications: EventEmailNotice;
}

export interface EventTerritory {
  territory: string;
  municipality: string | null;
  uf: string | null;
  upcomingCount: number;
  nextStartsAt: string | null;
}

export interface EventAgendaFilter {
  kind?: EventKind | "";
  territory?: string;
  municipality?: string;
  uf?: string;
  demandId?: string;
  pricing?: EventPricing | "";
  when?: "proximos" | "passados" | "todos";
  q?: string;
  limit?: number;
  cursor?: string;
}

export interface EventInput {
  demandId?: string | null;
  kind?: EventKind;
  title?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  locationName?: string;
  cep?: string;
  street?: string;
  addressNumber?: string;
  addressComplement?: string;
  district?: string;
  municipality?: string;
  uf?: string;
  territory?: string;
  latitude?: number | null;
  longitude?: number | null;
  audience?: string;
  capacity?: number | null;
  waitlistEnabled?: boolean;
  pricing?: EventPricing;
  priceCents?: number | null;
  priceNote?: string;
  accessibility?: EventAccessibility[];
  accessibilityNotes?: string;
  photoRef?: string;
}

export type EventFieldErrors = Record<string, string>;

export function eventKindLabel(kind: string): string {
  return EVENT_KIND_LABELS[kind as EventKind] ?? "Evento";
}

export function eventStatusLabel(status: string): string {
  return EVENT_STATUS_LABELS[status as EventStatus] ?? status;
}

export function eventSignupStatusLabel(status: string): string {
  return EVENT_SIGNUP_STATUS_LABELS[status as EventSignupStatus] ?? status;
}

export function eventPricingLabelOf(pricing: string): string {
  return EVENT_PRICING_LABELS[pricing as EventPricing] ?? pricing;
}

export function eventAccessibilityLabel(feature: string): string {
  return EVENT_ACCESSIBILITY_LABELS[feature as EventAccessibility] ?? feature;
}

/** Endereço do local em uma linha (é público: sem ele ninguém comparece). */
export function eventAddressLine(event: Pick<PublicEvent,
  "street" | "addressNumber" | "addressComplement" | "district" | "municipality" | "uf" | "cep">): string {
  const street = [event.street, event.addressNumber].filter(Boolean).join(", ");
  const parts = [street, event.addressComplement, event.district,
    [event.municipality, event.uf].filter(Boolean).join("/"), event.cep];
  return parts.filter((part) => part && String(part).trim()).join(" · ");
}

export function eventPlaceLine(event: Pick<PublicEvent, "territory" | "district" | "municipality" | "uf">): string {
  return [event.territory ?? event.district, event.municipality, event.uf].filter(Boolean).join(", ");
}

const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const TIME = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** "14/11/2026, 10:00 às 14:00" quando começa e termina no mesmo dia. */
export function eventPeriodLabel(startsAt: string, endsAt: string): string {
  const from = new Date(startsAt);
  const to = new Date(endsAt);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "";
  const sameDay = from.toDateString() === to.toDateString();
  return sameDay ? `${DATE_TIME.format(from)} às ${TIME.format(to)}`
    : `${DATE_TIME.format(from)} até ${DATE_TIME.format(to)}`;
}

/** Valor declarado (decisão 5: a plataforma não cobra nem repassa). */
export function eventPriceLabel(event: Pick<PublicEvent, "pricing" | "priceCents">): string {
  if (event.pricing === "gratuito") return EVENT_PRICING_LABELS.gratuito;
  const cents = event.priceCents ?? 0;
  return `${(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (pago fora da plataforma)`;
}

/** Frase das vagas: sem limite, quantas restam ou fila de espera. */
export function eventSeatsLabel(event: Pick<PublicEvent, "capacity" | "seatsLeft" | "waitlistEnabled" | "waitlistCount">): string {
  if (event.capacity === null) return "Sem limite de vagas";
  if ((event.seatsLeft ?? 0) > 0) return `${event.seatsLeft} de ${event.capacity} vagas`;
  if (event.waitlistEnabled) return `Vagas esgotadas · ${event.waitlistCount} na lista de espera`;
  return "Vagas esgotadas";
}

export function isEventOver(event: Pick<PublicEvent, "endsAt">, now = new Date()): boolean {
  const to = new Date(event.endsAt);
  return !Number.isNaN(to.getTime()) && to.getTime() < now.getTime();
}

/** Query da agenda pública (mesmos nomes de `agendaQuery` no post-service). */
export function buildEventAgendaQuery(filter: EventAgendaFilter = {}): string {
  const query = new URLSearchParams();
  for (const key of ["kind", "territory", "municipality", "uf", "demandId", "pricing", "when", "q", "cursor"] as const) {
    const value = filter[key];
    if (typeof value === "string" && value.trim()) query.set(key, value.trim());
  }
  if (filter.limit) query.set("limit", String(filter.limit));
  return query.toString();
}
