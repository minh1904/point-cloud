uniform sampler2D uScene;
uniform float uInvert;

varying vec2 vUv;

void main() {
  vec4 sceneColor = texture2D(uScene, vUv);
  sceneColor.rgb = mix(sceneColor.rgb, vec3(1.0) - sceneColor.rgb, uInvert);
  gl_FragColor = sceneColor;

  // Keep post-processing in linear colour, then convert once for the screen.
  #include <colorspace_fragment>
}
