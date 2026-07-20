const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const scriptLoadPromises = new Map();

function loadExternalScript(src) {
  if (scriptLoadPromises.has(src)) {
    return scriptLoadPromises.get(src);
  }

  if (document.querySelector(`script[src="${src}"]`)) {
    if ((src.includes("recaptcha") && window.grecaptcha) || (src.includes("devicer") && window.Devicer)) {
      return Promise.resolve();
    }
  }

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });

  scriptLoadPromises.set(src, promise);
  return promise;
}

if (urlParams.has("referral")) {
  const referral = urlParams.get("referral");
  if (referral) {
    const input = document.querySelector('input[name="referral"]');
    if (input) {
      input.value = referral;
    }
  }
}

class NavbarController {
  constructor() {
    this.navbar = document.querySelector(".navbar");
    this.menuBtn = document.getElementById("menu-btn");
    this.dropdownMenu = document.getElementById("dropdown-menu");
    this.scrollProgress = document.querySelector(".scroll-progress");
    this.lastScrollY = window.scrollY;
    this.isMenuOpen = false;
    this.isNavbarScrolled = false;
    this.isNavbarHidden = false;
    this.scrollTicking = false;
    this.progressMax = 0;
    this._openTimeout = null;
    this._closeTimeout = null;

    this.init();
  }

  init() {
    this.updateProgressMetrics();
    this.bindEvents();
    this.updateScrollProgress();
  }

