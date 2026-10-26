import type { Metadata } from "next";
import { Suspense } from "react";
import { Workspace } from "@/components/praxism/Workspace";

export const metadata: Metadata = {
  title: "Praxism — Execution workspace",
  description: "Your current move, your mission log, and what Praxism knows about your idea.",
};

export default function Page() {
  // Workspace reads ?idea= from the URL, which Next.js requires inside a Suspense boundary.
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <Workspace />
    </Suspense>
  );
}
