# ============================================================================
# BACKUP SUPABASE + DOCKER DESKTOP — InCittà / LocalHub
# ============================================================================
# READ-ONLY sul database remoto.
# Usa Supabase CLI, che esegue pg_dump in un container Docker.
#
# PREREQUISITI:
#   - Docker Desktop avviato
#   - Supabase CLI disponibile tramite npx
#   - SUPABASE_DB_URL impostata SOLO nell'ambiente locale
#
# ESECUZIONE DALLA ROOT DEL PROGETTO:
#   powershell -ExecutionPolicy Bypass -File .\\scripts\\backup-supabase-docker.ps1
#
# OUTPUT:
#   .\\backups\\supabase\\YYYYMMDD_HHmmss\\
#     schema.sql
#     data.sql
#     roles.sql
#     manifest.txt
# ============================================================================

$ErrorActionPreference = "Stop"

$Project = Split-Path -Parent $PSScriptRoot
$BackupRoot = Join-Path $Project "backups\\supabase"

if (-not $env:SUPABASE_DB_URL) {
  Write-Host ""
  Write-Host "SUPABASE_DB_URL non configurata." -ForegroundColor Yellow
  Write-Host "Imposta localmente la connection string Postgres del progetto e rilancia."
  Write-Host 'Esempio: $env:SUPABASE_DB_URL = "postgresql://postgres...."'
  throw "Connection string mancante."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker non trovato. Avvia Docker Desktop e verifica che il comando docker sia disponibile."
}

$null = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop non risponde. Avvialo prima del backup."
}

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dir = Join-Path $BackupRoot $stamp
New-Item -ItemType Directory -Path $dir -Force | Out-Null

$dumpBase = @("supabase", "db", "dump", "--db-url", $env:SUPABASE_DB_URL)

function Invoke-SupabaseDump([string[]]$extra, [string]$output) {
  & npx @dumpBase @extra -f $output
  if ($LASTEXITCODE -ne 0) {
    throw "supabase db dump fallito per $output"
  }
}

Write-Host ""
Write-Host "BACKUP IN CORSO: $dir" -ForegroundColor Cyan

Invoke-SupabaseDump @() (Join-Path $dir "schema.sql")
Invoke-SupabaseDump @("--data-only", "--use-copy") (Join-Path $dir "data.sql")
Invoke-SupabaseDump @("--role-only") (Join-Path $dir "roles.sql")

$manifest = @(
  "LocalHub / InCittà - Supabase logical backup",
  "Project ref: favrminotoawoxhehshh",
  "Generated: $((Get-Date).ToUniversalTime().ToString("o"))",
  "Docker: OK",
  "Files:"
)

foreach ($file in Get-ChildItem $dir -File) {
  if ($file.Length -lt 100) {
    throw "File sospettosamente piccolo: $($file.Name) ($($file.Length) byte)"
  }
  $manifest += ("  {0} = {1:N0} bytes" -f $file.Name, $file.Length)
}

$manifest | Set-Content -Path (Join-Path $dir "manifest.txt") -Encoding UTF8

Write-Host ""
Write-Host "BACKUP COMPLETATO" -ForegroundColor Green
Write-Host "Cartella: $dir"
Write-Host ""
Write-Host "Il dump non modifica il database remoto."
Write-Host "Conserva la cartella prima di applicare migrazioni importanti."
