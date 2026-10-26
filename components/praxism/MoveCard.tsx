"use client";

import { useState } from "react";
import type { ActiveAction } from "@/lib/praxism/types";

export function MoveCard({ move, interactive = true }: { move: ActiveAction; interactive?: boolean }) {
  const [done, setDone] = useState<Record<number, boolean>>({});
  const a = move.action;
  return (
    <article className="border border-line bg-surface">
      <div className="p-6 md:p-10">
        <p className="label text-ember">Stage · {move.stage}</p>
        <h2 data-anno="action" className="display mt-4 text-[40px] md:text-[64px]">{a.title}</h2>
        <p className="mt-4 max-w-[64ch] text-fg-2">{a.summary}</p>

        {move.learning && (
          <div className="mt-8 border-l-2 border-sage pl-4">
            <p className="label text-sage">What your last result told us</p>
            <p className="mt-2 max-w-[64ch] text-[14px]">{move.learning}</p>
          </div>
        )}

        {move.blocker && (
          <div className="mt-8 grid gap-2 border-y border-line py-4 md:grid-cols-[180px_1fr]">
            <p className="label text-fg-3">Biggest unknown</p>
            <p className="text-[14px]">{move.blocker}</p>
          </div>
        )}

        <div data-anno="why" className="mt-8">
          <p className="label text-fg-3">Why now</p>
          <p className="mt-2 max-w-[64ch]">{a.reasoning}</p>
        </div>

        <div className="mt-8">
          <p className="label text-fg-3">The move</p>
          <ol className="mt-3 divide-y divide-line border-y border-line">
            {a.steps.map((s, i) => (
              <li key={i} className="flex gap-4 py-4">
                {interactive ? (
                  <input
                    type="checkbox"
                    aria-label={`Mark step ${i + 1} done`}
                    checked={!!done[i]}
                    onChange={(e) => setDone((d) => ({ ...d, [i]: e.target.checked }))}
                    className="mt-1 size-4 shrink-0 appearance-none border border-line-hover checked:border-ember checked:bg-ember"
                  />
                ) : null}
                <span className="label pt-1 text-fg-3">{String(i + 1).padStart(2, "0")}</span>
                <div className={done[i] ? "text-fg-3 line-through" : ""}>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-[14px] text-fg-2">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div data-anno="done" className="mt-8">
          <p className="label text-fg-3">Done when</p>
          <ul className="mt-3 space-y-2">
            {a.successCriteria.map((c) => (
              <li key={c} className="flex items-center gap-3 text-[14px]">
                <span className="size-2.5 shrink-0 border border-fg-2" aria-hidden /> {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="label border-t border-line px-6 py-4 text-fg-2 md:px-10">
        Time {a.estimatedTime} · Cost {a.estimatedCost}
      </p>
    </article>
  );
}
