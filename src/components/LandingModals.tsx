"use client";

import { useEffect, useState, useRef, FormEvent, ChangeEvent } from "react";

const CONTACT_EMAIL = "dmconecta.app@core9.email";

type ProfileKey =
  | "agente"
  | "parceiro"
  | "poder-publico"
  | "comunidade"
  | "comunicacao"
  | "aviso"
  | "contato";

interface ProfileMetadata {
  title: string;
  msgLabel: string;
  msgPlaceholder: string;
  orgLabel: string;
  subtitle: string;
  eyebrow: string;
}

const PROFILE_CONFIG: Record<ProfileKey, ProfileMetadata> = {
  agente: {
    title: "Cadastro do Agente de Transformação",
    msgLabel: "Conte um pouco sobre seu projeto",
    msgPlaceholder: "Objetivo, público e o que você precisa",
    orgLabel: "Nome da instituição",
    subtitle:
      "Preencha os dados da instituição e do responsável. Após a validação, a instituição poderá estruturar e publicar seus projetos.",
    eyebrow: "Cadastro institucional",
  },
  parceiro: {
    title: "Cadastro de Parceiro",
    msgLabel: "Como gostaria de apoiar?",
    msgPlaceholder: "Causas, territórios e formas de apoio de interesse",
    orgLabel: "Empresa / instituição",
    subtitle:
      "Preencha os dados da organização e seus interesses. A plataforma usa essas informações para sugerir projetos compatíveis.",
    eyebrow: "Cadastro de parceiro",
  },
  "poder-publico": {
    title: "Cadastro do Poder Público",
    msgLabel: "Como podemos articular?",
    msgPlaceholder: "Programas, editais ou projetos de interesse",
    orgLabel: "Órgão / secretaria",
    subtitle:
      "Preencha os dados do órgão e do responsável. Após a validação, o órgão poderá acompanhar e articular projetos de interesse público.",
    eyebrow: "Cadastro institucional",
  },
  comunidade: {
    title: "Quero participar",
    msgLabel: "Como gostaria de participar?",
    msgPlaceholder: "Voluntariado, eixos e territórios de interesse",
    orgLabel: "Organização",
    subtitle: "Deixe seus dados para participar de projetos e iniciativas territoriais no DM Conecta.",
    eyebrow: "Membros da comunidade",
  },
  comunicacao: {
    title: "Comunicação",
    msgLabel: "Sobre o que gostaria de saber?",
    msgPlaceholder: "Pautas, projetos e resultados de interesse",
    orgLabel: "Veículo / canal",
    subtitle: "Conecte-se para receber pautas, releases e relatórios verificáveis de impacto territorial.",
    eyebrow: "Comunicação",
  },
  aviso: {
    title: "Seja avisado no lançamento",
    msgLabel: "Mensagem",
    msgPlaceholder: "Algo que queira nos contar",
    orgLabel: "Organização",
    subtitle: "Deixe seus dados. A equipe do DM Conecta avisa você assim que o sistema estiver liberado.",
    eyebrow: "Lista de lançamento",
  },
  contato: {
    title: "Fale com o DM Conecta",
    msgLabel: "Mensagem",
    msgPlaceholder: "Escreva sua mensagem",
    orgLabel: "Organização",
    subtitle: "Envie sua mensagem diretamente para a equipe técnica e de articulação do DM Conecta.",
    eyebrow: "Contato",
  },
};

const IMPACT_AXES = [
  "Educação",
  "Esporte",
  "Cultura",
  "Proteção Animal",
  "Meio Ambiente",
  "Saúde e Bem-estar",
  "Segurança Alimentar",
  "População em Situação de Rua",
];

