"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center bg-background">
      <div className="shell">
        <p className="label text-fg-3">Error</p>
        <h1 className="display mt-4 text-[64px] md:text-[96px]">This page didn't load.</h1>
        <p className="mt-4 max-w-[64ch] text-fg-2">Try again, or go back home and start from there.</p>
        <div className="mt-8 flex gap-2">
          <button className="btn-primary" onClick={reset}>Try again</button>
          <a href="/" className="btn-ghost">Go home</a>
        </div>
      </div>
    </main>
  );
}
