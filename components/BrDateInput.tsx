"use client";

export function BrDateInput({ value, onChange, className, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & { value?: string | null; onChange: (value: string) => void }) {
  // O navegador mantém o seletor de calendário e, com pt-BR, apresenta dia/mês/ano.
  // A aplicação continua recebendo ISO para não alterar o formato persistido no banco.
  return <input {...props} type="date" lang="pt-BR" value={value || ""} onChange={(event) => onChange(event.target.value)} className={className} />;
}