const SUPPORT_FORMS = [
  "Patrocínio",
  "Investimento social",
  "Doações financeiras",
  "Doação de materiais e equipamentos",
  "Apoio técnico e conhecimento especializado",
  "Cessão de espaço e infraestrutura",
  "Apoio logístico",
  "Voluntariado",
  "Divulgação",
  "Apoio institucional e parcerias estratégicas",
];

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function maskCnpj(v: string) {
  const d = digitsOnly(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function maskCpf(v: string) {
  const d = digitsOnly(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function maskCnae(v: string) {
  const d = digitsOnly(v).slice(0, 7);
  return d.replace(/^(\d{4})(\d)/, "$1-$2").replace(/^(\d{4})-(\d)(\d)/, "$1-$2/$3");
}

function maskTel(v: string) {
  const d = digitsOnly(v).slice(0, 11);
  return d.length > 10
    ? d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3")
    : d.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3").replace(/-$/, "");
}

function isCnpjValid(v: string) {
  const c = digitsOnly(v);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (n: number) => {
    let s = 0;
    let p = n - 7;
    for (let i = 0; i < n; i++) {
      s += Number(c[i]) * p--;
      if (p < 2) p = 9;
    }
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

function isCpfValid(v: string) {
  const c = digitsOnly(v);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const calc = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
}

export function LandingModals() {
  // Modal states
  const [cadOpen, setCadOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [lbData, setLbData] = useState<{ src: string; alt: string; cap: string } | null>(null);

  // Cad form state
  const [perfil, setPerfil] = useState<ProfileKey>("agente");
  const [cadFb, setCadFb] = useState<{ msg: string; err: boolean } | null>(null);

  // Field states
  // Agente
  const [agInst, setAgInst] = useState("");
  const [agCnpj, setAgCnpj] = useState("");
  const [agCnae, setAgCnae] = useState("");
  const [agTipo, setAgTipo] = useState("");
  const [agMun, setAgMun] = useState("");
  const [agTerr, setAgTerr] = useState("");
  const [agEnd, setAgEnd] = useState("");
  const [agResp, setAgResp] = useState("");
  const [agCargo, setAgCargo] = useState("");
  const [agEmail, setAgEmail] = useState("");
  const [agTel, setAgTel] = useState("");
  const [agInfo, setAgInfo] = useState("");

  // Parceiro
  const [parOrg, setParOrg] = useState("");
  const [parDocTipo, setParDocTipo] = useState<"CNPJ" | "CPF">("CNPJ");
  const [parDoc, setParDoc] = useState("");
  const [parResp, setParResp] = useState("");
  const [parTel, setParTel] = useState("");
  const [parEmail, setParEmail] = useState("");
  const [parArea, setParArea] = useState("");
  const [parTerr, setParTerr] = useState("");
  const [parEixos, setParEixos] = useState<string[]>([]);
  const [parFormas, setParFormas] = useState<string[]>([]);

  // Poder Público
  const [ppOrgao, setPpOrgao] = useState("");
  const [ppSec, setPpSec] = useState("");
  const [ppSetor, setPpSetor] = useState("");
  const [ppResp, setPpResp] = useState("");
  const [ppCargo, setPpCargo] = useState("");
  const [ppEmail, setPpEmail] = useState("");
  const [ppTel, setPpTel] = useState("");
  const [ppAreas, setPpAreas] = useState("");

  // General / Community / Communication
  const [cadNome, setCadNome] = useState("");
  const [cadEmail, setCadEmail] = useState("");
  const [cadTel, setCadTel] = useState("");
  const [cadOrg, setCadOrg] = useState("");
  const [cadDocU, setCadDocU] = useState("");
  const [cadCidade, setCadCidade] = useState("");
  const [cadMsg, setCadMsg] = useState("");
  const [cadLgpd, setCadLgpd] = useState(false);

  // Login form state
  const [lgEmail, setLgEmail] = useState("");
  const [lgSenha, setLgSenha] = useState("");
  const [lgMsg, setLgMsg] = useState<{ msg: string; err: boolean } | null>(null);

  // Focus ref
  const lastActiveRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Handle data-cad clicks
      const cadBtn = target.closest("[data-cad]") as HTMLElement | null;
      if (cadBtn) {
        e.preventDefault();
        const role = cadBtn.dataset.cad as ProfileKey;
        lastActiveRef.current = cadBtn;
        setPerfil(role in PROFILE_CONFIG ? role : "agente");
        setCadFb(null);
        setCadOpen(true);
        setLoginOpen(false);
        return;
      }

      // Handle login clicks
      const logBtn = target.closest("#loginBtn, [data-open-login]") as HTMLElement | null;
      if (logBtn) {
        e.preventDefault();
        lastActiveRef.current = logBtn;
        setLgMsg(null);
        setLoginOpen(true);
        setCadOpen(false);
        return;
      }

      // Handle lightbox thumb clicks
      const thumb = target.closest(".thumb[data-full]") as HTMLElement | null;
      if (thumb) {
        e.preventDefault();
        const full = thumb.dataset.full;
        const cap = thumb.dataset.cap || "";
        const img = thumb.querySelector("img");
        if (full) {
          lastActiveRef.current = thumb;
          setLbData({ src: full, alt: img?.alt || "", cap });
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lbData) setLbData(null);
        if (cadOpen) setCadOpen(false);
        if (loginOpen) setLoginOpen(false);
        if (lastActiveRef.current) lastActiveRef.current.focus();
      }
    };

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [cadOpen, loginOpen, lbData]);

  const handleCadSubmit = (e: FormEvent) => {
    e.preventDefault();

    const err = (msg: string) => {
      setCadFb({ msg, err: true });
    };

    if (perfil === "agente") {
      if (!agInst.trim()) return err("Informe o nome da instituição.");
      if (!isCnpjValid(agCnpj)) return err("Informe um CNPJ válido.");
      if (!agMun.trim()) return err("Informe o município.");
      if (!agTerr.trim()) return err("Informe o território de atuação.");
      if (!agEnd.trim()) return err("Informe o endereço.");
      if (!agResp.trim()) return err("Informe o nome do responsável.");
      if (!agCargo.trim()) return err("Informe o cargo ou função do responsável.");
      if (!agEmail.trim() || !agEmail.includes("@")) return err("Informe um e-mail institucional válido.");
      if (!cadLgpd) return err("Para continuar, autorize o uso dos dados para contato.");

      const body = [
        "CADASTRO INSTITUCIONAL — AGENTE DE TRANSFORMAÇÃO",
        "",
        "Instituição: " + agInst.trim(),
        "CNPJ: " + agCnpj,
        "CNAE principal: " + (agCnae || "-"),
        "Tipo de organização: " + (agTipo || "-"),
        "Município: " + agMun.trim(),
        "Território de atuação: " + agTerr.trim(),
        "Endereço: " + agEnd.trim(),
        "",
        "RESPONSÁVEL",
        "Responsável: " + agResp.trim(),
        "Cargo / função: " + agCargo.trim(),
        "E-mail institucional: " + agEmail.trim(),
        "Telefone: " + (agTel || "-"),
        "",
        "Informações complementares:",
        agInfo.trim() || "-",
        "",
        "Autorizo o uso dos meus dados para contato sobre o DM Conecta (LGPD).",
      ].join("\n");

      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
        `[DM Conecta] Cadastro de Agente de Transformação — ${agInst.trim()}`
      )}&body=${encodeURIComponent(body)}`;

      setCadFb({
        msg: `Abrimos seu aplicativo de e-mail com a mensagem pronta. Se não abriu, envie para ${CONTACT_EMAIL}.`,
        err: false,
      });
      return;
    }

    if (perfil === "parceiro") {
      if (!parOrg.trim()) return err("Informe o nome da organização ou apoiador.");
      const okDoc = parDocTipo === "CPF" ? isCpfValid(parDoc) : isCnpjValid(parDoc);
      if (!okDoc) return err(`Informe um ${parDocTipo} válido.`);
      if (!parResp.trim()) return err("Informe o nome do responsável.");
      if (!parEmail.trim() || !parEmail.includes("@")) return err("Informe um e-mail válido.");
      if (!cadLgpd) return err("Para continuar, autorize o uso dos dados para contato.");

      const body = [
        "CADASTRO DE PARCEIRO",
        "",
        "Organização / apoiador: " + parOrg.trim(),
        `${parDocTipo}: ${parDoc}`,
        "Responsável: " + parResp.trim(),
        "E-mail: " + parEmail.trim(),
        "Telefone: " + (parTel || "-"),
        "Área de atuação: " + (parArea || "-"),
        "Territórios de interesse: " + (parTerr || "-"),
        "",
        "Eixos de impacto de interesse: " + (parEixos.join(", ") || "Nenhum selecionado"),
        "Formas de apoio: " + (parFormas.join(", ") || "Nenhuma selecionada"),
        "",
        "Autorizo o uso dos meus dados para contato sobre o DM Conecta (LGPD).",
      ].join("\n");

      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
        `[DM Conecta] Cadastro de parceiro — ${parOrg.trim()}`
      )}&body=${encodeURIComponent(body)}`;

      setCadFb({
        msg: `Abrimos seu aplicativo de e-mail com a mensagem pronta. Se não abriu, envie para ${CONTACT_EMAIL}.`,
        err: false,
      });
      return;
    }

    if (perfil === "poder-publico") {
      if (!ppOrgao.trim()) return err("Informe o órgão ou instituição.");
      if (!ppSec.trim()) return err("Informe a secretaria.");
      if (!ppResp.trim()) return err("Informe o nome do responsável.");
      if (!ppCargo.trim()) return err("Informe o cargo do responsável.");
      if (!ppEmail.trim() || !ppEmail.includes("@")) return err("Informe um e-mail institucional válido.");
      if (!cadLgpd) return err("Para continuar, autorize o uso dos dados para contato.");

      const body = [
        "CADASTRO INSTITUCIONAL — PODER PÚBLICO",
        "",
        "Órgão ou instituição: " + ppOrgao.trim(),
        "Secretaria: " + ppSec.trim(),
        "Setor: " + (ppSetor.trim() || "-"),
        "",
        "RESPONSÁVEL",
        "Responsável: " + ppResp.trim(),
        "Cargo: " + ppCargo.trim(),
        "E-mail institucional: " + ppEmail.trim(),
        "Telefone: " + (ppTel.trim() || "-"),
        "",
        "Áreas de atuação e programas:",
        ppAreas.trim() || "-",
        "",
        "Autorizo o uso dos meus dados para contato sobre o DM Conecta (LGPD).",
      ].join("\n");

      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
        `[DM Conecta] Cadastro institucional (Poder Público) — ${ppOrgao.trim()}`
      )}&body=${encodeURIComponent(body)}`;

      setCadFb({
        msg: `Abrimos seu aplicativo de e-mail com a mensagem pronta. Se não abriu, envie para ${CONTACT_EMAIL}.`,
        err: false,
      });
      return;
    }

    // General profiles (comunidade, comunicacao, aviso, contato)
    if (!cadNome.trim()) return err("Informe seu nome.");
    if (!cadEmail.trim() || !cadEmail.includes("@")) return err("Informe um e-mail válido.");

    if (perfil === "comunidade") {
      if (!isCpfValid(cadDocU)) return err("Informe um CPF válido.");
    } else if (perfil === "comunicacao") {
      if (!isCnpjValid(cadDocU)) return err("Informe um CNPJ válido.");
    }

    if (!cadLgpd) return err("Para continuar, autorize o uso dos dados para contato.");

    const conf = PROFILE_CONFIG[perfil];
    const docs = perfil === "comunidade" ? [`CPF: ${cadDocU}`] : perfil === "comunicacao" ? [`CNPJ: ${cadDocU}`] : [];

    const body = [
      `Perfil: ${conf.title}`,
      ...docs,
      "Nome: " + cadNome.trim(),
      "E-mail: " + cadEmail.trim(),
      "WhatsApp: " + (cadTel.trim() || "-"),
      "Organização: " + (cadOrg.trim() || "-"),
      "Cidade / território: " + (cadCidade.trim() || "-"),
      "",
      "Mensagem:",
      cadMsg.trim() || "-",
      "",
      "Autorizo o uso dos meus dados para contato sobre o DM Conecta (LGPD).",
    ].join("\n");

    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      `[DM Conecta] ${conf.title} — ${cadNome.trim()}`
    )}&body=${encodeURIComponent(body)}`;

    setCadFb({
      msg: `Abrimos seu aplicativo de e-mail com a mensagem pronta. Se não abriu, envie para ${CONTACT_EMAIL}.`,
      err: false,
    });
  };

  const handleLoginSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!lgEmail.trim() || !lgEmail.includes("@")) {
      setLgMsg({ msg: "Informe um e-mail válido.", err: true });
      return;
    }
    if (!lgSenha.trim()) {
      setLgMsg({ msg: "Informe sua senha.", err: true });
      return;
    }
    setLgMsg({
      msg: "O acesso à conta será liberado no lançamento da plataforma. Entre na lista de lançamento para ser avisado.",
      err: false,
    });
  };

  const toggleAxis = (name: string) => {
    setParEixos((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  };

  const toggleForm = (name: string) => {
    setParFormas((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  };

  const curConfig = PROFILE_CONFIG[perfil];
  const isDocUnico = perfil === "comunidade" || perfil === "comunicacao";

  return (
    <>
      {/* CADASTRO MODAL */}
      <div
        className="lg-ov"
        id="cadDlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cadT"
        hidden={!cadOpen}
        onClick={(e) => {
          if (e.target === e.currentTarget) setCadOpen(false);
        }}
      >
        <form className="lg-box cad-box" id="cadForm" noValidate onSubmit={handleCadSubmit}>
          <button
            type="button"
            className="lg-x"
            id="cadX"
            aria-label="Fechar"
            onClick={() => setCadOpen(false)}
          >
            &times;
          </button>
          <span className="cad-k" id="cadK">
            {curConfig.eyebrow}
          </span>
          <h2 id="cadT">{curConfig.title}</h2>
          <p className="lg-sub" id="cadSub">
            {curConfig.subtitle}
          </p>

          <label htmlFor="cadPerfil">Perfil</label>
          <select
            id="cadPerfil"
            value={perfil}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              setPerfil(e.target.value as ProfileKey);
              setCadFb(null);
            }}
          >
            <option value="agente">Agente de Transformação (tenho um projeto)</option>
            <option value="parceiro">Parceiro (empresa, instituto, patrocinador)</option>
            <option value="poder-publico">Poder Público</option>
            <option value="comunidade">Comunidade (voluntário, participante)</option>
            <option value="comunicacao">Comunicação</option>
            <option value="aviso">Quero ser avisado no lançamento</option>
            <option value="contato">Outro assunto</option>
          </select>

          {/* AGENTE BLOCK */}
          <div id="agBlock" className="ag" hidden={perfil !== "agente"}>
            <p className="ag-intro">
              <svg className="ico" aria-hidden="true">
                <use href="#i-shield" />
              </svg>
              <span>
                Antes de cadastrar um projeto, o Agente realiza seu <b>cadastro institucional</b> e passa por{" "}
                <b>validação</b>.
              </span>
            </p>
            <fieldset className="ag-fs">
              <legend>
                <span className="ag-n">1</span>Dados da instituição
              </legend>
              <label htmlFor="agInst">Nome da instituição</label>
              <input
                id="agInst"
                type="text"
                autoComplete="organization"
                placeholder="Nome conforme o CNPJ"
                value={agInst}
                onChange={(e) => setAgInst(e.target.value)}
              />
              <div className="cad-row">
                <div>
                  <label htmlFor="cadCnpj">CNPJ</label>
                  <input
                    id="cadCnpj"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                    value={agCnpj}
                    onChange={(e) => setAgCnpj(maskCnpj(e.target.value))}
                  />
                </div>
                <div>
                  <label htmlFor="cadCnae">CNAE principal</label>
                  <input
                    id="cadCnae"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0000-0/00"
                    maxLength={9}
                    value={agCnae}
                    onChange={(e) => setAgCnae(maskCnae(e.target.value))}
                  />
                </div>
              </div>
              <label htmlFor="agTipo">Tipo de organização</label>
              <select id="agTipo" value={agTipo} onChange={(e) => setAgTipo(e.target.value)}>
                <option value="">Selecione</option>
                <option>Associação</option>
                <option>ONG</option>
                <option>Instituto</option>
                <option>Coletivo</option>
                <option>Projeto social</option>
                <option>Organização comunitária</option>
                <option>Iniciativa socioambiental</option>
              </select>
              <div className="cad-row">
                <div>
                  <label htmlFor="agMun">Município</label>
                  <input
                    id="agMun"
                    type="text"
                    autoComplete="address-level2"
                    placeholder="Ex.: Rio de Janeiro"
                    value={agMun}
                    onChange={(e) => setAgMun(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="agTerr">Território de atuação</label>
                  <input
                    id="agTerr"
                    type="text"
                    placeholder="Bairros ou região atendida"
                    value={agTerr}
                    onChange={(e) => setAgTerr(e.target.value)}
                  />
                </div>
              </div>
              <label htmlFor="agEnd">Endereço</label>
              <input
                id="agEnd"
                type="text"
                autoComplete="street-address"
                placeholder="Rua, número, bairro, CEP"
                value={agEnd}
                onChange={(e) => setAgEnd(e.target.value)}
              />
            </fieldset>

            <fieldset className="ag-fs">
              <legend>
                <span className="ag-n">2</span>Responsável e validação
              </legend>
              <div className="cad-row">
                <div>
                  <label htmlFor="agResp">Responsável</label>
                  <input
                    id="agResp"
                    type="text"
                    autoComplete="name"
                    placeholder="Nome completo"
                    value={agResp}
                    onChange={(e) => setAgResp(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="agCargo">Cargo / função</label>
                  <input
                    id="agCargo"
                    type="text"
                    autoComplete="organization-title"
                    placeholder="Ex.: Presidente, Coordenador(a)"
                    value={agCargo}
                    onChange={(e) => setAgCargo(e.target.value)}
                  />
                </div>
              </div>
              <div className="cad-row">
                <div>
                  <label htmlFor="agEmail">E-mail institucional</label>
                  <input
                    id="agEmail"
                    type="email"
                    autoComplete="email"
                    placeholder="contato@instituicao.org.br"
                    value={agEmail}
                    onChange={(e) => setAgEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="agTel">Telefone</label>
                  <input
                    id="agTel"
                    type="tel"
                    autoComplete="tel"
                    placeholder="(00) 00000-0000"
                    value={agTel}
                    onChange={(e) => setAgTel(maskTel(e.target.value))}
                  />
                </div>
              </div>
              <p className="ag-doc">
                <svg className="ico" aria-hidden="true">
                  <use href="#i-doc" />
                </svg>
                <span>
                  <b>Documentação institucional:</b> será solicitada pela equipe do DM Conecta na etapa de validação.
                </span>
              </p>
              <label htmlFor="agInfo">
                Informações complementares para validação <small>(opcional)</small>
              </label>
              <textarea
                id="agInfo"
                rows={3}
                placeholder="Histórico da instituição, projetos já realizados, site"
                value={agInfo}
                onChange={(e) => setAgInfo(e.target.value)}
              />
            </fieldset>
          </div>

          {/* PARCEIRO BLOCK */}
          <div id="parBlock" className="ag" hidden={perfil !== "parceiro"}>
            <p className="ag-intro">
              <svg className="ico" aria-hidden="true">
                <use href="#i-brief" />
              </svg>
              <span>
                O Parceiro cria a conta da organização, apresenta seu perfil e indica seus <b>interesses</b>, que são
                a base para a sugestão de projetos compatíveis.
              </span>
            </p>
            <fieldset className="ag-fs">
              <legend>
                <span className="ag-n">1</span>Cadastro
              </legend>
              <label htmlFor="parOrg">Nome da organização ou do apoiador</label>
              <input
                id="parOrg"
                type="text"
                autoComplete="organization"
                placeholder="Empresa, instituto, marca ou pessoa"
                value={parOrg}
                onChange={(e) => setParOrg(e.target.value)}
              />
              <div className="cad-row">
                <div>
                  <label htmlFor="cadDocTipo">Tipo de documento</label>
                  <select
                    id="cadDocTipo"
                    value={parDocTipo}
                    onChange={(e) => {
                      const t = e.target.value as "CNPJ" | "CPF";
                      setParDocTipo(t);
                      setParDoc("");
                    }}
                  >
                    <option value="CNPJ">CNPJ (empresa ou instituição)</option>
                    <option value="CPF">CPF (pessoa física)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="cadDoc" id="cadDocL">
                    {parDocTipo}
                  </label>
                  <input
                    id="cadDoc"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={parDocTipo === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"}
                    maxLength={parDocTipo === "CPF" ? 14 : 18}
                    value={parDoc}
                    onChange={(e) => setParDoc(parDocTipo === "CPF" ? maskCpf(e.target.value) : maskCnpj(e.target.value))}
                  />
                </div>
              </div>
              <div className="cad-row">
                <div>
                  <label htmlFor="parResp">Responsável</label>
                  <input
                    id="parResp"
                    type="text"
                    autoComplete="name"
                    placeholder="Nome completo"
                    value={parResp}
                    onChange={(e) => setParResp(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="parTel">
                    Telefone <small>(opcional)</small>
                  </label>
                  <input
                    id="parTel"
                    type="tel"
                    autoComplete="tel"
                    placeholder="(00) 00000-0000"
                    value={parTel}
                    onChange={(e) => setParTel(maskTel(e.target.value))}
                  />
                </div>
              </div>
              <label htmlFor="parEmail">E-mail</label>
              <input
                id="parEmail"
                type="email"
                autoComplete="email"
                placeholder="nome@empresa.com.br"
                value={parEmail}
                onChange={(e) => setParEmail(e.target.value)}
              />
            </fieldset>

            <fieldset className="ag-fs">
              <legend>
                <span className="ag-n">2</span>Perfil da organização
              </legend>
              <div className="cad-row">
                <div>
                  <label htmlFor="parArea">Área de atuação</label>
                  <input
                    id="parArea"
                    type="text"
                    placeholder="Setor ou atividade"
                    value={parArea}
                    onChange={(e) => setParArea(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="parTerr">Territórios de interesse</label>
                  <input
                    id="parTerr"
                    type="text"
                    placeholder="Municípios ou regiões"
                    value={parTerr}
                    onChange={(e) => setParTerr(e.target.value)}
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="ag-fs">
              <legend>
                <span className="ag-n">3</span>Interesses
              </legend>
              <span className="chk-l">Eixos de impacto de interesse</span>
              <div className="chks" id="parEixos">
                {IMPACT_AXES.map((axis) => (
                  <label key={axis} className="chk">
                    <input
                      type="checkbox"
                      name="eixo"
                      value={axis}
                      checked={parEixos.includes(axis)}
                      onChange={() => toggleAxis(axis)}
                    />
                    <span>{axis}</span>
                  </label>
                ))}
              </div>

              <span className="chk-l">Formas de apoio</span>
              <div className="chks" id="parFormas">
                {SUPPORT_FORMS.map((forma) => (
                  <label key={forma} className="chk">
                    <input
                      type="checkbox"
                      name="forma"
                      value={forma}
                      checked={parFormas.includes(forma)}
                      onChange={() => toggleForm(forma)}
                    />
                    <span>{forma}</span>
                  </label>
                ))}
              </div>

              <p className="ag-doc">
                <svg className="ico" aria-hidden="true">
                  <use href="#i-check" />
                </svg>
                <span>
                  Demonstrar interesse em um projeto <b>não gera compromisso</b>. A conexão formal acontece quando o apoio é definido.
                </span>
              </p>
            </fieldset>
          </div>

          {/* PODER PÚBLICO BLOCK */}
          <div id="ppBlock" className="ag" hidden={perfil !== "poder-publico"}>
            <p className="ag-intro">
              <svg className="ico" aria-hidden="true">
                <use href="#i-shield" />
              </svg>
              <span>
                O órgão realiza o <b>cadastro institucional</b> e passa por <b>validação</b>. Somente usuários
                validados podem representar o órgão público na plataforma.
              </span>
            </p>
            <fieldset className="ag-fs">
              <legend>
                <span className="ag-n">1</span>Cadastro institucional
              </legend>
              <label htmlFor="ppOrgao">Órgão ou instituição</label>
              <input
                id="ppOrgao"
                type="text"
                autoComplete="organization"
                placeholder="Ex.: Prefeitura de ..."
                value={ppOrgao}
                onChange={(e) => setPpOrgao(e.target.value)}
              />
              <div className="cad-row">
                <div>
                  <label htmlFor="ppSec">Secretaria</label>
                  <input
                    id="ppSec"
                    type="text"
                    placeholder="Ex.: Secretaria de Esporte"
                    value={ppSec}
                    onChange={(e) => setPpSec(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="ppSetor">
                    Setor <small>(opcional)</small>
                  </label>
                  <input
                    id="ppSetor"
                    type="text"
                    placeholder="Departamento responsável"
                    value={ppSetor}
                    onChange={(e) => setPpSetor(e.target.value)}
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="ag-fs">
              <legend>
                <span className="ag-n">2</span>Responsável e validação
              </legend>
              <div className="cad-row">
                <div>
                  <label htmlFor="ppResp">Responsável</label>
                  <input
                    id="ppResp"
                    type="text"
                    autoComplete="name"
                    placeholder="Nome completo"
                    value={ppResp}
                    onChange={(e) => setPpResp(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="ppCargo">Cargo</label>
                  <input
                    id="ppCargo"
                    type="text"
                    autoComplete="organization-title"
                    placeholder="Cargo ou função"
                    value={ppCargo}
                    onChange={(e) => setPpCargo(e.target.value)}
                  />
                </div>
              </div>
              <div className="cad-row">
                <div>
                  <label htmlFor="ppEmail">E-mail institucional</label>
                  <input
                    id="ppEmail"
                    type="email"
                    autoComplete="email"
                    placeholder="nome@orgao.gov.br"
                    value={ppEmail}
                    onChange={(e) => setPpEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="ppTel">
                    Telefone <small>(opcional)</small>
                  </label>
                  <input
                    id="ppTel"
                    type="tel"
                    autoComplete="tel"
                    placeholder="(00) 0000-0000"
                    value={ppTel}
                    onChange={(e) => setPpTel(maskTel(e.target.value))}
                  />
                </div>
              </div>
              <p className="ag-doc">
                <svg className="ico" aria-hidden="true">
                  <use href="#i-doc" />
                </svg>
                <span>
                  <b>Documento de designação ou autorização:</b> será solicitado pela equipe do DM Conecta na etapa de validação.
                </span>
              </p>
            </fieldset>

            <fieldset className="ag-fs">
              <legend>
                <span className="ag-n">3</span>Perfil institucional
              </legend>
              <label htmlFor="ppAreas">Áreas de atuação e programas</label>
              <textarea
                id="ppAreas"
                rows={3}
                placeholder="Áreas, programas e políticas públicas relacionados a projetos de impacto"
                value={ppAreas}
                onChange={(e) => setPpAreas(e.target.value)}
              />
            </fieldset>
          </div>

          {/* GENERAL BLOCK */}
          <div id="genBlock" hidden={perfil === "agente" || perfil === "parceiro" || perfil === "poder-publico"}>
            <div className="cad-row">
              <div>
                <label htmlFor="cadNome">Nome</label>
                <input
                  id="cadNome"
                  type="text"
                  autoComplete="name"
                  placeholder="Seu nome"
                  value={cadNome}
                  onChange={(e) => setCadNome(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="cadEmail">E-mail</label>
                <input
                  id="cadEmail"
                  type="email"
                  autoComplete="email"
                  placeholder="nome@exemplo.com"
                  value={cadEmail}
                  onChange={(e) => setCadEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="cad-row">
              <div>
                <label htmlFor="cadTel">
                  WhatsApp <small>(opcional)</small>
                </label>
                <input
                  id="cadTel"
                  type="tel"
                  autoComplete="tel"
                  placeholder="(00) 00000-0000"
                  value={cadTel}
                  onChange={(e) => setCadTel(maskTel(e.target.value))}
                />
              </div>
              <div>
                <label htmlFor="cadOrg" id="cadOrgL">
                  {curConfig.orgLabel} <small>(opcional)</small>
                </label>
                <input
                  id="cadOrg"
                  type="text"
                  autoComplete="organization"
                  placeholder="Nome da organização"
                  value={cadOrg}
                  onChange={(e) => setCadOrg(e.target.value)}
                />
              </div>
            </div>

            {isDocUnico && (
              <div className="cad-doc" id="docUnico">
                <label htmlFor="cadDocU" id="cadDocUL">
                  {perfil === "comunidade" ? "CPF" : "CNPJ do veículo ou empresa"}
                </label>
                <input
                  id="cadDocU"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={perfil === "comunidade" ? "000.000.000-00" : "00.000.000/0000-00"}
                  maxLength={perfil === "comunidade" ? 14 : 18}
                  value={cadDocU}
                  onChange={(e) => setCadDocU(perfil === "comunidade" ? maskCpf(e.target.value) : maskCnpj(e.target.value))}
                />
                <p className="cad-hint" id="cadDocUH">
                  {perfil === "comunidade"
                    ? "Obrigatório para membros da comunidade."
                    : "Obrigatório para o perfil Comunicação."}
                </p>
              </div>
            )}

            <label htmlFor="cadCidade">Cidade / território</label>
            <input
              id="cadCidade"
              type="text"
              placeholder="Ex.: Rio de Janeiro, Bairro X"
              value={cadCidade}
              onChange={(e) => setCadCidade(e.target.value)}
            />

            <label htmlFor="cadMsg" id="cadMsgL">
              {curConfig.msgLabel} <small>(opcional)</small>
            </label>
            <textarea
              id="cadMsg"
              rows={3}
              placeholder={curConfig.msgPlaceholder}
              value={cadMsg}
              onChange={(e) => setCadMsg(e.target.value)}
            />
          </div>

          <label className="cad-ok">
            <input
              type="checkbox"
              id="cadLgpd"
              checked={cadLgpd}
              onChange={(e) => setCadLgpd(e.target.checked)}
            />
            <span>Autorizo o uso dos meus dados para contato sobre o DM Conecta, conforme a LGPD.</span>
          </label>

          <button type="submit" className="btn btn-primary lg-go">
            Enviar{" "}
            <svg className="ico" aria-hidden="true">
              <use href="#i-arrow" />
            </svg>
          </button>

          {cadFb && (
            <p className={`lg-msg ${cadFb.err ? "err" : ""}`} id="cadFb" role="status">
              {cadFb.msg}
            </p>
          )}

          <p className="cad-alt">
            Prefere escrever direto?{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>
              <span>{CONTACT_EMAIL}</span>
            </a>
          </p>
        </form>
      </div>

      {/* LOGIN MODAL */}
      <div
        className="lg-ov"
        id="loginDlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lgT"
        hidden={!loginOpen}
        onClick={(e) => {
          if (e.target === e.currentTarget) setLoginOpen(false);
        }}
      >
        <form className="lg-box" id="loginForm" noValidate onSubmit={handleLoginSubmit}>
          <button
            type="button"
            className="lg-x"
            id="loginX"
            aria-label="Fechar"
            onClick={() => setLoginOpen(false)}
          >
            &times;
          </button>
          <svg className="lg-logo" width="30" height="33" aria-hidden="true">
            <use href="#logo-mark" />
          </svg>
          <h2 id="lgT">Entrar no DM Conecta</h2>
          <p className="lg-sub">Acesse sua conta para acompanhar projetos, apoios e conexões.</p>

          <label htmlFor="lgPerfil">Perfil</label>
          <select id="lgPerfil">
            <option>Agente de Transformação</option>
            <option>Parceiro</option>
            <option>Poder Público</option>
            <option>Comunidade</option>
            <option>Comunicação</option>
          </select>

          <label htmlFor="lgEmail">E-mail</label>
          <input
            id="lgEmail"
            type="email"
            autoComplete="email"
            placeholder="nome@exemplo.com"
            required
            value={lgEmail}
            onChange={(e) => setLgEmail(e.target.value)}
          />

          <label htmlFor="lgSenha">Senha</label>
          <input
            id="lgSenha"
            type="password"
            autoComplete="current-password"
            placeholder="Sua senha"
            required
            value={lgSenha}
            onChange={(e) => setLgSenha(e.target.value)}
          />

          <a className="lg-forgot" href="#participar">
            Esqueci minha senha
          </a>

          <button type="submit" className="btn btn-primary lg-go">
            Entrar{" "}
            <svg className="ico" aria-hidden="true">
              <use href="#i-arrow" />
            </svg>
          </button>

          {lgMsg && (
            <p className={`lg-msg ${lgMsg.err ? "err" : ""}`} id="lgMsg" role="status">
              {lgMsg.msg}
            </p>
          )}

          <p className="lg-new">
            Ainda não tem conta?{" "}
            <a
              href="#contato"
              id="lgNew"
              data-cad="agente"
              onClick={(e) => {
                e.preventDefault();
                setLoginOpen(false);
                setPerfil("agente");
                setCadOpen(true);
              }}
            >
              Entre na lista de lançamento
            </a>
          </p>
        </form>
      </div>

      {/* LIGHTBOX MODAL */}
      <div
        className="lb"
        id="lb"
        hidden={!lbData}
        role="dialog"
        aria-modal="true"
        aria-label="Evidência ampliada"
        onClick={(e) => {
          if (e.target === e.currentTarget) setLbData(null);
        }}
      >
        <button
          type="button"
          id="lbClose"
          aria-label="Fechar"
          onClick={() => setLbData(null)}
        >
          &times;
        </button>
        <figure>
          {lbData && (
            // eslint-disable-next-line @next/next/no-img-element
            <img id="lbImg" src={lbData.src} alt={lbData.alt} />
          )}
          <figcaption id="lbCap">{lbData?.cap}</figcaption>
        </figure>
      </div>
    </>
  );
}
