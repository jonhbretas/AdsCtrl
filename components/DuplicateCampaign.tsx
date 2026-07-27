"use client";

// components/DuplicateCampaign.tsx
// Copia a ESTRUTURA de uma campanha Meta para outra conta de anúncios.
//
// O que este diálogo faz de diferente de um "duplicar" comum: ele diz, ANTES,
// o que não vai junto. Anúncio e criativo não atravessam (criar criativo
// publica como a Página e exige permissão que o token não tem), e público
// personalizado não existe fora da conta de origem. Esconder isso produziria
// uma cópia pela metade sem ninguém entender por quê.
//
// "Conferir" roda a validação da Meta sem criar nada. "Duplicar" cria, tudo
// PAUSADO — uma cópia que nasce gastando é um acidente esperando.

import { useEffect, useState } from "react";
import { Button, Notice } from "@/components/ui";

interface Conta {
  account_id: string;
  name: string;
  platform?: string;
  hidden?: boolean;
}

interface Estrutura {
  name: string;
  objective: string;
  adsets: { name: string; ads: number }[];
  needsRemap: { pages: string[]; pixels: string[]; instagram: string[]; audiences: number };
}

interface Resultado {
  dryRun: boolean;
  campaign: { id?: string; name: string };
  adsets: { name: string; id?: string; error?: string; approximate?: boolean }[];
  warnings: string[];
  target?: string;
}

