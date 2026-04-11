const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
if (urlParams.has('referral')) {
  const referral = urlParams.get('referral');
  if (referral) {
    const input = document.querySelector('input[name="referral"]');
    if (input) {
      input.value = referral;
    }
  }
}

// Enhanced Navbar Functionality
class NavbarController {
  constructor() {
    this.navbar = document.querySelector(".navbar");
    this.menuBtn = document.getElementById("menu-btn");
    this.dropdownMenu = document.getElementById("dropdown-menu");
    this.scrollProgress = document.querySelector(
      ".scroll-progress",
    );
    this.lastScrollY = window.scrollY;
    this.isMenuOpen = false;
    this._openTimeout = null;
    this._closeTimeout = null;

    this.init();
  }

  init() {
    this.bindEvents();
    this.updateScrollProgress();
  }

  bindEvents() {
    if (this.menuBtn) {
      // Menu toggle
      this.menuBtn.addEventListener(
        "click",
        () => this.toggleMenu(),
      );
    }

    if (this.dropdownMenu) {
      // Close menu when clicking on links
      this.dropdownMenu.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => this.closeMenu());
      });
    }

    // Close menu on escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isMenuOpen) {
        this.closeMenu();
      }
    });

    // Scroll events
    window.addEventListener("scroll", () => {
      this.handleScroll();
      this.updateScrollProgress();
    }, { passive: true });

    // Resize event
    window.addEventListener("resize", () => {
      if (window.innerWidth > 768 && this.isMenuOpen) {
        this.closeMenu();
      }
    });
  }

  toggleMenu() {
    if (this.isMenuOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  openMenu() {
    clearTimeout(this._closeTimeout);
    this._closeTimeout = null;

    this.isMenuOpen = true;
    this.menuBtn.classList.add("open");
    this.dropdownMenu.style.display = "block";

    // Trigger reflow for animation
    this.dropdownMenu.offsetHeight;

    this.dropdownMenu.classList.add("show");
    document.body.style.overflow = "hidden";

    // Add entrance animation to menu items
    this._openTimeout = setTimeout(() => {
      this._openTimeout = null;
      this.dropdownMenu.querySelectorAll("li").forEach(
        (item, index) => {
          item.style.animationDelay = `${index * 0.1}s`;
          item.classList.add("animate-in");
        },
      );
    }, 100);
  }

  closeMenu() {
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
    const currentScrollY = window.scrollY;

    // Add scrolled class for styling
    if (currentScrollY > 100) {
      this.navbar.classList.add("scrolled");
    } else {
      this.navbar.classList.remove("scrolled");
    }

    // Hide/show navbar on scroll
    if (
      currentScrollY > this.lastScrollY && currentScrollY > 100
    ) {
      this.navbar.classList.add("hidden");
    } else {
      this.navbar.classList.remove("hidden");
    }

    this.lastScrollY = currentScrollY;
  }

  updateScrollProgress() {
    const winScroll = document.body.scrollTop ||
      document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight -
      document.documentElement.clientHeight;
    const scrolled = (winScroll / height) * 100;
    this.scrollProgress.style.width = scrolled + "%";
  }
}

// Plexus Network Graph Animation
class NetworkGraph {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.nodes = [];
    this.nodeCount = 50;
    this.maxDist = 250;
    this.rafId = null;
    this.running = false;
    this.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    this.resize();
    this.initNodes();

    if (this.reducedMotion) {
      this.drawFrame();
    } else {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) this.start();
          else this.stop();
        });
      });
      observer.observe(canvas);
    }

    this.lastWidth = this.canvas.width;

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const newWidth = this.canvas.parentElement.offsetWidth;
        // Ignore height-only changes (mobile browser chrome show/hide on scroll)
        if (newWidth === this.lastWidth) return;
        const wasRunning = this.running;
        this.stop();
        const scaleX = newWidth / (this.canvas.width || 1);
        const newHeight = this.canvas.parentElement.offsetHeight;
        const scaleY = newHeight / (this.canvas.height || 1);
        this.canvas.width = newWidth;
        this.canvas.height = newHeight;
        this.lastWidth = newWidth;
        // Scale existing node positions instead of reinitialising
        for (const node of this.nodes) {
          node.x *= scaleX;
          node.y *= scaleY;
        }
        if (this.reducedMotion) {
          this.drawFrame();
        } else if (wasRunning) {
          this.start();
        }
      }, 150);
    });
  }

  resize() {
    const hero = this.canvas.parentElement;
    this.canvas.width = hero.offsetWidth;
    this.canvas.height = hero.offsetHeight;
  }

  initNodes() {
    this.nodes = Array.from({ length: this.nodeCount }, () => ({
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
    }));
  }

  drawFrame() {
    const { ctx, canvas, nodes, maxDist } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist) {
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.strokeStyle = `rgba(255,255,255,${(1 - dist / maxDist) * 0.35})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }
    }

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (const node of nodes) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  update() {
    const { canvas, nodes } = this;
    for (const node of nodes) {
      node.x += node.vx;
      node.y += node.vy;
      if (node.x < 0) node.x += canvas.width;
      else if (node.x > canvas.width) node.x -= canvas.width;
      if (node.y < 0) node.y += canvas.height;
      else if (node.y > canvas.height) node.y -= canvas.height;
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

// Initialize navbar when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new NavbarController();
  document.querySelectorAll("canvas#network-graph").forEach((canvas) => {
    new NetworkGraph(canvas);
  });
});