import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfileClient } from "@/components/app/public/ProfileClient";
import { getPublicInstitution, getPublicPostsByAuthor, getPublicProfile, getPublicProfileActivity, getPublicProfileImpact } from "@/lib/server/public-data";
import { absoluteUrl } from "@/lib/seo/site";
import { profileJsonLd } from "@/lib/seo/structured-data";
import { publicContentMetadata } from "@/lib/seo/content-route-contract";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  return publicContentMetadata(profile ? { name: profile.name, description: profile.bio ?? undefined } : null, `/perfil/${encodeURIComponent(id)}`);
}

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [profile, posts, institution, impact, activity] = await Promise.all([
    getPublicProfile(id),
    getPublicPostsByAuthor(id),
    getPublicInstitution(id),
    // Selos de impacto social (T21) ou, para o Poder Público, indicadores de atuação.
    getPublicProfileImpact(id),
    // Atuação territorial: demandas, apoios recebidos e realizados (públicos).
    getPublicProfileActivity(id),
  ]);
  if (!profile) notFound();
  const url = absoluteUrl(`/perfil/${encodeURIComponent(profile.userId)}`);
  return (
    <>
      <ProfileClient initialProfile={profile} initialPosts={posts} initialInstitution={institution} initialImpact={impact} initialActivity={activity} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(profileJsonLd(profile, url)) }} />
    </>
  );
}
