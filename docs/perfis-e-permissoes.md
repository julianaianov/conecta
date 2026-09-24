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
| `ranking` — ranking de apoiadores e impacto | | ✓ | ✓ | | |

O cadastro lista "Curtir/apoiar" como na fonte (§3.2). No produto, essa ação é
a marcação de apoio do card de sinal, sem ícone de coração ou polegar; as telas
do produto continuam sem a palavra "curtida" (`src/lib/app/language.test.mjs`).

Os Agentes de Transformação aparecem no ranking de impacto pelos projetos que
publicam e pelos apoios que recebem.

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
  organização ou comunidade sem vínculo ou autorização. O vínculo de usuários a
  organizações, com permissões delegadas, está previsto para versões futuras.
- Poder Público e Comunicação não participam do ranking competitivo de
  apoiadores, preservando a neutralidade institucional. O Poder Público é
  acompanhado por indicadores de atuação, respostas, encaminhamentos e
  resultados.
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

> TODO(fonte-da-verdade): Arquitetura de Perfis §5 x §8 — o fluxo do ecossistema (§5) conta com
> apoio da comunidade e amplificação pela Comunicação desde o ciclo principal, enquanto a
> estrutura do MVP (§8) libera Membros e Comunicação só na Fase 2; a fonte é contraditória e
> precisa de decisão.

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
