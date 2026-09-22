#!/usr/bin/env bash
# Sobe um PostgreSQL temporário (15+; no macOS, o do Homebrew), roda os testes
# de ponta a ponta da demanda (test/demand-e2e.test.js), do dossiê
# (test/dossier-e2e.test.js), da atuação institucional do Poder Público
# (test/institutional-e2e.test.js), dos encaminhamentos (test/forwarding-e2e.test.js)
# do interesse/conexão/oportunidades (test/interest-e2e.test.js), do apoio
# (test/support-e2e.test.js) e da execução com evidências
# (test/execution-e2e.test.js),
# cada um num banco novo, e destrói o cluster no fim, com sucesso ou falha.
# Nada é gravado fora do diretório temporário.
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
for suite in demand dossier institutional forwarding interest support execution; do
  "$PG_BIN/createdb" -h 127.0.0.1 -p "$port" -U postgres "post_db_$suite"
  DM_E2E_DATABASE_URL="postgresql://postgres@127.0.0.1:$port/post_db_$suite" \
    NODE_ENV=test node --test "test/$suite-e2e.test.js"
done
