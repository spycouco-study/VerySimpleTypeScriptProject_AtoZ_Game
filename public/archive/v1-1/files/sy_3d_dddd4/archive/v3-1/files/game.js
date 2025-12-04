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
    this.titleScreenOverlay.addEventListener("click", () => this.startGame());
    this.sounds.get("background_music")?.play().catch((e) => console.log("BGM play denied (requires user gesture):", e));
  }
  /**
   * Transitions the game from the title screen to the playing state.
   */
  startGame() {
    this.state = 1 /* PLAYING */;
    if (this.titleScreenOverlay && this.titleScreenOverlay.parentNode) {
      document.body.removeChild(this.titleScreenOverlay);
    }
    this.canvas.addEventListener("click", this.handleCanvasReLockPointer.bind(this));
    this.canvas.requestPointerLock();
    this.sounds.get("background_music")?.play().catch((e) => console.log("BGM play failed after user gesture:", e));
  }
  /**
   * Handles clicks on the canvas to re-lock the pointer if the game is playing and unlocked.
   */
  handleCanvasReLockPointer() {
    if (this.state === 1 /* PLAYING */ && !this.isPointerLocked) {
      this.canvas.requestPointerLock();
    }
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
    if (!this.isPointerLocked) {
      this.playerBody.velocity.x = 0;
      this.playerBody.velocity.z = 0;
      return;
    }
    const playerSpeed = this.config.gameSettings.playerSpeed;
    const currentVelocity = this.playerBody.velocity;
    const desiredHorizontalVelocity = new CANNON.Vec3(0, 0, 0);
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();
    const cameraRight = new THREE.Vector3();
    cameraRight.crossVectors(this.camera.up, cameraDirection);
    cameraRight.normalize();
    let moving = false;
    if (this.keys["w"]) {
      desiredHorizontalVelocity.x += cameraDirection.x;
      desiredHorizontalVelocity.z += cameraDirection.z;
      moving = true;
    }
    if (this.keys["s"]) {
      desiredHorizontalVelocity.x -= cameraDirection.x;
      desiredHorizontalVelocity.z -= cameraDirection.z;
      moving = true;
    }
    if (this.keys["a"]) {
      desiredHorizontalVelocity.x -= cameraRight.x;
      desiredHorizontalVelocity.z -= cameraRight.z;
      moving = true;
    }
    if (this.keys["d"]) {
      desiredHorizontalVelocity.x += cameraRight.x;
      desiredHorizontalVelocity.z += cameraRight.z;
      moving = true;
    }
    if (moving) {
      desiredHorizontalVelocity.normalize();
      desiredHorizontalVelocity.x *= playerSpeed;
      desiredHorizontalVelocity.z *= playerSpeed;
      const accelerationFactor = 0.2;
      this.playerBody.velocity.x = currentVelocity.x + (desiredHorizontalVelocity.x - currentVelocity.x) * accelerationFactor;
      this.playerBody.velocity.z = currentVelocity.z + (desiredHorizontalVelocity.z - currentVelocity.z) * accelerationFactor;
    } else {
      const frictionFactor = 0.8;
      this.playerBody.velocity.x *= frictionFactor;
      this.playerBody.velocity.z *= frictionFactor;
    }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gSW1wb3J0IFRocmVlLmpzIGFuZCBDYW5ub24tZXMgbGlicmFyaWVzXHJcbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcclxuaW1wb3J0ICogYXMgQ0FOTk9OIGZyb20gJ2Nhbm5vbi1lcyc7XHJcblxyXG4vLyBFbnVtIHRvIGRlZmluZSB0aGUgcG9zc2libGUgc3RhdGVzIG9mIHRoZSBnYW1lXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFLCAgIC8vIFRpdGxlIHNjcmVlbiwgd2FpdGluZyBmb3IgdXNlciBpbnB1dFxyXG4gICAgUExBWUlORyAgLy8gR2FtZSBpcyBhY3RpdmUsIHVzZXIgY2FuIG1vdmUgYW5kIGxvb2sgYXJvdW5kXHJcbn1cclxuXHJcbi8vIEludGVyZmFjZSB0byB0eXBlLWNoZWNrIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHN0YXJ0R2FtZVByb21wdDogc3RyaW5nO1xyXG4gICAgICAgIHBsYXllclNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgbW91c2VTZW5zaXRpdml0eTogbnVtYmVyO1xyXG4gICAgICAgIGNhbWVyYUhlaWdodE9mZnNldDogbnVtYmVyOyAvLyBWZXJ0aWNhbCBvZmZzZXQgb2YgdGhlIGNhbWVyYSBmcm9tIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkgY2VudGVyXHJcbiAgICAgICAgY2FtZXJhTmVhcjogbnVtYmVyOyAgICAgICAgIC8vIE5lYXIgY2xpcHBpbmcgcGxhbmUgZm9yIHRoZSBjYW1lcmFcclxuICAgICAgICBjYW1lcmFGYXI6IG51bWJlcjsgICAgICAgICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lIGZvciB0aGUgY2FtZXJhXHJcbiAgICAgICAgcGxheWVyTWFzczogbnVtYmVyOyAgICAgICAgIC8vIE1hc3Mgb2YgdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keVxyXG4gICAgICAgIGdyb3VuZFNpemU6IG51bWJlcjsgICAgICAgICAvLyBTaXplICh3aWR0aC9kZXB0aCkgb2YgdGhlIHNxdWFyZSBncm91bmQgcGxhbmVcclxuICAgICAgICBtYXhQaHlzaWNzU3ViU3RlcHM6IG51bWJlcjsgLy8gTWF4aW11bSBudW1iZXIgb2YgcGh5c2ljcyBzdWJzdGVwcyBwZXIgZnJhbWUgdG8gbWFpbnRhaW4gc3RhYmlsaXR5XHJcbiAgICB9O1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyIH1bXTtcclxuICAgIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNYWluIEdhbWUgY2xhc3MgcmVzcG9uc2libGUgZm9yIGluaXRpYWxpemluZyBhbmQgcnVubmluZyB0aGUgM0QgZ2FtZS5cclxuICogSXQgaGFuZGxlcyBUaHJlZS5qcyByZW5kZXJpbmcsIENhbm5vbi1lcyBwaHlzaWNzLCBpbnB1dCwgYW5kIGdhbWUgc3RhdGUuXHJcbiAqL1xyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY29uZmlnITogR2FtZUNvbmZpZzsgLy8gR2FtZSBjb25maWd1cmF0aW9uIGxvYWRlZCBmcm9tIGRhdGEuanNvblxyXG4gICAgcHJpdmF0ZSBzdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFOyAvLyBDdXJyZW50IHN0YXRlIG9mIHRoZSBnYW1lXHJcblxyXG4gICAgLy8gVGhyZWUuanMgZWxlbWVudHMgZm9yIHJlbmRlcmluZ1xyXG4gICAgcHJpdmF0ZSBzY2VuZSE6IFRIUkVFLlNjZW5lO1xyXG4gICAgcHJpdmF0ZSBjYW1lcmEhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYTtcclxuICAgIHByaXZhdGUgcmVuZGVyZXIhOiBUSFJFRS5XZWJHTFJlbmRlcmVyO1xyXG4gICAgcHJpdmF0ZSBjYW52YXMhOiBIVE1MQ2FudmFzRWxlbWVudDsgLy8gVGhlIEhUTUwgY2FudmFzIGVsZW1lbnQgZm9yIHJlbmRlcmluZ1xyXG5cclxuICAgIC8vIENhbm5vbi1lcyBlbGVtZW50cyBmb3IgcGh5c2ljc1xyXG4gICAgcHJpdmF0ZSB3b3JsZCE6IENBTk5PTi5Xb3JsZDtcclxuICAgIHByaXZhdGUgcGxheWVyQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBwbGF5ZXJcclxuICAgIHByaXZhdGUgZ3JvdW5kQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBncm91bmRcclxuXHJcbiAgICAvLyBWaXN1YWwgbWVzaGVzIChUaHJlZS5qcykgZm9yIGdhbWUgb2JqZWN0c1xyXG4gICAgcHJpdmF0ZSBwbGF5ZXJNZXNoITogVEhSRUUuTWVzaDtcclxuICAgIHByaXZhdGUgZ3JvdW5kTWVzaCE6IFRIUkVFLk1lc2g7XHJcblxyXG4gICAgLy8gSW5wdXQgaGFuZGxpbmcgc3RhdGVcclxuICAgIHByaXZhdGUga2V5czogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0gPSB7fTsgLy8gVHJhY2tzIGN1cnJlbnRseSBwcmVzc2VkIGtleXNcclxuICAgIHByaXZhdGUgaXNQb2ludGVyTG9ja2VkOiBib29sZWFuID0gZmFsc2U7IC8vIFRydWUgaWYgbW91c2UgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgIHByaXZhdGUgY2FtZXJhUGl0Y2g6IG51bWJlciA9IDA7IC8vIFZlcnRpY2FsIHJvdGF0aW9uIChwaXRjaCkgb2YgdGhlIGNhbWVyYVxyXG5cclxuICAgIC8vIEFzc2V0IG1hbmFnZW1lbnRcclxuICAgIHByaXZhdGUgdGV4dHVyZXM6IE1hcDxzdHJpbmcsIFRIUkVFLlRleHR1cmU+ID0gbmV3IE1hcCgpOyAvLyBTdG9yZXMgbG9hZGVkIHRleHR1cmVzXHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7IC8vIFN0b3JlcyBsb2FkZWQgYXVkaW8gZWxlbWVudHNcclxuXHJcbiAgICAvLyBVSSBlbGVtZW50cyAoZHluYW1pY2FsbHkgY3JlYXRlZCBmb3IgdGhlIHRpdGxlIHNjcmVlbilcclxuICAgIHByaXZhdGUgdGl0bGVTY3JlZW5PdmVybGF5ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHRpdGxlVGV4dCE6IEhUTUxEaXZFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBwcm9tcHRUZXh0ITogSFRNTERpdkVsZW1lbnQ7XHJcblxyXG4gICAgLy8gRm9yIGNhbGN1bGF0aW5nIGRlbHRhIHRpbWUgYmV0d2VlbiBmcmFtZXNcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXAgPSAwO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgICAgIC8vIEdldCB0aGUgY2FudmFzIGVsZW1lbnQgZnJvbSBpbmRleC5odG1sXHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZUNhbnZhcycpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCBcImdhbWVDYW52YXNcIiBub3QgZm91bmQhJyk7XHJcbiAgICAgICAgICAgIHJldHVybjsgLy8gQ2Fubm90IHByb2NlZWQgd2l0aG91dCBhIGNhbnZhc1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmluaXQoKTsgLy8gU3RhcnQgdGhlIGFzeW5jaHJvbm91cyBpbml0aWFsaXphdGlvbiBwcm9jZXNzXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBc3luY2hyb25vdXNseSBpbml0aWFsaXplcyB0aGUgZ2FtZSwgbG9hZGluZyBjb25maWcsIGFzc2V0cywgYW5kIHNldHRpbmcgdXAgc3lzdGVtcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhc3luYyBpbml0KCkge1xyXG4gICAgICAgIC8vIDEuIExvYWQgZ2FtZSBjb25maWd1cmF0aW9uIGZyb20gZGF0YS5qc29uXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCBlcnJvciEgc3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ0dhbWUgY29uZmlndXJhdGlvbiBsb2FkZWQ6JywgdGhpcy5jb25maWcpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbjonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIC8vIElmIGNvbmZpZ3VyYXRpb24gZmFpbHMgdG8gbG9hZCwgZGlzcGxheSBhbiBlcnJvciBtZXNzYWdlIGFuZCBzdG9wLlxyXG4gICAgICAgICAgICBjb25zdCBlcnJvckRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRvcCA9ICc1MCUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5sZWZ0ID0gJzUwJSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRyYW5zZm9ybSA9ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5jb2xvciA9ICdyZWQnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5mb250U2l6ZSA9ICcyNHB4JztcclxuICAgICAgICAgICAgZXJyb3JEaXYudGV4dENvbnRlbnQgPSAnRXJyb3I6IEZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbi4gQ2hlY2sgY29uc29sZSBmb3IgZGV0YWlscy4nO1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVycm9yRGl2KTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gMi4gSW5pdGlhbGl6ZSBUaHJlZS5qcyAoc2NlbmUsIGNhbWVyYSwgcmVuZGVyZXIpXHJcbiAgICAgICAgdGhpcy5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKFxyXG4gICAgICAgICAgICA3NSwgLy8gRmllbGQgb2YgVmlldyAoRk9WKVxyXG4gICAgICAgICAgICB3aW5kb3cuaW5uZXJXaWR0aCAvIHdpbmRvdy5pbm5lckhlaWdodCwgLy8gQXNwZWN0IHJhdGlvXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFOZWFyLCAvLyBOZWFyIGNsaXBwaW5nIHBsYW5lXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFGYXIgICAvLyBGYXIgY2xpcHBpbmcgcGxhbmVcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcih7IGNhbnZhczogdGhpcy5jYW52YXMsIGFudGlhbGlhczogdHJ1ZSB9KTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRQaXhlbFJhdGlvKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC5lbmFibGVkID0gdHJ1ZTsgLy8gRW5hYmxlIHNoYWRvd3MgZm9yIGJldHRlciByZWFsaXNtXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zaGFkb3dNYXAudHlwZSA9IFRIUkVFLlBDRlNvZnRTaGFkb3dNYXA7IC8vIFVzZSBzb2Z0IHNoYWRvd3NcclxuXHJcbiAgICAgICAgLy8gMy4gSW5pdGlhbGl6ZSBDYW5ub24tZXMgKHBoeXNpY3Mgd29ybGQpXHJcbiAgICAgICAgdGhpcy53b3JsZCA9IG5ldyBDQU5OT04uV29ybGQoKTtcclxuICAgICAgICB0aGlzLndvcmxkLmdyYXZpdHkuc2V0KDAsIC05LjgyLCAwKTsgLy8gU2V0IHN0YW5kYXJkIEVhcnRoIGdyYXZpdHkgKFktYXhpcyBkb3duKVxyXG4gICAgICAgIHRoaXMud29ybGQuYnJvYWRwaGFzZSA9IG5ldyBDQU5OT04uU0FQQnJvYWRwaGFzZSh0aGlzLndvcmxkKTsgLy8gVXNlIGFuIGVmZmljaWVudCBicm9hZHBoYXNlIGFsZ29yaXRobVxyXG4gICAgICAgIC8vIEZpeDogQ2FzdCB0aGlzLndvcmxkLnNvbHZlciB0byBDQU5OT04uR1NTb2x2ZXIgdG8gYWNjZXNzIHRoZSAnaXRlcmF0aW9ucycgcHJvcGVydHlcclxuICAgICAgICAvLyBUaGUgZGVmYXVsdCBzb2x2ZXIgaW4gQ2Fubm9uLmpzIChhbmQgQ2Fubm9uLWVzKSBpcyBHU1NvbHZlciwgd2hpY2ggaGFzIHRoaXMgcHJvcGVydHkuXHJcbiAgICAgICAgKHRoaXMud29ybGQuc29sdmVyIGFzIENBTk5PTi5HU1NvbHZlcikuaXRlcmF0aW9ucyA9IDEwOyAvLyBJbmNyZWFzZSBzb2x2ZXIgaXRlcmF0aW9ucyBmb3IgYmV0dGVyIHN0YWJpbGl0eVxyXG5cclxuICAgICAgICAvLyA0LiBMb2FkIGFzc2V0cyAodGV4dHVyZXMgYW5kIHNvdW5kcylcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRBc3NldHMoKTtcclxuXHJcbiAgICAgICAgLy8gNS4gU2V0dXAgZXZlbnQgbGlzdGVuZXJzIGZvciB1c2VyIGlucHV0IGFuZCB3aW5kb3cgcmVzaXppbmdcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgdGhpcy5vbldpbmRvd1Jlc2l6ZS5iaW5kKHRoaXMpKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5vbktleURvd24uYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLm9uS2V5VXAuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5vbk1vdXNlTW92ZS5iaW5kKHRoaXMpKTsgLy8gRm9yIG1vdXNlIGxvb2tcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRm9yIHBvaW50ZXIgbG9jayBzdGF0dXNcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3pwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRmlyZWZveCBjb21wYXRpYmlsaXR5XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0cG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7IC8vIFdlYmtpdCBjb21wYXRpYmlsaXR5XHJcblxyXG4gICAgICAgIC8vIDYuIENyZWF0ZSBnYW1lIG9iamVjdHMgKHBsYXllciwgZ3JvdW5kKSBhbmQgbGlnaHRpbmdcclxuICAgICAgICB0aGlzLmNyZWF0ZUdyb3VuZCgpO1xyXG4gICAgICAgIHRoaXMuY3JlYXRlUGxheWVyKCk7XHJcbiAgICAgICAgdGhpcy5zZXR1cExpZ2h0aW5nKCk7XHJcblxyXG4gICAgICAgIC8vIDcuIFNldHVwIHRoZSB0aXRsZSBzY3JlZW4gVUlcclxuICAgICAgICB0aGlzLnNldHVwVGl0bGVTY3JlZW4oKTtcclxuXHJcbiAgICAgICAgLy8gU3RhcnQgdGhlIG1haW4gZ2FtZSBsb29wXHJcbiAgICAgICAgdGhpcy5hbmltYXRlKDApOyAvLyBQYXNzIGluaXRpYWwgdGltZSAwXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBMb2FkcyBhbGwgdGV4dHVyZXMgYW5kIHNvdW5kcyBkZWZpbmVkIGluIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEFzc2V0cygpIHtcclxuICAgICAgICBjb25zdCB0ZXh0dXJlTG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKTtcclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5tYXAoaW1nID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIHRleHR1cmVMb2FkZXIubG9hZEFzeW5jKGltZy5wYXRoKVxyXG4gICAgICAgICAgICAgICAgLnRoZW4odGV4dHVyZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlcy5zZXQoaW1nLm5hbWUsIHRleHR1cmUpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmUud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZzsgLy8gUmVwZWF0IHRleHR1cmUgaG9yaXpvbnRhbGx5XHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nOyAvLyBSZXBlYXQgdGV4dHVyZSB2ZXJ0aWNhbGx5XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQWRqdXN0IHRleHR1cmUgcmVwZXRpdGlvbiBmb3IgdGhlIGdyb3VuZCB0byBhdm9pZCBzdHJldGNoaW5nXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGltZy5uYW1lID09PSAnZ3JvdW5kX3RleHR1cmUnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLnJlcGVhdC5zZXQodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyA1LCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDUpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHRleHR1cmU6ICR7aW1nLnBhdGh9YCwgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIENvbnRpbnVlIGV2ZW4gaWYgYW4gYXNzZXQgZmFpbHMgdG8gbG9hZDsgZmFsbGJhY2tzIChzb2xpZCBjb2xvcnMpIGFyZSB1c2VkLlxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLm1hcChzb3VuZCA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc291bmQucGF0aCk7XHJcbiAgICAgICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzb3VuZC52b2x1bWU7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5sb29wID0gKHNvdW5kLm5hbWUgPT09ICdiYWNrZ3JvdW5kX211c2ljJyk7IC8vIExvb3AgYmFja2dyb3VuZCBtdXNpY1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5zZXQoc291bmQubmFtZSwgYXVkaW8pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NvdW5kLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGV2ZW4gb24gZXJyb3IgdG8gbm90IGJsb2NrIFByb21pc2UuYWxsXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgQXNzZXRzIGxvYWRlZDogJHt0aGlzLnRleHR1cmVzLnNpemV9IHRleHR1cmVzLCAke3RoaXMuc291bmRzLnNpemV9IHNvdW5kcy5gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYW5kIGRpc3BsYXlzIHRoZSB0aXRsZSBzY3JlZW4gVUkgZHluYW1pY2FsbHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc2V0dXBUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuc3R5bGUsIHtcclxuICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsIHRvcDogJzAnLCBsZWZ0OiAnMCcsXHJcbiAgICAgICAgICAgIHdpZHRoOiAnMTAwJScsIGhlaWdodDogJzEwMCUnLFxyXG4gICAgICAgICAgICBiYWNrZ3JvdW5kQ29sb3I6ICdyZ2JhKDAsIDAsIDAsIDAuOCknLFxyXG4gICAgICAgICAgICBkaXNwbGF5OiAnZmxleCcsIGZsZXhEaXJlY3Rpb246ICdjb2x1bW4nLFxyXG4gICAgICAgICAgICBqdXN0aWZ5Q29udGVudDogJ2NlbnRlcicsIGFsaWduSXRlbXM6ICdjZW50ZXInLFxyXG4gICAgICAgICAgICBjb2xvcjogJ3doaXRlJywgZm9udEZhbWlseTogJ0FyaWFsLCBzYW5zLXNlcmlmJyxcclxuICAgICAgICAgICAgZm9udFNpemU6ICc0OHB4JywgdGV4dEFsaWduOiAnY2VudGVyJywgekluZGV4OiAnMTAwMCdcclxuICAgICAgICB9KTtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KTtcclxuXHJcbiAgICAgICAgdGhpcy50aXRsZVRleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLnRpdGxlVGV4dC50ZXh0Q29udGVudCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy50aXRsZVNjcmVlblRleHQ7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuYXBwZW5kQ2hpbGQodGhpcy50aXRsZVRleHQpO1xyXG5cclxuICAgICAgICB0aGlzLnByb21wdFRleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLnByb21wdFRleHQudGV4dENvbnRlbnQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc3RhcnRHYW1lUHJvbXB0O1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5wcm9tcHRUZXh0LnN0eWxlLCB7XHJcbiAgICAgICAgICAgIG1hcmdpblRvcDogJzIwcHgnLCBmb250U2l6ZTogJzI0cHgnXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuYXBwZW5kQ2hpbGQodGhpcy5wcm9tcHRUZXh0KTtcclxuXHJcbiAgICAgICAgLy8gQWRkIGV2ZW50IGxpc3RlbmVyIGRpcmVjdGx5IHRvIHRoZSBvdmVybGF5IHRvIGNhcHR1cmUgY2xpY2tzIGFuZCBzdGFydCB0aGUgZ2FtZVxyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5zdGFydEdhbWUoKSk7XHJcblxyXG4gICAgICAgIC8vIEF0dGVtcHQgdG8gcGxheSBiYWNrZ3JvdW5kIG11c2ljLiBJdCBtaWdodCBiZSBibG9ja2VkIGJ5IGJyb3dzZXJzIGlmIG5vIHVzZXIgZ2VzdHVyZSBoYXMgb2NjdXJyZWQgeWV0LlxyXG4gICAgICAgIHRoaXMuc291bmRzLmdldCgnYmFja2dyb3VuZF9tdXNpYycpPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIkJHTSBwbGF5IGRlbmllZCAocmVxdWlyZXMgdXNlciBnZXN0dXJlKTpcIiwgZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVHJhbnNpdGlvbnMgdGhlIGdhbWUgZnJvbSB0aGUgdGl0bGUgc2NyZWVuIHRvIHRoZSBwbGF5aW5nIHN0YXRlLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXJ0R2FtZSgpIHtcclxuICAgICAgICB0aGlzLnN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICAgICAgLy8gUmVtb3ZlIHRoZSB0aXRsZSBzY3JlZW4gb3ZlcmxheVxyXG4gICAgICAgIGlmICh0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSAmJiB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5wYXJlbnROb2RlKSB7XHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBBZGQgZXZlbnQgbGlzdGVuZXIgdG8gY2FudmFzIGZvciByZS1sb2NraW5nIHBvaW50ZXIgYWZ0ZXIgdGl0bGUgc2NyZWVuIGlzIGdvbmVcclxuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuaGFuZGxlQ2FudmFzUmVMb2NrUG9pbnRlci5iaW5kKHRoaXMpKTtcclxuXHJcbiAgICAgICAgLy8gUmVxdWVzdCBwb2ludGVyIGxvY2sgZm9yIGltbWVyc2l2ZSBtb3VzZSBjb250cm9sXHJcbiAgICAgICAgdGhpcy5jYW52YXMucmVxdWVzdFBvaW50ZXJMb2NrKCk7XHJcbiAgICAgICAgLy8gRW5zdXJlIGJhY2tncm91bmQgbXVzaWMgcGxheXMgbm93IHRoYXQgYSB1c2VyIGdlc3R1cmUgaGFzIG9jY3VycmVkXHJcbiAgICAgICAgdGhpcy5zb3VuZHMuZ2V0KCdiYWNrZ3JvdW5kX211c2ljJyk/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiQkdNIHBsYXkgZmFpbGVkIGFmdGVyIHVzZXIgZ2VzdHVyZTpcIiwgZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyBjbGlja3Mgb24gdGhlIGNhbnZhcyB0byByZS1sb2NrIHRoZSBwb2ludGVyIGlmIHRoZSBnYW1lIGlzIHBsYXlpbmcgYW5kIHVubG9ja2VkLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGhhbmRsZUNhbnZhc1JlTG9ja1BvaW50ZXIoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmICF0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy5yZXF1ZXN0UG9pbnRlckxvY2soKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIHRoZSBwbGF5ZXIncyB2aXN1YWwgbWVzaCBhbmQgcGh5c2ljcyBib2R5LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNyZWF0ZVBsYXllcigpIHtcclxuICAgICAgICAvLyBQbGF5ZXIgdmlzdWFsIG1lc2ggKGEgc2ltcGxlIGJveClcclxuICAgICAgICBjb25zdCBwbGF5ZXJUZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQoJ3BsYXllcl90ZXh0dXJlJyk7XHJcbiAgICAgICAgY29uc3QgcGxheWVyTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogcGxheWVyVGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3I6IHBsYXllclRleHR1cmUgPyAweGZmZmZmZiA6IDB4MDA3N2ZmIC8vIFVzZSB3aGl0ZSB3aXRoIHRleHR1cmUsIG9yIGJsdWUgaWYgbm8gdGV4dHVyZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IHBsYXllckdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KDEsIDIsIDEpOyAvLyBQbGF5ZXIgZGltZW5zaW9uc1xyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaCA9IG5ldyBUSFJFRS5NZXNoKHBsYXllckdlb21ldHJ5LCBwbGF5ZXJNYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLnkgPSA1OyAvLyBTdGFydCBwbGF5ZXIgc2xpZ2h0bHkgYWJvdmUgdGhlIGdyb3VuZFxyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTsgLy8gUGxheWVyIGNhc3RzIGEgc2hhZG93XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5wbGF5ZXJNZXNoKTtcclxuXHJcbiAgICAgICAgLy8gUGxheWVyIHBoeXNpY3MgYm9keSAoQ2Fubm9uLmpzIGJveCBzaGFwZSlcclxuICAgICAgICBjb25zdCBwbGF5ZXJTaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMygwLjUsIDEsIDAuNSkpOyAvLyBIYWxmIGV4dGVudHMgb2YgdGhlIGJveCBmb3IgY29sbGlzaW9uXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllck1hc3MsIC8vIFBsYXllcidzIG1hc3NcclxuICAgICAgICAgICAgcG9zaXRpb246IG5ldyBDQU5OT04uVmVjMyh0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueCwgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLnksIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi56KSxcclxuICAgICAgICAgICAgc2hhcGU6IHBsYXllclNoYXBlLFxyXG4gICAgICAgICAgICBmaXhlZFJvdGF0aW9uOiB0cnVlIC8vIFByZXZlbnQgdGhlIHBsYXllciBmcm9tIGZhbGxpbmcgb3ZlciAoc2ltdWxhdGVzIGEgY2Fwc3VsZS9jeWxpbmRlciBjaGFyYWN0ZXIpXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KHRoaXMucGxheWVyQm9keSk7XHJcblxyXG4gICAgICAgIC8vIFNldCBpbml0aWFsIGNhbWVyYSBwb3NpdGlvbiByZWxhdGl2ZSB0byBwbGF5ZXIncyBwaHlzaWNzIGJvZHkuXHJcbiAgICAgICAgLy8gSXQgd2lsbCBiZSBjb250aW51b3VzbHkgdXBkYXRlZCBpbiB0aGUgYW5pbWF0ZSBsb29wLlxyXG4gICAgICAgIHRoaXMuY2FtZXJhLnBvc2l0aW9uLnNldChcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLngsXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi55ICsgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbWVyYUhlaWdodE9mZnNldCxcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnpcclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyB0aGUgZ3JvdW5kJ3MgdmlzdWFsIG1lc2ggYW5kIHBoeXNpY3MgYm9keS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVHcm91bmQoKSB7XHJcbiAgICAgICAgLy8gR3JvdW5kIHZpc3VhbCBtZXNoIChhIGxhcmdlIHBsYW5lKVxyXG4gICAgICAgIGNvbnN0IGdyb3VuZFRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgnZ3JvdW5kX3RleHR1cmUnKTtcclxuICAgICAgICBjb25zdCBncm91bmRNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgbWFwOiBncm91bmRUZXh0dXJlLFxyXG4gICAgICAgICAgICBjb2xvcjogZ3JvdW5kVGV4dHVyZSA/IDB4ZmZmZmZmIDogMHg4ODg4ODggLy8gVXNlIHdoaXRlIHdpdGggdGV4dHVyZSwgb3IgZ3JleSBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kR2VvbWV0cnkgPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeSh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdyb3VuZEdlb21ldHJ5LCBncm91bmRNYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRNZXNoLnJvdGF0aW9uLnggPSAtTWF0aC5QSSAvIDI7IC8vIFJvdGF0ZSB0byBsYXkgZmxhdCBvbiB0aGUgWFogcGxhbmVcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7IC8vIEdyb3VuZCByZWNlaXZlcyBzaGFkb3dzXHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5ncm91bmRNZXNoKTtcclxuXHJcbiAgICAgICAgLy8gR3JvdW5kIHBoeXNpY3MgYm9keSAoQ2Fubm9uLmpzIHBsYW5lIHNoYXBlKVxyXG4gICAgICAgIGNvbnN0IGdyb3VuZFNoYXBlID0gbmV3IENBTk5PTi5QbGFuZSgpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IDAsIC8vIEEgbWFzcyBvZiAwIG1ha2VzIGl0IGEgc3RhdGljIChpbW1vdmFibGUpIGJvZHlcclxuICAgICAgICAgICAgc2hhcGU6IGdyb3VuZFNoYXBlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgLy8gUm90YXRlIHRoZSBDYW5ub24uanMgcGxhbmUgYm9keSB0byBtYXRjaCB0aGUgVGhyZWUuanMgcGxhbmUgb3JpZW50YXRpb24gKGZsYXQpXHJcbiAgICAgICAgdGhpcy5ncm91bmRCb2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShuZXcgQ0FOTk9OLlZlYzMoMSwgMCwgMCksIC1NYXRoLlBJIC8gMik7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KHRoaXMuZ3JvdW5kQm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHVwIGFtYmllbnQgYW5kIGRpcmVjdGlvbmFsIGxpZ2h0aW5nIGluIHRoZSBzY2VuZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzZXR1cExpZ2h0aW5nKCkge1xyXG4gICAgICAgIGNvbnN0IGFtYmllbnRMaWdodCA9IG5ldyBUSFJFRS5BbWJpZW50TGlnaHQoMHg0MDQwNDAsIDEuMCk7IC8vIFNvZnQgd2hpdGUgYW1iaWVudCBsaWdodFxyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGFtYmllbnRMaWdodCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGRpcmVjdGlvbmFsTGlnaHQgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCgweGZmZmZmZiwgMC44KTsgLy8gQnJpZ2h0ZXIgZGlyZWN0aW9uYWwgbGlnaHRcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnBvc2l0aW9uLnNldCg1LCAxMCwgNSk7IC8vIFBvc2l0aW9uIHRoZSBsaWdodCBzb3VyY2VcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LmNhc3RTaGFkb3cgPSB0cnVlOyAvLyBFbmFibGUgc2hhZG93cyBmcm9tIHRoaXMgbGlnaHQgc291cmNlXHJcbiAgICAgICAgLy8gQ29uZmlndXJlIHNoYWRvdyBwcm9wZXJ0aWVzIGZvciB0aGUgZGlyZWN0aW9uYWwgbGlnaHRcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5tYXBTaXplLndpZHRoID0gMTAyNDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5tYXBTaXplLmhlaWdodCA9IDEwMjQ7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLm5lYXIgPSAwLjU7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmZhciA9IDUwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5sZWZ0ID0gLTEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5yaWdodCA9IDEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS50b3AgPSAxMDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEuYm90dG9tID0gLTEwO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGRpcmVjdGlvbmFsTGlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyB3aW5kb3cgcmVzaXppbmcgdG8ga2VlcCB0aGUgY2FtZXJhIGFzcGVjdCByYXRpbyBhbmQgcmVuZGVyZXIgc2l6ZSBjb3JyZWN0LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uV2luZG93UmVzaXplKCkge1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmFzcGVjdCA9IHdpbmRvdy5pbm5lcldpZHRoIC8gd2luZG93LmlubmVySGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWNvcmRzIHdoaWNoIGtleXMgYXJlIGN1cnJlbnRseSBwcmVzc2VkIGRvd24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25LZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmtleS50b0xvd2VyQ2FzZSgpXSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWNvcmRzIHdoaWNoIGtleXMgYXJlIGN1cnJlbnRseSByZWxlYXNlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbktleVVwKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmtleS50b0xvd2VyQ2FzZSgpXSA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyBtb3VzZSBtb3ZlbWVudCBmb3IgY2FtZXJhIHJvdGF0aW9uIChtb3VzZSBsb29rKS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbk1vdXNlTW92ZShldmVudDogTW91c2VFdmVudCkge1xyXG4gICAgICAgIC8vIE9ubHkgcHJvY2VzcyBtb3VzZSBtb3ZlbWVudCBpZiB0aGUgZ2FtZSBpcyBwbGF5aW5nIGFuZCBwb2ludGVyIGlzIGxvY2tlZFxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiB0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICBjb25zdCBtb3ZlbWVudFggPSBldmVudC5tb3ZlbWVudFggfHwgMDtcclxuICAgICAgICAgICAgY29uc3QgbW92ZW1lbnRZID0gZXZlbnQubW92ZW1lbnRZIHx8IDA7XHJcblxyXG4gICAgICAgICAgICAvLyBBcHBseSBob3Jpem9udGFsIHJvdGF0aW9uICh5YXcpIHRvIHRoZSBjYW1lcmEgYXJvdW5kIGl0cyBsb2NhbCBZLWF4aXNcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmEucm90YXRpb24ueSAtPSBtb3ZlbWVudFggKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubW91c2VTZW5zaXRpdml0eTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFwcGx5IHZlcnRpY2FsIHJvdGF0aW9uIChwaXRjaCkgYW5kIGNsYW1wIGl0IHRvIHByZXZlbnQgdGhlIGNhbWVyYSBmcm9tIGZsaXBwaW5nIG92ZXJcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFQaXRjaCAtPSBtb3ZlbWVudFkgKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubW91c2VTZW5zaXRpdml0eTtcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFQaXRjaCA9IE1hdGgubWF4KC1NYXRoLlBJIC8gMiwgTWF0aC5taW4oTWF0aC5QSSAvIDIsIHRoaXMuY2FtZXJhUGl0Y2gpKTsgLy8gQ2xhbXAgdG8gLTkwIHRvICs5MCBkZWdyZWVzXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnJvdGF0aW9uLnggPSB0aGlzLmNhbWVyYVBpdGNoO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgdGhlIHBvaW50ZXIgbG9jayBzdGF0dXMgd2hlbiBpdCBjaGFuZ2VzIChlLmcuLCB1c2VyIHByZXNzZXMgRXNjKS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvblBvaW50ZXJMb2NrQ2hhbmdlKCkge1xyXG4gICAgICAgIGlmIChkb2N1bWVudC5wb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMuY2FudmFzIHx8XHJcbiAgICAgICAgICAgIChkb2N1bWVudCBhcyBhbnkpLm1velBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXMgfHxcclxuICAgICAgICAgICAgKGRvY3VtZW50IGFzIGFueSkud2Via2l0UG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLmNhbnZhcykge1xyXG4gICAgICAgICAgICB0aGlzLmlzUG9pbnRlckxvY2tlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdQb2ludGVyIGxvY2tlZCcpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNQb2ludGVyTG9ja2VkID0gZmFsc2U7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdQb2ludGVyIHVubG9ja2VkJyk7XHJcbiAgICAgICAgICAgIC8vIFdoZW4gcG9pbnRlciBpcyB1bmxvY2tlZCBieSB1c2VyIChlLmcuLCBwcmVzc2luZyBFc2MpLCBjdXJzb3IgYXBwZWFycyBhdXRvbWF0aWNhbGx5LlxyXG4gICAgICAgICAgICAvLyBNb3VzZSBsb29rIHN0b3BzIGR1ZSB0byBgaXNQb2ludGVyTG9ja2VkYCBjaGVjayBpbiBvbk1vdXNlTW92ZS5cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUaGUgbWFpbiBnYW1lIGxvb3AsIGNhbGxlZCBvbiBldmVyeSBhbmltYXRpb24gZnJhbWUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYW5pbWF0ZSh0aW1lOiBET01IaWdoUmVzVGltZVN0YW1wKSB7XHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuYW5pbWF0ZS5iaW5kKHRoaXMpKTsgLy8gUmVxdWVzdCBuZXh0IGZyYW1lXHJcblxyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9ICh0aW1lIC0gdGhpcy5sYXN0VGltZSkgLyAxMDAwOyAvLyBDYWxjdWxhdGUgZGVsdGEgdGltZSBpbiBzZWNvbmRzXHJcbiAgICAgICAgdGhpcy5sYXN0VGltZSA9IHRpbWU7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVBsYXllck1vdmVtZW50KCk7IC8vIFVwZGF0ZSBwbGF5ZXIncyB2ZWxvY2l0eSBiYXNlZCBvbiBpbnB1dFxyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVBoeXNpY3MoZGVsdGFUaW1lKTsgLy8gU3RlcCB0aGUgcGh5c2ljcyB3b3JsZFxyXG4gICAgICAgICAgICB0aGlzLnN5bmNNZXNoZXNXaXRoQm9kaWVzKCk7IC8vIFN5bmNocm9uaXplIHZpc3VhbCBtZXNoZXMgd2l0aCBwaHlzaWNzIGJvZGllc1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIodGhpcy5zY2VuZSwgdGhpcy5jYW1lcmEpOyAvLyBSZW5kZXIgdGhlIHNjZW5lXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTdGVwcyB0aGUgQ2Fubm9uLmpzIHBoeXNpY3Mgd29ybGQgZm9yd2FyZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVQaHlzaWNzKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgLy8gd29ybGQuc3RlcChmaXhlZFRpbWVTdGVwLCBkZWx0YVRpbWUsIG1heFN1YlN0ZXBzKVxyXG4gICAgICAgIC8vIDEvNjA6IEEgZml4ZWQgdGltZSBzdGVwIG9mIDYwIHBoeXNpY3MgdXBkYXRlcyBwZXIgc2Vjb25kIChzdGFuZGFyZCkuXHJcbiAgICAgICAgLy8gZGVsdGFUaW1lOiBUaGUgYWN0dWFsIHRpbWUgZWxhcHNlZCBzaW5jZSB0aGUgbGFzdCByZW5kZXIgZnJhbWUuXHJcbiAgICAgICAgLy8gbWF4UGh5c2ljc1N1YlN0ZXBzOiBMaW1pdHMgdGhlIG51bWJlciBvZiBwaHlzaWNzIHN0ZXBzIGluIG9uZSByZW5kZXIgZnJhbWVcclxuICAgICAgICAvLyB0byBwcmV2ZW50IGluc3RhYmlsaXRpZXMgaWYgcmVuZGVyaW5nIHNsb3dzIGRvd24gc2lnbmlmaWNhbnRseS5cclxuICAgICAgICB0aGlzLndvcmxkLnN0ZXAoMSAvIDYwLCBkZWx0YVRpbWUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5tYXhQaHlzaWNzU3ViU3RlcHMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXBkYXRlcyB0aGUgcGxheWVyJ3MgdmVsb2NpdHkgYmFzZWQgb24gV0FTRCBpbnB1dCBhbmQgY2FtZXJhIG9yaWVudGF0aW9uLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZVBsYXllck1vdmVtZW50KCkge1xyXG4gICAgICAgIC8vIFBsYXllciBtb3ZlbWVudCBzaG91bGQgb25seSBoYXBwZW4gd2hlbiB0aGUgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgICAgICBpZiAoIXRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIC8vIElmIHBvaW50ZXIgaXMgbm90IGxvY2tlZCwgc3RvcCBob3Jpem9udGFsIG1vdmVtZW50IGltbWVkaWF0ZWx5XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ID0gMDtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSAwO1xyXG4gICAgICAgICAgICByZXR1cm47IC8vIEV4aXQgZWFybHkgYXMgbm8gbW92ZW1lbnQgaW5wdXQgc2hvdWxkIGJlIHByb2Nlc3NlZFxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgcGxheWVyU3BlZWQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyU3BlZWQ7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFZlbG9jaXR5ID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5O1xyXG4gICAgICAgIGNvbnN0IGRlc2lyZWRIb3Jpem9udGFsVmVsb2NpdHkgPSBuZXcgQ0FOTk9OLlZlYzMoMCwgMCwgMCk7XHJcblxyXG4gICAgICAgIC8vIEdldCBjYW1lcmEncyBmb3J3YXJkIGFuZCByaWdodCB2ZWN0b3JzIHRvIGRldGVybWluZSBtb3ZlbWVudCBkaXJlY3Rpb24gcmVsYXRpdmUgdG8gdmlld1xyXG4gICAgICAgIGNvbnN0IGNhbWVyYURpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuZ2V0V29ybGREaXJlY3Rpb24oY2FtZXJhRGlyZWN0aW9uKTtcclxuICAgICAgICBjYW1lcmFEaXJlY3Rpb24ueSA9IDA7IC8vIEZsYXR0ZW4gdGhlIHZlY3RvciB0byByZXN0cmljdCBtb3ZlbWVudCB0byB0aGUgaG9yaXpvbnRhbCBwbGFuZVxyXG4gICAgICAgIGNhbWVyYURpcmVjdGlvbi5ub3JtYWxpemUoKTtcclxuXHJcbiAgICAgICAgY29uc3QgY2FtZXJhUmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIGNhbWVyYVJpZ2h0LmNyb3NzVmVjdG9ycyh0aGlzLmNhbWVyYS51cCwgY2FtZXJhRGlyZWN0aW9uKTsgLy8gQ2FsY3VsYXRlIHRoZSByaWdodCB2ZWN0b3JcclxuICAgICAgICBjYW1lcmFSaWdodC5ub3JtYWxpemUoKTtcclxuXHJcbiAgICAgICAgbGV0IG1vdmluZyA9IGZhbHNlO1xyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ3cnXSkgeyAvLyBGb3J3YXJkXHJcbiAgICAgICAgICAgIGRlc2lyZWRIb3Jpem9udGFsVmVsb2NpdHkueCArPSBjYW1lcmFEaXJlY3Rpb24ueDtcclxuICAgICAgICAgICAgZGVzaXJlZEhvcml6b250YWxWZWxvY2l0eS56ICs9IGNhbWVyYURpcmVjdGlvbi56O1xyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5rZXlzWydzJ10pIHsgLy8gQmFja3dhcmRcclxuICAgICAgICAgICAgZGVzaXJlZEhvcml6b250YWxWZWxvY2l0eS54IC09IGNhbWVyYURpcmVjdGlvbi54O1xyXG4gICAgICAgICAgICBkZXNpcmVkSG9yaXpvbnRhbFZlbG9jaXR5LnogLT0gY2FtZXJhRGlyZWN0aW9uLno7XHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ2EnXSkgeyAvLyBTdHJhZmUgbGVmdFxyXG4gICAgICAgICAgICBkZXNpcmVkSG9yaXpvbnRhbFZlbG9jaXR5LnggLT0gY2FtZXJhUmlnaHQueDtcclxuICAgICAgICAgICAgZGVzaXJlZEhvcml6b250YWxWZWxvY2l0eS56IC09IGNhbWVyYVJpZ2h0Lno7XHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ2QnXSkgeyAvLyBTdHJhZmUgcmlnaHRcclxuICAgICAgICAgICAgZGVzaXJlZEhvcml6b250YWxWZWxvY2l0eS54ICs9IGNhbWVyYVJpZ2h0Lng7XHJcbiAgICAgICAgICAgIGRlc2lyZWRIb3Jpem9udGFsVmVsb2NpdHkueiArPSBjYW1lcmFSaWdodC56O1xyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKG1vdmluZykge1xyXG4gICAgICAgICAgICAvLyBOb3JtYWxpemUgdGhlIGNvbWJpbmVkIGRpcmVjdGlvbiB2ZWN0b3IgYW5kIHNjYWxlIGJ5IHBsYXllciBzcGVlZFxyXG4gICAgICAgICAgICBkZXNpcmVkSG9yaXpvbnRhbFZlbG9jaXR5Lm5vcm1hbGl6ZSgpO1xyXG4gICAgICAgICAgICBkZXNpcmVkSG9yaXpvbnRhbFZlbG9jaXR5LnggKj0gcGxheWVyU3BlZWQ7XHJcbiAgICAgICAgICAgIGRlc2lyZWRIb3Jpem9udGFsVmVsb2NpdHkueiAqPSBwbGF5ZXJTcGVlZDtcclxuXHJcbiAgICAgICAgICAgIC8vIFNtb290aGx5IGFjY2VsZXJhdGUgcGxheWVyJ3MgaG9yaXpvbnRhbCB2ZWxvY2l0eSB0b3dhcmRzIHRoZSBkZXNpcmVkIHZlbG9jaXR5XHJcbiAgICAgICAgICAgIGNvbnN0IGFjY2VsZXJhdGlvbkZhY3RvciA9IDAuMjsgLy8gQWRqdXN0IGZvciBkZXNpcmVkIGFjY2VsZXJhdGlvbiBmZWVsXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ID0gY3VycmVudFZlbG9jaXR5LnggKyAoZGVzaXJlZEhvcml6b250YWxWZWxvY2l0eS54IC0gY3VycmVudFZlbG9jaXR5LngpICogYWNjZWxlcmF0aW9uRmFjdG9yO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiA9IGN1cnJlbnRWZWxvY2l0eS56ICsgKGRlc2lyZWRIb3Jpem9udGFsVmVsb2NpdHkueiAtIGN1cnJlbnRWZWxvY2l0eS56KSAqIGFjY2VsZXJhdGlvbkZhY3RvcjtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBJZiBubyBtb3ZlbWVudCBrZXlzIGFyZSBwcmVzc2VkLCBhcHBseSBob3Jpem9udGFsIGZyaWN0aW9uIHRvIHNtb290aGx5IGRlY2VsZXJhdGVcclxuICAgICAgICAgICAgY29uc3QgZnJpY3Rpb25GYWN0b3IgPSAwLjg7IC8vIEFkanVzdCBmb3IgZGVzaXJlZCBkZWNlbGVyYXRpb24gZmVlbCAoZS5nLiwgMC45IGZvciBzbG93LCAwLjUgZm9yIGZhc3QpXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ICo9IGZyaWN0aW9uRmFjdG9yO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiAqPSBmcmljdGlvbkZhY3RvcjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSBjYW1lcmEgcG9zaXRpb24gdG8gZm9sbG93IHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHksIGFkZGluZyBhbiBleWUtbGV2ZWwgb2Zmc2V0XHJcbiAgICAgICAgdGhpcy5jYW1lcmEucG9zaXRpb24uY29weSh0aGlzLnBsYXllckJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5wb3NpdGlvbi55ICs9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFIZWlnaHRPZmZzZXQ7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTeW5jaHJvbml6ZXMgdGhlIHZpc3VhbCBtZXNoZXMgd2l0aCB0aGVpciBjb3JyZXNwb25kaW5nIHBoeXNpY3MgYm9kaWVzLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN5bmNNZXNoZXNXaXRoQm9kaWVzKCkge1xyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIHBsYXllcidzIHZpc3VhbCBtZXNoIHBvc2l0aW9uIHdpdGggaXRzIHBoeXNpY3MgYm9keSdzIHBvc2l0aW9uXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgLy8gUGxheWVyIGJvZHkgaGFzIGZpeGVkIHJvdGF0aW9uLCBzbyBpdHMgcm90YXRpb24gZG9lcyBub3QgbmVlZCB0byBiZSBjb3BpZWQuXHJcbiAgICAgICAgLy8gSWYgdGhlIHBsYXllciBjb3VsZCByb3RhdGUgKGUuZy4sIGZyb20gaW1wYWN0cyksIGl0cyBxdWF0ZXJuaW9uIHdvdWxkIGFsc28gYmUgY29waWVkIGhlcmU6XHJcbiAgICAgICAgLy8gdGhpcy5wbGF5ZXJNZXNoLnF1YXRlcm5pb24uY29weSh0aGlzLnBsYXllckJvZHkucXVhdGVybmlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlF1YXRlcm5pb24pO1xyXG5cclxuICAgICAgICAvLyBUaGUgZ3JvdW5kIGlzIHN0YXRpYywgc28gaXRzIHBvc2l0aW9uIGFuZCByb3RhdGlvbiBkbyBub3QgY2hhbmdlIGFmdGVyIGluaXRpYWwgc2V0dXAuXHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIFN0YXJ0IHRoZSBnYW1lIHdoZW4gdGhlIERPTSBjb250ZW50IGlzIGZ1bGx5IGxvYWRlZFxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xyXG4gICAgbmV3IEdhbWUoKTtcclxufSk7Il0sCiAgIm1hcHBpbmdzIjogIkFBQ0EsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksWUFBWTtBQUd4QixJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBRkMsU0FBQUE7QUFBQSxHQUFBO0FBNkJMLE1BQU0sS0FBSztBQUFBLEVBb0NQLGNBQWM7QUFsQ2Q7QUFBQSxTQUFRLFFBQW1CO0FBa0IzQjtBQUFBLFNBQVEsT0FBbUMsQ0FBQztBQUM1QztBQUFBLFNBQVEsa0JBQTJCO0FBQ25DO0FBQUEsU0FBUSxjQUFzQjtBQUc5QjtBQUFBO0FBQUEsU0FBUSxXQUF1QyxvQkFBSSxJQUFJO0FBQ3ZEO0FBQUEsU0FBUSxTQUF3QyxvQkFBSSxJQUFJO0FBUXhEO0FBQUEsU0FBUSxXQUFnQztBQUlwQyxTQUFLLFNBQVMsU0FBUyxlQUFlLFlBQVk7QUFDbEQsUUFBSSxDQUFDLEtBQUssUUFBUTtBQUNkLGNBQVEsTUFBTSxnREFBZ0Q7QUFDOUQ7QUFBQSxJQUNKO0FBQ0EsU0FBSyxLQUFLO0FBQUEsRUFDZDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsTUFBYyxPQUFPO0FBRWpCLFFBQUk7QUFDQSxZQUFNLFdBQVcsTUFBTSxNQUFNLFdBQVc7QUFDeEMsVUFBSSxDQUFDLFNBQVMsSUFBSTtBQUNkLGNBQU0sSUFBSSxNQUFNLHVCQUF1QixTQUFTLE1BQU0sRUFBRTtBQUFBLE1BQzVEO0FBQ0EsV0FBSyxTQUFTLE1BQU0sU0FBUyxLQUFLO0FBQ2xD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
