"use client";

import { useParams } from "next/navigation";
import { InstitutionalDemandClient } from "@/components/app/institutional/InstitutionalDemandClient";

export default function InstitutionalDemandPage() {
  const { id } = useParams<{ id: string }>();
  return <InstitutionalDemandClient key={id} id={id} />;
}
