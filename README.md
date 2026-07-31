# AdsCtrl — Dashboard de mídia paga (Meta + Google Ads)

Dashboard para acompanhar múltiplas contas de anúncio da Meta e Google Ads:
gasto 7d, agrupamento por cliente, saldo (prepaid), status de conta, alertas,
cockpit operacional, quadro de tarefas, laboratório de criativos e relatórios
semanais automáticos por e-mail.

## Stack
- Next.js 16 (App Router, TypeScript, Tailwind CSS v4) — deploy na Vercel
- Supabase — banco privado (acesso somente pelo servidor)
- Vercel Cron — coleta automática 1×/dia
- Resend — envio de relatórios semanais por e-mail

## Setup

### 1. Supabase — SQL Editor (ordem obrigatória)

Em um projeto novo (ou existente) no Supabase, execute os arquivos SQL abaixo
**na ordem listada**. Cada migração é aditiva e idempotente:

| # | Arquivo | O que faz |
|---|---------|-----------|
| 1 | `supabase-schema.sql` | Tabelas base: grupos, contas, snapshots |
| 2 | `supabase-migration-v2.sql` | Contas ocultas, períodos 14d/30d |
| 3 | `supabase-migration-metrics.sql` | Sparkline e série diária de métricas |
| 4 | `supabase-migration-alerts.sql` | Alertas com "ciente" e histórico |
| 5 | `supabase-migration-account-links.sql` | Vincula Google Ads a conta Meta |
| 6 | `supabase-migration-clients.sql` | Fundação da tabela de clientes |
| 7 | `supabase-migration-operations.sql` | Fatos diários (`daily_account_metrics`) |
| 8 | `supabase-migration-security.sql` | RLS sem políticas públicas |
| 9 | `supabase-migration-tasks.sql` | Quadro de tarefas (kanban) |
| 10 | `supabase-migration-projects.sql` | Projetos com prazo e lembretes |
| 11 | `supabase-migration-vendas.sql` | Vendas reais por cliente/mês |
| 12 | `supabase-migration-task-extras.sql` | Comentários e checklists nas tarefas |
| 13 | `supabase-migration-reports.sql` | Relatório semanal (Resend) |
| 14 | `supabase-migration-report-cache.sql` | Cache do relatório público |
| 15 | `supabase-migration-brand.sql` | Marca personalizada por cliente |
| 16 | `supabase-migration-balance.sql` | Saldo vs fatura em aberto |
| 17 | `supabase-migration-report-schedule.sql` | Dia do relatório por cliente |
| 18 | `supabase-migration-settings.sql` | Configurações do sistema editáveis no painel |
| 19 | `supabase-migration-client-profile.sql` | Contato, Drive e vigência contratual por cliente |
| 20 | `supabase-migration-client-contract-data.sql` | Dados pessoais, endereço e representante legal |
| 21 | `supabase-migration-client-contracts.sql` | Histórico de contratos e documentos por cliente |
| 22 | `supabase-migration-integration-secrets.sql` | Segredos de integrações armazenados apenas no servidor |
| 23 | `supabase-migration-billing.sql` | Clientes, assinaturas, cobranças e eventos do Asaas |
| 24 | `supabase-migration-invoices.sql` | NFS-e vinculada às cobranças do Asaas |
| 25 | `supabase-migration-agency-finance.sql` | Livro-caixa, categorias, fluxo e DRE da agência |
| 26 | `supabase-migration-client-onboarding.sql` | Checklist de entrada e ativação por cliente |
| 27 | Sem migration | Saúde da carteira calculada a partir de contrato, cobrança e onboarding |
| 28 | `supabase-migration-client-approvals.sql` | Aprovações e solicitações de entregas por cliente |
| 29 | `supabase-migration-meetings.sql` | Agenda e reuniões por cliente |

**Importante:** para um projeto novo, rode do 1 ao 18 sequencialmente.
Para atualizar um projeto existente, rode apenas as migrations que faltam,
sempre da mais antiga para a mais nova.

Após executar, em Settings → API, copie a `URL` e a `service_role key`.

### 2. Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha todos os campos:

```
NEXT_PUBLIC_APP_BRAND_NAME     # Nome da sua agência (ex: "Assertivus Dash")
META_ACCESS_TOKEN              # Token de System User (não expira)
NEXT_PUBLIC_SUPABASE_URL       # URL do seu projeto Supabase
SUPABASE_SERVICE_ROLE_KEY       # service_role key do Supabase
CRON_SECRET                     # String aleatória para o cron
GOOGLE_ADS_CLIENT_ID            # OAuth client ID
GOOGLE_ADS_CLIENT_SECRET        # OAuth client secret
GOOGLE_ADS_REFRESH_TOKEN        # Refresh token OAuth
GOOGLE_ADS_DEVELOPER_TOKEN      # Developer token
GOOGLE_ADS_LOGIN_CUSTOMER_ID    # MCC ID
DASHBOARD_PASSWORD              # Mín. 12 caracteres
SESSION_SECRET                  # Mín. 32 caracteres aleatórios
RESEND_API_KEY                  # Chave da API Resend
REPORT_FROM_EMAIL               # Remetente dos relatórios
TASK_ALERT_EMAIL                # OBRIGATÓRIO — seu e-mail para lembretes
```

### 3. Rodar local

```bash
npm install
npm run dev
```

Dispare a primeira coleta manualmente:
```bash
curl -H "Authorization: Bearer SEU_CRON_SECRET" http://localhost:3000/api/collect
```

Abra http://localhost:3000

### 4. Deploy na Vercel

```bash
npm i -g vercel
vercel
```

