// Matches the `*.glsl` raw rule in next.config.ts.
declare module "*.glsl" {
  const source: string;
  export default source;
}
