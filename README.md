# Ads Dashboard — Overview de mídia paga (Meta + Google Ads)

Dashboard para acompanhar múltiplas contas de anúncio da Meta e Google Ads:
gasto 7d, agrupamento por cliente, saldo (prepaid), status de conta e alertas
(sem saldo, cartão recusado, criativo reprovado, queda de gasto).

Um token de System User percorre as contas da Meta e uma autorização OAuth
single-user percorre as contas vinculadas ao Google Ads MCC.

## Stack
- Next.js 16 (App Router, TypeScript) — deploy na Vercel
- Supabase — banco privado (acesso somente pelo servidor)
- Vercel Cron — coleta automática (1×/dia no plano Hobby; a cada 30 min requer Pro)

## Setup

### 1. Supabase
1. Crie um projeto em supabase.com (plano free).
2. Em um projeto novo, rode no SQL Editor, nesta ordem:
   - `supabase-schema.sql`
   - `supabase-migration-v2.sql`
   - `supabase-migration-metrics.sql`
   - `supabase-migration-alerts.sql`
   - `supabase-migration-account-links.sql`
3. Em Settings → API, copie a `URL` e a `service_role key`.
4. Para atualizar o projeto atual para esta versão, execute/reexecute, nesta ordem:
   - `supabase-migration-clients.sql`
   - `supabase-migration-operations.sql`
   - `supabase-migration-security.sql`

### 2. Variáveis de ambiente
Copie `.env.example` para `.env.local` e preencha:
- `META_ACCESS_TOKEN` — seu token de System User (não expira)
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` — string aleatória qualquer
- Google Ads: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`,
  `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN` e
  `GOOGLE_ADS_LOGIN_CUSTOMER_ID`
- Acesso privado: `DASHBOARD_PASSWORD` (mín. 12 caracteres) e
  `SESSION_SECRET` (mín. 32 caracteres aleatórios)

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
Configure o `CRON_SECRET` também como variável para o cron autenticar.
O detalhe por conta é buscado ao vivo na Meta API (não depende do cron).

## Estrutura
- `lib/meta.ts` — cliente da Meta Marketing API (contas, insights, reprovados)
- `lib/google-ads.ts` — cliente REST da Google Ads API (MCC, contas e métricas)
- `lib/alerts.ts` — motor de alertas
- `app/api/collect/route.ts` — coleta (cron)
- `app/api/accounts/route.ts` — leitura para o front
- `app/page.tsx` — overview matinal
- `app/today/page.tsx` — cockpit com pacing, metas e prioridades
- `app/creatives/page.tsx` — Laboratório de Criativos Meta
- `app/api/cockpit/route.ts` — consolidação operacional por cliente
- `lib/meta-creatives.ts` — métricas e diagnósticos criativos

## Organizar contas por cliente
Use `/admin` para configurar clientes, orçamento, objetivo e KPI, e para
vincular as contas Meta e Google. Os grupos legados continuam disponíveis
como filtro visual no overview.

## Notas sobre a Meta API
- **Saldo restante** só existe para contas prepaid; contas no cartão pós-pago
  não expõem "saldo" — nesse caso o alerta de saldo não dispara.
- O acesso depende das permissões e contas concedidas ao token configurado.

## Seleção de contas
Use `/admin` para sincronizar Meta/Google e ativar somente as contas desejadas.
Contas novas entram ocultas. Contas ocultas não têm insights consultados pelo
cron nem pelo overview ao vivo; ao reativar, voltam a ser coletadas.

## Cockpit e metas
`/today` mostra investimento MTD, orçamento, pacing, projeção de fim do mês,
saúde dos dados e uma fila priorizada de decisões. Configure objetivo,
orçamento, KPI principal e meta em `/admin#clients`.

O coletor também grava fatos idempotentes em `daily_account_metrics`; erros de
uma conta não viram zeros e não resolvem alertas válidos das demais.

## Laboratório de Criativos
`/creatives` consulta uma conta Meta por vez e mostra thumbnail, amostra,
investimento, CPM, frequência, hook, hold, outbound CTR, LPV rate, CVR, CPA,
ROAS, funil de retenção, quadrante e diagnósticos relativos à mediana da conta.

## Segurança
Em produção, todas as páginas e APIs exigem a senha do dashboard. O Vercel Cron
continua usando `Authorization: Bearer CRON_SECRET`. Sem as variáveis de
autenticação, produção retorna uma tela de configuração em vez de expor dados.
`supabase-migration-security.sql` ativa RLS sem políticas públicas; a service
role usada pelas APIs do servidor continua funcionando.

## Vincular Google a um cliente Meta
Rode `supabase-migration-account-links.sql` no SQL Editor do Supabase. Depois,
em `/admin`, escolha para cada conta Google qual conta Meta representa o cliente.
O overview abre inicialmente em “Meta / Clientes”; ao expandir um cliente Meta,
as contas Google ativas vinculadas aparecem ao final. O filtro “Google Ads”
permite analisar as contas Google separadamente.

## Próximos passos sugeridos
- Inteligência de termos de pesquisa e negativas no Google Ads
- Histórico de decisões e anotações por cliente
- Relatório executivo automático por cliente
