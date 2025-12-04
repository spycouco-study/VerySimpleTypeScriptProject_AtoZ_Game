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
    this.defaultObjectMaterial = new CANNON.Material("defaultObjectMaterial");
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
    const playerObjectContactMaterial = new CANNON.ContactMaterial(
      this.playerMaterial,
      this.defaultObjectMaterial,
      {
        friction: this.config.gameSettings.playerGroundFriction,
        // Same friction as player-ground
        restitution: 0
      }
    );
    this.world.addContactMaterial(playerObjectContactMaterial);
    const objectGroundContactMaterial = new CANNON.ContactMaterial(
      this.defaultObjectMaterial,
      this.groundMaterial,
      {
        friction: this.config.gameSettings.playerGroundFriction,
        // Same friction as player-ground
        restitution: 0
      }
    );
    this.world.addContactMaterial(objectGroundContactMaterial);
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
        shape,
        material: this.defaultObjectMaterial
        // ADDED: Assign the default object material
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuXHJcbi8vIEVudW0gdG8gZGVmaW5lIHRoZSBwb3NzaWJsZSBzdGF0ZXMgb2YgdGhlIGdhbWVcclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgVElUTEUsICAgLy8gVGl0bGUgc2NyZWVuLCB3YWl0aW5nIGZvciB1c2VyIGlucHV0XHJcbiAgICBQTEFZSU5HICAvLyBHYW1lIGlzIGFjdGl2ZSwgdXNlciBjYW4gbW92ZSBhbmQgbG9vayBhcm91bmRcclxufVxyXG5cclxuLy8gSW50ZXJmYWNlIGZvciBvYmplY3RzIHBsYWNlZCBpbiB0aGUgc2NlbmVcclxuaW50ZXJmYWNlIFBsYWNlZE9iamVjdENvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7IC8vIEEgZGVzY3JpcHRpdmUgbmFtZSBmb3IgdGhlIG9iamVjdCBpbnN0YW5jZVxyXG4gICAgdGV4dHVyZU5hbWU6IHN0cmluZzsgLy8gTmFtZSBvZiB0aGUgdGV4dHVyZSBmcm9tIGFzc2V0cy5pbWFnZXNcclxuICAgIHR5cGU6ICdib3gnOyAvLyBDdXJyZW50bHkgb25seSBzdXBwb3J0cyAnYm94J1xyXG4gICAgcG9zaXRpb246IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xyXG4gICAgZGltZW5zaW9uczogeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgZGVwdGg6IG51bWJlciB9O1xyXG4gICAgcm90YXRpb25ZPzogbnVtYmVyOyAvLyBPcHRpb25hbCByb3RhdGlvbiBhcm91bmQgWS1heGlzIChyYWRpYW5zKVxyXG4gICAgbWFzczogbnVtYmVyOyAvLyAwIGZvciBzdGF0aWMsID4wIGZvciBkeW5hbWljICh0aG91Z2ggYWxsIHBsYWNlZCBvYmplY3RzIGhlcmUgd2lsbCBiZSBzdGF0aWMpXHJcbn1cclxuXHJcbi8vIEludGVyZmFjZSB0byB0eXBlLWNoZWNrIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHN0YXJ0R2FtZVByb21wdDogc3RyaW5nO1xyXG4gICAgICAgIHBsYXllclNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgbW91c2VTZW5zaXRpdml0eTogbnVtYmVyO1xyXG4gICAgICAgIGNhbWVyYUhlaWdodE9mZnNldDogbnVtYmVyOyAvLyBWZXJ0aWNhbCBvZmZzZXQgb2YgdGhlIGNhbWVyYSBmcm9tIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkgY2VudGVyXHJcbiAgICAgICAgY2FtZXJhTmVhcjogbnVtYmVyOyAgICAgICAgIC8vIE5lYXIgY2xpcHBpbmcgcGxhbmUgZm9yIHRoZSBjYW1lcmFcclxuICAgICAgICBjYW1lcmFGYXI6IG51bWJlcjsgICAgICAgICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lIGZvciB0aGUgY2FtZXJhXHJcbiAgICAgICAgcGxheWVyTWFzczogbnVtYmVyOyAgICAgICAgIC8vIE1hc3Mgb2YgdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keVxyXG4gICAgICAgIGdyb3VuZFNpemU6IG51bWJlcjsgICAgICAgICAvLyBTaXplICh3aWR0aC9kZXB0aCkgb2YgdGhlIHNxdWFyZSBncm91bmQgcGxhbmVcclxuICAgICAgICBtYXhQaHlzaWNzU3ViU3RlcHM6IG51bWJlcjsgLy8gTWF4aW11bSBudW1iZXIgb2YgcGh5c2ljcyBzdWJzdGVwcyBwZXIgZnJhbWUgdG8gbWFpbnRhaW4gc3RhYmlsaXR5XHJcbiAgICAgICAgZml4ZWRBc3BlY3RSYXRpbzogeyB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciB9OyAvLyBOZXc6IEZpeGVkIGFzcGVjdCByYXRpbyBmb3IgdGhlIGdhbWUgKHdpZHRoIC8gaGVpZ2h0KVxyXG4gICAgICAgIGp1bXBGb3JjZTogbnVtYmVyOyAgICAgICAgICAvLyBBRERFRDogRm9yY2UgYXBwbGllZCB3aGVuIGp1bXBpbmdcclxuICAgICAgICBwbGFjZWRPYmplY3RzOiBQbGFjZWRPYmplY3RDb25maWdbXTsgLy8gTkVXOiBBcnJheSBvZiBvYmplY3RzIHRvIHBsYWNlIGluIHRoZSB3b3JsZFxyXG4gICAgICAgIC8vIE5FVzogQ29uZmlndXJhYmxlIHBoeXNpY3MgcHJvcGVydGllc1xyXG4gICAgICAgIHBsYXllckdyb3VuZEZyaWN0aW9uOiBudW1iZXI7ICAgICAgICAvLyBGcmljdGlvbiBjb2VmZmljaWVudCBmb3IgcGxheWVyLWdyb3VuZCBjb250YWN0XHJcbiAgICAgICAgcGxheWVyQWlyQ29udHJvbEZhY3RvcjogbnVtYmVyOyAgICAvLyBNdWx0aXBsaWVyIGZvciBwbGF5ZXJTcGVlZCB3aGVuIGFpcmJvcm5lXHJcbiAgICAgICAgcGxheWVyQWlyRGVjZWxlcmF0aW9uOiBudW1iZXI7ICAgICAvLyBEZWNheSBmYWN0b3IgZm9yIGhvcml6b250YWwgdmVsb2NpdHkgd2hlbiBhaXJib3JuZSBhbmQgbm90IG1vdmluZ1xyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfVtdO1xyXG4gICAgICAgIHNvdW5kczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyOyB2b2x1bWU6IG51bWJlciB9W107XHJcbiAgICB9O1xyXG59XHJcblxyXG4vKipcclxuICogTWFpbiBHYW1lIGNsYXNzIHJlc3BvbnNpYmxlIGZvciBpbml0aWFsaXppbmcgYW5kIHJ1bm5pbmcgdGhlIDNEIGdhbWUuXHJcbiAqIEl0IGhhbmRsZXMgVGhyZWUuanMgcmVuZGVyaW5nLCBDYW5ub24tZXMgcGh5c2ljcywgaW5wdXQsIGFuZCBnYW1lIHN0YXRlLlxyXG4gKi9cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNvbmZpZyE6IEdhbWVDb25maWc7IC8vIEdhbWUgY29uZmlndXJhdGlvbiBsb2FkZWQgZnJvbSBkYXRhLmpzb25cclxuICAgIHByaXZhdGUgc3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTsgLy8gQ3VycmVudCBzdGF0ZSBvZiB0aGUgZ2FtZVxyXG5cclxuICAgIC8vIFRocmVlLmpzIGVsZW1lbnRzIGZvciByZW5kZXJpbmdcclxuICAgIHByaXZhdGUgc2NlbmUhOiBUSFJFRS5TY2VuZTtcclxuICAgIHByaXZhdGUgY2FtZXJhITogVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmE7XHJcbiAgICBwcml2YXRlIHJlbmRlcmVyITogVEhSRUUuV2ViR0xSZW5kZXJlcjtcclxuICAgIHByaXZhdGUgY2FudmFzITogSFRNTENhbnZhc0VsZW1lbnQ7IC8vIFRoZSBIVE1MIGNhbnZhcyBlbGVtZW50IGZvciByZW5kZXJpbmdcclxuXHJcbiAgICAvLyBOZXc6IEEgY29udGFpbmVyIG9iamVjdCBmb3IgdGhlIGNhbWVyYSB0byBoYW5kbGUgaG9yaXpvbnRhbCByb3RhdGlvbiBzZXBhcmF0ZWx5IGZyb20gdmVydGljYWwgcGl0Y2guXHJcbiAgICBwcml2YXRlIGNhbWVyYUNvbnRhaW5lciE6IFRIUkVFLk9iamVjdDNEOyBcclxuXHJcbiAgICAvLyBDYW5ub24tZXMgZWxlbWVudHMgZm9yIHBoeXNpY3NcclxuICAgIHByaXZhdGUgd29ybGQhOiBDQU5OT04uV29ybGQ7XHJcbiAgICBwcml2YXRlIHBsYXllckJvZHkhOiBDQU5OT04uQm9keTsgLy8gUGh5c2ljcyBib2R5IGZvciB0aGUgcGxheWVyXHJcbiAgICBwcml2YXRlIGdyb3VuZEJvZHkhOiBDQU5OT04uQm9keTsgLy8gUGh5c2ljcyBib2R5IGZvciB0aGUgZ3JvdW5kXHJcblxyXG4gICAgLy8gTkVXOiBDYW5ub24tZXMgbWF0ZXJpYWxzIGZvciBwaHlzaWNzXHJcbiAgICBwcml2YXRlIHBsYXllck1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsO1xyXG4gICAgcHJpdmF0ZSBncm91bmRNYXRlcmlhbCE6IENBTk5PTi5NYXRlcmlhbDtcclxuICAgIHByaXZhdGUgZGVmYXVsdE9iamVjdE1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsOyAvLyBBRERFRDogTWF0ZXJpYWwgZm9yIGdlbmVyaWMgcGxhY2VkIG9iamVjdHNcclxuXHJcbiAgICAvLyBWaXN1YWwgbWVzaGVzIChUaHJlZS5qcykgZm9yIGdhbWUgb2JqZWN0c1xyXG4gICAgcHJpdmF0ZSBwbGF5ZXJNZXNoITogVEhSRUUuTWVzaDtcclxuICAgIHByaXZhdGUgZ3JvdW5kTWVzaCE6IFRIUkVFLk1lc2g7XHJcbiAgICAvLyBORVc6IEFycmF5cyB0byBob2xkIHJlZmVyZW5jZXMgdG8gZHluYW1pY2FsbHkgcGxhY2VkIG9iamVjdHNcclxuICAgIHByaXZhdGUgcGxhY2VkT2JqZWN0TWVzaGVzOiBUSFJFRS5NZXNoW10gPSBbXTtcclxuICAgIHByaXZhdGUgcGxhY2VkT2JqZWN0Qm9kaWVzOiBDQU5OT04uQm9keVtdID0gW107XHJcblxyXG4gICAgLy8gSW5wdXQgaGFuZGxpbmcgc3RhdGVcclxuICAgIHByaXZhdGUga2V5czogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0gPSB7fTsgLy8gVHJhY2tzIGN1cnJlbnRseSBwcmVzc2VkIGtleXNcclxuICAgIHByaXZhdGUgaXNQb2ludGVyTG9ja2VkOiBib29sZWFuID0gZmFsc2U7IC8vIFRydWUgaWYgbW91c2UgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgIHByaXZhdGUgY2FtZXJhUGl0Y2g6IG51bWJlciA9IDA7IC8vIFZlcnRpY2FsIHJvdGF0aW9uIChwaXRjaCkgb2YgdGhlIGNhbWVyYVxyXG5cclxuICAgIC8vIEFzc2V0IG1hbmFnZW1lbnRcclxuICAgIHByaXZhdGUgdGV4dHVyZXM6IE1hcDxzdHJpbmcsIFRIUkVFLlRleHR1cmU+ID0gbmV3IE1hcCgpOyAvLyBTdG9yZXMgbG9hZGVkIHRleHR1cmVzXHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7IC8vIFN0b3JlcyBsb2FkZWQgYXVkaW8gZWxlbWVudHNcclxuXHJcbiAgICAvLyBVSSBlbGVtZW50cyAoZHluYW1pY2FsbHkgY3JlYXRlZCBmb3IgdGhlIHRpdGxlIHNjcmVlbilcclxuICAgIHByaXZhdGUgdGl0bGVTY3JlZW5PdmVybGF5ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHRpdGxlVGV4dCE6IEhUTUxEaXZFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBwcm9tcHRUZXh0ITogSFRNTERpdkVsZW1lbnQ7XHJcblxyXG4gICAgLy8gRm9yIGNhbGN1bGF0aW5nIGRlbHRhIHRpbWUgYmV0d2VlbiBmcmFtZXNcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXAgPSAwO1xyXG5cclxuICAgIC8vIEFEREVEOiBUcmFja3MgcGxheWVyLWdyb3VuZCBjb250YWN0cyBmb3IganVtcGluZyBsb2dpY1xyXG4gICAgcHJpdmF0ZSBudW1Hcm91bmRDb250YWN0czogbnVtYmVyID0gMDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICAvLyBHZXQgdGhlIGNhbnZhcyBlbGVtZW50IGZyb20gaW5kZXguaHRtbFxyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0NhbnZhcyBlbGVtZW50IHdpdGggSUQgXCJnYW1lQ2FudmFzXCIgbm90IGZvdW5kIScpO1xyXG4gICAgICAgICAgICByZXR1cm47IC8vIENhbm5vdCBwcm9jZWVkIHdpdGhvdXQgYSBjYW52YXNcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5pbml0KCk7IC8vIFN0YXJ0IHRoZSBhc3luY2hyb25vdXMgaW5pdGlhbGl6YXRpb24gcHJvY2Vzc1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXN5bmNocm9ub3VzbHkgaW5pdGlhbGl6ZXMgdGhlIGdhbWUsIGxvYWRpbmcgY29uZmlnLCBhc3NldHMsIGFuZCBzZXR0aW5nIHVwIHN5c3RlbXMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXN5bmMgaW5pdCgpIHtcclxuICAgICAgICAvLyAxLiBMb2FkIGdhbWUgY29uZmlndXJhdGlvbiBmcm9tIGRhdGEuanNvblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgZXJyb3IhIHN0YXR1czogJHtyZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5jb25maWcgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdHYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkOicsIHRoaXMuY29uZmlnKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb246JywgZXJyb3IpO1xyXG4gICAgICAgICAgICAvLyBJZiBjb25maWd1cmF0aW9uIGZhaWxzIHRvIGxvYWQsIGRpc3BsYXkgYW4gZXJyb3IgbWVzc2FnZSBhbmQgc3RvcC5cclxuICAgICAgICAgICAgY29uc3QgZXJyb3JEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS50b3AgPSAnNTAlJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUubGVmdCA9ICc1MCUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS50cmFuc2Zvcm0gPSAndHJhbnNsYXRlKC01MCUsIC01MCUpJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUuY29sb3IgPSAncmVkJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUuZm9udFNpemUgPSAnMjRweCc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnRleHRDb250ZW50ID0gJ0Vycm9yOiBGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb24uIENoZWNrIGNvbnNvbGUgZm9yIGRldGFpbHMuJztcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlcnJvckRpdik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIDIuIEluaXRpYWxpemUgVGhyZWUuanMgKHNjZW5lLCBjYW1lcmEsIHJlbmRlcmVyKVxyXG4gICAgICAgIHRoaXMuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYShcclxuICAgICAgICAgICAgNzUsIC8vIEZpZWxkIG9mIFZpZXcgKEZPVilcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZpeGVkQXNwZWN0UmF0aW8ud2lkdGggLyB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby5oZWlnaHQsIC8vIEZpeGVkIEFzcGVjdCByYXRpbyBmcm9tIGNvbmZpZ1xyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FtZXJhTmVhciwgLy8gTmVhciBjbGlwcGluZyBwbGFuZVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FtZXJhRmFyICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lXHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoeyBjYW52YXM6IHRoaXMuY2FudmFzLCBhbnRpYWxpYXM6IHRydWUgfSk7XHJcbiAgICAgICAgLy8gUmVuZGVyZXIgc2l6ZSB3aWxsIGJlIHNldCBieSBhcHBseUZpeGVkQXNwZWN0UmF0aW8gdG8gZml0IHRoZSB3aW5kb3cgd2hpbGUgbWFpbnRhaW5pbmcgYXNwZWN0IHJhdGlvXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRQaXhlbFJhdGlvKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC5lbmFibGVkID0gdHJ1ZTsgLy8gRW5hYmxlIHNoYWRvd3MgZm9yIGJldHRlciByZWFsaXNtXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zaGFkb3dNYXAudHlwZSA9IFRIUkVFLlBDRlNvZnRTaGFkb3dNYXA7IC8vIFVzZSBzb2Z0IHNoYWRvd3NcclxuXHJcbiAgICAgICAgLy8gQ2FtZXJhIHNldHVwIGZvciBkZWNvdXBsZWQgeWF3IGFuZCBwaXRjaDpcclxuICAgICAgICAvLyBjYW1lcmFDb250YWluZXIgaGFuZGxlcyB5YXcgKGhvcml6b250YWwgcm90YXRpb24pIGFuZCBmb2xsb3dzIHRoZSBwbGF5ZXIncyBwb3NpdGlvbi5cclxuICAgICAgICAvLyBUaGUgY2FtZXJhIGl0c2VsZiBpcyBhIGNoaWxkIG9mIGNhbWVyYUNvbnRhaW5lciBhbmQgaGFuZGxlcyBwaXRjaCAodmVydGljYWwgcm90YXRpb24pLlxyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyID0gbmV3IFRIUkVFLk9iamVjdDNEKCk7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5jYW1lcmFDb250YWluZXIpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLmFkZCh0aGlzLmNhbWVyYSk7XHJcbiAgICAgICAgLy8gUG9zaXRpb24gdGhlIGNhbWVyYSByZWxhdGl2ZSB0byB0aGUgY2FtZXJhQ29udGFpbmVyIChhdCBleWUgbGV2ZWwpXHJcbiAgICAgICAgdGhpcy5jYW1lcmEucG9zaXRpb24ueSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFIZWlnaHRPZmZzZXQ7XHJcblxyXG5cclxuICAgICAgICAvLyAzLiBJbml0aWFsaXplIENhbm5vbi1lcyAocGh5c2ljcyB3b3JsZClcclxuICAgICAgICB0aGlzLndvcmxkID0gbmV3IENBTk5PTi5Xb3JsZCgpO1xyXG4gICAgICAgIHRoaXMud29ybGQuZ3Jhdml0eS5zZXQoMCwgLTkuODIsIDApOyAvLyBTZXQgc3RhbmRhcmQgRWFydGggZ3Jhdml0eSAoWS1heGlzIGRvd24pXHJcbiAgICAgICAgdGhpcy53b3JsZC5icm9hZHBoYXNlID0gbmV3IENBTk5PTi5TQVBCcm9hZHBoYXNlKHRoaXMud29ybGQpOyAvLyBVc2UgYW4gZWZmaWNpZW50IGJyb2FkcGhhc2UgYWxnb3JpdGhtXHJcbiAgICAgICAgLy8gRml4OiBDYXN0IHRoaXMud29ybGQuc29sdmVyIHRvIENBTk5PTi5HU1NvbHZlciB0byBhY2Nlc3MgdGhlICdpdGVyYXRpb25zJyBwcm9wZXJ0eVxyXG4gICAgICAgIC8vIFRoZSBkZWZhdWx0IHNvbHZlciBpbiBDYW5ub24uanMgKGFuZCBDYW5ub24tZXMpIGlzIEdTU29sdmVyLCB3aGljaCBoYXMgdGhpcyBwcm9wZXJ0eS5cclxuICAgICAgICAodGhpcy53b3JsZC5zb2x2ZXIgYXMgQ0FOTk9OLkdTU29sdmVyKS5pdGVyYXRpb25zID0gMTA7IC8vIEluY3JlYXNlIHNvbHZlciBpdGVyYXRpb25zIGZvciBiZXR0ZXIgc3RhYmlsaXR5XHJcblxyXG4gICAgICAgIC8vIE5FVzogQ3JlYXRlIENhbm5vbi5qcyBNYXRlcmlhbHMgYW5kIENvbnRhY3RNYXRlcmlhbCBmb3IgcGxheWVyLWdyb3VuZCBpbnRlcmFjdGlvblxyXG4gICAgICAgIHRoaXMucGxheWVyTWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdwbGF5ZXJNYXRlcmlhbCcpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdncm91bmRNYXRlcmlhbCcpO1xyXG4gICAgICAgIHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgnZGVmYXVsdE9iamVjdE1hdGVyaWFsJyk7IC8vIEFEREVEOiBNYXRlcmlhbCBmb3IgcGxhY2VkIG9iamVjdHNcclxuXHJcbiAgICAgICAgY29uc3QgcGxheWVyR3JvdW5kQ29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZ3JvdW5kTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGZyaWN0aW9uOiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyR3JvdW5kRnJpY3Rpb24sIC8vIFVzZSBjb25maWd1cmFibGUgZ3JvdW5kIGZyaWN0aW9uXHJcbiAgICAgICAgICAgICAgICByZXN0aXR1dGlvbjogMC4wLCAvLyBObyBib3VuY2UgZm9yIGdyb3VuZFxyXG4gICAgICAgICAgICAgICAgLy8gT3B0aW9uYWxseSB0dW5lIGNvbnRhY3RFcXVhdGlvblJlbGF4YXRpb24gYW5kIGZyaWN0aW9uRXF1YXRpb25SZWxheGF0aW9uIGZvciBzdGFiaWxpdHkvZmVlbFxyXG4gICAgICAgICAgICAgICAgLy8gY29udGFjdEVxdWF0aW9uUmVsYXhhdGlvbjogMywgXHJcbiAgICAgICAgICAgICAgICAvLyBmcmljdGlvbkVxdWF0aW9uUmVsYXhhdGlvbjogM1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChwbGF5ZXJHcm91bmRDb250YWN0TWF0ZXJpYWwpO1xyXG5cclxuICAgICAgICAvLyBBRERFRDogUGxheWVyLU9iamVjdCBjb250YWN0IG1hdGVyaWFsIChmcmljdGlvbiBiZXR3ZWVuIHBsYXllciBhbmQgcGxhY2VkIG9iamVjdHMpXHJcbiAgICAgICAgY29uc3QgcGxheWVyT2JqZWN0Q29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckdyb3VuZEZyaWN0aW9uLCAvLyBTYW1lIGZyaWN0aW9uIGFzIHBsYXllci1ncm91bmRcclxuICAgICAgICAgICAgICAgIHJlc3RpdHV0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKHBsYXllck9iamVjdENvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIC8vIEFEREVEOiBPYmplY3QtR3JvdW5kIGNvbnRhY3QgbWF0ZXJpYWwgKGZyaWN0aW9uIGJldHdlZW4gcGxhY2VkIG9iamVjdHMgYW5kIGdyb3VuZClcclxuICAgICAgICAvLyBUaGlzIGlzIHByaW1hcmlseSBmb3IgY29uc2lzdGVuY3kgYW5kIGlmIHBsYWNlZCBvYmplY3RzIG1pZ2h0IGJlY29tZSBkeW5hbWljIGxhdGVyLlxyXG4gICAgICAgIGNvbnN0IG9iamVjdEdyb3VuZENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRPYmplY3RNYXRlcmlhbCxcclxuICAgICAgICAgICAgdGhpcy5ncm91bmRNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJHcm91bmRGcmljdGlvbiwgLy8gU2FtZSBmcmljdGlvbiBhcyBwbGF5ZXItZ3JvdW5kXHJcbiAgICAgICAgICAgICAgICByZXN0aXR1dGlvbjogMC4wLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChvYmplY3RHcm91bmRDb250YWN0TWF0ZXJpYWwpO1xyXG5cclxuICAgICAgICAvLyA0LiBMb2FkIGFzc2V0cyAodGV4dHVyZXMgYW5kIHNvdW5kcylcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRBc3NldHMoKTtcclxuXHJcbiAgICAgICAgLy8gNS4gQ3JlYXRlIGdhbWUgb2JqZWN0cyAocGxheWVyLCBncm91bmQsIGFuZCBvdGhlciBvYmplY3RzKSBhbmQgbGlnaHRpbmdcclxuICAgICAgICB0aGlzLmNyZWF0ZUdyb3VuZCgpOyAvLyBDcmVhdGVzIHRoaXMuZ3JvdW5kQm9keVxyXG4gICAgICAgIHRoaXMuY3JlYXRlUGxheWVyKCk7IC8vIENyZWF0ZXMgdGhpcy5wbGF5ZXJCb2R5XHJcbiAgICAgICAgdGhpcy5jcmVhdGVQbGFjZWRPYmplY3RzKCk7IC8vIE5FVzogQ3JlYXRlcyBvdGhlciBvYmplY3RzIGluIHRoZSBzY2VuZVxyXG4gICAgICAgIHRoaXMuc2V0dXBMaWdodGluZygpO1xyXG5cclxuICAgICAgICAvLyBBRERFRDogNi4gU2V0dXAgQ2Fubm9uLWVzIGNvbnRhY3QgbGlzdGVuZXJzIGZvciBqdW1wIGxvZ2ljIChhZnRlciBib2RpZXMgYXJlIGNyZWF0ZWQpXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRFdmVudExpc3RlbmVyKCdiZWdpbkNvbnRhY3QnLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgb25lIG9mIHRoZSBib2RpZXMgaXMgdGhlIHBsYXllckJvZHkgYW5kIHRoZSBvdGhlciBpcyB0aGUgZ3JvdW5kQm9keVxyXG4gICAgICAgICAgICAvLyBUaGlzIGxvZ2ljIGFsbG93cyBqdW1waW5nIG9ubHkgZnJvbSB0aGUgZ3JvdW5kLlxyXG4gICAgICAgICAgICBpZiAoKGV2ZW50LmJvZHlBID09PSB0aGlzLnBsYXllckJvZHkgJiYgZXZlbnQuYm9keUIgPT09IHRoaXMuZ3JvdW5kQm9keSkgfHxcclxuICAgICAgICAgICAgICAgIChldmVudC5ib2R5QiA9PT0gdGhpcy5wbGF5ZXJCb2R5ICYmIGV2ZW50LmJvZHlBID09PSB0aGlzLmdyb3VuZEJvZHkpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm51bUdyb3VuZENvbnRhY3RzKys7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRFdmVudExpc3RlbmVyKCdlbmRDb250YWN0JywgKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIG9uZSBvZiB0aGUgYm9kaWVzIGlzIHRoZSBwbGF5ZXJCb2R5IGFuZCB0aGUgb3RoZXIgaXMgdGhlIGdyb3VuZEJvZHlcclxuICAgICAgICAgICAgaWYgKChldmVudC5ib2R5QSA9PT0gdGhpcy5wbGF5ZXJCb2R5ICYmIGV2ZW50LmJvZHlCID09PSB0aGlzLmdyb3VuZEJvZHkpIHx8XHJcbiAgICAgICAgICAgICAgICAoZXZlbnQuYm9keUIgPT09IHRoaXMucGxheWVyQm9keSAmJiBldmVudC5ib2R5QSA9PT0gdGhpcy5ncm91bmRCb2R5KSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5udW1Hcm91bmRDb250YWN0cyA9IE1hdGgubWF4KDAsIHRoaXMubnVtR3JvdW5kQ29udGFjdHMgLSAxKTsgLy8gRW5zdXJlIGl0IGRvZXNuJ3QgZ28gYmVsb3cgMFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIDcuIFNldHVwIGV2ZW50IGxpc3RlbmVycyBmb3IgdXNlciBpbnB1dCBhbmQgd2luZG93IHJlc2l6aW5nXHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHRoaXMub25XaW5kb3dSZXNpemUuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMub25LZXlEb3duLmJpbmQodGhpcykpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5vbktleVVwLmJpbmQodGhpcykpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMub25Nb3VzZU1vdmUuYmluZCh0aGlzKSk7IC8vIEZvciBtb3VzZSBsb29rXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7IC8vIEZvciBwb2ludGVyIGxvY2sgc3RhdHVzXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW96cG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7IC8vIEZpcmVmb3ggY29tcGF0aWJpbGl0eVxyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3dlYmtpdHBvaW50ZXJsb2NrY2hhbmdlJywgdGhpcy5vblBvaW50ZXJMb2NrQ2hhbmdlLmJpbmQodGhpcykpOyAvLyBXZWJraXQgY29tcGF0aWJpbGl0eVxyXG5cclxuICAgICAgICAvLyBBcHBseSBpbml0aWFsIGZpeGVkIGFzcGVjdCByYXRpbyBhbmQgY2VudGVyIHRoZSBjYW52YXNcclxuICAgICAgICB0aGlzLmFwcGx5Rml4ZWRBc3BlY3RSYXRpbygpO1xyXG5cclxuICAgICAgICAvLyA4LiBTZXR1cCB0aGUgdGl0bGUgc2NyZWVuIFVJXHJcbiAgICAgICAgdGhpcy5zZXR1cFRpdGxlU2NyZWVuKCk7XHJcblxyXG4gICAgICAgIC8vIFN0YXJ0IHRoZSBtYWluIGdhbWUgbG9vcFxyXG4gICAgICAgIHRoaXMuYW5pbWF0ZSgwKTsgLy8gUGFzcyBpbml0aWFsIHRpbWUgMFxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTG9hZHMgYWxsIHRleHR1cmVzIGFuZCBzb3VuZHMgZGVmaW5lZCBpbiB0aGUgZ2FtZSBjb25maWd1cmF0aW9uLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKSB7XHJcbiAgICAgICAgY29uc3QgdGV4dHVyZUxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKCk7XHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5pbWFnZXMubWFwKGltZyA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiB0ZXh0dXJlTG9hZGVyLmxvYWRBc3luYyhpbWcucGF0aClcclxuICAgICAgICAgICAgICAgIC50aGVuKHRleHR1cmUgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZXMuc2V0KGltZy5uYW1lLCB0ZXh0dXJlKTtcclxuICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7IC8vIFJlcGVhdCB0ZXh0dXJlIGhvcml6b250YWxseVxyXG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmUud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZzsgLy8gUmVwZWF0IHRleHR1cmUgdmVydGljYWxseVxyXG4gICAgICAgICAgICAgICAgICAgIC8vIEFkanVzdCB0ZXh0dXJlIHJlcGV0aXRpb24gZm9yIHRoZSBncm91bmQgdG8gYXZvaWQgc3RyZXRjaGluZ1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpbWcubmFtZSA9PT0gJ2dyb3VuZF90ZXh0dXJlJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS5yZXBlYXQuc2V0KHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplIC8gNSwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyA1KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gRm9yIGJveCB0ZXh0dXJlcywgZW5zdXJlIHJlcGV0aXRpb24gaWYgZGVzaXJlZCwgb3Igc2V0IHRvIDEsMSBmb3Igc2luZ2xlIGFwcGxpY2F0aW9uXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGltZy5uYW1lLmVuZHNXaXRoKCdfdGV4dHVyZScpKSB7IC8vIEdlbmVyaWMgY2hlY2sgZm9yIG90aGVyIHRleHR1cmVzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZvciBnZW5lcmljIGJveCB0ZXh0dXJlcywgd2UgbWlnaHQgd2FudCB0byByZXBlYXQgYmFzZWQgb24gb2JqZWN0IGRpbWVuc2lvbnNcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yIHNpbXBsaWNpdHkgbm93LCBsZXQncyBrZWVwIGRlZmF1bHQgKG5vIHJlcGVhdCB1bmxlc3MgZXhwbGljaXQgZm9yIGdyb3VuZClcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQSBtb3JlIHJvYnVzdCBzb2x1dGlvbiB3b3VsZCBpbnZvbHZlIHNldHRpbmcgcmVwZWF0IGJhc2VkIG9uIHNjYWxlL2RpbWVuc2lvbnMgZm9yIGVhY2ggb2JqZWN0XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgdGV4dHVyZTogJHtpbWcucGF0aH1gLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQ29udGludWUgZXZlbiBpZiBhbiBhc3NldCBmYWlscyB0byBsb2FkOyBmYWxsYmFja3MgKHNvbGlkIGNvbG9ycykgYXJlIHVzZWQuXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMubWFwKHNvdW5kID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbyhzb3VuZC5wYXRoKTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNvdW5kLnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLmxvb3AgPSAoc291bmQubmFtZSA9PT0gJ2JhY2tncm91bmRfbXVzaWMnKTsgLy8gTG9vcCBiYWNrZ3JvdW5kIG11c2ljXHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc291bmRzLnNldChzb3VuZC5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7c291bmQucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7IC8vIFJlc29sdmUgZXZlbiBvbiBlcnJvciB0byBub3QgYmxvY2sgUHJvbWlzZS5hbGxcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBBc3NldHMgbG9hZGVkOiAke3RoaXMudGV4dHVyZXMuc2l6ZX0gdGV4dHVyZXMsICR7dGhpcy5zb3VuZHMuc2l6ZX0gc291bmRzLmApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhbmQgZGlzcGxheXMgdGhlIHRpdGxlIHNjcmVlbiBVSSBkeW5hbWljYWxseS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzZXR1cFRpdGxlU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5zdHlsZSwge1xyXG4gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJywgLy8gUG9zaXRpb24gcmVsYXRpdmUgdG8gYm9keSwgd2lsbCBiZSBjZW50ZXJlZCBhbmQgc2l6ZWQgYnkgYXBwbHlGaXhlZEFzcGVjdFJhdGlvXHJcbiAgICAgICAgICAgIGJhY2tncm91bmRDb2xvcjogJ3JnYmEoMCwgMCwgMCwgMC44KScsXHJcbiAgICAgICAgICAgIGRpc3BsYXk6ICdmbGV4JywgZmxleERpcmVjdGlvbjogJ2NvbHVtbicsXHJcbiAgICAgICAgICAgIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJywgYWxpZ25JdGVtczogJ2NlbnRlcicsXHJcbiAgICAgICAgICAgIGNvbG9yOiAnd2hpdGUnLCBmb250RmFtaWx5OiAnQXJpYWwsIHNhbnMtc2VyaWYnLFxyXG4gICAgICAgICAgICBmb250U2l6ZTogJzQ4cHgnLCB0ZXh0QWxpZ246ICdjZW50ZXInLCB6SW5kZXg6ICcxMDAwJ1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkpO1xyXG5cclxuICAgICAgICAvLyBDcnVjaWFsOiBDYWxsIGFwcGx5Rml4ZWRBc3BlY3RSYXRpbyBoZXJlIHRvIGVuc3VyZSB0aGUgdGl0bGUgc2NyZWVuIG92ZXJsYXlcclxuICAgICAgICAvLyBpcyBzaXplZCBhbmQgcG9zaXRpb25lZCBjb3JyZWN0bHkgcmVsYXRpdmUgdG8gdGhlIGNhbnZhcyBmcm9tIHRoZSBzdGFydC5cclxuICAgICAgICB0aGlzLmFwcGx5Rml4ZWRBc3BlY3RSYXRpbygpO1xyXG5cclxuICAgICAgICB0aGlzLnRpdGxlVGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIHRoaXMudGl0bGVUZXh0LnRleHRDb250ZW50ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnRpdGxlU2NyZWVuVGV4dDtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hcHBlbmRDaGlsZCh0aGlzLnRpdGxlVGV4dCk7XHJcblxyXG4gICAgICAgIHRoaXMucHJvbXB0VGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIHRoaXMucHJvbXB0VGV4dC50ZXh0Q29udGVudCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5zdGFydEdhbWVQcm9tcHQ7XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnByb21wdFRleHQuc3R5bGUsIHtcclxuICAgICAgICAgICAgbWFyZ2luVG9wOiAnMjBweCcsIGZvbnRTaXplOiAnMjRweCdcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hcHBlbmRDaGlsZCh0aGlzLnByb21wdFRleHQpO1xyXG5cclxuICAgICAgICAvLyBBZGQgZXZlbnQgbGlzdGVuZXIgZGlyZWN0bHkgdG8gdGhlIG92ZXJsYXkgdG8gY2FwdHVyZSBjbGlja3MgYW5kIHN0YXJ0IHRoZSBnYW1lXHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB0aGlzLnN0YXJ0R2FtZSgpKTtcclxuXHJcbiAgICAgICAgLy8gQXR0ZW1wdCB0byBwbGF5IGJhY2tncm91bmQgbXVzaWMuIEl0IG1pZ2h0IGJlIGJsb2NrZWQgYnkgYnJvd3NlcnMgaWYgbm8gdXNlciBnZXN0dXJlIGhhcyBvY2N1cnJlZCB5ZXQuXHJcbiAgICAgICAgdGhpcy5zb3VuZHMuZ2V0KCdiYWNrZ3JvdW5kX211c2ljJyk/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiQkdNIHBsYXkgZGVuaWVkIChyZXF1aXJlcyB1c2VyIGdlc3R1cmUpOlwiLCBlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUcmFuc2l0aW9ucyB0aGUgZ2FtZSBmcm9tIHRoZSB0aXRsZSBzY3JlZW4gdG8gdGhlIHBsYXlpbmcgc3RhdGUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhcnRHYW1lKCkge1xyXG4gICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICAvLyBSZW1vdmUgdGhlIHRpdGxlIHNjcmVlbiBvdmVybGF5XHJcbiAgICAgICAgaWYgKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5ICYmIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LnBhcmVudE5vZGUpIHtcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZCh0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIEFkZCBldmVudCBsaXN0ZW5lciB0byBjYW52YXMgZm9yIHJlLWxvY2tpbmcgcG9pbnRlciBhZnRlciB0aXRsZSBzY3JlZW4gaXMgZ29uZVxyXG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5oYW5kbGVDYW52YXNSZUxvY2tQb2ludGVyLmJpbmQodGhpcykpO1xyXG5cclxuICAgICAgICAvLyBSZXF1ZXN0IHBvaW50ZXIgbG9jayBmb3IgaW1tZXJzaXZlIG1vdXNlIGNvbnRyb2xcclxuICAgICAgICB0aGlzLmNhbnZhcy5yZXF1ZXN0UG9pbnRlckxvY2soKTtcclxuICAgICAgICAvLyBFbnN1cmUgYmFja2dyb3VuZCBtdXNpYyBwbGF5cyBub3cgdGhhdCBhIHVzZXIgZ2VzdHVyZSBoYXMgb2NjdXJyZWRcclxuICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ2JhY2tncm91bmRfbXVzaWMnKT8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJCR00gcGxheSBmYWlsZWQgYWZ0ZXIgdXNlciBnZXN0dXJlOlwiLCBlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGVzIGNsaWNrcyBvbiB0aGUgY2FudmFzIHRvIHJlLWxvY2sgdGhlIHBvaW50ZXIgaWYgdGhlIGdhbWUgaXMgcGxheWluZyBhbmQgdW5sb2NrZWQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlQ2FudmFzUmVMb2NrUG9pbnRlcigpIHtcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgIXRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLnJlcXVlc3RQb2ludGVyTG9jaygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgdGhlIHBsYXllcidzIHZpc3VhbCBtZXNoIGFuZCBwaHlzaWNzIGJvZHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY3JlYXRlUGxheWVyKCkge1xyXG4gICAgICAgIC8vIFBsYXllciB2aXN1YWwgbWVzaCAoYSBzaW1wbGUgYm94KVxyXG4gICAgICAgIGNvbnN0IHBsYXllclRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgncGxheWVyX3RleHR1cmUnKTtcclxuICAgICAgICBjb25zdCBwbGF5ZXJNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgbWFwOiBwbGF5ZXJUZXh0dXJlLFxyXG4gICAgICAgICAgICBjb2xvcjogcGxheWVyVGV4dHVyZSA/IDB4ZmZmZmZmIDogMHgwMDc3ZmYgLy8gVXNlIHdoaXRlIHdpdGggdGV4dHVyZSwgb3IgYmx1ZSBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgcGxheWVyR2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMSwgMiwgMSk7IC8vIFBsYXllciBkaW1lbnNpb25zXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoID0gbmV3IFRIUkVFLk1lc2gocGxheWVyR2VvbWV0cnksIHBsYXllck1hdGVyaWFsKTtcclxuICAgICAgICB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueSA9IDU7IC8vIFN0YXJ0IHBsYXllciBzbGlnaHRseSBhYm92ZSB0aGUgZ3JvdW5kXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLmNhc3RTaGFkb3cgPSB0cnVlOyAvLyBQbGF5ZXIgY2FzdHMgYSBzaGFkb3dcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLnBsYXllck1lc2gpO1xyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgcGh5c2ljcyBib2R5IChDYW5ub24uanMgYm94IHNoYXBlKVxyXG4gICAgICAgIGNvbnN0IHBsYXllclNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKDAuNSwgMSwgMC41KSk7IC8vIEhhbGYgZXh0ZW50cyBvZiB0aGUgYm94IGZvciBjb2xsaXNpb25cclxuICAgICAgICB0aGlzLnBsYXllckJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyTWFzcywgLy8gUGxheWVyJ3MgbWFzc1xyXG4gICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi54LCB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueSwgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLnopLFxyXG4gICAgICAgICAgICBzaGFwZTogcGxheWVyU2hhcGUsXHJcbiAgICAgICAgICAgIGZpeGVkUm90YXRpb246IHRydWUsIC8vIFByZXZlbnQgdGhlIHBsYXllciBmcm9tIGZhbGxpbmcgb3ZlciAoc2ltdWxhdGVzIGEgY2Fwc3VsZS9jeWxpbmRlciBjaGFyYWN0ZXIpXHJcbiAgICAgICAgICAgIG1hdGVyaWFsOiB0aGlzLnBsYXllck1hdGVyaWFsIC8vIEFzc2lnbiB0aGUgcGxheWVyIG1hdGVyaWFsIGZvciBjb250YWN0IHJlc29sdXRpb25cclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkodGhpcy5wbGF5ZXJCb2R5KTtcclxuXHJcbiAgICAgICAgLy8gU2V0IGluaXRpYWwgY2FtZXJhQ29udGFpbmVyIHBvc2l0aW9uIHRvIHBsYXllcidzIHBoeXNpY3MgYm9keSBwb3NpdGlvbi5cclxuICAgICAgICAvLyBUaGUgY2FtZXJhIGl0c2VsZiBpcyBhIGNoaWxkIG9mIGNhbWVyYUNvbnRhaW5lciBhbmQgaGFzIGl0cyBvd24gbG9jYWwgWSBvZmZzZXQuXHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIucG9zaXRpb24uY29weSh0aGlzLnBsYXllckJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgdGhlIGdyb3VuZCdzIHZpc3VhbCBtZXNoIGFuZCBwaHlzaWNzIGJvZHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY3JlYXRlR3JvdW5kKCkge1xyXG4gICAgICAgIC8vIEdyb3VuZCB2aXN1YWwgbWVzaCAoYSBsYXJnZSBwbGFuZSlcclxuICAgICAgICBjb25zdCBncm91bmRUZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQoJ2dyb3VuZF90ZXh0dXJlJyk7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogZ3JvdW5kVGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3I6IGdyb3VuZFRleHR1cmUgPyAweGZmZmZmZiA6IDB4ODg4ODg4IC8vIFVzZSB3aGl0ZSB3aXRoIHRleHR1cmUsIG9yIGdyZXkgaWYgbm8gdGV4dHVyZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZEdlb21ldHJ5ID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplKTtcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2ggPSBuZXcgVEhSRUUuTWVzaChncm91bmRHZW9tZXRyeSwgZ3JvdW5kTWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWVzaC5yb3RhdGlvbi54ID0gLU1hdGguUEkgLyAyOyAvLyBSb3RhdGUgdG8gbGF5IGZsYXQgb24gdGhlIFhaIHBsYW5lXHJcbiAgICAgICAgdGhpcy5ncm91bmRNZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlOyAvLyBHcm91bmQgcmVjZWl2ZXMgc2hhZG93c1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMuZ3JvdW5kTWVzaCk7XHJcblxyXG4gICAgICAgIC8vIEdyb3VuZCBwaHlzaWNzIGJvZHkgKENhbm5vbi5qcyBwbGFuZSBzaGFwZSlcclxuICAgICAgICBjb25zdCBncm91bmRTaGFwZSA9IG5ldyBDQU5OT04uUGxhbmUoKTtcclxuICAgICAgICB0aGlzLmdyb3VuZEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiAwLCAvLyBBIG1hc3Mgb2YgMCBtYWtlcyBpdCBhIHN0YXRpYyAoaW1tb3ZhYmxlKSBib2R5XHJcbiAgICAgICAgICAgIHNoYXBlOiBncm91bmRTaGFwZSxcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMuZ3JvdW5kTWF0ZXJpYWwgLy8gQXNzaWduIHRoZSBncm91bmQgbWF0ZXJpYWwgZm9yIGNvbnRhY3QgcmVzb2x1dGlvblxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIC8vIFJvdGF0ZSB0aGUgQ2Fubm9uLmpzIHBsYW5lIGJvZHkgdG8gbWF0Y2ggdGhlIFRocmVlLmpzIHBsYW5lIG9yaWVudGF0aW9uIChmbGF0KVxyXG4gICAgICAgIHRoaXMuZ3JvdW5kQm9keS5xdWF0ZXJuaW9uLnNldEZyb21BeGlzQW5nbGUobmV3IENBTk5PTi5WZWMzKDEsIDAsIDApLCAtTWF0aC5QSSAvIDIpO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLmdyb3VuZEJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBDcmVhdGVzIHZpc3VhbCBtZXNoZXMgYW5kIHBoeXNpY3MgYm9kaWVzIGZvciBhbGwgb2JqZWN0cyBkZWZpbmVkIGluIGNvbmZpZy5nYW1lU2V0dGluZ3MucGxhY2VkT2JqZWN0cy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVQbGFjZWRPYmplY3RzKCkge1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYWNlZE9iamVjdHMpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiTm8gcGxhY2VkT2JqZWN0cyBkZWZpbmVkIGluIGdhbWVTZXR0aW5ncy5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGFjZWRPYmplY3RzLmZvckVhY2gob2JqQ29uZmlnID0+IHtcclxuICAgICAgICAgICAgY29uc3QgdGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KG9iakNvbmZpZy50ZXh0dXJlTmFtZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IG1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICAgICAgbWFwOiB0ZXh0dXJlLFxyXG4gICAgICAgICAgICAgICAgY29sb3I6IHRleHR1cmUgPyAweGZmZmZmZiA6IDB4YWFhYWFhIC8vIERlZmF1bHQgZ3JleSBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gQ3JlYXRlIFRocmVlLmpzIE1lc2hcclxuICAgICAgICAgICAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkob2JqQ29uZmlnLmRpbWVuc2lvbnMud2lkdGgsIG9iakNvbmZpZy5kaW1lbnNpb25zLmhlaWdodCwgb2JqQ29uZmlnLmRpbWVuc2lvbnMuZGVwdGgpO1xyXG4gICAgICAgICAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcclxuICAgICAgICAgICAgbWVzaC5wb3NpdGlvbi5zZXQob2JqQ29uZmlnLnBvc2l0aW9uLngsIG9iakNvbmZpZy5wb3NpdGlvbi55LCBvYmpDb25maWcucG9zaXRpb24ueik7XHJcbiAgICAgICAgICAgIGlmIChvYmpDb25maWcucm90YXRpb25ZICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIG1lc2gucm90YXRpb24ueSA9IG9iakNvbmZpZy5yb3RhdGlvblk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICAgICAgbWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQobWVzaCk7XHJcbiAgICAgICAgICAgIHRoaXMucGxhY2VkT2JqZWN0TWVzaGVzLnB1c2gobWVzaCk7XHJcblxyXG4gICAgICAgICAgICAvLyBDcmVhdGUgQ2Fubm9uLmpzIEJvZHlcclxuICAgICAgICAgICAgLy8gQ2Fubm9uLkJveCB0YWtlcyBoYWxmIGV4dGVudHNcclxuICAgICAgICAgICAgY29uc3Qgc2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoXHJcbiAgICAgICAgICAgICAgICBvYmpDb25maWcuZGltZW5zaW9ucy53aWR0aCAvIDIsXHJcbiAgICAgICAgICAgICAgICBvYmpDb25maWcuZGltZW5zaW9ucy5oZWlnaHQgLyAyLFxyXG4gICAgICAgICAgICAgICAgb2JqQ29uZmlnLmRpbWVuc2lvbnMuZGVwdGggLyAyXHJcbiAgICAgICAgICAgICkpO1xyXG4gICAgICAgICAgICBjb25zdCBib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgICAgIG1hc3M6IG9iakNvbmZpZy5tYXNzLCAvLyBVc2UgMCBmb3Igc3RhdGljIG9iamVjdHMsID4wIGZvciBkeW5hbWljXHJcbiAgICAgICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKG9iakNvbmZpZy5wb3NpdGlvbi54LCBvYmpDb25maWcucG9zaXRpb24ueSwgb2JqQ29uZmlnLnBvc2l0aW9uLnopLFxyXG4gICAgICAgICAgICAgICAgc2hhcGU6IHNoYXBlLFxyXG4gICAgICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsIC8vIEFEREVEOiBBc3NpZ24gdGhlIGRlZmF1bHQgb2JqZWN0IG1hdGVyaWFsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBpZiAob2JqQ29uZmlnLnJvdGF0aW9uWSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBib2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShuZXcgQ0FOTk9OLlZlYzMoMCwgMSwgMCksIG9iakNvbmZpZy5yb3RhdGlvblkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQuYWRkQm9keShib2R5KTtcclxuICAgICAgICAgICAgdGhpcy5wbGFjZWRPYmplY3RCb2RpZXMucHVzaChib2R5KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgQ3JlYXRlZCAke3RoaXMucGxhY2VkT2JqZWN0TWVzaGVzLmxlbmd0aH0gcGxhY2VkIG9iamVjdHMuYCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHVwIGFtYmllbnQgYW5kIGRpcmVjdGlvbmFsIGxpZ2h0aW5nIGluIHRoZSBzY2VuZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzZXR1cExpZ2h0aW5nKCkge1xyXG4gICAgICAgIGNvbnN0IGFtYmllbnRMaWdodCA9IG5ldyBUSFJFRS5BbWJpZW50TGlnaHQoMHg0MDQwNDAsIDEuMCk7IC8vIFNvZnQgd2hpdGUgYW1iaWVudCBsaWdodFxyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGFtYmllbnRMaWdodCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGRpcmVjdGlvbmFsTGlnaHQgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCgweGZmZmZmZiwgMC44KTsgLy8gQnJpZ2h0ZXIgZGlyZWN0aW9uYWwgbGlnaHRcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnBvc2l0aW9uLnNldCg1LCAxMCwgNSk7IC8vIFBvc2l0aW9uIHRoZSBsaWdodCBzb3VyY2VcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LmNhc3RTaGFkb3cgPSB0cnVlOyAvLyBFbmFibGUgc2hhZG93cyBmcm9tIHRoaXMgbGlnaHQgc291cmNlXHJcbiAgICAgICAgLy8gQ29uZmlndXJlIHNoYWRvdyBwcm9wZXJ0aWVzIGZvciB0aGUgZGlyZWN0aW9uYWwgbGlnaHRcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5tYXBTaXplLndpZHRoID0gMTAyNDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5tYXBTaXplLmhlaWdodCA9IDEwMjQ7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLm5lYXIgPSAwLjU7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmZhciA9IDUwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5sZWZ0ID0gLTEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5yaWdodCA9IDEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS50b3AgPSAxMDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEuYm90dG9tID0gLTEwO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGRpcmVjdGlvbmFsTGlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyB3aW5kb3cgcmVzaXppbmcgdG8ga2VlcCB0aGUgY2FtZXJhIGFzcGVjdCByYXRpbyBhbmQgcmVuZGVyZXIgc2l6ZSBjb3JyZWN0LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uV2luZG93UmVzaXplKCkge1xyXG4gICAgICAgIHRoaXMuYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCk7IC8vIEFwcGx5IHRoZSBmaXhlZCBhc3BlY3QgcmF0aW8gYW5kIGNlbnRlciB0aGUgY2FudmFzXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBcHBsaWVzIHRoZSBjb25maWd1cmVkIGZpeGVkIGFzcGVjdCByYXRpbyB0byB0aGUgcmVuZGVyZXIgYW5kIGNhbWVyYSxcclxuICAgICAqIHJlc2l6aW5nIGFuZCBjZW50ZXJpbmcgdGhlIGNhbnZhcyB0byBmaXQgd2l0aGluIHRoZSB3aW5kb3cuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCkge1xyXG4gICAgICAgIGNvbnN0IHRhcmdldEFzcGVjdFJhdGlvID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZpeGVkQXNwZWN0UmF0aW8ud2lkdGggLyB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby5oZWlnaHQ7XHJcblxyXG4gICAgICAgIGxldCBuZXdXaWR0aDogbnVtYmVyO1xyXG4gICAgICAgIGxldCBuZXdIZWlnaHQ6IG51bWJlcjtcclxuXHJcbiAgICAgICAgY29uc3Qgd2luZG93V2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aDtcclxuICAgICAgICBjb25zdCB3aW5kb3dIZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQ7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFdpbmRvd0FzcGVjdFJhdGlvID0gd2luZG93V2lkdGggLyB3aW5kb3dIZWlnaHQ7XHJcblxyXG4gICAgICAgIGlmIChjdXJyZW50V2luZG93QXNwZWN0UmF0aW8gPiB0YXJnZXRBc3BlY3RSYXRpbykge1xyXG4gICAgICAgICAgICAvLyBXaW5kb3cgaXMgd2lkZXIgdGhhbiB0YXJnZXQgYXNwZWN0IHJhdGlvLCBoZWlnaHQgaXMgdGhlIGxpbWl0aW5nIGZhY3RvclxyXG4gICAgICAgICAgICBuZXdIZWlnaHQgPSB3aW5kb3dIZWlnaHQ7XHJcbiAgICAgICAgICAgIG5ld1dpZHRoID0gbmV3SGVpZ2h0ICogdGFyZ2V0QXNwZWN0UmF0aW87XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gV2luZG93IGlzIHRhbGxlciAob3IgZXhhY3RseSkgdGhlIHRhcmdldCBhc3BlY3QgcmF0aW8sIHdpZHRoIGlzIHRoZSBsaW1pdGluZyBmYWN0b3JcclxuICAgICAgICAgICAgbmV3V2lkdGggPSB3aW5kb3dXaWR0aDtcclxuICAgICAgICAgICAgbmV3SGVpZ2h0ID0gbmV3V2lkdGggLyB0YXJnZXRBc3BlY3RSYXRpbztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNldCByZW5kZXJlciBzaXplLiBUaGUgdGhpcmQgYXJndW1lbnQgYHVwZGF0ZVN0eWxlYCBpcyBmYWxzZSBiZWNhdXNlIHdlIG1hbmFnZSBzdHlsZSBtYW51YWxseS5cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUobmV3V2lkdGgsIG5ld0hlaWdodCwgZmFsc2UpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmFzcGVjdCA9IHRhcmdldEFzcGVjdFJhdGlvO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuXHJcbiAgICAgICAgLy8gUG9zaXRpb24gYW5kIHNpemUgdGhlIGNhbnZhcyBlbGVtZW50IHVzaW5nIENTU1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5jYW52YXMuc3R5bGUsIHtcclxuICAgICAgICAgICAgd2lkdGg6IGAke25ld1dpZHRofXB4YCxcclxuICAgICAgICAgICAgaGVpZ2h0OiBgJHtuZXdIZWlnaHR9cHhgLFxyXG4gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcclxuICAgICAgICAgICAgdG9wOiAnNTAlJyxcclxuICAgICAgICAgICAgbGVmdDogJzUwJScsXHJcbiAgICAgICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLCAtNTAlKScsXHJcbiAgICAgICAgICAgIG9iamVjdEZpdDogJ2NvbnRhaW4nIC8vIEVuc3VyZXMgY29udGVudCBpcyBzY2FsZWQgYXBwcm9wcmlhdGVseSBpZiB0aGVyZSdzIGFueSBtaXNtYXRjaFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGUgdGl0bGUgc2NyZWVuIGlzIGFjdGl2ZSwgdXBkYXRlIGl0cyBzaXplIGFuZCBwb3NpdGlvbiBhcyB3ZWxsIHRvIG1hdGNoIHRoZSBjYW52YXNcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFICYmIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KSB7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuc3R5bGUsIHtcclxuICAgICAgICAgICAgICAgIHdpZHRoOiBgJHtuZXdXaWR0aH1weGAsXHJcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGAke25ld0hlaWdodH1weGAsXHJcbiAgICAgICAgICAgICAgICB0b3A6ICc1MCUnLFxyXG4gICAgICAgICAgICAgICAgbGVmdDogJzUwJScsXHJcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknLFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWNvcmRzIHdoaWNoIGtleXMgYXJlIGN1cnJlbnRseSBwcmVzc2VkIGRvd24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25LZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmtleS50b0xvd2VyQ2FzZSgpXSA9IHRydWU7XHJcbiAgICAgICAgLy8gQURERUQ6IEhhbmRsZSBqdW1wIGlucHV0IG9ubHkgd2hlbiBwbGF5aW5nIGFuZCBwb2ludGVyIGlzIGxvY2tlZFxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiB0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICBpZiAoZXZlbnQua2V5LnRvTG93ZXJDYXNlKCkgPT09ICcgJykgeyAvLyBTcGFjZWJhclxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJKdW1wKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWNvcmRzIHdoaWNoIGtleXMgYXJlIGN1cnJlbnRseSByZWxlYXNlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbktleVVwKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmtleS50b0xvd2VyQ2FzZSgpXSA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyBtb3VzZSBtb3ZlbWVudCBmb3IgY2FtZXJhIHJvdGF0aW9uIChtb3VzZSBsb29rKS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbk1vdXNlTW92ZShldmVudDogTW91c2VFdmVudCkge1xyXG4gICAgICAgIC8vIE9ubHkgcHJvY2VzcyBtb3VzZSBtb3ZlbWVudCBpZiB0aGUgZ2FtZSBpcyBwbGF5aW5nIGFuZCBwb2ludGVyIGlzIGxvY2tlZFxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiB0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICBjb25zdCBtb3ZlbWVudFggPSBldmVudC5tb3ZlbWVudFggfHwgMDtcclxuICAgICAgICAgICAgY29uc3QgbW92ZW1lbnRZID0gZXZlbnQubW92ZW1lbnRZIHx8IDA7XHJcblxyXG4gICAgICAgICAgICAvLyBBcHBseSBob3Jpem9udGFsIHJvdGF0aW9uICh5YXcpIHRvIHRoZSBjYW1lcmFDb250YWluZXIgYXJvdW5kIGl0cyBsb2NhbCBZLWF4aXMgKHdoaWNoIGlzIGdsb2JhbCBZKVxyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5yb3RhdGlvbi55IC09IG1vdmVtZW50WCAqIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5tb3VzZVNlbnNpdGl2aXR5O1xyXG5cclxuICAgICAgICAgICAgLy8gQXBwbHkgdmVydGljYWwgcm90YXRpb24gKHBpdGNoKSB0byB0aGUgY2FtZXJhIGl0c2VsZiBhbmQgY2xhbXAgaXRcclxuICAgICAgICAgICAgLy8gTW91c2UgVVAgKG1vdmVtZW50WSA8IDApIG5vdyBpbmNyZWFzZXMgY2FtZXJhUGl0Y2ggLT4gbG9va3MgdXAuXHJcbiAgICAgICAgICAgIC8vIE1vdXNlIERPV04gKG1vdmVtZW50WSA+IDApIG5vdyBkZWNyZWFzZXMgY2FtZXJhUGl0Y2ggLT4gbG9va3MgZG93bi5cclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFQaXRjaCAtPSBtb3ZlbWVudFkgKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubW91c2VTZW5zaXRpdml0eTsgXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUGl0Y2ggPSBNYXRoLm1heCgtTWF0aC5QSSAvIDIsIE1hdGgubWluKE1hdGguUEkgLyAyLCB0aGlzLmNhbWVyYVBpdGNoKSk7IC8vIENsYW1wIHRvIC05MCB0byArOTAgZGVncmVlc1xyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5yb3RhdGlvbi54ID0gdGhpcy5jYW1lcmFQaXRjaDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVcGRhdGVzIHRoZSBwb2ludGVyIGxvY2sgc3RhdHVzIHdoZW4gaXQgY2hhbmdlcyAoZS5nLiwgdXNlciBwcmVzc2VzIEVzYykuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25Qb2ludGVyTG9ja0NoYW5nZSgpIHtcclxuICAgICAgICBpZiAoZG9jdW1lbnQucG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLmNhbnZhcyB8fFxyXG4gICAgICAgICAgICAoZG9jdW1lbnQgYXMgYW55KS5tb3pQb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMuY2FudmFzIHx8XHJcbiAgICAgICAgICAgIChkb2N1bWVudCBhcyBhbnkpLndlYmtpdFBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgdGhpcy5pc1BvaW50ZXJMb2NrZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUG9pbnRlciBsb2NrZWQnKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmlzUG9pbnRlckxvY2tlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUG9pbnRlciB1bmxvY2tlZCcpO1xyXG4gICAgICAgICAgICAvLyBXaGVuIHBvaW50ZXIgaXMgdW5sb2NrZWQgYnkgdXNlciAoZS5nLiwgcHJlc3NpbmcgRXNjKSwgY3Vyc29yIGFwcGVhcnMgYXV0b21hdGljYWxseS5cclxuICAgICAgICAgICAgLy8gTW91c2UgbG9vayBzdG9wcyBkdWUgdG8gYGlzUG9pbnRlckxvY2tlZGAgY2hlY2sgaW4gb25Nb3VzZU1vdmUuXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVGhlIG1haW4gZ2FtZSBsb29wLCBjYWxsZWQgb24gZXZlcnkgYW5pbWF0aW9uIGZyYW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFuaW1hdGUodGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCkge1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGUuYmluZCh0aGlzKSk7IC8vIFJlcXVlc3QgbmV4dCBmcmFtZVxyXG5cclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAodGltZSAtIHRoaXMubGFzdFRpbWUpIC8gMTAwMDsgLy8gQ2FsY3VsYXRlIGRlbHRhIHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSB0aW1lO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQbGF5ZXJNb3ZlbWVudCgpOyAvLyBVcGRhdGUgcGxheWVyJ3MgdmVsb2NpdHkgYmFzZWQgb24gaW5wdXRcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQaHlzaWNzKGRlbHRhVGltZSk7IC8vIFN0ZXAgdGhlIHBoeXNpY3Mgd29ybGRcclxuICAgICAgICAgICAgdGhpcy5jbGFtcFBsYXllclBvc2l0aW9uKCk7IC8vIENsYW1wIHBsYXllciBwb3NpdGlvbiB0byBwcmV2ZW50IGdvaW5nIGJleW9uZCBncm91bmQgZWRnZXNcclxuICAgICAgICAgICAgdGhpcy5zeW5jTWVzaGVzV2l0aEJvZGllcygpOyAvLyBTeW5jaHJvbml6ZSB2aXN1YWwgbWVzaGVzIHdpdGggcGh5c2ljcyBib2RpZXNcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhKTsgLy8gUmVuZGVyIHRoZSBzY2VuZVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3RlcHMgdGhlIENhbm5vbi5qcyBwaHlzaWNzIHdvcmxkIGZvcndhcmQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlUGh5c2ljcyhkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIC8vIHdvcmxkLnN0ZXAoZml4ZWRUaW1lU3RlcCwgZGVsdGFUaW1lLCBtYXhTdWJTdGVwcylcclxuICAgICAgICAvLyAxLzYwOiBBIGZpeGVkIHRpbWUgc3RlcCBvZiA2MCBwaHlzaWNzIHVwZGF0ZXMgcGVyIHNlY29uZCAoc3RhbmRhcmQpLlxyXG4gICAgICAgIC8vIGRlbHRhVGltZTogVGhlIGFjdHVhbCB0aW1lIGVsYXBzZWQgc2luY2UgdGhlIGxhc3QgcmVuZGVyIGZyYW1lLlxyXG4gICAgICAgIC8vIG1heFBoeXNpY3NTdWJTdGVwczogTGltaXRzIHRoZSBudW1iZXIgb2YgcGh5c2ljcyBzdGVwcyBpbiBvbmUgcmVuZGVyIGZyYW1lXHJcbiAgICAgICAgLy8gdG8gcHJldmVudCBpbnN0YWJpbGl0aWVzIGlmIHJlbmRlcmluZyBzbG93cyBkb3duIHNpZ25pZmljYW50bHkuXHJcbiAgICAgICAgdGhpcy53b3JsZC5zdGVwKDEgLyA2MCwgZGVsdGFUaW1lLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubWF4UGh5c2ljc1N1YlN0ZXBzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgdGhlIHBsYXllcidzIHZlbG9jaXR5IGJhc2VkIG9uIFdBU0QgaW5wdXQgYW5kIGNhbWVyYSBvcmllbnRhdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVQbGF5ZXJNb3ZlbWVudCgpIHtcclxuICAgICAgICAvLyBQbGF5ZXIgbW92ZW1lbnQgc2hvdWxkIG9ubHkgaGFwcGVuIHdoZW4gdGhlIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICAgICAgaWYgKCF0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICAvLyBJZiBwb2ludGVyIGlzIG5vdCBsb2NrZWQsIHN0b3AgaG9yaXpvbnRhbCBtb3ZlbWVudCBpbW1lZGlhdGVseVxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBFeGl0IGVhcmx5IGFzIG5vIG1vdmVtZW50IGlucHV0IHNob3VsZCBiZSBwcm9jZXNzZWRcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBlZmZlY3RpdmVQbGF5ZXJTcGVlZCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJTcGVlZDtcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgYWlyIGNvbnRyb2wgZmFjdG9yIGlmIHBsYXllciBpcyBpbiB0aGUgYWlyXHJcbiAgICAgICAgaWYgKHRoaXMubnVtR3JvdW5kQ29udGFjdHMgPT09IDApIHtcclxuICAgICAgICAgICAgZWZmZWN0aXZlUGxheWVyU3BlZWQgKj0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckFpckNvbnRyb2xGYWN0b3I7IC8vIFVzZSBjb25maWd1cmFibGUgYWlyIGNvbnRyb2wgZmFjdG9yXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRZVmVsb2NpdHkgPSB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueTsgLy8gUHJlc2VydmUgdmVydGljYWwgdmVsb2NpdHlcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBtb3ZlRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMCwgMCk7IC8vIFVzZSBhIFRIUkVFLlZlY3RvcjMgZm9yIGNhbGN1bGF0aW9uIGVhc2VcclxuXHJcbiAgICAgICAgLy8gR2V0IGNhbWVyYUNvbnRhaW5lcidzIGZvcndhcmQgdmVjdG9yIChob3Jpem9udGFsIGRpcmVjdGlvbiBwbGF5ZXIgaXMgbG9va2luZylcclxuICAgICAgICBjb25zdCBjYW1lcmFEaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLmdldFdvcmxkRGlyZWN0aW9uKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgY2FtZXJhRGlyZWN0aW9uLnkgPSAwOyAvLyBGbGF0dGVuIHRoZSB2ZWN0b3IgdG8gcmVzdHJpY3QgbW92ZW1lbnQgdG8gdGhlIGhvcml6b250YWwgcGxhbmVcclxuICAgICAgICBjYW1lcmFEaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGdsb2JhbFVwID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMSwgMCk7IC8vIERlZmluZSBnbG9iYWwgdXAgdmVjdG9yIGZvciBjcm9zcyBwcm9kdWN0XHJcblxyXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgJ3JpZ2h0JyB2ZWN0b3IgcmVsYXRpdmUgdG8gY2FtZXJhJ3MgZm9yd2FyZCBkaXJlY3Rpb25cclxuICAgICAgICBjb25zdCBjYW1lcmFSaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgY2FtZXJhUmlnaHQuY3Jvc3NWZWN0b3JzKGdsb2JhbFVwLCBjYW1lcmFEaXJlY3Rpb24pLm5vcm1hbGl6ZSgpOyBcclxuXHJcbiAgICAgICAgbGV0IG1vdmluZyA9IGZhbHNlO1xyXG4gICAgICAgIC8vIFcgPC0+IFMgc3dhcCBmcm9tIHVzZXIncyBjb21tZW50cyBpbiBvcmlnaW5hbCBjb2RlOlxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ3MnXSkgeyAvLyAncycga2V5IG5vdyBtb3ZlcyBmb3J3YXJkXHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24uYWRkKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ3cnXSkgeyAvLyAndycga2V5IG5vdyBtb3ZlcyBiYWNrd2FyZFxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLnN1YihjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBBIGFuZCBEIGNvbnRyb2xzIGFzIHN0YW5kYXJkOlxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ2EnXSkgeyAvLyAnYScga2V5IG5vdyBzdHJhZmVzIGxlZnRcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5zdWIoY2FtZXJhUmlnaHQpOyBcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1snZCddKSB7IC8vICdkJyBrZXkgbm93IHN0cmFmZXMgcmlnaHRcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5hZGQoY2FtZXJhUmlnaHQpOyBcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChtb3ZpbmcpIHtcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5ub3JtYWxpemUoKS5tdWx0aXBseVNjYWxhcihlZmZlY3RpdmVQbGF5ZXJTcGVlZCk7XHJcbiAgICAgICAgICAgIC8vIERpcmVjdGx5IHNldCB0aGUgaG9yaXpvbnRhbCB2ZWxvY2l0eSBjb21wb25lbnRzLlxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IG1vdmVEaXJlY3Rpb24ueDtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSBtb3ZlRGlyZWN0aW9uLno7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gSWYgbm8gbW92ZW1lbnQga2V5cyBhcmUgcHJlc3NlZDpcclxuICAgICAgICAgICAgaWYgKHRoaXMubnVtR3JvdW5kQ29udGFjdHMgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIC8vIFBsYXllciBpcyBpbiB0aGUgYWlyOiBhcHBseSBjb25maWd1cmFibGUgYWlyIGRlY2VsZXJhdGlvblxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggKj0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckFpckRlY2VsZXJhdGlvbjtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ICo9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJBaXJEZWNlbGVyYXRpb247XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBQbGF5ZXIgaXMgb24gdGhlIGdyb3VuZDogQ2Fubm9uLmpzIENvbnRhY3RNYXRlcmlhbCBmcmljdGlvbiB3aWxsIGhhbmRsZSBkZWNlbGVyYXRpb24uXHJcbiAgICAgICAgICAgICAgICAvLyBObyBleHBsaWNpdCB2ZWxvY2l0eSBkZWNheSBpcyBhcHBsaWVkIGhlcmUgZm9yIGdyb3VuZCBtb3ZlbWVudC5cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueSA9IGN1cnJlbnRZVmVsb2NpdHk7IC8vIFJlc3RvcmUgWSB2ZWxvY2l0eSAoZ3Jhdml0eS9qdW1wcylcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFEREVEOiBBcHBsaWVzIGFuIHVwd2FyZCBpbXB1bHNlIHRvIHRoZSBwbGF5ZXIgYm9keSBmb3IganVtcGluZy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBwbGF5ZXJKdW1wKCkge1xyXG4gICAgICAgIC8vIE9ubHkgYWxsb3cganVtcCBpZiB0aGUgcGxheWVyIGlzIGN1cnJlbnRseSBvbiB0aGUgZ3JvdW5kIChoYXMgYWN0aXZlIGNvbnRhY3RzKVxyXG4gICAgICAgIGlmICh0aGlzLm51bUdyb3VuZENvbnRhY3RzID4gMCkge1xyXG4gICAgICAgICAgICAvLyBDbGVhciBhbnkgZXhpc3RpbmcgdmVydGljYWwgdmVsb2NpdHkgdG8gZW5zdXJlIGEgY29uc2lzdGVudCBqdW1wIGhlaWdodFxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueSA9IDA7IFxyXG4gICAgICAgICAgICAvLyBBcHBseSBhbiB1cHdhcmQgaW1wdWxzZSAobWFzcyAqIGNoYW5nZV9pbl92ZWxvY2l0eSlcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LmFwcGx5SW1wdWxzZShcclxuICAgICAgICAgICAgICAgIG5ldyBDQU5OT04uVmVjMygwLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuanVtcEZvcmNlLCAwKSxcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiAvLyBBcHBseSBpbXB1bHNlIGF0IHRoZSBjZW50ZXIgb2YgbWFzc1xyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENsYW1wcyB0aGUgcGxheWVyJ3MgcG9zaXRpb24gd2l0aGluIHRoZSBkZWZpbmVkIGdyb3VuZCBib3VuZGFyaWVzLlxyXG4gICAgICogUHJldmVudHMgdGhlIHBsYXllciBmcm9tIG1vdmluZyBiZXlvbmQgdGhlICdlbmQgb2YgdGhlIHdvcmxkJy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjbGFtcFBsYXllclBvc2l0aW9uKCkge1xyXG4gICAgICAgIGlmICghdGhpcy5wbGF5ZXJCb2R5IHx8ICF0aGlzLmNvbmZpZykge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBoYWxmR3JvdW5kU2l6ZSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplIC8gMjtcclxuXHJcbiAgICAgICAgbGV0IHBvc1ggPSB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueDtcclxuICAgICAgICBsZXQgcG9zWiA9IHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi56O1xyXG4gICAgICAgIGxldCB2ZWxYID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5Lng7XHJcbiAgICAgICAgbGV0IHZlbFogPSB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkuejtcclxuXHJcbiAgICAgICAgLy8gQ2xhbXAgWCBwb3NpdGlvblxyXG4gICAgICAgIGlmIChwb3NYID4gaGFsZkdyb3VuZFNpemUpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnggPSBoYWxmR3JvdW5kU2l6ZTtcclxuICAgICAgICAgICAgaWYgKHZlbFggPiAwKSB7IC8vIElmIG1vdmluZyBvdXR3YXJkcywgc3RvcCBob3Jpem9udGFsIHZlbG9jaXR5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHBvc1ggPCAtaGFsZkdyb3VuZFNpemUpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnggPSAtaGFsZkdyb3VuZFNpemU7XHJcbiAgICAgICAgICAgIGlmICh2ZWxYIDwgMCkgeyAvLyBJZiBtb3Zpbmcgb3V0d2FyZHMsIHN0b3AgaG9yaXpvbnRhbCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDbGFtcCBaIHBvc2l0aW9uXHJcbiAgICAgICAgaWYgKHBvc1ogPiBoYWxmR3JvdW5kU2l6ZSkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueiA9IGhhbGZHcm91bmRTaXplO1xyXG4gICAgICAgICAgICBpZiAodmVsWiA+IDApIHsgLy8gSWYgbW92aW5nIG91dHdhcmRzLCBzdG9wIGhvcml6b250YWwgdmVsb2NpdHlcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAocG9zWiA8IC1oYWxmR3JvdW5kU2l6ZSkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueiA9IC1oYWxmR3JvdW5kU2l6ZTtcclxuICAgICAgICAgICAgaWYgKHZlbFogPCAwKSB7IC8vIElmIG1vdmluZyBvdXR3YXJkcywgc3RvcCBob3Jpem9udGFsIHZlbG9jaXR5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTeW5jaHJvbml6ZXMgdGhlIHZpc3VhbCBtZXNoZXMgd2l0aCB0aGVpciBjb3JyZXNwb25kaW5nIHBoeXNpY3MgYm9kaWVzLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN5bmNNZXNoZXNXaXRoQm9kaWVzKCkge1xyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIHBsYXllcidzIHZpc3VhbCBtZXNoIHBvc2l0aW9uIHdpdGggaXRzIHBoeXNpY3MgYm9keSdzIHBvc2l0aW9uXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU3luY2hyb25pemUgY2FtZXJhQ29udGFpbmVyIHBvc2l0aW9uIHdpdGggdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keSdzIHBvc2l0aW9uLlxyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcblxyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIHBsYXllcidzIHZpc3VhbCBtZXNoIGhvcml6b250YWwgcm90YXRpb24gKHlhdykgd2l0aCBjYW1lcmFDb250YWluZXIncyB5YXcuXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLnF1YXRlcm5pb24uY29weSh0aGlzLmNhbWVyYUNvbnRhaW5lci5xdWF0ZXJuaW9uKTtcclxuXHJcbiAgICAgICAgLy8gVGhlIGdyb3VuZCBhbmQgcGxhY2VkIG9iamVjdHMgYXJlIGN1cnJlbnRseSBzdGF0aWMgKG1hc3MgMCksIHNvIHRoZWlyIHZpc3VhbCBtZXNoZXNcclxuICAgICAgICAvLyBkbyBub3QgbmVlZCB0byBiZSBzeW5jaHJvbml6ZWQgd2l0aCB0aGVpciBwaHlzaWNzIGJvZGllcyBhZnRlciBpbml0aWFsIHBsYWNlbWVudC5cclxuICAgIH1cclxufVxyXG5cclxuLy8gU3RhcnQgdGhlIGdhbWUgd2hlbiB0aGUgRE9NIGNvbnRlbnQgaXMgZnVsbHkgbG9hZGVkXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICBuZXcgR2FtZSgpO1xyXG59KTsiXSwKICAibWFwcGluZ3MiOiAiQUFBQSxZQUFZLFdBQVc7QUFDdkIsWUFBWSxZQUFZO0FBR3hCLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFGQyxTQUFBQTtBQUFBLEdBQUE7QUErQ0wsTUFBTSxLQUFLO0FBQUEsRUFrRFAsY0FBYztBQWhEZDtBQUFBLFNBQVEsUUFBbUI7QUF5QjNCO0FBQUEsU0FBUSxxQkFB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
