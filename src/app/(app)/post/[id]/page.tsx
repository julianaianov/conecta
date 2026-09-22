import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostDetailClient } from "@/components/app/public/PostDetailClient";
import { getPublicComments, getPublicPost, getPublicSupports } from "@/lib/server/public-data";
import { absoluteUrl } from "@/lib/seo/site";
import { postJsonLd } from "@/lib/seo/structured-data";
import { publicContentMetadata } from "@/lib/seo/content-route-contract";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const post = await getPublicPost(id);
  return publicContentMetadata(post ? { title: post.title, description: post.description } : null, `/post/${encodeURIComponent(id)}`);
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [post, comments, supports] = await Promise.all([
    getPublicPost(id),
    getPublicComments(id),
    getPublicSupports(id),
  ]);
  if (!post) notFound();
  const url = absoluteUrl(`/post/${encodeURIComponent(post.id)}`);
  return (
    <>
      <PostDetailClient initialPost={post} initialComments={comments} initialSupports={supports} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(postJsonLd(post, url)) }} />
    </>
  );
}
