import * as THREE from "three";
import * as CANNON from "cannon-es";
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["PLAYING"] = 1] = "PLAYING";
  return GameState2;
})(GameState || {});
class Game {
  constructor() {
    // Game configuration loaded from data.json
    this.state = 0 /* TITLE */;
    // Input handling state
    this.keys = {};
    // Tracks currently pressed keys
    this.isPointerLocked = false;
    // True if mouse pointer is locked
    this.cameraPitch = 0;
    // Vertical rotation (pitch) of the camera
    // Asset management
    this.textures = /* @__PURE__ */ new Map();
    // Stores loaded textures
    this.sounds = /* @__PURE__ */ new Map();
    // For calculating delta time between frames
    this.lastTime = 0;
    this.canvas = document.getElementById("gameCanvas");
    if (!this.canvas) {
      console.error('Canvas element with ID "gameCanvas" not found!');
      return;
    }
    this.init();
  }
  /**
   * Asynchronously initializes the game, loading config, assets, and setting up systems.
   */
  async init() {
    try {
      const response = await fetch("data.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.config = await response.json();
      console.log("Game configuration loaded:", this.config);
    } catch (error) {
      console.error("Failed to load game configuration:", error);
      const errorDiv = document.createElement("div");
      errorDiv.style.position = "absolute";
      errorDiv.style.top = "50%";
      errorDiv.style.left = "50%";
      errorDiv.style.transform = "translate(-50%, -50%)";
      errorDiv.style.color = "red";
      errorDiv.style.fontSize = "24px";
      errorDiv.textContent = "Error: Failed to load game configuration. Check console for details.";
      document.body.appendChild(errorDiv);
      return;
    }
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      // Field of View (FOV)
      window.innerWidth / window.innerHeight,
      // Aspect ratio
      this.config.gameSettings.cameraNear,
      // Near clipping plane
      this.config.gameSettings.cameraFar
      // Far clipping plane
    );
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 10;
    await this.loadAssets();
    window.addEventListener("resize", this.onWindowResize.bind(this));
    document.addEventListener("keydown", this.onKeyDown.bind(this));
    document.addEventListener("keyup", this.onKeyUp.bind(this));
    document.addEventListener("mousemove", this.onMouseMove.bind(this));
    document.addEventListener("pointerlockchange", this.onPointerLockChange.bind(this));
    document.addEventListener("mozpointerlockchange", this.onPointerLockChange.bind(this));
    document.addEventListener("webkitpointerlockchange", this.onPointerLockChange.bind(this));
    this.createGround();
    this.createPlayer();
    this.setupLighting();
    this.setupTitleScreen();
    this.animate(0);
  }
  /**
   * Loads all textures and sounds defined in the game configuration.
   */
  async loadAssets() {
    const textureLoader = new THREE.TextureLoader();
    const imagePromises = this.config.assets.images.map((img) => {
      return textureLoader.loadAsync(img.path).then((texture) => {
        this.textures.set(img.name, texture);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        if (img.name === "ground_texture") {
          texture.repeat.set(this.config.gameSettings.groundSize / 5, this.config.gameSettings.groundSize / 5);
        }
      }).catch((error) => {
        console.error(`Failed to load texture: ${img.path}`, error);
      });
    });
    const soundPromises = this.config.assets.sounds.map((sound) => {
      return new Promise((resolve) => {
        const audio = new Audio(sound.path);
        audio.volume = sound.volume;
        audio.loop = sound.name === "background_music";
        audio.oncanplaythrough = () => {
          this.sounds.set(sound.name, audio);
          resolve();
        };
        audio.onerror = () => {
          console.error(`Failed to load sound: ${sound.path}`);
          resolve();
        };
      });
    });
    await Promise.all([...imagePromises, ...soundPromises]);
    console.log(`Assets loaded: ${this.textures.size} textures, ${this.sounds.size} sounds.`);
  }
  /**
   * Creates and displays the title screen UI dynamically.
   */
  setupTitleScreen() {
    this.titleScreenOverlay = document.createElement("div");
    Object.assign(this.titleScreenOverlay.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      color: "white",
      fontFamily: "Arial, sans-serif",
      fontSize: "48px",
      textAlign: "center",
      zIndex: "1000"
    });
    document.body.appendChild(this.titleScreenOverlay);
    this.titleText = document.createElement("div");
    this.titleText.textContent = this.config.gameSettings.titleScreenText;
    this.titleScreenOverlay.appendChild(this.titleText);
    this.promptText = document.createElement("div");
    this.promptText.textContent = this.config.gameSettings.startGamePrompt;
    Object.assign(this.promptText.style, {
      marginTop: "20px",
      fontSize: "24px"
    });
    this.titleScreenOverlay.appendChild(this.promptText);
    this.titleScreenOverlay.addEventListener("click", this.handleCanvasClick.bind(this));
    this.sounds.get("background_music")?.play().catch((e) => console.log("BGM play denied (requires user gesture):", e));
  }
  /**
   * Handles clicks on the canvas, primarily for starting the game from the title screen.
   */
  handleCanvasClick() {
    if (this.state === 0 /* TITLE */) {
      this.startGame();
    }
  }
  /**
   * Transitions the game from the title screen to the playing state.
   */
  startGame() {
    this.state = 1 /* PLAYING */;
    if (this.titleScreenOverlay && this.titleScreenOverlay.parentNode) {
      document.body.removeChild(this.titleScreenOverlay);
    }
    this.canvas.requestPointerLock();
    this.sounds.get("background_music")?.play().catch((e) => console.log("BGM play failed after user gesture:", e));
  }
  /**
   * Creates the player's visual mesh and physics body.
   */
  createPlayer() {
    const playerTexture = this.textures.get("player_texture");
    const playerMaterial = new THREE.MeshLambertMaterial({
      map: playerTexture,
      color: playerTexture ? 16777215 : 30719
      // Use white with texture, or blue if no texture
    });
    const playerGeometry = new THREE.BoxGeometry(1, 2, 1);
    this.playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
    this.playerMesh.position.y = 5;
    this.playerMesh.castShadow = true;
    this.scene.add(this.playerMesh);
    const playerShape = new CANNON.Box(new CANNON.Vec3(0.5, 1, 0.5));
    this.playerBody = new CANNON.Body({
      mass: this.config.gameSettings.playerMass,
      // Player's mass
      position: new CANNON.Vec3(this.playerMesh.position.x, this.playerMesh.position.y, this.playerMesh.position.z),
      shape: playerShape,
      fixedRotation: true
      // Prevent the player from falling over (simulates a capsule/cylinder character)
    });
    this.world.addBody(this.playerBody);
    this.camera.position.set(
      this.playerBody.position.x,
      this.playerBody.position.y + this.config.gameSettings.cameraHeightOffset,
      this.playerBody.position.z
    );
  }
  /**
   * Creates the ground's visual mesh and physics body.
   */
  createGround() {
    const groundTexture = this.textures.get("ground_texture");
    const groundMaterial = new THREE.MeshLambertMaterial({
      map: groundTexture,
      color: groundTexture ? 16777215 : 8947848
      // Use white with texture, or grey if no texture
    });
    const groundGeometry = new THREE.PlaneGeometry(this.config.gameSettings.groundSize, this.config.gameSettings.groundSize);
    this.groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);
    const groundShape = new CANNON.Plane();
    this.groundBody = new CANNON.Body({
      mass: 0,
      // A mass of 0 makes it a static (immovable) body
      shape: groundShape
    });
    this.groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(this.groundBody);
  }
  /**
   * Sets up ambient and directional lighting in the scene.
   */
  setupLighting() {
    const ambientLight = new THREE.AmbientLight(4210752, 1);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(16777215, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    this.scene.add(directionalLight);
  }
  /**
   * Handles window resizing to keep the camera aspect ratio and renderer size correct.
   */
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  /**
   * Records which keys are currently pressed down.
   */
  onKeyDown(event) {
    this.keys[event.key.toLowerCase()] = true;
  }
  /**
   * Records which keys are currently released.
   */
  onKeyUp(event) {
    this.keys[event.key.toLowerCase()] = false;
  }
  /**
   * Handles mouse movement for camera rotation (mouse look).
   */
  onMouseMove(event) {
    if (this.state === 1 /* PLAYING */ && this.isPointerLocked) {
      const movementX = event.movementX || 0;
      const movementY = event.movementY || 0;
      this.camera.rotation.y -= movementX * this.config.gameSettings.mouseSensitivity;
      this.cameraPitch -= movementY * this.config.gameSettings.mouseSensitivity;
      this.cameraPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraPitch));
      this.camera.rotation.x = this.cameraPitch;
    }
  }
  /**
   * Updates the pointer lock status when it changes (e.g., user presses Esc).
   */
  onPointerLockChange() {
    if (document.pointerLockElement === this.canvas || document.mozPointerLockElement === this.canvas || document.webkitPointerLockElement === this.canvas) {
      this.isPointerLocked = true;
      console.log("Pointer locked");
    } else {
      this.isPointerLocked = false;
      console.log("Pointer unlocked");
    }
  }
  /**
   * The main game loop, called on every animation frame.
   */
  animate(time) {
    requestAnimationFrame(this.animate.bind(this));
    const deltaTime = (time - this.lastTime) / 1e3;
    this.lastTime = time;
    if (this.state === 1 /* PLAYING */) {
      this.updatePlayerMovement();
      this.updatePhysics(deltaTime);
      this.syncMeshesWithBodies();
    }
    this.renderer.render(this.scene, this.camera);
  }
  /**
   * Steps the Cannon.js physics world forward.
   */
  updatePhysics(deltaTime) {
    this.world.step(1 / 60, deltaTime, this.config.gameSettings.maxPhysicsSubSteps);
  }
  /**
   * Updates the player's velocity based on WASD input and camera orientation.
   */
  updatePlayerMovement() {
    const playerSpeed = this.config.gameSettings.playerSpeed;
    const currentVelocity = this.playerBody.velocity;
    const targetVelocity = new CANNON.Vec3(0, currentVelocity.y, 0);
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();
    const cameraRight = new THREE.Vector3();
    cameraRight.crossVectors(this.camera.up, cameraDirection);
    cameraRight.normalize();
    if (this.keys["w"]) {
      targetVelocity.x += cameraDirection.x * playerSpeed;
      targetVelocity.z += cameraDirection.z * playerSpeed;
    }
    if (this.keys["s"]) {
      targetVelocity.x -= cameraDirection.x * playerSpeed;
      targetVelocity.z -= cameraDirection.z * playerSpeed;
    }
    if (this.keys["a"]) {
      targetVelocity.x -= cameraRight.x * playerSpeed;
      targetVelocity.z -= cameraRight.z * playerSpeed;
    }
    if (this.keys["d"]) {
      targetVelocity.x += cameraRight.x * playerSpeed;
      targetVelocity.z += cameraRight.z * playerSpeed;
    }
    const lerpFactor = 0.2;
    this.playerBody.velocity.x = currentVelocity.x + (targetVelocity.x - currentVelocity.x) * lerpFactor;
    this.playerBody.velocity.z = currentVelocity.z + (targetVelocity.z - currentVelocity.z) * lerpFactor;
    this.camera.position.copy(this.playerBody.position);
    this.camera.position.y += this.config.gameSettings.cameraHeightOffset;
  }
  /**
   * Synchronizes the visual meshes with their corresponding physics bodies.
   */
  syncMeshesWithBodies() {
    this.playerMesh.position.copy(this.playerBody.position);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  new Game();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gSW1wb3J0IFRocmVlLmpzIGFuZCBDYW5ub24tZXMgbGlicmFyaWVzXHJcbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcclxuaW1wb3J0ICogYXMgQ0FOTk9OIGZyb20gJ2Nhbm5vbi1lcyc7XHJcblxyXG4vLyBFbnVtIHRvIGRlZmluZSB0aGUgcG9zc2libGUgc3RhdGVzIG9mIHRoZSBnYW1lXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFLCAgIC8vIFRpdGxlIHNjcmVlbiwgd2FpdGluZyBmb3IgdXNlciBpbnB1dFxyXG4gICAgUExBWUlORyAgLy8gR2FtZSBpcyBhY3RpdmUsIHVzZXIgY2FuIG1vdmUgYW5kIGxvb2sgYXJvdW5kXHJcbn1cclxuXHJcbi8vIEludGVyZmFjZSB0byB0eXBlLWNoZWNrIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHN0YXJ0R2FtZVByb21wdDogc3RyaW5nO1xyXG4gICAgICAgIHBsYXllclNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgbW91c2VTZW5zaXRpdml0eTogbnVtYmVyO1xyXG4gICAgICAgIGNhbWVyYUhlaWdodE9mZnNldDogbnVtYmVyOyAvLyBWZXJ0aWNhbCBvZmZzZXQgb2YgdGhlIGNhbWVyYSBmcm9tIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkgY2VudGVyXHJcbiAgICAgICAgY2FtZXJhTmVhcjogbnVtYmVyOyAgICAgICAgIC8vIE5lYXIgY2xpcHBpbmcgcGxhbmUgZm9yIHRoZSBjYW1lcmFcclxuICAgICAgICBjYW1lcmFGYXI6IG51bWJlcjsgICAgICAgICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lIGZvciB0aGUgY2FtZXJhXHJcbiAgICAgICAgcGxheWVyTWFzczogbnVtYmVyOyAgICAgICAgIC8vIE1hc3Mgb2YgdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keVxyXG4gICAgICAgIGdyb3VuZFNpemU6IG51bWJlcjsgICAgICAgICAvLyBTaXplICh3aWR0aC9kZXB0aCkgb2YgdGhlIHNxdWFyZSBncm91bmQgcGxhbmVcclxuICAgICAgICBtYXhQaHlzaWNzU3ViU3RlcHM6IG51bWJlcjsgLy8gTWF4aW11bSBudW1iZXIgb2YgcGh5c2ljcyBzdWJzdGVwcyBwZXIgZnJhbWUgdG8gbWFpbnRhaW4gc3RhYmlsaXR5XHJcbiAgICB9O1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyIH1bXTtcclxuICAgIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNYWluIEdhbWUgY2xhc3MgcmVzcG9uc2libGUgZm9yIGluaXRpYWxpemluZyBhbmQgcnVubmluZyB0aGUgM0QgZ2FtZS5cclxuICogSXQgaGFuZGxlcyBUaHJlZS5qcyByZW5kZXJpbmcsIENhbm5vbi1lcyBwaHlzaWNzLCBpbnB1dCwgYW5kIGdhbWUgc3RhdGUuXHJcbiAqL1xyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY29uZmlnITogR2FtZUNvbmZpZzsgLy8gR2FtZSBjb25maWd1cmF0aW9uIGxvYWRlZCBmcm9tIGRhdGEuanNvblxyXG4gICAgcHJpdmF0ZSBzdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFOyAvLyBDdXJyZW50IHN0YXRlIG9mIHRoZSBnYW1lXHJcblxyXG4gICAgLy8gVGhyZWUuanMgZWxlbWVudHMgZm9yIHJlbmRlcmluZ1xyXG4gICAgcHJpdmF0ZSBzY2VuZSE6IFRIUkVFLlNjZW5lO1xyXG4gICAgcHJpdmF0ZSBjYW1lcmEhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYTtcclxuICAgIHByaXZhdGUgcmVuZGVyZXIhOiBUSFJFRS5XZWJHTFJlbmRlcmVyO1xyXG4gICAgcHJpdmF0ZSBjYW52YXMhOiBIVE1MQ2FudmFzRWxlbWVudDsgLy8gVGhlIEhUTUwgY2FudmFzIGVsZW1lbnQgZm9yIHJlbmRlcmluZ1xyXG5cclxuICAgIC8vIENhbm5vbi1lcyBlbGVtZW50cyBmb3IgcGh5c2ljc1xyXG4gICAgcHJpdmF0ZSB3b3JsZCE6IENBTk5PTi5Xb3JsZDtcclxuICAgIHByaXZhdGUgcGxheWVyQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBwbGF5ZXJcclxuICAgIHByaXZhdGUgZ3JvdW5kQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBncm91bmRcclxuXHJcbiAgICAvLyBWaXN1YWwgbWVzaGVzIChUaHJlZS5qcykgZm9yIGdhbWUgb2JqZWN0c1xyXG4gICAgcHJpdmF0ZSBwbGF5ZXJNZXNoITogVEhSRUUuTWVzaDtcclxuICAgIHByaXZhdGUgZ3JvdW5kTWVzaCE6IFRIUkVFLk1lc2g7XHJcblxyXG4gICAgLy8gSW5wdXQgaGFuZGxpbmcgc3RhdGVcclxuICAgIHByaXZhdGUga2V5czogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0gPSB7fTsgLy8gVHJhY2tzIGN1cnJlbnRseSBwcmVzc2VkIGtleXNcclxuICAgIHByaXZhdGUgaXNQb2ludGVyTG9ja2VkOiBib29sZWFuID0gZmFsc2U7IC8vIFRydWUgaWYgbW91c2UgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgIHByaXZhdGUgY2FtZXJhUGl0Y2g6IG51bWJlciA9IDA7IC8vIFZlcnRpY2FsIHJvdGF0aW9uIChwaXRjaCkgb2YgdGhlIGNhbWVyYVxyXG5cclxuICAgIC8vIEFzc2V0IG1hbmFnZW1lbnRcclxuICAgIHByaXZhdGUgdGV4dHVyZXM6IE1hcDxzdHJpbmcsIFRIUkVFLlRleHR1cmU+ID0gbmV3IE1hcCgpOyAvLyBTdG9yZXMgbG9hZGVkIHRleHR1cmVzXHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7IC8vIFN0b3JlcyBsb2FkZWQgYXVkaW8gZWxlbWVudHNcclxuXHJcbiAgICAvLyBVSSBlbGVtZW50cyAoZHluYW1pY2FsbHkgY3JlYXRlZCBmb3IgdGhlIHRpdGxlIHNjcmVlbilcclxuICAgIHByaXZhdGUgdGl0bGVTY3JlZW5PdmVybGF5ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHRpdGxlVGV4dCE6IEhUTUxEaXZFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBwcm9tcHRUZXh0ITogSFRNTERpdkVsZW1lbnQ7XHJcblxyXG4gICAgLy8gRm9yIGNhbGN1bGF0aW5nIGRlbHRhIHRpbWUgYmV0d2VlbiBmcmFtZXNcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXAgPSAwO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgICAgIC8vIEdldCB0aGUgY2FudmFzIGVsZW1lbnQgZnJvbSBpbmRleC5odG1sXHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZUNhbnZhcycpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCBcImdhbWVDYW52YXNcIiBub3QgZm91bmQhJyk7XHJcbiAgICAgICAgICAgIHJldHVybjsgLy8gQ2Fubm90IHByb2NlZWQgd2l0aG91dCBhIGNhbnZhc1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmluaXQoKTsgLy8gU3RhcnQgdGhlIGFzeW5jaHJvbm91cyBpbml0aWFsaXphdGlvbiBwcm9jZXNzXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBc3luY2hyb25vdXNseSBpbml0aWFsaXplcyB0aGUgZ2FtZSwgbG9hZGluZyBjb25maWcsIGFzc2V0cywgYW5kIHNldHRpbmcgdXAgc3lzdGVtcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhc3luYyBpbml0KCkge1xyXG4gICAgICAgIC8vIDEuIExvYWQgZ2FtZSBjb25maWd1cmF0aW9uIGZyb20gZGF0YS5qc29uXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCBlcnJvciEgc3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ0dhbWUgY29uZmlndXJhdGlvbiBsb2FkZWQ6JywgdGhpcy5jb25maWcpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbjonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIC8vIElmIGNvbmZpZ3VyYXRpb24gZmFpbHMgdG8gbG9hZCwgZGlzcGxheSBhbiBlcnJvciBtZXNzYWdlIGFuZCBzdG9wLlxyXG4gICAgICAgICAgICBjb25zdCBlcnJvckRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRvcCA9ICc1MCUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5sZWZ0ID0gJzUwJSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRyYW5zZm9ybSA9ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5jb2xvciA9ICdyZWQnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5mb250U2l6ZSA9ICcyNHB4JztcclxuICAgICAgICAgICAgZXJyb3JEaXYudGV4dENvbnRlbnQgPSAnRXJyb3I6IEZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbi4gQ2hlY2sgY29uc29sZSBmb3IgZGV0YWlscy4nO1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVycm9yRGl2KTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gMi4gSW5pdGlhbGl6ZSBUaHJlZS5qcyAoc2NlbmUsIGNhbWVyYSwgcmVuZGVyZXIpXHJcbiAgICAgICAgdGhpcy5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKFxyXG4gICAgICAgICAgICA3NSwgLy8gRmllbGQgb2YgVmlldyAoRk9WKVxyXG4gICAgICAgICAgICB3aW5kb3cuaW5uZXJXaWR0aCAvIHdpbmRvdy5pbm5lckhlaWdodCwgLy8gQXNwZWN0IHJhdGlvXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFOZWFyLCAvLyBOZWFyIGNsaXBwaW5nIHBsYW5lXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFGYXIgICAvLyBGYXIgY2xpcHBpbmcgcGxhbmVcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcih7IGNhbnZhczogdGhpcy5jYW52YXMsIGFudGlhbGlhczogdHJ1ZSB9KTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRQaXhlbFJhdGlvKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC5lbmFibGVkID0gdHJ1ZTsgLy8gRW5hYmxlIHNoYWRvd3MgZm9yIGJldHRlciByZWFsaXNtXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zaGFkb3dNYXAudHlwZSA9IFRIUkVFLlBDRlNvZnRTaGFkb3dNYXA7IC8vIFVzZSBzb2Z0IHNoYWRvd3NcclxuXHJcbiAgICAgICAgLy8gMy4gSW5pdGlhbGl6ZSBDYW5ub24tZXMgKHBoeXNpY3Mgd29ybGQpXHJcbiAgICAgICAgdGhpcy53b3JsZCA9IG5ldyBDQU5OT04uV29ybGQoKTtcclxuICAgICAgICB0aGlzLndvcmxkLmdyYXZpdHkuc2V0KDAsIC05LjgyLCAwKTsgLy8gU2V0IHN0YW5kYXJkIEVhcnRoIGdyYXZpdHkgKFktYXhpcyBkb3duKVxyXG4gICAgICAgIHRoaXMud29ybGQuYnJvYWRwaGFzZSA9IG5ldyBDQU5OT04uU0FQQnJvYWRwaGFzZSh0aGlzLndvcmxkKTsgLy8gVXNlIGFuIGVmZmljaWVudCBicm9hZHBoYXNlIGFsZ29yaXRobVxyXG4gICAgICAgIC8vIEZpeDogQ2FzdCB0aGlzLndvcmxkLnNvbHZlciB0byBDQU5OT04uR1NTb2x2ZXIgdG8gYWNjZXNzIHRoZSAnaXRlcmF0aW9ucycgcHJvcGVydHlcclxuICAgICAgICAvLyBUaGUgZGVmYXVsdCBzb2x2ZXIgaW4gQ2Fubm9uLmpzIChhbmQgQ2Fubm9uLWVzKSBpcyBHU1NvbHZlciwgd2hpY2ggaGFzIHRoaXMgcHJvcGVydHkuXHJcbiAgICAgICAgKHRoaXMud29ybGQuc29sdmVyIGFzIENBTk5PTi5HU1NvbHZlcikuaXRlcmF0aW9ucyA9IDEwOyAvLyBJbmNyZWFzZSBzb2x2ZXIgaXRlcmF0aW9ucyBmb3IgYmV0dGVyIHN0YWJpbGl0eVxyXG5cclxuICAgICAgICAvLyA0LiBMb2FkIGFzc2V0cyAodGV4dHVyZXMgYW5kIHNvdW5kcylcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRBc3NldHMoKTtcclxuXHJcbiAgICAgICAgLy8gNS4gU2V0dXAgZXZlbnQgbGlzdGVuZXJzIGZvciB1c2VyIGlucHV0IGFuZCB3aW5kb3cgcmVzaXppbmdcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgdGhpcy5vbldpbmRvd1Jlc2l6ZS5iaW5kKHRoaXMpKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5vbktleURvd24uYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLm9uS2V5VXAuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5vbk1vdXNlTW92ZS5iaW5kKHRoaXMpKTsgLy8gRm9yIG1vdXNlIGxvb2tcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRm9yIHBvaW50ZXIgbG9jayBzdGF0dXNcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3pwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRmlyZWZveCBjb21wYXRpYmlsaXR5XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0cG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7IC8vIFdlYmtpdCBjb21wYXRpYmlsaXR5XHJcblxyXG4gICAgICAgIC8vIFJlbW92ZWQ6IHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5oYW5kbGVDYW52YXNDbGljay5iaW5kKHRoaXMpKTsgLy8gVGhpcyB3YXMgdGhlIHByb2JsZW1hdGljIGxpbmVcclxuXHJcbiAgICAgICAgLy8gNi4gQ3JlYXRlIGdhbWUgb2JqZWN0cyAocGxheWVyLCBncm91bmQpIGFuZCBsaWdodGluZ1xyXG4gICAgICAgIHRoaXMuY3JlYXRlR3JvdW5kKCk7XHJcbiAgICAgICAgdGhpcy5jcmVhdGVQbGF5ZXIoKTtcclxuICAgICAgICB0aGlzLnNldHVwTGlnaHRpbmcoKTtcclxuXHJcbiAgICAgICAgLy8gNy4gU2V0dXAgdGhlIHRpdGxlIHNjcmVlbiBVSVxyXG4gICAgICAgIHRoaXMuc2V0dXBUaXRsZVNjcmVlbigpO1xyXG5cclxuICAgICAgICAvLyBTdGFydCB0aGUgbWFpbiBnYW1lIGxvb3BcclxuICAgICAgICB0aGlzLmFuaW1hdGUoMCk7IC8vIFBhc3MgaW5pdGlhbCB0aW1lIDBcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIExvYWRzIGFsbCB0ZXh0dXJlcyBhbmQgc291bmRzIGRlZmluZWQgaW4gdGhlIGdhbWUgY29uZmlndXJhdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQXNzZXRzKCkge1xyXG4gICAgICAgIGNvbnN0IHRleHR1cmVMb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuaW1hZ2VzLm1hcChpbWcgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gdGV4dHVyZUxvYWRlci5sb2FkQXN5bmMoaW1nLnBhdGgpXHJcbiAgICAgICAgICAgICAgICAudGhlbih0ZXh0dXJlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmVzLnNldChpbWcubmFtZSwgdGV4dHVyZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nOyAvLyBSZXBlYXQgdGV4dHVyZSBob3Jpem9udGFsbHlcclxuICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7IC8vIFJlcGVhdCB0ZXh0dXJlIHZlcnRpY2FsbHlcclxuICAgICAgICAgICAgICAgICAgICAvLyBBZGp1c3QgdGV4dHVyZSByZXBldGl0aW9uIGZvciB0aGUgZ3JvdW5kIHRvIGF2b2lkIHN0cmV0Y2hpbmdcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW1nLm5hbWUgPT09ICdncm91bmRfdGV4dHVyZScpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgIHRleHR1cmUucmVwZWF0LnNldCh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplIC8gNSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgdGV4dHVyZTogJHtpbWcucGF0aH1gLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQ29udGludWUgZXZlbiBpZiBhbiBhc3NldCBmYWlscyB0byBsb2FkOyBmYWxsYmFja3MgKHNvbGlkIGNvbG9ycykgYXJlIHVzZWQuXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMubWFwKHNvdW5kID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbyhzb3VuZC5wYXRoKTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNvdW5kLnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLmxvb3AgPSAoc291bmQubmFtZSA9PT0gJ2JhY2tncm91bmRfbXVzaWMnKTsgLy8gTG9vcCBiYWNrZ3JvdW5kIG11c2ljXHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc291bmRzLnNldChzb3VuZC5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7c291bmQucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7IC8vIFJlc29sdmUgZXZlbiBvbiBlcnJvciB0byBub3QgYmxvY2sgUHJvbWlzZS5hbGxcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBBc3NldHMgbG9hZGVkOiAke3RoaXMudGV4dHVyZXMuc2l6ZX0gdGV4dHVyZXMsICR7dGhpcy5zb3VuZHMuc2l6ZX0gc291bmRzLmApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhbmQgZGlzcGxheXMgdGhlIHRpdGxlIHNjcmVlbiBVSSBkeW5hbWljYWxseS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzZXR1cFRpdGxlU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5zdHlsZSwge1xyXG4gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJywgdG9wOiAnMCcsIGxlZnQ6ICcwJyxcclxuICAgICAgICAgICAgd2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnMTAwJScsXHJcbiAgICAgICAgICAgIGJhY2tncm91bmRDb2xvcjogJ3JnYmEoMCwgMCwgMCwgMC44KScsXHJcbiAgICAgICAgICAgIGRpc3BsYXk6ICdmbGV4JywgZmxleERpcmVjdGlvbjogJ2NvbHVtbicsXHJcbiAgICAgICAgICAgIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJywgYWxpZ25JdGVtczogJ2NlbnRlcicsXHJcbiAgICAgICAgICAgIGNvbG9yOiAnd2hpdGUnLCBmb250RmFtaWx5OiAnQXJpYWwsIHNhbnMtc2VyaWYnLFxyXG4gICAgICAgICAgICBmb250U2l6ZTogJzQ4cHgnLCB0ZXh0QWxpZ246ICdjZW50ZXInLCB6SW5kZXg6ICcxMDAwJ1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkpO1xyXG5cclxuICAgICAgICB0aGlzLnRpdGxlVGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIHRoaXMudGl0bGVUZXh0LnRleHRDb250ZW50ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnRpdGxlU2NyZWVuVGV4dDtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hcHBlbmRDaGlsZCh0aGlzLnRpdGxlVGV4dCk7XHJcblxyXG4gICAgICAgIHRoaXMucHJvbXB0VGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIHRoaXMucHJvbXB0VGV4dC50ZXh0Q29udGVudCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5zdGFydEdhbWVQcm9tcHQ7XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnByb21wdFRleHQuc3R5bGUsIHtcclxuICAgICAgICAgICAgbWFyZ2luVG9wOiAnMjBweCcsIGZvbnRTaXplOiAnMjRweCdcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hcHBlbmRDaGlsZCh0aGlzLnByb21wdFRleHQpO1xyXG5cclxuICAgICAgICAvLyBBZGQgZXZlbnQgbGlzdGVuZXIgZGlyZWN0bHkgdG8gdGhlIG92ZXJsYXkgdG8gY2FwdHVyZSBjbGlja3NcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuaGFuZGxlQ2FudmFzQ2xpY2suYmluZCh0aGlzKSk7XHJcblxyXG4gICAgICAgIC8vIEF0dGVtcHQgdG8gcGxheSBiYWNrZ3JvdW5kIG11c2ljLiBJdCBtaWdodCBiZSBibG9ja2VkIGJ5IGJyb3dzZXJzIGlmIG5vIHVzZXIgZ2VzdHVyZSBoYXMgb2NjdXJyZWQgeWV0LlxyXG4gICAgICAgIHRoaXMuc291bmRzLmdldCgnYmFja2dyb3VuZF9tdXNpYycpPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIkJHTSBwbGF5IGRlbmllZCAocmVxdWlyZXMgdXNlciBnZXN0dXJlKTpcIiwgZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyBjbGlja3Mgb24gdGhlIGNhbnZhcywgcHJpbWFyaWx5IGZvciBzdGFydGluZyB0aGUgZ2FtZSBmcm9tIHRoZSB0aXRsZSBzY3JlZW4uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlQ2FudmFzQ2xpY2soKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSkge1xyXG4gICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRyYW5zaXRpb25zIHRoZSBnYW1lIGZyb20gdGhlIHRpdGxlIHNjcmVlbiB0byB0aGUgcGxheWluZyBzdGF0ZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKSB7XHJcbiAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgIC8vIFJlbW92ZSB0aGUgdGl0bGUgc2NyZWVuIG92ZXJsYXlcclxuICAgICAgICBpZiAodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkgJiYgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkucGFyZW50Tm9kZSkge1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gUmVxdWVzdCBwb2ludGVyIGxvY2sgZm9yIGltbWVyc2l2ZSBtb3VzZSBjb250cm9sXHJcbiAgICAgICAgdGhpcy5jYW52YXMucmVxdWVzdFBvaW50ZXJMb2NrKCk7XHJcbiAgICAgICAgLy8gRW5zdXJlIGJhY2tncm91bmQgbXVzaWMgcGxheXMgbm93IHRoYXQgYSB1c2VyIGdlc3R1cmUgaGFzIG9jY3VycmVkXHJcbiAgICAgICAgdGhpcy5zb3VuZHMuZ2V0KCdiYWNrZ3JvdW5kX211c2ljJyk/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiQkdNIHBsYXkgZmFpbGVkIGFmdGVyIHVzZXIgZ2VzdHVyZTpcIiwgZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyB0aGUgcGxheWVyJ3MgdmlzdWFsIG1lc2ggYW5kIHBoeXNpY3MgYm9keS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVQbGF5ZXIoKSB7XHJcbiAgICAgICAgLy8gUGxheWVyIHZpc3VhbCBtZXNoIChhIHNpbXBsZSBib3gpXHJcbiAgICAgICAgY29uc3QgcGxheWVyVGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KCdwbGF5ZXJfdGV4dHVyZScpO1xyXG4gICAgICAgIGNvbnN0IHBsYXllck1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICBtYXA6IHBsYXllclRleHR1cmUsXHJcbiAgICAgICAgICAgIGNvbG9yOiBwbGF5ZXJUZXh0dXJlID8gMHhmZmZmZmYgOiAweDAwNzdmZiAvLyBVc2Ugd2hpdGUgd2l0aCB0ZXh0dXJlLCBvciBibHVlIGlmIG5vIHRleHR1cmVcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBwbGF5ZXJHZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgxLCAyLCAxKTsgLy8gUGxheWVyIGRpbWVuc2lvbnNcclxuICAgICAgICB0aGlzLnBsYXllck1lc2ggPSBuZXcgVEhSRUUuTWVzaChwbGF5ZXJHZW9tZXRyeSwgcGxheWVyTWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi55ID0gNTsgLy8gU3RhcnQgcGxheWVyIHNsaWdodGx5IGFib3ZlIHRoZSBncm91bmRcclxuICAgICAgICB0aGlzLnBsYXllck1lc2guY2FzdFNoYWRvdyA9IHRydWU7IC8vIFBsYXllciBjYXN0cyBhIHNoYWRvd1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMucGxheWVyTWVzaCk7XHJcblxyXG4gICAgICAgIC8vIFBsYXllciBwaHlzaWNzIGJvZHkgKENhbm5vbi5qcyBib3ggc2hhcGUpXHJcbiAgICAgICAgY29uc3QgcGxheWVyU2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoMC41LCAxLCAwLjUpKTsgLy8gSGFsZiBleHRlbnRzIG9mIHRoZSBib3ggZm9yIGNvbGxpc2lvblxyXG4gICAgICAgIHRoaXMucGxheWVyQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJNYXNzLCAvLyBQbGF5ZXIncyBtYXNzXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzModGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLngsIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi55LCB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgIHNoYXBlOiBwbGF5ZXJTaGFwZSxcclxuICAgICAgICAgICAgZml4ZWRSb3RhdGlvbjogdHJ1ZSAvLyBQcmV2ZW50IHRoZSBwbGF5ZXIgZnJvbSBmYWxsaW5nIG92ZXIgKHNpbXVsYXRlcyBhIGNhcHN1bGUvY3lsaW5kZXIgY2hhcmFjdGVyKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLnBsYXllckJvZHkpO1xyXG5cclxuICAgICAgICAvLyBTZXQgaW5pdGlhbCBjYW1lcmEgcG9zaXRpb24gcmVsYXRpdmUgdG8gcGxheWVyJ3MgcGh5c2ljcyBib2R5LlxyXG4gICAgICAgIC8vIEl0IHdpbGwgYmUgY29udGludW91c2x5IHVwZGF0ZWQgaW4gdGhlIGFuaW1hdGUgbG9vcC5cclxuICAgICAgICB0aGlzLmNhbWVyYS5wb3NpdGlvbi5zZXQoXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi54LFxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueSArIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFIZWlnaHRPZmZzZXQsXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi56XHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgdGhlIGdyb3VuZCdzIHZpc3VhbCBtZXNoIGFuZCBwaHlzaWNzIGJvZHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY3JlYXRlR3JvdW5kKCkge1xyXG4gICAgICAgIC8vIEdyb3VuZCB2aXN1YWwgbWVzaCAoYSBsYXJnZSBwbGFuZSlcclxuICAgICAgICBjb25zdCBncm91bmRUZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQoJ2dyb3VuZF90ZXh0dXJlJyk7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogZ3JvdW5kVGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3I6IGdyb3VuZFRleHR1cmUgPyAweGZmZmZmZiA6IDB4ODg4ODg4IC8vIFVzZSB3aGl0ZSB3aXRoIHRleHR1cmUsIG9yIGdyZXkgaWYgbm8gdGV4dHVyZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZEdlb21ldHJ5ID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplKTtcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2ggPSBuZXcgVEhSRUUuTWVzaChncm91bmRHZW9tZXRyeSwgZ3JvdW5kTWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWVzaC5yb3RhdGlvbi54ID0gLU1hdGguUEkgLyAyOyAvLyBSb3RhdGUgdG8gbGF5IGZsYXQgb24gdGhlIFhaIHBsYW5lXHJcbiAgICAgICAgdGhpcy5ncm91bmRNZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlOyAvLyBHcm91bmQgcmVjZWl2ZXMgc2hhZG93c1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMuZ3JvdW5kTWVzaCk7XHJcblxyXG4gICAgICAgIC8vIEdyb3VuZCBwaHlzaWNzIGJvZHkgKENhbm5vbi5qcyBwbGFuZSBzaGFwZSlcclxuICAgICAgICBjb25zdCBncm91bmRTaGFwZSA9IG5ldyBDQU5OT04uUGxhbmUoKTtcclxuICAgICAgICB0aGlzLmdyb3VuZEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiAwLCAvLyBBIG1hc3Mgb2YgMCBtYWtlcyBpdCBhIHN0YXRpYyAoaW1tb3ZhYmxlKSBib2R5XHJcbiAgICAgICAgICAgIHNoYXBlOiBncm91bmRTaGFwZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIC8vIFJvdGF0ZSB0aGUgQ2Fubm9uLmpzIHBsYW5lIGJvZHkgdG8gbWF0Y2ggdGhlIFRocmVlLmpzIHBsYW5lIG9yaWVudGF0aW9uIChmbGF0KVxyXG4gICAgICAgIHRoaXMuZ3JvdW5kQm9keS5xdWF0ZXJuaW9uLnNldEZyb21BeGlzQW5nbGUobmV3IENBTk5PTi5WZWMzKDEsIDAsIDApLCAtTWF0aC5QSSAvIDIpO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLmdyb3VuZEJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyB1cCBhbWJpZW50IGFuZCBkaXJlY3Rpb25hbCBsaWdodGluZyBpbiB0aGUgc2NlbmUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc2V0dXBMaWdodGluZygpIHtcclxuICAgICAgICBjb25zdCBhbWJpZW50TGlnaHQgPSBuZXcgVEhSRUUuQW1iaWVudExpZ2h0KDB4NDA0MDQwLCAxLjApOyAvLyBTb2Z0IHdoaXRlIGFtYmllbnQgbGlnaHRcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChhbWJpZW50TGlnaHQpO1xyXG5cclxuICAgICAgICBjb25zdCBkaXJlY3Rpb25hbExpZ2h0ID0gbmV3IFRIUkVFLkRpcmVjdGlvbmFsTGlnaHQoMHhmZmZmZmYsIDAuOCk7IC8vIEJyaWdodGVyIGRpcmVjdGlvbmFsIGxpZ2h0XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5wb3NpdGlvbi5zZXQoNSwgMTAsIDUpOyAvLyBQb3NpdGlvbiB0aGUgbGlnaHQgc291cmNlXHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5jYXN0U2hhZG93ID0gdHJ1ZTsgLy8gRW5hYmxlIHNoYWRvd3MgZnJvbSB0aGlzIGxpZ2h0IHNvdXJjZVxyXG4gICAgICAgIC8vIENvbmZpZ3VyZSBzaGFkb3cgcHJvcGVydGllcyBmb3IgdGhlIGRpcmVjdGlvbmFsIGxpZ2h0XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cubWFwU2l6ZS53aWR0aCA9IDEwMjQ7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cubWFwU2l6ZS5oZWlnaHQgPSAxMDI0O1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5uZWFyID0gMC41O1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5mYXIgPSA1MDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEubGVmdCA9IC0xMDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEucmlnaHQgPSAxMDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEudG9wID0gMTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmJvdHRvbSA9IC0xMDtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChkaXJlY3Rpb25hbExpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgd2luZG93IHJlc2l6aW5nIHRvIGtlZXAgdGhlIGNhbWVyYSBhc3BlY3QgcmF0aW8gYW5kIHJlbmRlcmVyIHNpemUgY29ycmVjdC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbldpbmRvd1Jlc2l6ZSgpIHtcclxuICAgICAgICB0aGlzLmNhbWVyYS5hc3BlY3QgPSB3aW5kb3cuaW5uZXJXaWR0aCAvIHdpbmRvdy5pbm5lckhlaWdodDtcclxuICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKHdpbmRvdy5pbm5lcldpZHRoLCB3aW5kb3cuaW5uZXJIZWlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVjb3JkcyB3aGljaCBrZXlzIGFyZSBjdXJyZW50bHkgcHJlc3NlZCBkb3duLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAgICAgIHRoaXMua2V5c1tldmVudC5rZXkudG9Mb3dlckNhc2UoKV0gPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVjb3JkcyB3aGljaCBrZXlzIGFyZSBjdXJyZW50bHkgcmVsZWFzZWQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25LZXlVcChldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAgICAgIHRoaXMua2V5c1tldmVudC5rZXkudG9Mb3dlckNhc2UoKV0gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgbW91c2UgbW92ZW1lbnQgZm9yIGNhbWVyYSByb3RhdGlvbiAobW91c2UgbG9vaykuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25Nb3VzZU1vdmUoZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgICAgICAvLyBPbmx5IHByb2Nlc3MgbW91c2UgbW92ZW1lbnQgaWYgdGhlIGdhbWUgaXMgcGxheWluZyBhbmQgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgY29uc3QgbW92ZW1lbnRYID0gZXZlbnQubW92ZW1lbnRYIHx8IDA7XHJcbiAgICAgICAgICAgIGNvbnN0IG1vdmVtZW50WSA9IGV2ZW50Lm1vdmVtZW50WSB8fCAwO1xyXG5cclxuICAgICAgICAgICAgLy8gQXBwbHkgaG9yaXpvbnRhbCByb3RhdGlvbiAoeWF3KSB0byB0aGUgY2FtZXJhIGFyb3VuZCBpdHMgbG9jYWwgWS1heGlzXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnJvdGF0aW9uLnkgLT0gbW92ZW1lbnRYICogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm1vdXNlU2Vuc2l0aXZpdHk7XHJcblxyXG4gICAgICAgICAgICAvLyBBcHBseSB2ZXJ0aWNhbCByb3RhdGlvbiAocGl0Y2gpIGFuZCBjbGFtcCBpdCB0byBwcmV2ZW50IHRoZSBjYW1lcmEgZnJvbSBmbGlwcGluZyBvdmVyXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUGl0Y2ggLT0gbW92ZW1lbnRZICogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm1vdXNlU2Vuc2l0aXZpdHk7XHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUGl0Y2ggPSBNYXRoLm1heCgtTWF0aC5QSSAvIDIsIE1hdGgubWluKE1hdGguUEkgLyAyLCB0aGlzLmNhbWVyYVBpdGNoKSk7IC8vIENsYW1wIHRvIC05MCB0byArOTAgZGVncmVlc1xyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5yb3RhdGlvbi54ID0gdGhpcy5jYW1lcmFQaXRjaDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVcGRhdGVzIHRoZSBwb2ludGVyIGxvY2sgc3RhdHVzIHdoZW4gaXQgY2hhbmdlcyAoZS5nLiwgdXNlciBwcmVzc2VzIEVzYykuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25Qb2ludGVyTG9ja0NoYW5nZSgpIHtcclxuICAgICAgICBpZiAoZG9jdW1lbnQucG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLmNhbnZhcyB8fFxyXG4gICAgICAgICAgICAoZG9jdW1lbnQgYXMgYW55KS5tb3pQb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMuY2FudmFzIHx8XHJcbiAgICAgICAgICAgIChkb2N1bWVudCBhcyBhbnkpLndlYmtpdFBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgdGhpcy5pc1BvaW50ZXJMb2NrZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUG9pbnRlciBsb2NrZWQnKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmlzUG9pbnRlckxvY2tlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUG9pbnRlciB1bmxvY2tlZCcpO1xyXG4gICAgICAgICAgICAvLyBJbiBhIG1vcmUgY29tcGxleCBnYW1lLCB5b3UgbWlnaHQgcGF1c2UgdGhlIGdhbWUgb3Igc2hvdyBhIG1lbnUgaGVyZS5cclxuICAgICAgICAgICAgLy8gRm9yIHRoaXMgc2ltcGxlIGdhbWUsIHdlJ2xsIGp1c3QgYWxsb3cgZ2FtZXBsYXkgdG8gY29udGludWUgd2l0aG91dCBtb3VzZSBsb29rLlxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRoZSBtYWluIGdhbWUgbG9vcCwgY2FsbGVkIG9uIGV2ZXJ5IGFuaW1hdGlvbiBmcmFtZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhbmltYXRlKHRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXApIHtcclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5hbmltYXRlLmJpbmQodGhpcykpOyAvLyBSZXF1ZXN0IG5leHQgZnJhbWVcclxuXHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKHRpbWUgLSB0aGlzLmxhc3RUaW1lKSAvIDEwMDA7IC8vIENhbGN1bGF0ZSBkZWx0YSB0aW1lIGluIHNlY29uZHNcclxuICAgICAgICB0aGlzLmxhc3RUaW1lID0gdGltZTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlUGxheWVyTW92ZW1lbnQoKTsgLy8gVXBkYXRlIHBsYXllcidzIHZlbG9jaXR5IGJhc2VkIG9uIGlucHV0XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlUGh5c2ljcyhkZWx0YVRpbWUpOyAvLyBTdGVwIHRoZSBwaHlzaWNzIHdvcmxkXHJcbiAgICAgICAgICAgIHRoaXMuc3luY01lc2hlc1dpdGhCb2RpZXMoKTsgLy8gU3luY2hyb25pemUgdmlzdWFsIG1lc2hlcyB3aXRoIHBoeXNpY3MgYm9kaWVzXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlcih0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYSk7IC8vIFJlbmRlciB0aGUgc2NlbmVcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN0ZXBzIHRoZSBDYW5ub24uanMgcGh5c2ljcyB3b3JsZCBmb3J3YXJkLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZVBoeXNpY3MoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICAvLyB3b3JsZC5zdGVwKGZpeGVkVGltZVN0ZXAsIGRlbHRhVGltZSwgbWF4U3ViU3RlcHMpXHJcbiAgICAgICAgLy8gMS82MDogQSBmaXhlZCB0aW1lIHN0ZXAgb2YgNjAgcGh5c2ljcyB1cGRhdGVzIHBlciBzZWNvbmQgKHN0YW5kYXJkKS5cclxuICAgICAgICAvLyBkZWx0YVRpbWU6IFRoZSBhY3R1YWwgdGltZSBlbGFwc2VkIHNpbmNlIHRoZSBsYXN0IHJlbmRlciBmcmFtZS5cclxuICAgICAgICAvLyBtYXhQaHlzaWNzU3ViU3RlcHM6IExpbWl0cyB0aGUgbnVtYmVyIG9mIHBoeXNpY3Mgc3RlcHMgaW4gb25lIHJlbmRlciBmcmFtZVxyXG4gICAgICAgIC8vIHRvIHByZXZlbnQgaW5zdGFiaWxpdGllcyBpZiByZW5kZXJpbmcgc2xvd3MgZG93biBzaWduaWZpY2FudGx5LlxyXG4gICAgICAgIHRoaXMud29ybGQuc3RlcCgxIC8gNjAsIGRlbHRhVGltZSwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm1heFBoeXNpY3NTdWJTdGVwcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVcGRhdGVzIHRoZSBwbGF5ZXIncyB2ZWxvY2l0eSBiYXNlZCBvbiBXQVNEIGlucHV0IGFuZCBjYW1lcmEgb3JpZW50YXRpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlUGxheWVyTW92ZW1lbnQoKSB7XHJcbiAgICAgICAgY29uc3QgcGxheWVyU3BlZWQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyU3BlZWQ7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFZlbG9jaXR5ID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5O1xyXG4gICAgICAgIC8vIFN0YXJ0IHdpdGggY3VycmVudCB2ZXJ0aWNhbCB2ZWxvY2l0eSwgYW5kIHplcm8gaG9yaXpvbnRhbCBmb3IgZnJlc2ggY2FsY3VsYXRpb25cclxuICAgICAgICBjb25zdCB0YXJnZXRWZWxvY2l0eSA9IG5ldyBDQU5OT04uVmVjMygwLCBjdXJyZW50VmVsb2NpdHkueSwgMCk7XHJcblxyXG4gICAgICAgIC8vIEdldCBjYW1lcmEncyBmb3J3YXJkIGFuZCByaWdodCB2ZWN0b3JzIHRvIGRldGVybWluZSBtb3ZlbWVudCBkaXJlY3Rpb24gcmVsYXRpdmUgdG8gdmlld1xyXG4gICAgICAgIGNvbnN0IGNhbWVyYURpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuZ2V0V29ybGREaXJlY3Rpb24oY2FtZXJhRGlyZWN0aW9uKTsgLy8gR2V0IGZvcndhcmQgdmVjdG9yIGluIHdvcmxkIGNvb3JkaW5hdGVzXHJcbiAgICAgICAgY2FtZXJhRGlyZWN0aW9uLnkgPSAwOyAvLyBGbGF0dGVuIHRoZSB2ZWN0b3IgdG8gcmVzdHJpY3QgbW92ZW1lbnQgdG8gdGhlIGhvcml6b250YWwgcGxhbmVcclxuICAgICAgICBjYW1lcmFEaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGNhbWVyYVJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICBjYW1lcmFSaWdodC5jcm9zc1ZlY3RvcnModGhpcy5jYW1lcmEudXAsIGNhbWVyYURpcmVjdGlvbik7IC8vIENhbGN1bGF0ZSB0aGUgcmlnaHQgdmVjdG9yXHJcbiAgICAgICAgY2FtZXJhUmlnaHQubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGRlc2lyZWQgdmVsb2NpdHkgYmFzZWQgb24ga2V5IHByZXNzZXNcclxuICAgICAgICBpZiAodGhpcy5rZXlzWyd3J10pIHsgLy8gRm9yd2FyZFxyXG4gICAgICAgICAgICB0YXJnZXRWZWxvY2l0eS54ICs9IGNhbWVyYURpcmVjdGlvbi54ICogcGxheWVyU3BlZWQ7XHJcbiAgICAgICAgICAgIHRhcmdldFZlbG9jaXR5LnogKz0gY2FtZXJhRGlyZWN0aW9uLnogKiBwbGF5ZXJTcGVlZDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1sncyddKSB7IC8vIEJhY2t3YXJkXHJcbiAgICAgICAgICAgIHRhcmdldFZlbG9jaXR5LnggLT0gY2FtZXJhRGlyZWN0aW9uLnggKiBwbGF5ZXJTcGVlZDtcclxuICAgICAgICAgICAgdGFyZ2V0VmVsb2NpdHkueiAtPSBjYW1lcmFEaXJlY3Rpb24ueiAqIHBsYXllclNwZWVkO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5rZXlzWydhJ10pIHsgLy8gU3RyYWZlIGxlZnRcclxuICAgICAgICAgICAgdGFyZ2V0VmVsb2NpdHkueCAtPSBjYW1lcmFSaWdodC54ICogcGxheWVyU3BlZWQ7XHJcbiAgICAgICAgICAgIHRhcmdldFZlbG9jaXR5LnogLT0gY2FtZXJhUmlnaHQueiAqIHBsYXllclNwZWVkO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5rZXlzWydkJ10pIHsgLy8gU3RyYWZlIHJpZ2h0XHJcbiAgICAgICAgICAgIHRhcmdldFZlbG9jaXR5LnggKz0gY2FtZXJhUmlnaHQueCAqIHBsYXllclNwZWVkO1xyXG4gICAgICAgICAgICB0YXJnZXRWZWxvY2l0eS56ICs9IGNhbWVyYVJpZ2h0LnogKiBwbGF5ZXJTcGVlZDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNtb290aGx5IGludGVycG9sYXRlIGN1cnJlbnQgdmVsb2NpdHkgdG93YXJkcyB0YXJnZXQgdmVsb2NpdHkgZm9yIHNtb290aGVyIG1vdmVtZW50LlxyXG4gICAgICAgIC8vIFRoaXMgaGVscHMgcHJldmVudCBqZXJreSBzdG9wL3N0YXJ0IG1vdmVtZW50cyBjb21tb24gd2l0aCBkaXJlY3QgdmVsb2NpdHkgc2V0dGluZy5cclxuICAgICAgICBjb25zdCBsZXJwRmFjdG9yID0gMC4yOyAvLyBEZXRlcm1pbmVzIGhvdyBxdWlja2x5IHRoZSB2ZWxvY2l0eSBjaGFuZ2VzXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggPSBjdXJyZW50VmVsb2NpdHkueCArICh0YXJnZXRWZWxvY2l0eS54IC0gY3VycmVudFZlbG9jaXR5LngpICogbGVycEZhY3RvcjtcclxuICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiA9IGN1cnJlbnRWZWxvY2l0eS56ICsgKHRhcmdldFZlbG9jaXR5LnogLSBjdXJyZW50VmVsb2NpdHkueikgKiBsZXJwRmFjdG9yO1xyXG5cclxuICAgICAgICAvLyBVcGRhdGUgY2FtZXJhIHBvc2l0aW9uIHRvIGZvbGxvdyB0aGUgcGxheWVyJ3MgcGh5c2ljcyBib2R5LCBhZGRpbmcgYW4gZXllLWxldmVsIG9mZnNldFxyXG4gICAgICAgIHRoaXMuY2FtZXJhLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEucG9zaXRpb24ueSArPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FtZXJhSGVpZ2h0T2Zmc2V0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3luY2hyb25pemVzIHRoZSB2aXN1YWwgbWVzaGVzIHdpdGggdGhlaXIgY29ycmVzcG9uZGluZyBwaHlzaWNzIGJvZGllcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzeW5jTWVzaGVzV2l0aEJvZGllcygpIHtcclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSBwbGF5ZXIncyB2aXN1YWwgbWVzaCBwb3NpdGlvbiB3aXRoIGl0cyBwaHlzaWNzIGJvZHkncyBwb3NpdGlvblxyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgICAgIC8vIFBsYXllciBib2R5IGhhcyBmaXhlZCByb3RhdGlvbiwgc28gaXRzIHJvdGF0aW9uIGRvZXMgbm90IG5lZWQgdG8gYmUgY29waWVkLlxyXG4gICAgICAgIC8vIElmIHRoZSBwbGF5ZXIgY291bGQgcm90YXRlIChlLmcuLCBmcm9tIGltcGFjdHMpLCBpdHMgcXVhdGVybmlvbiB3b3VsZCBhbHNvIGJlIGNvcGllZCBoZXJlOlxyXG4gICAgICAgIC8vIHRoaXMucGxheWVyTWVzaC5xdWF0ZXJuaW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnF1YXRlcm5pb24gYXMgdW5rbm93biBhcyBUSFJFRS5RdWF0ZXJuaW9uKTtcclxuXHJcbiAgICAgICAgLy8gVGhlIGdyb3VuZCBpcyBzdGF0aWMsIHNvIGl0cyBwb3NpdGlvbiBhbmQgcm90YXRpb24gZG8gbm90IGNoYW5nZSBhZnRlciBpbml0aWFsIHNldHVwLlxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBTdGFydCB0aGUgZ2FtZSB3aGVuIHRoZSBET00gY29udGVudCBpcyBmdWxseSBsb2FkZWRcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcclxuICAgIG5ldyBHYW1lKCk7XHJcbn0pOyJdLAogICJtYXBwaW5ncyI6ICJBQUNBLFlBQVksV0FBVztBQUN2QixZQUFZLFlBQVk7QUFHeEIsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUZDLFNBQUFBO0FBQUEsR0FBQTtBQTZCTCxNQUFNLEtBQUs7QUFBQSxFQW9DUCxjQUFjO0FBbENkO0FBQUEsU0FBUSxRQUFtQjtBQWtCM0I7QUFBQSxTQUFRLE9BQW1DLENBQUM7QUFDNUM7QUFBQSxTQUFRLGtCQUEyQjtBQUNuQztBQUFBLFNBQVEsY0FBc0I7QUFHOUI7QUFBQTtBQUFBLFNBQVEsV0FBdUMsb0JBQUksSUFBSTtBQUN2RDtBQUFBLFNBQVEsU0FBd0Msb0JBQUksSUFBSTtBQVF4RDtBQUFBLFNBQVEsV0FBZ0M7QUFJcEMsU0FBSyxTQUFTLFNBQVMsZUFBZSxZQUFZO0FBQ2xELFFBQUksQ0FBQyxLQUFLLFFBQVE7QUFDZCxjQUFRLE1BQU0sZ0RBQWdEO0FBQzlEO0FBQUEsSUFDSjtBQUNBLFNBQUssS0FBSztBQUFBLEVBQ2Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQWMsT0FBTztBQUVqQixRQUFJO0FBQ0EsWUFBTSxXQUFXLE1BQU0sTUFBTSxXQUFXO0FBQ3hDLFVBQUksQ0FBQyxTQUFTLElBQUk7QUFDZCxjQUFNLElBQUksTUFBTSx1QkFBdUIsU0FBUyxNQUFNLEVBQUU7QUFBQSxNQUM1RDtBQUNBLFdBQUssU0FBUyxNQUFNLFNBQVMsS0FBSztBQUNsQyxjQUFRLElBQUksOEJBQThCLEtBQUssTUFBTTtBQUFBLElBQ3pELFNBQVMsT0FBTztBQUNaLGNBQVEsTUFBTSxzQ0FBc0MsS0FBSztBQUV6RCxZQUFNLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFDN0MsZUFBUyxNQUFNLFdBQVc7QUFDMUIsZUFBUyxN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QUssSUFBSSxJQUFJLFdBQVcsS0FBSyxPQUFPLGFBQWEsa0JBQWtCO0FBQUEsRUFDbEY7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLHVCQUF1QjtBQUMzQixVQUFNLGNBQWMsS0FBSyxPQUFPLGFBQWE7QUFDN0MsVUFBTSxrQkFBa0IsS0FBSyxXQUFXO0FBRXhDLFVBQU0saUJBQWlCLElBQUksT0FBTyxLQUFLLEdBQUcsZ0JBQWdCLEdBQUcsQ0FBQztBQUc5RCxVQUFNLGtCQUFrQixJQUFJLE1BQU0sUUFBUTtBQUMxQyxTQUFLLE9BQU8sa0JBQWtCLGVBQWU7QUFDN0Msb0JBQWdCLElBQUk7QUFDcEIsb0JBQWdCLFVBQVU7QUFFMUIsVUFBTSxjQUFjLElBQUksTUFBTSxRQUFRO0FBQ3RDLGdCQUFZLGFBQWEsS0FBSyxPQUFPLElBQUksZUFBZTtBQUN4RCxnQkFBWSxVQUFVO0FBR3RCLFFBQUksS0FBSyxLQUFLLEdBQUcsR0FBRztBQUNoQixxQkFBZSxLQUFLLGdCQUFnQixJQUFJO0FBQ3hDLHFCQUFlLEtBQUssZ0JBQWdCLElBQUk7QUFBQSxJQUM1QztBQUNBLFFBQUksS0FBSyxLQUFLLEdBQUcsR0FBRztBQUNoQixxQkFBZSxLQUFLLGdCQUFnQixJQUFJO0FBQ3hDLHFCQUFlLEtBQUssZ0JBQWdCLElBQUk7QUFBQSxJQUM1QztBQUNBLFFBQUksS0FBSyxLQUFLLEdBQUcsR0FBRztBQUNoQixxQkFBZSxLQUFLLFlBQVksSUFBSTtBQUNwQyxxQkFBZSxLQUFLLFlBQVksSUFBSTtBQUFBLElBQ3hDO0FBQ0EsUUFBSSxLQUFLLEtBQUssR0FBRyxHQUFHO0FBQ2hCLHFCQUFlLEtBQUssWUFBWSxJQUFJO0FBQ3BDLHFCQUFlLEtBQUssWUFBWSxJQUFJO0FBQUEsSUFDeEM7QUFJQSxVQUFNLGFBQWE7QUFDbkIsU0FBSyxXQUFXLFNBQVMsSUFBSSxnQkFBZ0IsS0FBSyxlQUFlLElBQUksZ0JBQWdCLEtBQUs7QUFDMUYsU0FBSyxXQUFXLFNBQVMsSUFBSSxnQkFBZ0IsS0FBSyxlQUFlLElBQUksZ0JBQWdCLEtBQUs7QUFHMUYsU0FBSyxPQUFPLFNBQVMsS0FBSyxLQUFLLFdBQVcsUUFBb0M7QUFDOUUsU0FBSyxPQUFPLFNBQVMsS0FBSyxLQUFLLE9BQU8sYUFBYTtBQUFBLEVBQ3ZEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSx1QkFBdUI7QUFFM0IsU0FBSyxXQUFXLFNBQVMsS0FBSyxLQUFLLFdBQVcsUUFBb0M7QUFBQSxFQU10RjtBQUNKO0FBR0EsU0FBUyxpQkFBaUIsb0JBQW9CLE1BQU07QUFDaEQsTUFBSSxLQUFLO0FBQ2IsQ0FBQzsiLAogICJuYW1lcyI6IFsiR2FtZVN0YXRlIl0KfQo=
