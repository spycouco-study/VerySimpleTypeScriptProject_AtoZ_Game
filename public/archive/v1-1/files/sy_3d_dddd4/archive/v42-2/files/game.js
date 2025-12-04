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
    this.bulletsToRemove = /* @__PURE__ */ new Set();
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
    activeBullet.collideHandler = (event) => this.onBulletCollide(event, activeBullet);
    bulletBody.userData = activeBullet;
    bulletBody.addEventListener("collide", activeBullet.collideHandler);
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
    if (!this.bullets.includes(bullet) || bullet.shouldRemove) {
      return;
    }
    const collidedBody = event.body;
    const isGround = collidedBody === this.groundBody;
    const isPlacedObject = this.placedObjectBodies.includes(collidedBody);
    if (isGround || isPlacedObject) {
      bullet.shouldRemove = true;
      this.bulletsToRemove.add(bullet);
    }
  }
  /**
   * NEW: Iterates through bullets to mark them for removal based on lifetime, range, or out-of-bounds.
   * Actual removal is deferred to `performBulletRemovals`.
   */
  updateBullets(deltaTime) {
    const currentTime = this.lastTime / 1e3;
    const halfGroundSize = this.config.gameSettings.groundSize / 2;
    const bulletConfig = this.config.gameSettings.bullet;
    for (let i = 0; i < this.bullets.length; i++) {
      const bullet = this.bullets[i];
      if (bullet.shouldRemove) {
        continue;
      }
      bullet.mesh.position.copy(bullet.body.position);
      bullet.mesh.quaternion.copy(bullet.body.quaternion);
      if (currentTime - bullet.creationTime > bulletConfig.lifetime) {
        bullet.shouldRemove = true;
        this.bulletsToRemove.add(bullet);
        continue;
      }
      const bulletPos = bullet.body.position;
      const distanceToFirePoint = bulletPos.distanceTo(bullet.firePosition);
      if (bulletPos.x > halfGroundSize || bulletPos.x < -halfGroundSize || bulletPos.z > halfGroundSize || bulletPos.z < -halfGroundSize || distanceToFirePoint > bulletConfig.maxRange) {
        bullet.shouldRemove = true;
        this.bulletsToRemove.add(bullet);
      }
    }
  }
  /**
   * NEW: Performs the actual removal of bullets marked for removal.
   * This method is called after the physics step to avoid modifying the world during physics calculations.
   */
  performBulletRemovals() {
    for (const bulletToRemove of this.bulletsToRemove) {
      this.scene.remove(bulletToRemove.mesh);
      this.world.removeBody(bulletToRemove.body);
      if (bulletToRemove.collideHandler) {
        bulletToRemove.body.removeEventListener("collide", bulletToRemove.collideHandler);
      }
      const index = this.bullets.indexOf(bulletToRemove);
      if (index !== -1) {
        this.bullets.splice(index, 1);
      }
    }
    this.bulletsToRemove.clear();
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
      this.performBulletRemovals();
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuXHJcbi8vIEFkZCBtb2R1bGUgYXVnbWVudGF0aW9uIGZvciBDQU5OT04uQm9keSB0byBpbmNsdWRlIHVzZXJEYXRhXHJcbmRlY2xhcmUgbW9kdWxlICdjYW5ub24tZXMnIHtcclxuICAgIGludGVyZmFjZSBCb2R5IHtcclxuICAgICAgICB1c2VyRGF0YT86IEFjdGl2ZUJ1bGxldDsgLy8gQXR0YWNoIHRoZSBBY3RpdmVCdWxsZXQgaW5zdGFuY2VcclxuICAgIH1cclxufVxyXG5cclxuLy8gRGVmaW5lIGludGVyZmFjZSBmb3IgdGhlIENhbm5vbi1lcyAnY29sbGlkZScgZXZlbnRcclxuaW50ZXJmYWNlIENvbGxpZGVFdmVudCB7XHJcbiAgICAvLyBUaGUgdHlwZSBwcm9wZXJ0eSBpcyB1c3VhbGx5IHByZXNlbnQgb24gYWxsIENhbm5vbi5qcyBldmVudHNcclxuICAgIHR5cGU6IHN0cmluZztcclxuICAgIC8vIFRoZSAnY29sbGlkZScgZXZlbnQgc3BlY2lmaWNhbGx5IGhhcyB0aGVzZSBwcm9wZXJ0aWVzOlxyXG4gICAgYm9keTogQ0FOTk9OLkJvZHk7IC8vIFRoZSBvdGhlciBib2R5IGludm9sdmVkIGluIHRoZSBjb2xsaXNpb25cclxuICAgIHRhcmdldDogQ0FOTk9OLkJvZHk7IC8vIFRoZSBib2R5IHRoYXQgdGhlIGV2ZW50IGxpc3RlbmVyIGlzIGF0dGFjaGVkIHRvIChlLmcuLCB0aGUgYnVsbGV0Qm9keSlcclxuICAgIGNvbnRhY3Q6IENBTk5PTi5Db250YWN0RXF1YXRpb247IC8vIFRoZSBjb250YWN0IGVxdWF0aW9uIG9iamVjdFxyXG59XHJcblxyXG4vLyBFbnVtIHRvIGRlZmluZSB0aGUgcG9zc2libGUgc3RhdGVzIG9mIHRoZSBnYW1lXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFLCAgIC8vIFRpdGxlIHNjcmVlbiwgd2FpdGluZyBmb3IgdXNlciBpbnB1dFxyXG4gICAgUExBWUlORyAgLy8gR2FtZSBpcyBhY3RpdmUsIHVzZXIgY2FuIG1vdmUgYW5kIGxvb2sgYXJvdW5kXHJcbn1cclxuXHJcbi8vIEludGVyZmFjZSBmb3Igb2JqZWN0cyBwbGFjZWQgaW4gdGhlIHNjZW5lXHJcbmludGVyZmFjZSBQbGFjZWRPYmplY3RDb25maWcge1xyXG4gICAgbmFtZTogc3RyaW5nOyAvLyBBIGRlc2NyaXB0aXZlIG5hbWUgZm9yIHRoZSBvYmplY3QgaW5zdGFuY2VcclxuICAgIHRleHR1cmVOYW1lOiBzdHJpbmc7IC8vIE5hbWUgb2YgdGhlIHRleHR1cmUgZnJvbSBhc3NldHMuaW1hZ2VzXHJcbiAgICB0eXBlOiAnYm94JzsgLy8gQ3VycmVudGx5IG9ubHkgc3VwcG9ydHMgJ2JveCdcclxuICAgIHBvc2l0aW9uOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXIgfTtcclxuICAgIGRpbWVuc2lvbnM6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IGRlcHRoOiBudW1iZXIgfTtcclxuICAgIHJvdGF0aW9uWT86IG51bWJlcjsgLy8gT3B0aW9uYWwgcm90YXRpb24gYXJvdW5kIFktYXhpcyAocmFkaWFucylcclxuICAgIG1hc3M6IG51bWJlcjsgLy8gMCBmb3Igc3RhdGljLCA+MCBmb3IgZHluYW1pYyAodGhvdWdoIGFsbCBwbGFjZWQgb2JqZWN0cyBoZXJlIHdpbGwgYmUgc3RhdGljKVxyXG59XHJcblxyXG4vLyBORVc6IEludGVyZmFjZSBmb3IgYnVsbGV0IGNvbmZpZ3VyYXRpb25cclxuaW50ZXJmYWNlIEJ1bGxldENvbmZpZyB7XHJcbiAgICB0ZXh0dXJlTmFtZTogc3RyaW5nO1xyXG4gICAgZGltZW5zaW9uczogeyByYWRpdXM6IG51bWJlcjsgfTsgLy8gRm9yIGEgc3BoZXJlIGJ1bGxldFxyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIG1hc3M6IG51bWJlcjtcclxuICAgIGxpZmV0aW1lOiBudW1iZXI7IC8vIE1heCB0aW1lIGluIHNlY29uZHMgYmVmb3JlIGl0IGRlc3Bhd25zXHJcbiAgICBtYXhSYW5nZTogbnVtYmVyOyAvLyBNYXggZGlzdGFuY2UgZnJvbSBmaXJlIHBvaW50IGJlZm9yZSBpdCBkZXNwYXduc1xyXG4gICAgdm9sdW1lOiBudW1iZXI7IC8vIFNvdW5kIHZvbHVtZVxyXG59XHJcblxyXG4vLyBJbnRlcmZhY2UgdG8gdHlwZS1jaGVjayB0aGUgZ2FtZSBjb25maWd1cmF0aW9uIGxvYWRlZCBmcm9tIGRhdGEuanNvblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgICBnYW1lU2V0dGluZ3M6IHtcclxuICAgICAgICB0aXRsZVNjcmVlblRleHQ6IHN0cmluZztcclxuICAgICAgICBzdGFydEdhbWVQcm9tcHQ6IHN0cmluZztcclxuICAgICAgICBwbGF5ZXJTcGVlZDogbnVtYmVyO1xyXG4gICAgICAgIG1vdXNlU2Vuc2l0aXZpdHk6IG51bWJlcjtcclxuICAgICAgICBjYW1lcmFIZWlnaHRPZmZzZXQ6IG51bWJlcjsgLy8gVmVydGljYWwgb2Zmc2V0IG9mIHRoZSBjYW1lcmEgZnJvbSB0aGUgcGxheWVyJ3MgcGh5c2ljcyBib2R5IGNlbnRlclxyXG4gICAgICAgIGNhbWVyYU5lYXI6IG51bWJlcjsgICAgICAgICAvLyBOZWFyIGNsaXBwaW5nIHBsYW5lIGZvciB0aGUgY2FtZXJhXHJcbiAgICAgICAgY2FtZXJhRmFyOiBudW1iZXI7ICAgICAgICAgIC8vIEZhciBjbGlwcGluZyBwbGFuZSBmb3IgdGhlIGNhbWVyYVxyXG4gICAgICAgIHBsYXllck1hc3M6IG51bWJlcjsgICAgICAgICAvLyBNYXNzIG9mIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHlcclxuICAgICAgICBncm91bmRTaXplOiBudW1iZXI7ICAgICAgICAgLy8gU2l6ZSAod2lkdGgvZGVwdGgpIG9mIHRoZSBzcXVhcmUgZ3JvdW5kIHBsYW5lXHJcbiAgICAgICAgbWF4UGh5c2ljc1N1YlN0ZXBzOiBudW1iZXI7IC8vIE1heGltdW0gbnVtYmVyIG9mIHBoeXNpY3Mgc3Vic3RlcHMgcGVyIGZyYW1lIHRvIG1haW50YWluIHN0YWJpbGl0eVxyXG4gICAgICAgIGZpeGVkQXNwZWN0UmF0aW86IHsgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIgfTsgLy8gTmV3OiBGaXhlZCBhc3BlY3QgcmF0aW8gZm9yIHRoZSBnYW1lICh3aWR0aCAvIGhlaWdodClcclxuICAgICAgICBqdW1wRm9yY2U6IG51bWJlcjsgICAgICAgICAgLy8gQURERUQ6IEZvcmNlIGFwcGxpZWQgd2hlbiBqdW1waW5nXHJcbiAgICAgICAgcGxhY2VkT2JqZWN0czogUGxhY2VkT2JqZWN0Q29uZmlnW107IC8vIE5FVzogQXJyYXkgb2Ygb2JqZWN0cyB0byBwbGFjZSBpbiB0aGUgd29ybGRcclxuICAgICAgICAvLyBORVc6IENvbmZpZ3VyYWJsZSBwaHlzaWNzIHByb3BlcnRpZXNcclxuICAgICAgICBwbGF5ZXJHcm91bmRGcmljdGlvbjogbnVtYmVyOyAgICAgICAgLy8gRnJpY3Rpb24gY29lZmZpY2llbnQgZm9yIHBsYXllci1ncm91bmQgY29udGFjdFxyXG4gICAgICAgIHBsYXllckFpckNvbnRyb2xGYWN0b3I6IG51bWJlcjsgICAgLy8gTXVsdGlwbGllciBmb3IgcGxheWVyU3BlZWQgd2hlbiBhaXJib3JuZVxyXG4gICAgICAgIHBsYXllckFpckRlY2VsZXJhdGlvbjogbnVtYmVyOyAgICAgLy8gRGVjYXkgZmFjdG9yIGZvciBob3Jpem9udGFsIHZlbG9jaXR5IHdoZW4gYWlyYm9ybmUgYW5kIG5vdCBtb3ZpbmdcclxuICAgICAgICBidWxsZXQ6IEJ1bGxldENvbmZpZzsgLy8gTkVXOiBCdWxsZXQgY29uZmlndXJhdGlvblxyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfVtdO1xyXG4gICAgICAgIHNvdW5kczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyOyB2b2x1bWU6IG51bWJlciB9W107XHJcbiAgICB9O1xyXG59XHJcblxyXG4vLyBORVc6IEludGVyZmFjZSBmb3IgYW4gYWN0aXZlIGJ1bGxldCBpbnN0YW5jZVxyXG5pbnRlcmZhY2UgQWN0aXZlQnVsbGV0IHtcclxuICAgIG1lc2g6IFRIUkVFLk1lc2g7XHJcbiAgICBib2R5OiBDQU5OT04uQm9keTtcclxuICAgIGNyZWF0aW9uVGltZTogbnVtYmVyOyAvLyBVc2VkIGZvciBsaWZldGltZSBjaGVja1xyXG4gICAgZmlyZVBvc2l0aW9uOiBDQU5OT04uVmVjMzsgLy8gVXNlZCBmb3IgbWF4UmFuZ2UgY2hlY2tcclxuICAgIHNob3VsZFJlbW92ZT86IGJvb2xlYW47IC8vIE5FVzogRmxhZyB0byBtYXJrIGZvciByZW1vdmFsXHJcbiAgICBjb2xsaWRlSGFuZGxlcj86IChldmVudDogQ29sbGlkZUV2ZW50KSA9PiB2b2lkOyAvLyBORVc6IFN0b3JlIHRoZSBzcGVjaWZpYyBoYW5kbGVyIGZ1bmN0aW9uXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNYWluIEdhbWUgY2xhc3MgcmVzcG9uc2libGUgZm9yIGluaXRpYWxpemluZyBhbmQgcnVubmluZyB0aGUgM0QgZ2FtZS5cclxuICogSXQgaGFuZGxlcyBUaHJlZS5qcyByZW5kZXJpbmcsIENhbm5vbi1lcyBwaHlzaWNzLCBpbnB1dCwgYW5kIGdhbWUgc3RhdGUuXHJcbiAqL1xyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY29uZmlnITogR2FtZUNvbmZpZzsgLy8gR2FtZSBjb25maWd1cmF0aW9uIGxvYWRlZCBmcm9tIGRhdGEuanNvblxyXG4gICAgcHJpdmF0ZSBzdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFOyAvLyBDdXJyZW50IHN0YXRlIG9mIHRoZSBnYW1lXHJcblxyXG4gICAgLy8gVGhyZWUuanMgZWxlbWVudHMgZm9yIHJlbmRlcmluZ1xyXG4gICAgcHJpdmF0ZSBzY2VuZSE6IFRIUkVFLlNjZW5lO1xyXG4gICAgcHJpdmF0ZSBjYW1lcmEhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYTtcclxuICAgIHByaXZhdGUgcmVuZGVyZXIhOiBUSFJFRS5XZWJHTFJlbmRlcmVyO1xyXG4gICAgcHJpdmF0ZSBjYW52YXMhOiBIVE1MQ2FudmFzRWxlbWVudDsgLy8gVGhlIEhUTUwgY2FudmFzIGVsZW1lbnQgZm9yIHJlbmRlcmluZ1xyXG5cclxuICAgIC8vIE5ldzogQSBjb250YWluZXIgb2JqZWN0IGZvciB0aGUgY2FtZXJhIHRvIGhhbmRsZSBob3Jpem9udGFsIHJvdGF0aW9uIHNlcGFyYXRlbHkgZnJvbSB2ZXJ0aWNhbCBwaXRjaC5cclxuICAgIHByaXZhdGUgY2FtZXJhQ29udGFpbmVyITogVEhSRUUuT2JqZWN0M0Q7IFxyXG5cclxuICAgIC8vIENhbm5vbi1lcyBlbGVtZW50cyBmb3IgcGh5c2ljc1xyXG4gICAgcHJpdmF0ZSB3b3JsZCE6IENBTk5PTi5Xb3JsZDtcclxuICAgIHByaXZhdGUgcGxheWVyQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBwbGF5ZXJcclxuICAgIHByaXZhdGUgZ3JvdW5kQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBncm91bmRcclxuXHJcbiAgICAvLyBORVc6IENhbm5vbi1lcyBtYXRlcmlhbHMgZm9yIHBoeXNpY3NcclxuICAgIHByaXZhdGUgcGxheWVyTWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7XHJcbiAgICBwcml2YXRlIGdyb3VuZE1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsO1xyXG4gICAgcHJpdmF0ZSBkZWZhdWx0T2JqZWN0TWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7IC8vIEFEREVEOiBNYXRlcmlhbCBmb3IgZ2VuZXJpYyBwbGFjZWQgb2JqZWN0c1xyXG4gICAgcHJpdmF0ZSBidWxsZXRNYXRlcmlhbCE6IENBTk5PTi5NYXRlcmlhbDsgLy8gTkVXOiBNYXRlcmlhbCBmb3IgYnVsbGV0c1xyXG5cclxuICAgIC8vIFZpc3VhbCBtZXNoZXMgKFRocmVlLmpzKSBmb3IgZ2FtZSBvYmplY3RzXHJcbiAgICBwcml2YXRlIHBsYXllck1lc2ghOiBUSFJFRS5NZXNoO1xyXG4gICAgcHJpdmF0ZSBncm91bmRNZXNoITogVEhSRUUuTWVzaDtcclxuICAgIC8vIE5FVzogQXJyYXlzIHRvIGhvbGQgcmVmZXJlbmNlcyB0byBkeW5hbWljYWxseSBwbGFjZWQgb2JqZWN0c1xyXG4gICAgcHJpdmF0ZSBwbGFjZWRPYmplY3RNZXNoZXM6IFRIUkVFLk1lc2hbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBwbGFjZWRPYmplY3RCb2RpZXM6IENBTk5PTi5Cb2R5W10gPSBbXTtcclxuXHJcbiAgICAvLyBORVc6IEFjdGl2ZSBidWxsZXRzXHJcbiAgICBwcml2YXRlIGJ1bGxldHM6IEFjdGl2ZUJ1bGxldFtdID0gW107XHJcbiAgICBwcml2YXRlIGJ1bGxldHNUb1JlbW92ZTogU2V0PEFjdGl2ZUJ1bGxldD4gPSBuZXcgU2V0KCk7IC8vIE5FVzogTGlzdCBvZiBidWxsZXRzIHRvIHJlbW92ZSBhZnRlciBwaHlzaWNzIHN0ZXBcclxuICAgIHByaXZhdGUgYnVsbGV0R2VvbWV0cnkhOiBUSFJFRS5TcGhlcmVHZW9tZXRyeTsgLy8gUmV1c2FibGUgZ2VvbWV0cnkgZm9yIGJ1bGxldHNcclxuICAgIHByaXZhdGUgYnVsbGV0TWF0ZXJpYWxNZXNoITogVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWw7IC8vIFJldXNhYmxlIG1hdGVyaWFsIGZvciBidWxsZXRzICh1c2luZyBCYXNpYyB0byBwcmV2ZW50IGxpZ2h0aW5nIGlzc3VlcyBmb3Igc2ltcGxlIGJ1bGxldHMpXHJcblxyXG4gICAgLy8gSW5wdXQgaGFuZGxpbmcgc3RhdGVcclxuICAgIHByaXZhdGUga2V5czogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0gPSB7fTsgLy8gVHJhY2tzIGN1cnJlbnRseSBwcmVzc2VkIGtleXNcclxuICAgIHByaXZhdGUgaXNQb2ludGVyTG9ja2VkOiBib29sZWFuID0gZmFsc2U7IC8vIFRydWUgaWYgbW91c2UgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgIHByaXZhdGUgY2FtZXJhUGl0Y2g6IG51bWJlciA9IDA7IC8vIFZlcnRpY2FsIHJvdGF0aW9uIChwaXRjaCkgb2YgdGhlIGNhbWVyYVxyXG5cclxuICAgIC8vIEFzc2V0IG1hbmFnZW1lbnRcclxuICAgIHByaXZhdGUgdGV4dHVyZXM6IE1hcDxzdHJpbmcsIFRIUkVFLlRleHR1cmU+ID0gbmV3IE1hcCgpOyAvLyBTdG9yZXMgbG9hZGVkIHRleHR1cmVzXHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7IC8vIFN0b3JlcyBsb2FkZWQgYXVkaW8gZWxlbWVudHNcclxuXHJcbiAgICAvLyBVSSBlbGVtZW50cyAoZHluYW1pY2FsbHkgY3JlYXRlZCBmb3IgdGhlIHRpdGxlIHNjcmVlbilcclxuICAgIHByaXZhdGUgdGl0bGVTY3JlZW5PdmVybGF5ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHRpdGxlVGV4dCE6IEhUTUxEaXZFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBwcm9tcHRUZXh0ITogSFRNTERpdkVsZW1lbnQ7XHJcblxyXG4gICAgLy8gRm9yIGNhbGN1bGF0aW5nIGRlbHRhIHRpbWUgYmV0d2VlbiBmcmFtZXNcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXAgPSAwO1xyXG5cclxuICAgIC8vIE1PRElGSUVEOiBUcmFja3MgcGxheWVyIGNvbnRhY3RzIHdpdGggQU5ZIHN0YXRpYyBzdXJmYWNlIChncm91bmQgb3IgcGxhY2VkIG9iamVjdHMpIGZvciBqdW1waW5nL21vdmVtZW50IGxvZ2ljXHJcbiAgICBwcml2YXRlIG51bUNvbnRhY3RzV2l0aFN0YXRpY1N1cmZhY2VzOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgICAgIC8vIEdldCB0aGUgY2FudmFzIGVsZW1lbnQgZnJvbSBpbmRleC5odG1sXHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZUNhbnZhcycpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCBcImdhbWVDYW52YXNcIiBub3QgZm91bmQhJyk7XHJcbiAgICAgICAgICAgIHJldHVybjsgLy8gQ2Fubm90IHByb2NlZWQgd2l0aG91dCBhIGNhbnZhc1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmluaXQoKTsgLy8gU3RhcnQgdGhlIGFzeW5jaHJvbm91cyBpbml0aWFsaXphdGlvbiBwcm9jZXNzXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBc3luY2hyb25vdXNseSBpbml0aWFsaXplcyB0aGUgZ2FtZSwgbG9hZGluZyBjb25maWcsIGFzc2V0cywgYW5kIHNldHRpbmcgdXAgc3lzdGVtcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhc3luYyBpbml0KCkge1xyXG4gICAgICAgIC8vIDEuIExvYWQgZ2FtZSBjb25maWd1cmF0aW9uIGZyb20gZGF0YS5qc29uXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCBlcnJvciEgc3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ0dhbWUgY29uZmlndXJhdGlvbiBsb2FkZWQ6JywgdGhpcy5jb25maWcpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbjonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIC8vIElmIGNvbmZpZ3VyYXRpb24gZmFpbHMgdG8gbG9hZCwgZGlzcGxheSBhbiBlcnJvciBtZXNzYWdlIGFuZCBzdG9wLlxyXG4gICAgICAgICAgICBjb25zdCBlcnJvckRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRvcCA9ICc1MCUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5sZWZ0ID0gJzUwJSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRyYW5zZm9ybSA9ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5jb2xvciA9ICdyZWQnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5mb250U2l6ZSA9ICcyNHB4JztcclxuICAgICAgICAgICAgZXJyb3JEaXYudGV4dENvbnRlbnQgPSAnRXJyb3I6IEZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbi4gQ2hlY2sgY29uc29sZSBmb3IgZGV0YWlscy4nO1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVycm9yRGl2KTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gMi4gSW5pdGlhbGl6ZSBUaHJlZS5qcyAoc2NlbmUsIGNhbWVyYSwgcmVuZGVyZXIpXHJcbiAgICAgICAgdGhpcy5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKFxyXG4gICAgICAgICAgICA3NSwgLy8gRmllbGQgb2YgVmlldyAoRk9WKVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby53aWR0aCAvIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5maXhlZEFzcGVjdFJhdGlvLmhlaWdodCwgLy8gRml4ZWQgQXNwZWN0IHJhdGlvIGZyb20gY29uZmlnXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFOZWFyLCAvLyBOZWFyIGNsaXBwaW5nIHBsYW5lXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFGYXIgICAvLyBGYXIgY2xpcHBpbmcgcGxhbmVcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcih7IGNhbnZhczogdGhpcy5jYW52YXMsIGFudGlhbGlhczogdHJ1ZSB9KTtcclxuICAgICAgICAvLyBSZW5kZXJlciBzaXplIHdpbGwgYmUgc2V0IGJ5IGFwcGx5Rml4ZWRBc3BlY3RSYXRpbyB0byBmaXQgdGhlIHdpbmRvdyB3aGlsZSBtYWludGFpbmluZyBhc3BlY3QgcmF0aW9cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFBpeGVsUmF0aW8od2luZG93LmRldmljZVBpeGVsUmF0aW8pO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2hhZG93TWFwLmVuYWJsZWQgPSB0cnVlOyAvLyBFbmFibGUgc2hhZG93cyBmb3IgYmV0dGVyIHJlYWxpc21cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC50eXBlID0gVEhSRUUuUENGU29mdFNoYWRvd01hcDsgLy8gVXNlIHNvZnQgc2hhZG93c1xyXG5cclxuICAgICAgICAvLyBDYW1lcmEgc2V0dXAgZm9yIGRlY291cGxlZCB5YXcgYW5kIHBpdGNoOlxyXG4gICAgICAgIC8vIGNhbWVyYUNvbnRhaW5lciBoYW5kbGVzIHlhdyAoaG9yaXpvbnRhbCByb3RhdGlvbikgYW5kIGZvbGxvd3MgdGhlIHBsYXllcidzIHBvc2l0aW9uLlxyXG4gICAgICAgIC8vIFRoZSBjYW1lcmEgaXRzZWxmIGlzIGEgY2hpbGQgb2YgY2FtZXJhQ29udGFpbmVyIGFuZCBoYW5kbGVzIHBpdGNoICh2ZXJ0aWNhbCByb3RhdGlvbikuXHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIgPSBuZXcgVEhSRUUuT2JqZWN0M0QoKTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLmNhbWVyYUNvbnRhaW5lcik7XHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIuYWRkKHRoaXMuY2FtZXJhKTtcclxuICAgICAgICAvLyBQb3NpdGlvbiB0aGUgY2FtZXJhIHJlbGF0aXZlIHRvIHRoZSBjYW1lcmFDb250YWluZXIgKGF0IGV5ZSBsZXZlbClcclxuICAgICAgICB0aGlzLmNhbWVyYS5wb3NpdGlvbi55ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbWVyYUhlaWdodE9mZnNldDtcclxuXHJcblxyXG4gICAgICAgIC8vIDMuIEluaXRpYWxpemUgQ2Fubm9uLWVzIChwaHlzaWNzIHdvcmxkKVxyXG4gICAgICAgIHRoaXMud29ybGQgPSBuZXcgQ0FOTk9OLldvcmxkKCk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5ncmF2aXR5LnNldCgwLCAtOS44MiwgMCk7IC8vIFNldCBzdGFuZGFyZCBFYXJ0aCBncmF2aXR5IChZLWF4aXMgZG93bilcclxuICAgICAgICB0aGlzLndvcmxkLmJyb2FkcGhhc2UgPSBuZXcgQ0FOTk9OLlNBUEJyb2FkcGhhc2UodGhpcy53b3JsZCk7IC8vIFVzZSBhbiBlZmZpY2llbnQgYnJvYWRwaGFzZSBhbGdvcml0aG1cclxuICAgICAgICAvLyBGaXg6IENhc3QgdGhpcy53b3JsZC5zb2x2ZXIgdG8gQ0FOTk9OLkdTU29sdmVyIHRvIGFjY2VzcyB0aGUgJ2l0ZXJhdGlvbnMnIHByb3BlcnR5XHJcbiAgICAgICAgLy8gVGhlIGRlZmF1bHQgc29sdmVyIGluIENhbm5vbi5qcyAoYW5kIENhbm5vbi1lcykgaXMgR1NTb2x2ZXIsIHdoaWNoIGhhcyB0aGlzIHByb3BlcnR5LlxyXG4gICAgICAgICh0aGlzLndvcmxkLnNvbHZlciBhcyBDQU5OT04uR1NTb2x2ZXIpLml0ZXJhdGlvbnMgPSAxMDsgLy8gSW5jcmVhc2Ugc29sdmVyIGl0ZXJhdGlvbnMgZm9yIGJldHRlciBzdGFiaWxpdHlcclxuXHJcbiAgICAgICAgLy8gTkVXOiBDcmVhdGUgQ2Fubm9uLmpzIE1hdGVyaWFscyBhbmQgQ29udGFjdE1hdGVyaWFsIGZvciBwbGF5ZXItZ3JvdW5kIGludGVyYWN0aW9uXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ3BsYXllck1hdGVyaWFsJyk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ2dyb3VuZE1hdGVyaWFsJyk7XHJcbiAgICAgICAgdGhpcy5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdkZWZhdWx0T2JqZWN0TWF0ZXJpYWwnKTsgLy8gQURERUQ6IE1hdGVyaWFsIGZvciBnZW5lcmljIHBsYWNlZCBvYmplY3RzXHJcbiAgICAgICAgdGhpcy5idWxsZXRNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ2J1bGxldE1hdGVyaWFsJyk7IC8vIE5FVzogQnVsbGV0IG1hdGVyaWFsXHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllckdyb3VuZENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLnBsYXllck1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmdyb3VuZE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckdyb3VuZEZyaWN0aW9uLCAvLyBVc2UgY29uZmlndXJhYmxlIGdyb3VuZCBmcmljdGlvblxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCwgLy8gTm8gYm91bmNlIGZvciBncm91bmRcclxuICAgICAgICAgICAgICAgIC8vIE9wdGlvbmFsbHkgdHVuZSBjb250YWN0RXF1YXRpb25SZWxheGF0aW9uIGFuZCBmcmljdGlvbkVxdWF0aW9uUmVsYXhhdGlvbiBmb3Igc3RhYmlsaXR5L2ZlZWxcclxuICAgICAgICAgICAgICAgIC8vIGNvbnRhY3RFcXVhdGlvblJlbGF4YXRpb246IDMsIFxyXG4gICAgICAgICAgICAgICAgLy8gZnJpY3Rpb25FcXVhdGlvblJlbGF4YXRpb246IDNcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwocGxheWVyR3JvdW5kQ29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gQURERUQ6IFBsYXllci1PYmplY3QgY29udGFjdCBtYXRlcmlhbCAoZnJpY3Rpb24gYmV0d2VlbiBwbGF5ZXIgYW5kIHBsYWNlZCBvYmplY3RzKVxyXG4gICAgICAgIGNvbnN0IHBsYXllck9iamVjdENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLnBsYXllck1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRPYmplY3RNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJHcm91bmRGcmljdGlvbiwgLy8gU2FtZSBmcmljdGlvbiBhcyBwbGF5ZXItZ3JvdW5kXHJcbiAgICAgICAgICAgICAgICByZXN0aXR1dGlvbjogMC4wLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChwbGF5ZXJPYmplY3RDb250YWN0TWF0ZXJpYWwpO1xyXG5cclxuICAgICAgICAvLyBBRERFRDogT2JqZWN0LUdyb3VuZCBjb250YWN0IG1hdGVyaWFsIChmcmljdGlvbiBiZXR3ZWVuIHBsYWNlZCBvYmplY3RzIGFuZCBncm91bmQpXHJcbiAgICAgICAgLy8gVGhpcyBpcyBwcmltYXJpbHkgZm9yIGNvbnNpc3RlbmN5IGFuZCBpZiBwbGFjZWQgb2JqZWN0cyBtaWdodCBiZWNvbWUgZHluYW1pYyBsYXRlci5cclxuICAgICAgICBjb25zdCBvYmplY3RHcm91bmRDb250YWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICAgICAgdGhpcy5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZ3JvdW5kTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGZyaWN0aW9uOiAwLjAsIC8vIFVzZSBjb25maWd1cmFibGUgcGxheWVyLWdyb3VuZCBmcmljdGlvbiBmcm9tIGNvbmZpZ1xyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwob2JqZWN0R3JvdW5kQ29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gTkVXOiBCdWxsZXQtR3JvdW5kIGNvbnRhY3QgbWF0ZXJpYWwgKG5vIGZyaWN0aW9uLCBubyByZXN0aXR1dGlvbilcclxuICAgICAgICBjb25zdCBidWxsZXRHcm91bmRDb250YWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICAgICAgdGhpcy5idWxsZXRNYXRlcmlhbCxcclxuICAgICAgICAgICAgdGhpcy5ncm91bmRNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IDAuMCxcclxuICAgICAgICAgICAgICAgIHJlc3RpdHV0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKGJ1bGxldEdyb3VuZENvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogQnVsbGV0LU9iamVjdCBjb250YWN0IG1hdGVyaWFsIChubyBmcmljdGlvbiwgbm8gcmVzdGl0dXRpb24pXHJcbiAgICAgICAgY29uc3QgYnVsbGV0T2JqZWN0Q29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMuYnVsbGV0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogMC4wLFxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwoYnVsbGV0T2JqZWN0Q29udGFjdE1hdGVyaWFsKTtcclxuXHJcblxyXG4gICAgICAgIC8vIDQuIExvYWQgYXNzZXRzICh0ZXh0dXJlcyBhbmQgc291bmRzKVxyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG5cclxuICAgICAgICAvLyA1LiBDcmVhdGUgZ2FtZSBvYmplY3RzIChwbGF5ZXIsIGdyb3VuZCwgYW5kIG90aGVyIG9iamVjdHMpIGFuZCBsaWdodGluZ1xyXG4gICAgICAgIHRoaXMuY3JlYXRlR3JvdW5kKCk7IC8vIENyZWF0ZXMgdGhpcy5ncm91bmRCb2R5XHJcbiAgICAgICAgdGhpcy5jcmVhdGVQbGF5ZXIoKTsgLy8gQ3JlYXRlcyB0aGlzLnBsYXllckJvZHlcclxuICAgICAgICB0aGlzLmNyZWF0ZVBsYWNlZE9iamVjdHMoKTsgLy8gTkVXOiBDcmVhdGVzIG90aGVyIG9iamVjdHMgaW4gdGhlIHNjZW5lXHJcbiAgICAgICAgdGhpcy5zZXR1cExpZ2h0aW5nKCk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogQ3JlYXRlIHJldXNhYmxlIGJ1bGxldCBnZW9tZXRyeSBhbmQgbWF0ZXJpYWxcclxuICAgICAgICB0aGlzLmJ1bGxldEdlb21ldHJ5ID0gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5idWxsZXQuZGltZW5zaW9ucy5yYWRpdXMsIDgsIDgpO1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldFRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuYnVsbGV0LnRleHR1cmVOYW1lKTtcclxuICAgICAgICB0aGlzLmJ1bGxldE1hdGVyaWFsTWVzaCA9IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogYnVsbGV0VGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3I6IGJ1bGxldFRleHR1cmUgPyAweGZmZmZmZiA6IDB4ZmZmZjAwIC8vIFllbGxvdyBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIE1PRElGSUVEOiBTZXR1cCBDYW5ub24tZXMgY29udGFjdCBsaXN0ZW5lcnMgZm9yIGdlbmVyYWwgc3VyZmFjZSBjb250YWN0IGxvZ2ljXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRFdmVudExpc3RlbmVyKCdiZWdpbkNvbnRhY3QnLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgbGV0IGJvZHlBID0gZXZlbnQuYm9keUE7XHJcbiAgICAgICAgICAgIGxldCBib2R5QiA9IGV2ZW50LmJvZHlCO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgcGxheWVyQm9keSBpcyBpbnZvbHZlZCBpbiB0aGUgY29udGFjdFxyXG4gICAgICAgICAgICBpZiAoYm9keUEgPT09IHRoaXMucGxheWVyQm9keSB8fCBib2R5QiA9PT0gdGhpcy5wbGF5ZXJCb2R5KSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBvdGhlckJvZHkgPSBib2R5QSA9PT0gdGhpcy5wbGF5ZXJCb2R5ID8gYm9keUIgOiBib2R5QTtcclxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHRoZSBvdGhlciBib2R5IGlzIHN0YXRpYyAobWFzcyA9IDApLCB3aGljaCBpbmNsdWRlcyBncm91bmQgYW5kIHBsYWNlZCBvYmplY3RzXHJcbiAgICAgICAgICAgICAgICBpZiAob3RoZXJCb2R5Lm1hc3MgPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm51bUNvbnRhY3RzV2l0aFN0YXRpY1N1cmZhY2VzKys7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRFdmVudExpc3RlbmVyKCdlbmRDb250YWN0JywgKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgICAgIGxldCBib2R5QSA9IGV2ZW50LmJvZHlBO1xyXG4gICAgICAgICAgICBsZXQgYm9keUIgPSBldmVudC5ib2R5QjtcclxuXHJcbiAgICAgICAgICAgIGlmIChib2R5QSA9PT0gdGhpcy5wbGF5ZXJCb2R5IHx8IGJvZHlCID09PSB0aGlzLnBsYXllckJvZHkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG90aGVyQm9keSA9IGJvZHlBID09PSB0aGlzLnBsYXllckJvZHkgPyBib2R5QiA6IGJvZHlBO1xyXG4gICAgICAgICAgICAgICAgaWYgKG90aGVyQm9keS5tYXNzID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyA9IE1hdGgubWF4KDAsIHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgLSAxKTsgLy8gRW5zdXJlIGl0IGRvZXNuJ3QgZ28gYmVsb3cgMFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIDcuIFNldHVwIGV2ZW50IGxpc3RlbmVycyBmb3IgdXNlciBpbnB1dCBhbmQgd2luZG93IHJlc2l6aW5nXHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHRoaXMub25XaW5kb3dSZXNpemUuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMub25LZXlEb3duLmJpbmQodGhpcykpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5vbktleVVwLmJpbmQodGhpcykpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMub25Nb3VzZU1vdmUuYmluZCh0aGlzKSk7IC8vIEZvciBtb3VzZSBsb29rXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgdGhpcy5vbk1vdXNlRG93bi5iaW5kKHRoaXMpKTsgLy8gTkVXOiBGb3IgZmlyaW5nIGJ1bGxldHNcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRm9yIHBvaW50ZXIgbG9jayBzdGF0dXNcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3pwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRmlyZWZveCBjb21wYXRpYmlsaXR5XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0cG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7IC8vIFdlYmtpdCBjb21wYXRpYmlsaXR5XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGluaXRpYWwgZml4ZWQgYXNwZWN0IHJhdGlvIGFuZCBjZW50ZXIgdGhlIGNhbnZhc1xyXG4gICAgICAgIHRoaXMuYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCk7XHJcblxyXG4gICAgICAgIC8vIDguIFNldHVwIHRoZSB0aXRsZSBzY3JlZW4gVUlcclxuICAgICAgICB0aGlzLnNldHVwVGl0bGVTY3JlZW4oKTtcclxuXHJcbiAgICAgICAgLy8gU3RhcnQgdGhlIG1haW4gZ2FtZSBsb29wXHJcbiAgICAgICAgdGhpcy5hbmltYXRlKDApOyAvLyBQYXNzIGluaXRpYWwgdGltZSAwXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBMb2FkcyBhbGwgdGV4dHVyZXMgYW5kIHNvdW5kcyBkZWZpbmVkIGluIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEFzc2V0cygpIHtcclxuICAgICAgICBjb25zdCB0ZXh0dXJlTG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKTtcclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5tYXAoaW1nID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIHRleHR1cmVMb2FkZXIubG9hZEFzeW5jKGltZy5wYXRoKVxyXG4gICAgICAgICAgICAgICAgLnRoZW4odGV4dHVyZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlcy5zZXQoaW1nLm5hbWUsIHRleHR1cmUpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmUud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZzsgLy8gUmVwZWF0IHRleHR1cmUgaG9yaXpvbnRhbGx5XHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nOyAvLyBSZXBlYXQgdGV4dHVyZSB2ZXJ0aWNhbGx5XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQWRqdXN0IHRleHR1cmUgcmVwZXRpdGlvbiBmb3IgdGhlIGdyb3VuZCB0byBhdm9pZCBzdHJldGNoaW5nXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGltZy5uYW1lID09PSAnZ3JvdW5kX3RleHR1cmUnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLnJlcGVhdC5zZXQodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyA1LCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDUpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAvLyBGb3IgYm94IHRleHR1cmVzLCBlbnN1cmUgcmVwZXRpdGlvbiBpZiBkZXNpcmVkLCBvciBzZXQgdG8gMSwxIGZvciBzaW5nbGUgYXBwbGljYXRpb25cclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW1nLm5hbWUuZW5kc1dpdGgoJ190ZXh0dXJlJykpIHsgLy8gR2VuZXJpYyBjaGVjayBmb3Igb3RoZXIgdGV4dHVyZXNcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yIGdlbmVyaWMgYm94IHRleHR1cmVzLCB3ZSBtaWdodCB3YW50IHRvIHJlcGVhdCBiYXNlZCBvbiBvYmplY3QgZGltZW5zaW9uc1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGb3Igc2ltcGxpY2l0eSBub3csIGxldCdzIGtlZXAgZGVmYXVsdCAobm8gcmVwZWF0IHVubGVzcyBleHBsaWNpdCBmb3IgZ3JvdW5kKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBBIG1vcmUgcm9idXN0IHNvbHV0aW9uIHdvdWxkIGludm9sdmUgc2V0dGluZyByZXBlYXQgYmFzZWQgb24gc2NhbGUvZGltZW5zaW9ucyBmb3IgZWFjaCBvYmplY3RcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCB0ZXh0dXJlOiAke2ltZy5wYXRofWAsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICAvLyBDb250aW51ZSBldmVuIGlmIGFuIGFzc2V0IGZhaWxzIHRvIGxvYWQ7IGZhbGxiYWNrcyAoc29saWQgY29sb3JzKSBhcmUgdXNlZC5cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5tYXAoc291bmQgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKHNvdW5kLnBhdGgpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gc291bmQudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ubG9vcCA9IChzb3VuZC5uYW1lID09PSAnYmFja2dyb3VuZF9tdXNpYycpOyAvLyBMb29wIGJhY2tncm91bmQgbXVzaWNcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KHNvdW5kLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtzb3VuZC5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gUmVzb2x2ZSBldmVuIG9uIGVycm9yIHRvIG5vdCBibG9jayBQcm9taXNlLmFsbFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYEFzc2V0cyBsb2FkZWQ6ICR7dGhpcy50ZXh0dXJlcy5zaXplfSB0ZXh0dXJlcywgJHt0aGlzLnNvdW5kcy5zaXplfSBzb3VuZHMuYCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGFuZCBkaXNwbGF5cyB0aGUgdGl0bGUgc2NyZWVuIFVJIGR5bmFtaWNhbGx5LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNldHVwVGl0bGVTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LnN0eWxlLCB7XHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLCAvLyBQb3NpdGlvbiByZWxhdGl2ZSB0byBib2R5LCB3aWxsIGJlIGNlbnRlcmVkIGFuZCBzaXplZCBieSBhcHBseUZpeGVkQXNwZWN0UmF0aW9cclxuICAgICAgICAgICAgYmFja2dyb3VuZENvbG9yOiAncmdiYSgwLCAwLCAwLCAwLjgpJyxcclxuICAgICAgICAgICAgZGlzcGxheTogJ2ZsZXgnLCBmbGV4RGlyZWN0aW9uOiAnY29sdW1uJyxcclxuICAgICAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLCBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcclxuICAgICAgICAgICAgY29sb3I6ICd3aGl0ZScsIGZvbnRGYW1pbHk6ICdBcmlhbCwgc2Fucy1zZXJpZicsXHJcbiAgICAgICAgICAgIGZvbnRTaXplOiAnNDhweCcsIHRleHRBbGlnbjogJ2NlbnRlcicsIHpJbmRleDogJzEwMDAnXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSk7XHJcblxyXG4gICAgICAgIC8vIENydWNpYWw6IENhbGwgYXBwbHlGaXhlZEFzcGVjdFJhdGlvIGhlcmUgdG8gZW5zdXJlIHRoZSB0aXRsZSBzY3JlZW4gb3ZlcmxheVxyXG4gICAgICAgIC8vIGlzIHNpemVkIGFuZCBwb3NpdGlvbmVkIGNvcnJlY3RseSByZWxhdGl2ZSB0byB0aGUgY2FudmFzIGZyb20gdGhlIHN0YXJ0LlxyXG4gICAgICAgIHRoaXMuYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCk7XHJcblxyXG4gICAgICAgIHRoaXMudGl0bGVUZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy50aXRsZVRleHQudGV4dENvbnRlbnQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MudGl0bGVTY3JlZW5UZXh0O1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LmFwcGVuZENoaWxkKHRoaXMudGl0bGVUZXh0KTtcclxuXHJcbiAgICAgICAgdGhpcy5wcm9tcHRUZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy5wcm9tcHRUZXh0LnRleHRDb250ZW50ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnN0YXJ0R2FtZVByb21wdDtcclxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMucHJvbXB0VGV4dC5zdHlsZSwge1xyXG4gICAgICAgICAgICBtYXJnaW5Ub3A6ICcyMHB4JywgZm9udFNpemU6ICcyNHB4J1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LmFwcGVuZENoaWxkKHRoaXMucHJvbXB0VGV4dCk7XHJcblxyXG4gICAgICAgIC8vIEFkZCBldmVudCBsaXN0ZW5lciBkaXJlY3RseSB0byB0aGUgb3ZlcmxheSB0byBjYXB0dXJlIGNsaWNrcyBhbmQgc3RhcnQgdGhlIGdhbWVcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRoaXMuc3RhcnRHYW1lKCkpO1xyXG5cclxuICAgICAgICAvLyBBdHRlbXB0IHRvIHBsYXkgYmFja2dyb3VuZCBtdXNpYy4gSXQgbWlnaHQgYmUgYmxvY2tlZCBieSBicm93c2VycyBpZiBubyB1c2VyIGdlc3R1cmUgaGFzIG9jY3VycmVkIHlldC5cclxuICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ2JhY2tncm91bmRfbXVzaWMnKT8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJCR00gcGxheSBkZW5pZWQgKHJlcXVpcmVzIHVzZXIgZ2VzdHVyZSk6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRyYW5zaXRpb25zIHRoZSBnYW1lIGZyb20gdGhlIHRpdGxlIHNjcmVlbiB0byB0aGUgcGxheWluZyBzdGF0ZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKSB7XHJcbiAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgIC8vIFJlbW92ZSB0aGUgdGl0bGUgc2NyZWVuIG92ZXJsYXlcclxuICAgICAgICBpZiAodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkgJiYgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkucGFyZW50Tm9kZSkge1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gQWRkIGV2ZW50IGxpc3RlbmVyIHRvIGNhbnZhcyBmb3IgcmUtbG9ja2luZyBwb2ludGVyIGFmdGVyIHRpdGxlIHNjcmVlbiBpcyBnb25lXHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmhhbmRsZUNhbnZhc1JlTG9ja1BvaW50ZXIuYmluZCh0aGlzKSk7XHJcblxyXG4gICAgICAgIC8vIFJlcXVlc3QgcG9pbnRlciBsb2NrIGZvciBpbW1lcnNpdmUgbW91c2UgY29udHJvbFxyXG4gICAgICAgIHRoaXMuY2FudmFzLnJlcXVlc3RQb2ludGVyTG9jaygpO1xyXG4gICAgICAgIC8vIEVuc3VyZSBiYWNrZ3JvdW5kIG11c2ljIHBsYXlzIG5vdyB0aGF0IGEgdXNlciBnZXN0dXJlIGhhcyBvY2N1cnJlZFxyXG4gICAgICAgIHRoaXMuc291bmRzLmdldCgnYmFja2dyb3VuZF9tdXNpYycpPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIkJHTSBwbGF5IGZhaWxlZCBhZnRlciB1c2VyIGdlc3R1cmU6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgY2xpY2tzIG9uIHRoZSBjYW52YXMgdG8gcmUtbG9jayB0aGUgcG9pbnRlciBpZiB0aGUgZ2FtZSBpcyBwbGF5aW5nIGFuZCB1bmxvY2tlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVDYW52YXNSZUxvY2tQb2ludGVyKCkge1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiAhdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMucmVxdWVzdFBvaW50ZXJMb2NrKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyB0aGUgcGxheWVyJ3MgdmlzdWFsIG1lc2ggYW5kIHBoeXNpY3MgYm9keS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVQbGF5ZXIoKSB7XHJcbiAgICAgICAgLy8gUGxheWVyIHZpc3VhbCBtZXNoIChhIHNpbXBsZSBib3gpXHJcbiAgICAgICAgY29uc3QgcGxheWVyVGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KCdwbGF5ZXJfdGV4dHVyZScpO1xyXG4gICAgICAgIGNvbnN0IHBsYXllck1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICBtYXA6IHBsYXllclRleHR1cmUsXHJcbiAgICAgICAgICAgIGNvbG9yOiBwbGF5ZXJUZXh0dXJlID8gMHhmZmZmZmYgOiAweDAwNzdmZiAvLyBVc2Ugd2hpdGUgd2l0aCB0ZXh0dXJlLCBvciBibHVlIGlmIG5vIHRleHR1cmVcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBwbGF5ZXJHZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgxLCAyLCAxKTsgLy8gUGxheWVyIGRpbWVuc2lvbnNcclxuICAgICAgICB0aGlzLnBsYXllck1lc2ggPSBuZXcgVEhSRUUuTWVzaChwbGF5ZXJHZW9tZXRyeSwgcGxheWVyTWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi55ID0gNTsgLy8gU3RhcnQgcGxheWVyIHNsaWdodGx5IGFib3ZlIHRoZSBncm91bmRcclxuICAgICAgICB0aGlzLnBsYXllck1lc2guY2FzdFNoYWRvdyA9IHRydWU7IC8vIFBsYXllciBjYXN0cyBhIHNoYWRvd1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMucGxheWVyTWVzaCk7XHJcblxyXG4gICAgICAgIC8vIFBsYXllciBwaHlzaWNzIGJvZHkgKENhbm5vbi5qcyBib3ggc2hhcGUpXHJcbiAgICAgICAgY29uc3QgcGxheWVyU2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoMC41LCAxLCAwLjUpKTsgLy8gSGFsZiBleHRlbnRzIG9mIHRoZSBib3ggZm9yIGNvbGxpc2lvblxyXG4gICAgICAgIHRoaXMucGxheWVyQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJNYXNzLCAvLyBQbGF5ZXIncyBtYXNzXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzModGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLngsIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi55LCB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgIHNoYXBlOiBwbGF5ZXJTaGFwZSxcclxuICAgICAgICAgICAgZml4ZWRSb3RhdGlvbjogdHJ1ZSwgLy8gUHJldmVudCB0aGUgcGxheWVyIGZyb20gZmFsbGluZyBvdmVyIChzaW11bGF0ZXMgYSBjYXBzdWxlL2N5bGluZGVyIGNoYXJhY3RlcilcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMucGxheWVyTWF0ZXJpYWwgLy8gQXNzaWduIHRoZSBwbGF5ZXIgbWF0ZXJpYWwgZm9yIGNvbnRhY3QgcmVzb2x1dGlvblxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLnBsYXllckJvZHkpO1xyXG5cclxuICAgICAgICAvLyBTZXQgaW5pdGlhbCBjYW1lcmFDb250YWluZXIgcG9zaXRpb24gdG8gcGxheWVyJ3MgcGh5c2ljcyBib2R5IHBvc2l0aW9uLlxyXG4gICAgICAgIC8vIFRoZSBjYW1lcmEgaXRzZWxmIGlzIGEgY2hpbGQgb2YgY2FtZXJhQ29udGFpbmVyIGFuZCBoYXMgaXRzIG93biBsb2NhbCBZIG9mZnNldC5cclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyB0aGUgZ3JvdW5kJ3MgdmlzdWFsIG1lc2ggYW5kIHBoeXNpY3MgYm9keS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVHcm91bmQoKSB7XHJcbiAgICAgICAgLy8gR3JvdW5kIHZpc3VhbCBtZXNoIChhIGxhcmdlIHBsYW5lKVxyXG4gICAgICAgIGNvbnN0IGdyb3VuZFRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgnZ3JvdW5kX3RleHR1cmUnKTtcclxuICAgICAgICBjb25zdCBncm91bmRNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgbWFwOiBncm91bmRUZXh0dXJlLFxyXG4gICAgICAgICAgICBjb2xvcjogZ3JvdW5kVGV4dHVyZSA/IDB4ZmZmZmZmIDogMHg4ODg4ODggLy8gVXNlIHdoaXRlIHdpdGggdGV4dHVyZSwgb3IgZ3JleSBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kR2VvbWV0cnkgPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeSh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdyb3VuZEdlb21ldHJ5LCBncm91bmRNYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRNZXNoLnJvdGF0aW9uLnggPSAtTWF0aC5QSSAvIDI7IC8vIFJvdGF0ZSB0byBsYXkgZmxhdCBvbiB0aGUgWFogcGxhbmVcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7IC8vIEdyb3VuZCByZWNlaXZlcyBzaGFkb3dzXHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5ncm91bmRNZXNoKTtcclxuXHJcbiAgICAgICAgLy8gR3JvdW5kIHBoeXNpY3MgYm9keSAoQ2Fubm9uLmpzIHBsYW5lIHNoYXBlKVxyXG4gICAgICAgIGNvbnN0IGdyb3VuZFNoYXBlID0gbmV3IENBTk5PTi5QbGFuZSgpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IDAsIC8vIEEgbWFzcyBvZiAwIG1ha2VzIGl0IGEgc3RhdGljIChpbW1vdmFibGUpIGJvZHlcclxuICAgICAgICAgICAgc2hhcGU6IGdyb3VuZFNoYXBlLFxyXG4gICAgICAgICAgICBtYXRlcmlhbDogdGhpcy5ncm91bmRNYXRlcmlhbCAvLyBBc3NpZ24gdGhlIGdyb3VuZCBtYXRlcmlhbCBmb3IgY29udGFjdCByZXNvbHV0aW9uXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgLy8gUm90YXRlIHRoZSBDYW5ub24uanMgcGxhbmUgYm9keSB0byBtYXRjaCB0aGUgVGhyZWUuanMgcGxhbmUgb3JpZW50YXRpb24gKGZsYXQpXHJcbiAgICAgICAgdGhpcy5ncm91bmRCb2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShuZXcgQ0FOTk9OLlZlYzMoMSwgMCwgMCksIC1NYXRoLlBJIC8gMik7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KHRoaXMuZ3JvdW5kQm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IENyZWF0ZXMgdmlzdWFsIG1lc2hlcyBhbmQgcGh5c2ljcyBib2RpZXMgZm9yIGFsbCBvYmplY3RzIGRlZmluZWQgaW4gY29uZmlnLmdhbWVTZXR0aW5ncy5wbGFjZWRPYmplY3RzLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNyZWF0ZVBsYWNlZE9iamVjdHMoKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxhY2VkT2JqZWN0cykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJObyBwbGFjZWRPYmplY3RzIGRlZmluZWQgaW4gZ2FtZVNldHRpbmdzLlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYWNlZE9iamVjdHMuZm9yRWFjaChvYmpDb25maWcgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQob2JqQ29uZmlnLnRleHR1cmVOYW1lKTtcclxuICAgICAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgICAgICBtYXA6IHRleHR1cmUsXHJcbiAgICAgICAgICAgICAgICBjb2xvcjogdGV4dHVyZSA/IDB4ZmZmZmZmIDogMHhhYWFhYWEgLy8gRGVmYXVsdCBncmV5IGlmIG5vIHRleHR1cmVcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvLyBDcmVhdGUgVGhyZWUuanMgTWVzaFxyXG4gICAgICAgICAgICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeShvYmpDb25maWcuZGltZW5zaW9ucy53aWR0aCwgb2JqQ29uZmlnLmRpbWVuc2lvbnMuaGVpZ2h0LCBvYmpDb25maWcuZGltZW5zaW9ucy5kZXB0aCk7XHJcbiAgICAgICAgICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSwgbWF0ZXJpYWwpO1xyXG4gICAgICAgICAgICBtZXNoLnBvc2l0aW9uLnNldChvYmpDb25maWcucG9zaXRpb24ueCwgb2JqQ29uZmlnLnBvc2l0aW9uLnksIG9iakNvbmZpZy5wb3NpdGlvbi56KTtcclxuICAgICAgICAgICAgaWYgKG9iakNvbmZpZy5yb3RhdGlvblkgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgbWVzaC5yb3RhdGlvbi55ID0gb2JqQ29uZmlnLnJvdGF0aW9uWTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICBtZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZChtZXNoKTtcclxuICAgICAgICAgICAgdGhpcy5wbGFjZWRPYmplY3RNZXNoZXMucHVzaChtZXNoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIENyZWF0ZSBDYW5ub24uanMgQm9keVxyXG4gICAgICAgICAgICAvLyBDYW5ub24uQm94IHRha2VzIGhhbGYgZXh0ZW50c1xyXG4gICAgICAgICAgICBjb25zdCBzaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhcclxuICAgICAgICAgICAgICAgIG9iakNvbmZpZy5kaW1lbnNpb25zLndpZHRoIC8gMixcclxuICAgICAgICAgICAgICAgIG9iakNvbmZpZy5kaW1lbnNpb25zLmhlaWdodCAvIDIsXHJcbiAgICAgICAgICAgICAgICBvYmpDb25maWcuZGltZW5zaW9ucy5kZXB0aCAvIDJcclxuICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICAgICAgbWFzczogb2JqQ29uZmlnLm1hc3MsIC8vIFVzZSAwIGZvciBzdGF0aWMgb2JqZWN0cywgPjAgZm9yIGR5bmFtaWNcclxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMob2JqQ29uZmlnLnBvc2l0aW9uLngsIG9iakNvbmZpZy5wb3NpdGlvbi55LCBvYmpDb25maWcucG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgICAgICBzaGFwZTogc2hhcGUsXHJcbiAgICAgICAgICAgICAgICBtYXRlcmlhbDogdGhpcy5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwgLy8gQURERUQ6IEFzc2lnbiB0aGUgZGVmYXVsdCBvYmplY3QgbWF0ZXJpYWxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIGlmIChvYmpDb25maWcucm90YXRpb25ZICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIGJvZHkucXVhdGVybmlvbi5zZXRGcm9tQXhpc0FuZ2xlKG5ldyBDQU5OT04uVmVjMygwLCAxLCAwKSwgb2JqQ29uZmlnLnJvdGF0aW9uWSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KGJvZHkpO1xyXG4gICAgICAgICAgICB0aGlzLnBsYWNlZE9iamVjdEJvZGllcy5wdXNoKGJvZHkpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBDcmVhdGVkICR7dGhpcy5wbGFjZWRPYmplY3RNZXNoZXMubGVuZ3RofSBwbGFjZWQgb2JqZWN0cy5gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdXAgYW1iaWVudCBhbmQgZGlyZWN0aW9uYWwgbGlnaHRpbmcgaW4gdGhlIHNjZW5lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNldHVwTGlnaHRpbmcoKSB7XHJcbiAgICAgICAgY29uc3QgYW1iaWVudExpZ2h0ID0gbmV3IFRIUkVFLkFtYmllbnRMaWdodCgweDQwNDA0MCwgMS4wKTsgLy8gU29mdCB3aGl0ZSBhbWJpZW50IGxpZ2h0XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoYW1iaWVudExpZ2h0KTtcclxuXHJcbiAgICAgICAgY29uc3QgZGlyZWN0aW9uYWxMaWdodCA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KDB4ZmZmZmZmLCAwLjgpOyAvLyBCcmlnaHRlciBkaXJlY3Rpb25hbCBsaWdodFxyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQucG9zaXRpb24uc2V0KDUsIDEwLCA1KTsgLy8gUG9zaXRpb24gdGhlIGxpZ2h0IHNvdXJjZVxyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuY2FzdFNoYWRvdyA9IHRydWU7IC8vIEVuYWJsZSBzaGFkb3dzIGZyb20gdGhpcyBsaWdodCBzb3VyY2VcclxuICAgICAgICAvLyBDb25maWd1cmUgc2hhZG93IHByb3BlcnRpZXMgZm9yIHRoZSBkaXJlY3Rpb25hbCBsaWdodFxyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93Lm1hcFNpemUud2lkdGggPSAxMDI0O1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93Lm1hcFNpemUuaGVpZ2h0ID0gMTAyNDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEubmVhciA9IDAuNTtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEuZmFyID0gNTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmxlZnQgPSAtMTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLnJpZ2h0ID0gMTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLnRvcCA9IDEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5ib3R0b20gPSAtMTA7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoZGlyZWN0aW9uYWxMaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGVzIHdpbmRvdyByZXNpemluZyB0byBrZWVwIHRoZSBjYW1lcmEgYXNwZWN0IHJhdGlvIGFuZCByZW5kZXJlciBzaXplIGNvcnJlY3QuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25XaW5kb3dSZXNpemUoKSB7XHJcbiAgICAgICAgdGhpcy5hcHBseUZpeGVkQXNwZWN0UmF0aW8oKTsgLy8gQXBwbHkgdGhlIGZpeGVkIGFzcGVjdCByYXRpbyBhbmQgY2VudGVyIHRoZSBjYW52YXNcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFwcGxpZXMgdGhlIGNvbmZpZ3VyZWQgZml4ZWQgYXNwZWN0IHJhdGlvIHRvIHRoZSByZW5kZXJlciBhbmQgY2FtZXJhLFxyXG4gICAgICogcmVzaXppbmcgYW5kIGNlbnRlcmluZyB0aGUgY2FudmFzIHRvIGZpdCB3aXRoaW4gdGhlIHdpbmRvdy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhcHBseUZpeGVkQXNwZWN0UmF0aW8oKSB7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0QXNwZWN0UmF0aW8gPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby53aWR0aCAvIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5maXhlZEFzcGVjdFJhdGlvLmhlaWdodDtcclxuXHJcbiAgICAgICAgbGV0IG5ld1dpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgbGV0IG5ld0hlaWdodDogbnVtYmVyO1xyXG5cclxuICAgICAgICBjb25zdCB3aW5kb3dXaWR0aCA9IHdpbmRvdy5pbm5lcldpZHRoO1xyXG4gICAgICAgIGNvbnN0IHdpbmRvd0hlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodDtcclxuICAgICAgICBjb25zdCBjdXJyZW50V2luZG93QXNwZWN0UmF0aW8gPSB3aW5kb3dXaWR0aCAvIHdpbmRvd0hlaWdodDtcclxuXHJcbiAgICAgICAgaWYgKGN1cnJlbnRXaW5kb3dBc3BlY3RSYXRpbyA+IHRhcmdldEFzcGVjdFJhdGlvKSB7XHJcbiAgICAgICAgICAgIC8vIFdpbmRvdyBpcyB3aWRlciB0aGFuIHRhcmdldCBhc3BlY3QgcmF0aW8sIGhlaWdodCBpcyB0aGUgbGltaXRpbmcgZmFjdG9yXHJcbiAgICAgICAgICAgIG5ld0hlaWdodCA9IHdpbmRvd0hlaWdodDtcclxuICAgICAgICAgICAgbmV3V2lkdGggPSBuZXdIZWlnaHQgKiB0YXJnZXRBc3BlY3RSYXRpbztcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBXaW5kb3cgaXMgdGFsbGVyIChvciBleGFjdGx5KSB0aGUgdGFyZ2V0IGFzcGVjdCByYXRpbywgd2lkdGggaXMgdGhlIGxpbWl0aW5nIGZhY3RvclxyXG4gICAgICAgICAgICBuZXdXaWR0aCA9IHdpbmRvd1dpZHRoO1xyXG4gICAgICAgICAgICBuZXdIZWlnaHQgPSBuZXdXaWR0aCAvIHRhcmdldEFzcGVjdFJhdGlvO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU2V0IHJlbmRlcmVyIHNpemUuIFRoZSB0aGlyZCBhcmd1bWVudCBgdXBkYXRlU3R5bGVgIGlzIGZhbHNlIGJlY2F1c2Ugd2UgbWFuYWdlIHN0eWxlIG1hbnVhbGx5LlxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZShuZXdXaWR0aCwgbmV3SGVpZ2h0LCBmYWxzZSk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuYXNwZWN0ID0gdGFyZ2V0QXNwZWN0UmF0aW87XHJcbiAgICAgICAgdGhpcy5jYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xyXG5cclxuICAgICAgICAvLyBQb3NpdGlvbiBhbmQgc2l6ZSB0aGUgY2FudmFzIGVsZW1lbnQgdXNpbmcgQ1NTXHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLmNhbnZhcy5zdHlsZSwge1xyXG4gICAgICAgICAgICB3aWR0aDogYCR7bmV3V2lkdGh9cHhgLFxyXG4gICAgICAgICAgICBoZWlnaHQ6IGAke25ld0hlaWdodH1weGAsXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxyXG4gICAgICAgICAgICB0b3A6ICc1MCUnLFxyXG4gICAgICAgICAgICBsZWZ0OiAnNTAlJyxcclxuICAgICAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsIC01MCUpJyxcclxuICAgICAgICAgICAgb2JqZWN0Rml0OiAnY29udGFpbicgLy8gRW5zdXJlcyBjb250ZW50IGlzIHNjYWxlZCBhcHByb3ByaWF0ZWx5IGlmIHRoZXJlJ3MgYW55IG1pc21hdGNoXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZSB0aXRsZSBzY3JlZW4gaXMgYWN0aXZlLCB1cGRhdGUgaXRzIHNpemUgYW5kIHBvc2l0aW9uIGFzIHdlbGwgdG8gbWF0Y2ggdGhlIGNhbnZhc1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUgJiYgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkpIHtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5zdHlsZSwge1xyXG4gICAgICAgICAgICAgICAgd2lkdGg6IGAke25ld1dpZHRofXB4YCxcclxuICAgICAgICAgICAgICAgIGhlaWdodDogYCR7bmV3SGVpZ2h0fXB4YCxcclxuICAgICAgICAgICAgICAgIHRvcDogJzUwJScsXHJcbiAgICAgICAgICAgICAgICBsZWZ0OiAnNTAlJyxcclxuICAgICAgICAgICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLCAtNTAlKScsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlY29yZHMgd2hpY2gga2V5cyBhcmUgY3VycmVudGx5IHByZXNzZWQgZG93bi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbktleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcclxuICAgICAgICB0aGlzLmtleXNbZXZlbnQua2V5LnRvTG93ZXJDYXNlKCldID0gdHJ1ZTtcclxuICAgICAgICAvLyBBRERFRDogSGFuZGxlIGp1bXAgaW5wdXQgb25seSB3aGVuIHBsYXlpbmcgYW5kIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmIHRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIGlmIChldmVudC5rZXkudG9Mb3dlckNhc2UoKSA9PT0gJyAnKSB7IC8vIFNwYWNlYmFyXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckp1bXAoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlY29yZHMgd2hpY2gga2V5cyBhcmUgY3VycmVudGx5IHJlbGVhc2VkLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uS2V5VXAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcclxuICAgICAgICB0aGlzLmtleXNbZXZlbnQua2V5LnRvTG93ZXJDYXNlKCldID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGVzIG1vdXNlIG1vdmVtZW50IGZvciBjYW1lcmEgcm90YXRpb24gKG1vdXNlIGxvb2spLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uTW91c2VNb3ZlKGV2ZW50OiBNb3VzZUV2ZW50KSB7XHJcbiAgICAgICAgLy8gT25seSBwcm9jZXNzIG1vdXNlIG1vdmVtZW50IGlmIHRoZSBnYW1lIGlzIHBsYXlpbmcgYW5kIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmIHRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG1vdmVtZW50WCA9IGV2ZW50Lm1vdmVtZW50WCB8fCAwO1xyXG4gICAgICAgICAgICBjb25zdCBtb3ZlbWVudFkgPSBldmVudC5tb3ZlbWVudFkgfHwgMDtcclxuXHJcbiAgICAgICAgICAgIC8vIEFwcGx5IGhvcml6b250YWwgcm90YXRpb24gKHlhdykgdG8gdGhlIGNhbWVyYUNvbnRhaW5lciBhcm91bmQgaXRzIGxvY2FsIFktYXhpcyAod2hpY2ggaXMgZ2xvYmFsIFkpXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLnJvdGF0aW9uLnkgLT0gbW92ZW1lbnRYICogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm1vdXNlU2Vuc2l0aXZpdHk7XHJcblxyXG4gICAgICAgICAgICAvLyBBcHBseSB2ZXJ0aWNhbCByb3RhdGlvbiAocGl0Y2gpIHRvIHRoZSBjYW1lcmEgaXRzZWxmIGFuZCBjbGFtcCBpdFxyXG4gICAgICAgICAgICAvLyBNb3VzZSBVUCAobW92ZW1lbnRZIDwgMCkgbm93IGluY3JlYXNlcyBjYW1lcmFQaXRjaCAtPiBsb29rcyB1cC5cclxuICAgICAgICAgICAgLy8gTW91c2UgRE9XTiAobW92ZW1lbnRZID4gMCkgbm93IGRlY3JlYXNlcyBjYW1lcmFQaXRjaCAtPiBsb29rcyBkb3duLlxyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYVBpdGNoIC09IG1vdmVtZW50WSAqIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5tb3VzZVNlbnNpdGl2aXR5OyBcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFQaXRjaCA9IE1hdGgubWF4KC1NYXRoLlBJIC8gMiwgTWF0aC5taW4oTWF0aC5QSSAvIDIsIHRoaXMuY2FtZXJhUGl0Y2gpKTsgLy8gQ2xhbXAgdG8gLTkwIHRvICs5MCBkZWdyZWVzXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnJvdGF0aW9uLnggPSB0aGlzLmNhbWVyYVBpdGNoO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogSGFuZGxlcyBtb3VzZSBjbGljayBmb3IgZmlyaW5nIGJ1bGxldHMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25Nb3VzZURvd24oZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgdGhpcy5pc1BvaW50ZXJMb2NrZWQgJiYgZXZlbnQuYnV0dG9uID09PSAwKSB7IC8vIExlZnQgbW91c2UgYnV0dG9uXHJcbiAgICAgICAgICAgIHRoaXMuZmlyZUJ1bGxldCgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogRmlyZXMgYSBidWxsZXQgZnJvbSB0aGUgcGxheWVyJ3MgY2FtZXJhIHBvc2l0aW9uIGFuZCBkaXJlY3Rpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgZmlyZUJ1bGxldCgpIHtcclxuICAgICAgICBjb25zdCBidWxsZXRDb25maWcgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuYnVsbGV0O1xyXG5cclxuICAgICAgICAvLyAxLiBHZXQgYnVsbGV0IGluaXRpYWwgcG9zaXRpb24gYW5kIGRpcmVjdGlvblxyXG4gICAgICAgIGNvbnN0IGNhbWVyYVdvcmxkUG9zaXRpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24oY2FtZXJhV29ybGRQb3NpdGlvbik7XHJcblxyXG4gICAgICAgIGNvbnN0IGNhbWVyYVdvcmxkRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZERpcmVjdGlvbihjYW1lcmFXb3JsZERpcmVjdGlvbik7XHJcblxyXG4gICAgICAgIC8vIDIuIENyZWF0ZSBUaHJlZS5qcyBNZXNoIGZvciB0aGUgYnVsbGV0XHJcbiAgICAgICAgY29uc3QgYnVsbGV0TWVzaCA9IG5ldyBUSFJFRS5NZXNoKHRoaXMuYnVsbGV0R2VvbWV0cnksIHRoaXMuYnVsbGV0TWF0ZXJpYWxNZXNoKTtcclxuICAgICAgICBidWxsZXRNZXNoLnBvc2l0aW9uLmNvcHkoY2FtZXJhV29ybGRQb3NpdGlvbik7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoYnVsbGV0TWVzaCk7XHJcblxyXG4gICAgICAgIC8vIDMuIENyZWF0ZSBDYW5ub24uanMgQm9keSBmb3IgdGhlIGJ1bGxldFxyXG4gICAgICAgIGNvbnN0IGJ1bGxldFNoYXBlID0gbmV3IENBTk5PTi5TcGhlcmUoYnVsbGV0Q29uZmlnLmRpbWVuc2lvbnMucmFkaXVzKTtcclxuICAgICAgICBjb25zdCBidWxsZXRCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogYnVsbGV0Q29uZmlnLm1hc3MsXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMoY2FtZXJhV29ybGRQb3NpdGlvbi54LCBjYW1lcmFXb3JsZFBvc2l0aW9uLnksIGNhbWVyYVdvcmxkUG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgIHNoYXBlOiBidWxsZXRTaGFwZSxcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMuYnVsbGV0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIC8vIEJ1bGxldHMgc2hvdWxkIG5vdCBiZSBhZmZlY3RlZCBieSBwbGF5ZXIgbW92ZW1lbnQsIGJ1dCBzaG91bGQgaGF2ZSBncmF2aXR5XHJcbiAgICAgICAgICAgIGxpbmVhckRhbXBpbmc6IDAuMDEsIC8vIFNtYWxsIGRhbXBpbmcgdG8gcHJldmVudCBpbmZpbml0ZSBzbGlkaW5nXHJcbiAgICAgICAgICAgIGFuZ3VsYXJEYW1waW5nOiAwLjk5IC8vIEFsbG93cyBzb21lIHJvdGF0aW9uLCBidXQgc3RvcHMgcXVpY2tseVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBTZXQgYnVsbGV0IGluaXRpYWwgdmVsb2NpdHlcclxuICAgICAgICBidWxsZXRCb2R5LnZlbG9jaXR5LnNldChcclxuICAgICAgICAgICAgY2FtZXJhV29ybGREaXJlY3Rpb24ueCAqIGJ1bGxldENvbmZpZy5zcGVlZCxcclxuICAgICAgICAgICAgY2FtZXJhV29ybGREaXJlY3Rpb24ueSAqIGJ1bGxldENvbmZpZy5zcGVlZCxcclxuICAgICAgICAgICAgY2FtZXJhV29ybGREaXJlY3Rpb24ueiAqIGJ1bGxldENvbmZpZy5zcGVlZFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIFN0b3JlIGEgcmVmZXJlbmNlIHRvIHRoZSBhY3RpdmUgYnVsbGV0IG9iamVjdCBvbiB0aGUgYm9keSBmb3IgY29sbGlzaW9uIGNhbGxiYWNrXHJcbiAgICAgICAgY29uc3QgYWN0aXZlQnVsbGV0OiBBY3RpdmVCdWxsZXQgPSB7XHJcbiAgICAgICAgICAgIG1lc2g6IGJ1bGxldE1lc2gsXHJcbiAgICAgICAgICAgIGJvZHk6IGJ1bGxldEJvZHksXHJcbiAgICAgICAgICAgIGNyZWF0aW9uVGltZTogdGhpcy5sYXN0VGltZSAvIDEwMDAsIC8vIFN0b3JlIGNyZWF0aW9uIHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgICAgICBmaXJlUG9zaXRpb246IGJ1bGxldEJvZHkucG9zaXRpb24uY2xvbmUoKSAvLyBTdG9yZSBpbml0aWFsIGZpcmUgcG9zaXRpb24gZm9yIHJhbmdlIGNoZWNrXHJcbiAgICAgICAgfTtcclxuICAgICAgICBhY3RpdmVCdWxsZXQuY29sbGlkZUhhbmRsZXIgPSAoZXZlbnQ6IENvbGxpZGVFdmVudCkgPT4gdGhpcy5vbkJ1bGxldENvbGxpZGUoZXZlbnQsIGFjdGl2ZUJ1bGxldCk7IC8vIFN0b3JlIHNwZWNpZmljIGhhbmRsZXJcclxuICAgICAgICBidWxsZXRCb2R5LnVzZXJEYXRhID0gYWN0aXZlQnVsbGV0OyAvLyBBdHRhY2ggdGhlIGFjdGl2ZUJ1bGxldCBvYmplY3QgdG8gdGhlIENhbm5vbi5Cb2R5XHJcblxyXG4gICAgICAgIGJ1bGxldEJvZHkuYWRkRXZlbnRMaXN0ZW5lcignY29sbGlkZScsIGFjdGl2ZUJ1bGxldC5jb2xsaWRlSGFuZGxlcik7IC8vIFVzZSB0aGUgc3RvcmVkIGhhbmRsZXJcclxuXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KGJ1bGxldEJvZHkpO1xyXG4gICAgICAgIHRoaXMuYnVsbGV0cy5wdXNoKGFjdGl2ZUJ1bGxldCk7XHJcblxyXG4gICAgICAgIC8vIFBsYXkgc2hvb3Qgc291bmRcclxuICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ3Nob290X3NvdW5kJyk/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiU2hvb3Qgc291bmQgcGxheSBkZW5pZWQ6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogSGFuZGxlcyBidWxsZXQgY29sbGlzaW9ucy5cclxuICAgICAqIEBwYXJhbSBldmVudCBUaGUgQ2Fubm9uLmpzIGNvbGxpc2lvbiBldmVudC5cclxuICAgICAqIEBwYXJhbSBidWxsZXQgVGhlIEFjdGl2ZUJ1bGxldCBpbnN0YW5jZSB0aGF0IGNvbGxpZGVkLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uQnVsbGV0Q29sbGlkZShldmVudDogQ29sbGlkZUV2ZW50LCBidWxsZXQ6IEFjdGl2ZUJ1bGxldCkge1xyXG4gICAgICAgIC8vIElmIHRoZSBidWxsZXQgaGFzIGFscmVhZHkgYmVlbiByZW1vdmVkIG9yIG1hcmtlZCBmb3IgcmVtb3ZhbCwgZG8gbm90aGluZy5cclxuICAgICAgICBpZiAoIXRoaXMuYnVsbGV0cy5pbmNsdWRlcyhidWxsZXQpIHx8IGJ1bGxldC5zaG91bGRSZW1vdmUpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgY29sbGlkZWRCb2R5ID0gZXZlbnQuYm9keTsgLy8gVGhlIGJvZHkgdGhhdCB0aGUgYnVsbGV0IChldmVudC50YXJnZXQpIGNvbGxpZGVkIHdpdGhcclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGNvbGxpZGVkIGJvZHkgaXMgdGhlIGdyb3VuZCBvciBhIHBsYWNlZCBvYmplY3QgKHN0YXRpYylcclxuICAgICAgICBjb25zdCBpc0dyb3VuZCA9IGNvbGxpZGVkQm9keSA9PT0gdGhpcy5ncm91bmRCb2R5O1xyXG4gICAgICAgIGNvbnN0IGlzUGxhY2VkT2JqZWN0ID0gdGhpcy5wbGFjZWRPYmplY3RCb2RpZXMuaW5jbHVkZXMoY29sbGlkZWRCb2R5KTtcclxuXHJcbiAgICAgICAgaWYgKGlzR3JvdW5kIHx8IGlzUGxhY2VkT2JqZWN0KSB7XHJcbiAgICAgICAgICAgIC8vIE1hcmsgYnVsbGV0IGZvciByZW1vdmFsIGluc3RlYWQgb2YgcmVtb3ZpbmcgaW1tZWRpYXRlbHlcclxuICAgICAgICAgICAgYnVsbGV0LnNob3VsZFJlbW92ZSA9IHRydWU7XHJcbiAgICAgICAgICAgIHRoaXMuYnVsbGV0c1RvUmVtb3ZlLmFkZChidWxsZXQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogSXRlcmF0ZXMgdGhyb3VnaCBidWxsZXRzIHRvIG1hcmsgdGhlbSBmb3IgcmVtb3ZhbCBiYXNlZCBvbiBsaWZldGltZSwgcmFuZ2UsIG9yIG91dC1vZi1ib3VuZHMuXHJcbiAgICAgKiBBY3R1YWwgcmVtb3ZhbCBpcyBkZWZlcnJlZCB0byBgcGVyZm9ybUJ1bGxldFJlbW92YWxzYC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVCdWxsZXRzKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFRpbWUgPSB0aGlzLmxhc3RUaW1lIC8gMTAwMDsgLy8gQ3VycmVudCB0aW1lIGluIHNlY29uZHNcclxuICAgICAgICBjb25zdCBoYWxmR3JvdW5kU2l6ZSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplIC8gMjtcclxuICAgICAgICBjb25zdCBidWxsZXRDb25maWcgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuYnVsbGV0O1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuYnVsbGV0cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBidWxsZXQgPSB0aGlzLmJ1bGxldHNbaV07XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBhbHJlYWR5IG1hcmtlZCBmb3IgcmVtb3ZhbCBieSBjb2xsaXNpb24gb3IgcHJldmlvdXMgY2hlY2ssIHNraXAgZnVydGhlciBwcm9jZXNzaW5nIGZvciB0aGlzIGJ1bGxldCB0aGlzIGZyYW1lLlxyXG4gICAgICAgICAgICBpZiAoYnVsbGV0LnNob3VsZFJlbW92ZSkge1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIFN5bmMgbWVzaCB3aXRoIHBoeXNpY3MgYm9keVxyXG4gICAgICAgICAgICBidWxsZXQubWVzaC5wb3NpdGlvbi5jb3B5KGJ1bGxldC5ib2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgICAgIGJ1bGxldC5tZXNoLnF1YXRlcm5pb24uY29weShidWxsZXQuYm9keS5xdWF0ZXJuaW9uIGFzIHVua25vd24gYXMgVEhSRUUuUXVhdGVybmlvbik7XHJcblxyXG4gICAgICAgICAgICAvLyBDaGVjayBsaWZldGltZVxyXG4gICAgICAgICAgICBpZiAoY3VycmVudFRpbWUgLSBidWxsZXQuY3JlYXRpb25UaW1lID4gYnVsbGV0Q29uZmlnLmxpZmV0aW1lKSB7XHJcbiAgICAgICAgICAgICAgICBidWxsZXQuc2hvdWxkUmVtb3ZlID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0c1RvUmVtb3ZlLmFkZChidWxsZXQpO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIG91dHNpZGUgbWFwIGJvdW5kYXJpZXMgb3IgaWYgaXQgd2VudCB0b28gZmFyIGZyb20gaXRzIGZpcmluZyBwb2ludFxyXG4gICAgICAgICAgICBjb25zdCBidWxsZXRQb3MgPSBidWxsZXQuYm9keS5wb3NpdGlvbjtcclxuICAgICAgICAgICAgY29uc3QgZGlzdGFuY2VUb0ZpcmVQb2ludCA9IGJ1bGxldFBvcy5kaXN0YW5jZVRvKGJ1bGxldC5maXJlUG9zaXRpb24pO1xyXG5cclxuICAgICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAgICAgYnVsbGV0UG9zLnggPiBoYWxmR3JvdW5kU2l6ZSB8fCBidWxsZXRQb3MueCA8IC1oYWxmR3JvdW5kU2l6ZSB8fFxyXG4gICAgICAgICAgICAgICAgYnVsbGV0UG9zLnogPiBoYWxmR3JvdW5kU2l6ZSB8fCBidWxsZXRQb3MueiA8IC1oYWxmR3JvdW5kU2l6ZSB8fFxyXG4gICAgICAgICAgICAgICAgZGlzdGFuY2VUb0ZpcmVQb2ludCA+IGJ1bGxldENvbmZpZy5tYXhSYW5nZVxyXG4gICAgICAgICAgICApIHtcclxuICAgICAgICAgICAgICAgIGJ1bGxldC5zaG91bGRSZW1vdmUgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRzVG9SZW1vdmUuYWRkKGJ1bGxldCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IFBlcmZvcm1zIHRoZSBhY3R1YWwgcmVtb3ZhbCBvZiBidWxsZXRzIG1hcmtlZCBmb3IgcmVtb3ZhbC5cclxuICAgICAqIFRoaXMgbWV0aG9kIGlzIGNhbGxlZCBhZnRlciB0aGUgcGh5c2ljcyBzdGVwIHRvIGF2b2lkIG1vZGlmeWluZyB0aGUgd29ybGQgZHVyaW5nIHBoeXNpY3MgY2FsY3VsYXRpb25zLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHBlcmZvcm1CdWxsZXRSZW1vdmFscygpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IGJ1bGxldFRvUmVtb3ZlIG9mIHRoaXMuYnVsbGV0c1RvUmVtb3ZlKSB7XHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBmcm9tIFRocmVlLmpzIHNjZW5lXHJcbiAgICAgICAgICAgIHRoaXMuc2NlbmUucmVtb3ZlKGJ1bGxldFRvUmVtb3ZlLm1lc2gpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gUmVtb3ZlIGZyb20gQ2Fubm9uLmpzIHdvcmxkXHJcbiAgICAgICAgICAgIHRoaXMud29ybGQucmVtb3ZlQm9keShidWxsZXRUb1JlbW92ZS5ib2R5KTtcclxuXHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBldmVudCBsaXN0ZW5lclxyXG4gICAgICAgICAgICBpZiAoYnVsbGV0VG9SZW1vdmUuY29sbGlkZUhhbmRsZXIpIHtcclxuICAgICAgICAgICAgICAgIGJ1bGxldFRvUmVtb3ZlLmJvZHkucmVtb3ZlRXZlbnRMaXN0ZW5lcignY29sbGlkZScsIGJ1bGxldFRvUmVtb3ZlLmNvbGxpZGVIYW5kbGVyKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gUmVtb3ZlIGZyb20gdGhlIGFjdGl2ZSBidWxsZXRzIGFycmF5XHJcbiAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gdGhpcy5idWxsZXRzLmluZGV4T2YoYnVsbGV0VG9SZW1vdmUpO1xyXG4gICAgICAgICAgICBpZiAoaW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldHMuc3BsaWNlKGluZGV4LCAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBDbGVhciB0aGUgc2V0IGZvciB0aGUgbmV4dCBmcmFtZVxyXG4gICAgICAgIHRoaXMuYnVsbGV0c1RvUmVtb3ZlLmNsZWFyKCk7XHJcbiAgICB9XHJcblxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXBkYXRlcyB0aGUgcG9pbnRlciBsb2NrIHN0YXR1cyB3aGVuIGl0IGNoYW5nZXMgKGUuZy4sIHVzZXIgcHJlc3NlcyBFc2MpLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uUG9pbnRlckxvY2tDaGFuZ2UoKSB7XHJcbiAgICAgICAgaWYgKGRvY3VtZW50LnBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXMgfHxcclxuICAgICAgICAgICAgKGRvY3VtZW50IGFzIGFueSkubW96UG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLmNhbnZhcyB8fFxyXG4gICAgICAgICAgICAoZG9jdW1lbnQgYXMgYW55KS53ZWJraXRQb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNQb2ludGVyTG9ja2VkID0gdHJ1ZTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1BvaW50ZXIgbG9ja2VkJyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5pc1BvaW50ZXJMb2NrZWQgPSBmYWxzZTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1BvaW50ZXIgdW5sb2NrZWQnKTtcclxuICAgICAgICAgICAgLy8gV2hlbiBwb2ludGVyIGlzIHVubG9ja2VkIGJ5IHVzZXIgKGUuZy4sIHByZXNzaW5nIEVzYyksIGN1cnNvciBhcHBlYXJzIGF1dG9tYXRpY2FsbHkuXHJcbiAgICAgICAgICAgIC8vIE1vdXNlIGxvb2sgc3RvcHMgZHVlIHRvIGBpc1BvaW50ZXJMb2NrZWRgIGNoZWNrIGluIG9uTW91c2VNb3ZlLlxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRoZSBtYWluIGdhbWUgbG9vcCwgY2FsbGVkIG9uIGV2ZXJ5IGFuaW1hdGlvbiBmcmFtZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhbmltYXRlKHRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXApIHtcclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5hbmltYXRlLmJpbmQodGhpcykpOyAvLyBSZXF1ZXN0IG5leHQgZnJhbWVcclxuXHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKHRpbWUgLSB0aGlzLmxhc3RUaW1lKSAvIDEwMDA7IC8vIENhbGN1bGF0ZSBkZWx0YSB0aW1lIGluIHNlY29uZHNcclxuICAgICAgICB0aGlzLmxhc3RUaW1lID0gdGltZTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlUGxheWVyTW92ZW1lbnQoKTsgLy8gVXBkYXRlIHBsYXllcidzIHZlbG9jaXR5IGJhc2VkIG9uIGlucHV0XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlQnVsbGV0cyhkZWx0YVRpbWUpOyAvLyBORVc6IE1hcmsgYnVsbGV0cyBmb3IgcmVtb3ZhbFxyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVBoeXNpY3MoZGVsdGFUaW1lKTsgLy8gU3RlcCB0aGUgcGh5c2ljcyB3b3JsZFxyXG4gICAgICAgICAgICB0aGlzLnBlcmZvcm1CdWxsZXRSZW1vdmFscygpOyAvLyBORVc6IFBlcmZvcm0gYWN0dWFsIGJ1bGxldCByZW1vdmFscyAqYWZ0ZXIqIHBoeXNpY3Mgc3RlcFxyXG4gICAgICAgICAgICB0aGlzLmNsYW1wUGxheWVyUG9zaXRpb24oKTsgLy8gQ2xhbXAgcGxheWVyIHBvc2l0aW9uIHRvIHByZXZlbnQgZ29pbmcgYmV5b25kIGdyb3VuZCBlZGdlc1xyXG4gICAgICAgICAgICB0aGlzLnN5bmNNZXNoZXNXaXRoQm9kaWVzKCk7IC8vIFN5bmNocm9uaXplIHZpc3VhbCBtZXNoZXMgd2l0aCBwaHlzaWNzIGJvZGllc1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIodGhpcy5zY2VuZSwgdGhpcy5jYW1lcmEpOyAvLyBSZW5kZXIgdGhlIHNjZW5lXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTdGVwcyB0aGUgQ2Fubm9uLmpzIHBoeXNpY3Mgd29ybGQgZm9yd2FyZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVQaHlzaWNzKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgLy8gd29ybGQuc3RlcChmaXhlZFRpbWVTdGVwLCBkZWx0YVRpbWUsIG1heFN1YlN0ZXBzKVxyXG4gICAgICAgIC8vIDEvNjA6IEEgZml4ZWQgdGltZSBzdGVwIG9mIDYwIHBoeXNpY3MgdXBkYXRlcyBwZXIgc2Vjb25kIChzdGFuZGFyZCkuXHJcbiAgICAgICAgLy8gZGVsdGFUaW1lOiBUaGUgYWN0dWFsIHRpbWUgZWxhcHNlZCBzaW5jZSB0aGUgbGFzdCByZW5kZXIgZnJhbWUuXHJcbiAgICAgICAgLy8gbWF4UGh5c2ljc1N1YlN0ZXBzOiBMaW1pdHMgdGhlIG51bWJlciBvZiBwaHlzaWNzIHN0ZXBzIGluIG9uZSByZW5kZXIgZnJhbWVcclxuICAgICAgICAvLyB0byBwcmV2ZW50IGluc3RhYmlsaXRpZXMgaWYgcmVuZGVyaW5nIHNsb3dzIGRvd24gc2lnbmlmaWNhbnRseS5cclxuICAgICAgICB0aGlzLndvcmxkLnN0ZXAoMSAvIDYwLCBkZWx0YVRpbWUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5tYXhQaHlzaWNzU3ViU3RlcHMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXBkYXRlcyB0aGUgcGxheWVyJ3MgdmVsb2NpdHkgYmFzZWQgb24gV0FTRCBpbnB1dCBhbmQgY2FtZXJhIG9yaWVudGF0aW9uLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZVBsYXllck1vdmVtZW50KCkge1xyXG4gICAgICAgIC8vIFBsYXllciBtb3ZlbWVudCBzaG91bGQgb25seSBoYXBwZW4gd2hlbiB0aGUgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgICAgICBpZiAoIXRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIC8vIElmIHBvaW50ZXIgaXMgbm90IGxvY2tlZCwgc3RvcCBob3Jpem9udGFsIG1vdmVtZW50IGltbWVkaWF0ZWx5XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ID0gMDtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSAwO1xyXG4gICAgICAgICAgICByZXR1cm47IC8vIEV4aXQgZWFybHkgYXMgbm8gbW92ZW1lbnQgaW5wdXQgc2hvdWxkIGJlIHByb2Nlc3NlZFxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGVmZmVjdGl2ZVBsYXllclNwZWVkID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllclNwZWVkO1xyXG5cclxuICAgICAgICAvLyBNT0RJRklFRDogQXBwbHkgYWlyIGNvbnRyb2wgZmFjdG9yIGlmIHBsYXllciBpcyBpbiB0aGUgYWlyIChubyBjb250YWN0cyB3aXRoIGFueSBzdGF0aWMgc3VyZmFjZSlcclxuICAgICAgICBpZiAodGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyA9PT0gMCkge1xyXG4gICAgICAgICAgICBlZmZlY3RpdmVQbGF5ZXJTcGVlZCAqPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyQWlyQ29udHJvbEZhY3RvcjsgLy8gVXNlIGNvbmZpZ3VyYWJsZSBhaXIgY29udHJvbCBmYWN0b3JcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgY3VycmVudFlWZWxvY2l0eSA9IHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55OyAvLyBQcmVzZXJ2ZSB2ZXJ0aWNhbCB2ZWxvY2l0eVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IG1vdmVEaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAwKTsgLy8gVXNlIGEgVEhSRUUuVmVjdG9yMyBmb3IgY2FsY3VsYXRpb24gZWFzZVxyXG5cclxuICAgICAgICAvLyBHZXQgY2FtZXJhQ29udGFpbmVyJ3MgZm9yd2FyZCB2ZWN0b3IgKGhvcml6b250YWwgZGlyZWN0aW9uIHBsYXllciBpcyBsb29raW5nKVxyXG4gICAgICAgIGNvbnN0IGNhbWVyYURpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIuZ2V0V29ybGREaXJlY3Rpb24oY2FtZXJhRGlyZWN0aW9uKTtcclxuICAgICAgICBjYW1lcmFEaXJlY3Rpb24ueSA9IDA7IC8vIEZsYXR0ZW4gdGhlIHZlY3RvciB0byByZXN0cmljdCBtb3ZlbWVudCB0byB0aGUgaG9yaXpvbnRhbCBwbGFuZVxyXG4gICAgICAgIGNhbWVyYURpcmVjdGlvbi5ub3JtYWxpemUoKTtcclxuXHJcbiAgICAgICAgY29uc3QgZ2xvYmFsVXAgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAxLCAwKTsgLy8gRGVmaW5lIGdsb2JhbCB1cCB2ZWN0b3IgZm9yIGNyb3NzIHByb2R1Y3RcclxuXHJcbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSAncmlnaHQnIHZlY3RvciByZWxhdGl2ZSB0byBjYW1lcmEncyBmb3J3YXJkIGRpcmVjdGlvblxyXG4gICAgICAgIGNvbnN0IGNhbWVyYVJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICBjYW1lcmFSaWdodC5jcm9zc1ZlY3RvcnMoZ2xvYmFsVXAsIGNhbWVyYURpcmVjdGlvbikubm9ybWFsaXplKCk7IFxyXG5cclxuICAgICAgICBsZXQgbW92aW5nID0gZmFsc2U7XHJcbiAgICAgICAgLy8gVyA8LT4gUyBzd2FwIGZyb20gdXNlcidzIGNvbW1lbnRzIGluIG9yaWdpbmFsIGNvZGU6XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1sncyddKSB7IC8vICdzJyBrZXkgbm93IG1vdmVzIGZvcndhcmRcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5hZGQoY2FtZXJhRGlyZWN0aW9uKTtcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1sndyddKSB7IC8vICd3JyBrZXkgbm93IG1vdmVzIGJhY2t3YXJkXHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24uc3ViKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIEEgYW5kIEQgY29udHJvbHMgYXMgc3RhbmRhcmQ6XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1snYSddKSB7IC8vICdhJyBrZXkgbm93IHN0cmFmZXMgbGVmdFxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLnN1YihjYW1lcmFSaWdodCk7IFxyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5rZXlzWydkJ10pIHsgLy8gJ2QnIGtleSBub3cgc3RyYWZlcyByaWdodFxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLmFkZChjYW1lcmFSaWdodCk7IFxyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKG1vdmluZykge1xyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLm5vcm1hbGl6ZSgpLm11bHRpcGx5U2NhbGFyKGVmZmVjdGl2ZVBsYXllclNwZWVkKTtcclxuICAgICAgICAgICAgLy8gRGlyZWN0bHkgc2V0IHRoZSBob3Jpem9udGFsIHZlbG9jaXR5IGNvbXBvbmVudHMuXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ID0gbW92ZURpcmVjdGlvbi54O1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiA9IG1vdmVEaXJlY3Rpb24uejtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBJZiBubyBtb3ZlbWVudCBrZXlzIGFyZSBwcmVzc2VkOlxyXG4gICAgICAgICAgICAvLyBNT0RJRklFRDogQXBwbHkgYWlyIGRlY2VsZXJhdGlvbiBpZiBwbGF5ZXIgaXMgaW4gdGhlIGFpclxyXG4gICAgICAgICAgICBpZiAodGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggKj0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckFpckRlY2VsZXJhdGlvbjtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ICo9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJBaXJEZWNlbGVyYXRpb247XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBQbGF5ZXIgaXMgb24gdGhlIGdyb3VuZCBvciBhIHN0YXRpYyBvYmplY3Q6IENhbm5vbi5qcyBDb250YWN0TWF0ZXJpYWwgZnJpY3Rpb24gd2lsbCBoYW5kbGUgZGVjZWxlcmF0aW9uLlxyXG4gICAgICAgICAgICAgICAgLy8gTm8gZXhwbGljaXQgdmVsb2NpdHkgZGVjYXkgaXMgYXBwbGllZCBoZXJlIGZvciBncm91bmQgbW92ZW1lbnQuXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnkgPSBjdXJyZW50WVZlbG9jaXR5OyAvLyBSZXN0b3JlIFkgdmVsb2NpdHkgKGdyYXZpdHkvanVtcHMpXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBRERFRDogQXBwbGllcyBhbiB1cHdhcmQgaW1wdWxzZSB0byB0aGUgcGxheWVyIGJvZHkgZm9yIGp1bXBpbmcuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcGxheWVySnVtcCgpIHtcclxuICAgICAgICAvLyBNT0RJRklFRDogT25seSBhbGxvdyBqdW1wIGlmIHRoZSBwbGF5ZXIgaXMgY3VycmVudGx5IG9uIGFueSBzdGF0aWMgc3VyZmFjZSAoZ3JvdW5kIG9yIG9iamVjdClcclxuICAgICAgICBpZiAodGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyA+IDApIHtcclxuICAgICAgICAgICAgLy8gQ2xlYXIgYW55IGV4aXN0aW5nIHZlcnRpY2FsIHZlbG9jaXR5IHRvIGVuc3VyZSBhIGNvbnNpc3RlbnQganVtcCBoZWlnaHRcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnkgPSAwOyBcclxuICAgICAgICAgICAgLy8gQXBwbHkgYW4gdXB3YXJkIGltcHVsc2UgKG1hc3MgKiBjaGFuZ2VfaW5fdmVsb2NpdHkpXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5hcHBseUltcHVsc2UoXHJcbiAgICAgICAgICAgICAgICBuZXcgQ0FOTk9OLlZlYzMoMCwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmp1bXBGb3JjZSwgMCksXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24gLy8gQXBwbHkgaW1wdWxzZSBhdCB0aGUgY2VudGVyIG9mIG1hc3NcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbGFtcHMgdGhlIHBsYXllcidzIHBvc2l0aW9uIHdpdGhpbiB0aGUgZGVmaW5lZCBncm91bmQgYm91bmRhcmllcy5cclxuICAgICAqIFByZXZlbnRzIHRoZSBwbGF5ZXIgZnJvbSBtb3ZpbmcgYmV5b25kIHRoZSAnZW5kIG9mIHRoZSB3b3JsZCcuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY2xhbXBQbGF5ZXJQb3NpdGlvbigpIHtcclxuICAgICAgICBpZiAoIXRoaXMucGxheWVyQm9keSB8fCAhdGhpcy5jb25maWcpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaGFsZkdyb3VuZFNpemUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDI7XHJcblxyXG4gICAgICAgIGxldCBwb3NYID0gdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLng7XHJcbiAgICAgICAgbGV0IHBvc1ogPSB0aGlzLnBsYXllckJvZHkucG9zaXRpb24uejtcclxuICAgICAgICBsZXQgdmVsWCA9IHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54O1xyXG4gICAgICAgIGxldCB2ZWxaID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5Lno7XHJcblxyXG4gICAgICAgIC8vIENsYW1wIFggcG9zaXRpb25cclxuICAgICAgICBpZiAocG9zWCA+IGhhbGZHcm91bmRTaXplKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi54ID0gaGFsZkdyb3VuZFNpemU7XHJcbiAgICAgICAgICAgIGlmICh2ZWxYID4gMCkgeyAvLyBJZiBtb3Zpbmcgb3V0d2FyZHMsIHN0b3AgaG9yaXpvbnRhbCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmIChwb3NYIDwgLWhhbGZHcm91bmRTaXplKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi54ID0gLWhhbGZHcm91bmRTaXplO1xyXG4gICAgICAgICAgICBpZiAodmVsWCA8IDApIHsgLy8gSWYgbW92aW5nIG91dHdhcmRzLCBzdG9wIGhvcml6b250YWwgdmVsb2NpdHlcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2xhbXAgWiBwb3NpdGlvblxyXG4gICAgICAgIGlmIChwb3NaID4gaGFsZkdyb3VuZFNpemUpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnogPSBoYWxmR3JvdW5kU2l6ZTtcclxuICAgICAgICAgICAgaWYgKHZlbFogPiAwKSB7IC8vIElmIG1vdmluZyBvdXR3YXJkcywgc3RvcCBob3Jpem9udGFsIHZlbG9jaXR5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHBvc1ogPCAtaGFsZkdyb3VuZFNpemUpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnogPSAtaGFsZkdyb3VuZFNpemU7XHJcbiAgICAgICAgICAgIGlmICh2ZWxaIDwgMCkgeyAvLyBJZiBtb3Zpbmcgb3V0d2FyZHMsIHN0b3AgaG9yaXpvbnRhbCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3luY2hyb25pemVzIHRoZSB2aXN1YWwgbWVzaGVzIHdpdGggdGhlaXIgY29ycmVzcG9uZGluZyBwaHlzaWNzIGJvZGllcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzeW5jTWVzaGVzV2l0aEJvZGllcygpIHtcclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSBwbGF5ZXIncyB2aXN1YWwgbWVzaCBwb3NpdGlvbiB3aXRoIGl0cyBwaHlzaWNzIGJvZHkncyBwb3NpdGlvblxyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIGNhbWVyYUNvbnRhaW5lciBwb3NpdGlvbiB3aXRoIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkncyBwb3NpdGlvbi5cclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG5cclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSBwbGF5ZXIncyB2aXN1YWwgbWVzaCBob3Jpem9udGFsIHJvdGF0aW9uICh5YXcpIHdpdGggY2FtZXJhQ29udGFpbmVyJ3MgeWF3LlxyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5xdWF0ZXJuaW9uLmNvcHkodGhpcy5jYW1lcmFDb250YWluZXIucXVhdGVybmlvbik7XHJcblxyXG4gICAgICAgIC8vIFRoZSBncm91bmQgYW5kIHBsYWNlZCBvYmplY3RzIGFyZSBjdXJyZW50bHkgc3RhdGljIChtYXNzIDApLCBzbyB0aGVpciB2aXN1YWwgbWVzaGVzXHJcbiAgICAgICAgLy8gZG8gbm90IG5lZWQgdG8gYmUgc3luY2hyb25pemVkIHdpdGggdGhlaXIgcGh5c2ljcyBib2RpZXMgYWZ0ZXIgaW5pdGlhbCBwbGFjZW1lbnQuXHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQnVsbGV0cyBhcmUgdXBkYXRlZCBpbiB1cGRhdGVCdWxsZXRzIG1ldGhvZC5cclxuICAgIH1cclxufVxyXG5cclxuLy8gU3RhcnQgdGhlIGdhbWUgd2hlbiB0aGUgRE9NIGNvbnRlbnQgaXMgZnVsbHkgbG9hZGVkXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICBuZXcgR2FtZSgpO1xyXG59KTsiXSwKICAibWFwcGluZ3MiOiAiQUFBQSxZQUFZLFdBQVc7QUFDdkIsWUFBWSxZQUFZO0FBb0J4QixJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBRkMsU0FBQUE7QUFBQSxHQUFBO0FBcUVMLE1BQU0sS0FBSztBQUFBLEVBeURQLGNBQWM7QUF2RGQ7QUFBQSxTQUFRLFFBQW1CO0FBMEIzQjtBQUFBLFNBQVEscUJBQW1DLENBQUM7QUFDNUMsU0FBUSxxQkFBb0MsQ0FBQztBQUc3QztBQUFBLFNBQVEsVUFBMEIsQ0FBQztBQUNuQyxTQUFRLGtCQUFxQyxvQkFBSSxJQUFJO0FBS3JEO0FBQUE7QUFBQSxTQUFRLE9BQW1DLENBQUM7QUFDNUM7QUFBQSxTQUFRLGtCQUEyQjtBQUNuQztBQUFBLFNBQVEsY0FBc0I7QUFHOUI7QUFBQTtBQUFBLFNBQVEsV0FBdUMsb0JBQUksSUFBSTtBQUN2RDtBQUFBLFNBQVEsU0FBd0Msb0JBQUksSUFBSTtBQVF4RDtBQUFBLFNBQVEsV0FBZ0M7QUFHeEM7QUFBQSxTQUFRLGdDQUF3QztBQUk1QyxTQUFLLFNBQVMsU0FBUyxl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Z0NBQWdDLEdBQUc7QUFFeEMsV0FBSyxXQUFXLFNBQVMsSUFBSTtBQUU3QixXQUFLLFdBQVc7QUFBQSxRQUNaLElBQUksT0FBTyxLQUFLLEdBQUcsS0FBSyxPQUFPLGFBQWEsV0FBVyxDQUFDO0FBQUEsUUFDeEQsS0FBSyxXQUFXO0FBQUE7QUFBQSxNQUNwQjtBQUFBLElBQ0o7QUFBQSxFQUNKO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLHNCQUFzQjtBQUMxQixRQUFJLENBQUMsS0FBSyxjQUFjLENBQUMsS0FBSyxRQUFRO0FBQ2xDO0FBQUEsSUFDSjtBQUVBLFVBQU0saUJBQWlCLEtBQUssT0FBTyxhQUFhLGFBQWE7QUFFN0QsUUFBSSxPQUFPLEtBQUssV0FBVyxTQUFTO0FBQ3BDLFFBQUksT0FBTyxLQUFLLFdBQVcsU0FBUztBQUNwQyxRQUFJLE9BQU8sS0FBSyxXQUFXLFNBQVM7QUFDcEMsUUFBSSxPQUFPLEtBQUssV0FBVyxTQUFTO0FBR3BDLFFBQUksT0FBTyxnQkFBZ0I7QUFDdkIsV0FBSyxXQUFXLFNBQVMsSUFBSTtBQUM3QixVQUFJLE9BQU8sR0FBRztBQUNWLGFBQUssV0FBVyxTQUFTLElBQUk7QUFBQSxNQUNqQztBQUFBLElBQ0osV0FBVyxPQUFPLENBQUMsZ0JBQWdCO0FBQy9CLFdBQUssV0FBVyxTQUFTLElBQUksQ0FBQztBQUM5QixVQUFJLE9BQU8sR0FBRztBQUNWLGFBQUssV0FBVyxTQUFTLElBQUk7QUFBQSxNQUNqQztBQUFBLElBQ0o7QUFHQSxRQUFJLE9BQU8sZ0JBQWdCO0FBQ3ZCLFdBQUssV0FBVyxTQUFTLElBQUk7QUFDN0IsVUFBSSxPQUFPLEdBQUc7QUFDVixhQUFLLFdBQVcsU0FBUyxJQUFJO0FBQUEsTUFDakM7QUFBQSxJQUNKLFdBQVcsT0FBTyxDQUFDLGdCQUFnQjtBQUMvQixXQUFLLFdBQVcsU0FBUyxJQUFJLENBQUM7QUFDOUIsVUFBSSxPQUFPLEdBQUc7QUFDVixhQUFLLFdBQVcsU0FBUyxJQUFJO0FBQUEsTUFDakM7QUFBQSxJQUNKO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsdUJBQXVCO0FBRTNCLFNBQUssV0FBVyxTQUFTLEtBQUssS0FBSyxXQUFXLFFBQW9DO0FBR2xGLFNBQUssZ0JBQWdCLFNBQVMsS0FBSyxLQUFLLFdBQVcsUUFBb0M7QUFHdkYsU0FBSyxXQUFXLFdBQVcsS0FBSyxLQUFLLGdCQUFnQixVQUFVO0FBQUEsRUFNbkU7QUFDSjtBQUdBLFNBQVMsaUJBQWlCLG9CQUFvQixNQUFNO0FBQ2hELE1BQUksS0FBSztBQUNiLENBQUM7IiwKICAibmFtZXMiOiBbIkdhbWVTdGF0ZSJdCn0K
