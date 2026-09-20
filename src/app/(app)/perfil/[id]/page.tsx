import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicProfile, getPublicPostsByAuthor } from "@/lib/server/public-data";
import { ProfileClient } from "@/components/app/public/ProfileClient";
import { publicContentMetadata } from "@/lib/seo/content-route-contract";
import { profileJsonLd } from "@/lib/seo/structured-data";
import { absoluteUrl } from "@/lib/seo/site";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  return publicContentMetadata(profile, `/perfil/${id}`);
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [profile, posts] = await Promise.all([
    getPublicProfile(id),
    getPublicPostsByAuthor(id),
  ]);

  if (!profile) notFound();

  const jsonLd = profileJsonLd(profile, absoluteUrl(`/perfil/${profile.userId}`));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProfileClient initialProfile={profile} initialPosts={posts} />
    </>
  );
}
