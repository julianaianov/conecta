"use client";

import { Suspense } from "react";
import { DemandWizard } from "@/components/app/demand/DemandWizard";

export default function NewDemandPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando" /></div>}>
      <DemandWizard demandId={null} />
    </Suspense>
  );
}
