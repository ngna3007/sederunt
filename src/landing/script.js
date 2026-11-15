export function landingScript() {
  return `  <script type="module">
    import * as THREE from "three";
    import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
    import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
    import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
    import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
    import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
    import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
    import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
    import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
    import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
    import {
      HOLD_VIEW,
      createHoldState,
      pressHold,
      releaseHold,
      stepHold,
      pointerAim,
      holdListenersEnabled,
      fisheyeVertex,
      fisheyeFragment,
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
      CAMERA2_BAKE_STEPS
    } from "/hold.js";

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const railLinks = Array.from(document.querySelectorAll(".rail a"));
    const steps = Array.from(document.querySelectorAll(".step"));
    const playClip = (clip, on) => {
      const video = clip.querySelector("video");
      if (!video) return;
      if (!on || reduce || clip.classList.contains("is-ended")) {
        video.pause();
        return;
      }
      if (!video.paused) return;
      video.muted = true;
      const playing = video.play();
      if (playing) playing.catch(function () {});
    };
    if ("IntersectionObserver" in window) {
      const clipWatch = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          playClip(entry.target, entry.isIntersecting && entry.intersectionRatio >= 0.5);
        });
      }, { threshold: [0, 0.5, 1] });
      document.querySelectorAll(".clip").forEach((clip) => clipWatch.observe(clip));
    }
    const termStream = document.querySelector(".claude-terminal-stream");
    const termLine = document.querySelector(".claude-terminal-line");
    const termAsk = document.querySelector(".claude-terminal-ask");
    const termTool = document.querySelector(".claude-terminal-tool");
    if (termStream && termLine && termAsk && termTool) {
      const termAnswer = termStream.textContent;
      const termQuestion = termAsk.textContent;
      const termSlot = document.createElement("span");
      termSlot.className = "claude-terminal-slot";
      termStream.parentNode.insertBefore(termSlot, termStream);
      termSlot.appendChild(termStream);
      const termSizer = document.createElement("span");
      termSizer.className = "claude-terminal-sizer";
      termSizer.setAttribute("aria-hidden", "true");
      termSizer.textContent = termAnswer;
      termSlot.appendChild(termSizer);
      termLine.classList.add("is-fixed");
      const askSizer = document.createElement("span");
      askSizer.className = "claude-terminal-ask-sizer";
      askSizer.setAttribute("aria-hidden", "true");
      askSizer.textContent = termQuestion;
      const askLive = document.createElement("span");
      askLive.className = "claude-terminal-ask-live";
      askLive.textContent = termQuestion;
      termAsk.textContent = "";
      termAsk.appendChild(askSizer);
      termAsk.appendChild(askLive);
      termAsk.classList.add("is-fixed");
      let termTimer = 0;
      let termFrame = 0;
      const termStop = () => {
        if (termTimer) clearTimeout(termTimer);
        if (termFrame) cancelAnimationFrame(termFrame);
        termTimer = 0;
        termFrame = 0;
      };
      const termToolSet = (state) => {
        termTool.classList.toggle("is-on", state !== "off");
        termTool.classList.toggle("is-done", state === "done");
      };
      const termShow = (count) => {
        termStream.textContent = termAnswer.slice(0, count);
        termLine.classList.toggle("is-streaming", !reduce && count < termAnswer.length);
      };
      const termType = (full, perMs, write, done) => {
        const started = performance.now();
        const tick = (now) => {
          const count = Math.min(full.length, Math.floor((now - started) / perMs));
          write(count);
          if (count < full.length) termFrame = requestAnimationFrame(tick);
          else done();
        };
        termFrame = requestAnimationFrame(tick);
      };
      const termRun = () => {
        termStop();
        termAsk.classList.remove("is-typing");
        if (reduce) {
          askLive.textContent = termQuestion;
          termToolSet("done");
          termShow(termAnswer.length);
          return;
        }
        askLive.textContent = "";
        termShow(0);
        termToolSet("off");
        termAsk.classList.add("is-typing");
        termType(termQuestion, 38, (count) => {
          askLive.textContent = termQuestion.slice(0, count);
        }, () => {
          termAsk.classList.remove("is-typing");
          termTimer = setTimeout(() => {
            termToolSet("run");
            termTimer = setTimeout(() => {
              termToolSet("done");
              termTimer = setTimeout(() => {
                termType(termAnswer, 18, termShow, () => {
                  termTimer = setTimeout(termRun, 16000);
                });
              }, 420);
            }, 1100);
          }, 520);
        });
      };
      if ("IntersectionObserver" in window) {
        const termWatch = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) termRun();
            else {
              termStop();
              termAsk.classList.remove("is-typing");
              termLine.classList.remove("is-streaming");
              termToolSet("done");
              askLive.textContent = termQuestion;
              termStream.textContent = termAnswer;
            }
          });
        }, { threshold: 0.45 });
        termWatch.observe(termLine.closest(".claude-terminal"));
      } else termRun();
    }
    if (railLinks.length && steps.length && "IntersectionObserver" in window) {
      const markRail = (id) => {
        railLinks.forEach((link) => {
          if (link.getAttribute("href") === "#" + id) link.setAttribute("aria-current", "true");
          else link.removeAttribute("aria-current");
        });
      };
      const spy = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) markRail(entry.target.id);
        });
      }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
      steps.forEach((step) => spy.observe(step));
    }

    const canvas = document.getElementById("field");
    const dotField = document.querySelector(".dots");
    if (dotField) {
      const dots = Array.from(dotField.querySelectorAll("span"));
      dots.forEach((dot) => dot.setAttribute("data-dot", ""));
      let isIdle = true;
      let idleTimeoutId = null;
      let idleIntervalId = null;
      let trailQueue = [];
      const trailTimeouts = new Set();

      function applyDotGrid() {
        const measured = dotField.getBoundingClientRect().width;
        const grid = dotGrid(measured || window.innerWidth);
        dotField.style.setProperty("--cols", String(grid.columns));
        dotField.style.gridTemplateColumns = "repeat(" + grid.columns + ", 1fr)";
        dots.forEach((dot, index) => {
          dot.hidden = index >= grid.count;
        });
      }

      function clearAllTrailTimeouts() {
        trailTimeouts.forEach((id) => clearTimeout(id));
        trailTimeouts.clear();
        trailQueue.forEach((dot) => dot.classList.remove("is-active", "is-trail"));
        trailQueue = [];
      }

      function clearIdleHighlights() {
        dots.forEach((dot) => {
          if (!dot.classList.contains("is-trail")) dot.classList.remove("is-active");
        });
      }

      function tickIdle() {
        if (!isIdle) return;
        const visible = dots.filter((dot) => !dot.hidden);
        if (!visible.length) return;
        clearIdleHighlights();
        pickIdleDots(visible, Math.random).forEach((dot) => dot.classList.add("is-active"));
      }

      function scheduleNextIdleTick() {
        if (!isIdle) return;
        idleIntervalId = setTimeout(() => {
          idleIntervalId = null;
          tickIdle();
          scheduleNextIdleTick();
        }, dotIdleGap(Math.random));
      }

      function enterIdleMode() {
        isIdle = true;
        clearAllTrailTimeouts();
        if (idleIntervalId === null) scheduleNextIdleTick();
      }

      function clearIdleTimeout() {
        if (idleTimeoutId !== null) {
          clearTimeout(idleTimeoutId);
          idleTimeoutId = null;
        }
      }

      function startIdleTimeout() {
        clearIdleTimeout();
        idleTimeoutId = setTimeout(() => {
          idleTimeoutId = null;
          enterIdleMode();
        }, 1800);
      }

      function stopIdle() {
        isIdle = false;
        clearIdleTimeout();
        if (idleIntervalId !== null) {
          clearTimeout(idleIntervalId);
          idleIntervalId = null;
        }
        dots.forEach((dot) => dot.classList.remove("is-active"));
      }

      function addTrailAt(x, y) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !dotField.contains(hit)) return;
        const dot = hit.closest("[data-dot]");
        if (!dot) return;
        const step = pushDotTrail(trailQueue, dot, 45);
        if (!step.added) return;
        if (step.dropped) step.dropped.classList.remove("is-active", "is-trail");
        trailQueue = step.queue;
        dot.classList.add("is-active", "is-trail");
        const timeoutId = setTimeout(() => {
          trailTimeouts.delete(timeoutId);
          const index = trailQueue.indexOf(dot);
          if (index !== -1) trailQueue.splice(index, 1);
          dot.classList.remove("is-active", "is-trail");
        }, 2400);
        trailTimeouts.add(timeoutId);
      }

      applyDotGrid();
      window.addEventListener("resize", applyDotGrid);
      window.addEventListener("mousemove", (event) => {
        const rect = dotField.getBoundingClientRect();
        const x = event.clientX;
        const y = event.clientY;
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
        startIdleTimeout();
        addTrailAt(x, y);
      }, { passive: true });
      if ("IntersectionObserver" in window) {
        const watcher = new IntersectionObserver((entries) => {
          const entry = entries[0];
          if (entry && entry.isIntersecting) startIdleTimeout();
          else {
            stopIdle();
            clearAllTrailTimeouts();
          }
        });
        watcher.observe(dotField);
      } else {
        startIdleTimeout();
      }
    }
    const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
    document.querySelectorAll(".clip").forEach(function (clip) {
      const video = clip.querySelector("video");
      const replay = clip.querySelector(".clip-replay");
      if (!video || !replay) return;
      video.addEventListener("ended", function () {
        clip.classList.add("is-ended");
      });
      replay.addEventListener("click", function () {
        clip.classList.remove("is-ended");
        video.muted = true;
        video.currentTime = 0;
        const playing = video.play();
        if (playing) playing.catch(function () {});
      });
    });
    const scrambleGlyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!<>-_/#%&";
    function scrambleLabel(node, text) {
      if (reduce) {
        node.textContent = text;
        return;
      }
      const count = text.length;
      const rate = count / 600;
      let started = 0;
      if (node._scrambleFrame) cancelAnimationFrame(node._scrambleFrame);
      const tick = (now) => {
        if (!started) started = now;
        const done = Math.min(count, Math.floor((now - started) * rate));
        let next = "";
        for (let index = 0; index < count; index += 1) {
          const glyph = text[index];
          if (glyph === " ") next += " ";
          else if (index < done) next += glyph;
          else next += scrambleGlyphs[(Math.random() * scrambleGlyphs.length) | 0];
        }
        node.textContent = next;
        if (done < count) node._scrambleFrame = requestAnimationFrame(tick);
        else node.textContent = text;
      };
      node._scrambleFrame = requestAnimationFrame(tick);
    }
    document.querySelectorAll(".nav-links a, .nav-cluster .nav-wallet").forEach((link) => {
      const text = link.textContent;
      link.addEventListener("mouseenter", () => scrambleLabel(link, text));
    });
    const navBar = document.querySelector(".nav");
    const navMenu = document.querySelector(".nav-menu");
    const navLabel = document.querySelector(".nav-menu-label");
    const navPanel = document.querySelector(".nav-panel");
    const navScrim = document.querySelector(".nav-scrim");
    if (navBar && navMenu && navLabel && navPanel) {
      const setNav = (open) => {
        navBar.classList.toggle("is-open", open);
        navMenu.setAttribute("aria-expanded", open ? "true" : "false");
        if (navLabel._scrambleFrame) cancelAnimationFrame(navLabel._scrambleFrame);
        navLabel.textContent = open ? "Close" : "Menu";
      };
      navMenu.addEventListener("click", () => setNav(!navBar.classList.contains("is-open")));
      navLabel.addEventListener("mouseenter", () => scrambleLabel(navLabel, navLabel.textContent));
      navPanel.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setNav(false)));
      if (navScrim) navScrim.addEventListener("click", () => setNav(false));
      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") setNav(false);
      });
    }
    const ground = new THREE.Color("#081428");
    const bodyColor = new THREE.Color(0.07, 0.16, 0.40);
    const pathLightColor = new THREE.Color(0.74, 0.86, 1.00);

    function span(value, start, end, from, to) {
      if (Math.abs(end - start) < 1e-6) return from;
      const amount = Math.min(1, Math.max(0, (value - start) / (end - start)));
      return from + (to - from) * amount;
    }

    function ease4(amount) {
      const t = Math.min(1, Math.max(0, amount));
      return t < 0.5 ? 8 * t * t * t * t : 1 - ((-2 * t + 2) ** 4) / 2;
    }

    function joinLines(lines) {
      return lines.join("\\n") + "\\n";
    }

    function patchBody(material) {
      const uniforms = {
        uClearColor: { value: ground.clone() },
        uColor: { value: bodyColor.clone() },
        uEmissive: { value: new THREE.Color(0, 0, 0) },
        uNoiseScale: { value: 0.3 },
        uNoiseBalance: { value: -0.4 },
        uNoiseContrast: { value: 0 },
        uNoiseAmplitude: { value: 0.4 }
      };
      material.userData.uniforms = uniforms;
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = "varying vec3 vLocalPosition;\\n" + shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\\n vLocalPosition = position;"
        );
        shader.fragmentShader = joinLines([
          "varying vec3 vLocalPosition;",
          "uniform vec3 uClearColor;",
          "uniform vec3 uColor;",
          "uniform vec3 uEmissive;",
          "uniform float uNoiseScale;",
          "uniform float uNoiseBalance;",
          "uniform float uNoiseContrast;",
          "uniform float uNoiseAmplitude;",
          "float hash31(vec3 p){",
          "  p = fract(p * 0.1031);",
          "  p += dot(p, p.yzx + 33.33);",
          "  return fract((p.x + p.y) * p.z);",
          "}"
        ]) + shader.fragmentShader.replace(
          "vec4 diffuseColor = vec4( diffuse, opacity );",
          joinLines([
            "vec3 p = vLocalPosition * uNoiseScale;",
            "float n1 = hash31(p);",
            "float n2 = hash31(p * 2.7) * 0.4;",
            "float n = (n1 + n2) / 1.4;",
            "float spots = smoothstep(uNoiseBalance, uNoiseBalance + (uNoiseContrast + 0.5), n);",
            "float darken = mix(uNoiseAmplitude, 1.0, spots);",
            "vec3 mixedColor = mix(uClearColor, uColor, darken);",
            "vec4 diffuseColor = vec4(mixedColor, opacity);"
          ])
        ).replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\\n totalEmissiveRadiance += uEmissive;"
        );
      };
    }

    function patchPath(material) {
      const uniforms = {
        uTime: { value: 0 },
        uPulseSpeed: { value: 0.19 },
        uPulseSize: { value: 0.025 },
        uPulseSmooth: { value: 0.015 },
        uPathLightMinInterval: { value: 0.2 },
        uPathLightMaxInterval: { value: 1 },
        uPathLightPulseDuration: { value: 0.8 },
        uPathLightMaxZDistance: { value: 7.5 }
      };
      material.userData.uniforms = uniforms;
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = joinLines([
          "attribute vec4 a_params;",
          "varying vec2 vUv2;",
          "varying vec4 vParams;",
          "varying float vViewDepth;"
        ]) + shader.vertexShader
          .replace("#include <uv_vertex>", "#include <uv_vertex>\\n vUv2 = uv; vParams = a_params;")
          .replace("#include <project_vertex>", "#include <project_vertex>\\n vViewDepth = -mvPosition.z;");
        shader.fragmentShader = joinLines([
          "uniform float uTime;",
          "uniform float uPulseSpeed;",
          "uniform float uPulseSize;",
          "uniform float uPulseSmooth;",
          "uniform float uPathLightMinInterval;",
          "uniform float uPathLightMaxInterval;",
          "uniform float uPathLightPulseDuration;",
          "uniform float uPathLightMaxZDistance;",
          "varying vec2 vUv2;",
          "varying vec4 vParams;",
          "varying float vViewDepth;",
          "float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }"
        ]) + shader.fragmentShader.replace(
          "vec4 diffuseColor = vec4( diffuse, opacity );",
          joinLines([
            "float offset = vParams.y;",
            "float intervalRand = vParams.z;",
            "float speed = vParams.w;",
            "float interval = mix(uPathLightMinInterval, uPathLightMaxInterval, intervalRand);",
            "float t = uTime * (uPulseSpeed * speed) + offset * interval;",
            "float ci = floor(t / interval);",
            "float hA = hash11(ci + offset * 100.0);",
            "float trigA = ci * interval + hA * (interval * 0.4);",
            "float progA = clamp((t - trigA) / uPathLightPulseDuration, 0.0, 1.0);",
            "float fadeA = smoothstep(0.0, uPulseSize, progA) * smoothstep(0.0, uPulseSize, 1.0 - progA);",
            "float yA = vUv2.y - progA;",
            "float pulseA = smoothstep(0.0, uPulseSmooth, yA + uPulseSize) * smoothstep(0.0, uPulseSmooth, uPulseSize - yA) * fadeA;",
            "float ciPrev = ci - 1.0;",
            "float hB = hash11(ciPrev + offset * 100.0);",
            "float trigB = ciPrev * interval + hB * (interval * 0.4);",
            "float progB = clamp((t - trigB) / uPathLightPulseDuration, 0.0, 1.0);",
            "float fadeB = smoothstep(0.0, uPulseSize, progB) * smoothstep(0.0, uPulseSize, 1.0 - progB);",
            "float yB = vUv2.y - progB;",
            "float pulseB = smoothstep(0.0, uPulseSmooth, yB + uPulseSize) * smoothstep(0.0, uPulseSmooth, uPulseSize - yB) * fadeB;",
            "float basePulse = max(pulseA, pulseB);",
            "float visibility = uPathLightMaxZDistance <= 0.0 ? 1.0 : step(vViewDepth, uPathLightMaxZDistance);",
            "vec4 diffuseColor = vec4(diffuse, opacity * basePulse * visibility);"
          ])
        );
      };
    }

    function patchReveal(material, circle) {
      const uniforms = circle
        ? { uRevealMin: { value: 0.72 }, uRevealMax: { value: 1 } }
        : { uRevealStep: { value: 0.892 } };
      material.userData.uniforms = uniforms;
      material.defines = { USE_UV: "" };
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        const header = circle
          ? "uniform float uRevealMin;\\nuniform float uRevealMax;\\n"
          : "uniform float uRevealStep;\\n";
        const mask = circle
          ? joinLines([
            "float revealMask = step(uRevealMin, vUv.y) * step(vUv.y, uRevealMax);",
            "vec4 diffuseColor = vec4( diffuse, opacity * revealMask );"
          ])
          : joinLines([
            "float revealMask = step(vUv.y, uRevealStep);",
            "if (revealMask <= 0.0) discard;",
            "vec4 diffuseColor = vec4( diffuse, opacity * revealMask );"
          ]);
        shader.fragmentShader = header + shader.fragmentShader.replace(
          "vec4 diffuseColor = vec4( diffuse, opacity );",
          mask
        );
      };
    }

    function softDisc() {
      const disc = document.createElement("canvas");
      disc.width = 64;
      disc.height = 64;
      const ctx = disc.getContext("2d");
      const paint = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      paint.addColorStop(0, "rgba(255,255,255,1)");
      paint.addColorStop(0.45, "rgba(255,255,255,0.7)");
      paint.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = paint;
      ctx.fillRect(0, 0, 64, 64);
      const texture = new THREE.CanvasTexture(disc);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }

    try {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setClearColor(ground, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ReinhardToneMapping;
      renderer.toneMappingExposure = 1;

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog("#081428", 3.5, 5);
      scene.environmentIntensity = 0.12;

      const backdropScene = new THREE.Scene();
      const backdropCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 10);
      backdropCamera.position.z = 1;
      const backdropMaterial = new THREE.ShaderMaterial({
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uColorA: { value: new THREE.Color("#000000") },
          uColorB: { value: new THREE.Color("#1A4E96") },
          uCenter: { value: new THREE.Vector2(0.2, 0.77) },
          uOffset: { value: 0.08 },
          uSoftness: { value: 0.95 },
          uSpread: { value: 6.6 },
          uNoiseAmount: { value: 0.05 },
          uNoiseScale: { value: 11.68 },
          uDither: { value: 1.34 },
          uOpacity: { value: 1 }
        },
        vertexShader: joinLines([
          "varying vec2 vUv;",
          "void main() {",
          "  vUv = uv;",
          "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
          "}"
        ]),
        fragmentShader: joinLines([
          "uniform vec3 uColorA;",
          "uniform vec3 uColorB;",
          "uniform vec2 uCenter;",
          "uniform float uOffset;",
          "uniform float uSoftness;",
          "uniform float uSpread;",
          "uniform float uNoiseAmount;",
          "uniform float uNoiseScale;",
          "uniform float uDither;",
          "uniform float uOpacity;",
          "varying vec2 vUv;",
          "float hash31(vec3 p) {",
          "  float n = dot(p, vec3(127.1, 311.7, 74.7));",
          "  return fract(sin(n) * 43758.5453123);",
          "}",
          "float valueNoise3D(vec3 p) {",
          "  vec3 i = floor(p);",
          "  vec3 f = fract(p);",
          "  vec3 u = f * f * (3.0 - 2.0 * f);",
          "  float a = hash31(i);",
          "  float b = hash31(i + vec3(1.0, 0.0, 0.0));",
          "  float c = hash31(i + vec3(0.0, 1.0, 0.0));",
          "  float d = hash31(i + vec3(1.0, 1.0, 0.0));",
          "  float e = hash31(i + vec3(0.0, 0.0, 1.0));",
          "  float ff = hash31(i + vec3(1.0, 0.0, 1.0));",
          "  float g = hash31(i + vec3(0.0, 1.0, 1.0));",
          "  float h = hash31(i + vec3(1.0, 1.0, 1.0));",
          "  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, ff, u.x), mix(g, h, u.x), u.y), u.z);",
          "}",
          "void main() {",
          "  float baseGradient = length((vUv - uCenter)) * 2.0;",
          "  float gradientWithOffset = clamp(baseGradient + uOffset, 0.0, 1.0);",
          "  float soft = max(uSoftness, 0.0001);",
          "  float softened = clamp((gradientWithOffset - 0.5) / soft + 0.5, 0.0, 1.0);",
          "  float noise = valueNoise3D(vec3(vUv * uNoiseScale, 0.0)) * 2.0 - 1.0;",
          "  float t = clamp(softened + noise * uNoiseAmount, 0.0, 1.0);",
          "  t = pow(t, uSpread);",
          "  vec3 color = mix(uColorA, uColorB, t);",
          "  float ditherSeed = vUv.x * 12.9898 + vUv.y * 78.233;",
          "  float ditherNoise = fract(sin(ditherSeed) * 43758.5453) - 0.5;",
          "  color += vec3(ditherNoise * uDither * (1.0 / 255.0));",
          "  gl_FragColor = vec4(color, clamp(uOpacity, 0.0, 1.0));",
          "}"
        ])
      });
      backdropScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backdropMaterial));
      const backdropTarget = new THREE.WebGLRenderTarget(8, 8, {
        depthBuffer: false,
        generateMipmaps: false
      });
      backdropTarget.texture.colorSpace = THREE.NoColorSpace;
      function paintBackdrop() {
        backdropTarget.setSize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
        const previous = renderer.getRenderTarget();
        renderer.setRenderTarget(backdropTarget);
        renderer.clear();
        renderer.render(backdropScene, backdropCamera);
        renderer.setRenderTarget(previous);
      }
      paintBackdrop();
      scene.background = backdropTarget.texture;
      const rig = new THREE.Group();
      const camera = new THREE.PerspectiveCamera(HOLD_VIEW.fov, window.innerWidth / window.innerHeight, 0.1, 80);
      const cameraBaseZ = 6.55;
      camera.position.set(-0.15, 0.04, cameraBaseZ);
      rig.add(camera);
      scene.add(rig);
      camera.lookAt(1.45, 0.02, 0);
      let viewCamera = camera;
      let cameraParent = rig;

      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();

      RectAreaLightUniformsLib.init();
      const key = new THREE.DirectionalLight(new THREE.Color(0.42, 0.66, 1.00), 6);
      key.position.set(-86.96, 30.43, 19.57);
      scene.add(key);
      const stripFar = new THREE.RectAreaLight("#ffffff", 13, 35.9, 0.7);
      stripFar.position.set(-0.67, -3.43, 39.63);
      stripFar.lookAt(63.28, -69.8, -0.38);
      scene.add(stripFar);
      const stripNear = new THREE.RectAreaLight("#ffffff", 4.4, 0.8, 1.5);
      stripNear.position.set(-0.27, -0.97, 5.63);
      stripNear.rotation.set(0.21, -2.46, -0.01);
      scene.add(stripNear);
      const stripTop = new THREE.RectAreaLight("#ffffff", 47.8, 1.7, 1);
      stripTop.position.set(0, 0.94, 26.09);
      stripTop.rotation.set(-1.5, 0, 0);
      scene.add(stripTop);
      const draco = new DRACOLoader();
      draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.183.0/examples/jsm/libs/draco/");
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);
      const main = await loader.loadAsync("/models/CEREBRIUM_part1_11_optimization.glb");
      const paths = await loader.loadAsync("/models/CEREBRIUM_part2_4_optimization.glb");
      main.scene.add(paths.scene);
      scene.add(main.scene);
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0.12,
        side: THREE.DoubleSide
      });
      patchBody(bodyMaterial);
      const pathMaterial = new THREE.MeshBasicMaterial({
        color: pathLightColor,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        fog: false,
        opacity: 1
      });
      patchPath(pathMaterial);
      const pathRevealMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0.12,
        transparent: true,
        side: THREE.DoubleSide
      });
      patchReveal(pathRevealMaterial, false);
      const circleRevealMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0.12,
        transparent: true,
        side: THREE.DoubleSide
      });
      patchReveal(circleRevealMaterial, true);
      let lightIndex = 0;
      main.scene.traverse((obj) => {
        if (obj.isPerspectiveCamera) {
          viewCamera = obj;
          viewCamera.fov = HOLD_VIEW.fov;
          viewCamera.near = 0.1;
          viewCamera.far = 80;
          viewCamera.updateProjectionMatrix();
        }
        if (obj.name === "CAM") cameraParent = obj;
        if (!obj.isMesh) return;
        if (obj.name.includes("Cube")) {
          obj.visible = false;
          return;
        }
        if (obj.name === "path_reveal") {
          obj.material = pathRevealMaterial;
          obj.renderOrder = 1;
          return;
        }
        if (obj.name === "circle_reveal") {
          obj.material = circleRevealMaterial;
          obj.renderOrder = 1;
          return;
        }
        if (obj.name.toLowerCase().includes("light")) {
          obj.geometry = obj.geometry.clone();
          const count = obj.geometry.attributes.position.count;
          const params = new Float32Array(count * 4);
          const offset = lightIndex / 7;
          const intervalRand = 0.5 + Math.random() * 0.5;
          for (let i = 0; i < count; i++) {
            params[i * 4] = 0.75;
            params[i * 4 + 1] = offset;
            params[i * 4 + 2] = intervalRand;
            params[i * 4 + 3] = 1;
          }
          obj.geometry.setAttribute("a_params", new THREE.BufferAttribute(params, 4));
          obj.material = pathMaterial;
          obj.renderOrder = 2;
          obj.frustumCulled = false;
          lightIndex += 1;
          return;
        }
        obj.material = bodyMaterial;
      });
      const dustCount = 1000;
      const dustBase = new Float32Array(dustCount * 3);
      const dustSeeds = new Float32Array(dustCount);
      for (let i = 0; i < dustCount; i++) {
        dustBase[i * 3] = (Math.random() - 0.5) * 4;
        dustBase[i * 3 + 1] = (Math.random() - 0.5) * 1.6;
        dustBase[i * 3 + 2] = -1 + (Math.random() - 0.5) * 14.5;
        dustSeeds[i] = Math.random() * 6.28318;
      }
      const dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute("position", new THREE.BufferAttribute(dustBase.slice(), 3));
      const dustMaterial = new THREE.PointsMaterial({
        color: new THREE.Color("#a8c0ee"),
        size: 0.1,
        map: softDisc(),
        transparent: true,
        opacity: 0.075,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
      });
      const dust = new THREE.Points(dustGeo, dustMaterial);
      dust.frustumCulled = false;
      scene.add(dust);
      const lineCount = 250;
      const lineBase = new Float32Array(lineCount * 2);
      const linePositions = new Float32Array(lineCount * 6);
      for (let i = 0; i < lineCount; i++) {
        const x = (Math.random() - 0.5) * 13.5;
        const y = (Math.random() - 0.5) * 13;
        const z = 19.4 + (Math.random() - 0.5) * 54.3;
        lineBase[i * 2] = x;
        lineBase[i * 2 + 1] = y;
        linePositions[i * 6] = x;
        linePositions[i * 6 + 1] = y;
        linePositions[i * 6 + 2] = z;
        linePositions[i * 6 + 3] = x;
        linePositions[i * 6 + 4] = y;
        linePositions[i * 6 + 5] = z - 2;
      }
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
      const lineMaterial = new THREE.LineBasicMaterial({
        color: new THREE.Color("#c9d8f6"),
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const wind = new THREE.LineSegments(lineGeo, lineMaterial);
      wind.frustumCulled = false;
      scene.add(wind);
      let mixer = null;
      let clipDuration = HOLD_VIEW.clipDuration;
      if (main.animations[0]) {
        clipDuration = main.animations[0].duration || clipDuration;
        mixer = new THREE.AnimationMixer(main.scene);
        const action = mixer.clipAction(main.animations[0]);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        mixer.setTime(0);
      }
      draco.dispose();

      const camera2 = viewCamera.clone();
      camera2.fov = viewCamera.fov;
      camera2.near = viewCamera.near;
      camera2.far = viewCamera.far;
      camera2.updateProjectionMatrix();
      const camera2Parent = new THREE.Group();
      camera2Parent.add(camera2);
      scene.add(camera2Parent);
      const camera2Frames = [];
      const bakeDuration = Math.min(CAMERA2_BAKE_SECONDS, clipDuration);
      const bakeSteps = CAMERA2_BAKE_STEPS;
      if (mixer && bakeDuration > 0) {
        for (let step = 0; step <= bakeSteps; step += 1) {
          mixer.setTime((step / bakeSteps) * bakeDuration);
          main.scene.updateMatrixWorld(true);
          camera2Frames.push({
            position: viewCamera.getWorldPosition(new THREE.Vector3()),
            quaternion: viewCamera.getWorldQuaternion(new THREE.Quaternion())
          });
        }
        mixer.setTime(0);
      }
      const revealSize = new THREE.Vector2();
      renderer.getDrawingBufferSize(revealSize);
      const revealTarget = new THREE.WebGLRenderTarget(
        Math.max(1, revealSize.x),
        Math.max(1, revealSize.y),
        { type: THREE.HalfFloatType, depthBuffer: true }
      );

      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, viewCamera));
      composer.addPass(new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        HOLD_VIEW.bloomStrength,
        HOLD_VIEW.bloomRadius,
        HOLD_VIEW.bloomThreshold
      ));
      const fisheyePass = new ShaderPass({
        uniforms: {
          tDiffuse: { value: null },
          tReveal: { value: revealTarget.texture },
          uRadius: { value: 0 },
          uStrength: { value: 0 },
          uAspect: { value: window.innerWidth / window.innerHeight },
          uTime: { value: 0 }
        },
        vertexShader: fisheyeVertex(),
        fragmentShader: fisheyeFragment()
      });
      fisheyePass.enabled = false;
      composer.addPass(fisheyePass);
      composer.addPass(new OutputPass());

      const aim = { x: 0, y: 0 };
      let scrollTarget = 0;
      let scrollY = 0;
      const pointer = { x: 0, y: 0, clientX: 0, clientY: 0 };
      let hold = createHoldState();
      let lastNow = 0;
      const holdCursor = document.getElementById("hold-cursor");
      const progressRing = holdCursor ? holdCursor.querySelector(".hold-cursor-progress") : null;
      const ringLength = Math.PI * 2 * 71;
      if (progressRing) {
        progressRing.style.strokeDasharray = String(ringLength);
        progressRing.style.strokeDashoffset = String(ringLength);
      }
      let cursorX = 0;
      let cursorY = 0;
      let cursorSeen = false;
      let ringStarted = 0;

      function inHoldZone(event) {
        const target = event.target;
        if (!target || !target.closest) return false;
        if (!target.closest(".hero")) return false;
        if (target.closest("a, button, .nav")) return false;
        return true;
      }
      function endHold() {
        hold = releaseHold(hold);
        document.documentElement.classList.remove("is-holding");
        if (holdCursor) holdCursor.classList.remove("is-holding");
        if (progressRing) progressRing.style.strokeDashoffset = String(ringLength);
      }
      function onPointer(event) {
        pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.y = -((event.clientY / window.innerHeight) * 2 - 1);
        pointer.clientX = event.clientX;
        pointer.clientY = event.clientY;
        if (!finePointer || !holdCursor) return;
        if (!cursorSeen) {
          cursorX = event.clientX;
          cursorY = event.clientY;
          cursorSeen = true;
          holdCursor.classList.add("is-visible");
        }
        holdCursor.classList.toggle("is-hidden", !inHoldZone(event) && !hold.playing);
      }
      if (holdListenersEnabled(reduce)) {
        window.addEventListener("pointerdown", (event) => {
          if (event.button !== 0 || !inHoldZone(event)) return;
          hold = pressHold(hold);
          ringStarted = performance.now();
          document.documentElement.classList.add("is-holding");
          document.documentElement.classList.add("is-scene");
          if (holdCursor) {
            holdCursor.classList.add("is-holding");
            holdCursor.classList.remove("is-hidden");
          }
        });
        window.addEventListener("pointerup", endHold);
        window.addEventListener("pointercancel", endHold);
        window.addEventListener("pointermove", onPointer);
      }

      function fogSpan(open, elapsed) {
        let near = span(open, 0.09, 0.135, 3.5, 3.5);
        let far = span(open, 0.09, 0.135, 5, 7.5);
        near = span(open, 0.135, 0.2, near, 3);
        far = span(open, 0.135, 0.2, far, 5.5);
        near = span(open, 0.2, 0.566, near, 4.25);
        far = span(open, 0.2, 0.566, far, 6.5);
        near = span(open, 0.566, 0.566, near, 4.25);
        far = span(open, 0.566, 0.761, far, 8.25);
        near = span(open, 0.566, 1, near, 5.5);
        far = span(open, 0.566, 1, far, 9);
        near += Math.sin(elapsed * 1.5 + 0.5) * 0.11 + Math.sin(elapsed * 2.7975 + 1.4) * 0.06 + Math.sin(elapsed * 5.3925 + 2.9) * 0.03;
        far += Math.sin(elapsed * 1.5 + 0.25) * 0.11 + Math.sin(elapsed * 3.1275 + 0.8) * 0.06 + Math.sin(elapsed * 4.8225 + 3.2) * 0.03;
        if (near > far) {
          const swap = near;
          near = far;
          far = swap;
        }
        if (far - near < 0.02) far = near + 0.02;
        return { near: near, far: far };
      }

      function draw(now) {
        const time = now * 0.001;
        const dt = lastNow === 0 ? 0 : Math.min(0.05, time - lastNow);
        lastNow = time;
        if (!reduce) hold = stepHold(hold, dt);
        const clipProgress = clipDuration > 0 ? Math.min(1, hold.time / clipDuration) : 0;
        const eased = pointerAim({
          mouseX: pointer.x,
          mouseY: pointer.y,
          particlesOpacity: hold.particlesOpacity,
          clipProgress: clipProgress,
          aim,
          easing: HOLD_VIEW.aimEasing
        });
        aim.x = eased.x;
        aim.y = eased.y;
        if (mixer) mixer.setTime(Math.min(hold.time, clipDuration));
        const camProgress = introCamProgress(time);
        scrollY += (scrollTarget - scrollY) * 0.12;
        const pose = cameraPose({ camProgress, scroll: scrollY, camProgress2: hold.camProgress2 });
        cameraParent.rotation.set(0, 0, 0);
        cameraParent.rotation.x = aim.y;
        cameraParent.rotation.y = aim.x + pose.yaw;
        cameraParent.position.x = pose.x;
        cameraParent.position.y = pose.y;
        document.documentElement.classList.toggle("is-scene", contentHidden(hold, reduce));
        const lit = hold.fisheyeRadius > 0 ? 0 : clipProgress;
        const swing = Math.sin(span(lit, 0, 0.74, 0, 1) * Math.PI);
        key.position.set(
          span(lit, 0, 1, -86.96, -100) - 70.1 * swing,
          span(lit, 0, 1, 30.43, 17.39) + 39.1 * swing,
          span(lit, 0, 1, 19.57, 100) + 43.5 * swing
        );
        const fog = fogSpan(lit, time);
        scene.fog.near = fog.near;
        scene.fog.far = fog.far;
        scene.fog.color.copy(ground);
        pathMaterial.userData.uniforms.uTime.value = time;
        pathMaterial.userData.uniforms.uPathLightMaxZDistance.value = clipProgress >= 0.5 ? 0 : 7.5;
        const revealT = Math.min(1, Math.max(0, (clipProgress - 0.84) / 0.16));
        pathRevealMaterial.userData.uniforms.uRevealStep.value = 0.892 + (1 - 0.892) * ease4(revealT);
        circleRevealMaterial.userData.uniforms.uRevealMin.value = span(clipProgress, 0.783, 1, 0.72, 0);
        circleRevealMaterial.userData.uniforms.uRevealMax.value = span(clipProgress, 0.783, 1, 1, 0.725);
        dustMaterial.opacity = hold.particlesOpacity * 0.075;
        const dustAttr = dustGeo.getAttribute("position");
        for (let i = 0; i < dustCount; i++) {
          dustAttr.setXYZ(
            i,
            dustBase[i * 3] + Math.sin(time * 1.23 + dustSeeds[i]) * 0.012,
            dustBase[i * 3 + 1] + Math.cos(time * 0.7 + dustSeeds[i]) * 0.02,
            dustBase[i * 3 + 2]
          );
        }
        dustAttr.needsUpdate = true;
        const gate = clipProgress <= 0.325 ? 0 : clipProgress >= 0.375 ? 1 : (clipProgress - 0.325) / 0.05;
        const smooth = gate * gate * (3 - 2 * gate);
        lineMaterial.opacity = hold.lineOpacity * smooth;
        const lineAttr = lineGeo.getAttribute("position");
        const lineFloor = 19.4 - 27.15;
        for (let i = 0; i < lineCount; i++) {
          const shifted = lineFloor + ((lineBase[i * 2] * 0 + 19.4 + (i / lineCount - 0.5) * 54.3 - time * 1.6) - lineFloor);
          const wrapped = lineFloor + ((shifted - lineFloor) % 54.3 + 54.3) % 54.3;
          const x = lineBase[i * 2];
          const y = lineBase[i * 2 + 1];
          lineAttr.setXYZ(i * 2, x, y, wrapped);
          lineAttr.setXYZ(i * 2 + 1, x, y, wrapped - 2);
        }
        lineAttr.needsUpdate = true;
        if (finePointer && holdCursor && cursorSeen) {
          cursorX += (pointer.clientX - cursorX) * 0.2;
          cursorY += (pointer.clientY - cursorY) * 0.2;
          holdCursor.style.transform = "translate(" + cursorX + "px," + cursorY + "px) translate(-50%, -50%)";
          if (hold.playing && progressRing) {
            const filled = Math.min(1, (performance.now() - ringStarted) / 9000);
            progressRing.style.strokeDashoffset = String(ringLength * (1 - filled));
          }
        }
        fisheyePass.enabled = hold.fisheyeActive;
        fisheyePass.uniforms.uRadius.value = hold.fisheyeRadius;
        fisheyePass.uniforms.uStrength.value = hold.fisheyeActive ? 1 : 0;
        fisheyePass.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
        fisheyePass.uniforms.uTime.value = time;
        if (hold.fisheyeActive && camera2Frames.length) {
          const sample = camera2Sample(camera2Frames.length, hold.camera2Time, bakeDuration);
          const fromFrame = camera2Frames[sample.index];
          const toFrame = camera2Frames[sample.next];
          camera2.position.lerpVectors(fromFrame.position, toFrame.position, sample.alpha);
          camera2.quaternion.slerpQuaternions(fromFrame.quaternion, toFrame.quaternion, sample.alpha);
          camera2Parent.rotation.copy(cameraParent.rotation);
          camera2Parent.position.copy(cameraParent.position);
          camera2Parent.updateMatrixWorld(true);
          const previousTarget = renderer.getRenderTarget();
          renderer.setRenderTarget(revealTarget);
          renderer.clear();
          renderer.render(scene, camera2);
          renderer.setRenderTarget(previousTarget);
          fisheyePass.uniforms.tReveal.value = revealTarget.texture;
        }
        composer.render();
      }

      function resize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        viewCamera.aspect = width / height;
        viewCamera.updateProjectionMatrix();
        camera2.aspect = width / height;
        camera2.updateProjectionMatrix();
        renderer.setSize(width, height);
        composer.setSize(width, height);
        renderer.getDrawingBufferSize(revealSize);
        revealTarget.setSize(Math.max(1, revealSize.x), Math.max(1, revealSize.y));
        paintBackdrop();
      }
      resize();
      window.addEventListener("resize", resize);

      const sheet = document.querySelector(".sheet");
      const stage = document.querySelector(".stage");
      function readScroll() {
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        const scrollY = window.scrollY || 0;
        scrollTarget = stripScroll(scrollY, rect.top + scrollY, rect.height, window.innerHeight);
      }
      readScroll();
      window.addEventListener("scroll", readScroll, { passive: true });

      if (reduce) {
        document.querySelectorAll(".clip").forEach(function (clip) {
          const node = clip.querySelector("video");
          if (node) node.pause();
          clip.classList.add("is-ended");
        });
        draw(2800);
      } else {
        const loop = (now) => {
          const open = !sheet || sheet.getBoundingClientRect().top > 24;
          if (open && document.visibilityState !== "hidden") draw(now);
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      }
    } catch (error) {
      console.error(error);
    }
  </script>`;
}
