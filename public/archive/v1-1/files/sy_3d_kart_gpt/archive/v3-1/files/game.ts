import * as THREE from "three";
import * as CANNON from "cannon-es";

type ImageAsset = { name: string; path: string; width: number; height: number };
type SoundAsset = {
  name: string;
  path: string;
  duration_seconds: number;
  volume: number;
};
type AssetsBlock = { images: ImageAsset[]; sounds: SoundAsset[] };
type GameData = {
  title: string;
  track: { radius: number; length: number; lanes: number };
  kart: {
    mass: number;
    maxSpeed: number;
    accel: number;
    turnSpeed: number;
    width: number;
    length: number;
  };
  assets: AssetsBlock;
  ui: { titleText: string; startHint: string };
};

class AssetLoader {
  data!: GameData;
  imageMap = new Map<string, HTMLImageElement>();
  textureMap = new Map<string, THREE.Texture>();
  audioMap = new Map<string, HTMLAudioElement>();

  async loadConfig() {
    const res = await fetch("data.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch data.json");
    this.data = (await res.json()) as GameData;
  }

  async loadImages(onProgress?: (n: number, total: number) => void) {
    const images = this.data.assets.images;
    const total = images.length;
    let loaded = 0;
    await Promise.all(
      images.map(
        (img) =>
          new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.src = img.path;
            image.onload = () => {
              this.imageMap.set(img.name, image);
              const tex = new THREE.Texture(image);
              tex.needsUpdate = true;
              tex.magFilter = THREE.LinearFilter;
              tex.minFilter = THREE.LinearMipmapLinearFilter;
              this.textureMap.set(img.name, tex);
              loaded++;
              onProgress?.(loaded, total);
              resolve();
            };
            image.onerror = (e) => reject(e);
          })
      )
    );
  }

  async loadAudio(onProgress?: (n: number, total: number) => void) {
    const sounds = this.data.assets.sounds;
    const total = sounds.length;
    let loaded = 0;
    await Promise.all(
      sounds.map(
        (s) =>
          new Promise<void>((resolve, reject) => {
            const audio = new Audio();
            audio.src = s.path;
            audio.preload = "auto";
            audio.volume = s.volume;
            audio.addEventListener(
              "canplaythrough",
              () => {
                this.audioMap.set(s.name, audio);
                loaded++;
                onProgress?.(loaded, total);
                resolve();
              },
              { once: true }
            );
            audio.addEventListener("error", (ev) => {
              // still resolve so a missing audio won't lock the loader
              loaded++;
              onProgress?.(loaded, total);
              resolve();
            });
          })
      )
    );
  }
}

class KartGame {
  canvas: HTMLCanvasElement;
  loader = new AssetLoader();
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  light!: THREE.DirectionalLight;
  world!: CANNON.World;
  kartBody!: CANNON.Body;
  kartMesh!: THREE.Mesh;
  trackMesh!: THREE.Mesh;
  clock = new THREE.Clock();
  inputState = { forward: 0, steer: 0, brake: false };
  running = false;
  uiRoot!: HTMLDivElement;
  titleScreen!: HTMLDivElement;
  hud!: HTMLDivElement;
  speedElement!: HTMLDivElement;
  lapElement!: HTMLDivElement;
  engineAudio?: HTMLAudioElement;
  bgmAudio?: HTMLAudioElement;
  lastTime = 0;
  laps = 0;
  lapStartX = 0;
  kartMaterial!: CANNON.Material; // Added kart material

  constructor(canvasId = "gameCanvas") {
    const el = document.getElementById(canvasId);
    if (!el || !(el instanceof HTMLCanvasElement))
      throw new Error("Canvas with id 'gameCanvas' not found.");
    this.canvas = el;
  }

  async init() {
    await this.loader.loadConfig();
    // Create UI early so progress can show
    this.createUI();
    // Show loading message
    this.showTitleScreenLoading("Loading assets...");
    await this.loader.loadImages((n, t) =>
      this.showTitleScreenLoading(`Loading images ${n}/${t}...`)
    );
    await this.loader.loadAudio((n, t) =>
      this.showTitleScreenLoading(`Loading audio ${n}/${t}...`)
    );

    // assign audios
    this.engineAudio = this.loader.audioMap.get("engine")?.cloneNode(true) as
      | HTMLAudioElement
      | undefined;
    this.bgmAudio = this.loader.audioMap.get("bgm")?.cloneNode(true) as
      | HTMLAudioElement
      | undefined;

    if (this.bgmAudio) {
      this.bgmAudio.loop = true;
      this.bgmAudio.volume = this.bgmAudio.volume * 0.6;
    }
    // Compose the scene
    this.setupThree();
    this.setupWorld();
    this.createTrack();
    this.createKart();
    this.createLights();
    this.createHUD();
    this.showTitleScreen(); // title waits for input
    this.attachInput();
    this.onResize();
    window.addEventListener("resize", () => this.onResize());
    // keep lastTime for physics timing
    this.lastTime = performance.now();
    // start render loop regardless, but game.run won't simulate until started
    this.animate();
  }

