import assert from "node:assert/strict";
import test from "node:test";
import { renderLanding } from "../src/landing.js";
import {
  HOLD_VIEW,
  createHoldState,
  pressHold,
  releaseHold,
  stepHold,
  pointerAim,
  holdListenersEnabled,
  fisheyeOffsets,
  fisheyeFragment,
  easePower2Out,
  easePower4Out,
  easePower2InOut,
  introCamProgress,
  stripScroll,
  cameraPose,
  contentHidden,
  camera2Sample,
  dotGrid,
  dotIdleGap,
  pickIdleDots,
  pushDotTrail,
  CAMERA2_BAKE_SECONDS,
  CAMERA2_BAKE_STEPS,
} from "../src/hold.js";

test("the landing shows the meeting and does not post", () => {
  const html = renderLanding();
  assert.equal((html.match(/Linear/g) || []).length, 1);
  assert.equal((html.match(/Mina/g) || []).length, 3);
  assert.equal((html.match(/Jules/g) || []).length, 1);
  assert.match(html, /Keep the decision/);
  assert.match(html, /The upload fails twice in standup/);
  assert.match(html, /A question files nothing/);
  assert.match(html, /Yes files one task/);
  assert.match(html, /Ask from the agent you already use/);
  assert.match(html, /what did we lock for the retry, and where is the note\?/);
  assert.match(html, /Mina owns it\. The cap is three\. The note is pricing\.pdf, from Friday's announcement\./);
  assert.match(html, /I have not filed it\. Say yes and I will file that one task\./);
  assert.match(html, /any agent that speaks MCP/);
  assert.match(html, /Newest does not win/);
  assert.match(html, /The later name does not erase the earlier one/);
  assert.doesNotMatch(html, /offsite|Da Nang|Hoi An|venue|hall/i);
  assert.doesNotMatch(html, /\/media\//);
  assert.doesNotMatch(html, /Status/);
  assert.doesNotMatch(html, /Allow is off/);
  assert.doesNotMatch(html, /This read created nothing/);
  assert.doesNotMatch(html, /Mina takes the upload retry/);
  assert.doesNotMatch(html, /In the call/);
  assert.doesNotMatch(html, /<dl/);
  assert.match(html, /href="\/record"/);
  assert.match(html, /animation-timeline: view\(\)/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /id="field"/);
  assert.match(html, /three@0\.183\.0\/build\/three\.module\.js/);
  assert.match(html, /UnrealBloomPass/);
  assert.match(html, /RoomEnvironment/);
  assert.match(html, /GLTFLoader/);
  assert.match(html, /DRACOLoader/);
  assert.match(html, /\/models\/CEREBRIUM_part1_11_optimization\.glb/);
  assert.match(html, /\/models\/CEREBRIUM_part2_4_optimization\.glb/);
  assert.match(html, /MeshStandardMaterial/);
  assert.match(html, /Click and hold/);
  assert.match(html, /pointermove/);
  assert.doesNotMatch(html, /TorusGeometry/);
  assert.ok(html.indexOf("Keep the decision") < html.indexOf("who has it?"));
  assert.ok(html.indexOf("who has it?") < html.indexOf("Newest does not win"));
  assert.ok(html.indexOf("Newest does not win") < html.indexOf("A question files nothing"));
  assert.doesNotMatch(html, /<form/);
  assert.doesNotMatch(html, /<button/);
  assert.doesNotMatch(html, /0x/);
  assert.doesNotMatch(html, /ROW-/);
  assert.doesNotMatch(html, /<h2>[^<]*Linear/);
  assert.match(html, /from "\/hold\.js"/);
  assert.match(html, /pointerdown/);
  assert.match(html, /pointerup/);
  assert.match(html, /pointercancel/);
  assert.match(html, /pressHold\(hold\)/);
  assert.match(html, /releaseHold\(hold\)/);
  assert.match(html, /holdListenersEnabled\(reduce\)/);
  assert.match(html, /if \(!reduce\) hold = stepHold/);
  const seek = html.indexOf("mixer.setTime(Math.min(hold.time, clipDuration))");
  const aimWrite = html.indexOf("cameraParent.rotation.set");
  assert.ok(seek !== -1 && seek < aimWrite);
  assert.match(html, /cameraPose\(\{ camProgress, scroll: scrollY, camProgress2: hold\.camProgress2 \}\)/);
  assert.match(html, /cameraParent\.position\.y = pose\.y/);
  assert.doesNotMatch(html, /glide \* 0\.7/);
  assert.doesNotMatch(html, /camProgress2 \* 1\.45/);
  assert.match(html, /ReinhardToneMapping/);
  assert.match(html, /toneMapping = THREE\.ReinhardToneMapping/);
  assert.match(html, /toneMappingExposure = 1/);
  assert.match(html, /scene\.environmentIntensity = 0\.12/);
  assert.match(html, /HOLD_VIEW\.bloomStrength/);
  assert.match(html, /HOLD_VIEW\.bloomRadius/);
  assert.match(html, /HOLD_VIEW\.bloomThreshold/);
  assert.match(html, /CAMERA2_BAKE_SECONDS/);
  assert.match(html, /CAMERA2_BAKE_STEPS/);
  assert.match(html, /stripScroll\(scrollY, rect\.top \+ scrollY, rect\.height, window\.innerHeight\)/);
  assert.match(html, /querySelector\("\.stage"\)/);
  assert.match(html, /padding-bottom: 72px/);
  assert.match(html, /margin-top: -60px/);
  assert.match(html, /grid-template-columns: repeat\(20, 1fr\)/);
  assert.equal((html.match(/<span><\/span>/g) || []).length, 100);
  assert.match(html, /OutputPass/);
  assert.match(html, /#000000/i);
  assert.match(html, /#2D0B23/i);
  assert.match(html, /0\.2,\s*0\.77/);
  assert.match(html, /uOffset: \{ value: 0\.08 \}/);
  assert.match(html, /uSoftness: \{ value: 0\.95 \}/);
  assert.match(html, /uSpread: \{ value: 6\.6 \}/);
  assert.match(html, /uNoiseAmount: \{ value: 0\.05 \}/);
  assert.match(html, /uNoiseScale: \{ value: 11\.68 \}/);
  assert.match(html, /uDither: \{ value: 1\.34 \}/);
  assert.match(html, /uOpacity: \{ value: 1 \}/);
  assert.match(html, /scene\.background = backdropTarget\.texture/);
  assert.match(html, /camera2Sample\(/);
  assert.match(html, /contentHidden\(hold, reduce\)/);
  assert.match(html, /stripScroll\(/);
  assert.doesNotMatch(html, /min-height:\s*58vh/);
  assert.doesNotMatch(html, /min-height:\s*100svh;\s*display:\s*flex;\s*flex-direction:\s*column;\s*justify-content:\s*space-between/);
  assert.doesNotMatch(html, /hero::after/);
  assert.doesNotMatch(html, /rgba\(5,\s*0,\s*3,\s*0\.72\)/);
  assert.match(html, /#050003/i);
  assert.match(html, /0\.23,\s*0,\s*0\.12/);
  assert.match(html, /pathLightColor = new THREE\.Color\(0\.99, 0\.82, 1\)/);
  assert.match(html, /new THREE\.Color\(1, 0\.5, 0\.97\), 6/);
  assert.match(html, /#ff9ee5/i);
  assert.match(html, /#f5a3de/i);
  assert.doesNotMatch(html, /#071018/i);
  assert.doesNotMatch(html, /#04070f/i);
  assert.doesNotMatch(html, /#16305c/i);
  assert.doesNotMatch(html, /#f4efe4/i);
  assert.doesNotMatch(html, /#5d6c80/i);
  assert.doesNotMatch(html, /0\.93,\s*0\.52,\s*0\.96/);
  assert.doesNotMatch(html, /327683/);
});

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} vs ${expected}`);

test("hold eases match the power curves at the ends and the middle", () => {
  for (const ease of [easePower2Out, easePower4Out, easePower2InOut]) {
    near(ease(0), 0);
    near(ease(1), 1);
  }
  near(easePower2Out(0.25), 1 - 0.75 ** 2);
  near(easePower2Out(0.5), 0.75);
  near(easePower4Out(0.5), 1 - 0.5 ** 4);
  near(easePower2InOut(0.25), 0.125);
  near(easePower2InOut(0.75), 0.875);
});

test("press and release follow the hold timeline from rest", () => {
  assert.equal(HOLD_VIEW.fov, 11.133);
  assert.equal(HOLD_VIEW.bloomStrength, 0.3);
  assert.equal(HOLD_VIEW.bloomRadius, -1.5);
  assert.equal(HOLD_VIEW.bloomThreshold, 0.43);
  assert.equal(HOLD_VIEW.aimEasing, 0.01);
  assert.equal(HOLD_VIEW.aimStrength, 0.025);
  assert.equal(HOLD_VIEW.aimStrengthHeld, 0.05);
  assert.equal(HOLD_VIEW.fisheyeCoefficient, -2.07);
  assert.equal(holdListenersEnabled(true), false);
  assert.equal(holdListenersEnabled(false), true);

  let state = pressHold(createHoldState());
  assert.equal(state.playing, true);
  assert.equal(state.paused, false);
  assert.equal(state.time, 0);
  assert.equal(state.fisheyeRadius, 0);
  assert.equal(state.fisheyeActive, false);

  state = stepHold(state, 1);
  near(state.camProgress2, easePower2Out(0.5));
  near(state.lineOpacity, 0.15 * easePower2InOut(1 / 1.5));
  near(state.particlesOpacity, 1 - easePower2Out(0.1));
  near(state.time, HOLD_VIEW.timeScale);

  state = stepHold(state, 1);
  near(state.time, 2 * HOLD_VIEW.timeScale);
  near(state.camProgress2, 1);
  near(state.lineOpacity, 0.15);
  near(state.camera2Time, Math.max(0, state.time - HOLD_VIEW.camera2Delay));
  const held = state.time;

  state = releaseHold(state);
  assert.equal(state.playing, false);
  assert.equal(state.paused, true);
  assert.equal(state.fisheyeActive, false);
  assert.equal(state.time, held);

  state = stepHold(state, 0.3);
  assert.equal(state.fisheyeActive, true);
  near(state.fisheyeRadius, 0);
  near(state.camProgress2, 1);

  state = stepHold(state, 1.2);
  near(state.time, Math.max(0, held - 1.5));
  near(state.lineOpacity, 0);
  near(state.camera2Time, Math.max(0, held - HOLD_VIEW.camera2Delay) * (1 - easePower4Out(1.5 / 3)));
  near(state.camProgress2, 1 - easePower2Out(1.2 / 1.75));
  near(state.fisheyeRadius, easePower2Out(1.2 / 1.75));
  assert.equal(state.fisheyeActive, true);

  state = stepHold(state, 0.56);
  assert.equal(state.time, 0);
  assert.equal(state.paused, true);
  assert.equal(state.playing, false);
  assert.equal(state.fisheyeActive, false);
  assert.equal(state.fisheyeRadius, 0);

  state = stepHold(state, 0.016);
  assert.equal(state.time, 0);
  assert.equal(state.paused, true);
  assert.equal(state.playing, false);
  assert.equal(state.fisheyeActive, false);
  assert.equal(state.fisheyeRadius, 0);

  const again = pressHold(stepHold(releaseHold(stepHold(pressHold(createHoldState()), 1)), 0.5));
  assert.equal(again.playing, true);
  assert.equal(again.time, 0);
  assert.equal(again.fisheyeActive, false);
  assert.equal(again.fisheyeRadius, 0);
  assert.deepEqual(releaseHold(createHoldState()), createHoldState());
});

test("pointer aim and fisheye offsets use the home coefficients", () => {
  const idle = pointerAim({
    mouseX: 1,
    mouseY: -1,
    particlesOpacity: 1,
    clipProgress: 0,
    aim: { x: 0, y: 0 },
  });
  near(idle.x, 0.025 * 0.01);
  near(idle.y, -0.025 * 0.01);

  const held = pointerAim({
    mouseX: 1,
    mouseY: 1,
    particlesOpacity: 0,
    clipProgress: 1,
    aim: { x: 0, y: 0 },
  });
  near(held.x, 0.05 * 0.1 * 0.01);
  near(held.y, 0.05 * 0.1 * 0.01);

  const radius = 0.4;
  const aspect = 1.62;
  const uv = [0.8, 0.3];
  const sample = fisheyeOffsets({ uv, radius, aspect });
  near(sample.k, -2.07 * radius);
  near(sample.kR, sample.k * 1.2);
  near(sample.kB, sample.k * 0.8);
  near(sample.revealSplit, 0.2 * Math.sin(radius * Math.PI));
  assert.equal(sample.aspect, aspect);
  const dirX = uv[0] - 0.5;
  const dirY = uv[1] - 0.5;
  const r2 = dirX * dirX + dirY * dirY;
  near(sample.red[0], 0.5 + dirX * (1 + sample.kR * r2));
  near(sample.blue[1], 0.5 + dirY * (1 + sample.kB * r2));
  const fragment = fisheyeFragment();
  assert.match(fragment, /-2\.07 \* uRadius/);
  assert.match(fragment, /0\.07/);
  assert.match(fragment, /mix\(masked, distorted, 1\.0\)/);
  assert.equal(HOLD_VIEW.aberrationX, 0.2);
  assert.equal(HOLD_VIEW.aberrationY, 0.2);
  assert.equal(HOLD_VIEW.globalAberration, 1);
  assert.equal(HOLD_VIEW.softness, 0.07);
});

test("rest pose, name-strip scroll, content visibility, and camera2 sample match the home scene", () => {
  near(introCamProgress(0), 0);
  near(introCamProgress(2), 1);
  near(introCamProgress(1), 1 - 0.5 ** 4);

  const idle = cameraPose({ camProgress: 1, scroll: 0, camProgress2: 0 });
  near(idle.x, 0);
  near(idle.y, 0);
  near(idle.yaw, 0);

  const full = cameraPose({ camProgress: 1, scroll: 1, camProgress2: 0 });
  near(full.x, -0.05);
  near(full.y, -1);
  near(full.yaw, Math.PI * -0.05);

  const held = cameraPose({ camProgress: 1, scroll: 1, camProgress2: 1 });
  near(held.x, 0);
  near(held.y, 0);
  near(held.yaw, 0);

  near(stripScroll(0, 0, 1534, 864), 0);
  near(stripScroll(1534, 0, 1534, 864), 1);
  near(stripScroll(767, 0, 1534, 864), 767 / 1534);
  near(stripScroll(913, 0, 1534, 864), 913 / 1534);
  near(stripScroll(10, 0, 100, 0), 0);
  near(stripScroll(1200, 2000, 400, 800), 0);
  near(stripScroll(1800, 2000, 400, 800), 600 / 1200);
  near(stripScroll(2400, 2000, 400, 800), 1);

  const html = renderLanding();
  assert.match(html, /html\.is-scene \.stage/);
  assert.match(html, /html\.is-scene \.sheet/);
  assert.doesNotMatch(html, /\.stage\s*,\s*\.sheet\s*\{[^}]*opacity/);
  assert.doesNotMatch(html, /\.sheet\s*,\s*\.stage\s*\{[^}]*opacity/);
  assert.doesNotMatch(html, /(?:^|[,\s])\.stage\s*\{[^}]*transition\s*:[^;}]*opacity/);
  assert.doesNotMatch(html, /(?:^|[,\s])\.sheet\s*\{[^}]*transition\s*:[^;}]*opacity/);

  const rest = createHoldState();
  assert.equal(contentHidden(rest, false), false);
  assert.equal(contentHidden(pressHold(rest), true), false);
  const playing = pressHold(rest);
  assert.equal(contentHidden(playing, false), true);
  let released = releaseHold(playing);
  assert.equal(contentHidden(released, false), true);
  released = stepHold(released, 0.3);
  assert.equal(released.fisheyeActive, true);
  assert.equal(contentHidden(released, false), true);
  released = stepHold(released, 1.75);
  assert.equal(released.time, 0);
  assert.equal(released.playing, false);
  assert.equal(released.fisheyeActive, false);
  assert.equal(released.fisheyeRadius, 0);
  assert.equal(released.camera2Tweening, false);
  assert.equal(contentHidden(released, false), false);

  assert.equal(CAMERA2_BAKE_SECONDS, 3);
  assert.equal(CAMERA2_BAKE_STEPS, 60);
  const frames = CAMERA2_BAKE_STEPS + 1;
  const start = camera2Sample(frames, 0, 3);
  assert.deepEqual(start, { index: 0, next: 1, alpha: 0 });
  const mid = camera2Sample(frames, 1.5, 3);
  assert.equal(mid.index, 30);
  assert.equal(mid.next, 31);
  near(mid.alpha, 0);
  const end = camera2Sample(frames, 3, 3);
  assert.equal(end.index, 60);
  assert.equal(end.next, 60);
  near(end.alpha, 0);
});

test("interactive dots use the source grid, trail, and idle picks", () => {
  assert.deepEqual(dotGrid(0), { columns: 6, count: 24 });
  assert.deepEqual(dotGrid(699), { columns: 6, count: 24 });
  assert.deepEqual(dotGrid(700), { columns: 20, count: 100 });
  assert.deepEqual(dotGrid(Number.NaN), { columns: 6, count: 24 });

  const same = pushDotTrail(["a"], "a", 45);
  assert.equal(same.added, false);
  assert.deepEqual(same.queue, ["a"]);

  const filled = [];
  for (let index = 0; index < 45; index += 1) filled.push("d" + index);
  const overflow = pushDotTrail(filled, "new", 45);
  assert.equal(overflow.added, true);
  assert.equal(overflow.dropped, "d0");
  assert.equal(overflow.queue.length, 45);
  assert.equal(overflow.queue[44], "new");
  assert.equal(filled.length, 45);

  let cursor = 0;
  const one = [0];
  const picks = pickIdleDots(["a", "b", "c", "d"], () => one[cursor++] ?? 0);
  assert.equal(picks.length, 1);

  cursor = 0;
  const high = [0.99];
  const many = pickIdleDots(["a", "b", "c"], () => high[cursor++] ?? 0);
  assert.equal(many.length, 3);
  assert.equal(dotIdleGap(() => 0), 800);
  assert.equal(dotIdleGap(() => 0.999), 800 + Math.floor(0.999 * 701));

  const html = renderLanding();
  assert.match(html, /pickIdleDots\(/);
  assert.match(html, /pushDotTrail\(/);
  assert.match(html, /dotGrid\(/);
  assert.match(html, /dotIdleGap\(/);
  assert.match(html, /, 1800\)/);
  assert.match(html, /, 2400\)/);
  assert.match(html, /is-trail/);
  assert.match(html, /is-active/);
  assert.match(html, /cubic-bezier\(0\.645, 0\.045, 0\.355, 1\)/);
  assert.match(html, /margin-left: -2\.5rem/);
  assert.match(html, /padding-inline: 2\.5rem/);
  assert.match(html, /grid-template-columns: repeat\(20, 1fr\)/);
});
