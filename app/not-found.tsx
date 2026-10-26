import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center bg-background">
      <div className="shell">
        <p className="label text-fg-3">404</p>
        <h1 className="display mt-4 text-[64px] md:text-[96px]">Wrong move.</h1>
        <p className="mt-4 max-w-[64ch] text-fg-2">This page doesn't exist. Your next step is back home.</p>
        <Link href="/" className="btn-primary mt-8">Go home</Link>
      </div>
    </main>
  );
}
