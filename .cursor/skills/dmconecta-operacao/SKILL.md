---
name: dmconecta-operacao
description: Contrato de ambientes, configuração e verificação da aplicação web do DM Conecta.
---

# Operação da aplicação web

## Ambientes

| Ambiente | Plataforma | URL | Demo |
| --- | --- | --- | --- |
| Local | Docker Compose | `localhost` | permitida |
| Homologação | AWS | `https://homologacao.dmconecta.org` | permitida |
| Produção | AWS + Cloudflare | `https://dmconecta.org` | proibida |

## Configuração

- Local: `NEXT_PUBLIC_RUNTIME_ENV=local`.
- Homologação: `NEXT_PUBLIC_RUNTIME_ENV=homologation`.
- Produção: `NEXT_PUBLIC_RUNTIME_ENV=production` e
  `NEXT_PUBLIC_API_URL=` para chamadas same-origin.
- O catálogo em `src/lib/app/demo.ts` não pode ser usado como resposta de
  erro em produção.

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
