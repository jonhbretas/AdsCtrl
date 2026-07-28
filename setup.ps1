# setup.ps1 — AdsCtrl: configuração automatizada
#
# Uso: .\setup.ps1
# Responde as perguntas, gera .env.local, concatena SQL, npm install + build.

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ROOT

Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║      AdsCtrl — Setup automatizado        ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── 1. Pré-requisitos ────────────────────────────────────────────────
Write-Host "▸ Verificando pré-requisitos..." -ForegroundColor Yellow

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Write-Host "✖ Node.js não encontrado. Instale de https://nodejs.org e tente novamente." -ForegroundColor Red; exit 1 }
Write-Host "  ✔ Node.js $((node --version))" -ForegroundColor Green

$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) { Write-Host "✖ npm não encontrado." -ForegroundColor Red; exit 1 }
Write-Host "  ✔ npm $((npm --version))" -ForegroundColor Green

# ── 2. .env.local existente ─────────────────────────────────────────
$ENV_FILE = ".env.local"
if (Test-Path -LiteralPath $ENV_FILE) {
    Write-Host ""
    Write-Host "⚠  Já existe um .env.local." -ForegroundColor Yellow
    $resp = Read-Host "  Deseja sobrescrever? (s/N) "
    if ($resp -ne "s") { Write-Host "  Pulando. Use 'npm install && npm run dev' para continuar." -ForegroundColor Green; exit 0 }
}

# ── 3. Coleta de configurações ──────────────────────────────────────
Write-Host ""
Write-Host "▸ Preencha as configurações abaixo:" -ForegroundColor Yellow
Write-Host "  (pressione Enter para usar o valor sugerido entre colchetes)"
Write-Host ""

$brand = Read-Host "  Nome da agência [AdsCtrl]"
if (-not $brand) { $brand = "AdsCtrl" }

$metaToken = Read-Host "  Meta Access Token (System User)"
if (-not $metaToken) { Write-Host "  ✖ Obrigatório"; exit 1 }

$supabaseUrl = Read-Host "  Supabase URL (ex: https://xxxx.supabase.co)"
if (-not $supabaseUrl) { Write-Host "  ✖ Obrigatório"; exit 1 }

$supabaseKey = Read-Host "  Supabase service_role key"
if (-not $supabaseKey) { Write-Host "  ✖ Obrigatório"; exit 1 }

$cronSecret = Read-Host "  CRON_SECRET (string aleatória)"
if (-not $cronSecret) { Write-Host "  ✖ Obrigatório"; exit 1 }

$dashboardPass = Read-Host "  DASHBOARD_PASSWORD (mín. 12 caracteres)"
if ($dashboardPass.Length -lt 12) { Write-Host "  ✖ Mínimo 12 caracteres"; exit 1 }

$sessionSecret = Read-Host "  SESSION_SECRET (mín. 32 caracteres aleatórios)"
if ($sessionSecret.Length -lt 32) { Write-Host "  ✖ Mínimo 32 caracteres"; exit 1 }

$googleClientId = Read-Host "  Google Ads Client ID (opcional — Enter para pular)"
$googleClientSecret = Read-Host "  Google Ads Client Secret (opcional)"
$googleRefreshToken = Read-Host "  Google Ads Refresh Token (opcional)"
$googleDevToken = Read-Host "  Google Ads Developer Token (opcional)"
$googleMccId = Read-Host "  Google Ads Login Customer ID / MCC (opcional)"

$resendApiKey = Read-Host "  Resend API Key (opcional — para relatórios por e-mail)"
$reportFromEmail = Read-Host "  REPORT_FROM_EMAIL (opcional — ex: Agencia <relatorios@seudominio.com>)"
$taskAlertEmail = Read-Host "  TASK_ALERT_EMAIL (seu e-mail para lembretes internos)"
$appUrl = Read-Host "  APP_URL (URL do seu deploy, ex: https://seuapp.vercel.app) [http://localhost:3000]"
if (-not $appUrl) { $appUrl = "http://localhost:3000" }

# ── 4. Gera .env.local ──────────────────────────────────────────────
Write-Host ""
Write-Host "▸ Gerando .env.local..." -ForegroundColor Yellow

@"
# Nome da sua agência (aparece no dashboard, relatórios e e-mails)
NEXT_PUBLIC_APP_BRAND_NAME=$brand

# Meta
META_ACCESS_TOKEN=$metaToken

# Supabase
NEXT_PUBLIC_SUPABASE_URL=$supabaseUrl
SUPABASE_SERVICE_ROLE_KEY=$supabaseKey

