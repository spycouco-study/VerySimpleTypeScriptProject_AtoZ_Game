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
    this.kartBody.angularVelocity.scale(
      dragFactor,
      this.kartBody.angularVelocity
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSBcInRocmVlXCI7XHJcbmltcG9ydCAqIGFzIENBTk5PTiBmcm9tIFwiY2Fubm9uLWVzXCI7XHJcblxyXG50eXBlIEltYWdlQXNzZXQgPSB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9O1xyXG50eXBlIFNvdW5kQXNzZXQgPSB7XHJcbiAgbmFtZTogc3RyaW5nO1xyXG4gIHBhdGg6IHN0cmluZztcclxuICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgdm9sdW1lOiBudW1iZXI7XHJcbn07XHJcbnR5cGUgQXNzZXRzQmxvY2sgPSB7IGltYWdlczogSW1hZ2VBc3NldFtdOyBzb3VuZHM6IFNvdW5kQXNzZXRbXSB9O1xyXG50eXBlIEdhbWVEYXRhID0ge1xyXG4gIHRpdGxlOiBzdHJpbmc7XHJcbiAgdHJhY2s6IHsgcmFkaXVzOiBudW1iZXI7IGxlbmd0aDogbnVtYmVyOyBsYW5lczogbnVtYmVyIH07XHJcbiAga2FydDoge1xyXG4gICAgbWFzczogbnVtYmVyO1xyXG4gICAgbWF4U3BlZWQ6IG51bWJlcjtcclxuICAgIGFjY2VsOiBudW1iZXI7XHJcbiAgICB0dXJuU3BlZWQ6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBsZW5ndGg6IG51bWJlcjtcclxuICB9O1xyXG4gIGFzc2V0czogQXNzZXRzQmxvY2s7XHJcbiAgdWk6IHsgdGl0bGVUZXh0OiBzdHJpbmc7IHN0YXJ0SGludDogc3RyaW5nIH07XHJcbn07XHJcblxyXG5jbGFzcyBBc3NldExvYWRlciB7XHJcbiAgZGF0YSE6IEdhbWVEYXRhO1xyXG4gIGltYWdlTWFwID0gbmV3IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+KCk7XHJcbiAgdGV4dHVyZU1hcCA9IG5ldyBNYXA8c3RyaW5nLCBUSFJFRS5UZXh0dXJlPigpO1xyXG4gIGF1ZGlvTWFwID0gbmV3IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+KCk7XHJcblxyXG4gIGFzeW5jIGxvYWRDb25maWcoKSB7XHJcbiAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChcImRhdGEuanNvblwiLCB7IGNhY2hlOiBcIm5vLXN0b3JlXCIgfSk7XHJcbiAgICBpZiAoIXJlcy5vaykgdGhyb3cgbmV3IEVycm9yKFwiRmFpbGVkIHRvIGZldGNoIGRhdGEuanNvblwiKTtcclxuICAgIHRoaXMuZGF0YSA9IChhd2FpdCByZXMuanNvbigpKSBhcyBHYW1lRGF0YTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGxvYWRJbWFnZXMob25Qcm9ncmVzcz86IChuOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWQpIHtcclxuICAgIGNvbnN0IGltYWdlcyA9IHRoaXMuZGF0YS5hc3NldHMuaW1hZ2VzO1xyXG4gICAgY29uc3QgdG90YWwgPSBpbWFnZXMubGVuZ3RoO1xyXG4gICAgbGV0IGxvYWRlZCA9IDA7XHJcbiAgICBhd2FpdCBQcm9taXNlLmFsbChcclxuICAgICAgaW1hZ2VzLm1hcChcclxuICAgICAgICAoaW1nKSA9PlxyXG4gICAgICAgICAgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBpbWFnZSA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBpbWFnZS5zcmMgPSBpbWcucGF0aDtcclxuICAgICAgICAgICAgaW1hZ2Uub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgIHRoaXMuaW1hZ2VNYXAuc2V0KGltZy5uYW1lLCBpbWFnZSk7XHJcbiAgICAgICAgICAgICAgY29uc3QgdGV4ID0gbmV3IFRIUkVFLlRleHR1cmUoaW1hZ2UpO1xyXG4gICAgICAgICAgICAgIHRleC5uZWVkc1VwZGF0ZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgdGV4Lm1hZ0ZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcclxuICAgICAgICAgICAgICB0ZXgubWluRmlsdGVyID0gVEhSRUUuTGluZWFyTWlwbWFwTGluZWFyRmlsdGVyO1xyXG4gICAgICAgICAgICAgIHRoaXMudGV4dHVyZU1hcC5zZXQoaW1nLm5hbWUsIHRleCk7XHJcbiAgICAgICAgICAgICAgbG9hZGVkKys7XHJcbiAgICAgICAgICAgICAgb25Qcm9ncmVzcz8uKGxvYWRlZCwgdG90YWwpO1xyXG4gICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1hZ2Uub25lcnJvciA9IChlKSA9PiByZWplY3QoZSk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICApXHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgbG9hZEF1ZGlvKG9uUHJvZ3Jlc3M/OiAobjogbnVtYmVyLCB0b3RhbDogbnVtYmVyKSA9PiB2b2lkKSB7XHJcbiAgICBjb25zdCBzb3VuZHMgPSB0aGlzLmRhdGEuYXNzZXRzLnNvdW5kcztcclxuICAgIGNvbnN0IHRvdGFsID0gc291bmRzLmxlbmd0aDtcclxuICAgIGxldCBsb2FkZWQgPSAwO1xyXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXHJcbiAgICAgIHNvdW5kcy5tYXAoXHJcbiAgICAgICAgKHMpID0+XHJcbiAgICAgICAgICBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKCk7XHJcbiAgICAgICAgICAgIGF1ZGlvLnNyYyA9IHMucGF0aDtcclxuICAgICAgICAgICAgYXVkaW8ucHJlbG9hZCA9IFwiYXV0b1wiO1xyXG4gICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzLnZvbHVtZTtcclxuICAgICAgICAgICAgYXVkaW8uYWRkRXZlbnRMaXN0ZW5lcihcclxuICAgICAgICAgICAgICBcImNhbnBsYXl0aHJvdWdoXCIsXHJcbiAgICAgICAgICAgICAgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hdWRpb01hcC5zZXQocy5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICBsb2FkZWQrKztcclxuICAgICAgICAgICAgICAgIG9uUHJvZ3Jlc3M/Lihsb2FkZWQsIHRvdGFsKTtcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgIHsgb25jZTogdHJ1ZSB9XHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGF1ZGlvLmFkZEV2ZW50TGlzdGVuZXIoXCJlcnJvclwiLCAoZXYpID0+IHtcclxuICAgICAgICAgICAgICAvLyBzdGlsbCByZXNvbHZlIHNvIGEgbWlzc2luZyBhdWRpbyB3b24ndCBsb2NrIHRoZSBsb2FkZXJcclxuICAgICAgICAgICAgICBsb2FkZWQrKztcclxuICAgICAgICAgICAgICBvblByb2dyZXNzPy4obG9hZGVkLCB0b3RhbCk7XHJcbiAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgIClcclxuICAgICk7XHJcbiAgfVxyXG59XHJcblxyXG5jbGFzcyBLYXJ0R2FtZSB7XHJcbiAgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICBsb2FkZXIgPSBuZXcgQXNzZXRMb2FkZXIoKTtcclxuICBzY2VuZSE6IFRIUkVFLlNjZW5lO1xyXG4gIGNhbWVyYSE6IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhO1xyXG4gIHJlbmRlcmVyITogVEhSRUUuV2ViR0xSZW5kZXJlcjtcclxuICBsaWdodCE6IFRIUkVFLkRpcmVjdGlvbmFsTGlnaHQ7XHJcbiAgd29ybGQhOiBDQU5OT04uV29ybGQ7XHJcbiAga2FydEJvZHkhOiBDQU5OT04uQm9keTtcclxuICBrYXJ0TWVzaCE6IFRIUkVFLk1lc2g7XHJcbiAgdHJhY2tNZXNoITogVEhSRUUuTWVzaDtcclxuICBjbG9jayA9IG5ldyBUSFJFRS5DbG9jaygpO1xyXG4gIGlucHV0U3RhdGUgPSB7IGZvcndhcmQ6IDAsIHN0ZWVyOiAwLCBicmFrZTogZmFsc2UgfTtcclxuICBydW5uaW5nID0gZmFsc2U7XHJcbiAgdWlSb290ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgdGl0bGVTY3JlZW4hOiBIVE1MRGl2RWxlbWVudDtcclxuICBodWQhOiBIVE1MRGl2RWxlbWVudDtcclxuICBzcGVlZEVsZW1lbnQhOiBIVE1MRGl2RWxlbWVudDtcclxuICBsYXBFbGVtZW50ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgZW5naW5lQXVkaW8/OiBIVE1MQXVkaW9FbGVtZW50O1xyXG4gIGJnbUF1ZGlvPzogSFRNTEF1ZGlvRWxlbWVudDtcclxuICBsYXN0VGltZSA9IDA7XHJcbiAgbGFwcyA9IDA7XHJcbiAgbGFwU3RhcnRYID0gMDtcclxuICBrYXJ0TWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7IC8vIEFkZGVkIGthcnQgbWF0ZXJpYWxcclxuXHJcbiAgY29uc3RydWN0b3IoY2FudmFzSWQgPSBcImdhbWVDYW52YXNcIikge1xyXG4gICAgY29uc3QgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCk7XHJcbiAgICBpZiAoIWVsIHx8ICEoZWwgaW5zdGFuY2VvZiBIVE1MQ2FudmFzRWxlbWVudCkpXHJcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbnZhcyB3aXRoIGlkICdnYW1lQ2FudmFzJyBub3QgZm91bmQuXCIpO1xyXG4gICAgdGhpcy5jYW52YXMgPSBlbDtcclxuICB9XHJcblxyXG4gIGFzeW5jIGluaXQoKSB7XHJcbiAgICBhd2FpdCB0aGlzLmxvYWRlci5sb2FkQ29uZmlnKCk7XHJcbiAgICAvLyBDcmVhdGUgVUkgZWFybHkgc28gcHJvZ3Jlc3MgY2FuIHNob3dcclxuICAgIHRoaXMuY3JlYXRlVUkoKTtcclxuICAgIC8vIFNob3cgbG9hZGluZyBtZXNzYWdlXHJcbiAgICB0aGlzLnNob3dUaXRsZVNjcmVlbkxvYWRpbmcoXCJMb2FkaW5nIGFzc2V0cy4uLlwiKTtcclxuICAgIGF3YWl0IHRoaXMubG9hZGVyLmxvYWRJbWFnZXMoKG4sIHQpID0+XHJcbiAgICAgIHRoaXMuc2hvd1RpdGxlU2NyZWVuTG9hZGluZyhgTG9hZGluZyBpbWFnZXMgJHtufS8ke3R9Li4uYClcclxuICAgICk7XHJcbiAgICBhd2FpdCB0aGlzLmxvYWRlci5sb2FkQXVkaW8oKG4sIHQpID0+XHJcbiAgICAgIHRoaXMuc2hvd1RpdGxlU2NyZWVuTG9hZGluZyhgTG9hZGluZyBhdWRpbyAke259LyR7dH0uLi5gKVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBhc3NpZ24gYXVkaW9zXHJcbiAgICB0aGlzLmVuZ2luZUF1ZGlvID0gdGhpcy5sb2FkZXIuYXVkaW9NYXAuZ2V0KFwiZW5naW5lXCIpPy5jbG9uZU5vZGUodHJ1ZSkgYXNcclxuICAgICAgfCBIVE1MQXVkaW9FbGVtZW50XHJcbiAgICAgIHwgdW5kZWZpbmVkO1xyXG4gICAgdGhpcy5iZ21BdWRpbyA9IHRoaXMubG9hZGVyLmF1ZGlvTWFwLmdldChcImJnbVwiKT8uY2xvbmVOb2RlKHRydWUpIGFzXHJcbiAgICAgIHwgSFRNTEF1ZGlvRWxlbWVudFxyXG4gICAgICB8IHVuZGVmaW5lZDtcclxuXHJcbiAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICB0aGlzLmJnbUF1ZGlvLmxvb3AgPSB0cnVlO1xyXG4gICAgICB0aGlzLmJnbUF1ZGlvLnZvbHVtZSA9IHRoaXMuYmdtQXVkaW8udm9sdW1lICogMC42O1xyXG4gICAgfVxyXG4gICAgLy8gQ29tcG9zZSB0aGUgc2NlbmVcclxuICAgIHRoaXMuc2V0dXBUaHJlZSgpO1xyXG4gICAgdGhpcy5zZXR1cFdvcmxkKCk7XHJcbiAgICB0aGlzLmNyZWF0ZVRyYWNrKCk7XHJcbiAgICB0aGlzLmNyZWF0ZUthcnQoKTtcclxuICAgIHRoaXMuY3JlYXRlTGlnaHRzKCk7XHJcbiAgICB0aGlzLmNyZWF0ZUhVRCgpO1xyXG4gICAgdGhpcy5zaG93VGl0bGVTY3JlZW4oKTsgLy8gdGl0bGUgd2FpdHMgZm9yIGlucHV0XHJcbiAgICB0aGlzLmF0dGFjaElucHV0KCk7XHJcbiAgICB0aGlzLm9uUmVzaXplKCk7XHJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCAoKSA9PiB0aGlzLm9uUmVzaXplKCkpO1xyXG4gICAgLy8ga2VlcCBsYXN0VGltZSBmb3IgcGh5c2ljcyB0aW1pbmdcclxuICAgIHRoaXMubGFzdFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICAgIC8vIHN0YXJ0IHJlbmRlciBsb29wIHJlZ2FyZGxlc3MsIGJ1dCBnYW1lLnJ1biB3b24ndCBzaW11bGF0ZSB1bnRpbCBzdGFydGVkXHJcbiAgICB0aGlzLmFuaW1hdGUoKTtcclxuICB9XHJcblxyXG4gIGNyZWF0ZVVJKCkge1xyXG4gICAgLy8gcm9vdCBvdmVybGF5XHJcbiAgICB0aGlzLnVpUm9vdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBPYmplY3QuYXNzaWduKHRoaXMudWlSb290LnN0eWxlLCB7XHJcbiAgICAgIHBvc2l0aW9uOiBcImFic29sdXRlXCIsXHJcbiAgICAgIGxlZnQ6IFwiMFwiLFxyXG4gICAgICB0b3A6IFwiMFwiLFxyXG4gICAgICB3aWR0aDogXCIxMDAlXCIsXHJcbiAgICAgIGhlaWdodDogXCIxMDAlXCIsXHJcbiAgICAgIHBvaW50ZXJFdmVudHM6IFwibm9uZVwiLFxyXG4gICAgICBmb250RmFtaWx5OiBcIkFyaWFsLCBIZWx2ZXRpY2EsIHNhbnMtc2VyaWZcIixcclxuICAgIH0gYXMgQ1NTU3R5bGVEZWNsYXJhdGlvbik7XHJcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMudWlSb290KTtcclxuXHJcbiAgICAvLyBUaXRsZSBzY3JlZW5cclxuICAgIHRoaXMudGl0bGVTY3JlZW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgT2JqZWN0LmFzc2lnbih0aGlzLnRpdGxlU2NyZWVuLnN0eWxlLCB7XHJcbiAgICAgIHBvc2l0aW9uOiBcImFic29sdXRlXCIsXHJcbiAgICAgIGxlZnQ6IFwiMFwiLFxyXG4gICAgICB0b3A6IFwiMFwiLFxyXG4gICAgICB3aWR0aDogXCIxMDAlXCIsXHJcbiAgICAgIGhlaWdodDogXCIxMDAlXCIsXHJcbiAgICAgIGRpc3BsYXk6IFwiZmxleFwiLFxyXG4gICAgICBhbGlnbkl0ZW1zOiBcImNlbnRlclwiLFxyXG4gICAgICBqdXN0aWZ5Q29udGVudDogXCJjZW50ZXJcIixcclxuICAgICAgZmxleERpcmVjdGlvbjogXCJjb2x1bW5cIixcclxuICAgICAgYmFja2dyb3VuZDogXCJyZ2JhKDAsMCwwLDAuNTUpXCIsXHJcbiAgICAgIGNvbG9yOiBcIndoaXRlXCIsXHJcbiAgICAgIHBvaW50ZXJFdmVudHM6IFwiYXV0b1wiLFxyXG4gICAgICBnYXA6IFwiMThweFwiLFxyXG4gICAgfSBhcyBDU1NTdHlsZURlY2xhcmF0aW9uKTtcclxuICAgIHRoaXMudWlSb290LmFwcGVuZENoaWxkKHRoaXMudGl0bGVTY3JlZW4pO1xyXG4gIH1cclxuXHJcbiAgc2hvd1RpdGxlU2NyZWVuTG9hZGluZyh0ZXh0OiBzdHJpbmcpIHtcclxuICAgIHRoaXMudGl0bGVTY3JlZW4uaW5uZXJIVE1MID0gXCJcIjtcclxuICAgIGNvbnN0IHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgdC5pbm5lclRleHQgPSB0ZXh0O1xyXG4gICAgT2JqZWN0LmFzc2lnbih0LnN0eWxlLCB7IGZvbnRTaXplOiBcIjIwcHhcIiB9IGFzIENTU1N0eWxlRGVjbGFyYXRpb24pO1xyXG4gICAgdGhpcy50aXRsZVNjcmVlbi5hcHBlbmRDaGlsZCh0KTtcclxuICB9XHJcblxyXG4gIHNob3dUaXRsZVNjcmVlbigpIHtcclxuICAgIHRoaXMudGl0bGVTY3JlZW4uaW5uZXJIVE1MID0gXCJcIjtcclxuICAgIGNvbnN0IHRpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIHRpdGxlLmlubmVyVGV4dCA9IHRoaXMubG9hZGVyLmRhdGEudWk/LnRpdGxlVGV4dCA/PyB0aGlzLmxvYWRlci5kYXRhLnRpdGxlO1xyXG4gICAgT2JqZWN0LmFzc2lnbih0aXRsZS5zdHlsZSwge1xyXG4gICAgICBmb250U2l6ZTogXCI0NHB4XCIsXHJcbiAgICAgIGZvbnRXZWlnaHQ6IFwiNzAwXCIsXHJcbiAgICB9IGFzIENTU1N0eWxlRGVjbGFyYXRpb24pO1xyXG4gICAgY29uc3QgaGludCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBoaW50LmlubmVyVGV4dCA9XHJcbiAgICAgIHRoaXMubG9hZGVyLmRhdGEudWk/LnN0YXJ0SGludCA/PyBcIlByZXNzIEVudGVyIG9yIENsaWNrIHRvIFN0YXJ0XCI7XHJcbiAgICBPYmplY3QuYXNzaWduKGhpbnQuc3R5bGUsIHtcclxuICAgICAgZm9udFNpemU6IFwiMThweFwiLFxyXG4gICAgICBvcGFjaXR5OiBcIjAuOVwiLFxyXG4gICAgfSBhcyBDU1NTdHlsZURlY2xhcmF0aW9uKTtcclxuICAgIGNvbnN0IGluc3RydWN0aW9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICBpbnN0cnVjdGlvbnMuaW5uZXJUZXh0ID1cclxuICAgICAgXCJBcnJvd3MgLyBBIEQgdG8gc3RlZXIsIFcgdG8gYWNjZWxlcmF0ZSwgUyB0byBicmFrZS5cIjtcclxuICAgIE9iamVjdC5hc3NpZ24oaW5zdHJ1Y3Rpb25zLnN0eWxlLCB7XHJcbiAgICAgIGZvbnRTaXplOiBcIjE0cHhcIixcclxuICAgICAgb3BhY2l0eTogXCIwLjlcIixcclxuICAgIH0gYXMgQ1NTU3R5bGVEZWNsYXJhdGlvbik7XHJcblxyXG4gICAgdGhpcy50aXRsZVNjcmVlbi5hcHBlbmRDaGlsZCh0aXRsZSk7XHJcbiAgICB0aGlzLnRpdGxlU2NyZWVuLmFwcGVuZENoaWxkKGhpbnQpO1xyXG4gICAgdGhpcy50aXRsZVNjcmVlbi5hcHBlbmRDaGlsZChpbnN0cnVjdGlvbnMpO1xyXG5cclxuICAgIC8vIHN0YXJ0IG9uIGNsaWNrIG9yIEVudGVyXHJcbiAgICBjb25zdCBzdGFydE5vdyA9ICgpID0+IHtcclxuICAgICAgdGhpcy50aXRsZVNjcmVlbi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XHJcbiAgICAgIHRoaXMuc3RhcnRHYW1lKCk7XHJcbiAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBvbktleSk7XHJcbiAgICB9O1xyXG4gICAgY29uc3Qgb25LZXkgPSAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xyXG4gICAgICBpZiAoZS5rZXkgPT09IFwiRW50ZXJcIiB8fCBlLmtleSA9PT0gXCIgXCIpIHN0YXJ0Tm93KCk7XHJcbiAgICB9O1xyXG4gICAgdGhpcy50aXRsZVNjcmVlbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gc3RhcnROb3coKSwge1xyXG4gICAgICBvbmNlOiB0cnVlLFxyXG4gICAgfSk7XHJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgb25LZXkpO1xyXG4gIH1cclxuXHJcbiAgY3JlYXRlSFVEKCkge1xyXG4gICAgdGhpcy5odWQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgT2JqZWN0LmFzc2lnbih0aGlzLmh1ZC5zdHlsZSwge1xyXG4gICAgICBwb3NpdGlvbjogXCJhYnNvbHV0ZVwiLFxyXG4gICAgICByaWdodDogXCIxMnB4XCIsXHJcbiAgICAgIHRvcDogXCIxMnB4XCIsXHJcbiAgICAgIGNvbG9yOiBcIndoaXRlXCIsXHJcbiAgICAgIGZvbnRTaXplOiBcIjE2cHhcIixcclxuICAgICAgcG9pbnRlckV2ZW50czogXCJub25lXCIsXHJcbiAgICAgIHRleHRBbGlnbjogXCJyaWdodFwiLFxyXG4gICAgICB0ZXh0U2hhZG93OiBcIjAgMCA2cHggcmdiYSgwLDAsMCwwLjgpXCIsXHJcbiAgICB9IGFzIENTU1N0eWxlRGVjbGFyYXRpb24pO1xyXG4gICAgdGhpcy5zcGVlZEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgdGhpcy5zcGVlZEVsZW1lbnQuaW5uZXJUZXh0ID0gXCJTcGVlZDogMFwiO1xyXG4gICAgdGhpcy5sYXBFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIHRoaXMubGFwRWxlbWVudC5pbm5lclRleHQgPSBcIkxhcDogMFwiO1xyXG4gICAgdGhpcy5odWQuYXBwZW5kQ2hpbGQodGhpcy5zcGVlZEVsZW1lbnQpO1xyXG4gICAgdGhpcy5odWQuYXBwZW5kQ2hpbGQodGhpcy5sYXBFbGVtZW50KTtcclxuICAgIHRoaXMudWlSb290LmFwcGVuZENoaWxkKHRoaXMuaHVkKTtcclxuICB9XHJcblxyXG4gIHNldHVwVGhyZWUoKSB7XHJcbiAgICB0aGlzLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XHJcbiAgICAvLyBmaW5kIGNhbnZhcyBwcm92aWRlZCBieSBIVE1MXHJcbiAgICB0aGlzLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoe1xyXG4gICAgICBjYW52YXM6IHRoaXMuY2FudmFzLFxyXG4gICAgICBhbnRpYWxpYXM6IHRydWUsXHJcbiAgICB9KTtcclxuICAgIHRoaXMucmVuZGVyZXIuc2V0UGl4ZWxSYXRpbyh3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyB8fCAxKTtcclxuICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKDYwLCAxLCAwLjEsIDEwMDApO1xyXG4gICAgdGhpcy5jYW1lcmEucG9zaXRpb24uc2V0KDAsIDYsIC0xMik7XHJcbiAgICB0aGlzLmNhbWVyYS5sb29rQXQoMCwgMCwgMCk7XHJcbiAgICAvLyBhbWJpZW50XHJcbiAgICB0aGlzLnNjZW5lLmFkZChuZXcgVEhSRUUuQW1iaWVudExpZ2h0KDB4ZmZmZmZmLCAwLjYpKTtcclxuICB9XHJcblxyXG4gIHNldHVwV29ybGQoKSB7XHJcbiAgICB0aGlzLndvcmxkID0gbmV3IENBTk5PTi5Xb3JsZCh7XHJcbiAgICAgIGdyYXZpdHk6IG5ldyBDQU5OT04uVmVjMygwLCAtOS44MiwgMCksXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBncm91bmRNYXQgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKFwiZ3JvdW5kTWF0XCIpO1xyXG4gICAgY29uc3Qga2FydE1hdCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoXCJrYXJ0TWF0XCIpOyAvLyBEZWZpbmUga2FydCBtYXRlcmlhbFxyXG4gICAgdGhpcy5rYXJ0TWF0ZXJpYWwgPSBrYXJ0TWF0OyAvLyBTdG9yZSBpdCBmb3IgdXNlIGluIGNyZWF0ZUthcnRcclxuXHJcbiAgICAvLyBncm91bmQgcGxhbmVcclxuICAgIGNvbnN0IGdyb3VuZCA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgIG1hc3M6IDAsXHJcbiAgICAgIHNoYXBlOiBuZXcgQ0FOTk9OLlBsYW5lKCksXHJcbiAgICAgIG1hdGVyaWFsOiBncm91bmRNYXQsXHJcbiAgICB9KTtcclxuICAgIGdyb3VuZC5xdWF0ZXJuaW9uLnNldEZyb21FdWxlcigtTWF0aC5QSSAvIDIsIDAsIDApO1xyXG4gICAgdGhpcy53b3JsZC5hZGRCb2R5KGdyb3VuZCk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIGEgY29udGFjdCBtYXRlcmlhbCBmb3IgZ3JvdW5kIGFuZCBrYXJ0IGludGVyYWN0aW9uXHJcbiAgICBjb25zdCBncm91bmRLYXJ0Q29udGFjdE1hdCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKGdyb3VuZE1hdCwga2FydE1hdCwge1xyXG4gICAgICBmcmljdGlvbjogMC44LCAvLyBJbmNyZWFzZWQgZnJpY3Rpb24gZm9yIGJldHRlciBncmlwIGFuZCBmb3J3YXJkIG1vdGlvblxyXG4gICAgICByZXN0aXR1dGlvbjogMC4xLCAvLyBMb3cgcmVzdGl0dXRpb24gZm9yIGxlc3MgYm91bmN5IGNvbGxpc2lvbnNcclxuICAgIH0pO1xyXG4gICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwoZ3JvdW5kS2FydENvbnRhY3RNYXQpO1xyXG4gIH1cclxuXHJcbiAgY3JlYXRlTGlnaHRzKCkge1xyXG4gICAgdGhpcy5saWdodCA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KDB4ZmZmZmZmLCAwLjgpO1xyXG4gICAgdGhpcy5saWdodC5wb3NpdGlvbi5zZXQoMTAsIDIwLCAxMCk7XHJcbiAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLmxpZ2h0KTtcclxuICB9XHJcblxyXG4gIGNyZWF0ZVRyYWNrKCkge1xyXG4gICAgLy8gU2ltcGxlIGNpcmN1bGFyIHRyYWNrIHJlcHJlc2VudGVkIGJ5IGEgbGFyZ2UgdGV4dHVyZWQgcmluZyBvbiB0aGUgWFogcGxhbmUuXHJcbiAgICBjb25zdCB0cmFja1JhZGl1cyA9IHRoaXMubG9hZGVyLmRhdGEudHJhY2sucmFkaXVzID8/IDIwO1xyXG4gICAgY29uc3QgaW5uZXJSYWRpdXMgPSB0cmFja1JhZGl1cyAtIDQ7XHJcbiAgICBjb25zdCBvdXRlclJhZGl1cyA9IHRyYWNrUmFkaXVzICsgNDtcclxuICAgIGNvbnN0IHNlZ21lbnRzID0gNjQ7XHJcbiAgICAvLyBVc2Ugb25lIG9mIHRoZSBpbWFnZXMgYXMgdGV4dHVyZSAoaWYgcHJvdmlkZWQpLCBvdGhlcndpc2UgZmFsbCBiYWNrIHRvIGNvbG9yXHJcbiAgICBjb25zdCB0cmFja1RleCA9IHRoaXMubG9hZGVyLnRleHR1cmVNYXAuZ2V0KFwidHJhY2tcIikgPz8gbnVsbDtcclxuICAgIGNvbnN0IGdlbyA9IG5ldyBUSFJFRS5SaW5nR2VvbWV0cnkoaW5uZXJSYWRpdXMsIG91dGVyUmFkaXVzLCBzZWdtZW50cyk7XHJcbiAgICBjb25zdCBtYXQgPSBuZXcgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwoe1xyXG4gICAgICBtYXA6IHRyYWNrVGV4ID8/IHVuZGVmaW5lZCxcclxuICAgICAgc2lkZTogVEhSRUUuRG91YmxlU2lkZSxcclxuICAgICAgcm91Z2huZXNzOiAxLjAsXHJcbiAgICB9KTtcclxuICAgIHRoaXMudHJhY2tNZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvLCBtYXQpO1xyXG4gICAgdGhpcy50cmFja01lc2gucm90YXRpb24ueCA9IC1NYXRoLlBJIC8gMjtcclxuICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMudHJhY2tNZXNoKTtcclxuXHJcbiAgICAvLyBBZGQgc2ltcGxlIGVudmlyb25tZW50IHBsYW5lIChncmFzcykgdXNpbmcgaW1hZ2UgaWYgYXZhaWxhYmxlXHJcbiAgICBjb25zdCBncmFzc1RleCA9IHRoaXMubG9hZGVyLnRleHR1cmVNYXAuZ2V0KFwiZ3Jhc3NcIikgPz8gbnVsbDtcclxuICAgIGNvbnN0IHBsYW5lR2VvID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkoNDAwLCA0MDApO1xyXG4gICAgY29uc3QgcGxhbmVNYXQgPSBuZXcgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwoe1xyXG4gICAgICBtYXA6IGdyYXNzVGV4ID8/IHVuZGVmaW5lZCxcclxuICAgIH0pO1xyXG4gICAgY29uc3QgcGxhbmUgPSBuZXcgVEhSRUUuTWVzaChwbGFuZUdlbywgcGxhbmVNYXQpO1xyXG4gICAgcGxhbmUucm90YXRpb24ueCA9IC1NYXRoLlBJIC8gMjtcclxuICAgIHBsYW5lLnBvc2l0aW9uLnkgPSAtMC4wMTtcclxuICAgIHRoaXMuc2NlbmUuYWRkKHBsYW5lKTtcclxuICB9XHJcblxyXG4gIGNyZWF0ZUthcnQoKSB7XHJcbiAgICAvLyBQaHlzaWNzIGJvZHk6IHNpbXBsZSBib3hcclxuICAgIGNvbnN0IGtjZmcgPSB0aGlzLmxvYWRlci5kYXRhLmthcnQ7XHJcbiAgICBjb25zdCBoYWxmRXh0ZW50cyA9IG5ldyBDQU5OT04uVmVjMyhrY2ZnLndpZHRoIC8gMiwgMC41LCBrY2ZnLmxlbmd0aCAvIDIpO1xyXG4gICAgY29uc3Qgc2hhcGUgPSBuZXcgQ0FOTk9OLkJveChoYWxmRXh0ZW50cyk7XHJcbiAgICB0aGlzLmthcnRCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHsgbWFzczoga2NmZy5tYXNzLCBtYXRlcmlhbDogdGhpcy5rYXJ0TWF0ZXJpYWwgfSk7IC8vIEFzc2lnbiBrYXJ0IG1hdGVyaWFsXHJcbiAgICB0aGlzLmthcnRCb2R5LmFkZFNoYXBlKHNoYXBlKTtcclxuICAgIC8vIHNwYXduIGF0IHRyYWNrIHN0YXJ0XHJcbiAgICBjb25zdCBzdGFydFJhZGl1cyA9IHRoaXMubG9hZGVyLmRhdGEudHJhY2sucmFkaXVzO1xyXG4gICAgdGhpcy5rYXJ0Qm9keS5wb3NpdGlvbi5zZXQoc3RhcnRSYWRpdXMsIDAuNSwgMCk7XHJcbiAgICB0aGlzLndvcmxkLmFkZEJvZHkodGhpcy5rYXJ0Qm9keSk7XHJcblxyXG4gICAgLy8gVmlzdWFsIG1lc2g6IHVzZSBpbWFnZSB0ZXh0dXJlIG1hcHBlZCB0byBhIGJveFxyXG4gICAgY29uc3Qga2FydFRleCA9IHRoaXMubG9hZGVyLnRleHR1cmVNYXAuZ2V0KFwicGxheWVyXCIpID8/IG51bGw7XHJcbiAgICBjb25zdCBnZW9tID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KGtjZmcud2lkdGgsIDAuNiwga2NmZy5sZW5ndGgpO1xyXG4gICAgY29uc3QgbWF0czogVEhSRUUuTWF0ZXJpYWxbXSA9IFtdO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA2OyBpKyspIHtcclxuICAgICAgY29uc3QgbSA9IG5ldyBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCh7IG1hcDoga2FydFRleCA/PyB1bmRlZmluZWQgfSk7XHJcbiAgICAgIG1hdHMucHVzaChtKTtcclxuICAgIH1cclxuICAgIHRoaXMua2FydE1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tLCBtYXRzKTtcclxuICAgIHRoaXMua2FydE1lc2guY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLmthcnRNZXNoKTtcclxuXHJcbiAgICAvLyBzbWFsbCBjYW1lcmEgY2hhc2Ugb2Zmc2V0IHdpbGwgdXBkYXRlIGR1cmluZyBsb29wXHJcbiAgfVxyXG5cclxuICBhdHRhY2hJbnB1dCgpIHtcclxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZSkgPT4ge1xyXG4gICAgICBpZiAoZS5rZXkgPT09IFwid1wiIHx8IGUua2V5ID09PSBcIkFycm93VXBcIikgdGhpcy5pbnB1dFN0YXRlLmZvcndhcmQgPSAxO1xyXG4gICAgICBpZiAoZS5rZXkgPT09IFwic1wiIHx8IGUua2V5ID09PSBcIkFycm93RG93blwiKSB0aGlzLmlucHV0U3RhdGUuZm9yd2FyZCA9IC0xO1xyXG4gICAgICBpZiAoZS5rZXkgPT09IFwiYVwiIHx8IGUua2V5ID09PSBcIkFycm93TGVmdFwiKSB0aGlzLmlucHV0U3RhdGUuc3RlZXIgPSAxO1xyXG4gICAgICBpZiAoZS5rZXkgPT09IFwiZFwiIHx8IGUua2V5ID09PSBcIkFycm93UmlnaHRcIikgdGhpcy5pbnB1dFN0YXRlLnN0ZWVyID0gLTE7XHJcbiAgICAgIGlmIChlLmtleSA9PT0gXCIgXCIpIHRoaXMuaW5wdXRTdGF0ZS5icmFrZSA9IHRydWU7XHJcbiAgICB9KTtcclxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5dXBcIiwgKGUpID0+IHtcclxuICAgICAgaWYgKFxyXG4gICAgICAgIChlLmtleSA9PT0gXCJ3XCIgfHwgZS5rZXkgPT09IFwiQXJyb3dVcFwiKSAmJlxyXG4gICAgICAgIHRoaXMuaW5wdXRTdGF0ZS5mb3J3YXJkID09PSAxXHJcbiAgICAgIClcclxuICAgICAgICB0aGlzLmlucHV0U3RhdGUuZm9yd2FyZCA9IDA7XHJcbiAgICAgIGlmIChcclxuICAgICAgICAoZS5rZXkgPT09IFwic1wiIHx8IGUua2V5ID09PSBcIkFycm93RG93blwiKSAmJlxyXG4gICAgICAgIHRoaXMuaW5wdXRTdGF0ZS5mb3J3YXJkID09PSAtMVxyXG4gICAgICApXHJcbiAgICAgICAgdGhpcy5pbnB1dFN0YXRlLmZvcndhcmQgPSAwO1xyXG4gICAgICBpZiAoXHJcbiAgICAgICAgKGUua2V5ID09PSBcImFcIiB8fCBlLmtleSA9PT0gXCJBcnJvd0xlZnRcIikgJiZcclxuICAgICAgICB0aGlzLmlucHV0U3RhdGUuc3RlZXIgPT09IDFcclxuICAgICAgKVxyXG4gICAgICAgIHRoaXMuaW5wdXRTdGF0ZS5zdGVlciA9IDA7XHJcbiAgICAgIGlmIChcclxuICAgICAgICAoZS5rZXkgPT09IFwiZFwiIHx8IGUua2V5ID09PSBcIkFycm93UmlnaHRcIikgJiZcclxuICAgICAgICB0aGlzLmlucHV0U3RhdGUuc3RlZXIgPT09IC0xXHJcbiAgICAgIClcclxuICAgICAgICB0aGlzLmlucHV0U3RhdGUuc3RlZXIgPSAwO1xyXG4gICAgICBpZiAoZS5rZXkgPT09IFwiIFwiKSB0aGlzLmlucHV0U3RhdGUuYnJha2UgPSBmYWxzZTtcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIHNpbXBsZSB0b3VjaCAvIGNsaWNrIGNvbnRyb2xzOiB0YXAgbGVmdC9yaWdodCB0byBzdGVlciwgdG9wL2JvdHRvbSBmb3IgYWNjZWwvYnJha2VcclxuICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXHJcbiAgICAgIFwicG9pbnRlcmRvd25cIixcclxuICAgICAgKGV2KSA9PiB7XHJcbiAgICAgICAgY29uc3QgcmVjdCA9IHRoaXMuY2FudmFzLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIGNvbnN0IHggPSBldi5jbGllbnRYIC0gcmVjdC5sZWZ0O1xyXG4gICAgICAgIGNvbnN0IHkgPSBldi5jbGllbnRZIC0gcmVjdC50b3A7XHJcbiAgICAgICAgY29uc3QgY3ggPSByZWN0LndpZHRoIC8gMjtcclxuICAgICAgICBpZiAoeSA8IHJlY3QuaGVpZ2h0ICogMC42KSB0aGlzLmlucHV0U3RhdGUuZm9yd2FyZCA9IDE7XHJcbiAgICAgICAgZWxzZSB0aGlzLmlucHV0U3RhdGUuYnJha2UgPSB0cnVlO1xyXG4gICAgICAgIGlmICh4IDwgY3ggKiAwLjYpIHRoaXMuaW5wdXRTdGF0ZS5zdGVlciA9IDE7XHJcbiAgICAgICAgZWxzZSBpZiAoeCA+IGN4ICogMS40KSB0aGlzLmlucHV0U3RhdGUuc3RlZXIgPSAtMTtcclxuICAgICAgfSxcclxuICAgICAgeyBwYXNzaXZlOiB0cnVlIH1cclxuICAgICk7XHJcbiAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKFxyXG4gICAgICBcInBvaW50ZXJ1cFwiLFxyXG4gICAgICAoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5pbnB1dFN0YXRlLmZvcndhcmQgPSAwO1xyXG4gICAgICAgIHRoaXMuaW5wdXRTdGF0ZS5zdGVlciA9IDA7XHJcbiAgICAgICAgdGhpcy5pbnB1dFN0YXRlLmJyYWtlID0gZmFsc2U7XHJcbiAgICAgIH0sXHJcbiAgICAgIHsgcGFzc2l2ZTogdHJ1ZSB9XHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgc3RhcnRHYW1lKCkge1xyXG4gICAgaWYgKHRoaXMucnVubmluZykgcmV0dXJuO1xyXG4gICAgdGhpcy5ydW5uaW5nID0gdHJ1ZTtcclxuICAgIGlmICh0aGlzLmJnbUF1ZGlvKVxyXG4gICAgICB0cnkge1xyXG4gICAgICAgIHRoaXMuYmdtQXVkaW8ucGxheSgpO1xyXG4gICAgICB9IGNhdGNoIHt9XHJcbiAgICBpZiAodGhpcy5lbmdpbmVBdWRpbykge1xyXG4gICAgICB0aGlzLmVuZ2luZUF1ZGlvLmxvb3AgPSB0cnVlO1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIHRoaXMuZW5naW5lQXVkaW8ucGxheSgpO1xyXG4gICAgICB9IGNhdGNoIHt9XHJcbiAgICB9XHJcbiAgICB0aGlzLmxhcHMgPSAwO1xyXG4gICAgdGhpcy5sYXBTdGFydFggPSB0aGlzLmthcnRCb2R5LnBvc2l0aW9uLng7XHJcbiAgfVxyXG5cclxuICBzdG9wR2FtZSgpIHtcclxuICAgIHRoaXMucnVubmluZyA9IGZhbHNlO1xyXG4gICAgaWYgKHRoaXMuYmdtQXVkaW8pXHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgdGhpcy5iZ21BdWRpby5wYXVzZSgpO1xyXG4gICAgICAgIHRoaXMuYmdtQXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICB9IGNhdGNoIHt9XHJcbiAgICBpZiAodGhpcy5lbmdpbmVBdWRpbylcclxuICAgICAgdHJ5IHtcclxuICAgICAgICB0aGlzLmVuZ2luZUF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgdGhpcy5lbmdpbmVBdWRpby5jdXJyZW50VGltZSA9IDA7XHJcbiAgICAgIH0gY2F0Y2gge31cclxuICB9XHJcblxyXG4gIGFwcGx5UGh5c2ljcyhkdDogbnVtYmVyKSB7XHJcbiAgICBjb25zdCBrY2ZnID0gdGhpcy5sb2FkZXIuZGF0YS5rYXJ0O1xyXG4gICAgLy8gRm9yd2FyZCB2ZWN0b3IgZnJvbSBrYXJ0IG9yaWVudGF0aW9uIChDYW5ub24gYm9keSBxdWF0ZXJuaW9uKVxyXG4gICAgY29uc3QgcSA9IHRoaXMua2FydEJvZHkucXVhdGVybmlvbjtcclxuICAgIGNvbnN0IGZvcndhcmQgPSBuZXcgQ0FOTk9OLlZlYzMoMCwgMCwgMSk7XHJcbiAgICBxLnZtdWx0KGZvcndhcmQsIGZvcndhcmQpOyAvLyByb3RhdGUgbG9jYWwgZm9yd2FyZCB0byB3b3JsZFxyXG4gICAgLy8gY29tcHV0ZSBzcGVlZCBhbG9uZyBmb3J3YXJkXHJcbiAgICBjb25zdCB2ZWwgPSB0aGlzLmthcnRCb2R5LnZlbG9jaXR5O1xyXG4gICAgY29uc3Qgc3BlZWQgPSB2ZWwuZG90KGZvcndhcmQpO1xyXG5cclxuICAgIC8vIGFjY2VsZXJhdGlvbi9icmFraW5nXHJcbiAgICBjb25zdCBkZXNpcmVkQWNjZWwgPSB0aGlzLmlucHV0U3RhdGUuZm9yd2FyZCAqIGtjZmcuYWNjZWw7XHJcbiAgICAvLyBzaW1wbGUgdGhyb3R0bGU6IGFwcGx5IGZvcmNlIGluIGZvcndhcmQgZGlyZWN0aW9uXHJcbiAgICBpZiAoZGVzaXJlZEFjY2VsICE9PSAwKSB7XHJcbiAgICAgIGNvbnN0IGZvcmNlID0gZm9yd2FyZC5zY2FsZShkZXNpcmVkQWNjZWwgKiB0aGlzLmthcnRCb2R5Lm1hc3MpO1xyXG4gICAgICB0aGlzLmthcnRCb2R5LmFwcGx5Rm9yY2UoZm9yY2UsIHRoaXMua2FydEJvZHkucG9zaXRpb24pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIGJyYWtpbmc6IGFwcGx5IGRhbXBlbmluZ1xyXG4gICAgaWYgKHRoaXMuaW5wdXRTdGF0ZS5icmFrZSkge1xyXG4gICAgICBjb25zdCBicmFrZUZhY3RvciA9IDAuOTU7XHJcbiAgICAgIHRoaXMua2FydEJvZHkudmVsb2NpdHkuc2NhbGUoYnJha2VGYWN0b3IsIHRoaXMua2FydEJvZHkudmVsb2NpdHkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIGxpbWl0IHNwZWVkXHJcbiAgICBjb25zdCBtYXhTcGVlZCA9IGtjZmcubWF4U3BlZWQ7XHJcbiAgICBjb25zdCBjdXJyZW50U3BlZWQgPSB0aGlzLmthcnRCb2R5LnZlbG9jaXR5Lmxlbmd0aCgpO1xyXG4gICAgaWYgKGN1cnJlbnRTcGVlZCA+IG1heFNwZWVkKSB7XHJcbiAgICAgIC8vIHNjYWxlIGRvd24gdmVsb2NpdHlcclxuICAgICAgdGhpcy5rYXJ0Qm9keS52ZWxvY2l0eS5zY2FsZShcclxuICAgICAgICBtYXhTcGVlZCAvIGN1cnJlbnRTcGVlZCxcclxuICAgICAgICB0aGlzLmthcnRCb2R5LnZlbG9jaXR5XHJcbiAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gc3RlZXJpbmc6IGFwcGx5IHRvcnF1ZSBhcm91bmQgWSB0byByb3RhdGUgYm9keVxyXG4gICAgLy8gU3RlZXJpbmcgZWZmZWN0aXZlbmVzcyByZWR1Y2VzIGF0IGhpZ2hlciBzcGVlZCBmb3IgcmVhbGlzbVxyXG4gICAgY29uc3Qgc3RlZXJJbnB1dCA9IHRoaXMuaW5wdXRTdGF0ZS5zdGVlcjtcclxuICAgIGlmIChNYXRoLmFicyhzdGVlcklucHV0KSA+IDAuMDEpIHtcclxuICAgICAgY29uc3Qgc3RlZXJTdHJlbmd0aCA9XHJcbiAgICAgICAga2NmZy50dXJuU3BlZWQgKiAoMC41ICsgTWF0aC5tYXgoMCwgMSAtIGN1cnJlbnRTcGVlZCAvIG1heFNwZWVkKSk7XHJcbiAgICAgIGNvbnN0IHRvcnF1ZSA9IG5ldyBDQU5OT04uVmVjMyhcclxuICAgICAgICAwLFxyXG4gICAgICAgIHN0ZWVySW5wdXQgKiBzdGVlclN0cmVuZ3RoICogdGhpcy5rYXJ0Qm9keS5tYXNzLCAvLyBNb2RpZmllZDogUmVtb3ZlZCBkdCAqIDYwIGZvciBjb25zaXN0ZW50IHRvcnF1ZSBhcHBsaWNhdGlvblxyXG4gICAgICAgIDBcclxuICAgICAgKTtcclxuICAgICAgdGhpcy5rYXJ0Qm9keS50b3JxdWUudmFkZCh0b3JxdWUsIHRoaXMua2FydEJvZHkudG9ycXVlKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBTbWFsbCBkcmFnXHJcbiAgICBjb25zdCBkcmFnID0gMC45OTU7XHJcbiAgICBjb25zdCBkcmFnRmFjdG9yID0gTWF0aC5wb3coZHJhZywgZHQgKiA2MCk7IC8vIENhbGN1bGF0ZSBvbmNlXHJcbiAgICB0aGlzLmthcnRCb2R5LnZlbG9jaXR5LnNjYWxlKFxyXG4gICAgICBkcmFnRmFjdG9yLFxyXG4gICAgICB0aGlzLmthcnRCb2R5LnZlbG9jaXR5XHJcbiAgICApO1xyXG4gICAgLy8gQWRkZWQgYW5ndWxhciBkcmFnIHRvIGhlbHAgcHJldmVudCBleGNlc3NpdmUgc3Bpbm5pbmdcclxuICAgIHRoaXMua2FydEJvZHkuYW5ndWxhclZlbG9jaXR5LnNjYWxlKFxyXG4gICAgICBkcmFnRmFjdG9yLFxyXG4gICAgICB0aGlzLmthcnRCb2R5LmFuZ3VsYXJWZWxvY2l0eVxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIGFuaW1hdGUgPSAoKSA9PiB7XHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5hbmltYXRlKTtcclxuICAgIGNvbnN0IG5vdyA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgY29uc3QgZHQgPSBNYXRoLm1pbigobm93IC0gdGhpcy5sYXN0VGltZSkgLyAxMDAwLCAxIC8gMzApO1xyXG4gICAgdGhpcy5sYXN0VGltZSA9IG5vdztcclxuICAgIGlmICh0aGlzLnJ1bm5pbmcpIHtcclxuICAgICAgLy8gcGh5c2ljcyBzdGVwcGluZ1xyXG4gICAgICB0aGlzLmFwcGx5UGh5c2ljcyhkdCk7XHJcbiAgICAgIC8vIHdvcmxkIHN0ZXAgZml4ZWRcclxuICAgICAgdGhpcy53b3JsZC5zdGVwKDEgLyA2MCwgZHQsIDMpO1xyXG4gICAgICAvLyBzeW5jIHZpc3VhbHNcclxuICAgICAgdGhpcy5rYXJ0TWVzaC5wb3NpdGlvbi5zZXQoXHJcbiAgICAgICAgdGhpcy5rYXJ0Qm9keS5wb3NpdGlvbi54LFxyXG4gICAgICAgIHRoaXMua2FydEJvZHkucG9zaXRpb24ueSAtIDAuMjUsXHJcbiAgICAgICAgdGhpcy5rYXJ0Qm9keS5wb3NpdGlvbi56XHJcbiAgICAgICk7XHJcbiAgICAgIGNvbnN0IHFiID0gdGhpcy5rYXJ0Qm9keS5xdWF0ZXJuaW9uO1xyXG4gICAgICB0aGlzLmthcnRNZXNoLnF1YXRlcm5pb24uc2V0KHFiLngsIHFiLnksIHFiLnosIHFiLncpO1xyXG5cclxuICAgICAgLy8gdXBkYXRlIGxhcHMgKHNpbXBsZTogY3Jvc3MgWCA+IHN0YXJ0IHRocmVzaG9sZClcclxuICAgICAgY29uc3QgcHJldlggPSB0aGlzLmxhcFN0YXJ0WDtcclxuICAgICAgaWYgKHByZXZYIDwgMCAmJiB0aGlzLmthcnRCb2R5LnBvc2l0aW9uLnggPj0gMCkge1xyXG4gICAgICAgIHRoaXMubGFwcysrO1xyXG4gICAgICAgIHRoaXMubGFwU3RhcnRYID0gdGhpcy5rYXJ0Qm9keS5wb3NpdGlvbi54O1xyXG4gICAgICB9IGVsc2UgaWYgKHByZXZYID49IDAgJiYgdGhpcy5rYXJ0Qm9keS5wb3NpdGlvbi54IDwgMCkge1xyXG4gICAgICAgIHRoaXMubGFwcysrO1xyXG4gICAgICAgIHRoaXMubGFwU3RhcnRYID0gdGhpcy5rYXJ0Qm9keS5wb3NpdGlvbi54O1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gdXBkYXRlIGNhbWVyYSB0byBmb2xsb3cga2FydFxyXG4gICAgY29uc3QgZGVzaXJlZENhbVBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICBkZXNpcmVkQ2FtUG9zLmNvcHkodGhpcy5rYXJ0TWVzaC5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgLy8gb2Zmc2V0IGJlaGluZCBrYXJ0IGJhc2VkIG9uIGthcnQgb3JpZW50YXRpb25cclxuICAgIGNvbnN0IGZvcndhcmRWZWMgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAxKS5hcHBseVF1YXRlcm5pb24oXHJcbiAgICAgIHRoaXMua2FydE1lc2gucXVhdGVybmlvblxyXG4gICAgKTtcclxuICAgIGNvbnN0IGJhY2sgPSBmb3J3YXJkVmVjLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoLTgpO1xyXG4gICAgZGVzaXJlZENhbVBvcy5hZGQobmV3IFRIUkVFLlZlY3RvcjMoMCwgNCwgMCkpLmFkZChiYWNrKTtcclxuICAgIC8vIHNtb290aCBtb3ZlXHJcbiAgICB0aGlzLmNhbWVyYS5wb3NpdGlvbi5sZXJwKGRlc2lyZWRDYW1Qb3MsIDAuMTIpO1xyXG4gICAgdGhpcy5jYW1lcmEubG9va0F0KHRoaXMua2FydE1lc2gucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuXHJcbiAgICAvLyB1cGRhdGUgSFVEXHJcbiAgICBjb25zdCBzcGVlZCA9IE1hdGgucm91bmQodGhpcy5rYXJ0Qm9keS52ZWxvY2l0eS5sZW5ndGgoKSAqIDMuNik7IC8vIGNvbnZlcnQgdG8gYXJiaXRyYXJ5IGttL2ggZmVlbFxyXG4gICAgdGhpcy5zcGVlZEVsZW1lbnQuaW5uZXJUZXh0ID0gYFNwZWVkOiAke3NwZWVkfWA7XHJcbiAgICB0aGlzLmxhcEVsZW1lbnQuaW5uZXJUZXh0ID0gYExhcDogJHt0aGlzLmxhcHN9YDtcclxuXHJcbiAgICAvLyBlbmdpbmUgYXVkaW8gcGl0Y2ggYmFzZWQgb24gc3BlZWRcclxuICAgIGlmICh0aGlzLmVuZ2luZUF1ZGlvKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgdGhpcy5lbmdpbmVBdWRpby5wbGF5YmFja1JhdGUgPVxyXG4gICAgICAgICAgMC42ICtcclxuICAgICAgICAgIE1hdGgubWluKFxyXG4gICAgICAgICAgICAyLjAsXHJcbiAgICAgICAgICAgIDAuNiArXHJcbiAgICAgICAgICAgICAgKHRoaXMua2FydEJvZHkudmVsb2NpdHkubGVuZ3RoKCkgL1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZXIuZGF0YS5rYXJ0Lm1heFNwZWVkKSAqXHJcbiAgICAgICAgICAgICAgICAxLjVcclxuICAgICAgICAgICk7XHJcbiAgICAgIH0gY2F0Y2gge31cclxuICAgIH1cclxuXHJcbiAgICB0aGlzLnJlbmRlcmVyLnJlbmRlcih0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYSk7XHJcbiAgfTtcclxuXHJcbiAgb25SZXNpemUoKSB7XHJcbiAgICBjb25zdCB3ID0gdGhpcy5jYW52YXMuY2xpZW50V2lkdGggfHwgdGhpcy5jYW52YXMud2lkdGggfHwgd2luZG93LmlubmVyV2lkdGg7XHJcbiAgICBjb25zdCBoID1cclxuICAgICAgdGhpcy5jYW52YXMuY2xpZW50SGVpZ2h0IHx8IHRoaXMuY2FudmFzLmhlaWdodCB8fCB3aW5kb3cuaW5uZXJIZWlnaHQ7XHJcbiAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUodywgaCwgZmFsc2UpO1xyXG4gICAgdGhpcy5jYW1lcmEuYXNwZWN0ID0gdyAvIGg7XHJcbiAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XHJcbiAgfVxyXG59XHJcblxyXG4vLyBFbnRyeSBwb2ludFxyXG4oYXN5bmMgKCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBnYW1lID0gbmV3IEthcnRHYW1lKFwiZ2FtZUNhbnZhc1wiKTtcclxuICAgIGF3YWl0IGdhbWUuaW5pdCgpO1xyXG4gIH0gY2F0Y2ggKGVycikge1xyXG4gICAgLy8gY3JlYXRlIGEgc2ltcGxlIG92ZXJsYXkgZXJyb3Igc28gdXNlciBjYW4gc2VlXHJcbiAgICBjb25zdCBlcnJEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG5cclxuICAgIE9iamVjdC5hc3NpZ24oZXJyRGl2LnN0eWxlLCB7XHJcbiAgICAgIHBvc2l0aW9uOiBcImFic29sdXRlXCIsXHJcbiAgICAgIGxlZnQ6IFwiMFwiLFxyXG4gICAgICB0b3A6IFwiMFwiLFxyXG4gICAgICB3aWR0aDogXCIxMDAlXCIsXHJcbiAgICAgIGhlaWdodDogXCIxMDAlXCIsXHJcbiAgICAgIGRpc3BsYXk6IFwiZmxleFwiLFxyXG4gICAgICBhbGlnbkl0ZW1zOiBcImNlbnRlclwiLFxyXG4gICAgICBqdXN0aWZ5Q29udGVudDogXCJjZW50ZXJcIixcclxuICAgICAgY29sb3I6IFwid2hpdGVcIixcclxuICAgICAgYmFja2dyb3VuZDogXCJibGFja1wiLFxyXG4gICAgICBwYWRkaW5nOiBcIjIwcHhcIixcclxuICAgICAgYm94U2l6aW5nOiBcImJvcmRlci1ib3hcIixcclxuICAgICAgZm9udEZhbWlseTogXCJtb25vc3BhY2VcIixcclxuICAgIH0gYXMgQ1NTU3R5bGVEZWNsYXJhdGlvbik7XHJcblxyXG4gICAgZXJyRGl2LmlubmVyVGV4dCA9IGBHYW1lIGluaXQgZXJyb3I6ICR7U3RyaW5nKGVycil9YDtcclxuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZXJyRGl2KTtcclxuXHJcbiAgICBjb25zb2xlLmVycm9yKGVycik7XHJcbiAgfVxyXG59KSgpOyJdLAogICJtYXBwaW5ncyI6ICJBQUFBLFlBQVksV0FBVztBQUN2QixZQUFZLFlBQVk7QUF5QnhCLE1BQU0sWUFBWTtBQUFBLEVBQWxCO0FBRUUsb0JBQVcsb0JBQUksSUFBOEI7QUFDN0Msc0JBQWEsb0JB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
