import { DossierVerifyForm } from "@/components/app/demand/DossierVerify";
import { DOSSIER_TITLE } from "@/lib/app/dossier";

/** Verificação do Dossiê da Demanda (T10): por SHA-256 ou pelo arquivo PDF. */
export default function DossierVerifyIndexPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Verificar dossiê</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          Confira se um {DOSSIER_TITLE} foi emitido pela plataforma DM Conecta.
        </p>
      </header>
      <DossierVerifyForm />
    </div>
  );
}
