/**
 * DM Conecta — base de dados demo (modo offline / fallback).
 * Espelha core/demo/{demo_data,demo_social,demo_auth}.dart do app Flutter.
 * Recreio dos Bandeirantes · Rio de Janeiro. Mutação em memória (sem persistência).
 */
import { BANNER_PHOTOS } from "../banner-photos";
import { POST_IDS, USER_IDS, COMMUNITY_IDS } from "../demo-catalog";
import {
  type Post,
  type Comment,
  type Profile,
  type Scrap,
  type Testimonial,
  type Community,
  type SupportRecord,
  type User,
  DEFAULT_CITY,
  DEFAULT_NEIGHBORHOOD,
} from "./types";

export const DEMO_TOKEN = "demo_offline_token_conecta";
export const DEMO_CREDENTIALS = { email: "maria@recreio.conecta", password: "demo123" };

let _seq = 1000;
export const nextId = (prefix = "demo") => `${prefix}-${++_seq}`;
const iso = (daysAgo: number, hour = 9) => {
  const d = new Date("2026-06-20T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour);
  return d.toISOString();
};

// ── Usuários demo (auth) ───────────────────────────────────
export const DEMO_USERS: Record<string, User & { password: string }> = {
  [DEMO_CREDENTIALS.email]: {
    id: USER_IDS.maria,
    email: DEMO_CREDENTIALS.email,
    name: "Maria Silva",
    role: "citizen",
    avatarUrl: BANNER_PHOTOS.avatarMaria,
    password: "demo123",
  },
  "ong@recreio.conecta": {
    id: USER_IDS.associacao,
    email: "ong@recreio.conecta",
    name: "Associação Recreio Verde",
    role: "association",
    avatarUrl: BANNER_PHOTOS.avatarAssociacao,
    password: "demo123",
  },
  "prefeitura@recreio.conecta": {
    id: USER_IDS.subprefeitura,
    email: "prefeitura@recreio.conecta",
    name: "Subprefeitura do Recreio",
    role: "government",
    avatarUrl: BANNER_PHOTOS.avatarPrefeitura,
    password: "demo123",
  },
  "empresa@recreio.conecta": {
    id: USER_IDS.empresa,
    email: "empresa@recreio.conecta",
    name: "Recreio Construções Ltda",
    role: "business",
    avatarUrl: BANNER_PHOTOS.avatarEmpresa,
    password: "demo123",
  },
};

export const DEMO_USER: User = {
  id: USER_IDS.maria,
  email: DEMO_CREDENTIALS.email,
  name: "Maria Silva",
  role: "citizen",
  avatarUrl: BANNER_PHOTOS.avatarMaria,
};

const AUTHORS = {
  maria: { id: USER_IDS.maria, name: "Maria Silva", avatar: BANNER_PHOTOS.avatarMaria },
  assoc: { id: USER_IDS.associacao, name: "Associação Recreio Verde", avatar: BANNER_PHOTOS.avatarAssociacao },
  pref: { id: USER_IDS.subprefeitura, name: "Subprefeitura do Recreio", avatar: BANNER_PHOTOS.avatarPrefeitura },
  empresa: { id: USER_IDS.empresa, name: "Recreio Construções Ltda", avatar: BANNER_PHOTOS.avatarEmpresa },
};

const base = (n: string) => ({ neighborhood: n, city: DEFAULT_CITY });

// ── 10 publicações demo ────────────────────────────────────
let POSTS: Post[] = [
  {
    id: POST_IDS.buracoAmericas,
    authorId: AUTHORS.maria.id, authorName: AUTHORS.maria.name, authorAvatar: AUTHORS.maria.avatar,
    type: "problem", status: "active",
    title: "Buraco na Av. das Américas",
    description:
      "Buraco grande na altura do Recreio Shopping já causou acidentes com motos. Precisa de reparo urgente antes que alguém se machuque de verdade.",
    latitude: -23.0245, longitude: -43.458, ...base(DEFAULT_NEIGHBORHOOD),
    images: [BANNER_PHOTOS.buracoRua], tags: ["infraestrutura", "urgente", "vias"],
    reactionsCount: 12, commentsCount: 2, viewsCount: 87, createdAt: iso(1, 8),
  },
  {
    id: POST_IDS.mutiraoPraia,
    authorId: AUTHORS.assoc.id, authorName: AUTHORS.assoc.name, authorAvatar: AUTHORS.assoc.avatar,
    type: "project", status: "active",
    title: "Mutirão de limpeza da Praia do Recreio",
    description:
      "Todo sábado de manhã nos reunimos para limpar a faixa de areia e a orla. Traga luvas, água e disposição. Já recolhemos mais de 2 toneladas de resíduos!",
    latitude: -23.029, longitude: -43.465, ...base(DEFAULT_NEIGHBORHOOD),
    images: [BANNER_PHOTOS.mutiraoPraia], tags: ["meio-ambiente", "voluntariado", "orla"],
    reactionsCount: 28, commentsCount: 3, viewsCount: 142, createdAt: iso(2, 10),
  },
  {
    id: POST_IDS.iluminacaoBarreto,
    authorId: AUTHORS.maria.id, authorName: AUTHORS.maria.name, authorAvatar: AUTHORS.maria.avatar,
    type: "problem", status: "active",
    title: "Iluminação precária na Av. Gen. Barreto",
    description:
      "Vários postes apagados há semanas deixam a avenida perigosa à noite. Moradores evitam caminhar no trecho. Pedimos atenção da subprefeitura.",
    latitude: -23.026, longitude: -43.461, ...base(DEFAULT_NEIGHBORHOOD),
    images: [BANNER_PHOTOS.iluminacao], tags: ["segurança", "iluminação"],
    reactionsCount: 19, commentsCount: 1, viewsCount: 96, createdAt: iso(3, 19),
  },
  {
    id: POST_IDS.hortaComunitaria,
    authorId: AUTHORS.assoc.id, authorName: AUTHORS.assoc.name, authorAvatar: AUTHORS.assoc.avatar,
    type: "project", status: "in_progress",
    title: "Horta comunitária do Recreio",
    description:
      "Estamos transformando um terreno ocioso em horta comunitária. Já temos canteiros de temperos e hortaliças. Buscamos doação de mudas, terra adubada e ferramentas.",
    latitude: -23.0255, longitude: -43.454, ...base(DEFAULT_NEIGHBORHOOD),
    images: [BANNER_PHOTOS.horta], tags: ["sustentabilidade", "alimentação", "comunidade"],
    reactionsCount: 35, commentsCount: 2, viewsCount: 210, createdAt: iso(5, 9),
  },
  {
    id: POST_IDS.cestasBasicas,
    authorId: AUTHORS.pref.id, authorName: AUTHORS.pref.name, authorAvatar: AUTHORS.pref.avatar,
    type: "need", status: "active",
    title: "Doação de cestas básicas — famílias afetadas",
    description:
      "40 famílias da região foram afetadas pelas chuvas. Precisamos de cestas básicas, água potável e itens de higiene. Pontos de coleta na subprefeitura.",
    latitude: -23.023, longitude: -43.451, ...base(DEFAULT_NEIGHBORHOOD),
    images: [BANNER_PHOTOS.cestas], tags: ["assistência", "doação", "emergência"],
    reactionsCount: 41, commentsCount: 1, viewsCount: 178, createdAt: iso(2, 14),
  },
  {
    id: POST_IDS.feiraSustentabilidade,
    authorId: AUTHORS.empresa.id, authorName: AUTHORS.empresa.name, authorAvatar: AUTHORS.empresa.avatar,
    type: "event", status: "active",
    title: "Feira de Sustentabilidade do Recreio",
    description:
      "Dia 15, no Recreio Shopping: feira com produtores locais, oficinas de compostagem, troca de mudas e food trucks. Entrada gratuita. Venha participar!",
    latitude: -23.024, longitude: -43.4575, ...base(DEFAULT_NEIGHBORHOOD),
    images: [BANNER_PHOTOS.feira], tags: ["evento", "sustentabilidade", "cultura"],
    reactionsCount: 22, commentsCount: 0, viewsCount: 134, createdAt: iso(4, 11),
  },
  {
    id: POST_IDS.plantioMudas,
    authorId: AUTHORS.assoc.id, authorName: AUTHORS.assoc.name, authorAvatar: AUTHORS.assoc.avatar,
    type: "action", status: "active",
    title: "Plantio de mudas nativas na orla",
    description:
      "Ação de reflorestamento da restinga com espécies nativas. Plantamos 120 mudas no último encontro. Próxima ação no domingo às 8h.",
    latitude: -23.0285, longitude: -43.464, ...base(DEFAULT_NEIGHBORHOOD),
    images: [BANNER_PHOTOS.plantio], tags: ["meio-ambiente", "reflorestamento"],
    reactionsCount: 17, commentsCount: 0, viewsCount: 88, createdAt: iso(6, 8),
  },
  {
    id: POST_IDS.alagamentoGuignard,
    authorId: AUTHORS.maria.id, authorName: AUTHORS.maria.name, authorAvatar: AUTHORS.maria.avatar,
    type: "problem", status: "resolved",
    title: "Alagamento na Rua Guignard",
    description:
      "A rua alagava a cada chuva forte. Após mobilização dos moradores, a subprefeitura desobstruiu os bueiros e o problema foi resolvido. Obrigada a todos!",
    latitude: -23.0265, longitude: -43.4605, ...base(DEFAULT_NEIGHBORHOOD),
    images: [BANNER_PHOTOS.alagamento], tags: ["infraestrutura", "drenagem", "resolvido"],
    reactionsCount: 31, commentsCount: 0, viewsCount: 156, createdAt: iso(9, 16),
  },
  {
    id: POST_IDS.futebolComunitario,
    authorId: AUTHORS.empresa.id, authorName: AUTHORS.empresa.name, authorAvatar: AUTHORS.empresa.avatar,
    type: "event", status: "active",
    title: "Campeonato de futebol comunitário",
    description:
      "Inscrições abertas para o campeonato de várzea do Recreio. Times de até 12 jogadores. Premiação para os três primeiros. Patrocínio Recreio Construções.",
    latitude: -23.022, longitude: -43.453, ...base(DEFAULT_NEIGHBORHOOD),
    images: [BANNER_PHOTOS.futebol], tags: ["esporte", "evento", "juventude"],
    reactionsCount: 26, commentsCount: 0, viewsCount: 119, createdAt: iso(3, 18),
  },
  {
    id: POST_IDS.reforcoEscolar,
    authorId: AUTHORS.pref.id, authorName: AUTHORS.pref.name, authorAvatar: AUTHORS.pref.avatar,
    type: "need", status: "active",
    title: "Voluntários para reforço escolar",
    description:
      "Buscamos voluntários para aulas de reforço de matemática e português para crianças do ensino fundamental. 2h por semana fazem toda a diferença.",
    latitude: -23.0235, longitude: -43.4555, ...base(DEFAULT_NEIGHBORHOOD),
    images: [BANNER_PHOTOS.reforco], tags: ["educação", "voluntariado", "crianças"],
    reactionsCount: 23, commentsCount: 0, viewsCount: 101, createdAt: iso(4, 15),
  },
];

// ── Comentários por post ───────────────────────────────────
const COMMENTS: Record<string, Comment[]> = {
  [POST_IDS.buracoAmericas]: [
    { id: nextId("c"), postId: POST_IDS.buracoAmericas, authorId: AUTHORS.assoc.id, authorName: AUTHORS.assoc.name, content: "Já registramos um chamado na subprefeitura. Vamos acompanhar de perto!", createdAt: iso(1, 10) },
    { id: nextId("c"), postId: POST_IDS.buracoAmericas, authorId: AUTHORS.pref.id, authorName: AUTHORS.pref.name, content: "Equipe de manutenção agendada para esta semana. Obrigado pelo registro.", createdAt: iso(0, 11) },
  ],
  [POST_IDS.mutiraoPraia]: [
    { id: nextId("c"), postId: POST_IDS.mutiraoPraia, authorId: AUTHORS.maria.id, authorName: AUTHORS.maria.name, content: "Vou levar a família no próximo sábado!", createdAt: iso(2, 12) },
    { id: nextId("c"), postId: POST_IDS.mutiraoPraia, authorId: AUTHORS.empresa.id, authorName: AUTHORS.empresa.name, content: "Podemos doar luvas e sacos de lixo para o mutirão.", createdAt: iso(1, 9) },
    { id: nextId("c"), postId: POST_IDS.mutiraoPraia, authorId: AUTHORS.pref.id, authorName: AUTHORS.pref.name, content: "A coleta especial passa às 12h no ponto combinado.", createdAt: iso(1, 13) },
  ],
  [POST_IDS.iluminacaoBarreto]: [
    { id: nextId("c"), postId: POST_IDS.iluminacaoBarreto, authorId: AUTHORS.pref.id, authorName: AUTHORS.pref.name, content: "Ordem de serviço aberta para a concessionária de energia.", createdAt: iso(2, 17) },
  ],
  [POST_IDS.hortaComunitaria]: [
    { id: nextId("c"), postId: POST_IDS.hortaComunitaria, authorId: AUTHORS.maria.id, authorName: AUTHORS.maria.name, content: "Tenho mudas de manjericão e alecrim para doar!", createdAt: iso(4, 10) },
    { id: nextId("c"), postId: POST_IDS.hortaComunitaria, authorId: AUTHORS.empresa.id, authorName: AUTHORS.empresa.name, content: "Conseguimos doar 10 sacos de terra adubada.", createdAt: iso(3, 14) },
  ],
  [POST_IDS.cestasBasicas]: [
    { id: nextId("c"), postId: POST_IDS.cestasBasicas, authorId: AUTHORS.assoc.id, authorName: AUTHORS.assoc.name, content: "A associação é ponto de coleta também. Podem trazer aqui!", createdAt: iso(2, 16) },
  ],
};

// ── Apoios por post ────────────────────────────────────────
const SUPPORTS: Record<string, SupportRecord[]> = {
  [POST_IDS.mutiraoPraia]: [
    {
      id: nextId("s"), postId: POST_IDS.mutiraoPraia, postTitle: "Mutirão de limpeza da Praia do Recreio", postType: "project",
      userId: AUTHORS.maria.id, userName: AUTHORS.maria.name, type: "volunteering",
      message: "Posso ajudar nos sábados de manhã.", details: { horas: "4h por semana", disponibilidade: "Sábados, manhã" },
      status: "confirmed", ...base(DEFAULT_NEIGHBORHOOD), createdAt: iso(2, 12),
    },
  ],
  [POST_IDS.buracoAmericas]: [
    {
      id: nextId("s"), postId: POST_IDS.buracoAmericas, postTitle: "Buraco na Av. das Américas", postType: "problem",
      userId: AUTHORS.maria.id, userName: AUTHORS.maria.name, type: "financial",
      message: "Contribuição para sinalização provisória.", amount: 50, paymentMethod: "pix",
      details: {}, status: "confirmed", ...base(DEFAULT_NEIGHBORHOOD), createdAt: iso(1, 9),
    },
  ],
};

// ── Perfis (Orkut) ─────────────────────────────────────────
const PROFILES: Record<string, Profile> = {
  [USER_IDS.maria]: {
    userId: USER_IDS.maria, name: "Maria Silva", email: DEMO_CREDENTIALS.email, role: "citizen",
    bio: "Moradora do Recreio há 15 anos. Acredito que pequenas ações transformam o bairro.",
    status: "Conectando vizinhos 💪", city: DEFAULT_CITY, neighborhood: DEFAULT_NEIGHBORHOOD,
    avatarUrl: BANNER_PHOTOS.avatarMaria, coverUrl: BANNER_PHOTOS.iluminacao, memberSince: iso(400), friendCount: 38,
  },
  [USER_IDS.associacao]: {
    userId: USER_IDS.associacao, name: "Associação Recreio Verde", email: "ong@recreio.conecta", role: "association",
    bio: "Associação de moradores dedicada à sustentabilidade e à vida comunitária no Recreio.",
    status: "Mutirão todo sábado 🌱", city: DEFAULT_CITY, neighborhood: DEFAULT_NEIGHBORHOOD,
    website: "recreioverde.org.br", avatarUrl: BANNER_PHOTOS.avatarAssociacao, coverUrl: BANNER_PHOTOS.mutiraoPraia,
    memberSince: iso(700), friendCount: 124,
  },
  [USER_IDS.subprefeitura]: {
    userId: USER_IDS.subprefeitura, name: "Subprefeitura do Recreio", email: "prefeitura@recreio.conecta", role: "government",
    bio: "Canal oficial da gestão pública local. Aqui ouvimos e respondemos às demandas do território.",
    status: "Atendimento à população", city: DEFAULT_CITY, neighborhood: DEFAULT_NEIGHBORHOOD,
    avatarUrl: BANNER_PHOTOS.avatarPrefeitura, coverUrl: BANNER_PHOTOS.stakeholderPrefeitura, memberSince: iso(900), friendCount: 56,
  },
  [USER_IDS.empresa]: {
    userId: USER_IDS.empresa, name: "Recreio Construções Ltda", email: "empresa@recreio.conecta", role: "business",
    bio: "Empresa local comprometida com o desenvolvimento do bairro. Patrocinamos projetos de impacto.",
    status: "Investimento social com ESG", city: DEFAULT_CITY, neighborhood: DEFAULT_NEIGHBORHOOD,
    website: "recreioconstrucoes.com.br", avatarUrl: BANNER_PHOTOS.avatarEmpresa, coverUrl: BANNER_PHOTOS.stakeholderEmpresas,
    memberSince: iso(600), friendCount: 41,
  },
};

const av = (id: string) => PROFILES[id]?.avatarUrl ?? null;

// ── Recados (scraps) ───────────────────────────────────────
let SCRAPS: Scrap[] = [
  { id: nextId("scr"), authorId: USER_IDS.associacao, authorName: "Associação Recreio Verde", authorAvatar: av(USER_IDS.associacao), targetUserId: USER_IDS.maria, content: "Obrigada por sempre apoiar nossos mutirões, Maria! 🌟", createdAt: iso(3, 10) },
  { id: nextId("scr"), authorId: USER_IDS.subprefeitura, authorName: "Subprefeitura do Recreio", authorAvatar: av(USER_IDS.subprefeitura), targetUserId: USER_IDS.maria, content: "Recebemos seu registro sobre a iluminação. Já estamos atuando.", createdAt: iso(2, 17) },
  { id: nextId("scr"), authorId: USER_IDS.maria, authorName: "Maria Silva", authorAvatar: av(USER_IDS.maria), targetUserId: USER_IDS.associacao, content: "Conta comigo no próximo plantio! 🌱", createdAt: iso(4, 9) },
  { id: nextId("scr"), authorId: USER_IDS.empresa, authorName: "Recreio Construções Ltda", authorAvatar: av(USER_IDS.empresa), targetUserId: USER_IDS.associacao, content: "Vamos patrocinar a horta comunitária. Falamos essa semana?", createdAt: iso(3, 15) },
  { id: nextId("scr"), authorId: USER_IDS.maria, authorName: "Maria Silva", authorAvatar: av(USER_IDS.maria), targetUserId: USER_IDS.subprefeitura, content: "Parabéns pela rapidez na Rua Guignard!", createdAt: iso(8, 11) },
  { id: nextId("scr"), authorId: USER_IDS.associacao, authorName: "Associação Recreio Verde", authorAvatar: av(USER_IDS.associacao), targetUserId: USER_IDS.empresa, content: "Agradecemos o apoio de sempre. Parceria que transforma!", createdAt: iso(5, 14) },
  { id: nextId("scr"), authorId: USER_IDS.subprefeitura, authorName: "Subprefeitura do Recreio", authorAvatar: av(USER_IDS.subprefeitura), targetUserId: USER_IDS.empresa, content: "Ótimo trabalho no campeonato comunitário.", createdAt: iso(2, 16) },
];

// ── Depoimentos ────────────────────────────────────────────
let TESTIMONIALS: Testimonial[] = [
  { id: nextId("t"), authorId: USER_IDS.associacao, authorName: "Associação Recreio Verde", authorAvatar: av(USER_IDS.associacao), targetUserId: USER_IDS.maria, content: "Maria é uma das moradoras mais engajadas do bairro. Sempre presente nas ações.", createdAt: iso(10, 10) },
  { id: nextId("t"), authorId: USER_IDS.maria, authorName: "Maria Silva", authorAvatar: av(USER_IDS.maria), targetUserId: USER_IDS.associacao, content: "A associação é o coração verde do Recreio. Trabalho sério e transparente.", createdAt: iso(12, 11) },
  { id: nextId("t"), authorId: USER_IDS.maria, authorName: "Maria Silva", authorAvatar: av(USER_IDS.maria), targetUserId: USER_IDS.subprefeitura, content: "Quando há diálogo, as coisas acontecem. Obrigada pela escuta.", createdAt: iso(9, 12) },
  { id: nextId("t"), authorId: USER_IDS.associacao, authorName: "Associação Recreio Verde", authorAvatar: av(USER_IDS.associacao), targetUserId: USER_IDS.empresa, content: "Patrocinador comprometido de verdade com o impacto local.", createdAt: iso(7, 9) },
];

// ── Comunidades ────────────────────────────────────────────
const COMMUNITIES: Community[] = [
  { id: COMMUNITY_IDS.moradores, name: "Moradores do Recreio", description: "Grupo oficial de moradores do Recreio dos Bandeirantes.", category: "Bairro", memberCount: 1247, imageUrl: BANNER_PHOTOS.communityBairro },
  { id: COMMUNITY_IDS.mutiraoVerde, name: "Mutirão Recreio Verde", description: "Voluntários de limpeza e sustentabilidade na orla.", category: "Ambiental", memberCount: 389, imageUrl: BANNER_PHOTOS.communityOrla },
  { id: COMMUNITY_IDS.ciclistasOrla, name: "Ciclistas da Orla", description: "Pedal, segurança e mobilidade no Recreio.", category: "Mobilidade", memberCount: 156, imageUrl: BANNER_PHOTOS.communityMobilidade },
  { id: COMMUNITY_IDS.feiraSustentabilidade, name: "Feira de Sustentabilidade", description: "Organização do evento anual no Recreio Shopping.", category: "Eventos", memberCount: 78, imageUrl: BANNER_PHOTOS.communityEvento },
];

// Amizades (bidirecional)
const FRIENDS: Record<string, string[]> = {
  [USER_IDS.maria]: [USER_IDS.associacao, USER_IDS.subprefeitura, USER_IDS.empresa],
  [USER_IDS.associacao]: [USER_IDS.maria, USER_IDS.empresa, USER_IDS.subprefeitura],
  [USER_IDS.subprefeitura]: [USER_IDS.maria, USER_IDS.associacao],
  [USER_IDS.empresa]: [USER_IDS.maria, USER_IDS.associacao],
};

// ── API demo (em memória) ──────────────────────────────────
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export const demo = {
  user: () => clone(DEMO_USER),

  listPosts(filter?: { type?: string; status?: string; neighborhood?: string }): Post[] {
    let list = [...POSTS];
    if (filter?.type) list = list.filter((p) => p.type === filter.type);
    if (filter?.status) list = list.filter((p) => p.status === filter.status);
    if (filter?.neighborhood) list = list.filter((p) => (p.neighborhood ?? "").toLowerCase().includes(filter.neighborhood!.toLowerCase()));
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return clone(list);
  },

  mapPosts(type?: string): Post[] {
    return this.listPosts(type ? { type } : undefined).filter((p) => p.latitude != null && p.longitude != null);
  },

  getPost(id: string): Post | null {
    const p = POSTS.find((x) => x.id === id);
    if (!p) return null;
    p.viewsCount += 1;
    return clone(p);
  },

  createPost(input: Partial<Post>, author: User): Post {
    const post: Post = {
      id: nextId("post"),
      authorId: author.id, authorName: author.name, authorAvatar: author.avatarUrl ?? null,
      type: (input.type as Post["type"]) ?? "problem",
      title: input.title ?? "", description: input.description ?? "", status: "active",
      latitude: input.latitude ?? null, longitude: input.longitude ?? null,
      neighborhood: input.neighborhood ?? DEFAULT_NEIGHBORHOOD, city: input.city ?? DEFAULT_CITY,
      images: input.images ?? [], tags: input.tags ?? [],
      reactionsCount: 0, commentsCount: 0, viewsCount: 0, createdAt: new Date().toISOString(),
    };
    POSTS = [post, ...POSTS];
    return clone(post);
  },

  updatePostStatus(id: string, status: Post["status"]): Post | null {
    const p = POSTS.find((x) => x.id === id);
    if (!p) return null;
    p.status = status;
    return clone(p);
  },

  listComments(postId: string): Comment[] {
    return clone(COMMENTS[postId] ?? []);
  },

  addComment(postId: string, author: User, content: string): Comment {
    const c: Comment = { id: nextId("c"), postId, authorId: author.id, authorName: author.name, content, createdAt: new Date().toISOString() };
    COMMENTS[postId] = [...(COMMENTS[postId] ?? []), c];
    const p = POSTS.find((x) => x.id === postId);
    if (p) p.commentsCount += 1;
    return clone(c);
  },

  toggleReaction(postId: string): { action: "added" | "removed"; reactions_count: number } {
    const p = POSTS.find((x) => x.id === postId);
    if (!p) return { action: "removed", reactions_count: 0 };
    p.reactionsCount += 1;
    return { action: "added", reactions_count: p.reactionsCount };
  },

  postSupports(postId: string): { summary: { type: string; count: number }[]; supports: SupportRecord[] } {
    const list = SUPPORTS[postId] ?? [];
    const map = new Map<string, number>();
    list.forEach((s) => map.set(s.type, (map.get(s.type) ?? 0) + 1));
    const summary = [...map.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
    return clone({ summary, supports: list });
  },

  mySupportsForPost(postId: string, userId: string): SupportRecord[] {
    return clone((SUPPORTS[postId] ?? []).filter((s) => s.userId === userId));
  },

  addSupport(postId: string, user: User, input: Partial<SupportRecord>): { action: "added" | "updated"; support: SupportRecord; reactions_count: number } {
    const post = POSTS.find((x) => x.id === postId);
    const list = SUPPORTS[postId] ?? (SUPPORTS[postId] = []);
    const existing = list.find((s) => s.userId === user.id && s.type === input.type);
    const record: SupportRecord = {
      id: existing?.id ?? nextId("s"),
      postId, postTitle: post?.title, postType: post?.type,
      userId: user.id, userName: user.name,
      type: input.type as SupportRecord["type"],
      message: input.message ?? null, amount: input.amount ?? null, paymentMethod: input.paymentMethod ?? null,
      details: input.details ?? {}, status: input.status ?? "confirmed",
      neighborhood: post?.neighborhood, city: post?.city, createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    if (existing) {
      Object.assign(existing, record);
      return { action: "updated", support: clone(existing), reactions_count: post?.reactionsCount ?? 0 };
    }
    list.push(record);
    if (post) post.reactionsCount += 1;
    return { action: "added", support: clone(record), reactions_count: post?.reactionsCount ?? 0 };
  },

  removeSupport(postId: string, userId: string, type: string): { reactions_count: number } {
    const post = POSTS.find((x) => x.id === postId);
    const list = SUPPORTS[postId] ?? [];
    SUPPORTS[postId] = list.filter((s) => !(s.userId === userId && s.type === type));
    if (post && list.length !== SUPPORTS[postId].length) post.reactionsCount = Math.max(0, post.reactionsCount - 1);
    return { reactions_count: post?.reactionsCount ?? 0 };
  },

  mySupports(userId: string): SupportRecord[] {
    const all: SupportRecord[] = [];
    Object.values(SUPPORTS).forEach((list) => all.push(...list.filter((s) => s.userId === userId)));
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return clone(all);
  },

  getProfile(userId: string): Profile | null {
    return PROFILES[userId] ? clone(PROFILES[userId]) : null;
  },

  postsByAuthor(userId: string): Post[] {
    return clone(POSTS.filter((p) => p.authorId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },

  scrapsFor(userId: string): Scrap[] {
    return clone(SCRAPS.filter((s) => s.targetUserId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },

  addScrap(target: string, author: User, content: string): Scrap {
    const s: Scrap = { id: nextId("scr"), authorId: author.id, authorName: author.name, authorAvatar: author.avatarUrl ?? av(author.id), targetUserId: target, content, createdAt: new Date().toISOString() };
    SCRAPS = [s, ...SCRAPS];
    return clone(s);
  },

  testimonialsFor(userId: string): Testimonial[] {
    return clone(TESTIMONIALS.filter((t) => t.targetUserId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },

  addTestimonial(target: string, author: User, content: string): Testimonial {
    const t: Testimonial = { id: nextId("t"), authorId: author.id, authorName: author.name, authorAvatar: author.avatarUrl ?? av(author.id), targetUserId: target, content, createdAt: new Date().toISOString() };
    TESTIMONIALS = [t, ...TESTIMONIALS];
    return clone(t);
  },

  communities(): Community[] {
    return clone(COMMUNITIES);
  },

  friendsOf(userId: string): Profile[] {
    return clone((FRIENDS[userId] ?? []).map((id) => PROFILES[id]).filter(Boolean));
  },
};
