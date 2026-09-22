uniform sampler2D uScene;
uniform float uTime;
uniform float uInvert;
uniform float uVignette;
uniform float uChromaticAberration;
uniform float uGrain;

varying vec2 vUv;

float random(vec2 position) {
  return fract(sin(dot(position, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 centeredUv = vUv - 0.5;
  vec2 channelOffset = centeredUv * uChromaticAberration;

  vec4 centerSample = texture2D(uScene, vUv);
  vec4 sceneColor = vec4(
    texture2D(uScene, vUv + channelOffset).r,
    centerSample.g,
    texture2D(uScene, vUv - channelOffset).b,
    centerSample.a
  );

  float edge = smoothstep(0.2, 0.72, length(centeredUv));
  sceneColor.rgb *= 1.0 - edge * uVignette;

  float grainFrame = floor(uTime * 24.0);
  float noise = random(gl_FragCoord.xy + grainFrame) - 0.5;
  sceneColor.rgb += noise * uGrain;

  sceneColor.rgb = mix(sceneColor.rgb, vec3(1.0) - sceneColor.rgb, uInvert);
  gl_FragColor = sceneColor;

  // Keep post-processing in linear colour, then convert once for the screen.
  #include <colorspace_fragment>
}
