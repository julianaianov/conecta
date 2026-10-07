"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/app/api";
import { TermosModal } from "./TermosModal";

const CONTACT_EMAIL = "dmconecta.app@core9.email";

/**
 * Modais da landing: entrar (autentica no auth-service e segue para o portal),
 * fale conosco (abre o e-mail do visitante com a mensagem pronta) e Termos de
 * Uso. O cadastro não mora aqui: os botões levam a `/register?perfil=…`, o
 * fluxo real de criação de conta.
 */
export function LandingModals() {
  const router = useRouter();
  const [contactOpen, setContactOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [termosOpen, setTermosOpen] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [contactFeedback, setContactFeedback] = useState<{ msg: string; err: boolean } | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginFeedback, setLoginFeedback] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const lastActive = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (window.location.hash !== "#termos") return;
    const timer = window.setTimeout(() => setTermosOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const termos = target.closest<HTMLElement>("[data-termos]");
      if (termos) {
        event.preventDefault();
        lastActive.current = termos;
        setTermosOpen(true);
        return;
      }

      const contact = target.closest<HTMLElement>("[data-contact]");
      if (contact) {
        event.preventDefault();
        lastActive.current = contact;
        setContactFeedback(null);
        setContactOpen(true);
        setLoginOpen(false);
        return;
      }

      const login = target.closest<HTMLElement>("#loginBtn, [data-open-login]");
      if (login) {
        event.preventDefault();
        lastActive.current = login;
        setLoginFeedback(null);
        setLoginOpen(true);
        setContactOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setContactOpen(false);
      setLoginOpen(false);
      setTermosOpen(false);
      lastActive.current?.focus();
    };

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const submitContact = (event: FormEvent) => {
    event.preventDefault();
    const fail = (msg: string) => setContactFeedback({ msg, err: true });
    if (!name.trim()) return fail("Informe seu nome.");
    if (!email.trim() || !email.includes("@")) return fail("Informe um e-mail válido.");
    if (!message.trim()) return fail("Escreva sua mensagem.");
    if (!consent) return fail("Para continuar, autorize o uso dos dados para contato.");

    const body = [
      "Nome: " + name.trim(),
      "E-mail: " + email.trim(),
      "Organização: " + (organization.trim() || "-"),
      "",
      "Mensagem:",
      message.trim(),
      "",
      "Autorizo o uso dos meus dados para contato sobre o DM Conecta (LGPD).",
    ].join("\n");
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      `[DM Conecta] Contato — ${name.trim()}`,
    )}&body=${encodeURIComponent(body)}`;
    setContactFeedback({
      msg: `Abrimos seu aplicativo de e-mail com a mensagem pronta. Se não abriu, envie para ${CONTACT_EMAIL}.`,
      err: false,
    });
  };

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (!loginEmail.trim() || !loginEmail.includes("@")) return setLoginFeedback("Informe um e-mail válido.");
    if (!loginPassword) return setLoginFeedback("Informe sua senha.");
    setLoginFeedback(null);
    setLoggingIn(true);
    try {
      await api.login(loginEmail.trim(), loginPassword);
      // O portal confere a sessão e provisiona o perfil ao abrir.
      router.push("/feed");
    } catch (error) {
      setLoginFeedback(error instanceof Error ? error.message : "Não foi possível entrar.");
      setLoggingIn(false);
    }
  };

  return (
    <>
      <div
        className="lg-ov"
        id="cadDlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cadT"
        hidden={!contactOpen}
        onClick={(event) => { if (event.target === event.currentTarget) setContactOpen(false); }}
      >
        <form className="lg-box cad-box" id="cadForm" noValidate onSubmit={submitContact}>
          <button type="button" className="lg-x" id="cadX" aria-label="Fechar" onClick={() => setContactOpen(false)}>&times;</button>
          <span className="cad-k" id="cadK">Contato</span>
          <h2 id="cadT">Fale com o DM Conecta</h2>
          <p className="lg-sub" id="cadSub">Envie sua mensagem para a equipe do DM Conecta. Ela sai pelo seu próprio e-mail.</p>

          <div className="cad-row">
            <div>
              <label htmlFor="cadNome">Nome</label>
              <input id="cadNome" type="text" autoComplete="name" placeholder="Seu nome" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <label htmlFor="cadEmail">E-mail</label>
              <input id="cadEmail" type="email" autoComplete="email" placeholder="nome@exemplo.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
          </div>

          <label htmlFor="cadOrg">Organização <small>(opcional)</small></label>
          <input id="cadOrg" type="text" autoComplete="organization" placeholder="Empresa, instituição ou coletivo" value={organization} onChange={(event) => setOrganization(event.target.value)} />

          <label htmlFor="cadMsg" id="cadMsgL">Mensagem</label>
          <textarea id="cadMsg" rows={4} placeholder="Escreva sua mensagem" value={message} onChange={(event) => setMessage(event.target.value)} />

          <label className="cad-ok">
            <input type="checkbox" id="cadLgpd" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>
              Li e concordo com os <a href="/termos-de-uso" data-termos>Termos de Uso</a> e autorizo o uso dos meus dados para contato sobre o DM Conecta, conforme a LGPD.
            </span>
          </label>

          <button type="submit" className="btn btn-primary lg-go">
            Enviar <svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg>
          </button>

          {contactFeedback ? (
            <p className={contactFeedback.err ? "lg-msg err" : "lg-msg"} id="cadFb" role="status">{contactFeedback.msg}</p>
          ) : null}

          <p className="cad-alt">
            Prefere escrever direto? <a href={`mailto:${CONTACT_EMAIL}`}><span>{CONTACT_EMAIL}</span></a>
          </p>
        </form>
      </div>

      <div
        className="lg-ov"
        id="loginDlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lgT"
        hidden={!loginOpen}
        onClick={(event) => { if (event.target === event.currentTarget) setLoginOpen(false); }}
      >
        <form className="lg-box" id="loginForm" noValidate onSubmit={submitLogin}>
          <button type="button" className="lg-x" id="loginX" aria-label="Fechar" onClick={() => setLoginOpen(false)}>&times;</button>
          <svg className="lg-logo" width="30" height="33" aria-hidden="true"><use href="#logo-mark" /></svg>
          <h2 id="lgT">Entrar no DM Conecta</h2>
          <p className="lg-sub">Acesse sua conta para acompanhar projetos, apoios e conexões.</p>

          <label htmlFor="lgEmail">E-mail</label>
          <input id="lgEmail" type="email" autoComplete="email" placeholder="nome@exemplo.com" required value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />

          <label htmlFor="lgSenha">Senha</label>
          <input id="lgSenha" type="password" autoComplete="current-password" placeholder="Sua senha" required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} />

          <Link className="lg-forgot" href="/recuperar-senha">Esqueci minha senha</Link>

          <button type="submit" className="btn btn-primary lg-go" disabled={loggingIn}>
            {loggingIn ? "Entrando…" : "Entrar"} <svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg>
          </button>

          {loginFeedback ? <p className="lg-msg err" id="lgMsg" role="alert">{loginFeedback}</p> : null}

          <p className="lg-new">
            Ainda não tem conta? <Link href="/register" id="lgNew">Crie sua conta</Link>
          </p>
        </form>
      </div>

      <TermosModal
        isOpen={termosOpen}
        onClose={() => {
          setTermosOpen(false);
          lastActive.current?.focus();
        }}
      />
    </>
  );
}
