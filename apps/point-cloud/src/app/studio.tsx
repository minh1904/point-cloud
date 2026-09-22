"use client";

import { Button } from "@atelier/ui";
import { useState } from "react";

import { Stage } from "@/scene/stage";

export function Studio() {
  const [spinning, setSpinning] = useState(true);

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <Stage spinning={spinning} />
      <div className="absolute top-3 left-3">
        <Button variant="secondary" onClick={() => setSpinning((s) => !s)}>
          {spinning ? "Pause" : "Spin"}
        </Button>
      </div>
    </main>
  );
}
