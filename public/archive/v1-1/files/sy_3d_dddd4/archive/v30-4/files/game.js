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
        friction: 0,
        // No friction between player and ground
        restitution: 0.1
        // A little bounce
      }
    );
    this.world.addContactMaterial(playerGroundContactMaterial);
    const playerObjectContactMaterial = new CANNON.ContactMaterial(
      this.playerMaterial,
      this.defaultObjectMaterial,
      {
        friction: 0,
        // No friction between player and other objects
        restitution: 0.1
        // A little bounce
      }
    );
    this.world.addContactMaterial(playerObjectContactMaterial);
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
      // Assign the player's material
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
      // Assign the ground's material
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
        // Assign default object material
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuXHJcbi8vIEVudW0gdG8gZGVmaW5lIHRoZSBwb3NzaWJsZSBzdGF0ZXMgb2YgdGhlIGdhbWVcclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgVElUTEUsICAgLy8gVGl0bGUgc2NyZWVuLCB3YWl0aW5nIGZvciB1c2VyIGlucHV0XHJcbiAgICBQTEFZSU5HICAvLyBHYW1lIGlzIGFjdGl2ZSwgdXNlciBjYW4gbW92ZSBhbmQgbG9vayBhcm91bmRcclxufVxyXG5cclxuLy8gSW50ZXJmYWNlIGZvciBvYmplY3RzIHBsYWNlZCBpbiB0aGUgc2NlbmVcclxuaW50ZXJmYWNlIFBsYWNlZE9iamVjdENvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7IC8vIEEgZGVzY3JpcHRpdmUgbmFtZSBmb3IgdGhlIG9iamVjdCBpbnN0YW5jZVxyXG4gICAgdGV4dHVyZU5hbWU6IHN0cmluZzsgLy8gTmFtZSBvZiB0aGUgdGV4dHVyZSBmcm9tIGFzc2V0cy5pbWFnZXNcclxuICAgIHR5cGU6ICdib3gnOyAvLyBDdXJyZW50bHkgb25seSBzdXBwb3J0cyAnYm94J1xyXG4gICAgcG9zaXRpb246IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xyXG4gICAgZGltZW5zaW9uczogeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgZGVwdGg6IG51bWJlciB9O1xyXG4gICAgcm90YXRpb25ZPzogbnVtYmVyOyAvLyBPcHRpb25hbCByb3RhdGlvbiBhcm91bmQgWS1heGlzIChyYWRpYW5zKVxyXG4gICAgbWFzczogbnVtYmVyOyAvLyAwIGZvciBzdGF0aWMsID4wIGZvciBkeW5hbWljICh0aG91Z2ggYWxsIHBsYWNlZCBvYmplY3RzIGhlcmUgd2lsbCBiZSBzdGF0aWMpXHJcbn1cclxuXHJcbi8vIEludGVyZmFjZSB0byB0eXBlLWNoZWNrIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHN0YXJ0R2FtZVByb21wdDogc3RyaW5nO1xyXG4gICAgICAgIHBsYXllclNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgbW91c2VTZW5zaXRpdml0eTogbnVtYmVyO1xyXG4gICAgICAgIGNhbWVyYUhlaWdodE9mZnNldDogbnVtYmVyOyAvLyBWZXJ0aWNhbCBvZmZzZXQgb2YgdGhlIGNhbWVyYSBmcm9tIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkgY2VudGVyXHJcbiAgICAgICAgY2FtZXJhTmVhcjogbnVtYmVyOyAgICAgICAgIC8vIE5lYXIgY2xpcHBpbmcgcGxhbmUgZm9yIHRoZSBjYW1lcmFcclxuICAgICAgICBjYW1lcmFGYXI6IG51bWJlcjsgICAgICAgICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lIGZvciB0aGUgY2FtZXJhXHJcbiAgICAgICAgcGxheWVyTWFzczogbnVtYmVyOyAgICAgICAgIC8vIE1hc3Mgb2YgdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keVxyXG4gICAgICAgIGdyb3VuZFNpemU6IG51bWJlcjsgICAgICAgICAvLyBTaXplICh3aWR0aC9kZXB0aCkgb2YgdGhlIHNxdWFyZSBncm91bmQgcGxhbmVcclxuICAgICAgICBtYXhQaHlzaWNzU3ViU3RlcHM6IG51bWJlcjsgLy8gTWF4aW11bSBudW1iZXIgb2YgcGh5c2ljcyBzdWJzdGVwcyBwZXIgZnJhbWUgdG8gbWFpbnRhaW4gc3RhYmlsaXR5XHJcbiAgICAgICAgZml4ZWRBc3BlY3RSYXRpbzogeyB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciB9OyAvLyBOZXc6IEZpeGVkIGFzcGVjdCByYXRpbyBmb3IgdGhlIGdhbWUgKHdpZHRoIC8gaGVpZ2h0KVxyXG4gICAgICAgIGp1bXBGb3JjZTogbnVtYmVyOyAgICAgICAgICAvLyBBRERFRDogRm9yY2UgYXBwbGllZCB3aGVuIGp1bXBpbmdcclxuICAgICAgICBwbGFjZWRPYmplY3RzOiBQbGFjZWRPYmplY3RDb25maWdbXTsgLy8gTkVXOiBBcnJheSBvZiBvYmplY3RzIHRvIHBsYWNlIGluIHRoZSB3b3JsZFxyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfVtdO1xyXG4gICAgICAgIHNvdW5kczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyOyB2b2x1bWU6IG51bWJlciB9W107XHJcbiAgICB9O1xyXG59XHJcblxyXG4vKipcclxuICogTWFpbiBHYW1lIGNsYXNzIHJlc3BvbnNpYmxlIGZvciBpbml0aWFsaXppbmcgYW5kIHJ1bm5pbmcgdGhlIDNEIGdhbWUuXHJcbiAqIEl0IGhhbmRsZXMgVGhyZWUuanMgcmVuZGVyaW5nLCBDYW5ub24tZXMgcGh5c2ljcywgaW5wdXQsIGFuZCBnYW1lIHN0YXRlLlxyXG4gKi9cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNvbmZpZyE6IEdhbWVDb25maWc7IC8vIEdhbWUgY29uZmlndXJhdGlvbiBsb2FkZWQgZnJvbSBkYXRhLmpzb25cclxuICAgIHByaXZhdGUgc3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTsgLy8gQ3VycmVudCBzdGF0ZSBvZiB0aGUgZ2FtZVxyXG5cclxuICAgIC8vIFRocmVlLmpzIGVsZW1lbnRzIGZvciByZW5kZXJpbmdcclxuICAgIHByaXZhdGUgc2NlbmUhOiBUSFJFRS5TY2VuZTtcclxuICAgIHByaXZhdGUgY2FtZXJhITogVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmE7XHJcbiAgICBwcml2YXRlIHJlbmRlcmVyITogVEhSRUUuV2ViR0xSZW5kZXJlcjtcclxuICAgIHByaXZhdGUgY2FudmFzITogSFRNTENhbnZhc0VsZW1lbnQ7IC8vIFRoZSBIVE1MIGNhbnZhcyBlbGVtZW50IGZvciByZW5kZXJpbmdcclxuXHJcbiAgICAvLyBOZXc6IEEgY29udGFpbmVyIG9iamVjdCBmb3IgdGhlIGNhbWVyYSB0byBoYW5kbGUgaG9yaXpvbnRhbCByb3RhdGlvbiBzZXBhcmF0ZWx5IGZyb20gdmVydGljYWwgcGl0Y2guXHJcbiAgICBwcml2YXRlIGNhbWVyYUNvbnRhaW5lciE6IFRIUkVFLk9iamVjdDNEOyBcclxuXHJcbiAgICAvLyBDYW5ub24tZXMgZWxlbWVudHMgZm9yIHBoeXNpY3NcclxuICAgIHByaXZhdGUgd29ybGQhOiBDQU5OT04uV29ybGQ7XHJcbiAgICBwcml2YXRlIHBsYXllckJvZHkhOiBDQU5OT04uQm9keTsgLy8gUGh5c2ljcyBib2R5IGZvciB0aGUgcGxheWVyXHJcbiAgICBwcml2YXRlIGdyb3VuZEJvZHkhOiBDQU5OT04uQm9keTsgLy8gUGh5c2ljcyBib2R5IGZvciB0aGUgZ3JvdW5kXHJcblxyXG4gICAgLy8gQURERUQ6IENhbm5vbi5qcyBtYXRlcmlhbHMgZm9yIGZyaWN0aW9uIGNvbnRyb2xcclxuICAgIHByaXZhdGUgcGxheWVyTWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7XHJcbiAgICBwcml2YXRlIGdyb3VuZE1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsO1xyXG4gICAgcHJpdmF0ZSBkZWZhdWx0T2JqZWN0TWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7IC8vIEZvciBwbGFjZWQgb2JqZWN0c1xyXG5cclxuICAgIC8vIFZpc3VhbCBtZXNoZXMgKFRocmVlLmpzKSBmb3IgZ2FtZSBvYmplY3RzXHJcbiAgICBwcml2YXRlIHBsYXllck1lc2ghOiBUSFJFRS5NZXNoO1xyXG4gICAgcHJpdmF0ZSBncm91bmRNZXNoITogVEhSRUUuTWVzaDtcclxuICAgIC8vIE5FVzogQXJyYXlzIHRvIGhvbGQgcmVmZXJlbmNlcyB0byBkeW5hbWljYWxseSBwbGFjZWQgb2JqZWN0c1xyXG4gICAgcHJpdmF0ZSBwbGFjZWRPYmplY3RNZXNoZXM6IFRIUkVFLk1lc2hbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBwbGFjZWRPYmplY3RCb2RpZXM6IENBTk5PTi5Cb2R5W10gPSBbXTtcclxuXHJcbiAgICAvLyBJbnB1dCBoYW5kbGluZyBzdGF0ZVxyXG4gICAgcHJpdmF0ZSBrZXlzOiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfSA9IHt9OyAvLyBUcmFja3MgY3VycmVudGx5IHByZXNzZWQga2V5c1xyXG4gICAgcHJpdmF0ZSBpc1BvaW50ZXJMb2NrZWQ6IGJvb2xlYW4gPSBmYWxzZTsgLy8gVHJ1ZSBpZiBtb3VzZSBwb2ludGVyIGlzIGxvY2tlZFxyXG4gICAgcHJpdmF0ZSBjYW1lcmFQaXRjaDogbnVtYmVyID0gMDsgLy8gVmVydGljYWwgcm90YXRpb24gKHBpdGNoKSBvZiB0aGUgY2FtZXJhXHJcblxyXG4gICAgLy8gQXNzZXQgbWFuYWdlbWVudFxyXG4gICAgcHJpdmF0ZSB0ZXh0dXJlczogTWFwPHN0cmluZywgVEhSRUUuVGV4dHVyZT4gPSBuZXcgTWFwKCk7IC8vIFN0b3JlcyBsb2FkZWQgdGV4dHVyZXNcclxuICAgIHByaXZhdGUgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTsgLy8gU3RvcmVzIGxvYWRlZCBhdWRpbyBlbGVtZW50c1xyXG5cclxuICAgIC8vIFVJIGVsZW1lbnRzIChkeW5hbWljYWxseSBjcmVhdGVkIGZvciB0aGUgdGl0bGUgc2NyZWVuKVxyXG4gICAgcHJpdmF0ZSB0aXRsZVNjcmVlbk92ZXJsYXkhOiBIVE1MRGl2RWxlbWVudDtcclxuICAgIHByaXZhdGUgdGl0bGVUZXh0ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHByb21wdFRleHQhOiBIVE1MRGl2RWxlbWVudDtcclxuXHJcbiAgICAvLyBGb3IgY2FsY3VsYXRpbmcgZGVsdGEgdGltZSBiZXR3ZWVuIGZyYW1lc1xyXG4gICAgcHJpdmF0ZSBsYXN0VGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCA9IDA7XHJcblxyXG4gICAgLy8gQURERUQ6IFRyYWNrcyBwbGF5ZXItZ3JvdW5kIGNvbnRhY3RzIGZvciBqdW1waW5nIGxvZ2ljXHJcbiAgICBwcml2YXRlIG51bUdyb3VuZENvbnRhY3RzOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgICAgIC8vIEdldCB0aGUgY2FudmFzIGVsZW1lbnQgZnJvbSBpbmRleC5odG1sXHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZUNhbnZhcycpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCBcImdhbWVDYW52YXNcIiBub3QgZm91bmQhJyk7XHJcbiAgICAgICAgICAgIHJldHVybjsgLy8gQ2Fubm90IHByb2NlZWQgd2l0aG91dCBhIGNhbnZhc1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmluaXQoKTsgLy8gU3RhcnQgdGhlIGFzeW5jaHJvbm91cyBpbml0aWFsaXphdGlvbiBwcm9jZXNzXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBc3luY2hyb25vdXNseSBpbml0aWFsaXplcyB0aGUgZ2FtZSwgbG9hZGluZyBjb25maWcsIGFzc2V0cywgYW5kIHNldHRpbmcgdXAgc3lzdGVtcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhc3luYyBpbml0KCkge1xyXG4gICAgICAgIC8vIDEuIExvYWQgZ2FtZSBjb25maWd1cmF0aW9uIGZyb20gZGF0YS5qc29uXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCBlcnJvciEgc3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ0dhbWUgY29uZmlndXJhdGlvbiBsb2FkZWQ6JywgdGhpcy5jb25maWcpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbjonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIC8vIElmIGNvbmZpZ3VyYXRpb24gZmFpbHMgdG8gbG9hZCwgZGlzcGxheSBhbiBlcnJvciBtZXNzYWdlIGFuZCBzdG9wLlxyXG4gICAgICAgICAgICBjb25zdCBlcnJvckRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRvcCA9ICc1MCUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5sZWZ0ID0gJzUwJSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRyYW5zZm9ybSA9ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5jb2xvciA9ICdyZWQnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5mb250U2l6ZSA9ICcyNHB4JztcclxuICAgICAgICAgICAgZXJyb3JEaXYudGV4dENvbnRlbnQgPSAnRXJyb3I6IEZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbi4gQ2hlY2sgY29uc29sZSBmb3IgZGV0YWlscy4nO1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVycm9yRGl2KTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gMi4gSW5pdGlhbGl6ZSBUaHJlZS5qcyAoc2NlbmUsIGNhbWVyYSwgcmVuZGVyZXIpXHJcbiAgICAgICAgdGhpcy5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKFxyXG4gICAgICAgICAgICA3NSwgLy8gRmllbGQgb2YgVmlldyAoRk9WKVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby53aWR0aCAvIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5maXhlZEFzcGVjdFJhdGlvLmhlaWdodCwgLy8gRml4ZWQgQXNwZWN0IHJhdGlvIGZyb20gY29uZmlnXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFOZWFyLCAvLyBOZWFyIGNsaXBwaW5nIHBsYW5lXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFGYXIgICAvLyBGYXIgY2xpcHBpbmcgcGxhbmVcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcih7IGNhbnZhczogdGhpcy5jYW52YXMsIGFudGlhbGlhczogdHJ1ZSB9KTtcclxuICAgICAgICAvLyBSZW5kZXJlciBzaXplIHdpbGwgYmUgc2V0IGJ5IGFwcGx5Rml4ZWRBc3BlY3RSYXRpbyB0byBmaXQgdGhlIHdpbmRvdyB3aGlsZSBtYWludGFpbmluZyBhc3BlY3QgcmF0aW9cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFBpeGVsUmF0aW8od2luZG93LmRldmljZVBpeGVsUmF0aW8pO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2hhZG93TWFwLmVuYWJsZWQgPSB0cnVlOyAvLyBFbmFibGUgc2hhZG93cyBmb3IgYmV0dGVyIHJlYWxpc21cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC50eXBlID0gVEhSRUUuUENGU29mdFNoYWRvd01hcDsgLy8gVXNlIHNvZnQgc2hhZG93c1xyXG5cclxuICAgICAgICAvLyBDYW1lcmEgc2V0dXAgZm9yIGRlY291cGxlZCB5YXcgYW5kIHBpdGNoOlxyXG4gICAgICAgIC8vIGNhbWVyYUNvbnRhaW5lciBoYW5kbGVzIHlhdyAoaG9yaXpvbnRhbCByb3RhdGlvbikgYW5kIGZvbGxvd3MgdGhlIHBsYXllcidzIHBvc2l0aW9uLlxyXG4gICAgICAgIC8vIFRoZSBjYW1lcmEgaXRzZWxmIGlzIGEgY2hpbGQgb2YgY2FtZXJhQ29udGFpbmVyIGFuZCBoYW5kbGVzIHBpdGNoICh2ZXJ0aWNhbCByb3RhdGlvbikuXHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIgPSBuZXcgVEhSRUUuT2JqZWN0M0QoKTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLmNhbWVyYUNvbnRhaW5lcik7XHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIuYWRkKHRoaXMuY2FtZXJhKTtcclxuICAgICAgICAvLyBQb3NpdGlvbiB0aGUgY2FtZXJhIHJlbGF0aXZlIHRvIHRoZSBjYW1lcmFDb250YWluZXIgKGF0IGV5ZSBsZXZlbClcclxuICAgICAgICB0aGlzLmNhbWVyYS5wb3NpdGlvbi55ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbWVyYUhlaWdodE9mZnNldDtcclxuXHJcblxyXG4gICAgICAgIC8vIDMuIEluaXRpYWxpemUgQ2Fubm9uLWVzIChwaHlzaWNzIHdvcmxkKVxyXG4gICAgICAgIHRoaXMud29ybGQgPSBuZXcgQ0FOTk9OLldvcmxkKCk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5ncmF2aXR5LnNldCgwLCAtOS44MiwgMCk7IC8vIFNldCBzdGFuZGFyZCBFYXJ0aCBncmF2aXR5IChZLWF4aXMgZG93bilcclxuICAgICAgICB0aGlzLndvcmxkLmJyb2FkcGhhc2UgPSBuZXcgQ0FOTk9OLlNBUEJyb2FkcGhhc2UodGhpcy53b3JsZCk7IC8vIFVzZSBhbiBlZmZpY2llbnQgYnJvYWRwaGFzZSBhbGdvcml0aG1cclxuICAgICAgICAvLyBGaXg6IENhc3QgdGhpcy53b3JsZC5zb2x2ZXIgdG8gQ0FOTk9OLkdTU29sdmVyIHRvIGFjY2VzcyB0aGUgJ2l0ZXJhdGlvbnMnIHByb3BlcnR5XHJcbiAgICAgICAgLy8gVGhlIGRlZmF1bHQgc29sdmVyIGluIENhbm5vbi5qcyAoYW5kIENhbm5vbi1lcykgaXMgR1NTb2x2ZXIsIHdoaWNoIGhhcyB0aGlzIHByb3BlcnR5LlxyXG4gICAgICAgICh0aGlzLndvcmxkLnNvbHZlciBhcyBDQU5OT04uR1NTb2x2ZXIpLml0ZXJhdGlvbnMgPSAxMDsgLy8gSW5jcmVhc2Ugc29sdmVyIGl0ZXJhdGlvbnMgZm9yIGJldHRlciBzdGFiaWxpdHlcclxuXHJcbiAgICAgICAgLy8gQURERUQ6IERlZmluZSBwaHlzaWNzIG1hdGVyaWFscyBhbmQgY29udGFjdCBtYXRlcmlhbHMgZm9yIGZyaWN0aW9uIGNvbnRyb2xcclxuICAgICAgICB0aGlzLnBsYXllck1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgncGxheWVyTWF0ZXJpYWwnKTtcclxuICAgICAgICB0aGlzLmdyb3VuZE1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgnZ3JvdW5kTWF0ZXJpYWwnKTtcclxuICAgICAgICB0aGlzLmRlZmF1bHRPYmplY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ2RlZmF1bHRPYmplY3RNYXRlcmlhbCcpOyAvLyBGb3IgZ2VuZXJhbCBzdGF0aWMvZHluYW1pYyBvYmplY3RzXHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSBhIENvbnRhY3RNYXRlcmlhbCBmb3IgcGxheWVyLWdyb3VuZCBpbnRlcmFjdGlvbiB3aXRoIG5vIGZyaWN0aW9uXHJcbiAgICAgICAgY29uc3QgcGxheWVyR3JvdW5kQ29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZ3JvdW5kTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGZyaWN0aW9uOiAwLCAgICAvLyBObyBmcmljdGlvbiBiZXR3ZWVuIHBsYXllciBhbmQgZ3JvdW5kXHJcbiAgICAgICAgICAgICAgICByZXN0aXR1dGlvbjogMC4xIC8vIEEgbGl0dGxlIGJvdW5jZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChwbGF5ZXJHcm91bmRDb250YWN0TWF0ZXJpYWwpO1xyXG5cclxuICAgICAgICAvLyBDcmVhdGUgYSBDb250YWN0TWF0ZXJpYWwgZm9yIHBsYXllci1wbGFjZWQgb2JqZWN0IGludGVyYWN0aW9uIHdpdGggbm8gZnJpY3Rpb25cclxuICAgICAgICBjb25zdCBwbGF5ZXJPYmplY3RDb250YWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJNYXRlcmlhbCxcclxuICAgICAgICAgICAgdGhpcy5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGZyaWN0aW9uOiAwLCAgICAvLyBObyBmcmljdGlvbiBiZXR3ZWVuIHBsYXllciBhbmQgb3RoZXIgb2JqZWN0c1xyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMSAvLyBBIGxpdHRsZSBib3VuY2VcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwocGxheWVyT2JqZWN0Q29udGFjdE1hdGVyaWFsKTtcclxuXHJcblxyXG4gICAgICAgIC8vIDQuIExvYWQgYXNzZXRzICh0ZXh0dXJlcyBhbmQgc291bmRzKVxyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG5cclxuICAgICAgICAvLyA1LiBDcmVhdGUgZ2FtZSBvYmplY3RzIChwbGF5ZXIsIGdyb3VuZCwgYW5kIG90aGVyIG9iamVjdHMpIGFuZCBsaWdodGluZ1xyXG4gICAgICAgIHRoaXMuY3JlYXRlR3JvdW5kKCk7IC8vIENyZWF0ZXMgdGhpcy5ncm91bmRCb2R5XHJcbiAgICAgICAgdGhpcy5jcmVhdGVQbGF5ZXIoKTsgLy8gQ3JlYXRlcyB0aGlzLnBsYXllckJvZHlcclxuICAgICAgICB0aGlzLmNyZWF0ZVBsYWNlZE9iamVjdHMoKTsgLy8gTkVXOiBDcmVhdGVzIG90aGVyIG9iamVjdHMgaW4gdGhlIHNjZW5lXHJcbiAgICAgICAgdGhpcy5zZXR1cExpZ2h0aW5nKCk7XHJcblxyXG4gICAgICAgIC8vIEFEREVEOiA2LiBTZXR1cCBDYW5ub24tZXMgY29udGFjdCBsaXN0ZW5lcnMgZm9yIGp1bXAgbG9naWMgKGFmdGVyIGJvZGllcyBhcmUgY3JlYXRlZClcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEV2ZW50TGlzdGVuZXIoJ2JlZ2luQ29udGFjdCcsIChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBvbmUgb2YgdGhlIGJvZGllcyBpcyB0aGUgcGxheWVyQm9keSBhbmQgdGhlIG90aGVyIGlzIHRoZSBncm91bmRCb2R5XHJcbiAgICAgICAgICAgIC8vIFRoaXMgbG9naWMgYWxsb3dzIGp1bXBpbmcgb25seSBmcm9tIHRoZSBncm91bmQuXHJcbiAgICAgICAgICAgIGlmICgoZXZlbnQuYm9keUEgPT09IHRoaXMucGxheWVyQm9keSAmJiBldmVudC5ib2R5QiA9PT0gdGhpcy5ncm91bmRCb2R5KSB8fFxyXG4gICAgICAgICAgICAgICAgKGV2ZW50LmJvZHlCID09PSB0aGlzLnBsYXllckJvZHkgJiYgZXZlbnQuYm9keUEgPT09IHRoaXMuZ3JvdW5kQm9keSkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMubnVtR3JvdW5kQ29udGFjdHMrKztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLndvcmxkLmFkZEV2ZW50TGlzdGVuZXIoJ2VuZENvbnRhY3QnLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgb25lIG9mIHRoZSBib2RpZXMgaXMgdGhlIHBsYXllckJvZHkgYW5kIHRoZSBvdGhlciBpcyB0aGUgZ3JvdW5kQm9keVxyXG4gICAgICAgICAgICBpZiAoKGV2ZW50LmJvZHlBID09PSB0aGlzLnBsYXllckJvZHkgJiYgZXZlbnQuYm9keUIgPT09IHRoaXMuZ3JvdW5kQm9keSkgfHxcclxuICAgICAgICAgICAgICAgIChldmVudC5ib2R5QiA9PT0gdGhpcy5wbGF5ZXJCb2R5ICYmIGV2ZW50LmJvZHlBID09PSB0aGlzLmdyb3VuZEJvZHkpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm51bUdyb3VuZENvbnRhY3RzID0gTWF0aC5tYXgoMCwgdGhpcy5udW1Hcm91bmRDb250YWN0cyAtIDEpOyAvLyBFbnN1cmUgaXQgZG9lc24ndCBnbyBiZWxvdyAwXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gNy4gU2V0dXAgZXZlbnQgbGlzdGVuZXJzIGZvciB1c2VyIGlucHV0IGFuZCB3aW5kb3cgcmVzaXppbmdcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgdGhpcy5vbldpbmRvd1Jlc2l6ZS5iaW5kKHRoaXMpKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5vbktleURvd24uYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLm9uS2V5VXAuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5vbk1vdXNlTW92ZS5iaW5kKHRoaXMpKTsgLy8gRm9yIG1vdXNlIGxvb2tcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRm9yIHBvaW50ZXIgbG9jayBzdGF0dXNcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3pwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRmlyZWZveCBjb21wYXRpYmlsaXR5XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0cG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7IC8vIFdlYmtpdCBjb21wYXRpYmlsaXR5XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGluaXRpYWwgZml4ZWQgYXNwZWN0IHJhdGlvIGFuZCBjZW50ZXIgdGhlIGNhbnZhc1xyXG4gICAgICAgIHRoaXMuYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCk7XHJcblxyXG4gICAgICAgIC8vIDguIFNldHVwIHRoZSB0aXRsZSBzY3JlZW4gVUlcclxuICAgICAgICB0aGlzLnNldHVwVGl0bGVTY3JlZW4oKTtcclxuXHJcbiAgICAgICAgLy8gU3RhcnQgdGhlIG1haW4gZ2FtZSBsb29wXHJcbiAgICAgICAgdGhpcy5hbmltYXRlKDApOyAvLyBQYXNzIGluaXRpYWwgdGltZSAwXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBMb2FkcyBhbGwgdGV4dHVyZXMgYW5kIHNvdW5kcyBkZWZpbmVkIGluIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEFzc2V0cygpIHtcclxuICAgICAgICBjb25zdCB0ZXh0dXJlTG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKTtcclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5tYXAoaW1nID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIHRleHR1cmVMb2FkZXIubG9hZEFzeW5jKGltZy5wYXRoKVxyXG4gICAgICAgICAgICAgICAgLnRoZW4odGV4dHVyZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlcy5zZXQoaW1nLm5hbWUsIHRleHR1cmUpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmUud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZzsgLy8gUmVwZWF0IHRleHR1cmUgaG9yaXpvbnRhbGx5XHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nOyAvLyBSZXBlYXQgdGV4dHVyZSB2ZXJ0aWNhbGx5XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQWRqdXN0IHRleHR1cmUgcmVwZXRpdGlvbiBmb3IgdGhlIGdyb3VuZCB0byBhdm9pZCBzdHJldGNoaW5nXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGltZy5uYW1lID09PSAnZ3JvdW5kX3RleHR1cmUnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLnJlcGVhdC5zZXQodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyA1LCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDUpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAvLyBGb3IgYm94IHRleHR1cmVzLCBlbnN1cmUgcmVwZXRpdGlvbiBpZiBkZXNpcmVkLCBvciBzZXQgdG8gMSwxIGZvciBzaW5nbGUgYXBwbGljYXRpb25cclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW1nLm5hbWUuZW5kc1dpdGgoJ190ZXh0dXJlJykpIHsgLy8gR2VuZXJpYyBjaGVjayBmb3Igb3RoZXIgdGV4dHVyZXNcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yIGdlbmVyaWMgYm94IHRleHR1cmVzLCB3ZSBtaWdodCB3YW50IHRvIHJlcGVhdCBiYXNlZCBvbiBvYmplY3QgZGltZW5zaW9uc1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGb3Igc2ltcGxpY2l0eSBub3csIGxldCdzIGtlZXAgZGVmYXVsdCAobm8gcmVwZWF0IHVubGVzcyBleHBsaWNpdCBmb3IgZ3JvdW5kKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBBIG1vcmUgcm9idXN0IHNvbHV0aW9uIHdvdWxkIGludm9sdmUgc2V0dGluZyByZXBlYXQgYmFzZWQgb24gc2NhbGUvZGltZW5zaW9ucyBmb3IgZWFjaCBvYmplY3RcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCB0ZXh0dXJlOiAke2ltZy5wYXRofWAsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICAvLyBDb250aW51ZSBldmVuIGlmIGFuIGFzc2V0IGZhaWxzIHRvIGxvYWQ7IGZhbGxiYWNrcyAoc29saWQgY29sb3JzKSBhcmUgdXNlZC5cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5tYXAoc291bmQgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKHNvdW5kLnBhdGgpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gc291bmQudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ubG9vcCA9IChzb3VuZC5uYW1lID09PSAnYmFja2dyb3VuZF9tdXNpYycpOyAvLyBMb29wIGJhY2tncm91bmQgbXVzaWNcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KHNvdW5kLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtzb3VuZC5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gUmVzb2x2ZSBldmVuIG9uIGVycm9yIHRvIG5vdCBibG9jayBQcm9taXNlLmFsbFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYEFzc2V0cyBsb2FkZWQ6ICR7dGhpcy50ZXh0dXJlcy5zaXplfSB0ZXh0dXJlcywgJHt0aGlzLnNvdW5kcy5zaXplfSBzb3VuZHMuYCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGFuZCBkaXNwbGF5cyB0aGUgdGl0bGUgc2NyZWVuIFVJIGR5bmFtaWNhbGx5LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNldHVwVGl0bGVTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LnN0eWxlLCB7XHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLCAvLyBQb3NpdGlvbiByZWxhdGl2ZSB0byBib2R5LCB3aWxsIGJlIGNlbnRlcmVkIGFuZCBzaXplZCBieSBhcHBseUZpeGVkQXNwZWN0UmF0aW9cclxuICAgICAgICAgICAgYmFja2dyb3VuZENvbG9yOiAncmdiYSgwLCAwLCAwLCAwLjgpJyxcclxuICAgICAgICAgICAgZGlzcGxheTogJ2ZsZXgnLCBmbGV4RGlyZWN0aW9uOiAnY29sdW1uJyxcclxuICAgICAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLCBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcclxuICAgICAgICAgICAgY29sb3I6ICd3aGl0ZScsIGZvbnRGYW1pbHk6ICdBcmlhbCwgc2Fucy1zZXJpZicsXHJcbiAgICAgICAgICAgIGZvbnRTaXplOiAnNDhweCcsIHRleHRBbGlnbjogJ2NlbnRlcicsIHpJbmRleDogJzEwMDAnXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSk7XHJcblxyXG4gICAgICAgIC8vIENydWNpYWw6IENhbGwgYXBwbHlGaXhlZEFzcGVjdFJhdGlvIGhlcmUgdG8gZW5zdXJlIHRoZSB0aXRsZSBzY3JlZW4gb3ZlcmxheVxyXG4gICAgICAgIC8vIGlzIHNpemVkIGFuZCBwb3NpdGlvbmVkIGNvcnJlY3RseSByZWxhdGl2ZSB0byB0aGUgY2FudmFzIGZyb20gdGhlIHN0YXJ0LlxyXG4gICAgICAgIHRoaXMuYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCk7XHJcblxyXG4gICAgICAgIHRoaXMudGl0bGVUZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy50aXRsZVRleHQudGV4dENvbnRlbnQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MudGl0bGVTY3JlZW5UZXh0O1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LmFwcGVuZENoaWxkKHRoaXMudGl0bGVUZXh0KTtcclxuXHJcbiAgICAgICAgdGhpcy5wcm9tcHRUZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy5wcm9tcHRUZXh0LnRleHRDb250ZW50ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnN0YXJ0R2FtZVByb21wdDtcclxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMucHJvbXB0VGV4dC5zdHlsZSwge1xyXG4gICAgICAgICAgICBtYXJnaW5Ub3A6ICcyMHB4JywgZm9udFNpemU6ICcyNHB4J1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LmFwcGVuZENoaWxkKHRoaXMucHJvbXB0VGV4dCk7XHJcblxyXG4gICAgICAgIC8vIEFkZCBldmVudCBsaXN0ZW5lciBkaXJlY3RseSB0byB0aGUgb3ZlcmxheSB0byBjYXB0dXJlIGNsaWNrcyBhbmQgc3RhcnQgdGhlIGdhbWVcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRoaXMuc3RhcnRHYW1lKCkpO1xyXG5cclxuICAgICAgICAvLyBBdHRlbXB0IHRvIHBsYXkgYmFja2dyb3VuZCBtdXNpYy4gSXQgbWlnaHQgYmUgYmxvY2tlZCBieSBicm93c2VycyBpZiBubyB1c2VyIGdlc3R1cmUgaGFzIG9jY3VycmVkIHlldC5cclxuICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ2JhY2tncm91bmRfbXVzaWMnKT8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJCR00gcGxheSBkZW5pZWQgKHJlcXVpcmVzIHVzZXIgZ2VzdHVyZSk6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRyYW5zaXRpb25zIHRoZSBnYW1lIGZyb20gdGhlIHRpdGxlIHNjcmVlbiB0byB0aGUgcGxheWluZyBzdGF0ZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKSB7XHJcbiAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgIC8vIFJlbW92ZSB0aGUgdGl0bGUgc2NyZWVuIG92ZXJsYXlcclxuICAgICAgICBpZiAodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkgJiYgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkucGFyZW50Tm9kZSkge1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gQWRkIGV2ZW50IGxpc3RlbmVyIHRvIGNhbnZhcyBmb3IgcmUtbG9ja2luZyBwb2ludGVyIGFmdGVyIHRpdGxlIHNjcmVlbiBpcyBnb25lXHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmhhbmRsZUNhbnZhc1JlTG9ja1BvaW50ZXIuYmluZCh0aGlzKSk7XHJcblxyXG4gICAgICAgIC8vIFJlcXVlc3QgcG9pbnRlciBsb2NrIGZvciBpbW1lcnNpdmUgbW91c2UgY29udHJvbFxyXG4gICAgICAgIHRoaXMuY2FudmFzLnJlcXVlc3RQb2ludGVyTG9jaygpO1xyXG4gICAgICAgIC8vIEVuc3VyZSBiYWNrZ3JvdW5kIG11c2ljIHBsYXlzIG5vdyB0aGF0IGEgdXNlciBnZXN0dXJlIGhhcyBvY2N1cnJlZFxyXG4gICAgICAgIHRoaXMuc291bmRzLmdldCgnYmFja2dyb3VuZF9tdXNpYycpPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIkJHTSBwbGF5IGZhaWxlZCBhZnRlciB1c2VyIGdlc3R1cmU6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgY2xpY2tzIG9uIHRoZSBjYW52YXMgdG8gcmUtbG9jayB0aGUgcG9pbnRlciBpZiB0aGUgZ2FtZSBpcyBwbGF5aW5nIGFuZCB1bmxvY2tlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVDYW52YXNSZUxvY2tQb2ludGVyKCkge1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiAhdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMucmVxdWVzdFBvaW50ZXJMb2NrKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyB0aGUgcGxheWVyJ3MgdmlzdWFsIG1lc2ggYW5kIHBoeXNpY3MgYm9keS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVQbGF5ZXIoKSB7XHJcbiAgICAgICAgLy8gUGxheWVyIHZpc3VhbCBtZXNoIChhIHNpbXBsZSBib3gpXHJcbiAgICAgICAgY29uc3QgcGxheWVyVGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KCdwbGF5ZXJfdGV4dHVyZScpO1xyXG4gICAgICAgIGNvbnN0IHBsYXllck1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICBtYXA6IHBsYXllclRleHR1cmUsXHJcbiAgICAgICAgICAgIGNvbG9yOiBwbGF5ZXJUZXh0dXJlID8gMHhmZmZmZmYgOiAweDAwNzdmZiAvLyBVc2Ugd2hpdGUgd2l0aCB0ZXh0dXJlLCBvciBibHVlIGlmIG5vIHRleHR1cmVcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBwbGF5ZXJHZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgxLCAyLCAxKTsgLy8gUGxheWVyIGRpbWVuc2lvbnNcclxuICAgICAgICB0aGlzLnBsYXllck1lc2ggPSBuZXcgVEhSRUUuTWVzaChwbGF5ZXJHZW9tZXRyeSwgcGxheWVyTWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi55ID0gNTsgLy8gU3RhcnQgcGxheWVyIHNsaWdodGx5IGFib3ZlIHRoZSBncm91bmRcclxuICAgICAgICB0aGlzLnBsYXllck1lc2guY2FzdFNoYWRvdyA9IHRydWU7IC8vIFBsYXllciBjYXN0cyBhIHNoYWRvd1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMucGxheWVyTWVzaCk7XHJcblxyXG4gICAgICAgIC8vIFBsYXllciBwaHlzaWNzIGJvZHkgKENhbm5vbi5qcyBib3ggc2hhcGUpXHJcbiAgICAgICAgY29uc3QgcGxheWVyU2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoMC41LCAxLCAwLjUpKTsgLy8gSGFsZiBleHRlbnRzIG9mIHRoZSBib3ggZm9yIGNvbGxpc2lvblxyXG4gICAgICAgIHRoaXMucGxheWVyQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJNYXNzLCAvLyBQbGF5ZXIncyBtYXNzXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzModGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLngsIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi55LCB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgIHNoYXBlOiBwbGF5ZXJTaGFwZSxcclxuICAgICAgICAgICAgZml4ZWRSb3RhdGlvbjogdHJ1ZSwgLy8gUHJldmVudCB0aGUgcGxheWVyIGZyb20gZmFsbGluZyBvdmVyIChzaW11bGF0ZXMgYSBjYXBzdWxlL2N5bGluZGVyIGNoYXJhY3RlcilcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMucGxheWVyTWF0ZXJpYWwgLy8gQXNzaWduIHRoZSBwbGF5ZXIncyBtYXRlcmlhbFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLnBsYXllckJvZHkpO1xyXG5cclxuICAgICAgICAvLyBTZXQgaW5pdGlhbCBjYW1lcmFDb250YWluZXIgcG9zaXRpb24gdG8gcGxheWVyJ3MgcGh5c2ljcyBib2R5IHBvc2l0aW9uLlxyXG4gICAgICAgIC8vIFRoZSBjYW1lcmEgaXRzZWxmIGlzIGEgY2hpbGQgb2YgY2FtZXJhQ29udGFpbmVyIGFuZCBoYXMgaXRzIG93biBsb2NhbCBZIG9mZnNldC5cclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyB0aGUgZ3JvdW5kJ3MgdmlzdWFsIG1lc2ggYW5kIHBoeXNpY3MgYm9keS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVHcm91bmQoKSB7XHJcbiAgICAgICAgLy8gR3JvdW5kIHZpc3VhbCBtZXNoIChhIGxhcmdlIHBsYW5lKVxyXG4gICAgICAgIGNvbnN0IGdyb3VuZFRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgnZ3JvdW5kX3RleHR1cmUnKTtcclxuICAgICAgICBjb25zdCBncm91bmRNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgbWFwOiBncm91bmRUZXh0dXJlLFxyXG4gICAgICAgICAgICBjb2xvcjogZ3JvdW5kVGV4dHVyZSA/IDB4ZmZmZmZmIDogMHg4ODg4ODggLy8gVXNlIHdoaXRlIHdpdGggdGV4dHVyZSwgb3IgZ3JleSBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kR2VvbWV0cnkgPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeSh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdyb3VuZEdlb21ldHJ5LCBncm91bmRNYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRNZXNoLnJvdGF0aW9uLnggPSAtTWF0aC5QSSAvIDI7IC8vIFJvdGF0ZSB0byBsYXkgZmxhdCBvbiB0aGUgWFogcGxhbmVcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7IC8vIEdyb3VuZCByZWNlaXZlcyBzaGFkb3dzXHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5ncm91bmRNZXNoKTtcclxuXHJcbiAgICAgICAgLy8gR3JvdW5kIHBoeXNpY3MgYm9keSAoQ2Fubm9uLmpzIHBsYW5lIHNoYXBlKVxyXG4gICAgICAgIGNvbnN0IGdyb3VuZFNoYXBlID0gbmV3IENBTk5PTi5QbGFuZSgpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IDAsIC8vIEEgbWFzcyBvZiAwIG1ha2VzIGl0IGEgc3RhdGljIChpbW1vdmFibGUpIGJvZHlcclxuICAgICAgICAgICAgc2hhcGU6IGdyb3VuZFNoYXBlLFxyXG4gICAgICAgICAgICBtYXRlcmlhbDogdGhpcy5ncm91bmRNYXRlcmlhbCAvLyBBc3NpZ24gdGhlIGdyb3VuZCdzIG1hdGVyaWFsXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgLy8gUm90YXRlIHRoZSBDYW5ub24uanMgcGxhbmUgYm9keSB0byBtYXRjaCB0aGUgVGhyZWUuanMgcGxhbmUgb3JpZW50YXRpb24gKGZsYXQpXHJcbiAgICAgICAgdGhpcy5ncm91bmRCb2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShuZXcgQ0FOTk9OLlZlYzMoMSwgMCwgMCksIC1NYXRoLlBJIC8gMik7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KHRoaXMuZ3JvdW5kQm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IENyZWF0ZXMgdmlzdWFsIG1lc2hlcyBhbmQgcGh5c2ljcyBib2RpZXMgZm9yIGFsbCBvYmplY3RzIGRlZmluZWQgaW4gY29uZmlnLmdhbWVTZXR0aW5ncy5wbGFjZWRPYmplY3RzLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNyZWF0ZVBsYWNlZE9iamVjdHMoKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxhY2VkT2JqZWN0cykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJObyBwbGFjZWRPYmplY3RzIGRlZmluZWQgaW4gZ2FtZVNldHRpbmdzLlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYWNlZE9iamVjdHMuZm9yRWFjaChvYmpDb25maWcgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQob2JqQ29uZmlnLnRleHR1cmVOYW1lKTtcclxuICAgICAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgICAgICBtYXA6IHRleHR1cmUsXHJcbiAgICAgICAgICAgICAgICBjb2xvcjogdGV4dHVyZSA/IDB4ZmZmZmZmIDogMHhhYWFhYWEgLy8gRGVmYXVsdCBncmV5IGlmIG5vIHRleHR1cmVcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvLyBDcmVhdGUgVGhyZWUuanMgTWVzaFxyXG4gICAgICAgICAgICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeShvYmpDb25maWcuZGltZW5zaW9ucy53aWR0aCwgb2JqQ29uZmlnLmRpbWVuc2lvbnMuaGVpZ2h0LCBvYmpDb25maWcuZGltZW5zaW9ucy5kZXB0aCk7XHJcbiAgICAgICAgICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSwgbWF0ZXJpYWwpO1xyXG4gICAgICAgICAgICBtZXNoLnBvc2l0aW9uLnNldChvYmpDb25maWcucG9zaXRpb24ueCwgb2JqQ29uZmlnLnBvc2l0aW9uLnksIG9iakNvbmZpZy5wb3NpdGlvbi56KTtcclxuICAgICAgICAgICAgaWYgKG9iakNvbmZpZy5yb3RhdGlvblkgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgbWVzaC5yb3RhdGlvbi55ID0gb2JqQ29uZmlnLnJvdGF0aW9uWTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICBtZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZChtZXNoKTtcclxuICAgICAgICAgICAgdGhpcy5wbGFjZWRPYmplY3RNZXNoZXMucHVzaChtZXNoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIENyZWF0ZSBDYW5ub24uanMgQm9keVxyXG4gICAgICAgICAgICAvLyBDYW5ub24uQm94IHRha2VzIGhhbGYgZXh0ZW50c1xyXG4gICAgICAgICAgICBjb25zdCBzaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhcclxuICAgICAgICAgICAgICAgIG9iakNvbmZpZy5kaW1lbnNpb25zLndpZHRoIC8gMixcclxuICAgICAgICAgICAgICAgIG9iakNvbmZpZy5kaW1lbnNpb25zLmhlaWdodCAvIDIsXHJcbiAgICAgICAgICAgICAgICBvYmpDb25maWcuZGltZW5zaW9ucy5kZXB0aCAvIDJcclxuICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICAgICAgbWFzczogb2JqQ29uZmlnLm1hc3MsIC8vIFVzZSAwIGZvciBzdGF0aWMgb2JqZWN0cywgPjAgZm9yIGR5bmFtaWNcclxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMob2JqQ29uZmlnLnBvc2l0aW9uLngsIG9iakNvbmZpZy5wb3NpdGlvbi55LCBvYmpDb25maWcucG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgICAgICBzaGFwZTogc2hhcGUsXHJcbiAgICAgICAgICAgICAgICBtYXRlcmlhbDogdGhpcy5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwgLy8gQXNzaWduIGRlZmF1bHQgb2JqZWN0IG1hdGVyaWFsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBpZiAob2JqQ29uZmlnLnJvdGF0aW9uWSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBib2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShuZXcgQ0FOTk9OLlZlYzMoMCwgMSwgMCksIG9iakNvbmZpZy5yb3RhdGlvblkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQuYWRkQm9keShib2R5KTtcclxuICAgICAgICAgICAgdGhpcy5wbGFjZWRPYmplY3RCb2RpZXMucHVzaChib2R5KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgQ3JlYXRlZCAke3RoaXMucGxhY2VkT2JqZWN0TWVzaGVzLmxlbmd0aH0gcGxhY2VkIG9iamVjdHMuYCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHVwIGFtYmllbnQgYW5kIGRpcmVjdGlvbmFsIGxpZ2h0aW5nIGluIHRoZSBzY2VuZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzZXR1cExpZ2h0aW5nKCkge1xyXG4gICAgICAgIGNvbnN0IGFtYmllbnRMaWdodCA9IG5ldyBUSFJFRS5BbWJpZW50TGlnaHQoMHg0MDQwNDAsIDEuMCk7IC8vIFNvZnQgd2hpdGUgYW1iaWVudCBsaWdodFxyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGFtYmllbnRMaWdodCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGRpcmVjdGlvbmFsTGlnaHQgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCgweGZmZmZmZiwgMC44KTsgLy8gQnJpZ2h0ZXIgZGlyZWN0aW9uYWwgbGlnaHRcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnBvc2l0aW9uLnNldCg1LCAxMCwgNSk7IC8vIFBvc2l0aW9uIHRoZSBsaWdodCBzb3VyY2VcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LmNhc3RTaGFkb3cgPSB0cnVlOyAvLyBFbmFibGUgc2hhZG93cyBmcm9tIHRoaXMgbGlnaHQgc291cmNlXHJcbiAgICAgICAgLy8gQ29uZmlndXJlIHNoYWRvdyBwcm9wZXJ0aWVzIGZvciB0aGUgZGlyZWN0aW9uYWwgbGlnaHRcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5tYXBTaXplLndpZHRoID0gMTAyNDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5tYXBTaXplLmhlaWdodCA9IDEwMjQ7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLm5lYXIgPSAwLjU7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmZhciA9IDUwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5sZWZ0ID0gLTEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5yaWdodCA9IDEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS50b3AgPSAxMDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEuYm90dG9tID0gLTEwO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGRpcmVjdGlvbmFsTGlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyB3aW5kb3cgcmVzaXppbmcgdG8ga2VlcCB0aGUgY2FtZXJhIGFzcGVjdCByYXRpbyBhbmQgcmVuZGVyZXIgc2l6ZSBjb3JyZWN0LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uV2luZG93UmVzaXplKCkge1xyXG4gICAgICAgIHRoaXMuYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCk7IC8vIEFwcGx5IHRoZSBmaXhlZCBhc3BlY3QgcmF0aW8gYW5kIGNlbnRlciB0aGUgY2FudmFzXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBcHBsaWVzIHRoZSBjb25maWd1cmVkIGZpeGVkIGFzcGVjdCByYXRpbyB0byB0aGUgcmVuZGVyZXIgYW5kIGNhbWVyYSxcclxuICAgICAqIHJlc2l6aW5nIGFuZCBjZW50ZXJpbmcgdGhlIGNhbnZhcyB0byBmaXQgd2l0aGluIHRoZSB3aW5kb3cuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCkge1xyXG4gICAgICAgIGNvbnN0IHRhcmdldEFzcGVjdFJhdGlvID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZpeGVkQXNwZWN0UmF0aW8ud2lkdGggLyB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby5oZWlnaHQ7XHJcblxyXG4gICAgICAgIGxldCBuZXdXaWR0aDogbnVtYmVyO1xyXG4gICAgICAgIGxldCBuZXdIZWlnaHQ6IG51bWJlcjtcclxuXHJcbiAgICAgICAgY29uc3Qgd2luZG93V2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aDtcclxuICAgICAgICBjb25zdCB3aW5kb3dIZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQ7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFdpbmRvd0FzcGVjdFJhdGlvID0gd2luZG93V2lkdGggLyB3aW5kb3dIZWlnaHQ7XHJcblxyXG4gICAgICAgIGlmIChjdXJyZW50V2luZG93QXNwZWN0UmF0aW8gPiB0YXJnZXRBc3BlY3RSYXRpbykge1xyXG4gICAgICAgICAgICAvLyBXaW5kb3cgaXMgd2lkZXIgdGhhbiB0YXJnZXQgYXNwZWN0IHJhdGlvLCBoZWlnaHQgaXMgdGhlIGxpbWl0aW5nIGZhY3RvclxyXG4gICAgICAgICAgICBuZXdIZWlnaHQgPSB3aW5kb3dIZWlnaHQ7XHJcbiAgICAgICAgICAgIG5ld1dpZHRoID0gbmV3SGVpZ2h0ICogdGFyZ2V0QXNwZWN0UmF0aW87XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gV2luZG93IGlzIHRhbGxlciAob3IgZXhhY3RseSkgdGhlIHRhcmdldCBhc3BlY3QgcmF0aW8sIHdpZHRoIGlzIHRoZSBsaW1pdGluZyBmYWN0b3JcclxuICAgICAgICAgICAgbmV3V2lkdGggPSB3aW5kb3dXaWR0aDtcclxuICAgICAgICAgICAgbmV3SGVpZ2h0ID0gbmV3V2lkdGggLyB0YXJnZXRBc3BlY3RSYXRpbztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNldCByZW5kZXJlciBzaXplLiBUaGUgdGhpcmQgYXJndW1lbnQgYHVwZGF0ZVN0eWxlYCBpcyBmYWxzZSBiZWNhdXNlIHdlIG1hbmFnZSBzdHlsZSBtYW51YWxseS5cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUobmV3V2lkdGgsIG5ld0hlaWdodCwgZmFsc2UpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmFzcGVjdCA9IHRhcmdldEFzcGVjdFJhdGlvO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuXHJcbiAgICAgICAgLy8gUG9zaXRpb24gYW5kIHNpemUgdGhlIGNhbnZhcyBlbGVtZW50IHVzaW5nIENTU1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5jYW52YXMuc3R5bGUsIHtcclxuICAgICAgICAgICAgd2lkdGg6IGAke25ld1dpZHRofXB4YCxcclxuICAgICAgICAgICAgaGVpZ2h0OiBgJHtuZXdIZWlnaHR9cHhgLFxyXG4gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcclxuICAgICAgICAgICAgdG9wOiAnNTAlJyxcclxuICAgICAgICAgICAgbGVmdDogJzUwJScsXHJcbiAgICAgICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLCAtNTAlKScsXHJcbiAgICAgICAgICAgIG9iamVjdEZpdDogJ2NvbnRhaW4nIC8vIEVuc3VyZXMgY29udGVudCBpcyBzY2FsZWQgYXBwcm9wcmlhdGVseSBpZiB0aGVyZSdzIGFueSBtaXNtYXRjaFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGUgdGl0bGUgc2NyZWVuIGlzIGFjdGl2ZSwgdXBkYXRlIGl0cyBzaXplIGFuZCBwb3NpdGlvbiBhcyB3ZWxsIHRvIG1hdGNoIHRoZSBjYW52YXNcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFICYmIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KSB7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuc3R5bGUsIHtcclxuICAgICAgICAgICAgICAgIHdpZHRoOiBgJHtuZXdXaWR0aH1weGAsXHJcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGAke25ld0hlaWdodH1weGAsXHJcbiAgICAgICAgICAgICAgICB0b3A6ICc1MCUnLFxyXG4gICAgICAgICAgICAgICAgbGVmdDogJzUwJScsXHJcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknLFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWNvcmRzIHdoaWNoIGtleXMgYXJlIGN1cnJlbnRseSBwcmVzc2VkIGRvd24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25LZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmtleS50b0xvd2VyQ2FzZSgpXSA9IHRydWU7XHJcbiAgICAgICAgLy8gQURERUQ6IEhhbmRsZSBqdW1wIGlucHV0IG9ubHkgd2hlbiBwbGF5aW5nIGFuZCBwb2ludGVyIGlzIGxvY2tlZFxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiB0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICBpZiAoZXZlbnQua2V5LnRvTG93ZXJDYXNlKCkgPT09ICcgJykgeyAvLyBTcGFjZWJhclxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJKdW1wKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWNvcmRzIHdoaWNoIGtleXMgYXJlIGN1cnJlbnRseSByZWxlYXNlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbktleVVwKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmtleS50b0xvd2VyQ2FzZSgpXSA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyBtb3VzZSBtb3ZlbWVudCBmb3IgY2FtZXJhIHJvdGF0aW9uIChtb3VzZSBsb29rKS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbk1vdXNlTW92ZShldmVudDogTW91c2VFdmVudCkge1xyXG4gICAgICAgIC8vIE9ubHkgcHJvY2VzcyBtb3VzZSBtb3ZlbWVudCBpZiB0aGUgZ2FtZSBpcyBwbGF5aW5nIGFuZCBwb2ludGVyIGlzIGxvY2tlZFxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiB0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICBjb25zdCBtb3ZlbWVudFggPSBldmVudC5tb3ZlbWVudFggfHwgMDtcclxuICAgICAgICAgICAgY29uc3QgbW92ZW1lbnRZID0gZXZlbnQubW92ZW1lbnRZIHx8IDA7XHJcblxyXG4gICAgICAgICAgICAvLyBBcHBseSBob3Jpem9udGFsIHJvdGF0aW9uICh5YXcpIHRvIHRoZSBjYW1lcmFDb250YWluZXIgYXJvdW5kIGl0cyBsb2NhbCBZLWF4aXMgKHdoaWNoIGlzIGdsb2JhbCBZKVxyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5yb3RhdGlvbi55IC09IG1vdmVtZW50WCAqIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5tb3VzZVNlbnNpdGl2aXR5O1xyXG5cclxuICAgICAgICAgICAgLy8gQXBwbHkgdmVydGljYWwgcm90YXRpb24gKHBpdGNoKSB0byB0aGUgY2FtZXJhIGl0c2VsZiBhbmQgY2xhbXAgaXRcclxuICAgICAgICAgICAgLy8gTW91c2UgVVAgKG1vdmVtZW50WSA8IDApIG5vdyBpbmNyZWFzZXMgY2FtZXJhUGl0Y2ggLT4gbG9va3MgdXAuXHJcbiAgICAgICAgICAgIC8vIE1vdXNlIERPV04gKG1vdmVtZW50WSA+IDApIG5vdyBkZWNyZWFzZXMgY2FtZXJhUGl0Y2ggLT4gbG9va3MgZG93bi5cclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFQaXRjaCAtPSBtb3ZlbWVudFkgKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubW91c2VTZW5zaXRpdml0eTsgXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUGl0Y2ggPSBNYXRoLm1heCgtTWF0aC5QSSAvIDIsIE1hdGgubWluKE1hdGguUEkgLyAyLCB0aGlzLmNhbWVyYVBpdGNoKSk7IC8vIENsYW1wIHRvIC05MCB0byArOTAgZGVncmVlc1xyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5yb3RhdGlvbi54ID0gdGhpcy5jYW1lcmFQaXRjaDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVcGRhdGVzIHRoZSBwb2ludGVyIGxvY2sgc3RhdHVzIHdoZW4gaXQgY2hhbmdlcyAoZS5nLiwgdXNlciBwcmVzc2VzIEVzYykuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25Qb2ludGVyTG9ja0NoYW5nZSgpIHtcclxuICAgICAgICBpZiAoZG9jdW1lbnQucG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLmNhbnZhcyB8fFxyXG4gICAgICAgICAgICAoZG9jdW1lbnQgYXMgYW55KS5tb3pQb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMuY2FudmFzIHx8XHJcbiAgICAgICAgICAgIChkb2N1bWVudCBhcyBhbnkpLndlYmtpdFBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgdGhpcy5pc1BvaW50ZXJMb2NrZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUG9pbnRlciBsb2NrZWQnKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmlzUG9pbnRlckxvY2tlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUG9pbnRlciB1bmxvY2tlZCcpO1xyXG4gICAgICAgICAgICAvLyBXaGVuIHBvaW50ZXIgaXMgdW5sb2NrZWQgYnkgdXNlciAoZS5nLiwgcHJlc3NpbmcgRXNjKSwgY3Vyc29yIGFwcGVhcnMgYXV0b21hdGljYWxseS5cclxuICAgICAgICAgICAgLy8gTW91c2UgbG9vayBzdG9wcyBkdWUgdG8gYGlzUG9pbnRlckxvY2tlZGAgY2hlY2sgaW4gb25Nb3VzZU1vdmUuXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVGhlIG1haW4gZ2FtZSBsb29wLCBjYWxsZWQgb24gZXZlcnkgYW5pbWF0aW9uIGZyYW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFuaW1hdGUodGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCkge1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGUuYmluZCh0aGlzKSk7IC8vIFJlcXVlc3QgbmV4dCBmcmFtZVxyXG5cclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAodGltZSAtIHRoaXMubGFzdFRpbWUpIC8gMTAwMDsgLy8gQ2FsY3VsYXRlIGRlbHRhIHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSB0aW1lO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQbGF5ZXJNb3ZlbWVudCgpOyAvLyBVcGRhdGUgcGxheWVyJ3MgdmVsb2NpdHkgYmFzZWQgb24gaW5wdXRcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQaHlzaWNzKGRlbHRhVGltZSk7IC8vIFN0ZXAgdGhlIHBoeXNpY3Mgd29ybGRcclxuICAgICAgICAgICAgdGhpcy5jbGFtcFBsYXllclBvc2l0aW9uKCk7IC8vIENsYW1wIHBsYXllciBwb3NpdGlvbiB0byBwcmV2ZW50IGdvaW5nIGJleW9uZCBncm91bmQgZWRnZXNcclxuICAgICAgICAgICAgdGhpcy5zeW5jTWVzaGVzV2l0aEJvZGllcygpOyAvLyBTeW5jaHJvbml6ZSB2aXN1YWwgbWVzaGVzIHdpdGggcGh5c2ljcyBib2RpZXNcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhKTsgLy8gUmVuZGVyIHRoZSBzY2VuZVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3RlcHMgdGhlIENhbm5vbi5qcyBwaHlzaWNzIHdvcmxkIGZvcndhcmQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlUGh5c2ljcyhkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIC8vIHdvcmxkLnN0ZXAoZml4ZWRUaW1lU3RlcCwgZGVsdGFUaW1lLCBtYXhTdWJTdGVwcylcclxuICAgICAgICAvLyAxLzYwOiBBIGZpeGVkIHRpbWUgc3RlcCBvZiA2MCBwaHlzaWNzIHVwZGF0ZXMgcGVyIHNlY29uZCAoc3RhbmRhcmQpLlxyXG4gICAgICAgIC8vIGRlbHRhVGltZTogVGhlIGFjdHVhbCB0aW1lIGVsYXBzZWQgc2luY2UgdGhlIGxhc3QgcmVuZGVyIGZyYW1lLlxyXG4gICAgICAgIC8vIG1heFBoeXNpY3NTdWJTdGVwczogTGltaXRzIHRoZSBudW1iZXIgb2YgcGh5c2ljcyBzdGVwcyBpbiBvbmUgcmVuZGVyIGZyYW1lXHJcbiAgICAgICAgLy8gdG8gcHJldmVudCBpbnN0YWJpbGl0aWVzIGlmIHJlbmRlcmluZyBzbG93cyBkb3duIHNpZ25pZmljYW50bHkuXHJcbiAgICAgICAgdGhpcy53b3JsZC5zdGVwKDEgLyA2MCwgZGVsdGFUaW1lLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubWF4UGh5c2ljc1N1YlN0ZXBzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgdGhlIHBsYXllcidzIHZlbG9jaXR5IGJhc2VkIG9uIFdBU0QgaW5wdXQgYW5kIGNhbWVyYSBvcmllbnRhdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVQbGF5ZXJNb3ZlbWVudCgpIHtcclxuICAgICAgICAvLyBQbGF5ZXIgbW92ZW1lbnQgc2hvdWxkIG9ubHkgaGFwcGVuIHdoZW4gdGhlIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICAgICAgaWYgKCF0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICAvLyBJZiBwb2ludGVyIGlzIG5vdCBsb2NrZWQsIHN0b3AgaG9yaXpvbnRhbCBtb3ZlbWVudCBpbW1lZGlhdGVseVxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBFeGl0IGVhcmx5IGFzIG5vIG1vdmVtZW50IGlucHV0IHNob3VsZCBiZSBwcm9jZXNzZWRcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllclNwZWVkID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllclNwZWVkO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRZVmVsb2NpdHkgPSB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueTsgLy8gUHJlc2VydmUgdmVydGljYWwgdmVsb2NpdHlcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBtb3ZlRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMCwgMCk7IC8vIFVzZSBhIFRIUkVFLlZlY3RvcjMgZm9yIGNhbGN1bGF0aW9uIGVhc2VcclxuXHJcbiAgICAgICAgLy8gR2V0IGNhbWVyYUNvbnRhaW5lcidzIGZvcndhcmQgdmVjdG9yIChob3Jpem9udGFsIGRpcmVjdGlvbiBwbGF5ZXIgaXMgbG9va2luZylcclxuICAgICAgICBjb25zdCBjYW1lcmFEaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLmdldFdvcmxkRGlyZWN0aW9uKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgY2FtZXJhRGlyZWN0aW9uLnkgPSAwOyAvLyBGbGF0dGVuIHRoZSB2ZWN0b3IgdG8gcmVzdHJpY3QgbW92ZW1lbnQgdG8gdGhlIGhvcml6b250YWwgcGxhbmVcclxuICAgICAgICBjYW1lcmFEaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGdsb2JhbFVwID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMSwgMCk7IC8vIERlZmluZSBnbG9iYWwgdXAgdmVjdG9yIGZvciBjcm9zcyBwcm9kdWN0XHJcblxyXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgJ3JpZ2h0JyB2ZWN0b3IgcmVsYXRpdmUgdG8gY2FtZXJhJ3MgZm9yd2FyZCBkaXJlY3Rpb25cclxuICAgICAgICAvLyBCeSBjcm9zc2luZyBnbG9iYWxVcCB3aXRoIGNhbWVyYURpcmVjdGlvbiwgd2UgZ2V0IGEgdmVjdG9yIHBvaW50aW5nIHRvIHRoZSBjYW1lcmEncyByaWdodC5cclxuICAgICAgICBjb25zdCBjYW1lcmFSaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgY2FtZXJhUmlnaHQuY3Jvc3NWZWN0b3JzKGdsb2JhbFVwLCBjYW1lcmFEaXJlY3Rpb24pLm5vcm1hbGl6ZSgpOyBcclxuXHJcbiAgICAgICAgbGV0IG1vdmluZyA9IGZhbHNlO1xyXG4gICAgICAgIC8vIFcgPC0+IFMgc3dhcDpcclxuICAgICAgICAvLyAncycga2V5IG5vdyBtb3ZlcyBmb3J3YXJkIChvcmlnaW5hbGx5ICd3JylcclxuICAgICAgICBpZiAodGhpcy5rZXlzWydzJ10pIHsgXHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24uYWRkKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vICd3JyBrZXkgbm93IG1vdmVzIGJhY2t3YXJkIChvcmlnaW5hbGx5ICdzJylcclxuICAgICAgICBpZiAodGhpcy5rZXlzWyd3J10pIHsgXHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24uc3ViKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFVzZXIgcmVxdWVzdDogU3dhcCBBIGFuZCBEIGNvbnRyb2xzLlxyXG4gICAgICAgIC8vIEEgc2hvdWxkIHN0cmFmZSBsZWZ0IChzdWJ0cmFjdCBjYW1lcmFSaWdodCkuXHJcbiAgICAgICAgLy8gRCBzaG91bGQgc3RyYWZlIHJpZ2h0IChhZGQgY2FtZXJhUmlnaHQpLlxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ2EnXSkgeyAvLyAnYScga2V5IG5vdyBzdHJhZmVzIGxlZnQgKHN0YW5kYXJkIGJlaGF2aW9yKVxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLnN1YihjYW1lcmFSaWdodCk7IFxyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5rZXlzWydkJ10pIHsgLy8gJ2QnIGtleSBub3cgc3RyYWZlcyByaWdodCAoc3RhbmRhcmQgYmVoYXZpb3IpXHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24uYWRkKGNhbWVyYVJpZ2h0KTsgXHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAobW92aW5nKSB7XHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24ubm9ybWFsaXplKCkubXVsdGlwbHlTY2FsYXIocGxheWVyU3BlZWQpO1xyXG4gICAgICAgICAgICAvLyBEaXJlY3RseSBzZXQgdGhlIGhvcml6b250YWwgdmVsb2NpdHkgY29tcG9uZW50cy5cclxuICAgICAgICAgICAgLy8gVGhpcyBmaXhlcyB0aGUgcGVyY2VpdmVkIGRpYWdvbmFsIHNsb3dkb3duIGJ5IGVuc3VyaW5nIGNvbnNpc3RlbnQgc3BlZWQgaW4gYWxsIGhvcml6b250YWwgZGlyZWN0aW9ucyxcclxuICAgICAgICAgICAgLy8gYW5kIHByb3ZpZGVzIGluc3RhbnQgcmVzcG9uc2l2ZW5lc3MgKG5vIGFjY2VsZXJhdGlvbiBmYWN0b3IgaW50ZXJwb2xhdGlvbikuXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ID0gbW92ZURpcmVjdGlvbi54O1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiA9IG1vdmVEaXJlY3Rpb24uejtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBJZiBubyBtb3ZlbWVudCBrZXlzIGFyZSBwcmVzc2VkLCBhbmQgZnJpY3Rpb24gaXMgc2V0IHRvIDAgdmlhIENvbnRhY3RNYXRlcmlhbCxcclxuICAgICAgICAgICAgLy8gdGhlIHBsYXllcidzIGhvcml6b250YWwgdmVsb2NpdHkgd2lsbCBuYXR1cmFsbHkgZGVjYXkgb25seSBkdWUgdG8gb3RoZXIgcGh5c2ljcyBmb3JjZXMgKGxpa2UgYWlyIGRyYWcgaWYgbW9kZWxlZClcclxuICAgICAgICAgICAgLy8gb3IgcmVtYWluIGNvbnN0YW50IGlmIG5vdCBpbnRlcmFjdGluZyB3aXRoIGFueXRoaW5nLlxyXG4gICAgICAgICAgICAvLyBUaGUgcHJldmlvdXMgJ2ZyaWN0aW9uRmFjdG9yJyBtYW51YWwgZGVjZWxlcmF0aW9uIGlzIHJlbW92ZWQgdG8gYWNoaWV2ZSBhIHRydWx5IGZyaWN0aW9ubGVzcyBmZWVsLlxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueSA9IGN1cnJlbnRZVmVsb2NpdHk7IC8vIFJlc3RvcmUgWSB2ZWxvY2l0eSAoZ3Jhdml0eS9qdW1wcykgdG8gcHJldmVudCBpbnRlcmZlcmluZyB3aXRoIHZlcnRpY2FsIG1vdmVtZW50XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBRERFRDogQXBwbGllcyBhbiB1cHdhcmQgaW1wdWxzZSB0byB0aGUgcGxheWVyIGJvZHkgZm9yIGp1bXBpbmcuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcGxheWVySnVtcCgpIHtcclxuICAgICAgICAvLyBPbmx5IGFsbG93IGp1bXAgaWYgdGhlIHBsYXllciBpcyBjdXJyZW50bHkgb24gdGhlIGdyb3VuZCAoaGFzIGFjdGl2ZSBjb250YWN0cylcclxuICAgICAgICBpZiAodGhpcy5udW1Hcm91bmRDb250YWN0cyA+IDApIHtcclxuICAgICAgICAgICAgLy8gQ2xlYXIgYW55IGV4aXN0aW5nIHZlcnRpY2FsIHZlbG9jaXR5IHRvIGVuc3VyZSBhIGNvbnNpc3RlbnQganVtcCBoZWlnaHRcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnkgPSAwOyBcclxuICAgICAgICAgICAgLy8gQXBwbHkgYW4gdXB3YXJkIGltcHVsc2UgKG1hc3MgKiBjaGFuZ2VfaW5fdmVsb2NpdHkpXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5hcHBseUltcHVsc2UoXHJcbiAgICAgICAgICAgICAgICBuZXcgQ0FOTk9OLlZlYzMoMCwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmp1bXBGb3JjZSwgMCksXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24gLy8gQXBwbHkgaW1wdWxzZSBhdCB0aGUgY2VudGVyIG9mIG1hc3NcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbGFtcHMgdGhlIHBsYXllcidzIHBvc2l0aW9uIHdpdGhpbiB0aGUgZGVmaW5lZCBncm91bmQgYm91bmRhcmllcy5cclxuICAgICAqIFByZXZlbnRzIHRoZSBwbGF5ZXIgZnJvbSBtb3ZpbmcgYmV5b25kIHRoZSAnZW5kIG9mIHRoZSB3b3JsZCcuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY2xhbXBQbGF5ZXJQb3NpdGlvbigpIHtcclxuICAgICAgICBpZiAoIXRoaXMucGxheWVyQm9keSB8fCAhdGhpcy5jb25maWcpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaGFsZkdyb3VuZFNpemUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDI7XHJcblxyXG4gICAgICAgIGxldCBwb3NYID0gdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLng7XHJcbiAgICAgICAgbGV0IHBvc1ogPSB0aGlzLnBsYXllckJvZHkucG9zaXRpb24uejtcclxuICAgICAgICBsZXQgdmVsWCA9IHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54O1xyXG4gICAgICAgIGxldCB2ZWxaID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5Lno7XHJcblxyXG4gICAgICAgIC8vIENsYW1wIFggcG9zaXRpb25cclxuICAgICAgICBpZiAocG9zWCA+IGhhbGZHcm91bmRTaXplKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi54ID0gaGFsZkdyb3VuZFNpemU7XHJcbiAgICAgICAgICAgIGlmICh2ZWxYID4gMCkgeyAvLyBJZiBtb3Zpbmcgb3V0d2FyZHMsIHN0b3AgaG9yaXpvbnRhbCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmIChwb3NYIDwgLWhhbGZHcm91bmRTaXplKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi54ID0gLWhhbGZHcm91bmRTaXplO1xyXG4gICAgICAgICAgICBpZiAodmVsWCA8IDApIHsgLy8gSWYgbW92aW5nIG91dHdhcmRzLCBzdG9wIGhvcml6b250YWwgdmVsb2NpdHlcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2xhbXAgWiBwb3NpdGlvblxyXG4gICAgICAgIGlmIChwb3NaID4gaGFsZkdyb3VuZFNpemUpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnogPSBoYWxmR3JvdW5kU2l6ZTtcclxuICAgICAgICAgICAgaWYgKHZlbFogPiAwKSB7IC8vIElmIG1vdmluZyBvdXR3YXJkcywgc3RvcCBob3Jpem9udGFsIHZlbG9jaXR5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHBvc1ogPCAtaGFsZkdyb3VuZFNpemUpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnogPSAtaGFsZkdyb3VuZFNpemU7XHJcbiAgICAgICAgICAgIGlmICh2ZWxaIDwgMCkgeyAvLyBJZiBtb3Zpbmcgb3V0d2FyZHMsIHN0b3AgaG9yaXpvbnRhbCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3luY2hyb25pemVzIHRoZSB2aXN1YWwgbWVzaGVzIHdpdGggdGhlaXIgY29ycmVzcG9uZGluZyBwaHlzaWNzIGJvZGllcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzeW5jTWVzaGVzV2l0aEJvZGllcygpIHtcclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSBwbGF5ZXIncyB2aXN1YWwgbWVzaCBwb3NpdGlvbiB3aXRoIGl0cyBwaHlzaWNzIGJvZHkncyBwb3NpdGlvblxyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIGNhbWVyYUNvbnRhaW5lciBwb3NpdGlvbiB3aXRoIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkncyBwb3NpdGlvbi5cclxuICAgICAgICAvLyBUaGlzIGVuc3VyZXMgdGhlIGNhbWVyYSBpcyBhbHdheXMgcHJlY2lzZWx5IGF0IHRoZSBwbGF5ZXIncyBjdXJyZW50IHBoeXNpY3MgbG9jYXRpb24sXHJcbiAgICAgICAgLy8gZWxpbWluYXRpbmcgdGhlIHJlcG9ydGVkIGxhZy5cclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG5cclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSBwbGF5ZXIncyB2aXN1YWwgbWVzaCBob3Jpem9udGFsIHJvdGF0aW9uICh5YXcpIHdpdGggY2FtZXJhQ29udGFpbmVyJ3MgeWF3LlxyXG4gICAgICAgIC8vIFRoZSBjYW1lcmFDb250YWluZXIgZGljdGF0ZXMgdGhlIHBsYXllcidzIGhvcml6b250YWwgZmFjaW5nIGRpcmVjdGlvbi5cclxuICAgICAgICB0aGlzLnBsYXllck1lc2gucXVhdGVybmlvbi5jb3B5KHRoaXMuY2FtZXJhQ29udGFpbmVyLnF1YXRlcm5pb24pO1xyXG5cclxuICAgICAgICAvLyBUaGUgZ3JvdW5kIGFuZCBwbGFjZWQgb2JqZWN0cyBhcmUgY3VycmVudGx5IHN0YXRpYyAobWFzcyAwKSwgc28gdGhlaXIgdmlzdWFsIG1lc2hlc1xyXG4gICAgICAgIC8vIGRvIG5vdCBuZWVkIHRvIGJlIHN5bmNocm9uaXplZCB3aXRoIHRoZWlyIHBoeXNpY3MgYm9kaWVzIGFmdGVyIGluaXRpYWwgcGxhY2VtZW50LlxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBTdGFydCB0aGUgZ2FtZSB3aGVuIHRoZSBET00gY29udGVudCBpcyBmdWxseSBsb2FkZWRcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcclxuICAgIG5ldyBHYW1lKCk7XHJcbn0pOyJdLAogICJtYXBwaW5ncyI6ICJBQUFBLFlBQVksV0FBVztBQUN2QixZQUFZLFlBQVk7QUFHeEIsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUZDLFNBQUFBO0FBQUEsR0FBQTtBQTJDTCxNQUFNLEtBQUs7QUFBQSxFQWtEUCxjQUFjO0FBaERkO0FBQUEsU0FBUSxRQUFtQjtBQXlCM0I7QUFBQSxTQUFRLHFCQUFtQyxDQUFDO0FBQzVDLFNBQVEscUJBQW9DLENBQUM7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
