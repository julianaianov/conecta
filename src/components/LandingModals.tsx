"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "@/lib/app/auth";
import { TermosModal } from "./TermosModal";

const CONTACT_EMAIL = "dmconecta.app@core9.email";

export type ProfileKey =
  | "agente"
  | "parceiro"
  | "poder-publico"
  | "comunidade"
  | "comunicacao"
  | "aviso"
  | "contato";

const PROFILE_TEXTS: Record<ProfileKey, [title: string, msgLabel: string, msgPlaceholder: string, orgLabel: string]> = {
  agente: [
    "Cadastro do Agente de Transformação",
    "Conte um pouco sobre seu projeto",
    "Objetivo, público e o que você precisa",
    "Organização",
  ],
  parceiro: [
    "Cadastro de Parceiro",
    "Como gostaria de apoiar?",
    "Causas, territórios e formas de apoio de interesse",
    "Empresa / instituição",
  ],
  "poder-publico": [
    "Cadastro do Poder Público",
    "Como podemos articular?",
    "Programas, editais ou projetos de interesse",
    "Órgão / secretaria",
  ],
  comunidade: [
    "Quero participar",
    "Como gostaria de participar?",
    "Voluntariado, eixos e territórios de interesse",
    "Organização",
  ],
  comunicacao: [
    "Comunicação",
    "Sobre o que gostaria de saber?",
    "Pautas, projetos e resultados de interesse",
    "Veículo / canal",
  ],
  aviso: [
    "Seja avisado no lançamento",
    "Mensagem",
    "Algo que queira nos contar",
    "Organização",
  ],
  contato: [
    "Fale com o DM Conecta",
    "Mensagem",
    "Escreva sua mensagem",
    "Organização",
  ],
};

const PROFILE_SUBTITLES: Partial<Record<ProfileKey, string>> = {
  agente:
    "Preencha os dados da instituição e do responsável. Após a validação, a instituição poderá estruturar e publicar seus projetos.",
  parceiro:
    "Preencha os dados da organização e seus interesses. A plataforma usa essas informações para sugerir projetos compatíveis.",
  "poder-publico":
    "Preencha os dados do órgão e do responsável. Após a validação, o órgão poderá acompanhar e articular projetos de interesse público.",
};

