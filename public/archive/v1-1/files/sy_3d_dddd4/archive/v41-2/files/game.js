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
    // NEW: Active bullets
    this.bullets = [];
    // Reusable material for bullets (using Basic to prevent lighting issues for simple bullets)
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
    // MODIFIED: Tracks player contacts with ANY static surface (ground or placed objects) for jumping/movement logic
    this.numContactsWithStaticSurfaces = 0;
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
    this.bulletMaterial = new CANNON.Material("bulletMaterial");
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
        friction: 0,
        // Use configurable player-ground friction from config
        restitution: 0
      }
    );
    this.world.addContactMaterial(objectGroundContactMaterial);
    const bulletGroundContactMaterial = new CANNON.ContactMaterial(
      this.bulletMaterial,
      this.groundMaterial,
      {
        friction: 0,
        restitution: 0
      }
    );
    this.world.addContactMaterial(bulletGroundContactMaterial);
    const bulletObjectContactMaterial = new CANNON.ContactMaterial(
      this.bulletMaterial,
      this.defaultObjectMaterial,
      {
        friction: 0,
        restitution: 0
      }
    );
    this.world.addContactMaterial(bulletObjectContactMaterial);
    await this.loadAssets();
    this.createGround();
    this.createPlayer();
    this.createPlacedObjects();
    this.setupLighting();
    this.bulletGeometry = new THREE.SphereGeometry(this.config.gameSettings.bullet.dimensions.radius, 8, 8);
    const bulletTexture = this.textures.get(this.config.gameSettings.bullet.textureName);
    this.bulletMaterialMesh = new THREE.MeshBasicMaterial({
      map: bulletTexture,
      color: bulletTexture ? 16777215 : 16776960
      // Yellow if no texture
    });
    this.world.addEventListener("beginContact", (event) => {
      let bodyA = event.bodyA;
      let bodyB = event.bodyB;
      if (bodyA === this.playerBody || bodyB === this.playerBody) {
        const otherBody = bodyA === this.playerBody ? bodyB : bodyA;
        if (otherBody.mass === 0) {
          this.numContactsWithStaticSurfaces++;
        }
      }
    });
    this.world.addEventListener("endContact", (event) => {
      let bodyA = event.bodyA;
      let bodyB = event.bodyB;
      if (bodyA === this.playerBody || bodyB === this.playerBody) {
        const otherBody = bodyA === this.playerBody ? bodyB : bodyA;
        if (otherBody.mass === 0) {
          this.numContactsWithStaticSurfaces = Math.max(0, this.numContactsWithStaticSurfaces - 1);
        }
      }
    });
    window.addEventListener("resize", this.onWindowResize.bind(this));
    document.addEventListener("keydown", this.onKeyDown.bind(this));
    document.addEventListener("keyup", this.onKeyUp.bind(this));
    document.addEventListener("mousemove", this.onMouseMove.bind(this));
    document.addEventListener("mousedown", this.onMouseDown.bind(this));
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
   * NEW: Handles mouse click for firing bullets.
   */
  onMouseDown(event) {
    if (this.state === 1 /* PLAYING */ && this.isPointerLocked && event.button === 0) {
      this.fireBullet();
    }
  }
  /**
   * NEW: Fires a bullet from the player's camera position and direction.
   */
  fireBullet() {
    const bulletConfig = this.config.gameSettings.bullet;
    const cameraWorldPosition = new THREE.Vector3();
    this.camera.getWorldPosition(cameraWorldPosition);
    const cameraWorldDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraWorldDirection);
    const bulletMesh = new THREE.Mesh(this.bulletGeometry, this.bulletMaterialMesh);
    bulletMesh.position.copy(cameraWorldPosition);
    this.scene.add(bulletMesh);
    const bulletShape = new CANNON.Sphere(bulletConfig.dimensions.radius);
    const bulletBody = new CANNON.Body({
      mass: bulletConfig.mass,
      position: new CANNON.Vec3(cameraWorldPosition.x, cameraWorldPosition.y, cameraWorldPosition.z),
      shape: bulletShape,
      material: this.bulletMaterial,
      // Bullets should not be affected by player movement, but should have gravity
      linearDamping: 0.01,
      // Small damping to prevent infinite sliding
      angularDamping: 0.99
      // Allows some rotation, but stops quickly
    });
    bulletBody.velocity.set(
      cameraWorldDirection.x * bulletConfig.speed,
      cameraWorldDirection.y * bulletConfig.speed,
      cameraWorldDirection.z * bulletConfig.speed
    );
    const activeBullet = {
      mesh: bulletMesh,
      body: bulletBody,
      creationTime: this.lastTime / 1e3,
      // Store creation time in seconds
      firePosition: bulletBody.position.clone()
      // Store initial fire position for range check
    };
    bulletBody.userData = activeBullet;
    bulletBody.addEventListener("collide", (event) => this.onBulletCollide(event, activeBullet));
    this.world.addBody(bulletBody);
    this.bullets.push(activeBullet);
    this.sounds.get("shoot_sound")?.play().catch((e) => console.log("Shoot sound play denied:", e));
  }
  /**
   * NEW: Handles bullet collisions.
   * @param event The Cannon.js collision event.
   * @param bullet The ActiveBullet instance that collided.
   */
  onBulletCollide(event, bullet) {
    if (!this.bullets.includes(bullet)) {
      return;
    }
    const collidedBody = event.body;
    const isGround = collidedBody === this.groundBody;
    const isPlacedObject = this.placedObjectBodies.includes(collidedBody);
    if (isGround || isPlacedObject) {
      this.removeBullet(bullet);
    }
  }
  /**
   * NEW: Removes a bullet from the scene, physics world, and active bullets array.
   * @param bulletToRemove The ActiveBullet instance to remove.
   */
  removeBullet(bulletToRemove) {
    this.scene.remove(bulletToRemove.mesh);
    this.world.removeBody(bulletToRemove.body);
    const index = this.bullets.indexOf(bulletToRemove);
    if (index !== -1) {
      this.bullets.splice(index, 1);
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
      this.updateBullets(deltaTime);
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
    if (this.numContactsWithStaticSurfaces === 0) {
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
      if (this.numContactsWithStaticSurfaces === 0) {
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
    if (this.numContactsWithStaticSurfaces > 0) {
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
   * NEW: Updates active bullets, syncing meshes, checking lifetime, and range.
   */
  updateBullets(deltaTime) {
    const currentTime = this.lastTime / 1e3;
    const halfGroundSize = this.config.gameSettings.groundSize / 2;
    const bulletConfig = this.config.gameSettings.bullet;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.mesh.position.copy(bullet.body.position);
      bullet.mesh.quaternion.copy(bullet.body.quaternion);
      if (currentTime - bullet.creationTime > bulletConfig.lifetime) {
        this.removeBullet(bullet);
        continue;
      }
      const bulletPos = bullet.body.position;
      const distanceToFirePoint = bulletPos.distanceTo(bullet.firePosition);
      if (bulletPos.x > halfGroundSize || bulletPos.x < -halfGroundSize || bulletPos.z > halfGroundSize || bulletPos.z < -halfGroundSize || distanceToFirePoint > bulletConfig.maxRange) {
        this.removeBullet(bullet);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuXHJcbi8vIEFkZCBtb2R1bGUgYXVnbWVudGF0aW9uIGZvciBDQU5OT04uQm9keSB0byBpbmNsdWRlIHVzZXJEYXRhXHJcbmRlY2xhcmUgbW9kdWxlICdjYW5ub24tZXMnIHtcclxuICAgIGludGVyZmFjZSBCb2R5IHtcclxuICAgICAgICB1c2VyRGF0YT86IEFjdGl2ZUJ1bGxldDsgLy8gQXR0YWNoIHRoZSBBY3RpdmVCdWxsZXQgaW5zdGFuY2VcclxuICAgIH1cclxufVxyXG5cclxuLy8gRGVmaW5lIGludGVyZmFjZSBmb3IgdGhlIENhbm5vbi1lcyAnY29sbGlkZScgZXZlbnRcclxuaW50ZXJmYWNlIENvbGxpZGVFdmVudCB7XHJcbiAgICAvLyBUaGUgdHlwZSBwcm9wZXJ0eSBpcyB1c3VhbGx5IHByZXNlbnQgb24gYWxsIENhbm5vbi5qcyBldmVudHNcclxuICAgIHR5cGU6IHN0cmluZztcclxuICAgIC8vIFRoZSAnY29sbGlkZScgZXZlbnQgc3BlY2lmaWNhbGx5IGhhcyB0aGVzZSBwcm9wZXJ0aWVzOlxyXG4gICAgYm9keTogQ0FOTk9OLkJvZHk7IC8vIFRoZSBvdGhlciBib2R5IGludm9sdmVkIGluIHRoZSBjb2xsaXNpb25cclxuICAgIHRhcmdldDogQ0FOTk9OLkJvZHk7IC8vIFRoZSBib2R5IHRoYXQgdGhlIGV2ZW50IGxpc3RlbmVyIGlzIGF0dGFjaGVkIHRvIChlLmcuLCB0aGUgYnVsbGV0Qm9keSlcclxuICAgIGNvbnRhY3Q6IENBTk5PTi5Db250YWN0RXF1YXRpb247IC8vIFRoZSBjb250YWN0IGVxdWF0aW9uIG9iamVjdFxyXG59XHJcblxyXG4vLyBFbnVtIHRvIGRlZmluZSB0aGUgcG9zc2libGUgc3RhdGVzIG9mIHRoZSBnYW1lXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFLCAgIC8vIFRpdGxlIHNjcmVlbiwgd2FpdGluZyBmb3IgdXNlciBpbnB1dFxyXG4gICAgUExBWUlORyAgLy8gR2FtZSBpcyBhY3RpdmUsIHVzZXIgY2FuIG1vdmUgYW5kIGxvb2sgYXJvdW5kXHJcbn1cclxuXHJcbi8vIEludGVyZmFjZSBmb3Igb2JqZWN0cyBwbGFjZWQgaW4gdGhlIHNjZW5lXHJcbmludGVyZmFjZSBQbGFjZWRPYmplY3RDb25maWcge1xyXG4gICAgbmFtZTogc3RyaW5nOyAvLyBBIGRlc2NyaXB0aXZlIG5hbWUgZm9yIHRoZSBvYmplY3QgaW5zdGFuY2VcclxuICAgIHRleHR1cmVOYW1lOiBzdHJpbmc7IC8vIE5hbWUgb2YgdGhlIHRleHR1cmUgZnJvbSBhc3NldHMuaW1hZ2VzXHJcbiAgICB0eXBlOiAnYm94JzsgLy8gQ3VycmVudGx5IG9ubHkgc3VwcG9ydHMgJ2JveCdcclxuICAgIHBvc2l0aW9uOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXIgfTtcclxuICAgIGRpbWVuc2lvbnM6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IGRlcHRoOiBudW1iZXIgfTtcclxuICAgIHJvdGF0aW9uWT86IG51bWJlcjsgLy8gT3B0aW9uYWwgcm90YXRpb24gYXJvdW5kIFktYXhpcyAocmFkaWFucylcclxuICAgIG1hc3M6IG51bWJlcjsgLy8gMCBmb3Igc3RhdGljLCA+MCBmb3IgZHluYW1pYyAodGhvdWdoIGFsbCBwbGFjZWQgb2JqZWN0cyBoZXJlIHdpbGwgYmUgc3RhdGljKVxyXG59XHJcblxyXG4vLyBORVc6IEludGVyZmFjZSBmb3IgYnVsbGV0IGNvbmZpZ3VyYXRpb25cclxuaW50ZXJmYWNlIEJ1bGxldENvbmZpZyB7XHJcbiAgICB0ZXh0dXJlTmFtZTogc3RyaW5nO1xyXG4gICAgZGltZW5zaW9uczogeyByYWRpdXM6IG51bWJlcjsgfTsgLy8gRm9yIGEgc3BoZXJlIGJ1bGxldFxyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIG1hc3M6IG51bWJlcjtcclxuICAgIGxpZmV0aW1lOiBudW1iZXI7IC8vIE1heCB0aW1lIGluIHNlY29uZHMgYmVmb3JlIGl0IGRlc3Bhd25zXHJcbiAgICBtYXhSYW5nZTogbnVtYmVyOyAvLyBNYXggZGlzdGFuY2UgZnJvbSBmaXJlIHBvaW50IGJlZm9yZSBpdCBkZXNwYXduc1xyXG4gICAgdm9sdW1lOiBudW1iZXI7IC8vIFNvdW5kIHZvbHVtZVxyXG59XHJcblxyXG4vLyBJbnRlcmZhY2UgdG8gdHlwZS1jaGVjayB0aGUgZ2FtZSBjb25maWd1cmF0aW9uIGxvYWRlZCBmcm9tIGRhdGEuanNvblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgICBnYW1lU2V0dGluZ3M6IHtcclxuICAgICAgICB0aXRsZVNjcmVlblRleHQ6IHN0cmluZztcclxuICAgICAgICBzdGFydEdhbWVQcm9tcHQ6IHN0cmluZztcclxuICAgICAgICBwbGF5ZXJTcGVlZDogbnVtYmVyO1xyXG4gICAgICAgIG1vdXNlU2Vuc2l0aXZpdHk6IG51bWJlcjtcclxuICAgICAgICBjYW1lcmFIZWlnaHRPZmZzZXQ6IG51bWJlcjsgLy8gVmVydGljYWwgb2Zmc2V0IG9mIHRoZSBjYW1lcmEgZnJvbSB0aGUgcGxheWVyJ3MgcGh5c2ljcyBib2R5IGNlbnRlclxyXG4gICAgICAgIGNhbWVyYU5lYXI6IG51bWJlcjsgICAgICAgICAvLyBOZWFyIGNsaXBwaW5nIHBsYW5lIGZvciB0aGUgY2FtZXJhXHJcbiAgICAgICAgY2FtZXJhRmFyOiBudW1iZXI7ICAgICAgICAgIC8vIEZhciBjbGlwcGluZyBwbGFuZSBmb3IgdGhlIGNhbWVyYVxyXG4gICAgICAgIHBsYXllck1hc3M6IG51bWJlcjsgICAgICAgICAvLyBNYXNzIG9mIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHlcclxuICAgICAgICBncm91bmRTaXplOiBudW1iZXI7ICAgICAgICAgLy8gU2l6ZSAod2lkdGgvZGVwdGgpIG9mIHRoZSBzcXVhcmUgZ3JvdW5kIHBsYW5lXHJcbiAgICAgICAgbWF4UGh5c2ljc1N1YlN0ZXBzOiBudW1iZXI7IC8vIE1heGltdW0gbnVtYmVyIG9mIHBoeXNpY3Mgc3Vic3RlcHMgcGVyIGZyYW1lIHRvIG1haW50YWluIHN0YWJpbGl0eVxyXG4gICAgICAgIGZpeGVkQXNwZWN0UmF0aW86IHsgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIgfTsgLy8gTmV3OiBGaXhlZCBhc3BlY3QgcmF0aW8gZm9yIHRoZSBnYW1lICh3aWR0aCAvIGhlaWdodClcclxuICAgICAgICBqdW1wRm9yY2U6IG51bWJlcjsgICAgICAgICAgLy8gQURERUQ6IEZvcmNlIGFwcGxpZWQgd2hlbiBqdW1waW5nXHJcbiAgICAgICAgcGxhY2VkT2JqZWN0czogUGxhY2VkT2JqZWN0Q29uZmlnW107IC8vIE5FVzogQXJyYXkgb2Ygb2JqZWN0cyB0byBwbGFjZSBpbiB0aGUgd29ybGRcclxuICAgICAgICAvLyBORVc6IENvbmZpZ3VyYWJsZSBwaHlzaWNzIHByb3BlcnRpZXNcclxuICAgICAgICBwbGF5ZXJHcm91bmRGcmljdGlvbjogbnVtYmVyOyAgICAgICAgLy8gRnJpY3Rpb24gY29lZmZpY2llbnQgZm9yIHBsYXllci1ncm91bmQgY29udGFjdFxyXG4gICAgICAgIHBsYXllckFpckNvbnRyb2xGYWN0b3I6IG51bWJlcjsgICAgLy8gTXVsdGlwbGllciBmb3IgcGxheWVyU3BlZWQgd2hlbiBhaXJib3JuZVxyXG4gICAgICAgIHBsYXllckFpckRlY2VsZXJhdGlvbjogbnVtYmVyOyAgICAgLy8gRGVjYXkgZmFjdG9yIGZvciBob3Jpem9udGFsIHZlbG9jaXR5IHdoZW4gYWlyYm9ybmUgYW5kIG5vdCBtb3ZpbmdcclxuICAgICAgICBidWxsZXQ6IEJ1bGxldENvbmZpZzsgLy8gTkVXOiBCdWxsZXQgY29uZmlndXJhdGlvblxyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfVtdO1xyXG4gICAgICAgIHNvdW5kczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyOyB2b2x1bWU6IG51bWJlciB9W107XHJcbiAgICB9O1xyXG59XHJcblxyXG4vLyBORVc6IEludGVyZmFjZSBmb3IgYW4gYWN0aXZlIGJ1bGxldCBpbnN0YW5jZVxyXG5pbnRlcmZhY2UgQWN0aXZlQnVsbGV0IHtcclxuICAgIG1lc2g6IFRIUkVFLk1lc2g7XHJcbiAgICBib2R5OiBDQU5OT04uQm9keTtcclxuICAgIGNyZWF0aW9uVGltZTogbnVtYmVyOyAvLyBVc2VkIGZvciBsaWZldGltZSBjaGVja1xyXG4gICAgZmlyZVBvc2l0aW9uOiBDQU5OT04uVmVjMzsgLy8gVXNlZCBmb3IgbWF4UmFuZ2UgY2hlY2tcclxufVxyXG5cclxuLyoqXHJcbiAqIE1haW4gR2FtZSBjbGFzcyByZXNwb25zaWJsZSBmb3IgaW5pdGlhbGl6aW5nIGFuZCBydW5uaW5nIHRoZSAzRCBnYW1lLlxyXG4gKiBJdCBoYW5kbGVzIFRocmVlLmpzIHJlbmRlcmluZywgQ2Fubm9uLWVzIHBoeXNpY3MsIGlucHV0LCBhbmQgZ2FtZSBzdGF0ZS5cclxuICovXHJcbmNsYXNzIEdhbWUge1xyXG4gICAgcHJpdmF0ZSBjb25maWchOiBHYW1lQ29uZmlnOyAvLyBHYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkIGZyb20gZGF0YS5qc29uXHJcbiAgICBwcml2YXRlIHN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7IC8vIEN1cnJlbnQgc3RhdGUgb2YgdGhlIGdhbWVcclxuXHJcbiAgICAvLyBUaHJlZS5qcyBlbGVtZW50cyBmb3IgcmVuZGVyaW5nXHJcbiAgICBwcml2YXRlIHNjZW5lITogVEhSRUUuU2NlbmU7XHJcbiAgICBwcml2YXRlIGNhbWVyYSE6IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhO1xyXG4gICAgcHJpdmF0ZSByZW5kZXJlciE6IFRIUkVFLldlYkdMUmVuZGVyZXI7XHJcbiAgICBwcml2YXRlIGNhbnZhcyE6IEhUTUxDYW52YXNFbGVtZW50OyAvLyBUaGUgSFRNTCBjYW52YXMgZWxlbWVudCBmb3IgcmVuZGVyaW5nXHJcblxyXG4gICAgLy8gTmV3OiBBIGNvbnRhaW5lciBvYmplY3QgZm9yIHRoZSBjYW1lcmEgdG8gaGFuZGxlIGhvcml6b250YWwgcm90YXRpb24gc2VwYXJhdGVseSBmcm9tIHZlcnRpY2FsIHBpdGNoLlxyXG4gICAgcHJpdmF0ZSBjYW1lcmFDb250YWluZXIhOiBUSFJFRS5PYmplY3QzRDsgXHJcblxyXG4gICAgLy8gQ2Fubm9uLWVzIGVsZW1lbnRzIGZvciBwaHlzaWNzXHJcbiAgICBwcml2YXRlIHdvcmxkITogQ0FOTk9OLldvcmxkO1xyXG4gICAgcHJpdmF0ZSBwbGF5ZXJCb2R5ITogQ0FOTk9OLkJvZHk7IC8vIFBoeXNpY3MgYm9keSBmb3IgdGhlIHBsYXllclxyXG4gICAgcHJpdmF0ZSBncm91bmRCb2R5ITogQ0FOTk9OLkJvZHk7IC8vIFBoeXNpY3MgYm9keSBmb3IgdGhlIGdyb3VuZFxyXG5cclxuICAgIC8vIE5FVzogQ2Fubm9uLWVzIG1hdGVyaWFscyBmb3IgcGh5c2ljc1xyXG4gICAgcHJpdmF0ZSBwbGF5ZXJNYXRlcmlhbCE6IENBTk5PTi5NYXRlcmlhbDtcclxuICAgIHByaXZhdGUgZ3JvdW5kTWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7XHJcbiAgICBwcml2YXRlIGRlZmF1bHRPYmplY3RNYXRlcmlhbCE6IENBTk5PTi5NYXRlcmlhbDsgLy8gQURERUQ6IE1hdGVyaWFsIGZvciBnZW5lcmljIHBsYWNlZCBvYmplY3RzXHJcbiAgICBwcml2YXRlIGJ1bGxldE1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsOyAvLyBORVc6IE1hdGVyaWFsIGZvciBidWxsZXRzXHJcblxyXG4gICAgLy8gVmlzdWFsIG1lc2hlcyAoVGhyZWUuanMpIGZvciBnYW1lIG9iamVjdHNcclxuICAgIHByaXZhdGUgcGxheWVyTWVzaCE6IFRIUkVFLk1lc2g7XHJcbiAgICBwcml2YXRlIGdyb3VuZE1lc2ghOiBUSFJFRS5NZXNoO1xyXG4gICAgLy8gTkVXOiBBcnJheXMgdG8gaG9sZCByZWZlcmVuY2VzIHRvIGR5bmFtaWNhbGx5IHBsYWNlZCBvYmplY3RzXHJcbiAgICBwcml2YXRlIHBsYWNlZE9iamVjdE1lc2hlczogVEhSRUUuTWVzaFtdID0gW107XHJcbiAgICBwcml2YXRlIHBsYWNlZE9iamVjdEJvZGllczogQ0FOTk9OLkJvZHlbXSA9IFtdO1xyXG5cclxuICAgIC8vIE5FVzogQWN0aXZlIGJ1bGxldHNcclxuICAgIHByaXZhdGUgYnVsbGV0czogQWN0aXZlQnVsbGV0W10gPSBbXTtcclxuICAgIHByaXZhdGUgYnVsbGV0R2VvbWV0cnkhOiBUSFJFRS5TcGhlcmVHZW9tZXRyeTsgLy8gUmV1c2FibGUgZ2VvbWV0cnkgZm9yIGJ1bGxldHNcclxuICAgIHByaXZhdGUgYnVsbGV0TWF0ZXJpYWxNZXNoITogVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWw7IC8vIFJldXNhYmxlIG1hdGVyaWFsIGZvciBidWxsZXRzICh1c2luZyBCYXNpYyB0byBwcmV2ZW50IGxpZ2h0aW5nIGlzc3VlcyBmb3Igc2ltcGxlIGJ1bGxldHMpXHJcblxyXG4gICAgLy8gSW5wdXQgaGFuZGxpbmcgc3RhdGVcclxuICAgIHByaXZhdGUga2V5czogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0gPSB7fTsgLy8gVHJhY2tzIGN1cnJlbnRseSBwcmVzc2VkIGtleXNcclxuICAgIHByaXZhdGUgaXNQb2ludGVyTG9ja2VkOiBib29sZWFuID0gZmFsc2U7IC8vIFRydWUgaWYgbW91c2UgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgIHByaXZhdGUgY2FtZXJhUGl0Y2g6IG51bWJlciA9IDA7IC8vIFZlcnRpY2FsIHJvdGF0aW9uIChwaXRjaCkgb2YgdGhlIGNhbWVyYVxyXG5cclxuICAgIC8vIEFzc2V0IG1hbmFnZW1lbnRcclxuICAgIHByaXZhdGUgdGV4dHVyZXM6IE1hcDxzdHJpbmcsIFRIUkVFLlRleHR1cmU+ID0gbmV3IE1hcCgpOyAvLyBTdG9yZXMgbG9hZGVkIHRleHR1cmVzXHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7IC8vIFN0b3JlcyBsb2FkZWQgYXVkaW8gZWxlbWVudHNcclxuXHJcbiAgICAvLyBVSSBlbGVtZW50cyAoZHluYW1pY2FsbHkgY3JlYXRlZCBmb3IgdGhlIHRpdGxlIHNjcmVlbilcclxuICAgIHByaXZhdGUgdGl0bGVTY3JlZW5PdmVybGF5ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHRpdGxlVGV4dCE6IEhUTUxEaXZFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBwcm9tcHRUZXh0ITogSFRNTERpdkVsZW1lbnQ7XHJcblxyXG4gICAgLy8gRm9yIGNhbGN1bGF0aW5nIGRlbHRhIHRpbWUgYmV0d2VlbiBmcmFtZXNcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXAgPSAwO1xyXG5cclxuICAgIC8vIE1PRElGSUVEOiBUcmFja3MgcGxheWVyIGNvbnRhY3RzIHdpdGggQU5ZIHN0YXRpYyBzdXJmYWNlIChncm91bmQgb3IgcGxhY2VkIG9iamVjdHMpIGZvciBqdW1waW5nL21vdmVtZW50IGxvZ2ljXHJcbiAgICBwcml2YXRlIG51bUNvbnRhY3RzV2l0aFN0YXRpY1N1cmZhY2VzOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgICAgIC8vIEdldCB0aGUgY2FudmFzIGVsZW1lbnQgZnJvbSBpbmRleC5odG1sXHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZUNhbnZhcycpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCBcImdhbWVDYW52YXNcIiBub3QgZm91bmQhJyk7XHJcbiAgICAgICAgICAgIHJldHVybjsgLy8gQ2Fubm90IHByb2NlZWQgd2l0aG91dCBhIGNhbnZhc1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmluaXQoKTsgLy8gU3RhcnQgdGhlIGFzeW5jaHJvbm91cyBpbml0aWFsaXphdGlvbiBwcm9jZXNzXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBc3luY2hyb25vdXNseSBpbml0aWFsaXplcyB0aGUgZ2FtZSwgbG9hZGluZyBjb25maWcsIGFzc2V0cywgYW5kIHNldHRpbmcgdXAgc3lzdGVtcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhc3luYyBpbml0KCkge1xyXG4gICAgICAgIC8vIDEuIExvYWQgZ2FtZSBjb25maWd1cmF0aW9uIGZyb20gZGF0YS5qc29uXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCBlcnJvciEgc3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ0dhbWUgY29uZmlndXJhdGlvbiBsb2FkZWQ6JywgdGhpcy5jb25maWcpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbjonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIC8vIElmIGNvbmZpZ3VyYXRpb24gZmFpbHMgdG8gbG9hZCwgZGlzcGxheSBhbiBlcnJvciBtZXNzYWdlIGFuZCBzdG9wLlxyXG4gICAgICAgICAgICBjb25zdCBlcnJvckRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRvcCA9ICc1MCUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5sZWZ0ID0gJzUwJSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRyYW5zZm9ybSA9ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5jb2xvciA9ICdyZWQnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5mb250U2l6ZSA9ICcyNHB4JztcclxuICAgICAgICAgICAgZXJyb3JEaXYudGV4dENvbnRlbnQgPSAnRXJyb3I6IEZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbi4gQ2hlY2sgY29uc29sZSBmb3IgZGV0YWlscy4nO1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVycm9yRGl2KTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gMi4gSW5pdGlhbGl6ZSBUaHJlZS5qcyAoc2NlbmUsIGNhbWVyYSwgcmVuZGVyZXIpXHJcbiAgICAgICAgdGhpcy5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKFxyXG4gICAgICAgICAgICA3NSwgLy8gRmllbGQgb2YgVmlldyAoRk9WKVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby53aWR0aCAvIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5maXhlZEFzcGVjdFJhdGlvLmhlaWdodCwgLy8gRml4ZWQgQXNwZWN0IHJhdGlvIGZyb20gY29uZmlnXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFOZWFyLCAvLyBOZWFyIGNsaXBwaW5nIHBsYW5lXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFGYXIgICAvLyBGYXIgY2xpcHBpbmcgcGxhbmVcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcih7IGNhbnZhczogdGhpcy5jYW52YXMsIGFudGlhbGlhczogdHJ1ZSB9KTtcclxuICAgICAgICAvLyBSZW5kZXJlciBzaXplIHdpbGwgYmUgc2V0IGJ5IGFwcGx5Rml4ZWRBc3BlY3RSYXRpbyB0byBmaXQgdGhlIHdpbmRvdyB3aGlsZSBtYWludGFpbmluZyBhc3BlY3QgcmF0aW9cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFBpeGVsUmF0aW8od2luZG93LmRldmljZVBpeGVsUmF0aW8pO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2hhZG93TWFwLmVuYWJsZWQgPSB0cnVlOyAvLyBFbmFibGUgc2hhZG93cyBmb3IgYmV0dGVyIHJlYWxpc21cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC50eXBlID0gVEhSRUUuUENGU29mdFNoYWRvd01hcDsgLy8gVXNlIHNvZnQgc2hhZG93c1xyXG5cclxuICAgICAgICAvLyBDYW1lcmEgc2V0dXAgZm9yIGRlY291cGxlZCB5YXcgYW5kIHBpdGNoOlxyXG4gICAgICAgIC8vIGNhbWVyYUNvbnRhaW5lciBoYW5kbGVzIHlhdyAoaG9yaXpvbnRhbCByb3RhdGlvbikgYW5kIGZvbGxvd3MgdGhlIHBsYXllcidzIHBvc2l0aW9uLlxyXG4gICAgICAgIC8vIFRoZSBjYW1lcmEgaXRzZWxmIGlzIGEgY2hpbGQgb2YgY2FtZXJhQ29udGFpbmVyIGFuZCBoYW5kbGVzIHBpdGNoICh2ZXJ0aWNhbCByb3RhdGlvbikuXHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIgPSBuZXcgVEhSRUUuT2JqZWN0M0QoKTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLmNhbWVyYUNvbnRhaW5lcik7XHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIuYWRkKHRoaXMuY2FtZXJhKTtcclxuICAgICAgICAvLyBQb3NpdGlvbiB0aGUgY2FtZXJhIHJlbGF0aXZlIHRvIHRoZSBjYW1lcmFDb250YWluZXIgKGF0IGV5ZSBsZXZlbClcclxuICAgICAgICB0aGlzLmNhbWVyYS5wb3NpdGlvbi55ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbWVyYUhlaWdodE9mZnNldDtcclxuXHJcblxyXG4gICAgICAgIC8vIDMuIEluaXRpYWxpemUgQ2Fubm9uLWVzIChwaHlzaWNzIHdvcmxkKVxyXG4gICAgICAgIHRoaXMud29ybGQgPSBuZXcgQ0FOTk9OLldvcmxkKCk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5ncmF2aXR5LnNldCgwLCAtOS44MiwgMCk7IC8vIFNldCBzdGFuZGFyZCBFYXJ0aCBncmF2aXR5IChZLWF4aXMgZG93bilcclxuICAgICAgICB0aGlzLndvcmxkLmJyb2FkcGhhc2UgPSBuZXcgQ0FOTk9OLlNBUEJyb2FkcGhhc2UodGhpcy53b3JsZCk7IC8vIFVzZSBhbiBlZmZpY2llbnQgYnJvYWRwaGFzZSBhbGdvcml0aG1cclxuICAgICAgICAvLyBGaXg6IENhc3QgdGhpcy53b3JsZC5zb2x2ZXIgdG8gQ0FOTk9OLkdTU29sdmVyIHRvIGFjY2VzcyB0aGUgJ2l0ZXJhdGlvbnMnIHByb3BlcnR5XHJcbiAgICAgICAgLy8gVGhlIGRlZmF1bHQgc29sdmVyIGluIENhbm5vbi5qcyAoYW5kIENhbm5vbi1lcykgaXMgR1NTb2x2ZXIsIHdoaWNoIGhhcyB0aGlzIHByb3BlcnR5LlxyXG4gICAgICAgICh0aGlzLndvcmxkLnNvbHZlciBhcyBDQU5OT04uR1NTb2x2ZXIpLml0ZXJhdGlvbnMgPSAxMDsgLy8gSW5jcmVhc2Ugc29sdmVyIGl0ZXJhdGlvbnMgZm9yIGJldHRlciBzdGFiaWxpdHlcclxuXHJcbiAgICAgICAgLy8gTkVXOiBDcmVhdGUgQ2Fubm9uLmpzIE1hdGVyaWFscyBhbmQgQ29udGFjdE1hdGVyaWFsIGZvciBwbGF5ZXItZ3JvdW5kIGludGVyYWN0aW9uXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ3BsYXllck1hdGVyaWFsJyk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ2dyb3VuZE1hdGVyaWFsJyk7XHJcbiAgICAgICAgdGhpcy5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdkZWZhdWx0T2JqZWN0TWF0ZXJpYWwnKTsgLy8gQURERUQ6IE1hdGVyaWFsIGZvciBnZW5lcmljIHBsYWNlZCBvYmplY3RzXHJcbiAgICAgICAgdGhpcy5idWxsZXRNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ2J1bGxldE1hdGVyaWFsJyk7IC8vIE5FVzogQnVsbGV0IG1hdGVyaWFsXHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllckdyb3VuZENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLnBsYXllck1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmdyb3VuZE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckdyb3VuZEZyaWN0aW9uLCAvLyBVc2UgY29uZmlndXJhYmxlIGdyb3VuZCBmcmljdGlvblxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCwgLy8gTm8gYm91bmNlIGZvciBncm91bmRcclxuICAgICAgICAgICAgICAgIC8vIE9wdGlvbmFsbHkgdHVuZSBjb250YWN0RXF1YXRpb25SZWxheGF0aW9uIGFuZCBmcmljdGlvbkVxdWF0aW9uUmVsYXhhdGlvbiBmb3Igc3RhYmlsaXR5L2ZlZWxcclxuICAgICAgICAgICAgICAgIC8vIGNvbnRhY3RFcXVhdGlvblJlbGF4YXRpb246IDMsIFxyXG4gICAgICAgICAgICAgICAgLy8gZnJpY3Rpb25FcXVhdGlvblJlbGF4YXRpb246IDNcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwocGxheWVyR3JvdW5kQ29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gQURERUQ6IFBsYXllci1PYmplY3QgY29udGFjdCBtYXRlcmlhbCAoZnJpY3Rpb24gYmV0d2VlbiBwbGF5ZXIgYW5kIHBsYWNlZCBvYmplY3RzKVxyXG4gICAgICAgIGNvbnN0IHBsYXllck9iamVjdENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLnBsYXllck1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRPYmplY3RNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJHcm91bmRGcmljdGlvbiwgLy8gU2FtZSBmcmljdGlvbiBhcyBwbGF5ZXItZ3JvdW5kXHJcbiAgICAgICAgICAgICAgICByZXN0aXR1dGlvbjogMC4wLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChwbGF5ZXJPYmplY3RDb250YWN0TWF0ZXJpYWwpO1xyXG5cclxuICAgICAgICAvLyBBRERFRDogT2JqZWN0LUdyb3VuZCBjb250YWN0IG1hdGVyaWFsIChmcmljdGlvbiBiZXR3ZWVuIHBsYWNlZCBvYmplY3RzIGFuZCBncm91bmQpXHJcbiAgICAgICAgLy8gVGhpcyBpcyBwcmltYXJpbHkgZm9yIGNvbnNpc3RlbmN5IGFuZCBpZiBwbGFjZWQgb2JqZWN0cyBtaWdodCBiZWNvbWUgZHluYW1pYyBsYXRlci5cclxuICAgICAgICBjb25zdCBvYmplY3RHcm91bmRDb250YWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICAgICAgdGhpcy5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZ3JvdW5kTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGZyaWN0aW9uOiAwLjAsIC8vIFVzZSBjb25maWd1cmFibGUgcGxheWVyLWdyb3VuZCBmcmljdGlvbiBmcm9tIGNvbmZpZ1xyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwob2JqZWN0R3JvdW5kQ29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gTkVXOiBCdWxsZXQtR3JvdW5kIGNvbnRhY3QgbWF0ZXJpYWwgKG5vIGZyaWN0aW9uLCBubyByZXN0aXR1dGlvbilcclxuICAgICAgICBjb25zdCBidWxsZXRHcm91bmRDb250YWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICAgICAgdGhpcy5idWxsZXRNYXRlcmlhbCxcclxuICAgICAgICAgICAgdGhpcy5ncm91bmRNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IDAuMCxcclxuICAgICAgICAgICAgICAgIHJlc3RpdHV0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKGJ1bGxldEdyb3VuZENvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogQnVsbGV0LU9iamVjdCBjb250YWN0IG1hdGVyaWFsIChubyBmcmljdGlvbiwgbm8gcmVzdGl0dXRpb24pXHJcbiAgICAgICAgY29uc3QgYnVsbGV0T2JqZWN0Q29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMuYnVsbGV0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogMC4wLFxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwoYnVsbGV0T2JqZWN0Q29udGFjdE1hdGVyaWFsKTtcclxuXHJcblxyXG4gICAgICAgIC8vIDQuIExvYWQgYXNzZXRzICh0ZXh0dXJlcyBhbmQgc291bmRzKVxyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG5cclxuICAgICAgICAvLyA1LiBDcmVhdGUgZ2FtZSBvYmplY3RzIChwbGF5ZXIsIGdyb3VuZCwgYW5kIG90aGVyIG9iamVjdHMpIGFuZCBsaWdodGluZ1xyXG4gICAgICAgIHRoaXMuY3JlYXRlR3JvdW5kKCk7IC8vIENyZWF0ZXMgdGhpcy5ncm91bmRCb2R5XHJcbiAgICAgICAgdGhpcy5jcmVhdGVQbGF5ZXIoKTsgLy8gQ3JlYXRlcyB0aGlzLnBsYXllckJvZHlcclxuICAgICAgICB0aGlzLmNyZWF0ZVBsYWNlZE9iamVjdHMoKTsgLy8gTkVXOiBDcmVhdGVzIG90aGVyIG9iamVjdHMgaW4gdGhlIHNjZW5lXHJcbiAgICAgICAgdGhpcy5zZXR1cExpZ2h0aW5nKCk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogQ3JlYXRlIHJldXNhYmxlIGJ1bGxldCBnZW9tZXRyeSBhbmQgbWF0ZXJpYWxcclxuICAgICAgICB0aGlzLmJ1bGxldEdlb21ldHJ5ID0gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5idWxsZXQuZGltZW5zaW9ucy5yYWRpdXMsIDgsIDgpO1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldFRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuYnVsbGV0LnRleHR1cmVOYW1lKTtcclxuICAgICAgICB0aGlzLmJ1bGxldE1hdGVyaWFsTWVzaCA9IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogYnVsbGV0VGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3I6IGJ1bGxldFRleHR1cmUgPyAweGZmZmZmZiA6IDB4ZmZmZjAwIC8vIFllbGxvdyBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIE1PRElGSUVEOiBTZXR1cCBDYW5ub24tZXMgY29udGFjdCBsaXN0ZW5lcnMgZm9yIGdlbmVyYWwgc3VyZmFjZSBjb250YWN0IGxvZ2ljXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRFdmVudExpc3RlbmVyKCdiZWdpbkNvbnRhY3QnLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgbGV0IGJvZHlBID0gZXZlbnQuYm9keUE7XHJcbiAgICAgICAgICAgIGxldCBib2R5QiA9IGV2ZW50LmJvZHlCO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgcGxheWVyQm9keSBpcyBpbnZvbHZlZCBpbiB0aGUgY29udGFjdFxyXG4gICAgICAgICAgICBpZiAoYm9keUEgPT09IHRoaXMucGxheWVyQm9keSB8fCBib2R5QiA9PT0gdGhpcy5wbGF5ZXJCb2R5KSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBvdGhlckJvZHkgPSBib2R5QSA9PT0gdGhpcy5wbGF5ZXJCb2R5ID8gYm9keUIgOiBib2R5QTtcclxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHRoZSBvdGhlciBib2R5IGlzIHN0YXRpYyAobWFzcyA9IDApLCB3aGljaCBpbmNsdWRlcyBncm91bmQgYW5kIHBsYWNlZCBvYmplY3RzXHJcbiAgICAgICAgICAgICAgICBpZiAob3RoZXJCb2R5Lm1hc3MgPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm51bUNvbnRhY3RzV2l0aFN0YXRpY1N1cmZhY2VzKys7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRFdmVudExpc3RlbmVyKCdlbmRDb250YWN0JywgKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgICAgIGxldCBib2R5QSA9IGV2ZW50LmJvZHlBO1xyXG4gICAgICAgICAgICBsZXQgYm9keUIgPSBldmVudC5ib2R5QjtcclxuXHJcbiAgICAgICAgICAgIGlmIChib2R5QSA9PT0gdGhpcy5wbGF5ZXJCb2R5IHx8IGJvZHlCID09PSB0aGlzLnBsYXllckJvZHkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG90aGVyQm9keSA9IGJvZHlBID09PSB0aGlzLnBsYXllckJvZHkgPyBib2R5QiA6IGJvZHlBO1xyXG4gICAgICAgICAgICAgICAgaWYgKG90aGVyQm9keS5tYXNzID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyA9IE1hdGgubWF4KDAsIHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgLSAxKTsgLy8gRW5zdXJlIGl0IGRvZXNuJ3QgZ28gYmVsb3cgMFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIDcuIFNldHVwIGV2ZW50IGxpc3RlbmVycyBmb3IgdXNlciBpbnB1dCBhbmQgd2luZG93IHJlc2l6aW5nXHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHRoaXMub25XaW5kb3dSZXNpemUuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMub25LZXlEb3duLmJpbmQodGhpcykpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5vbktleVVwLmJpbmQodGhpcykpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMub25Nb3VzZU1vdmUuYmluZCh0aGlzKSk7IC8vIEZvciBtb3VzZSBsb29rXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgdGhpcy5vbk1vdXNlRG93bi5iaW5kKHRoaXMpKTsgLy8gTkVXOiBGb3IgZmlyaW5nIGJ1bGxldHNcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRm9yIHBvaW50ZXIgbG9jayBzdGF0dXNcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3pwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRmlyZWZveCBjb21wYXRpYmlsaXR5XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0cG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7IC8vIFdlYmtpdCBjb21wYXRpYmlsaXR5XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGluaXRpYWwgZml4ZWQgYXNwZWN0IHJhdGlvIGFuZCBjZW50ZXIgdGhlIGNhbnZhc1xyXG4gICAgICAgIHRoaXMuYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCk7XHJcblxyXG4gICAgICAgIC8vIDguIFNldHVwIHRoZSB0aXRsZSBzY3JlZW4gVUlcclxuICAgICAgICB0aGlzLnNldHVwVGl0bGVTY3JlZW4oKTtcclxuXHJcbiAgICAgICAgLy8gU3RhcnQgdGhlIG1haW4gZ2FtZSBsb29wXHJcbiAgICAgICAgdGhpcy5hbmltYXRlKDApOyAvLyBQYXNzIGluaXRpYWwgdGltZSAwXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBMb2FkcyBhbGwgdGV4dHVyZXMgYW5kIHNvdW5kcyBkZWZpbmVkIGluIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEFzc2V0cygpIHtcclxuICAgICAgICBjb25zdCB0ZXh0dXJlTG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKTtcclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5tYXAoaW1nID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIHRleHR1cmVMb2FkZXIubG9hZEFzeW5jKGltZy5wYXRoKVxyXG4gICAgICAgICAgICAgICAgLnRoZW4odGV4dHVyZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlcy5zZXQoaW1nLm5hbWUsIHRleHR1cmUpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmUud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZzsgLy8gUmVwZWF0IHRleHR1cmUgaG9yaXpvbnRhbGx5XHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nOyAvLyBSZXBlYXQgdGV4dHVyZSB2ZXJ0aWNhbGx5XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQWRqdXN0IHRleHR1cmUgcmVwZXRpdGlvbiBmb3IgdGhlIGdyb3VuZCB0byBhdm9pZCBzdHJldGNoaW5nXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGltZy5uYW1lID09PSAnZ3JvdW5kX3RleHR1cmUnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLnJlcGVhdC5zZXQodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyA1LCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDUpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAvLyBGb3IgYm94IHRleHR1cmVzLCBlbnN1cmUgcmVwZXRpdGlvbiBpZiBkZXNpcmVkLCBvciBzZXQgdG8gMSwxIGZvciBzaW5nbGUgYXBwbGljYXRpb25cclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW1nLm5hbWUuZW5kc1dpdGgoJ190ZXh0dXJlJykpIHsgLy8gR2VuZXJpYyBjaGVjayBmb3Igb3RoZXIgdGV4dHVyZXNcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yIGdlbmVyaWMgYm94IHRleHR1cmVzLCB3ZSBtaWdodCB3YW50IHRvIHJlcGVhdCBiYXNlZCBvbiBvYmplY3QgZGltZW5zaW9uc1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGb3Igc2ltcGxpY2l0eSBub3csIGxldCdzIGtlZXAgZGVmYXVsdCAobm8gcmVwZWF0IHVubGVzcyBleHBsaWNpdCBmb3IgZ3JvdW5kKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBBIG1vcmUgcm9idXN0IHNvbHV0aW9uIHdvdWxkIGludm9sdmUgc2V0dGluZyByZXBlYXQgYmFzZWQgb24gc2NhbGUvZGltZW5zaW9ucyBmb3IgZWFjaCBvYmplY3RcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCB0ZXh0dXJlOiAke2ltZy5wYXRofWAsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICAvLyBDb250aW51ZSBldmVuIGlmIGFuIGFzc2V0IGZhaWxzIHRvIGxvYWQ7IGZhbGxiYWNrcyAoc29saWQgY29sb3JzKSBhcmUgdXNlZC5cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5tYXAoc291bmQgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKHNvdW5kLnBhdGgpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gc291bmQudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ubG9vcCA9IChzb3VuZC5uYW1lID09PSAnYmFja2dyb3VuZF9tdXNpYycpOyAvLyBMb29wIGJhY2tncm91bmQgbXVzaWNcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KHNvdW5kLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtzb3VuZC5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gUmVzb2x2ZSBldmVuIG9uIGVycm9yIHRvIG5vdCBibG9jayBQcm9taXNlLmFsbFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYEFzc2V0cyBsb2FkZWQ6ICR7dGhpcy50ZXh0dXJlcy5zaXplfSB0ZXh0dXJlcywgJHt0aGlzLnNvdW5kcy5zaXplfSBzb3VuZHMuYCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGFuZCBkaXNwbGF5cyB0aGUgdGl0bGUgc2NyZWVuIFVJIGR5bmFtaWNhbGx5LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNldHVwVGl0bGVTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LnN0eWxlLCB7XHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLCAvLyBQb3NpdGlvbiByZWxhdGl2ZSB0byBib2R5LCB3aWxsIGJlIGNlbnRlcmVkIGFuZCBzaXplZCBieSBhcHBseUZpeGVkQXNwZWN0UmF0aW9cclxuICAgICAgICAgICAgYmFja2dyb3VuZENvbG9yOiAncmdiYSgwLCAwLCAwLCAwLjgpJyxcclxuICAgICAgICAgICAgZGlzcGxheTogJ2ZsZXgnLCBmbGV4RGlyZWN0aW9uOiAnY29sdW1uJyxcclxuICAgICAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLCBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcclxuICAgICAgICAgICAgY29sb3I6ICd3aGl0ZScsIGZvbnRGYW1pbHk6ICdBcmlhbCwgc2Fucy1zZXJpZicsXHJcbiAgICAgICAgICAgIGZvbnRTaXplOiAnNDhweCcsIHRleHRBbGlnbjogJ2NlbnRlcicsIHpJbmRleDogJzEwMDAnXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSk7XHJcblxyXG4gICAgICAgIC8vIENydWNpYWw6IENhbGwgYXBwbHlGaXhlZEFzcGVjdFJhdGlvIGhlcmUgdG8gZW5zdXJlIHRoZSB0aXRsZSBzY3JlZW4gb3ZlcmxheVxyXG4gICAgICAgIC8vIGlzIHNpemVkIGFuZCBwb3NpdGlvbmVkIGNvcnJlY3RseSByZWxhdGl2ZSB0byB0aGUgY2FudmFzIGZyb20gdGhlIHN0YXJ0LlxyXG4gICAgICAgIHRoaXMuYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCk7XHJcblxyXG4gICAgICAgIHRoaXMudGl0bGVUZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy50aXRsZVRleHQudGV4dENvbnRlbnQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MudGl0bGVTY3JlZW5UZXh0O1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LmFwcGVuZENoaWxkKHRoaXMudGl0bGVUZXh0KTtcclxuXHJcbiAgICAgICAgdGhpcy5wcm9tcHRUZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy5wcm9tcHRUZXh0LnRleHRDb250ZW50ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnN0YXJ0R2FtZVByb21wdDtcclxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMucHJvbXB0VGV4dC5zdHlsZSwge1xyXG4gICAgICAgICAgICBtYXJnaW5Ub3A6ICcyMHB4JywgZm9udFNpemU6ICcyNHB4J1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LmFwcGVuZENoaWxkKHRoaXMucHJvbXB0VGV4dCk7XHJcblxyXG4gICAgICAgIC8vIEFkZCBldmVudCBsaXN0ZW5lciBkaXJlY3RseSB0byB0aGUgb3ZlcmxheSB0byBjYXB0dXJlIGNsaWNrcyBhbmQgc3RhcnQgdGhlIGdhbWVcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRoaXMuc3RhcnRHYW1lKCkpO1xyXG5cclxuICAgICAgICAvLyBBdHRlbXB0IHRvIHBsYXkgYmFja2dyb3VuZCBtdXNpYy4gSXQgbWlnaHQgYmUgYmxvY2tlZCBieSBicm93c2VycyBpZiBubyB1c2VyIGdlc3R1cmUgaGFzIG9jY3VycmVkIHlldC5cclxuICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ2JhY2tncm91bmRfbXVzaWMnKT8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJCR00gcGxheSBkZW5pZWQgKHJlcXVpcmVzIHVzZXIgZ2VzdHVyZSk6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRyYW5zaXRpb25zIHRoZSBnYW1lIGZyb20gdGhlIHRpdGxlIHNjcmVlbiB0byB0aGUgcGxheWluZyBzdGF0ZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKSB7XHJcbiAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgIC8vIFJlbW92ZSB0aGUgdGl0bGUgc2NyZWVuIG92ZXJsYXlcclxuICAgICAgICBpZiAodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkgJiYgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkucGFyZW50Tm9kZSkge1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gQWRkIGV2ZW50IGxpc3RlbmVyIHRvIGNhbnZhcyBmb3IgcmUtbG9ja2luZyBwb2ludGVyIGFmdGVyIHRpdGxlIHNjcmVlbiBpcyBnb25lXHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmhhbmRsZUNhbnZhc1JlTG9ja1BvaW50ZXIuYmluZCh0aGlzKSk7XHJcblxyXG4gICAgICAgIC8vIFJlcXVlc3QgcG9pbnRlciBsb2NrIGZvciBpbW1lcnNpdmUgbW91c2UgY29udHJvbFxyXG4gICAgICAgIHRoaXMuY2FudmFzLnJlcXVlc3RQb2ludGVyTG9jaygpO1xyXG4gICAgICAgIC8vIEVuc3VyZSBiYWNrZ3JvdW5kIG11c2ljIHBsYXlzIG5vdyB0aGF0IGEgdXNlciBnZXN0dXJlIGhhcyBvY2N1cnJlZFxyXG4gICAgICAgIHRoaXMuc291bmRzLmdldCgnYmFja2dyb3VuZF9tdXNpYycpPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIkJHTSBwbGF5IGZhaWxlZCBhZnRlciB1c2VyIGdlc3R1cmU6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgY2xpY2tzIG9uIHRoZSBjYW52YXMgdG8gcmUtbG9jayB0aGUgcG9pbnRlciBpZiB0aGUgZ2FtZSBpcyBwbGF5aW5nIGFuZCB1bmxvY2tlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVDYW52YXNSZUxvY2tQb2ludGVyKCkge1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiAhdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMucmVxdWVzdFBvaW50ZXJMb2NrKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyB0aGUgcGxheWVyJ3MgdmlzdWFsIG1lc2ggYW5kIHBoeXNpY3MgYm9keS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVQbGF5ZXIoKSB7XHJcbiAgICAgICAgLy8gUGxheWVyIHZpc3VhbCBtZXNoIChhIHNpbXBsZSBib3gpXHJcbiAgICAgICAgY29uc3QgcGxheWVyVGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KCdwbGF5ZXJfdGV4dHVyZScpO1xyXG4gICAgICAgIGNvbnN0IHBsYXllck1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICBtYXA6IHBsYXllclRleHR1cmUsXHJcbiAgICAgICAgICAgIGNvbG9yOiBwbGF5ZXJUZXh0dXJlID8gMHhmZmZmZmYgOiAweDAwNzdmZiAvLyBVc2Ugd2hpdGUgd2l0aCB0ZXh0dXJlLCBvciBibHVlIGlmIG5vIHRleHR1cmVcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBwbGF5ZXJHZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgxLCAyLCAxKTsgLy8gUGxheWVyIGRpbWVuc2lvbnNcclxuICAgICAgICB0aGlzLnBsYXllck1lc2ggPSBuZXcgVEhSRUUuTWVzaChwbGF5ZXJHZW9tZXRyeSwgcGxheWVyTWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi55ID0gNTsgLy8gU3RhcnQgcGxheWVyIHNsaWdodGx5IGFib3ZlIHRoZSBncm91bmRcclxuICAgICAgICB0aGlzLnBsYXllck1lc2guY2FzdFNoYWRvdyA9IHRydWU7IC8vIFBsYXllciBjYXN0cyBhIHNoYWRvd1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMucGxheWVyTWVzaCk7XHJcblxyXG4gICAgICAgIC8vIFBsYXllciBwaHlzaWNzIGJvZHkgKENhbm5vbi5qcyBib3ggc2hhcGUpXHJcbiAgICAgICAgY29uc3QgcGxheWVyU2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoMC41LCAxLCAwLjUpKTsgLy8gSGFsZiBleHRlbnRzIG9mIHRoZSBib3ggZm9yIGNvbGxpc2lvblxyXG4gICAgICAgIHRoaXMucGxheWVyQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJNYXNzLCAvLyBQbGF5ZXIncyBtYXNzXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzModGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLngsIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi55LCB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgIHNoYXBlOiBwbGF5ZXJTaGFwZSxcclxuICAgICAgICAgICAgZml4ZWRSb3RhdGlvbjogdHJ1ZSwgLy8gUHJldmVudCB0aGUgcGxheWVyIGZyb20gZmFsbGluZyBvdmVyIChzaW11bGF0ZXMgYSBjYXBzdWxlL2N5bGluZGVyIGNoYXJhY3RlcilcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMucGxheWVyTWF0ZXJpYWwgLy8gQXNzaWduIHRoZSBwbGF5ZXIgbWF0ZXJpYWwgZm9yIGNvbnRhY3QgcmVzb2x1dGlvblxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLnBsYXllckJvZHkpO1xyXG5cclxuICAgICAgICAvLyBTZXQgaW5pdGlhbCBjYW1lcmFDb250YWluZXIgcG9zaXRpb24gdG8gcGxheWVyJ3MgcGh5c2ljcyBib2R5IHBvc2l0aW9uLlxyXG4gICAgICAgIC8vIFRoZSBjYW1lcmEgaXRzZWxmIGlzIGEgY2hpbGQgb2YgY2FtZXJhQ29udGFpbmVyIGFuZCBoYXMgaXRzIG93biBsb2NhbCBZIG9mZnNldC5cclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyB0aGUgZ3JvdW5kJ3MgdmlzdWFsIG1lc2ggYW5kIHBoeXNpY3MgYm9keS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVHcm91bmQoKSB7XHJcbiAgICAgICAgLy8gR3JvdW5kIHZpc3VhbCBtZXNoIChhIGxhcmdlIHBsYW5lKVxyXG4gICAgICAgIGNvbnN0IGdyb3VuZFRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgnZ3JvdW5kX3RleHR1cmUnKTtcclxuICAgICAgICBjb25zdCBncm91bmRNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgbWFwOiBncm91bmRUZXh0dXJlLFxyXG4gICAgICAgICAgICBjb2xvcjogZ3JvdW5kVGV4dHVyZSA/IDB4ZmZmZmZmIDogMHg4ODg4ODggLy8gVXNlIHdoaXRlIHdpdGggdGV4dHVyZSwgb3IgZ3JleSBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kR2VvbWV0cnkgPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeSh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdyb3VuZEdlb21ldHJ5LCBncm91bmRNYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRNZXNoLnJvdGF0aW9uLnggPSAtTWF0aC5QSSAvIDI7IC8vIFJvdGF0ZSB0byBsYXkgZmxhdCBvbiB0aGUgWFogcGxhbmVcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7IC8vIEdyb3VuZCByZWNlaXZlcyBzaGFkb3dzXHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5ncm91bmRNZXNoKTtcclxuXHJcbiAgICAgICAgLy8gR3JvdW5kIHBoeXNpY3MgYm9keSAoQ2Fubm9uLmpzIHBsYW5lIHNoYXBlKVxyXG4gICAgICAgIGNvbnN0IGdyb3VuZFNoYXBlID0gbmV3IENBTk5PTi5QbGFuZSgpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IDAsIC8vIEEgbWFzcyBvZiAwIG1ha2VzIGl0IGEgc3RhdGljIChpbW1vdmFibGUpIGJvZHlcclxuICAgICAgICAgICAgc2hhcGU6IGdyb3VuZFNoYXBlLFxyXG4gICAgICAgICAgICBtYXRlcmlhbDogdGhpcy5ncm91bmRNYXRlcmlhbCAvLyBBc3NpZ24gdGhlIGdyb3VuZCBtYXRlcmlhbCBmb3IgY29udGFjdCByZXNvbHV0aW9uXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgLy8gUm90YXRlIHRoZSBDYW5ub24uanMgcGxhbmUgYm9keSB0byBtYXRjaCB0aGUgVGhyZWUuanMgcGxhbmUgb3JpZW50YXRpb24gKGZsYXQpXHJcbiAgICAgICAgdGhpcy5ncm91bmRCb2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShuZXcgQ0FOTk9OLlZlYzMoMSwgMCwgMCksIC1NYXRoLlBJIC8gMik7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KHRoaXMuZ3JvdW5kQm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IENyZWF0ZXMgdmlzdWFsIG1lc2hlcyBhbmQgcGh5c2ljcyBib2RpZXMgZm9yIGFsbCBvYmplY3RzIGRlZmluZWQgaW4gY29uZmlnLmdhbWVTZXR0aW5ncy5wbGFjZWRPYmplY3RzLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNyZWF0ZVBsYWNlZE9iamVjdHMoKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxhY2VkT2JqZWN0cykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJObyBwbGFjZWRPYmplY3RzIGRlZmluZWQgaW4gZ2FtZVNldHRpbmdzLlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYWNlZE9iamVjdHMuZm9yRWFjaChvYmpDb25maWcgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQob2JqQ29uZmlnLnRleHR1cmVOYW1lKTtcclxuICAgICAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgICAgICBtYXA6IHRleHR1cmUsXHJcbiAgICAgICAgICAgICAgICBjb2xvcjogdGV4dHVyZSA/IDB4ZmZmZmZmIDogMHhhYWFhYWEgLy8gRGVmYXVsdCBncmV5IGlmIG5vIHRleHR1cmVcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvLyBDcmVhdGUgVGhyZWUuanMgTWVzaFxyXG4gICAgICAgICAgICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeShvYmpDb25maWcuZGltZW5zaW9ucy53aWR0aCwgb2JqQ29uZmlnLmRpbWVuc2lvbnMuaGVpZ2h0LCBvYmpDb25maWcuZGltZW5zaW9ucy5kZXB0aCk7XHJcbiAgICAgICAgICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSwgbWF0ZXJpYWwpO1xyXG4gICAgICAgICAgICBtZXNoLnBvc2l0aW9uLnNldChvYmpDb25maWcucG9zaXRpb24ueCwgb2JqQ29uZmlnLnBvc2l0aW9uLnksIG9iakNvbmZpZy5wb3NpdGlvbi56KTtcclxuICAgICAgICAgICAgaWYgKG9iakNvbmZpZy5yb3RhdGlvblkgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgbWVzaC5yb3RhdGlvbi55ID0gb2JqQ29uZmlnLnJvdGF0aW9uWTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICBtZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZChtZXNoKTtcclxuICAgICAgICAgICAgdGhpcy5wbGFjZWRPYmplY3RNZXNoZXMucHVzaChtZXNoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIENyZWF0ZSBDYW5ub24uanMgQm9keVxyXG4gICAgICAgICAgICAvLyBDYW5ub24uQm94IHRha2VzIGhhbGYgZXh0ZW50c1xyXG4gICAgICAgICAgICBjb25zdCBzaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhcclxuICAgICAgICAgICAgICAgIG9iakNvbmZpZy5kaW1lbnNpb25zLndpZHRoIC8gMixcclxuICAgICAgICAgICAgICAgIG9iakNvbmZpZy5kaW1lbnNpb25zLmhlaWdodCAvIDIsXHJcbiAgICAgICAgICAgICAgICBvYmpDb25maWcuZGltZW5zaW9ucy5kZXB0aCAvIDJcclxuICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICAgICAgbWFzczogb2JqQ29uZmlnLm1hc3MsIC8vIFVzZSAwIGZvciBzdGF0aWMgb2JqZWN0cywgPjAgZm9yIGR5bmFtaWNcclxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMob2JqQ29uZmlnLnBvc2l0aW9uLngsIG9iakNvbmZpZy5wb3NpdGlvbi55LCBvYmpDb25maWcucG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgICAgICBzaGFwZTogc2hhcGUsXHJcbiAgICAgICAgICAgICAgICBtYXRlcmlhbDogdGhpcy5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwgLy8gQURERUQ6IEFzc2lnbiB0aGUgZGVmYXVsdCBvYmplY3QgbWF0ZXJpYWxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIGlmIChvYmpDb25maWcucm90YXRpb25ZICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIGJvZHkucXVhdGVybmlvbi5zZXRGcm9tQXhpc0FuZ2xlKG5ldyBDQU5OT04uVmVjMygwLCAxLCAwKSwgb2JqQ29uZmlnLnJvdGF0aW9uWSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KGJvZHkpO1xyXG4gICAgICAgICAgICB0aGlzLnBsYWNlZE9iamVjdEJvZGllcy5wdXNoKGJvZHkpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBDcmVhdGVkICR7dGhpcy5wbGFjZWRPYmplY3RNZXNoZXMubGVuZ3RofSBwbGFjZWQgb2JqZWN0cy5gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdXAgYW1iaWVudCBhbmQgZGlyZWN0aW9uYWwgbGlnaHRpbmcgaW4gdGhlIHNjZW5lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNldHVwTGlnaHRpbmcoKSB7XHJcbiAgICAgICAgY29uc3QgYW1iaWVudExpZ2h0ID0gbmV3IFRIUkVFLkFtYmllbnRMaWdodCgweDQwNDA0MCwgMS4wKTsgLy8gU29mdCB3aGl0ZSBhbWJpZW50IGxpZ2h0XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoYW1iaWVudExpZ2h0KTtcclxuXHJcbiAgICAgICAgY29uc3QgZGlyZWN0aW9uYWxMaWdodCA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KDB4ZmZmZmZmLCAwLjgpOyAvLyBCcmlnaHRlciBkaXJlY3Rpb25hbCBsaWdodFxyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQucG9zaXRpb24uc2V0KDUsIDEwLCA1KTsgLy8gUG9zaXRpb24gdGhlIGxpZ2h0IHNvdXJjZVxyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuY2FzdFNoYWRvdyA9IHRydWU7IC8vIEVuYWJsZSBzaGFkb3dzIGZyb20gdGhpcyBsaWdodCBzb3VyY2VcclxuICAgICAgICAvLyBDb25maWd1cmUgc2hhZG93IHByb3BlcnRpZXMgZm9yIHRoZSBkaXJlY3Rpb25hbCBsaWdodFxyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93Lm1hcFNpemUud2lkdGggPSAxMDI0O1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93Lm1hcFNpemUuaGVpZ2h0ID0gMTAyNDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEubmVhciA9IDAuNTtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEuZmFyID0gNTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmxlZnQgPSAtMTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLnJpZ2h0ID0gMTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLnRvcCA9IDEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5ib3R0b20gPSAtMTA7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoZGlyZWN0aW9uYWxMaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGVzIHdpbmRvdyByZXNpemluZyB0byBrZWVwIHRoZSBjYW1lcmEgYXNwZWN0IHJhdGlvIGFuZCByZW5kZXJlciBzaXplIGNvcnJlY3QuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25XaW5kb3dSZXNpemUoKSB7XHJcbiAgICAgICAgdGhpcy5hcHBseUZpeGVkQXNwZWN0UmF0aW8oKTsgLy8gQXBwbHkgdGhlIGZpeGVkIGFzcGVjdCByYXRpbyBhbmQgY2VudGVyIHRoZSBjYW52YXNcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFwcGxpZXMgdGhlIGNvbmZpZ3VyZWQgZml4ZWQgYXNwZWN0IHJhdGlvIHRvIHRoZSByZW5kZXJlciBhbmQgY2FtZXJhLFxyXG4gICAgICogcmVzaXppbmcgYW5kIGNlbnRlcmluZyB0aGUgY2FudmFzIHRvIGZpdCB3aXRoaW4gdGhlIHdpbmRvdy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhcHBseUZpeGVkQXNwZWN0UmF0aW8oKSB7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0QXNwZWN0UmF0aW8gPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby53aWR0aCAvIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5maXhlZEFzcGVjdFJhdGlvLmhlaWdodDtcclxuXHJcbiAgICAgICAgbGV0IG5ld1dpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgbGV0IG5ld0hlaWdodDogbnVtYmVyO1xyXG5cclxuICAgICAgICBjb25zdCB3aW5kb3dXaWR0aCA9IHdpbmRvdy5pbm5lcldpZHRoO1xyXG4gICAgICAgIGNvbnN0IHdpbmRvd0hlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodDtcclxuICAgICAgICBjb25zdCBjdXJyZW50V2luZG93QXNwZWN0UmF0aW8gPSB3aW5kb3dXaWR0aCAvIHdpbmRvd0hlaWdodDtcclxuXHJcbiAgICAgICAgaWYgKGN1cnJlbnRXaW5kb3dBc3BlY3RSYXRpbyA+IHRhcmdldEFzcGVjdFJhdGlvKSB7XHJcbiAgICAgICAgICAgIC8vIFdpbmRvdyBpcyB3aWRlciB0aGFuIHRhcmdldCBhc3BlY3QgcmF0aW8sIGhlaWdodCBpcyB0aGUgbGltaXRpbmcgZmFjdG9yXHJcbiAgICAgICAgICAgIG5ld0hlaWdodCA9IHdpbmRvd0hlaWdodDtcclxuICAgICAgICAgICAgbmV3V2lkdGggPSBuZXdIZWlnaHQgKiB0YXJnZXRBc3BlY3RSYXRpbztcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBXaW5kb3cgaXMgdGFsbGVyIChvciBleGFjdGx5KSB0aGUgdGFyZ2V0IGFzcGVjdCByYXRpbywgd2lkdGggaXMgdGhlIGxpbWl0aW5nIGZhY3RvclxyXG4gICAgICAgICAgICBuZXdXaWR0aCA9IHdpbmRvd1dpZHRoO1xyXG4gICAgICAgICAgICBuZXdIZWlnaHQgPSBuZXdXaWR0aCAvIHRhcmdldEFzcGVjdFJhdGlvO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU2V0IHJlbmRlcmVyIHNpemUuIFRoZSB0aGlyZCBhcmd1bWVudCBgdXBkYXRlU3R5bGVgIGlzIGZhbHNlIGJlY2F1c2Ugd2UgbWFuYWdlIHN0eWxlIG1hbnVhbGx5LlxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZShuZXdXaWR0aCwgbmV3SGVpZ2h0LCBmYWxzZSk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuYXNwZWN0ID0gdGFyZ2V0QXNwZWN0UmF0aW87XHJcbiAgICAgICAgdGhpcy5jYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xyXG5cclxuICAgICAgICAvLyBQb3NpdGlvbiBhbmQgc2l6ZSB0aGUgY2FudmFzIGVsZW1lbnQgdXNpbmcgQ1NTXHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLmNhbnZhcy5zdHlsZSwge1xyXG4gICAgICAgICAgICB3aWR0aDogYCR7bmV3V2lkdGh9cHhgLFxyXG4gICAgICAgICAgICBoZWlnaHQ6IGAke25ld0hlaWdodH1weGAsXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxyXG4gICAgICAgICAgICB0b3A6ICc1MCUnLFxyXG4gICAgICAgICAgICBsZWZ0OiAnNTAlJyxcclxuICAgICAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsIC01MCUpJyxcclxuICAgICAgICAgICAgb2JqZWN0Rml0OiAnY29udGFpbicgLy8gRW5zdXJlcyBjb250ZW50IGlzIHNjYWxlZCBhcHByb3ByaWF0ZWx5IGlmIHRoZXJlJ3MgYW55IG1pc21hdGNoXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZSB0aXRsZSBzY3JlZW4gaXMgYWN0aXZlLCB1cGRhdGUgaXRzIHNpemUgYW5kIHBvc2l0aW9uIGFzIHdlbGwgdG8gbWF0Y2ggdGhlIGNhbnZhc1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUgJiYgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkpIHtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5zdHlsZSwge1xyXG4gICAgICAgICAgICAgICAgd2lkdGg6IGAke25ld1dpZHRofXB4YCxcclxuICAgICAgICAgICAgICAgIGhlaWdodDogYCR7bmV3SGVpZ2h0fXB4YCxcclxuICAgICAgICAgICAgICAgIHRvcDogJzUwJScsXHJcbiAgICAgICAgICAgICAgICBsZWZ0OiAnNTAlJyxcclxuICAgICAgICAgICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLCAtNTAlKScsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlY29yZHMgd2hpY2gga2V5cyBhcmUgY3VycmVudGx5IHByZXNzZWQgZG93bi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbktleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcclxuICAgICAgICB0aGlzLmtleXNbZXZlbnQua2V5LnRvTG93ZXJDYXNlKCldID0gdHJ1ZTtcclxuICAgICAgICAvLyBBRERFRDogSGFuZGxlIGp1bXAgaW5wdXQgb25seSB3aGVuIHBsYXlpbmcgYW5kIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmIHRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIGlmIChldmVudC5rZXkudG9Mb3dlckNhc2UoKSA9PT0gJyAnKSB7IC8vIFNwYWNlYmFyXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckp1bXAoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlY29yZHMgd2hpY2gga2V5cyBhcmUgY3VycmVudGx5IHJlbGVhc2VkLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uS2V5VXAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcclxuICAgICAgICB0aGlzLmtleXNbZXZlbnQua2V5LnRvTG93ZXJDYXNlKCldID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGVzIG1vdXNlIG1vdmVtZW50IGZvciBjYW1lcmEgcm90YXRpb24gKG1vdXNlIGxvb2spLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uTW91c2VNb3ZlKGV2ZW50OiBNb3VzZUV2ZW50KSB7XHJcbiAgICAgICAgLy8gT25seSBwcm9jZXNzIG1vdXNlIG1vdmVtZW50IGlmIHRoZSBnYW1lIGlzIHBsYXlpbmcgYW5kIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmIHRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG1vdmVtZW50WCA9IGV2ZW50Lm1vdmVtZW50WCB8fCAwO1xyXG4gICAgICAgICAgICBjb25zdCBtb3ZlbWVudFkgPSBldmVudC5tb3ZlbWVudFkgfHwgMDtcclxuXHJcbiAgICAgICAgICAgIC8vIEFwcGx5IGhvcml6b250YWwgcm90YXRpb24gKHlhdykgdG8gdGhlIGNhbWVyYUNvbnRhaW5lciBhcm91bmQgaXRzIGxvY2FsIFktYXhpcyAod2hpY2ggaXMgZ2xvYmFsIFkpXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLnJvdGF0aW9uLnkgLT0gbW92ZW1lbnRYICogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm1vdXNlU2Vuc2l0aXZpdHk7XHJcblxyXG4gICAgICAgICAgICAvLyBBcHBseSB2ZXJ0aWNhbCByb3RhdGlvbiAocGl0Y2gpIHRvIHRoZSBjYW1lcmEgaXRzZWxmIGFuZCBjbGFtcCBpdFxyXG4gICAgICAgICAgICAvLyBNb3VzZSBVUCAobW92ZW1lbnRZIDwgMCkgbm93IGluY3JlYXNlcyBjYW1lcmFQaXRjaCAtPiBsb29rcyB1cC5cclxuICAgICAgICAgICAgLy8gTW91c2UgRE9XTiAobW92ZW1lbnRZID4gMCkgbm93IGRlY3JlYXNlcyBjYW1lcmFQaXRjaCAtPiBsb29rcyBkb3duLlxyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYVBpdGNoIC09IG1vdmVtZW50WSAqIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5tb3VzZVNlbnNpdGl2aXR5OyBcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFQaXRjaCA9IE1hdGgubWF4KC1NYXRoLlBJIC8gMiwgTWF0aC5taW4oTWF0aC5QSSAvIDIsIHRoaXMuY2FtZXJhUGl0Y2gpKTsgLy8gQ2xhbXAgdG8gLTkwIHRvICs5MCBkZWdyZWVzXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnJvdGF0aW9uLnggPSB0aGlzLmNhbWVyYVBpdGNoO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogSGFuZGxlcyBtb3VzZSBjbGljayBmb3IgZmlyaW5nIGJ1bGxldHMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25Nb3VzZURvd24oZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgdGhpcy5pc1BvaW50ZXJMb2NrZWQgJiYgZXZlbnQuYnV0dG9uID09PSAwKSB7IC8vIExlZnQgbW91c2UgYnV0dG9uXHJcbiAgICAgICAgICAgIHRoaXMuZmlyZUJ1bGxldCgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogRmlyZXMgYSBidWxsZXQgZnJvbSB0aGUgcGxheWVyJ3MgY2FtZXJhIHBvc2l0aW9uIGFuZCBkaXJlY3Rpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgZmlyZUJ1bGxldCgpIHtcclxuICAgICAgICBjb25zdCBidWxsZXRDb25maWcgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuYnVsbGV0O1xyXG5cclxuICAgICAgICAvLyAxLiBHZXQgYnVsbGV0IGluaXRpYWwgcG9zaXRpb24gYW5kIGRpcmVjdGlvblxyXG4gICAgICAgIGNvbnN0IGNhbWVyYVdvcmxkUG9zaXRpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24oY2FtZXJhV29ybGRQb3NpdGlvbik7XHJcblxyXG4gICAgICAgIGNvbnN0IGNhbWVyYVdvcmxkRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZERpcmVjdGlvbihjYW1lcmFXb3JsZERpcmVjdGlvbik7XHJcblxyXG4gICAgICAgIC8vIDIuIENyZWF0ZSBUaHJlZS5qcyBNZXNoIGZvciB0aGUgYnVsbGV0XHJcbiAgICAgICAgY29uc3QgYnVsbGV0TWVzaCA9IG5ldyBUSFJFRS5NZXNoKHRoaXMuYnVsbGV0R2VvbWV0cnksIHRoaXMuYnVsbGV0TWF0ZXJpYWxNZXNoKTtcclxuICAgICAgICBidWxsZXRNZXNoLnBvc2l0aW9uLmNvcHkoY2FtZXJhV29ybGRQb3NpdGlvbik7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoYnVsbGV0TWVzaCk7XHJcblxyXG4gICAgICAgIC8vIDMuIENyZWF0ZSBDYW5ub24uanMgQm9keSBmb3IgdGhlIGJ1bGxldFxyXG4gICAgICAgIGNvbnN0IGJ1bGxldFNoYXBlID0gbmV3IENBTk5PTi5TcGhlcmUoYnVsbGV0Q29uZmlnLmRpbWVuc2lvbnMucmFkaXVzKTtcclxuICAgICAgICBjb25zdCBidWxsZXRCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogYnVsbGV0Q29uZmlnLm1hc3MsXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMoY2FtZXJhV29ybGRQb3NpdGlvbi54LCBjYW1lcmFXb3JsZFBvc2l0aW9uLnksIGNhbWVyYVdvcmxkUG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgIHNoYXBlOiBidWxsZXRTaGFwZSxcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMuYnVsbGV0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIC8vIEJ1bGxldHMgc2hvdWxkIG5vdCBiZSBhZmZlY3RlZCBieSBwbGF5ZXIgbW92ZW1lbnQsIGJ1dCBzaG91bGQgaGF2ZSBncmF2aXR5XHJcbiAgICAgICAgICAgIGxpbmVhckRhbXBpbmc6IDAuMDEsIC8vIFNtYWxsIGRhbXBpbmcgdG8gcHJldmVudCBpbmZpbml0ZSBzbGlkaW5nXHJcbiAgICAgICAgICAgIGFuZ3VsYXJEYW1waW5nOiAwLjk5IC8vIEFsbG93cyBzb21lIHJvdGF0aW9uLCBidXQgc3RvcHMgcXVpY2tseVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBTZXQgYnVsbGV0IGluaXRpYWwgdmVsb2NpdHlcclxuICAgICAgICBidWxsZXRCb2R5LnZlbG9jaXR5LnNldChcclxuICAgICAgICAgICAgY2FtZXJhV29ybGREaXJlY3Rpb24ueCAqIGJ1bGxldENvbmZpZy5zcGVlZCxcclxuICAgICAgICAgICAgY2FtZXJhV29ybGREaXJlY3Rpb24ueSAqIGJ1bGxldENvbmZpZy5zcGVlZCxcclxuICAgICAgICAgICAgY2FtZXJhV29ybGREaXJlY3Rpb24ueiAqIGJ1bGxldENvbmZpZy5zcGVlZFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIFN0b3JlIGEgcmVmZXJlbmNlIHRvIHRoZSBhY3RpdmUgYnVsbGV0IG9iamVjdCBvbiB0aGUgYm9keSBmb3IgY29sbGlzaW9uIGNhbGxiYWNrXHJcbiAgICAgICAgY29uc3QgYWN0aXZlQnVsbGV0OiBBY3RpdmVCdWxsZXQgPSB7XHJcbiAgICAgICAgICAgIG1lc2g6IGJ1bGxldE1lc2gsXHJcbiAgICAgICAgICAgIGJvZHk6IGJ1bGxldEJvZHksXHJcbiAgICAgICAgICAgIGNyZWF0aW9uVGltZTogdGhpcy5sYXN0VGltZSAvIDEwMDAsIC8vIFN0b3JlIGNyZWF0aW9uIHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgICAgICBmaXJlUG9zaXRpb246IGJ1bGxldEJvZHkucG9zaXRpb24uY2xvbmUoKSAvLyBTdG9yZSBpbml0aWFsIGZpcmUgcG9zaXRpb24gZm9yIHJhbmdlIGNoZWNrXHJcbiAgICAgICAgfTtcclxuICAgICAgICBidWxsZXRCb2R5LnVzZXJEYXRhID0gYWN0aXZlQnVsbGV0OyAvLyBBdHRhY2ggdGhlIGFjdGl2ZUJ1bGxldCBvYmplY3QgdG8gdGhlIENhbm5vbi5Cb2R5XHJcblxyXG4gICAgICAgIGJ1bGxldEJvZHkuYWRkRXZlbnRMaXN0ZW5lcignY29sbGlkZScsIChldmVudDogQ29sbGlkZUV2ZW50KSA9PiB0aGlzLm9uQnVsbGV0Q29sbGlkZShldmVudCwgYWN0aXZlQnVsbGV0KSk7XHJcblxyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keShidWxsZXRCb2R5KTtcclxuICAgICAgICB0aGlzLmJ1bGxldHMucHVzaChhY3RpdmVCdWxsZXQpO1xyXG5cclxuICAgICAgICAvLyBQbGF5IHNob290IHNvdW5kXHJcbiAgICAgICAgdGhpcy5zb3VuZHMuZ2V0KCdzaG9vdF9zb3VuZCcpPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIlNob290IHNvdW5kIHBsYXkgZGVuaWVkOlwiLCBlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IEhhbmRsZXMgYnVsbGV0IGNvbGxpc2lvbnMuXHJcbiAgICAgKiBAcGFyYW0gZXZlbnQgVGhlIENhbm5vbi5qcyBjb2xsaXNpb24gZXZlbnQuXHJcbiAgICAgKiBAcGFyYW0gYnVsbGV0IFRoZSBBY3RpdmVCdWxsZXQgaW5zdGFuY2UgdGhhdCBjb2xsaWRlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbkJ1bGxldENvbGxpZGUoZXZlbnQ6IENvbGxpZGVFdmVudCwgYnVsbGV0OiBBY3RpdmVCdWxsZXQpIHtcclxuICAgICAgICAvLyBJZiB0aGUgYnVsbGV0IGhhcyBhbHJlYWR5IGJlZW4gcmVtb3ZlZCAoZS5nLiwgYnkgbGlmZXRpbWUvcmFuZ2UgY2hlY2spLCBkbyBub3RoaW5nLlxyXG4gICAgICAgIGlmICghdGhpcy5idWxsZXRzLmluY2x1ZGVzKGJ1bGxldCkpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgY29sbGlkZWRCb2R5ID0gZXZlbnQuYm9keTsgLy8gVGhlIGJvZHkgdGhhdCB0aGUgYnVsbGV0IChldmVudC50YXJnZXQpIGNvbGxpZGVkIHdpdGhcclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGNvbGxpZGVkIGJvZHkgaXMgdGhlIGdyb3VuZCBvciBhIHBsYWNlZCBvYmplY3RcclxuICAgICAgICBjb25zdCBpc0dyb3VuZCA9IGNvbGxpZGVkQm9keSA9PT0gdGhpcy5ncm91bmRCb2R5O1xyXG4gICAgICAgIGNvbnN0IGlzUGxhY2VkT2JqZWN0ID0gdGhpcy5wbGFjZWRPYmplY3RCb2RpZXMuaW5jbHVkZXMoY29sbGlkZWRCb2R5KTtcclxuXHJcbiAgICAgICAgaWYgKGlzR3JvdW5kIHx8IGlzUGxhY2VkT2JqZWN0KSB7XHJcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlQnVsbGV0KGJ1bGxldCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBSZW1vdmVzIGEgYnVsbGV0IGZyb20gdGhlIHNjZW5lLCBwaHlzaWNzIHdvcmxkLCBhbmQgYWN0aXZlIGJ1bGxldHMgYXJyYXkuXHJcbiAgICAgKiBAcGFyYW0gYnVsbGV0VG9SZW1vdmUgVGhlIEFjdGl2ZUJ1bGxldCBpbnN0YW5jZSB0byByZW1vdmUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcmVtb3ZlQnVsbGV0KGJ1bGxldFRvUmVtb3ZlOiBBY3RpdmVCdWxsZXQpIHtcclxuICAgICAgICAvLyBSZW1vdmUgZnJvbSBUaHJlZS5qcyBzY2VuZVxyXG4gICAgICAgIHRoaXMuc2NlbmUucmVtb3ZlKGJ1bGxldFRvUmVtb3ZlLm1lc2gpO1xyXG4gICAgICAgIC8vIFJlbW92ZSBmcm9tIENhbm5vbi5qcyB3b3JsZFxyXG4gICAgICAgIHRoaXMud29ybGQucmVtb3ZlQm9keShidWxsZXRUb1JlbW92ZS5ib2R5KTtcclxuXHJcbiAgICAgICAgLy8gRGlzcG9zZSBvZiByZXNvdXJjZXMgKG9wdGlvbmFsLCBidXQgZ29vZCBmb3IgcGVyZm9ybWFuY2Ugd2l0aCBtYW55IGJ1bGxldHMpXHJcbiAgICAgICAgLy8gSWYgZ2VvbWV0cnkvbWF0ZXJpYWwgYXJlIHNoYXJlZCAoYXMgYHRoaXMuYnVsbGV0R2VvbWV0cnlgIGFuZCBgdGhpcy5idWxsZXRNYXRlcmlhbE1lc2hgIGFyZSksXHJcbiAgICAgICAgLy8gd2Ugc2hvdWxkIE5PVCBkaXNwb3NlIHRoZW0gaGVyZSwgYXMgb3RoZXIgYnVsbGV0cyBtaWdodCBzdGlsbCBiZSB1c2luZyB0aGVtLlxyXG4gICAgICAgIC8vIEZvciBzaGFyZWQgcmVzb3VyY2VzLCB0aGV5IHdvdWxkIGJlIGRpc3Bvc2VkIG9uY2Ugd2hlbiB0aGUgZ2FtZSBzaHV0cyBkb3duLCBpZiBldmVyLlxyXG5cclxuICAgICAgICAvLyBSZW1vdmUgZnJvbSB0aGUgYWN0aXZlIGJ1bGxldHMgYXJyYXlcclxuICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMuYnVsbGV0cy5pbmRleE9mKGJ1bGxldFRvUmVtb3ZlKTtcclxuICAgICAgICBpZiAoaW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYnVsbGV0cy5zcGxpY2UoaW5kZXgsIDEpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVcGRhdGVzIHRoZSBwb2ludGVyIGxvY2sgc3RhdHVzIHdoZW4gaXQgY2hhbmdlcyAoZS5nLiwgdXNlciBwcmVzc2VzIEVzYykuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25Qb2ludGVyTG9ja0NoYW5nZSgpIHtcclxuICAgICAgICBpZiAoZG9jdW1lbnQucG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLmNhbnZhcyB8fFxyXG4gICAgICAgICAgICAoZG9jdW1lbnQgYXMgYW55KS5tb3pQb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMuY2FudmFzIHx8XHJcbiAgICAgICAgICAgIChkb2N1bWVudCBhcyBhbnkpLndlYmtpdFBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgdGhpcy5pc1BvaW50ZXJMb2NrZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUG9pbnRlciBsb2NrZWQnKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmlzUG9pbnRlckxvY2tlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUG9pbnRlciB1bmxvY2tlZCcpO1xyXG4gICAgICAgICAgICAvLyBXaGVuIHBvaW50ZXIgaXMgdW5sb2NrZWQgYnkgdXNlciAoZS5nLiwgcHJlc3NpbmcgRXNjKSwgY3Vyc29yIGFwcGVhcnMgYXV0b21hdGljYWxseS5cclxuICAgICAgICAgICAgLy8gTW91c2UgbG9vayBzdG9wcyBkdWUgdG8gYGlzUG9pbnRlckxvY2tlZGAgY2hlY2sgaW4gb25Nb3VzZU1vdmUuXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVGhlIG1haW4gZ2FtZSBsb29wLCBjYWxsZWQgb24gZXZlcnkgYW5pbWF0aW9uIGZyYW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFuaW1hdGUodGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCkge1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGUuYmluZCh0aGlzKSk7IC8vIFJlcXVlc3QgbmV4dCBmcmFtZVxyXG5cclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAodGltZSAtIHRoaXMubGFzdFRpbWUpIC8gMTAwMDsgLy8gQ2FsY3VsYXRlIGRlbHRhIHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSB0aW1lO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQbGF5ZXJNb3ZlbWVudCgpOyAvLyBVcGRhdGUgcGxheWVyJ3MgdmVsb2NpdHkgYmFzZWQgb24gaW5wdXRcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVCdWxsZXRzKGRlbHRhVGltZSk7IC8vIE5FVzogVXBkYXRlIGJ1bGxldCBwb3NpdGlvbnMgYW5kIGNoZWNrIGZvciBkZXNwYXduIGNvbmRpdGlvbnNcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQaHlzaWNzKGRlbHRhVGltZSk7IC8vIFN0ZXAgdGhlIHBoeXNpY3Mgd29ybGRcclxuICAgICAgICAgICAgdGhpcy5jbGFtcFBsYXllclBvc2l0aW9uKCk7IC8vIENsYW1wIHBsYXllciBwb3NpdGlvbiB0byBwcmV2ZW50IGdvaW5nIGJleW9uZCBncm91bmQgZWRnZXNcclxuICAgICAgICAgICAgdGhpcy5zeW5jTWVzaGVzV2l0aEJvZGllcygpOyAvLyBTeW5jaHJvbml6ZSB2aXN1YWwgbWVzaGVzIHdpdGggcGh5c2ljcyBib2RpZXNcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhKTsgLy8gUmVuZGVyIHRoZSBzY2VuZVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3RlcHMgdGhlIENhbm5vbi5qcyBwaHlzaWNzIHdvcmxkIGZvcndhcmQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlUGh5c2ljcyhkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIC8vIHdvcmxkLnN0ZXAoZml4ZWRUaW1lU3RlcCwgZGVsdGFUaW1lLCBtYXhTdWJTdGVwcylcclxuICAgICAgICAvLyAxLzYwOiBBIGZpeGVkIHRpbWUgc3RlcCBvZiA2MCBwaHlzaWNzIHVwZGF0ZXMgcGVyIHNlY29uZCAoc3RhbmRhcmQpLlxyXG4gICAgICAgIC8vIGRlbHRhVGltZTogVGhlIGFjdHVhbCB0aW1lIGVsYXBzZWQgc2luY2UgdGhlIGxhc3QgcmVuZGVyIGZyYW1lLlxyXG4gICAgICAgIC8vIG1heFBoeXNpY3NTdWJTdGVwczogTGltaXRzIHRoZSBudW1iZXIgb2YgcGh5c2ljcyBzdGVwcyBpbiBvbmUgcmVuZGVyIGZyYW1lXHJcbiAgICAgICAgLy8gdG8gcHJldmVudCBpbnN0YWJpbGl0aWVzIGlmIHJlbmRlcmluZyBzbG93cyBkb3duIHNpZ25pZmljYW50bHkuXHJcbiAgICAgICAgdGhpcy53b3JsZC5zdGVwKDEgLyA2MCwgZGVsdGFUaW1lLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubWF4UGh5c2ljc1N1YlN0ZXBzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgdGhlIHBsYXllcidzIHZlbG9jaXR5IGJhc2VkIG9uIFdBU0QgaW5wdXQgYW5kIGNhbWVyYSBvcmllbnRhdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVQbGF5ZXJNb3ZlbWVudCgpIHtcclxuICAgICAgICAvLyBQbGF5ZXIgbW92ZW1lbnQgc2hvdWxkIG9ubHkgaGFwcGVuIHdoZW4gdGhlIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICAgICAgaWYgKCF0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICAvLyBJZiBwb2ludGVyIGlzIG5vdCBsb2NrZWQsIHN0b3AgaG9yaXpvbnRhbCBtb3ZlbWVudCBpbW1lZGlhdGVseVxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBFeGl0IGVhcmx5IGFzIG5vIG1vdmVtZW50IGlucHV0IHNob3VsZCBiZSBwcm9jZXNzZWRcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBlZmZlY3RpdmVQbGF5ZXJTcGVlZCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJTcGVlZDtcclxuXHJcbiAgICAgICAgLy8gTU9ESUZJRUQ6IEFwcGx5IGFpciBjb250cm9sIGZhY3RvciBpZiBwbGF5ZXIgaXMgaW4gdGhlIGFpciAobm8gY29udGFjdHMgd2l0aCBhbnkgc3RhdGljIHN1cmZhY2UpXHJcbiAgICAgICAgaWYgKHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPT09IDApIHtcclxuICAgICAgICAgICAgZWZmZWN0aXZlUGxheWVyU3BlZWQgKj0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckFpckNvbnRyb2xGYWN0b3I7IC8vIFVzZSBjb25maWd1cmFibGUgYWlyIGNvbnRyb2wgZmFjdG9yXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRZVmVsb2NpdHkgPSB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueTsgLy8gUHJlc2VydmUgdmVydGljYWwgdmVsb2NpdHlcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBtb3ZlRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMCwgMCk7IC8vIFVzZSBhIFRIUkVFLlZlY3RvcjMgZm9yIGNhbGN1bGF0aW9uIGVhc2VcclxuXHJcbiAgICAgICAgLy8gR2V0IGNhbWVyYUNvbnRhaW5lcidzIGZvcndhcmQgdmVjdG9yIChob3Jpem9udGFsIGRpcmVjdGlvbiBwbGF5ZXIgaXMgbG9va2luZylcclxuICAgICAgICBjb25zdCBjYW1lcmFEaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLmdldFdvcmxkRGlyZWN0aW9uKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgY2FtZXJhRGlyZWN0aW9uLnkgPSAwOyAvLyBGbGF0dGVuIHRoZSB2ZWN0b3IgdG8gcmVzdHJpY3QgbW92ZW1lbnQgdG8gdGhlIGhvcml6b250YWwgcGxhbmVcclxuICAgICAgICBjYW1lcmFEaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGdsb2JhbFVwID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMSwgMCk7IC8vIERlZmluZSBnbG9iYWwgdXAgdmVjdG9yIGZvciBjcm9zcyBwcm9kdWN0XHJcblxyXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgJ3JpZ2h0JyB2ZWN0b3IgcmVsYXRpdmUgdG8gY2FtZXJhJ3MgZm9yd2FyZCBkaXJlY3Rpb25cclxuICAgICAgICBjb25zdCBjYW1lcmFSaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgY2FtZXJhUmlnaHQuY3Jvc3NWZWN0b3JzKGdsb2JhbFVwLCBjYW1lcmFEaXJlY3Rpb24pLm5vcm1hbGl6ZSgpOyBcclxuXHJcbiAgICAgICAgbGV0IG1vdmluZyA9IGZhbHNlO1xyXG4gICAgICAgIC8vIFcgPC0+IFMgc3dhcCBmcm9tIHVzZXIncyBjb21tZW50cyBpbiBvcmlnaW5hbCBjb2RlOlxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ3MnXSkgeyAvLyAncycga2V5IG5vdyBtb3ZlcyBmb3J3YXJkXHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24uYWRkKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ3cnXSkgeyAvLyAndycga2V5IG5vdyBtb3ZlcyBiYWNrd2FyZFxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLnN1YihjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBBIGFuZCBEIGNvbnRyb2xzIGFzIHN0YW5kYXJkOlxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ2EnXSkgeyAvLyAnYScga2V5IG5vdyBzdHJhZmVzIGxlZnRcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5zdWIoY2FtZXJhUmlnaHQpOyBcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1snZCddKSB7IC8vICdkJyBrZXkgbm93IHN0cmFmZXMgcmlnaHRcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5hZGQoY2FtZXJhUmlnaHQpOyBcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChtb3ZpbmcpIHtcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5ub3JtYWxpemUoKS5tdWx0aXBseVNjYWxhcihlZmZlY3RpdmVQbGF5ZXJTcGVlZCk7XHJcbiAgICAgICAgICAgIC8vIERpcmVjdGx5IHNldCB0aGUgaG9yaXpvbnRhbCB2ZWxvY2l0eSBjb21wb25lbnRzLlxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IG1vdmVEaXJlY3Rpb24ueDtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSBtb3ZlRGlyZWN0aW9uLno7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gSWYgbm8gbW92ZW1lbnQga2V5cyBhcmUgcHJlc3NlZDpcclxuICAgICAgICAgICAgLy8gTU9ESUZJRUQ6IEFwcGx5IGFpciBkZWNlbGVyYXRpb24gaWYgcGxheWVyIGlzIGluIHRoZSBhaXJcclxuICAgICAgICAgICAgaWYgKHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ICo9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJBaXJEZWNlbGVyYXRpb247XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiAqPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyQWlyRGVjZWxlcmF0aW9uO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gUGxheWVyIGlzIG9uIHRoZSBncm91bmQgb3IgYSBzdGF0aWMgb2JqZWN0OiBDYW5ub24uanMgQ29udGFjdE1hdGVyaWFsIGZyaWN0aW9uIHdpbGwgaGFuZGxlIGRlY2VsZXJhdGlvbi5cclxuICAgICAgICAgICAgICAgIC8vIE5vIGV4cGxpY2l0IHZlbG9jaXR5IGRlY2F5IGlzIGFwcGxpZWQgaGVyZSBmb3IgZ3JvdW5kIG1vdmVtZW50LlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55ID0gY3VycmVudFlWZWxvY2l0eTsgLy8gUmVzdG9yZSBZIHZlbG9jaXR5IChncmF2aXR5L2p1bXBzKVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQURERUQ6IEFwcGxpZXMgYW4gdXB3YXJkIGltcHVsc2UgdG8gdGhlIHBsYXllciBib2R5IGZvciBqdW1waW5nLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHBsYXllckp1bXAoKSB7XHJcbiAgICAgICAgLy8gTU9ESUZJRUQ6IE9ubHkgYWxsb3cganVtcCBpZiB0aGUgcGxheWVyIGlzIGN1cnJlbnRseSBvbiBhbnkgc3RhdGljIHN1cmZhY2UgKGdyb3VuZCBvciBvYmplY3QpXHJcbiAgICAgICAgaWYgKHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPiAwKSB7XHJcbiAgICAgICAgICAgIC8vIENsZWFyIGFueSBleGlzdGluZyB2ZXJ0aWNhbCB2ZWxvY2l0eSB0byBlbnN1cmUgYSBjb25zaXN0ZW50IGp1bXAgaGVpZ2h0XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55ID0gMDsgXHJcbiAgICAgICAgICAgIC8vIEFwcGx5IGFuIHVwd2FyZCBpbXB1bHNlIChtYXNzICogY2hhbmdlX2luX3ZlbG9jaXR5KVxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkuYXBwbHlJbXB1bHNlKFxyXG4gICAgICAgICAgICAgICAgbmV3IENBTk5PTi5WZWMzKDAsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5qdW1wRm9yY2UsIDApLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIC8vIEFwcGx5IGltcHVsc2UgYXQgdGhlIGNlbnRlciBvZiBtYXNzXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2xhbXBzIHRoZSBwbGF5ZXIncyBwb3NpdGlvbiB3aXRoaW4gdGhlIGRlZmluZWQgZ3JvdW5kIGJvdW5kYXJpZXMuXHJcbiAgICAgKiBQcmV2ZW50cyB0aGUgcGxheWVyIGZyb20gbW92aW5nIGJleW9uZCB0aGUgJ2VuZCBvZiB0aGUgd29ybGQnLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNsYW1wUGxheWVyUG9zaXRpb24oKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnBsYXllckJvZHkgfHwgIXRoaXMuY29uZmlnKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGhhbGZHcm91bmRTaXplID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyAyO1xyXG5cclxuICAgICAgICBsZXQgcG9zWCA9IHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi54O1xyXG4gICAgICAgIGxldCBwb3NaID0gdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLno7XHJcbiAgICAgICAgbGV0IHZlbFggPSB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueDtcclxuICAgICAgICBsZXQgdmVsWiA9IHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56O1xyXG5cclxuICAgICAgICAvLyBDbGFtcCBYIHBvc2l0aW9uXHJcbiAgICAgICAgaWYgKHBvc1ggPiBoYWxmR3JvdW5kU2l6ZSkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueCA9IGhhbGZHcm91bmRTaXplO1xyXG4gICAgICAgICAgICBpZiAodmVsWCA+IDApIHsgLy8gSWYgbW92aW5nIG91dHdhcmRzLCBzdG9wIGhvcml6b250YWwgdmVsb2NpdHlcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAocG9zWCA8IC1oYWxmR3JvdW5kU2l6ZSkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueCA9IC1oYWxmR3JvdW5kU2l6ZTtcclxuICAgICAgICAgICAgaWYgKHZlbFggPCAwKSB7IC8vIElmIG1vdmluZyBvdXR3YXJkcywgc3RvcCBob3Jpem9udGFsIHZlbG9jaXR5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENsYW1wIFogcG9zaXRpb25cclxuICAgICAgICBpZiAocG9zWiA+IGhhbGZHcm91bmRTaXplKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi56ID0gaGFsZkdyb3VuZFNpemU7XHJcbiAgICAgICAgICAgIGlmICh2ZWxaID4gMCkgeyAvLyBJZiBtb3Zpbmcgb3V0d2FyZHMsIHN0b3AgaG9yaXpvbnRhbCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmIChwb3NaIDwgLWhhbGZHcm91bmRTaXplKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi56ID0gLWhhbGZHcm91bmRTaXplO1xyXG4gICAgICAgICAgICBpZiAodmVsWiA8IDApIHsgLy8gSWYgbW92aW5nIG91dHdhcmRzLCBzdG9wIGhvcml6b250YWwgdmVsb2NpdHlcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogVXBkYXRlcyBhY3RpdmUgYnVsbGV0cywgc3luY2luZyBtZXNoZXMsIGNoZWNraW5nIGxpZmV0aW1lLCBhbmQgcmFuZ2UuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlQnVsbGV0cyhkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gdGhpcy5sYXN0VGltZSAvIDEwMDA7IC8vIEN1cnJlbnQgdGltZSBpbiBzZWNvbmRzXHJcbiAgICAgICAgY29uc3QgaGFsZkdyb3VuZFNpemUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDI7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0Q29uZmlnID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmJ1bGxldDtcclxuXHJcbiAgICAgICAgLy8gSXRlcmF0ZSBiYWNrd2FyZHMgdG8gc2FmZWx5IHJlbW92ZSBlbGVtZW50c1xyXG4gICAgICAgIGZvciAobGV0IGkgPSB0aGlzLmJ1bGxldHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgY29uc3QgYnVsbGV0ID0gdGhpcy5idWxsZXRzW2ldO1xyXG5cclxuICAgICAgICAgICAgLy8gU3luYyBtZXNoIHdpdGggcGh5c2ljcyBib2R5XHJcbiAgICAgICAgICAgIGJ1bGxldC5tZXNoLnBvc2l0aW9uLmNvcHkoYnVsbGV0LmJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgICAgICAgICAgYnVsbGV0Lm1lc2gucXVhdGVybmlvbi5jb3B5KGJ1bGxldC5ib2R5LnF1YXRlcm5pb24gYXMgdW5rbm93biBhcyBUSFJFRS5RdWF0ZXJuaW9uKTtcclxuXHJcbiAgICAgICAgICAgIC8vIENoZWNrIGxpZmV0aW1lXHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50VGltZSAtIGJ1bGxldC5jcmVhdGlvblRpbWUgPiBidWxsZXRDb25maWcubGlmZXRpbWUpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlQnVsbGV0KGJ1bGxldCk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTsgLy8gTW92ZSB0byB0aGUgbmV4dCBidWxsZXRcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgb3V0c2lkZSBtYXAgYm91bmRhcmllcyAoc2ltaWxhciB0byBwbGF5ZXIgY2xhbXAsIGJ1dCBmb3IgYnVsbGV0cylcclxuICAgICAgICAgICAgLy8gT3IgaWYgaXQgd2VudCB0b28gZmFyIGZyb20gaXRzIGZpcmluZyBwb2ludCAoZm9yIGFpciBzaG90cylcclxuICAgICAgICAgICAgY29uc3QgYnVsbGV0UG9zID0gYnVsbGV0LmJvZHkucG9zaXRpb247XHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3RhbmNlVG9GaXJlUG9pbnQgPSBidWxsZXRQb3MuZGlzdGFuY2VUbyhidWxsZXQuZmlyZVBvc2l0aW9uKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgICAgIGJ1bGxldFBvcy54ID4gaGFsZkdyb3VuZFNpemUgfHwgYnVsbGV0UG9zLnggPCAtaGFsZkdyb3VuZFNpemUgfHxcclxuICAgICAgICAgICAgICAgIGJ1bGxldFBvcy56ID4gaGFsZkdyb3VuZFNpemUgfHwgYnVsbGV0UG9zLnogPCAtaGFsZkdyb3VuZFNpemUgfHxcclxuICAgICAgICAgICAgICAgIGRpc3RhbmNlVG9GaXJlUG9pbnQgPiBidWxsZXRDb25maWcubWF4UmFuZ2UgLy8gQ2hlY2sgbWF4IHJhbmdlIGZvciBcIlx1QUNGNVx1QzkxMVx1QzczQ1x1Qjg1QyBcdUJDMUNcdUMwQUNcdUI0MThcdUM1QzhcdUM3NDQgXHVCNTRDIFx1RDJCOVx1QzgxNSBcdUJDOTRcdUM3MDRcdUI5N0MgXHVCQzk3XHVDNUI0XHVCMDk4XHVCQTc0XCJcclxuICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUJ1bGxldChidWxsZXQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3luY2hyb25pemVzIHRoZSB2aXN1YWwgbWVzaGVzIHdpdGggdGhlaXIgY29ycmVzcG9uZGluZyBwaHlzaWNzIGJvZGllcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzeW5jTWVzaGVzV2l0aEJvZGllcygpIHtcclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSBwbGF5ZXIncyB2aXN1YWwgbWVzaCBwb3NpdGlvbiB3aXRoIGl0cyBwaHlzaWNzIGJvZHkncyBwb3NpdGlvblxyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIGNhbWVyYUNvbnRhaW5lciBwb3NpdGlvbiB3aXRoIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkncyBwb3NpdGlvbi5cclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG5cclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSBwbGF5ZXIncyB2aXN1YWwgbWVzaCBob3Jpem9udGFsIHJvdGF0aW9uICh5YXcpIHdpdGggY2FtZXJhQ29udGFpbmVyJ3MgeWF3LlxyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5xdWF0ZXJuaW9uLmNvcHkodGhpcy5jYW1lcmFDb250YWluZXIucXVhdGVybmlvbik7XHJcblxyXG4gICAgICAgIC8vIFRoZSBncm91bmQgYW5kIHBsYWNlZCBvYmplY3RzIGFyZSBjdXJyZW50bHkgc3RhdGljIChtYXNzIDApLCBzbyB0aGVpciB2aXN1YWwgbWVzaGVzXHJcbiAgICAgICAgLy8gZG8gbm90IG5lZWQgdG8gYmUgc3luY2hyb25pemVkIHdpdGggdGhlaXIgcGh5c2ljcyBib2RpZXMgYWZ0ZXIgaW5pdGlhbCBwbGFjZW1lbnQuXHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQnVsbGV0cyBhcmUgdXBkYXRlZCBpbiB1cGRhdGVCdWxsZXRzIG1ldGhvZC5cclxuICAgIH1cclxufVxyXG5cclxuLy8gU3RhcnQgdGhlIGdhbWUgd2hlbiB0aGUgRE9NIGNvbnRlbnQgaXMgZnVsbHkgbG9hZGVkXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICBuZXcgR2FtZSgpO1xyXG59KTsiXSwKICAibWFwcGluZ3MiOiAiQUFBQSxZQUFZLFdBQVc7QUFDdkIsWUFBWSxZQUFZO0FBb0J4QixJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBRkMsU0FBQUE7QUFBQSxHQUFBO0FBbUVMLE1BQU0sS0FBSztBQUFBLEVBd0RQLGNBQWM7QUF0RGQ7QUFBQSxTQUFRLFFBQW1CO0FBMEIzQjtBQUFBLFNBQVEscUJBQW1DLENBQUM7QUFDNUMsU0FBUSxxQkFBb0MsQ0FBQztBQUc3QztBQUFBLFNBQVEsVUFBMEIsQ0FBQztBQUtuQztBQUFBO0FBQUEsU0FBUSxPQUFtQyxDQUFDO0FBQzVDO0FBQUEsU0FBUSxrQkFBMkI7QUFDbkM7QUFBQSxTQUFRLGNBQXNCO0FBRzlCO0FBQUE7QUFBQSxTQUFRLFdBQXVDLG9CQUFJLElBQUk7QUFDdkQ7QUFBQSxTQUFRLFNBQXdDLG9CQUFJLElBQUk7QUFReEQ7QUFBQSxTQUFRLFdBQWdDO0FBR3hDO0FBQUEsU0FBUSxnQ0FBd0M7QUFJNUMsU0FBSyxTQUFTLFNBQVMsZUFBZSxZQUFZO0FBQ2xELFFBQUksQ0FBQyxLQUFLLFFBQVE7QUFDZCxjQUFRLE1BQU0sZ0RBQWdEO0FBQzlEO0FBQUEsSUFDSjtBQUNBLFNBQUssS0FBSztBQUFBLEVBQ2Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQWMsT0FBTztBQUVqQixRQUFJO0FBQ0EsWUFBTSxXQUFXLE1BQU0sTUFBTSxXQUFXO0FBQ3hDLFVBQUksQ0FBQyxTQUFTLElBQUk7QUFDZCxjQUFNLElBQUksTUFBTSx1QkFBdUIsU0FBUyxNQUFNLEVBQUU7QUFBQSxNQUM1RDtBQUNBLFdBQUssU0FBUyxNQUFNLFNBQVMsS0FBSztBQUNsQyxjQUFRLElBQUksOEJBQThCLEtBQUssTUFBTTtBQUFBLElBQ3pELFNBQVMsT0FBTztBQUNaLGNBQVEsTUFBTSxzQ0FBc0MsS0FBSztBQUV6RCxZQUFNLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFDN0MsZUFBUyxNQUFNLFdBQVc7QUFDMUIsZUFBUyxNQUFNLE1BQU07QUFDckIsZUFBUyxNQUFNLE9BQU87QUFDdEIsZUFBUyxNQUFNLFlBQVk7QUFDM0IsZUFBUyxNQUFNLFFBQVE7QUFDdkIsZUFBUyxNQUFNLFdBQVc7QUFDMUIsZUFBUyxjQUFjO0FBQ3ZCLGVBQVMsS0FBSyxZQUFZLFFBQVE7QUFDbEM7QUFBQSxJQUNKO0FBR0EsU0FBSyxRQUFRLElBQUksTUFBTSxNQUFNO0FBQzdCLFNBQUssU0FBUyxJQUFJLE1BQU07QUFBQSxNQUNwQjtBQUFBO0FBQUEsTUFDQSxLQUFLLE9BQU8sYUFBYSxpQkFBaUIsUUFBUSxLQUFLLE9BQU8sYUFBYSxpQkFBaUI7QUFBQTtBQUFBLE1BQzVGLEtBQUssT0FBTyxhQUFhO0FBQUE7QUFBQSxNQUN6QixLQUFLLE9BQU8sYUFBYTtBQUFBO0FBQUEsSUFDN0I7QUFDQSxTQUFLLFdBQVcsSUFBSSxNQUFNLGNBQWMsRUFBRSxRQUFRLEtBQUssUUFBUSxXQUFXLEtBQUssQ0FBQztBQUVoRixTQUFLLFNBQVMsY0FBYyxPQUFPLGdCQUFnQjtBQUNuRCxTQUFLLFNBQVMsVUFBVSxVQUFVO0FBQ2xDLFNBQUssU0FBUyxVQUFVLE9BQU8sTUFBTTtBQUtyQyxTQUFLLGtCQUFrQixJQUFJLE1BQU0sU0FBUztBQUMxQyxTQUFLLE1BQU0sSUFBSSxLQUFLLGVBQWU7QUFDbkMsU0FBSyxnQkFBZ0IsSUFBSSxLQUFLLE1BQU07QUFFcEMsU0FBSyxPQUFPLFNBQVMsSUFBSSxLQUFLLE9BQU8sYUFBYTtBQUlsRCxTQUFLLFFBQVEsSUFBSSxPQUFPLE1BQU07QUFDOUIsU0FBSyxNQUFNLFFBQVEsSUFBSSxHQUFHLE9BQU8sQ0FBQztBQUNsQyxTQUFLLE1BQU0sYUFBYSxJQUFJLE9BQU8sY0FBYyxLQUFLLEtBQUs7QUFHM0QsSUFBQyxLQUFLLE1BQU0sT0FBMkIsYUFBYTtBQUdwRCxTQUFLLGlCQUFpQixJQUFJLE9BQU8sU0FBUyxnQkFBZ0I7QUFDMUQsU0FBSyxpQkFBaUIsSUFBSSxPQUFPLFNBQVMsZ0JBQWdCO0FBQzFELFNBQUssd0JBQXdCLElBQUksT0FBTyxTQUFTLHVCQUF1QjtBQUN4RSxTQUFLLGlCQUFpQixJQUFJLE9BQU8sU0FBUyxnQkFBZ0I7QUFFMUQsVUFBTSw4QkFBOEIsSUFBSSxPQUFPO0FBQUEsTUFDM0MsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0w7QUFBQSxRQUNJLFVBQVUsS0FBSyxPQUFPLGFBQWE7QUFBQTtBQUFBLFFBQ25DLGFBQWE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BSWpCO0FBQUEsSUFDSjtBQUNBLFNBQUssTUFBTSxtQkFBbUIsMkJBQTJCO0FBR3pELFVBQU0sOEJBQThCLElBQUksT0FBTztBQUFBLE1BQzNDLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNMO0FBQUEsUUFDSSxVQUFVLEtBQUssT0FBTyxhQUFhO0FBQUE7QUFBQSxRQUNuQyxhQUFhO0FBQUEsTUFDakI7QUFBQSxJQUNKO0FBQ0EsU0FBSyxNQUFNLG1CQUFtQiwyQkFBMkI7QUFJekQsVUFBTSw4QkFBOEIsSUFBSSxPQUFPO0FBQUEsTUFDM0MsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0w7QUFBQSxRQUNJLFVBQVU7QUFBQTtBQUFBLFFBQ1YsYUFBYTtBQUFBLE1BQ2pCO0FBQUEsSUFDSjtBQUNBLFNBQUssTUFBTSxtQkFBbUIsMkJBQTJCO0FBR3pELFVBQU0sOEJBQThCLElBQUksT0FBTztBQUFBLE1BQzNDLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNMO0FBQUEsUUFDSSxVQUFVO0FBQUEsUUFDVixhQUFhO0FBQUEsTUFDakI7QUFBQSxJQUNKO0FBQ0EsU0FBSyxNQUFNLG1CQUFtQiwyQkFBMkI7QUFHekQsVUFBTSw4QkFBOEIsSUFBSSxPQUFPO0FBQUEsTUFDM0MsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0w7QUFBQSxRQUNJLFVBQVU7QUFBQSxRQUNWLGFBQWE7QUFBQSxNQUNqQjtBQUFBLElBQ0o7QUFDQSxTQUFLLE1BQU0sbUJBQW1CLDJCQUEyQjtBQUl6RCxVQUFNLEtBQUssV0FBVztBQUd0QixTQUFLLGFBQWE7QUFDbEIsU0FBSyxhQUFhO0FBQ2xCLFNBQUssb0JBQW9CO0FBQ3pCLFNBQUssY0FBYztBQUduQixTQUFLLGlCQUFpQixJQUFJLE1BQU0sZUFBZSxLQUFLLE9BQU8sYUFBYSxPQUFPLFdBQVcsUUFBUSxHQUFHLENBQUM7QUFDdEcsVUFBTSxnQkFBZ0IsS0FBSyxTQUFTLElBQUksS0FBSyxPQUFPLGFBQWEsT0FBTyxXQUFXO0FBQ25GLFNBQUsscUJBQXFCLElBQUksTUFBTSxrQkFBa0I7QUFBQSxNQUNsRCxLQUFLO0FBQUEsTUFDTCxPQUFPLGdCQUFnQixXQUFXO0FBQUE7QUFBQSxJQUN0QyxDQUFDO0FBR0QsU0FBSyxNQUFNLGlCQUFpQixnQkFBZ0IsQ0FBQyxVQUFVO0FBQ25ELFVBQUksUUFBUSxNQUFNO0FBQ2xCLFVBQUksUUFBUSxNQUFNO0FBR2xCLFVBQUksVUFBVSxLQUFLLGNBQWMsVUFBVSxLQUFLLFlBQVk7QUFDeEQsY0FBTSxZQUFZLFVBQVUsS0FBSyxhQUFhLFFBQVE7QUFFdEQsWUFBSSxVQUFVLFNBQVMsR0FBRztBQUN0QixlQUFLO0FBQUEsUUFDVDtBQUFBLE1BQ0o7QUFBQSxJQUNKLENBQUM7QUFFRCxTQUFLLE1BQU0saUJBQWlCLGNBQWMsQ0FBQyxVQUFVO0FBQ2pELFVBQUksUUFBUSxNQUFNO0FBQ2xCLFVBQUksUUFBUSxNQUFNO0FBRWxCLFVBQUksVUFBVSxLQUFLLGNBQWMsVUFBVSxLQUFLLFlBQVk7QUFDeEQsY0FBTSxZQUFZLFVBQVUsS0FBSyxhQUFhLFFBQVE7QUFDdEQsWUFBSSxVQUFVLFNBQVMsR0FBRztBQUN0QixlQUFLLGdDQUFnQyxLQUFLLElBQUksR0FBRyxLQUFLLGdDQUFnQyxDQUFDO0FBQUEsUUFDM0Y7QUFBQSxNQUNKO0FBQUEsSUFDSixDQUFDO0FBR0QsV0FBTyxpQkFBaUIsVUFBVSxLQUFLLGVBQWUsS0FBSyxJQUFJLENBQUM7QUFDaEUsYUFBUyxpQkFBaUIsV0FBVyxLQUFLLFVBQVUsS0FBSyxJQUFJLENBQUM7QUFDOUQsYUFBUyxpQkFBaUIsU0FBUyxLQUFLLFFBQVEsS0FBSyxJQUFJLENBQUM7QUFDMUQsYUFBUyxpQkFBaUIsYUFBYSxLQUFLLFlBQVksS0FBSyxJQUFJLENBQUM7QUFDbEUsYUFBUyxpQkFBaUIsYUFBYSxLQUFLLFlBQVksS0FBSyxJQUFJLENBQUM7QUFDbEUsYUFBUyxpQkFBaUIscUJBQXFCLEtBQUssb0JBQW9CLEtBQUssSUFBSSxDQUFDO0FBQ2xGLGFBQVMsaUJBQWlCLHdCQUF3QixLQUFLLG9CQUFvQixLQUFLLElBQUksQ0FBQztBQUNyRixhQUFTLGlCQUFpQiwyQkFBMkIsS0FBSyxvQkFBb0IsS0FBSyxJQUFJLENBQUM7QUFHeEYsU0FBSyxzQkFBc0I7QUFHM0IsU0FBSyxpQkFBaUI7QUFHdEIsU0FBSyxRQUFRLENBQUM7QUFBQSxFQUNsQjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsTUFBYyxhQUFhO0FBQ3ZCLFVBQU0sZ0JBQWdCLElBQUksTUFBTSxjQUFjO0FBQzlDLFVBQU0sZ0JBQWdCLEtBQUssT0FBTyxPQUFPLE9BQU8sSUFBSSxTQUFPO0FBQ3ZELGFBQU8sY0FBYyxVQUFVLElBQUksSUFBSSxFQUNsQyxLQUFLLGFBQVc7QUFDYixhQUFLLFNBQVMsSUFBSSxJQUFJLE1BQU0sT0FBTztBQUNuQyxnQkFBUSxRQUFRLE1BQU07QUFDdEIsZ0JBQVEsUUFBUSxNQUFNO0FBRXRCLFlBQUksSUFBSSxTQUFTLGtCQUFrQjtBQUM5QixrQkFBUSxPQUFPLElBQUksS0FBSyxPQUFPLGFBQWEsYUFBYSxHQUFHLEtBQUssT0FBTyxhQUFhLGFBQWEsQ0FBQztBQUFBLFFBQ3hHO0FBRUEsWUFBSSxJQUFJLEtBQUssU0FBUyxVQUFVLEdBQUc7QUFBQSxRQUluQztBQUFBLE1BQ0osQ0FBQyxFQUNBLE1BQU0sV0FBUztBQUNaLGdCQUFRLE1BQU0sMkJBQTJCLElBQUksSUFBSSxJQUFJLEtBQUs7QUFBQSxNQUU5RCxDQUFDO0FBQUEsSUFDVCxDQUFDO0FBRUQsVUFBTSxnQkFBZ0IsS0FBSyxPQUFPLE9BQU8sT0FBTyxJQUFJLFdBQVM7QUFDekQsYUFBTyxJQUFJLFFBQWMsQ0FBQyxZQUFZO0FBQ2xDLGNBQU0sUUFBUSxJQUFJLE1BQU0sTUFBTSxJQUFJO0FBQ2xDLGNBQU0sU0FBUyxNQUFNO0FBQ3JCLGNBQU0sT0FBUSxNQUFNLFNBQVM7QUFDN0IsY0FBTSxtQkFBbUIsTUFBTTtBQUMzQixlQUFLLE9BQU8sSUFBSSxNQUFNLE1BQU0sS0FBSztBQUNqQyxrQkFBUTtBQUFBLFFBQ1o7QUFDQSxjQUFNLFVBQVUsTUFBTTtBQUNsQixrQkFBUSxNQUFNLHlCQUF5QixNQUFNLElBQUksRUFBRTtBQUNuRCxrQkFBUTtBQUFBLFFBQ1o7QUFBQSxNQUNKLENBQUM7QUFBQSxJQUNMLENBQUM7QUFFRCxVQUFNLFFBQVEsSUFBSSxDQUFDLEdBQUcsZUFBZSxHQUFHLGFBQWEsQ0FBQztBQUN0RCxZQUFRLElBQUksa0JBQWtCLEtBQUssU0FBUyxJQUFJLGNBQWMsS0FBSyxPQUFPLElBQUksVUFBVTtBQUFBLEVBQzVGO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxtQkFBbUI7QUFDdkIsU0FBSyxxQkFBcUIsU0FBUyxjQUFjLEtBQUs7QUFDdEQsV0FBTyxPQUFPLEtBQUssbUJBQW1CLE9BQU87QUFBQSxNQUN6QyxVQUFVO0FBQUE7QUFBQSxNQUNWLGlCQUFpQjtBQUFBLE1BQ2pCLFNBQVM7QUFBQSxNQUFRLGVBQWU7QUFBQSxNQUNoQyxnQkFBZ0I7QUFBQSxNQUFVLFlBQVk7QUFBQSxNQUN0QyxPQUFPO0FBQUEsTUFBUyxZQUFZO0FBQUEsTUFDNUIsVUFBVTtBQUFBLE1BQVEsV0FBVztBQUFBLE1BQVUsUUFBUTtBQUFBLElBQ25ELENBQUM7QUFDRCxhQUFTLEtBQUssWUFBWSxLQUFLLGtCQUFrQjtBQUlqRCxTQUFLLHNCQUFzQjtBQUUzQixTQUFLLFlBQVksU0FBUyxjQUFjLEtBQUs7QUFDN0MsU0FBSyxVQUFVLGNBQWMsS0FBSyxPQUFPLGFBQWE7QUFDdEQsU0FBSyxtQkFBbUIsWUFBWSxLQUFLLFNBQVM7QUFFbEQsU0FBSyxhQUFhLFNBQVMsY0FBYyxLQUFLO0FBQzlDLFNBQUssV0FBVyxjQUFjLEtBQUssT0FBTyxhQUFhO0FBQ3ZELFdBQU8sT0FBTyxLQUFLLFdBQVcsT0FBTztBQUFBLE1BQ2pDLFdBQVc7QUFBQSxNQUFRLFVBQVU7QUFBQSxJQUNqQyxDQUFDO0FBQ0QsU0FBSyxtQkFBbUIsWUFBWSxLQUFLLFVBQVU7QUFHbkQsU0FBSyxtQkFBbUIsaUJBQWlCLFNBQVMsTUFBTSxLQUFLLFVBQVUsQ0FBQztBQUd4RSxTQUFLLE9BQU8sSUFBSSxrQkFBa0IsR0FBRyxLQUFLLEVBQUUsTUFBTSxPQUFLLFFBQVEsSUFBSSw0Q0FBNEMsQ0FBQyxDQUFDO0FBQUEsRUFDckg7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLFlBQVk7QUFDaEIsU0FBSyxRQUFRO0FBRWIsUUFBSSxLQUFLLHNCQUFzQixLQUFLLG1CQUFtQixZQUFZO0FBQy9ELGVBQVMsS0FBSyxZQUFZLEtBQUssa0JBQWtCO0FBQUEsSUFDckQ7QUFFQSxTQUFLLE9BQU8saUJBQWlCLFNBQVMsS0FBSywwQkFBMEIsS0FBSyxJQUFJLENBQUM7QUFHL0UsU0FBSyxPQUFPLG1CQUFtQjtBQUUvQixTQUFLLE9BQU8sSUFBSSxrQkFBa0IsR0FBRyxLQUFLLEVBQUUsTUFBTSxPQUFLLFFBQVEsSUFBSSx1Q0FBdUMsQ0FBQyxDQUFDO0FBQUEsRUFDaEg7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLDRCQUE0QjtBQUNoQyxRQUFJLEtBQUssVUFBVSxtQkFBcUIsQ0FBQyxLQUFLLGlCQUFpQjtBQUMzRCxXQUFLLE9BQU8sbUJBQW1CO0FBQUEsSUFDbkM7QUFBQSxFQUNKO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxlQUFlO0FBRW5CLFVBQU0sZ0JBQWdCLEtBQUssU0FBUyxJQUFJLGdCQUFnQjtBQUN4RCxVQUFNLGlCQUFpQixJQUFJLE1BQU0sb0JBQW9CO0FBQUEsTUFDakQsS0FBSztBQUFBLE1BQ0wsT0FBTyxnQkFBZ0IsV0FBVztBQUFBO0FBQUEsSUFDdEMsQ0FBQztBQUNELFVBQU0saUJBQWlCLElBQUksTUFBTSxZQUFZLEdBQUcsR0FBRyxDQUFDO0FBQ3BELFNBQUssYUFBYSxJQUFJLE1BQU0sS0FBSyxnQkFBZ0IsY0FBYztBQUMvRCxTQUFLLFdBQVcsU0FBUyxJQUFJO0FBQzdCLFNBQUssV0FBVyxhQUFhO0FBQzdCLFNBQUssTUFBTSxJQUFJLEtBQUssVUFBVTtBQUc5QixVQUFNLGNBQWMsSUFBSSxPQUFPLElBQUksSUFBSSxPQUFPLEtBQUssS0FBSyxHQUFHLEdBQUcsQ0FBQztBQUMvRCxTQUFLLGFBQWEsSUFBSSxPQUFPLEtBQUs7QUFBQSxNQUM5QixNQUFNLEtBQUssT0FBTyxhQUFhO0FBQUE7QUFBQSxNQUMvQixVQUFVLElBQUksT0FBTyxLQUFLLEtBQUssV0FBVyxTQUFTLEdBQUcsS0FBSyxXQUFXLFNBQVMsR0FBRyxLQUFLLFdBQVcsU0FBUyxDQUFDO0FBQUEsTUFDNUcsT0FBTztBQUFBLE1BQ1AsZUFBZTtBQUFBO0FBQUEsTUFDZixVQUFVLEtBQUs7QUFBQTtBQUFBLElBQ25CLENBQUM7QUFDRCxTQUFLLE1BQU0sUUFBUSxLQUFLLFVBQVU7QUFJbEMsU0FBSyxnQkFBZ0IsU0FBUyxLQUFLLEtBQUssV0FBVyxRQUFvQztBQUFBLEVBQzNGO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxlQUFlO0FBRW5CLFVBQU0sZ0JBQWdCLEtBQUssU0FBUyxJQUFJLGdCQUFnQjtBQUN4RCxVQUFNLGlCQUFpQixJQUFJLE1BQU0sb0JBQW9CO0FBQUEsTUFDakQsS0FBSztBQUFBLE1BQ0wsT0FBTyxnQkFBZ0IsV0FBVztBQUFBO0FBQUEsSUFDdEMsQ0FBQztBQUNELFVBQU0saUJBQWlCLElBQUksTUFBTSxjQUFjLEtBQUssT0FBTyxhQUFhLFlBQVksS0FBSyxPQUFPLGFBQWEsVUFBVTtBQUN2SCxTQUFLLGFBQWEsSUFBSSxNQUFNLEtBQUssZ0JBQWdCLGNBQWM7QUFDL0QsU0FBSyxXQUFXLFNBQVMsSUFBSSxDQUFDLEtBQUssS0FBSztBQUN4QyxTQUFLLFdBQVcsZ0JBQWdCO0FBQ2hDLFNBQUssTUFBTSxJQUFJLEtBQUssVUFBVTtBQUc5QixVQUFNLGNBQWMsSUFBSSxPQUFPLE1BQU07QUFDckMsU0FBSyxhQUFhLElBQUksT0FBTyxLQUFLO0FBQUEsTUFDOUIsTUFBTTtBQUFBO0FBQUEsTUFDTixPQUFPO0FBQUEsTUFDUCxVQUFVLEtBQUs7QUFBQTtBQUFBLElBQ25CLENBQUM7QUFFRCxTQUFLLFdBQVcsV0FBVyxpQkFBaUIsSUFBSSxPQUFPLEtBQUssR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLEtBQUssS0FBSyxDQUFDO0FBQ2xGLFNBQUssTUFBTSxRQUFRLEtBQUssVUFBVTtBQUFBLEVBQ3RDO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxzQkFBc0I7QUFDMUIsUUFBSSxDQUFDLEtBQUssT0FBTyxhQUFhLGVBQWU7QUFDekMsY0FBUSxLQUFLLDJDQUEyQztBQUN4RDtBQUFBLElBQ0o7QUFFQSxTQUFLLE9BQU8sYUFBYSxjQUFjLFFBQVEsZUFBYTtBQUN4RCxZQUFNLFVBQVUsS0FBSyxTQUFTLElBQUksVUFBVSxXQUFXO0FBQ3ZELFlBQU0sV0FBVyxJQUFJLE1BQU0sb0JBQW9CO0FBQUEsUUFDM0MsS0FBSztBQUFBLFFBQ0wsT0FBTyxVQUFVLFdBQVc7QUFBQTtBQUFBLE1BQ2hDLENBQUM7QUFHRCxZQUFNLFdBQVcsSUFBSSxNQUFNLFlBQVksVUFBVSxXQUFXLE9BQU8sVUFBVSxXQUFXLFFBQVEsVUFBVSxXQUFXLEtBQUs7QUFDMUgsWUFBTSxPQUFPLElBQUksTUFBTSxLQUFLLFVBQVUsUUFBUTtBQUM5QyxXQUFLLFNBQVMsSUFBSSxVQUFVLFNBQVMsR0FBRyxVQUFVLFNBQVMsR0FBRyxVQUFVLFNBQVMsQ0FBQztBQUNsRixVQUFJLFVBQVUsY0FBYyxRQUFXO0FBQ25DLGFBQUssU0FBUyxJQUFJLFVBQVU7QUFBQSxNQUNoQztBQUNBLFdBQUssYUFBYTtBQUNsQixXQUFLLGdCQUFnQjtBQUNyQixXQUFLLE1BQU0sSUFBSSxJQUFJO0FBQ25CLFdBQUssbUJBQW1CLEtBQUssSUFBSTtBQUlqQyxZQUFNLFFBQVEsSUFBSSxPQUFPLElBQUksSUFBSSxPQUFPO0FBQUEsUUFDcEMsVUFBVSxXQUFXLFFBQVE7QUFBQSxRQUM3QixVQUFVLFdBQVcsU0FBUztBQUFBLFFBQzlCLFVBQVUsV0FBVyxRQUFRO0FBQUEsTUFDakMsQ0FBQztBQUNELFlBQU0sT0FBTyxJQUFJLE9BQU8sS0FBSztBQUFBLFFBQ3pCLE1BQU0sVUFBVTtBQUFBO0FBQUEsUUFDaEIsVUFBVSxJQUFJLE9BQU8sS0FBSyxVQUFVLFNBQVMsR0FBRyxVQUFVLFNBQVMsR0FBRyxVQUFVLFNBQVMsQ0FBQztBQUFBLFFBQzFGO0FBQUEsUUFDQSxVQUFVLEtBQUs7QUFBQTtBQUFBLE1BQ25CLENBQUM7QUFDRCxVQUFJLFVBQVUsY0FBYyxRQUFXO0FBQ25DLGFBQUssV0FBVyxpQkFBaUIsSUFBSSxPQUFPLEtBQUssR0FBRyxHQUFHLENBQUMsR0FBRyxVQUFVLFNBQVM7QUFBQSxNQUNsRjtBQUNBLFdBQUssTUFBTSxRQUFRLElBQUk7QUFDdkIsV0FBSyxtQkFBbUIsS0FBSyxJQUFJO0FBQUEsSUFDckMsQ0FBQztBQUNELFlBQVEsSUFBSSxXQUFXLEtBQUssbUJBQW1CLE1BQU0sa0JBQWtCO0FBQUEsRUFDM0U7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLGdCQUFnQjtBQUNwQixVQUFNLGVBQWUsSUFBSSxNQUFNLGFBQWEsU0FBVSxDQUFHO0FBQ3pELFNBQUssTUFBTSxJQUFJLFlBQVk7QUFFM0IsVUFBTSxtQkFBbUIsSUFBSSxNQUFNLGlCQUFpQixVQUFVLEdBQUc7QUFDakUscUJBQWlCLFNBQVMsSUFBSSxHQUFHLElBQUksQ0FBQztBQUN0QyxxQkFBaUIsYUFBYTtBQUU5QixxQkFBaUIsT0FBTyxRQUFRLFFBQVE7QUFDeEMscUJBQWlCLE9BQU8sUUFBUSxTQUFTO0FBQ3pDLHFCQUFpQixPQUFPLE9BQU8sT0FBTztBQUN0QyxxQkFBaUIsT0FBTyxPQUFPLE1BQU07QUFDckMscUJBQWlCLE9BQU8sT0FBTyxPQUFPO0FBQ3RDLHFCQUFpQixPQUFPLE9BQU8sUUFBUTtBQUN2QyxxQkFBaUIsT0FBTyxPQUFPLE1BQU07QUFDckMscUJBQWlCLE9BQU8sT0FBTyxTQUFTO0FBQ3hDLFNBQUssTUFBTSxJQUFJLGdCQUFnQjtBQUFBLEVBQ25DO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxpQkFBaUI7QUFDckIsU0FBSyxzQkFBc0I7QUFBQSxFQUMvQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSx3QkFBd0I7QUFDNUIsVUFBTSxvQkFBb0IsS0FBSyxPQUFPLGFBQWEsaUJBQWlCLFFBQVEsS0FBSyxPQUFPLGFBQWEsaUJBQWlCO0FBRXRILFFBQUk7QUFDSixRQUFJO0FBRUosVUFBTSxjQUFjLE9BQU87QUFDM0IsVUFBTSxlQUFlLE9BQU87QUFDNUIsVUFBTSwyQkFBMkIsY0FBYztBQUUvQyxRQUFJLDJCQUEyQixtQkFBbUI7QUFFOUMsa0JBQVk7QUFDWixpQkFBVyxZQUFZO0FBQUEsSUFDM0IsT0FBTztBQUVILGlCQUFXO0FBQ1gsa0JBQVksV0FBVztBQUFBLElBQzNCO0FBR0EsU0FBSyxTQUFTLFFBQVEsVUFBVSxXQUFXLEtBQUs7QUFDaEQsU0FBSyxPQUFPLFNBQVM7QUFDckIsU0FBSyxPQUFPLHVCQUF1QjtBQUduQyxXQUFPLE9BQU8sS0FBSyxPQUFPLE9BQU87QUFBQSxNQUM3QixPQUFPLEdBQUcsUUFBUTtBQUFBLE1BQ2xCLFFBQVEsR0FBRyxTQUFTO0FBQUEsTUFDcEIsVUFBVTtBQUFBLE1BQ1YsS0FBSztBQUFBLE1BQ0wsTUFBTTtBQUFBLE1BQ04sV0FBVztBQUFBLE1BQ1gsV0FBVztBQUFBO0FBQUEsSUFDZixDQUFDO0FBR0QsUUFBSSxLQUFLLFVBQVUsaUJBQW1CLEtBQUssb0JBQW9CO0FBQzNELGFBQU8sT0FBTyxLQUFLLG1CQUFtQixPQUFPO0FBQUEsUUFDekMsT0FBTyxHQUFHLFFBQVE7QUFBQSxRQUNsQixRQUFRLEdBQUcsU0FBUztBQUFBLFFBQ3BCLEtBQUs7QUFBQSxRQUNMLE1BQU07QUFBQSxRQUNOLFdBQVc7QUFBQSxNQUNmLENBQUM7QUFBQSxJQUNMO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsVUFBVSxPQUFzQjtBQUNwQyxTQUFLLEtBQUssTUFBTSxJQUFJLFlBQVksQ0FBQyxJQUFJO0FBRXJDLFFBQUksS0FBSyxVQUFVLG1CQUFxQixLQUFLLGlCQUFpQjtBQUMxRCxVQUFJLE1BQU0sSUFBSSxZQUFZLE1BQU0sS0FBSztBQUNqQyxhQUFLLFdBQVc7QUFBQSxNQUNwQjtBQUFBLElBQ0o7QUFBQSxFQUNKO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxRQUFRLE9BQXNCO0FBQ2xDLFNBQUssS0FBSyxNQUFNLElBQUksWUFBWSxDQUFDLElBQUk7QUFBQSxFQUN6QztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsWUFBWSxPQUFtQjtBQUVuQyxRQUFJLEtBQUssVUFBVSxtQkFBcUIsS0FBSyxpQkFBaUI7QUFDMUQsWUFBTSxZQUFZLE1BQU0sYUFBYTtBQUNyQyxZQUFNLFlBQVksTUFBTSxhQUFhO0FBR3JDLFdBQUssZ0JBQWdCLFNBQVMsS0FBSyxZQUFZLEtBQUssT0FBTyxhQUFhO0FBS3hFLFdBQUssZUFBZSxZQUFZLEtBQUssT0FBTyxhQUFhO0FBQ3pELFdBQUssY0FBYyxLQUFLLElBQUksQ0FBQyxLQUFLLEtBQUssR0FBRyxLQUFLLElBQUksS0FBSyxLQUFLLEdBQUcsS0FBSyxXQUFXLENBQUM7QUFDakYsV0FBSyxPQUFPLFNBQVMsSUFBSSxLQUFLO0FBQUEsSUFDbEM7QUFBQSxFQUNKO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxZQUFZLE9BQW1CO0FBQ25DLFFBQUksS0FBSyxVQUFVLG1CQUFxQixLQUFLLG1CQUFtQixNQUFNLFdBQVcsR0FBRztBQUNoRixXQUFLLFdBQVc7QUFBQSxJQUNwQjtBQUFBLEVBQ0o7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLGFBQWE7QUFDakIsVUFBTSxlQUFlLEtBQUssT0FBTyxhQUFhO0FBRzlDLFVBQU0sc0JBQXNCLElBQUksTUFBTSxRQUFRO0FBQzlDLFNBQUssT0FBTyxpQkFBaUIsbUJBQW1CO0FBRWhELFVBQU0sdUJBQXVCLElBQUksTUFBTSxRQUFRO0FBQy9DLFNBQUssT0FBTyxrQkFBa0Isb0JBQW9CO0FBR2xELFVBQU0sYUFBYSxJQUFJLE1BQU0sS0FBSyxLQUFLLGdCQUFnQixLQUFLLGtCQUFrQjtBQUM5RSxlQUFXLFNBQVMsS0FBSyxtQkFBbUI7QUFDNUMsU0FBSyxNQUFNLElBQUksVUFBVTtBQUd6QixVQUFNLGNBQWMsSUFBSSxPQUFPLE9BQU8sYUFBYSxXQUFXLE1BQU07QUFDcEUsVUFBTSxhQUFhLElBQUksT0FBTyxLQUFLO0FBQUEsTUFDL0IsTUFBTSxhQUFhO0FBQUEsTUFDbkIsVUFBVSxJQUFJLE9BQU8sS0FBSyxvQkFBb0IsR0FBRyxvQkFBb0IsR0FBRyxvQkFBb0IsQ0FBQztBQUFBLE1BQzdGLE9BQU87QUFBQSxNQUNQLFVBQVUsS0FBSztBQUFBO0FBQUEsTUFFZixlQUFlO0FBQUE7QUFBQSxNQUNmLGdCQUFnQjtBQUFBO0FBQUEsSUFDcEIsQ0FBQztBQUdELGVBQVcsU0FBUztBQUFBLE1BQ2hCLHFCQUFxQixJQUFJLGFBQWE7QUFBQSxNQUN0QyxxQkFBcUIsSUFBSSxhQUFhO0FBQUEsTUFDdEMscUJBQXFCLElBQUksYUFBYTtBQUFBLElBQzFDO0FBR0EsVUFBTSxlQUE2QjtBQUFBLE1BQy9CLE1BQU07QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLGNBQWMsS0FBSyxXQUFXO0FBQUE7QUFBQSxNQUM5QixjQUFjLFdBQVcsU0FBUyxNQUFNO0FBQUE7QUFBQSxJQUM1QztBQUNBLGVBQVcsV0FBVztBQUV0QixlQUFXLGlCQUFpQixXQUFXLENBQUMsVUFBd0IsS0FBSyxnQkFBZ0IsT0FBTyxZQUFZLENBQUM7QUFFekcsU0FBSyxNQUFNLFFBQVEsVUFBVTtBQUM3QixTQUFLLFFBQVEsS0FBSyxZQUFZO0FBRzlCLFNBQUssT0FBTyxJQUFJLGFBQWEsR0FBRyxLQUFLLEVBQUUsTUFBTSxPQUFLLFFBQVEsSUFBSSw0QkFBNEIsQ0FBQyxDQUFDO0FBQUEsRUFDaEc7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSxnQkFBZ0IsT0FBcUIsUUFBc0I7QUFFL0QsUUFBSSxDQUFDLEtBQUssUUFBUSxTQUFTLE1BQU0sR0FBRztBQUNoQztBQUFBLElBQ0o7QUFFQSxVQUFNLGVBQWUsTUFBTTtBQUczQixVQUFNLFdBQVcsaUJBQWlCLEtBQUs7QUFDdkMsVUFBTSxpQkFBaUIsS0FBSyxtQkFBbUIsU0FBUyxZQUFZO0FBRXBFLFFBQUksWUFBWSxnQkFBZ0I7QUFDNUIsV0FBSyxhQUFhLE1BQU07QUFBQSxJQUM1QjtBQUFBLEVBQ0o7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsYUFBYSxnQkFBOEI7QUFFL0MsU0FBSyxNQUFNLE9BQU8sZUFBZSxJQUFJO0FBRXJDLFNBQUssTUFBTSxXQUFXLGVBQWUsSUFBSTtBQVF6QyxVQUFNLFFBQVEsS0FBSyxRQUFRLFFBQVEsY0FBYztBQUNqRCxRQUFJLFVBQVUsSUFBSTtBQUNkLFdBQUssUUFBUSxPQUFPLE9BQU8sQ0FBQztBQUFBLElBQ2hDO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsc0JBQXNCO0FBQzFCLFFBQUksU0FBUyx1QkFBdUIsS0FBSyxVQUNwQyxTQUFpQiwwQkFBMEIsS0FBSyxVQUNoRCxTQUFpQiw2QkFBNkIsS0FBSyxRQUFRO0FBQzVELFdBQUssa0JBQWtCO0FBQ3ZCLGNBQVEsSUFBSSxnQkFBZ0I7QUFBQSxJQUNoQyxPQUFPO0FBQ0gsV0FBSyxrQkFBa0I7QUFDdkIsY0FBUSxJQUFJLGtCQUFrQjtBQUFBLElBR2xDO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsUUFBUSxNQUEyQjtBQUN2QywwQkFBc0IsS0FBSyxRQUFRLEtBQUssSUFBSSxDQUFDO0FBRTdDLFVBQU0sYUFBYSxPQUFPLEtBQUssWUFBWTtBQUMzQyxTQUFLLFdBQVc7QUFFaEIsUUFBSSxLQUFLLFVBQVUsaUJBQW1CO0FBQ2xDLFdBQUsscUJBQXFCO0FBQzFCLFdBQUssY0FBYyxTQUFTO0FBQzVCLFdBQUssY0FBYyxTQUFTO0FBQzVCLFdBQUssb0JBQW9CO0FBQ3pCLFdBQUsscUJBQXFCO0FBQUEsSUFDOUI7QUFFQSxTQUFLLFNBQVMsT0FBTyxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQUEsRUFDaEQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLGNBQWMsV0FBbUI7QUFNckMsU0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLFdBQVcsS0FBSyxPQUFPLGFBQWEsa0JBQWtCO0FBQUEsRUFDbEY7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLHVCQUF1QjtBQUUzQixRQUFJLENBQUMsS0FBSyxpQkFBaUI7QUFFdkIsV0FBSyxXQUFXLFNBQVMsSUFBSTtBQUM3QixXQUFLLFdBQVcsU0FBUyxJQUFJO0FBQzdCO0FBQUEsSUFDSjtBQUVBLFFBQUksdUJBQXVCLEtBQUssT0FBTyxhQUFhO0FBR3BELFFBQUksS0FBSyxrQ0FBa0MsR0FBRztBQUMxQyw4QkFBd0IsS0FBSyxPQUFPLGFBQWE7QUFBQSxJQUNyRDtBQUVBLFVBQU0sbUJBQW1CLEtBQUssV0FBVyxTQUFTO0FBRWxELFVBQU0sZ0JBQWdCLElBQUksTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDO0FBRy9DLFVBQU0sa0JBQWtCLElBQUksTUFBTSxRQUFRO0FBQzFDLFNBQUssZ0JBQWdCLGtCQUFrQixlQUFlO0FBQ3RELG9CQUFnQixJQUFJO0FBQ3BCLG9CQUFnQixVQUFVO0FBRTFCLFVBQU0sV0FBVyxJQUFJLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQztBQUcxQyxVQUFNLGNBQWMsSUFBSSxNQUFNLFFBQVE7QUFDdEMsZ0JBQVksYUFBYSxVQUFVLGVBQWUsRUFBRSxVQUFVO0FBRTlELFFBQUksU0FBUztBQUViLFFBQUksS0FBSyxLQUFLLEdBQUcsR0FBRztBQUNoQixvQkFBYyxJQUFJLGVBQWU7QUFDakMsZUFBUztBQUFBLElBQ2I7QUFDQSxRQUFJLEtBQUssS0FBSyxHQUFHLEdBQUc7QUFDaEIsb0JBQWMsSUFBSSxlQUFlO0FBQ2pDLGVBQVM7QUFBQSxJQUNiO0FBRUEsUUFBSSxLQUFLLEtBQUssR0FBRyxHQUFHO0FBQ2hCLG9CQUFjLElBQUksV0FBVztBQUM3QixlQUFTO0FBQUEsSUFDYjtBQUNBLFFBQUksS0FBSyxLQUFLLEdBQUcsR0FBRztBQUNoQixvQkFBYyxJQUFJLFdBQVc7QUFDN0IsZUFBUztBQUFBLElBQ2I7QUFFQSxRQUFJLFFBQVE7QUFDUixvQkFBYyxVQUFVLEVBQUUsZUFBZSxvQkFBb0I7QUFFN0QsV0FBSyxXQUFXLFNBQVMsSUFBSSxjQUFjO0FBQzNDLFdBQUssV0FBVyxTQUFTLElBQUksY0FBYztBQUFBLElBQy9DLE9BQU87QUFHSCxVQUFJLEtBQUssa0NBQWtDLEdBQUc7QUFDMUMsYUFBSyxXQUFXLFNBQVMsS0FBSyxLQUFLLE9BQU8sYUFBYTtBQUN2RCxhQUFLLFdBQVcsU0FBUyxLQUFLLEtBQUssT0FBTyxhQUFhO0FBQUEsTUFDM0QsT0FBTztBQUFBLE1BR1A7QUFBQSxJQUNKO0FBQ0EsU0FBSyxXQUFXLFNBQVMsSUFBSTtBQUFBLEVBQ2pDO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxhQUFhO0FBRWpCLFFBQUksS0FBSyxnQ0FBZ0MsR0FBRztBQUV4QyxXQUFLLFdBQVcsU0FBUyxJQUFJO0FBRTdCLFdBQUssV0FBVztBQUFBLFFBQ1osSUFBSSxPQUFPLEtBQUssR0FBRyxLQUFLLE9BQU8sYUFBYSxXQUFXLENBQUM7QUFBQSxRQUN4RCxLQUFLLFdBQVc7QUFBQTtBQUFBLE1BQ3BCO0FBQUEsSUFDSjtBQUFBLEVBQ0o7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsc0JBQXNCO0FBQzFCLFFBQUksQ0FBQyxLQUFLLGNBQWMsQ0FBQyxLQUFLLFFBQVE7QUFDbEM7QUFBQSxJQUNKO0FBRUEsVUFBTSxpQkFBaUIsS0FBSyxPQUFPLGFBQWEsYUFBYTtBQUU3RCxRQUFJLE9BQU8sS0FBSyxXQUFXLFNBQVM7QUFDcEMsUUFBSSxPQUFPLEtBQUssV0FBVyxTQUFTO0FBQ3BDLFFBQUksT0FBTyxLQUFLLFdBQVcsU0FBUztBQUNwQyxRQUFJLE9BQU8sS0FBSyxXQUFXLFNBQVM7QUFHcEMsUUFBSSxPQUFPLGdCQUFnQjtBQUN2QixXQUFLLFdBQVcsU0FBUyxJQUFJO0FBQzdCLFVBQUksT0FBTyxHQUFHO0FBQ1YsYUFBSyxXQUFXLFNBQVMsSUFBSTtBQUFBLE1BQ2pDO0FBQUEsSUFDSixXQUFXLE9BQU8sQ0FBQyxnQkFBZ0I7QUFDL0IsV0FBSyxXQUFXLFNBQVMsSUFBSSxDQUFDO0FBQzlCLFVBQUksT0FBTyxHQUFHO0FBQ1YsYUFBSyxXQUFXLFNBQVMsSUFBSTtBQUFBLE1BQ2pDO0FBQUEsSUFDSjtBQUdBLFFBQUksT0FBTyxnQkFBZ0I7QUFDdkIsV0FBSyxXQUFXLFNBQVMsSUFBSTtBQUM3QixVQUFJLE9BQU8sR0FBRztBQUNWLGFBQUssV0FBVyxTQUFTLElBQUk7QUFBQSxNQUNqQztBQUFBLElBQ0osV0FBVyxPQUFPLENBQUMsZ0JBQWdCO0FBQy9CLFdBQUssV0FBVyxTQUFTLElBQUksQ0FBQztBQUM5QixVQUFJLE9BQU8sR0FBRztBQUNWLGFBQUssV0FBVyxTQUFTLElBQUk7QUFBQSxNQUNqQztBQUFBLElBQ0o7QUFBQSxFQUNKO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxjQUFjLFdBQW1CO0FBQ3JDLFVBQU0sY0FBYyxLQUFLLFdBQVc7QUFDcEMsVUFBTSxpQkFBaUIsS0FBSyxPQUFPLGFBQWEsYUFBYTtBQUM3RCxVQUFNLGVBQWUsS0FBSyxPQUFPLGFBQWE7QUFHOUMsYUFBUyxJQUFJLEtBQUssUUFBUSxTQUFTLEdBQUcsS0FBSyxHQUFHLEtBQUs7QUFDL0MsWUFBTSxTQUFTLEtBQUssUUFBUSxDQUFDO0FBRzdCLGFBQU8sS0FBSyxTQUFTLEtBQUssT0FBTyxLQUFLLFFBQW9DO0FBQzFFLGFBQU8sS0FBSyxXQUFXLEtBQUssT0FBTyxLQUFLLFVBQXlDO0FBR2pGLFVBQUksY0FBYyxPQUFPLGVBQWUsYUFBYSxVQUFVO0FBQzNELGFBQUssYUFBYSxNQUFNO0FBQ3hCO0FBQUEsTUFDSjtBQUlBLFlBQU0sWUFBWSxPQUFPLEtBQUs7QUFDOUIsWUFBTSxzQkFBc0IsVUFBVSxXQUFXLE9BQU8sWUFBWTtBQUVwRSxVQUNJLFVBQVUsSUFBSSxrQkFBa0IsVUFBVSxJQUFJLENBQUMsa0JBQy9DLFVBQVUsSUFBSSxrQkFBa0IsVUFBVSxJQUFJLENBQUMsa0JBQy9DLHNCQUFzQixhQUFhLFVBQ3JDO0FBQ0UsYUFBSyxhQUFhLE1BQU07QUFBQSxNQUM1QjtBQUFBLElBQ0o7QUFBQSxFQUNKO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSx1QkFBdUI7QUFFM0IsU0FBSyxXQUFXLFNBQVMsS0FBSyxLQUFLLFdBQVcsUUFBb0M7QUFHbEYsU0FBSyxnQkFBZ0IsU0FBUyxLQUFLLEtBQUssV0FBVyxRQUFvQztBQUd2RixTQUFLLFdBQVcsV0FBVyxLQUFLLEtBQUssZ0JBQWdCLFVBQVU7QUFBQSxFQU1uRTtBQUNKO0FBR0EsU0FBUyxpQkFBaUIsb0JBQW9CLE1BQU07QUFDaEQsTUFBSSxLQUFLO0FBQ2IsQ0FBQzsiLAogICJuYW1lcyI6IFsiR2FtZVN0YXRlIl0KfQo=
