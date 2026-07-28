// lib/settings.ts
// Configurações do sistema — o que a tela de Config edita.
//
// Duas fontes, nesta ordem: a tabela app_settings e, quando ela não responde ou
// o campo está vazio, a variável de ambiente de sempre. Isso mantém o deploy
// atual funcionando sem migração e permite trocar remetente sem redeploy.
//
// Só para o servidor: usa a chave de service role do Supabase.

import { getServiceClient, supabaseEnvMissing } from "./supabase";

export const SETTING_KEYS = [
  "brand_name",
  "brand_description",
  "report_from_email",
  "report_reply_to",
  "report_test_email",
  "task_alert_email",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];
export type AppSettings = Record<SettingKey, string>;

// Variável de ambiente que cobre cada chave quando o banco não tem valor.
const ENV_BY_KEY: Record<SettingKey, string> = {
  brand_name: "NEXT_PUBLIC_APP_BRAND_NAME",
  brand_description: "APP_BRAND_DESCRIPTION",
  report_from_email: "REPORT_FROM_EMAIL",
  report_reply_to: "REPORT_REPLY_TO",
  report_test_email: "REPORT_TEST_EMAIL",
  task_alert_email: "TASK_ALERT_EMAIL",
};

const DEFAULTS: Partial<Record<SettingKey, string>> = {
  brand_name: "AdsCtrl",
  brand_description: "Cockpit de performance em mídia paga",
};

// Um envio semanal percorre dezenas de clientes; sem cache seria uma consulta
// por e-mail. 30s é curto o bastante para a tela de Config parecer instantânea.
const CACHE_TTL_MS = 30_000;
let cache: { at: number; stored: Partial<AppSettings> } | null = null;

function envValue(key: SettingKey): string {
  return (process.env[ENV_BY_KEY[key]] || "").trim();
}

function merge(stored: Partial<AppSettings>): AppSettings {
  const out = {} as AppSettings;
  for (const key of SETTING_KEYS) {
    out[key] = (stored[key] || "").trim() || envValue(key) || DEFAULTS[key] || "";
  }
  return out;
}

async function loadStored(): Promise<Partial<AppSettings>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.stored;
  const stored: Partial<AppSettings> = {};
  if (!supabaseEnvMissing()) {
    try {
      const { data, error } = await getServiceClient().from("app_settings").select("key,value");
      // Tabela ausente (migração não rodou) não é erro: o ambiente cobre tudo.
      if (!error) {
        for (const row of data || []) {
          if (SETTING_KEYS.includes(row.key)) stored[row.key as SettingKey] = row.value ?? "";
        }
      }
    } catch {
      // idem: segue no ambiente.
    }
  }
  cache = { at: Date.now(), stored };
  return stored;
}

export async function getSettings(): Promise<AppSettings> {
  return merge(await loadStored());
}

/** Só o que está gravado no banco — a tela mostra o campo vazio quando herda do ambiente. */
export async function getStoredSettings(): Promise<Partial<AppSettings>> {
  return { ...(await loadStored()) };
}

/** O que o ambiente ofereceria para cada chave, para a tela dizer de onde vem o valor. */
export function getEnvDefaults(): AppSettings {
  const out = {} as AppSettings;
  for (const key of SETTING_KEYS) out[key] = envValue(key) || DEFAULTS[key] || "";
  return out;
}

export async function saveSettings(patch: Partial<Record<SettingKey, string | null>>): Promise<AppSettings> {
  if (supabaseEnvMissing()) throw new Error("Supabase não configurado.");
  const rows = Object.entries(patch)
    .filter(([key]) => SETTING_KEYS.includes(key as SettingKey))
    .map(([key, value]) => ({ key, value: (value ?? "").trim() || null, updated_at: new Date().toISOString() }));
  if (rows.length) {
    const { error } = await getServiceClient().from("app_settings").upsert(rows, { onConflict: "key" });
    if (error) {
      if (/app_settings/.test(error.message || "")) {
        throw new Error("Rode supabase-migration-settings.sql no SQL Editor do Supabase antes de salvar.");
      }
      throw error;
    }
  }
  cache = null;
  return getSettings();
}
