import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPost, getPublicComments, getPublicSupports } from "@/lib/server/public-data";
import { PostDetailClient } from "@/components/app/public/PostDetailClient";
import { publicContentMetadata } from "@/lib/seo/content-route-contract";
import { postJsonLd } from "@/lib/seo/structured-data";
import { absoluteUrl } from "@/lib/seo/site";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await getPublicPost(id);
  return publicContentMetadata(post, `/post/${id}`);
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [post, comments, supports] = await Promise.all([
    getPublicPost(id),
    getPublicComments(id),
    getPublicSupports(id),
  ]);

  if (!post) notFound();

  const jsonLd = postJsonLd(post, absoluteUrl(`/post/${post.id}`));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PostDetailClient
        initialPost={post}
        initialComments={comments}
        initialSupports={supports}
      />
    </>
  );
}
