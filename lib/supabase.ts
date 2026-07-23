// lib/supabase.ts
// Cliente Supabase para uso no servidor (service role).
// IMPORTANTE: cache "no-store" no fetch para o Next NÃO cachear as leituras
// em produção — senão dados novos (ex: grupos criados depois do build) somem.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: "no-store" }),
      },
    }
  );
}

export function supabaseEnvMissing(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
}