export default function DuplicateCampaign({
  sourceAccountId,
  campaignId,
  campaignName,
  onClose,
}: {
  sourceAccountId: string;
  campaignId: string;
  campaignName: string;
  onClose: () => void;
}) {
  const [contas, setContas] = useState<Conta[]>([]);
  const [destino, setDestino] = useState("");
  const [estrutura, setEstrutura] = useState<Estrutura | null>(null);
  const [ativos, setAtivos] = useState<{ pages: string[]; pixels: { id: string; name?: string }[] } | null>(null);
  const [pagina, setPagina] = useState("");
  const [pixel, setPixel] = useState("");
  const [sufixo, setSufixo] = useState("[cópia]");
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState<"dry" | "real" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Contas Meta visíveis, menos a própria origem.
  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => {
        const lista: Conta[] = (d.accounts || d || []).filter(
          (c: Conta) =>
            c.platform !== "google" &&
            !c.hidden &&
            c.account_id.replace(/^act_/, "") !== sourceAccountId.replace(/^act_/, "")
        );
        setContas(lista);
      })
      .catch(() => setErro("Não consegui listar as contas de destino."));
  }, [sourceAccountId]);

  // Ao escolher o destino, lê a estrutura e os ativos daquela conta.
  useEffect(() => {
    if (!destino) {
      setEstrutura(null);
      setAtivos(null);
      return;
    }
    setCarregando(true);
    setErro(null);
    setResultado(null);
    const params = new URLSearchParams({
      source_account_id: sourceAccountId,
      campaign_id: campaignId,
      target_account_id: destino,
    });
    fetch(`/api/meta/duplicate?${params}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`);
        return d;
      })
      .then((d) => {
        setEstrutura(d.structure);
        setAtivos(d.targetAssets);
        // Um só candidato não é escolha: já vem marcado.
        setPagina(d.targetAssets?.pages?.length === 1 ? d.targetAssets.pages[0] : "");
        setPixel(d.targetAssets?.pixels?.length === 1 ? d.targetAssets.pixels[0].id : "");
      })
      .catch((e) => setErro(e?.message ?? "Erro ao ler a estrutura."))
      .finally(() => setCarregando(false));
  }, [destino, sourceAccountId, campaignId]);

  const precisaPagina = (estrutura?.needsRemap.pages.length || 0) > 0;
  const precisaPixel = (estrutura?.needsRemap.pixels.length || 0) > 0;
  // Sem a estrutura lida não dá para saber o que precisa ser remapeado — e
  // sem saber, "precisaPagina" é falso e o botão liberava um envio sem página.
  // Enquanto ela não chegar, nada é enviado.
  const faltando = !estrutura || carregando || (precisaPagina && !pagina) || (precisaPixel && !pixel);
  const totalAnuncios = (estrutura?.adsets || []).reduce((n, a) => n + a.ads, 0);

  async function enviar(dryRun: boolean) {
    if (!dryRun) {
      const ok = window.confirm(
        `Criar em "${contas.find((c) => c.account_id.replace(/^act_/, "") === destino.replace(/^act_/, ""))?.name || destino}":\n\n`
        + `• 1 campanha\n• ${estrutura?.adsets.length || 0} conjunto(s)\n\n`
        + "Tudo PAUSADO. Anúncios e criativos não vão junto.\n\nConfirmar?"
      );
      if (!ok) return;
    }
    setEnviando(dryRun ? "dry" : "real");
    setErro(null);
    setResultado(null);
    try {
      const r = await fetch("/api/meta/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_account_id: sourceAccountId,
          target_account_id: destino,
          campaign_id: campaignId,
          page_id: pagina || undefined,
          pixel_id: pixel || undefined,
          name_suffix: sufixo,
          dry_run: dryRun,
        }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || `Falha (HTTP ${r.status}).`);
      setResultado(d);
    } catch (e: any) {
      setErro(e?.message ?? "Falha na duplicação.");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className="ec-modal" role="presentation" onClick={onClose}>
      <div className="ec-modal__panel" role="dialog" aria-label="Duplicar campanha" onClick={(e) => e.stopPropagation()}>
        <header className="ec-modal__head">
          <div>
            <strong>Duplicar estrutura para outra conta</strong>
            <small>{campaignName}</small>
          </div>
          <button className="ec-btn" data-variant="ghost" data-size="sm" onClick={onClose} aria-label="Fechar">✕</button>
        </header>

        <div className="ec-modal__body">
          <label className="ec-field">
            <span className="ec-field__label">Conta de destino</span>
            <select className="ec-input" value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">— escolher —</option>
              {contas.map((c) => (
                <option key={c.account_id} value={c.account_id}>{c.name}</option>
              ))}
            </select>
          </label>

          {carregando && <p className="ec-field__hint">Lendo a estrutura…</p>}

          {estrutura && !carregando && (
            <>
              <div className="ec-notice" data-tone="brand">
                <span>
                  Vão: <strong>1 campanha</strong> ({estrutura.objective}) e{" "}
                  <strong>{estrutura.adsets.length} conjunto(s)</strong> com orçamento, agendamento e segmentação.
                  {totalAnuncios > 0 && (
                    <>
                      {" "}Não vão: <strong>{totalAnuncios} anúncio(s)</strong> — criar criativo exige permissão de
                      publicação na Página, que o token não tem.
                    </>
                  )}
                  {estrutura.needsRemap.audiences > 0 && (
                    <> Também saem <strong>{estrutura.needsRemap.audiences} público(s) personalizado(s)</strong>, que só existem na conta de origem.</>
                  )}
                </span>
              </div>

              {precisaPagina && (
                <label className="ec-field">
                  <span className="ec-field__label">Página do destino</span>
                  <select className="ec-input" value={pagina} onChange={(e) => setPagina(e.target.value)}>
                    <option value="">— escolher —</option>
                    {(ativos?.pages || []).map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <span className="ec-field__hint">
                    {(ativos?.pages || []).length === 0
                      ? "Nenhuma página encontrada nos anúncios dessa conta. Sem ela os conjuntos não podem ser criados."
                      : "Páginas que a conta de destino já usa em anúncios."}
                  </span>
                </label>
              )}

              {precisaPixel && (
                <label className="ec-field">
                  <span className="ec-field__label">Pixel do destino</span>
                  <select className="ec-input" value={pixel} onChange={(e) => setPixel(e.target.value)}>
                    <option value="">— escolher —</option>
                    {(ativos?.pixels || []).map((p) => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
                  </select>
                </label>
              )}

              <label className="ec-field">
                <span className="ec-field__label">Sufixo no nome</span>
                <input className="ec-input" value={sufixo} onChange={(e) => setSufixo(e.target.value)} placeholder="[cópia]" />
                <span className="ec-field__hint">Para não confundir a cópia com a original na lista.</span>
              </label>
            </>
          )}

          {erro && <Notice tone="danger" onDismiss={() => setErro(null)}>{erro}</Notice>}

          {resultado && (
            <div className="ec-card ec-card--padded">
              <strong style={{ fontSize: 13 }}>
                {resultado.dryRun ? "Conferência (nada foi criado)" : `Criado em ${resultado.target}`}
              </strong>
              <div style={{ marginTop: 8, fontSize: 12.5 }}>
                <div>Campanha: {resultado.campaign.name} {resultado.campaign.id ? `· ${resultado.campaign.id}` : ""}</div>
                {resultado.adsets.map((a, i) => (
                  <div key={i} style={{ marginTop: 4, color: a.error ? "var(--danger-600)" : "var(--ok-600)" }}>
                    {a.error ? "✕" : "✓"} {a.name}
                    {a.error && (
                      <span style={{ color: "var(--text-muted)" }}>
                        {" — "}{a.error}
                        {a.approximate && " (pode ser da campanha usada na conferência, não da cópia)"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {resultado.warnings.length > 0 && (
                <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
                  {resultado.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>

        <footer className="ec-modal__foot">
          <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
          <span style={{ flex: 1 }} />
          <Button
            variant="secondary"
            size="sm"
            disabled={!destino || faltando || enviando !== null}
            onClick={() => enviar(true)}
            title="Pede à Meta que valide sem criar nada"
          >
            {enviando === "dry" ? "Conferindo…" : "Conferir"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!destino || faltando || enviando !== null}
            onClick={() => enviar(false)}
          >
            {enviando === "real" ? "Duplicando…" : "Duplicar (pausado)"}
          </Button>
        </footer>
      </div>
    </div>
  );
}
