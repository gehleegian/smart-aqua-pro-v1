import { useEffect, useRef } from 'react';

const VERTEX_SHADER = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform vec2 resolution;
uniform float time;
uniform float depth;

const float TAU = 6.28318530718;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

float caustics(vec2 uv, float t) {
  vec2 p = mod(uv * TAU, TAU) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float intensity = 0.005;
  for (int n = 0; n < 4; n++) {
    float phase = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(phase - i.x) + sin(phase + i.y), sin(phase - i.y) + cos(phase + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + phase) / intensity), p.y / (cos(i.y + phase) / intensity)));
  }
  c = 1.17 - pow(c / 4.0, 1.4);
  return pow(abs(c), 8.0);
}

float seabedHeight(float x, float scale, float offset) {
  return offset + (fbm(vec2(x * scale, offset * 9.0)) - 0.5) * 0.16;
}

vec3 bubbles(vec2 p, float aspect, float t) {
  vec3 color = vec3(0.0);
  for (int n = 0; n < 16; n++) {
    float id = float(n);
    float speed = 0.035 + hash(vec2(id, 1.3)) * 0.05;
    float radius = 0.003 + hash(vec2(id, 4.1)) * 0.009;
    float y = fract(t * speed + hash(vec2(id, 2.7))) * 1.25 - 0.1;
    float x = hash(vec2(id, 7.9)) * aspect + sin(t * 0.9 + id * 2.3 + y * 9.0) * 0.012;
    float d = length(p - vec2(x, y));
    float rim = smoothstep(radius, radius * 0.75, d) - smoothstep(radius * 0.75, radius * 0.45, d);
    float glint = smoothstep(radius * 0.32, 0.0, length(p - vec2(x - radius * 0.35, y + radius * 0.35)));
    color += vec3(0.62, 0.92, 0.95) * (rim * 0.42 + glint * 0.75);
  }
  return color;
}

