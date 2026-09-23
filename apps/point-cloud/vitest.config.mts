import { fileURLToPath } from "node:url";

import { defineProject } from "vitest/config";

// The app's source uses the `@/` alias that `tsconfig.json` declares; vitest
// resolves modules itself and has to be told about it separately.
export default defineProject({
  test: { name: "point-cloud" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
