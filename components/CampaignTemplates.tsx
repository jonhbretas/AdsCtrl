"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { brDate } from "@/lib/format";
import { Save, Copy, Trash2, Plus, ChevronDown, ChevronUp } from "lucide-react";

interface Template {
  id: string;
  name: string;
  createdAt: string;
  description?: string;
  sourceAccountId?: string;
  sourceAccountName?: string;
}

const STORAGE_KEY = "adsctrl:campaign-templates";

function loadTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTemplates(list: Template[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

export function useCampaignTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => { setTemplates(loadTemplates()); }, []);

  function add(template: Omit<Template, "id" | "createdAt">) {
    const list = [{ ...template, id: Date.now().toString(36), createdAt: new Date().toISOString() }, ...templates];
    setTemplates(list);
    saveTemplates(list);
  }

  function remove(id: string) {
    const list = templates.filter((t) => t.id !== id);
    setTemplates(list);
    saveTemplates(list);
  }

  return { templates, add, remove };
}

export function CampaignTemplateList({
  onSelect,
  onSave,
  currentAccountId,
  currentAccountName,
}: {
  onSelect?: (template: Template) => void;
  onSave?: (name: string) => void;
  currentAccountId?: string;
  currentAccountName?: string;
}) {
  const { templates, add, remove } = useCampaignTemplates();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  function handleSave() {
    if (!name.trim()) return;
    add({ name: name.trim(), sourceAccountId: currentAccountId, sourceAccountName: currentAccountName });
    setName("");
    onSave?.(name.trim());
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer w-full text-left"
      >
        <Copy className="h-3.5 w-3.5" />
        Templates de campanha {templates.length > 0 && `(${templates.length})`}
        {open ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
      </button>

      {open && (
        <div className="space-y-2 pl-1">
          {/* Save new template */}
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="Nome do template..."
              className="flex-1 h-8 text-xs"
            />
            <Button size="sm" onClick={handleSave} disabled={!name.trim()} className="h-8 text-xs">
              <Save className="h-3 w-3 mr-1" /> Salvar
            </Button>
          </div>

          {/* Template list */}
          {templates.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-2">Nenhum template salvo. Salve uma estrutura de campanha para reutilizar.</p>
          ) : (
            <div className="space-y-1">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border/50 bg-card text-xs hover:bg-accent/20 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{t.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {brDate(t.createdAt)}
                      {t.sourceAccountName && <> · {t.sourceAccountName}</>}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                    {onSelect && (
                      <button
                        onClick={() => onSelect(t)}
                        className="p-1 text-primary hover:bg-primary/10 rounded bg-transparent border-none cursor-pointer"
                        title="Usar template"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      onClick={() => remove(t.id)}
                      className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded bg-transparent border-none cursor-pointer"
                      title="Excluir template"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
