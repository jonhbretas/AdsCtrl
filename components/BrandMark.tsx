// components/BrandMark.tsx
// Símbolo da marca: o "A" desenhado em vetor (não em fonte), igual ao
// favicon em app/icon.svg — assim a marca sai idêntica na tela, no PDF e em
// qualquer máquina, sem depender de fonte instalada.

export default function BrandMark({
  size = 30,
  background = "#12161f",
  color = "#ffffff",
}: {
  size?: number;
  background?: string;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Assertivus Dash"
      style={{ display: "block", flexShrink: 0 }}
    >
      <rect width="100" height="100" rx="22" fill={background} />
      <path
        d="M27 78 L50 23 L73 78"
        fill="none"
        stroke={color}
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M38.5 61 H61.5" stroke={color} strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
}