float marineSnow(vec2 p, float t) {
  float total = 0.0;
  for (int layer = 0; layer < 3; layer++) {
    float scale = 16.0 + float(layer) * 13.0;
    vec2 q = p * scale + vec2(sin(t * 0.08 + float(layer)) * 0.8, t * (0.1 + float(layer) * 0.04));
    vec2 cell = floor(q);
    vec2 local = fract(q) - 0.5;
    vec2 jitter = vec2(hash(cell), hash(cell + 3.7)) - 0.5;
    float visible = step(0.82, hash(cell + 9.1));
    total += visible * smoothstep(0.07, 0.0, length(local - jitter * 0.7)) * (0.34 - float(layer) * 0.08);
  }
  return total;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  float aspect = resolution.x / resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = time;

  vec3 deep = vec3(0.012, 0.075, 0.115);
  vec3 middle = vec3(0.025, 0.25, 0.32);
  vec3 shallow = vec3(0.16, 0.62, 0.66);
  vec3 color = mix(deep, middle, smoothstep(0.0, 0.62, uv.y));
  color = mix(color, shallow, smoothstep(0.58, 1.0, uv.y) * 0.8);

  vec2 sun = vec2(aspect * 0.58 + sin(t * 0.05) * 0.06, 1.28);
  vec2 toSun = p - sun;
  float angle = atan(toSun.x, -toSun.y);
  float shafts = noise(vec2(angle * 11.0 + t * 0.06, t * 0.04));
  shafts *= 0.45 + 0.75 * noise(vec2(angle * 27.0 - t * 0.09, t * 0.07 + 4.0));
  shafts = pow(shafts, 1.7);
  float shaftFade = smoothstep(0.08, 1.0, uv.y) * smoothstep(1.75, 0.3, length(toSun));
  color += vec3(0.42, 0.8, 0.78) * shafts * shaftFade * 1.15;

  float ripple = fbm(vec2(p.x * 4.5 + t * 0.09, t * 0.13)) - 0.5;
  float surface = smoothstep(0.86 + ripple * 0.12, 1.02, uv.y);
  color += vec3(0.5, 0.9, 0.88) * surface * 0.42;
  color += vec3(0.7, 0.96, 0.92) * caustics(vec2(p.x * 1.4, uv.y * 3.5 + t * 0.02), t * 0.55) * surface * 0.4;

  color += vec3(0.08, 0.26, 0.26) * caustics(p * 0.8, t * 0.32) * smoothstep(0.1, 0.8, uv.y) * 0.5;

  float farRidge = seabedHeight(p.x + 2.0, 1.4, 0.3);
  color = mix(color, vec3(0.018, 0.14, 0.19), smoothstep(farRidge + 0.012, farRidge - 0.012, uv.y) * 0.72);

  float midRidge = seabedHeight(p.x + 7.0, 2.3, 0.21);
  color = mix(color, vec3(0.012, 0.095, 0.13), smoothstep(midRidge + 0.008, midRidge - 0.008, uv.y) * 0.9);

  float floorLine = seabedHeight(p.x, 3.2, 0.13);
  float onFloor = smoothstep(floorLine + 0.005, floorLine - 0.005, uv.y);
  if (onFloor > 0.0) {
    float depth = clamp((floorLine - uv.y) / max(floorLine, 0.001), 0.0, 1.0);
    vec2 floorUv = vec2(p.x * (1.0 + depth * 0.7), depth * 2.3 + 1.0);
    float grain = fbm(floorUv * vec2(12.0, 22.0));
    float dunes = fbm(floorUv * vec2(2.2, 5.0) + 3.0);
    vec3 sand = mix(vec3(0.05, 0.18, 0.2), vec3(0.17, 0.37, 0.36), dunes * 0.72 + grain * 0.36);
    sand += vec3(0.42, 0.72, 0.66) * caustics(floorUv * 1.05, t * 0.5) * 0.9;
    sand *= 0.52 + depth * 0.48;
    color = mix(color, sand, onFloor);
  }

  color += vec3(0.56, 0.86, 0.86) * marineSnow(p, t);
  color += bubbles(p, aspect, t);

  color = mix(color, color * vec3(0.3, 0.42, 0.5), depth);

  vec2 centered = uv - 0.5;
  color *= 1.0 - dot(centered, centered) * 0.85;
  gl_FragColor = vec4(color, 1.0);
}
`;

const RENDER_SCALE = 0.75;
const FRAME_INTERVAL_MS = 1000 / 30;
const STILL_FRAME_SECONDS = 24;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);

  if (!shader) {
    return null;
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Underwater shader failed to compile:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();

  if (!vertexShader || !fragmentShader || !program) {
    return null;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

/**
 * Decorative animated seascape. Without WebGL the page's own background shows.
 * With descendOnScroll, the water darkens as the page scrolls down.
 */
export default function UnderwaterBackground({
  descendOnScroll = false,
}: {
  descendOnScroll?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl', { antialias: false, alpha: false }) ?? null;

    if (!canvas || !gl) {
      return;
    }

    const program = createProgram(gl);

    if (!program) {
      return;
    }

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resolutionUniform = gl.getUniformLocation(program, 'resolution');
    const timeUniform = gl.getUniformLocation(program, 'time');
    const depthUniform = gl.getUniformLocation(program, 'depth');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const startedAt = performance.now();
    let frameId = 0;
    let lastFrameAt = 0;

    const readDepth = () => {
      if (!descendOnScroll) {
        return 0;
      }

      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      return scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0;
    };

    const draw = (seconds: number) => {
      gl.uniform2f(resolutionUniform, canvas.width, canvas.height);
      gl.uniform1f(depthUniform, readDepth());
      gl.uniform1f(timeUniform, seconds);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const resize = () => {
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * RENDER_SCALE));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * RENDER_SCALE));
      gl.viewport(0, 0, canvas.width, canvas.height);

      if (reducedMotion) {
        draw(STILL_FRAME_SECONDS);
      }
    };

    const animate = (now: number) => {
      frameId = window.requestAnimationFrame(animate);

      if (document.hidden || now - lastFrameAt < FRAME_INTERVAL_MS) {
        return;
      }

      lastFrameAt = now;
      draw((now - startedAt) / 1000);
    };

    const drawStill = () => draw(STILL_FRAME_SECONDS);
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    if (reducedMotion) {
      window.addEventListener('scroll', drawStill, { passive: true });
    }

    if (!reducedMotion) {
      frameId = window.requestAnimationFrame(animate);
    }

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener('scroll', drawStill);
    };
  }, [descendOnScroll]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 h-full w-full"
    />
  );
}
