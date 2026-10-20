/**
 * Press, release, pointer aim, and fisheye offsets for the hero.
 * No window, no Three.js. The landing script and the tests both call these.
 */

export const HOLD_VIEW = Object.freeze({
  fov: 11.133,
  aimEasing: 0.01,
  aimStrength: 0.025,
  aimStrengthHeld: 0.05,
  bloomStrength: 0.3,
  bloomRadius: -1.5,
  bloomThreshold: 0.43,
  timeScale: 1.3,
  camera2Delay: 0.3,
  fisheyeCoefficient: -2.07,
  aberrationX: 0.2,
  aberrationY: 0.2,
  globalAberration: 1,
  softness: 0.07,
  clipDuration: 11,
});

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

export const CAMERA2_BAKE_SECONDS = 3;
export const CAMERA2_BAKE_STEPS = 60;

export function introCamProgress(seconds) {
  const intro = Math.min(1, Math.max(0, seconds) / 2);
  return 1 - (1 - intro) ** 4;
}

export function stripScroll(scrollY, documentTop, elementHeight, viewportHeight) {
  if (!(viewportHeight > 0)) return 0;
  const top = Number.isFinite(documentTop) ? documentTop : 0;
  const height = Number.isFinite(elementHeight) ? elementHeight : 0;
  const y = Number.isFinite(scrollY) ? scrollY : 0;
  const start = top < viewportHeight ? 0 : top - viewportHeight;
  const end = top + height;
  if (!(end > start)) return y >= end ? 1 : 0;
  return clamp01((y - start) / (end - start));
}

export function cameraPose({ camProgress, scroll, camProgress2 }) {
  const glide = clamp01(scroll) * (1 - clamp01(camProgress2));
  return {
    x: glide * -0.05,
    y: 1 - camProgress - glide,
    yaw: glide * Math.PI * -0.05,
  };
}

export function contentHidden(state, reduceMotion) {
  if (reduceMotion === true) return false;
  return Boolean(state && (state.playing || state.camera2Tweening || state.fisheyeActive));
}

export function camera2Sample(frameCount, time, duration) {
  const count = frameCount > 0 ? Math.floor(frameCount) : 0;
  if (count <= 1 || !(duration > 0)) return { index: 0, next: 0, alpha: 0 };
  const clamped = Math.min(duration, Math.max(0, time));
  const scaled = (clamped / duration) * (count - 1);
  const index = Math.min(count - 1, Math.floor(scaled));
  const next = Math.min(count - 1, index + 1);
  return { index, next, alpha: scaled - index };
}

export function easePower2Out(amount) {
  const t = clamp01(amount);
  return 1 - (1 - t) ** 2;
}

export function easePower4Out(amount) {
  const t = clamp01(amount);
  return 1 - (1 - t) ** 4;
}

