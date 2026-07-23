# Ads Dashboard — Overview de mídia paga (Meta)

Dashboard de agência para acompanhar múltiplas contas de anúncio da Meta:
gasto 7d, agrupamento por cliente, saldo (prepaid), status de conta e alertas
(sem saldo, cartão recusado, criativo reprovado, queda de gasto).

Um único token de System User percorre todas as contas atribuídas ao seu BM.

## Stack
- Next.js 14 (App Router, TypeScript) — deploy na Vercel
- Supabase — banco + (futuro) auth
- Vercel Cron — coleta automática a cada 30 min

## Setup

### 1. Supabase
1. Crie um projeto em supabase.com (plano free).
2. Vá em SQL Editor e rode o conteúdo de `supabase-schema.sql`.
3. Em Settings → API, copie: `URL`, `anon key` e `service_role key`.

### 2. Variáveis de ambiente
Copie `.env.example` para `.env.local` e preencha:
- `META_ACCESS_TOKEN` — seu token de System User (não expira)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` — string aleatória qualquer

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
O `vercel.json` já agenda a coleta a cada 30 min. Configure o `CRON_SECRET`
também como variável para o cron autenticar.

## Estrutura
- `lib/meta.ts` — cliente da Meta Marketing API (contas, insights, reprovados)
- `lib/alerts.ts` — motor de alertas
- `app/api/collect/route.ts` — coleta (cron)
- `app/api/accounts/route.ts` — leitura para o front
- `app/page.tsx` — overview matinal

## Agrupar contas por cliente
Insira grupos na tabela `client_groups` e atribua `group_id` em `ad_accounts`
(via Supabase Table Editor ou uma tela de admin futura). O filtro no topo do
dashboard usa esses grupos.

## Notas sobre a Meta API
- **Saldo restante** só existe para contas prepaid; contas no cartão pós-pago
  não expõem "saldo" — nesse caso o alerta de saldo não dispara.
- Seu token está em `development_access`. Para volume maior ou contas fora do
  seu BM, solicite Advanced Access para `ads_read` (pode exigir App Review).
- Rate limits: 20-30 contas a cada 30 min ficam tranquilas.

## Próximos passos sugeridos
- Tela de admin para criar grupos e arrastar contas
- Filtro de data customizável no gasto (hoje é fixo em 7d no back)
- Adicionar Google Ads como segunda plataforma (mesmo schema, `platform='google'`)
- Auth do Supabase para restringir acesso
