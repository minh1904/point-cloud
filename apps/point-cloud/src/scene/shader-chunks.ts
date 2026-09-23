import { ShaderChunk } from "three";

import lut from "@/shaders/lut.glsl";
import noise from "@/shaders/noise.glsl";

/**
 * Makes `noise.glsl` available to any shader as `#include <pc_noise>`.
 *
 * GLSL has no import mechanism, and raw-loader hands us a plain string, so
 * sharing a function between shaders needs help. three.js resolves
 * `#include <name>` against `THREE.ShaderChunk` before compiling *any*
 * material, a ShaderMaterial included — it is the same machinery that lets
 * points.frag.glsl say `#include <colorspace_fragment>`.
 *
 * Registering is a module side effect, so importing this file is what turns it
 * on. The `pc_` prefix keeps the name clear of three's own chunks, which share
 * this one global namespace.
 */
// three types ShaderChunk with its own chunk names, so a new key needs the
// cast. The registry itself is a plain object and takes any name.
const registry = ShaderChunk as unknown as Record<string, string>;
registry.pc_noise = noise;
registry.pc_lut = lut;
