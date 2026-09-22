import { DossierVerifyForm, DossierVerifyResult } from "@/components/app/demand/DossierVerify";
import { normalizeDossierHash } from "@/lib/app/dossier";
import { verifyDossierHash } from "@/lib/server/public-data";

/**
 * Resultado da verificação por SHA-256 (T10). O hash é o impresso no dossiê
 * (conteúdo) ou o do próprio arquivo PDF. Página fora do índice.
 */
export default async function DossierVerifyPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash: raw } = await params;
  const hash = normalizeDossierHash(decodeURIComponent(raw));
  const result = hash ? await verifyDossierHash(hash) : null;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Verificação do dossiê</h1>
      </header>
      <DossierVerifyResult hash={hash} raw={raw} result={result} />
      <DossierVerifyForm />
    </div>
  );
}
