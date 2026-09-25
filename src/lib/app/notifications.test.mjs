// Central de notificações (T-05-16): o espelho do portal precisa ser igual ao
// módulo dos serviços, e a união das duas listas não pode perder aviso.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_KIND_ICONS,
  NOTIFICATION_KIND_LABELS,
  buildNotificationQuery,
  completePreferences,
  groupIdsBySource,
  mergeNotificationFeeds,
  normalizeNotification,
  notificationLine,
} from "./notifications.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/notifications");
const root = path.resolve(import.meta.dirname, "../../..");

test("tipos iguais aos dos serviços, com rótulo e ícone para cada um", () => {
  assert.deepEqual(NOTIFICATION_KINDS, server.NOTIFICATION_KINDS);
  for (const kind of NOTIFICATION_KINDS) {
    assert.ok(NOTIFICATION_KIND_LABELS[kind], kind);
    assert.ok(NOTIFICATION_KIND_ICONS[kind], kind);
  }
  const icons = fs.readFileSync(path.join(root, "src/components/app/Icon.tsx"), "utf8");
  for (const icon of new Set(Object.values(NOTIFICATION_KIND_ICONS))) assert.match(icons, new RegExp(`"${icon}"`), icon);
});

test("união das listas: mais recente primeiro, fonte marcada, contagem somada, fonte fora vira parcial", () => {
  const posts = { notifications: [
    { id: "p1", kind: "demanda_devolvida", title: "Demanda devolvida para ajustes", summary: "«Praça»", href: "/minhas-demandas#demanda-d1", createdAt: "2026-09-25T10:00:00.000Z", readAt: null },
    { id: "p2", kind: "encaminhamento_recebido", title: "Encaminhamento recebido", scope: "organization", href: "https://fora.example", createdAt: "2026-09-23T10:00:00.000Z", readAt: null },
  ], unreadCount: 2, hasMore: false };
  const users = { notifications: [
    { id: "u1", kind: "nova_mensagem", title: "Nova mensagem na conexão", actorName: "Ana", summary: "enviou uma mensagem na conexão", href: "/conexoes/c1", createdAt: "2026-09-24T10:00:00.000Z", readAt: "2026-09-24T11:00:00.000Z" },
  ], unreadCount: 0, hasMore: false };
  const feed = mergeNotificationFeeds(posts, users, 2);
  assert.deepEqual(feed.notifications.map((n) => [n.id, n.source]), [["p1", "posts"], ["u1", "users"]]);
  assert.equal(feed.unreadCount, 2);
  assert.equal(feed.hasMore, true);
  assert.equal(feed.partial, false);
  assert.equal(notificationLine(feed.notifications[1]), "Ana enviou uma mensagem na conexão");
  const down = mergeNotificationFeeds(posts, null);
  assert.equal(down.partial, true);
  assert.equal(down.notifications.length, 2);
  const external = normalizeNotification(posts.notifications[1], "posts");
  assert.equal(external.href, null, "só caminho do próprio portal");
  assert.equal(external.scope, "organization");
});

test("marcação de leitura vai para o serviço que guarda o aviso; query e preferências", () => {
  assert.deepEqual(groupIdsBySource([{ id: "a", source: "posts" }, { id: "b", source: "users" }, { id: "a", source: "posts" }]),
    { posts: ["a"], users: ["b"] });
  assert.equal(buildNotificationQuery({ unreadOnly: true, limit: 20, kinds: ["apoio", "conexao"], institution: true }),
    "?unread=1&limit=20&kind=apoio%2Cconexao&institution=1");
  assert.equal(buildNotificationQuery(), "");
  const prefs = completePreferences([{ kind: "apoio", inApp: true, email: false }]);
  assert.equal(prefs.length, NOTIFICATION_KINDS.length);
  assert.deepEqual(prefs.find((p) => p.kind === "apoio"), { kind: "apoio", inApp: true, email: false });
  assert.ok(prefs.filter((p) => p.kind !== "apoio").every((p) => p.inApp && p.email));
});

test("o sino não usa mais localStorage e lê a central pela API", () => {
  const bell = fs.readFileSync(path.join(root, "src/components/app/NotificationBell.tsx"), "utf8");
  assert.doesNotMatch(bell, /localStorage/);
  assert.match(bell, /api\.notifications\(/);
  assert.match(bell, /api\.markNotificationsRead\(/);
  assert.match(bell, /href="\/notificacoes"/);
});
