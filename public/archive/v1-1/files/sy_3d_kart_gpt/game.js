import * as THREE from "three";
import * as CANNON from "cannon-es";
class AssetLoader {
  constructor() {
    this.imageMap = /* @__PURE__ */ new Map();
    this.textureMap = /* @__PURE__ */ new Map();
    this.audioMap = /* @__PURE__ */ new Map();
  }
  async loadConfig() {
    const res = await fetch("data.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch data.json");
    this.data = await res.json();
  }
  async loadImages(onProgress) {
    const images = this.data.assets.images;
    const total = images.length;
    let loaded = 0;
    await Promise.all(
      images.map(
        (img) => new Promise((resolve, reject) => {
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
  async loadAudio(onProgress) {
    const sounds = this.data.assets.sounds;
    const total = sounds.length;
    let loaded = 0;
    await Promise.all(
      sounds.map(
        (s) => new Promise((resolve, reject) => {
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
  // Added kart material
  constructor(canvasId = "gameCanvas") {
    this.loader = new AssetLoader();
    this.clock = new THREE.Clock();
    this.inputState = { forward: 0, steer: 0, brake: false };
    this.running = false;
    this.lastTime = 0;
    this.laps = 0;
    this.lapStartX = 0;
    this.animate = () => {
      requestAnimationFrame(this.animate);
      const now = performance.now();
      const dt = Math.min((now - this.lastTime) / 1e3, 1 / 30);
      this.lastTime = now;
      if (this.running) {
        this.applyPhysics(dt);
        this.world.step(1 / 60, dt, 3);
        this.kartMesh.position.set(
          this.kartBody.position.x,
          this.kartBody.position.y - 0.25,
          this.kartBody.position.z
        );
        const qb = this.kartBody.quaternion;
        this.kartMesh.quaternion.set(qb.x, qb.y, qb.z, qb.w);
        const prevX = this.lapStartX;
        if (prevX < 0 && this.kartBody.position.x >= 0) {
          this.laps++;
          this.lapStartX = this.kartBody.position.x;
        } else if (prevX >= 0 && this.kartBody.position.x < 0) {
          this.laps++;
          this.lapStartX = this.kartBody.position.x;
        }
      }
      const desiredCamPos = new THREE.Vector3();
      desiredCamPos.copy(this.kartMesh.position);
      const forwardVec = new THREE.Vector3(0, 0, 1).applyQuaternion(
        this.kartMesh.quaternion
      );
      const back = forwardVec.clone().multiplyScalar(-8);
      desiredCamPos.add(new THREE.Vector3(0, 4, 0)).add(back);
      this.camera.position.lerp(desiredCamPos, 0.12);
      this.camera.lookAt(this.kartMesh.position);
      const speed = Math.round(this.kartBody.velocity.length() * 3.6);
      this.speedElement.innerText = `Speed: ${speed}`;
      this.lapElement.innerText = `Lap: ${this.laps}`;
      if (this.engineAudio) {
        try {
          this.engineAudio.playbackRate = 0.6 + Math.min(
            2,
            0.6 + this.kartBody.velocity.length() / this.loader.data.kart.maxSpeed * 1.5
          );
        } catch {
        }
      }
      this.renderer.render(this.scene, this.camera);
    };
    const el = document.getElementById(canvasId);
    if (!el || !(el instanceof HTMLCanvasElement))
      throw new Error("Canvas with id 'gameCanvas' not found.");
    this.canvas = el;
  }
  async init() {
    await this.loader.loadConfig();
    this.createUI();
    this.showTitleScreenLoading("Loading assets...");
    await this.loader.loadImages(
      (n, t) => this.showTitleScreenLoading(`Loading images ${n}/${t}...`)
    );
    await this.loader.loadAudio(
      (n, t) => this.showTitleScreenLoading(`Loading audio ${n}/${t}...`)
    );
    this.engineAudio = this.loader.audioMap.get("engine")?.cloneNode(true);
    this.bgmAudio = this.loader.audioMap.get("bgm")?.cloneNode(true);
    if (this.bgmAudio) {
      this.bgmAudio.loop = true;
      this.bgmAudio.volume = this.bgmAudio.volume * 0.6;
    }
    this.setupThree();
    this.setupWorld();
    this.createTrack();
    this.createKart();
    this.createLights();
    this.createHUD();
    this.showTitleScreen();
    this.attachInput();
    this.onResize();
    window.addEventListener("resize", () => this.onResize());
    this.lastTime = performance.now();
    this.animate();
  }
  createUI() {
    this.uiRoot = document.createElement("div");
    Object.assign(this.uiRoot.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      fontFamily: "Arial, Helvetica, sans-serif"
    });
    document.body.appendChild(this.uiRoot);
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
      gap: "18px"
    });
    this.uiRoot.appendChild(this.titleScreen);
  }
  showTitleScreenLoading(text) {
    this.titleScreen.innerHTML = "";
    const t = document.createElement("div");
    t.innerText = text;
    Object.assign(t.style, { fontSize: "20px" });
    this.titleScreen.appendChild(t);
  }
  showTitleScreen() {
    this.titleScreen.innerHTML = "";
    const title = document.createElement("div");
    title.innerText = this.loader.data.ui?.titleText ?? this.loader.data.title;
    Object.assign(title.style, {
      fontSize: "44px",
      fontWeight: "700"
    });
    const hint = document.createElement("div");
    hint.innerText = this.loader.data.ui?.startHint ?? "Press Enter or Click to Start";
    Object.assign(hint.style, {
      fontSize: "18px",
      opacity: "0.9"
    });
    const instructions = document.createElement("div");
    instructions.innerText = "Arrows / A D to steer, W to accelerate, S to brake.";
    Object.assign(instructions.style, {
      fontSize: "14px",
      opacity: "0.9"
    });
    this.titleScreen.appendChild(title);
    this.titleScreen.appendChild(hint);
    this.titleScreen.appendChild(instructions);
    const startNow = () => {
      this.titleScreen.style.display = "none";
      this.startGame();
      window.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => {
      if (e.key === "Enter" || e.key === " ") startNow();
    };
    this.titleScreen.addEventListener("click", () => startNow(), {
      once: true
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
      textShadow: "0 0 6px rgba(0,0,0,0.8)"
    });
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
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true
    });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1e3);
    this.camera.position.set(0, 6, -12);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.AmbientLight(16777215, 0.6));
  }
  setupWorld() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0)
    });
    const groundMat = new CANNON.Material("groundMat");
    const kartMat = new CANNON.Material("kartMat");
    this.kartMaterial = kartMat;
    const ground = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: groundMat
    });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
    const groundKartContactMat = new CANNON.ContactMaterial(groundMat, kartMat, {
      friction: 0.8,
      // Increased friction for better grip and forward motion
      restitution: 0.1
      // Low restitution for less bouncy collisions
    });
    this.world.addContactMaterial(groundKartContactMat);
  }
  createLights() {
    this.light = new THREE.DirectionalLight(16777215, 0.8);
    this.light.position.set(10, 20, 10);
    this.scene.add(this.light);
  }
  createTrack() {
    const trackRadius = this.loader.data.track.radius ?? 20;
    const innerRadius = trackRadius - 4;
    const outerRadius = trackRadius + 4;
    const segments = 64;
    const trackTex = this.loader.textureMap.get("track") ?? null;
    const geo = new THREE.RingGeometry(innerRadius, outerRadius, segments);
    const mat = new THREE.MeshStandardMaterial({
      map: trackTex ?? void 0,
      side: THREE.DoubleSide,
      roughness: 1
    });
    this.trackMesh = new THREE.Mesh(geo, mat);
    this.trackMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.trackMesh);
    const grassTex = this.loader.textureMap.get("grass") ?? null;
    const planeGeo = new THREE.PlaneGeometry(400, 400);
    const planeMat = new THREE.MeshStandardMaterial({
      map: grassTex ?? void 0
    });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.01;
    this.scene.add(plane);
  }
  createKart() {
    const kcfg = this.loader.data.kart;
    const halfExtents = new CANNON.Vec3(kcfg.width / 2, 0.5, kcfg.length / 2);
    const shape = new CANNON.Box(halfExtents);
    this.kartBody = new CANNON.Body({ mass: kcfg.mass, material: this.kartMaterial });
    this.kartBody.addShape(shape);
    this.kartBody.angularDamping = 0.9;
    const startRadius = this.loader.data.track.radius;
    this.kartBody.position.set(startRadius, 0.5, 0);
    this.world.addBody(this.kartBody);
    const kartTex = this.loader.textureMap.get("player") ?? null;
    const geom = new THREE.BoxGeometry(kcfg.width, 0.6, kcfg.length);
    const mats = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.MeshStandardMaterial({ map: kartTex ?? void 0 });
      mats.push(m);
    }
    this.kartMesh = new THREE.Mesh(geom, mats);
    this.kartMesh.castShadow = true;
    this.scene.add(this.kartMesh);
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
      if ((e.key === "w" || e.key === "ArrowUp") && this.inputState.forward === 1)
        this.inputState.forward = 0;
      if ((e.key === "s" || e.key === "ArrowDown") && this.inputState.forward === -1)
        this.inputState.forward = 0;
      if ((e.key === "a" || e.key === "ArrowLeft") && this.inputState.steer === 1)
        this.inputState.steer = 0;
      if ((e.key === "d" || e.key === "ArrowRight") && this.inputState.steer === -1)
        this.inputState.steer = 0;
      if (e.key === " ") this.inputState.brake = false;
    });
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
      } catch {
      }
    if (this.engineAudio) {
      this.engineAudio.loop = true;
      try {
        this.engineAudio.play();
      } catch {
      }
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
      } catch {
      }
    if (this.engineAudio)
      try {
        this.engineAudio.pause();
        this.engineAudio.currentTime = 0;
      } catch {
      }
  }
  applyPhysics(dt) {
    const kcfg = this.loader.data.kart;
    const q = this.kartBody.quaternion;
    const forward = new CANNON.Vec3(0, 0, 1);
    q.vmult(forward, forward);
    const vel = this.kartBody.velocity;
    const speed = vel.dot(forward);
    const desiredAccel = this.inputState.forward * kcfg.accel;
    if (desiredAccel !== 0) {
      const force = forward.scale(desiredAccel * this.kartBody.mass);
      this.kartBody.applyForce(force, this.kartBody.position);
    }
    if (this.inputState.brake) {
      const brakeFactor = 0.95;
      this.kartBody.velocity.scale(brakeFactor, this.kartBody.velocity);
    }
    const maxSpeed = kcfg.maxSpeed;
    const currentSpeed = this.kartBody.velocity.length();
    if (currentSpeed > maxSpeed) {
      this.kartBody.velocity.scale(
        maxSpeed / currentSpeed,
        this.kartBody.velocity
      );
    }
    const steerInput = this.inputState.steer;
    if (Math.abs(steerInput) > 0.01) {
      const steerStrength = kcfg.turnSpeed * (0.5 + Math.max(0, 1 - currentSpeed / maxSpeed));
      const torque = new CANNON.Vec3(
        0,
        steerInput * steerStrength * this.kartBody.mass,
        // Modified: Removed dt * 60 for consistent torque application
        0
      );
      this.kartBody.torque.vadd(torque, this.kartBody.torque);
    }
    const drag = 0.995;
    const dragFactor = Math.pow(drag, dt * 60);
    this.kartBody.velocity.scale(
      dragFactor,
      this.kartBody.velocity
    );
  }
  onResize() {
    const w = this.canvas.clientWidth || this.canvas.width || window.innerWidth;
    const h = this.canvas.clientHeight || this.canvas.height || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
(async () => {
  try {
    const game = new KartGame("gameCanvas");
    await game.init();
  } catch (err) {
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
      fontFamily: "monospace"
    });
    errDiv.innerText = `Game init error: ${String(err)}`;
    document.body.appendChild(errDiv);
    console.error(err);
  }
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSBcInRocmVlXCI7XHJcbmltcG9ydCAqIGFzIENBTk5PTiBmcm9tIFwiY2Fubm9uLWVzXCI7XHJcblxyXG50eXBlIEltYWdlQXNzZXQgPSB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9O1xyXG50eXBlIFNvdW5kQXNzZXQgPSB7XHJcbiAgbmFtZTogc3RyaW5nO1xyXG4gIHBhdGg6IHN0cmluZztcclxuICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgdm9sdW1lOiBudW1iZXI7XHJcbn07XHJcbnR5cGUgQXNzZXRzQmxvY2sgPSB7IGltYWdlczogSW1hZ2VBc3NldFtdOyBzb3VuZHM6IFNvdW5kQXNzZXRbXSB9O1xyXG50eXBlIEdhbWVEYXRhID0ge1xyXG4gIHRpdGxlOiBzdHJpbmc7XHJcbiAgdHJhY2s6IHsgcmFkaXVzOiBudW1iZXI7IGxlbmd0aDogbnVtYmVyOyBsYW5lczogbnVtYmVyIH07XHJcbiAga2FydDoge1xyXG4gICAgbWFzczogbnVtYmVyO1xyXG4gICAgbWF4U3BlZWQ6IG51bWJlcjtcclxuICAgIGFjY2VsOiBudW1iZXI7XHJcbiAgICB0dXJuU3BlZWQ6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBsZW5ndGg6IG51bWJlcjtcclxuICB9O1xyXG4gIGFzc2V0czogQXNzZXRzQmxvY2s7XHJcbiAgdWk6IHsgdGl0bGVUZXh0OiBzdHJpbmc7IHN0YXJ0SGludDogc3RyaW5nIH07XHJcbn07XHJcblxyXG5jbGFzcyBBc3NldExvYWRlciB7XHJcbiAgZGF0YSE6IEdhbWVEYXRhO1xyXG4gIGltYWdlTWFwID0gbmV3IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+KCk7XHJcbiAgdGV4dHVyZU1hcCA9IG5ldyBNYXA8c3RyaW5nLCBUSFJFRS5UZXh0dXJlPigpO1xyXG4gIGF1ZGlvTWFwID0gbmV3IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+KCk7XHJcblxyXG4gIGFzeW5jIGxvYWRDb25maWcoKSB7XHJcbiAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChcImRhdGEuanNvblwiLCB7IGNhY2hlOiBcIm5vLXN0b3JlXCIgfSk7XHJcbiAgICBpZiAoIXJlcy5vaykgdGhyb3cgbmV3IEVycm9yKFwiRmFpbGVkIHRvIGZldGNoIGRhdGEuanNvblwiKTtcclxuICAgIHRoaXMuZGF0YSA9IChhd2FpdCByZXMuanNvbigpKSBhcyBHYW1lRGF0YTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGxvYWRJbWFnZXMob25Qcm9ncmVzcz86IChuOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWQpIHtcclxuICAgIGNvbnN0IGltYWdlcyA9IHRoaXMuZGF0YS5hc3NldHMuaW1hZ2VzO1xyXG4gICAgY29uc3QgdG90YWwgPSBpbWFnZXMubGVuZ3RoO1xyXG4gICAgbGV0IGxvYWRlZCA9IDA7XHJcbiAgICBhd2FpdCBQcm9taXNlLmFsbChcclxuICAgICAgaW1hZ2VzLm1hcChcclxuICAgICAgICAoaW1nKSA9PlxyXG4gICAgICAgICAgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBpbWFnZSA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBpbWFnZS5zcmMgPSBpbWcucGF0aDtcclxuICAgICAgICAgICAgaW1hZ2Uub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgIHRoaXMuaW1hZ2VNYXAuc2V0KGltZy5uYW1lLCBpbWFnZSk7XHJcbiAgICAgICAgICAgICAgY29uc3QgdGV4ID0gbmV3IFRIUkVFLlRleHR1cmUoaW1hZ2UpO1xyXG4gICAgICAgICAgICAgIHRleC5uZWVkc1VwZGF0ZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgdGV4Lm1hZ0ZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcclxuICAgICAgICAgICAgICB0ZXgubWluRmlsdGVyID0gVEhSRUUuTGluZWFyTWlwbWFwTGluZWFyRmlsdGVyO1xyXG4gICAgICAgICAgICAgIHRoaXMudGV4dHVyZU1hcC5zZXQoaW1nLm5hbWUsIHRleCk7XHJcbiAgICAgICAgICAgICAgbG9hZGVkKys7XHJcbiAgICAgICAgICAgICAgb25Qcm9ncmVzcz8uKGxvYWRlZCwgdG90YWwpO1xyXG4gICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1hZ2Uub25lcnJvciA9IChlKSA9PiByZWplY3QoZSk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApXHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgbG9hZEF1ZGlvKG9uUHJvZ3Jlc3M/OiAobjogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkKSB7XHJcbiAgICBjb25zdCBzb3VuZHMgPSB0aGlzLmRhdGEuYXNzZXRzLnNvdW5kcztcclxuICAgIGNvbnN0IHRvdGFsID0gc291bmRzLmxlbmd0aDtcclxuICAgIGxldCBsb2FkZWQgPSAwO1xyXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXHJcbiAgICAgIHNvdW5kcy5tYXAoXHJcbiAgICAgICAgKHMpID0+XHJcbiAgICAgICAgICBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKCk7XHJcbiAgICAgICAgICAgIGF1ZGlvLnNyYyA9IHMucGF0aDtcclxuICAgICAgICAgICAgYXVkaW8ucHJlbG9hZCA9IFwiYXV0b1wiO1xyXG4gICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzLnZvbHVtZTtcclxuICAgICAgICAgICAgYXVkaW8uYWRkRXZlbnRMaXN0ZW5lcihcclxuICAgICAgICAgICAgICBcImNhbnBsYXl0aHJvdWdoXCIsXHJcbiAgICAgICAgICAgICAgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hdWRpb01hcC5zZXQocy5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICBsb2FkZWQrKztcclxuICAgICAgICAgICAgICAgIG9uUHJvZ3Jlc3M/Lihsb2FkZWQsIHRvdGFsKTtcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgIHsgb25jZTogdHJ1ZSB9XHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGF1ZGlvLmFkZEV2ZW50TGlzdGVuZXIoXCJlcnJvclwiLCAoZXYpID0+IHtcclxuICAgICAgICAgICAgICAvLyBzdGlsbCByZXNvbHZlIHNvIGEgbWlzc2luZyBhdWRpbyB3b24ndCBsb2NrIHRoZSBsb2FkZXJcclxuICAgICAgICAgICAgICBsb2FkZWQrKztcclxuICAgICAgICAgICAgICBvblByb2dyZXNzPy4obG9hZGVkLCB0b3RhbCk7XHJcbiAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgIClcclxuICAgICk7XHJcbiAgfVxyXG59XHJcblxyXG5jbGFzcyBLYXJ0R2FtZSB7XHJcbiAgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICBsb2FkZXIgPSBuZXcgQXNzZXRMb2FkZXIoKTtcclxuICBzY2VuZSE6IFRIUkVFLlNjZW5lO1xyXG4gIGNhbWVyYSE6IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhO1xyXG4gIHJlbmRlcmVyITogVEhSRUUuV2ViR0xSZW5kZXJlcjtcclxuICBsaWdodCE6IFRIUkVFLkRpcmVjdGlvbmFsTGlnaHQ7XHJcbiAgd29ybGQhOiBDQU5OT04uV29ybGQ7XHJcbiAga2FydEJvZHkhOiBDQU5OT04uQm9keTtcclxuICBrYXJ0TWVzaCE6IFRIUkVFLk1lc2g7XHJcbiAgdHJhY2tNZXNoITogVEhSRUUuTWVzaDtcclxuICBjbG9jayA9IG5ldyBUSFJFRS5DbG9jaygpO1xyXG4gIGlucHV0U3RhdGUgPSB7IGZvcndhcmQ6IDAsIHN0ZWVyOiAwLCBicmFrZTogZmFsc2UgfTtcclxuICBydW5uaW5nID0gZmFsc2U7XHJcbiAgdWlSb290ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgdGl0bGVTY3JlZW4hOiBIVE1MRGl2RWxlbWVudDtcclxuICBodWQhOiBIVE1MRGl2RWxlbWVudDtcclxuICBzcGVlZEVsZW1lbnQhOiBIVE1MRGl2RWxlbWVudDtcclxuICBsYXBFbGVtZW50ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgZW5naW5lQXVkaW8/OiBIVE1MQXVkaW9FbGVtZW50O1xyXG4gIGJnbUF1ZGlvPzogSFRNTEF1ZGlvRWxlbWVudDtcclxuICBsYXN0VGltZSA9IDA7XHJcbiAgbGFwcyA9IDA7XHJcbiAgbGFwU3RhcnRYID0gMDtcclxuICBrYXJ0TWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7IC8vIEFkZGVkIGthcnQgbWF0ZXJpYWxcclxuXHJcbiAgY29uc3RydWN0b3IoY2FudmFzSWQgPSBcImdhbWVDYW52YXNcIikge1xyXG4gICAgY29uc3QgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCk7XHJcbiAgICBpZiAoIWVsIHx8ICEoZWwgaW5zdGFuY2VvZiBIVE1MQ2FudmFzRWxlbWVudCkpXHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbnZhcyB3aXRoIGlkICdnYW1lQ2FudmFzJyBub3QgZm91bmQuXCIpO1xyXG4gICAgdGhpcy5jYW52YXMgPSBlbDtcclxuICB9XHJcblxyXG4gIGFzeW5jIGluaXQoKSB7XHJcbiAgICBhd2FpdCB0aGlzLmxvYWRlci5sb2FkQ29uZmlnKCk7XHJcbiAgICAvLyBDcmVhdGUgVUkgZWFybHkgc28gcHJvZ3Jlc3MgY2FuIHNob3dcclxuICAgIHRoaXMuY3JlYXRlVUkoKTtcclxuICAgIC8vIFNob3cgbG9hZGluZyBtZXNzYWdlXHJcbiAgICB0aGlzLnNob3dUaXRsZVNjcmVlbkxvYWRpbmcoXCJMb2FkaW5nIGFzc2V0cy4uLlwiKTtcclxuICAgIGF3YWl0IHRoaXMubG9hZGVyLmxvYWRJbWFnZXMoKG4sIHQpID0+XHJcbiAgICAgIHRoaXMuc2hvd1RpdGxlU2NyZWVuTG9hZGluZyhgTG9hZGluZyBpbWFnZXMgJHtufS8ke3R9Li4uYClcclxuICAgICk7XHJcbiAgICBhd2FpdCB0aGlzLmxvYWRlci5sb2FkQXVkaW8oKG4sIHQpID0+XHJcbiAgICAgIHRoaXMuc2hvd1RpdGxlU2NyZWVuTG9hZGluZyhgTG9hZGluZyBhdWRpbyAke259LyR7dH0uLi5gKVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBhc3NpZ24gYXVkaW9zXHJcbiAgICB0aGlzLmVuZ2luZUF1ZGlvID0gdGhpcy5sb2FkZXIuYXVkaW9NYXAuZ2V0KFwiZW5naW5lXCIpPy5jbG9uZU5vZGUodHJ1ZSkgYXNcclxuICAgICAgfCBIVE1MQXVkaW9FbGVtZW50XHJcbiAgICAgIHwgdW5kZWZpbmVkO1xyXG4gICAgdGhpcy5iZ21BdWRpbyA9IHRoaXMubG9hZGVyLmF1ZGlvTWFwLmdldChcImJnbVwiKT8uY2xvbmVOb2RlKHRydWUpIGFzXHJcbiAgICAgIHwgSFRNTEF1ZGlvRWxlbWVudFxyXG4gICAgICB8IHVuZGVmaW5lZDtcclxuXHJcbiAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICB0aGlzLmJnbUF1ZGlvLmxvb3AgPSB0cnVlO1xyXG4gICAgICB0aGlzLmJnbUF1ZGlvLnZvbHVtZSA9IHRoaXMuYmdtQXVkaW8udm9sdW1lICogMC42O1xyXG4gICAgfVxyXG4gICAgLy8gQ29tcG9zZSB0aGUgc2NlbmVcclxuICAgIHRoaXMuc2V0dXBUaHJlZSgpO1xyXG4gICAgdGhpcy5zZXR1cFdvcmxkKCk7XHJcbiAgICB0aGlzLmNyZWF0ZVRyYWNrKCk7XHJcbiAgICB0aGlzLmNyZWF0ZUthcnQoKTtcclxuICAgIHRoaXMuY3JlYXRlTGlnaHRzKCk7XHJcbiAgICB0aGlzLmNyZWF0ZUhVRCgpO1xyXG4gICAgdGhpcy5zaG93VGl0bGVTY3JlZW4oKTsgLy8gdGl0bGUgd2FpdHMgZm9yIGlucHV0XHJcbiAgICB0aGlzLmF0dGFjaElucHV0KCk7XHJcbiAgICB0aGlzLm9uUmVzaXplKCk7XHJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCAoKSA9PiB0aGlzLm9uUmVzaXplKCkpO1xyXG4gICAgLy8ga2VlcCBsYXN0VGltZSBmb3IgcGh5c2ljcyB0aW1pbmdcclxuICAgIHRoaXMubGFzdFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICAgIC8vIHN0YXJ0IHJlbmRlciBsb29wIHJlZ2FyZGxlc3MsIGJ1dCBnYW1lLnJ1biB3b24ndCBzaW11bGF0ZSB1bnRpbCBzdGFydGVkXHJcbiAgICB0aGlzLmFuaW1hdGUoKTtcclxuICB9XHJcblxyXG4gIGNyZWF0ZVVJKCkge1xyXG4gICAgLy8gcm9vdCBvdmVybGF5XHJcbiAgICB0aGlzLnVpUm9vdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBPYmplY3QuYXNzaWduKHRoaXMudWlSb290LnN0eWxlLCB7XHJcbiAgICAgIHBvc2l0aW9uOiBcImFic29sdXRlXCIsXHJcbiAgICAgIGxlZnQ6IFwiMFwiLFxyXG4gICAgICB0b3A6IFwiMFwiLFxyXG4gICAgICB3aWR0aDogXCIxMDAlXCIsXHJcbiAgICAgIGhlaWdodDogXCIxMDAlXCIsXHJcbiAgICAgIHBvaW50ZXJFdmVudHM6IFwibm9uZVwiLFxyXG4gICAgICBmb250RmFtaWx5OiBcIkFyaWFsLCBIZWx2ZXRpY2EsIHNhbnMtc2VyaWZcIixcclxuICAgIH0gYXMgQ1NTU3R5bGVEZWNsYXJhdGlvbik7XHJcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMudWlSb290KTtcclxuXHJcbiAgICAvLyBUaXRsZSBzY3JlZW5cclxuICAgIHRoaXMudGl0bGVTY3JlZW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgT2JqZWN0LmFzc2lnbih0aGlzLnRpdGxlU2NyZWVuLnN0eWxlLCB7XHJcbiAgICAgIHBvc2l0aW9uOiBcImFic29sdXRlXCIsXHJcbiAgICAgIGxlZnQ6IFwiMFwiLFxyXG4gICAgICB0b3A6IFwiMFwiLFxyXG4gICAgICB3aWR0aDogXCIxMDAlXCIsXHJcbiAgICAgIGhlaWdodDogXCIxMDAlXCIsXHJcbiAgICAgIGRpc3BsYXk6IFwiZmxleFwiLFxyXG4gICAgICBhbGlnbkl0ZW1zOiBcImNlbnRlclwiLFxyXG4gICAgICBqdXN0aWZ5Q29udGVudDogXCJjZW50ZXJcIixcclxuICAgICAgZmxleERpcmVjdGlvbjogXCJjb2x1bW5cIixcclxuICAgICAgYmFja2dyb3VuZDogXCJyZ2JhKDAsMCwwLDAuNTUpXCIsXHJcbiAgICAgIGNvbG9yOiBcIndoaXRlXCIsXHJcbiAgICAgIHBvaW50ZXJFdmVudHM6IFwiYXV0b1wiLFxyXG4gICAgICBnYXA6IFwiMThweFwiLFxyXG4gICAgfSBhcyBDU1NTdHlsZURlY2xhcmF0aW9uKTtcclxuICAgIHRoaXMudWlSb290LmFwcGVuZENoaWxkKHRoaXMudGl0bGVTY3JlZW4pO1xyXG4gIH1cclxuXHJcbiAgc2hvd1RpdGxlU2NyZWVuTG9hZGluZyh0ZXh0OiBzdHJpbmcpIHtcclxuICAgIHRoaXMudGl0bGVTY3JlZW4uaW5uZXJIVE1MID0gXCJcIjtcclxuICAgIGNvbnN0IHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgdC5pbm5lclRleHQgPSB0ZXh0O1xyXG4gICAgT2JqZWN0LmFzc2lnbih0LnN0eWxlLCB7IGZvbnRTaXplOiBcIjIwcHhcIiB9IGFzIENTU1N0eWxlRGVjbGFyYXRpb24pO1xyXG4gICAgdGhpcy50aXRsZVNjcmVlbi5hcHBlbmRDaGlsZCh0KTtcclxuICB9XHJcblxyXG4gIHNob3dUaXRsZVNjcmVlbigpIHtcclxuICAgIHRoaXMudGl0bGVTY3JlZW4uaW5uZXJIVE1MID0gXCJcIjtcclxuICAgIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIHRpdGxlLmlubmVyVGV4dCA9IHRoaXMubG9hZGVyLmRhdGEudWk/LnRpdGxlVGV4dCA/PyB0aGlzLmxvYWRlci5kYXRhLnRpdGxlO1xyXG4gICAgT2JqZWN0LmFzc2lnbih0aXRsZS5zdHlsZSwge1xyXG4gICAgICBmb250U2l6ZTogXCI0NHB4XCIsXHJcbiAgICAgIGZvbnRXZWlnaHQ6IFwiNzAwXCIsXHJcbiAgICB9IGFzIENTU1N0eWxlRGVjbGFyYXRpb24pO1xyXG4gICAgY29uc3QgaGludCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBoaW50LmlubmVyVGV4dCA9XHJcbiAgICAgIHRoaXMubG9hZGVyLmRhdGEudWk/LnN0YXJ0SGludCA/PyBcIlByZXNzIEVudGVyIG9yIENsaWNrIHRvIFN0YXJ0XCI7XHJcbiAgICBPYmplY3QuYXNzaWduKGhpbnQuc3R5bGUsIHtcclxuICAgICAgZm9udFNpemU6IFwiMThweFwiLFxyXG4gICAgICBvcGFjaXR5OiBcIjAuOVwiLFxyXG4gICAgfSBhcyBDU1NTdHlsZURlY2xhcmF0aW9uKTtcclxuICAgIGNvbnN0IGluc3RydWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBpbnN0cnVjdGlvbnMuaW5uZXJUZXh0ID1cclxuICAgICAgXCJBcnJvd3MgLyBBIEQgdG8gc3RlZXIsIFcgdG8gYWNjZWxlcmF0ZSwgUyB0byBicmFrZS5cIjtcclxuICAgIE9iamVjdC5hc3NpZ24oaW5zdHJ1Y3Rpb25zLnN0eWxlLCB7XHJcbiAgICAgIGZvbnRTaXplOiBcIjE0cHhcIixcclxuICAgICAgb3BhY2l0eTogXCIwLjlcIixcclxuICAgIH0gYXMgQ1NTU3R5bGVEZWNsYXJhdGlvbik7XHJcblxyXG4gICAgdGhpcy50aXRsZVNjcmVlbi5hcHBlbmRDaGlsZCh0aXRsZSk7XHJcbiAgICB0aGlzLnRpdGxlU2NyZWVuLmFwcGVuZENoaWxkKGhpbnQpO1xyXG4gICAgdGhpcy50aXRsZVNjcmVlbi5hcHBlbmRDaGlsZChpbnN0cnVjdGlvbnMpO1xyXG5cclxuICAgIC8vIHN0YXJ0IG9uIGNsaWNrIG9yIEVudGVyXHJcbiAgICBjb25zdCBzdGFydE5vdyA9ICgpID0+IHtcclxuICAgICAgdGhpcy50aXRsZVNjcmVlbi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgICAgIHRoaXMuc3RhcnRHYW1lKCk7XHJcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBvbktleSk7XHJcbiAgICB9O1xyXG4gICAgY29uc3Qgb25LZXkgPSAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xyXG4gICAgICBpZiAoZS5rZXkgPT09IFwiRW50ZXJcIiB8fCBlLmtleSA9PT0gXCIgXCIpIHN0YXJ0Tm93KCk7XHJcbiAgICB9O1xyXG4gICAgdGhpcy50aXRsZVNjcmVlbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gc3RhcnROb3coKSwge1xyXG4gICAgICBvbmNlOiB0cnVlLFxyXG4gICAgfSk7XHJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgb25LZXkpO1xyXG4gIH1cclxuXHJcbiAgY3JlYXRlSFVEKCkge1xyXG4gICAgdGhpcy5odWQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgT2JqZWN0LmFzc2lnbih0aGlzLmh1ZC5zdHlsZSwge1xyXG4gICAgICBwb3NpdGlvbjogXCJhYnNvbHV0ZVwiLFxyXG4gICAgICByaWdodDogXCIxMnB4XCIsXHJcbiAgICAgIHRvcDogXCIxMnB4XCIsXHJcbiAgICAgIGNvbG9yOiBcIndoaXRlXCIsXHJcbiAgICAgIGZvbnRTaXplOiBcIjE2cHhcIixcclxuICAgICAgcG9pbnRlckV2ZW50czogXCJub25lXCIsXHJcbiAgICAgIHRleHRBbGlnbjogXCJyaWdodFwiLFxyXG4gICAgICB0ZXh0U2hhZG93OiBcIjAgMCA2cHggcmdiYSgwLDAsMCwwLjgpXCIsXHJcbiAgICB9IGFzIENTU1N0eWxlRGVjbGFyYXRpb24pO1xyXG4gICAgdGhpcy5zcGVlZEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgdGhpcy5zcGVlZEVsZW1lbnQuaW5uZXJUZXh0ID0gXCJTcGVlZDogMFwiO1xyXG4gICAgdGhpcy5sYXBFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIHRoaXMubGFwRWxlbWVudC5pbm5lclRleHQgPSBcIkxhcDogMFwiO1xyXG4gICAgdGhpcy5odWQuYXBwZW5kQ2hpbGQodGhpcy5zcGVlZEVsZW1lbnQpO1xyXG4gICAgdGhpcy5odWQuYXBwZW5kQ2hpbGQodGhpcy5sYXBFbGVtZW50KTtcclxuICAgIHRoaXMudWlSb290LmFwcGVuZENoaWxkKHRoaXMuaHVkKTtcclxuICB9XHJcblxyXG4gIHNldHVwVGhyZWUoKSB7XHJcbiAgICB0aGlzLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XHJcbiAgICAvLyBmaW5kIGNhbnZhcyBwcm92aWRlZCBieSBIVE1MXHJcbiAgICB0aGlzLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoe1xyXG4gICAgICBjYW52YXM6IHRoaXMuY2FudmFzLFxyXG4gICAgICBhbnRpYWxpYXM6IHRydWUsXHJcbiAgICB9KTtcclxuICAgIHRoaXMucmVuZGVyZXIuc2V0UGl4ZWxSYXRpbyh3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyB8fCAxKTtcclxuICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKDYwLCAxLCAwLjEsIDEwMDApO1xyXG4gICAgdGhpcy5jYW1lcmEucG9zaXRpb24uc2V0KDAsIDYsIC0xMik7XHJcbiAgICB0aGlzLmNhbWVyYS5sb29rQXQoMCwgMCwgMCk7XHJcbiAgICAvLyBhbWJpZW50XHJcbiAgICB0aGlzLnNjZW5lLmFkZChuZXcgVEhSRUUuQW1iaWVudExpZ2h0KDB4ZmZmZmZmLCAwLjYpKTtcclxuICB9XHJcblxyXG4gIHNldHVwV29ybGQoKSB7XHJcbiAgICB0aGlzLndvcmxkID0gbmV3IENBTk5PTi5Xb3JsZCh7XHJcbiAgICAgIGdyYXZpdHk6IG5ldyBDQU5OT04uVmVjMygwLCAtOS44MiwgMCksXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBncm91bmRNYXQgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKFwiZ3JvdW5kTWF0XCIpO1xyXG4gICAgY29uc3Qga2FydE1hdCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoXCJrYXJ0TWF0XCIpOyAvLyBEZWZpbmUga2FydCBtYXRlcmlhbFxyXG4gICAgdGhpcy5rYXJ0TWF0ZXJpYWwgPSBrYXJ0TWF0OyAvLyBTdG9yZSBpdCBmb3IgdXNlIGluIGNyZWF0ZUthcnRcclxuXHJcbiAgICAvLyBncm91bmQgcGxhbmVcclxuICAgIGNvbnN0IGdyb3VuZCA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgIG1hc3M6IDAsXHJcbiAgICAgIHNoYXBlOiBuZXcgQ0FOTk9OLlBsYW5lKCksXHJcbiAgICAgIG1hdGVyaWFsOiBncm91bmRNYXQsXHJcbiAgICB9KTtcclxuICAgIGdyb3VuZC5xdWF0ZXJuaW9uLnNldEZyb21FdWxlcigtTWF0aC5QSSAvIDIsIDAsIDApO1xyXG4gICAgdGhpcy53b3JsZC5hZGRCb2R5KGdyb3VuZCk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIGEgY29udGFjdCBtYXRlcmlhbCBmb3IgZ3JvdW5kIGFuZCBrYXJ0IGludGVyYWN0aW9uXHJcbiAgICBjb25zdCBncm91bmRLYXJ0Q29udGFjdE1hdCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKGdyb3VuZE1hdCwga2FydE1hdCwge1xyXG4gICAgICBmcmljdGlvbjogMC44LCAvLyBJbmNyZWFzZWQgZnJpY3Rpb24gZm9yIGJldHRlciBncmlwIGFuZCBmb3J3YXJkIG1vdGlvblxyXG4gICAgICByZXN0aXR1dGlvbjogMC4xLCAvLyBMb3cgcmVzdGl0dXRpb24gZm9yIGxlc3MgYm91bmN5IGNvbGxpc2lvbnNcclxuICAgIH0pO1xyXG4gICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwoZ3JvdW5kS2FydENvbnRhY3RNYXQpO1xyXG4gIH1cclxuXHJcbiAgY3JlYXRlTGlnaHRzKCkge1xyXG4gICAgdGhpcy5saWdodCA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KDB4ZmZmZmZmLCAwLjgpO1xyXG4gICAgdGhpcy5saWdodC5wb3NpdGlvbi5zZXQoMTAsIDIwLCAxMCk7XHJcbiAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLmxpZ2h0KTtcclxuICB9XHJcblxyXG4gIGNyZWF0ZVRyYWNrKCkge1xyXG4gICAgLy8gU2ltcGxlIGNpcmN1bGFyIHRyYWNrIHJlcHJlc2VudGVkIGJ5IGEgbGFyZ2UgdGV4dHVyZWQgcmluZyBvbiB0aGUgWFogcGxhbmUuXHJcbiAgICBjb25zdCB0cmFja1JhZGl1cyA9IHRoaXMubG9hZGVyLmRhdGEudHJhY2sucmFkaXVzID8/IDIwO1xyXG4gICAgY29uc3QgaW5uZXJSYWRpdXMgPSB0cmFja1JhZGl1cyAtIDQ7XHJcbiAgICBjb25zdCBvdXRlclJhZGl1cyA9IHRyYWNrUmFkaXVzICsgNDtcclxuICAgIGNvbnN0IHNlZ21lbnRzID0gNjQ7XHJcbiAgICAvLyBVc2Ugb25lIG9mIHRoZSBpbWFnZXMgYXMgdGV4dHVyZSAoaWYgcHJvdmlkZWQpLCBvdGhlcndpc2UgZmFsbCBiYWNrIHRvIGNvbG9yXHJcbiAgICBjb25zdCB0cmFja1RleCA9IHRoaXMubG9hZGVyLnRleHR1cmVNYXAuZ2V0KFwidHJhY2tcIikgPz8gbnVsbDtcclxuICAgIGNvbnN0IGdlbyA9IG5ldyBUSFJFRS5SaW5nR2VvbWV0cnkoaW5uZXJSYWRpdXMsIG91dGVyUmFkaXVzLCBzZWdtZW50cyk7XHJcbiAgICBjb25zdCBtYXQgPSBuZXcgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwoe1xyXG4gICAgICBtYXA6IHRyYWNrVGV4ID8/IHVuZGVmaW5lZCxcclxuICAgICAgc2lkZTogVEhSRUUuRG91YmxlU2lkZSxcclxuICAgICAgcm91Z2huZXNzOiAxLjAsXHJcbiAgICB9KTtcclxuICAgIHRoaXMudHJhY2tNZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvLCBtYXQpO1xyXG4gICAgdGhpcy50cmFja01lc2gucm90YXRpb24ueCA9IC1NYXRoLlBJIC8gMjtcclxuICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMudHJhY2tNZXNoKTtcclxuXHJcbiAgICAvLyBBZGQgc2ltcGxlIGVudmlyb25tZW50IHBsYW5lIChncmFzcykgdXNpbmcgaW1hZ2UgaWYgYXZhaWxhYmxlXHJcbiAgICBjb25zdCBncmFzc1RleCA9IHRoaXMubG9hZGVyLnRleHR1cmVNYXAuZ2V0KFwiZ3Jhc3NcIikgPz8gbnVsbDtcclxuICAgIGNvbnN0IHBsYW5lR2VvID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkoNDAwLCA0MDApO1xyXG4gICAgY29uc3QgcGxhbmVNYXQgPSBuZXcgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwoe1xyXG4gICAgICBtYXA6IGdyYXNzVGV4ID8/IHVuZGVmaW5lZCxcclxuICAgIH0pO1xyXG4gICAgY29uc3QgcGxhbmUgPSBuZXcgVEhSRUUuTWVzaChwbGFuZUdlbywgcGxhbmVNYXQpO1xyXG4gICAgcGxhbmUucm90YXRpb24ueCA9IC1NYXRoLlBJIC8gMjtcclxuICAgIHBsYW5lLnBvc2l0aW9uLnkgPSAtMC4wMTtcclxuICAgIHRoaXMuc2NlbmUuYWRkKHBsYW5lKTtcclxuICB9XHJcblxyXG4gIGNyZWF0ZUthcnQoKSB7XHJcbiAgICAvLyBQaHlzaWNzIGJvZHk6IHNpbXBsZSBib3hcclxuICAgIGNvbnN0IGtjZmcgPSB0aGlzLmxvYWRlci5kYXRhLmthcnQ7XHJcbiAgICBjb25zdCBoYWxmRXh0ZW50cyA9IG5ldyBDQU5OT04uVmVjMyhrY2ZnLndpZHRoIC8gMiwgMC41LCBrY2ZnLmxlbmd0aCAvIDIpO1xyXG4gICAgY29uc3Qgc2hhcGUgPSBuZXcgQ0FOTk9OLkJveChoYWxmRXh0ZW50cyk7XHJcbiAgICB0aGlzLmthcnRCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHsgbWFzczoga2NmZy5tYXNzLCBtYXRlcmlhbDogdGhpcy5rYXJ0TWF0ZXJpYWwgfSk7IC8vIEFzc2lnbiBrYXJ0IG1hdGVyaWFsXHJcbiAgICB0aGlzLmthcnRCb2R5LmFkZFNoYXBlKHNoYXBlKTtcclxuICAgIC8vIEFkZCBhbmd1bGFyIGRhbXBpbmcgdG8gcHJldmVudCBleGNlc3NpdmUgc3Bpbm5pbmcgYW5kIHN0YWJpbGl6ZSByb3RhdGlvblxyXG4gICAgdGhpcy5rYXJ0Qm9keS5hbmd1bGFyRGFtcGluZyA9IDAuOTsgLy8gVmFsdWUgYmV0d2VlbiAwIChubyBkYW1waW5nKSBhbmQgMSAoZnVsbCBkYW1waW5nKVxyXG4gICAgLy8gc3Bhd24gYXQgdHJhY2sgc3RhcnRcclxuICAgIGNvbnN0IHN0YXJ0UmFkaXVzID0gdGhpcy5sb2FkZXIuZGF0YS50cmFjay5yYWRpdXM7XHJcbiAgICB0aGlzLmthcnRCb2R5LnBvc2l0aW9uLnNldChzdGFydFJhZGl1cywgMC41LCAwKTtcclxuICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLmthcnRCb2R5KTtcclxuXHJcbiAgICAvLyBWaXN1YWwgbWVzaDogdXNlIGltYWdlIHRleHR1cmUgbWFwcGVkIHRvIGEgYm94XHJcbiAgICBjb25zdCBrYXJ0VGV4ID0gdGhpcy5sb2FkZXIudGV4dHVyZU1hcC5nZXQoXCJwbGF5ZXJcIikgPz8gbnVsbDtcclxuICAgIGNvbnN0IGdlb20gPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoa2NmZy53aWR0aCwgMC42LCBrY2ZnLmxlbmd0aCk7XHJcbiAgICBjb25zdCBtYXRzOiBUSFJFRS5NYXRlcmlhbFtdID0gW107XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IDY7IGkrKykge1xyXG4gICAgICBjb25zdCBtID0gbmV3IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsKHsgbWFwOiBrYXJ0VGV4ID8/IHVuZGVmaW5lZCB9KTtcclxuICAgICAgbWF0cy5wdXNoKG0pO1xyXG4gICAgfVxyXG4gICAgdGhpcy5rYXJ0TWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb20sIG1hdHMpO1xyXG4gICAgdGhpcy5rYXJ0TWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMua2FydE1lc2gpO1xyXG5cclxuICAgIC8vIHNtYWxsIGNhbWVyYSBjaGFzZSBvZmZzZXQgd2lsbCB1cGRhdGUgZHVyaW5nIGxvb3BcclxuICB9XHJcblxyXG4gIGF0dGFjaElucHV0KCkge1xyXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChlKSA9PiB7XHJcbiAgICAgIGlmIChlLmtleSA9PT0gXCJ3XCIgfHwgZS5rZXkgPT09IFwiQXJyb3dVcFwiKSB0aGlzLmlucHV0U3RhdGUuZm9yd2FyZCA9IDE7XHJcbiAgICAgIGlmIChlLmtleSA9PT0gXCJzXCIgfHwgZS5rZXkgPT09IFwiQXJyb3dEb3duXCIpIHRoaXMuaW5wdXRTdGF0ZS5mb3J3YXJkID0gLTE7XHJcbiAgICAgIGlmIChlLmtleSA9PT0gXCJhXCIgfHwgZS5rZXkgPT09IFwiQXJyb3dMZWZ0XCIpIHRoaXMuaW5wdXRTdGF0ZS5zdGVlciA9IDE7XHJcbiAgICAgIGlmIChlLmtleSA9PT0gXCJkXCIgfHwgZS5rZXkgPT09IFwiQXJyb3dSaWdodFwiKSB0aGlzLmlucHV0U3RhdGUuc3RlZXIgPSAtMTtcclxuICAgICAgaWYgKGUua2V5ID09PSBcIiBcIikgdGhpcy5pbnB1dFN0YXRlLmJyYWtlID0gdHJ1ZTtcclxuICAgIH0pO1xyXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXl1cFwiLCAoZSkgPT4ge1xyXG4gICAgICBpZiAoXHJcbiAgICAgICAgKGUua2V5ID09PSBcIndcIiB8fCBlLmtleSA9PT0gXCJBcnJvd1VwXCIpICYmXHJcbiAgICAgICAgdGhpcy5pbnB1dFN0YXRlLmZvcndhcmQgPT09IDFcclxuICAgICAgKVxyXG4gICAgICAgIHRoaXMuaW5wdXRTdGF0ZS5mb3J3YXJkID0gMDtcclxuICAgICAgaWYgKFxyXG4gICAgICAgIChlLmtleSA9PT0gXCJzXCIgfHwgZS5rZXkgPT09IFwiQXJyb3dEb3duXCIpICYmXHJcbiAgICAgICAgdGhpcy5pbnB1dFN0YXRlLmZvcndhcmQgPT09IC0xXHJcbiAgICAgIClcclxuICAgICAgICB0aGlzLmlucHV0U3RhdGUuZm9yd2FyZCA9IDA7XHJcbiAgICAgIGlmIChcclxuICAgICAgICAoZS5rZXkgPT09IFwiYVwiIHx8IGUua2V5ID09PSBcIkFycm93TGVmdFwiKSAmJlxyXG4gICAgICAgIHRoaXMuaW5wdXRTdGF0ZS5zdGVlciA9PT0gMVxyXG4gICAgICApXHJcbiAgICAgICAgdGhpcy5pbnB1dFN0YXRlLnN0ZWVyID0gMDtcclxuICAgICAgaWYgKFxyXG4gICAgICAgIChlLmtleSA9PT0gXCJkXCIgfHwgZS5rZXkgPT09IFwiQXJyb3dSaWdodFwiKSAmJlxyXG4gICAgICAgIHRoaXMuaW5wdXRTdGF0ZS5zdGVlciA9PT0gLTFcclxuICAgICAgKVxyXG4gICAgICAgIHRoaXMuaW5wdXRTdGF0ZS5zdGVlciA9IDA7XHJcbiAgICAgIGlmIChlLmtleSA9PT0gXCIgXCIpIHRoaXMuaW5wdXRTdGF0ZS5icmFrZSA9IGZhbHNlO1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gc2ltcGxlIHRvdWNoIC8gY2xpY2sgY29udHJvbHM6IHRhcCBsZWZ0L3JpZ2h0IHRvIHN0ZWVyLCB0b3AvYm90dG9tIGZvciBhY2NlbC9icmFrZVxyXG4gICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcihcclxuICAgICAgXCJwb2ludGVyZG93blwiLFxyXG4gICAgICAoZXYpID0+IHtcclxuICAgICAgICBjb25zdCByZWN0ID0gdGhpcy5jYW52YXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3QgeCA9IGV2LmNsaWVudFggLSByZWN0LmxlZnQ7XHJcbiAgICAgICAgY29uc3QgeSA9IGV2LmNsaWVudFkgLSByZWN0LnRvcDtcclxuICAgICAgICBjb25zdCBjeCA9IHJlY3Qud2lkdGggLyAyO1xyXG4gICAgICAgIGlmICh5IDwgcmVjdC5oZWlnaHQgKiAwLjYpIHRoaXMuaW5wdXRTdGF0ZS5mb3J3YXJkID0gMTtcclxuICAgICAgICBlbHNlIHRoaXMuaW5wdXRTdGF0ZS5icmFrZSA9IHRydWU7XHJcbiAgICAgICAgaWYgKHggPCBjeCAqIDAuNikgdGhpcy5pbnB1dFN0YXRlLnN0ZWVyID0gMTtcclxuICAgICAgICBlbHNlIGlmICh4ID4gY3ggKiAxLjQpIHRoaXMuaW5wdXRTdGF0ZS5zdGVlciA9IC0xO1xyXG4gICAgICB9LFxyXG4gICAgICB7IHBhc3NpdmU6IHRydWUgfVxyXG4gICAgKTtcclxuICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXHJcbiAgICAgIFwicG9pbnRlcnVwXCIsXHJcbiAgICAgICgpID0+IHtcclxuICAgICAgICB0aGlzLmlucHV0U3RhdGUuZm9yd2FyZCA9IDA7XHJcbiAgICAgICAgdGhpcy5pbnB1dFN0YXRlLnN0ZWVyID0gMDtcclxuICAgICAgICB0aGlzLmlucHV0U3RhdGUuYnJha2UgPSBmYWxzZTtcclxuICAgICAgfSxcclxuICAgICAgeyBwYXNzaXZlOiB0cnVlIH1cclxuICAgICk7XHJcbiAgfVxyXG5cclxuICBzdGFydEdhbWUoKSB7XHJcbiAgICBpZiAodGhpcy5ydW5uaW5nKSByZXR1cm47XHJcbiAgICB0aGlzLnJ1bm5pbmcgPSB0cnVlO1xyXG4gICAgaWYgKHRoaXMuYmdtQXVkaW8pXHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgdGhpcy5iZ21BdWRpby5wbGF5KCk7XHJcbiAgICAgIH0gY2F0Y2gge31cclxuICAgIGlmICh0aGlzLmVuZ2luZUF1ZGlvKSB7XHJcbiAgICAgIHRoaXMuZW5naW5lQXVkaW8ubG9vcCA9IHRydWU7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgdGhpcy5lbmdpbmVBdWRpby5wbGF5KCk7XHJcbiAgICAgIH0gY2F0Y2gge31cclxuICAgIH1cclxuICAgIHRoaXMubGFwcyA9IDA7XHJcbiAgICB0aGlzLmxhcFN0YXJ0WCA9IHRoaXMua2FydEJvZHkucG9zaXRpb24ueDtcclxuICB9XHJcblxyXG4gIHN0b3BHYW1lKCkge1xyXG4gICAgdGhpcy5ydW5uaW5nID0gZmFsc2U7XHJcbiAgICBpZiAodGhpcy5iZ21BdWRpbylcclxuICAgICAgdHJ5IHtcclxuICAgICAgICB0aGlzLmJnbUF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgdGhpcy5iZ21BdWRpby5jdXJyZW50VGltZSA9IDA7XHJcbiAgICAgIH0gY2F0Y2gge31cclxuICAgIGlmICh0aGlzLmVuZ2luZUF1ZGlvKVxyXG4gICAgICB0cnkge1xyXG4gICAgICAgIHRoaXMuZW5naW5lQXVkaW8ucGF1c2UoKTtcclxuICAgICAgICB0aGlzLmVuZ2luZUF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgfSBjYXRjaCB7fVxyXG4gIH1cclxuXHJcbiAgYXBwbHlQaHlzaWNzKGR0OiBudW1iZXIpIHtcclxuICAgIGNvbnN0IGtjZmcgPSB0aGlzLmxvYWRlci5kYXRhLmthcnQ7XHJcbiAgICAvLyBGb3J3YXJkIHZlY3RvciBmcm9tIGthcnQgb3JpZW50YXRpb24gKENhbm5vbiBib2R5IHF1YXRlcm5pb24pXHJcbiAgICBjb25zdCBxID0gdGhpcy5rYXJ0Qm9keS5xdWF0ZXJuaW9uO1xyXG4gICAgY29uc3QgZm9yd2FyZCA9IG5ldyBDQU5OT04uVmVjMygwLCAwLCAxKTtcclxuICAgIHEudm11bHQoZm9yd2FyZCwgZm9yd2FyZCk7IC8vIHJvdGF0ZSBsb2NhbCBmb3J3YXJkIHRvIHdvcmxkXHJcbiAgICAvLyBjb21wdXRlIHNwZWVkIGFsb25nIGZvcndhcmRcclxuICAgIGNvbnN0IHZlbCA9IHRoaXMua2FydEJvZHkudmVsb2NpdHk7XHJcbiAgICBjb25zdCBzcGVlZCA9IHZlbC5kb3QoZm9yd2FyZCk7XHJcblxyXG4gICAgLy8gYWNjZWxlcmF0aW9uL2JyYWtpbmdcclxuICAgIGNvbnN0IGRlc2lyZWRBY2NlbCA9IHRoaXMuaW5wdXRTdGF0ZS5mb3J3YXJkICoga2NmZy5hY2NlbDtcclxuICAgIC8vIHNpbXBsZSB0aHJvdHRsZTogYXBwbHkgZm9yY2UgaW4gZm9yd2FyZCBkaXJlY3Rpb25cclxuICAgIGlmIChkZXNpcmVkQWNjZWwgIT09IDApIHtcclxuICAgICAgY29uc3QgZm9yY2UgPSBmb3J3YXJkLnNjYWxlKGRlc2lyZWRBY2NlbCAqIHRoaXMua2FydEJvZHkubWFzcyk7XHJcbiAgICAgIHRoaXMua2FydEJvZHkuYXBwbHlGb3JjZShmb3JjZSwgdGhpcy5rYXJ0Qm9keS5wb3NpdGlvbik7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gYnJha2luZzogYXBwbHkgZGFtcGVuaW5nXHJcbiAgICBpZiAodGhpcy5pbnB1dFN0YXRlLmJyYWtlKSB7XHJcbiAgICAgIGNvbnN0IGJyYWtlRmFjdG9yID0gMC45NTtcclxuICAgICAgdGhpcy5rYXJ0Qm9keS52ZWxvY2l0eS5zY2FsZShicmFrZUZhY3RvciwgdGhpcy5rYXJ0Qm9keS52ZWxvY2l0eSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gbGltaXQgc3BlZWRcclxuICAgIGNvbnN0IG1heFNwZWVkID0ga2NmZy5tYXhTcGVlZDtcclxuICAgIGNvbnN0IGN1cnJlbnRTcGVlZCA9IHRoaXMua2FydEJvZHkudmVsb2NpdHkubGVuZ3RoKCk7XHJcbiAgICBpZiAoY3VycmVudFNwZWVkID4gbWF4U3BlZWQpIHtcclxuICAgICAgLy8gc2NhbGUgZG93biB2ZWxvY2l0eVxyXG4gICAgICB0aGlzLmthcnRCb2R5LnZlbG9jaXR5LnNjYWxlKFxyXG4gICAgICAgIG1heFNwZWVkIC8gY3VycmVudFNwZWVkLFxyXG4gICAgICAgIHRoaXMua2FydEJvZHkudmVsb2NpdHlcclxuICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBzdGVlcmluZzogYXBwbHkgdG9ycXVlIGFyb3VuZCBZIHRvIHJvdGF0ZSBib2R5XHJcbiAgICAvLyBTdGVlcmluZyBlZmZlY3RpdmVuZXNzIHJlZHVjZXMgYXQgaGlnaGVyIHNwZWVkIGZvciByZWFsaXNtXHJcbiAgICBjb25zdCBzdGVlcklucHV0ID0gdGhpcy5pbnB1dFN0YXRlLnN0ZWVyO1xyXG4gICAgaWYgKE1hdGguYWJzKHN0ZWVySW5wdXQpID4gMC4wMSkge1xyXG4gICAgICBjb25zdCBzdGVlclN0cmVuZ3RoID1cclxuICAgICAgICBrY2ZnLnR1cm5TcGVlZCAqICgwLjUgKyBNYXRoLm1heCgwLCAxIC0gY3VycmVudFNwZWVkIC8gbWF4U3BlZWQpKTtcclxuICAgICAgY29uc3QgdG9ycXVlID0gbmV3IENBTk5PTi5WZWMzKFxyXG4gICAgICAgIDAsXHJcbiAgICAgICAgc3RlZXJJbnB1dCAqIHN0ZWVyU3RyZW5ndGggKiB0aGlzLmthcnRCb2R5Lm1hc3MsIC8vIE1vZGlmaWVkOiBSZW1vdmVkIGR0ICogNjAgZm9yIGNvbnNpc3RlbnQgdG9ycXVlIGFwcGxpY2F0aW9uXHJcbiAgICAgICAgMFxyXG4gICAgICApO1xyXG4gICAgICB0aGlzLmthcnRCb2R5LnRvcnF1ZS52YWRkKHRvcnF1ZSwgdGhpcy5rYXJ0Qm9keS50b3JxdWUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFNtYWxsIGxpbmVhciBkcmFnXHJcbiAgICBjb25zdCBkcmFnID0gMC45OTU7XHJcbiAgICBjb25zdCBkcmFnRmFjdG9yID0gTWF0aC5wb3coZHJhZywgZHQgKiA2MCk7IC8vIENhbGN1bGF0ZSBvbmNlXHJcbiAgICB0aGlzLmthcnRCb2R5LnZlbG9jaXR5LnNjYWxlKFxyXG4gICAgICBkcmFnRmFjdG9yLFxyXG4gICAgICB0aGlzLmthcnRCb2R5LnZlbG9jaXR5XHJcbiAgICApO1xyXG4gICAgLy8gQ3VzdG9tIGFuZ3VsYXIgZHJhZyByZW1vdmVkOyByZWx5aW5nIG9uIGthcnRCb2R5LmFuZ3VsYXJEYW1waW5nIGZvciBzdGFiaWxpemF0aW9uLlxyXG4gIH1cclxuXHJcbiAgYW5pbWF0ZSA9ICgpID0+IHtcclxuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGUpO1xyXG4gICAgY29uc3Qgbm93ID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICBjb25zdCBkdCA9IE1hdGgubWluKChub3cgLSB0aGlzLmxhc3RUaW1lKSAvIDEwMDAsIDEgLyAzMCk7XHJcbiAgICB0aGlzLmxhc3RUaW1lID0gbm93O1xyXG4gICAgaWYgKHRoaXMucnVubmluZykge1xyXG4gICAgICAvLyBwaHlzaWNzIHN0ZXBwaW5nXHJcbiAgICAgIHRoaXMuYXBwbHlQaHlzaWNzKGR0KTtcclxuICAgICAgLy8gd29ybGQgc3RlcCBmaXhlZFxyXG4gICAgICB0aGlzLndvcmxkLnN0ZXAoMSAvIDYwLCBkdCwgMyk7XHJcbiAgICAgIC8vIHN5bmMgdmlzdWFsc1xyXG4gICAgICB0aGlzLmthcnRNZXNoLnBvc2l0aW9uLnNldChcclxuICAgICAgICB0aGlzLmthcnRCb2R5LnBvc2l0aW9uLngsXHJcbiAgICAgICAgdGhpcy5rYXJ0Qm9keS5wb3NpdGlvbi55IC0gMC4yNSxcclxuICAgICAgICB0aGlzLmthcnRCb2R5LnBvc2l0aW9uLnpcclxuICAgICAgKTtcclxuICAgICAgY29uc3QgcWIgPSB0aGlzLmthcnRCb2R5LnF1YXRlcm5pb247XHJcbiAgICAgIHRoaXMua2FydE1lc2gucXVhdGVybmlvbi5zZXQocWIueCwgcWIueSwgcWIueiwgcWIudyk7XHJcblxyXG4gICAgICAvLyB1cGRhdGUgbGFwcyAoc2ltcGxlOiBjcm9zcyBYID4gc3RhcnQgdGhyZXNob2xkKVxyXG4gICAgICBjb25zdCBwcmV2WCA9IHRoaXMubGFwU3RhcnRYO1xyXG4gICAgICBpZiAocHJldlggPCAwICYmIHRoaXMua2FydEJvZHkucG9zaXRpb24ueCA+PSAwKSB7XHJcbiAgICAgICAgdGhpcy5sYXBzKys7XHJcbiAgICAgICAgdGhpcy5sYXBTdGFydFggPSB0aGlzLmthcnRCb2R5LnBvc2l0aW9uLng7XHJcbiAgICAgIH0gZWxzZSBpZiAocHJldlggPj0gMCAmJiB0aGlzLmthcnRCb2R5LnBvc2l0aW9uLnggPCAwKSB7XHJcbiAgICAgICAgdGhpcy5sYXBzKys7XHJcbiAgICAgICAgdGhpcy5sYXBTdGFydFggPSB0aGlzLmthcnRCb2R5LnBvc2l0aW9uLng7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyB1cGRhdGUgY2FtZXJhIHRvIGZvbGxvdyBrYXJ0XHJcbiAgICBjb25zdCBkZXNpcmVkQ2FtUG9zID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgIGRlc2lyZWRDYW1Qb3MuY29weSh0aGlzLmthcnRNZXNoLnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAvLyBvZmZzZXQgYmVoaW5kIGthcnQgYmFzZWQgb24ga2FydCBvcmllbnRhdGlvblxyXG4gICAgY29uc3QgZm9yd2FyZFZlYyA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIDEpLmFwcGx5UXVhdGVybmlvbihcclxuICAgICAgdGhpcy5rYXJ0TWVzaC5xdWF0ZXJuaW9uXHJcbiAgICApO1xyXG4gICAgY29uc3QgYmFjayA9IGZvcndhcmRWZWMuY2xvbmUoKS5tdWx0aXBseVNjYWxhcigtOCk7XHJcbiAgICBkZXNpcmVkQ2FtUG9zLmFkZChuZXcgVEhSRUUuVmVjdG9yMygwLCA0LCAwKSkuYWRkKGJhY2spO1xyXG4gICAgLy8gc21vb3RoIG1vdmVcclxuICAgIHRoaXMuY2FtZXJhLnBvc2l0aW9uLmxlcnAoZGVzaXJlZENhbVBvcywgMC4xMik7XHJcbiAgICB0aGlzLmNhbWVyYS5sb29rQXQodGhpcy5rYXJ0TWVzaC5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG5cclxuICAgIC8vIHVwZGF0ZSBIVURcclxuICAgIGNvbnN0IHNwZWVkID0gTWF0aC5yb3VuZCh0aGlzLmthcnRCb2R5LnZlbG9jaXR5Lmxlbmd0aCgpICogMy42KTsgLy8gY29udmVydCB0byBhcmJpdHJhcnkga20vaCBmZWVsXHJcbiAgICB0aGlzLnNwZWVkRWxlbWVudC5pbm5lclRleHQgPSBgU3BlZWQ6ICR7c3BlZWR9YDtcclxuICAgIHRoaXMubGFwRWxlbWVudC5pbm5lclRleHQgPSBgTGFwOiAke3RoaXMubGFwc31gO1xyXG5cclxuICAgIC8vIGVuZ2luZSBhdWRpbyBwaXRjaCBiYXNlZCBvbiBzcGVlZFxyXG4gICAgaWYgKHRoaXMuZW5naW5lQXVkaW8pIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICB0aGlzLmVuZ2luZUF1ZGlvLnBsYXliYWNrUmF0ZSA9XHJcbiAgICAgICAgICAwLjYgK1xyXG4gICAgICAgICAgTWF0aC5taW4oXHJcbiAgICAgICAgICAgIDIuMCxcclxuICAgICAgICAgICAgMC42ICtcclxuICAgICAgICAgICAgICAodGhpcy5rYXJ0Qm9keS52ZWxvY2l0eS5sZW5ndGgoKSAvXHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlci5kYXRhLmthcnQubWF4U3BlZWQpICpcclxuICAgICAgICAgICAgICAgIDEuNVxyXG4gICAgICAgICAgKTtcclxuICAgICAgfSBjYXRjaCB7fVxyXG4gICAgfVxyXG5cclxuICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhKTtcclxuICB9O1xyXG5cclxuICBvblJlc2l6ZSgpIHtcclxuICAgIGNvbnN0IHcgPSB0aGlzLmNhbnZhcy5jbGllbnRXaWR0aCB8fCB0aGlzLmNhbnZhcy53aWR0aCB8fCB3aW5kb3cuaW5uZXJXaWR0aDtcclxuICAgIGNvbnN0IGggPVxyXG4gICAgICB0aGlzLmNhbnZhcy5jbGllbnRIZWlnaHQgfHwgdGhpcy5jYW52YXMuaGVpZ2h0IHx8IHdpbmRvdy5pbm5lckhlaWdodDtcclxuICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZSh3LCBoLCBmYWxzZSk7XHJcbiAgICB0aGlzLmNhbWVyYS5hc3BlY3QgPSB3IC8gaDtcclxuICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuICB9XHJcbn1cclxuXHJcbi8vIEVudHJ5IHBvaW50XHJcbihhc3luYyAoKSA9PiB7XHJcbiAgdHJ5IHtcclxuICAgIGNvbnN0IGdhbWUgPSBuZXcgS2FydEdhbWUoXCJnYW1lQ2FudmFzXCIpO1xyXG4gICAgYXdhaXQgZ2FtZS5pbml0KCk7XHJcbiAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAvLyBjcmVhdGUgYSBzaW1wbGUgb3ZlcmxheSBlcnJvciBzbyB1c2VyIGNhbiBzZWVcclxuICAgIGNvbnN0IGVyckRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcblxyXG4gICAgT2JqZWN0LmFzc2lnbihlcnJEaXYuc3R5bGUsIHtcclxuICAgICAgcG9zaXRpb246IFwiYWJzb2x1dGVcIixcclxuICAgICAgbGVmdDogXCIwXCIsXHJcbiAgICAgIHRvcDogXCIwXCIsXHJcbiAgICAgIHdpZHRoOiBcIjEwMCVcIixcclxuICAgICAgaGVpZ2h0OiBcIjEwMCVcIixcclxuICAgICAgZGlzcGxheTogXCJmbGV4XCIsXHJcbiAgICAgIGFsaWduSXRlbXM6IFwiY2VudGVyXCIsXHJcbiAgICAgIGp1c3RpZnlDb250ZW50OiBcImNlbnRlclwiLFxyXG4gICAgICBjb2xvcjogXCJ3aGl0ZVwiLFxyXG4gICAgICBiYWNrZ3JvdW5kOiBcImJsYWNrXCIsXHJcbiAgICAgIHBhZGRpbmc6IFwiMjBweFwiLFxyXG4gICAgICBib3hTaXppbmc6IFwiYm9yZGVyLWJveFwiLFxyXG4gICAgICBmb250RmFtaWx5OiBcIm1vbm9zcGFjZVwiLFxyXG4gICAgfSBhcyBDU1NTdHlsZURlY2xhcmF0aW9uKTtcclxuXHJcbiAgICBlcnJEaXYuaW5uZXJUZXh0ID0gYEdhbWUgaW5pdCBlcnJvcjogJHtTdHJpbmcoZXJyKX1gO1xyXG4gICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlcnJEaXYpO1xyXG5cclxuICAgIGNvbnNvbGUuZXJyb3IoZXJyKTtcclxuICB9XHJcbn0pKCk7Il0sCiAgIm1hcHBpbmdz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
