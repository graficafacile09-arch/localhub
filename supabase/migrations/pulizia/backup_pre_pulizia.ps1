# ============================================================================
# BACKUP PRE-PULIZIA — Progetto LocalHub / DB favrminotoawoxhehshh (Supabase)
# ============================================================================
# READ-ONLY sul database: supabase db dump esegue solo SELECT/pg_dump sul DB
# remoto; scrive SOLO file locali. Nessuna DELETE/UPDATE/INSERT.
#
# PREREQUISITI:
#   - supabase CLI (npm) v2.x, progetto linkato (supabase/.temp/project-ref =
#     favrminotoawoxhehshh — verificato)
#   - password del database (NON è in .env.local): forniscila con la variabile
#     d'ambiente SUPABASE_DB_PASSWORD oppure in prompt interattivo
#   - esecuzione: powershell -ExecutionPolicy Bypass -File backup_pre_pulizia.ps1
#
# OUTPUT (cartella supabase\backups\pre_pulizia_YYYYMMDD\):
#   backup_1_schema.sql   -> struttura completa (tutti gli schemi + estensioni)
#   backup_2_data.sql     -> dati completi (tutti gli schemi, INSERT)
#   backup_3_roles.sql    -> ruoli del cluster (facoltativo ma consigliato)
# ============================================================================

$ErrorActionPreference = "Stop"
$Project = "C:\Users\denni\Desktop\localhub"
$Ref = "favrminotoawoxhehshh"

# --- 1. verifica identità progetto linkato (read-only) ---------------------
$projectRef = Get-Content "$Project\supabase\.temp\project-ref" -ErrorAction Stop
if ($projectRef -ne $Ref) {
  throw "Progetto linkato ($projectRef) != progetto atteso ($Ref). FERMARSI."
}
Write-Host "OK: progetto linkato = $projectRef (corretto)"

# --- 2. password ------------------------------------------------------------
$pw = $env:SUPABASE_DB_PASSWORD
if (-not $pw) {
  $sec = Read-Host "Password Postgres del progetto $Ref" -AsSecureString
  $pw = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
if (-not $pw) { throw "Password mancante." }

# --- 3. cartella di destinazione --------------------------------------------
$dir = Join-Path $Project "supabase\backups\pre_pulizia_$(Get-Date -Format yyyyMMdd_HHmm)"
New-Item -ItemType Directory -Path $dir -Force | Out-Null

# --- 4. dump (tutti READ-ONLY sul DB) ---------------------------------------
$cli = "supabase.cmd"
Push-Location $Project
try {
  & $cli db dump --linked --password $pw -f "$dir\backup_1_schema.sql"
  if (-not $?) { throw "Errore dump schema" }

  & $cli db dump --linked --data-only --password $pw -f "$dir\backup_2_data.sql"
  if (-not $?) { throw "Errore dump dati" }

  & $cli db dump --linked --role-only --password $pw -f "$dir\backup_3_roles.sql"
  if (-not $?) { throw "Errore dump ruoli" }
}
finally { Pop-Location }

# --- 5. verifica locale dei file --------------------------------------------
foreach ($f in Get-ChildItem $dir) {
  $bytes = $f.Length
  if ($bytes -lt 100) { throw "File sospettosamente piccolo: $($f.Name) ($bytes byte)" }
  $head = (Get-Content $f.FullName -TotalCount 2) -join " | "
  Write-Host ("OK: {0}  ({1:N0} byte)  -> {2}" -f $f.Name, $bytes, $head)
}

Write-Host ""
Write-Host "BACKUP COMPLETATO in: $dir"
Write-Host "NOTA: il backup NON modifica il database (solo SELECT)."
Write-Host "NOTA: i blob dello storage (bucket store-images, avatars) NON sono nel dump:"
Write-Host "      per un backup completo degli oggetti usare Dashboard -> Storage."