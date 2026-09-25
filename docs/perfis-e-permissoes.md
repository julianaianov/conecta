# Perfis e permissões — DM Conecta

**Atualizado em:** 24 de setembro de 2026

**Fonte da verdade:** `dm-docs/fonte-da-verdade/DM_Conecta_Arquitetura_de_Perfis_e_Fluxo_do_Ecossistema.html`.
Os textos exibidos (função, papel, descrição e permissões principais) são
cópia literal da fonte em `src/lib/app/types.ts`.

Os perfis do DM Conecta são organizados pela **função** que cada participante
exerce no ecossistema. O código-fonte da regra está em `src/lib/app/types.ts`
(`ROLES`, `ROLE_PROFILES`, `ROLE_FUNCTIONS`, `ROLE_ECOSYSTEM_ROLES`,
`ROLE_DESCRIPTIONS`, `ROLE_PERMISSION_LABELS`, `ROLE_PERMISSIONS`, `ROLE_POST_TYPES`) e é espelhado
em `services/auth-service/src/routes/auth.js` (cadastro) e
`services/post-service/src/roles.js` (checagem no servidor).

> O DM Conecta conecta quem identifica uma necessidade a quem pode ajudar a
> transformá-la em solução.

## Fluxo

DEMANDA → PROJETO → CONEXÃO → APOIO → ARTICULAÇÃO → AMPLIFICAÇÃO → EXECUÇÃO →
RESULTADO → IMPACTO

Agentes de Transformação publicam · Poder Público e Parceiros viabilizam e
articulam · Comunicação amplifica · Membros da Comunidade participam.

## Categorias

| Chave (`role`) | Categoria | Função | Papel (§2) | Subperfis (`profile_type`) |
| --- | --- | --- | --- | --- |
| `agent` | Agentes de Transformação | Publicadores | Identificam demandas e publicam projetos | `associacao`, `ong`, `instituto`, `projeto_social`, `coletivo`, `lider_comunitario`, `representante_bairro` |
| `member` | Membros da Comunidade | Participantes | Participam, apoiam e fortalecem iniciativas | `morador`, `voluntario`, `jovem`, `participante` |
| `partner` | Parceiros | Apoiadores | Apoiam, financiam ou viabilizam soluções | `empresa`, `marca`, `comercio_local`, `patrocinador` |
| `government` | Poder Público | Articulação | Apoiam, financiam ou viabilizam soluções; articulam, respondem e acompanham demandas | `prefeitura`, `secretaria`, `orgao_publico`, `representante_poder_publico`, `politico` |
| `media` | Comunicação | Amplificação | Amplificam iniciativas, demandas e resultados | `imprensa`, `veiculo_comunicacao`, `jornalista` |

Previstos para versões futuras: investidores e financiadores (Parceiros) e
criadores de conteúdo (Comunicação).

## Permissões aplicadas

Visualizar, filtrar e acompanhar demandas, projetos, resultados e o mapa vale
para todos os perfis.

| Permissão | Agente | Membro | Parceiro | Poder Público | Comunicação |
| --- | :---: | :---: | :---: | :---: | :---: |
| `publish` — demandas, projetos, eventos e ações | ✓ | | | | |
| `update_results` — andamento, resultados e impacto | ✓ | | | | |
| `institutional_response` — respostas institucionais, programas e serviços | | | | ✓ | |
| `interact` — registrar atualizações e participar | ✓ | ✓ | ✓ | ✓ | ✓ |
| `share` — divulgar iniciativas | ✓ | ✓ | ✓ | ✓ | ✓ |
| `connect` — solicitar e receber conexões | ✓ | ✓ | ✓ | ✓ | ✓ |
| `express_interest` — demonstrar interesse | | ✓ | ✓ | ✓ | |
| `support` — apoiar projetos, oferecer recursos, produtos ou serviços | | ✓ | ✓ | ✓ | |
| `volunteer` — voluntariado e inscrição em eventos | | ✓ | | | |
| `ranking` — rankings de engajamento e impacto | | ✓ | ✓ | | ✓ |
| `agenda` — identificar pautas e registrar divulgação (T28) | | | | | ✓ |