Adicione as mesmas variáveis de ambiente no painel da Vercel.
O `vercel.json` agenda a coleta 1×/dia (`0 10 * * *` = 07:00 BRT), compatível
com o plano Hobby. No plano Pro dá para usar `*/30 * * * *` (a cada 30 min).

## Estrutura do projeto

```
lib/
  meta.ts              — Cliente da Meta Marketing API
  google-ads.ts        — Cliente REST da Google Ads API
  alerts.ts            — Motor de alertas
  meta-creatives.ts    — Métricas e diagnósticos de criativos
  resend.ts            — Envio de e-mail (Resend)
  report-email.ts      — HTML do relatório semanal
  report-data.ts       — Dados para o relatório
  report-token.ts      — Links assinados para relatórios públicos
  task-digest.ts       — Lembrete interno de pendências
  supabase.ts          — Cliente Supabase (service role)
  auth.ts              — Autenticação (senha + sessão)
  brand.ts             — Nome da marca no cliente (fallback do env)
  settings.ts          — Configurações do sistema (banco, com env de reserva)
  format.ts            — Formatação de valores, moedas, percentuais
  utils.ts             — Utilitários diversos
app/
  api/collect          — Coleta diária (cron)
  api/accounts         — Leitura de contas para o front
  api/cockpit          — Consolidação operacional por cliente
  api/alerts           — Alertas
  api/tasks            — CRUD de tarefas
  api/clients          — CRUD de clientes
  api/reports/send     — Envio semanal de relatórios (agenda por cliente)
  api/settings         — Configurações do sistema (GET/PATCH)
  api/integrations/status — Estado das integrações, com teste ao vivo
  page.tsx             — Visão geral (overview matinal)
  today/page.tsx       — Cockpit com pacing, metas e prioridades
  creatives/page.tsx   — Laboratório de Criativos Meta
  tarefas/page.tsx     — Quadro de tarefas (kanban)
  vendas/page.tsx      — ROI por cliente
  clientes/page.tsx    — Clientes, metas, grupos e contas
  relatorios/page.tsx  — Entrega do relatório e link do painel por cliente
  admin/page.tsx       — Config do sistema (marca, e-mail, integrações)
  login/page.tsx       — Tela de login
  r/[token]/page.tsx   — Relatório público assinado
  c/[token]/page.tsx   — Painel público do cliente
components/
  AppNav.tsx           — Navegação principal
  BrandMark.tsx        — Logotipo "A" em SVG
  ReportDocument.tsx   — Documento do relatório (Recharts)
```

## Uso

### Três telas de configuração
- `/clientes` — metas, orçamento, objetivo, KPI, grupos e vínculo de contas
  Meta e Google.
- `/relatorios` — entrega por cliente: e-mail de destino, marca do relatório,
  dia do envio, teste que vai só para você, disparo imediato para o cliente e
  link do painel.
- `/admin` (Config) — sistema: nome do painel, endereços de e-mail do disparo,
  horário único de envio, estado das integrações (com teste ao vivo) e o
  lembrete interno de tarefas.

Na Config, campo vazio herda a variável de ambiente correspondente — a tela
mostra qual valor viria do `.env`. Chaves de API continuam só no ambiente.

### Cockpit e metas
`/today` mostra investimento MTD, orçamento, pacing, projeção de fim do mês,
saúde dos dados e fila priorizada de decisões.

### Laboratório de Criativos
`/creatives` consulta uma conta Meta por vez e mostra thumbnail, investimento,
CPM, frequência, hook, hold, outbound CTR, CVR, CPA, ROAS, funil de retenção,
quadrante e diagnósticos relativos à mediana da conta.

### Relatório semanal
Envia para cada cliente com `report_enabled = true` no **dia** configurado em
`/relatorios`, avaliado no fuso do próprio cliente (padrão: segunda). O
**horário** é um só para todos, escolhido em Config › Envio entre 6h, 7h, 8h e
9h, e aplicado na manhã do fuso de cada cliente. Período já enviado não repete
e conta sem investimento é pulada.

- `/api/reports/send?dry=1` — teste; vai para o e-mail de teste da Config,
  nunca para o cliente.
- `/api/reports/send?client=<uuid>&force=1` — **disparo imediato**, quando o
  cliente pede o relatório fora da agenda. Vai direto para o e-mail dele,
  ignora a automação desligada e o "já enviado neste período". Exige um cliente
  específico, para nunca virar disparo em massa. Na tela é o botão "Enviar
  agora ao cliente", com confirmação.

O horário só é cobrado quando o cron passa de hora em hora, o que exige plano
com cron horário na Vercel (o Hobby limita a uma execução diária). Para ligar:
`vercel.json` em `0 * * * *` **e** `REPORT_CRON_HOURLY=1` no ambiente. Sem
isso o cron semanal continua valendo, o dia é respeitado e o horário fica só
como referência na tela. O estado atual aparece em Config › Integrações.

### Lembrete interno de tarefas
Junto da coleta diária, um e-mail é enviado para o endereço de lembretes
internos (Config › E-mail, ou `TASK_ALERT_EMAIL`) listando tarefas atrasadas e
projetos no prazo final.

## Segurança
Todas as páginas e APIs exigem autenticação (DASHBOARD_PASSWORD + sessão).
O Vercel Cron usa `Authorization: Bearer CRON_SECRET`. O Supabase tem RLS
ativado sem políticas públicas — o acesso é exclusivamente via service role.

## Personalização da marca
Defina o nome em `/admin` (Config › Identidade) — vale para o dashboard, os
relatórios e os e-mails, sem redeploy. `NEXT_PUBLIC_APP_BRAND_NAME` no .env
continua valendo como padrão quando o campo está vazio. Cada cliente pode ter
uma marca própria no relatório, em `/relatorios`.
