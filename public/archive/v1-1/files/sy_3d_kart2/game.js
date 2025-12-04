import * as THREE from "three";
import * as CANNON from "cannon-es";
class KartRacerGame {
  constructor() {
    this.clock = new THREE.Clock();
    this.lastCollisionTime = 0;
    // Game State
    this.gameState = "LOADING";
    this.keysPressed = {};
    this.lapsCompleted = 0;
    // Assets & Audio
    this.textures = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.wheelMeshes = [];
    this.animate = () => {
      requestAnimationFrame(this.animate);
      const deltaTime = this.clock.getDelta();
      if (this.gameState === "PLAYING") {
        this.world.step(1 / 60, deltaTime, 3);
        this.updateControls();
        this.updateGraphics();
        this.updateCamera();
      }
      this.renderer.render(this.scene, this.camera);
    };
    this.init();
  }
  async init() {
    try {
      const response = await fetch("data.json");
      if (!response.ok) throw new Error("Failed to load data.json");
      this.data = await response.json();
      this.setupUI();
      this.showLoadingMessage();
      this.initThree();
      this.initCannon();
      await this.loadAssets();
      this.showTitleScreen();
      this.setupInputListeners();
      this.animate();
    } catch (error) {
      console.error("Initialization failed:", error);
      if (this.uiContainer) {
        this.uiContainer.innerHTML = `<div style="color: red; font-size: 24px;">Error: Could not load game data. Please check console.</div>`;
      }
    }
  }
  setupUI() {
    this.uiContainer = document.createElement("div");
    this.uiContainer.id = "ui-container";
    this.uiContainer.style.position = "absolute";
    this.uiContainer.style.top = "0";
    this.uiContainer.style.left = "0";
    this.uiContainer.style.width = "100%";
    this.uiContainer.style.height = "100%";
    this.uiContainer.style.display = "flex";
    this.uiContainer.style.justifyContent = "center";
    this.uiContainer.style.alignItems = "center";
    this.uiContainer.style.flexDirection = "column";
    this.uiContainer.style.color = "white";
    this.uiContainer.style.fontFamily = "Arial, sans-serif";
    this.uiContainer.style.textShadow = "2px 2px 4px #000000";
    this.uiContainer.style.pointerEvents = "none";
    document.body.appendChild(this.uiContainer);
  }
  showLoadingMessage() {
    this.uiContainer.innerHTML = `<h1 style="font-size: 48px;">Loading...</h1>`;
  }
  showTitleScreen() {
    this.gameState = "TITLE";
    this.uiContainer.innerHTML = `
            <h1 style="font-size: 48px;">${this.data.gameSettings.title}</h1>
            <p style="font-size: 24px;">${this.data.gameSettings.instructions}</p>
        `;
    this.uiContainer.style.display = "flex";
  }
  showFinishScreen() {
    this.gameState = "FINISHED";
    this.uiContainer.innerHTML = `
            <h1 style="font-size: 64px;">${this.data.gameSettings.finishMessage}</h1>
            <p style="font-size: 24px;">Press R to Restart</p>
        `;
    this.uiContainer.style.display = "flex";
  }
  hideUI() {
    this.uiContainer.style.display = "none";
  }
  initThree() {
    const canvas = document.getElementById("gameCanvas");
    if (!canvas) throw new Error('Canvas with id "gameCanvas" not found.');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(8900331);
    this.scene = new THREE.Scene();
    const camSettings = this.data.camera;
    this.camera = new THREE.PerspectiveCamera(camSettings.fov, window.innerWidth / window.innerHeight, camSettings.near, camSettings.far);
    this.scene.add(this.camera);
    const ambientLight = new THREE.AmbientLight(16777215, 0.6);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(16777215, 1);
    directionalLight.position.set(10, 20, 5);
    this.scene.add(directionalLight);
    this.audioListener = new THREE.AudioListener();
    this.camera.add(this.audioListener);
  }
  initCannon() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, this.data.gameSettings.gravity, 0)
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 10;
  }
  async loadAssets() {
    const textureLoader = new THREE.TextureLoader();
    const audioLoader = new THREE.AudioLoader();
    const imagePromises = this.data.assets.images.map(
      (img) => textureLoader.loadAsync(img.path).then((texture) => {
        this.textures.set(img.name, texture);
      })
    );
    const soundPromises = this.data.assets.sounds.map(
      (sound) => audioLoader.loadAsync(sound.path).then((buffer) => {
        const audio = new THREE.Audio(this.audioListener);
        audio.setBuffer(buffer);
        audio.setVolume(sound.volume);
        this.sounds.set(sound.name, audio);
      })
    );
    await Promise.all([...imagePromises, ...soundPromises]);
  }
  setupGame() {
    this.lapsCompleted = 0;
    this.createTrack();
    this.createPlayerKart();
    this.createFinishLine();
    const bgm = this.sounds.get("bgm");
    if (bgm && !bgm.isPlaying) {
      bgm.setLoop(true);
      bgm.play();
    }
    const engineIdle = this.sounds.get("engine_idle");
    if (engineIdle) {
      engineIdle.setLoop(true);
      engineIdle.play();
    }
  }
  resetGame() {
    this.sounds.forEach((sound) => {
      if (sound.isPlaying) sound.stop();
    });
    while (this.scene.children.length > 0) {
      const obj = this.scene.children[0];
      if (!(obj instanceof THREE.Camera) && !(obj instanceof THREE.Light)) {
        this.scene.remove(obj);
      } else {
        if (this.scene.children.length > 1) {
          this.scene.children.push(this.scene.children.shift());
        } else break;
      }
    }
    this.world.bodies.forEach((body) => this.world.removeBody(body));
    this.wheelMeshes = [];
    this.setupGame();
    this.gameState = "PLAYING";
    this.hideUI();
  }
  startGame() {
    if (this.gameState !== "TITLE") return;
    this.gameState = "PLAYING";
    this.hideUI();
    this.setupGame();
  }
  createTrack() {
    const trackData = this.data.track;
    const groundMaterial = new CANNON.Material("groundMaterial");
    const groundBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: groundMaterial
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);
    const groundTexture = this.textures.get("track");
    if (groundTexture) {
      groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
      groundTexture.repeat.set(trackData.groundSize.width / 20, trackData.groundSize.height / 20);
      const groundMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(trackData.groundSize.width, trackData.groundSize.height),
        new THREE.MeshLambertMaterial({ map: groundTexture })
      );
      groundMesh.rotation.x = -Math.PI / 2;
      this.scene.add(groundMesh);
    }
    const skyTexture = this.textures.get("sky");
    if (skyTexture) {
      const skybox = new THREE.Mesh(
        new THREE.BoxGeometry(500, 500, 500),
        new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide })
      );
      this.scene.add(skybox);
    }
    const wallMaterial = new CANNON.Material("wallMaterial");
    const createWall = (size, position) => {
      const wallBody = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)),
        material: wallMaterial,
        position: new CANNON.Vec3(position.x, position.y, position.z)
      });
      this.world.addBody(wallBody);
      const wallTexture = this.textures.get("wall");
      if (wallTexture) {
        wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
        wallTexture.repeat.set(Math.max(size.x, size.z) / 4, size.y / 4);
        const wallMesh = new THREE.Mesh(
          new THREE.BoxGeometry(size.x, size.y, size.z),
          new THREE.MeshLambertMaterial({ map: wallTexture })
        );
        wallMesh.position.copy(wallBody.position);
        this.scene.add(wallMesh);
      }
    };
    const w = trackData.groundSize.width / 2;
    const h = trackData.groundSize.height / 2;
    const wh = trackData.wallHeight;
    const wt = trackData.wallThickness;
    createWall({ x: trackData.groundSize.width, y: wh, z: wt }, { x: 0, y: wh / 2, z: -h });
    createWall({ x: trackData.groundSize.width, y: wh, z: wt }, { x: 0, y: wh / 2, z: h });
    createWall({ x: wt, y: wh, z: trackData.groundSize.height }, { x: -w, y: wh / 2, z: 0 });
    createWall({ x: wt, y: wh, z: trackData.groundSize.height }, { x: w, y: wh / 2, z: 0 });
    const contactMaterial = new CANNON.ContactMaterial(groundMaterial, wallMaterial, {
      friction: 0.01,
      restitution: 0.1
    });
    this.world.addContactMaterial(contactMaterial);
  }
  createFinishLine() {
    const position = this.data.track.finishLinePosition;
    const size = this.data.track.finishLineSize;
    const finishLineBody = new CANNON.Body({
      isTrigger: true,
      mass: 0,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      shape: new CANNON.Box(new CANNON.Vec3(size.width / 2, size.height / 2, size.depth / 2))
    });
    this.world.addBody(finishLineBody);
    finishLineBody.addEventListener("collide", (event) => {
      if (event.body === this.chassisBody) {
        this.lapsCompleted++;
        if (this.lapsCompleted >= this.data.gameSettings.laps) {
          this.showFinishScreen();
        }
      }
    });
    const finishTexture = this.textures.get("finish_line");
    if (finishTexture) {
      const finishMesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.width, size.height, size.depth),
        new THREE.MeshBasicMaterial({ map: finishTexture, transparent: true })
      );
      finishMesh.position.copy(finishLineBody.position);
      this.scene.add(finishMesh);
    }
  }
  createPlayerKart() {
    const p = this.data.playerKart;
    const chassisShape = new CANNON.Box(new CANNON.Vec3(p.chassisSize.width / 2, p.chassisSize.height / 2, p.chassisSize.depth / 2));
    this.chassisBody = new CANNON.Body({ mass: p.mass });
    this.chassisBody.addShape(chassisShape);
    this.chassisBody.position.set(0, 2, -30);
    this.chassisBody.addEventListener("collide", (event) => {
      const contactNormal = event.contact.ni;
      const impactVelocity = event.contact.getImpactVelocityAlongNormal();
      if (impactVelocity > 1) {
        const now = performance.now();
        if (now - this.lastCollisionTime > 500) {
          this.sounds.get("crash")?.play();
          this.lastCollisionTime = now;
        }
      }
    });
    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassisBody,
      indexRightAxis: 0,
      // x
      indexUpAxis: 1,
      // y
      indexForwardAxis: 2
      // z
    });
    const wheelOptions = {
      radius: p.wheelRadius,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: p.suspension.stiffness,
      suspensionRestLength: p.suspension.restLength,
      frictionSlip: p.friction,
      dampingRelaxation: p.suspension.damping,
      dampingCompression: p.suspension.compression,
      maxSuspensionForce: 1e5,
      rollInfluence: p.rollInfluence,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(),
      maxSuspensionTravel: 0.3,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true
    };
    const w = p.chassisSize.width / 2;
    const d = p.chassisSize.depth / 2;
    wheelOptions.chassisConnectionPointLocal.set(w, 0, d);
    this.vehicle.addWheel(wheelOptions);
    wheelOptions.chassisConnectionPointLocal.set(-w, 0, d);
    this.vehicle.addWheel(wheelOptions);
    wheelOptions.chassisConnectionPointLocal.set(w, 0, -d);
    this.vehicle.addWheel(wheelOptions);
    wheelOptions.chassisConnectionPointLocal.set(-w, 0, -d);
    this.vehicle.addWheel(wheelOptions);
    this.vehicle.addToWorld(this.world);
    this.kartMesh = new THREE.Group();
    const chassisTexture = this.textures.get("kart");
    const chassisMesh = new THREE.Mesh(
      new THREE.BoxGeometry(p.chassisSize.width, p.chassisSize.height, p.chassisSize.depth),
      new THREE.MeshLambertMaterial({ map: chassisTexture })
    );
    this.kartMesh.add(chassisMesh);
    const wheelGeo = new THREE.CylinderGeometry(p.wheelRadius, p.wheelRadius, p.wheelThickness, 24);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelTexture = this.textures.get("wheel");
    const wheelMat = new THREE.MeshLambertMaterial({ map: wheelTexture });
    this.vehicle.wheelInfos.forEach(() => {
      const wheelMesh = new THREE.Mesh(wheelGeo, wheelMat);
      this.wheelMeshes.push(wheelMesh);
      this.kartMesh.add(wheelMesh);
    });
    this.scene.add(this.kartMesh);
  }
  setupInputListeners() {
    window.addEventListener("keydown", (event) => {
      this.keysPressed[event.key.toLowerCase()] = true;
      if (this.gameState === "TITLE" && event.key === "Enter") {
        this.startGame();
      }
      if (this.gameState === "FINISHED" && event.key.toLowerCase() === "r") {
        this.resetGame();
      }
    });
    window.addEventListener("keyup", (event) => {
      this.keysPressed[event.key.toLowerCase()] = false;
    });
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }
  updateControls() {
    const p = this.data.playerKart;
    const engineForce = p.engineForce;
    const brakeForce = p.brakeForce;
    const maxSteerVal = p.maxSteer;
    let isAccelerating = false;
    if (this.keysPressed["arrowup"] || this.keysPressed["w"]) {
      this.vehicle.applyEngineForce(-engineForce, 2);
      this.vehicle.applyEngineForce(-engineForce, 3);
      isAccelerating = true;
    } else if (this.keysPressed["arrowdown"] || this.keysPressed["s"]) {
      this.vehicle.applyEngineForce(engineForce / 2, 2);
      this.vehicle.applyEngineForce(engineForce / 2, 3);
    } else {
      this.vehicle.applyEngineForce(0, 2);
      this.vehicle.applyEngineForce(0, 3);
    }
    if (this.keysPressed["arrowleft"] || this.keysPressed["a"]) {
      this.vehicle.setSteeringValue(maxSteerVal, 0);
      this.vehicle.setSteeringValue(maxSteerVal, 1);
    } else if (this.keysPressed["arrowright"] || this.keysPressed["d"]) {
      this.vehicle.setSteeringValue(-maxSteerVal, 0);
      this.vehicle.setSteeringValue(-maxSteerVal, 1);
    } else {
      this.vehicle.setSteeringValue(0, 0);
      this.vehicle.setSteeringValue(0, 1);
    }
    if (this.keysPressed[" "]) {
      this.vehicle.setBrake(brakeForce, 0);
      this.vehicle.setBrake(brakeForce, 1);
      this.vehicle.setBrake(brakeForce, 2);
      this.vehicle.setBrake(brakeForce, 3);
    } else {
      this.vehicle.setBrake(0, 0);
      this.vehicle.setBrake(0, 1);
      this.vehicle.setBrake(0, 2);
      this.vehicle.setBrake(0, 3);
    }
    const engineIdle = this.sounds.get("engine_idle");
    const engineDriving = this.sounds.get("engine_driving");
    if (isAccelerating) {
      if (engineIdle?.isPlaying) engineIdle.stop();
      if (!engineDriving?.isPlaying) {
        engineDriving?.setLoop(true);
        engineDriving?.play();
      }
    } else {
      if (engineDriving?.isPlaying) engineDriving.stop();
      if (!engineIdle?.isPlaying) {
        engineIdle?.setLoop(true);
        engineIdle?.play();
      }
    }
  }
  updateGraphics() {
    if (!this.kartMesh || !this.chassisBody) return;
    this.kartMesh.position.copy(this.chassisBody.position);
    this.kartMesh.quaternion.copy(this.chassisBody.quaternion);
    for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
      this.vehicle.updateWheelTransform(i);
      const transform = this.vehicle.wheelInfos[i].worldTransform;
      const wheelMesh = this.wheelMeshes[i];
      wheelMesh.position.copy(transform.position);
      wheelMesh.quaternion.copy(transform.quaternion);
    }
  }
  updateCamera() {
    if (!this.kartMesh) return;
    const camSettings = this.data.camera;
    const offset = new THREE.Vector3(camSettings.offset.x, camSettings.offset.y, camSettings.offset.z);
    offset.applyQuaternion(this.kartMesh.quaternion);
    offset.add(this.kartMesh.position);
    this.camera.position.lerp(offset, camSettings.lerpFactor);
    const lookAtTarget = new THREE.Vector3().copy(this.kartMesh.position);
    const lookAtOffset = new THREE.Vector3(camSettings.lookAtOffset.x, camSettings.lookAtOffset.y, camSettings.lookAtOffset.z);
    lookAtTarget.add(lookAtOffset);
    this.camera.lookAt(lookAtTarget);
  }
}
window.addEventListener("DOMContentLoaded", () => {
  new KartRacerGame();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuXHJcbi8vIFR5cGUgRGVmaW5pdGlvbnMgZm9yIGRhdGEuanNvbiBmb3IgZW5oYW5jZWQgdHlwZSBzYWZldHlcclxuaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIHRpdGxlOiBzdHJpbmc7XHJcbiAgICAgICAgaW5zdHJ1Y3Rpb25zOiBzdHJpbmc7XHJcbiAgICAgICAgZmluaXNoTWVzc2FnZTogc3RyaW5nO1xyXG4gICAgICAgIGdyYXZpdHk6IG51bWJlcjtcclxuICAgICAgICBsYXBzOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgY2FtZXJhOiB7XHJcbiAgICAgICAgZm92OiBudW1iZXI7XHJcbiAgICAgICAgbmVhcjogbnVtYmVyO1xyXG4gICAgICAgIGZhcjogbnVtYmVyO1xyXG4gICAgICAgIG9mZnNldDogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyIH07XHJcbiAgICAgICAgbG9va0F0T2Zmc2V0OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXIgfTtcclxuICAgICAgICBsZXJwRmFjdG9yOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgcGxheWVyS2FydDoge1xyXG4gICAgICAgIGNoYXNzaXNTaXplOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyBkZXB0aDogbnVtYmVyIH07XHJcbiAgICAgICAgbWFzczogbnVtYmVyO1xyXG4gICAgICAgIHdoZWVsUmFkaXVzOiBudW1iZXI7XHJcbiAgICAgICAgd2hlZWxUaGlja25lc3M6IG51bWJlcjtcclxuICAgICAgICBlbmdpbmVGb3JjZTogbnVtYmVyO1xyXG4gICAgICAgIGJyYWtlRm9yY2U6IG51bWJlcjtcclxuICAgICAgICBtYXhTdGVlcjogbnVtYmVyO1xyXG4gICAgICAgIHN1c3BlbnNpb246IHtcclxuICAgICAgICAgICAgc3RpZmZuZXNzOiBudW1iZXI7XHJcbiAgICAgICAgICAgIHJlc3RMZW5ndGg6IG51bWJlcjtcclxuICAgICAgICAgICAgZGFtcGluZzogbnVtYmVyO1xyXG4gICAgICAgICAgICBjb21wcmVzc2lvbjogbnVtYmVyO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgZnJpY3Rpb246IG51bWJlcjtcclxuICAgICAgICByb2xsSW5mbHVlbmNlOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgdHJhY2s6IHtcclxuICAgICAgICBncm91bmRTaXplOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH07XHJcbiAgICAgICAgd2FsbEhlaWdodDogbnVtYmVyO1xyXG4gICAgICAgIHdhbGxUaGlja25lc3M6IG51bWJlcjtcclxuICAgICAgICBmaW5pc2hMaW5lUG9zaXRpb246IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xyXG4gICAgICAgIGZpbmlzaExpbmVTaXplOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyBkZXB0aDogbnVtYmVyIH07XHJcbiAgICB9O1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB2b2x1bWU6IG51bWJlcjsgfVtdO1xyXG4gICAgfTtcclxufVxyXG5cclxuY2xhc3MgS2FydFJhY2VyR2FtZSB7XHJcbiAgICAvLyBDb3JlIENvbXBvbmVudHNcclxuICAgIHByaXZhdGUgZGF0YSE6IEdhbWVEYXRhO1xyXG4gICAgcHJpdmF0ZSByZW5kZXJlciE6IFRIUkVFLldlYkdMUmVuZGVyZXI7XHJcbiAgICBwcml2YXRlIHNjZW5lITogVEhSRUUuU2NlbmU7XHJcbiAgICBwcml2YXRlIGNhbWVyYSE6IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhO1xyXG4gICAgcHJpdmF0ZSBjbG9jayA9IG5ldyBUSFJFRS5DbG9jaygpO1xyXG5cclxuICAgIC8vIFBoeXNpY3NcclxuICAgIHByaXZhdGUgd29ybGQhOiBDQU5OT04uV29ybGQ7XHJcbiAgICBwcml2YXRlIHZlaGljbGUhOiBDQU5OT04uUmF5Y2FzdFZlaGljbGU7XHJcbiAgICBwcml2YXRlIGNoYXNzaXNCb2R5ITogQ0FOTk9OLkJvZHk7XHJcbiAgICBwcml2YXRlIGxhc3RDb2xsaXNpb25UaW1lID0gMDtcclxuXHJcbiAgICAvLyBHYW1lIFN0YXRlXHJcbiAgICBwcml2YXRlIGdhbWVTdGF0ZTogJ0xPQURJTkcnIHwgJ1RJVExFJyB8ICdQTEFZSU5HJyB8ICdGSU5JU0hFRCcgPSAnTE9BRElORyc7XHJcbiAgICBwcml2YXRlIGtleXNQcmVzc2VkOiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfSA9IHt9O1xyXG4gICAgcHJpdmF0ZSBsYXBzQ29tcGxldGVkID0gMDtcclxuXHJcbiAgICAvLyBBc3NldHMgJiBBdWRpb1xyXG4gICAgcHJpdmF0ZSB0ZXh0dXJlczogTWFwPHN0cmluZywgVEhSRUUuVGV4dHVyZT4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgVEhSRUUuQXVkaW8+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBhdWRpb0xpc3RlbmVyITogVEhSRUUuQXVkaW9MaXN0ZW5lcjtcclxuXHJcbiAgICAvLyBHYW1lIE9iamVjdHNcclxuICAgIHByaXZhdGUga2FydE1lc2ghOiBUSFJFRS5Hcm91cDtcclxuICAgIHByaXZhdGUgd2hlZWxNZXNoZXM6IFRIUkVFLk1lc2hbXSA9IFtdO1xyXG5cclxuICAgIC8vIFVJXHJcbiAgICBwcml2YXRlIHVpQ29udGFpbmVyITogSFRNTERpdkVsZW1lbnQ7XHJcblxyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgdGhpcy5pbml0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBpbml0KCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGRhdGEuanNvbicpO1xyXG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnNldHVwVUkoKTtcclxuICAgICAgICAgICAgdGhpcy5zaG93TG9hZGluZ01lc3NhZ2UoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuaW5pdFRocmVlKCk7XHJcbiAgICAgICAgICAgIHRoaXMuaW5pdENhbm5vbigpO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmxvYWRBc3NldHMoKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2hvd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0dXBJbnB1dExpc3RlbmVycygpO1xyXG4gICAgICAgICAgICB0aGlzLmFuaW1hdGUoKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiSW5pdGlhbGl6YXRpb24gZmFpbGVkOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnVpQ29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVpQ29udGFpbmVyLmlubmVySFRNTCA9IGA8ZGl2IHN0eWxlPVwiY29sb3I6IHJlZDsgZm9udC1zaXplOiAyNHB4O1wiPkVycm9yOiBDb3VsZCBub3QgbG9hZCBnYW1lIGRhdGEuIFBsZWFzZSBjaGVjayBjb25zb2xlLjwvZGl2PmA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXR1cFVJKCkge1xyXG4gICAgICAgIHRoaXMudWlDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLmlkID0gJ3VpLWNvbnRhaW5lcic7XHJcbiAgICAgICAgdGhpcy51aUNvbnRhaW5lci5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcbiAgICAgICAgdGhpcy51aUNvbnRhaW5lci5zdHlsZS50b3AgPSAnMCc7XHJcbiAgICAgICAgdGhpcy51aUNvbnRhaW5lci5zdHlsZS5sZWZ0ID0gJzAnO1xyXG4gICAgICAgIHRoaXMudWlDb250YWluZXIuc3R5bGUud2lkdGggPSAnMTAwJSc7XHJcbiAgICAgICAgdGhpcy51aUNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XHJcbiAgICAgICAgdGhpcy51aUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xyXG4gICAgICAgIHRoaXMudWlDb250YWluZXIuc3R5bGUuanVzdGlmeUNvbnRlbnQgPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLnN0eWxlLmZsZXhEaXJlY3Rpb24gPSAnY29sdW1uJztcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLnN0eWxlLmNvbG9yID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLnN0eWxlLmZvbnRGYW1pbHkgPSAnQXJpYWwsIHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMudWlDb250YWluZXIuc3R5bGUudGV4dFNoYWRvdyA9ICcycHggMnB4IDRweCAjMDAwMDAwJztcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLnVpQ29udGFpbmVyKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNob3dMb2FkaW5nTWVzc2FnZSgpIHtcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLmlubmVySFRNTCA9IGA8aDEgc3R5bGU9XCJmb250LXNpemU6IDQ4cHg7XCI+TG9hZGluZy4uLjwvaDE+YDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNob3dUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9ICdUSVRMRSc7XHJcbiAgICAgICAgdGhpcy51aUNvbnRhaW5lci5pbm5lckhUTUwgPSBgXHJcbiAgICAgICAgICAgIDxoMSBzdHlsZT1cImZvbnQtc2l6ZTogNDhweDtcIj4ke3RoaXMuZGF0YS5nYW1lU2V0dGluZ3MudGl0bGV9PC9oMT5cclxuICAgICAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDI0cHg7XCI+JHt0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmluc3RydWN0aW9uc308L3A+XHJcbiAgICAgICAgYDtcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzaG93RmluaXNoU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gJ0ZJTklTSEVEJztcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLmlubmVySFRNTCA9IGBcclxuICAgICAgICAgICAgPGgxIHN0eWxlPVwiZm9udC1zaXplOiA2NHB4O1wiPiR7dGhpcy5kYXRhLmdhbWVTZXR0aW5ncy5maW5pc2hNZXNzYWdlfTwvaDE+XHJcbiAgICAgICAgICAgIDxwIHN0eWxlPVwiZm9udC1zaXplOiAyNHB4O1wiPlByZXNzIFIgdG8gUmVzdGFydDwvcD5cclxuICAgICAgICBgO1xyXG4gICAgICAgIHRoaXMudWlDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhpZGVVSSgpIHtcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpbml0VGhyZWUoKSB7XHJcbiAgICAgICAgY29uc3QgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIWNhbnZhcykgdGhyb3cgbmV3IEVycm9yKCdDYW52YXMgd2l0aCBpZCBcImdhbWVDYW52YXNcIiBub3QgZm91bmQuJyk7XHJcblxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcih7IGNhbnZhcywgYW50aWFsaWFzOiB0cnVlIH0pO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZSh3aW5kb3cuaW5uZXJXaWR0aCwgd2luZG93LmlubmVySGVpZ2h0KTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldENsZWFyQ29sb3IoMHg4N2NlZWIpOyAvLyBTa3kgYmx1ZSBiYWNrZ3JvdW5kXHJcblxyXG4gICAgICAgIHRoaXMuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcclxuXHJcbiAgICAgICAgY29uc3QgY2FtU2V0dGluZ3MgPSB0aGlzLmRhdGEuY2FtZXJhO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKGNhbVNldHRpbmdzLmZvdiwgd2luZG93LmlubmVyV2lkdGggLyB3aW5kb3cuaW5uZXJIZWlnaHQsIGNhbVNldHRpbmdzLm5lYXIsIGNhbVNldHRpbmdzLmZhcik7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5jYW1lcmEpO1xyXG5cclxuICAgICAgICBjb25zdCBhbWJpZW50TGlnaHQgPSBuZXcgVEhSRUUuQW1iaWVudExpZ2h0KDB4ZmZmZmZmLCAwLjYpO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGFtYmllbnRMaWdodCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGRpcmVjdGlvbmFsTGlnaHQgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCgweGZmZmZmZiwgMS4wKTtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnBvc2l0aW9uLnNldCgxMCwgMjAsIDUpO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGRpcmVjdGlvbmFsTGlnaHQpO1xyXG5cclxuICAgICAgICB0aGlzLmF1ZGlvTGlzdGVuZXIgPSBuZXcgVEhSRUUuQXVkaW9MaXN0ZW5lcigpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmFkZCh0aGlzLmF1ZGlvTGlzdGVuZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaW5pdENhbm5vbigpIHtcclxuICAgICAgICB0aGlzLndvcmxkID0gbmV3IENBTk5PTi5Xb3JsZCh7XHJcbiAgICAgICAgICAgIGdyYXZpdHk6IG5ldyBDQU5OT04uVmVjMygwLCB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmdyYXZpdHksIDApLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMud29ybGQuYnJvYWRwaGFzZSA9IG5ldyBDQU5OT04uU0FQQnJvYWRwaGFzZSh0aGlzLndvcmxkKTtcclxuICAgICAgICAodGhpcy53b3JsZC5zb2x2ZXIgYXMgQ0FOTk9OLkdTU29sdmVyKS5pdGVyYXRpb25zID0gMTA7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQXNzZXRzKCkge1xyXG4gICAgICAgIGNvbnN0IHRleHR1cmVMb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvTG9hZGVyID0gbmV3IFRIUkVFLkF1ZGlvTG9hZGVyKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSB0aGlzLmRhdGEuYXNzZXRzLmltYWdlcy5tYXAoaW1nID0+XHJcbiAgICAgICAgICAgIHRleHR1cmVMb2FkZXIubG9hZEFzeW5jKGltZy5wYXRoKS50aGVuKHRleHR1cmUgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlcy5zZXQoaW1nLm5hbWUsIHRleHR1cmUpO1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmRhdGEuYXNzZXRzLnNvdW5kcy5tYXAoc291bmQgPT5cclxuICAgICAgICAgICAgYXVkaW9Mb2FkZXIubG9hZEFzeW5jKHNvdW5kLnBhdGgpLnRoZW4oYnVmZmVyID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IFRIUkVFLkF1ZGlvKHRoaXMuYXVkaW9MaXN0ZW5lcik7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5zZXRCdWZmZXIoYnVmZmVyKTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnNldFZvbHVtZShzb3VuZC52b2x1bWUpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KHNvdW5kLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBHYW1lKCkge1xyXG4gICAgICAgIHRoaXMubGFwc0NvbXBsZXRlZCA9IDA7XHJcbiAgICAgICAgdGhpcy5jcmVhdGVUcmFjaygpO1xyXG4gICAgICAgIHRoaXMuY3JlYXRlUGxheWVyS2FydCgpO1xyXG4gICAgICAgIHRoaXMuY3JlYXRlRmluaXNoTGluZSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGJnbSA9IHRoaXMuc291bmRzLmdldCgnYmdtJyk7XHJcbiAgICAgICAgaWYgKGJnbSAmJiAhYmdtLmlzUGxheWluZykge1xyXG4gICAgICAgICAgICBiZ20uc2V0TG9vcCh0cnVlKTtcclxuICAgICAgICAgICAgYmdtLnBsYXkoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgZW5naW5lSWRsZSA9IHRoaXMuc291bmRzLmdldCgnZW5naW5lX2lkbGUnKTtcclxuICAgICAgICBpZiAoZW5naW5lSWRsZSkge1xyXG4gICAgICAgICAgICBlbmdpbmVJZGxlLnNldExvb3AodHJ1ZSk7XHJcbiAgICAgICAgICAgIGVuZ2luZUlkbGUucGxheSgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgcHJpdmF0ZSByZXNldEdhbWUoKSB7XHJcbiAgICAgICAgLy8gU3RvcCBzb3VuZHNcclxuICAgICAgICB0aGlzLnNvdW5kcy5mb3JFYWNoKHNvdW5kID0+IHtcclxuICAgICAgICAgICAgaWYgKHNvdW5kLmlzUGxheWluZykgc291bmQuc3RvcCgpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBDbGVhciBzY2VuZSBhbmQgcGh5c2ljcyB3b3JsZFxyXG4gICAgICAgIHdoaWxlKHRoaXMuc2NlbmUuY2hpbGRyZW4ubGVuZ3RoID4gMCl7IFxyXG4gICAgICAgICAgICBjb25zdCBvYmogPSB0aGlzLnNjZW5lLmNoaWxkcmVuWzBdO1xyXG4gICAgICAgICAgICAvLyBEb24ndCByZW1vdmUgY2FtZXJhIGFuZCBsaWdodHNcclxuICAgICAgICAgICAgaWYgKCEob2JqIGluc3RhbmNlb2YgVEhSRUUuQ2FtZXJhKSAmJiAhKG9iaiBpbnN0YW5jZW9mIFRIUkVFLkxpZ2h0KSkge1xyXG4gICAgICAgICAgICAgICAgIHRoaXMuc2NlbmUucmVtb3ZlKG9iaik7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgLy8gVG8gYXZvaWQgaW5maW5pdGUgbG9vcCwganVzdCBtb3ZlIHRvIG5leHQgaXRlbVxyXG4gICAgICAgICAgICAgICAgIGlmICh0aGlzLnNjZW5lLmNoaWxkcmVuLmxlbmd0aCA+IDEpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjZW5lLmNoaWxkcmVuLnB1c2godGhpcy5zY2VuZS5jaGlsZHJlbi5zaGlmdCgpISk7XHJcbiAgICAgICAgICAgICAgICAgfSBlbHNlIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMud29ybGQuYm9kaWVzLmZvckVhY2goYm9keSA9PiB0aGlzLndvcmxkLnJlbW92ZUJvZHkoYm9keSkpO1xyXG4gICAgICAgIHRoaXMud2hlZWxNZXNoZXMgPSBbXTtcclxuXHJcbiAgICAgICAgLy8gUmUtc2V0dXAgdGhlIGdhbWVcclxuICAgICAgICB0aGlzLnNldHVwR2FtZSgpO1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gJ1BMQVlJTkcnO1xyXG4gICAgICAgIHRoaXMuaGlkZVVJKCk7XHJcbiAgICB9XHJcblxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRHYW1lKCkge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSAhPT0gJ1RJVExFJykgcmV0dXJuO1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gJ1BMQVlJTkcnO1xyXG4gICAgICAgIHRoaXMuaGlkZVVJKCk7XHJcbiAgICAgICAgdGhpcy5zZXR1cEdhbWUoKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcHJpdmF0ZSBjcmVhdGVUcmFjaygpIHtcclxuICAgICAgICBjb25zdCB0cmFja0RhdGEgPSB0aGlzLmRhdGEudHJhY2s7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kTWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdncm91bmRNYXRlcmlhbCcpO1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiAwLFxyXG4gICAgICAgICAgICBzaGFwZTogbmV3IENBTk5PTi5QbGFuZSgpLFxyXG4gICAgICAgICAgICBtYXRlcmlhbDogZ3JvdW5kTWF0ZXJpYWwsXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgZ3JvdW5kQm9keS5xdWF0ZXJuaW9uLnNldEZyb21FdWxlcigtTWF0aC5QSSAvIDIsIDAsIDApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keShncm91bmRCb2R5KTtcclxuXHJcbiAgICAgICAgY29uc3QgZ3JvdW5kVGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KCd0cmFjaycpO1xyXG4gICAgICAgIGlmKGdyb3VuZFRleHR1cmUpIHtcclxuICAgICAgICAgICAgZ3JvdW5kVGV4dHVyZS53cmFwUyA9IGdyb3VuZFRleHR1cmUud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcclxuICAgICAgICAgICAgZ3JvdW5kVGV4dHVyZS5yZXBlYXQuc2V0KHRyYWNrRGF0YS5ncm91bmRTaXplLndpZHRoIC8gMjAsIHRyYWNrRGF0YS5ncm91bmRTaXplLmhlaWdodCAvIDIwKTtcclxuICAgICAgICAgICAgY29uc3QgZ3JvdW5kTWVzaCA9IG5ldyBUSFJFRS5NZXNoKFxyXG4gICAgICAgICAgICAgICAgbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkodHJhY2tEYXRhLmdyb3VuZFNpemUud2lkdGgsIHRyYWNrRGF0YS5ncm91bmRTaXplLmhlaWdodCksXHJcbiAgICAgICAgICAgICAgICBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7IG1hcDogZ3JvdW5kVGV4dHVyZSB9KVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBncm91bmRNZXNoLnJvdGF0aW9uLnggPSAtTWF0aC5QSSAvIDI7XHJcbiAgICAgICAgICAgIHRoaXMuc2NlbmUuYWRkKGdyb3VuZE1lc2gpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU2t5Ym94XHJcbiAgICAgICAgY29uc3Qgc2t5VGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KCdza3knKTtcclxuICAgICAgICBpZihza3lUZXh0dXJlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNreWJveCA9IG5ldyBUSFJFRS5NZXNoKFxyXG4gICAgICAgICAgICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KDUwMCwgNTAwLCA1MDApLFxyXG4gICAgICAgICAgICAgICAgbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHsgbWFwOiBza3lUZXh0dXJlLCBzaWRlOiBUSFJFRS5CYWNrU2lkZSB9KVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZChza3lib3gpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgd2FsbE1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgnd2FsbE1hdGVyaWFsJyk7XHJcbiAgICAgICAgY29uc3QgY3JlYXRlV2FsbCA9IChzaXplOiB7eDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcn0sIHBvc2l0aW9uOiB7eDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlcn0pID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgd2FsbEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICAgICAgbWFzczogMCxcclxuICAgICAgICAgICAgICAgIHNoYXBlOiBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoc2l6ZS54IC8gMiwgc2l6ZS55IC8gMiwgc2l6ZS56IC8gMikpLFxyXG4gICAgICAgICAgICAgICAgbWF0ZXJpYWw6IHdhbGxNYXRlcmlhbCxcclxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMocG9zaXRpb24ueCwgcG9zaXRpb24ueSwgcG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkod2FsbEJvZHkpO1xyXG5cclxuICAgICAgICAgICAgY29uc3Qgd2FsbFRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgnd2FsbCcpO1xyXG4gICAgICAgICAgICBpZih3YWxsVGV4dHVyZSkge1xyXG4gICAgICAgICAgICAgICAgd2FsbFRleHR1cmUud3JhcFMgPSB3YWxsVGV4dHVyZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xyXG4gICAgICAgICAgICAgICAgd2FsbFRleHR1cmUucmVwZWF0LnNldChNYXRoLm1heChzaXplLngsIHNpemUueikgLyA0LCBzaXplLnkgLyA0KTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHdhbGxNZXNoID0gbmV3IFRIUkVFLk1lc2goXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KHNpemUueCwgc2l6ZS55LCBzaXplLnopLFxyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHsgbWFwOiB3YWxsVGV4dHVyZSB9KVxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgIHdhbGxNZXNoLnBvc2l0aW9uLmNvcHkod2FsbEJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2NlbmUuYWRkKHdhbGxNZXNoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGNvbnN0IHcgPSB0cmFja0RhdGEuZ3JvdW5kU2l6ZS53aWR0aCAvIDI7XHJcbiAgICAgICAgY29uc3QgaCA9IHRyYWNrRGF0YS5ncm91bmRTaXplLmhlaWdodCAvIDI7XHJcbiAgICAgICAgY29uc3Qgd2ggPSB0cmFja0RhdGEud2FsbEhlaWdodDtcclxuICAgICAgICBjb25zdCB3dCA9IHRyYWNrRGF0YS53YWxsVGhpY2tuZXNzO1xyXG4gICAgICAgIGNyZWF0ZVdhbGwoeyB4OiB0cmFja0RhdGEuZ3JvdW5kU2l6ZS53aWR0aCwgeTogd2gsIHo6IHd0IH0sIHsgeDogMCwgeTogd2ggLyAyLCB6OiAtaCB9KTtcclxuICAgICAgICBjcmVhdGVXYWxsKHsgeDogdHJhY2tEYXRhLmdyb3VuZFNpemUud2lkdGgsIHk6IHdoLCB6OiB3dCB9LCB7IHg6IDAsIHk6IHdoIC8gMiwgejogaCB9KTtcclxuICAgICAgICBjcmVhdGVXYWxsKHsgeDogd3QsIHk6IHdoLCB6OiB0cmFja0RhdGEuZ3JvdW5kU2l6ZS5oZWlnaHQgfSwgeyB4OiAtdywgeTogd2ggLyAyLCB6OiAwIH0pO1xyXG4gICAgICAgIGNyZWF0ZVdhbGwoeyB4OiB3dCwgeTogd2gsIHo6IHRyYWNrRGF0YS5ncm91bmRTaXplLmhlaWdodCB9LCB7IHg6IHcsIHk6IHdoIC8gMiwgejogMCB9KTtcclxuXHJcbiAgICAgICAgY29uc3QgY29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoZ3JvdW5kTWF0ZXJpYWwsIHdhbGxNYXRlcmlhbCwge1xyXG4gICAgICAgICAgICBmcmljdGlvbjogMC4wMSxcclxuICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMSxcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChjb250YWN0TWF0ZXJpYWwpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY3JlYXRlRmluaXNoTGluZSgpIHtcclxuICAgICAgICBjb25zdCBwb3NpdGlvbiA9IHRoaXMuZGF0YS50cmFjay5maW5pc2hMaW5lUG9zaXRpb247XHJcbiAgICAgICAgY29uc3Qgc2l6ZSA9IHRoaXMuZGF0YS50cmFjay5maW5pc2hMaW5lU2l6ZTtcclxuICAgICAgICBjb25zdCBmaW5pc2hMaW5lQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIGlzVHJpZ2dlcjogdHJ1ZSxcclxuICAgICAgICAgICAgbWFzczogMCxcclxuICAgICAgICAgICAgcG9zaXRpb246IG5ldyBDQU5OT04uVmVjMyhwb3NpdGlvbi54LCBwb3NpdGlvbi55LCBwb3NpdGlvbi56KSxcclxuICAgICAgICAgICAgc2hhcGU6IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhzaXplLndpZHRoIC8gMiwgc2l6ZS5oZWlnaHQgLyAyLCBzaXplLmRlcHRoIC8gMikpLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keShmaW5pc2hMaW5lQm9keSk7XHJcblxyXG4gICAgICAgIGZpbmlzaExpbmVCb2R5LmFkZEV2ZW50TGlzdGVuZXIoJ2NvbGxpZGUnLCAoZXZlbnQ6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZXZlbnQuYm9keSA9PT0gdGhpcy5jaGFzc2lzQm9keSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sYXBzQ29tcGxldGVkKys7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5sYXBzQ29tcGxldGVkID49IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MubGFwcykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2hvd0ZpbmlzaFNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGZpbmlzaFRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgnZmluaXNoX2xpbmUnKTtcclxuICAgICAgICBpZihmaW5pc2hUZXh0dXJlKXtcclxuICAgICAgICAgICAgY29uc3QgZmluaXNoTWVzaCA9IG5ldyBUSFJFRS5NZXNoKFxyXG4gICAgICAgICAgICAgICAgbmV3IFRIUkVFLkJveEdlb21ldHJ5KHNpemUud2lkdGgsIHNpemUuaGVpZ2h0LCBzaXplLmRlcHRoKSxcclxuICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IG1hcDogZmluaXNoVGV4dHVyZSwgdHJhbnNwYXJlbnQ6IHRydWUgfSlcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgZmluaXNoTWVzaC5wb3NpdGlvbi5jb3B5KGZpbmlzaExpbmVCb2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgICAgIHRoaXMuc2NlbmUuYWRkKGZpbmlzaE1lc2gpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNyZWF0ZVBsYXllckthcnQoKSB7XHJcbiAgICAgICAgY29uc3QgcCA9IHRoaXMuZGF0YS5wbGF5ZXJLYXJ0O1xyXG4gICAgICAgIGNvbnN0IGNoYXNzaXNTaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhwLmNoYXNzaXNTaXplLndpZHRoIC8gMiwgcC5jaGFzc2lzU2l6ZS5oZWlnaHQgLyAyLCBwLmNoYXNzaXNTaXplLmRlcHRoIC8gMikpO1xyXG4gICAgICAgIHRoaXMuY2hhc3Npc0JvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiBwLm1hc3MgfSk7XHJcbiAgICAgICAgdGhpcy5jaGFzc2lzQm9keS5hZGRTaGFwZShjaGFzc2lzU2hhcGUpO1xyXG4gICAgICAgIHRoaXMuY2hhc3Npc0JvZHkucG9zaXRpb24uc2V0KDAsIDIsIC0zMCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5jaGFzc2lzQm9keS5hZGRFdmVudExpc3RlbmVyKCdjb2xsaWRlJywgKGV2ZW50OiBhbnkpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29udGFjdE5vcm1hbCA9IGV2ZW50LmNvbnRhY3Qubmk7XHJcbiAgICAgICAgICAgIGNvbnN0IGltcGFjdFZlbG9jaXR5ID0gZXZlbnQuY29udGFjdC5nZXRJbXBhY3RWZWxvY2l0eUFsb25nTm9ybWFsKCk7XHJcbiAgICAgICAgICAgIGlmIChpbXBhY3RWZWxvY2l0eSA+IDEuMCkgeyAvLyBPbmx5IHBsYXkgZm9yIHNpZ25pZmljYW50IGltcGFjdHNcclxuICAgICAgICAgICAgICAgIGNvbnN0IG5vdyA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgICAgICAgICAgaWYgKG5vdyAtIHRoaXMubGFzdENvbGxpc2lvblRpbWUgPiA1MDApIHsgLy8gQ29vbGRvd24gb2YgNTAwbXNcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ2NyYXNoJyk/LnBsYXkoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmxhc3RDb2xsaXNpb25UaW1lID0gbm93O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMudmVoaWNsZSA9IG5ldyBDQU5OT04uUmF5Y2FzdFZlaGljbGUoe1xyXG4gICAgICAgICAgICBjaGFzc2lzQm9keTogdGhpcy5jaGFzc2lzQm9keSxcclxuICAgICAgICAgICAgaW5kZXhSaWdodEF4aXM6IDAsIC8vIHhcclxuICAgICAgICAgICAgaW5kZXhVcEF4aXM6IDEsICAgIC8vIHlcclxuICAgICAgICAgICAgaW5kZXhGb3J3YXJkQXhpczogMiwgLy8gelxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCB3aGVlbE9wdGlvbnMgPSB7XHJcbiAgICAgICAgICAgIHJhZGl1czogcC53aGVlbFJhZGl1cyxcclxuICAgICAgICAgICAgZGlyZWN0aW9uTG9jYWw6IG5ldyBDQU5OT04uVmVjMygwLCAtMSwgMCksXHJcbiAgICAgICAgICAgIHN1c3BlbnNpb25TdGlmZm5lc3M6IHAuc3VzcGVuc2lvbi5zdGlmZm5lc3MsXHJcbiAgICAgICAgICAgIHN1c3BlbnNpb25SZXN0TGVuZ3RoOiBwLnN1c3BlbnNpb24ucmVzdExlbmd0aCxcclxuICAgICAgICAgICAgZnJpY3Rpb25TbGlwOiBwLmZyaWN0aW9uLFxyXG4gICAgICAgICAgICBkYW1waW5nUmVsYXhhdGlvbjogcC5zdXNwZW5zaW9uLmRhbXBpbmcsXHJcbiAgICAgICAgICAgIGRhbXBpbmdDb21wcmVzc2lvbjogcC5zdXNwZW5zaW9uLmNvbXByZXNzaW9uLFxyXG4gICAgICAgICAgICBtYXhTdXNwZW5zaW9uRm9yY2U6IDEwMDAwMCxcclxuICAgICAgICAgICAgcm9sbEluZmx1ZW5jZTogcC5yb2xsSW5mbHVlbmNlLFxyXG4gICAgICAgICAgICBheGxlTG9jYWw6IG5ldyBDQU5OT04uVmVjMygtMSwgMCwgMCksXHJcbiAgICAgICAgICAgIGNoYXNzaXNDb25uZWN0aW9uUG9pbnRMb2NhbDogbmV3IENBTk5PTi5WZWMzKCksXHJcbiAgICAgICAgICAgIG1heFN1c3BlbnNpb25UcmF2ZWw6IDAuMyxcclxuICAgICAgICAgICAgY3VzdG9tU2xpZGluZ1JvdGF0aW9uYWxTcGVlZDogLTMwLFxyXG4gICAgICAgICAgICB1c2VDdXN0b21TbGlkaW5nUm90YXRpb25hbFNwZWVkOiB0cnVlLFxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGNvbnN0IHcgPSBwLmNoYXNzaXNTaXplLndpZHRoIC8gMjtcclxuICAgICAgICBjb25zdCBkID0gcC5jaGFzc2lzU2l6ZS5kZXB0aCAvIDI7XHJcblxyXG4gICAgICAgIHdoZWVsT3B0aW9ucy5jaGFzc2lzQ29ubmVjdGlvblBvaW50TG9jYWwuc2V0KHcsIDAsIGQpOyAvLyBGcm9udC1SaWdodFxyXG4gICAgICAgIHRoaXMudmVoaWNsZS5hZGRXaGVlbCh3aGVlbE9wdGlvbnMpO1xyXG4gICAgICAgIHdoZWVsT3B0aW9ucy5jaGFzc2lzQ29ubmVjdGlvblBvaW50TG9jYWwuc2V0KC13LCAwLCBkKTsgLy8gRnJvbnQtTGVmdFxyXG4gICAgICAgIHRoaXMudmVoaWNsZS5hZGRXaGVlbCh3aGVlbE9wdGlvbnMpO1xyXG4gICAgICAgIHdoZWVsT3B0aW9ucy5jaGFzc2lzQ29ubmVjdGlvblBvaW50TG9jYWwuc2V0KHcsIDAsIC1kKTsgLy8gQmFjay1SaWdodFxyXG4gICAgICAgIHRoaXMudmVoaWNsZS5hZGRXaGVlbCh3aGVlbE9wdGlvbnMpO1xyXG4gICAgICAgIHdoZWVsT3B0aW9ucy5jaGFzc2lzQ29ubmVjdGlvblBvaW50TG9jYWwuc2V0KC13LCAwLCAtZCk7IC8vIEJhY2stTGVmdFxyXG4gICAgICAgIHRoaXMudmVoaWNsZS5hZGRXaGVlbCh3aGVlbE9wdGlvbnMpO1xyXG5cclxuICAgICAgICB0aGlzLnZlaGljbGUuYWRkVG9Xb3JsZCh0aGlzLndvcmxkKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBWaXN1YWxzXHJcbiAgICAgICAgdGhpcy5rYXJ0TWVzaCA9IG5ldyBUSFJFRS5Hcm91cCgpO1xyXG4gICAgICAgIGNvbnN0IGNoYXNzaXNUZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQoJ2thcnQnKTtcclxuICAgICAgICBjb25zdCBjaGFzc2lzTWVzaCA9IG5ldyBUSFJFRS5NZXNoKFxyXG4gICAgICAgICAgICBuZXcgVEhSRUUuQm94R2VvbWV0cnkocC5jaGFzc2lzU2l6ZS53aWR0aCwgcC5jaGFzc2lzU2l6ZS5oZWlnaHQsIHAuY2hhc3Npc1NpemUuZGVwdGgpLFxyXG4gICAgICAgICAgICBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7IG1hcDogY2hhc3Npc1RleHR1cmUgfSlcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMua2FydE1lc2guYWRkKGNoYXNzaXNNZXNoKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCB3aGVlbEdlbyA9IG5ldyBUSFJFRS5DeWxpbmRlckdlb21ldHJ5KHAud2hlZWxSYWRpdXMsIHAud2hlZWxSYWRpdXMsIHAud2hlZWxUaGlja25lc3MsIDI0KTtcclxuICAgICAgICB3aGVlbEdlby5yb3RhdGVaKE1hdGguUEkgLyAyKTtcclxuICAgICAgICBjb25zdCB3aGVlbFRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgnd2hlZWwnKTtcclxuICAgICAgICBjb25zdCB3aGVlbE1hdCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHsgbWFwOiB3aGVlbFRleHR1cmUgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy52ZWhpY2xlLndoZWVsSW5mb3MuZm9yRWFjaCgoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHdoZWVsTWVzaCA9IG5ldyBUSFJFRS5NZXNoKHdoZWVsR2VvLCB3aGVlbE1hdCk7XHJcbiAgICAgICAgICAgIHRoaXMud2hlZWxNZXNoZXMucHVzaCh3aGVlbE1lc2gpO1xyXG4gICAgICAgICAgICB0aGlzLmthcnRNZXNoLmFkZCh3aGVlbE1lc2gpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMua2FydE1lc2gpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwcml2YXRlIHNldHVwSW5wdXRMaXN0ZW5lcnMoKSB7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5rZXlzUHJlc3NlZFtldmVudC5rZXkudG9Mb3dlckNhc2UoKV0gPSB0cnVlO1xyXG4gICAgICAgICAgICBpZih0aGlzLmdhbWVTdGF0ZSA9PT0gJ1RJVExFJyAmJiBldmVudC5rZXkgPT09ICdFbnRlcicpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRHYW1lKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYodGhpcy5nYW1lU3RhdGUgPT09ICdGSU5JU0hFRCcgJiYgZXZlbnQua2V5LnRvTG93ZXJDYXNlKCkgPT09ICdyJykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmtleXNQcmVzc2VkW2V2ZW50LmtleS50b0xvd2VyQ2FzZSgpXSA9IGZhbHNlO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5hc3BlY3QgPSB3aW5kb3cuaW5uZXJXaWR0aCAvIHdpbmRvdy5pbm5lckhlaWdodDtcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xyXG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVDb250cm9scygpIHtcclxuICAgICAgICBjb25zdCBwID0gdGhpcy5kYXRhLnBsYXllckthcnQ7XHJcbiAgICAgICAgY29uc3QgZW5naW5lRm9yY2UgPSBwLmVuZ2luZUZvcmNlO1xyXG4gICAgICAgIGNvbnN0IGJyYWtlRm9yY2UgPSBwLmJyYWtlRm9yY2U7XHJcbiAgICAgICAgY29uc3QgbWF4U3RlZXJWYWwgPSBwLm1heFN0ZWVyO1xyXG5cclxuICAgICAgICBsZXQgaXNBY2NlbGVyYXRpbmcgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgLy8gRm9yd2FyZCAvIEJhY2t3YXJkXHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1ByZXNzZWRbJ2Fycm93dXAnXSB8fCB0aGlzLmtleXNQcmVzc2VkWyd3J10pIHtcclxuICAgICAgICAgICAgdGhpcy52ZWhpY2xlLmFwcGx5RW5naW5lRm9yY2UoLWVuZ2luZUZvcmNlLCAyKTtcclxuICAgICAgICAgICAgdGhpcy52ZWhpY2xlLmFwcGx5RW5naW5lRm9yY2UoLWVuZ2luZUZvcmNlLCAzKTtcclxuICAgICAgICAgICAgaXNBY2NlbGVyYXRpbmcgPSB0cnVlO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5rZXlzUHJlc3NlZFsnYXJyb3dkb3duJ10gfHwgdGhpcy5rZXlzUHJlc3NlZFsncyddKSB7XHJcbiAgICAgICAgICAgIHRoaXMudmVoaWNsZS5hcHBseUVuZ2luZUZvcmNlKGVuZ2luZUZvcmNlIC8gMiwgMik7XHJcbiAgICAgICAgICAgIHRoaXMudmVoaWNsZS5hcHBseUVuZ2luZUZvcmNlKGVuZ2luZUZvcmNlIC8gMiwgMyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy52ZWhpY2xlLmFwcGx5RW5naW5lRm9yY2UoMCwgMik7XHJcbiAgICAgICAgICAgIHRoaXMudmVoaWNsZS5hcHBseUVuZ2luZUZvcmNlKDAsIDMpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU3RlZXJpbmdcclxuICAgICAgICBpZiAodGhpcy5rZXlzUHJlc3NlZFsnYXJyb3dsZWZ0J10gfHwgdGhpcy5rZXlzUHJlc3NlZFsnYSddKSB7XHJcbiAgICAgICAgICAgIHRoaXMudmVoaWNsZS5zZXRTdGVlcmluZ1ZhbHVlKG1heFN0ZWVyVmFsLCAwKTtcclxuICAgICAgICAgICAgdGhpcy52ZWhpY2xlLnNldFN0ZWVyaW5nVmFsdWUobWF4U3RlZXJWYWwsIDEpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5rZXlzUHJlc3NlZFsnYXJyb3dyaWdodCddIHx8IHRoaXMua2V5c1ByZXNzZWRbJ2QnXSkge1xyXG4gICAgICAgICAgICB0aGlzLnZlaGljbGUuc2V0U3RlZXJpbmdWYWx1ZSgtbWF4U3RlZXJWYWwsIDApO1xyXG4gICAgICAgICAgICB0aGlzLnZlaGljbGUuc2V0U3RlZXJpbmdWYWx1ZSgtbWF4U3RlZXJWYWwsIDEpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMudmVoaWNsZS5zZXRTdGVlcmluZ1ZhbHVlKDAsIDApO1xyXG4gICAgICAgICAgICB0aGlzLnZlaGljbGUuc2V0U3RlZXJpbmdWYWx1ZSgwLCAxKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEJyYWtpbmdcclxuICAgICAgICBpZiAodGhpcy5rZXlzUHJlc3NlZFsnICddKSB7IC8vIFNwYWNlIGJhclxyXG4gICAgICAgICAgICB0aGlzLnZlaGljbGUuc2V0QnJha2UoYnJha2VGb3JjZSwgMCk7XHJcbiAgICAgICAgICAgIHRoaXMudmVoaWNsZS5zZXRCcmFrZShicmFrZUZvcmNlLCAxKTtcclxuICAgICAgICAgICAgdGhpcy52ZWhpY2xlLnNldEJyYWtlKGJyYWtlRm9yY2UsIDIpO1xyXG4gICAgICAgICAgICB0aGlzLnZlaGljbGUuc2V0QnJha2UoYnJha2VGb3JjZSwgMyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy52ZWhpY2xlLnNldEJyYWtlKDAsIDApO1xyXG4gICAgICAgICAgICB0aGlzLnZlaGljbGUuc2V0QnJha2UoMCwgMSk7XHJcbiAgICAgICAgICAgIHRoaXMudmVoaWNsZS5zZXRCcmFrZSgwLCAyKTtcclxuICAgICAgICAgICAgdGhpcy52ZWhpY2xlLnNldEJyYWtlKDAsIDMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBTb3VuZCBtYW5hZ2VtZW50XHJcbiAgICAgICAgY29uc3QgZW5naW5lSWRsZSA9IHRoaXMuc291bmRzLmdldCgnZW5naW5lX2lkbGUnKTtcclxuICAgICAgICBjb25zdCBlbmdpbmVEcml2aW5nID0gdGhpcy5zb3VuZHMuZ2V0KCdlbmdpbmVfZHJpdmluZycpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmKGlzQWNjZWxlcmF0aW5nKXtcclxuICAgICAgICAgICAgaWYoZW5naW5lSWRsZT8uaXNQbGF5aW5nKSBlbmdpbmVJZGxlLnN0b3AoKTtcclxuICAgICAgICAgICAgaWYoIWVuZ2luZURyaXZpbmc/LmlzUGxheWluZykge1xyXG4gICAgICAgICAgICAgICAgZW5naW5lRHJpdmluZz8uc2V0TG9vcCh0cnVlKTtcclxuICAgICAgICAgICAgICAgIGVuZ2luZURyaXZpbmc/LnBsYXkoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGlmKGVuZ2luZURyaXZpbmc/LmlzUGxheWluZykgZW5naW5lRHJpdmluZy5zdG9wKCk7XHJcbiAgICAgICAgICAgIGlmKCFlbmdpbmVJZGxlPy5pc1BsYXlpbmcpIHtcclxuICAgICAgICAgICAgICAgIGVuZ2luZUlkbGU/LnNldExvb3AodHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICBlbmdpbmVJZGxlPy5wbGF5KCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVHcmFwaGljcygpIHtcclxuICAgICAgICBpZiAoIXRoaXMua2FydE1lc2ggfHwgIXRoaXMuY2hhc3Npc0JvZHkpIHJldHVybjtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLmthcnRNZXNoLnBvc2l0aW9uLmNvcHkodGhpcy5jaGFzc2lzQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgICAgIHRoaXMua2FydE1lc2gucXVhdGVybmlvbi5jb3B5KHRoaXMuY2hhc3Npc0JvZHkucXVhdGVybmlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlF1YXRlcm5pb24pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy52ZWhpY2xlLndoZWVsSW5mb3MubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdGhpcy52ZWhpY2xlLnVwZGF0ZVdoZWVsVHJhbnNmb3JtKGkpO1xyXG4gICAgICAgICAgICBjb25zdCB0cmFuc2Zvcm0gPSB0aGlzLnZlaGljbGUud2hlZWxJbmZvc1tpXS53b3JsZFRyYW5zZm9ybTtcclxuICAgICAgICAgICAgY29uc3Qgd2hlZWxNZXNoID0gdGhpcy53aGVlbE1lc2hlc1tpXTtcclxuICAgICAgICAgICAgd2hlZWxNZXNoLnBvc2l0aW9uLmNvcHkodHJhbnNmb3JtLnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgICAgIHdoZWVsTWVzaC5xdWF0ZXJuaW9uLmNvcHkodHJhbnNmb3JtLnF1YXRlcm5pb24gYXMgdW5rbm93biBhcyBUSFJFRS5RdWF0ZXJuaW9uKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVDYW1lcmEoKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmthcnRNZXNoKSByZXR1cm47XHJcbiAgICAgICAgY29uc3QgY2FtU2V0dGluZ3MgPSB0aGlzLmRhdGEuY2FtZXJhO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IG9mZnNldCA9IG5ldyBUSFJFRS5WZWN0b3IzKGNhbVNldHRpbmdzLm9mZnNldC54LCBjYW1TZXR0aW5ncy5vZmZzZXQueSwgY2FtU2V0dGluZ3Mub2Zmc2V0LnopO1xyXG4gICAgICAgIG9mZnNldC5hcHBseVF1YXRlcm5pb24odGhpcy5rYXJ0TWVzaC5xdWF0ZXJuaW9uKTtcclxuICAgICAgICBvZmZzZXQuYWRkKHRoaXMua2FydE1lc2gucG9zaXRpb24pO1xyXG5cclxuICAgICAgICB0aGlzLmNhbWVyYS5wb3NpdGlvbi5sZXJwKG9mZnNldCwgY2FtU2V0dGluZ3MubGVycEZhY3Rvcik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgbG9va0F0VGFyZ2V0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5jb3B5KHRoaXMua2FydE1lc2gucG9zaXRpb24pO1xyXG4gICAgICAgIGNvbnN0IGxvb2tBdE9mZnNldCA9IG5ldyBUSFJFRS5WZWN0b3IzKGNhbVNldHRpbmdzLmxvb2tBdE9mZnNldC54LCBjYW1TZXR0aW5ncy5sb29rQXRPZmZzZXQueSwgY2FtU2V0dGluZ3MubG9va0F0T2Zmc2V0LnopO1xyXG4gICAgICAgIGxvb2tBdFRhcmdldC5hZGQobG9va0F0T2Zmc2V0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jYW1lcmEubG9va0F0KGxvb2tBdFRhcmdldCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhbmltYXRlID0gKCkgPT4ge1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGUpO1xyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9IHRoaXMuY2xvY2suZ2V0RGVsdGEoKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSAnUExBWUlORycpIHtcclxuICAgICAgICAgICAgdGhpcy53b3JsZC5zdGVwKDEgLyA2MCwgZGVsdGFUaW1lLCAzKTtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVDb250cm9scygpO1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUdyYXBoaWNzKCk7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlQ2FtZXJhKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlcih0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xyXG4gICAgbmV3IEthcnRSYWNlckdhbWUoKTtcclxufSk7Il0sCiAgIm1hcHBpbmdzIjogIkFBQUEsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksWUFBWTtBQWlEeEIsTUFBTSxjQUFjO0FBQUEsRUErQmhCLGNBQWM7QUF6QmQsU0FBUSxRQUFRLElBQUksTUFBTSxNQUFNO0FBTWhDLFNBQVEsb0JBQW9CO0FBRzVCO0FBQUEsU0FBUSxZQUEwRDtBQUNsRSxTQUFRLGNBQTBDLENBQUM7QUFDbkQsU0FBUSxnQkFBZ0I7QUFHeEI7QUFBQSxTQUFRLFdBQXVDLG9CQUFJLElBQUk7QUFDdkQsU0FBUSxTQUFtQyxvQkFBSSxJQUFJO0FBS25ELFNBQVEsY0FBNEIsQ0FBQztBQXllckMsU0FBUSxVQUFVLE1BQU07QUFDcEIsNEJBQXNCLEtBQUssT0FBTztBQUNsQyxZQUFNLFlBQVksS0FBSyxNQUFNLFNBQVM7QUFFdEMsVUFBSSxLQUFLLGNBQWMsV0FBVztBQUM5QixhQUFLLE1BQU0sS0FBSyxJQUFJLElBQUksV0FBVyxDQUFDO0FBQ3BDLGFBQUssZUFBZTtBQUNwQixhQUFLLGVBQWU7QUFDcEIsYUFBSyxhQUFhO0FBQUEsTUFDdEI7QUFFQSxXQUFLLFNBQVMsT0FBTyxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQUEsSUFDaEQ7QUEvZUksU0FBSyxLQUFLO0FBQUEsRUFDZDtBQUFBLEVBRUEsTUFBYyxPQUFPO0FBQ2pCLFFB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
