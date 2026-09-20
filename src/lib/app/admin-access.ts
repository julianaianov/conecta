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
 * Sem a variável, vale só a conta demo `admin@dmconecta.com.br` (senha
 * `demo123`). Isto é um controle de **interface**: quando houver backend, a
 * mesma checagem precisa existir no servidor — o cliente nunca é a fronteira
 * de segurança.
 */
import type { User } from "./types";

export const DEMO_ADMIN_EMAIL = "admin@dmconecta.com.br";
export const DEMO_CREDENTIALS = { email: "maria@bairro.conecta", password: "demo123" };

const CONFIGURED = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isPlatformAdmin(user: User | null | undefined): boolean {
  if (!user?.email) return false;
  const email = user.email.toLowerCase().trim();
  return email === DEMO_ADMIN_EMAIL || CONFIGURED.includes(email);
}
