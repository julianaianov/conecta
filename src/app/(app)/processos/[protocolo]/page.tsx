import { ProcessDetailClient } from "@/components/app/process/ProcessDetailClient";

export default async function ProcessPage({ params }: { params: Promise<{ protocolo: string }> }) {
  const { protocolo } = await params;
  return <ProcessDetailClient protocol={decodeURIComponent(protocolo)} />;
}
