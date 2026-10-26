import type { Metadata } from "next";
import { Landing } from "@/components/praxism/Landing";

export const metadata: Metadata = {
  title: "Praxism — One move. Not the whole journey.",
  description: "Share your idea. Praxism picks the one next move, helps you do it, and learns from the result.",
};

export default function Page() {
  return <Landing />;
}