const PROFILE_BADGES: Partial<Record<ProfileKey, string>> = {
  agente: "Cadastro institucional",
  parceiro: "Cadastro de parceiro",
  "poder-publico": "Cadastro institucional",
  contato: "Contato",
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

function digitsOnly(v: string) {
  return v.replace(/\D/g, "");
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

interface LandingModalsProps {
  initialLoginOpen?: boolean;
  initialCadOpen?: boolean;
  initialCadPerfil?: ProfileKey;
}

/**
 * Modais da landing page:
 * - #cadDlg: Diálogo de cadastro multi-perfil (Agente, Parceiro, Poder Público, Comunidade, Comunicação, Aviso, Contato)
 * - #loginDlg: Autenticação de conta
 * - #termosDlg: Termos de Uso
 * - #lb: Lightbox de ampliação de evidências
 */
export function LandingModals({
  initialLoginOpen = false,
  initialCadOpen = false,
  initialCadPerfil = "parceiro",
}: LandingModalsProps) {
  const router = useRouter();
  const { login, status } = useAuth();

  // Estados dos modais
  const [cadOpen, setCadOpen] = useState(initialCadOpen);
  const [loginOpen, setLoginOpen] = useState(initialLoginOpen);
  const [termosOpen, setTermosOpen] = useState(false);
  const [lbData, setLbData] = useState<{ src: string; alt: string; cap: string } | null>(null);

  // Perfil selecionado no cadastro
  const [perfil, setPerfil] = useState<ProfileKey>(initialCadPerfil);
  const [cadFb, setCadFb] = useState<{ msg: string; err: boolean; mailHtml?: boolean } | null>(null);

  // Campos - Agente de Transformação
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

  // Campos - Parceiro
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

  // Campos - Poder Público
  const [ppOrgao, setPpOrgao] = useState("");
  const [ppSec, setPpSec] = useState("");
  const [ppSetor, setPpSetor] = useState("");
  const [ppResp, setPpResp] = useState("");
  const [ppCargo, setPpCargo] = useState("");
  const [ppEmail, setPpEmail] = useState("");
  const [ppTel, setPpTel] = useState("");
  const [ppAreas, setPpAreas] = useState("");

  // Campos - Comunidade / Comunicação / Aviso / Contato
  const [cadNome, setCadNome] = useState("");
  const [cadEmail, setCadEmail] = useState("");
  const [cadTel, setCadTel] = useState("");
  const [cadOrg, setCadOrg] = useState("");
  const [cadDocU, setCadDocU] = useState("");
  const [cadCidade, setCadCidade] = useState("");
  const [cadMsg, setCadMsg] = useState("");
  const [cadLgpd, setCadLgpd] = useState(false);

  // Campos - Login
  const [lgPerfil, setLgPerfil] = useState("Agente de Transformação");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginFeedback, setLoginFeedback] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const lastActive = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (initialLoginOpen && status === "authenticated") router.replace("/feed");
  }, [initialLoginOpen, router, status]);

  const closeLogin = useCallback(() => {
    setLoginOpen(false);
    if (window.location.pathname === "/login") router.replace("/");
  }, [router]);

  const closeCad = useCallback(() => {
    setCadOpen(false);
    if (window.location.pathname === "/register") router.replace("/");
  }, [router]);

  const openCad = useCallback((targetPerfil: ProfileKey) => {
    setPerfil(targetPerfil);
    setCadFb(null);
    setCadOpen(true);
    setLoginOpen(false);
  }, []);

  useEffect(() => {
    if (window.location.hash === "#termos") {
      setTermosOpen(true);
    }
  }, []);

  // Listeners de clique globais compatíveis com a landing HTML
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // 1. data-cad: abre o modal de cadastro com o perfil indicado
      const cadTarget = target.closest<HTMLElement>("[data-cad]");
      if (cadTarget) {
        event.preventDefault();
        lastActive.current = cadTarget;
        const key = cadTarget.dataset.cad as ProfileKey;
        openCad(key || "parceiro");
        return;
      }

      // 2. data-termos: abre o modal de Termos de Uso
      const termosTarget = target.closest<HTMLElement>("[data-termos]");
      if (termosTarget) {
        event.preventDefault();
        lastActive.current = termosTarget;
        setTermosOpen(true);
        return;
      }

      // 3. Login
      const loginTarget = target.closest<HTMLElement>("#loginBtn, [data-open-login]");
      if (loginTarget) {
        event.preventDefault();
        lastActive.current = loginTarget;
        setLoginFeedback(null);
        setLoginOpen(true);
        setCadOpen(false);
        return;
      }

      // 4. Lightbox de evidências .thumb[data-full]
      const thumbTarget = target.closest<HTMLElement>(".thumb[data-full]");
      if (thumbTarget) {
        event.preventDefault();
        lastActive.current = thumbTarget;
        const full = thumbTarget.dataset.full || "";
        const img = thumbTarget.querySelector("img");
        const alt = img ? img.alt : "";
        const cap = thumbTarget.dataset.cap || "";
        setLbData({ src: full, alt, cap });
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (cadOpen) closeCad();
      if (loginOpen) closeLogin();
      setTermosOpen(false);
      setLbData(null);
      lastActive.current?.focus();
    };

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [cadOpen, closeCad, closeLogin, loginOpen, openCad]);

  // Envio do formulário de cadastro (validações e envio via mailto com fallback amigável)
  const submitCad = (event: FormEvent) => {
    event.preventDefault();
    setCadFb(null);

    const fail = (msg: string) => {
      setCadFb({ msg, err: true });
    };

    const sendEmail = (subj: string, body: string) => {
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
        subj
      )}&body=${encodeURIComponent(body)}`;
      setCadFb({
        msg: `Abrimos seu aplicativo de e-mail com a mensagem pronta. Se não abriu, envie para ${CONTACT_EMAIL}.`,
        err: false,
        mailHtml: true,
      });
    };

    if (perfil === "agente") {
      if (!agInst.trim()) return fail("Informe o nome da instituição.");
      if (!isCnpjValid(agCnpj)) return fail("Informe um CNPJ válido.");
      if (digitsOnly(agCnae).length !== 7)
        return fail("Informe o CNAE principal com 7 dígitos (ex.: 9430-8/00).");
      if (!agTipo) return fail("Selecione o tipo de organização.");
      if (!agMun.trim()) return fail("Informe o município.");
      if (!agTerr.trim()) return fail("Informe o território de atuação.");
      if (!agEnd.trim()) return fail("Informe o endereço.");
      if (!agResp.trim()) return fail("Informe o nome do responsável.");
      if (!agCargo.trim()) return fail("Informe o cargo ou função do responsável.");
      if (!agEmail.trim() || !agEmail.includes("@"))
        return fail("Informe um e-mail institucional válido.");
      if (digitsOnly(agTel).length < 10)
        return fail("Informe um telefone com DDD.");
      if (!cadLgpd)
        return fail("Para continuar, autorize o uso dos dados para contato.");

      const body = [
        "CADASTRO INSTITUCIONAL — AGENTE DE TRANSFORMAÇÃO",
        "",
        "DADOS DA INSTITUIÇÃO",
        "Nome da instituição: " + agInst.trim(),
        "CNPJ: " + agCnpj.trim(),
        "CNAE: " + agCnae.trim(),
        "Tipo de organização: " + agTipo,
        "Município: " + agMun.trim(),
        "Território de atuação: " + agTerr.trim(),
        "Endereço: " + agEnd.trim(),
        "",
        "RESPONSÁVEL E VALIDAÇÃO",
        "Responsável: " + agResp.trim(),
        "Cargo/função: " + agCargo.trim(),
        "E-mail institucional: " + agEmail.trim(),
        "Telefone: " + agTel.trim(),
        "",
        "Informações complementares:",
        agInfo.trim() || "-",
        "",
        "Autorizo o uso dos meus dados para contato sobre o DM Conecta (LGPD).",
      ].join("\n");

      return sendEmail(`[DM Conecta] Cadastro institucional — ${agInst.trim()}`, body);
    }

    if (perfil === "parceiro") {
      if (!parOrg.trim())
        return fail("Informe o nome da organização ou do apoiador.");
      const docOk =
        parDocTipo === "CPF" ? isCpfValid(parDoc) : isCnpjValid(parDoc);
      if (!docOk) return fail(`Informe um ${parDocTipo} válido.`);
      if (!parResp.trim()) return fail("Informe o nome do responsável.");
      if (!parEmail.trim() || !parEmail.includes("@"))
        return fail("Informe um e-mail válido.");
      if (!parEixos.length)
        return fail("Selecione ao menos um eixo de interesse.");
      if (!parFormas.length)
        return fail("Selecione ao menos uma forma de apoio.");
      if (!cadLgpd)
        return fail("Para continuar, autorize o uso dos dados para contato.");

      const body = [
        "CADASTRO DE PARCEIRO",
        "",
        "CADASTRO",
        "Organização/apoiador: " + parOrg.trim(),
        parDocTipo + ": " + parDoc.trim(),
        "Responsável: " + parResp.trim(),
        "E-mail: " + parEmail.trim(),
        "Telefone: " + (parTel.trim() || "-"),
        "",
        "PERFIL DA ORGANIZAÇÃO",
        "Área de atuação: " + (parArea.trim() || "-"),
        "Territórios de interesse: " + (parTerr.trim() || "-"),
        "",
        "INTERESSES",
        "Eixos: " + parEixos.join(", "),
        "Formas de apoio: " + parFormas.join(", "),
        "",
        "Autorizo o uso dos meus dados para contato sobre o DM Conecta (LGPD).",
      ].join("\n");

      return sendEmail(`[DM Conecta] Cadastro de parceiro — ${parOrg.trim()}`, body);
    }

    if (perfil === "poder-publico") {
      if (!ppOrgao.trim()) return fail("Informe o órgão ou instituição.");
      if (!ppSec.trim()) return fail("Informe a secretaria.");
      if (!ppResp.trim()) return fail("Informe o nome do responsável.");
      if (!ppCargo.trim()) return fail("Informe o cargo do responsável.");
      if (!ppEmail.trim() || !ppEmail.includes("@"))
        return fail("Informe um e-mail institucional válido.");
      if (!cadLgpd)
        return fail("Para continuar, autorize o uso dos dados para contato.");

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

      return sendEmail(`[DM Conecta] Cadastro institucional (Poder Público) — ${ppOrgao.trim()}`, body);
    }

    // Comunidade / Comunicação / Aviso / Contato
    if (!cadNome.trim()) return fail("Informe seu nome.");
    if (!cadEmail.trim() || !cadEmail.includes("@"))
      return fail("Informe um e-mail válido.");

    if (perfil === "comunidade") {
      if (!isCpfValid(cadDocU)) return fail("Informe um CPF válido.");
    }
    if (perfil === "comunicacao") {
      if (!isCnpjValid(cadDocU)) return fail("Informe um CNPJ válido.");
    }
    if (!cadLgpd)
      return fail("Para continuar, autorize o uso dos dados para contato.");

    const perfilLabel = PROFILE_TEXTS[perfil][0];
    const docLine =
      perfil === "comunidade"
        ? ["CPF: " + cadDocU.trim()]
        : perfil === "comunicacao"
        ? ["CNPJ: " + cadDocU.trim()]
        : [];

    const body = [
      "Perfil: " + perfilLabel,
      ...docLine,
      "Nome: " + cadNome.trim(),
      "E-mail: " + cadEmail.trim(),
      "WhatsApp: " + (cadTel.trim() || "-"),
      "Organização: " + (cadOrg.trim() || "-"),
      "Cidade/território: " + (cadCidade.trim() || "-"),
      "",
      "Mensagem:",
      cadMsg.trim() || "-",
      "",
      "Autorizo o uso dos meus dados para contato sobre o DM Conecta (LGPD).",
    ].join("\n");

    sendEmail(`[DM Conecta] ${perfilLabel} — ${cadNome.trim()}`, body);
  };

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!loginEmail.trim() || !loginEmail.includes("@"))
      return setLoginFeedback("Informe um e-mail válido.");
    if (!loginPassword) return setLoginFeedback("Informe sua senha.");
    setLoginFeedback(null);
    setLoggingIn(true);
    try {
      await login(loginEmail.trim(), loginPassword);
      router.push("/feed");
    } catch (error) {
      setLoginFeedback(error instanceof Error ? error.message : "Não foi possível entrar.");
      setLoggingIn(false);
    }
  };

  const activeTexts = PROFILE_TEXTS[perfil];
  const activeSubtitle =
    PROFILE_SUBTITLES[perfil] ||
    "Deixe seus dados. A equipe do DM Conecta entra em contato e avisa quando o cadastro abrir.";
  const activeBadge = PROFILE_BADGES[perfil] || "Lista de lançamento";

  const toggleCheckbox = (list: string[], setList: (v: string[]) => void, item: string) => {
    if (list.includes(item)) {
      setList(list.filter((x) => x !== item));
    } else {
      setList([...list, item]);
    }
  };

  return (
    <>
      {/* MODAL DE CADASTRO (#cadDlg) - 100% IDÊNTICO AO HTML */}
      <div
        className="lg-ov"
        id="cadDlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cadT"
        hidden={!cadOpen}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeCad();
        }}
      >
        <form className="lg-box cad-box" id="cadForm" noValidate onSubmit={submitCad}>
          <button
            type="button"
            className="lg-x"
            id="cadX"
            aria-label="Fechar"
            onClick={closeCad}
          >
            &times;
          </button>
          <span className="cad-k" id="cadK">
            {activeBadge}
          </span>
          <h2 id="cadT">{activeTexts[0]}</h2>
          <p className="lg-sub" id="cadSub">
            {activeSubtitle}
          </p>

          <label htmlFor="cadPerfil">Perfil</label>
          <select
            id="cadPerfil"
            value={perfil}
            onChange={(e) => setPerfil(e.target.value as ProfileKey)}
          >
            <option value="agente">Agente de Transformação (tenho um projeto)</option>
            <option value="parceiro">Parceiro (empresa, instituto, patrocinador)</option>
            <option value="poder-publico">Poder Público</option>
            <option value="comunidade">Comunidade (voluntário, participante)</option>
            <option value="comunicacao">Comunicação</option>
            <option value="aviso">Quero ser avisado no lançamento</option>
            <option value="contato">Outro assunto</option>
          </select>

          {/* BLOCO AGENTE DE TRANSFORMAÇÃO */}
          {perfil === "agente" && (
            <div id="agBlock" className="ag">
              <p className="ag-intro">
                <svg className="ico" aria-hidden="true">
                  <use href="#i-shield" />
                </svg>
                <span>
                  Antes de cadastrar um projeto, o Agente realiza seu <b>cadastro institucional</b> e passa por <b>validação</b>.
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
                <select
                  id="agTipo"
                  value={agTipo}
                  onChange={(e) => setAgTipo(e.target.value)}
                >
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
                  placeholder="Histórico da instituição, projetos já realizados, site ou redes sociais"
                  value={agInfo}
                  onChange={(e) => setAgInfo(e.target.value)}
                />
              </fieldset>
            </div>
          )}

          {/* BLOCO PARCEIRO */}
          {perfil === "parceiro" && (
            <div id="parBlock" className="ag">
              <p className="ag-intro">
                <svg className="ico" aria-hidden="true">
                  <use href="#i-brief" />
                </svg>
                <span>
                  O Parceiro cria a conta da organização, apresenta seu perfil e indica seus <b>interesses</b>, que são a base para a sugestão de projetos compatíveis.
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
                        const next = e.target.value as "CNPJ" | "CPF";
                        setParDocTipo(next);
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
                      onChange={(e) =>
                        setParDoc(parDocTipo === "CPF" ? maskCpf(e.target.value) : maskCnpj(e.target.value))
                      }
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
                  {IMPACT_AXES.map((eixo) => (
                    <label className="chk" key={eixo}>
                      <input
                        type="checkbox"
                        name="eixo"
                        value={eixo}
                        checked={parEixos.includes(eixo)}
                        onChange={() => toggleCheckbox(parEixos, setParEixos, eixo)}
                      />
                      <span>{eixo}</span>
                    </label>
                  ))}
                </div>
                <span className="chk-l">Formas de apoio</span>
                <div className="chks" id="parFormas">
                  {SUPPORT_FORMS.map((forma) => (
                    <label className="chk" key={forma}>
                      <input
                        type="checkbox"
                        name="forma"
                        value={forma}
                        checked={parFormas.includes(forma)}
                        onChange={() => toggleCheckbox(parFormas, setParFormas, forma)}
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
          )}

          {/* BLOCO PODER PÚBLICO */}
          {perfil === "poder-publico" && (
            <div id="ppBlock" className="ag">
              <p className="ag-intro">
                <svg className="ico" aria-hidden="true">
                  <use href="#i-shield" />
                </svg>
                <span>
                  O órgão realiza o <b>cadastro institucional</b> e passa por <b>validação</b>. Somente usuários validados podem representar o órgão público na plataforma.
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
          )}

          {/* BLOCO GERAL: COMUNIDADE / COMUNICAÇÃO / AVISO / CONTATO */}
          {perfil !== "agente" && perfil !== "parceiro" && perfil !== "poder-publico" && (
            <div id="genBlock">
              <div className="cad-row">
                <div>
                  <label htmlFor="cadNome">Nome</label>
                  <input
                    id="cadNome"
                    type="text"
                    autoComplete="name"
                    placeholder="Seu nome"
                    required
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
                    required
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
                    {activeTexts[3]} <small>(opcional)</small>
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

              {/* DOCUMENTO OBRIGATÓRIO PARA COMUNIDADE (CPF) OU COMUNICAÇÃO (CNPJ) */}
              {(perfil === "comunidade" || perfil === "comunicacao") && (
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
                    onChange={(e) =>
                      setCadDocU(perfil === "comunidade" ? maskCpf(e.target.value) : maskCnpj(e.target.value))
                    }
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
                {activeTexts[1]} <small>(opcional)</small>
              </label>
              <textarea
                id="cadMsg"
                rows={3}
                placeholder={activeTexts[2]}
                value={cadMsg}
                onChange={(e) => setCadMsg(e.target.value)}
              />
            </div>
          )}

          <label className="cad-ok">
            <input
              type="checkbox"
              id="cadLgpd"
              checked={cadLgpd}
              onChange={(e) => setCadLgpd(e.target.checked)}
            />
            <span>
              Li e concordo com os{" "}
              <a href="#termos" data-termos>
                Termos de Uso
              </a>{" "}
              e autorizo o uso dos meus dados para contato sobre o DM Conecta, conforme a LGPD.
            </span>
          </label>

          <button type="submit" className="btn btn-primary lg-go">
            Enviar{" "}
            <svg className="ico" aria-hidden="true">
              <use href="#i-arrow" />
            </svg>
          </button>

          {cadFb && (
            <p
              className={cadFb.err ? "lg-msg err" : "lg-msg"}
              id="cadFb"
              role="status"
            >
              {cadFb.msg}
            </p>
          )}

          <p className="cad-alt">
            Prefere escrever direto?{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} data-mail>
              <span data-c="email">{CONTACT_EMAIL}</span>
            </a>
          </p>
        </form>
      </div>

      {/* LOGIN MODAL (#loginDlg) - COM SELETOR DE PERFIL E LINK PARA LANÇAMENTO */}
      <div
        className="lg-ov"
        id="loginDlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lgT"
        hidden={!loginOpen}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeLogin();
        }}
      >
        <form className="lg-box" id="loginForm" noValidate onSubmit={submitLogin}>
          <button
            type="button"
            className="lg-x"
            id="loginX"
            aria-label="Fechar"
            onClick={closeLogin}
          >
            &times;
          </button>
          <svg className="lg-logo" width="30" height="33" aria-hidden="true">
            <use href="#logo-mark" />
          </svg>
          <h2 id="lgT">Entrar no DM Conecta</h2>
          <p className="lg-sub">Acesse sua conta para acompanhar projetos, apoios e conexões.</p>

          <label htmlFor="lgPerfil">Perfil</label>
          <select
            id="lgPerfil"
            value={lgPerfil}
            onChange={(e) => setLgPerfil(e.target.value)}
          >
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
            value={loginEmail}
            onChange={(event) => setLoginEmail(event.target.value)}
          />

          <label htmlFor="lgSenha">Senha</label>
          <input
            id="lgSenha"
            type="password"
            autoComplete="current-password"
            placeholder="Sua senha"
            required
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.target.value)}
          />

          <Link className="lg-forgot" href="/recuperar-senha">
            Esqueci minha senha
          </Link>

          <button type="submit" className="btn btn-primary lg-go" disabled={loggingIn}>
            {loggingIn ? "Entrando…" : "Entrar"}{" "}
            <svg className="ico" aria-hidden="true">
              <use href="#i-arrow" />
            </svg>
          </button>

          {loginFeedback && (
            <p className="lg-msg err" id="lgMsg" role="alert">
              {loginFeedback}
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
                openCad("agente");
              }}
            >
              Entre na lista de lançamento
            </a>
          </p>
        </form>
      </div>

      {/* TERMOS DE USO (#termosDlg) */}
      <TermosModal
        isOpen={termosOpen}
        onClose={() => {
          setTermosOpen(false);
          lastActive.current?.focus();
        }}
      />

      {/* LIGHTBOX DE EVIDÊNCIAS (#lb) */}
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
            /* eslint-disable-next-line @next/next/no-img-element */
            <img id="lbImg" src={lbData.src} alt={lbData.alt} />
          )}
          <figcaption id="lbCap">{lbData?.cap}</figcaption>
        </figure>
      </div>
    </>
  );
}
