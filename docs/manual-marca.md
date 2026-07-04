# Manual de Marca — DM Conecta (V1.0)

Fonte da verdade para **cores, tipografia e logo**. Os valores abaixo espelham
`src/app/globals.css`, `src/lib/app/types.ts` e `src/components/app/DMLogo.tsx`.
Ao criar telas/componentes, **use apenas o que está aqui** — nada de cores fora
desta paleta ou de um segundo logo.

---

## 1. Logo

**Logo oficial:** monograma **"DM"** com o **ponto laranja obrigatório** + wordmark
**"Conecta"**. Componente: [`DMLogo`](../src/components/app/DMLogo.tsx).

- Nome por extenso: **"DM Conecta"** (nunca "dmconecta" minúsculo).
- ❌ Não usar símbolo de átomo, nem outro monograma.

**Tons (`tone`):**

| tone | Quando usar |
|------|-------------|
| `petroleo` | Fundos claros — badge azul petróleo + "Conecta" |
| `light` | Fundos escuros (petróleo/foto) — badge translúcido branco |
| `plain` | Monocromático, herda `currentColor` |

```tsx
<DMLogo size={30} tone="petroleo" />   // navbar, footer (claro)
<DMLogo size={22} tone="light" />      // sobre fundo escuro
```

---

## 2. Tipografia

| Uso | Fonte | Token |
|-----|-------|-------|
| Títulos e texto | **DM Sans** | `var(--font-dmsans)` (default do `body`) |
| Números, métricas, rankings | **Inter** (tabular) | `.font-numeric` / `var(--font-inter)` |

Carregadas via `next/font/google` em `src/app/layout.tsx`. Use `.font-numeric`
em contadores/valores para alinhamento tabular (`font-feature-settings: "tnum"`).

---

## 3. Paleta oficial

### Cores de marca
| Nome | Hex | Token CSS |
|------|-----|-----------|
| Azul Petróleo | `#1B4F72` | `--color-petroleo` |
| Petróleo Deep | `#0D2D42` | `--color-petroleo-deep` |
| Azul Médio | `#2E7BA8` | `--color-azul-medio` |
| Azul Claro | `#5A9BC4` | (alias `--color-blue-light`) |
| Azul Pálido | `#D6EAF8` | `--color-azul-palido` |
| **Laranja Cívico** | `#F4841A` | `--color-laranja` |
| Laranja Light | `#F89B45` | `--color-laranja-light` |
| Grafite | `#343A40` | `--color-grafite` |
| Cinza | `#868E96` | `--color-cinza` |

### Cores funcionais (uso restrito)
| Função | Hex |
|--------|-----|
| Erro / urgente | `#E53935` |
| Sucesso | `#2E9E5B` |
| Status online | `#10B981` |

### Neutros de tema (light/dark)
Sempre via variáveis, nunca hex fixo: `--th-bg`, `--th-bg-alt`, `--th-surface`,
`--th-card`, `--th-card-alt`, `--th-text`, `--th-muted`, `--th-border`.

### Gradientes institucionais
- Institucional: `linear-gradient(135deg, #0D2D42, #1B4F72, #2E7BA8)` (`.brand-gradient`)
- Acento: `linear-gradient(135deg, #F4841A, #F89B45)` (`.brand-gradient-accent`)

---

## 4. Cores semânticas (fonte: `src/lib/app/types.ts`)

Usadas para papéis, tipos de publicação, status e pinos do mapa. **A landing e o
app usam as mesmas** — não criar paletas paralelas.

**Papéis do usuário**
| Papel | Hex |
|-------|-----|
| Cidadão / Morador | `#2E7BA8` |
| ONG | `#5A9BC4` |
| Associação | `#1B4F72` |
| Governo / Prefeitura | `#0D2D42` |
| Empresa / Patrocinador | `#F4841A` |

**Tipos de publicação**
| Tipo | Hex |
|------|-----|
| Problema | `#E53935` |
| Projeto | `#2E9E5B` |
| Necessidade | `#F4841A` |
| Evento | `#1B4F72` |
| Ação | `#2E7BA8` |
| Mensagem | `#5A9BC4` |

**Status:** Ativo `#2E7BA8` · Em andamento `#F4841A` · Resolvido `#2E9E5B` · Cancelado `#868E96`

---

## 5. Proibido ❌

- Cores fora da paleta (ex.: ciano `#00AEEF`, verde-limão `#8DC63F`, roxo `#9E82C3`,
  dourado `#F5C542`).
- Laranjas "drift" (`#F7941D`, `#F8833A`, `#F66B0E`) — o laranja é **só** `#F4841A`/`#F89B45`.
- Azuis não-oficiais (`#205375`, `#5483A9`, `#112B3C`).
- Segundo logo (átomo) ou o nome em minúsculo ("dmconecta").
- Hex fixo para superfícies de tema — use as variáveis `--th-*`.
