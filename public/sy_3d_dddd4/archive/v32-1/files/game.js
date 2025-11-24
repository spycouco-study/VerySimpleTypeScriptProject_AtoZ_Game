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
    this.playerMaterial = new CANNON.Material("playerMaterial");
    this.groundMaterial = new CANNON.Material("groundMaterial");
    const playerGroundContactMaterial = new CANNON.ContactMaterial(
      this.playerMaterial,
      this.groundMaterial,
      {
        friction: this.config.gameSettings.playerGroundFriction,
        // Use configurable ground friction
        restitution: 0
        // No bounce for ground
        // Optionally tune contactEquationRelaxation and frictionEquationRelaxation for stability/feel
        // contactEquationRelaxation: 3, 
        // frictionEquationRelaxation: 3
      }
    );
    this.world.addContactMaterial(playerGroundContactMaterial);
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
      fixedRotation: true,
      // Prevent the player from falling over (simulates a capsule/cylinder character)
      material: this.playerMaterial
      // Assign the player material for contact resolution
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
      shape: groundShape,
      material: this.groundMaterial
      // Assign the ground material for contact resolution
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
        // For placed objects, if they are static, material isn't strictly necessary unless they interact dynamically with the player.
        // If they are dynamic, a separate material might be desired. For now, they'll implicitly use world's default or interact via playerMaterial.
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
      effectivePlayerSpeed *= this.config.gameSettings.playerAirControlFactor;
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
      if (this.numGroundContacts === 0) {
        this.playerBody.velocity.x *= this.config.gameSettings.playerAirDeceleration;
        this.playerBody.velocity.z *= this.config.gameSettings.playerAirDeceleration;
      } else {
      }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuXHJcbi8vIEVudW0gdG8gZGVmaW5lIHRoZSBwb3NzaWJsZSBzdGF0ZXMgb2YgdGhlIGdhbWVcclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgVElUTEUsICAgLy8gVGl0bGUgc2NyZWVuLCB3YWl0aW5nIGZvciB1c2VyIGlucHV0XHJcbiAgICBQTEFZSU5HICAvLyBHYW1lIGlzIGFjdGl2ZSwgdXNlciBjYW4gbW92ZSBhbmQgbG9vayBhcm91bmRcclxufVxyXG5cclxuLy8gSW50ZXJmYWNlIGZvciBvYmplY3RzIHBsYWNlZCBpbiB0aGUgc2NlbmVcclxuaW50ZXJmYWNlIFBsYWNlZE9iamVjdENvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7IC8vIEEgZGVzY3JpcHRpdmUgbmFtZSBmb3IgdGhlIG9iamVjdCBpbnN0YW5jZVxyXG4gICAgdGV4dHVyZU5hbWU6IHN0cmluZzsgLy8gTmFtZSBvZiB0aGUgdGV4dHVyZSBmcm9tIGFzc2V0cy5pbWFnZXNcclxuICAgIHR5cGU6ICdib3gnOyAvLyBDdXJyZW50bHkgb25seSBzdXBwb3J0cyAnYm94J1xyXG4gICAgcG9zaXRpb246IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xyXG4gICAgZGltZW5zaW9uczogeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgZGVwdGg6IG51bWJlciB9O1xyXG4gICAgcm90YXRpb25ZPzogbnVtYmVyOyAvLyBPcHRpb25hbCByb3RhdGlvbiBhcm91bmQgWS1heGlzIChyYWRpYW5zKVxyXG4gICAgbWFzczogbnVtYmVyOyAvLyAwIGZvciBzdGF0aWMsID4wIGZvciBkeW5hbWljICh0aG91Z2ggYWxsIHBsYWNlZCBvYmplY3RzIGhlcmUgd2lsbCBiZSBzdGF0aWMpXHJcbn1cclxuXHJcbi8vIEludGVyZmFjZSB0byB0eXBlLWNoZWNrIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHN0YXJ0R2FtZVByb21wdDogc3RyaW5nO1xyXG4gICAgICAgIHBsYXllclNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgbW91c2VTZW5zaXRpdml0eTogbnVtYmVyO1xyXG4gICAgICAgIGNhbWVyYUhlaWdodE9mZnNldDogbnVtYmVyOyAvLyBWZXJ0aWNhbCBvZmZzZXQgb2YgdGhlIGNhbWVyYSBmcm9tIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkgY2VudGVyXHJcbiAgICAgICAgY2FtZXJhTmVhcjogbnVtYmVyOyAgICAgICAgIC8vIE5lYXIgY2xpcHBpbmcgcGxhbmUgZm9yIHRoZSBjYW1lcmFcclxuICAgICAgICBjYW1lcmFGYXI6IG51bWJlcjsgICAgICAgICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lIGZvciB0aGUgY2FtZXJhXHJcbiAgICAgICAgcGxheWVyTWFzczogbnVtYmVyOyAgICAgICAgIC8vIE1hc3Mgb2YgdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keVxyXG4gICAgICAgIGdyb3VuZFNpemU6IG51bWJlcjsgICAgICAgICAvLyBTaXplICh3aWR0aC9kZXB0aCkgb2YgdGhlIHNxdWFyZSBncm91bmQgcGxhbmVcclxuICAgICAgICBtYXhQaHlzaWNzU3ViU3RlcHM6IG51bWJlcjsgLy8gTWF4aW11bSBudW1iZXIgb2YgcGh5c2ljcyBzdWJzdGVwcyBwZXIgZnJhbWUgdG8gbWFpbnRhaW4gc3RhYmlsaXR5XHJcbiAgICAgICAgZml4ZWRBc3BlY3RSYXRpbzogeyB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciB9OyAvLyBOZXc6IEZpeGVkIGFzcGVjdCByYXRpbyBmb3IgdGhlIGdhbWUgKHdpZHRoIC8gaGVpZ2h0KVxyXG4gICAgICAgIGp1bXBGb3JjZTogbnVtYmVyOyAgICAgICAgICAvLyBBRERFRDogRm9yY2UgYXBwbGllZCB3aGVuIGp1bXBpbmdcclxuICAgICAgICBwbGFjZWRPYmplY3RzOiBQbGFjZWRPYmplY3RDb25maWdbXTsgLy8gTkVXOiBBcnJheSBvZiBvYmplY3RzIHRvIHBsYWNlIGluIHRoZSB3b3JsZFxyXG4gICAgICAgIC8vIE5FVzogQ29uZmlndXJhYmxlIHBoeXNpY3MgcHJvcGVydGllc1xyXG4gICAgICAgIHBsYXllckdyb3VuZEZyaWN0aW9uOiBudW1iZXI7ICAgICAgICAvLyBGcmljdGlvbiBjb2VmZmljaWVudCBmb3IgcGxheWVyLWdyb3VuZCBjb250YWN0XHJcbiAgICAgICAgcGxheWVyQWlyQ29udHJvbEZhY3RvcjogbnVtYmVyOyAgICAvLyBNdWx0aXBsaWVyIGZvciBwbGF5ZXJTcGVlZCB3aGVuIGFpcmJvcm5lXHJcbiAgICAgICAgcGxheWVyQWlyRGVjZWxlcmF0aW9uOiBudW1iZXI7ICAgICAvLyBEZWNheSBmYWN0b3IgZm9yIGhvcml6b250YWwgdmVsb2NpdHkgd2hlbiBhaXJib3JuZSBhbmQgbm90IG1vdmluZ1xyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfVtdO1xyXG4gICAgICAgIHNvdW5kczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyOyB2b2x1bWU6IG51bWJlciB9W107XHJcbiAgICB9O1xyXG59XHJcblxyXG4vKipcclxuICogTWFpbiBHYW1lIGNsYXNzIHJlc3BvbnNpYmxlIGZvciBpbml0aWFsaXppbmcgYW5kIHJ1bm5pbmcgdGhlIDNEIGdhbWUuXHJcbiAqIEl0IGhhbmRsZXMgVGhyZWUuanMgcmVuZGVyaW5nLCBDYW5ub24tZXMgcGh5c2ljcywgaW5wdXQsIGFuZCBnYW1lIHN0YXRlLlxyXG4gKi9cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNvbmZpZyE6IEdhbWVDb25maWc7IC8vIEdhbWUgY29uZmlndXJhdGlvbiBsb2FkZWQgZnJvbSBkYXRhLmpzb25cclxuICAgIHByaXZhdGUgc3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTsgLy8gQ3VycmVudCBzdGF0ZSBvZiB0aGUgZ2FtZVxyXG5cclxuICAgIC8vIFRocmVlLmpzIGVsZW1lbnRzIGZvciByZW5kZXJpbmdcclxuICAgIHByaXZhdGUgc2NlbmUhOiBUSFJFRS5TY2VuZTtcclxuICAgIHByaXZhdGUgY2FtZXJhITogVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmE7XHJcbiAgICBwcml2YXRlIHJlbmRlcmVyITogVEhSRUUuV2ViR0xSZW5kZXJlcjtcclxuICAgIHByaXZhdGUgY2FudmFzITogSFRNTENhbnZhc0VsZW1lbnQ7IC8vIFRoZSBIVE1MIGNhbnZhcyBlbGVtZW50IGZvciByZW5kZXJpbmdcclxuXHJcbiAgICAvLyBOZXc6IEEgY29udGFpbmVyIG9iamVjdCBmb3IgdGhlIGNhbWVyYSB0byBoYW5kbGUgaG9yaXpvbnRhbCByb3RhdGlvbiBzZXBhcmF0ZWx5IGZyb20gdmVydGljYWwgcGl0Y2guXHJcbiAgICBwcml2YXRlIGNhbWVyYUNvbnRhaW5lciE6IFRIUkVFLk9iamVjdDNEOyBcclxuXHJcbiAgICAvLyBDYW5ub24tZXMgZWxlbWVudHMgZm9yIHBoeXNpY3NcclxuICAgIHByaXZhdGUgd29ybGQhOiBDQU5OT04uV29ybGQ7XHJcbiAgICBwcml2YXRlIHBsYXllckJvZHkhOiBDQU5OT04uQm9keTsgLy8gUGh5c2ljcyBib2R5IGZvciB0aGUgcGxheWVyXHJcbiAgICBwcml2YXRlIGdyb3VuZEJvZHkhOiBDQU5OT04uQm9keTsgLy8gUGh5c2ljcyBib2R5IGZvciB0aGUgZ3JvdW5kXHJcblxyXG4gICAgLy8gTkVXOiBDYW5ub24tZXMgbWF0ZXJpYWxzIGZvciBwaHlzaWNzXHJcbiAgICBwcml2YXRlIHBsYXllck1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsO1xyXG4gICAgcHJpdmF0ZSBncm91bmRNYXRlcmlhbCE6IENBTk5PTi5NYXRlcmlhbDtcclxuXHJcbiAgICAvLyBWaXN1YWwgbWVzaGVzIChUaHJlZS5qcykgZm9yIGdhbWUgb2JqZWN0c1xyXG4gICAgcHJpdmF0ZSBwbGF5ZXJNZXNoITogVEhSRUUuTWVzaDtcclxuICAgIHByaXZhdGUgZ3JvdW5kTWVzaCE6IFRIUkVFLk1lc2g7XHJcbiAgICAvLyBORVc6IEFycmF5cyB0byBob2xkIHJlZmVyZW5jZXMgdG8gZHluYW1pY2FsbHkgcGxhY2VkIG9iamVjdHNcclxuICAgIHByaXZhdGUgcGxhY2VkT2JqZWN0TWVzaGVzOiBUSFJFRS5NZXNoW10gPSBbXTtcclxuICAgIHByaXZhdGUgcGxhY2VkT2JqZWN0Qm9kaWVzOiBDQU5OT04uQm9keVtdID0gW107XHJcblxyXG4gICAgLy8gSW5wdXQgaGFuZGxpbmcgc3RhdGVcclxuICAgIHByaXZhdGUga2V5czogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0gPSB7fTsgLy8gVHJhY2tzIGN1cnJlbnRseSBwcmVzc2VkIGtleXNcclxuICAgIHByaXZhdGUgaXNQb2ludGVyTG9ja2VkOiBib29sZWFuID0gZmFsc2U7IC8vIFRydWUgaWYgbW91c2UgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgIHByaXZhdGUgY2FtZXJhUGl0Y2g6IG51bWJlciA9IDA7IC8vIFZlcnRpY2FsIHJvdGF0aW9uIChwaXRjaCkgb2YgdGhlIGNhbWVyYVxyXG5cclxuICAgIC8vIEFzc2V0IG1hbmFnZW1lbnRcclxuICAgIHByaXZhdGUgdGV4dHVyZXM6IE1hcDxzdHJpbmcsIFRIUkVFLlRleHR1cmU+ID0gbmV3IE1hcCgpOyAvLyBTdG9yZXMgbG9hZGVkIHRleHR1cmVzXHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7IC8vIFN0b3JlcyBsb2FkZWQgYXVkaW8gZWxlbWVudHNcclxuXHJcbiAgICAvLyBVSSBlbGVtZW50cyAoZHluYW1pY2FsbHkgY3JlYXRlZCBmb3IgdGhlIHRpdGxlIHNjcmVlbilcclxuICAgIHByaXZhdGUgdGl0bGVTY3JlZW5PdmVybGF5ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHRpdGxlVGV4dCE6IEhUTUxEaXZFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBwcm9tcHRUZXh0ITogSFRNTERpdkVsZW1lbnQ7XHJcblxyXG4gICAgLy8gRm9yIGNhbGN1bGF0aW5nIGRlbHRhIHRpbWUgYmV0d2VlbiBmcmFtZXNcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXAgPSAwO1xyXG5cclxuICAgIC8vIEFEREVEOiBUcmFja3MgcGxheWVyLWdyb3VuZCBjb250YWN0cyBmb3IganVtcGluZyBsb2dpY1xyXG4gICAgcHJpdmF0ZSBudW1Hcm91bmRDb250YWN0czogbnVtYmVyID0gMDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICAvLyBHZXQgdGhlIGNhbnZhcyBlbGVtZW50IGZyb20gaW5kZXguaHRtbFxyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0NhbnZhcyBlbGVtZW50IHdpdGggSUQgXCJnYW1lQ2FudmFzXCIgbm90IGZvdW5kIScpO1xyXG4gICAgICAgICAgICByZXR1cm47IC8vIENhbm5vdCBwcm9jZWVkIHdpdGhvdXQgYSBjYW52YXNcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5pbml0KCk7IC8vIFN0YXJ0IHRoZSBhc3luY2hyb25vdXMgaW5pdGlhbGl6YXRpb24gcHJvY2Vzc1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXN5bmNocm9ub3VzbHkgaW5pdGlhbGl6ZXMgdGhlIGdhbWUsIGxvYWRpbmcgY29uZmlnLCBhc3NldHMsIGFuZCBzZXR0aW5nIHVwIHN5c3RlbXMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXN5bmMgaW5pdCgpIHtcclxuICAgICAgICAvLyAxLiBMb2FkIGdhbWUgY29uZmlndXJhdGlvbiBmcm9tIGRhdGEuanNvblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgZXJyb3IhIHN0YXR1czogJHtyZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5jb25maWcgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdHYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkOicsIHRoaXMuY29uZmlnKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb246JywgZXJyb3IpO1xyXG4gICAgICAgICAgICAvLyBJZiBjb25maWd1cmF0aW9uIGZhaWxzIHRvIGxvYWQsIGRpc3BsYXkgYW4gZXJyb3IgbWVzc2FnZSBhbmQgc3RvcC5cclxuICAgICAgICAgICAgY29uc3QgZXJyb3JEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS50b3AgPSAnNTAlJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUubGVmdCA9ICc1MCUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS50cmFuc2Zvcm0gPSAndHJhbnNsYXRlKC01MCUsIC01MCUpJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUuY29sb3IgPSAncmVkJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUuZm9udFNpemUgPSAnMjRweCc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnRleHRDb250ZW50ID0gJ0Vycm9yOiBGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb24uIENoZWNrIGNvbnNvbGUgZm9yIGRldGFpbHMuJztcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlcnJvckRpdik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIDIuIEluaXRpYWxpemUgVGhyZWUuanMgKHNjZW5lLCBjYW1lcmEsIHJlbmRlcmVyKVxyXG4gICAgICAgIHRoaXMuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYShcclxuICAgICAgICAgICAgNzUsIC8vIEZpZWxkIG9mIFZpZXcgKEZPVilcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZpeGVkQXNwZWN0UmF0aW8ud2lkdGggLyB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby5oZWlnaHQsIC8vIEZpeGVkIEFzcGVjdCByYXRpbyBmcm9tIGNvbmZpZ1xyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FtZXJhTmVhciwgLy8gTmVhciBjbGlwcGluZyBwbGFuZVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FtZXJhRmFyICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lXHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoeyBjYW52YXM6IHRoaXMuY2FudmFzLCBhbnRpYWxpYXM6IHRydWUgfSk7XHJcbiAgICAgICAgLy8gUmVuZGVyZXIgc2l6ZSB3aWxsIGJlIHNldCBieSBhcHBseUZpeGVkQXNwZWN0UmF0aW8gdG8gZml0IHRoZSB3aW5kb3cgd2hpbGUgbWFpbnRhaW5pbmcgYXNwZWN0IHJhdGlvXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRQaXhlbFJhdGlvKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC5lbmFibGVkID0gdHJ1ZTsgLy8gRW5hYmxlIHNoYWRvd3MgZm9yIGJldHRlciByZWFsaXNtXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zaGFkb3dNYXAudHlwZSA9IFRIUkVFLlBDRlNvZnRTaGFkb3dNYXA7IC8vIFVzZSBzb2Z0IHNoYWRvd3NcclxuXHJcbiAgICAgICAgLy8gQ2FtZXJhIHNldHVwIGZvciBkZWNvdXBsZWQgeWF3IGFuZCBwaXRjaDpcclxuICAgICAgICAvLyBjYW1lcmFDb250YWluZXIgaGFuZGxlcyB5YXcgKGhvcml6b250YWwgcm90YXRpb24pIGFuZCBmb2xsb3dzIHRoZSBwbGF5ZXIncyBwb3NpdGlvbi5cclxuICAgICAgICAvLyBUaGUgY2FtZXJhIGl0c2VsZiBpcyBhIGNoaWxkIG9mIGNhbWVyYUNvbnRhaW5lciBhbmQgaGFuZGxlcyBwaXRjaCAodmVydGljYWwgcm90YXRpb24pLlxyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyID0gbmV3IFRIUkVFLk9iamVjdDNEKCk7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5jYW1lcmFDb250YWluZXIpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLmFkZCh0aGlzLmNhbWVyYSk7XHJcbiAgICAgICAgLy8gUG9zaXRpb24gdGhlIGNhbWVyYSByZWxhdGl2ZSB0byB0aGUgY2FtZXJhQ29udGFpbmVyIChhdCBleWUgbGV2ZWwpXHJcbiAgICAgICAgdGhpcy5jYW1lcmEucG9zaXRpb24ueSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFIZWlnaHRPZmZzZXQ7XHJcblxyXG5cclxuICAgICAgICAvLyAzLiBJbml0aWFsaXplIENhbm5vbi1lcyAocGh5c2ljcyB3b3JsZClcclxuICAgICAgICB0aGlzLndvcmxkID0gbmV3IENBTk5PTi5Xb3JsZCgpO1xyXG4gICAgICAgIHRoaXMud29ybGQuZ3Jhdml0eS5zZXQoMCwgLTkuODIsIDApOyAvLyBTZXQgc3RhbmRhcmQgRWFydGggZ3Jhdml0eSAoWS1heGlzIGRvd24pXHJcbiAgICAgICAgdGhpcy53b3JsZC5icm9hZHBoYXNlID0gbmV3IENBTk5PTi5TQVBCcm9hZHBoYXNlKHRoaXMud29ybGQpOyAvLyBVc2UgYW4gZWZmaWNpZW50IGJyb2FkcGhhc2UgYWxnb3JpdGhtXHJcbiAgICAgICAgLy8gRml4OiBDYXN0IHRoaXMud29ybGQuc29sdmVyIHRvIENBTk5PTi5HU1NvbHZlciB0byBhY2Nlc3MgdGhlICdpdGVyYXRpb25zJyBwcm9wZXJ0eVxyXG4gICAgICAgIC8vIFRoZSBkZWZhdWx0IHNvbHZlciBpbiBDYW5ub24uanMgKGFuZCBDYW5ub24tZXMpIGlzIEdTU29sdmVyLCB3aGljaCBoYXMgdGhpcyBwcm9wZXJ0eS5cclxuICAgICAgICAodGhpcy53b3JsZC5zb2x2ZXIgYXMgQ0FOTk9OLkdTU29sdmVyKS5pdGVyYXRpb25zID0gMTA7IC8vIEluY3JlYXNlIHNvbHZlciBpdGVyYXRpb25zIGZvciBiZXR0ZXIgc3RhYmlsaXR5XHJcblxyXG4gICAgICAgIC8vIE5FVzogQ3JlYXRlIENhbm5vbi5qcyBNYXRlcmlhbHMgYW5kIENvbnRhY3RNYXRlcmlhbCBmb3IgcGxheWVyLWdyb3VuZCBpbnRlcmFjdGlvblxyXG4gICAgICAgIHRoaXMucGxheWVyTWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdwbGF5ZXJNYXRlcmlhbCcpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdncm91bmRNYXRlcmlhbCcpO1xyXG5cclxuICAgICAgICBjb25zdCBwbGF5ZXJHcm91bmRDb250YWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJNYXRlcmlhbCxcclxuICAgICAgICAgICAgdGhpcy5ncm91bmRNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJHcm91bmRGcmljdGlvbiwgLy8gVXNlIGNvbmZpZ3VyYWJsZSBncm91bmQgZnJpY3Rpb25cclxuICAgICAgICAgICAgICAgIHJlc3RpdHV0aW9uOiAwLjAsIC8vIE5vIGJvdW5jZSBmb3IgZ3JvdW5kXHJcbiAgICAgICAgICAgICAgICAvLyBPcHRpb25hbGx5IHR1bmUgY29udGFjdEVxdWF0aW9uUmVsYXhhdGlvbiBhbmQgZnJpY3Rpb25FcXVhdGlvblJlbGF4YXRpb24gZm9yIHN0YWJpbGl0eS9mZWVsXHJcbiAgICAgICAgICAgICAgICAvLyBjb250YWN0RXF1YXRpb25SZWxheGF0aW9uOiAzLCBcclxuICAgICAgICAgICAgICAgIC8vIGZyaWN0aW9uRXF1YXRpb25SZWxheGF0aW9uOiAzXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKHBsYXllckdyb3VuZENvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIC8vIDQuIExvYWQgYXNzZXRzICh0ZXh0dXJlcyBhbmQgc291bmRzKVxyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG5cclxuICAgICAgICAvLyA1LiBDcmVhdGUgZ2FtZSBvYmplY3RzIChwbGF5ZXIsIGdyb3VuZCwgYW5kIG90aGVyIG9iamVjdHMpIGFuZCBsaWdodGluZ1xyXG4gICAgICAgIHRoaXMuY3JlYXRlR3JvdW5kKCk7IC8vIENyZWF0ZXMgdGhpcy5ncm91bmRCb2R5XHJcbiAgICAgICAgdGhpcy5jcmVhdGVQbGF5ZXIoKTsgLy8gQ3JlYXRlcyB0aGlzLnBsYXllckJvZHlcclxuICAgICAgICB0aGlzLmNyZWF0ZVBsYWNlZE9iamVjdHMoKTsgLy8gTkVXOiBDcmVhdGVzIG90aGVyIG9iamVjdHMgaW4gdGhlIHNjZW5lXHJcbiAgICAgICAgdGhpcy5zZXR1cExpZ2h0aW5nKCk7XHJcblxyXG4gICAgICAgIC8vIEFEREVEOiA2LiBTZXR1cCBDYW5ub24tZXMgY29udGFjdCBsaXN0ZW5lcnMgZm9yIGp1bXAgbG9naWMgKGFmdGVyIGJvZGllcyBhcmUgY3JlYXRlZClcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEV2ZW50TGlzdGVuZXIoJ2JlZ2luQ29udGFjdCcsIChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBvbmUgb2YgdGhlIGJvZGllcyBpcyB0aGUgcGxheWVyQm9keSBhbmQgdGhlIG90aGVyIGlzIHRoZSBncm91bmRCb2R5XHJcbiAgICAgICAgICAgIC8vIFRoaXMgbG9naWMgYWxsb3dzIGp1bXBpbmcgb25seSBmcm9tIHRoZSBncm91bmQuXHJcbiAgICAgICAgICAgIGlmICgoZXZlbnQuYm9keUEgPT09IHRoaXMucGxheWVyQm9keSAmJiBldmVudC5ib2R5QiA9PT0gdGhpcy5ncm91bmRCb2R5KSB8fFxyXG4gICAgICAgICAgICAgICAgKGV2ZW50LmJvZHlCID09PSB0aGlzLnBsYXllckJvZHkgJiYgZXZlbnQuYm9keUEgPT09IHRoaXMuZ3JvdW5kQm9keSkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMubnVtR3JvdW5kQ29udGFjdHMrKztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLndvcmxkLmFkZEV2ZW50TGlzdGVuZXIoJ2VuZENvbnRhY3QnLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgb25lIG9mIHRoZSBib2RpZXMgaXMgdGhlIHBsYXllckJvZHkgYW5kIHRoZSBvdGhlciBpcyB0aGUgZ3JvdW5kQm9keVxyXG4gICAgICAgICAgICBpZiAoKGV2ZW50LmJvZHlBID09PSB0aGlzLnBsYXllckJvZHkgJiYgZXZlbnQuYm9keUIgPT09IHRoaXMuZ3JvdW5kQm9keSkgfHxcclxuICAgICAgICAgICAgICAgIChldmVudC5ib2R5QiA9PT0gdGhpcy5wbGF5ZXJCb2R5ICYmIGV2ZW50LmJvZHlBID09PSB0aGlzLmdyb3VuZEJvZHkpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm51bUdyb3VuZENvbnRhY3RzID0gTWF0aC5tYXgoMCwgdGhpcy5udW1Hcm91bmRDb250YWN0cyAtIDEpOyAvLyBFbnN1cmUgaXQgZG9lc24ndCBnbyBiZWxvdyAwXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gNy4gU2V0dXAgZXZlbnQgbGlzdGVuZXJzIGZvciB1c2VyIGlucHV0IGFuZCB3aW5kb3cgcmVzaXppbmdcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgdGhpcy5vbldpbmRvd1Jlc2l6ZS5iaW5kKHRoaXMpKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5vbktleURvd24uYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLm9uS2V5VXAuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5vbk1vdXNlTW92ZS5iaW5kKHRoaXMpKTsgLy8gRm9yIG1vdXNlIGxvb2tcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRm9yIHBvaW50ZXIgbG9jayBzdGF0dXNcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3pwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRmlyZWZveCBjb21wYXRpYmlsaXR5XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0cG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7IC8vIFdlYmtpdCBjb21wYXRpYmlsaXR5XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGluaXRpYWwgZml4ZWQgYXNwZWN0IHJhdGlvIGFuZCBjZW50ZXIgdGhlIGNhbnZhc1xyXG4gICAgICAgIHRoaXMuYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCk7XHJcblxyXG4gICAgICAgIC8vIDguIFNldHVwIHRoZSB0aXRsZSBzY3JlZW4gVUlcclxuICAgICAgICB0aGlzLnNldHVwVGl0bGVTY3JlZW4oKTtcclxuXHJcbiAgICAgICAgLy8gU3RhcnQgdGhlIG1haW4gZ2FtZSBsb29wXHJcbiAgICAgICAgdGhpcy5hbmltYXRlKDApOyAvLyBQYXNzIGluaXRpYWwgdGltZSAwXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBMb2FkcyBhbGwgdGV4dHVyZXMgYW5kIHNvdW5kcyBkZWZpbmVkIGluIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEFzc2V0cygpIHtcclxuICAgICAgICBjb25zdCB0ZXh0dXJlTG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKTtcclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5tYXAoaW1nID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIHRleHR1cmVMb2FkZXIubG9hZEFzeW5jKGltZy5wYXRoKVxyXG4gICAgICAgICAgICAgICAgLnRoZW4odGV4dHVyZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlcy5zZXQoaW1nLm5hbWUsIHRleHR1cmUpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmUud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZzsgLy8gUmVwZWF0IHRleHR1cmUgaG9yaXpvbnRhbGx5XHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nOyAvLyBSZXBlYXQgdGV4dHVyZSB2ZXJ0aWNhbGx5XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQWRqdXN0IHRleHR1cmUgcmVwZXRpdGlvbiBmb3IgdGhlIGdyb3VuZCB0byBhdm9pZCBzdHJldGNoaW5nXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGltZy5uYW1lID09PSAnZ3JvdW5kX3RleHR1cmUnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLnJlcGVhdC5zZXQodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyA1LCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDUpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAvLyBGb3IgYm94IHRleHR1cmVzLCBlbnN1cmUgcmVwZXRpdGlvbiBpZiBkZXNpcmVkLCBvciBzZXQgdG8gMSwxIGZvciBzaW5nbGUgYXBwbGljYXRpb25cclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW1nLm5hbWUuZW5kc1dpdGgoJ190ZXh0dXJlJykpIHsgLy8gR2VuZXJpYyBjaGVjayBmb3Igb3RoZXIgdGV4dHVyZXNcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yIGdlbmVyaWMgYm94IHRleHR1cmVzLCB3ZSBtaWdodCB3YW50IHRvIHJlcGVhdCBiYXNlZCBvbiBvYmplY3QgZGltZW5zaW9uc1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGb3Igc2ltcGxpY2l0eSBub3csIGxldCdzIGtlZXAgZGVmYXVsdCAobm8gcmVwZWF0IHVubGVzcyBleHBsaWNpdCBmb3IgZ3JvdW5kKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBBIG1vcmUgcm9idXN0IHNvbHV0aW9uIHdvdWxkIGludm9sdmUgc2V0dGluZyByZXBlYXQgYmFzZWQgb24gc2NhbGUvZGltZW5zaW9ucyBmb3IgZWFjaCBvYmplY3RcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCB0ZXh0dXJlOiAke2ltZy5wYXRofWAsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICAvLyBDb250aW51ZSBldmVuIGlmIGFuIGFzc2V0IGZhaWxzIHRvIGxvYWQ7IGZhbGxiYWNrcyAoc29saWQgY29sb3JzKSBhcmUgdXNlZC5cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5tYXAoc291bmQgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKHNvdW5kLnBhdGgpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gc291bmQudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ubG9vcCA9IChzb3VuZC5uYW1lID09PSAnYmFja2dyb3VuZF9tdXNpYycpOyAvLyBMb29wIGJhY2tncm91bmQgbXVzaWNcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KHNvdW5kLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtzb3VuZC5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gUmVzb2x2ZSBldmVuIG9uIGVycm9yIHRvIG5vdCBibG9jayBQcm9taXNlLmFsbFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYEFzc2V0cyBsb2FkZWQ6ICR7dGhpcy50ZXh0dXJlcy5zaXplfSB0ZXh0dXJlcywgJHt0aGlzLnNvdW5kcy5zaXplfSBzb3VuZHMuYCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGFuZCBkaXNwbGF5cyB0aGUgdGl0bGUgc2NyZWVuIFVJIGR5bmFtaWNhbGx5LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNldHVwVGl0bGVTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LnN0eWxlLCB7XHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLCAvLyBQb3NpdGlvbiByZWxhdGl2ZSB0byBib2R5LCB3aWxsIGJlIGNlbnRlcmVkIGFuZCBzaXplZCBieSBhcHBseUZpeGVkQXNwZWN0UmF0aW9cclxuICAgICAgICAgICAgYmFja2dyb3VuZENvbG9yOiAncmdiYSgwLCAwLCAwLCAwLjgpJyxcclxuICAgICAgICAgICAgZGlzcGxheTogJ2ZsZXgnLCBmbGV4RGlyZWN0aW9uOiAnY29sdW1uJyxcclxuICAgICAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLCBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcclxuICAgICAgICAgICAgY29sb3I6ICd3aGl0ZScsIGZvbnRGYW1pbHk6ICdBcmlhbCwgc2Fucy1zZXJpZicsXHJcbiAgICAgICAgICAgIGZvbnRTaXplOiAnNDhweCcsIHRleHRBbGlnbjogJ2NlbnRlcicsIHpJbmRleDogJzEwMDAnXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSk7XHJcblxyXG4gICAgICAgIC8vIENydWNpYWw6IENhbGwgYXBwbHlGaXhlZEFzcGVjdFJhdGlvIGhlcmUgdG8gZW5zdXJlIHRoZSB0aXRsZSBzY3JlZW4gb3ZlcmxheVxyXG4gICAgICAgIC8vIGlzIHNpemVkIGFuZCBwb3NpdGlvbmVkIGNvcnJlY3RseSByZWxhdGl2ZSB0byB0aGUgY2FudmFzIGZyb20gdGhlIHN0YXJ0LlxyXG4gICAgICAgIHRoaXMuYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCk7XHJcblxyXG4gICAgICAgIHRoaXMudGl0bGVUZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy50aXRsZVRleHQudGV4dENvbnRlbnQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MudGl0bGVTY3JlZW5UZXh0O1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LmFwcGVuZENoaWxkKHRoaXMudGl0bGVUZXh0KTtcclxuXHJcbiAgICAgICAgdGhpcy5wcm9tcHRUZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy5wcm9tcHRUZXh0LnRleHRDb250ZW50ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnN0YXJ0R2FtZVByb21wdDtcclxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMucHJvbXB0VGV4dC5zdHlsZSwge1xyXG4gICAgICAgICAgICBtYXJnaW5Ub3A6ICcyMHB4JywgZm9udFNpemU6ICcyNHB4J1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LmFwcGVuZENoaWxkKHRoaXMucHJvbXB0VGV4dCk7XHJcblxyXG4gICAgICAgIC8vIEFkZCBldmVudCBsaXN0ZW5lciBkaXJlY3RseSB0byB0aGUgb3ZlcmxheSB0byBjYXB0dXJlIGNsaWNrcyBhbmQgc3RhcnQgdGhlIGdhbWVcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRoaXMuc3RhcnRHYW1lKCkpO1xyXG5cclxuICAgICAgICAvLyBBdHRlbXB0IHRvIHBsYXkgYmFja2dyb3VuZCBtdXNpYy4gSXQgbWlnaHQgYmUgYmxvY2tlZCBieSBicm93c2VycyBpZiBubyB1c2VyIGdlc3R1cmUgaGFzIG9jY3VycmVkIHlldC5cclxuICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ2JhY2tncm91bmRfbXVzaWMnKT8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJCR00gcGxheSBkZW5pZWQgKHJlcXVpcmVzIHVzZXIgZ2VzdHVyZSk6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRyYW5zaXRpb25zIHRoZSBnYW1lIGZyb20gdGhlIHRpdGxlIHNjcmVlbiB0byB0aGUgcGxheWluZyBzdGF0ZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKSB7XHJcbiAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgIC8vIFJlbW92ZSB0aGUgdGl0bGUgc2NyZWVuIG92ZXJsYXlcclxuICAgICAgICBpZiAodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkgJiYgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkucGFyZW50Tm9kZSkge1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gQWRkIGV2ZW50IGxpc3RlbmVyIHRvIGNhbnZhcyBmb3IgcmUtbG9ja2luZyBwb2ludGVyIGFmdGVyIHRpdGxlIHNjcmVlbiBpcyBnb25lXHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmhhbmRsZUNhbnZhc1JlTG9ja1BvaW50ZXIuYmluZCh0aGlzKSk7XHJcblxyXG4gICAgICAgIC8vIFJlcXVlc3QgcG9pbnRlciBsb2NrIGZvciBpbW1lcnNpdmUgbW91c2UgY29udHJvbFxyXG4gICAgICAgIHRoaXMuY2FudmFzLnJlcXVlc3RQb2ludGVyTG9jaygpO1xyXG4gICAgICAgIC8vIEVuc3VyZSBiYWNrZ3JvdW5kIG11c2ljIHBsYXlzIG5vdyB0aGF0IGEgdXNlciBnZXN0dXJlIGhhcyBvY2N1cnJlZFxyXG4gICAgICAgIHRoaXMuc291bmRzLmdldCgnYmFja2dyb3VuZF9tdXNpYycpPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIkJHTSBwbGF5IGZhaWxlZCBhZnRlciB1c2VyIGdlc3R1cmU6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgY2xpY2tzIG9uIHRoZSBjYW52YXMgdG8gcmUtbG9jayB0aGUgcG9pbnRlciBpZiB0aGUgZ2FtZSBpcyBwbGF5aW5nIGFuZCB1bmxvY2tlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVDYW52YXNSZUxvY2tQb2ludGVyKCkge1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiAhdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMucmVxdWVzdFBvaW50ZXJMb2NrKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyB0aGUgcGxheWVyJ3MgdmlzdWFsIG1lc2ggYW5kIHBoeXNpY3MgYm9keS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVQbGF5ZXIoKSB7XHJcbiAgICAgICAgLy8gUGxheWVyIHZpc3VhbCBtZXNoIChhIHNpbXBsZSBib3gpXHJcbiAgICAgICAgY29uc3QgcGxheWVyVGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KCdwbGF5ZXJfdGV4dHVyZScpO1xyXG4gICAgICAgIGNvbnN0IHBsYXllck1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICBtYXA6IHBsYXllclRleHR1cmUsXHJcbiAgICAgICAgICAgIGNvbG9yOiBwbGF5ZXJUZXh0dXJlID8gMHhmZmZmZmYgOiAweDAwNzdmZiAvLyBVc2Ugd2hpdGUgd2l0aCB0ZXh0dXJlLCBvciBibHVlIGlmIG5vIHRleHR1cmVcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBwbGF5ZXJHZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgxLCAyLCAxKTsgLy8gUGxheWVyIGRpbWVuc2lvbnNcclxuICAgICAgICB0aGlzLnBsYXllck1lc2ggPSBuZXcgVEhSRUUuTWVzaChwbGF5ZXJHZW9tZXRyeSwgcGxheWVyTWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi55ID0gNTsgLy8gU3RhcnQgcGxheWVyIHNsaWdodGx5IGFib3ZlIHRoZSBncm91bmRcclxuICAgICAgICB0aGlzLnBsYXllck1lc2guY2FzdFNoYWRvdyA9IHRydWU7IC8vIFBsYXllciBjYXN0cyBhIHNoYWRvd1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMucGxheWVyTWVzaCk7XHJcblxyXG4gICAgICAgIC8vIFBsYXllciBwaHlzaWNzIGJvZHkgKENhbm5vbi5qcyBib3ggc2hhcGUpXHJcbiAgICAgICAgY29uc3QgcGxheWVyU2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoMC41LCAxLCAwLjUpKTsgLy8gSGFsZiBleHRlbnRzIG9mIHRoZSBib3ggZm9yIGNvbGxpc2lvblxyXG4gICAgICAgIHRoaXMucGxheWVyQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJNYXNzLCAvLyBQbGF5ZXIncyBtYXNzXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzModGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLngsIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi55LCB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgIHNoYXBlOiBwbGF5ZXJTaGFwZSxcclxuICAgICAgICAgICAgZml4ZWRSb3RhdGlvbjogdHJ1ZSwgLy8gUHJldmVudCB0aGUgcGxheWVyIGZyb20gZmFsbGluZyBvdmVyIChzaW11bGF0ZXMgYSBjYXBzdWxlL2N5bGluZGVyIGNoYXJhY3RlcilcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMucGxheWVyTWF0ZXJpYWwgLy8gQXNzaWduIHRoZSBwbGF5ZXIgbWF0ZXJpYWwgZm9yIGNvbnRhY3QgcmVzb2x1dGlvblxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLnBsYXllckJvZHkpO1xyXG5cclxuICAgICAgICAvLyBTZXQgaW5pdGlhbCBjYW1lcmFDb250YWluZXIgcG9zaXRpb24gdG8gcGxheWVyJ3MgcGh5c2ljcyBib2R5IHBvc2l0aW9uLlxyXG4gICAgICAgIC8vIFRoZSBjYW1lcmEgaXRzZWxmIGlzIGEgY2hpbGQgb2YgY2FtZXJhQ29udGFpbmVyIGFuZCBoYXMgaXRzIG93biBsb2NhbCBZIG9mZnNldC5cclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyB0aGUgZ3JvdW5kJ3MgdmlzdWFsIG1lc2ggYW5kIHBoeXNpY3MgYm9keS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVHcm91bmQoKSB7XHJcbiAgICAgICAgLy8gR3JvdW5kIHZpc3VhbCBtZXNoIChhIGxhcmdlIHBsYW5lKVxyXG4gICAgICAgIGNvbnN0IGdyb3VuZFRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgnZ3JvdW5kX3RleHR1cmUnKTtcclxuICAgICAgICBjb25zdCBncm91bmRNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgbWFwOiBncm91bmRUZXh0dXJlLFxyXG4gICAgICAgICAgICBjb2xvcjogZ3JvdW5kVGV4dHVyZSA/IDB4ZmZmZmZmIDogMHg4ODg4ODggLy8gVXNlIHdoaXRlIHdpdGggdGV4dHVyZSwgb3IgZ3JleSBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kR2VvbWV0cnkgPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeSh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdyb3VuZEdlb21ldHJ5LCBncm91bmRNYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRNZXNoLnJvdGF0aW9uLnggPSAtTWF0aC5QSSAvIDI7IC8vIFJvdGF0ZSB0byBsYXkgZmxhdCBvbiB0aGUgWFogcGxhbmVcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7IC8vIEdyb3VuZCByZWNlaXZlcyBzaGFkb3dzXHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5ncm91bmRNZXNoKTtcclxuXHJcbiAgICAgICAgLy8gR3JvdW5kIHBoeXNpY3MgYm9keSAoQ2Fubm9uLmpzIHBsYW5lIHNoYXBlKVxyXG4gICAgICAgIGNvbnN0IGdyb3VuZFNoYXBlID0gbmV3IENBTk5PTi5QbGFuZSgpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IDAsIC8vIEEgbWFzcyBvZiAwIG1ha2VzIGl0IGEgc3RhdGljIChpbW1vdmFibGUpIGJvZHlcclxuICAgICAgICAgICAgc2hhcGU6IGdyb3VuZFNoYXBlLFxyXG4gICAgICAgICAgICBtYXRlcmlhbDogdGhpcy5ncm91bmRNYXRlcmlhbCAvLyBBc3NpZ24gdGhlIGdyb3VuZCBtYXRlcmlhbCBmb3IgY29udGFjdCByZXNvbHV0aW9uXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgLy8gUm90YXRlIHRoZSBDYW5ub24uanMgcGxhbmUgYm9keSB0byBtYXRjaCB0aGUgVGhyZWUuanMgcGxhbmUgb3JpZW50YXRpb24gKGZsYXQpXHJcbiAgICAgICAgdGhpcy5ncm91bmRCb2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShuZXcgQ0FOTk9OLlZlYzMoMSwgMCwgMCksIC1NYXRoLlBJIC8gMik7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KHRoaXMuZ3JvdW5kQm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IENyZWF0ZXMgdmlzdWFsIG1lc2hlcyBhbmQgcGh5c2ljcyBib2RpZXMgZm9yIGFsbCBvYmplY3RzIGRlZmluZWQgaW4gY29uZmlnLmdhbWVTZXR0aW5ncy5wbGFjZWRPYmplY3RzLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNyZWF0ZVBsYWNlZE9iamVjdHMoKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxhY2VkT2JqZWN0cykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJObyBwbGFjZWRPYmplY3RzIGRlZmluZWQgaW4gZ2FtZVNldHRpbmdzLlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYWNlZE9iamVjdHMuZm9yRWFjaChvYmpDb25maWcgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQob2JqQ29uZmlnLnRleHR1cmVOYW1lKTtcclxuICAgICAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgICAgICBtYXA6IHRleHR1cmUsXHJcbiAgICAgICAgICAgICAgICBjb2xvcjogdGV4dHVyZSA/IDB4ZmZmZmZmIDogMHhhYWFhYWEgLy8gRGVmYXVsdCBncmV5IGlmIG5vIHRleHR1cmVcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvLyBDcmVhdGUgVGhyZWUuanMgTWVzaFxyXG4gICAgICAgICAgICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeShvYmpDb25maWcuZGltZW5zaW9ucy53aWR0aCwgb2JqQ29uZmlnLmRpbWVuc2lvbnMuaGVpZ2h0LCBvYmpDb25maWcuZGltZW5zaW9ucy5kZXB0aCk7XHJcbiAgICAgICAgICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSwgbWF0ZXJpYWwpO1xyXG4gICAgICAgICAgICBtZXNoLnBvc2l0aW9uLnNldChvYmpDb25maWcucG9zaXRpb24ueCwgb2JqQ29uZmlnLnBvc2l0aW9uLnksIG9iakNvbmZpZy5wb3NpdGlvbi56KTtcclxuICAgICAgICAgICAgaWYgKG9iakNvbmZpZy5yb3RhdGlvblkgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgbWVzaC5yb3RhdGlvbi55ID0gb2JqQ29uZmlnLnJvdGF0aW9uWTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICBtZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZChtZXNoKTtcclxuICAgICAgICAgICAgdGhpcy5wbGFjZWRPYmplY3RNZXNoZXMucHVzaChtZXNoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIENyZWF0ZSBDYW5ub24uanMgQm9keVxyXG4gICAgICAgICAgICAvLyBDYW5ub24uQm94IHRha2VzIGhhbGYgZXh0ZW50c1xyXG4gICAgICAgICAgICBjb25zdCBzaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhcclxuICAgICAgICAgICAgICAgIG9iakNvbmZpZy5kaW1lbnNpb25zLndpZHRoIC8gMixcclxuICAgICAgICAgICAgICAgIG9iakNvbmZpZy5kaW1lbnNpb25zLmhlaWdodCAvIDIsXHJcbiAgICAgICAgICAgICAgICBvYmpDb25maWcuZGltZW5zaW9ucy5kZXB0aCAvIDJcclxuICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICAgICAgbWFzczogb2JqQ29uZmlnLm1hc3MsIC8vIFVzZSAwIGZvciBzdGF0aWMgb2JqZWN0cywgPjAgZm9yIGR5bmFtaWNcclxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMob2JqQ29uZmlnLnBvc2l0aW9uLngsIG9iakNvbmZpZy5wb3NpdGlvbi55LCBvYmpDb25maWcucG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgICAgICBzaGFwZTogc2hhcGUsXHJcbiAgICAgICAgICAgICAgICAvLyBGb3IgcGxhY2VkIG9iamVjdHMsIGlmIHRoZXkgYXJlIHN0YXRpYywgbWF0ZXJpYWwgaXNuJ3Qgc3RyaWN0bHkgbmVjZXNzYXJ5IHVubGVzcyB0aGV5IGludGVyYWN0IGR5bmFtaWNhbGx5IHdpdGggdGhlIHBsYXllci5cclxuICAgICAgICAgICAgICAgIC8vIElmIHRoZXkgYXJlIGR5bmFtaWMsIGEgc2VwYXJhdGUgbWF0ZXJpYWwgbWlnaHQgYmUgZGVzaXJlZC4gRm9yIG5vdywgdGhleSdsbCBpbXBsaWNpdGx5IHVzZSB3b3JsZCdzIGRlZmF1bHQgb3IgaW50ZXJhY3QgdmlhIHBsYXllck1hdGVyaWFsLlxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgaWYgKG9iakNvbmZpZy5yb3RhdGlvblkgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgYm9keS5xdWF0ZXJuaW9uLnNldEZyb21BeGlzQW5nbGUobmV3IENBTk5PTi5WZWMzKDAsIDEsIDApLCBvYmpDb25maWcucm90YXRpb25ZKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkoYm9keSk7XHJcbiAgICAgICAgICAgIHRoaXMucGxhY2VkT2JqZWN0Qm9kaWVzLnB1c2goYm9keSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYENyZWF0ZWQgJHt0aGlzLnBsYWNlZE9iamVjdE1lc2hlcy5sZW5ndGh9IHBsYWNlZCBvYmplY3RzLmApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyB1cCBhbWJpZW50IGFuZCBkaXJlY3Rpb25hbCBsaWdodGluZyBpbiB0aGUgc2NlbmUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc2V0dXBMaWdodGluZygpIHtcclxuICAgICAgICBjb25zdCBhbWJpZW50TGlnaHQgPSBuZXcgVEhSRUUuQW1iaWVudExpZ2h0KDB4NDA0MDQwLCAxLjApOyAvLyBTb2Z0IHdoaXRlIGFtYmllbnQgbGlnaHRcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChhbWJpZW50TGlnaHQpO1xyXG5cclxuICAgICAgICBjb25zdCBkaXJlY3Rpb25hbExpZ2h0ID0gbmV3IFRIUkVFLkRpcmVjdGlvbmFsTGlnaHQoMHhmZmZmZmYsIDAuOCk7IC8vIEJyaWdodGVyIGRpcmVjdGlvbmFsIGxpZ2h0XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5wb3NpdGlvbi5zZXQoNSwgMTAsIDUpOyAvLyBQb3NpdGlvbiB0aGUgbGlnaHQgc291cmNlXHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5jYXN0U2hhZG93ID0gdHJ1ZTsgLy8gRW5hYmxlIHNoYWRvd3MgZnJvbSB0aGlzIGxpZ2h0IHNvdXJjZVxyXG4gICAgICAgIC8vIENvbmZpZ3VyZSBzaGFkb3cgcHJvcGVydGllcyBmb3IgdGhlIGRpcmVjdGlvbmFsIGxpZ2h0XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cubWFwU2l6ZS53aWR0aCA9IDEwMjQ7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cubWFwU2l6ZS5oZWlnaHQgPSAxMDI0O1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5uZWFyID0gMC41O1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5mYXIgPSA1MDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEubGVmdCA9IC0xMDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEucmlnaHQgPSAxMDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEudG9wID0gMTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmJvdHRvbSA9IC0xMDtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChkaXJlY3Rpb25hbExpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgd2luZG93IHJlc2l6aW5nIHRvIGtlZXAgdGhlIGNhbWVyYSBhc3BlY3QgcmF0aW8gYW5kIHJlbmRlcmVyIHNpemUgY29ycmVjdC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbldpbmRvd1Jlc2l6ZSgpIHtcclxuICAgICAgICB0aGlzLmFwcGx5Rml4ZWRBc3BlY3RSYXRpbygpOyAvLyBBcHBseSB0aGUgZml4ZWQgYXNwZWN0IHJhdGlvIGFuZCBjZW50ZXIgdGhlIGNhbnZhc1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXBwbGllcyB0aGUgY29uZmlndXJlZCBmaXhlZCBhc3BlY3QgcmF0aW8gdG8gdGhlIHJlbmRlcmVyIGFuZCBjYW1lcmEsXHJcbiAgICAgKiByZXNpemluZyBhbmQgY2VudGVyaW5nIHRoZSBjYW52YXMgdG8gZml0IHdpdGhpbiB0aGUgd2luZG93LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFwcGx5Rml4ZWRBc3BlY3RSYXRpbygpIHtcclxuICAgICAgICBjb25zdCB0YXJnZXRBc3BlY3RSYXRpbyA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5maXhlZEFzcGVjdFJhdGlvLndpZHRoIC8gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZpeGVkQXNwZWN0UmF0aW8uaGVpZ2h0O1xyXG5cclxuICAgICAgICBsZXQgbmV3V2lkdGg6IG51bWJlcjtcclxuICAgICAgICBsZXQgbmV3SGVpZ2h0OiBudW1iZXI7XHJcblxyXG4gICAgICAgIGNvbnN0IHdpbmRvd1dpZHRoID0gd2luZG93LmlubmVyV2lkdGg7XHJcbiAgICAgICAgY29uc3Qgd2luZG93SGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRXaW5kb3dBc3BlY3RSYXRpbyA9IHdpbmRvd1dpZHRoIC8gd2luZG93SGVpZ2h0O1xyXG5cclxuICAgICAgICBpZiAoY3VycmVudFdpbmRvd0FzcGVjdFJhdGlvID4gdGFyZ2V0QXNwZWN0UmF0aW8pIHtcclxuICAgICAgICAgICAgLy8gV2luZG93IGlzIHdpZGVyIHRoYW4gdGFyZ2V0IGFzcGVjdCByYXRpbywgaGVpZ2h0IGlzIHRoZSBsaW1pdGluZyBmYWN0b3JcclxuICAgICAgICAgICAgbmV3SGVpZ2h0ID0gd2luZG93SGVpZ2h0O1xyXG4gICAgICAgICAgICBuZXdXaWR0aCA9IG5ld0hlaWdodCAqIHRhcmdldEFzcGVjdFJhdGlvO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIFdpbmRvdyBpcyB0YWxsZXIgKG9yIGV4YWN0bHkpIHRoZSB0YXJnZXQgYXNwZWN0IHJhdGlvLCB3aWR0aCBpcyB0aGUgbGltaXRpbmcgZmFjdG9yXHJcbiAgICAgICAgICAgIG5ld1dpZHRoID0gd2luZG93V2lkdGg7XHJcbiAgICAgICAgICAgIG5ld0hlaWdodCA9IG5ld1dpZHRoIC8gdGFyZ2V0QXNwZWN0UmF0aW87XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTZXQgcmVuZGVyZXIgc2l6ZS4gVGhlIHRoaXJkIGFyZ3VtZW50IGB1cGRhdGVTdHlsZWAgaXMgZmFsc2UgYmVjYXVzZSB3ZSBtYW5hZ2Ugc3R5bGUgbWFudWFsbHkuXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKG5ld1dpZHRoLCBuZXdIZWlnaHQsIGZhbHNlKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5hc3BlY3QgPSB0YXJnZXRBc3BlY3RSYXRpbztcclxuICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XHJcblxyXG4gICAgICAgIC8vIFBvc2l0aW9uIGFuZCBzaXplIHRoZSBjYW52YXMgZWxlbWVudCB1c2luZyBDU1NcclxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMuY2FudmFzLnN0eWxlLCB7XHJcbiAgICAgICAgICAgIHdpZHRoOiBgJHtuZXdXaWR0aH1weGAsXHJcbiAgICAgICAgICAgIGhlaWdodDogYCR7bmV3SGVpZ2h0fXB4YCxcclxuICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXHJcbiAgICAgICAgICAgIHRvcDogJzUwJScsXHJcbiAgICAgICAgICAgIGxlZnQ6ICc1MCUnLFxyXG4gICAgICAgICAgICB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknLFxyXG4gICAgICAgICAgICBvYmplY3RGaXQ6ICdjb250YWluJyAvLyBFbnN1cmVzIGNvbnRlbnQgaXMgc2NhbGVkIGFwcHJvcHJpYXRlbHkgaWYgdGhlcmUncyBhbnkgbWlzbWF0Y2hcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlIHRpdGxlIHNjcmVlbiBpcyBhY3RpdmUsIHVwZGF0ZSBpdHMgc2l6ZSBhbmQgcG9zaXRpb24gYXMgd2VsbCB0byBtYXRjaCB0aGUgY2FudmFzXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSAmJiB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSkge1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LnN0eWxlLCB7XHJcbiAgICAgICAgICAgICAgICB3aWR0aDogYCR7bmV3V2lkdGh9cHhgLFxyXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBgJHtuZXdIZWlnaHR9cHhgLFxyXG4gICAgICAgICAgICAgICAgdG9wOiAnNTAlJyxcclxuICAgICAgICAgICAgICAgIGxlZnQ6ICc1MCUnLFxyXG4gICAgICAgICAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsIC01MCUpJyxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVjb3JkcyB3aGljaCBrZXlzIGFyZSBjdXJyZW50bHkgcHJlc3NlZCBkb3duLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAgICAgIHRoaXMua2V5c1tldmVudC5rZXkudG9Mb3dlckNhc2UoKV0gPSB0cnVlO1xyXG4gICAgICAgIC8vIEFEREVEOiBIYW5kbGUganVtcCBpbnB1dCBvbmx5IHdoZW4gcGxheWluZyBhbmQgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgaWYgKGV2ZW50LmtleS50b0xvd2VyQ2FzZSgpID09PSAnICcpIHsgLy8gU3BhY2ViYXJcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVySnVtcCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVjb3JkcyB3aGljaCBrZXlzIGFyZSBjdXJyZW50bHkgcmVsZWFzZWQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25LZXlVcChldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAgICAgIHRoaXMua2V5c1tldmVudC5rZXkudG9Mb3dlckNhc2UoKV0gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgbW91c2UgbW92ZW1lbnQgZm9yIGNhbWVyYSByb3RhdGlvbiAobW91c2UgbG9vaykuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25Nb3VzZU1vdmUoZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgICAgICAvLyBPbmx5IHByb2Nlc3MgbW91c2UgbW92ZW1lbnQgaWYgdGhlIGdhbWUgaXMgcGxheWluZyBhbmQgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgY29uc3QgbW92ZW1lbnRYID0gZXZlbnQubW92ZW1lbnRYIHx8IDA7XHJcbiAgICAgICAgICAgIGNvbnN0IG1vdmVtZW50WSA9IGV2ZW50Lm1vdmVtZW50WSB8fCAwO1xyXG5cclxuICAgICAgICAgICAgLy8gQXBwbHkgaG9yaXpvbnRhbCByb3RhdGlvbiAoeWF3KSB0byB0aGUgY2FtZXJhQ29udGFpbmVyIGFyb3VuZCBpdHMgbG9jYWwgWS1heGlzICh3aGljaCBpcyBnbG9iYWwgWSlcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIucm90YXRpb24ueSAtPSBtb3ZlbWVudFggKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubW91c2VTZW5zaXRpdml0eTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFwcGx5IHZlcnRpY2FsIHJvdGF0aW9uIChwaXRjaCkgdG8gdGhlIGNhbWVyYSBpdHNlbGYgYW5kIGNsYW1wIGl0XHJcbiAgICAgICAgICAgIC8vIE1vdXNlIFVQIChtb3ZlbWVudFkgPCAwKSBub3cgaW5jcmVhc2VzIGNhbWVyYVBpdGNoIC0+IGxvb2tzIHVwLlxyXG4gICAgICAgICAgICAvLyBNb3VzZSBET1dOIChtb3ZlbWVudFkgPiAwKSBub3cgZGVjcmVhc2VzIGNhbWVyYVBpdGNoIC0+IGxvb2tzIGRvd24uXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUGl0Y2ggLT0gbW92ZW1lbnRZICogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm1vdXNlU2Vuc2l0aXZpdHk7IFxyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYVBpdGNoID0gTWF0aC5tYXgoLU1hdGguUEkgLyAyLCBNYXRoLm1pbihNYXRoLlBJIC8gMiwgdGhpcy5jYW1lcmFQaXRjaCkpOyAvLyBDbGFtcCB0byAtOTAgdG8gKzkwIGRlZ3JlZXNcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmEucm90YXRpb24ueCA9IHRoaXMuY2FtZXJhUGl0Y2g7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXBkYXRlcyB0aGUgcG9pbnRlciBsb2NrIHN0YXR1cyB3aGVuIGl0IGNoYW5nZXMgKGUuZy4sIHVzZXIgcHJlc3NlcyBFc2MpLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uUG9pbnRlckxvY2tDaGFuZ2UoKSB7XHJcbiAgICAgICAgaWYgKGRvY3VtZW50LnBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXMgfHxcclxuICAgICAgICAgICAgKGRvY3VtZW50IGFzIGFueSkubW96UG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLmNhbnZhcyB8fFxyXG4gICAgICAgICAgICAoZG9jdW1lbnQgYXMgYW55KS53ZWJraXRQb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNQb2ludGVyTG9ja2VkID0gdHJ1ZTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1BvaW50ZXIgbG9ja2VkJyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5pc1BvaW50ZXJMb2NrZWQgPSBmYWxzZTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1BvaW50ZXIgdW5sb2NrZWQnKTtcclxuICAgICAgICAgICAgLy8gV2hlbiBwb2ludGVyIGlzIHVubG9ja2VkIGJ5IHVzZXIgKGUuZy4sIHByZXNzaW5nIEVzYyksIGN1cnNvciBhcHBlYXJzIGF1dG9tYXRpY2FsbHkuXHJcbiAgICAgICAgICAgIC8vIE1vdXNlIGxvb2sgc3RvcHMgZHVlIHRvIGBpc1BvaW50ZXJMb2NrZWRgIGNoZWNrIGluIG9uTW91c2VNb3ZlLlxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRoZSBtYWluIGdhbWUgbG9vcCwgY2FsbGVkIG9uIGV2ZXJ5IGFuaW1hdGlvbiBmcmFtZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhbmltYXRlKHRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXApIHtcclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5hbmltYXRlLmJpbmQodGhpcykpOyAvLyBSZXF1ZXN0IG5leHQgZnJhbWVcclxuXHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKHRpbWUgLSB0aGlzLmxhc3RUaW1lKSAvIDEwMDA7IC8vIENhbGN1bGF0ZSBkZWx0YSB0aW1lIGluIHNlY29uZHNcclxuICAgICAgICB0aGlzLmxhc3RUaW1lID0gdGltZTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlUGxheWVyTW92ZW1lbnQoKTsgLy8gVXBkYXRlIHBsYXllcidzIHZlbG9jaXR5IGJhc2VkIG9uIGlucHV0XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlUGh5c2ljcyhkZWx0YVRpbWUpOyAvLyBTdGVwIHRoZSBwaHlzaWNzIHdvcmxkXHJcbiAgICAgICAgICAgIHRoaXMuY2xhbXBQbGF5ZXJQb3NpdGlvbigpOyAvLyBDbGFtcCBwbGF5ZXIgcG9zaXRpb24gdG8gcHJldmVudCBnb2luZyBiZXlvbmQgZ3JvdW5kIGVkZ2VzXHJcbiAgICAgICAgICAgIHRoaXMuc3luY01lc2hlc1dpdGhCb2RpZXMoKTsgLy8gU3luY2hyb25pemUgdmlzdWFsIG1lc2hlcyB3aXRoIHBoeXNpY3MgYm9kaWVzXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlcih0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYSk7IC8vIFJlbmRlciB0aGUgc2NlbmVcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN0ZXBzIHRoZSBDYW5ub24uanMgcGh5c2ljcyB3b3JsZCBmb3J3YXJkLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZVBoeXNpY3MoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICAvLyB3b3JsZC5zdGVwKGZpeGVkVGltZVN0ZXAsIGRlbHRhVGltZSwgbWF4U3ViU3RlcHMpXHJcbiAgICAgICAgLy8gMS82MDogQSBmaXhlZCB0aW1lIHN0ZXAgb2YgNjAgcGh5c2ljcyB1cGRhdGVzIHBlciBzZWNvbmQgKHN0YW5kYXJkKS5cclxuICAgICAgICAvLyBkZWx0YVRpbWU6IFRoZSBhY3R1YWwgdGltZSBlbGFwc2VkIHNpbmNlIHRoZSBsYXN0IHJlbmRlciBmcmFtZS5cclxuICAgICAgICAvLyBtYXhQaHlzaWNzU3ViU3RlcHM6IExpbWl0cyB0aGUgbnVtYmVyIG9mIHBoeXNpY3Mgc3RlcHMgaW4gb25lIHJlbmRlciBmcmFtZVxyXG4gICAgICAgIC8vIHRvIHByZXZlbnQgaW5zdGFiaWxpdGllcyBpZiByZW5kZXJpbmcgc2xvd3MgZG93biBzaWduaWZpY2FudGx5LlxyXG4gICAgICAgIHRoaXMud29ybGQuc3RlcCgxIC8gNjAsIGRlbHRhVGltZSwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm1heFBoeXNpY3NTdWJTdGVwcyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVcGRhdGVzIHRoZSBwbGF5ZXIncyB2ZWxvY2l0eSBiYXNlZCBvbiBXQVNEIGlucHV0IGFuZCBjYW1lcmEgb3JpZW50YXRpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlUGxheWVyTW92ZW1lbnQoKSB7XHJcbiAgICAgICAgLy8gUGxheWVyIG1vdmVtZW50IHNob3VsZCBvbmx5IGhhcHBlbiB3aGVuIHRoZSBwb2ludGVyIGlzIGxvY2tlZFxyXG4gICAgICAgIGlmICghdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgLy8gSWYgcG9pbnRlciBpcyBub3QgbG9ja2VkLCBzdG9wIGhvcml6b250YWwgbW92ZW1lbnQgaW1tZWRpYXRlbHlcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggPSAwO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiA9IDA7XHJcbiAgICAgICAgICAgIHJldHVybjsgLy8gRXhpdCBlYXJseSBhcyBubyBtb3ZlbWVudCBpbnB1dCBzaG91bGQgYmUgcHJvY2Vzc2VkXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgZWZmZWN0aXZlUGxheWVyU3BlZWQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyU3BlZWQ7XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGFpciBjb250cm9sIGZhY3RvciBpZiBwbGF5ZXIgaXMgaW4gdGhlIGFpclxyXG4gICAgICAgIGlmICh0aGlzLm51bUdyb3VuZENvbnRhY3RzID09PSAwKSB7XHJcbiAgICAgICAgICAgIGVmZmVjdGl2ZVBsYXllclNwZWVkICo9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJBaXJDb250cm9sRmFjdG9yOyAvLyBVc2UgY29uZmlndXJhYmxlIGFpciBjb250cm9sIGZhY3RvclxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBjdXJyZW50WVZlbG9jaXR5ID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5Lnk7IC8vIFByZXNlcnZlIHZlcnRpY2FsIHZlbG9jaXR5XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgbW92ZURpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIDApOyAvLyBVc2UgYSBUSFJFRS5WZWN0b3IzIGZvciBjYWxjdWxhdGlvbiBlYXNlXHJcblxyXG4gICAgICAgIC8vIEdldCBjYW1lcmFDb250YWluZXIncyBmb3J3YXJkIHZlY3RvciAoaG9yaXpvbnRhbCBkaXJlY3Rpb24gcGxheWVyIGlzIGxvb2tpbmcpXHJcbiAgICAgICAgY29uc3QgY2FtZXJhRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5nZXRXb3JsZERpcmVjdGlvbihjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgIGNhbWVyYURpcmVjdGlvbi55ID0gMDsgLy8gRmxhdHRlbiB0aGUgdmVjdG9yIHRvIHJlc3RyaWN0IG1vdmVtZW50IHRvIHRoZSBob3Jpem9udGFsIHBsYW5lXHJcbiAgICAgICAgY2FtZXJhRGlyZWN0aW9uLm5vcm1hbGl6ZSgpO1xyXG5cclxuICAgICAgICBjb25zdCBnbG9iYWxVcCA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDEsIDApOyAvLyBEZWZpbmUgZ2xvYmFsIHVwIHZlY3RvciBmb3IgY3Jvc3MgcHJvZHVjdFxyXG5cclxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlICdyaWdodCcgdmVjdG9yIHJlbGF0aXZlIHRvIGNhbWVyYSdzIGZvcndhcmQgZGlyZWN0aW9uXHJcbiAgICAgICAgY29uc3QgY2FtZXJhUmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIGNhbWVyYVJpZ2h0LmNyb3NzVmVjdG9ycyhnbG9iYWxVcCwgY2FtZXJhRGlyZWN0aW9uKS5ub3JtYWxpemUoKTsgXHJcblxyXG4gICAgICAgIGxldCBtb3ZpbmcgPSBmYWxzZTtcclxuICAgICAgICAvLyBXIDwtPiBTIHN3YXAgZnJvbSB1c2VyJ3MgY29tbWVudHMgaW4gb3JpZ2luYWwgY29kZTpcclxuICAgICAgICBpZiAodGhpcy5rZXlzWydzJ10pIHsgLy8gJ3MnIGtleSBub3cgbW92ZXMgZm9yd2FyZFxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLmFkZChjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5rZXlzWyd3J10pIHsgLy8gJ3cnIGtleSBub3cgbW92ZXMgYmFja3dhcmRcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5zdWIoY2FtZXJhRGlyZWN0aW9uKTtcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gQSBhbmQgRCBjb250cm9scyBhcyBzdGFuZGFyZDpcclxuICAgICAgICBpZiAodGhpcy5rZXlzWydhJ10pIHsgLy8gJ2EnIGtleSBub3cgc3RyYWZlcyBsZWZ0XHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24uc3ViKGNhbWVyYVJpZ2h0KTsgXHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ2QnXSkgeyAvLyAnZCcga2V5IG5vdyBzdHJhZmVzIHJpZ2h0XHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24uYWRkKGNhbWVyYVJpZ2h0KTsgXHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAobW92aW5nKSB7XHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24ubm9ybWFsaXplKCkubXVsdGlwbHlTY2FsYXIoZWZmZWN0aXZlUGxheWVyU3BlZWQpO1xyXG4gICAgICAgICAgICAvLyBEaXJlY3RseSBzZXQgdGhlIGhvcml6b250YWwgdmVsb2NpdHkgY29tcG9uZW50cy5cclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggPSBtb3ZlRGlyZWN0aW9uLng7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gbW92ZURpcmVjdGlvbi56O1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIElmIG5vIG1vdmVtZW50IGtleXMgYXJlIHByZXNzZWQ6XHJcbiAgICAgICAgICAgIGlmICh0aGlzLm51bUdyb3VuZENvbnRhY3RzID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBQbGF5ZXIgaXMgaW4gdGhlIGFpcjogYXBwbHkgY29uZmlndXJhYmxlIGFpciBkZWNlbGVyYXRpb25cclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ICo9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJBaXJEZWNlbGVyYXRpb247XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiAqPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyQWlyRGVjZWxlcmF0aW9uO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gUGxheWVyIGlzIG9uIHRoZSBncm91bmQ6IENhbm5vbi5qcyBDb250YWN0TWF0ZXJpYWwgZnJpY3Rpb24gd2lsbCBoYW5kbGUgZGVjZWxlcmF0aW9uLlxyXG4gICAgICAgICAgICAgICAgLy8gTm8gZXhwbGljaXQgdmVsb2NpdHkgZGVjYXkgaXMgYXBwbGllZCBoZXJlIGZvciBncm91bmQgbW92ZW1lbnQuXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnkgPSBjdXJyZW50WVZlbG9jaXR5OyAvLyBSZXN0b3JlIFkgdmVsb2NpdHkgKGdyYXZpdHkvanVtcHMpXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBRERFRDogQXBwbGllcyBhbiB1cHdhcmQgaW1wdWxzZSB0byB0aGUgcGxheWVyIGJvZHkgZm9yIGp1bXBpbmcuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcGxheWVySnVtcCgpIHtcclxuICAgICAgICAvLyBPbmx5IGFsbG93IGp1bXAgaWYgdGhlIHBsYXllciBpcyBjdXJyZW50bHkgb24gdGhlIGdyb3VuZCAoaGFzIGFjdGl2ZSBjb250YWN0cylcclxuICAgICAgICBpZiAodGhpcy5udW1Hcm91bmRDb250YWN0cyA+IDApIHtcclxuICAgICAgICAgICAgLy8gQ2xlYXIgYW55IGV4aXN0aW5nIHZlcnRpY2FsIHZlbG9jaXR5IHRvIGVuc3VyZSBhIGNvbnNpc3RlbnQganVtcCBoZWlnaHRcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnkgPSAwOyBcclxuICAgICAgICAgICAgLy8gQXBwbHkgYW4gdXB3YXJkIGltcHVsc2UgKG1hc3MgKiBjaGFuZ2VfaW5fdmVsb2NpdHkpXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5hcHBseUltcHVsc2UoXHJcbiAgICAgICAgICAgICAgICBuZXcgQ0FOTk9OLlZlYzMoMCwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmp1bXBGb3JjZSwgMCksXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24gLy8gQXBwbHkgaW1wdWxzZSBhdCB0aGUgY2VudGVyIG9mIG1hc3NcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbGFtcHMgdGhlIHBsYXllcidzIHBvc2l0aW9uIHdpdGhpbiB0aGUgZGVmaW5lZCBncm91bmQgYm91bmRhcmllcy5cclxuICAgICAqIFByZXZlbnRzIHRoZSBwbGF5ZXIgZnJvbSBtb3ZpbmcgYmV5b25kIHRoZSAnZW5kIG9mIHRoZSB3b3JsZCcuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY2xhbXBQbGF5ZXJQb3NpdGlvbigpIHtcclxuICAgICAgICBpZiAoIXRoaXMucGxheWVyQm9keSB8fCAhdGhpcy5jb25maWcpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaGFsZkdyb3VuZFNpemUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDI7XHJcblxyXG4gICAgICAgIGxldCBwb3NYID0gdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLng7XHJcbiAgICAgICAgbGV0IHBvc1ogPSB0aGlzLnBsYXllckJvZHkucG9zaXRpb24uejtcclxuICAgICAgICBsZXQgdmVsWCA9IHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54O1xyXG4gICAgICAgIGxldCB2ZWxaID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5Lno7XHJcblxyXG4gICAgICAgIC8vIENsYW1wIFggcG9zaXRpb25cclxuICAgICAgICBpZiAocG9zWCA+IGhhbGZHcm91bmRTaXplKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi54ID0gaGFsZkdyb3VuZFNpemU7XHJcbiAgICAgICAgICAgIGlmICh2ZWxYID4gMCkgeyAvLyBJZiBtb3Zpbmcgb3V0d2FyZHMsIHN0b3AgaG9yaXpvbnRhbCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmIChwb3NYIDwgLWhhbGZHcm91bmRTaXplKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi54ID0gLWhhbGZHcm91bmRTaXplO1xyXG4gICAgICAgICAgICBpZiAodmVsWCA8IDApIHsgLy8gSWYgbW92aW5nIG91dHdhcmRzLCBzdG9wIGhvcml6b250YWwgdmVsb2NpdHlcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2xhbXAgWiBwb3NpdGlvblxyXG4gICAgICAgIGlmIChwb3NaID4gaGFsZkdyb3VuZFNpemUpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnogPSBoYWxmR3JvdW5kU2l6ZTtcclxuICAgICAgICAgICAgaWYgKHZlbFogPiAwKSB7IC8vIElmIG1vdmluZyBvdXR3YXJkcywgc3RvcCBob3Jpem9udGFsIHZlbG9jaXR5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHBvc1ogPCAtaGFsZkdyb3VuZFNpemUpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnogPSAtaGFsZkdyb3VuZFNpemU7XHJcbiAgICAgICAgICAgIGlmICh2ZWxaIDwgMCkgeyAvLyBJZiBtb3Zpbmcgb3V0d2FyZHMsIHN0b3AgaG9yaXpvbnRhbCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3luY2hyb25pemVzIHRoZSB2aXN1YWwgbWVzaGVzIHdpdGggdGhlaXIgY29ycmVzcG9uZGluZyBwaHlzaWNzIGJvZGllcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzeW5jTWVzaGVzV2l0aEJvZGllcygpIHtcclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSBwbGF5ZXIncyB2aXN1YWwgbWVzaCBwb3NpdGlvbiB3aXRoIGl0cyBwaHlzaWNzIGJvZHkncyBwb3NpdGlvblxyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIGNhbWVyYUNvbnRhaW5lciBwb3NpdGlvbiB3aXRoIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkncyBwb3NpdGlvbi5cclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG5cclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSBwbGF5ZXIncyB2aXN1YWwgbWVzaCBob3Jpem9udGFsIHJvdGF0aW9uICh5YXcpIHdpdGggY2FtZXJhQ29udGFpbmVyJ3MgeWF3LlxyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5xdWF0ZXJuaW9uLmNvcHkodGhpcy5jYW1lcmFDb250YWluZXIucXVhdGVybmlvbik7XHJcblxyXG4gICAgICAgIC8vIFRoZSBncm91bmQgYW5kIHBsYWNlZCBvYmplY3RzIGFyZSBjdXJyZW50bHkgc3RhdGljIChtYXNzIDApLCBzbyB0aGVpciB2aXN1YWwgbWVzaGVzXHJcbiAgICAgICAgLy8gZG8gbm90IG5lZWQgdG8gYmUgc3luY2hyb25pemVkIHdpdGggdGhlaXIgcGh5c2ljcyBib2RpZXMgYWZ0ZXIgaW5pdGlhbCBwbGFjZW1lbnQuXHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIFN0YXJ0IHRoZSBnYW1lIHdoZW4gdGhlIERPTSBjb250ZW50IGlzIGZ1bGx5IGxvYWRlZFxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xyXG4gICAgbmV3IEdhbWUoKTtcclxufSk7Il0sCiAgIm1hcHBpbmdzIjogIkFBQUEsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksWUFBWTtBQUd4QixJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBRkMsU0FBQUE7QUFBQSxHQUFBO0FBK0NMLE1BQU0sS0FBSztBQUFBLEVBaURQLGNBQWM7QUEvQ2Q7QUFBQSxTQUFRLFFBQW1CO0FBd0IzQjtBQUFBLFNBQVEscUJBQW1DLENBQUM7QUFDNUMsU0FBUSxxQkFBb0MsQ0FBQztBQUc3QztBQUFBLFNBQVEsT0FBbUMsQ0FBQztBQUM1QztBQUFBLFNBQVEsa0JBQTJCO0FBQ25DO0FBQUEsU0FBUSxjQUFzQjtBQUc5QjtBQUFBO0FBQUEsU0FBUSxXQUF1QyxvQkFBSSxJQUFJO0FBQ3ZEO0FBQUEsU0FBUSxTQUF3QyxvQkFBSSxJQUFJO0FBUXhEO0FBQUEsU0FBUSxXQUFnQztBQUd4QztBQUFBLFNBQVEsb0JBQTRCO0FBSWhDLFNBQUssU0FBUyxTQUFTLGVBQWUsWUFBWTtBQUNsRCxRQUFJ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QUFBQSxRQUNaLElBQUksT0FBTyxLQUFLLEdBQUcsS0FBSyxPQUFPLGFBQWEsV0FBVyxDQUFDO0FBQUEsUUFDeEQsS0FBSyxXQUFXO0FBQUE7QUFBQSxNQUNwQjtBQUFBLElBQ0o7QUFBQSxFQUNKO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLHNCQUFzQjtBQUMxQixRQUFJLENBQUMsS0FBSyxjQUFjLENBQUMsS0FBSyxRQUFRO0FBQ2xDO0FBQUEsSUFDSjtBQUVBLFVBQU0saUJBQWlCLEtBQUssT0FBTyxhQUFhLGFBQWE7QUFFN0QsUUFBSSxPQUFPLEtBQUssV0FBVyxTQUFTO0FBQ3BDLFFBQUksT0FBTyxLQUFLLFdBQVcsU0FBUztBQUNwQyxRQUFJLE9BQU8sS0FBSyxXQUFXLFNBQVM7QUFDcEMsUUFBSSxPQUFPLEtBQUssV0FBVyxTQUFTO0FBR3BDLFFBQUksT0FBTyxnQkFBZ0I7QUFDdkIsV0FBSyxXQUFXLFNBQVMsSUFBSTtBQUM3QixVQUFJLE9BQU8sR0FBRztBQUNWLGFBQUssV0FBVyxTQUFTLElBQUk7QUFBQSxNQUNqQztBQUFBLElBQ0osV0FBVyxPQUFPLENBQUMsZ0JBQWdCO0FBQy9CLFdBQUssV0FBVyxTQUFTLElBQUksQ0FBQztBQUM5QixVQUFJLE9BQU8sR0FBRztBQUNWLGFBQUssV0FBVyxTQUFTLElBQUk7QUFBQSxNQUNqQztBQUFBLElBQ0o7QUFHQSxRQUFJLE9BQU8sZ0JBQWdCO0FBQ3ZCLFdBQUssV0FBVyxTQUFTLElBQUk7QUFDN0IsVUFBSSxPQUFPLEdBQUc7QUFDVixhQUFLLFdBQVcsU0FBUyxJQUFJO0FBQUEsTUFDakM7QUFBQSxJQUNKLFdBQVcsT0FBTyxDQUFDLGdCQUFnQjtBQUMvQixXQUFLLFdBQVcsU0FBUyxJQUFJLENBQUM7QUFDOUIsVUFBSSxPQUFPLEdBQUc7QUFDVixhQUFLLFdBQVcsU0FBUyxJQUFJO0FBQUEsTUFDakM7QUFBQSxJQUNKO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsdUJBQXVCO0FBRTNCLFNBQUssV0FBVyxTQUFTLEtBQUssS0FBSyxXQUFXLFFBQW9DO0FBR2xGLFNBQUssZ0JBQWdCLFNBQVMsS0FBSyxLQUFLLFdBQVcsUUFBb0M7QUFHdkYsU0FBSyxXQUFXLFdBQVcsS0FBSyxLQUFLLGdCQUFnQixVQUFVO0FBQUEsRUFJbkU7QUFDSjtBQUdBLFNBQVMsaUJBQWlCLG9CQUFvQixNQUFNO0FBQ2hELE1BQUksS0FBSztBQUNiLENBQUM7IiwKICAibmFtZXMiOiBbIkdhbWVTdGF0ZSJdCn0K
