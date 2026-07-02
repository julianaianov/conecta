"use client";

import { useParams } from "next/navigation";
import { OrkutProfile } from "@/components/app/OrkutProfile";

export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  return <OrkutProfile userId={id} />;
}
