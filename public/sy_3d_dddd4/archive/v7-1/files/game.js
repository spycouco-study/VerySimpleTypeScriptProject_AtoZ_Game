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
      desiredHorizontalVelocity.x += cameraRight.x;
      desiredHorizontalVelocity.z += cameraRight.z;
      moving = true;
    }
    if (this.keys["d"]) {
      desiredHorizontalVelocity.x -= cameraRight.x;
      desiredHorizontalVelocity.z -= cameraRight.z;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gSW1wb3J0IFRocmVlLmpzIGFuZCBDYW5ub24tZXMgbGlicmFyaWVzXHJcbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcclxuaW1wb3J0ICogYXMgQ0FOTk9OIGZyb20gJ2Nhbm5vbi1lcyc7XHJcblxyXG4vLyBFbnVtIHRvIGRlZmluZSB0aGUgcG9zc2libGUgc3RhdGVzIG9mIHRoZSBnYW1lXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFLCAgIC8vIFRpdGxlIHNjcmVlbiwgd2FpdGluZyBmb3IgdXNlciBpbnB1dFxyXG4gICAgUExBWUlORyAgLy8gR2FtZSBpcyBhY3RpdmUsIHVzZXIgY2FuIG1vdmUgYW5kIGxvb2sgYXJvdW5kXHJcbn1cclxuXHJcbi8vIEludGVyZmFjZSB0byB0eXBlLWNoZWNrIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHN0YXJ0R2FtZVByb21wdDogc3RyaW5nO1xyXG4gICAgICAgIHBsYXllclNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgbW91c2VTZW5zaXRpdml0eTogbnVtYmVyO1xyXG4gICAgICAgIGNhbWVyYUhlaWdodE9mZnNldDogbnVtYmVyOyAvLyBWZXJ0aWNhbCBvZmZzZXQgb2YgdGhlIGNhbWVyYSBmcm9tIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkgY2VudGVyXHJcbiAgICAgICAgY2FtZXJhTmVhcjogbnVtYmVyOyAgICAgICAgIC8vIE5lYXIgY2xpcHBpbmcgcGxhbmUgZm9yIHRoZSBjYW1lcmFcclxuICAgICAgICBjYW1lcmFGYXI6IG51bWJlcjsgICAgICAgICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lIGZvciB0aGUgY2FtZXJhXHJcbiAgICAgICAgcGxheWVyTWFzczogbnVtYmVyOyAgICAgICAgIC8vIE1hc3Mgb2YgdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keVxyXG4gICAgICAgIGdyb3VuZFNpemU6IG51bWJlcjsgICAgICAgICAvLyBTaXplICh3aWR0aC9kZXB0aCkgb2YgdGhlIHNxdWFyZSBncm91bmQgcGxhbmVcclxuICAgICAgICBtYXhQaHlzaWNzU3ViU3RlcHM6IG51bWJlcjsgLy8gTWF4aW11bSBudW1iZXIgb2YgcGh5c2ljcyBzdWJzdGVwcyBwZXIgZnJhbWUgdG8gbWFpbnRhaW4gc3RhYmlsaXR5XHJcbiAgICB9O1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyIH1bXTtcclxuICAgIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNYWluIEdhbWUgY2xhc3MgcmVzcG9uc2libGUgZm9yIGluaXRpYWxpemluZyBhbmQgcnVubmluZyB0aGUgM0QgZ2FtZS5cclxuICogSXQgaGFuZGxlcyBUaHJlZS5qcyByZW5kZXJpbmcsIENhbm5vbi1lcyBwaHlzaWNzLCBpbnB1dCwgYW5kIGdhbWUgc3RhdGUuXHJcbiAqL1xyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY29uZmlnITogR2FtZUNvbmZpZzsgLy8gR2FtZSBjb25maWd1cmF0aW9uIGxvYWRlZCBmcm9tIGRhdGEuanNvblxyXG4gICAgcHJpdmF0ZSBzdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFOyAvLyBDdXJyZW50IHN0YXRlIG9mIHRoZSBnYW1lXHJcblxyXG4gICAgLy8gVGhyZWUuanMgZWxlbWVudHMgZm9yIHJlbmRlcmluZ1xyXG4gICAgcHJpdmF0ZSBzY2VuZSE6IFRIUkVFLlNjZW5lO1xyXG4gICAgcHJpdmF0ZSBjYW1lcmEhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYTtcclxuICAgIHByaXZhdGUgcmVuZGVyZXIhOiBUSFJFRS5XZWJHTFJlbmRlcmVyO1xyXG4gICAgcHJpdmF0ZSBjYW52YXMhOiBIVE1MQ2FudmFzRWxlbWVudDsgLy8gVGhlIEhUTUwgY2FudmFzIGVsZW1lbnQgZm9yIHJlbmRlcmluZ1xyXG5cclxuICAgIC8vIENhbm5vbi1lcyBlbGVtZW50cyBmb3IgcGh5c2ljc1xyXG4gICAgcHJpdmF0ZSB3b3JsZCE6IENBTk5PTi5Xb3JsZDtcclxuICAgIHByaXZhdGUgcGxheWVyQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBwbGF5ZXJcclxuICAgIHByaXZhdGUgZ3JvdW5kQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBncm91bmRcclxuXHJcbiAgICAvLyBWaXN1YWwgbWVzaGVzIChUaHJlZS5qcykgZm9yIGdhbWUgb2JqZWN0c1xyXG4gICAgcHJpdmF0ZSBwbGF5ZXJNZXNoITogVEhSRUUuTWVzaDtcclxuICAgIHByaXZhdGUgZ3JvdW5kTWVzaCE6IFRIUkVFLk1lc2g7XHJcblxyXG4gICAgLy8gSW5wdXQgaGFuZGxpbmcgc3RhdGVcclxuICAgIHByaXZhdGUga2V5czogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0gPSB7fTsgLy8gVHJhY2tzIGN1cnJlbnRseSBwcmVzc2VkIGtleXNcclxuICAgIHByaXZhdGUgaXNQb2ludGVyTG9ja2VkOiBib29sZWFuID0gZmFsc2U7IC8vIFRydWUgaWYgbW91c2UgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgIHByaXZhdGUgY2FtZXJhUGl0Y2g6IG51bWJlciA9IDA7IC8vIFZlcnRpY2FsIHJvdGF0aW9uIChwaXRjaCkgb2YgdGhlIGNhbWVyYVxyXG5cclxuICAgIC8vIEFzc2V0IG1hbmFnZW1lbnRcclxuICAgIHByaXZhdGUgdGV4dHVyZXM6IE1hcDxzdHJpbmcsIFRIUkVFLlRleHR1cmU+ID0gbmV3IE1hcCgpOyAvLyBTdG9yZXMgbG9hZGVkIHRleHR1cmVzXHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7IC8vIFN0b3JlcyBsb2FkZWQgYXVkaW8gZWxlbWVudHNcclxuXHJcbiAgICAvLyBVSSBlbGVtZW50cyAoZHluYW1pY2FsbHkgY3JlYXRlZCBmb3IgdGhlIHRpdGxlIHNjcmVlbilcclxuICAgIHByaXZhdGUgdGl0bGVTY3JlZW5PdmVybGF5ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHRpdGxlVGV4dCE6IEhUTUxEaXZFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBwcm9tcHRUZXh0ITogSFRNTERpdkVsZW1lbnQ7XHJcblxyXG4gICAgLy8gRm9yIGNhbGN1bGF0aW5nIGRlbHRhIHRpbWUgYmV0d2VlbiBmcmFtZXNcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXAgPSAwO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgICAgIC8vIEdldCB0aGUgY2FudmFzIGVsZW1lbnQgZnJvbSBpbmRleC5odG1sXHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZUNhbnZhcycpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCBcImdhbWVDYW52YXNcIiBub3QgZm91bmQhJyk7XHJcbiAgICAgICAgICAgIHJldHVybjsgLy8gQ2Fubm90IHByb2NlZWQgd2l0aG91dCBhIGNhbnZhc1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmluaXQoKTsgLy8gU3RhcnQgdGhlIGFzeW5jaHJvbm91cyBpbml0aWFsaXphdGlvbiBwcm9jZXNzXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBc3luY2hyb25vdXNseSBpbml0aWFsaXplcyB0aGUgZ2FtZSwgbG9hZGluZyBjb25maWcsIGFzc2V0cywgYW5kIHNldHRpbmcgdXAgc3lzdGVtcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhc3luYyBpbml0KCkge1xyXG4gICAgICAgIC8vIDEuIExvYWQgZ2FtZSBjb25maWd1cmF0aW9uIGZyb20gZGF0YS5qc29uXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCBlcnJvciEgc3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ0dhbWUgY29uZmlndXJhdGlvbiBsb2FkZWQ6JywgdGhpcy5jb25maWcpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbjonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIC8vIElmIGNvbmZpZ3VyYXRpb24gZmFpbHMgdG8gbG9hZCwgZGlzcGxheSBhbiBlcnJvciBtZXNzYWdlIGFuZCBzdG9wLlxyXG4gICAgICAgICAgICBjb25zdCBlcnJvckRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRvcCA9ICc1MCUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5sZWZ0ID0gJzUwJSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRyYW5zZm9ybSA9ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5jb2xvciA9ICdyZWQnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5mb250U2l6ZSA9ICcyNHB4JztcclxuICAgICAgICAgICAgZXJyb3JEaXYudGV4dENvbnRlbnQgPSAnRXJyb3I6IEZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbi4gQ2hlY2sgY29uc29sZSBmb3IgZGV0YWlscy4nO1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVycm9yRGl2KTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gMi4gSW5pdGlhbGl6ZSBUaHJlZS5qcyAoc2NlbmUsIGNhbWVyYSwgcmVuZGVyZXIpXHJcbiAgICAgICAgdGhpcy5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKFxyXG4gICAgICAgICAgICA3NSwgLy8gRmllbGQgb2YgVmlldyAoRk9WKVxyXG4gICAgICAgICAgICB3aW5kb3cuaW5uZXJXaWR0aCAvIHdpbmRvdy5pbm5lckhlaWdodCwgLy8gQXNwZWN0IHJhdGlvXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFOZWFyLCAvLyBOZWFyIGNsaXBwaW5nIHBsYW5lXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFGYXIgICAvLyBGYXIgY2xpcHBpbmcgcGxhbmVcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcih7IGNhbnZhczogdGhpcy5jYW52YXMsIGFudGlhbGlhczogdHJ1ZSB9KTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRQaXhlbFJhdGlvKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC5lbmFibGVkID0gdHJ1ZTsgLy8gRW5hYmxlIHNoYWRvd3MgZm9yIGJldHRlciByZWFsaXNtXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zaGFkb3dNYXAudHlwZSA9IFRIUkVFLlBDRlNvZnRTaGFkb3dNYXA7IC8vIFVzZSBzb2Z0IHNoYWRvd3NcclxuXHJcbiAgICAgICAgLy8gMy4gSW5pdGlhbGl6ZSBDYW5ub24tZXMgKHBoeXNpY3Mgd29ybGQpXHJcbiAgICAgICAgdGhpcy53b3JsZCA9IG5ldyBDQU5OT04uV29ybGQoKTtcclxuICAgICAgICB0aGlzLndvcmxkLmdyYXZpdHkuc2V0KDAsIC05LjgyLCAwKTsgLy8gU2V0IHN0YW5kYXJkIEVhcnRoIGdyYXZpdHkgKFktYXhpcyBkb3duKVxyXG4gICAgICAgIHRoaXMud29ybGQuYnJvYWRwaGFzZSA9IG5ldyBDQU5OT04uU0FQQnJvYWRwaGFzZSh0aGlzLndvcmxkKTsgLy8gVXNlIGFuIGVmZmljaWVudCBicm9hZHBoYXNlIGFsZ29yaXRobVxyXG4gICAgICAgIC8vIEZpeDogQ2FzdCB0aGlzLndvcmxkLnNvbHZlciB0byBDQU5OT04uR1NTb2x2ZXIgdG8gYWNjZXNzIHRoZSAnaXRlcmF0aW9ucycgcHJvcGVydHlcclxuICAgICAgICAvLyBUaGUgZGVmYXVsdCBzb2x2ZXIgaW4gQ2Fubm9uLmpzIChhbmQgQ2Fubm9uLWVzKSBpcyBHU1NvbHZlciwgd2hpY2ggaGFzIHRoaXMgcHJvcGVydHkuXHJcbiAgICAgICAgKHRoaXMud29ybGQuc29sdmVyIGFzIENBTk5PTi5HU1NvbHZlcikuaXRlcmF0aW9ucyA9IDEwOyAvLyBJbmNyZWFzZSBzb2x2ZXIgaXRlcmF0aW9ucyBmb3IgYmV0dGVyIHN0YWJpbGl0eVxyXG5cclxuICAgICAgICAvLyA0LiBMb2FkIGFzc2V0cyAodGV4dHVyZXMgYW5kIHNvdW5kcylcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRBc3NldHMoKTtcclxuXHJcbiAgICAgICAgLy8gNS4gU2V0dXAgZXZlbnQgbGlzdGVuZXJzIGZvciB1c2VyIGlucHV0IGFuZCB3aW5kb3cgcmVzaXppbmdcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgdGhpcy5vbldpbmRvd1Jlc2l6ZS5iaW5kKHRoaXMpKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5vbktleURvd24uYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLm9uS2V5VXAuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5vbk1vdXNlTW92ZS5iaW5kKHRoaXMpKTsgLy8gRm9yIG1vdXNlIGxvb2tcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRm9yIHBvaW50ZXIgbG9jayBzdGF0dXNcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3pwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRmlyZWZveCBjb21wYXRpYmlsaXR5XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0cG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7IC8vIFdlYmtpdCBjb21wYXRpYmlsaXR5XHJcblxyXG4gICAgICAgIC8vIDYuIENyZWF0ZSBnYW1lIG9iamVjdHMgKHBsYXllciwgZ3JvdW5kKSBhbmQgbGlnaHRpbmdcclxuICAgICAgICB0aGlzLmNyZWF0ZUdyb3VuZCgpO1xyXG4gICAgICAgIHRoaXMuY3JlYXRlUGxheWVyKCk7XHJcbiAgICAgICAgdGhpcy5zZXR1cExpZ2h0aW5nKCk7XHJcblxyXG4gICAgICAgIC8vIDcuIFNldHVwIHRoZSB0aXRsZSBzY3JlZW4gVUlcclxuICAgICAgICB0aGlzLnNldHVwVGl0bGVTY3JlZW4oKTtcclxuXHJcbiAgICAgICAgLy8gU3RhcnQgdGhlIG1haW4gZ2FtZSBsb29wXHJcbiAgICAgICAgdGhpcy5hbmltYXRlKDApOyAvLyBQYXNzIGluaXRpYWwgdGltZSAwXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBMb2FkcyBhbGwgdGV4dHVyZXMgYW5kIHNvdW5kcyBkZWZpbmVkIGluIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEFzc2V0cygpIHtcclxuICAgICAgICBjb25zdCB0ZXh0dXJlTG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKTtcclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5tYXAoaW1nID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIHRleHR1cmVMb2FkZXIubG9hZEFzeW5jKGltZy5wYXRoKVxyXG4gICAgICAgICAgICAgICAgLnRoZW4odGV4dHVyZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlcy5zZXQoaW1nLm5hbWUsIHRleHR1cmUpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmUud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZzsgLy8gUmVwZWF0IHRleHR1cmUgaG9yaXpvbnRhbGx5XHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nOyAvLyBSZXBlYXQgdGV4dHVyZSB2ZXJ0aWNhbGx5XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQWRqdXN0IHRleHR1cmUgcmVwZXRpdGlvbiBmb3IgdGhlIGdyb3VuZCB0byBhdm9pZCBzdHJldGNoaW5nXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGltZy5uYW1lID09PSAnZ3JvdW5kX3RleHR1cmUnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLnJlcGVhdC5zZXQodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyA1LCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDUpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHRleHR1cmU6ICR7aW1nLnBhdGh9YCwgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIENvbnRpbnVlIGV2ZW4gaWYgYW4gYXNzZXQgZmFpbHMgdG8gbG9hZDsgZmFsbGJhY2tzIChzb2xpZCBjb2xvcnMpIGFyZSB1c2VkLlxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLm1hcChzb3VuZCA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc291bmQucGF0aCk7XHJcbiAgICAgICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzb3VuZC52b2x1bWU7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5sb29wID0gKHNvdW5kLm5hbWUgPT09ICdiYWNrZ3JvdW5kX211c2ljJyk7IC8vIExvb3AgYmFja2dyb3VuZCBtdXNpY1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5zZXQoc291bmQubmFtZSwgYXVkaW8pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NvdW5kLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGV2ZW4gb24gZXJyb3IgdG8gbm90IGJsb2NrIFByb21pc2UuYWxsXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgQXNzZXRzIGxvYWRlZDogJHt0aGlzLnRleHR1cmVzLnNpemV9IHRleHR1cmVzLCAke3RoaXMuc291bmRzLnNpemV9IHNvdW5kcy5gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYW5kIGRpc3BsYXlzIHRoZSB0aXRsZSBzY3JlZW4gVUkgZHluYW1pY2FsbHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc2V0dXBUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuc3R5bGUsIHtcclxuICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsIHRvcDogJzAnLCBsZWZ0OiAnMCcsXHJcbiAgICAgICAgICAgIHdpZHRoOiAnMTAwJScsIGhlaWdodDogJzEwMCUnLFxyXG4gICAgICAgICAgICBiYWNrZ3JvdW5kQ29sb3I6ICdyZ2JhKDAsIDAsIDAsIDAuOCknLFxyXG4gICAgICAgICAgICBkaXNwbGF5OiAnZmxleCcsIGZsZXhEaXJlY3Rpb246ICdjb2x1bW4nLFxyXG4gICAgICAgICAgICBqdXN0aWZ5Q29udGVudDogJ2NlbnRlcicsIGFsaWduSXRlbXM6ICdjZW50ZXInLFxyXG4gICAgICAgICAgICBjb2xvcjogJ3doaXRlJywgZm9udEZhbWlseTogJ0FyaWFsLCBzYW5zLXNlcmlmJyxcclxuICAgICAgICAgICAgZm9udFNpemU6ICc0OHB4JywgdGV4dEFsaWduOiAnY2VudGVyJywgekluZGV4OiAnMTAwMCdcclxuICAgICAgICB9KTtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KTtcclxuXHJcbiAgICAgICAgdGhpcy50aXRsZVRleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLnRpdGxlVGV4dC50ZXh0Q29udGVudCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy50aXRsZVNjcmVlblRleHQ7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuYXBwZW5kQ2hpbGQodGhpcy50aXRsZVRleHQpO1xyXG5cclxuICAgICAgICB0aGlzLnByb21wdFRleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLnByb21wdFRleHQudGV4dENvbnRlbnQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc3RhcnRHYW1lUHJvbXB0O1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5wcm9tcHRUZXh0LnN0eWxlLCB7XHJcbiAgICAgICAgICAgIG1hcmdpblRvcDogJzIwcHgnLCBmb250U2l6ZTogJzI0cHgnXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuYXBwZW5kQ2hpbGQodGhpcy5wcm9tcHRUZXh0KTtcclxuXHJcbiAgICAgICAgLy8gQWRkIGV2ZW50IGxpc3RlbmVyIGRpcmVjdGx5IHRvIHRoZSBvdmVybGF5IHRvIGNhcHR1cmUgY2xpY2tzIGFuZCBzdGFydCB0aGUgZ2FtZVxyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5zdGFydEdhbWUoKSk7XHJcblxyXG4gICAgICAgIC8vIEF0dGVtcHQgdG8gcGxheSBiYWNrZ3JvdW5kIG11c2ljLiBJdCBtaWdodCBiZSBibG9ja2VkIGJ5IGJyb3dzZXJzIGlmIG5vIHVzZXIgZ2VzdHVyZSBoYXMgb2NjdXJyZWQgeWV0LlxyXG4gICAgICAgIHRoaXMuc291bmRzLmdldCgnYmFja2dyb3VuZF9tdXNpYycpPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIkJHTSBwbGF5IGRlbmllZCAocmVxdWlyZXMgdXNlciBnZXN0dXJlKTpcIiwgZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVHJhbnNpdGlvbnMgdGhlIGdhbWUgZnJvbSB0aGUgdGl0bGUgc2NyZWVuIHRvIHRoZSBwbGF5aW5nIHN0YXRlLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXJ0R2FtZSgpIHtcclxuICAgICAgICB0aGlzLnN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICAgICAgLy8gUmVtb3ZlIHRoZSB0aXRsZSBzY3JlZW4gb3ZlcmxheVxyXG4gICAgICAgIGlmICh0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSAmJiB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5wYXJlbnROb2RlKSB7XHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBBZGQgZXZlbnQgbGlzdGVuZXIgdG8gY2FudmFzIGZvciByZS1sb2NraW5nIHBvaW50ZXIgYWZ0ZXIgdGl0bGUgc2NyZWVuIGlzIGdvbmVcclxuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuaGFuZGxlQ2FudmFzUmVMb2NrUG9pbnRlci5iaW5kKHRoaXMpKTtcclxuXHJcbiAgICAgICAgLy8gUmVxdWVzdCBwb2ludGVyIGxvY2sgZm9yIGltbWVyc2l2ZSBtb3VzZSBjb250cm9sXHJcbiAgICAgICAgdGhpcy5jYW52YXMucmVxdWVzdFBvaW50ZXJMb2NrKCk7XHJcbiAgICAgICAgLy8gRW5zdXJlIGJhY2tncm91bmQgbXVzaWMgcGxheXMgbm93IHRoYXQgYSB1c2VyIGdlc3R1cmUgaGFzIG9jY3VycmVkXHJcbiAgICAgICAgdGhpcy5zb3VuZHMuZ2V0KCdiYWNrZ3JvdW5kX211c2ljJyk/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiQkdNIHBsYXkgZmFpbGVkIGFmdGVyIHVzZXIgZ2VzdHVyZTpcIiwgZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyBjbGlja3Mgb24gdGhlIGNhbnZhcyB0byByZS1sb2NrIHRoZSBwb2ludGVyIGlmIHRoZSBnYW1lIGlzIHBsYXlpbmcgYW5kIHVubG9ja2VkLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGhhbmRsZUNhbnZhc1JlTG9ja1BvaW50ZXIoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmICF0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy5yZXF1ZXN0UG9pbnRlckxvY2soKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIHRoZSBwbGF5ZXIncyB2aXN1YWwgbWVzaCBhbmQgcGh5c2ljcyBib2R5LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNyZWF0ZVBsYXllcigpIHtcclxuICAgICAgICAvLyBQbGF5ZXIgdmlzdWFsIG1lc2ggKGEgc2ltcGxlIGJveClcclxuICAgICAgICBjb25zdCBwbGF5ZXJUZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQoJ3BsYXllcl90ZXh0dXJlJyk7XHJcbiAgICAgICAgY29uc3QgcGxheWVyTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogcGxheWVyVGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3I6IHBsYXllclRleHR1cmUgPyAweGZmZmZmZiA6IDB4MDA3N2ZmIC8vIFVzZSB3aGl0ZSB3aXRoIHRleHR1cmUsIG9yIGJsdWUgaWYgbm8gdGV4dHVyZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IHBsYXllckdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KDEsIDIsIDEpOyAvLyBQbGF5ZXIgZGltZW5zaW9uc1xyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaCA9IG5ldyBUSFJFRS5NZXNoKHBsYXllckdlb21ldHJ5LCBwbGF5ZXJNYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLnkgPSA1OyAvLyBTdGFydCBwbGF5ZXIgc2xpZ2h0bHkgYWJvdmUgdGhlIGdyb3VuZFxyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTsgLy8gUGxheWVyIGNhc3RzIGEgc2hhZG93XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5wbGF5ZXJNZXNoKTtcclxuXHJcbiAgICAgICAgLy8gUGxheWVyIHBoeXNpY3MgYm9keSAoQ2Fubm9uLmpzIGJveCBzaGFwZSlcclxuICAgICAgICBjb25zdCBwbGF5ZXJTaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMygwLjUsIDEsIDAuNSkpOyAvLyBIYWxmIGV4dGVudHMgb2YgdGhlIGJveCBmb3IgY29sbGlzaW9uXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllck1hc3MsIC8vIFBsYXllcidzIG1hc3NcclxuICAgICAgICAgICAgcG9zaXRpb246IG5ldyBDQU5OT04uVmVjMyh0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueCwgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLnksIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi56KSxcclxuICAgICAgICAgICAgc2hhcGU6IHBsYXllclNoYXBlLFxyXG4gICAgICAgICAgICBmaXhlZFJvdGF0aW9uOiB0cnVlIC8vIFByZXZlbnQgdGhlIHBsYXllciBmcm9tIGZhbGxpbmcgb3ZlciAoc2ltdWxhdGVzIGEgY2Fwc3VsZS9jeWxpbmRlciBjaGFyYWN0ZXIpXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KHRoaXMucGxheWVyQm9keSk7XHJcblxyXG4gICAgICAgIC8vIFNldCBpbml0aWFsIGNhbWVyYSBwb3NpdGlvbiByZWxhdGl2ZSB0byBwbGF5ZXIncyBwaHlzaWNzIGJvZHkuXHJcbiAgICAgICAgLy8gSXQgd2lsbCBiZSBjb250aW51b3VzbHkgdXBkYXRlZCBpbiB0aGUgYW5pbWF0ZSBsb29wLlxyXG4gICAgICAgIHRoaXMuY2FtZXJhLnBvc2l0aW9uLnNldChcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLngsXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi55ICsgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbWVyYUhlaWdodE9mZnNldCxcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnpcclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyB0aGUgZ3JvdW5kJ3MgdmlzdWFsIG1lc2ggYW5kIHBoeXNpY3MgYm9keS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVHcm91bmQoKSB7XHJcbiAgICAgICAgLy8gR3JvdW5kIHZpc3VhbCBtZXNoIChhIGxhcmdlIHBsYW5lKVxyXG4gICAgICAgIGNvbnN0IGdyb3VuZFRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgnZ3JvdW5kX3RleHR1cmUnKTtcclxuICAgICAgICBjb25zdCBncm91bmRNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgbWFwOiBncm91bmRUZXh0dXJlLFxyXG4gICAgICAgICAgICBjb2xvcjogZ3JvdW5kVGV4dHVyZSA/IDB4ZmZmZmZmIDogMHg4ODg4ODggLy8gVXNlIHdoaXRlIHdpdGggdGV4dHVyZSwgb3IgZ3JleSBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kR2VvbWV0cnkgPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeSh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdyb3VuZEdlb21ldHJ5LCBncm91bmRNYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRNZXNoLnJvdGF0aW9uLnggPSAtTWF0aC5QSSAvIDI7IC8vIFJvdGF0ZSB0byBsYXkgZmxhdCBvbiB0aGUgWFogcGxhbmVcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7IC8vIEdyb3VuZCByZWNlaXZlcyBzaGFkb3dzXHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5ncm91bmRNZXNoKTtcclxuXHJcbiAgICAgICAgLy8gR3JvdW5kIHBoeXNpY3MgYm9keSAoQ2Fubm9uLmpzIHBsYW5lIHNoYXBlKVxyXG4gICAgICAgIGNvbnN0IGdyb3VuZFNoYXBlID0gbmV3IENBTk5PTi5QbGFuZSgpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IDAsIC8vIEEgbWFzcyBvZiAwIG1ha2VzIGl0IGEgc3RhdGljIChpbW1vdmFibGUpIGJvZHlcclxuICAgICAgICAgICAgc2hhcGU6IGdyb3VuZFNoYXBlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgLy8gUm90YXRlIHRoZSBDYW5ub24uanMgcGxhbmUgYm9keSB0byBtYXRjaCB0aGUgVGhyZWUuanMgcGxhbmUgb3JpZW50YXRpb24gKGZsYXQpXHJcbiAgICAgICAgdGhpcy5ncm91bmRCb2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShuZXcgQ0FOTk9OLlZlYzMoMSwgMCwgMCksIC1NYXRoLlBJIC8gMik7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KHRoaXMuZ3JvdW5kQm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHVwIGFtYmllbnQgYW5kIGRpcmVjdGlvbmFsIGxpZ2h0aW5nIGluIHRoZSBzY2VuZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzZXR1cExpZ2h0aW5nKCkge1xyXG4gICAgICAgIGNvbnN0IGFtYmllbnRMaWdodCA9IG5ldyBUSFJFRS5BbWJpZW50TGlnaHQoMHg0MDQwNDAsIDEuMCk7IC8vIFNvZnQgd2hpdGUgYW1iaWVudCBsaWdodFxyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGFtYmllbnRMaWdodCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGRpcmVjdGlvbmFsTGlnaHQgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCgweGZmZmZmZiwgMC44KTsgLy8gQnJpZ2h0ZXIgZGlyZWN0aW9uYWwgbGlnaHRcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnBvc2l0aW9uLnNldCg1LCAxMCwgNSk7IC8vIFBvc2l0aW9uIHRoZSBsaWdodCBzb3VyY2VcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LmNhc3RTaGFkb3cgPSB0cnVlOyAvLyBFbmFibGUgc2hhZG93cyBmcm9tIHRoaXMgbGlnaHQgc291cmNlXHJcbiAgICAgICAgLy8gQ29uZmlndXJlIHNoYWRvdyBwcm9wZXJ0aWVzIGZvciB0aGUgZGlyZWN0aW9uYWwgbGlnaHRcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5tYXBTaXplLndpZHRoID0gMTAyNDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5tYXBTaXplLmhlaWdodCA9IDEwMjQ7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLm5lYXIgPSAwLjU7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmZhciA9IDUwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5sZWZ0ID0gLTEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5yaWdodCA9IDEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS50b3AgPSAxMDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEuYm90dG9tID0gLTEwO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGRpcmVjdGlvbmFsTGlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyB3aW5kb3cgcmVzaXppbmcgdG8ga2VlcCB0aGUgY2FtZXJhIGFzcGVjdCByYXRpbyBhbmQgcmVuZGVyZXIgc2l6ZSBjb3JyZWN0LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uV2luZG93UmVzaXplKCkge1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmFzcGVjdCA9IHdpbmRvdy5pbm5lcldpZHRoIC8gd2luZG93LmlubmVySGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWNvcmRzIHdoaWNoIGtleXMgYXJlIGN1cnJlbnRseSBwcmVzc2VkIGRvd24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25LZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmtleS50b0xvd2VyQ2FzZSgpXSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWNvcmRzIHdoaWNoIGtleXMgYXJlIGN1cnJlbnRseSByZWxlYXNlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbktleVVwKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmtleS50b0xvd2VyQ2FzZSgpXSA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyBtb3VzZSBtb3ZlbWVudCBmb3IgY2FtZXJhIHJvdGF0aW9uIChtb3VzZSBsb29rKS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbk1vdXNlTW92ZShldmVudDogTW91c2VFdmVudCkge1xyXG4gICAgICAgIC8vIE9ubHkgcHJvY2VzcyBtb3VzZSBtb3ZlbWVudCBpZiB0aGUgZ2FtZSBpcyBwbGF5aW5nIGFuZCBwb2ludGVyIGlzIGxvY2tlZFxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiB0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICBjb25zdCBtb3ZlbWVudFggPSBldmVudC5tb3ZlbWVudFggfHwgMDtcclxuICAgICAgICAgICAgY29uc3QgbW92ZW1lbnRZID0gZXZlbnQubW92ZW1lbnRZIHx8IDA7XHJcblxyXG4gICAgICAgICAgICAvLyBBcHBseSBob3Jpem9udGFsIHJvdGF0aW9uICh5YXcpIHRvIHRoZSBjYW1lcmEgYXJvdW5kIGl0cyBsb2NhbCBZLWF4aXNcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmEucm90YXRpb24ueSAtPSBtb3ZlbWVudFggKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubW91c2VTZW5zaXRpdml0eTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFwcGx5IHZlcnRpY2FsIHJvdGF0aW9uIChwaXRjaCkgYW5kIGNsYW1wIGl0IHRvIHByZXZlbnQgdGhlIGNhbWVyYSBmcm9tIGZsaXBwaW5nIG92ZXJcclxuICAgICAgICAgICAgLy8gQ29ycmVjdGVkOiBDaGFuZ2VkIGZyb20gKz0gdG8gLT0gdG8gbWFrZSBtb3VzZSBZLWF4aXMgbW92ZW1lbnQgaW50dWl0aXZlLlxyXG4gICAgICAgICAgICAvLyBNb3VzZSBVUCAobW92ZW1lbnRZIDwgMCkgbm93IGRlY3JlYXNlcyBtb3ZlbWVudFksIHRodXMgaW5jcmVhc2VzIGNhbWVyYVBpdGNoIC0+IGxvb2tzIHVwLlxyXG4gICAgICAgICAgICAvLyBNb3VzZSBET1dOIChtb3ZlbWVudFkgPiAwKSBub3cgZGVjcmVhc2VzIGNhbWVyYVBpdGNoIC0+IGxvb2tzIGRvd24uXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUGl0Y2ggLT0gbW92ZW1lbnRZICogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm1vdXNlU2Vuc2l0aXZpdHk7IFxyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYVBpdGNoID0gTWF0aC5tYXgoLU1hdGguUEkgLyAyLCBNYXRoLm1pbihNYXRoLlBJIC8gMiwgdGhpcy5jYW1lcmFQaXRjaCkpOyAvLyBDbGFtcCB0byAtOTAgdG8gKzkwIGRlZ3JlZXNcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmEucm90YXRpb24ueCA9IHRoaXMuY2FtZXJhUGl0Y2g7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXBkYXRlcyB0aGUgcG9pbnRlciBsb2NrIHN0YXR1cyB3aGVuIGl0IGNoYW5nZXMgKGUuZy4sIHVzZXIgcHJlc3NlcyBFc2MpLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uUG9pbnRlckxvY2tDaGFuZ2UoKSB7XHJcbiAgICAgICAgaWYgKGRvY3VtZW50LnBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXMgfHxcclxuICAgICAgICAgICAgKGRvY3VtZW50IGFzIGFueSkubW96UG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLmNhbnZhcyB8fFxyXG4gICAgICAgICAgICAoZG9jdW1lbnQgYXMgYW55KS53ZWJraXRQb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMuY2FudmFzKSB7IC8vIENvcnJlY3RlZCB3ZWJraXRQb2ludGVyTG9ja0VsZW1lbnRcclxuICAgICAgICAgICAgdGhpcy5pc1BvaW50ZXJMb2NrZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUG9pbnRlciBsb2NrZWQnKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmlzUG9pbnRlckxvY2tlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUG9pbnRlciB1bmxvY2tlZCcpO1xyXG4gICAgICAgICAgICAvLyBXaGVuIHBvaW50ZXIgaXMgdW5sb2NrZWQgYnkgdXNlciAoZS5nLiwgcHJlc3NpbmcgRXNjKSwgY3Vyc29yIGFwcGVhcnMgYXV0b21hdGljYWxseS5cclxuICAgICAgICAgICAgLy8gTW91c2UgbG9vayBzdG9wcyBkdWUgdG8gYGlzUG9pbnRlckxvY2tlZGAgY2hlY2sgaW4gb25Nb3VzZU1vdmUuXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVGhlIG1haW4gZ2FtZSBsb29wLCBjYWxsZWQgb24gZXZlcnkgYW5pbWF0aW9uIGZyYW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFuaW1hdGUodGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCkge1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGUuYmluZCh0aGlzKSk7IC8vIFJlcXVlc3QgbmV4dCBmcmFtZVxyXG5cclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAodGltZSAtIHRoaXMubGFzdFRpbWUpIC8gMTAwMDsgLy8gQ2FsY3VsYXRlIGRlbHRhIHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSB0aW1lO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQbGF5ZXJNb3ZlbWVudCgpOyAvLyBVcGRhdGUgcGxheWVyJ3MgdmVsb2NpdHkgYmFzZWQgb24gaW5wdXRcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQaHlzaWNzKGRlbHRhVGltZSk7IC8vIFN0ZXAgdGhlIHBoeXNpY3Mgd29ybGRcclxuICAgICAgICAgICAgdGhpcy5zeW5jTWVzaGVzV2l0aEJvZGllcygpOyAvLyBTeW5jaHJvbml6ZSB2aXN1YWwgbWVzaGVzIHdpdGggcGh5c2ljcyBib2RpZXNcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhKTsgLy8gUmVuZGVyIHRoZSBzY2VuZVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3RlcHMgdGhlIENhbm5vbi5qcyBwaHlzaWNzIHdvcmxkIGZvcndhcmQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlUGh5c2ljcyhkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIC8vIHdvcmxkLnN0ZXAoZml4ZWRUaW1lU3RlcCwgZGVsdGFUaW1lLCBtYXhTdWJTdGVwcylcclxuICAgICAgICAvLyAxLzYwOiBBIGZpeGVkIHRpbWUgc3RlcCBvZiA2MCBwaHlzaWNzIHVwZGF0ZXMgcGVyIHNlY29uZCAoc3RhbmRhcmQpLlxyXG4gICAgICAgIC8vIGRlbHRhVGltZTogVGhlIGFjdHVhbCB0aW1lIGVsYXBzZWQgc2luY2UgdGhlIGxhc3QgcmVuZGVyIGZyYW1lLlxyXG4gICAgICAgIC8vIG1heFBoeXNpY3NTdWJTdGVwczogTGltaXRzIHRoZSBudW1iZXIgb2YgcGh5c2ljcyBzdGVwcyBpbiBvbmUgcmVuZGVyIGZyYW1lXHJcbiAgICAgICAgLy8gdG8gcHJldmVudCBpbnN0YWJpbGl0aWVzIGlmIHJlbmRlcmluZyBzbG93cyBkb3duIHNpZ25pZmljYW50bHkuXHJcbiAgICAgICAgdGhpcy53b3JsZC5zdGVwKDEgLyA2MCwgZGVsdGFUaW1lLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubWF4UGh5c2ljc1N1YlN0ZXBzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgdGhlIHBsYXllcidzIHZlbG9jaXR5IGJhc2VkIG9uIFdBU0QgaW5wdXQgYW5kIGNhbWVyYSBvcmllbnRhdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVQbGF5ZXJNb3ZlbWVudCgpIHtcclxuICAgICAgICAvLyBQbGF5ZXIgbW92ZW1lbnQgc2hvdWxkIG9ubHkgaGFwcGVuIHdoZW4gdGhlIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICAgICAgaWYgKCF0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICAvLyBJZiBwb2ludGVyIGlzIG5vdCBsb2NrZWQsIHN0b3AgaG9yaXpvbnRhbCBtb3ZlbWVudCBpbW1lZGlhdGVseVxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBFeGl0IGVhcmx5IGFzIG5vIG1vdmVtZW50IGlucHV0IHNob3VsZCBiZSBwcm9jZXNzZWRcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllclNwZWVkID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllclNwZWVkO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRWZWxvY2l0eSA9IHRoaXMucGxheWVyQm9keS52ZWxvY2l0eTtcclxuICAgICAgICBjb25zdCBkZXNpcmVkSG9yaXpvbnRhbFZlbG9jaXR5ID0gbmV3IENBTk5PTi5WZWMzKDAsIDAsIDApO1xyXG5cclxuICAgICAgICAvLyBHZXQgY2FtZXJhJ3MgZm9yd2FyZCBhbmQgcmlnaHQgdmVjdG9ycyB0byBkZXRlcm1pbmUgbW92ZW1lbnQgZGlyZWN0aW9uIHJlbGF0aXZlIHRvIHZpZXdcclxuICAgICAgICBjb25zdCBjYW1lcmFEaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmdldFdvcmxkRGlyZWN0aW9uKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgY2FtZXJhRGlyZWN0aW9uLnkgPSAwOyAvLyBGbGF0dGVuIHRoZSB2ZWN0b3IgdG8gcmVzdHJpY3QgbW92ZW1lbnQgdG8gdGhlIGhvcml6b250YWwgcGxhbmVcclxuICAgICAgICBjYW1lcmFEaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGNhbWVyYVJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICAvLyBUaGUgb3JpZ2luYWwgY2FsY3VsYXRpb24gYGNhbWVyYVJpZ2h0LmNyb3NzVmVjdG9ycyh0aGlzLmNhbWVyYS51cCwgY2FtZXJhRGlyZWN0aW9uKWBcclxuICAgICAgICAvLyByZXN1bHRlZCBpbiBhIHZlY3RvciBwb2ludGluZyB0byB0aGUgTEVGVCBvZiB0aGUgY2FtZXJhJ3Mgdmlldy5cclxuICAgICAgICAvLyBUbyBmaXggQS9EIGtleXMsIHdlIGVpdGhlciByZXZlcnNlIHRoZSBjcm9zcyBwcm9kdWN0IG9yIHJldmVyc2UgdGhlIHNpZ25zIGJlbG93LlxyXG4gICAgICAgIC8vIFJldmVyc2luZyB0aGUgY3Jvc3MgcHJvZHVjdDogYGNhbWVyYVJpZ2h0LmNyb3NzVmVjdG9ycyhjYW1lcmFEaXJlY3Rpb24sIHRoaXMuY2FtZXJhLnVwKTtgXHJcbiAgICAgICAgLy8gT3IgcmV2ZXJzaW5nIHRoZSBzaWducyBiZWxvdywgd2hpY2ggaXMgc2ltcGxlciBnaXZlbiB0aGUgY3VycmVudCBgY2FtZXJhUmlnaHRgIGRlZmluaXRpb246XHJcbiAgICAgICAgY2FtZXJhUmlnaHQuY3Jvc3NWZWN0b3JzKHRoaXMuY2FtZXJhLnVwLCBjYW1lcmFEaXJlY3Rpb24pOyAvLyBUaGlzIGdpdmVzIGEgdmVjdG9yIHBvaW50aW5nIExFRlRcclxuICAgICAgICBjYW1lcmFSaWdodC5ub3JtYWxpemUoKTtcclxuXHJcbiAgICAgICAgbGV0IG1vdmluZyA9IGZhbHNlO1xyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ3cnXSkgeyAvLyBGb3J3YXJkXHJcbiAgICAgICAgICAgIGRlc2lyZWRIb3Jpem9udGFsVmVsb2NpdHkueCArPSBjYW1lcmFEaXJlY3Rpb24ueDtcclxuICAgICAgICAgICAgZGVzaXJlZEhvcml6b250YWxWZWxvY2l0eS56ICs9IGNhbWVyYURpcmVjdGlvbi56O1xyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5rZXlzWydzJ10pIHsgLy8gQmFja3dhcmRcclxuICAgICAgICAgICAgZGVzaXJlZEhvcml6b250YWxWZWxvY2l0eS54IC09IGNhbWVyYURpcmVjdGlvbi54O1xyXG4gICAgICAgICAgICBkZXNpcmVkSG9yaXpvbnRhbFZlbG9jaXR5LnogLT0gY2FtZXJhRGlyZWN0aW9uLno7XHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ2EnXSkgeyAvLyBTdHJhZmUgbGVmdCAtIENoYW5nZWQgZnJvbSAtPSB0byArPSB0byBjb3JyZWN0IGRpcmVjdGlvblxyXG4gICAgICAgICAgICBkZXNpcmVkSG9yaXpvbnRhbFZlbG9jaXR5LnggKz0gY2FtZXJhUmlnaHQueDsgXHJcbiAgICAgICAgICAgIGRlc2lyZWRIb3Jpem9udGFsVmVsb2NpdHkueiArPSBjYW1lcmFSaWdodC56O1xyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5rZXlzWydkJ10pIHsgLy8gU3RyYWZlIHJpZ2h0IC0gQ2hhbmdlZCBmcm9tICs9IHRvIC09IHRvIGNvcnJlY3QgZGlyZWN0aW9uXHJcbiAgICAgICAgICAgIGRlc2lyZWRIb3Jpem9udGFsVmVsb2NpdHkueCAtPSBjYW1lcmFSaWdodC54O1xyXG4gICAgICAgICAgICBkZXNpcmVkSG9yaXpvbnRhbFZlbG9jaXR5LnogLT0gY2FtZXJhUmlnaHQuejtcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChtb3ZpbmcpIHtcclxuICAgICAgICAgICAgLy8gTm9ybWFsaXplIHRoZSBjb21iaW5lZCBkaXJlY3Rpb24gdmVjdG9yIGFuZCBzY2FsZSBieSBwbGF5ZXIgc3BlZWRcclxuICAgICAgICAgICAgZGVzaXJlZEhvcml6b250YWxWZWxvY2l0eS5ub3JtYWxpemUoKTtcclxuICAgICAgICAgICAgZGVzaXJlZEhvcml6b250YWxWZWxvY2l0eS54ICo9IHBsYXllclNwZWVkO1xyXG4gICAgICAgICAgICBkZXNpcmVkSG9yaXpvbnRhbFZlbG9jaXR5LnogKj0gcGxheWVyU3BlZWQ7XHJcblxyXG4gICAgICAgICAgICAvLyBTbW9vdGhseSBhY2NlbGVyYXRlIHBsYXllcidzIGhvcml6b250YWwgdmVsb2NpdHkgdG93YXJkcyB0aGUgZGVzaXJlZCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICBjb25zdCBhY2NlbGVyYXRpb25GYWN0b3IgPSAwLjI7IC8vIEFkanVzdCBmb3IgZGVzaXJlZCBhY2NlbGVyYXRpb24gZmVlbFxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IGN1cnJlbnRWZWxvY2l0eS54ICsgKGRlc2lyZWRIb3Jpem9udGFsVmVsb2NpdHkueCAtIGN1cnJlbnRWZWxvY2l0eS54KSAqIGFjY2VsZXJhdGlvbkZhY3RvcjtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSBjdXJyZW50VmVsb2NpdHkueiArIChkZXNpcmVkSG9yaXpvbnRhbFZlbG9jaXR5LnogLSBjdXJyZW50VmVsb2NpdHkueikgKiBhY2NlbGVyYXRpb25GYWN0b3I7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gSWYgbm8gbW92ZW1lbnQga2V5cyBhcmUgcHJlc3NlZCwgYXBwbHkgaG9yaXpvbnRhbCBmcmljdGlvbiB0byBzbW9vdGhseSBkZWNlbGVyYXRlXHJcbiAgICAgICAgICAgIGNvbnN0IGZyaWN0aW9uRmFjdG9yID0gMC44OyAvLyBBZGp1c3QgZm9yIGRlc2lyZWQgZGVjZWxlcmF0aW9uIGZlZWwgKGUuZy4sIDAuOSBmb3Igc2xvdywgMC41IGZvciBmYXN0KVxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCAqPSBmcmljdGlvbkZhY3RvcjtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogKj0gZnJpY3Rpb25GYWN0b3I7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBVcGRhdGUgY2FtZXJhIHBvc2l0aW9uIHRvIGZvbGxvdyB0aGUgcGxheWVyJ3MgcGh5c2ljcyBib2R5LCBhZGRpbmcgYW4gZXllLWxldmVsIG9mZnNldFxyXG4gICAgICAgIHRoaXMuY2FtZXJhLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEucG9zaXRpb24ueSArPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FtZXJhSGVpZ2h0T2Zmc2V0O1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3luY2hyb25pemVzIHRoZSB2aXN1YWwgbWVzaGVzIHdpdGggdGhlaXIgY29ycmVzcG9uZGluZyBwaHlzaWNzIGJvZGllcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzeW5jTWVzaGVzV2l0aEJvZGllcygpIHtcclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSBwbGF5ZXIncyB2aXN1YWwgbWVzaCBwb3NpdGlvbiB3aXRoIGl0cyBwaHlzaWNzIGJvZHkncyBwb3NpdGlvblxyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgICAgIC8vIFBsYXllciBib2R5IGhhcyBmaXhlZCByb3RhdGlvbiwgc28gaXRzIHJvdGF0aW9uIGRvZXMgbm90IG5lZWQgdG8gYmUgY29waWVkLlxyXG4gICAgICAgIC8vIElmIHRoZSBwbGF5ZXIgY291bGQgcm90YXRlIChlLmcuLCBmcm9tIGltcGFjdHMpLCBpdHMgcXVhdGVybmlvbiB3b3VsZCBhbHNvIGJlIGNvcGllZCBoZXJlOlxyXG4gICAgICAgIC8vIHRoaXMucGxheWVyTWVzaC5xdWF0ZXJuaW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnF1YXRlcm5pb24gYXMgdW5rbm93biBhcyBUSFJFRS5RdWF0ZXJuaW9uKTtcclxuXHJcbiAgICAgICAgLy8gVGhlIGdyb3VuZCBpcyBzdGF0aWMsIHNvIGl0cyBwb3NpdGlvbiBhbmQgcm90YXRpb24gZG8gbm90IGNoYW5nZSBhZnRlciBpbml0aWFsIHNldHVwLlxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBTdGFydCB0aGUgZ2FtZSB3aGVuIHRoZSBET00gY29udGVudCBpcyBmdWxseSBsb2FkZWRcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcclxuICAgIG5ldyBHYW1lKCk7XHJcbn0pOyJdLAogICJtYXBwaW5ncyI6ICJBQUNBLFlBQVksV0FBVztBQUN2QixZQUFZLFlBQVk7QUFHeEIsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUZDLFNBQUFBO0FBQUEsR0FBQTtBQTZCTCxNQUFNLEtBQUs7QUFBQSxFQW9DUCxjQUFjO0FBbENkO0FBQUEsU0FBUSxRQUFtQjtBQWtCM0I7QUFBQSxTQUFRLE9BQW1DLENBQUM7QUFDNUM7QUFBQSxTQUFRLGtCQUEyQjtBQUNuQztBQUFBLFNBQVEsY0FBc0I7QUFHOUI7QUFBQTtBQUFBLFNBQVEsV0FBdUMsb0JBQUksSUFBSTtBQUN2RDtBQUFBLFNBQVEsU0FBd0Msb0JBQUksSUFBSTtBQVF4RDtBQUFBLFNBQVEsV0FBZ0M7QUFJcEMsU0FBSyxTQUFTLFNBQVMsZUFBZSxZQUFZO0FBQ2xELFFBQUksQ0FBQyxLQUFLLFFBQVE7QUFDZCxjQUFRLE1BQU0sZ0RBQWdEO0FBQzlEO0FBQUEsSUFDSjtBQUNBLFNBQUssS0FBSztBQUFBLEVBQ2Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQWMsT0FBTztBQUVqQixRQUFJO0FBQ0EsWUFBTSxXQUFXLE1BQU0sTUFBTSxXQUFXO0FBQ3hDLFVBQUksQ0FBQyxTQUFTLElBQUk7QUFDZCxjQUFNLElBQUksTUFBTSx1QkFBdUIsU0FBUyxNQUFNLEVBQUU7QUFBQSxNQUM1RDtBQUNBLFdBQUssU0FBUyxNQUFNLFNBQVMsS0FBSztB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
