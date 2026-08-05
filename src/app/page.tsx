import ChatInterface from "./components/ChatInterface";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string }>;
}) {
  const sp = await searchParams;
  return <ChatInterface chatId={sp.chat ?? null} />;
}
