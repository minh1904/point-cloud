import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next compiles them.
  transpilePackages: ["@atelier/ui", "@atelier/particle-image"],
  turbopack: {
    rules: {
      // Shaders live in their own files and are imported as plain strings.
      // raw-loader emits `export default "<source>"`; the built-in `raw`
      // module type has no default export, so `import x from` gets undefined.
      "*.glsl": { loaders: ["raw-loader"], as: "*.js" },
    },
  },

  /**
   * Cache headers for the data (P9.4).
   *
   * A bundle is around 680 KB of PNG and a colour grade is another few
   * hundred, and none of it ever changes for a given path — a different cloud
   * is a different directory. `immutable` tells the browser it need not even
   * send a revalidation request, which is the difference between a warm reload
   * costing nothing and costing four round trips.
   *
   * A year is the conventional maximum. It is safe here precisely because the
   * filename *is* the version: replacing a bundle in place would be the
   * mistake, not the caching.
   */
  async headers() {
    return [
      {
        source: "/:path(particles|luts)/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