  bindEvents() {
    if (this.menuBtn) {
      this.menuBtn.addEventListener("click", () => this.toggleMenu());
    }

    if (this.dropdownMenu) {
      this.dropdownMenu.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => this.closeMenu());
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.isMenuOpen) {
        this.closeMenu();
      }
    });

    window.addEventListener("scroll", () => {
      this.scheduleScrollUpdate();
    }, { passive: true });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 768 && this.isMenuOpen) {
        this.closeMenu();
      }

      this.updateProgressMetrics();
      this.scheduleScrollUpdate();
    }, { passive: true });
  }

  scheduleScrollUpdate() {
    if (this.scrollTicking) {
      return;
    }

    this.scrollTicking = true;
    requestAnimationFrame(() => {
      this.scrollTicking = false;
      this.handleScroll();
      this.updateScrollProgress();
    });
  }

  updateProgressMetrics() {
    this.progressMax = Math.max(
      0,
      document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
  }

  toggleMenu() {
    if (this.isMenuOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  openMenu() {
    if (!this.menuBtn || !this.dropdownMenu) return;

    clearTimeout(this._closeTimeout);
    this._closeTimeout = null;

    this.isMenuOpen = true;
    this.menuBtn.classList.add("open");
    this.dropdownMenu.style.display = "block";
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
      if (!this.dropdownMenu) return;

      this.dropdownMenu.classList.add("show");

      this._openTimeout = setTimeout(() => {
        this._openTimeout = null;
        this.dropdownMenu.querySelectorAll("li").forEach((item, index) => {
          item.style.animationDelay = `${index * 0.1}s`;
          item.classList.add("animate-in");
        });
      }, 100);
    });
  }

  closeMenu() {
    if (!this.menuBtn || !this.dropdownMenu) return;

    clearTimeout(this._openTimeout);
    this._openTimeout = null;

    this.isMenuOpen = false;
    this.menuBtn.classList.remove("open");
    this.dropdownMenu.classList.remove("show");
    document.body.style.overflow = "";

    this._closeTimeout = setTimeout(() => {
      this._closeTimeout = null;
      this.dropdownMenu.style.display = "none";
      this.dropdownMenu.querySelectorAll("li").forEach((item) => {
        item.classList.remove("animate-in");
        item.style.animationDelay = "";
      });
    }, 600);
  }

  handleScroll() {
    if (!this.navbar) return;

    const currentScrollY = window.scrollY;
    const shouldBeScrolled = currentScrollY > 100;
    const shouldBeHidden = currentScrollY > this.lastScrollY && currentScrollY > 100;

    if (shouldBeScrolled !== this.isNavbarScrolled) {
      this.isNavbarScrolled = shouldBeScrolled;

      if (shouldBeScrolled) {
        this.navbar.classList.add("scrolled");
      } else {
        this.navbar.classList.remove("scrolled");
      }
    }

    if (shouldBeHidden !== this.isNavbarHidden) {
      this.isNavbarHidden = shouldBeHidden;

      if (shouldBeHidden) {
        this.navbar.classList.add("hidden");
      } else {
        this.navbar.classList.remove("hidden");
      }
    }

    this.lastScrollY = currentScrollY;
  }

  updateScrollProgress() {
    if (!this.scrollProgress) return;

    const winScroll = window.scrollY;
    const progressMax = this.progressMax || Math.max(
      0,
      document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    const scrolled = progressMax > 0 ? winScroll / progressMax : 0;
    this.scrollProgress.style.transform = `scaleX(${Math.min(1, Math.max(0, scrolled))})`;
  }
}

class NetworkGraph {
  constructor(canvas) {
    this.canvas = canvas;
    this.hero = canvas.parentElement;
    this.ctx = canvas.getContext("2d");
    this.nodes = [];
    this.meshModel = null;
    this.meshTargets = [];
    this.meshBlend = 0;
    this.meshLoaded = false;
    this.meshLoadAttempted = false;
    this.meshLoading = false;
    this.meshLoadRequestId = 0;
    this.transitionActive = false;
    this.rafId = null;
    this.running = false;
    this.pointer = { x: 0, y: 0, active: false };
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.lastWidth = 0;
    this.lastHeight = 0;
    this.resizeTimer = null;
    this.time = 0;
    this.trackingBlend = 0;
    this.smoothedLook = { x: 0, y: 0 };
    this.currentPose = { x: 0, y: 0, lookX: 0, lookY: 0 };
    this.minMeshViewportWidth = 721;
    this.heroResizeObserver = null;
    this.isStatic = this.reducedMotion || window.innerWidth < 960 || Boolean(navigator.connection?.saveData);

    this.resize(true);
    this.buildNodes();

    if (this.isStatic) {
      this.drawFrame();
      return;
    }

    this.bindEvents();
    this.rebuildNodes();

    if (this.reducedMotion) {
      this.drawFrame();
    } else {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) this.start();
          else this.stop();
        });
      }, { threshold: 0.08 });
      observer.observe(canvas);
      this.start();
    }
  }

  bindEvents() {
    window.addEventListener("pointermove", (event) => this.handlePointerMove(event), { passive: true });
    window.addEventListener("pointerout", (event) => {
      if (!event.relatedTarget) {
        this.clearPointer();
      }
    }, { passive: true });
    window.addEventListener("blur", () => this.clearPointer(), { passive: true });

    window.addEventListener("resize", () => this.scheduleResizeUpdate(), { passive: true });

    if (typeof ResizeObserver === "function" && this.hero) {
      this.heroResizeObserver = new ResizeObserver(() => this.scheduleResizeUpdate());
      this.heroResizeObserver.observe(this.hero);
    }
  }

  scheduleResizeUpdate() {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      const wasRunning = this.running;
      const changed = this.resize();
      if (changed) {
        this.rebuildNodes();
      }
      if (this.reducedMotion || wasRunning) {
        this.drawFrame();
      }
      if (wasRunning && !this.reducedMotion) {
        this.start();
      }
    }, 120);
  }

  resize(force = false) {
    const hero = this.hero;
    if (!hero) return false;

    const width = Math.max(1, hero.offsetWidth);
    const height = Math.max(1, hero.offsetHeight);

    if (!force && width === this.lastWidth && height === this.lastHeight) {
      return false;
    }

    this.lastWidth = width;
    this.lastHeight = height;

    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return true;
  }

  clearPointer() {
    this.pointer.active = false;
  }

  handlePointerMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    this.pointer.x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    this.pointer.y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    this.pointer.active = true;

    if (this.reducedMotion) {
      this.drawFrame();
    }
  }

  lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  shouldUseMeshModel() {
    return this.lastWidth >= this.minMeshViewportWidth;
  }

  disableMeshModel() {
    this.meshLoaded = false;
    this.transitionActive = false;
    this.meshBlend = 0;
    this.meshTargets = [];
    this.meshLoadRequestId += 1;
  }

  async loadMeshModel() {
    if (!this.shouldUseMeshModel() || this.meshLoadAttempted || this.meshLoading) return;

    this.meshLoadAttempted = true;
    this.meshLoading = true;
    const requestId = ++this.meshLoadRequestId;
    this.meshLoaded = false;
    this.transitionActive = false;
    this.meshBlend = 0;

    try {
      const response = await fetch("/mesh.obj");
      if (!response.ok) return;

      const loadedModel = this.parseMeshModel(await response.text());
      if (requestId !== this.meshLoadRequestId) return;

      this.meshModel = loadedModel;
      if (!this.shouldUseMeshModel()) return;

      this.buildMeshTargets();
      this.meshLoaded = this.meshTargets.length > 0;

      if (this.reducedMotion || this.running) {
        this.drawFrame();
      }
    } catch (error) {
      console.error("Failed to load head mesh:", error);
    } finally {
      if (requestId === this.meshLoadRequestId) {
        this.meshLoading = false;
      }
    }
  }

  parseMeshModel(text) {
    const rawVertices = [];
    const lines = text.split(/\r?\n/);
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (const line of lines) {
      if (!line.startsWith("v ")) continue;

      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;

      const x = Number(parts[1]);
      const y = Number(parts[2]);
      const z = Number(parts[3]);

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

      rawVertices.push({ x, y, z });

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }

    const sampleStep = rawVertices.length > 5000 ? Math.ceil(rawVertices.length / 5000) : 1;
    const sampledVertices = rawVertices.filter((_, index) => index % sampleStep === 0);
    const rangeX = Math.max(maxX - minX, 0.0001);
    const rangeY = Math.max(maxY - minY, 0.0001);
    const rangeZ = Math.max(maxZ - minZ, 0.0001);

    const points = sampledVertices.map((vertex) => ({
      x: (vertex.x - minX) / rangeX,
      y: (vertex.y - minY) / rangeY,
      z: (vertex.z - minZ) / rangeZ,
    }));

    const subsets = {
      surface: points.filter((point) => point.z > 0.35),
      contour: points.filter((point) => point.z > 0.22 && (point.x < 0.2 || point.x > 0.8 || point.y > 0.82 || point.y < 0.16)),
      eyeLeft: points.filter((point) => point.z > 0.45 && point.x > 0.25 && point.x < 0.47 && point.y > 0.60 && point.y < 0.78),
      eyeRight: points.filter((point) => point.z > 0.45 && point.x > 0.53 && point.x < 0.75 && point.y > 0.60 && point.y < 0.78),
      brow: points.filter((point) => point.z > 0.35 && point.y > 0.68 && point.y < 0.84),
      nose: points.filter((point) => point.z > 0.48 && point.x > 0.40 && point.x < 0.60 && point.y > 0.42 && point.y < 0.66),
      mouth: points.filter((point) => point.z > 0.35 && point.x > 0.36 && point.x < 0.64 && point.y > 0.28 && point.y < 0.50),
      jaw: points.filter((point) => point.y < 0.36 && point.z > 0.15),
      ear: points.filter((point) => point.z > 0.18 && (point.x < 0.18 || point.x > 0.82) && point.y > 0.40 && point.y < 0.76),
      neck: points.filter((point) => point.y < 0.28),
      aura: points,
    };

    return { points, subsets, bounds: { minX, minY, minZ, maxX, maxY, maxZ } };
  }

  selectPoints(points, count, mode = "balanced") {
    if (!points.length || count <= 0) return [];

    const sorted = [...points].sort((left, right) => {
      if (mode === "ring") {
        const leftAngle = Math.atan2(left.y - 0.5, left.x - 0.5);
        const rightAngle = Math.atan2(right.y - 0.5, right.x - 0.5);
        return leftAngle - rightAngle;
      }

      if (mode === "depth") return right.z - left.z || left.y - right.y || left.x - right.x;
      if (mode === "reverse") return right.y - left.y || left.x - right.x || left.z - right.z;
      return left.y - right.y || left.x - right.x || left.z - right.z;
    });

    const selected = [];
    const total = Math.min(count, sorted.length);

    for (let index = 0; index < total; index++) {
      const sampleIndex = Math.floor(index * sorted.length / total);
      selected.push(sorted[Math.min(sampleIndex, sorted.length - 1)]);
    }

    return selected;
  }

  createFaceLayout() {
    const width = this.lastWidth;
    const height = this.lastHeight;
    const centerX = width * 0.2;
    const centerY = height * 0.62;
    const sizeMultiplier = 1.75;
    const skullH = height * 0.43 * sizeMultiplier;
    const skullW = Math.min(height * 0.33 * sizeMultiplier, width * 0.42 * sizeMultiplier);

    return { centerX, centerY, skullW, skullH };
  }

  projectMeshPoint(point, layout, kind, followWeight = 1) {
    const localX = (point.x - 0.5) * layout.skullW * 0.96;
    const localY = (0.5 - point.y) * layout.skullH * 0.96;
    const localZ = (point.z - 0.5) * layout.skullW * 0.34;

    return {
      kind,
      x: layout.centerX + localX,
      y: layout.centerY + localY,
      localX,
      localY,
      localZ,
      z: point.z,
      followWeight,
      light: this.clamp(0.55 + point.z * 0.45, 0.2, 1),
      depth: point.z,
      size: 1,
    };
  }

  buildNodes() {
    const nodeCount = this.isStatic ? 120 : 220;
    const width = Math.max(1, this.lastWidth);
    const height = Math.max(1, this.lastHeight);

    this.meshBlend = 0;
    this.transitionActive = false;
    this.meshTargets = [];
    this.nodes = Array.from({ length: nodeCount }, () => ({
      kind: "plexus",
      x: Math.random() * width,
      y: Math.random() * height,
      startX: 0,
      startY: 0,
      targetX: 0,
      targetY: 0,
      targetZ: 0,
      followWeight: 1,
      vx: (Math.random() - 0.5) * 0.9,
      vy: (Math.random() - 0.5) * 0.9,
      size: 1 + Math.random() * 0.9,
      twinkle: Math.random() * Math.PI * 2,
      depth: Math.random(),
      light: 1,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  rebuildNodes() {
    if (!this.shouldUseMeshModel()) {
      this.disableMeshModel();
      this.buildNodes();
      return;
    }

    if (!this.meshModel) {
      this.buildNodes();
      this.loadMeshModel();
      return;
    }

    this.meshLoaded = false;
    this.transitionActive = false;
    this.meshBlend = 0;

    this.buildMeshTargets();
    this.meshLoaded = true;
  }

  buildMeshTargets() {
    if (!this.meshModel || !this.nodes.length) return;

    const layout = this.createFaceLayout();
    const mesh = this.meshModel;

    const meshPoints = mesh.points;
    const targets = this.selectMeshPoints(meshPoints, this.nodes.length)
      .map((point) => this.projectMeshPoint(point, layout, "mesh", 1));

    const limitedTargets = targets.slice(0, this.nodes.length);
    if (!limitedTargets.length) {
      this.meshTargets = [];
      this.transitionActive = false;
      this.meshBlend = 0;
      return;
    }

    // Preserve local continuity during morph by matching each live node
    // to its nearest remaining mesh target instead of index pairing.
    const available = limitedTargets.map((target, index) => ({ target, index }));
    const assignedTargets = this.nodes.map((node) => {
      let bestSlot = 0;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (let slot = 0; slot < available.length; slot++) {
        const candidate = available[slot].target;
        const distance = Math.hypot(node.x - candidate.x, node.y - candidate.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestSlot = slot;
        }
      }

      const [{ target }] = available.splice(bestSlot, 1);
      return target;
    });

    this.nodes = this.nodes.map((node, index) => {
      const target = assignedTargets[index] || assignedTargets[assignedTargets.length - 1];
      return {
        ...node,
        startX: node.x,
        startY: node.y,
        targetX: target.x,
        targetY: target.y,
        targetZ: target.z,
        followWeight: target.followWeight,
        kind: target.kind,
        x: node.x,
        y: node.y,
      };
    });

    this.meshTargets = assignedTargets;
    this.meshBlend = 0;
    this.transitionActive = true;
  }

  selectMeshPoints(points, count) {
    if (!points.length || count <= 0) return [];

    const selected = [];
    const used = new Set();
    const distances = new Array(points.length).fill(Number.POSITIVE_INFINITY);

    let seedIndex = 0;
    let seedScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      const score = point.z * 2.25 - Math.abs(point.x - 0.5) * 0.85 - Math.abs(point.y - 0.47) * 0.65;
      if (score > seedScore) {
        seedScore = score;
        seedIndex = index;
      }
    }

    const addPoint = (index) => {
      if (used.has(index)) return;
      used.add(index);
      selected.push(points[index]);

      const anchor = points[index];
      for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
        const candidate = points[pointIndex];
        const distance = Math.hypot(
          candidate.x - anchor.x,
          candidate.y - anchor.y,
          (candidate.z - anchor.z) * 0.85,
        );

        if (distance < distances[pointIndex]) {
          distances[pointIndex] = distance;
        }
      }
    };

    addPoint(seedIndex);

    while (selected.length < count && used.size < points.length) {
      let farthestIndex = -1;
      let farthestDistance = Number.NEGATIVE_INFINITY;

      for (let index = 0; index < points.length; index++) {
        if (used.has(index)) continue;

        const distance = distances[index];
        if (distance > farthestDistance) {
          farthestDistance = distance;
          farthestIndex = index;
        }
      }

      if (farthestIndex === -1) break;
      addPoint(farthestIndex);
    }

    return selected.sort((left, right) =>
      left.y - right.y || left.x - right.x || right.z - left.z
    ).slice(0, count);
  }

  updatePose() {
    const idleX = Math.sin(this.time * 0.0014) * 0.22;
    const idleY = Math.cos(this.time * 0.0011) * 0.12;

    const targetLookX = this.pointer.active
      ? this.clamp((this.pointer.x - this.lastWidth * 0.5) / (this.lastWidth * 0.5), -1, 1)
      : 0;
    const targetLookY = this.pointer.active
      ? this.clamp((this.pointer.y - this.lastHeight * 0.45) / (this.lastHeight * 0.45), -1, 1)
      : 0;

    const lookLerp = this.pointer.active ? 0.16 : 0.08;
    this.smoothedLook.x = this.lerp(this.smoothedLook.x, targetLookX, lookLerp);
    this.smoothedLook.y = this.lerp(this.smoothedLook.y, targetLookY, lookLerp);

    const trackingTarget = this.pointer.active ? 1 : 0;
    this.trackingBlend = this.lerp(this.trackingBlend, trackingTarget, 0.08);

    const trackingSwayX = Math.sin(this.time * 0.0026 + 0.6) * 0.06;
    const trackingSwayY = Math.cos(this.time * 0.0022 + 1.2) * 0.045;
    const trackingX = this.smoothedLook.x * 0.92 + trackingSwayX;
    const trackingY = this.smoothedLook.y * 0.92 + trackingSwayY;

    this.currentPose = {
      x: this.lerp(idleX, trackingX, this.trackingBlend),
      y: this.lerp(idleY, trackingY, this.trackingBlend),
      lookX: this.lerp(idleX * 0.6, this.smoothedLook.x + trackingSwayX * 0.55, this.trackingBlend),
      lookY: this.lerp(idleY * 0.6, this.smoothedLook.y + trackingSwayY * 0.55, this.trackingBlend),
    };

    return this.currentPose;
  }

  update() {
    this.time += 16;
    const pose = this.updatePose();

    if (!this.meshLoaded || !this.meshTargets.length) {
      const width = this.lastWidth;
      const height = this.lastHeight;
      const minSpeed = 0.12;
      const restartSpeed = 0.26;

      for (const node of this.nodes) {
        node.x += node.vx;
        node.y += node.vy;

        if (node.x < 0 || node.x > width) {
          node.vx *= -1;
          node.x = this.clamp(node.x, 0, width);
        }

        if (node.y < 0 || node.y > height) {
          node.vy *= -1;
          node.y = this.clamp(node.y, 0, height);
        }

        node.vx *= 0.985;
        node.vy *= 0.985;

        const speed = Math.hypot(node.vx, node.vy);
        if (speed < minSpeed) {
          const angle = Math.random() * Math.PI * 2;
          node.vx = Math.cos(angle) * restartSpeed;
          node.vy = Math.sin(angle) * restartSpeed;
        }
      }

      return;
    }

    if (this.transitionActive && this.meshBlend < 1) {
      this.meshBlend = Math.min(1, this.meshBlend + 0.018);
      if (this.meshBlend === 1) {
        this.transitionActive = false;
      }
    }

    const offsetX = pose.x * this.lastWidth * 0.045;
    const offsetY = pose.y * this.lastHeight * 0.038;
    const yaw = pose.lookX * 0.42;
    const pitch = -pose.lookY * 0.28;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);

    this.nodes.forEach((node, index) => {
      const target = this.meshTargets[index] || this.meshTargets[this.meshTargets.length - 1];
      const localX = target.localX || 0;
      const localY = target.localY || 0;
      const localZ = target.localZ || 0;

      const yawedX = localX * cosYaw + localZ * sinYaw;
      const yawedZ = localZ * cosYaw - localX * sinYaw;
      const pitchedY = localY * cosPitch - yawedZ * sinPitch;
      const pitchedZ = yawedZ * cosPitch + localY * sinPitch;
      const perspective = 1 + pitchedZ * 0.0016;
      const rotatedX = yawedX * perspective;
      const rotatedY = pitchedY * perspective;
      const rotateOffsetX = rotatedX - localX;
      const rotateOffsetY = rotatedY - localY;

      if (this.meshBlend < 1) {
        const baseX = this.lerp(node.startX, target.x, this.meshBlend);
        const baseY = this.lerp(node.startY, target.y, this.meshBlend);
        node.x = baseX;
        node.y = baseY;
      } else {
        node.x = target.x + offsetX * target.followWeight + rotateOffsetX;
        node.y = target.y + offsetY * target.followWeight + rotateOffsetY;
      }

      node.z = target.z;
      node.kind = target.kind;
      node.depth = this.clamp(0.45 + target.z * 0.55, 0.3, 1);
      node.light = target.z;
      node.scale = 1;
    });
  }

  getNodeStyle(node) {
    const palettes = {
      outline: [173, 216, 255],
      skull: [147, 205, 255],
      "eye-left": [245, 250, 255],
      "eye-right": [245, 250, 255],
      brow: [160, 214, 255],
      nose: [150, 208, 255],
      mouth: [120, 188, 255],
      jaw: [118, 176, 240],
      ear: [126, 190, 250],
      neck: [100, 162, 228],
      mesh: [205, 233, 255],
      plexus: [176, 224, 255],
    };

    return palettes[node.kind] || palettes.plexus;
  }

  drawFrame() {
    const { ctx, nodes } = this;
    const width = this.lastWidth;
    const height = this.lastHeight;

    ctx.clearRect(0, 0, width, height);

    if (!nodes.length) return;

    const blend = this.meshLoaded ? this.meshBlend : 0;
    const pose = this.meshLoaded ? this.currentPose : { x: 0, y: 0 };
    const glow = ctx.createRadialGradient(
      width * 0.5 + pose.x * 30,
      height * 0.5 - 10,
      16,
      width * 0.5 + pose.x * 24,
      height * 0.5 - 12,
      Math.max(width, height) * 0.45,
    );
    const glowAlpha = this.lerp(0.10, 0.16, blend);
    glow.addColorStop(0, `rgba(96, 165, 250, ${glowAlpha})`);
    glow.addColorStop(1, "rgba(15, 23, 42, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const maxDist = this.lerp(165, 138, blend);
    const lineOpacity = this.lerp(0.18, 0.34, blend);

    for (let i = 0; i < nodes.length; i++) {
      const left = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const right = nodes[j];
        const dx = left.x - right.x;
        const dy = left.y - right.y;
        const dist = Math.hypot(dx, dy);

        if (dist >= maxDist) continue;

        const alpha = this.clamp((1 - dist / maxDist) * lineOpacity, 0, lineOpacity);
        ctx.beginPath();
        ctx.moveTo(left.x, left.y);
        ctx.lineTo(right.x, right.y);
        ctx.strokeStyle = `rgba(185, 221, 255, ${alpha})`;
        ctx.lineWidth = this.lerp(0.65, 0.8, blend);
        ctx.stroke();
      }
    }

    for (const node of nodes) {
      const [r, g, b] = this.getNodeStyle(node);
      const plexusRadius = node.kind === "eye-left" || node.kind === "eye-right"
        ? 3.0
        : node.kind === "nose"
          ? 2.4
          : node.kind === "mouth"
            ? 2.1
            : 2.0;
      const meshRadius = 1.2 + node.depth * 1.0;
      const radius = this.lerp(plexusRadius, meshRadius, blend);
      const meshAlpha = this.clamp(0.28 + node.depth * 0.75, 0.18, 0.92);
      const alpha = this.lerp(0.78, meshAlpha, blend);

      ctx.beginPath();
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  stop() {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  tick() {
    if (!this.running) return;
    this.update();
    this.drawFrame();
    this.rafId = requestAnimationFrame(() => this.tick());
  }
}

class ContactFormController {
  constructor(form) {
    this.form = form;
    this.isSubmitting = false;
    this.submitButton = this.form.querySelector('button[type="submit"]');

    this.bindEvents();
  }

  bindEvents() {
    this.form.addEventListener("submit", (event) => this.handleSubmit(event));
  }

  async handleSubmit(event) {
    if (this.isSubmitting) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    this.isSubmitting = true;

    if (this.submitButton) {
      this.submitButton.disabled = true;
    }

    const formData = new FormData(this.form);
    const name = formData.get("name")?.toString().trim() || "";
    const email = formData.get("email")?.toString().trim() || "";

    try {
      await loadExternalScript("https://nash.gatewaycorporate.org/api/devicer/snippet?key=c0d96747-b2c5-4fc3-bcd6-215bad9dedae");

      if (window.Devicer?.submitContact && name && email) {
        await window.Devicer.submitContact({
          name,
          emails: [{ address: email, isPrimary: true }],
        });
      }
    } catch (error) {
      console.error("Devicer contact submission failed:", error);
    } finally {
      this.form.submit();
    }
  }
}

function setupDeferredContactAssets() {
  const contactSection = document.getElementById("contact");
  if (!contactSection) {
    return;
  }

  const loadRecaptcha = () => loadExternalScript("https://www.google.com/recaptcha/api.js");

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadRecaptcha();
        observer.disconnect();
      }
    }, { rootMargin: "250px 0px" });

    observer.observe(contactSection);
  }

  contactSection.addEventListener("focusin", loadRecaptcha, { once: true });
  contactSection.addEventListener("pointerenter", loadRecaptcha, { once: true });
}

