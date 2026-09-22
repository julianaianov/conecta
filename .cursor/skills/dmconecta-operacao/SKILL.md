---
name: dmconecta-operacao
description: Contrato de ambientes, configuração e verificação da aplicação web do DM Conecta.
---

# Operação da aplicação web

## Ambientes

| Ambiente | Plataforma | URL | Dados sintéticos |
| --- | --- | --- | --- |
| Local | Docker Compose | `localhost` | proibidos |
| Homologação | AWS | `https://homologacao.dmconecta.org` | proibidos |
| Produção | AWS + Cloudflare | `https://dmconecta.org` | proibida |

## Configuração

- Local: `NEXT_PUBLIC_RUNTIME_ENV=local`.
- Homologação: `NEXT_PUBLIC_RUNTIME_ENV=homologation`.
- Produção: `NEXT_PUBLIC_RUNTIME_ENV=production` e
  `NEXT_PUBLIC_API_URL=` para chamadas same-origin.
- Nenhum ambiente usa catálogo, seed ou fallback sintético. Em caso de
  indisponibilidade, a interface mostra erro ou estado vazio honesto.

## Verificação

```bash
npm ci
npm run test
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build
```

O `Dockerfile` gera a imagem standalone. A publicação é definida em
`dmconecta-infra` e usa ECR, S3 e SSM.
