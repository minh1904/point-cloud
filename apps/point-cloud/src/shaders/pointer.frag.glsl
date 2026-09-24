// The pointer simulation (P9.1).
//
// Everything the cloud does up to here is **stateless**: P4 recomputes the
// whole curl offset from `uTime` every frame, which is why changing a
// parameter mid-flight needs no reset and why nothing can drift out of sync.
//
// Interaction cannot work that way. "Push these particles aside and let them
// settle back" is a sentence about *history* — where a particle is now depends
// on where the pointer has been, not on what time it is. So this one effect
// keeps state, and it keeps it on the GPU.
//
// The state is a **displacement**, not a position. The home position still
// comes from the bundle's two byte textures exactly as it did in P3.3, and
// this texture only says how far each particle has been shoved away from it.
// Keeping it that way means the decode path, the bounds and the whole P3
// format stay untouched, and that switching the pointer off is just adding
// zero.
//
// One texel per particle, RGB = displacement in world units, and the texture
// is read at the same `aParticleUv` address the particle uses for everything
// else (P3.1).

#include <pc_decode>

varying vec2 vUv;

uniform sampler2D uPrevious;      // last frame's displacement
uniform sampler2D uPositionHigh;  // the bundle, to find this particle's home
uniform sampler2D uPositionLow;
uniform vec3 uBoundsMin;
uniform vec3 uBoundsMax;

uniform vec3 uPointer;    // where the pointer is, in world units
uniform float uActive;    // 0 while the pointer is off the cloud
uniform float uDelta;     // seconds since the last frame
uniform float uStrength;  // how hard the shove is
uniform float uRadius;    // how far it reaches, in world units
uniform float uRelax;     // how fast the displacement decays, per second
uniform float uSwirl;     // 0 pushes straight out, 1 pushes sideways
uniform float uAttract;   // 1 pulls instead of pushing

void main() {
  vec3 displacement = texture2D(uPrevious, vUv).xyz;
  vec3 home = pcDecodePosition(uPositionHigh, uPositionLow, vUv, uBoundsMin, uBoundsMax);

  // The force is measured from the particle's *home*, not from where it has
  // been pushed to. Measuring from the displaced position would let a particle
  // ride the front of the pointer indefinitely, accelerating as it went; from
  // home, the force is a property of the place, and the cloud opens a hole of
  // a predictable size.
  vec3 toHome = home - uPointer;
  float distance = length(toHome.xy);

  // Smooth to zero at the rim, so there is no visible circle where the effect
  // stops. Squared, because a linear falloff still reads as an edge.
  float falloff = smoothstep(uRadius, 0.0, distance);
  falloff *= falloff;

  vec2 direction = distance > 0.0001 ? toHome.xy / distance : vec2(0.0, 1.0);
  // Rotating the push by 90° turns it into a swirl: the particles circle the
  // pointer instead of fleeing it, which is the same trick that makes curl
  // noise circulate rather than pile up (P4.2).
  vec2 sideways = vec2(-direction.y, direction.x);
  direction = normalize(mix(direction, sideways, uSwirl) + 0.0001);

  float sign = mix(1.0, -1.0, uAttract);
  displacement.xy += direction * falloff * uStrength * sign * uActive * uDelta;

  // Exponential relaxation back to zero. `exp(-k * dt)` rather than
  // `1.0 - k * dt` so the result does not depend on the frame rate: at 30 fps
  // and at 120 fps a particle takes the same wall-clock time to come home.
  displacement *= exp(-uRelax * uDelta);

  // Far enough is far enough. Without a cap a pointer held still would push a
  // particle out of the frame and keep pushing.
  float reach = length(displacement.xy);
  if (reach > uRadius) displacement.xy *= uRadius / reach;

  gl_FragColor = vec4(displacement, 1.0);
}
