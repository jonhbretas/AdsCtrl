export function appBrandName(): string {
  return process.env.NEXT_PUBLIC_APP_BRAND_NAME || "AdsCtrl";
}

export function appBrandDescription(): string {
  return "Cockpit de performance em mídia paga";
}
