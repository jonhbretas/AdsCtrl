import { notFound } from "next/navigation";
import Link from "next/link";
import { getServiceClient, supabaseEnvMissing } from "@/lib/supabase";
import { getSettings } from "@/lib/settings";
import { fetchClients } from "@/app/api/clients/_shared";
import { buildContractSections, dateBr, partyFromClient, partyFromSettings } from "@/lib/contract-template";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ContractPage({ params }: Props) {
  if (supabaseEnvMissing()) return <div className="p-8">Supabase não configurado.</div>;
  const { id } = await params;
  const sb = getServiceClient();
  const [{ clients }, settingsResult, contractsResult] = await Promise.all([
    fetchClients(sb, id),
    getSettings(),
    sb.from("client_contracts").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(1),
  ]);
  const client = clients[0];
  if (!client) notFound();
  const contract = contractsResult.data?.[0] || { title: "Contrato de prestação de serviços", start_date: client.contract_start_date, end_date: client.contract_end_date, monthly_fee: client.monthly_budget };
  const contractor = partyFromSettings(settingsResult);
  const customer = partyFromClient(client);
  const sections = buildContractSections(client, contract, settingsResult);
  const contractNumber = contract.contract_number || "[número]";
  const cityDate = settingsResult.contractor_forum || "[cidade/UF]";
  return (
    <main className="min-h-screen bg-neutral-100 py-6 text-neutral-900 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[820px] items-center justify-between print:hidden">
        <Link href="/clientes" className="text-sm text-blue-600 hover:underline">← Voltar para clientes</Link>
        <span className="text-xs text-neutral-500">Minuta editável · revise antes de assinar</span>
      </div>
      <article className="mx-auto max-w-[820px] bg-white px-12 py-14 shadow-sm print:max-w-none print:px-16 print:py-12 print:shadow-none">
        <header className="mb-8 text-center">
          <div className="mb-5 text-sm font-semibold tracking-wide">{cityDate};</div>
          <h1 className="text-xl font-bold">CONTRATO DE PRESTAÇÃO DE SERVIÇO Nº {contractNumber}</h1>
          <p className="mt-6 text-justify text-sm leading-7">Pelo presente instrumento particular, <strong>{contractor.name}</strong>, de documento {contractor.document}, estabelecida em {contractor.address}, neste ato representada por {contractor.representative}, CPF {contractor.representativeCpf}, doravante denominada <strong>CONTRATADA</strong>, e <strong>{customer.name}</strong>, de documento {customer.document}, estabelecida em {customer.address}, neste ato representada por {customer.representative}, CPF {customer.representativeCpf}, doravante denominada <strong>CONTRATANTE</strong>, resolvem celebrar o presente contrato de prestação de serviços.</p>
        </header>
        <div className="space-y-5 text-justify text-sm leading-7">
          {sections.map((section) => <section key={section.title}><h2 className="mb-2 font-bold">{section.title}</h2>{section.paragraphs.map((paragraph, index) => <p key={index} className="mb-2">{paragraph}</p>)}</section>)}
        </div>
        <section className="mt-8 text-justify text-sm leading-7"><p>Estando justas, acertadas e contratadas, firmam o presente instrumento.</p><p className="mt-3">{cityDate}, {dateBr(contract.start_date || new Date().toISOString().slice(0, 10))}.</p></section>
        <div className="mt-16 grid grid-cols-2 gap-16 text-center text-sm"><div className="border-t border-neutral-800 pt-2"><strong>CONTRATANTE</strong><br />{customer.representative}<br />CPF: {customer.representativeCpf}<br />Documento: {customer.document}</div><div className="border-t border-neutral-800 pt-2"><strong>CONTRATADA</strong><br />{contractor.name}<br />{contractor.representative}<br />CPF: {contractor.representativeCpf}<br />Documento: {contractor.document}</div></div>
        <div className="mt-20 grid grid-cols-2 gap-16 text-center text-sm"><div className="border-t border-neutral-800 pt-2"><strong>Testemunha I</strong><br />{settingsResult.witness_one_name || "[preencher]"}<br />CPF: {settingsResult.witness_one_cpf || "[preencher]"}</div><div className="border-t border-neutral-800 pt-2"><strong>Testemunha II</strong><br />{settingsResult.witness_two_name || "[preencher]"}<br />CPF: {settingsResult.witness_two_cpf || "[preencher]"}</div></div>
      </article>
    </main>
  );
}
