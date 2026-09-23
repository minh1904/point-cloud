"use client";

import dynamic from "next/dynamic";

// WebGL only exists in the browser, so the canvas is never server-rendered —
// the same reason the studio loads its Stage this way.
//
// It also has to happen *here*, in a client component, and not inside the
// `<Canvas>` itself: `next/dynamic` is built on `React.lazy`, and a lazy
// boundary inside the R3F tree suspends everything under it, so the component
// being demonstrated never mounts and never loads a thing.
const EmbedDemo = dynamic(() => import("./embed-demo").then((m) => m.EmbedDemo), {
  ssr: false,
});

export function EmbedClient() {
  return <EmbedDemo />;
}
