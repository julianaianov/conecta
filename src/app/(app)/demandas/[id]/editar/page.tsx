"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { DemandWizard } from "@/components/app/demand/DemandWizard";

export default function EditDemandPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando" /></div>}>
      {/* `key`: trocar de demanda recomeça o assistente. */}
      <DemandWizard key={id} demandId={id} />
    </Suspense>
  );
}