O cadastro lista "Curtir/apoiar" como na fonte (§3.2). No produto, essa ação é
a marcação de apoio do card de sinal, sem ícone de coração ou polegar; as telas
do produto continuam sem a palavra "curtida" (`src/lib/app/language.test.mjs`).

Os Agentes de Transformação aparecem no ranking de impacto pelos projetos que
publicam e pelos apoios que recebem.

"Conversar com parceiros" é a conversa dentro da conexão (T27); "Identificar
pautas" e "Divulgar projetos e resultados" são as pautas da Comunicação (T28);
"o DM Conecta identifica potenciais parceiros" vale para o apoiador (T15) e
para o Agente (T30).

### Tipos de publicação por categoria

| Categoria | Tipos permitidos |
| --- | --- |
| Agentes de Transformação | Problema, Projeto, Necessidade, Evento, Ação, Mensagem |
| Poder Público | Mensagem (resposta institucional, programa, serviço ou oportunidade) |
| Membros, Parceiros, Comunicação | nenhum — atuam por apoio, conexão e divulgação |

### Formas de apoio

Membros, Parceiros e Poder Público oferecem qualquer forma de apoio. Agentes e
Comunicação contribuem com **Divulgação** (`sharing`).

## Governança

- Membros da Comunidade não publicam demandas ou projetos em nome de uma
  organização ou comunidade sem vínculo ou autorização. O **vínculo** existe
  (T29, `organization_members`): o titular do cadastro institucional convida
  contas com nível `gestor`, `publicador` ou `colaborador`, e a conta vinculada
  age em nome da instituição com as permissões do nível (delegação lida em
  `GET /me/institution/status`; papel efetivo em `lib/app/organization.ts` e
  `post-service/src/delegation.js`). Uma conta atua em nome de uma instituição
  por vez.
- O Poder Público não participa de ranking competitivo, preservando a
  neutralidade institucional; é acompanhado por indicadores de atuação,
  respostas, encaminhamentos e resultados.
- A Comunicação (papel `media`) conta no engajamento: entra em "Usuários mais
  ativos" e recebe o selo "Divulgador". Fica fora dos quadros de apoio
  ("Maiores apoiadores", "Empresas em destaque", "Maiores patrocinadores"),
  que são por apoio (decisão 18).
- A interface esconde o que o perfil não pode fazer; o `post-service` recusa com
  `403` publicações e apoios fora da permissão do perfil.

## Liberação por fases

| Fase | Categoria | Escopo |
| --- | --- | --- |
| 1 | Agentes de Transformação | cadastro, demandas, projetos, eventos, documentos, conexões e resultados |
| 1 | Poder Público | descoberta, filtros, interesse, conexão, acompanhamento territorial, respostas e encaminhamentos |
| 1/2 | Parceiros | descoberta, filtros, interesse e conexão |
| 2 | Membros da Comunidade | apoio, participação, voluntariado, eventos e interação |
| 2 | Comunicação | descoberta de pautas, conexão e amplificação |

Decisão 12 (`dm-docs/fonte-da-verdade/decisoes-de-implementacao.md`): a
arquitetura existe desde o início e todas as fases estão liberadas; nada fica
bloqueado por fase. Os perfis "futuramente" da fonte aparecem como "Em breve"
no cadastro e não são selecionáveis.

## Migração de dados

A estrutura anterior tinha 4 categorias. `services/*/migrations/002-perfis-5-categorias.sql`
converte bancos existentes:

| Antes | Depois |
| --- | --- |
| `community` (Conexão) | `agent` |
| `citizen` (Cidadão / Morador) | `member` |
| `partner` | `partner` |
| `institutional` + `imprensa` | `media` |
| `institutional` (demais) | `government` |

Sessões e tokens antigos continuam válidos: `normalizeRole` (web) e
`services/post-service/src/roles.js` convertem as chaves antigas, e o subperfil
prevalece sobre a categoria quando os dois existem.
