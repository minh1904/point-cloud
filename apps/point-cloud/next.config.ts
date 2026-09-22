import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next compiles them.
  transpilePackages: ["@atelier/ui"],
  turbopack: {
    rules: {
      // Shaders live in their own files and are imported as plain strings.
      // raw-loader emits `export default "<source>"`; the built-in `raw`
      // module type has no default export, so `import x from` gets undefined.
      "*.glsl": { loaders: ["raw-loader"], as: "*.js" },
    },
  },
};

export default nextConfig;
