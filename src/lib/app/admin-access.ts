/**
 * Quem entra no painel administrativo.
 *
 * A capacidade de administrar a plataforma **não é uma das 5 categorias de
 * perfil** (Agentes de Transformação / Membros da Comunidade / Parceiros /
 * Poder Público / Comunicação) — essas descrevem o
 * papel de quem usa a rede, não de quem opera o produto. Por isso o acesso é
 * uma lista de contas, configurável por ambiente:
 *
 *     NEXT_PUBLIC_ADMIN_EMAILS="ana@dmconecta.com.br,dm@dmconecta.com.br"
 *
 * Sem a variável, nenhuma conta recebe acesso. Isto é um controle de
 * **interface**: a mesma checagem precisa existir no servidor — o cliente
 * nunca é a fronteira de segurança.
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