function setupAnchorNavigation() {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const anchor = target.closest('a[href^="#"]');
    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }

    const href = anchor.getAttribute("href") || "";
    if (href.length <= 1) {
      return;
    }

    const destination = document.querySelector(href);
    if (!(destination instanceof HTMLElement)) {
      return;
    }

    event.preventDefault();

    const navbarHeight = document.querySelector(".navbar")?.getBoundingClientRect().height || 0;
    const productNavbarHeight = document.querySelector(".product-navbar")?.getBoundingClientRect().height || 0;
    const top = window.scrollY + destination.getBoundingClientRect().top - navbarHeight - productNavbarHeight - 20;

    window.scrollTo({
      top: Math.max(0, top),
      behavior: "smooth",
    });
  });
}

function initializePage() {
  new NavbarController();

  const startNetworkGraphs = () => {
    document.querySelectorAll("canvas#network-graph").forEach((canvas) => {
      new NetworkGraph(canvas);
    });
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(startNetworkGraphs, { timeout: 1200 });
  } else {
    window.setTimeout(startNetworkGraphs, 150);
  }

  const contactForm = document.getElementById("contact-form");
  if (contactForm instanceof HTMLFormElement) {
    new ContactFormController(contactForm);
  }

  setupAnchorNavigation();
  setupDeferredContactAssets();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePage, { once: true });
} else {
  initializePage();
}