# Google Ads$googleClientId
GOOGLE_ADS_CLIENT_ID=$googleClientId
GOOGLE_ADS_CLIENT_SECRET=$googleClientSecret
GOOGLE_ADS_REFRESH_TOKEN=$googleRefreshToken
GOOGLE_ADS_DEVELOPER_TOKEN=$googleDevToken
GOOGLE_ADS_LOGIN_CUSTOMER_ID=$googleMccId

# Cron
CRON_SECRET=$cronSecret

# Autenticação
DASHBOARD_PASSWORD=$dashboardPass
SESSION_SECRET=$sessionSecret

# E-mail (Resend)
RESEND_API_KEY=$resendApiKey
REPORT_FROM_EMAIL=$reportFromEmail
REPORT_REPLY_TO=$taskAlertEmail
REPORT_TEST_EMAIL=$taskAlertEmail
APP_URL=$appUrl

# Lembrete interno (OBRIGATÓRIO)
TASK_ALERT_EMAIL=$taskAlertEmail
"@ | Out-File -FilePath $ENV_FILE -Encoding UTF8

Write-Host "  ✔ .env.local criado" -ForegroundColor Green

# ── 5. Concatena SQL ─────────────────────────────────────────────────
Write-Host ""
Write-Host "▸ Gerando supabase-all.sql (todas as migrations em um arquivo)..." -ForegroundColor Yellow

$sqlFiles = @(
    "supabase-schema.sql"
    "supabase-migration-v2.sql"
    "supabase-migration-metrics.sql"
    "supabase-migration-alerts.sql"
    "supabase-migration-account-links.sql"
    "supabase-migration-clients.sql"
    "supabase-migration-operations.sql"
    "supabase-migration-security.sql"
    "supabase-migration-tasks.sql"
    "supabase-migration-projects.sql"
    "supabase-migration-vendas.sql"
    "supabase-migration-task-extras.sql"
    "supabase-migration-reports.sql"
    "supabase-migration-report-cache.sql"
    "supabase-migration-brand.sql"
    "supabase-migration-balance.sql"
)

$combined = @()
$combined += "-- supabase-all.sql — Gerado pelo setup.ps1 em $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
$combined += "-- Execute o conteúdo COMPLETO no SQL Editor do Supabase."
$combined += ""
$combined += ""

foreach ($file in $sqlFiles) {
    $path = Join-Path -LiteralPath $ROOT $file
    if (Test-Path -LiteralPath $path) {
        $content = Get-Content -LiteralPath $path -Raw
        $combined += "-- ======================================================="
        $combined += "-- $file"
        $combined += "-- ======================================================="
        $combined += $content
        $combined += ""
    } else {
        Write-Host "  ⚠  Arquivo não encontrado: $file" -ForegroundColor Yellow
    }
}

$combined -join "`r`n" | Out-File -FilePath "supabase-all.sql" -Encoding UTF8
Write-Host "  ✔ supabase-all.sql gerado ($($sqlFiles.Count) migrations)" -ForegroundColor Green

# ── 6. npm install ───────────────────────────────────────────────────
Write-Host ""
Write-Host "▸ Instalando dependências..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "✖ npm install falhou" -ForegroundColor Red; exit 1 }
Write-Host "  ✔ npm install concluído" -ForegroundColor Green

# ── 7. npm run build ─────────────────────────────────────────────────
Write-Host ""
Write-Host "▸ Compilando o projeto..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "✖ Build falhou. Verifique os erros acima." -ForegroundColor Red; exit 1 }
Write-Host "  ✔ Build concluído com sucesso" -ForegroundColor Green

# ── 8. Próximos passos ───────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║              SETUP CONCLUÍDO COM SUCESSO!            ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Próximos passos:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. Supabase — SQL Editor:" -ForegroundColor White
Write-Host "     Abra o arquivo supabase-all.sql e cole TODO o conteúdo" -ForegroundColor White
Write-Host "     no SQL Editor do seu projeto Supabase. Execute." -ForegroundColor White
Write-Host ""
Write-Host "  2. Iniciar o servidor local:" -ForegroundColor White
Write-Host "     npm run dev" -ForegroundColor Green
Write-Host ""
Write-Host "  3. Testar a coleta:" -ForegroundColor White
Write-Host "     curl -H ""Authorization: Bearer $cronSecret"" http://localhost:3000/api/collect" -ForegroundColor Green
Write-Host ""
Write-Host "  4. Fazer deploy na Vercel:" -ForegroundColor White
Write-Host "     npx vercel --prod" -ForegroundColor Green
Write-Host ""
Write-Host "  ⚠  Configure as mesmas variáveis de ambiente no painel da Vercel!" -ForegroundColor Yellow
Write-Host ""
