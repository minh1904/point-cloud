// The fullscreen quad of the pointer simulation (P9.1).
//
// Nothing to transform: the quad is already in clip space, two units across,
// so the position attribute passes straight through. All the work is in the
// fragment shader, which runs once per particle because the render target is
// exactly one texel per particle.

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
