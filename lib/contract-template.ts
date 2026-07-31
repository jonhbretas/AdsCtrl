export type ContractParty = {
  name: string;
  document: string;
  representative: string;
  representativeCpf: string;
  address: string;
  email: string;
  phone: string;
};

export type ContractSection = { title: string; paragraphs: string[] };

const value = (text: string | null | undefined, fallback = "[preencher]") => text?.trim() || fallback;

export function partyFromSettings(settings: Record<string, string>): ContractParty {
  return {
    name: value(settings.contractor_legal_name),
    document: value(settings.contractor_document),
    representative: value(settings.contractor_representative_name),
    representativeCpf: value(settings.contractor_representative_cpf),
    address: [settings.contractor_address_street, settings.contractor_address_number, settings.contractor_address_complement, settings.contractor_address_neighborhood, settings.contractor_address_city, settings.contractor_address_state, settings.contractor_address_zip_code].filter(Boolean).join(", ") || "[preencher endereço]",
    email: value(settings.contractor_email),
    phone: value(settings.contractor_phone),
  };
}

export function partyFromClient(client: any): ContractParty {
  return {
    name: value(client.legal_name || client.name),
    document: value(client.person_type === "fisica" ? client.cpf : client.cnpj),
    representative: value(client.legal_representative_name || client.contact_name),
    representativeCpf: value(client.legal_representative_cpf || client.cpf),
    address: [client.address_street, client.address_number, client.address_complement, client.address_neighborhood, client.address_city, client.address_state, client.address_zip_code].filter(Boolean).join(", ") || "[preencher endereço]",
    email: value(client.contact_email),
    phone: value(client.whatsapp_phone || client.contact_phone),
  };
}

export function dateBr(date: string | null | undefined) {
  if (!date) return "[preencher]";
  const [year, month, day] = date.split("-");
  return day && month && year ? `${day}/${month}/${year}` : date;
}

export function money(valueNumber: number | null | undefined, currency = "BRL") {
  if (valueNumber == null) return "[preencher]";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(valueNumber);
}

