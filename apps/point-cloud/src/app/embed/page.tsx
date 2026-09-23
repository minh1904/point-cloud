import { EmbedClient } from "./embed-client";

export const metadata = {
  title: "ParticleImage — embed demo",
};

/**
 * A page that uses the drop-in component the way a stranger's project would
 * (P8.6).
 *
 * It imports `@atelier/particle-image` and nothing else from this repo: no
 * store, no schema, no shader loader. If this page renders, the package is
 * genuinely self-contained — which is a claim worth checking rather than
 * believing.
 */
export default function Page() {
  return <EmbedClient />;
}