  createUI() {
    // root overlay
    this.uiRoot = document.createElement("div");
    Object.assign(this.uiRoot.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      fontFamily: "Arial, Helvetica, sans-serif",
    } as CSSStyleDeclaration);
    document.body.appendChild(this.uiRoot);

    // Title screen
    this.titleScreen = document.createElement("div");
    Object.assign(this.titleScreen.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      background: "rgba(0,0,0,0.55)",
      color: "white",
      pointerEvents: "auto",
      gap: "18px",
    } as CSSStyleDeclaration);
    this.uiRoot.appendChild(this.titleScreen);
  }

  showTitleScreenLoading(text: string) {
    this.titleScreen.innerHTML = "";
    const t = document.createElement("div");
    t.innerText = text;
    Object.assign(t.style, { fontSize: "20px" } as CSSStyleDeclaration);
    this.titleScreen.appendChild(t);
  }

  showTitleScreen() {
    this.titleScreen.innerHTML = "";
    const title = document.createElement("div");
    title.innerText = this.loader.data.ui?.titleText ?? this.loader.data.title;
    Object.assign(title.style, {
      fontSize: "44px",
      fontWeight: "700",
    } as CSSStyleDeclaration);
    const hint = document.createElement("div");
    hint.innerText =
      this.loader.data.ui?.startHint ?? "Press Enter or Click to Start";
    Object.assign(hint.style, {
      fontSize: "18px",
      opacity: "0.9",
    } as CSSStyleDeclaration);
    const instructions = document.createElement("div");
    instructions.innerText =
      "Arrows / A D to steer, W to accelerate, S to brake.";
    Object.assign(instructions.style, {
      fontSize: "14px",
      opacity: "0.9",
    } as CSSStyleDeclaration);

    this.titleScreen.appendChild(title);
    this.titleScreen.appendChild(hint);
    this.titleScreen.appendChild(instructions);

    // start on click or Enter
    const startNow = () => {
      this.titleScreen.style.display = "none";
      this.startGame();
      window.removeEventListener("keydown", onKey);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") startNow();
    };
    this.titleScreen.addEventListener("click", () => startNow(), {
      once: true,
    });
    window.addEventListener("keydown", onKey);
  }

  createHUD() {
    this.hud = document.createElement("div");
    Object.assign(this.hud.style, {
      position: "absolute",
      right: "12px",
      top: "12px",
      color: "white",
      fontSize: "16px",
      pointerEvents: "none",
      textAlign: "right",
      textShadow: "0 0 6px rgba(0,0,0,0.8)",
    } as CSSStyleDeclaration);
    this.speedElement = document.createElement("div");
    this.speedElement.innerText = "Speed: 0";
    this.lapElement = document.createElement("div");
    this.lapElement.innerText = "Lap: 0";
    this.hud.appendChild(this.speedElement);
    this.hud.appendChild(this.lapElement);
    this.uiRoot.appendChild(this.hud);
  }

  setupThree() {
    this.scene = new THREE.Scene();
    // find canvas provided by HTML
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.camera.position.set(0, 6, -12);
    this.camera.lookAt(0, 0, 0);
    // ambient
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  }

  setupWorld() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    });

    const groundMat = new CANNON.Material("groundMat");
    const kartMat = new CANNON.Material("kartMat"); // Define kart material
    this.kartMaterial = kartMat; // Store it for use in createKart

    // ground plane
    const ground = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: groundMat,
    });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);

    // Create a contact material for ground and kart interaction
    const groundKartContactMat = new CANNON.ContactMaterial(groundMat, kartMat, {
      friction: 0.8, // Increased friction for better grip and forward motion
      restitution: 0.1, // Low restitution for less bouncy collisions
    });
    this.world.addContactMaterial(groundKartContactMat);
  }

  createLights() {
    this.light = new THREE.DirectionalLight(0xffffff, 0.8);
    this.light.position.set(10, 20, 10);
    this.scene.add(this.light);
  }

  createTrack() {
    // Simple circular track represented by a large textured ring on the XZ plane.
    const trackRadius = this.loader.data.track.radius ?? 20;
    const innerRadius = trackRadius - 4;
    const outerRadius = trackRadius + 4;
    const segments = 64;
    // Use one of the images as texture (if provided), otherwise fall back to color
    const trackTex = this.loader.textureMap.get("track") ?? null;
    const geo = new THREE.RingGeometry(innerRadius, outerRadius, segments);
    const mat = new THREE.MeshStandardMaterial({
      map: trackTex ?? undefined,
      side: THREE.DoubleSide,
      roughness: 1.0,
    });
    this.trackMesh = new THREE.Mesh(geo, mat);
    this.trackMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.trackMesh);

    // Add simple environment plane (grass) using image if available
    const grassTex = this.loader.textureMap.get("grass") ?? null;
    const planeGeo = new THREE.PlaneGeometry(400, 400);
    const planeMat = new THREE.MeshStandardMaterial({
      map: grassTex ?? undefined,
    });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.01;
    this.scene.add(plane);
  }

  createKart() {
    // Physics body: simple box
    const kcfg = this.loader.data.kart;
    const halfExtents = new CANNON.Vec3(kcfg.width / 2, 0.5, kcfg.length / 2);
    const shape = new CANNON.Box(halfExtents);
    this.kartBody = new CANNON.Body({ mass: kcfg.mass, material: this.kartMaterial }); // Assign kart material
    this.kartBody.addShape(shape);
    // Add angular damping to prevent excessive spinning and stabilize rotation
    this.kartBody.angularDamping = 0.9; // Value between 0 (no damping) and 1 (full damping)
    // spawn at track start
    const startRadius = this.loader.data.track.radius;
    this.kartBody.position.set(startRadius, 0.5, 0);
    this.world.addBody(this.kartBody);

    // Visual mesh: use image texture mapped to a box
    const kartTex = this.loader.textureMap.get("player") ?? null;
    const geom = new THREE.BoxGeometry(kcfg.width, 0.6, kcfg.length);
    const mats: THREE.Material[] = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.MeshStandardMaterial({ map: kartTex ?? undefined });
      mats.push(m);
    }
    this.kartMesh = new THREE.Mesh(geom, mats);
    this.kartMesh.castShadow = true;
    this.scene.add(this.kartMesh);

    // small camera chase offset will update during loop
  }

  attachInput() {
    window.addEventListener("keydown", (e) => {
      if (e.key === "w" || e.key === "ArrowUp") this.inputState.forward = 1;
      if (e.key === "s" || e.key === "ArrowDown") this.inputState.forward = -1;
      if (e.key === "a" || e.key === "ArrowLeft") this.inputState.steer = 1;
      if (e.key === "d" || e.key === "ArrowRight") this.inputState.steer = -1;
      if (e.key === " ") this.inputState.brake = true;
    });
    window.addEventListener("keyup", (e) => {
      if (
        (e.key === "w" || e.key === "ArrowUp") &&
        this.inputState.forward === 1
      )
        this.inputState.forward = 0;
      if (
        (e.key === "s" || e.key === "ArrowDown") &&
        this.inputState.forward === -1
      )
        this.inputState.forward = 0;
      if (
        (e.key === "a" || e.key === "ArrowLeft") &&
        this.inputState.steer === 1
      )
        this.inputState.steer = 0;
      if (
        (e.key === "d" || e.key === "ArrowRight") &&
        this.inputState.steer === -1
      )
        this.inputState.steer = 0;
      if (e.key === " ") this.inputState.brake = false;
    });

    // simple touch / click controls: tap left/right to steer, top/bottom for accel/brake
    this.canvas.addEventListener(
      "pointerdown",
      (ev) => {
        const rect = this.canvas.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const y = ev.clientY - rect.top;
        const cx = rect.width / 2;
        if (y < rect.height * 0.6) this.inputState.forward = 1;
        else this.inputState.brake = true;
        if (x < cx * 0.6) this.inputState.steer = 1;
        else if (x > cx * 1.4) this.inputState.steer = -1;
      },
      { passive: true }
    );
    this.canvas.addEventListener(
      "pointerup",
      () => {
        this.inputState.forward = 0;
        this.inputState.steer = 0;
        this.inputState.brake = false;
      },
      { passive: true }
    );
  }

  startGame() {
    if (this.running) return;
    this.running = true;
    if (this.bgmAudio)
      try {
        this.bgmAudio.play();
      } catch {}
    if (this.engineAudio) {
      this.engineAudio.loop = true;
      try {
        this.engineAudio.play();
      } catch {}
    }
    this.laps = 0;
    this.lapStartX = this.kartBody.position.x;
  }

  stopGame() {
    this.running = false;
    if (this.bgmAudio)
      try {
        this.bgmAudio.pause();
        this.bgmAudio.currentTime = 0;
      } catch {}
    if (this.engineAudio)
      try {
        this.engineAudio.pause();
        this.engineAudio.currentTime = 0;
      } catch {}
  }

  applyPhysics(dt: number) {
    const kcfg = this.loader.data.kart;
    // Forward vector from kart orientation (Cannon body quaternion)
    const q = this.kartBody.quaternion;
    const forward = new CANNON.Vec3(0, 0, 1);
    q.vmult(forward, forward); // rotate local forward to world
    // compute speed along forward
    const vel = this.kartBody.velocity;
    const speed = vel.dot(forward);

    // acceleration/braking
    const desiredAccel = this.inputState.forward * kcfg.accel;
    // simple throttle: apply force in forward direction
    if (desiredAccel !== 0) {
      const force = forward.scale(desiredAccel * this.kartBody.mass);
      this.kartBody.applyForce(force, this.kartBody.position);
    }

    // braking: apply dampening
    if (this.inputState.brake) {
      const brakeFactor = 0.95;
      this.kartBody.velocity.scale(brakeFactor, this.kartBody.velocity);
    }

    // limit speed
    const maxSpeed = kcfg.maxSpeed;
    const currentSpeed = this.kartBody.velocity.length();
    if (currentSpeed > maxSpeed) {
      // scale down velocity
      this.kartBody.velocity.scale(
        maxSpeed / currentSpeed,
        this.kartBody.velocity
      );
    }

    // steering: apply torque around Y to rotate body
    // Steering effectiveness reduces at higher speed for realism
    const steerInput = this.inputState.steer;
    if (Math.abs(steerInput) > 0.01) {
      const steerStrength =
        kcfg.turnSpeed * (0.5 + Math.max(0, 1 - currentSpeed / maxSpeed));
      const torque = new CANNON.Vec3(
        0,
        steerInput * steerStrength * this.kartBody.mass, // Modified: Removed dt * 60 for consistent torque application
        0
      );
      this.kartBody.torque.vadd(torque, this.kartBody.torque);
    }

    // Small linear drag
    const drag = 0.995;
    const dragFactor = Math.pow(drag, dt * 60); // Calculate once
    this.kartBody.velocity.scale(
      dragFactor,
      this.kartBody.velocity
    );
    // Custom angular drag removed; relying on kartBody.angularDamping for stabilization.
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 1 / 30);
    this.lastTime = now;
    if (this.running) {
      // physics stepping
      this.applyPhysics(dt);
      // world step fixed
      this.world.step(1 / 60, dt, 3);
      // sync visuals
      this.kartMesh.position.set(
        this.kartBody.position.x,
        this.kartBody.position.y - 0.25,
        this.kartBody.position.z
      );
      const qb = this.kartBody.quaternion;
      this.kartMesh.quaternion.set(qb.x, qb.y, qb.z, qb.w);

      // update laps (simple: cross X > start threshold)
      const prevX = this.lapStartX;
      if (prevX < 0 && this.kartBody.position.x >= 0) {
        this.laps++;
        this.lapStartX = this.kartBody.position.x;
      } else if (prevX >= 0 && this.kartBody.position.x < 0) {
        this.laps++;
        this.lapStartX = this.kartBody.position.x;
      }
    }

    // update camera to follow kart
    const desiredCamPos = new THREE.Vector3();
    desiredCamPos.copy(this.kartMesh.position as unknown as THREE.Vector3);
    // offset behind kart based on kart orientation
    const forwardVec = new THREE.Vector3(0, 0, 1).applyQuaternion(
      this.kartMesh.quaternion
    );
    const back = forwardVec.clone().multiplyScalar(-8);
    desiredCamPos.add(new THREE.Vector3(0, 4, 0)).add(back);
    // smooth move
    this.camera.position.lerp(desiredCamPos, 0.12);
    this.camera.lookAt(this.kartMesh.position as unknown as THREE.Vector3);

    // update HUD
    const speed = Math.round(this.kartBody.velocity.length() * 3.6); // convert to arbitrary km/h feel
    this.speedElement.innerText = `Speed: ${speed}`;
    this.lapElement.innerText = `Lap: ${this.laps}`;

    // engine audio pitch based on speed
    if (this.engineAudio) {
      try {
        this.engineAudio.playbackRate =
          0.6 +
          Math.min(
            2.0,
            0.6 +
              (this.kartBody.velocity.length() /
                this.loader.data.kart.maxSpeed) *
                1.5
          );
      } catch {}
    }

    this.renderer.render(this.scene, this.camera);
  };

  onResize() {
    const w = this.canvas.clientWidth || this.canvas.width || window.innerWidth;
    const h =
      this.canvas.clientHeight || this.canvas.height || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

// Entry point
(async () => {
  try {
    const game = new KartGame("gameCanvas");
    await game.init();
  } catch (err) {
    // create a simple overlay error so user can see
    const errDiv = document.createElement("div");

    Object.assign(errDiv.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "white",
      background: "black",
      padding: "20px",
      boxSizing: "border-box",
      fontFamily: "monospace",
    } as CSSStyleDeclaration);

    errDiv.innerText = `Game init error: ${String(err)}`;
    document.body.appendChild(errDiv);

    console.error(err);
  }
})();