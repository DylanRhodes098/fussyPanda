import { Suspense } from "react";
import type { Metadata } from "next";
import PhotoStudioApp from "@/components/photo-studio/PhotoStudioApp";
export const metadata: Metadata = {
  title: "Your photo chat | Fussy Panda",
  robots: { index: false, follow: false },
};
export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  return (
    <Suspense
      fallback={
        <p className="p-10" role="status">
          Loading your chat…
        </p>
      }
    >
      <PhotoStudioApp initialChatId={chatId} />
    </Suspense>
  );
}
