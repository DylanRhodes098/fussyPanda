import { Suspense } from "react";
import type { Metadata } from "next";
import PhotoStudioApp from "@/components/photo-studio/PhotoStudioApp";
export const metadata: Metadata = {
  title: "Photo Studio | Fussy Panda",
  robots: { index: false, follow: false },
};
export default function PhotoStudioPage() {
  return (
    <Suspense
      fallback={
        <p className="p-10" role="status">
          Loading Photo Studio…
        </p>
      }
    >
      <PhotoStudioApp />
    </Suspense>
  );
}
