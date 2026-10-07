#!/usr/bin/env bash
# Sobe um PostgreSQL temporário (15+; no macOS, o do Homebrew) e roda TODOS os
# testes de ponta a ponta do post-service (um arquivo test/<suite>-e2e.test.js
# por assunto: demanda, dossiê, atuação institucional, encaminhamentos,
# interesse e conexão, apoio, execução, prestação de contas, mapa, engajamento,
# denúncia, governo, privacidade, eventos, inteligência artificial (com o
# cliente do modelo simulado: nenhuma chamada à API do Claude), central de
# notificações (que cria também um user_db), Processo de Conexão, prazos,
# respostas à análise, encerramento, conexão direta etc.), cada um num banco
# novo, e destrói o cluster no fim, com sucesso ou falha. Nada é gravado fora do
# diretório temporário.
#
# A lista de suítes vem dos arquivos: um teste novo entra sem editar este script.
# Uma suíte que falha NÃO interrompe as seguintes: todas rodam, o resumo no fim
# nomeia as que falharam e o script sai com status 1.
#
# Uso: npm run test:e2e   (PG_BIN=/caminho/bin para escolher a versão)
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -z "${PG_BIN:-}" ]]; then
  for candidate in /opt/homebrew/opt/postgresql@18/bin /opt/homebrew/opt/postgresql@17/bin \
                   /opt/homebrew/opt/postgresql@16/bin /opt/homebrew/opt/postgresql@15/bin \
                   /usr/local/opt/postgresql@18/bin /usr/lib/postgresql/18/bin /usr/lib/postgresql/17/bin \
                   /usr/lib/postgresql/16/bin /usr/lib/postgresql/15/bin; do
    if [[ -x "$candidate/initdb" ]]; then PG_BIN="$candidate"; break; fi
  done
fi
if [[ -z "${PG_BIN:-}" || ! -x "$PG_BIN/initdb" ]]; then
  echo "PostgreSQL 15+ não encontrado (defina PG_BIN)" >&2
  exit 1
fi
version="$("$PG_BIN/postgres" --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
if (( version < 15 )); then
  echo "O schema exige PostgreSQL 15+ (encontrado: $version)" >&2
  exit 1
fi

tmp="$(mktemp -d)"
port="$(( 20000 + RANDOM % 20000 ))"
cleanup() {
  "$PG_BIN/pg_ctl" -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

"$PG_BIN/initdb" -D "$tmp/data" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
"$PG_BIN/pg_ctl" -D "$tmp/data" -l "$tmp/postgres.log" -w \
  -o "-p $port -k $tmp -c listen_addresses=127.0.0.1" start >/dev/null
suites=()
for file in test/*-e2e.test.js; do
  [[ -e "$file" ]] || continue
  name="$(basename "$file")"
  suites+=("${name%-e2e.test.js}")
done
if (( ${#suites[@]} == 0 )); then
  echo "Nenhum test/*-e2e.test.js encontrado" >&2
  exit 1
fi

failed=()
for suite in "${suites[@]}"; do
  "$PG_BIN/createdb" -h 127.0.0.1 -p "$port" -U postgres "post_db_$suite"
  if ! DM_E2E_DATABASE_URL="postgresql://postgres@127.0.0.1:$port/post_db_$suite" \
      NODE_ENV=test node --test "test/$suite-e2e.test.js"; then
    failed+=("$suite")
  fi
done

if (( ${#failed[@]} > 0 )); then
  echo "Suítes e2e com falha (${#failed[@]} de ${#suites[@]}): ${failed[*]}" >&2
  exit 1
fi
echo "Suítes e2e: ${#suites[@]} de ${#suites[@]} passaram"