export function easePower2InOut(amount) {
  const t = clamp01(amount);
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

const EASES = {
  "power2.out": easePower2Out,
  "power4.out": easePower4Out,
  "power2.inOut": easePower2InOut,
};

export function holdListenersEnabled(reduceMotion) {
  return reduceMotion !== true;
}

export function createHoldState() {
  return {
    playing: false,
    paused: true,
    time: 0,
    camProgress2: 0,
    lineOpacity: 0,
    particlesOpacity: 1,
    camera2Time: 0,
    camera2Tweening: false,
    fisheyeRadius: 0,
    fisheyeActive: false,
    tweens: [],
  };
}

function dropTweens(tweens, names) {
  return tweens.filter((tween) => !names.has(tween.name));
}

function beginTween(name, from, to, duration, ease, delay = 0) {
  return { name, from, to, duration, ease, delay, elapsed: 0, done: false };
}

const DRIVEN = new Set([
  "camProgress2",
  "lineOpacity",
  "particlesOpacity",
  "time",
  "camera2Time",
  "fisheyeRadius",
]);

export function pressHold(state) {
  const tweens = dropTweens(state.tweens, DRIVEN);
  tweens.push(
    beginTween("camProgress2", state.camProgress2, 1, 2, "power2.out"),
    beginTween("lineOpacity", state.lineOpacity, 0.15, 1.5, "power2.inOut"),
    beginTween("particlesOpacity", state.particlesOpacity, 0, 10, "power2.out"),
  );
  return {
    ...state,
    playing: true,
    paused: false,
    time: 0,
    camera2Time: 0,
    camera2Tweening: false,
    fisheyeRadius: 0,
    fisheyeActive: false,
    tweens,
  };
}

export function releaseHold(state) {
  if (!state.playing) return state;
  const held = state.time;
  const tweens = dropTweens(state.tweens, DRIVEN);
  tweens.push(
    beginTween("time", held, Math.max(0, held - 1.5), 1.5, "power4.out"),
    beginTween("lineOpacity", state.lineOpacity, 0, 1.5, "power4.out"),
    beginTween("camera2Time", state.camera2Time, 0, 3, "power4.out"),
    beginTween("camProgress2", state.camProgress2, 0, 1.75, "power2.out", 0.3),
    beginTween("fisheyeRadius", 0, 1, 1.75, "power2.out", 0.3),
    beginTween("particlesOpacity", state.particlesOpacity, 1, 2, "power2.inOut"),
  );
  return {
    ...state,
    playing: false,
    paused: true,
    camera2Tweening: true,
    fisheyeRadius: 0,
    fisheyeActive: false,
    tweens,
  };
}

function advanceTween(tween, dt) {
  const elapsed = tween.elapsed + dt;
  const local = elapsed - tween.delay;
  if (local <= 0) {
    return { ...tween, elapsed, value: tween.from, done: false };
  }
  const amount = local / tween.duration;
  const done = amount >= 1 - 1e-9;
  const eased = EASES[tween.ease](done ? 1 : amount);
  const value = done ? tween.to : tween.from + (tween.to - tween.from) * eased;
  return { ...tween, elapsed, value, done };
}

export function stepHold(state, dt) {
  if (!(dt > 0)) return state;
  const next = {
    ...state,
    tweens: state.tweens.map((tween) => ({ ...tween })),
  };
  if (next.playing) {
    next.time = Math.min(HOLD_VIEW.clipDuration, next.time + dt * HOLD_VIEW.timeScale);
    if (!next.camera2Tweening) {
      next.camera2Time = Math.max(0, next.time - HOLD_VIEW.camera2Delay);
    }
  }
  let turnFisheyeOn = false;
  let fisheyeFinished = false;
  next.tweens = next.tweens.map((tween) => {
    const advanced = advanceTween(tween, dt);
    next[advanced.name] = advanced.value;
    if (advanced.name === "fisheyeRadius") {
      if (!tween.done && advanced.elapsed >= advanced.delay && !advanced.done) turnFisheyeOn = true;
      if (advanced.done && !tween.done) fisheyeFinished = true;
    }
    return advanced;
  });
  if (turnFisheyeOn) next.fisheyeActive = true;
  if (fisheyeFinished) {
    next.time = 0;
    next.paused = true;
    next.playing = false;
    next.fisheyeActive = false;
    next.fisheyeRadius = 0;
    next.camera2Tweening = false;
    next.tweens = next.tweens.filter((tween) => tween.name !== "time" && tween.name !== "fisheyeRadius");
  }
  return next;
}

export function pointerAim({
  mouseX,
  mouseY,
  particlesOpacity,
  clipProgress,
  aim,
  easing = HOLD_VIEW.aimEasing,
}) {
  const blend = particlesOpacity;
  const strengthX = HOLD_VIEW.aimStrengthHeld + (HOLD_VIEW.aimStrength - HOLD_VIEW.aimStrengthHeld) * blend;
  const strengthY = strengthX;
  const gate = Math.max(0.1, Math.abs(clipProgress - 1));
  const targetX = mouseX * gate * strengthX;
  const targetY = mouseY * gate * strengthY;
  return {
    x: aim.x + (targetX - aim.x) * easing,
    y: aim.y + (targetY - aim.y) * easing,
  };
}

export function fisheyeOffsets({ uv, radius, aspect }) {
  const dirX = uv[0] - 0.5;
  const dirY = uv[1] - 0.5;
  const radiusSquared = dirX * dirX + dirY * dirY;
  const k = HOLD_VIEW.fisheyeCoefficient * radius;
  const kR = k * (1 + HOLD_VIEW.aberrationX);
  const kB = k * (1 - HOLD_VIEW.aberrationX);
  const revealSplit = HOLD_VIEW.aberrationY * Math.sin(radius * Math.PI);
  return {
    k,
    kR,
    kB,
    revealSplit,
    aspect,
    stretched: [0.5 + dirX * (1 + k * radiusSquared), 0.5 + dirY * (1 + k * radiusSquared)],
    red: [0.5 + dirX * (1 + kR * radiusSquared), 0.5 + dirY * (1 + kR * radiusSquared)],
    blue: [0.5 + dirX * (1 + kB * radiusSquared), 0.5 + dirY * (1 + kB * radiusSquared)],
  };
}

export function fisheyeVertex() {
  return [
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = uv;",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
    "}",
  ].join("\n");
}

function glslFloat(value) {
  const text = String(value);
  return text.includes(".") ? text : `${text}.0`;
}

export function fisheyeFragment() {
  const softness = glslFloat(HOLD_VIEW.softness);
  const split = glslFloat(HOLD_VIEW.aberrationY);
  return [
    "uniform sampler2D tDiffuse;",
    "uniform sampler2D tReveal;",
    "uniform float uRadius;",
    "uniform float uStrength;",
    "uniform float uAspect;",
    "uniform float uTime;",
    "varying vec2 vUv;",
    "float hash21(vec2 p) {",
    "  vec3 p3 = fract(vec3(p.xyx) * 0.1031);",
    "  p3 += dot(p3, p3.yzx + 33.33);",
    "  return fract((p3.x + p3.y) * p3.z);",
    "}",
    "float noise2D(vec2 p) {",
    "  vec2 i = floor(p);",
    "  vec2 f = fract(p);",
    "  f = f * f * (3.0 - 2.0 * f);",
    "  float a = hash21(i);",
    "  float b = hash21(i + vec2(1.0, 0.0));",
    "  float c = hash21(i + vec2(0.0, 1.0));",
    "  float d = hash21(i + vec2(1.0, 1.0));",
    "  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);",
    "}",
    "void main() {",
    "  vec2 screenUv = vUv;",
    "  float n = noise2D(screenUv * 12.0);",
    "  float noiseOffset = (n - 0.5) * 0.1 * (1.0 - min(uRadius, 1.0));",
    "  float n2 = noise2D((screenUv + uTime * 0.14) * 5.2);",
    "  float noiseOffset2 = (n2 - 0.5) * 0.046 * (1.0 - min(uRadius, 1.0));",
    "  vec2 dir = screenUv - vec2(0.5);",
    "  vec2 centered = dir * vec2(uAspect, 1.0);",
    "  float cornerDist = 0.5 * sqrt(uAspect * uAspect + 1.0);",
    `  float maxDist = cornerDist + ${softness} + ${softness};`,
    "  float d = length(centered) / maxDist + noiseOffset;",
    `  float mask = smoothstep(uRadius - ${softness}, uRadius + ${softness}, d);`,
    "  float revealNoiseUv = noiseOffset2 * (1.0 - uRadius);",
    "  vec4 reveal = texture2D(tReveal, screenUv + revealNoiseUv);",
    "  float r2 = dot(dir, dir);",
    "  float k = -2.07 * uRadius;",
    "  float kR = k * 1.2;",
    "  float kB = k * 0.8;",
    "  vec2 stretchedUv = vec2(0.5) + dir * (1.0 + k * r2);",
    "  vec2 uvR = vec2(0.5) + dir * (1.0 + kR * r2);",
    "  vec2 uvB = vec2(0.5) + dir * (1.0 + kB * r2);",
    `  float abOnly = ${split} * sin(uRadius * 3.14159265);`,
    "  vec2 revealUvR = vec2(0.5) + dir * (1.0 + abOnly * r2) + revealNoiseUv;",
    "  vec2 revealUvB = vec2(0.5) + dir * (1.0 - abOnly * r2) + revealNoiseUv;",
    "  float rvR = texture2D(tReveal, revealUvR).r;",
    "  float rvG = texture2D(tReveal, screenUv + revealNoiseUv).g;",
    "  float rvB = texture2D(tReveal, revealUvB).b;",
    "  vec4 revealChromatic = vec4(rvR, rvG, rvB, 1.0);",
    "  vec4 finalReveal = mix(reveal, revealChromatic, 1.0);",
    "  float cr = texture2D(tDiffuse, uvR).r;",
    "  float cg = texture2D(tDiffuse, stretchedUv).g;",
    "  float cb = texture2D(tDiffuse, uvB).b;",
    "  vec4 distorted = vec4(cr, cg, cb, 1.0);",
    "  vec4 clean = texture2D(tDiffuse, screenUv);",
    "  vec4 masked = mix(clean, distorted, mask);",
    "  vec4 current = mix(masked, distorted, 1.0);",
    "  vec4 composited = mix(finalReveal, current, mask);",
    "  gl_FragColor = mix(clean, composited, uStrength);",
    "}",
  ].join("\n");
}

export function dotGrid(width) {
  const measured = Number.isFinite(width) ? width : 0;
  if (measured < 700) return { columns: 6, count: 24 };
  return { columns: 20, count: 100 };
}

export function dotIdleGap(random01) {
  const roll = random01();
  const unit = roll < 0 ? 0 : roll > 1 ? 1 : roll;
  return 800 + Math.floor(unit * 701);
}

export function pickIdleDots(dots, random01) {
  const list = dots.slice();
  const count = list.length;
  if (count === 0) return [];
  const want = Math.min(1 + Math.floor(random01() * 5), count);
  for (let index = count - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random01() * (index + 1));
    const swap = list[index];
    list[index] = list[swapIndex];
    list[swapIndex] = swap;
  }
  return list.slice(0, want);
}

export function pushDotTrail(queue, dot, max) {
  const next = queue.slice();
  const limit = max > 0 ? Math.floor(max) : 0;
  if (next.length > 0 && next[next.length - 1] === dot) {
    return { queue: next, dropped: null, added: false };
  }
  let dropped = null;
  while (limit > 0 && next.length >= limit) dropped = next.shift();
  if (limit === 0) return { queue: next, dropped, added: false };
  next.push(dot);
  return { queue: next, dropped, added: true };
}
