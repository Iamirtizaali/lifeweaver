import StoryPrintView from "@/components/lifeweaver/StoryPrintView";

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StoryPrintView storyId={id} />;
}
