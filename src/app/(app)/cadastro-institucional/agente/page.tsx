import { Suspense } from "react";
import { InstitutionPageClient } from "@/components/app/institution/InstitutionPageClient";

export default function AgentInstitutionPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><span className="app-spinner" /></div>}>
      <InstitutionPageClient kind="agente_transformacao" />
    </Suspense>
  );
}
