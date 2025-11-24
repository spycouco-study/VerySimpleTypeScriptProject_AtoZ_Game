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
      this.config.gameSettings.fixedAspectRatio.width / this.config.gameSettings.fixedAspectRatio.height,
      // Fixed Aspect ratio from config
      this.config.gameSettings.cameraNear,
      // Near clipping plane
      this.config.gameSettings.cameraFar
      // Far clipping plane
    );
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.cameraContainer = new THREE.Object3D();
    this.scene.add(this.cameraContainer);
    this.cameraContainer.add(this.camera);
    this.camera.position.y = this.config.gameSettings.cameraHeightOffset;
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
    this.applyFixedAspectRatio();
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
      // Position relative to body, will be centered and sized by applyFixedAspectRatio
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
    this.applyFixedAspectRatio();
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
    this.cameraContainer.position.copy(this.playerBody.position);
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
    this.applyFixedAspectRatio();
  }
  /**
   * Applies the configured fixed aspect ratio to the renderer and camera,
   * resizing and centering the canvas to fit within the window.
   */
  applyFixedAspectRatio() {
    const targetAspectRatio = this.config.gameSettings.fixedAspectRatio.width / this.config.gameSettings.fixedAspectRatio.height;
    let newWidth;
    let newHeight;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const currentWindowAspectRatio = windowWidth / windowHeight;
    if (currentWindowAspectRatio > targetAspectRatio) {
      newHeight = windowHeight;
      newWidth = newHeight * targetAspectRatio;
    } else {
      newWidth = windowWidth;
      newHeight = newWidth / targetAspectRatio;
    }
    this.renderer.setSize(newWidth, newHeight, false);
    this.camera.aspect = targetAspectRatio;
    this.camera.updateProjectionMatrix();
    Object.assign(this.canvas.style, {
      width: `${newWidth}px`,
      height: `${newHeight}px`,
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      objectFit: "contain"
      // Ensures content is scaled appropriately if there's any mismatch
    });
    if (this.state === 0 /* TITLE */ && this.titleScreenOverlay) {
      Object.assign(this.titleScreenOverlay.style, {
        width: `${newWidth}px`,
        height: `${newHeight}px`,
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)"
      });
    }
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
      this.cameraContainer.rotation.y -= movementX * this.config.gameSettings.mouseSensitivity;
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
      this.clampPlayerPosition();
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
    const currentYVelocity = this.playerBody.velocity.y;
    const moveDirection = new THREE.Vector3(0, 0, 0);
    const cameraDirection = new THREE.Vector3();
    this.cameraContainer.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();
    const globalUp = new THREE.Vector3(0, 1, 0);
    const cameraRight = new THREE.Vector3();
    cameraRight.crossVectors(globalUp, cameraDirection).normalize();
    let moving = false;
    if (this.keys["s"]) {
      moveDirection.add(cameraDirection);
      moving = true;
    }
    if (this.keys["w"]) {
      moveDirection.sub(cameraDirection);
      moving = true;
    }
    if (this.keys["a"]) {
      moveDirection.sub(cameraRight);
      moving = true;
    }
    if (this.keys["d"]) {
      moveDirection.add(cameraRight);
      moving = true;
    }
    if (moving) {
      moveDirection.normalize().multiplyScalar(playerSpeed);
      this.playerBody.velocity.x = moveDirection.x;
      this.playerBody.velocity.z = moveDirection.z;
    } else {
      const frictionFactor = 0.8;
      this.playerBody.velocity.x *= frictionFactor;
      this.playerBody.velocity.z *= frictionFactor;
    }
    this.playerBody.velocity.y = currentYVelocity;
  }
  /**
   * Clamps the player's position within the defined ground boundaries.
   * Prevents the player from moving beyond the 'end of the world'.
   */
  clampPlayerPosition() {
    if (!this.playerBody || !this.config) {
      return;
    }
    const halfGroundSize = this.config.gameSettings.groundSize / 2;
    let posX = this.playerBody.position.x;
    let posZ = this.playerBody.position.z;
    let velX = this.playerBody.velocity.x;
    let velZ = this.playerBody.velocity.z;
    if (posX > halfGroundSize) {
      this.playerBody.position.x = halfGroundSize;
      if (velX > 0) {
        this.playerBody.velocity.x = 0;
      }
    } else if (posX < -halfGroundSize) {
      this.playerBody.position.x = -halfGroundSize;
      if (velX < 0) {
        this.playerBody.velocity.x = 0;
      }
    }
    if (posZ > halfGroundSize) {
      this.playerBody.position.z = halfGroundSize;
      if (velZ > 0) {
        this.playerBody.velocity.z = 0;
      }
    } else if (posZ < -halfGroundSize) {
      this.playerBody.position.z = -halfGroundSize;
      if (velZ < 0) {
        this.playerBody.velocity.z = 0;
      }
    }
  }
  /**
   * Synchronizes the visual meshes with their corresponding physics bodies.
   */
  syncMeshesWithBodies() {
    this.playerMesh.position.copy(this.playerBody.position);
    this.cameraContainer.position.copy(this.playerBody.position);
    this.playerMesh.quaternion.copy(this.cameraContainer.quaternion);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  new Game();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gSW1wb3J0IFRocmVlLmpzIGFuZCBDYW5ub24tZXMgbGlicmFyaWVzXHJcbmltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJztcclxuaW1wb3J0ICogYXMgQ0FOTk9OIGZyb20gJ2Nhbm5vbi1lcyc7XHJcblxyXG4vLyBFbnVtIHRvIGRlZmluZSB0aGUgcG9zc2libGUgc3RhdGVzIG9mIHRoZSBnYW1lXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFLCAgIC8vIFRpdGxlIHNjcmVlbiwgd2FpdGluZyBmb3IgdXNlciBpbnB1dFxyXG4gICAgUExBWUlORyAgLy8gR2FtZSBpcyBhY3RpdmUsIHVzZXIgY2FuIG1vdmUgYW5kIGxvb2sgYXJvdW5kXHJcbn1cclxuXHJcbi8vIEludGVyZmFjZSB0byB0eXBlLWNoZWNrIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHN0YXJ0R2FtZVByb21wdDogc3RyaW5nO1xyXG4gICAgICAgIHBsYXllclNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgbW91c2VTZW5zaXRpdml0eTogbnVtYmVyO1xyXG4gICAgICAgIGNhbWVyYUhlaWdodE9mZnNldDogbnVtYmVyOyAvLyBWZXJ0aWNhbCBvZmZzZXQgb2YgdGhlIGNhbWVyYSBmcm9tIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkgY2VudGVyXHJcbiAgICAgICAgY2FtZXJhTmVhcjogbnVtYmVyOyAgICAgICAgIC8vIE5lYXIgY2xpcHBpbmcgcGxhbmUgZm9yIHRoZSBjYW1lcmFcclxuICAgICAgICBjYW1lcmFGYXI6IG51bWJlcjsgICAgICAgICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lIGZvciB0aGUgY2FtZXJhXHJcbiAgICAgICAgcGxheWVyTWFzczogbnVtYmVyOyAgICAgICAgIC8vIE1hc3Mgb2YgdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keVxyXG4gICAgICAgIGdyb3VuZFNpemU6IG51bWJlcjsgICAgICAgICAvLyBTaXplICh3aWR0aC9kZXB0aCkgb2YgdGhlIHNxdWFyZSBncm91bmQgcGxhbmVcclxuICAgICAgICBtYXhQaHlzaWNzU3ViU3RlcHM6IG51bWJlcjsgLy8gTWF4aW11bSBudW1iZXIgb2YgcGh5c2ljcyBzdWJzdGVwcyBwZXIgZnJhbWUgdG8gbWFpbnRhaW4gc3RhYmlsaXR5XHJcbiAgICAgICAgZml4ZWRBc3BlY3RSYXRpbzogeyB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciB9OyAvLyBOZXc6IEZpeGVkIGFzcGVjdCByYXRpbyBmb3IgdGhlIGdhbWUgKHdpZHRoIC8gaGVpZ2h0KVxyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfVtdO1xyXG4gICAgICAgIHNvdW5kczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyOyB2b2x1bWU6IG51bWJlciB9W107XHJcbiAgICB9O1xyXG59XHJcblxyXG4vKipcclxuICogTWFpbiBHYW1lIGNsYXNzIHJlc3BvbnNpYmxlIGZvciBpbml0aWFsaXppbmcgYW5kIHJ1bm5pbmcgdGhlIDNEIGdhbWUuXHJcbiAqIEl0IGhhbmRsZXMgVGhyZWUuanMgcmVuZGVyaW5nLCBDYW5ub24tZXMgcGh5c2ljcywgaW5wdXQsIGFuZCBnYW1lIHN0YXRlLlxyXG4gKi9cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNvbmZpZyE6IEdhbWVDb25maWc7IC8vIEdhbWUgY29uZmlndXJhdGlvbiBsb2FkZWQgZnJvbSBkYXRhLmpzb25cclxuICAgIHByaXZhdGUgc3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTsgLy8gQ3VycmVudCBzdGF0ZSBvZiB0aGUgZ2FtZVxyXG5cclxuICAgIC8vIFRocmVlLmpzIGVsZW1lbnRzIGZvciByZW5kZXJpbmdcclxuICAgIHByaXZhdGUgc2NlbmUhOiBUSFJFRS5TY2VuZTtcclxuICAgIHByaXZhdGUgY2FtZXJhITogVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmE7XHJcbiAgICBwcml2YXRlIHJlbmRlcmVyITogVEhSRUUuV2ViR0xSZW5kZXJlcjtcclxuICAgIHByaXZhdGUgY2FudmFzITogSFRNTENhbnZhc0VsZW1lbnQ7IC8vIFRoZSBIVE1MIGNhbnZhcyBlbGVtZW50IGZvciByZW5kZXJpbmdcclxuXHJcbiAgICAvLyBOZXc6IEEgY29udGFpbmVyIG9iamVjdCBmb3IgdGhlIGNhbWVyYSB0byBoYW5kbGUgaG9yaXpvbnRhbCByb3RhdGlvbiBzZXBhcmF0ZWx5IGZyb20gdmVydGljYWwgcGl0Y2guXHJcbiAgICBwcml2YXRlIGNhbWVyYUNvbnRhaW5lciE6IFRIUkVFLk9iamVjdDNEOyBcclxuXHJcbiAgICAvLyBDYW5ub24tZXMgZWxlbWVudHMgZm9yIHBoeXNpY3NcclxuICAgIHByaXZhdGUgd29ybGQhOiBDQU5OT04uV29ybGQ7XHJcbiAgICBwcml2YXRlIHBsYXllckJvZHkhOiBDQU5OT04uQm9keTsgLy8gUGh5c2ljcyBib2R5IGZvciB0aGUgcGxheWVyXHJcbiAgICBwcml2YXRlIGdyb3VuZEJvZHkhOiBDQU5OT04uQm9keTsgLy8gUGh5c2ljcyBib2R5IGZvciB0aGUgZ3JvdW5kXHJcblxyXG4gICAgLy8gVmlzdWFsIG1lc2hlcyAoVGhyZWUuanMpIGZvciBnYW1lIG9iamVjdHNcclxuICAgIHByaXZhdGUgcGxheWVyTWVzaCE6IFRIUkVFLk1lc2g7XHJcbiAgICBwcml2YXRlIGdyb3VuZE1lc2ghOiBUSFJFRS5NZXNoO1xyXG5cclxuICAgIC8vIElucHV0IGhhbmRsaW5nIHN0YXRlXHJcbiAgICBwcml2YXRlIGtleXM6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307IC8vIFRyYWNrcyBjdXJyZW50bHkgcHJlc3NlZCBrZXlzXHJcbiAgICBwcml2YXRlIGlzUG9pbnRlckxvY2tlZDogYm9vbGVhbiA9IGZhbHNlOyAvLyBUcnVlIGlmIG1vdXNlIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICBwcml2YXRlIGNhbWVyYVBpdGNoOiBudW1iZXIgPSAwOyAvLyBWZXJ0aWNhbCByb3RhdGlvbiAocGl0Y2gpIG9mIHRoZSBjYW1lcmFcclxuXHJcbiAgICAvLyBBc3NldCBtYW5hZ2VtZW50XHJcbiAgICBwcml2YXRlIHRleHR1cmVzOiBNYXA8c3RyaW5nLCBUSFJFRS5UZXh0dXJlPiA9IG5ldyBNYXAoKTsgLy8gU3RvcmVzIGxvYWRlZCB0ZXh0dXJlc1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpOyAvLyBTdG9yZXMgbG9hZGVkIGF1ZGlvIGVsZW1lbnRzXHJcblxyXG4gICAgLy8gVUkgZWxlbWVudHMgKGR5bmFtaWNhbGx5IGNyZWF0ZWQgZm9yIHRoZSB0aXRsZSBzY3JlZW4pXHJcbiAgICBwcml2YXRlIHRpdGxlU2NyZWVuT3ZlcmxheSE6IEhUTUxEaXZFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSB0aXRsZVRleHQhOiBIVE1MRGl2RWxlbWVudDtcclxuICAgIHByaXZhdGUgcHJvbXB0VGV4dCE6IEhUTUxEaXZFbGVtZW50O1xyXG5cclxuICAgIC8vIEZvciBjYWxjdWxhdGluZyBkZWx0YSB0aW1lIGJldHdlZW4gZnJhbWVzXHJcbiAgICBwcml2YXRlIGxhc3RUaW1lOiBET01IaWdoUmVzVGltZVN0YW1wID0gMDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICAvLyBHZXQgdGhlIGNhbnZhcyBlbGVtZW50IGZyb20gaW5kZXguaHRtbFxyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0NhbnZhcyBlbGVtZW50IHdpdGggSUQgXCJnYW1lQ2FudmFzXCIgbm90IGZvdW5kIScpO1xyXG4gICAgICAgICAgICByZXR1cm47IC8vIENhbm5vdCBwcm9jZWVkIHdpdGhvdXQgYSBjYW52YXNcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5pbml0KCk7IC8vIFN0YXJ0IHRoZSBhc3luY2hyb25vdXMgaW5pdGlhbGl6YXRpb24gcHJvY2Vzc1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXN5bmNocm9ub3VzbHkgaW5pdGlhbGl6ZXMgdGhlIGdhbWUsIGxvYWRpbmcgY29uZmlnLCBhc3NldHMsIGFuZCBzZXR0aW5nIHVwIHN5c3RlbXMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXN5bmMgaW5pdCgpIHtcclxuICAgICAgICAvLyAxLiBMb2FkIGdhbWUgY29uZmlndXJhdGlvbiBmcm9tIGRhdGEuanNvblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgZXJyb3IhIHN0YXR1czogJHtyZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5jb25maWcgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdHYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkOicsIHRoaXMuY29uZmlnKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb246JywgZXJyb3IpO1xyXG4gICAgICAgICAgICAvLyBJZiBjb25maWd1cmF0aW9uIGZhaWxzIHRvIGxvYWQsIGRpc3BsYXkgYW4gZXJyb3IgbWVzc2FnZSBhbmQgc3RvcC5cclxuICAgICAgICAgICAgY29uc3QgZXJyb3JEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS50b3AgPSAnNTAlJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUubGVmdCA9ICc1MCUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS50cmFuc2Zvcm0gPSAndHJhbnNsYXRlKC01MCUsIC01MCUpJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUuY29sb3IgPSAncmVkJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUuZm9udFNpemUgPSAnMjRweCc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnRleHRDb250ZW50ID0gJ0Vycm9yOiBGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb24uIENoZWNrIGNvbnNvbGUgZm9yIGRldGFpbHMuJztcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlcnJvckRpdik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIDIuIEluaXRpYWxpemUgVGhyZWUuanMgKHNjZW5lLCBjYW1lcmEsIHJlbmRlcmVyKVxyXG4gICAgICAgIHRoaXMuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYShcclxuICAgICAgICAgICAgNzUsIC8vIEZpZWxkIG9mIFZpZXcgKEZPVilcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZpeGVkQXNwZWN0UmF0aW8ud2lkdGggLyB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby5oZWlnaHQsIC8vIEZpeGVkIEFzcGVjdCByYXRpbyBmcm9tIGNvbmZpZ1xyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FtZXJhTmVhciwgLy8gTmVhciBjbGlwcGluZyBwbGFuZVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FtZXJhRmFyICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lXHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoeyBjYW52YXM6IHRoaXMuY2FudmFzLCBhbnRpYWxpYXM6IHRydWUgfSk7XHJcbiAgICAgICAgLy8gUmVuZGVyZXIgc2l6ZSB3aWxsIGJlIHNldCBieSBhcHBseUZpeGVkQXNwZWN0UmF0aW8gdG8gZml0IHRoZSB3aW5kb3cgd2hpbGUgbWFpbnRhaW5pbmcgYXNwZWN0IHJhdGlvXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRQaXhlbFJhdGlvKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC5lbmFibGVkID0gdHJ1ZTsgLy8gRW5hYmxlIHNoYWRvd3MgZm9yIGJldHRlciByZWFsaXNtXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zaGFkb3dNYXAudHlwZSA9IFRIUkVFLlBDRlNvZnRTaGFkb3dNYXA7IC8vIFVzZSBzb2Z0IHNoYWRvd3NcclxuXHJcbiAgICAgICAgLy8gQ2FtZXJhIHNldHVwIGZvciBkZWNvdXBsZWQgeWF3IGFuZCBwaXRjaDpcclxuICAgICAgICAvLyBjYW1lcmFDb250YWluZXIgaGFuZGxlcyB5YXcgKGhvcml6b250YWwgcm90YXRpb24pIGFuZCBmb2xsb3dzIHRoZSBwbGF5ZXIncyBwb3NpdGlvbi5cclxuICAgICAgICAvLyBUaGUgY2FtZXJhIGl0c2VsZiBpcyBhIGNoaWxkIG9mIGNhbWVyYUNvbnRhaW5lciBhbmQgaGFuZGxlcyBwaXRjaCAodmVydGljYWwgcm90YXRpb24pLlxyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyID0gbmV3IFRIUkVFLk9iamVjdDNEKCk7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5jYW1lcmFDb250YWluZXIpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLmFkZCh0aGlzLmNhbWVyYSk7XHJcbiAgICAgICAgLy8gUG9zaXRpb24gdGhlIGNhbWVyYSByZWxhdGl2ZSB0byB0aGUgY2FtZXJhQ29udGFpbmVyIChhdCBleWUgbGV2ZWwpXHJcbiAgICAgICAgdGhpcy5jYW1lcmEucG9zaXRpb24ueSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFIZWlnaHRPZmZzZXQ7XHJcblxyXG5cclxuICAgICAgICAvLyAzLiBJbml0aWFsaXplIENhbm5vbi1lcyAocGh5c2ljcyB3b3JsZClcclxuICAgICAgICB0aGlzLndvcmxkID0gbmV3IENBTk5PTi5Xb3JsZCgpO1xyXG4gICAgICAgIHRoaXMud29ybGQuZ3Jhdml0eS5zZXQoMCwgLTkuODIsIDApOyAvLyBTZXQgc3RhbmRhcmQgRWFydGggZ3Jhdml0eSAoWS1heGlzIGRvd24pXHJcbiAgICAgICAgdGhpcy53b3JsZC5icm9hZHBoYXNlID0gbmV3IENBTk5PTi5TQVBCcm9hZHBoYXNlKHRoaXMud29ybGQpOyAvLyBVc2UgYW4gZWZmaWNpZW50IGJyb2FkcGhhc2UgYWxnb3JpdGhtXHJcbiAgICAgICAgLy8gRml4OiBDYXN0IHRoaXMud29ybGQuc29sdmVyIHRvIENBTk5PTi5HU1NvbHZlciB0byBhY2Nlc3MgdGhlICdpdGVyYXRpb25zJyBwcm9wZXJ0eVxyXG4gICAgICAgIC8vIFRoZSBkZWZhdWx0IHNvbHZlciBpbiBDYW5ub24uanMgKGFuZCBDYW5ub24tZXMpIGlzIEdTU29sdmVyLCB3aGljaCBoYXMgdGhpcyBwcm9wZXJ0eS5cclxuICAgICAgICAodGhpcy53b3JsZC5zb2x2ZXIgYXMgQ0FOTk9OLkdTU29sdmVyKS5pdGVyYXRpb25zID0gMTA7IC8vIEluY3JlYXNlIHNvbHZlciBpdGVyYXRpb25zIGZvciBiZXR0ZXIgc3RhYmlsaXR5XHJcblxyXG4gICAgICAgIC8vIDQuIExvYWQgYXNzZXRzICh0ZXh0dXJlcyBhbmQgc291bmRzKVxyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG5cclxuICAgICAgICAvLyA1LiBTZXR1cCBldmVudCBsaXN0ZW5lcnMgZm9yIHVzZXIgaW5wdXQgYW5kIHdpbmRvdyByZXNpemluZ1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCB0aGlzLm9uV2luZG93UmVzaXplLmJpbmQodGhpcykpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLm9uS2V5RG93bi5iaW5kKHRoaXMpKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIHRoaXMub25LZXlVcC5iaW5kKHRoaXMpKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCB0aGlzLm9uTW91c2VNb3ZlLmJpbmQodGhpcykpOyAvLyBGb3IgbW91c2UgbG9va1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJsb2NrY2hhbmdlJywgdGhpcy5vblBvaW50ZXJMb2NrQ2hhbmdlLmJpbmQodGhpcykpOyAvLyBGb3IgcG9pbnRlciBsb2NrIHN0YXR1c1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21venBvaW50ZXJsb2NrY2hhbmdlJywgdGhpcy5vblBvaW50ZXJMb2NrQ2hhbmdlLmJpbmQodGhpcykpOyAvLyBGaXJlZm94IGNvbXBhdGliaWxpdHlcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCd3ZWJraXRwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gV2Via2l0IGNvbXBhdGliaWxpdHlcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgaW5pdGlhbCBmaXhlZCBhc3BlY3QgcmF0aW8gYW5kIGNlbnRlciB0aGUgY2FudmFzXHJcbiAgICAgICAgdGhpcy5hcHBseUZpeGVkQXNwZWN0UmF0aW8oKTtcclxuXHJcbiAgICAgICAgLy8gNi4gQ3JlYXRlIGdhbWUgb2JqZWN0cyAocGxheWVyLCBncm91bmQpIGFuZCBsaWdodGluZ1xyXG4gICAgICAgIHRoaXMuY3JlYXRlR3JvdW5kKCk7XHJcbiAgICAgICAgdGhpcy5jcmVhdGVQbGF5ZXIoKTtcclxuICAgICAgICB0aGlzLnNldHVwTGlnaHRpbmcoKTtcclxuXHJcbiAgICAgICAgLy8gNy4gU2V0dXAgdGhlIHRpdGxlIHNjcmVlbiBVSVxyXG4gICAgICAgIHRoaXMuc2V0dXBUaXRsZVNjcmVlbigpO1xyXG5cclxuICAgICAgICAvLyBTdGFydCB0aGUgbWFpbiBnYW1lIGxvb3BcclxuICAgICAgICB0aGlzLmFuaW1hdGUoMCk7IC8vIFBhc3MgaW5pdGlhbCB0aW1lIDBcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIExvYWRzIGFsbCB0ZXh0dXJlcyBhbmQgc291bmRzIGRlZmluZWQgaW4gdGhlIGdhbWUgY29uZmlndXJhdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQXNzZXRzKCkge1xyXG4gICAgICAgIGNvbnN0IHRleHR1cmVMb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuaW1hZ2VzLm1hcChpbWcgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gdGV4dHVyZUxvYWRlci5sb2FkQXN5bmMoaW1nLnBhdGgpXHJcbiAgICAgICAgICAgICAgICAudGhlbih0ZXh0dXJlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmVzLnNldChpbWcubmFtZSwgdGV4dHVyZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nOyAvLyBSZXBlYXQgdGV4dHVyZSBob3Jpem9udGFsbHlcclxuICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7IC8vIFJlcGVhdCB0ZXh0dXJlIHZlcnRpY2FsbHlcclxuICAgICAgICAgICAgICAgICAgICAvLyBBZGp1c3QgdGV4dHVyZSByZXBldGl0aW9uIGZvciB0aGUgZ3JvdW5kIHRvIGF2b2lkIHN0cmV0Y2hpbmdcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW1nLm5hbWUgPT09ICdncm91bmRfdGV4dHVyZScpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgIHRleHR1cmUucmVwZWF0LnNldCh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplIC8gNSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgdGV4dHVyZTogJHtpbWcucGF0aH1gLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQ29udGludWUgZXZlbiBpZiBhbiBhc3NldCBmYWlscyB0byBsb2FkOyBmYWxsYmFja3MgKHNvbGlkIGNvbG9ycykgYXJlIHVzZWQuXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMubWFwKHNvdW5kID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbyhzb3VuZC5wYXRoKTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNvdW5kLnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLmxvb3AgPSAoc291bmQubmFtZSA9PT0gJ2JhY2tncm91bmRfbXVzaWMnKTsgLy8gTG9vcCBiYWNrZ3JvdW5kIG11c2ljXHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc291bmRzLnNldChzb3VuZC5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7c291bmQucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7IC8vIFJlc29sdmUgZXZlbiBvbiBlcnJvciB0byBub3QgYmxvY2sgUHJvbWlzZS5hbGxcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBBc3NldHMgbG9hZGVkOiAke3RoaXMudGV4dHVyZXMuc2l6ZX0gdGV4dHVyZXMsICR7dGhpcy5zb3VuZHMuc2l6ZX0gc291bmRzLmApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhbmQgZGlzcGxheXMgdGhlIHRpdGxlIHNjcmVlbiBVSSBkeW5hbWljYWxseS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzZXR1cFRpdGxlU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5zdHlsZSwge1xyXG4gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJywgLy8gUG9zaXRpb24gcmVsYXRpdmUgdG8gYm9keSwgd2lsbCBiZSBjZW50ZXJlZCBhbmQgc2l6ZWQgYnkgYXBwbHlGaXhlZEFzcGVjdFJhdGlvXHJcbiAgICAgICAgICAgIGJhY2tncm91bmRDb2xvcjogJ3JnYmEoMCwgMCwgMCwgMC44KScsXHJcbiAgICAgICAgICAgIGRpc3BsYXk6ICdmbGV4JywgZmxleERpcmVjdGlvbjogJ2NvbHVtbicsXHJcbiAgICAgICAgICAgIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJywgYWxpZ25JdGVtczogJ2NlbnRlcicsXHJcbiAgICAgICAgICAgIGNvbG9yOiAnd2hpdGUnLCBmb250RmFtaWx5OiAnQXJpYWwsIHNhbnMtc2VyaWYnLFxyXG4gICAgICAgICAgICBmb250U2l6ZTogJzQ4cHgnLCB0ZXh0QWxpZ246ICdjZW50ZXInLCB6SW5kZXg6ICcxMDAwJ1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkpO1xyXG5cclxuICAgICAgICAvLyBDcnVjaWFsOiBDYWxsIGFwcGx5Rml4ZWRBc3BlY3RSYXRpbyBoZXJlIHRvIGVuc3VyZSB0aGUgdGl0bGUgc2NyZWVuIG92ZXJsYXlcclxuICAgICAgICAvLyBpcyBzaXplZCBhbmQgcG9zaXRpb25lZCBjb3JyZWN0bHkgcmVsYXRpdmUgdG8gdGhlIGNhbnZhcyBmcm9tIHRoZSBzdGFydC5cclxuICAgICAgICB0aGlzLmFwcGx5Rml4ZWRBc3BlY3RSYXRpbygpO1xyXG5cclxuICAgICAgICB0aGlzLnRpdGxlVGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIHRoaXMudGl0bGVUZXh0LnRleHRDb250ZW50ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnRpdGxlU2NyZWVuVGV4dDtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hcHBlbmRDaGlsZCh0aGlzLnRpdGxlVGV4dCk7XHJcblxyXG4gICAgICAgIHRoaXMucHJvbXB0VGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIHRoaXMucHJvbXB0VGV4dC50ZXh0Q29udGVudCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5zdGFydEdhbWVQcm9tcHQ7XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnByb21wdFRleHQuc3R5bGUsIHtcclxuICAgICAgICAgICAgbWFyZ2luVG9wOiAnMjBweCcsIGZvbnRTaXplOiAnMjRweCdcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hcHBlbmRDaGlsZCh0aGlzLnByb21wdFRleHQpO1xyXG5cclxuICAgICAgICAvLyBBZGQgZXZlbnQgbGlzdGVuZXIgZGlyZWN0bHkgdG8gdGhlIG92ZXJsYXkgdG8gY2FwdHVyZSBjbGlja3MgYW5kIHN0YXJ0IHRoZSBnYW1lXHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB0aGlzLnN0YXJ0R2FtZSgpKTtcclxuXHJcbiAgICAgICAgLy8gQXR0ZW1wdCB0byBwbGF5IGJhY2tncm91bmQgbXVzaWMuIEl0IG1pZ2h0IGJlIGJsb2NrZWQgYnkgYnJvd3NlcnMgaWYgbm8gdXNlciBnZXN0dXJlIGhhcyBvY2N1cnJlZCB5ZXQuXHJcbiAgICAgICAgdGhpcy5zb3VuZHMuZ2V0KCdiYWNrZ3JvdW5kX211c2ljJyk/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiQkdNIHBsYXkgZGVuaWVkIChyZXF1aXJlcyB1c2VyIGdlc3R1cmUpOlwiLCBlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUcmFuc2l0aW9ucyB0aGUgZ2FtZSBmcm9tIHRoZSB0aXRsZSBzY3JlZW4gdG8gdGhlIHBsYXlpbmcgc3RhdGUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhcnRHYW1lKCkge1xyXG4gICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICAvLyBSZW1vdmUgdGhlIHRpdGxlIHNjcmVlbiBvdmVybGF5XHJcbiAgICAgICAgaWYgKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5ICYmIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LnBhcmVudE5vZGUpIHtcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZCh0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIEFkZCBldmVudCBsaXN0ZW5lciB0byBjYW52YXMgZm9yIHJlLWxvY2tpbmcgcG9pbnRlciBhZnRlciB0aXRsZSBzY3JlZW4gaXMgZ29uZVxyXG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5oYW5kbGVDYW52YXNSZUxvY2tQb2ludGVyLmJpbmQodGhpcykpO1xyXG5cclxuICAgICAgICAvLyBSZXF1ZXN0IHBvaW50ZXIgbG9jayBmb3IgaW1tZXJzaXZlIG1vdXNlIGNvbnRyb2xcclxuICAgICAgICB0aGlzLmNhbnZhcy5yZXF1ZXN0UG9pbnRlckxvY2soKTtcclxuICAgICAgICAvLyBFbnN1cmUgYmFja2dyb3VuZCBtdXNpYyBwbGF5cyBub3cgdGhhdCBhIHVzZXIgZ2VzdHVyZSBoYXMgb2NjdXJyZWRcclxuICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ2JhY2tncm91bmRfbXVzaWMnKT8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJCR00gcGxheSBmYWlsZWQgYWZ0ZXIgdXNlciBnZXN0dXJlOlwiLCBlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGVzIGNsaWNrcyBvbiB0aGUgY2FudmFzIHRvIHJlLWxvY2sgdGhlIHBvaW50ZXIgaWYgdGhlIGdhbWUgaXMgcGxheWluZyBhbmQgdW5sb2NrZWQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlQ2FudmFzUmVMb2NrUG9pbnRlcigpIHtcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgIXRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLnJlcXVlc3RQb2ludGVyTG9jaygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgdGhlIHBsYXllcidzIHZpc3VhbCBtZXNoIGFuZCBwaHlzaWNzIGJvZHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY3JlYXRlUGxheWVyKCkge1xyXG4gICAgICAgIC8vIFBsYXllciB2aXN1YWwgbWVzaCAoYSBzaW1wbGUgYm94KVxyXG4gICAgICAgIGNvbnN0IHBsYXllclRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgncGxheWVyX3RleHR1cmUnKTtcclxuICAgICAgICBjb25zdCBwbGF5ZXJNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgbWFwOiBwbGF5ZXJUZXh0dXJlLFxyXG4gICAgICAgICAgICBjb2xvcjogcGxheWVyVGV4dHVyZSA/IDB4ZmZmZmZmIDogMHgwMDc3ZmYgLy8gVXNlIHdoaXRlIHdpdGggdGV4dHVyZSwgb3IgYmx1ZSBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgcGxheWVyR2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMSwgMiwgMSk7IC8vIFBsYXllciBkaW1lbnNpb25zXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoID0gbmV3IFRIUkVFLk1lc2gocGxheWVyR2VvbWV0cnksIHBsYXllck1hdGVyaWFsKTtcclxuICAgICAgICB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueSA9IDU7IC8vIFN0YXJ0IHBsYXllciBzbGlnaHRseSBhYm92ZSB0aGUgZ3JvdW5kXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLmNhc3RTaGFkb3cgPSB0cnVlOyAvLyBQbGF5ZXIgY2FzdHMgYSBzaGFkb3dcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLnBsYXllck1lc2gpO1xyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgcGh5c2ljcyBib2R5IChDYW5ub24uanMgYm94IHNoYXBlKVxyXG4gICAgICAgIGNvbnN0IHBsYXllclNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKDAuNSwgMSwgMC41KSk7IC8vIEhhbGYgZXh0ZW50cyBvZiB0aGUgYm94IGZvciBjb2xsaXNpb25cclxuICAgICAgICB0aGlzLnBsYXllckJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyTWFzcywgLy8gUGxheWVyJ3MgbWFzc1xyXG4gICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi54LCB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueSwgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLnopLFxyXG4gICAgICAgICAgICBzaGFwZTogcGxheWVyU2hhcGUsXHJcbiAgICAgICAgICAgIGZpeGVkUm90YXRpb246IHRydWUgLy8gUHJldmVudCB0aGUgcGxheWVyIGZyb20gZmFsbGluZyBvdmVyIChzaW11bGF0ZXMgYSBjYXBzdWxlL2N5bGluZGVyIGNoYXJhY3RlcilcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkodGhpcy5wbGF5ZXJCb2R5KTtcclxuXHJcbiAgICAgICAgLy8gU2V0IGluaXRpYWwgY2FtZXJhQ29udGFpbmVyIHBvc2l0aW9uIHRvIHBsYXllcidzIHBoeXNpY3MgYm9keSBwb3NpdGlvbi5cclxuICAgICAgICAvLyBUaGUgY2FtZXJhIGl0c2VsZiBpcyBhIGNoaWxkIG9mIGNhbWVyYUNvbnRhaW5lciBhbmQgaGFzIGl0cyBvd24gbG9jYWwgWSBvZmZzZXQuXHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIucG9zaXRpb24uY29weSh0aGlzLnBsYXllckJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgdGhlIGdyb3VuZCdzIHZpc3VhbCBtZXNoIGFuZCBwaHlzaWNzIGJvZHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY3JlYXRlR3JvdW5kKCkge1xyXG4gICAgICAgIC8vIEdyb3VuZCB2aXN1YWwgbWVzaCAoYSBsYXJnZSBwbGFuZSlcclxuICAgICAgICBjb25zdCBncm91bmRUZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQoJ2dyb3VuZF90ZXh0dXJlJyk7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogZ3JvdW5kVGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3I6IGdyb3VuZFRleHR1cmUgPyAweGZmZmZmZiA6IDB4ODg4ODg4IC8vIFVzZSB3aGl0ZSB3aXRoIHRleHR1cmUsIG9yIGdyZXkgaWYgbm8gdGV4dHVyZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZEdlb21ldHJ5ID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplKTtcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2ggPSBuZXcgVEhSRUUuTWVzaChncm91bmRHZW9tZXRyeSwgZ3JvdW5kTWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWVzaC5yb3RhdGlvbi54ID0gLU1hdGguUEkgLyAyOyAvLyBSb3RhdGUgdG8gbGF5IGZsYXQgb24gdGhlIFhaIHBsYW5lXHJcbiAgICAgICAgdGhpcy5ncm91bmRNZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlOyAvLyBHcm91bmQgcmVjZWl2ZXMgc2hhZG93c1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMuZ3JvdW5kTWVzaCk7XHJcblxyXG4gICAgICAgIC8vIEdyb3VuZCBwaHlzaWNzIGJvZHkgKENhbm5vbi5qcyBwbGFuZSBzaGFwZSlcclxuICAgICAgICBjb25zdCBncm91bmRTaGFwZSA9IG5ldyBDQU5OT04uUGxhbmUoKTtcclxuICAgICAgICB0aGlzLmdyb3VuZEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiAwLCAvLyBBIG1hc3Mgb2YgMCBtYWtlcyBpdCBhIHN0YXRpYyAoaW1tb3ZhYmxlKSBib2R5XHJcbiAgICAgICAgICAgIHNoYXBlOiBncm91bmRTaGFwZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIC8vIFJvdGF0ZSB0aGUgQ2Fubm9uLmpzIHBsYW5lIGJvZHkgdG8gbWF0Y2ggdGhlIFRocmVlLmpzIHBsYW5lIG9yaWVudGF0aW9uIChmbGF0KVxyXG4gICAgICAgIHRoaXMuZ3JvdW5kQm9keS5xdWF0ZXJuaW9uLnNldEZyb21BeGlzQW5nbGUobmV3IENBTk5PTi5WZWMzKDEsIDAsIDApLCAtTWF0aC5QSSAvIDIpO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLmdyb3VuZEJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyB1cCBhbWJpZW50IGFuZCBkaXJlY3Rpb25hbCBsaWdodGluZyBpbiB0aGUgc2NlbmUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc2V0dXBMaWdodGluZygpIHtcclxuICAgICAgICBjb25zdCBhbWJpZW50TGlnaHQgPSBuZXcgVEhSRUUuQW1iaWVudExpZ2h0KDB4NDA0MDQwLCAxLjApOyAvLyBTb2Z0IHdoaXRlIGFtYmllbnQgbGlnaHRcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChhbWJpZW50TGlnaHQpO1xyXG5cclxuICAgICAgICBjb25zdCBkaXJlY3Rpb25hbExpZ2h0ID0gbmV3IFRIUkVFLkRpcmVjdGlvbmFsTGlnaHQoMHhmZmZmZmYsIDAuOCk7IC8vIEJyaWdodGVyIGRpcmVjdGlvbmFsIGxpZ2h0XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5wb3NpdGlvbi5zZXQoNSwgMTAsIDUpOyAvLyBQb3NpdGlvbiB0aGUgbGlnaHQgc291cmNlXHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5jYXN0U2hhZG93ID0gdHJ1ZTsgLy8gRW5hYmxlIHNoYWRvd3MgZnJvbSB0aGlzIGxpZ2h0IHNvdXJjZVxyXG4gICAgICAgIC8vIENvbmZpZ3VyZSBzaGFkb3cgcHJvcGVydGllcyBmb3IgdGhlIGRpcmVjdGlvbmFsIGxpZ2h0XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cubWFwU2l6ZS53aWR0aCA9IDEwMjQ7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cubWFwU2l6ZS5oZWlnaHQgPSAxMDI0O1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5uZWFyID0gMC41O1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5mYXIgPSA1MDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEubGVmdCA9IC0xMDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEucmlnaHQgPSAxMDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEudG9wID0gMTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmJvdHRvbSA9IC0xMDtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChkaXJlY3Rpb25hbExpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgd2luZG93IHJlc2l6aW5nIHRvIGtlZXAgdGhlIGNhbWVyYSBhc3BlY3QgcmF0aW8gYW5kIHJlbmRlcmVyIHNpemUgY29ycmVjdC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbldpbmRvd1Jlc2l6ZSgpIHtcclxuICAgICAgICB0aGlzLmFwcGx5Rml4ZWRBc3BlY3RSYXRpbygpOyAvLyBBcHBseSB0aGUgZml4ZWQgYXNwZWN0IHJhdGlvIGFuZCBjZW50ZXIgdGhlIGNhbnZhc1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXBwbGllcyB0aGUgY29uZmlndXJlZCBmaXhlZCBhc3BlY3QgcmF0aW8gdG8gdGhlIHJlbmRlcmVyIGFuZCBjYW1lcmEsXHJcbiAgICAgKiByZXNpemluZyBhbmQgY2VudGVyaW5nIHRoZSBjYW52YXMgdG8gZml0IHdpdGhpbiB0aGUgd2luZG93LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFwcGx5Rml4ZWRBc3BlY3RSYXRpbygpIHtcclxuICAgICAgICBjb25zdCB0YXJnZXRBc3BlY3RSYXRpbyA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5maXhlZEFzcGVjdFJhdGlvLndpZHRoIC8gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZpeGVkQXNwZWN0UmF0aW8uaGVpZ2h0O1xyXG5cclxuICAgICAgICBsZXQgbmV3V2lkdGg6IG51bWJlcjtcclxuICAgICAgICBsZXQgbmV3SGVpZ2h0OiBudW1iZXI7XHJcblxyXG4gICAgICAgIGNvbnN0IHdpbmRvd1dpZHRoID0gd2luZG93LmlubmVyV2lkdGg7XHJcbiAgICAgICAgY29uc3Qgd2luZG93SGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRXaW5kb3dBc3BlY3RSYXRpbyA9IHdpbmRvd1dpZHRoIC8gd2luZG93SGVpZ2h0O1xyXG5cclxuICAgICAgICBpZiAoY3VycmVudFdpbmRvd0FzcGVjdFJhdGlvID4gdGFyZ2V0QXNwZWN0UmF0aW8pIHtcclxuICAgICAgICAgICAgLy8gV2luZG93IGlzIHdpZGVyIHRoYW4gdGFyZ2V0IGFzcGVjdCByYXRpbywgaGVpZ2h0IGlzIHRoZSBsaW1pdGluZyBmYWN0b3JcclxuICAgICAgICAgICAgbmV3SGVpZ2h0ID0gd2luZG93SGVpZ2h0O1xyXG4gICAgICAgICAgICBuZXdXaWR0aCA9IG5ld0hlaWdodCAqIHRhcmdldEFzcGVjdFJhdGlvO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIFdpbmRvdyBpcyB0YWxsZXIgKG9yIGV4YWN0bHkpIHRoZSB0YXJnZXQgYXNwZWN0IHJhdGlvLCB3aWR0aCBpcyB0aGUgbGltaXRpbmcgZmFjdG9yXHJcbiAgICAgICAgICAgIG5ld1dpZHRoID0gd2luZG93V2lkdGg7XHJcbiAgICAgICAgICAgIG5ld0hlaWdodCA9IG5ld1dpZHRoIC8gdGFyZ2V0QXNwZWN0UmF0aW87XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTZXQgcmVuZGVyZXIgc2l6ZS4gVGhlIHRoaXJkIGFyZ3VtZW50IGB1cGRhdGVTdHlsZWAgaXMgZmFsc2UgYmVjYXVzZSB3ZSBtYW5hZ2Ugc3R5bGUgbWFudWFsbHkuXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKG5ld1dpZHRoLCBuZXdIZWlnaHQsIGZhbHNlKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5hc3BlY3QgPSB0YXJnZXRBc3BlY3RSYXRpbztcclxuICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XHJcblxyXG4gICAgICAgIC8vIFBvc2l0aW9uIGFuZCBzaXplIHRoZSBjYW52YXMgZWxlbWVudCB1c2luZyBDU1NcclxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMuY2FudmFzLnN0eWxlLCB7XHJcbiAgICAgICAgICAgIHdpZHRoOiBgJHtuZXdXaWR0aH1weGAsXHJcbiAgICAgICAgICAgIGhlaWdodDogYCR7bmV3SGVpZ2h0fXB4YCxcclxuICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXHJcbiAgICAgICAgICAgIHRvcDogJzUwJScsXHJcbiAgICAgICAgICAgIGxlZnQ6ICc1MCUnLFxyXG4gICAgICAgICAgICB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknLFxyXG4gICAgICAgICAgICBvYmplY3RGaXQ6ICdjb250YWluJyAvLyBFbnN1cmVzIGNvbnRlbnQgaXMgc2NhbGVkIGFwcHJvcHJpYXRlbHkgaWYgdGhlcmUncyBhbnkgbWlzbWF0Y2hcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlIHRpdGxlIHNjcmVlbiBpcyBhY3RpdmUsIHVwZGF0ZSBpdHMgc2l6ZSBhbmQgcG9zaXRpb24gYXMgd2VsbCB0byBtYXRjaCB0aGUgY2FudmFzXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSAmJiB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSkge1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LnN0eWxlLCB7XHJcbiAgICAgICAgICAgICAgICB3aWR0aDogYCR7bmV3V2lkdGh9cHhgLFxyXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBgJHtuZXdIZWlnaHR9cHhgLFxyXG4gICAgICAgICAgICAgICAgdG9wOiAnNTAlJyxcclxuICAgICAgICAgICAgICAgIGxlZnQ6ICc1MCUnLFxyXG4gICAgICAgICAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsIC01MCUpJyxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVjb3JkcyB3aGljaCBrZXlzIGFyZSBjdXJyZW50bHkgcHJlc3NlZCBkb3duLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAgICAgIHRoaXMua2V5c1tldmVudC5rZXkudG9Mb3dlckNhc2UoKV0gPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVjb3JkcyB3aGljaCBrZXlzIGFyZSBjdXJyZW50bHkgcmVsZWFzZWQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25LZXlVcChldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAgICAgIHRoaXMua2V5c1tldmVudC5rZXkudG9Mb3dlckNhc2UoKV0gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgbW91c2UgbW92ZW1lbnQgZm9yIGNhbWVyYSByb3RhdGlvbiAobW91c2UgbG9vaykuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25Nb3VzZU1vdmUoZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgICAgICAvLyBPbmx5IHByb2Nlc3MgbW91c2UgbW92ZW1lbnQgaWYgdGhlIGdhbWUgaXMgcGxheWluZyBhbmQgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgY29uc3QgbW92ZW1lbnRYID0gZXZlbnQubW92ZW1lbnRYIHx8IDA7XHJcbiAgICAgICAgICAgIGNvbnN0IG1vdmVtZW50WSA9IGV2ZW50Lm1vdmVtZW50WSB8fCAwO1xyXG5cclxuICAgICAgICAgICAgLy8gQXBwbHkgaG9yaXpvbnRhbCByb3RhdGlvbiAoeWF3KSB0byB0aGUgY2FtZXJhQ29udGFpbmVyIGFyb3VuZCBpdHMgbG9jYWwgWS1heGlzICh3aGljaCBpcyBnbG9iYWwgWSlcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIucm90YXRpb24ueSAtPSBtb3ZlbWVudFggKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubW91c2VTZW5zaXRpdml0eTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFwcGx5IHZlcnRpY2FsIHJvdGF0aW9uIChwaXRjaCkgdG8gdGhlIGNhbWVyYSBpdHNlbGYgYW5kIGNsYW1wIGl0XHJcbiAgICAgICAgICAgIC8vIE1vdXNlIFVQIChtb3ZlbWVudFkgPCAwKSBub3cgaW5jcmVhc2VzIGNhbWVyYVBpdGNoIC0+IGxvb2tzIHVwLlxyXG4gICAgICAgICAgICAvLyBNb3VzZSBET1dOIChtb3ZlbWVudFkgPiAwKSBub3cgZGVjcmVhc2VzIGNhbWVyYVBpdGNoIC0+IGxvb2tzIGRvd24uXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUGl0Y2ggLT0gbW92ZW1lbnRZICogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm1vdXNlU2Vuc2l0aXZpdHk7IFxyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYVBpdGNoID0gTWF0aC5tYXgoLU1hdGguUEkgLyAyLCBNYXRoLm1pbihNYXRoLlBJIC8gMiwgdGhpcy5jYW1lcmFQaXRjaCkpOyAvLyBDbGFtcCB0byAtOTAgdG8gKzkwIGRlZ3JlZXNcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmEucm90YXRpb24ueCA9IHRoaXMuY2FtZXJhUGl0Y2g7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXBkYXRlcyB0aGUgcG9pbnRlciBsb2NrIHN0YXR1cyB3aGVuIGl0IGNoYW5nZXMgKGUuZy4sIHVzZXIgcHJlc3NlcyBFc2MpLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uUG9pbnRlckxvY2tDaGFuZ2UoKSB7XHJcbiAgICAgICAgaWYgKGRvY3VtZW50LnBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXMgfHxcclxuICAgICAgICAgICAgKGRvY3VtZW50IGFzIGFueSkubW96UG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLmNhbnZhcyB8fFxyXG4gICAgICAgICAgICAoZG9jdW1lbnQgYXMgYW55KS53ZWJraXRQb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNQb2ludGVyTG9ja2VkID0gdHJ1ZTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1BvaW50ZXIgbG9ja2VkJyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5pc1BvaW50ZXJMb2NrZWQgPSBmYWxzZTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1BvaW50ZXIgdW5sb2NrZWQnKTtcclxuICAgICAgICAgICAgLy8gV2hlbiBwb2ludGVyIGlzIHVubG9ja2VkIGJ5IHVzZXIgKGUuZy4sIHByZXNzaW5nIEVzYyksIGN1cnNvciBhcHBlYXJzIGF1dG9tYXRpY2FsbHkuXHJcbiAgICAgICAgICAgIC8vIE1vdXNlIGxvb2sgc3RvcHMgZHVlIHRvIGBpc1BvaW50ZXJMb2NrZWRgIGNoZWNrIGluIG9uTW91c2VNb3ZlLlxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRoZSBtYWluIGdhbWUgbG9vcCwgY2FsbGVkIG9uIGV2ZXJ5IGFuaW1hdGlvbiBmcmFtZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhbmltYXRlKHRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXApIHtcclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5hbmltYXRlLmJpbmQodGhpcykpOyAvLyBSZXF1ZXN0IG5leHQgZnJhbWVcclxuXHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKHRpbWUgLSB0aGlzLmxhc3RUaW1lKSAvIDEwMDA7IC8vIENhbGN1bGF0ZSBkZWx0YSB0aW1lIGluIHNlY29uZHNcclxuICAgICAgICB0aGlzLmxhc3RUaW1lID0gdGltZTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlUGxheWVyTW92ZW1lbnQoKTsgLy8gVXBkYXRlIHBsYXllcidzIHZlbG9jaXR5IGJhc2VkIG9uIGlucHV0XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlUGh5c2ljcyhkZWx0YVRpbWUpOyAvLyBTdGVwIHRoZSBwaHlzaWNzIHdvcmxkXHJcbiAgICAgICAgICAgIHRoaXMuY2xhbXBQbGF5ZXJQb3NpdGlvbigpOyAvLyBDbGFtcCBwbGF5ZXIgcG9zaXRpb24gdG8gcHJldmVudCBnb2luZyBiZXlvbmQgZ3JvdW5kIGVkZ2VzXHJcbiAgICAgICAgICAgIHRoaXMuc3luY01lc2hlc1dpdGhCb2RpZXMoKTsgLy8gU3luY2hyb25pemUgdmlzdWFsIG1lc2hlcyB3aXRoIHBoeXNpY3MgYm9kaWVzXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlcih0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYSk7IC8vIFJlbmRlciB0aGUgc2NlbmVcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN0ZXBzIHRoZSBDYW5ub24uanMgcGh5c2ljcyB3b3JsZCBmb3J3YXJkLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZVBoeXNpY3MoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICAvLyB3b3JsZC5zdGVwKGZpeGVkVGltZVN0ZXAsIGRlbHRhVGltZSwgbWF4U3ViU3RlcHMpXHJcbiAgICAgICAgLy8gMS82MDogQSBmaXhlZCB0aW1lIHN0ZXAgb2YgNjAgcGh5c2ljcyB1cGRhdGVzIHBlciBzZWNvbmQgKHN0YW5kYXJkKS5cclxuICAgICAgICAvLyBkZWx0YVRpbWU6IFRoZSBhY3R1YWwgdGltZSBlbGFwc2VkIHNpbmNlIHRoZSBsYXN0IHJlbmRlciBmcmFtZS5cclxuICAgICAgICAvLyBtYXhQaHlzaWNzU3ViU3RlcHM6IExpbWl0cyB0aGUgbnVtYmVyIG9mIHBoeXNpY3Mgc3RlcHMgaW4gb25lIHJlbmRlciBmcmFtZVxyXG4gICAgICAgIC8vIHRvIHByZXZlbnQgaW5zdGFiaWxpdGllcyBpZiByZW5kZXJpbmcgc2xvd3MgZG93biBzaWduaWZpY2FudGx5LlxyXG4gICAgICAgIHRoaXMud29ybGQuc3RlcCgxIC8gNjAsIGRlbHRhVGltZSwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm1heFBoeXNpY3NTdWJTdGVwcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVcGRhdGVzIHRoZSBwbGF5ZXIncyB2ZWxvY2l0eSBiYXNlZCBvbiBXQVNEIGlucHV0IGFuZCBjYW1lcmEgb3JpZW50YXRpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlUGxheWVyTW92ZW1lbnQoKSB7XHJcbiAgICAgICAgLy8gUGxheWVyIG1vdmVtZW50IHNob3VsZCBvbmx5IGhhcHBlbiB3aGVuIHRoZSBwb2ludGVyIGlzIGxvY2tlZFxyXG4gICAgICAgIGlmICghdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgLy8gSWYgcG9pbnRlciBpcyBub3QgbG9ja2VkLCBzdG9wIGhvcml6b250YWwgbW92ZW1lbnQgaW1tZWRpYXRlbHlcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggPSAwO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiA9IDA7XHJcbiAgICAgICAgICAgIHJldHVybjsgLy8gRXhpdCBlYXJseSBhcyBubyBtb3ZlbWVudCBpbnB1dCBzaG91bGQgYmUgcHJvY2Vzc2VkXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBwbGF5ZXJTcGVlZCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJTcGVlZDtcclxuICAgICAgICBjb25zdCBjdXJyZW50WVZlbG9jaXR5ID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5Lnk7IC8vIFByZXNlcnZlIHZlcnRpY2FsIHZlbG9jaXR5XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgbW92ZURpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIDApOyAvLyBVc2UgYSBUSFJFRS5WZWN0b3IzIGZvciBjYWxjdWxhdGlvbiBlYXNlXHJcblxyXG4gICAgICAgIC8vIEdldCBjYW1lcmFDb250YWluZXIncyBmb3J3YXJkIHZlY3RvciAoaG9yaXpvbnRhbCBkaXJlY3Rpb24gcGxheWVyIGlzIGxvb2tpbmcpXHJcbiAgICAgICAgY29uc3QgY2FtZXJhRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5nZXRXb3JsZERpcmVjdGlvbihjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgIGNhbWVyYURpcmVjdGlvbi55ID0gMDsgLy8gRmxhdHRlbiB0aGUgdmVjdG9yIHRvIHJlc3RyaWN0IG1vdmVtZW50IHRvIHRoZSBob3Jpem9udGFsIHBsYW5lXHJcbiAgICAgICAgY2FtZXJhRGlyZWN0aW9uLm5vcm1hbGl6ZSgpO1xyXG5cclxuICAgICAgICBjb25zdCBnbG9iYWxVcCA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDEsIDApOyAvLyBEZWZpbmUgZ2xvYmFsIHVwIHZlY3RvciBmb3IgY3Jvc3MgcHJvZHVjdFxyXG5cclxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlICdyaWdodCcgdmVjdG9yIHJlbGF0aXZlIHRvIGNhbWVyYSdzIGZvcndhcmQgZGlyZWN0aW9uXHJcbiAgICAgICAgLy8gQnkgY3Jvc3NpbmcgZ2xvYmFsVXAgd2l0aCBjYW1lcmFEaXJlY3Rpb24sIHdlIGdldCBhIHZlY3RvciBwb2ludGluZyB0byB0aGUgY2FtZXJhJ3MgcmlnaHQuXHJcbiAgICAgICAgY29uc3QgY2FtZXJhUmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIGNhbWVyYVJpZ2h0LmNyb3NzVmVjdG9ycyhnbG9iYWxVcCwgY2FtZXJhRGlyZWN0aW9uKS5ub3JtYWxpemUoKTsgXHJcblxyXG4gICAgICAgIGxldCBtb3ZpbmcgPSBmYWxzZTtcclxuICAgICAgICAvLyBXIDwtPiBTIHN3YXA6XHJcbiAgICAgICAgLy8gJ3MnIGtleSBub3cgbW92ZXMgZm9yd2FyZCAob3JpZ2luYWxseSAndycpXHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1sncyddKSB7IFxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLmFkZChjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyAndycga2V5IG5vdyBtb3ZlcyBiYWNrd2FyZCAob3JpZ2luYWxseSAncycpXHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1sndyddKSB7IFxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLnN1YihjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBVc2VyIHJlcXVlc3Q6IFN3YXAgQSBhbmQgRCBjb250cm9scy5cclxuICAgICAgICAvLyBBIHNob3VsZCBzdHJhZmUgbGVmdCAoc3VidHJhY3QgY2FtZXJhUmlnaHQpLlxyXG4gICAgICAgIC8vIEQgc2hvdWxkIHN0cmFmZSByaWdodCAoYWRkIGNhbWVyYVJpZ2h0KS5cclxuICAgICAgICBpZiAodGhpcy5rZXlzWydhJ10pIHsgLy8gJ2EnIGtleSBub3cgc3RyYWZlcyBsZWZ0IChzdGFuZGFyZCBiZWhhdmlvcilcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5zdWIoY2FtZXJhUmlnaHQpOyBcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1snZCddKSB7IC8vICdkJyBrZXkgbm93IHN0cmFmZXMgcmlnaHQgKHN0YW5kYXJkIGJlaGF2aW9yKVxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLmFkZChjYW1lcmFSaWdodCk7IFxyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKG1vdmluZykge1xyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLm5vcm1hbGl6ZSgpLm11bHRpcGx5U2NhbGFyKHBsYXllclNwZWVkKTtcclxuICAgICAgICAgICAgLy8gRGlyZWN0bHkgc2V0IHRoZSBob3Jpem9udGFsIHZlbG9jaXR5IGNvbXBvbmVudHMuXHJcbiAgICAgICAgICAgIC8vIFRoaXMgZml4ZXMgdGhlIHBlcmNlaXZlZCBkaWFnb25hbCBzbG93ZG93biBieSBlbnN1cmluZyBjb25zaXN0ZW50IHNwZWVkIGluIGFsbCBob3Jpem9udGFsIGRpcmVjdGlvbnMsXHJcbiAgICAgICAgICAgIC8vIGFuZCBwcm92aWRlcyBpbnN0YW50IHJlc3BvbnNpdmVuZXNzIChubyBhY2NlbGVyYXRpb24gZmFjdG9yIGludGVycG9sYXRpb24pLlxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IG1vdmVEaXJlY3Rpb24ueDtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSBtb3ZlRGlyZWN0aW9uLno7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gSWYgbm8gbW92ZW1lbnQga2V5cyBhcmUgcHJlc3NlZCwgYXBwbHkgaG9yaXpvbnRhbCBmcmljdGlvbiB0byBzbW9vdGhseSBkZWNlbGVyYXRlXHJcbiAgICAgICAgICAgIGNvbnN0IGZyaWN0aW9uRmFjdG9yID0gMC44OyAvLyBBZGp1c3QgZm9yIGRlc2lyZWQgZGVjZWxlcmF0aW9uIGZlZWxcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggKj0gZnJpY3Rpb25GYWN0b3I7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ICo9IGZyaWN0aW9uRmFjdG9yO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueSA9IGN1cnJlbnRZVmVsb2NpdHk7IC8vIFJlc3RvcmUgWSB2ZWxvY2l0eSAoZ3Jhdml0eS9qdW1wcykgdG8gcHJldmVudCBpbnRlcmZlcmluZyB3aXRoIHZlcnRpY2FsIG1vdmVtZW50XHJcblxyXG4gICAgICAgIC8vIFJFTU9WRUQ6IENhbWVyYUNvbnRhaW5lciBwb3NpdGlvbiB1cGRhdGUgbW92ZWQgdG8gc3luY01lc2hlc1dpdGhCb2RpZXNcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENsYW1wcyB0aGUgcGxheWVyJ3MgcG9zaXRpb24gd2l0aGluIHRoZSBkZWZpbmVkIGdyb3VuZCBib3VuZGFyaWVzLlxyXG4gICAgICogUHJldmVudHMgdGhlIHBsYXllciBmcm9tIG1vdmluZyBiZXlvbmQgdGhlICdlbmQgb2YgdGhlIHdvcmxkJy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjbGFtcFBsYXllclBvc2l0aW9uKCkge1xyXG4gICAgICAgIGlmICghdGhpcy5wbGF5ZXJCb2R5IHx8ICF0aGlzLmNvbmZpZykge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBoYWxmR3JvdW5kU2l6ZSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplIC8gMjtcclxuXHJcbiAgICAgICAgbGV0IHBvc1ggPSB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueDtcclxuICAgICAgICBsZXQgcG9zWiA9IHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi56O1xyXG4gICAgICAgIGxldCB2ZWxYID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5Lng7XHJcbiAgICAgICAgbGV0IHZlbFogPSB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkuejtcclxuXHJcbiAgICAgICAgLy8gQ2xhbXAgWCBwb3NpdGlvblxyXG4gICAgICAgIGlmIChwb3NYID4gaGFsZkdyb3VuZFNpemUpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnggPSBoYWxmR3JvdW5kU2l6ZTtcclxuICAgICAgICAgICAgaWYgKHZlbFggPiAwKSB7IC8vIElmIG1vdmluZyBvdXR3YXJkcywgc3RvcCBob3Jpem9udGFsIHZlbG9jaXR5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHBvc1ggPCAtaGFsZkdyb3VuZFNpemUpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnggPSAtaGFsZkdyb3VuZFNpemU7XHJcbiAgICAgICAgICAgIGlmICh2ZWxYIDwgMCkgeyAvLyBJZiBtb3Zpbmcgb3V0d2FyZHMsIHN0b3AgaG9yaXpvbnRhbCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDbGFtcCBaIHBvc2l0aW9uXHJcbiAgICAgICAgaWYgKHBvc1ogPiBoYWxmR3JvdW5kU2l6ZSkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueiA9IGhhbGZHcm91bmRTaXplO1xyXG4gICAgICAgICAgICBpZiAodmVsWiA+IDApIHsgLy8gSWYgbW92aW5nIG91dHdhcmRzLCBzdG9wIGhvcml6b250YWwgdmVsb2NpdHlcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAocG9zWiA8IC1oYWxmR3JvdW5kU2l6ZSkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueiA9IC1oYWxmR3JvdW5kU2l6ZTtcclxuICAgICAgICAgICAgaWYgKHZlbFogPCAwKSB7IC8vIElmIG1vdmluZyBvdXR3YXJkcywgc3RvcCBob3Jpem9udGFsIHZlbG9jaXR5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTeW5jaHJvbml6ZXMgdGhlIHZpc3VhbCBtZXNoZXMgd2l0aCB0aGVpciBjb3JyZXNwb25kaW5nIHBoeXNpY3MgYm9kaWVzLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN5bmNNZXNoZXNXaXRoQm9kaWVzKCkge1xyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIHBsYXllcidzIHZpc3VhbCBtZXNoIHBvc2l0aW9uIHdpdGggaXRzIHBoeXNpY3MgYm9keSdzIHBvc2l0aW9uXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU3luY2hyb25pemUgY2FtZXJhQ29udGFpbmVyIHBvc2l0aW9uIHdpdGggdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keSdzIHBvc2l0aW9uLlxyXG4gICAgICAgIC8vIFRoaXMgZW5zdXJlcyB0aGUgY2FtZXJhIGlzIGFsd2F5cyBwcmVjaXNlbHkgYXQgdGhlIHBsYXllcidzIGN1cnJlbnQgcGh5c2ljcyBsb2NhdGlvbixcclxuICAgICAgICAvLyBlbGltaW5hdGluZyB0aGUgcmVwb3J0ZWQgbGFnLlxyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcblxyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIHBsYXllcidzIHZpc3VhbCBtZXNoIGhvcml6b250YWwgcm90YXRpb24gKHlhdykgd2l0aCBjYW1lcmFDb250YWluZXIncyB5YXcuXHJcbiAgICAgICAgLy8gVGhlIGNhbWVyYUNvbnRhaW5lciBkaWN0YXRlcyB0aGUgcGxheWVyJ3MgaG9yaXpvbnRhbCBmYWNpbmcgZGlyZWN0aW9uLlxyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5xdWF0ZXJuaW9uLmNvcHkodGhpcy5jYW1lcmFDb250YWluZXIucXVhdGVybmlvbik7XHJcblxyXG4gICAgICAgIC8vIFRoZSBncm91bmQgaXMgc3RhdGljLCBzbyBpdHMgcG9zaXRpb24gYW5kIHJvdGF0aW9uIGRvIG5vdCBjaGFuZ2UgYWZ0ZXIgaW5pdGlhbCBzZXR1cC5cclxuICAgIH1cclxufVxyXG5cclxuLy8gU3RhcnQgdGhlIGdhbWUgd2hlbiB0aGUgRE9NIGNvbnRlbnQgaXMgZnVsbHkgbG9hZGVkXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICBuZXcgR2FtZSgpO1xyXG59KTsiXSwKICAibWFwcGluZ3MiOiAiQUFDQSxZQUFZLFdBQVc7QUFDdkIsWUFBWSxZQUFZO0FBR3hCLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFGQyxTQUFBQTtBQUFBLEdBQUE7QUE4QkwsTUFBTSxLQUFLO0FBQUEsRUF1Q1AsY0FBYztBQXJDZDtBQUFBLFNBQVEsUUFBbUI7QUFxQjNCO0FBQUEsU0FBUSxPQUFtQyxDQUFDO0FBQzVDO0FBQUEsU0FBUSxrQkFBMkI7QUFDbkM7QUFBQSxTQUFRLGNBQXNCO0FBRzlCO0FB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
