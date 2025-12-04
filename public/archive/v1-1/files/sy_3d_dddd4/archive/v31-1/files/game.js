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
    // NEW: Arrays to hold references to dynamically placed objects
    this.placedObjectMeshes = [];
    this.placedObjectBodies = [];
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
    // ADDED: Tracks player-ground contacts for jumping logic
    this.numGroundContacts = 0;
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
    this.createGround();
    this.createPlayer();
    this.createPlacedObjects();
    this.setupLighting();
    this.world.addEventListener("beginContact", (event) => {
      if (event.bodyA === this.playerBody && event.bodyB === this.groundBody || event.bodyB === this.playerBody && event.bodyA === this.groundBody) {
        this.numGroundContacts++;
      }
    });
    this.world.addEventListener("endContact", (event) => {
      if (event.bodyA === this.playerBody && event.bodyB === this.groundBody || event.bodyB === this.playerBody && event.bodyA === this.groundBody) {
        this.numGroundContacts = Math.max(0, this.numGroundContacts - 1);
      }
    });
    window.addEventListener("resize", this.onWindowResize.bind(this));
    document.addEventListener("keydown", this.onKeyDown.bind(this));
    document.addEventListener("keyup", this.onKeyUp.bind(this));
    document.addEventListener("mousemove", this.onMouseMove.bind(this));
    document.addEventListener("pointerlockchange", this.onPointerLockChange.bind(this));
    document.addEventListener("mozpointerlockchange", this.onPointerLockChange.bind(this));
    document.addEventListener("webkitpointerlockchange", this.onPointerLockChange.bind(this));
    this.applyFixedAspectRatio();
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
        if (img.name.endsWith("_texture")) {
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
   * NEW: Creates visual meshes and physics bodies for all objects defined in config.gameSettings.placedObjects.
   */
  createPlacedObjects() {
    if (!this.config.gameSettings.placedObjects) {
      console.warn("No placedObjects defined in gameSettings.");
      return;
    }
    this.config.gameSettings.placedObjects.forEach((objConfig) => {
      const texture = this.textures.get(objConfig.textureName);
      const material = new THREE.MeshLambertMaterial({
        map: texture,
        color: texture ? 16777215 : 11184810
        // Default grey if no texture
      });
      const geometry = new THREE.BoxGeometry(objConfig.dimensions.width, objConfig.dimensions.height, objConfig.dimensions.depth);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(objConfig.position.x, objConfig.position.y, objConfig.position.z);
      if (objConfig.rotationY !== void 0) {
        mesh.rotation.y = objConfig.rotationY;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.placedObjectMeshes.push(mesh);
      const shape = new CANNON.Box(new CANNON.Vec3(
        objConfig.dimensions.width / 2,
        objConfig.dimensions.height / 2,
        objConfig.dimensions.depth / 2
      ));
      const body = new CANNON.Body({
        mass: objConfig.mass,
        // Use 0 for static objects, >0 for dynamic
        position: new CANNON.Vec3(objConfig.position.x, objConfig.position.y, objConfig.position.z),
        shape
      });
      if (objConfig.rotationY !== void 0) {
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), objConfig.rotationY);
      }
      this.world.addBody(body);
      this.placedObjectBodies.push(body);
    });
    console.log(`Created ${this.placedObjectMeshes.length} placed objects.`);
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
    if (this.state === 1 /* PLAYING */ && this.isPointerLocked) {
      if (event.key.toLowerCase() === " ") {
        this.playerJump();
      }
    }
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
    let effectivePlayerSpeed = this.config.gameSettings.playerSpeed;
    if (this.numGroundContacts === 0) {
      effectivePlayerSpeed *= 0.7;
    }
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
      moveDirection.normalize().multiplyScalar(effectivePlayerSpeed);
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
   * ADDED: Applies an upward impulse to the player body for jumping.
   */
  playerJump() {
    if (this.numGroundContacts > 0) {
      this.playerBody.velocity.y = 0;
      this.playerBody.applyImpulse(
        new CANNON.Vec3(0, this.config.gameSettings.jumpForce, 0),
        this.playerBody.position
        // Apply impulse at the center of mass
      );
    }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuXHJcbi8vIEVudW0gdG8gZGVmaW5lIHRoZSBwb3NzaWJsZSBzdGF0ZXMgb2YgdGhlIGdhbWVcclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgVElUTEUsICAgLy8gVGl0bGUgc2NyZWVuLCB3YWl0aW5nIGZvciB1c2VyIGlucHV0XHJcbiAgICBQTEFZSU5HICAvLyBHYW1lIGlzIGFjdGl2ZSwgdXNlciBjYW4gbW92ZSBhbmQgbG9vayBhcm91bmRcclxufVxyXG5cclxuLy8gSW50ZXJmYWNlIGZvciBvYmplY3RzIHBsYWNlZCBpbiB0aGUgc2NlbmVcclxuaW50ZXJmYWNlIFBsYWNlZE9iamVjdENvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7IC8vIEEgZGVzY3JpcHRpdmUgbmFtZSBmb3IgdGhlIG9iamVjdCBpbnN0YW5jZVxyXG4gICAgdGV4dHVyZU5hbWU6IHN0cmluZzsgLy8gTmFtZSBvZiB0aGUgdGV4dHVyZSBmcm9tIGFzc2V0cy5pbWFnZXNcclxuICAgIHR5cGU6ICdib3gnOyAvLyBDdXJyZW50bHkgb25seSBzdXBwb3J0cyAnYm94J1xyXG4gICAgcG9zaXRpb246IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xyXG4gICAgZGltZW5zaW9uczogeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgZGVwdGg6IG51bWJlciB9O1xyXG4gICAgcm90YXRpb25ZPzogbnVtYmVyOyAvLyBPcHRpb25hbCByb3RhdGlvbiBhcm91bmQgWS1heGlzIChyYWRpYW5zKVxyXG4gICAgbWFzczogbnVtYmVyOyAvLyAwIGZvciBzdGF0aWMsID4wIGZvciBkeW5hbWljICh0aG91Z2ggYWxsIHBsYWNlZCBvYmplY3RzIGhlcmUgd2lsbCBiZSBzdGF0aWMpXHJcbn1cclxuXHJcbi8vIEludGVyZmFjZSB0byB0eXBlLWNoZWNrIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHN0YXJ0R2FtZVByb21wdDogc3RyaW5nO1xyXG4gICAgICAgIHBsYXllclNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgbW91c2VTZW5zaXRpdml0eTogbnVtYmVyO1xyXG4gICAgICAgIGNhbWVyYUhlaWdodE9mZnNldDogbnVtYmVyOyAvLyBWZXJ0aWNhbCBvZmZzZXQgb2YgdGhlIGNhbWVyYSBmcm9tIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkgY2VudGVyXHJcbiAgICAgICAgY2FtZXJhTmVhcjogbnVtYmVyOyAgICAgICAgIC8vIE5lYXIgY2xpcHBpbmcgcGxhbmUgZm9yIHRoZSBjYW1lcmFcclxuICAgICAgICBjYW1lcmFGYXI6IG51bWJlcjsgICAgICAgICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lIGZvciB0aGUgY2FtZXJhXHJcbiAgICAgICAgcGxheWVyTWFzczogbnVtYmVyOyAgICAgICAgIC8vIE1hc3Mgb2YgdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keVxyXG4gICAgICAgIGdyb3VuZFNpemU6IG51bWJlcjsgICAgICAgICAvLyBTaXplICh3aWR0aC9kZXB0aCkgb2YgdGhlIHNxdWFyZSBncm91bmQgcGxhbmVcclxuICAgICAgICBtYXhQaHlzaWNzU3ViU3RlcHM6IG51bWJlcjsgLy8gTWF4aW11bSBudW1iZXIgb2YgcGh5c2ljcyBzdWJzdGVwcyBwZXIgZnJhbWUgdG8gbWFpbnRhaW4gc3RhYmlsaXR5XHJcbiAgICAgICAgZml4ZWRBc3BlY3RSYXRpbzogeyB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciB9OyAvLyBOZXc6IEZpeGVkIGFzcGVjdCByYXRpbyBmb3IgdGhlIGdhbWUgKHdpZHRoIC8gaGVpZ2h0KVxyXG4gICAgICAgIGp1bXBGb3JjZTogbnVtYmVyOyAgICAgICAgICAvLyBBRERFRDogRm9yY2UgYXBwbGllZCB3aGVuIGp1bXBpbmdcclxuICAgICAgICBwbGFjZWRPYmplY3RzOiBQbGFjZWRPYmplY3RDb25maWdbXTsgLy8gTkVXOiBBcnJheSBvZiBvYmplY3RzIHRvIHBsYWNlIGluIHRoZSB3b3JsZFxyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfVtdO1xyXG4gICAgICAgIHNvdW5kczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyOyB2b2x1bWU6IG51bWJlciB9W107XHJcbiAgICB9O1xyXG59XHJcblxyXG4vKipcclxuICogTWFpbiBHYW1lIGNsYXNzIHJlc3BvbnNpYmxlIGZvciBpbml0aWFsaXppbmcgYW5kIHJ1bm5pbmcgdGhlIDNEIGdhbWUuXHJcbiAqIEl0IGhhbmRsZXMgVGhyZWUuanMgcmVuZGVyaW5nLCBDYW5ub24tZXMgcGh5c2ljcywgaW5wdXQsIGFuZCBnYW1lIHN0YXRlLlxyXG4gKi9cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNvbmZpZyE6IEdhbWVDb25maWc7IC8vIEdhbWUgY29uZmlndXJhdGlvbiBsb2FkZWQgZnJvbSBkYXRhLmpzb25cclxuICAgIHByaXZhdGUgc3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTsgLy8gQ3VycmVudCBzdGF0ZSBvZiB0aGUgZ2FtZVxyXG5cclxuICAgIC8vIFRocmVlLmpzIGVsZW1lbnRzIGZvciByZW5kZXJpbmdcclxuICAgIHByaXZhdGUgc2NlbmUhOiBUSFJFRS5TY2VuZTtcclxuICAgIHByaXZhdGUgY2FtZXJhITogVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmE7XHJcbiAgICBwcml2YXRlIHJlbmRlcmVyITogVEhSRUUuV2ViR0xSZW5kZXJlcjtcclxuICAgIHByaXZhdGUgY2FudmFzITogSFRNTENhbnZhc0VsZW1lbnQ7IC8vIFRoZSBIVE1MIGNhbnZhcyBlbGVtZW50IGZvciByZW5kZXJpbmdcclxuXHJcbiAgICAvLyBOZXc6IEEgY29udGFpbmVyIG9iamVjdCBmb3IgdGhlIGNhbWVyYSB0byBoYW5kbGUgaG9yaXpvbnRhbCByb3RhdGlvbiBzZXBhcmF0ZWx5IGZyb20gdmVydGljYWwgcGl0Y2guXHJcbiAgICBwcml2YXRlIGNhbWVyYUNvbnRhaW5lciE6IFRIUkVFLk9iamVjdDNEOyBcclxuXHJcbiAgICAvLyBDYW5ub24tZXMgZWxlbWVudHMgZm9yIHBoeXNpY3NcclxuICAgIHByaXZhdGUgd29ybGQhOiBDQU5OT04uV29ybGQ7XHJcbiAgICBwcml2YXRlIHBsYXllckJvZHkhOiBDQU5OT04uQm9keTsgLy8gUGh5c2ljcyBib2R5IGZvciB0aGUgcGxheWVyXHJcbiAgICBwcml2YXRlIGdyb3VuZEJvZHkhOiBDQU5OT04uQm9keTsgLy8gUGh5c2ljcyBib2R5IGZvciB0aGUgZ3JvdW5kXHJcblxyXG4gICAgLy8gVmlzdWFsIG1lc2hlcyAoVGhyZWUuanMpIGZvciBnYW1lIG9iamVjdHNcclxuICAgIHByaXZhdGUgcGxheWVyTWVzaCE6IFRIUkVFLk1lc2g7XHJcbiAgICBwcml2YXRlIGdyb3VuZE1lc2ghOiBUSFJFRS5NZXNoO1xyXG4gICAgLy8gTkVXOiBBcnJheXMgdG8gaG9sZCByZWZlcmVuY2VzIHRvIGR5bmFtaWNhbGx5IHBsYWNlZCBvYmplY3RzXHJcbiAgICBwcml2YXRlIHBsYWNlZE9iamVjdE1lc2hlczogVEhSRUUuTWVzaFtdID0gW107XHJcbiAgICBwcml2YXRlIHBsYWNlZE9iamVjdEJvZGllczogQ0FOTk9OLkJvZHlbXSA9IFtdO1xyXG5cclxuICAgIC8vIElucHV0IGhhbmRsaW5nIHN0YXRlXHJcbiAgICBwcml2YXRlIGtleXM6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307IC8vIFRyYWNrcyBjdXJyZW50bHkgcHJlc3NlZCBrZXlzXHJcbiAgICBwcml2YXRlIGlzUG9pbnRlckxvY2tlZDogYm9vbGVhbiA9IGZhbHNlOyAvLyBUcnVlIGlmIG1vdXNlIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICBwcml2YXRlIGNhbWVyYVBpdGNoOiBudW1iZXIgPSAwOyAvLyBWZXJ0aWNhbCByb3RhdGlvbiAocGl0Y2gpIG9mIHRoZSBjYW1lcmFcclxuXHJcbiAgICAvLyBBc3NldCBtYW5hZ2VtZW50XHJcbiAgICBwcml2YXRlIHRleHR1cmVzOiBNYXA8c3RyaW5nLCBUSFJFRS5UZXh0dXJlPiA9IG5ldyBNYXAoKTsgLy8gU3RvcmVzIGxvYWRlZCB0ZXh0dXJlc1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpOyAvLyBTdG9yZXMgbG9hZGVkIGF1ZGlvIGVsZW1lbnRzXHJcblxyXG4gICAgLy8gVUkgZWxlbWVudHMgKGR5bmFtaWNhbGx5IGNyZWF0ZWQgZm9yIHRoZSB0aXRsZSBzY3JlZW4pXHJcbiAgICBwcml2YXRlIHRpdGxlU2NyZWVuT3ZlcmxheSE6IEhUTUxEaXZFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSB0aXRsZVRleHQhOiBIVE1MRGl2RWxlbWVudDtcclxuICAgIHByaXZhdGUgcHJvbXB0VGV4dCE6IEhUTUxEaXZFbGVtZW50O1xyXG5cclxuICAgIC8vIEZvciBjYWxjdWxhdGluZyBkZWx0YSB0aW1lIGJldHdlZW4gZnJhbWVzXHJcbiAgICBwcml2YXRlIGxhc3RUaW1lOiBET01IaWdoUmVzVGltZVN0YW1wID0gMDtcclxuXHJcbiAgICAvLyBBRERFRDogVHJhY2tzIHBsYXllci1ncm91bmQgY29udGFjdHMgZm9yIGp1bXBpbmcgbG9naWNcclxuICAgIHByaXZhdGUgbnVtR3JvdW5kQ29udGFjdHM6IG51bWJlciA9IDA7XHJcblxyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgLy8gR2V0IHRoZSBjYW52YXMgZWxlbWVudCBmcm9tIGluZGV4Lmh0bWxcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lQ2FudmFzJykgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNhbnZhcykge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdDYW52YXMgZWxlbWVudCB3aXRoIElEIFwiZ2FtZUNhbnZhc1wiIG5vdCBmb3VuZCEnKTtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBDYW5ub3QgcHJvY2VlZCB3aXRob3V0IGEgY2FudmFzXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuaW5pdCgpOyAvLyBTdGFydCB0aGUgYXN5bmNocm9ub3VzIGluaXRpYWxpemF0aW9uIHByb2Nlc3NcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFzeW5jaHJvbm91c2x5IGluaXRpYWxpemVzIHRoZSBnYW1lLCBsb2FkaW5nIGNvbmZpZywgYXNzZXRzLCBhbmQgc2V0dGluZyB1cCBzeXN0ZW1zLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFzeW5jIGluaXQoKSB7XHJcbiAgICAgICAgLy8gMS4gTG9hZCBnYW1lIGNvbmZpZ3VyYXRpb24gZnJvbSBkYXRhLmpzb25cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQIGVycm9yISBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnR2FtZSBjb25maWd1cmF0aW9uIGxvYWRlZDonLCB0aGlzLmNvbmZpZyk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgZ2FtZSBjb25maWd1cmF0aW9uOicsIGVycm9yKTtcclxuICAgICAgICAgICAgLy8gSWYgY29uZmlndXJhdGlvbiBmYWlscyB0byBsb2FkLCBkaXNwbGF5IGFuIGVycm9yIG1lc3NhZ2UgYW5kIHN0b3AuXHJcbiAgICAgICAgICAgIGNvbnN0IGVycm9yRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUudG9wID0gJzUwJSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLmxlZnQgPSAnNTAlJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUudHJhbnNmb3JtID0gJ3RyYW5zbGF0ZSgtNTAlLCAtNTAlKSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLmNvbG9yID0gJ3JlZCc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLmZvbnRTaXplID0gJzI0cHgnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi50ZXh0Q29udGVudCA9ICdFcnJvcjogRmFpbGVkIHRvIGxvYWQgZ2FtZSBjb25maWd1cmF0aW9uLiBDaGVjayBjb25zb2xlIGZvciBkZXRhaWxzLic7XHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZXJyb3JEaXYpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyAyLiBJbml0aWFsaXplIFRocmVlLmpzIChzY2VuZSwgY2FtZXJhLCByZW5kZXJlcilcclxuICAgICAgICB0aGlzLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEoXHJcbiAgICAgICAgICAgIDc1LCAvLyBGaWVsZCBvZiBWaWV3IChGT1YpXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5maXhlZEFzcGVjdFJhdGlvLndpZHRoIC8gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZpeGVkQXNwZWN0UmF0aW8uaGVpZ2h0LCAvLyBGaXhlZCBBc3BlY3QgcmF0aW8gZnJvbSBjb25maWdcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbWVyYU5lYXIsIC8vIE5lYXIgY2xpcHBpbmcgcGxhbmVcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbWVyYUZhciAgIC8vIEZhciBjbGlwcGluZyBwbGFuZVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlciA9IG5ldyBUSFJFRS5XZWJHTFJlbmRlcmVyKHsgY2FudmFzOiB0aGlzLmNhbnZhcywgYW50aWFsaWFzOiB0cnVlIH0pO1xyXG4gICAgICAgIC8vIFJlbmRlcmVyIHNpemUgd2lsbCBiZSBzZXQgYnkgYXBwbHlGaXhlZEFzcGVjdFJhdGlvIHRvIGZpdCB0aGUgd2luZG93IHdoaWxlIG1haW50YWluaW5nIGFzcGVjdCByYXRpb1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0UGl4ZWxSYXRpbyh3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zaGFkb3dNYXAuZW5hYmxlZCA9IHRydWU7IC8vIEVuYWJsZSBzaGFkb3dzIGZvciBiZXR0ZXIgcmVhbGlzbVxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2hhZG93TWFwLnR5cGUgPSBUSFJFRS5QQ0ZTb2Z0U2hhZG93TWFwOyAvLyBVc2Ugc29mdCBzaGFkb3dzXHJcblxyXG4gICAgICAgIC8vIENhbWVyYSBzZXR1cCBmb3IgZGVjb3VwbGVkIHlhdyBhbmQgcGl0Y2g6XHJcbiAgICAgICAgLy8gY2FtZXJhQ29udGFpbmVyIGhhbmRsZXMgeWF3IChob3Jpem9udGFsIHJvdGF0aW9uKSBhbmQgZm9sbG93cyB0aGUgcGxheWVyJ3MgcG9zaXRpb24uXHJcbiAgICAgICAgLy8gVGhlIGNhbWVyYSBpdHNlbGYgaXMgYSBjaGlsZCBvZiBjYW1lcmFDb250YWluZXIgYW5kIGhhbmRsZXMgcGl0Y2ggKHZlcnRpY2FsIHJvdGF0aW9uKS5cclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lciA9IG5ldyBUSFJFRS5PYmplY3QzRCgpO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMuY2FtZXJhQ29udGFpbmVyKTtcclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5hZGQodGhpcy5jYW1lcmEpO1xyXG4gICAgICAgIC8vIFBvc2l0aW9uIHRoZSBjYW1lcmEgcmVsYXRpdmUgdG8gdGhlIGNhbWVyYUNvbnRhaW5lciAoYXQgZXllIGxldmVsKVxyXG4gICAgICAgIHRoaXMuY2FtZXJhLnBvc2l0aW9uLnkgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FtZXJhSGVpZ2h0T2Zmc2V0O1xyXG5cclxuXHJcbiAgICAgICAgLy8gMy4gSW5pdGlhbGl6ZSBDYW5ub24tZXMgKHBoeXNpY3Mgd29ybGQpXHJcbiAgICAgICAgdGhpcy53b3JsZCA9IG5ldyBDQU5OT04uV29ybGQoKTtcclxuICAgICAgICB0aGlzLndvcmxkLmdyYXZpdHkuc2V0KDAsIC05LjgyLCAwKTsgLy8gU2V0IHN0YW5kYXJkIEVhcnRoIGdyYXZpdHkgKFktYXhpcyBkb3duKVxyXG4gICAgICAgIHRoaXMud29ybGQuYnJvYWRwaGFzZSA9IG5ldyBDQU5OT04uU0FQQnJvYWRwaGFzZSh0aGlzLndvcmxkKTsgLy8gVXNlIGFuIGVmZmljaWVudCBicm9hZHBoYXNlIGFsZ29yaXRobVxyXG4gICAgICAgIC8vIEZpeDogQ2FzdCB0aGlzLndvcmxkLnNvbHZlciB0byBDQU5OT04uR1NTb2x2ZXIgdG8gYWNjZXNzIHRoZSAnaXRlcmF0aW9ucycgcHJvcGVydHlcclxuICAgICAgICAvLyBUaGUgZGVmYXVsdCBzb2x2ZXIgaW4gQ2Fubm9uLmpzIChhbmQgQ2Fubm9uLWVzKSBpcyBHU1NvbHZlciwgd2hpY2ggaGFzIHRoaXMgcHJvcGVydHkuXHJcbiAgICAgICAgKHRoaXMud29ybGQuc29sdmVyIGFzIENBTk5PTi5HU1NvbHZlcikuaXRlcmF0aW9ucyA9IDEwOyAvLyBJbmNyZWFzZSBzb2x2ZXIgaXRlcmF0aW9ucyBmb3IgYmV0dGVyIHN0YWJpbGl0eVxyXG5cclxuICAgICAgICAvLyA0LiBMb2FkIGFzc2V0cyAodGV4dHVyZXMgYW5kIHNvdW5kcylcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRBc3NldHMoKTtcclxuXHJcbiAgICAgICAgLy8gNS4gQ3JlYXRlIGdhbWUgb2JqZWN0cyAocGxheWVyLCBncm91bmQsIGFuZCBvdGhlciBvYmplY3RzKSBhbmQgbGlnaHRpbmdcclxuICAgICAgICB0aGlzLmNyZWF0ZUdyb3VuZCgpOyAvLyBDcmVhdGVzIHRoaXMuZ3JvdW5kQm9keVxyXG4gICAgICAgIHRoaXMuY3JlYXRlUGxheWVyKCk7IC8vIENyZWF0ZXMgdGhpcy5wbGF5ZXJCb2R5XHJcbiAgICAgICAgdGhpcy5jcmVhdGVQbGFjZWRPYmplY3RzKCk7IC8vIE5FVzogQ3JlYXRlcyBvdGhlciBvYmplY3RzIGluIHRoZSBzY2VuZVxyXG4gICAgICAgIHRoaXMuc2V0dXBMaWdodGluZygpO1xyXG5cclxuICAgICAgICAvLyBBRERFRDogNi4gU2V0dXAgQ2Fubm9uLWVzIGNvbnRhY3QgbGlzdGVuZXJzIGZvciBqdW1wIGxvZ2ljIChhZnRlciBib2RpZXMgYXJlIGNyZWF0ZWQpXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRFdmVudExpc3RlbmVyKCdiZWdpbkNvbnRhY3QnLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgb25lIG9mIHRoZSBib2RpZXMgaXMgdGhlIHBsYXllckJvZHkgYW5kIHRoZSBvdGhlciBpcyB0aGUgZ3JvdW5kQm9keVxyXG4gICAgICAgICAgICAvLyBUaGlzIGxvZ2ljIGFsbG93cyBqdW1waW5nIG9ubHkgZnJvbSB0aGUgZ3JvdW5kLlxyXG4gICAgICAgICAgICBpZiAoKGV2ZW50LmJvZHlBID09PSB0aGlzLnBsYXllckJvZHkgJiYgZXZlbnQuYm9keUIgPT09IHRoaXMuZ3JvdW5kQm9keSkgfHxcclxuICAgICAgICAgICAgICAgIChldmVudC5ib2R5QiA9PT0gdGhpcy5wbGF5ZXJCb2R5ICYmIGV2ZW50LmJvZHlBID09PSB0aGlzLmdyb3VuZEJvZHkpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm51bUdyb3VuZENvbnRhY3RzKys7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRFdmVudExpc3RlbmVyKCdlbmRDb250YWN0JywgKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIG9uZSBvZiB0aGUgYm9kaWVzIGlzIHRoZSBwbGF5ZXJCb2R5IGFuZCB0aGUgb3RoZXIgaXMgdGhlIGdyb3VuZEJvZHlcclxuICAgICAgICAgICAgaWYgKChldmVudC5ib2R5QSA9PT0gdGhpcy5wbGF5ZXJCb2R5ICYmIGV2ZW50LmJvZHlCID09PSB0aGlzLmdyb3VuZEJvZHkpIHx8XHJcbiAgICAgICAgICAgICAgICAoZXZlbnQuYm9keUIgPT09IHRoaXMucGxheWVyQm9keSAmJiBldmVudC5ib2R5QSA9PT0gdGhpcy5ncm91bmRCb2R5KSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5udW1Hcm91bmRDb250YWN0cyA9IE1hdGgubWF4KDAsIHRoaXMubnVtR3JvdW5kQ29udGFjdHMgLSAxKTsgLy8gRW5zdXJlIGl0IGRvZXNuJ3QgZ28gYmVsb3cgMFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIDcuIFNldHVwIGV2ZW50IGxpc3RlbmVycyBmb3IgdXNlciBpbnB1dCBhbmQgd2luZG93IHJlc2l6aW5nXHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHRoaXMub25XaW5kb3dSZXNpemUuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMub25LZXlEb3duLmJpbmQodGhpcykpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5vbktleVVwLmJpbmQodGhpcykpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMub25Nb3VzZU1vdmUuYmluZCh0aGlzKSk7IC8vIEZvciBtb3VzZSBsb29rXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7IC8vIEZvciBwb2ludGVyIGxvY2sgc3RhdHVzXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW96cG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7IC8vIEZpcmVmb3ggY29tcGF0aWJpbGl0eVxyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3dlYmtpdHBvaW50ZXJsb2NrY2hhbmdlJywgdGhpcy5vblBvaW50ZXJMb2NrQ2hhbmdlLmJpbmQodGhpcykpOyAvLyBXZWJraXQgY29tcGF0aWJpbGl0eVxyXG5cclxuICAgICAgICAvLyBBcHBseSBpbml0aWFsIGZpeGVkIGFzcGVjdCByYXRpbyBhbmQgY2VudGVyIHRoZSBjYW52YXNcclxuICAgICAgICB0aGlzLmFwcGx5Rml4ZWRBc3BlY3RSYXRpbygpO1xyXG5cclxuICAgICAgICAvLyA4LiBTZXR1cCB0aGUgdGl0bGUgc2NyZWVuIFVJXHJcbiAgICAgICAgdGhpcy5zZXR1cFRpdGxlU2NyZWVuKCk7XHJcblxyXG4gICAgICAgIC8vIFN0YXJ0IHRoZSBtYWluIGdhbWUgbG9vcFxyXG4gICAgICAgIHRoaXMuYW5pbWF0ZSgwKTsgLy8gUGFzcyBpbml0aWFsIHRpbWUgMFxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTG9hZHMgYWxsIHRleHR1cmVzIGFuZCBzb3VuZHMgZGVmaW5lZCBpbiB0aGUgZ2FtZSBjb25maWd1cmF0aW9uLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKSB7XHJcbiAgICAgICAgY29uc3QgdGV4dHVyZUxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKCk7XHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5pbWFnZXMubWFwKGltZyA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiB0ZXh0dXJlTG9hZGVyLmxvYWRBc3luYyhpbWcucGF0aClcclxuICAgICAgICAgICAgICAgIC50aGVuKHRleHR1cmUgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZXMuc2V0KGltZy5uYW1lLCB0ZXh0dXJlKTtcclxuICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7IC8vIFJlcGVhdCB0ZXh0dXJlIGhvcml6b250YWxseVxyXG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmUud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZzsgLy8gUmVwZWF0IHRleHR1cmUgdmVydGljYWxseVxyXG4gICAgICAgICAgICAgICAgICAgIC8vIEFkanVzdCB0ZXh0dXJlIHJlcGV0aXRpb24gZm9yIHRoZSBncm91bmQgdG8gYXZvaWQgc3RyZXRjaGluZ1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpbWcubmFtZSA9PT0gJ2dyb3VuZF90ZXh0dXJlJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS5yZXBlYXQuc2V0KHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplIC8gNSwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyA1KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gRm9yIGJveCB0ZXh0dXJlcywgZW5zdXJlIHJlcGV0aXRpb24gaWYgZGVzaXJlZCwgb3Igc2V0IHRvIDEsMSBmb3Igc2luZ2xlIGFwcGxpY2F0aW9uXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGltZy5uYW1lLmVuZHNXaXRoKCdfdGV4dHVyZScpKSB7IC8vIEdlbmVyaWMgY2hlY2sgZm9yIG90aGVyIHRleHR1cmVzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZvciBnZW5lcmljIGJveCB0ZXh0dXJlcywgd2UgbWlnaHQgd2FudCB0byByZXBlYXQgYmFzZWQgb24gb2JqZWN0IGRpbWVuc2lvbnNcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yIHNpbXBsaWNpdHkgbm93LCBsZXQncyBrZWVwIGRlZmF1bHQgKG5vIHJlcGVhdCB1bmxlc3MgZXhwbGljaXQgZm9yIGdyb3VuZClcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQSBtb3JlIHJvYnVzdCBzb2x1dGlvbiB3b3VsZCBpbnZvbHZlIHNldHRpbmcgcmVwZWF0IGJhc2VkIG9uIHNjYWxlL2RpbWVuc2lvbnMgZm9yIGVhY2ggb2JqZWN0XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgdGV4dHVyZTogJHtpbWcucGF0aH1gLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQ29udGludWUgZXZlbiBpZiBhbiBhc3NldCBmYWlscyB0byBsb2FkOyBmYWxsYmFja3MgKHNvbGlkIGNvbG9ycykgYXJlIHVzZWQuXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMubWFwKHNvdW5kID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbyhzb3VuZC5wYXRoKTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNvdW5kLnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLmxvb3AgPSAoc291bmQubmFtZSA9PT0gJ2JhY2tncm91bmRfbXVzaWMnKTsgLy8gTG9vcCBiYWNrZ3JvdW5kIG11c2ljXHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc291bmRzLnNldChzb3VuZC5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7c291bmQucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7IC8vIFJlc29sdmUgZXZlbiBvbiBlcnJvciB0byBub3QgYmxvY2sgUHJvbWlzZS5hbGxcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBBc3NldHMgbG9hZGVkOiAke3RoaXMudGV4dHVyZXMuc2l6ZX0gdGV4dHVyZXMsICR7dGhpcy5zb3VuZHMuc2l6ZX0gc291bmRzLmApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhbmQgZGlzcGxheXMgdGhlIHRpdGxlIHNjcmVlbiBVSSBkeW5hbWljYWxseS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzZXR1cFRpdGxlU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5zdHlsZSwge1xyXG4gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJywgLy8gUG9zaXRpb24gcmVsYXRpdmUgdG8gYm9keSwgd2lsbCBiZSBjZW50ZXJlZCBhbmQgc2l6ZWQgYnkgYXBwbHlGaXhlZEFzcGVjdFJhdGlvXHJcbiAgICAgICAgICAgIGJhY2tncm91bmRDb2xvcjogJ3JnYmEoMCwgMCwgMCwgMC44KScsXHJcbiAgICAgICAgICAgIGRpc3BsYXk6ICdmbGV4JywgZmxleERpcmVjdGlvbjogJ2NvbHVtbicsXHJcbiAgICAgICAgICAgIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJywgYWxpZ25JdGVtczogJ2NlbnRlcicsXHJcbiAgICAgICAgICAgIGNvbG9yOiAnd2hpdGUnLCBmb250RmFtaWx5OiAnQXJpYWwsIHNhbnMtc2VyaWYnLFxyXG4gICAgICAgICAgICBmb250U2l6ZTogJzQ4cHgnLCB0ZXh0QWxpZ246ICdjZW50ZXInLCB6SW5kZXg6ICcxMDAwJ1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkpO1xyXG5cclxuICAgICAgICAvLyBDcnVjaWFsOiBDYWxsIGFwcGx5Rml4ZWRBc3BlY3RSYXRpbyBoZXJlIHRvIGVuc3VyZSB0aGUgdGl0bGUgc2NyZWVuIG92ZXJsYXlcclxuICAgICAgICAvLyBpcyBzaXplZCBhbmQgcG9zaXRpb25lZCBjb3JyZWN0bHkgcmVsYXRpdmUgdG8gdGhlIGNhbnZhcyBmcm9tIHRoZSBzdGFydC5cclxuICAgICAgICB0aGlzLmFwcGx5Rml4ZWRBc3BlY3RSYXRpbygpO1xyXG5cclxuICAgICAgICB0aGlzLnRpdGxlVGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIHRoaXMudGl0bGVUZXh0LnRleHRDb250ZW50ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnRpdGxlU2NyZWVuVGV4dDtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hcHBlbmRDaGlsZCh0aGlzLnRpdGxlVGV4dCk7XHJcblxyXG4gICAgICAgIHRoaXMucHJvbXB0VGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIHRoaXMucHJvbXB0VGV4dC50ZXh0Q29udGVudCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5zdGFydEdhbWVQcm9tcHQ7XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnByb21wdFRleHQuc3R5bGUsIHtcclxuICAgICAgICAgICAgbWFyZ2luVG9wOiAnMjBweCcsIGZvbnRTaXplOiAnMjRweCdcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hcHBlbmRDaGlsZCh0aGlzLnByb21wdFRleHQpO1xyXG5cclxuICAgICAgICAvLyBBZGQgZXZlbnQgbGlzdGVuZXIgZGlyZWN0bHkgdG8gdGhlIG92ZXJsYXkgdG8gY2FwdHVyZSBjbGlja3MgYW5kIHN0YXJ0IHRoZSBnYW1lXHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB0aGlzLnN0YXJ0R2FtZSgpKTtcclxuXHJcbiAgICAgICAgLy8gQXR0ZW1wdCB0byBwbGF5IGJhY2tncm91bmQgbXVzaWMuIEl0IG1pZ2h0IGJlIGJsb2NrZWQgYnkgYnJvd3NlcnMgaWYgbm8gdXNlciBnZXN0dXJlIGhhcyBvY2N1cnJlZCB5ZXQuXHJcbiAgICAgICAgdGhpcy5zb3VuZHMuZ2V0KCdiYWNrZ3JvdW5kX211c2ljJyk/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiQkdNIHBsYXkgZGVuaWVkIChyZXF1aXJlcyB1c2VyIGdlc3R1cmUpOlwiLCBlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUcmFuc2l0aW9ucyB0aGUgZ2FtZSBmcm9tIHRoZSB0aXRsZSBzY3JlZW4gdG8gdGhlIHBsYXlpbmcgc3RhdGUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhcnRHYW1lKCkge1xyXG4gICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICAvLyBSZW1vdmUgdGhlIHRpdGxlIHNjcmVlbiBvdmVybGF5XHJcbiAgICAgICAgaWYgKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5ICYmIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LnBhcmVudE5vZGUpIHtcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZCh0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIEFkZCBldmVudCBsaXN0ZW5lciB0byBjYW52YXMgZm9yIHJlLWxvY2tpbmcgcG9pbnRlciBhZnRlciB0aXRsZSBzY3JlZW4gaXMgZ29uZVxyXG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5oYW5kbGVDYW52YXNSZUxvY2tQb2ludGVyLmJpbmQodGhpcykpO1xyXG5cclxuICAgICAgICAvLyBSZXF1ZXN0IHBvaW50ZXIgbG9jayBmb3IgaW1tZXJzaXZlIG1vdXNlIGNvbnRyb2xcclxuICAgICAgICB0aGlzLmNhbnZhcy5yZXF1ZXN0UG9pbnRlckxvY2soKTtcclxuICAgICAgICAvLyBFbnN1cmUgYmFja2dyb3VuZCBtdXNpYyBwbGF5cyBub3cgdGhhdCBhIHVzZXIgZ2VzdHVyZSBoYXMgb2NjdXJyZWRcclxuICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ2JhY2tncm91bmRfbXVzaWMnKT8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJCR00gcGxheSBmYWlsZWQgYWZ0ZXIgdXNlciBnZXN0dXJlOlwiLCBlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGVzIGNsaWNrcyBvbiB0aGUgY2FudmFzIHRvIHJlLWxvY2sgdGhlIHBvaW50ZXIgaWYgdGhlIGdhbWUgaXMgcGxheWluZyBhbmQgdW5sb2NrZWQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlQ2FudmFzUmVMb2NrUG9pbnRlcigpIHtcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgIXRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLnJlcXVlc3RQb2ludGVyTG9jaygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgdGhlIHBsYXllcidzIHZpc3VhbCBtZXNoIGFuZCBwaHlzaWNzIGJvZHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY3JlYXRlUGxheWVyKCkge1xyXG4gICAgICAgIC8vIFBsYXllciB2aXN1YWwgbWVzaCAoYSBzaW1wbGUgYm94KVxyXG4gICAgICAgIGNvbnN0IHBsYXllclRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgncGxheWVyX3RleHR1cmUnKTtcclxuICAgICAgICBjb25zdCBwbGF5ZXJNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgbWFwOiBwbGF5ZXJUZXh0dXJlLFxyXG4gICAgICAgICAgICBjb2xvcjogcGxheWVyVGV4dHVyZSA/IDB4ZmZmZmZmIDogMHgwMDc3ZmYgLy8gVXNlIHdoaXRlIHdpdGggdGV4dHVyZSwgb3IgYmx1ZSBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgcGxheWVyR2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMSwgMiwgMSk7IC8vIFBsYXllciBkaW1lbnNpb25zXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoID0gbmV3IFRIUkVFLk1lc2gocGxheWVyR2VvbWV0cnksIHBsYXllck1hdGVyaWFsKTtcclxuICAgICAgICB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueSA9IDU7IC8vIFN0YXJ0IHBsYXllciBzbGlnaHRseSBhYm92ZSB0aGUgZ3JvdW5kXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLmNhc3RTaGFkb3cgPSB0cnVlOyAvLyBQbGF5ZXIgY2FzdHMgYSBzaGFkb3dcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLnBsYXllck1lc2gpO1xyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgcGh5c2ljcyBib2R5IChDYW5ub24uanMgYm94IHNoYXBlKVxyXG4gICAgICAgIGNvbnN0IHBsYXllclNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKDAuNSwgMSwgMC41KSk7IC8vIEhhbGYgZXh0ZW50cyBvZiB0aGUgYm94IGZvciBjb2xsaXNpb25cclxuICAgICAgICB0aGlzLnBsYXllckJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyTWFzcywgLy8gUGxheWVyJ3MgbWFzc1xyXG4gICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi54LCB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueSwgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLnopLFxyXG4gICAgICAgICAgICBzaGFwZTogcGxheWVyU2hhcGUsXHJcbiAgICAgICAgICAgIGZpeGVkUm90YXRpb246IHRydWUgLy8gUHJldmVudCB0aGUgcGxheWVyIGZyb20gZmFsbGluZyBvdmVyIChzaW11bGF0ZXMgYSBjYXBzdWxlL2N5bGluZGVyIGNoYXJhY3RlcilcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkodGhpcy5wbGF5ZXJCb2R5KTtcclxuXHJcbiAgICAgICAgLy8gU2V0IGluaXRpYWwgY2FtZXJhQ29udGFpbmVyIHBvc2l0aW9uIHRvIHBsYXllcidzIHBoeXNpY3MgYm9keSBwb3NpdGlvbi5cclxuICAgICAgICAvLyBUaGUgY2FtZXJhIGl0c2VsZiBpcyBhIGNoaWxkIG9mIGNhbWVyYUNvbnRhaW5lciBhbmQgaGFzIGl0cyBvd24gbG9jYWwgWSBvZmZzZXQuXHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIucG9zaXRpb24uY29weSh0aGlzLnBsYXllckJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgdGhlIGdyb3VuZCdzIHZpc3VhbCBtZXNoIGFuZCBwaHlzaWNzIGJvZHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY3JlYXRlR3JvdW5kKCkge1xyXG4gICAgICAgIC8vIEdyb3VuZCB2aXN1YWwgbWVzaCAoYSBsYXJnZSBwbGFuZSlcclxuICAgICAgICBjb25zdCBncm91bmRUZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQoJ2dyb3VuZF90ZXh0dXJlJyk7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogZ3JvdW5kVGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3I6IGdyb3VuZFRleHR1cmUgPyAweGZmZmZmZiA6IDB4ODg4ODg4IC8vIFVzZSB3aGl0ZSB3aXRoIHRleHR1cmUsIG9yIGdyZXkgaWYgbm8gdGV4dHVyZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZEdlb21ldHJ5ID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplKTtcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2ggPSBuZXcgVEhSRUUuTWVzaChncm91bmRHZW9tZXRyeSwgZ3JvdW5kTWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWVzaC5yb3RhdGlvbi54ID0gLU1hdGguUEkgLyAyOyAvLyBSb3RhdGUgdG8gbGF5IGZsYXQgb24gdGhlIFhaIHBsYW5lXHJcbiAgICAgICAgdGhpcy5ncm91bmRNZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlOyAvLyBHcm91bmQgcmVjZWl2ZXMgc2hhZG93c1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMuZ3JvdW5kTWVzaCk7XHJcblxyXG4gICAgICAgIC8vIEdyb3VuZCBwaHlzaWNzIGJvZHkgKENhbm5vbi5qcyBwbGFuZSBzaGFwZSlcclxuICAgICAgICBjb25zdCBncm91bmRTaGFwZSA9IG5ldyBDQU5OT04uUGxhbmUoKTtcclxuICAgICAgICB0aGlzLmdyb3VuZEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiAwLCAvLyBBIG1hc3Mgb2YgMCBtYWtlcyBpdCBhIHN0YXRpYyAoaW1tb3ZhYmxlKSBib2R5XHJcbiAgICAgICAgICAgIHNoYXBlOiBncm91bmRTaGFwZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIC8vIFJvdGF0ZSB0aGUgQ2Fubm9uLmpzIHBsYW5lIGJvZHkgdG8gbWF0Y2ggdGhlIFRocmVlLmpzIHBsYW5lIG9yaWVudGF0aW9uIChmbGF0KVxyXG4gICAgICAgIHRoaXMuZ3JvdW5kQm9keS5xdWF0ZXJuaW9uLnNldEZyb21BeGlzQW5nbGUobmV3IENBTk5PTi5WZWMzKDEsIDAsIDApLCAtTWF0aC5QSSAvIDIpO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLmdyb3VuZEJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBDcmVhdGVzIHZpc3VhbCBtZXNoZXMgYW5kIHBoeXNpY3MgYm9kaWVzIGZvciBhbGwgb2JqZWN0cyBkZWZpbmVkIGluIGNvbmZpZy5nYW1lU2V0dGluZ3MucGxhY2VkT2JqZWN0cy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVQbGFjZWRPYmplY3RzKCkge1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYWNlZE9iamVjdHMpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiTm8gcGxhY2VkT2JqZWN0cyBkZWZpbmVkIGluIGdhbWVTZXR0aW5ncy5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGFjZWRPYmplY3RzLmZvckVhY2gob2JqQ29uZmlnID0+IHtcclxuICAgICAgICAgICAgY29uc3QgdGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KG9iakNvbmZpZy50ZXh0dXJlTmFtZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IG1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICAgICAgbWFwOiB0ZXh0dXJlLFxyXG4gICAgICAgICAgICAgICAgY29sb3I6IHRleHR1cmUgPyAweGZmZmZmZiA6IDB4YWFhYWFhIC8vIERlZmF1bHQgZ3JleSBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gQ3JlYXRlIFRocmVlLmpzIE1lc2hcclxuICAgICAgICAgICAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkob2JqQ29uZmlnLmRpbWVuc2lvbnMud2lkdGgsIG9iakNvbmZpZy5kaW1lbnNpb25zLmhlaWdodCwgb2JqQ29uZmlnLmRpbWVuc2lvbnMuZGVwdGgpO1xyXG4gICAgICAgICAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcclxuICAgICAgICAgICAgbWVzaC5wb3NpdGlvbi5zZXQob2JqQ29uZmlnLnBvc2l0aW9uLngsIG9iakNvbmZpZy5wb3NpdGlvbi55LCBvYmpDb25maWcucG9zaXRpb24ueik7XHJcbiAgICAgICAgICAgIGlmIChvYmpDb25maWcucm90YXRpb25ZICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIG1lc2gucm90YXRpb24ueSA9IG9iakNvbmZpZy5yb3RhdGlvblk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICAgICAgbWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQobWVzaCk7XHJcbiAgICAgICAgICAgIHRoaXMucGxhY2VkT2JqZWN0TWVzaGVzLnB1c2gobWVzaCk7XHJcblxyXG4gICAgICAgICAgICAvLyBDcmVhdGUgQ2Fubm9uLmpzIEJvZHlcclxuICAgICAgICAgICAgLy8gQ2Fubm9uLkJveCB0YWtlcyBoYWxmIGV4dGVudHNcclxuICAgICAgICAgICAgY29uc3Qgc2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoXHJcbiAgICAgICAgICAgICAgICBvYmpDb25maWcuZGltZW5zaW9ucy53aWR0aCAvIDIsXHJcbiAgICAgICAgICAgICAgICBvYmpDb25maWcuZGltZW5zaW9ucy5oZWlnaHQgLyAyLFxyXG4gICAgICAgICAgICAgICAgb2JqQ29uZmlnLmRpbWVuc2lvbnMuZGVwdGggLyAyXHJcbiAgICAgICAgICAgICkpO1xyXG4gICAgICAgICAgICBjb25zdCBib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgICAgIG1hc3M6IG9iakNvbmZpZy5tYXNzLCAvLyBVc2UgMCBmb3Igc3RhdGljIG9iamVjdHMsID4wIGZvciBkeW5hbWljXHJcbiAgICAgICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKG9iakNvbmZpZy5wb3NpdGlvbi54LCBvYmpDb25maWcucG9zaXRpb24ueSwgb2JqQ29uZmlnLnBvc2l0aW9uLnopLFxyXG4gICAgICAgICAgICAgICAgc2hhcGU6IHNoYXBlXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBpZiAob2JqQ29uZmlnLnJvdGF0aW9uWSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBib2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShuZXcgQ0FOTk9OLlZlYzMoMCwgMSwgMCksIG9iakNvbmZpZy5yb3RhdGlvblkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQuYWRkQm9keShib2R5KTtcclxuICAgICAgICAgICAgdGhpcy5wbGFjZWRPYmplY3RCb2RpZXMucHVzaChib2R5KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgQ3JlYXRlZCAke3RoaXMucGxhY2VkT2JqZWN0TWVzaGVzLmxlbmd0aH0gcGxhY2VkIG9iamVjdHMuYCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHVwIGFtYmllbnQgYW5kIGRpcmVjdGlvbmFsIGxpZ2h0aW5nIGluIHRoZSBzY2VuZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzZXR1cExpZ2h0aW5nKCkge1xyXG4gICAgICAgIGNvbnN0IGFtYmllbnRMaWdodCA9IG5ldyBUSFJFRS5BbWJpZW50TGlnaHQoMHg0MDQwNDAsIDEuMCk7IC8vIFNvZnQgd2hpdGUgYW1iaWVudCBsaWdodFxyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGFtYmllbnRMaWdodCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGRpcmVjdGlvbmFsTGlnaHQgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCgweGZmZmZmZiwgMC44KTsgLy8gQnJpZ2h0ZXIgZGlyZWN0aW9uYWwgbGlnaHRcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnBvc2l0aW9uLnNldCg1LCAxMCwgNSk7IC8vIFBvc2l0aW9uIHRoZSBsaWdodCBzb3VyY2VcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LmNhc3RTaGFkb3cgPSB0cnVlOyAvLyBFbmFibGUgc2hhZG93cyBmcm9tIHRoaXMgbGlnaHQgc291cmNlXHJcbiAgICAgICAgLy8gQ29uZmlndXJlIHNoYWRvdyBwcm9wZXJ0aWVzIGZvciB0aGUgZGlyZWN0aW9uYWwgbGlnaHRcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5tYXBTaXplLndpZHRoID0gMTAyNDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5tYXBTaXplLmhlaWdodCA9IDEwMjQ7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLm5lYXIgPSAwLjU7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmZhciA9IDUwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5sZWZ0ID0gLTEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5yaWdodCA9IDEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS50b3AgPSAxMDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEuYm90dG9tID0gLTEwO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGRpcmVjdGlvbmFsTGlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyB3aW5kb3cgcmVzaXppbmcgdG8ga2VlcCB0aGUgY2FtZXJhIGFzcGVjdCByYXRpbyBhbmQgcmVuZGVyZXIgc2l6ZSBjb3JyZWN0LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uV2luZG93UmVzaXplKCkge1xyXG4gICAgICAgIHRoaXMuYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCk7IC8vIEFwcGx5IHRoZSBmaXhlZCBhc3BlY3QgcmF0aW8gYW5kIGNlbnRlciB0aGUgY2FudmFzXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBcHBsaWVzIHRoZSBjb25maWd1cmVkIGZpeGVkIGFzcGVjdCByYXRpbyB0byB0aGUgcmVuZGVyZXIgYW5kIGNhbWVyYSxcclxuICAgICAqIHJlc2l6aW5nIGFuZCBjZW50ZXJpbmcgdGhlIGNhbnZhcyB0byBmaXQgd2l0aGluIHRoZSB3aW5kb3cuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCkge1xyXG4gICAgICAgIGNvbnN0IHRhcmdldEFzcGVjdFJhdGlvID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZpeGVkQXNwZWN0UmF0aW8ud2lkdGggLyB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby5oZWlnaHQ7XHJcblxyXG4gICAgICAgIGxldCBuZXdXaWR0aDogbnVtYmVyO1xyXG4gICAgICAgIGxldCBuZXdIZWlnaHQ6IG51bWJlcjtcclxuXHJcbiAgICAgICAgY29uc3Qgd2luZG93V2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aDtcclxuICAgICAgICBjb25zdCB3aW5kb3dIZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQ7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFdpbmRvd0FzcGVjdFJhdGlvID0gd2luZG93V2lkdGggLyB3aW5kb3dIZWlnaHQ7XHJcblxyXG4gICAgICAgIGlmIChjdXJyZW50V2luZG93QXNwZWN0UmF0aW8gPiB0YXJnZXRBc3BlY3RSYXRpbykge1xyXG4gICAgICAgICAgICAvLyBXaW5kb3cgaXMgd2lkZXIgdGhhbiB0YXJnZXQgYXNwZWN0IHJhdGlvLCBoZWlnaHQgaXMgdGhlIGxpbWl0aW5nIGZhY3RvclxyXG4gICAgICAgICAgICBuZXdIZWlnaHQgPSB3aW5kb3dIZWlnaHQ7XHJcbiAgICAgICAgICAgIG5ld1dpZHRoID0gbmV3SGVpZ2h0ICogdGFyZ2V0QXNwZWN0UmF0aW87XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gV2luZG93IGlzIHRhbGxlciAob3IgZXhhY3RseSkgdGhlIHRhcmdldCBhc3BlY3QgcmF0aW8sIHdpZHRoIGlzIHRoZSBsaW1pdGluZyBmYWN0b3JcclxuICAgICAgICAgICAgbmV3V2lkdGggPSB3aW5kb3dXaWR0aDtcclxuICAgICAgICAgICAgbmV3SGVpZ2h0ID0gbmV3V2lkdGggLyB0YXJnZXRBc3BlY3RSYXRpbztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNldCByZW5kZXJlciBzaXplLiBUaGUgdGhpcmQgYXJndW1lbnQgYHVwZGF0ZVN0eWxlYCBpcyBmYWxzZSBiZWNhdXNlIHdlIG1hbmFnZSBzdHlsZSBtYW51YWxseS5cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUobmV3V2lkdGgsIG5ld0hlaWdodCwgZmFsc2UpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmFzcGVjdCA9IHRhcmdldEFzcGVjdFJhdGlvO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuXHJcbiAgICAgICAgLy8gUG9zaXRpb24gYW5kIHNpemUgdGhlIGNhbnZhcyBlbGVtZW50IHVzaW5nIENTU1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5jYW52YXMuc3R5bGUsIHtcclxuICAgICAgICAgICAgd2lkdGg6IGAke25ld1dpZHRofXB4YCxcclxuICAgICAgICAgICAgaGVpZ2h0OiBgJHtuZXdIZWlnaHR9cHhgLFxyXG4gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcclxuICAgICAgICAgICAgdG9wOiAnNTAlJyxcclxuICAgICAgICAgICAgbGVmdDogJzUwJScsXHJcbiAgICAgICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLCAtNTAlKScsXHJcbiAgICAgICAgICAgIG9iamVjdEZpdDogJ2NvbnRhaW4nIC8vIEVuc3VyZXMgY29udGVudCBpcyBzY2FsZWQgYXBwcm9wcmlhdGVseSBpZiB0aGVyZSdzIGFueSBtaXNtYXRjaFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGUgdGl0bGUgc2NyZWVuIGlzIGFjdGl2ZSwgdXBkYXRlIGl0cyBzaXplIGFuZCBwb3NpdGlvbiBhcyB3ZWxsIHRvIG1hdGNoIHRoZSBjYW52YXNcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFICYmIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KSB7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuc3R5bGUsIHtcclxuICAgICAgICAgICAgICAgIHdpZHRoOiBgJHtuZXdXaWR0aH1weGAsXHJcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGAke25ld0hlaWdodH1weGAsXHJcbiAgICAgICAgICAgICAgICB0b3A6ICc1MCUnLFxyXG4gICAgICAgICAgICAgICAgbGVmdDogJzUwJScsXHJcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknLFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWNvcmRzIHdoaWNoIGtleXMgYXJlIGN1cnJlbnRseSBwcmVzc2VkIGRvd24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25LZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmtleS50b0xvd2VyQ2FzZSgpXSA9IHRydWU7XHJcbiAgICAgICAgLy8gQURERUQ6IEhhbmRsZSBqdW1wIGlucHV0IG9ubHkgd2hlbiBwbGF5aW5nIGFuZCBwb2ludGVyIGlzIGxvY2tlZFxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiB0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICBpZiAoZXZlbnQua2V5LnRvTG93ZXJDYXNlKCkgPT09ICcgJykgeyAvLyBTcGFjZWJhclxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJKdW1wKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWNvcmRzIHdoaWNoIGtleXMgYXJlIGN1cnJlbnRseSByZWxlYXNlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbktleVVwKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmtleS50b0xvd2VyQ2FzZSgpXSA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyBtb3VzZSBtb3ZlbWVudCBmb3IgY2FtZXJhIHJvdGF0aW9uIChtb3VzZSBsb29rKS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbk1vdXNlTW92ZShldmVudDogTW91c2VFdmVudCkge1xyXG4gICAgICAgIC8vIE9ubHkgcHJvY2VzcyBtb3VzZSBtb3ZlbWVudCBpZiB0aGUgZ2FtZSBpcyBwbGF5aW5nIGFuZCBwb2ludGVyIGlzIGxvY2tlZFxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiB0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICBjb25zdCBtb3ZlbWVudFggPSBldmVudC5tb3ZlbWVudFggfHwgMDtcclxuICAgICAgICAgICAgY29uc3QgbW92ZW1lbnRZID0gZXZlbnQubW92ZW1lbnRZIHx8IDA7XHJcblxyXG4gICAgICAgICAgICAvLyBBcHBseSBob3Jpem9udGFsIHJvdGF0aW9uICh5YXcpIHRvIHRoZSBjYW1lcmFDb250YWluZXIgYXJvdW5kIGl0cyBsb2NhbCBZLWF4aXMgKHdoaWNoIGlzIGdsb2JhbCBZKVxyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5yb3RhdGlvbi55IC09IG1vdmVtZW50WCAqIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5tb3VzZVNlbnNpdGl2aXR5O1xyXG5cclxuICAgICAgICAgICAgLy8gQXBwbHkgdmVydGljYWwgcm90YXRpb24gKHBpdGNoKSB0byB0aGUgY2FtZXJhIGl0c2VsZiBhbmQgY2xhbXAgaXRcclxuICAgICAgICAgICAgLy8gTW91c2UgVVAgKG1vdmVtZW50WSA8IDApIG5vdyBpbmNyZWFzZXMgY2FtZXJhUGl0Y2ggLT4gbG9va3MgdXAuXHJcbiAgICAgICAgICAgIC8vIE1vdXNlIERPV04gKG1vdmVtZW50WSA+IDApIG5vdyBkZWNyZWFzZXMgY2FtZXJhUGl0Y2ggLT4gbG9va3MgZG93bi5cclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFQaXRjaCAtPSBtb3ZlbWVudFkgKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubW91c2VTZW5zaXRpdml0eTsgXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUGl0Y2ggPSBNYXRoLm1heCgtTWF0aC5QSSAvIDIsIE1hdGgubWluKE1hdGguUEkgLyAyLCB0aGlzLmNhbWVyYVBpdGNoKSk7IC8vIENsYW1wIHRvIC05MCB0byArOTAgZGVncmVlc1xyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5yb3RhdGlvbi54ID0gdGhpcy5jYW1lcmFQaXRjaDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVcGRhdGVzIHRoZSBwb2ludGVyIGxvY2sgc3RhdHVzIHdoZW4gaXQgY2hhbmdlcyAoZS5nLiwgdXNlciBwcmVzc2VzIEVzYykuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25Qb2ludGVyTG9ja0NoYW5nZSgpIHtcclxuICAgICAgICBpZiAoZG9jdW1lbnQucG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLmNhbnZhcyB8fFxyXG4gICAgICAgICAgICAoZG9jdW1lbnQgYXMgYW55KS5tb3pQb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMuY2FudmFzIHx8XHJcbiAgICAgICAgICAgIChkb2N1bWVudCBhcyBhbnkpLndlYmtpdFBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgdGhpcy5pc1BvaW50ZXJMb2NrZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUG9pbnRlciBsb2NrZWQnKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmlzUG9pbnRlckxvY2tlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUG9pbnRlciB1bmxvY2tlZCcpO1xyXG4gICAgICAgICAgICAvLyBXaGVuIHBvaW50ZXIgaXMgdW5sb2NrZWQgYnkgdXNlciAoZS5nLiwgcHJlc3NpbmcgRXNjKSwgY3Vyc29yIGFwcGVhcnMgYXV0b21hdGljYWxseS5cclxuICAgICAgICAgICAgLy8gTW91c2UgbG9vayBzdG9wcyBkdWUgdG8gYGlzUG9pbnRlckxvY2tlZGAgY2hlY2sgaW4gb25Nb3VzZU1vdmUuXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVGhlIG1haW4gZ2FtZSBsb29wLCBjYWxsZWQgb24gZXZlcnkgYW5pbWF0aW9uIGZyYW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFuaW1hdGUodGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCkge1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGUuYmluZCh0aGlzKSk7IC8vIFJlcXVlc3QgbmV4dCBmcmFtZVxyXG5cclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAodGltZSAtIHRoaXMubGFzdFRpbWUpIC8gMTAwMDsgLy8gQ2FsY3VsYXRlIGRlbHRhIHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSB0aW1lO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQbGF5ZXJNb3ZlbWVudCgpOyAvLyBVcGRhdGUgcGxheWVyJ3MgdmVsb2NpdHkgYmFzZWQgb24gaW5wdXRcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQaHlzaWNzKGRlbHRhVGltZSk7IC8vIFN0ZXAgdGhlIHBoeXNpY3Mgd29ybGRcclxuICAgICAgICAgICAgdGhpcy5jbGFtcFBsYXllclBvc2l0aW9uKCk7IC8vIENsYW1wIHBsYXllciBwb3NpdGlvbiB0byBwcmV2ZW50IGdvaW5nIGJleW9uZCBncm91bmQgZWRnZXNcclxuICAgICAgICAgICAgdGhpcy5zeW5jTWVzaGVzV2l0aEJvZGllcygpOyAvLyBTeW5jaHJvbml6ZSB2aXN1YWwgbWVzaGVzIHdpdGggcGh5c2ljcyBib2RpZXNcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhKTsgLy8gUmVuZGVyIHRoZSBzY2VuZVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3RlcHMgdGhlIENhbm5vbi5qcyBwaHlzaWNzIHdvcmxkIGZvcndhcmQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlUGh5c2ljcyhkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIC8vIHdvcmxkLnN0ZXAoZml4ZWRUaW1lU3RlcCwgZGVsdGFUaW1lLCBtYXhTdWJTdGVwcylcclxuICAgICAgICAvLyAxLzYwOiBBIGZpeGVkIHRpbWUgc3RlcCBvZiA2MCBwaHlzaWNzIHVwZGF0ZXMgcGVyIHNlY29uZCAoc3RhbmRhcmQpLlxyXG4gICAgICAgIC8vIGRlbHRhVGltZTogVGhlIGFjdHVhbCB0aW1lIGVsYXBzZWQgc2luY2UgdGhlIGxhc3QgcmVuZGVyIGZyYW1lLlxyXG4gICAgICAgIC8vIG1heFBoeXNpY3NTdWJTdGVwczogTGltaXRzIHRoZSBudW1iZXIgb2YgcGh5c2ljcyBzdGVwcyBpbiBvbmUgcmVuZGVyIGZyYW1lXHJcbiAgICAgICAgLy8gdG8gcHJldmVudCBpbnN0YWJpbGl0aWVzIGlmIHJlbmRlcmluZyBzbG93cyBkb3duIHNpZ25pZmljYW50bHkuXHJcbiAgICAgICAgdGhpcy53b3JsZC5zdGVwKDEgLyA2MCwgZGVsdGFUaW1lLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubWF4UGh5c2ljc1N1YlN0ZXBzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgdGhlIHBsYXllcidzIHZlbG9jaXR5IGJhc2VkIG9uIFdBU0QgaW5wdXQgYW5kIGNhbWVyYSBvcmllbnRhdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVQbGF5ZXJNb3ZlbWVudCgpIHtcclxuICAgICAgICAvLyBQbGF5ZXIgbW92ZW1lbnQgc2hvdWxkIG9ubHkgaGFwcGVuIHdoZW4gdGhlIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICAgICAgaWYgKCF0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICAvLyBJZiBwb2ludGVyIGlzIG5vdCBsb2NrZWQsIHN0b3AgaG9yaXpvbnRhbCBtb3ZlbWVudCBpbW1lZGlhdGVseVxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBFeGl0IGVhcmx5IGFzIG5vIG1vdmVtZW50IGlucHV0IHNob3VsZCBiZSBwcm9jZXNzZWRcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBlZmZlY3RpdmVQbGF5ZXJTcGVlZCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJTcGVlZDtcclxuXHJcbiAgICAgICAgLy8gSWYgcGxheWVyIGlzIGluIHRoZSBhaXIsIHJlZHVjZSB0aGUgZWZmZWN0aXZlIHNwZWVkIHRvIHNpbXVsYXRlIGFpciByZXNpc3RhbmNlXHJcbiAgICAgICAgLy8gYW5kIG1hdGNoIHRoZSB0eXBpY2FsbHkgbG93ZXIgZWZmZWN0aXZlIHNwZWVkIHdoZW4gb24gdGhlIGdyb3VuZCBkdWUgdG8gY29udGFjdCBmcmljdGlvbi5cclxuICAgICAgICAvLyBUaGUgdmFsdWUgJzAuOScgaXMgYSBoZXVyaXN0aWMsIHR1bmUgYmFzZWQgb24gaG93IG11Y2ggZ3JvdW5kIGZyaWN0aW9uIHJlZHVjZXMgdGhlIHNwZWVkLlxyXG4gICAgICAgIGlmICh0aGlzLm51bUdyb3VuZENvbnRhY3RzID09PSAwKSB7XHJcbiAgICAgICAgICAgIGVmZmVjdGl2ZVBsYXllclNwZWVkICo9IDAuNzsgLy8gUmVkdWNlIHNwZWVkIGJ5IDMwJSB3aGVuIGFpcmJvcm5lIChjaGFuZ2VkIGZyb20gMC45KVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBjdXJyZW50WVZlbG9jaXR5ID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5Lnk7IC8vIFByZXNlcnZlIHZlcnRpY2FsIHZlbG9jaXR5XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgbW92ZURpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIDApOyAvLyBVc2UgYSBUSFJFRS5WZWN0b3IzIGZvciBjYWxjdWxhdGlvbiBlYXNlXHJcblxyXG4gICAgICAgIC8vIEdldCBjYW1lcmFDb250YWluZXIncyBmb3J3YXJkIHZlY3RvciAoaG9yaXpvbnRhbCBkaXJlY3Rpb24gcGxheWVyIGlzIGxvb2tpbmcpXHJcbiAgICAgICAgY29uc3QgY2FtZXJhRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5nZXRXb3JsZERpcmVjdGlvbihjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgIGNhbWVyYURpcmVjdGlvbi55ID0gMDsgLy8gRmxhdHRlbiB0aGUgdmVjdG9yIHRvIHJlc3RyaWN0IG1vdmVtZW50IHRvIHRoZSBob3Jpem9udGFsIHBsYW5lXHJcbiAgICAgICAgY2FtZXJhRGlyZWN0aW9uLm5vcm1hbGl6ZSgpO1xyXG5cclxuICAgICAgICBjb25zdCBnbG9iYWxVcCA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDEsIDApOyAvLyBEZWZpbmUgZ2xvYmFsIHVwIHZlY3RvciBmb3IgY3Jvc3MgcHJvZHVjdFxyXG5cclxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlICdyaWdodCcgdmVjdG9yIHJlbGF0aXZlIHRvIGNhbWVyYSdzIGZvcndhcmQgZGlyZWN0aW9uXHJcbiAgICAgICAgLy8gQnkgY3Jvc3NpbmcgZ2xvYmFsVXAgd2l0aCBjYW1lcmFEaXJlY3Rpb24sIHdlIGdldCBhIHZlY3RvciBwb2ludGluZyB0byB0aGUgY2FtZXJhJ3MgcmlnaHQuXHJcbiAgICAgICAgY29uc3QgY2FtZXJhUmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIGNhbWVyYVJpZ2h0LmNyb3NzVmVjdG9ycyhnbG9iYWxVcCwgY2FtZXJhRGlyZWN0aW9uKS5ub3JtYWxpemUoKTsgXHJcblxyXG4gICAgICAgIGxldCBtb3ZpbmcgPSBmYWxzZTtcclxuICAgICAgICAvLyBXIDwtPiBTIHN3YXA6XHJcbiAgICAgICAgLy8gJ3MnIGtleSBub3cgbW92ZXMgZm9yd2FyZCAob3JpZ2luYWxseSAndycpXHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1sncyddKSB7IFxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLmFkZChjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyAndycga2V5IG5vdyBtb3ZlcyBiYWNrd2FyZCAob3JpZ2luYWxseSAncycpXHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1sndyddKSB7IFxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLnN1YihjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBVc2VyIHJlcXVlc3Q6IFN3YXAgQSBhbmQgRCBjb250cm9scy5cclxuICAgICAgICAvLyBBIHNob3VsZCBzdHJhZmUgbGVmdCAoc3VidHJhY3QgY2FtZXJhUmlnaHQpLlxyXG4gICAgICAgIC8vIEQgc2hvdWxkIHN0cmFmZSByaWdodCAoYWRkIGNhbWVyYVJpZ2h0KS5cclxuICAgICAgICBpZiAodGhpcy5rZXlzWydhJ10pIHsgLy8gJ2EnIGtleSBub3cgc3RyYWZlcyBsZWZ0IChzdGFuZGFyZCBiZWhhdmlvcilcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5zdWIoY2FtZXJhUmlnaHQpOyBcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1snZCddKSB7IC8vICdkJyBrZXkgbm93IHN0cmFmZXMgcmlnaHQgKHN0YW5kYXJkIGJlaGF2aW9yKVxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLmFkZChjYW1lcmFSaWdodCk7IFxyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKG1vdmluZykge1xyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLm5vcm1hbGl6ZSgpLm11bHRpcGx5U2NhbGFyKGVmZmVjdGl2ZVBsYXllclNwZWVkKTsgLy8gVXNlIHRoZSBhZGp1c3RlZCBlZmZlY3RpdmUgc3BlZWRcclxuICAgICAgICAgICAgLy8gRGlyZWN0bHkgc2V0IHRoZSBob3Jpem9udGFsIHZlbG9jaXR5IGNvbXBvbmVudHMuXHJcbiAgICAgICAgICAgIC8vIFRoaXMgZml4ZXMgdGhlIHBlcmNlaXZlZCBkaWFnb25hbCBzbG93ZG93biBieSBlbnN1cmluZyBjb25zaXN0ZW50IHNwZWVkIGluIGFsbCBob3Jpem9udGFsIGRpcmVjdGlvbnMsXHJcbiAgICAgICAgICAgIC8vIGFuZCBwcm92aWRlcyBpbnN0YW50IHJlc3BvbnNpdmVuZXNzIChubyBhY2NlbGVyYXRpb24gZmFjdG9yIGludGVycG9sYXRpb24pLlxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IG1vdmVEaXJlY3Rpb24ueDtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSBtb3ZlRGlyZWN0aW9uLno7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gSWYgbm8gbW92ZW1lbnQga2V5cyBhcmUgcHJlc3NlZCwgYXBwbHkgaG9yaXpvbnRhbCBmcmljdGlvbiB0byBzbW9vdGhseSBkZWNlbGVyYXRlXHJcbiAgICAgICAgICAgIGNvbnN0IGZyaWN0aW9uRmFjdG9yID0gMC44OyAvLyBBZGp1c3QgZm9yIGRlc2lyZWQgZGVjZWxlcmF0aW9uIGZlZWxcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggKj0gZnJpY3Rpb25GYWN0b3I7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ICo9IGZyaWN0aW9uRmFjdG9yO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueSA9IGN1cnJlbnRZVmVsb2NpdHk7IC8vIFJlc3RvcmUgWSB2ZWxvY2l0eSAoZ3Jhdml0eS9qdW1wcykgdG8gcHJldmVudCBpbnRlcmZlcmluZyB3aXRoIHZlcnRpY2FsIG1vdmVtZW50XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBRERFRDogQXBwbGllcyBhbiB1cHdhcmQgaW1wdWxzZSB0byB0aGUgcGxheWVyIGJvZHkgZm9yIGp1bXBpbmcuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcGxheWVySnVtcCgpIHtcclxuICAgICAgICAvLyBPbmx5IGFsbG93IGp1bXAgaWYgdGhlIHBsYXllciBpcyBjdXJyZW50bHkgb24gdGhlIGdyb3VuZCAoaGFzIGFjdGl2ZSBjb250YWN0cylcclxuICAgICAgICBpZiAodGhpcy5udW1Hcm91bmRDb250YWN0cyA+IDApIHtcclxuICAgICAgICAgICAgLy8gQ2xlYXIgYW55IGV4aXN0aW5nIHZlcnRpY2FsIHZlbG9jaXR5IHRvIGVuc3VyZSBhIGNvbnNpc3RlbnQganVtcCBoZWlnaHRcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnkgPSAwOyBcclxuICAgICAgICAgICAgLy8gQXBwbHkgYW4gdXB3YXJkIGltcHVsc2UgKG1hc3MgKiBjaGFuZ2VfaW5fdmVsb2NpdHkpXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5hcHBseUltcHVsc2UoXHJcbiAgICAgICAgICAgICAgICBuZXcgQ0FOTk9OLlZlYzMoMCwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmp1bXBGb3JjZSwgMCksXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24gLy8gQXBwbHkgaW1wdWxzZSBhdCB0aGUgY2VudGVyIG9mIG1hc3NcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbGFtcHMgdGhlIHBsYXllcidzIHBvc2l0aW9uIHdpdGhpbiB0aGUgZGVmaW5lZCBncm91bmQgYm91bmRhcmllcy5cclxuICAgICAqIFByZXZlbnRzIHRoZSBwbGF5ZXIgZnJvbSBtb3ZpbmcgYmV5b25kIHRoZSAnZW5kIG9mIHRoZSB3b3JsZCcuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY2xhbXBQbGF5ZXJQb3NpdGlvbigpIHtcclxuICAgICAgICBpZiAoIXRoaXMucGxheWVyQm9keSB8fCAhdGhpcy5jb25maWcpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaGFsZkdyb3VuZFNpemUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDI7XHJcblxyXG4gICAgICAgIGxldCBwb3NYID0gdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLng7XHJcbiAgICAgICAgbGV0IHBvc1ogPSB0aGlzLnBsYXllckJvZHkucG9zaXRpb24uejtcclxuICAgICAgICBsZXQgdmVsWCA9IHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54O1xyXG4gICAgICAgIGxldCB2ZWxaID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5Lno7XHJcblxyXG4gICAgICAgIC8vIENsYW1wIFggcG9zaXRpb25cclxuICAgICAgICBpZiAocG9zWCA+IGhhbGZHcm91bmRTaXplKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi54ID0gaGFsZkdyb3VuZFNpemU7XHJcbiAgICAgICAgICAgIGlmICh2ZWxYID4gMCkgeyAvLyBJZiBtb3Zpbmcgb3V0d2FyZHMsIHN0b3AgaG9yaXpvbnRhbCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmIChwb3NYIDwgLWhhbGZHcm91bmRTaXplKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi54ID0gLWhhbGZHcm91bmRTaXplO1xyXG4gICAgICAgICAgICBpZiAodmVsWCA8IDApIHsgLy8gSWYgbW92aW5nIG91dHdhcmRzLCBzdG9wIGhvcml6b250YWwgdmVsb2NpdHlcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2xhbXAgWiBwb3NpdGlvblxyXG4gICAgICAgIGlmIChwb3NaID4gaGFsZkdyb3VuZFNpemUpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnogPSBoYWxmR3JvdW5kU2l6ZTtcclxuICAgICAgICAgICAgaWYgKHZlbFogPiAwKSB7IC8vIElmIG1vdmluZyBvdXR3YXJkcywgc3RvcCBob3Jpem9udGFsIHZlbG9jaXR5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHBvc1ogPCAtaGFsZkdyb3VuZFNpemUpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnogPSAtaGFsZkdyb3VuZFNpemU7XHJcbiAgICAgICAgICAgIGlmICh2ZWxaIDwgMCkgeyAvLyBJZiBtb3Zpbmcgb3V0d2FyZHMsIHN0b3AgaG9yaXpvbnRhbCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3luY2hyb25pemVzIHRoZSB2aXN1YWwgbWVzaGVzIHdpdGggdGhlaXIgY29ycmVzcG9uZGluZyBwaHlzaWNzIGJvZGllcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzeW5jTWVzaGVzV2l0aEJvZGllcygpIHtcclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSBwbGF5ZXIncyB2aXN1YWwgbWVzaCBwb3NpdGlvbiB3aXRoIGl0cyBwaHlzaWNzIGJvZHkncyBwb3NpdGlvblxyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIGNhbWVyYUNvbnRhaW5lciBwb3NpdGlvbiB3aXRoIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkncyBwb3NpdGlvbi5cclxuICAgICAgICAvLyBUaGlzIGVuc3VyZXMgdGhlIGNhbWVyYSBpcyBhbHdheXMgcHJlY2lzZWx5IGF0IHRoZSBwbGF5ZXIncyBjdXJyZW50IHBoeXNpY3MgbG9jYXRpb24sXHJcbiAgICAgICAgLy8gZWxpbWluYXRpbmcgdGhlIHJlcG9ydGVkIGxhZy5cclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG5cclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSBwbGF5ZXIncyB2aXN1YWwgbWVzaCBob3Jpem9udGFsIHJvdGF0aW9uICh5YXcpIHdpdGggY2FtZXJhQ29udGFpbmVyJ3MgeWF3LlxyXG4gICAgICAgIC8vIFRoZSBjYW1lcmFDb250YWluZXIgZGljdGF0ZXMgdGhlIHBsYXllcidzIGhvcml6b250YWwgZmFjaW5nIGRpcmVjdGlvbi5cclxuICAgICAgICB0aGlzLnBsYXllck1lc2gucXVhdGVybmlvbi5jb3B5KHRoaXMuY2FtZXJhQ29udGFpbmVyLnF1YXRlcm5pb24pO1xyXG5cclxuICAgICAgICAvLyBUaGUgZ3JvdW5kIGFuZCBwbGFjZWQgb2JqZWN0cyBhcmUgY3VycmVudGx5IHN0YXRpYyAobWFzcyAwKSwgc28gdGhlaXIgdmlzdWFsIG1lc2hlc1xyXG4gICAgICAgIC8vIGRvIG5vdCBuZWVkIHRvIGJlIHN5bmNocm9uaXplZCB3aXRoIHRoZWlyIHBoeXNpY3MgYm9kaWVzIGFmdGVyIGluaXRpYWwgcGxhY2VtZW50LlxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBTdGFydCB0aGUgZ2FtZSB3aGVuIHRoZSBET00gY29udGVudCBpcyBmdWxseSBsb2FkZWRcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcclxuICAgIG5ldyBHYW1lKCk7XHJcbn0pOyJdLAogICJtYXBwaW5ncyI6ICJBQUFBLFlBQVksV0FBVztBQUN2QixZQUFZLFlBQVk7QUFHeEIsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUZDLFNBQUFBO0FBQUEsR0FBQTtBQTJDTCxNQUFNLEtBQUs7QUFBQSxFQTZDUCxjQUFjO0FBM0NkO0FBQUEsU0FBUSxRQUFtQjtBQW9CM0I7QUFBQSxTQUFRLHFCQUFtQyxDQUFDO0FBQzVDLFNBQVEscUJBQW9DLENBQUM7QUFHN0M7QUFBQSxTQUFRLE9BQW1DLENBQUM7QUFDNUM7QUFBQSxTQUFRLGtCQUEyQjtBQUNuQztBQUFBLFNBQVEsY0FBc0I7QUFHOUI7QUFBQTtBQUFBLFNBQVEsV0FBdUMsb0JBQUksSUFBSTtBQUN2RDtBQUFBLFNBQVEsU0FBd0Msb0JBQUksSUFBSTtBQVF4RDtBQUFBLFNBQVEsV0FBZ0M7QUFHeEM7QUFBQSxTQUFRLG9CQUE0QjtBQUloQyxTQUFLLFNBQVMsU0FBUyxlQUFlLFlBQVk7QUFDbEQsUUFBSSxDQUFDLEtBQUssUUFBUTtBQUNkLGNBQVEsTUFBTSxnREFBZ0Q7QUFDOUQ7QUFBQSxJQUNKO0FBQ0EsU0FBSyxLQUFLO0FBQUEsRUFDZDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsTUFBYyxPQUFPO0FBRWpCLFFBQUk7QUFDQSxZQUFNLFdBQVcsTUFBTSxNQUFNLFdBQVc7QUFDeEMsVUFBSSxDQUFDLFNBQVMsSUFBSTtBQUNkLGNBQU0sSUFBSSxNQUFNLHVCQUF1QixTQUFTLE1BQU0sRUFBRTtBQUFBLE1BQzVEO0FBQ0EsV0FBSyxTQUFTLE1BQU0sU0FBUyxLQUFLO0FBQ2xDLGNBQVEsSUFBSSw4QkFBOEIsS0FBSyxNQUFNO0FB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
