"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

// Seções do menu, na ordem da narrativa da página.
const NAV_SECTIONS = [
  { id: "sobre", label: "O desafio" },
  { id: "para-quem", label: "Quem participa" },
  { id: "como-funciona", label: "Como funciona" },
  { id: "projetos", label: "Projetos" },
  { id: "territorio", label: "Impacto" },
  { id: "impacto", label: "Transparência" },
] as const;

export function Navbar() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ elId?: string; title: string; sec: string; snip?: string }>
  >([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [currentSection, setCurrentSection] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const spyBar = useRef<HTMLElement>(null);

  // Progresso de leitura e seção atual no menu.
  useEffect(() => {
    const root = document.documentElement;
    const onScroll = () => {
      const height = root.scrollHeight - window.innerHeight;
      if (spyBar.current) spyBar.current.style.transform = `scaleX(${height > 0 ? Math.min(1, window.scrollY / height) : 0})`;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    let observer: IntersectionObserver | undefined;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) if (entry.isIntersecting) setCurrentSection(entry.target.id);
      }, { rootMargin: "-45% 0px -50% 0px" });
      for (const { id } of NAV_SECTIONS) {
        const target = document.getElementById(id);
        if (target) observer.observe(target);
      }
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      observer?.disconnect();
    };
  }, []);

  // Initialize theme
  useEffect(() => {
    const isDark =
      document.documentElement.classList.contains("dark") ||
      document.documentElement.getAttribute("data-theme") === "dark" ||
      localStorage.getItem("theme") === "dark";
    if (isDark) {
      setTheme("dark");
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      setTheme("light");
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    }
  };

  // Keyboard shortcut Ctrl+K or / to open search, Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === "k" && (e.ctrlKey || e.metaKey)) ||
        (e.key === "/" &&
          !["INPUT", "TEXTAREA"].includes(
            (document.activeElement as HTMLElement)?.tagName,
          ))
      ) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 40);
    } else {
      setSearchQuery("");
      setSearchResults([]);
      setSelectedIndex(-1);
    }
  }, [searchOpen]);

  // Index and search content
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSelectedIndex(-1);
      return;
    }
    const q = searchQuery
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const terms = q.split(/\s+/).filter(Boolean);

    const items = [
      {
        elId: "solucao",
        title: "O DM Conecta",
        sec: "Visão Geral",
        snip: "Uma ponte entre quem desenvolve projetos e quem pode apoiá-los.",
      },
      {
        elId: "solucao",
        title: "Organiza, Conecta, Sugere, Mapeia e Acompanha",
        sec: "Plataforma",
        snip: "Dossiê digital, IA e acompanhamento de impacto mensurável.",
      },
      {
        elId: "sobre",
        title: "O Desafio",
        sec: "Contexto",
        snip: "Existem projetos. Existem recursos. Falta conexão.",
      },
      {
        elId: "como-funciona",
        title: "Como Funciona (9 Etapas)",
        sec: "Fluxo",
        snip: "Estruturar, Conectar, Executar e Mensurar.",
      },
      {
        elId: "como-funciona",
        title: "Atores no Fluxo",
        sec: "Atores",
        snip: "Agentes de Transformação, Parceiros, Poder Público, Comunidade e Comunicação.",
      },
      {
        elId: "para-quem",
        title: "Quem Participa",
        sec: "Perfis",
        snip: "Quem tem o projeto encontra quem pode apoiar.",
      },
      {
        elId: "projetos",
        title: "Projetos e Eixos de Impacto",
        sec: "Eixos",
        snip: "Educação, Esporte, Cultura, Proteção Animal, Meio Ambiente, Saúde, Alimentar, Rua.",
      },
      {
        elId: "projetos",
        title: "Dossiê Digital",
        sec: "Dossiê",
        snip: "Estruturação completa e acompanhamento auditável.",
      },
      {
        elId: "apoio",
        title: "Sistema de Apoio (10 Formas)",
        sec: "Apoio",
        snip: "Financeiro, materiais, voluntariado, mentoria, divulgação e monitoramento.",
      },
      {
        elId: "territorio",
        title: "Mapa Inteligente do Território",
        sec: "Território",
        snip: "Visualização geográfica de projetos e demandas com filtros por eixo e estágio.",
      },
      {
        elId: "impacto",
        title: "Transparência e Prestação de Contas",
        sec: "Transparência",
        snip: "Evidências verificáveis, fotos, documentos e histórico temporal.",
      },
      {
        elId: "ia",
        title: "Inteligência Artificial",
        sec: "Inovação",
        snip: "A IA sugere conexões. As pessoas decidem. Governança e limites éticos.",
      },
      {
        elId: "governanca",
        title: "Governança, LGPD e Neutralidade",
        sec: "Governança",
        snip: "Confiança para empresas, organizações e poder público.",
      },
      {
        elId: "participar",
        title: "Cadastrar Projeto / Quero Apoiar",
        sec: "Ação",
        snip: "Um projeto pode ser o começo de uma transformação.",
      },
    ];

    const matched = items.filter((item) => {
      const target = (item.title + " " + item.sec + " " + (item.snip || ""))
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return terms.every((t) => target.includes(t));
    });

    setSearchResults(matched);
    setSelectedIndex(matched.length > 0 ? 0 : -1);
  }, [searchQuery]);

  const goToResult = (elId?: string) => {
    setSearchOpen(false);
    if (!elId) return;
    const el = document.getElementById(elId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.remove("hit-flash");
      void el.offsetWidth;
      el.classList.add("hit-flash");
    }
  };

  return (
    <header className="site-header">
      <span className="spy-bar" aria-hidden="true"><i id="spyBar" ref={spyBar} /></span>
      <div className="wrap">
        <div className="hdr">
          <Link href="#top" className="logo" aria-label="DM Conecta — início">
            <svg className="logo-mark" width="40" height="44" aria-hidden="true">
              <use href="#logo-mark" />
            </svg>
            <span>
              DM <small>Conecta</small>
            </span>
          </Link>

          <nav className="nav" aria-label="Principal">
            {NAV_SECTIONS.map((item) => (
              <a href={`#${item.id}`} className={currentSection === item.id ? "is-cur" : undefined} key={item.id}>{item.label}</a>
            ))}
          </nav>

          <div className="hdr-actions">
            <button
              className="icon-btn"
              id="searchBtn"
              type="button"
              aria-expanded={searchOpen}
              aria-controls="searchPanel"
              aria-label="Pesquisar no DM Conecta"
              title="Pesquisar (Ctrl+K)"
              onClick={() => setSearchOpen((prev) => !prev)}
            >
              <svg className="ico">
                <use href="#i-search" />
              </svg>
            </button>

            <button
              className="icon-btn"
              id="themeBtn"
              type="button"
              aria-pressed={theme === "dark"}
              aria-label={
                theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"
              }
              title={
                theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"
              }
              onClick={toggleTheme}
            >
              <svg className="ico i-moon">
                <use href="#i-moon" />
              </svg>
              <svg className="ico i-sun">
                <use href="#i-sun" />
              </svg>
            </button>

            <span className="hdr-sep" aria-hidden="true" />

            <button
              type="button"
              className="btn btn-ghost hdr-login"
              id="loginBtn"
              aria-haspopup="dialog"
              aria-controls="loginDlg"
            >
              <svg className="ico">
                <use href="#i-login" />
              </svg>
              <span>Entrar</span>
            </button>

            <Link className="btn btn-ghost hdr-apoio" href="/register?perfil=partner">
              <svg className="ico">
                <use href="#i-heart" />
              </svg>
              <span>Quero apoiar</span>
            </Link>

            <Link className="btn btn-primary" href="/register?perfil=agent">
              <svg className="ico">
                <use href="#i-pin" />
              </svg>
              <span>Cadastrar projeto</span>
            </Link>

            <button
              className="menu-btn"
              id="menuBtn"
              type="button"
              aria-expanded={menuOpen}
              aria-controls="mnav"
              aria-label="Abrir menu"
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              <svg className="ico">
                <use href="#i-menu" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <nav className="mnav" id="mnav" aria-label="Menu móvel" hidden={!menuOpen}>
          {NAV_SECTIONS.map((item) => (
            <a href={`#${item.id}`} onClick={() => setMenuOpen(false)} key={item.id}>{item.label}</a>
          ))}
          <Link href="/register?perfil=partner" onClick={() => setMenuOpen(false)}>Quero apoiar</Link>
          <Link href="/register?perfil=agent" onClick={() => setMenuOpen(false)}>Cadastrar projeto</Link>
          <a href="/login" data-open-login onClick={() => setMenuOpen(false)}>Entrar</a>
        </nav>
      </div>

      {/* Search overlay dialog */}
      <div
        className="srch"
        id="searchPanel"
        role="dialog"
        aria-modal="false"
        aria-label="Pesquisa"
        hidden={!searchOpen}
      >
        <div className="wrap sp-in">
          <div className="sp-field">
            <svg className="ico" aria-hidden="true">
              <use href="#i-search" />
            </svg>
            <input
              ref={searchInputRef}
              id="searchInput"
              type="search"
              placeholder="Pesquisar no DM Conecta (ex: projetos, apoio, transparência...)"
              autoComplete="off"
              aria-label="Pesquisar no DM Conecta"
              aria-controls="searchResults"
              aria-autocomplete="list"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && searchResults.length > 0) {
                  e.preventDefault();
                  setSelectedIndex((prev) =>
                    Math.min(searchResults.length - 1, prev + 1),
                  );
                } else if (e.key === "ArrowUp" && searchResults.length > 0) {
                  e.preventDefault();
                  setSelectedIndex((prev) => Math.max(0, prev - 1));
                } else if (
                  e.key === "Enter" &&
                  selectedIndex >= 0 &&
                  searchResults[selectedIndex]
                ) {
                  e.preventDefault();
                  goToResult(searchResults[selectedIndex].elId);
                }
              }}
            />
            <kbd className="sp-kbd">Esc</kbd>
            <button
              type="button"
              className="icon-btn sp-close"
              id="searchClose"
              aria-label="Fechar pesquisa"
              onClick={() => setSearchOpen(false)}
            >
              <svg className="ico">
                <use href="#i-close" />
              </svg>
            </button>
          </div>

          <div className="sp-scope" role="group" aria-label="Onde pesquisar">
            <span className="sp-chip is-on">Nesta página</span>
            <span
              className="sp-chip is-off"
              title="Disponível com a integração da plataforma"
            >
              Projetos
            </span>
            <span
              className="sp-chip is-off"
              title="Disponível com a integração da plataforma"
            >
              Organizações
            </span>
            <span
              className="sp-chip is-off"
              title="Disponível com a integração da plataforma"
            >
              Iniciativas
            </span>
            <span
              className="sp-chip is-off"
              title="Disponível com a integração da plataforma"
            >
              Eixos de impacto
            </span>
            <span
              className="sp-chip is-off"
              title="Disponível com a integração da plataforma"
            >
              Territórios
            </span>
          </div>

          {searchQuery.trim() && (
            <ul
              className="sp-res"
              id="searchResults"
              role="listbox"
              aria-label="Resultados"
            >
              {searchResults.length === 0 ? (
                <li className="empty" role="option" aria-selected={false} aria-disabled="true">
                  Nenhum conteúdo desta página corresponde a “{searchQuery}”.
                </li>
              ) : (
                searchResults.map((item, i) => (
                  <li
                    key={`${item.elId}-${i}`}
                    role="option"
                    aria-selected={selectedIndex === i}
                    onClick={() => goToResult(item.elId)}
                    onMouseEnter={() => setSelectedIndex(i)}
                  >
                    <span className="sec">{item.sec}</span>
                    <b>{item.title}</b>
                    {item.snip && <small>{item.snip}</small>}
                  </li>
                ))
              )}
            </ul>
          )}

          <p className="sp-note">
            <svg className="ico" aria-hidden="true">
              <use href="#i-clock" />
            </svg>
            A busca em projetos, organizações, iniciativas, eixos de impacto e
            territórios cadastrados estará disponível com a integração da
            plataforma. Por enquanto, a pesquisa encontra conteúdos institucionais
            deste portal.
          </p>
        </div>
      </div>
    </header>
  );
}
