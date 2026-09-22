/**
 * Quem entra no painel administrativo.
 *
 * A capacidade de administrar a plataforma **não é uma das 5 categorias de
 * perfil** (Agentes de Transformação / Membros da Comunidade / Parceiros /
 * Poder Público / Comunicação) — essas descrevem o
 * papel de quem usa a plataforma, não de quem opera o produto. Por isso o acesso é
 * uma lista de contas, configurável por ambiente:
 *
 *     NEXT_PUBLIC_ADMIN_EMAILS="ana@dmconecta.com.br,dm@dmconecta.com.br"
 *
 * Sem a variável, nenhuma conta entra no painel. Isto é só um controle de
 * **interface**. A fronteira de segurança fica nos serviços: `/admin-snapshot`
 * do user-service e do post-service só responde às contas cujo UUID está em
 * `DM_OPERATION_USER_IDS` (variável de servidor); as demais recebem 403.
 */
import type { User } from "./types";

const CONFIGURED = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isPlatformAdmin(user: User | null | undefined): boolean {
  if (!user?.email) return false;
  const email = user.email.toLowerCase().trim();
  return CONFIGURED.includes(email);
}
