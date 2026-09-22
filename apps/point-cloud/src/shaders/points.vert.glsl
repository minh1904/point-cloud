// P1.2 — a hand-written equivalent of THREE.PointsMaterial's vertex stage.
//
// ShaderMaterial prepends the built-ins used here: the `position` attribute
// and the `modelViewMatrix` / `projectionMatrix` uniforms.

uniform float uSize;  // point size in world units
uniform float uScale; // half the drawing-buffer height, in pixels

void main() {
  // Object space -> camera (view) space. The camera looks down -z,
  // so -mvPosition.z is the distance in front of it.
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  // View space -> clip space; the GPU then divides by w for perspective.
  gl_Position = projectionMatrix * mvPosition;

  // Points have no geometry for the projection to shrink, so perspective is
  // applied by hand: a world-sized point covers fewer pixels further away.
  gl_PointSize = uSize * (uScale / -mvPosition.z);
}