export function buildContractSections(client: any, contract: any, settings: Record<string, string>): ContractSection[] {
  const term = contract?.term_months || 3;
  const fee = money(contract?.monthly_fee ?? client.monthly_budget, client.currency || "BRL");
  const platforms = contract?.platforms || "Meta Ads e Google Ads";
  const campaignLimit = contract?.campaign_limit || 10;
  const dueRule = contract?.payment_due_rule || "na data de assinatura e a cada 30 dias corridos";
  const forum = settings.contractor_forum || "[preencher foro]";
  return [
    { title: "CLÁUSULA PRIMEIRA: DO OBJETO DO CONTRATO", paragraphs: [
      `O presente contrato tem por objeto a prestação de serviços de gestão de tráfego pago nas plataformas ${platforms}, especificamente para a operação da CONTRATANTE.`,
      `Durante o período operacional de ${term} (${term === 1 ? "um" : term === 3 ? "três" : term}) meses, a CONTRATADA executará gestão, acompanhamento e otimização de campanhas, incluindo criação e configuração inicial, gestão de performance e orçamento, ajustes estratégicos, relatórios e dashboard para consulta em tempo real.`,
      `O serviço limita-se à gestão estratégica e operacional de campanhas de mídia paga em contas indicadas pela CONTRATANTE. Não estão incluídos, salvo contratação à parte, produção de vídeos, sessões fotográficas, design avançado, landing pages, edição de site, CRM, automação, conteúdo orgânico, copywriting extenso, atendimento comercial ou suporte técnico de terceiros.`,
      "A obrigação da CONTRATADA é de meio, e não de resultado. Não há garantia de volume mínimo de leads, vendas, faturamento, lucro, ROAS, CPA, CPC, CTR ou taxa de conversão.",
      `O presente contrato contempla a gestão de até 2 plataformas de anúncio e até ${campaignLimit} campanhas ativas simultaneamente. Novas contas, unidades, localidades, marcas, produtos ou campanhas dependerão de orçamento adicional e aprovação prévia.`,
    ] },
    { title: "CLÁUSULA SEGUNDA: DAS OBRIGAÇÕES DA CONTRATADA", paragraphs: [
      "Desenvolver o objeto contratado de maneira adequada e dinâmica, aplicando soluções compatíveis com os dados disponíveis, a estratégia definida e as limitações das plataformas.",
      "Prestar assistência em horário comercial, analisar e corrigir vícios ou incorreções de sua execução e observar a legislação aplicável à atividade.",
      "Realizar monitoramento contínuo e otimizações periódicas das campanhas, sempre que tecnicamente necessário.",
      "Realizar reuniões de acompanhamento, preferencialmente por videoconferência, para apresentação de resultados, análise de indicadores, alinhamento estratégico e definição das próximas ações.",
      "Responder às solicitações da CONTRATANTE em até 1 dia útil durante o horário comercial, ainda que a solução definitiva demande prazo superior.",
      "Apresentar indicadores de investimento, alcance, impressões, cliques, CPC, CPM, CTR, leads, CPL, conversões e ROAS quando tecnicamente mensurável, além de análise crítica e plano de ação.",
    ] },
    { title: "CLÁUSULA TERCEIRA: DAS OBRIGAÇÕES DA CONTRATANTE", paragraphs: [
      "Efetuar corretamente os pagamentos, fornecer informações e acessos necessários em tempo hábil, disponibilizar materiais digitais de qualidade e manter a CONTRATADA informada sobre estratégias, feedbacks e problemas.",
      "A CONTRATANTE será responsável pela contratação e pagamento de softwares, licenças, verba de mídia e ferramentas de terceiros necessárias à operação, salvo disposição comercial expressa em contrário.",
      "A CONTRATANTE responde pela veracidade, legalidade e regularidade de informações, ofertas, preços, imagens, marcas, depoimentos, autorizações de uso de imagem e demais materiais fornecidos ou aprovados.",
    ] },
    { title: "CLÁUSULA QUARTA: DA ALTERAÇÃO DOS SERVIÇOS", paragraphs: [
      "As solicitações de alteração obedecerão aos prazos técnicos informados pela CONTRATADA conforme complexidade: tarefas simples, novas campanhas, alteração de público, nova estratégia, nova conta ou nova integração poderão ter prazos distintos.",
      "A CONTRATADA não responderá por falhas decorrentes exclusivamente de plataformas, equipamentos, informações, acessos, aprovações ou especificações da CONTRATANTE.",
    ] },
    { title: "CLÁUSULA QUINTA: DA CONFIDENCIALIDADE", paragraphs: [
      "As partes manterão sigilo sobre dados, informações, correspondências e documentos fornecidos ou acessados em razão deste contrato. A obrigação alcança sucessores, prestadores, fornecedores, empregados e administradores.",
      "A confidencialidade permanecerá vigente por 3 anos após o encerramento, ressalvadas divulgações exigidas por ordem judicial ou autorizadas pelas partes.",
    ] },
    { title: "CLÁUSULA SEXTA: DO LICENCIAMENTO E DA PROPRIEDADE INTELECTUAL", paragraphs: [
      "Os ativos digitais previamente pertencentes à CONTRATANTE, incluindo contas de anúncio, pixels, públicos, bases, históricos, Google Ads, Analytics, Tag Manager, conversões e dashboards, permanecem de sua titularidade.",
      "A CONTRATADA mantém a titularidade sobre seus métodos, processos, templates, metodologias, know-how e materiais proprietários. Relatórios e entregáveis produzidos para a CONTRATANTE serão disponibilizados para seu uso.",
    ] },
    { title: "CLÁUSULA SÉTIMA: DA RESPONSABILIDADE TRABALHISTA", paragraphs: [
      "A relação entre as partes é civil e independente, não constituindo vínculo empregatício, sociedade, joint venture, agência, representação comercial ou solidariedade trabalhista entre as partes.",
      "Cada parte responderá por suas próprias obrigações sociais, fiscais, trabalhistas, previdenciárias e pelos atos de seus empregados, prepostos e contratados.",
    ] },
    { title: "CLÁUSULA OITAVA: DOS PAGAMENTOS", paragraphs: [
      `Pela execução dos serviços, a CONTRATANTE pagará à CONTRATADA ${fee} mensais durante a vigência contratual. A cobrança ocorrerá ${dueRule}.`,
      `O valor corresponde exclusivamente ao serviço de gestão de tráfego pago. A verba de mídia não está incluída. O pagamento poderá ser realizado pelos dados informados pela CONTRATADA: Pix ${value(settings.contractor_pix_key)}, banco ${value(settings.contractor_bank)}, agência/conta ${value(settings.contractor_agency_account)}.`,
      "O não pagamento poderá implicar suspensão dos serviços até a regularização. Em caso de atraso, incidirão multa de 5%, juros de 1% ao mês e correção monetária segundo índices oficiais.",
    ] },
    { title: "CLÁUSULA NONA: DA RESCISÃO CONTRATUAL", paragraphs: [
      "A rescisão imotivada antes do término deverá ser comunicada por escrito com antecedência mínima de 15 dias, ficando a parte responsável sujeita ao pagamento dos valores vencidos, do aviso prévio e da multa contratual eventualmente ajustada.",
      "O contrato poderá ser rescindido por descumprimento não sanado, falência, recuperação judicial, liquidação, caso fortuito ou força maior, conforme aplicável.",
      "No encerramento, a CONTRATADA entregará relatório final e garantirá a manutenção dos ativos digitais da CONTRATANTE em suas próprias contas, removendo acessos quando solicitado.",
    ] },
    { title: "CLÁUSULA DÉCIMA: DA VIGÊNCIA", paragraphs: [
      `A vigência inicia-se na data de assinatura e permanecerá válida pelo prazo operacional de ${term} meses, até o cumprimento integral das obrigações. O prazo operacional poderá iniciar após a disponibilização dos acessos, informações, materiais e aprovações indispensáveis.`,
    ] },
    { title: "CLÁUSULA DÉCIMA PRIMEIRA: DA COMUNICAÇÃO", paragraphs: [
      `As comunicações operacionais poderão ocorrer por WhatsApp. Notificações formais, alterações de escopo, reclamações, rescisões, inadimplemento e aprovações que dependam de prova deverão ocorrer por e-mail. CONTRATADA: ${value(settings.contractor_phone)} / ${value(settings.contractor_email)}. CONTRATANTE: ${value(client.whatsapp_phone || client.contact_phone)} / ${value(client.contact_email)}.`,
      "As partes reconhecem a validade probatória das comunicações eletrônicas preservadas em seu formato original.",
    ] },
    { title: "CLÁUSULA DÉCIMA SEGUNDA: DA PROTEÇÃO DE DADOS", paragraphs: [
      "As partes comprometem-se a cumprir a Lei nº 13.709/2018 (LGPD). A CONTRATANTE atuará como controladora dos dados de seus clientes, leads e usuários; a CONTRATADA atuará como operadora quando tratar dados em nome da CONTRATANTE, exclusivamente para execução dos serviços.",
      "Em caso de incidente de segurança envolvendo dados tratados no contrato, a parte que identificar o incidente comunicará a outra em prazo razoável, informando as medidas de mitigação.",
    ] },
    { title: "CLÁUSULA DÉCIMA TERCEIRA: DAS DISPOSIÇÕES GERAIS", paragraphs: [
      "Após o término, a CONTRATADA poderá manter backup do histórico e estrutura das campanhas sem dados pessoais ou informações sensíveis, para fins de histórico técnico, salvo solicitação de exclusão definitiva.",
      "A nulidade de qualquer disposição não afetará as demais. As partes são contratantes independentes, e qualquer alteração deste contrato deverá ser escrita e assinada por ambas.",
    ] },
    { title: "CLÁUSULA DÉCIMA QUARTA: DO FORO", paragraphs: [
      `As partes elegem o foro da comarca de ${forum}, com renúncia a qualquer outro, por mais privilegiado que seja, para dirimir questões decorrentes deste instrumento.`,
    ] },
  ];
}
