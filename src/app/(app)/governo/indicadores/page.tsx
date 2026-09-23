import { GovernmentIndicators } from "@/components/app/government/GovernmentIndicators";
import { GovernmentAiReport } from "@/components/app/ai/GovernmentAiReport";

/** Painel de indicadores do órgão (T22). Privado e fora do índice (layout do /governo). */
export default function GovernmentIndicatorsPage() {
  return (
    <>
      <GovernmentIndicators />
      {/* Geração de relatórios para governo (T23): rascunho sugerido por IA
          sobre os mesmos indicadores, sempre com os números ao lado. */}
      <div className="mt-4">
        <GovernmentAiReport />
      </div>
    </>
  );
}
