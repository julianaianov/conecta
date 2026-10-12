#!/usr/bin/env bash
set -Eeuo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# DM Conecta — Povoamento Canônico do Território (Recreio dos Bandeirantes, RJ)
# Popula os bancos auth_db, user_db e post_db com massa completa de dados:
# 20 contas nas 5 categorias, 21 demandas cobrindo as 12 categorias canônicas,
# posts no feed, apoios, comentários, reações, eventos territoriais e inscrições.
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"

# ── 1. Proteção de Ambiente ──────────────────────────────────────────────────
# Regra estrita do produto: PROIBIDO dados sintéticos em produção.
# Homologação requer autorização explícita ALLOW_HOMOLOG_SEED=true.
CURRENT_ENV="${DM_ENV:-${NODE_ENV:-${ENVIRONMENT:-development}}}"
if [[ "$CURRENT_ENV" =~ ^(production|prod)$ ]]; then
  echo "ERRO DE SEGURANÇA: Proibido aplicar seeds sintéticos em produção!" >&2
  exit 1
fi

if [[ "$CURRENT_ENV" =~ ^(homologation|homolog)$ ]] && [[ "${ALLOW_HOMOLOG_SEED:-false}" != "true" ]]; then
  echo "AVISO DE SEGURANÇA: Para aplicar seeds em homologação, defina ALLOW_HOMOLOG_SEED=true." >&2
  exit 1
fi

AUTH_SEED="$PROJECT_ROOT/seeds/recreio/auth.sql"
USER_SEED="$PROJECT_ROOT/seeds/recreio/user.sql"
POST_SEED="$PROJECT_ROOT/seeds/recreio/post.sql"

for f in "$AUTH_SEED" "$USER_SEED" "$POST_SEED"; do
  if [[ ! -f "$f" ]]; then
    echo "Arquivo de seed ausente: $f" >&2
    exit 1
  fi
done

echo "=================================================================="
echo " DM Conecta — Povoamento Canônico: Recreio dos Bandeirantes (RJ)"
echo "=================================================================="
echo "Ambiente: $CURRENT_ENV"

# ── 2. Método de Conexão ─────────────────────────────────────────────────────
# Verifica se os containers do Docker Compose estão em execução
DOCKER_COMPOSE_ACTIVE=false
if command -v docker >/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' | grep -q "auth-db"; then
    DOCKER_COMPOSE_ACTIVE=true
  fi
fi

if [[ "$DOCKER_COMPOSE_ACTIVE" = true ]]; then
  echo "Detectado ambiente Docker Compose ativo (auth-db, user-db, post-db)."
  echo "Aplicando seeds via Docker Compose..."
  echo ""

  echo "-> [1/3] Povoando auth_db (20 contas nas 5 categorias do ecossistema)..."
  docker compose exec -T auth-db psql -U postgres -d auth_db < "$AUTH_SEED"

  echo "-> [2/3] Povoando user_db (perfis, comunidades, organizações, parceiros)..."
  docker compose exec -T user-db psql -U postgres -d user_db < "$USER_SEED"

  echo "-> [3/3] Povoando post_db (30 demandas nas 12 categorias, eixos temáticos, posts, apoios, eventos)..."
  docker compose exec -T post-db psql -U postgres -d post_db < "$POST_SEED"

else
  echo "Docker Compose com containers separados não detectado."
  echo "Utilizando conexão direta via psql..."

  PGHOST="${PGHOST:-localhost}"
  PGPORT="${PGPORT:-5432}"
  PGUSER="${PGUSER:-postgres}"

  export PGHOST PGPORT PGUSER

  echo "Host: $PGHOST:$PGPORT (usuário: $PGUSER)"
  echo ""

  echo "-> [1/3] Povoando auth_db (20 contas nas 5 categorias do ecossistema)..."
  psql -d auth_db -f "$AUTH_SEED"

  echo "-> [2/3] Povoando user_db (perfis, comunidades, organizações, parceiros)..."
  psql -d user_db -f "$USER_SEED"

  echo "-> [3/3] Povoando post_db (30 demandas nas 12 categorias, eixos temáticos, posts, apoios, eventos)..."
  psql -d post_db -f "$POST_SEED"
fi

echo ""
echo "=================================================================="
echo " Povoamento concluído com sucesso!"
echo "=================================================================="
echo "• Território: Recreio dos Bandeirantes, Rio de Janeiro - RJ"
echo "• 20 usuários criados (senha padrão: demo123):"
echo "   - Agentes: Associação Recreio Verde, Coletivo Cultural, Instituto Criança Feliz, etc."
echo "   - Membros: Maria Silva, João Pereira, Carlos Mendes, Fernanda Lima, Ana Beatriz"
echo "   - Parceiros: Construtora Recreio Novo, Padaria Pão Quente, Supermercado Bom Preço, Studio Fitness"
echo "   - Poder Público: Subprefeitura da Barra, Sec. Meio Ambiente, Comlurb"
echo "   - Mídia: Jornal do Recreio, Voz do Recreio & Vargens"
echo "• 30 demandas cobrindo as 12 categorias canônicas e todos os eixos temáticos"
echo "• Distribuição geográfica densa de ponta a ponta no Recreio dos Bandeirantes"
echo "• Feed com vitrines de projetos e problemas urbanos, apoios e comentários"
echo "• Eventos e mutirões territoriais agendados na orla e praças do Recreio"
echo "=================================================================="
