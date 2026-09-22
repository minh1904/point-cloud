"use client";

import { Button } from "@atelier/ui";
import dynamic from "next/dynamic";
import { useState } from "react";

// WebGL only exists in the browser, so the canvas is never server-rendered:
// no empty markup to hydrate, and scene code may touch window freely.
const Stage = dynamic(() => import("@/scene/stage").then((m) => m.Stage), { ssr: false });

export function Studio() {
  const [spinning, setSpinning] = useState(true);

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <Stage spinning={spinning} />
      <div className="absolute top-3 left-3">
        <Button variant="outline" onClick={() => setSpinning((s) => !s)}>
          {spinning ? "Pause" : "Spin"}
        </Button>
      </div>
    </main>
  );
}
