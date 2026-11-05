#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# InCittà — Backup di sicurezza prima del refactoring del motore Pino.
#
# Cosa fa, in ordine:
#   1. controlla lo stato di Git (segnala e, senza --force, si ferma);
#   2. crea il branch di emergenza `backup-sicurezza-pino-engine`;
#   3. lo pubblica subito su GitHub (il codice attuale è salvato PRIMA di
#      qualsiasi modifica);
#   4. copia fisicamente la cartella della rotta API della chat in
#      `_chat_backup_originale/` (copia speculare, non spostamento).
#
# Uso:
#   bash scripts/backup-pino-engine.sh            # richiede working tree pulito
#   bash scripts/backup-pino-engine.sh --force    # procede anche con modifiche
#
# È idempotente: se il branch esiste già viene riutilizzato e il push è un
# fast-forward; ogni esecuzione crea una nuova copia con timestamp.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BRANCH="backup-sicurezza-pino-engine"
API_DIR="app/api/assistente"          # rotta della chat di Pino
LIB_DIR="lib/assistente"              # motore, tool e comprensione
STAMP="$(date +%Y%m%d-%H%M%S)"
COPY_ROOT="_chat_backup_originale/${STAMP}"

echo "== 1/4 · Stato Git ==================================================="
TRACED_CHANGES="$(git status --porcelain | grep -v '^??' || true)"
if [ -n "${TRACED_CHANGES}" ]; then
  echo "Modifiche non committate su file tracciati:"
  echo "${TRACED_CHANGES}"
  if [ "${1:-}" != "--force" ]; then
    echo
    echo "Interrotto. Fai commit/stash oppure rilancia con: --force"
    exit 1
  fi
  echo "--force: proseguo senza committare questi file."
else
  echo "Working tree pulito sui file tracciati."
fi

echo "== 2/4 · Branch di emergenza ${BRANCH} ==============================="
if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  git checkout "${BRANCH}"
else
  git checkout -b "${BRANCH}"
fi
git rev-parse --short HEAD

echo "== 3/4 · Push su GitHub =============================================="
# Salva il codice così com'è ADESSO, prima di ogni refactoring.
git push -u origin "${BRANCH}"

echo "== 4/4 · Copia fisica della chat ====================================="
mkdir -p "${COPY_ROOT}/app-api-assistente" "${COPY_ROOT}/lib-assistente"
cp -R "${API_DIR}/." "${COPY_ROOT}/app-api-assistente/"
cp -R "${LIB_DIR}/." "${COPY_ROOT}/lib-assistente/"
git rev-parse HEAD > "${COPY_ROOT}/COMMIT_HEAD.txt"
git status --porcelain > "${COPY_ROOT}/WORKING_TREE_STATUS.txt" || true

echo
echo "Backup completato."
echo "  branch remoto : origin/${BRANCH}"
echo "  copia locale  : ${COPY_ROOT}"
echo "  commit base   : $(cat "${COPY_ROOT}/COMMIT_HEAD.txt")"
