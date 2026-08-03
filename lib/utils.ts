import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Lê uma resposta como JSON SEM estourar com "Unexpected token": quando a
// função do Vercel/Next morre antes de responder, o corpo vem como texto
// ("An error occurred while processing your request.") — devolve o texto como
// { error } para o usuário ver a mensagem real em vez do erro de parse.
export async function readJson(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 300) || `Falha (HTTP ${response.status}).` };
  }
}
