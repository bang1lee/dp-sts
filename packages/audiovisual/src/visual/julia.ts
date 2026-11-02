import type { Composition } from '../schema/composition.js';
import {
  frameState,
  type AudioFeatures,
  SILENCE,
} from '../timeline/features.js';

const vertex = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0., 1.); }`;
const fragment = `#version 300 es
precision highp float;
uniform vec2 resolution;
uniform vec2 julia;
uniform float zoom;
uniform float rotation;
uniform float hue;
uniform float light;
uniform int iterations;
out vec4 color;
void main() {
 vec2 p = (gl_FragCoord.xy - resolution * .5) / resolution.y * 3.0 / zoom;
 float co = cos(rotation), si = sin(rotation);
 vec2 z = mat2(co, -si, si, co) * p;
 float count = 0., trap = 100.;
 bool escaped = false;
 for (int i = 0; i < 192; i++) {
  if (i >= iterations) break;
  z = vec2(z.x*z.x-z.y*z.y, 2.*z.x*z.y) + julia;
  trap = min(trap, abs(length(z) - .55));
  count = float(i);
  if (dot(z,z) > 128.) { escaped = true; break; }
 }
 float smoothCount = escaped ? count + 1. - log2(max(.0001, log2(length(z)))) : float(iterations);
 float band = .5 + .5 * cos(smoothCount * .17 + hue * 6.283185);
 vec3 deep = vec3(.022,.073,.085), teal = vec3(.12,.53,.48), gold = vec3(.94,.76,.43);
 vec3 tone = mix(teal, gold, pow(band, 2.2));
 float depth = 1. - exp(-smoothCount * .028);
 vec3 rgb = mix(deep, tone, depth);
 rgb += vec3(.14,.2,.17) * exp(-trap * 22.) * .4;
 if (!escaped) rgb = mix(deep * .5, vec3(.12,.26,.23), exp(-trap * 32.) * .7);
 float vignette = 1. - .20 * smoothstep(.3, 1.8, length(p));
 color = vec4(pow(max(rgb * light * vignette, vec3(0.)), vec3(.87)), 1.);
}`;

export function createFractalRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error('WebGL2 is required for fractal rendering');
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(
        gl.getShaderInfoLog(shader) ?? 'Shader compilation failed',
      );
    return shader;
  };
  const vs = compile(gl.VERTEX_SHADER, vertex),
    fs = compile(gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? 'Shader linking failed');
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.DITHER);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  const uniforms = Object.fromEntries(
    [
      'resolution',
      'julia',
      'zoom',
      'rotation',
      'hue',
      'light',
      'iterations',
    ].map((name) => [name, gl.getUniformLocation(program, name)]),
  );
  const extension = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    backend: extension
      ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER)),
    draw(c: Composition, frame: number, feature: AudioFeatures = SILENCE) {
      if (gl.isContextLost()) throw new Error('WebGL context was lost');
      if (
        canvas.width !== c.render.width ||
        canvas.height !== c.render.height
      ) {
        canvas.width = c.render.width;
        canvas.height = c.render.height;
      }
      const state = frameState(c, frame, feature);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.uniform2f(uniforms['resolution'], canvas.width, canvas.height);
      gl.uniform2f(uniforms['julia'], state.cx, state.cy);
      gl.uniform1f(uniforms['zoom'], state.zoom);
      gl.uniform1f(uniforms['rotation'], state.rotation);
      gl.uniform1f(uniforms['hue'], state.hue);
      gl.uniform1f(uniforms['light'], state.light);
      gl.uniform1i(uniforms['iterations'], state.iterations);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.finish();
      if (gl.getError() !== gl.NO_ERROR)
        throw new Error('WebGL frame rendering failed');
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}
