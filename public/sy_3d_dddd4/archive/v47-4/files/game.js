import * as THREE from "three";
import * as CANNON from "cannon-es";
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["INSTRUCTIONS"] = 1] = "INSTRUCTIONS";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
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
    // NEW: Active enemies
    this.enemies = [];
    this.enemiesToRemove = /* @__PURE__ */ new Set();
    // List of enemies to remove after physics step
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
    // NEW: Crosshair UI element
    // For calculating delta time between frames
    this.lastTime = 0;
    // MODIFIED: Tracks player contacts with ANY static surface (ground or placed objects) for jumping/movement logic
    this.numContactsWithStaticSurfaces = 0;
    // NEW: Game score
    this.score = 0;
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
      this.score = this.config.gameSettings.score;
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
    this.enemyMaterial = new CANNON.Material("enemyMaterial");
    const playerGroundContactMaterial = new CANNON.ContactMaterial(
      this.playerMaterial,
      this.groundMaterial,
      {
        friction: this.config.gameSettings.playerGroundFriction,
        // Use configurable ground friction
        restitution: 0
        // No bounce for ground
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
    const bulletEnemyContactMaterial = new CANNON.ContactMaterial(
      this.bulletMaterial,
      this.enemyMaterial,
      {
        friction: 0,
        restitution: 0
      }
    );
    this.world.addContactMaterial(bulletEnemyContactMaterial);
    const playerEnemyContactMaterial = new CANNON.ContactMaterial(
      this.playerMaterial,
      this.enemyMaterial,
      {
        friction: 0.5,
        restitution: 0
      }
    );
    this.world.addContactMaterial(playerEnemyContactMaterial);
    await this.loadAssets();
    this.createGround();
    this.createPlayer();
    this.createStaticObjects();
    this.createEnemies();
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
      if (!bodyA || !bodyB) {
        console.warn("beginContact: One of the colliding bodies is undefined or null.", event);
        return;
      }
      if (bodyA === this.playerBody || bodyB === this.playerBody) {
        const otherBody = bodyA === this.playerBody ? bodyB : bodyA;
        if (otherBody && otherBody.mass === 0) {
          this.numContactsWithStaticSurfaces++;
        }
      }
    });
    this.world.addEventListener("endContact", (event) => {
      let bodyA = event.bodyA;
      let bodyB = event.bodyB;
      if (!bodyA || !bodyB) {
        console.warn("endContact: One of the colliding bodies is undefined or null.", event);
        return;
      }
      if (bodyA === this.playerBody || bodyB === this.playerBody) {
        const otherBody = bodyA === this.playerBody ? bodyB : bodyA;
        if (otherBody && otherBody.mass === 0) {
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
    this.setupInstructionsScreen();
    this.setupGameUI();
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
    this.titleScreenOverlay.addEventListener("click", () => this.showInstructions());
  }
  /**
   * NEW: Creates and displays the instructions screen UI dynamically.
   */
  setupInstructionsScreen() {
    this.instructionsOverlay = document.createElement("div");
    Object.assign(this.instructionsOverlay.style, {
      position: "absolute",
      backgroundColor: "rgba(0, 0, 0, 0.9)",
      display: "none",
      // Initially hidden
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      color: "white",
      fontFamily: "Arial, sans-serif",
      fontSize: "24px",
      textAlign: "center",
      zIndex: "1000",
      padding: "20px"
    });
    document.body.appendChild(this.instructionsOverlay);
    const instructionsTitle = document.createElement("div");
    instructionsTitle.textContent = "\uAC8C\uC784 \uC870\uC791\uBC95";
    Object.assign(instructionsTitle.style, {
      fontSize: "36px",
      marginBottom: "30px"
    });
    this.instructionsOverlay.appendChild(instructionsTitle);
    const instructionsText = document.createElement("div");
    instructionsText.innerHTML = `
            <p><strong>\uB9C8\uC6B0\uC2A4</strong> : \uC2DC\uC810 \uBCC0\uACBD (\uCE74\uBA54\uB77C \uC774\uB3D9)</p>
            <p><strong>S (\uC55E\uC73C\uB85C)</strong> : \uC55E\uC73C\uB85C \uC774\uB3D9</p>
            <p><strong>W (\uB4A4\uB85C)</strong> : \uB4A4\uB85C \uC774\uB3D9</p>
            <p><strong>A (\uC67C\uCABD)</strong> : \uC67C\uCABD\uC73C\uB85C \uC774\uB3D9</p>
            <p><strong>D (\uC624\uB978\uCABD)</strong> : \uC624\uB978\uCABD\uC73C\uB85C \uC774\uB3D9</p>
            <p><strong>\uC2A4\uD398\uC774\uC2A4\uBC14</strong> : \uC810\uD504</p>
            <p><strong>\uB9C8\uC6B0\uC2A4 \uC67C\uCABD \uD074\uB9AD</strong> : \uCD1D \uBC1C\uC0AC</p>
            <p style="margin-top: 30px;">\uD654\uBA74\uC744 \uB2E4\uC2DC \uD074\uB9AD\uD558\uC5EC \uAC8C\uC784\uC744 \uC2DC\uC791\uD558\uC138\uC694!</p>
        `;
    Object.assign(instructionsText.style, {
      lineHeight: "1.6",
      maxWidth: "600px",
      margin: "0 auto 30px auto"
    });
    this.instructionsOverlay.appendChild(instructionsText);
    this.instructionsOverlay.addEventListener("click", () => this.startPlayingGame());
  }
  /**
   * NEW: Creates and displays the game score UI and crosshair.
   */
  setupGameUI() {
    this.scoreText = document.createElement("div");
    Object.assign(this.scoreText.style, {
      position: "absolute",
      top: "10px",
      left: "10px",
      color: "white",
      fontFamily: "Arial, sans-serif",
      fontSize: "24px",
      zIndex: "1001"
      // Above title screen overlay but separate
    });
    this.scoreText.textContent = `Score: ${this.score}`;
    document.body.appendChild(this.scoreText);
    this.crosshairElement = document.createElement("div");
    Object.assign(this.crosshairElement.style, {
      position: "absolute",
      width: "2px",
      // Central dot size
      height: "2px",
      backgroundColor: "white",
      // Central white dot
      // Use box-shadows for outlines and potential cross-like appearance
      boxShadow: "0 0 0 1px white, 0 0 0 3px rgba(0,0,0,0.8), 0 0 0 4px white",
      borderRadius: "50%",
      // Make it circular
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: "1002",
      // Above title screen and score
      display: "none"
      // Initially hidden
    });
    document.body.appendChild(this.crosshairElement);
  }
  /**
   * NEW: Updates the score display on the UI.
   */
  updateScoreDisplay() {
    if (this.scoreText) {
      this.scoreText.textContent = `Score: ${this.score}`;
    }
  }
  /**
   * Transitions the game from the title screen to the instructions state.
   */
  showInstructions() {
    this.state = 1 /* INSTRUCTIONS */;
    if (this.titleScreenOverlay && this.titleScreenOverlay.parentNode) {
      document.body.removeChild(this.titleScreenOverlay);
    }
    if (this.instructionsOverlay) {
      this.instructionsOverlay.style.display = "flex";
      this.applyFixedAspectRatio();
    }
  }
  /**
   * Transitions the game from the instructions screen to the playing state.
   */
  startPlayingGame() {
    this.state = 2 /* PLAYING */;
    if (this.instructionsOverlay && this.instructionsOverlay.parentNode) {
      document.body.removeChild(this.instructionsOverlay);
    }
    this.canvas.addEventListener("click", this.handleCanvasReLockPointer.bind(this));
    this.canvas.requestPointerLock();
    this.sounds.get("background_music")?.play().catch((e) => console.log("BGM play failed after user gesture:", e));
    if (this.crosshairElement) {
      this.crosshairElement.style.display = "block";
    }
  }
  /**
   * Handles clicks on the canvas to re-lock the pointer if the game is playing and unlocked.
   */
  handleCanvasReLockPointer() {
    if (this.state === 2 /* PLAYING */ && !this.isPointerLocked) {
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
   * NEW: Creates visual meshes and physics bodies for all static objects (boxes) defined in config.gameSettings.staticObjects.
   */
  createStaticObjects() {
    if (!this.config.gameSettings.staticObjects) {
      console.warn("No staticObjects defined in gameSettings.");
      return;
    }
    this.config.gameSettings.staticObjects.forEach((objConfig) => {
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
        // Use 0 for static objects
        position: new CANNON.Vec3(objConfig.position.x, objConfig.position.y, objConfig.position.z),
        shape,
        material: this.defaultObjectMaterial
        // Assign the default object material
      });
      if (objConfig.rotationY !== void 0) {
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), objConfig.rotationY);
      }
      this.world.addBody(body);
      this.placedObjectBodies.push(body);
    });
    console.log(`Created ${this.placedObjectMeshes.length} static objects.`);
  }
  /**
   * NEW: Creates visual meshes and physics bodies for all enemy instances defined in config.gameSettings.enemyInstances.
   */
  createEnemies() {
    if (!this.config.gameSettings.enemyInstances || !this.config.gameSettings.enemyTypes) {
      console.warn("No enemyInstances or enemyTypes defined in gameSettings.");
      return;
    }
    const enemyTypeMap = /* @__PURE__ */ new Map();
    this.config.gameSettings.enemyTypes.forEach((type) => enemyTypeMap.set(type.name, type));
    this.config.gameSettings.enemyInstances.forEach((instanceConfig) => {
      const typeConfig = enemyTypeMap.get(instanceConfig.enemyTypeName);
      if (!typeConfig) {
        console.error(`Enemy type '${instanceConfig.enemyTypeName}' not found for instance '${instanceConfig.name}'. Skipping.`);
        return;
      }
      const texture = this.textures.get(typeConfig.textureName);
      const material = new THREE.MeshLambertMaterial({
        map: texture,
        color: texture ? 16777215 : 16711680
        // Default red if no texture
      });
      const geometry = new THREE.BoxGeometry(typeConfig.dimensions.width, typeConfig.dimensions.height, typeConfig.dimensions.depth);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(instanceConfig.position.x, instanceConfig.position.y, instanceConfig.position.z);
      if (instanceConfig.rotationY !== void 0) {
        mesh.rotation.y = instanceConfig.rotationY;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      const shape = new CANNON.Box(new CANNON.Vec3(
        typeConfig.dimensions.width / 2,
        typeConfig.dimensions.height / 2,
        typeConfig.dimensions.depth / 2
      ));
      const body = new CANNON.Body({
        mass: typeConfig.mass,
        position: new CANNON.Vec3(instanceConfig.position.x, instanceConfig.position.y, instanceConfig.position.z),
        shape,
        material: this.enemyMaterial,
        fixedRotation: true
        // Prevent enemies from tumbling
      });
      if (instanceConfig.rotationY !== void 0) {
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), instanceConfig.rotationY);
      }
      this.world.addBody(body);
      const activeEnemy = {
        name: instanceConfig.name,
        mesh,
        body,
        typeConfig,
        currentHealth: typeConfig.health
      };
      body.userData = activeEnemy;
      this.enemies.push(activeEnemy);
    });
    console.log(`Created ${this.enemies.length} enemies.`);
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
    } else if (this.state === 1 /* INSTRUCTIONS */ && this.instructionsOverlay) {
      Object.assign(this.instructionsOverlay.style, {
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
    if (this.state === 2 /* PLAYING */ && this.isPointerLocked) {
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
    if (this.state === 2 /* PLAYING */ && this.isPointerLocked) {
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
    if (this.state === 2 /* PLAYING */ && this.isPointerLocked && event.button === 0) {
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
    const otherBodyUserData = collidedBody.userData;
    const isGround = collidedBody === this.groundBody;
    const isPlacedObject = this.placedObjectBodies.includes(collidedBody);
    const isEnemy = otherBodyUserData && otherBodyUserData.typeConfig !== void 0;
    if (isGround || isPlacedObject) {
      bullet.shouldRemove = true;
      this.bulletsToRemove.add(bullet);
    } else if (isEnemy) {
      const enemy = otherBodyUserData;
      if (!enemy.shouldRemove) {
        enemy.currentHealth--;
        this.sounds.get("hit_sound")?.play().catch((e) => console.log("Hit sound play denied:", e));
        console.log(`Enemy ${enemy.name} hit! Health: ${enemy.currentHealth}`);
        if (enemy.currentHealth <= 0) {
          enemy.shouldRemove = true;
          this.enemiesToRemove.add(enemy);
          this.score += enemy.typeConfig.scoreValue;
          this.updateScoreDisplay();
          this.sounds.get("enemy_death_sound")?.play().catch((e) => console.log("Enemy death sound play denied:", e));
          console.log(`Enemy ${enemy.name} defeated! Score: ${this.score}`);
          enemy.body.sleep();
        }
      }
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
      if (currentTime - bullet.creationTime > bulletConfig.lifetime) {
        bullet.shouldRemove = true;
        this.bulletsToRemove.add(bullet);
        continue;
      }
      const bulletPos = bullet.body.position;
      const distanceToFirePoint = bulletPos.distanceTo(bullet.firePosition);
      if (bulletPos.x > halfGroundSize || bulletPos.x < -halfGroundSize || bulletPos.z > halfGroundSize || bulletPos.z < -halfGroundSize || distanceToFirePoint > bulletConfig.maxRange || bulletPos.y < -10) {
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
   * NEW: Updates enemy movement logic (calculates velocity and rotation).
   * The actual mesh synchronization happens in syncMeshesWithBodies.
   */
  updateEnemies(deltaTime) {
    if (!this.playerBody) return;
    const playerPos = this.playerBody.position;
    const halfGroundSize = this.config.gameSettings.groundSize / 2;
    for (const enemy of this.enemies) {
      if (enemy.shouldRemove) {
        continue;
      }
      const enemyPos = enemy.body.position;
      const halfWidth = enemy.typeConfig.dimensions.width / 2;
      const halfDepth = enemy.typeConfig.dimensions.depth / 2;
      if (enemyPos.x > halfGroundSize - halfWidth) {
        enemy.body.position.x = halfGroundSize - halfWidth;
        if (enemy.body.velocity.x > 0) enemy.body.velocity.x = 0;
      } else if (enemyPos.x < -halfGroundSize + halfWidth) {
        enemy.body.position.x = -halfGroundSize + halfWidth;
        if (enemy.body.velocity.x < 0) enemy.body.velocity.x = 0;
      }
      if (enemyPos.z > halfGroundSize - halfDepth) {
        enemy.body.position.z = halfGroundSize - halfDepth;
        if (enemy.body.velocity.z > 0) enemy.body.velocity.z = 0;
      } else if (enemyPos.z < -halfGroundSize + halfDepth) {
        enemy.body.position.z = -halfGroundSize + halfDepth;
        if (enemy.body.velocity.z < 0) enemy.body.velocity.z = 0;
      }
      const direction = new CANNON.Vec3();
      playerPos.vsub(enemyPos, direction);
      direction.y = 0;
      direction.normalize();
      enemy.body.velocity.x = direction.x * enemy.typeConfig.speed;
      enemy.body.velocity.z = direction.z * enemy.typeConfig.speed;
      const targetRotationY = Math.atan2(direction.x, direction.z);
      const currentQuaternion = new THREE.Quaternion(enemy.body.quaternion.x, enemy.body.quaternion.y, enemy.body.quaternion.z, enemy.body.quaternion.w);
      const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        targetRotationY
      );
      const slerpedQuaternion = new THREE.Quaternion();
      slerpedQuaternion.slerpQuaternions(currentQuaternion, targetQuaternion, 0.1);
      enemy.body.quaternion.copy(slerpedQuaternion);
    }
  }
  /**
   * NEW: Performs the actual removal of enemies marked for removal.
   * This method is called after the physics step.
   */
  performEnemyRemovals() {
    for (const enemyToRemove of this.enemiesToRemove) {
      this.scene.remove(enemyToRemove.mesh);
      this.world.removeBody(enemyToRemove.body);
      const index = this.enemies.indexOf(enemyToRemove);
      if (index !== -1) {
        this.enemies.splice(index, 1);
      }
    }
    this.enemiesToRemove.clear();
  }
  /**
   * Updates the pointer lock status when it changes (e.g., user presses Esc).
   */
  onPointerLockChange() {
    if (document.pointerLockElement === this.canvas || document.mozPointerLockElement === this.canvas || document.webkitPointerLockElement === this.canvas) {
      this.isPointerLocked = true;
      console.log("Pointer locked");
      if (this.crosshairElement && this.state === 2 /* PLAYING */) {
        this.crosshairElement.style.display = "block";
      }
    } else {
      this.isPointerLocked = false;
      console.log("Pointer unlocked");
      if (this.crosshairElement) {
        this.crosshairElement.style.display = "none";
      }
    }
  }
  /**
   * The main game loop, called on every animation frame.
   */
  animate(time) {
    requestAnimationFrame(this.animate.bind(this));
    const deltaTime = (time - this.lastTime) / 1e3;
    this.lastTime = time;
    if (this.state === 2 /* PLAYING */) {
      this.updatePlayerMovement();
      this.updateBullets(deltaTime);
      this.updateEnemies(deltaTime);
      this.updatePhysics(deltaTime);
      this.performBulletRemovals();
      this.performEnemyRemovals();
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
    const playerHalfWidth = 0.5;
    let posX = this.playerBody.position.x;
    let posZ = this.playerBody.position.z;
    let velX = this.playerBody.velocity.x;
    let velZ = this.playerBody.velocity.z;
    if (posX > halfGroundSize - playerHalfWidth) {
      this.playerBody.position.x = halfGroundSize - playerHalfWidth;
      if (velX > 0) {
        this.playerBody.velocity.x = 0;
      }
    } else if (posX < -halfGroundSize + playerHalfWidth) {
      this.playerBody.position.x = -halfGroundSize + playerHalfWidth;
      if (velX < 0) {
        this.playerBody.velocity.x = 0;
      }
    }
    if (posZ > halfGroundSize - playerHalfWidth) {
      this.playerBody.position.z = halfGroundSize - playerHalfWidth;
      if (velZ > 0) {
        this.playerBody.velocity.z = 0;
      }
    } else if (posZ < -halfGroundSize + playerHalfWidth) {
      this.playerBody.position.z = -halfGroundSize + playerHalfWidth;
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
    for (const bullet of this.bullets) {
      if (!bullet.shouldRemove) {
        bullet.mesh.position.copy(bullet.body.position);
        bullet.mesh.quaternion.copy(bullet.body.quaternion);
      }
    }
    for (const enemy of this.enemies) {
      if (!enemy.shouldRemove) {
        enemy.mesh.position.copy(enemy.body.position);
        enemy.mesh.quaternion.copy(enemy.body.quaternion);
      }
    }
  }
}
document.addEventListener("DOMContentLoaded", () => {
  new Game();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuXHJcbi8vIEFkZCBtb2R1bGUgYXVnbWVudGF0aW9uIGZvciBDQU5OT04uQm9keSB0byBpbmNsdWRlIHVzZXJEYXRhIGZvciBib3RoIGJ1bGxldHMgYW5kIGVuZW1pZXNcclxuZGVjbGFyZSBtb2R1bGUgJ2Nhbm5vbi1lcycge1xyXG4gICAgaW50ZXJmYWNlIEJvZHkge1xyXG4gICAgICAgIHVzZXJEYXRhPzogQWN0aXZlQnVsbGV0IHwgQWN0aXZlRW5lbXk7IC8vIEF0dGFjaCB0aGUgQWN0aXZlQnVsbGV0IG9yIEFjdGl2ZUVuZW15IGluc3RhbmNlXHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIERlZmluZSBpbnRlcmZhY2UgZm9yIHRoZSBDYW5ub24tZXMgJ2NvbGxpZGUnIGV2ZW50XHJcbmludGVyZmFjZSBDb2xsaWRlRXZlbnQge1xyXG4gICAgLy8gVGhlIHR5cGUgcHJvcGVydHkgaXMgdXN1YWxseSBwcmVzZW50IG9uIGFsbCBDYW5ub24uanMgZXZlbnRzXHJcbiAgICB0eXBlOiBzdHJpbmc7XHJcbiAgICAvLyBUaGUgJ2NvbGxpZGUnIGV2ZW50IHNwZWNpZmljYWxseSBoYXMgdGhlc2UgcHJvcGVydGllczpcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5OyAvLyBUaGUgb3RoZXIgYm9keSBpbnZvbHZlZCBpbiB0aGUgY29sbGlzaW9uXHJcbiAgICB0YXJnZXQ6IENBTk5PTi5Cb2R5OyAvLyBUaGUgYm9keSB0aGF0IHRoZSBldmVudCBsaXN0ZW5lciBpcyBhdHRhY2hlZCB0byAoZS5nLiwgdGhlIGJ1bGxldEJvZHkpXHJcbiAgICBjb250YWN0OiBDQU5OT04uQ29udGFjdEVxdWF0aW9uOyAvLyBUaGUgY29udGFjdCBlcXVhdGlvbiBvYmplY3RcclxuICAgIC8vIE5FVzogQWRkIGJvZHlBIGFuZCBib2R5QiBmb3IgY29uc2lzdGVuY3kgd2l0aCBiZWdpbkNvbnRhY3QvZW5kQ29udGFjdFxyXG4gICAgYm9keUE6IENBTk5PTi5Cb2R5O1xyXG4gICAgYm9keUI6IENBTk5PTi5Cb2R5O1xyXG59XHJcblxyXG4vLyBFbnVtIHRvIGRlZmluZSB0aGUgcG9zc2libGUgc3RhdGVzIG9mIHRoZSBnYW1lXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFLCAgIC8vIFRpdGxlIHNjcmVlbiwgd2FpdGluZyBmb3IgdXNlciBpbnB1dFxyXG4gICAgSU5TVFJVQ1RJT05TLCAvLyBORVc6IEluc3RydWN0aW9ucyBzY3JlZW4sIHdhaXRpbmcgZm9yIHVzZXIgaW5wdXRcclxuICAgIFBMQVlJTkcgIC8vIEdhbWUgaXMgYWN0aXZlLCB1c2VyIGNhbiBtb3ZlIGFuZCBsb29rIGFyb3VuZFxyXG59XHJcblxyXG4vLyBJbnRlcmZhY2UgZm9yIHN0YXRpYyBvYmplY3RzIChib3hlcykgcGxhY2VkIGluIHRoZSBzY2VuZVxyXG5pbnRlcmZhY2UgUGxhY2VkT2JqZWN0Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZzsgLy8gQSBkZXNjcmlwdGl2ZSBuYW1lIGZvciB0aGUgb2JqZWN0IGluc3RhbmNlXHJcbiAgICB0ZXh0dXJlTmFtZTogc3RyaW5nOyAvLyBOYW1lIG9mIHRoZSB0ZXh0dXJlIGZyb20gYXNzZXRzLmltYWdlc1xyXG4gICAgdHlwZTogJ2JveCc7IC8vIEV4cGxpY2l0bHkgJ2JveCdcclxuICAgIHBvc2l0aW9uOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXIgfTtcclxuICAgIGRpbWVuc2lvbnM6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IGRlcHRoOiBudW1iZXIgfTtcclxuICAgIHJvdGF0aW9uWT86IG51bWJlcjsgLy8gT3B0aW9uYWwgcm90YXRpb24gYXJvdW5kIFktYXhpcyAocmFkaWFucylcclxuICAgIG1hc3M6IG51bWJlcjsgLy8gMCBmb3Igc3RhdGljXHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBlbmVteSB0eXBlIGRlZmluaXRpb25zIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBFbmVteVR5cGVDb25maWcge1xyXG4gICAgbmFtZTogc3RyaW5nOyAvLyBlLmcuLCBcImJhc2ljX2VuZW15XCJcclxuICAgIHRleHR1cmVOYW1lOiBzdHJpbmc7XHJcbiAgICBkaW1lbnNpb25zOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyBkZXB0aDogbnVtYmVyIH07XHJcbiAgICBtYXNzOiBudW1iZXI7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgaGVhbHRoOiBudW1iZXI7XHJcbiAgICBzY29yZVZhbHVlOiBudW1iZXI7XHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBzcGVjaWZpYyBlbmVteSBpbnN0YW5jZXMgcGxhY2VkIGluIHRoZSBzY2VuZVxyXG5pbnRlcmZhY2UgUGxhY2VkRW5lbXlJbnN0YW5jZUNvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7IC8vIFVuaXF1ZSBpbnN0YW5jZSBuYW1lLCBlLmcuLCBcImVuZW15MVwiXHJcbiAgICBlbmVteVR5cGVOYW1lOiBzdHJpbmc7IC8vIFJlZmVyZW5jZSB0byBFbmVteVR5cGVDb25maWcubmFtZVxyXG4gICAgcG9zaXRpb246IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xyXG4gICAgcm90YXRpb25ZPzogbnVtYmVyOyAvLyBPcHRpb25hbCBpbml0aWFsIHJvdGF0aW9uXHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBidWxsZXQgY29uZmlndXJhdGlvblxyXG5pbnRlcmZhY2UgQnVsbGV0Q29uZmlnIHtcclxuICAgIHRleHR1cmVOYW1lOiBzdHJpbmc7XHJcbiAgICBkaW1lbnNpb25zOiB7IHJhZGl1czogbnVtYmVyOyB9OyAvLyBGb3IgYSBzcGhlcmUgYnVsbGV0XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgbWFzczogbnVtYmVyO1xyXG4gICAgbGlmZXRpbWU6IG51bWJlcjsgLy8gTWF4IHRpbWUgaW4gc2Vjb25kcyBiZWZvcmUgaXQgZGVzcGF3bnNcclxuICAgIG1heFJhbmdlOiBudW1iZXI7IC8vIE1heCBkaXN0YW5jZSBmcm9tIGZpcmUgcG9pbnQgYmVmb3JlIGl0IGRlc3Bhd25zXHJcbiAgICB2b2x1bWU6IG51bWJlcjsgLy8gU291bmQgdm9sdW1lXHJcbn1cclxuXHJcbi8vIEludGVyZmFjZSB0byB0eXBlLWNoZWNrIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHN0YXJ0R2FtZVByb21wdDogc3RyaW5nO1xyXG4gICAgICAgIHBsYXllclNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgbW91c2VTZW5zaXRpdml0eTogbnVtYmVyO1xyXG4gICAgICAgIGNhbWVyYUhlaWdodE9mZnNldDogbnVtYmVyOyAvLyBWZXJ0aWNhbCBvZmZzZXQgb2YgdGhlIGNhbWVyYSBmcm9tIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkgY2VudGVyXHJcbiAgICAgICAgY2FtZXJhTmVhcjogbnVtYmVyOyAgICAgICAgIC8vIE5lYXIgY2xpcHBpbmcgcGxhbmUgZm9yIHRoZSBjYW1lcmFcclxuICAgICAgICBjYW1lcmFGYXI6IG51bWJlcjsgICAgICAgICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lIGZvciB0aGUgY2FtZXJhXHJcbiAgICAgICAgcGxheWVyTWFzczogbnVtYmVyOyAgICAgICAgIC8vIE1hc3Mgb2YgdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keVxyXG4gICAgICAgIGdyb3VuZFNpemU6IG51bWJlcjsgICAgICAgICAvLyBTaXplICh3aWR0aC9kZXB0aCkgb2YgdGhlIHNxdWFyZSBncm91bmQgcGxhbmVcclxuICAgICAgICBtYXhQaHlzaWNzU3ViU3RlcHM6IG51bWJlcjsgLy8gTWF4aW11bSBudW1iZXIgb2YgcGh5c2ljcyBzdWJzdGVwcyBwZXIgZnJhbWUgdG8gbWFpbnRhaW4gc3RhYmlsaXR5XHJcbiAgICAgICAgZml4ZWRBc3BlY3RSYXRpbzogeyB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciB9OyAvLyBOZXc6IEZpeGVkIGFzcGVjdCByYXRpbyBmb3IgdGhlIGdhbWUgKHdpZHRoIC8gaGVpZ2h0KVxyXG4gICAgICAgIGp1bXBGb3JjZTogbnVtYmVyOyAgICAgICAgICAvLyBBRERFRDogRm9yY2UgYXBwbGllZCB3aGVuIGp1bXBpbmdcclxuICAgICAgICBzY29yZTogbnVtYmVyOyAgICAgICAgICAgICAgLy8gTkVXOiBJbml0aWFsIHNjb3JlXHJcbiAgICAgICAgZW5lbXlUeXBlczogRW5lbXlUeXBlQ29uZmlnW107IC8vIE5FVzogQXJyYXkgb2YgZGlmZmVyZW50IGVuZW15IHRlbXBsYXRlc1xyXG4gICAgICAgIHN0YXRpY09iamVjdHM6IFBsYWNlZE9iamVjdENvbmZpZ1tdOyAvLyBORVc6IFJlbmFtZWQgZnJvbSBwbGFjZWRPYmplY3RzLCBvbmx5IHN0YXRpYyBib3hlc1xyXG4gICAgICAgIGVuZW15SW5zdGFuY2VzOiBQbGFjZWRFbmVteUluc3RhbmNlQ29uZmlnW107IC8vIE5FVzogQXJyYXkgb2Ygc3BlY2lmaWMgZW5lbXkgcGxhY2VtZW50c1xyXG4gICAgICAgIC8vIE5FVzogQ29uZmlndXJhYmxlIHBoeXNpY3MgcHJvcGVydGllc1xyXG4gICAgICAgIHBsYXllckdyb3VuZEZyaWN0aW9uOiBudW1iZXI7ICAgICAgICAvLyBGcmljdGlvbiBjb2VmZmljaWVudCBmb3IgcGxheWVyLWdyb3VuZCBjb250YWN0XHJcbiAgICAgICAgcGxheWVyQWlyQ29udHJvbEZhY3RvcjogbnVtYmVyOyAgICAvLyBNdWx0aXBsaWVyIGZvciBwbGF5ZXJTcGVlZCB3aGVuIGFpcmJvcm5lXHJcbiAgICAgICAgcGxheWVyQWlyRGVjZWxlcmF0aW9uOiBudW1iZXI7ICAgICAvLyBEZWNheSBmYWN0b3IgZm9yIGhvcml6b250YWwgdmVsb2NpdHkgd2hlbiBhaXJib3JuZSBhbmQgbm90IG1vdmluZ1xyXG4gICAgICAgIGJ1bGxldDogQnVsbGV0Q29uZmlnOyAvLyBORVc6IEJ1bGxldCBjb25maWd1cmF0aW9uXHJcbiAgICB9O1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyIH1bXTtcclxuICAgIH07XHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBhbiBhY3RpdmUgYnVsbGV0IGluc3RhbmNlXHJcbmludGVyZmFjZSBBY3RpdmVCdWxsZXQge1xyXG4gICAgbWVzaDogVEhSRUUuTWVzaDtcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5O1xyXG4gICAgY3JlYXRpb25UaW1lOiBudW1iZXI7IC8vIFVzZWQgZm9yIGxpZmV0aW1lIGNoZWNrXHJcbiAgICBmaXJlUG9zaXRpb246IENBTk5PTi5WZWMzOyAvLyBVc2VkIGZvciBtYXhSYW5nZSBjaGVja1xyXG4gICAgc2hvdWxkUmVtb3ZlPzogYm9vbGVhbjsgLy8gTkVXOiBGbGFnIHRvIG1hcmsgZm9yIHJlbW92YWxcclxuICAgIGNvbGxpZGVIYW5kbGVyPzogKGV2ZW50OiBDb2xsaWRlRXZlbnQpID0+IHZvaWQ7IC8vIE5FVzogU3RvcmUgdGhlIHNwZWNpZmljIGhhbmRsZXIgZnVuY3Rpb25cclxufVxyXG5cclxuLy8gTkVXOiBJbnRlcmZhY2UgZm9yIGFuIGFjdGl2ZSBlbmVteSBpbnN0YW5jZSAocnVudGltZSBkYXRhKVxyXG5pbnRlcmZhY2UgQWN0aXZlRW5lbXkge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgbWVzaDogVEhSRUUuTWVzaDtcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5O1xyXG4gICAgdHlwZUNvbmZpZzogRW5lbXlUeXBlQ29uZmlnOyAvLyBSZWZlcmVuY2UgdG8gaXRzIHR5cGUgZGVmaW5pdGlvblxyXG4gICAgY3VycmVudEhlYWx0aDogbnVtYmVyO1xyXG4gICAgc2hvdWxkUmVtb3ZlPzogYm9vbGVhbjsgLy8gRmxhZyB0byBtYXJrIGZvciByZW1vdmFsXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNYWluIEdhbWUgY2xhc3MgcmVzcG9uc2libGUgZm9yIGluaXRpYWxpemluZyBhbmQgcnVubmluZyB0aGUgM0QgZ2FtZS5cclxuICogSXQgaGFuZGxlcyBUaHJlZS5qcyByZW5kZXJpbmcsIENhbm5vbi1lcyBwaHlzaWNzLCBpbnB1dCwgYW5kIGdhbWUgc3RhdGUuXHJcbiAqL1xyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY29uZmlnITogR2FtZUNvbmZpZzsgLy8gR2FtZSBjb25maWd1cmF0aW9uIGxvYWRlZCBmcm9tIGRhdGEuanNvblxyXG4gICAgcHJpdmF0ZSBzdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFOyAvLyBDdXJyZW50IHN0YXRlIG9mIHRoZSBnYW1lXHJcblxyXG4gICAgLy8gVGhyZWUuanMgZWxlbWVudHMgZm9yIHJlbmRlcmluZ1xyXG4gICAgcHJpdmF0ZSBzY2VuZSE6IFRIUkVFLlNjZW5lO1xyXG4gICAgcHJpdmF0ZSBjYW1lcmEhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYTtcclxuICAgIHByaXZhdGUgcmVuZGVyZXIhOiBUSFJFRS5XZWJHTFJlbmRlcmVyO1xyXG4gICAgcHJpdmF0ZSBjYW52YXMhOiBIVE1MQ2FudmFzRWxlbWVudDsgLy8gVGhlIEhUTUwgY2FudmFzIGVsZW1lbnQgZm9yIHJlbmRlcmluZ1xyXG5cclxuICAgIC8vIE5ldzogQSBjb250YWluZXIgb2JqZWN0IGZvciB0aGUgY2FtZXJhIHRvIGhhbmRsZSBob3Jpem9udGFsIHJvdGF0aW9uIHNlcGFyYXRlbHkgZnJvbSB2ZXJ0aWNhbCBwaXRjaC5cclxuICAgIHByaXZhdGUgY2FtZXJhQ29udGFpbmVyITogVEhSRUUuT2JqZWN0M0Q7IFxyXG5cclxuICAgIC8vIENhbm5vbi1lcyBlbGVtZW50cyBmb3IgcGh5c2ljc1xyXG4gICAgcHJpdmF0ZSB3b3JsZCE6IENBTk5PTi5Xb3JsZDtcclxuICAgIHByaXZhdGUgcGxheWVyQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBwbGF5ZXJcclxuICAgIHByaXZhdGUgZ3JvdW5kQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBncm91bmRcclxuXHJcbiAgICAvLyBORVc6IENhbm5vbi1lcyBtYXRlcmlhbHMgZm9yIHBoeXNpY3NcclxuICAgIHByaXZhdGUgcGxheWVyTWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7XHJcbiAgICBwcml2YXRlIGdyb3VuZE1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsO1xyXG4gICAgcHJpdmF0ZSBkZWZhdWx0T2JqZWN0TWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7IC8vIEFEREVEOiBNYXRlcmlhbCBmb3IgZ2VuZXJpYyBwbGFjZWQgb2JqZWN0c1xyXG4gICAgcHJpdmF0ZSBidWxsZXRNYXRlcmlhbCE6IENBTk5PTi5NYXRlcmlhbDsgLy8gTkVXOiBNYXRlcmlhbCBmb3IgYnVsbGV0c1xyXG4gICAgcHJpdmF0ZSBlbmVteU1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsOyAvLyBORVc6IE1hdGVyaWFsIGZvciBlbmVtaWVzXHJcblxyXG4gICAgLy8gVmlzdWFsIG1lc2hlcyAoVGhyZWUuanMpIGZvciBnYW1lIG9iamVjdHNcclxuICAgIHByaXZhdGUgcGxheWVyTWVzaCE6IFRIUkVFLk1lc2g7XHJcbiAgICBwcml2YXRlIGdyb3VuZE1lc2ghOiBUSFJFRS5NZXNoO1xyXG4gICAgLy8gTkVXOiBBcnJheXMgdG8gaG9sZCByZWZlcmVuY2VzIHRvIGR5bmFtaWNhbGx5IHBsYWNlZCBvYmplY3RzXHJcbiAgICBwcml2YXRlIHBsYWNlZE9iamVjdE1lc2hlczogVEhSRUUuTWVzaFtdID0gW107XHJcbiAgICBwcml2YXRlIHBsYWNlZE9iamVjdEJvZGllczogQ0FOTk9OLkJvZHlbXSA9IFtdO1xyXG5cclxuICAgIC8vIE5FVzogQWN0aXZlIGJ1bGxldHNcclxuICAgIHByaXZhdGUgYnVsbGV0czogQWN0aXZlQnVsbGV0W10gPSBbXTtcclxuICAgIHByaXZhdGUgYnVsbGV0c1RvUmVtb3ZlOiBTZXQ8QWN0aXZlQnVsbGV0PiA9IG5ldyBTZXQoKTsgLy8gTkVXOiBMaXN0IG9mIGJ1bGxldHMgdG8gcmVtb3ZlIGFmdGVyIHBoeXNpY3Mgc3RlcFxyXG4gICAgcHJpdmF0ZSBidWxsZXRHZW9tZXRyeSE6IFRIUkVFLlNwaGVyZUdlb21ldHJ5OyAvLyBSZXVzYWJsZSBnZW9tZXRyeSBmb3IgYnVsbGV0c1xyXG4gICAgcHJpdmF0ZSBidWxsZXRNYXRlcmlhbE1lc2ghOiBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbDsgLy8gUmV1c2FibGUgbWF0ZXJpYWwgZm9yIGJ1bGxldHMgKHVzaW5nIEJhc2ljIHRvIHByZXZlbnQgbGlnaHRpbmcgaXNzdWVzIGZvciBzaW1wbGUgYnVsbGV0cylcclxuXHJcbiAgICAvLyBORVc6IEFjdGl2ZSBlbmVtaWVzXHJcbiAgICBwcml2YXRlIGVuZW1pZXM6IEFjdGl2ZUVuZW15W10gPSBbXTtcclxuICAgIHByaXZhdGUgZW5lbWllc1RvUmVtb3ZlOiBTZXQ8QWN0aXZlRW5lbXk+ID0gbmV3IFNldCgpOyAvLyBMaXN0IG9mIGVuZW1pZXMgdG8gcmVtb3ZlIGFmdGVyIHBoeXNpY3Mgc3RlcFxyXG5cclxuICAgIC8vIElucHV0IGhhbmRsaW5nIHN0YXRlXHJcbiAgICBwcml2YXRlIGtleXM6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307IC8vIFRyYWNrcyBjdXJyZW50bHkgcHJlc3NlZCBrZXlzXHJcbiAgICBwcml2YXRlIGlzUG9pbnRlckxvY2tlZDogYm9vbGVhbiA9IGZhbHNlOyAvLyBUcnVlIGlmIG1vdXNlIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICBwcml2YXRlIGNhbWVyYVBpdGNoOiBudW1iZXIgPSAwOyAvLyBWZXJ0aWNhbCByb3RhdGlvbiAocGl0Y2gpIG9mIHRoZSBjYW1lcmFcclxuXHJcbiAgICAvLyBBc3NldCBtYW5hZ2VtZW50XHJcbiAgICBwcml2YXRlIHRleHR1cmVzOiBNYXA8c3RyaW5nLCBUSFJFRS5UZXh0dXJlPiA9IG5ldyBNYXAoKTsgLy8gU3RvcmVzIGxvYWRlZCB0ZXh0dXJlc1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpOyAvLyBTdG9yZXMgbG9hZGVkIGF1ZGlvIGVsZW1lbnRzXHJcblxyXG4gICAgLy8gVUkgZWxlbWVudHMgKGR5bmFtaWNhbGx5IGNyZWF0ZWQgZm9yIHRoZSB0aXRsZSBzY3JlZW4gYW5kIGdhbWUgb3ZlcmxheSlcclxuICAgIHByaXZhdGUgdGl0bGVTY3JlZW5PdmVybGF5ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHRpdGxlVGV4dCE6IEhUTUxEaXZFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBwcm9tcHRUZXh0ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGluc3RydWN0aW9uc092ZXJsYXkhOiBIVE1MRGl2RWxlbWVudDsgLy8gTkVXOiBJbnN0cnVjdGlvbnMgc2NyZWVuIG92ZXJsYXlcclxuICAgIHByaXZhdGUgc2NvcmVUZXh0ITogSFRNTERpdkVsZW1lbnQ7IC8vIE5FVzogVUkgZWxlbWVudCBmb3Igc2NvcmVcclxuICAgIHByaXZhdGUgY3Jvc3NoYWlyRWxlbWVudCE6IEhUTUxEaXZFbGVtZW50OyAvLyBORVc6IENyb3NzaGFpciBVSSBlbGVtZW50XHJcblxyXG4gICAgLy8gRm9yIGNhbGN1bGF0aW5nIGRlbHRhIHRpbWUgYmV0d2VlbiBmcmFtZXNcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXAgPSAwO1xyXG5cclxuICAgIC8vIE1PRElGSUVEOiBUcmFja3MgcGxheWVyIGNvbnRhY3RzIHdpdGggQU5ZIHN0YXRpYyBzdXJmYWNlIChncm91bmQgb3IgcGxhY2VkIG9iamVjdHMpIGZvciBqdW1waW5nL21vdmVtZW50IGxvZ2ljXHJcbiAgICBwcml2YXRlIG51bUNvbnRhY3RzV2l0aFN0YXRpY1N1cmZhY2VzOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIC8vIE5FVzogR2FtZSBzY29yZVxyXG4gICAgcHJpdmF0ZSBzY29yZTogbnVtYmVyID0gMDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICAvLyBHZXQgdGhlIGNhbnZhcyBlbGVtZW50IGZyb20gaW5kZXguaHRtbFxyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0NhbnZhcyBlbGVtZW50IHdpdGggSUQgXCJnYW1lQ2FudmFzXCIgbm90IGZvdW5kIScpO1xyXG4gICAgICAgICAgICByZXR1cm47IC8vIENhbm5vdCBwcm9jZWVkIHdpdGhvdXQgYSBjYW52YXNcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5pbml0KCk7IC8vIFN0YXJ0IHRoZSBhc3luY2hyb25vdXMgaW5pdGlhbGl6YXRpb24gcHJvY2Vzc1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXN5bmNocm9ub3VzbHkgaW5pdGlhbGl6ZXMgdGhlIGdhbWUsIGxvYWRpbmcgY29uZmlnLCBhc3NldHMsIGFuZCBzZXR0aW5nIHVwIHN5c3RlbXMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXN5bmMgaW5pdCgpIHtcclxuICAgICAgICAvLyAxLiBMb2FkIGdhbWUgY29uZmlndXJhdGlvbiBmcm9tIGRhdGEuanNvblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgZXJyb3IhIHN0YXR1czogJHtyZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5jb25maWcgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdHYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkOicsIHRoaXMuY29uZmlnKTtcclxuICAgICAgICAgICAgdGhpcy5zY29yZSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5zY29yZTsgLy8gSW5pdGlhbGl6ZSBzY29yZSBmcm9tIGNvbmZpZ1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbjonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIC8vIElmIGNvbmZpZ3VyYXRpb24gZmFpbHMgdG8gbG9hZCwgZGlzcGxheSBhbiBlcnJvciBtZXNzYWdlIGFuZCBzdG9wLlxyXG4gICAgICAgICAgICBjb25zdCBlcnJvckRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRvcCA9ICc1MCUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5sZWZ0ID0gJzUwJSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRyYW5zZm9ybSA9ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5jb2xvciA9ICdyZWQnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5mb250U2l6ZSA9ICcyNHB4JztcclxuICAgICAgICAgICAgZXJyb3JEaXYudGV4dENvbnRlbnQgPSAnRXJyb3I6IEZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbi4gQ2hlY2sgY29uc29sZSBmb3IgZGV0YWlscy4nO1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVycm9yRGl2KTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gMi4gSW5pdGlhbGl6ZSBUaHJlZS5qcyAoc2NlbmUsIGNhbWVyYSwgcmVuZGVyZXIpXHJcbiAgICAgICAgdGhpcy5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKFxyXG4gICAgICAgICAgICA3NSwgLy8gRmllbGQgb2YgVmlldyAoRk9WKVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby53aWR0aCAvIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5maXhlZEFzcGVjdFJhdGlvLmhlaWdodCwgLy8gRml4ZWQgQXNwZWN0IHJhdGlvIGZyb20gY29uZmlnXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFOZWFyLCAvLyBOZWFyIGNsaXBwaW5nIHBsYW5lXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFGYXIgICAvLyBGYXIgY2xpcHBpbmcgcGxhbmVcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcih7IGNhbnZhczogdGhpcy5jYW52YXMsIGFudGlhbGlhczogdHJ1ZSB9KTtcclxuICAgICAgICAvLyBSZW5kZXJlciBzaXplIHdpbGwgYmUgc2V0IGJ5IGFwcGx5Rml4ZWRBc3BlY3RSYXRpbyB0byBmaXQgdGhlIHdpbmRvdyB3aGlsZSBtYWludGFpbmluZyBhc3BlY3QgcmF0aW9cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFBpeGVsUmF0aW8od2luZG93LmRldmljZVBpeGVsUmF0aW8pO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2hhZG93TWFwLmVuYWJsZWQgPSB0cnVlOyAvLyBFbmFibGUgc2hhZG93cyBmb3IgYmV0dGVyIHJlYWxpc21cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC50eXBlID0gVEhSRUUuUENGU29mdFNoYWRvd01hcDsgLy8gVXNlIHNvZnQgc2hhZG93c1xyXG5cclxuICAgICAgICAvLyBDYW1lcmEgc2V0dXAgZm9yIGRlY291cGxlZCB5YXcgYW5kIHBpdGNoOlxyXG4gICAgICAgIC8vIGNhbWVyYUNvbnRhaW5lciBoYW5kbGVzIHlhdyAoaG9yaXpvbnRhbCByb3RhdGlvbikgYW5kIGZvbGxvd3MgdGhlIHBsYXllcidzIHBvc2l0aW9uLlxyXG4gICAgICAgIC8vIFRoZSBjYW1lcmEgaXRzZWxmIGlzIGEgY2hpbGQgb2YgY2FtZXJhQ29udGFpbmVyIGFuZCBoYW5kbGVzIHBpdGNoICh2ZXJ0aWNhbCByb3RhdGlvbikuXHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIgPSBuZXcgVEhSRUUuT2JqZWN0M0QoKTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLmNhbWVyYUNvbnRhaW5lcik7XHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIuYWRkKHRoaXMuY2FtZXJhKTtcclxuICAgICAgICAvLyBQb3NpdGlvbiB0aGUgY2FtZXJhIHJlbGF0aXZlIHRvIHRoZSBjYW1lcmFDb250YWluZXIgKGF0IGV5ZSBsZXZlbClcclxuICAgICAgICB0aGlzLmNhbWVyYS5wb3NpdGlvbi55ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbWVyYUhlaWdodE9mZnNldDtcclxuXHJcblxyXG4gICAgICAgIC8vIDMuIEluaXRpYWxpemUgQ2Fubm9uLWVzIChwaHlzaWNzIHdvcmxkKVxyXG4gICAgICAgIHRoaXMud29ybGQgPSBuZXcgQ0FOTk9OLldvcmxkKCk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5ncmF2aXR5LnNldCgwLCAtOS44MiwgMCk7IC8vIFNldCBzdGFuZGFyZCBFYXJ0aCBncmF2aXR5IChZLWF4aXMgZG93bilcclxuICAgICAgICB0aGlzLndvcmxkLmJyb2FkcGhhc2UgPSBuZXcgQ0FOTk9OLlNBUEJyb2FkcGhhc2UodGhpcy53b3JsZCk7IC8vIFVzZSBhbiBlZmZpY2llbnQgYnJvYWRwaGFzZSBhbGdvcml0aG1cclxuICAgICAgICAvLyBGaXg6IENhc3QgdGhpcy53b3JsZC5zb2x2ZXIgdG8gQ0FOTk9OLkdTU29sdmVyIHRvIGFjY2VzcyB0aGUgJ2l0ZXJhdGlvbnMnIHByb3BlcnR5XHJcbiAgICAgICAgLy8gVGhlIGRlZmF1bHQgc29sdmVyIGluIENhbm5vbi5qcyAoYW5kIENhbm5vbi1lcykgaXMgR1NTb2x2ZXIsIHdoaWNoIGhhcyB0aGlzIHByb3BlcnR5LlxyXG4gICAgICAgICh0aGlzLndvcmxkLnNvbHZlciBhcyBDQU5OT04uR1NTb2x2ZXIpLml0ZXJhdGlvbnMgPSAxMDsgLy8gSW5jcmVhc2Ugc29sdmVyIGl0ZXJhdGlvbnMgZm9yIGJldHRlciBzdGFiaWxpdHlcclxuXHJcbiAgICAgICAgLy8gTkVXOiBDcmVhdGUgQ2Fubm9uLmpzIE1hdGVyaWFscyBhbmQgQ29udGFjdE1hdGVyaWFsIGZvciBwbGF5ZXItZ3JvdW5kIGludGVyYWN0aW9uXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ3BsYXllck1hdGVyaWFsJyk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ2dyb3VuZE1hdGVyaWFsJyk7XHJcbiAgICAgICAgdGhpcy5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdkZWZhdWx0T2JqZWN0TWF0ZXJpYWwnKTsgLy8gQURERUQ6IE1hdGVyaWFsIGZvciBnZW5lcmljIHBsYWNlZCBvYmplY3RzXHJcbiAgICAgICAgdGhpcy5idWxsZXRNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ2J1bGxldE1hdGVyaWFsJyk7IC8vIE5FVzogTWF0ZXJpYWwgZm9yIGJ1bGxldHNcclxuICAgICAgICB0aGlzLmVuZW15TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdlbmVteU1hdGVyaWFsJyk7IC8vIE5FVzogTWF0ZXJpYWwgZm9yIGVuZW1pZXNcclxuXHJcbiAgICAgICAgY29uc3QgcGxheWVyR3JvdW5kQ29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZ3JvdW5kTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGZyaWN0aW9uOiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyR3JvdW5kRnJpY3Rpb24sIC8vIFVzZSBjb25maWd1cmFibGUgZ3JvdW5kIGZyaWN0aW9uXHJcbiAgICAgICAgICAgICAgICByZXN0aXR1dGlvbjogMC4wLCAvLyBObyBib3VuY2UgZm9yIGdyb3VuZFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChwbGF5ZXJHcm91bmRDb250YWN0TWF0ZXJpYWwpO1xyXG5cclxuICAgICAgICAvLyBBRERFRDogUGxheWVyLU9iamVjdCBjb250YWN0IG1hdGVyaWFsIChmcmljdGlvbiBiZXR3ZWVuIHBsYXllciBhbmQgcGxhY2VkIG9iamVjdHMpXHJcbiAgICAgICAgY29uc3QgcGxheWVyT2JqZWN0Q29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckdyb3VuZEZyaWN0aW9uLCAvLyBTYW1lIGZyaWN0aW9uIGFzIHBsYXllci1ncm91bmRcclxuICAgICAgICAgICAgICAgIHJlc3RpdHV0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKHBsYXllck9iamVjdENvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIC8vIEFEREVEOiBPYmplY3QtR3JvdW5kIGNvbnRhY3QgbWF0ZXJpYWwgKGZyaWN0aW9uIGJldHdlZW4gcGxhY2VkIG9iamVjdHMgYW5kIGdyb3VuZClcclxuICAgICAgICBjb25zdCBvYmplY3RHcm91bmRDb250YWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICAgICAgdGhpcy5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZ3JvdW5kTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGZyaWN0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgICAgICByZXN0aXR1dGlvbjogMC4wLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChvYmplY3RHcm91bmRDb250YWN0TWF0ZXJpYWwpO1xyXG5cclxuICAgICAgICAvLyBORVc6IEJ1bGxldC1Hcm91bmQgY29udGFjdCBtYXRlcmlhbCAobm8gZnJpY3Rpb24sIG5vIHJlc3RpdHV0aW9uKVxyXG4gICAgICAgIGNvbnN0IGJ1bGxldEdyb3VuZENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLmJ1bGxldE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmdyb3VuZE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogMC4wLFxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwoYnVsbGV0R3JvdW5kQ29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gTkVXOiBCdWxsZXQtT2JqZWN0IGNvbnRhY3QgbWF0ZXJpYWwgKG5vIGZyaWN0aW9uLCBubyByZXN0aXR1dGlvbilcclxuICAgICAgICBjb25zdCBidWxsZXRPYmplY3RDb250YWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICAgICAgdGhpcy5idWxsZXRNYXRlcmlhbCxcclxuICAgICAgICAgICAgdGhpcy5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGZyaWN0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgICAgICByZXN0aXR1dGlvbjogMC4wLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChidWxsZXRPYmplY3RDb250YWN0TWF0ZXJpYWwpO1xyXG5cclxuICAgICAgICAvLyBORVc6IEJ1bGxldC1FbmVteSBjb250YWN0IG1hdGVyaWFsIChidWxsZXQgZGlzYXBwZWFycywgZW5lbXkgdGFrZXMgZGFtYWdlKVxyXG4gICAgICAgIGNvbnN0IGJ1bGxldEVuZW15Q29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMuYnVsbGV0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZW5lbXlNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IDAuMCxcclxuICAgICAgICAgICAgICAgIHJlc3RpdHV0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKGJ1bGxldEVuZW15Q29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gTkVXOiBQbGF5ZXItRW5lbXkgY29udGFjdCBtYXRlcmlhbCAocGxheWVyIG1pZ2h0IHB1c2ggZW5lbXkgc2xpZ2h0bHkpXHJcbiAgICAgICAgY29uc3QgcGxheWVyRW5lbXlDb250YWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJNYXRlcmlhbCxcclxuICAgICAgICAgICAgdGhpcy5lbmVteU1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogMC41LFxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwocGxheWVyRW5lbXlDb250YWN0TWF0ZXJpYWwpO1xyXG5cclxuXHJcbiAgICAgICAgLy8gNC4gTG9hZCBhc3NldHMgKHRleHR1cmVzIGFuZCBzb3VuZHMpXHJcbiAgICAgICAgYXdhaXQgdGhpcy5sb2FkQXNzZXRzKCk7XHJcblxyXG4gICAgICAgIC8vIDUuIENyZWF0ZSBnYW1lIG9iamVjdHMgKHBsYXllciwgZ3JvdW5kLCBzdGF0aWMgb2JqZWN0cywgZW5lbWllcykgYW5kIGxpZ2h0aW5nXHJcbiAgICAgICAgdGhpcy5jcmVhdGVHcm91bmQoKTsgLy8gQ3JlYXRlcyB0aGlzLmdyb3VuZEJvZHlcclxuICAgICAgICB0aGlzLmNyZWF0ZVBsYXllcigpOyAvLyBDcmVhdGVzIHRoaXMucGxheWVyQm9keVxyXG4gICAgICAgIHRoaXMuY3JlYXRlU3RhdGljT2JqZWN0cygpOyAvLyBSZW5hbWVkIGZyb20gY3JlYXRlUGxhY2VkT2JqZWN0cywgY3JlYXRlcyBzdGF0aWMgYm94ZXNcclxuICAgICAgICB0aGlzLmNyZWF0ZUVuZW1pZXMoKTsgLy8gTkVXOiBDcmVhdGVzIGVuZW1pZXNcclxuICAgICAgICB0aGlzLnNldHVwTGlnaHRpbmcoKTtcclxuXHJcbiAgICAgICAgLy8gTkVXOiBDcmVhdGUgcmV1c2FibGUgYnVsbGV0IGdlb21ldHJ5IGFuZCBtYXRlcmlhbFxyXG4gICAgICAgIHRoaXMuYnVsbGV0R2VvbWV0cnkgPSBuZXcgVEhSRUUuU3BoZXJlR2VvbWV0cnkodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmJ1bGxldC5kaW1lbnNpb25zLnJhZGl1cywgOCwgOCk7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0VGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5idWxsZXQudGV4dHVyZU5hbWUpO1xyXG4gICAgICAgIHRoaXMuYnVsbGV0TWF0ZXJpYWxNZXNoID0gbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHtcclxuICAgICAgICAgICAgbWFwOiBidWxsZXRUZXh0dXJlLFxyXG4gICAgICAgICAgICBjb2xvcjogYnVsbGV0VGV4dHVyZSA/IDB4ZmZmZmZmIDogMHhmZmZmMDAgLy8gWWVsbG93IGlmIG5vIHRleHR1cmVcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gTU9ESUZJRUQ6IFNldHVwIENhbm5vbi1lcyBjb250YWN0IGxpc3RlbmVycyBmb3IgZ2VuZXJhbCBzdXJmYWNlIGNvbnRhY3QgbG9naWNcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEV2ZW50TGlzdGVuZXIoJ2JlZ2luQ29udGFjdCcsIChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICBsZXQgYm9keUEgPSBldmVudC5ib2R5QTtcclxuICAgICAgICAgICAgbGV0IGJvZHlCID0gZXZlbnQuYm9keUI7XHJcblxyXG4gICAgICAgICAgICAvLyBORVc6IEFkZCBhIGNoZWNrIGZvciB1bmRlZmluZWQvbnVsbCBib2RpZXMgZnJvbSB0aGUgZXZlbnQgdG8gcHJldmVudCBcIkNhbm5vdCByZWFkIHByb3BlcnRpZXMgb2YgdW5kZWZpbmVkXCJcclxuICAgICAgICAgICAgaWYgKCFib2R5QSB8fCAhYm9keUIpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihcImJlZ2luQ29udGFjdDogT25lIG9mIHRoZSBjb2xsaWRpbmcgYm9kaWVzIGlzIHVuZGVmaW5lZCBvciBudWxsLlwiLCBldmVudCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHBsYXllckJvZHkgaXMgaW52b2x2ZWQgaW4gdGhlIGNvbnRhY3RcclxuICAgICAgICAgICAgaWYgKGJvZHlBID09PSB0aGlzLnBsYXllckJvZHkgfHwgYm9keUIgPT09IHRoaXMucGxheWVyQm9keSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgb3RoZXJCb2R5ID0gYm9keUEgPT09IHRoaXMucGxheWVyQm9keSA/IGJvZHlCIDogYm9keUE7XHJcbiAgICAgICAgICAgICAgICAvLyBORVc6IEVuc3VyZSBvdGhlckJvZHkgaXMgbm90IHVuZGVmaW5lZCBiZWZvcmUgYWNjZXNzaW5nIGl0cyBwcm9wZXJ0aWVzXHJcbiAgICAgICAgICAgICAgICBpZiAob3RoZXJCb2R5ICYmIG90aGVyQm9keS5tYXNzID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcysrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMud29ybGQuYWRkRXZlbnRMaXN0ZW5lcignZW5kQ29udGFjdCcsIChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICBsZXQgYm9keUEgPSBldmVudC5ib2R5QTtcclxuICAgICAgICAgICAgbGV0IGJvZHlCID0gZXZlbnQuYm9keUI7XHJcblxyXG4gICAgICAgICAgICAvLyBORVc6IEFkZCBhIGNoZWNrIGZvciB1bmRlZmluZWQvbnVsbCBib2RpZXMgZnJvbSB0aGUgZXZlbnRcclxuICAgICAgICAgICAgaWYgKCFib2R5QSB8fCAhYm9keUIpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihcImVuZENvbnRhY3Q6IE9uZSBvZiB0aGUgY29sbGlkaW5nIGJvZGllcyBpcyB1bmRlZmluZWQgb3IgbnVsbC5cIiwgZXZlbnQpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAoYm9keUEgPT09IHRoaXMucGxheWVyQm9keSB8fCBib2R5QiA9PT0gdGhpcy5wbGF5ZXJCb2R5KSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBvdGhlckJvZHkgPSBib2R5QSA9PT0gdGhpcy5wbGF5ZXJCb2R5ID8gYm9keUIgOiBib2R5QTtcclxuICAgICAgICAgICAgICAgIC8vIE5FVzogRW5zdXJlIG90aGVyQm9keSBpcyBub3QgdW5kZWZpbmVkIGJlZm9yZSBhY2Nlc3NpbmcgaXRzIHByb3BlcnRpZXNcclxuICAgICAgICAgICAgICAgIGlmIChvdGhlckJvZHkgJiYgb3RoZXJCb2R5Lm1hc3MgPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm51bUNvbnRhY3RzV2l0aFN0YXRpY1N1cmZhY2VzID0gTWF0aC5tYXgoMCwgdGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyAtIDEpOyAvLyBFbnN1cmUgaXQgZG9lc24ndCBnbyBiZWxvdyAwXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gNy4gU2V0dXAgZXZlbnQgbGlzdGVuZXJzIGZvciB1c2VyIGlucHV0IGFuZCB3aW5kb3cgcmVzaXppbmdcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgdGhpcy5vbldpbmRvd1Jlc2l6ZS5iaW5kKHRoaXMpKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5vbktleURvd24uYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLm9uS2V5VXAuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5vbk1vdXNlTW92ZS5iaW5kKHRoaXMpKTsgLy8gRm9yIG1vdXNlIGxvb2tcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCB0aGlzLm9uTW91c2VEb3duLmJpbmQodGhpcykpOyAvLyBORVc6IEZvciBmaXJpbmcgYnVsbGV0c1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJsb2NrY2hhbmdlJywgdGhpcy5vblBvaW50ZXJMb2NrQ2hhbmdlLmJpbmQodGhpcykpOyAvLyBGb3IgcG9pbnRlciBsb2NrIHN0YXR1c1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21venBvaW50ZXJsb2NrY2hhbmdlJywgdGhpcy5vblBvaW50ZXJMb2NrQ2hhbmdlLmJpbmQodGhpcykpOyAvLyBGaXJlZm94IGNvbXBhdGliaWxpdHlcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCd3ZWJraXRwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gV2Via2l0IGNvbXBhdGliaWxpdHlcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgaW5pdGlhbCBmaXhlZCBhc3BlY3QgcmF0aW8gYW5kIGNlbnRlciB0aGUgY2FudmFzXHJcbiAgICAgICAgdGhpcy5hcHBseUZpeGVkQXNwZWN0UmF0aW8oKTtcclxuXHJcbiAgICAgICAgLy8gOC4gU2V0dXAgdGhlIHRpdGxlIHNjcmVlbiBVSSBhbmQgR2FtZSBVSVxyXG4gICAgICAgIHRoaXMuc2V0dXBUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgIHRoaXMuc2V0dXBJbnN0cnVjdGlvbnNTY3JlZW4oKTsgLy8gTkVXOiBTZXR1cCBpbnN0cnVjdGlvbnMgc2NyZWVuLCBpbml0aWFsbHkgaGlkZGVuXHJcbiAgICAgICAgdGhpcy5zZXR1cEdhbWVVSSgpOyAvLyBORVc6IFNldHVwIHNjb3JlIGRpc3BsYXkgYW5kIGNyb3NzaGFpclxyXG5cclxuICAgICAgICAvLyBTdGFydCB0aGUgbWFpbiBnYW1lIGxvb3BcclxuICAgICAgICB0aGlzLmFuaW1hdGUoMCk7IC8vIFBhc3MgaW5pdGlhbCB0aW1lIDBcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIExvYWRzIGFsbCB0ZXh0dXJlcyBhbmQgc291bmRzIGRlZmluZWQgaW4gdGhlIGdhbWUgY29uZmlndXJhdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQXNzZXRzKCkge1xyXG4gICAgICAgIGNvbnN0IHRleHR1cmVMb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuaW1hZ2VzLm1hcChpbWcgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gdGV4dHVyZUxvYWRlci5sb2FkQXN5bmMoaW1nLnBhdGgpXHJcbiAgICAgICAgICAgICAgICAudGhlbih0ZXh0dXJlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmVzLnNldChpbWcubmFtZSwgdGV4dHVyZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nOyAvLyBSZXBlYXQgdGV4dHVyZSBob3Jpem9udGFsbHlcclxuICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7IC8vIFJlcGVhdCB0ZXh0dXJlIHZlcnRpY2FsbHlcclxuICAgICAgICAgICAgICAgICAgICAvLyBBZGp1c3QgdGV4dHVyZSByZXBldGl0aW9uIGZvciB0aGUgZ3JvdW5kIHRvIGF2b2lkIHN0cmV0Y2hpbmdcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW1nLm5hbWUgPT09ICdncm91bmRfdGV4dHVyZScpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgIHRleHR1cmUucmVwZWF0LnNldCh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplIC8gNSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIC8vIEZvciBib3ggdGV4dHVyZXMsIGVuc3VyZSByZXBldGl0aW9uIGlmIGRlc2lyZWQsIG9yIHNldCB0byAxLDEgZm9yIHNpbmdsZSBhcHBsaWNhdGlvblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpbWcubmFtZS5lbmRzV2l0aCgnX3RleHR1cmUnKSkgeyAvLyBHZW5lcmljIGNoZWNrIGZvciBvdGhlciB0ZXh0dXJlc1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGb3IgZ2VuZXJpYyBib3ggdGV4dHVyZXMsIHdlIG1pZ2h0IHdhbnQgdG8gcmVwZWF0IGJhc2VkIG9uIG9iamVjdCBkaW1lbnNpb25zXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZvciBzaW1wbGljaXR5IG5vdywgbGV0J3Mga2VlcCBkZWZhdWx0IChubyByZXBlYXQgdW5sZXNzIGV4cGxpY2l0IGZvciBncm91bmQpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEEgbW9yZSByb2J1c3Qgc29sdXRpb24gd291bGQgaW52b2x2ZSBzZXR0aW5nIHJlcGVhdCBiYXNlZCBvbiBzY2FsZS9kaW1lbnNpb25zIGZvciBlYWNoIG9iamVjdFxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHRleHR1cmU6ICR7aW1nLnBhdGh9YCwgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIENvbnRpbnVlIGV2ZW4gaWYgYW4gYXNzZXQgZmFpbHMgdG8gbG9hZDsgZmFsbGJhY2tzIChzb2xpZCBjb2xvcnMpIGFyZSB1c2VkLlxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLm1hcChzb3VuZCA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc291bmQucGF0aCk7XHJcbiAgICAgICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzb3VuZC52b2x1bWU7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5sb29wID0gKHNvdW5kLm5hbWUgPT09ICdiYWNrZ3JvdW5kX211c2ljJyk7IC8vIExvb3AgYmFja2dyb3VuZCBtdXNpY1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5zZXQoc291bmQubmFtZSwgYXVkaW8pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NvdW5kLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGV2ZW4gb24gZXJyb3IgdG8gbm90IGJsb2NrIFByb21pc2UuYWxsXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgQXNzZXRzIGxvYWRlZDogJHt0aGlzLnRleHR1cmVzLnNpemV9IHRleHR1cmVzLCAke3RoaXMuc291bmRzLnNpemV9IHNvdW5kcy5gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYW5kIGRpc3BsYXlzIHRoZSB0aXRsZSBzY3JlZW4gVUkgZHluYW1pY2FsbHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc2V0dXBUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuc3R5bGUsIHtcclxuICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsIC8vIFBvc2l0aW9uIHJlbGF0aXZlIHRvIGJvZHksIHdpbGwgYmUgY2VudGVyZWQgYW5kIHNpemVkIGJ5IGFwcGx5Rml4ZWRBc3BlY3RSYXRpb1xyXG4gICAgICAgICAgICBiYWNrZ3JvdW5kQ29sb3I6ICdyZ2JhKDAsIDAsIDAsIDAuOCknLFxyXG4gICAgICAgICAgICBkaXNwbGF5OiAnZmxleCcsIGZsZXhEaXJlY3Rpb246ICdjb2x1bW4nLFxyXG4gICAgICAgICAgICBqdXN0aWZ5Q29udGVudDogJ2NlbnRlcicsIGFsaWduSXRlbXM6ICdjZW50ZXInLFxyXG4gICAgICAgICAgICBjb2xvcjogJ3doaXRlJywgZm9udEZhbWlseTogJ0FyaWFsLCBzYW5zLXNlcmlmJyxcclxuICAgICAgICAgICAgZm9udFNpemU6ICc0OHB4JywgdGV4dEFsaWduOiAnY2VudGVyJywgekluZGV4OiAnMTAwMCdcclxuICAgICAgICB9KTtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KTtcclxuXHJcbiAgICAgICAgLy8gQ3J1Y2lhbDogQ2FsbCBhcHBseUZpeGVkQXNwZWN0UmF0aW8gaGVyZSB0byBlbnN1cmUgdGhlIHRpdGxlIHNjcmVlbiBvdmVybGF5XHJcbiAgICAgICAgLy8gaXMgc2l6ZWQgYW5kIHBvc2l0aW9uZWQgY29ycmVjdGx5IHJlbGF0aXZlIHRvIHRoZSBjYW52YXMgZnJvbSB0aGUgc3RhcnQuXHJcbiAgICAgICAgdGhpcy5hcHBseUZpeGVkQXNwZWN0UmF0aW8oKTtcclxuXHJcbiAgICAgICAgdGhpcy50aXRsZVRleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLnRpdGxlVGV4dC50ZXh0Q29udGVudCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy50aXRsZVNjcmVlblRleHQ7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuYXBwZW5kQ2hpbGQodGhpcy50aXRsZVRleHQpO1xyXG5cclxuICAgICAgICB0aGlzLnByb21wdFRleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLnByb21wdFRleHQudGV4dENvbnRlbnQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc3RhcnRHYW1lUHJvbXB0O1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5wcm9tcHRUZXh0LnN0eWxlLCB7XHJcbiAgICAgICAgICAgIG1hcmdpblRvcDogJzIwcHgnLCBmb250U2l6ZTogJzI0cHgnXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuYXBwZW5kQ2hpbGQodGhpcy5wcm9tcHRUZXh0KTtcclxuXHJcbiAgICAgICAgLy8gTU9ESUZJRUQ6IEFkZCBldmVudCBsaXN0ZW5lciBkaXJlY3RseSB0byB0aGUgb3ZlcmxheSB0byBjYXB0dXJlIGNsaWNrcyBhbmQgc2hvdyBpbnN0cnVjdGlvbnNcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRoaXMuc2hvd0luc3RydWN0aW9ucygpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogQ3JlYXRlcyBhbmQgZGlzcGxheXMgdGhlIGluc3RydWN0aW9ucyBzY3JlZW4gVUkgZHluYW1pY2FsbHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc2V0dXBJbnN0cnVjdGlvbnNTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy5pbnN0cnVjdGlvbnNPdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLmluc3RydWN0aW9uc092ZXJsYXkuc3R5bGUsIHtcclxuICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXHJcbiAgICAgICAgICAgIGJhY2tncm91bmRDb2xvcjogJ3JnYmEoMCwgMCwgMCwgMC45KScsXHJcbiAgICAgICAgICAgIGRpc3BsYXk6ICdub25lJywgLy8gSW5pdGlhbGx5IGhpZGRlblxyXG4gICAgICAgICAgICBmbGV4RGlyZWN0aW9uOiAnY29sdW1uJyxcclxuICAgICAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLCBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcclxuICAgICAgICAgICAgY29sb3I6ICd3aGl0ZScsIGZvbnRGYW1pbHk6ICdBcmlhbCwgc2Fucy1zZXJpZicsXHJcbiAgICAgICAgICAgIGZvbnRTaXplOiAnMjRweCcsIHRleHRBbGlnbjogJ2NlbnRlcicsIHpJbmRleDogJzEwMDAnLFxyXG4gICAgICAgICAgICBwYWRkaW5nOiAnMjBweCdcclxuICAgICAgICB9KTtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMuaW5zdHJ1Y3Rpb25zT3ZlcmxheSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGluc3RydWN0aW9uc1RpdGxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgaW5zdHJ1Y3Rpb25zVGl0bGUudGV4dENvbnRlbnQgPSAnXHVBQzhDXHVDNzg0IFx1Qzg3MFx1Qzc5MVx1QkM5NSc7XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbihpbnN0cnVjdGlvbnNUaXRsZS5zdHlsZSwge1xyXG4gICAgICAgICAgICBmb250U2l6ZTogJzM2cHgnLFxyXG4gICAgICAgICAgICBtYXJnaW5Cb3R0b206ICczMHB4J1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMuaW5zdHJ1Y3Rpb25zT3ZlcmxheS5hcHBlbmRDaGlsZChpbnN0cnVjdGlvbnNUaXRsZSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGluc3RydWN0aW9uc1RleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICBpbnN0cnVjdGlvbnNUZXh0LmlubmVySFRNTCA9IGBcclxuICAgICAgICAgICAgPHA+PHN0cm9uZz5cdUI5QzhcdUM2QjBcdUMyQTQ8L3N0cm9uZz4gOiBcdUMyRENcdUM4MTAgXHVCQ0MwXHVBQ0JEIChcdUNFNzRcdUJBNTRcdUI3N0MgXHVDNzc0XHVCM0Q5KTwvcD5cclxuICAgICAgICAgICAgPHA+PHN0cm9uZz5TIChcdUM1NUVcdUM3M0NcdUI4NUMpPC9zdHJvbmc+IDogXHVDNTVFXHVDNzNDXHVCODVDIFx1Qzc3NFx1QjNEOTwvcD5cclxuICAgICAgICAgICAgPHA+PHN0cm9uZz5XIChcdUI0QTRcdUI4NUMpPC9zdHJvbmc+IDogXHVCNEE0XHVCODVDIFx1Qzc3NFx1QjNEOTwvcD5cclxuICAgICAgICAgICAgPHA+PHN0cm9uZz5BIChcdUM2N0NcdUNBQkQpPC9zdHJvbmc+IDogXHVDNjdDXHVDQUJEXHVDNzNDXHVCODVDIFx1Qzc3NFx1QjNEOTwvcD5cclxuICAgICAgICAgICAgPHA+PHN0cm9uZz5EIChcdUM2MjRcdUI5NzhcdUNBQkQpPC9zdHJvbmc+IDogXHVDNjI0XHVCOTc4XHVDQUJEXHVDNzNDXHVCODVDIFx1Qzc3NFx1QjNEOTwvcD5cclxuICAgICAgICAgICAgPHA+PHN0cm9uZz5cdUMyQTRcdUQzOThcdUM3NzRcdUMyQTRcdUJDMTQ8L3N0cm9uZz4gOiBcdUM4MTBcdUQ1MDQ8L3A+XHJcbiAgICAgICAgICAgIDxwPjxzdHJvbmc+XHVCOUM4XHVDNkIwXHVDMkE0IFx1QzY3Q1x1Q0FCRCBcdUQwNzRcdUI5QUQ8L3N0cm9uZz4gOiBcdUNEMUQgXHVCQzFDXHVDMEFDPC9wPlxyXG4gICAgICAgICAgICA8cCBzdHlsZT1cIm1hcmdpbi10b3A6IDMwcHg7XCI+XHVENjU0XHVCQTc0XHVDNzQ0IFx1QjJFNFx1QzJEQyBcdUQwNzRcdUI5QURcdUQ1NThcdUM1RUMgXHVBQzhDXHVDNzg0XHVDNzQ0IFx1QzJEQ1x1Qzc5MVx1RDU1OFx1QzEzOFx1QzY5NCE8L3A+XHJcbiAgICAgICAgYDtcclxuICAgICAgICBPYmplY3QuYXNzaWduKGluc3RydWN0aW9uc1RleHQuc3R5bGUsIHtcclxuICAgICAgICAgICAgbGluZUhlaWdodDogJzEuNicsXHJcbiAgICAgICAgICAgIG1heFdpZHRoOiAnNjAwcHgnLFxyXG4gICAgICAgICAgICBtYXJnaW46ICcwIGF1dG8gMzBweCBhdXRvJ1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMuaW5zdHJ1Y3Rpb25zT3ZlcmxheS5hcHBlbmRDaGlsZChpbnN0cnVjdGlvbnNUZXh0KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnN0cnVjdGlvbnNPdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5zdGFydFBsYXlpbmdHYW1lKCkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBDcmVhdGVzIGFuZCBkaXNwbGF5cyB0aGUgZ2FtZSBzY29yZSBVSSBhbmQgY3Jvc3NoYWlyLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNldHVwR2FtZVVJKCkge1xyXG4gICAgICAgIHRoaXMuc2NvcmVUZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnNjb3JlVGV4dC5zdHlsZSwge1xyXG4gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcclxuICAgICAgICAgICAgdG9wOiAnMTBweCcsXHJcbiAgICAgICAgICAgIGxlZnQ6ICcxMHB4JyxcclxuICAgICAgICAgICAgY29sb3I6ICd3aGl0ZScsXHJcbiAgICAgICAgICAgIGZvbnRGYW1pbHk6ICdBcmlhbCwgc2Fucy1zZXJpZicsXHJcbiAgICAgICAgICAgIGZvbnRTaXplOiAnMjRweCcsXHJcbiAgICAgICAgICAgIHpJbmRleDogJzEwMDEnIC8vIEFib3ZlIHRpdGxlIHNjcmVlbiBvdmVybGF5IGJ1dCBzZXBhcmF0ZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMuc2NvcmVUZXh0LnRleHRDb250ZW50ID0gYFNjb3JlOiAke3RoaXMuc2NvcmV9YDtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMuc2NvcmVUZXh0KTtcclxuXHJcbiAgICAgICAgLy8gTkVXOiBDcmVhdGUgYW5kIHNldHVwIGNyb3NzaGFpclxyXG4gICAgICAgIHRoaXMuY3Jvc3NoYWlyRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5jcm9zc2hhaXJFbGVtZW50LnN0eWxlLCB7XHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxyXG4gICAgICAgICAgICB3aWR0aDogJzJweCcsICAvLyBDZW50cmFsIGRvdCBzaXplXHJcbiAgICAgICAgICAgIGhlaWdodDogJzJweCcsXHJcbiAgICAgICAgICAgIGJhY2tncm91bmRDb2xvcjogJ3doaXRlJywgLy8gQ2VudHJhbCB3aGl0ZSBkb3RcclxuICAgICAgICAgICAgLy8gVXNlIGJveC1zaGFkb3dzIGZvciBvdXRsaW5lcyBhbmQgcG90ZW50aWFsIGNyb3NzLWxpa2UgYXBwZWFyYW5jZVxyXG4gICAgICAgICAgICBib3hTaGFkb3c6ICcwIDAgMCAxcHggd2hpdGUsIDAgMCAwIDNweCByZ2JhKDAsMCwwLDAuOCksIDAgMCAwIDRweCB3aGl0ZScsXHJcbiAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzUwJScsIC8vIE1ha2UgaXQgY2lyY3VsYXJcclxuICAgICAgICAgICAgdG9wOiAnNTAlJyxcclxuICAgICAgICAgICAgbGVmdDogJzUwJScsXHJcbiAgICAgICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLCAtNTAlKScsXHJcbiAgICAgICAgICAgIHpJbmRleDogJzEwMDInLCAvLyBBYm92ZSB0aXRsZSBzY3JlZW4gYW5kIHNjb3JlXHJcbiAgICAgICAgICAgIGRpc3BsYXk6ICdub25lJyAvLyBJbml0aWFsbHkgaGlkZGVuXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLmNyb3NzaGFpckVsZW1lbnQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBVcGRhdGVzIHRoZSBzY29yZSBkaXNwbGF5IG9uIHRoZSBVSS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVTY29yZURpc3BsYXkoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc2NvcmVUZXh0KSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2NvcmVUZXh0LnRleHRDb250ZW50ID0gYFNjb3JlOiAke3RoaXMuc2NvcmV9YDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUcmFuc2l0aW9ucyB0aGUgZ2FtZSBmcm9tIHRoZSB0aXRsZSBzY3JlZW4gdG8gdGhlIGluc3RydWN0aW9ucyBzdGF0ZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzaG93SW5zdHJ1Y3Rpb25zKCkge1xyXG4gICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TO1xyXG4gICAgICAgIC8vIFJlbW92ZSB0aGUgdGl0bGUgc2NyZWVuIG92ZXJsYXlcclxuICAgICAgICBpZiAodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkgJiYgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkucGFyZW50Tm9kZSkge1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gU2hvdyB0aGUgaW5zdHJ1Y3Rpb25zIG92ZXJsYXlcclxuICAgICAgICBpZiAodGhpcy5pbnN0cnVjdGlvbnNPdmVybGF5KSB7XHJcbiAgICAgICAgICAgIHRoaXMuaW5zdHJ1Y3Rpb25zT3ZlcmxheS5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xyXG4gICAgICAgICAgICB0aGlzLmFwcGx5Rml4ZWRBc3BlY3RSYXRpbygpOyAvLyBSZWFwcGx5IHRvIHNpemUgaXQgY29ycmVjdGx5XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVHJhbnNpdGlvbnMgdGhlIGdhbWUgZnJvbSB0aGUgaW5zdHJ1Y3Rpb25zIHNjcmVlbiB0byB0aGUgcGxheWluZyBzdGF0ZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGFydFBsYXlpbmdHYW1lKCkge1xyXG4gICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICAvLyBSZW1vdmUgdGhlIGluc3RydWN0aW9ucyBzY3JlZW4gb3ZlcmxheVxyXG4gICAgICAgIGlmICh0aGlzLmluc3RydWN0aW9uc092ZXJsYXkgJiYgdGhpcy5pbnN0cnVjdGlvbnNPdmVybGF5LnBhcmVudE5vZGUpIHtcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZCh0aGlzLmluc3RydWN0aW9uc092ZXJsYXkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBBZGQgZXZlbnQgbGlzdGVuZXIgdG8gY2FudmFzIGZvciByZS1sb2NraW5nIHBvaW50ZXIgYWZ0ZXIgdGl0bGUgc2NyZWVuIGlzIGdvbmVcclxuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuaGFuZGxlQ2FudmFzUmVMb2NrUG9pbnRlci5iaW5kKHRoaXMpKTtcclxuXHJcbiAgICAgICAgLy8gUmVxdWVzdCBwb2ludGVyIGxvY2sgZm9yIGltbWVyc2l2ZSBtb3VzZSBjb250cm9sXHJcbiAgICAgICAgdGhpcy5jYW52YXMucmVxdWVzdFBvaW50ZXJMb2NrKCk7XHJcbiAgICAgICAgLy8gRW5zdXJlIGJhY2tncm91bmQgbXVzaWMgcGxheXMgbm93IHRoYXQgYSB1c2VyIGdlc3R1cmUgaGFzIG9jY3VycmVkXHJcbiAgICAgICAgdGhpcy5zb3VuZHMuZ2V0KCdiYWNrZ3JvdW5kX211c2ljJyk/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiQkdNIHBsYXkgZmFpbGVkIGFmdGVyIHVzZXIgZ2VzdHVyZTpcIiwgZSkpO1xyXG5cclxuICAgICAgICAvLyBORVc6IFNob3cgY3Jvc3NoYWlyIHdoZW4gZ2FtZSBzdGFydHNcclxuICAgICAgICBpZiAodGhpcy5jcm9zc2hhaXJFbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3Jvc3NoYWlyRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGVzIGNsaWNrcyBvbiB0aGUgY2FudmFzIHRvIHJlLWxvY2sgdGhlIHBvaW50ZXIgaWYgdGhlIGdhbWUgaXMgcGxheWluZyBhbmQgdW5sb2NrZWQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlQ2FudmFzUmVMb2NrUG9pbnRlcigpIHtcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgIXRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLnJlcXVlc3RQb2ludGVyTG9jaygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgdGhlIHBsYXllcidzIHZpc3VhbCBtZXNoIGFuZCBwaHlzaWNzIGJvZHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY3JlYXRlUGxheWVyKCkge1xyXG4gICAgICAgIC8vIFBsYXllciB2aXN1YWwgbWVzaCAoYSBzaW1wbGUgYm94KVxyXG4gICAgICAgIGNvbnN0IHBsYXllclRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgncGxheWVyX3RleHR1cmUnKTtcclxuICAgICAgICBjb25zdCBwbGF5ZXJNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgbWFwOiBwbGF5ZXJUZXh0dXJlLFxyXG4gICAgICAgICAgICBjb2xvcjogcGxheWVyVGV4dHVyZSA/IDB4ZmZmZmZmIDogMHgwMDc3ZmYgLy8gVXNlIHdoaXRlIHdpdGggdGV4dHVyZSwgb3IgYmx1ZSBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgcGxheWVyR2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMSwgMiwgMSk7IC8vIFBsYXllciBkaW1lbnNpb25zXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoID0gbmV3IFRIUkVFLk1lc2gocGxheWVyR2VvbWV0cnksIHBsYXllck1hdGVyaWFsKTtcclxuICAgICAgICB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueSA9IDU7IC8vIFN0YXJ0IHBsYXllciBzbGlnaHRseSBhYm92ZSB0aGUgZ3JvdW5kXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLmNhc3RTaGFkb3cgPSB0cnVlOyAvLyBQbGF5ZXIgY2FzdHMgYSBzaGFkb3dcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLnBsYXllck1lc2gpO1xyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgcGh5c2ljcyBib2R5IChDYW5ub24uanMgYm94IHNoYXBlKVxyXG4gICAgICAgIGNvbnN0IHBsYXllclNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKDAuNSwgMSwgMC41KSk7IC8vIEhhbGYgZXh0ZW50cyBvZiB0aGUgYm94IGZvciBjb2xsaXNpb25cclxuICAgICAgICB0aGlzLnBsYXllckJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyTWFzcywgLy8gUGxheWVyJ3MgbWFzc1xyXG4gICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi54LCB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueSwgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLnopLFxyXG4gICAgICAgICAgICBzaGFwZTogcGxheWVyU2hhcGUsXHJcbiAgICAgICAgICAgIGZpeGVkUm90YXRpb246IHRydWUsIC8vIFByZXZlbnQgdGhlIHBsYXllciBmcm9tIGZhbGxpbmcgb3ZlciAoc2ltdWxhdGVzIGEgY2Fwc3VsZS9jeWxpbmRlciBjaGFyYWN0ZXIpXHJcbiAgICAgICAgICAgIG1hdGVyaWFsOiB0aGlzLnBsYXllck1hdGVyaWFsIC8vIEFzc2lnbiB0aGUgcGxheWVyIG1hdGVyaWFsIGZvciBjb250YWN0IHJlc29sdXRpb25cclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkodGhpcy5wbGF5ZXJCb2R5KTtcclxuXHJcbiAgICAgICAgLy8gU2V0IGluaXRpYWwgY2FtZXJhQ29udGFpbmVyIHBvc2l0aW9uIHRvIHBsYXllcidzIHBoeXNpY3MgYm9keSBwb3NpdGlvbi5cclxuICAgICAgICAvLyBUaGUgY2FtZXJhIGl0c2VsZiBpcyBhIGNoaWxkIG9mIGNhbWVyYUNvbnRhaW5lciBhbmQgaGFzIGl0cyBvd24gbG9jYWwgWSBvZmZzZXQuXHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIucG9zaXRpb24uY29weSh0aGlzLnBsYXllckJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgdGhlIGdyb3VuZCdzIHZpc3VhbCBtZXNoIGFuZCBwaHlzaWNzIGJvZHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY3JlYXRlR3JvdW5kKCkge1xyXG4gICAgICAgIC8vIEdyb3VuZCB2aXN1YWwgbWVzaCAoYSBsYXJnZSBwbGFuZSlcclxuICAgICAgICBjb25zdCBncm91bmRUZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQoJ2dyb3VuZF90ZXh0dXJlJyk7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogZ3JvdW5kVGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3I6IGdyb3VuZFRleHR1cmUgPyAweGZmZmZmZiA6IDB4ODg4ODg4IC8vIFVzZSB3aGl0ZSB3aXRoIHRleHR1cmUsIG9yIGdyZXkgaWYgbm8gdGV4dHVyZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZEdlb21ldHJ5ID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplKTtcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2ggPSBuZXcgVEhSRUUuTWVzaChncm91bmRHZW9tZXRyeSwgZ3JvdW5kTWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWVzaC5yb3RhdGlvbi54ID0gLU1hdGguUEkgLyAyOyAvLyBSb3RhdGUgdG8gbGF5IGZsYXQgb24gdGhlIFhaIHBsYW5lXHJcbiAgICAgICAgdGhpcy5ncm91bmRNZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlOyAvLyBHcm91bmQgcmVjZWl2ZXMgc2hhZG93c1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMuZ3JvdW5kTWVzaCk7XHJcblxyXG4gICAgICAgIC8vIEdyb3VuZCBwaHlzaWNzIGJvZHkgKENhbm5vbi5qcyBwbGFuZSBzaGFwZSlcclxuICAgICAgICBjb25zdCBncm91bmRTaGFwZSA9IG5ldyBDQU5OT04uUGxhbmUoKTtcclxuICAgICAgICB0aGlzLmdyb3VuZEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiAwLCAvLyBBIG1hc3Mgb2YgMCBtYWtlcyBpdCBhIHN0YXRpYyAoaW1tb3ZhYmxlKSBib2R5XHJcbiAgICAgICAgICAgIHNoYXBlOiBncm91bmRTaGFwZSxcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMuZ3JvdW5kTWF0ZXJpYWwgLy8gQXNzaWduIHRoZSBncm91bmQgbWF0ZXJpYWwgZm9yIGNvbnRhY3QgcmVzb2x1dGlvblxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIC8vIFJvdGF0ZSB0aGUgQ2Fubm9uLmpzIHBsYW5lIGJvZHkgdG8gbWF0Y2ggdGhlIFRocmVlLmpzIHBsYW5lIG9yaWVudGF0aW9uIChmbGF0KVxyXG4gICAgICAgIHRoaXMuZ3JvdW5kQm9keS5xdWF0ZXJuaW9uLnNldEZyb21BeGlzQW5nbGUobmV3IENBTk5PTi5WZWMzKDEsIDAsIDApLCAtTWF0aC5QSSAvIDIpO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLmdyb3VuZEJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBDcmVhdGVzIHZpc3VhbCBtZXNoZXMgYW5kIHBoeXNpY3MgYm9kaWVzIGZvciBhbGwgc3RhdGljIG9iamVjdHMgKGJveGVzKSBkZWZpbmVkIGluIGNvbmZpZy5nYW1lU2V0dGluZ3Muc3RhdGljT2JqZWN0cy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVTdGF0aWNPYmplY3RzKCkgeyAvLyBSZW5hbWVkIGZyb20gY3JlYXRlUGxhY2VkT2JqZWN0c1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnN0YXRpY09iamVjdHMpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiTm8gc3RhdGljT2JqZWN0cyBkZWZpbmVkIGluIGdhbWVTZXR0aW5ncy5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5zdGF0aWNPYmplY3RzLmZvckVhY2gob2JqQ29uZmlnID0+IHtcclxuICAgICAgICAgICAgY29uc3QgdGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KG9iakNvbmZpZy50ZXh0dXJlTmFtZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IG1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICAgICAgbWFwOiB0ZXh0dXJlLFxyXG4gICAgICAgICAgICAgICAgY29sb3I6IHRleHR1cmUgPyAweGZmZmZmZiA6IDB4YWFhYWFhIC8vIERlZmF1bHQgZ3JleSBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gQ3JlYXRlIFRocmVlLmpzIE1lc2hcclxuICAgICAgICAgICAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkob2JqQ29uZmlnLmRpbWVuc2lvbnMud2lkdGgsIG9iakNvbmZpZy5kaW1lbnNpb25zLmhlaWdodCwgb2JqQ29uZmlnLmRpbWVuc2lvbnMuZGVwdGgpO1xyXG4gICAgICAgICAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcclxuICAgICAgICAgICAgbWVzaC5wb3NpdGlvbi5zZXQob2JqQ29uZmlnLnBvc2l0aW9uLngsIG9iakNvbmZpZy5wb3NpdGlvbi55LCBvYmpDb25maWcucG9zaXRpb24ueik7XHJcbiAgICAgICAgICAgIGlmIChvYmpDb25maWcucm90YXRpb25ZICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIG1lc2gucm90YXRpb24ueSA9IG9iakNvbmZpZy5yb3RhdGlvblk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICAgICAgbWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQobWVzaCk7XHJcbiAgICAgICAgICAgIHRoaXMucGxhY2VkT2JqZWN0TWVzaGVzLnB1c2gobWVzaCk7XHJcblxyXG4gICAgICAgICAgICAvLyBDcmVhdGUgQ2Fubm9uLmpzIEJvZHlcclxuICAgICAgICAgICAgLy8gQ2Fubm9uLkJveCB0YWtlcyBoYWxmIGV4dGVudHNcclxuICAgICAgICAgICAgY29uc3Qgc2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoXHJcbiAgICAgICAgICAgICAgICBvYmpDb25maWcuZGltZW5zaW9ucy53aWR0aCAvIDIsXHJcbiAgICAgICAgICAgICAgICBvYmpDb25maWcuZGltZW5zaW9ucy5oZWlnaHQgLyAyLFxyXG4gICAgICAgICAgICAgICAgb2JqQ29uZmlnLmRpbWVuc2lvbnMuZGVwdGggLyAyXHJcbiAgICAgICAgICAgICkpO1xyXG4gICAgICAgICAgICBjb25zdCBib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgICAgIG1hc3M6IG9iakNvbmZpZy5tYXNzLCAvLyBVc2UgMCBmb3Igc3RhdGljIG9iamVjdHNcclxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMob2JqQ29uZmlnLnBvc2l0aW9uLngsIG9iakNvbmZpZy5wb3NpdGlvbi55LCBvYmpDb25maWcucG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgICAgICBzaGFwZTogc2hhcGUsXHJcbiAgICAgICAgICAgICAgICBtYXRlcmlhbDogdGhpcy5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwgLy8gQXNzaWduIHRoZSBkZWZhdWx0IG9iamVjdCBtYXRlcmlhbFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgaWYgKG9iakNvbmZpZy5yb3RhdGlvblkgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgYm9keS5xdWF0ZXJuaW9uLnNldEZyb21BeGlzQW5nbGUobmV3IENBTk5PTi5WZWMzKDAsIDEsIDApLCBvYmpDb25maWcucm90YXRpb25ZKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkoYm9keSk7XHJcbiAgICAgICAgICAgIHRoaXMucGxhY2VkT2JqZWN0Qm9kaWVzLnB1c2goYm9keSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYENyZWF0ZWQgJHt0aGlzLnBsYWNlZE9iamVjdE1lc2hlcy5sZW5ndGh9IHN0YXRpYyBvYmplY3RzLmApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBDcmVhdGVzIHZpc3VhbCBtZXNoZXMgYW5kIHBoeXNpY3MgYm9kaWVzIGZvciBhbGwgZW5lbXkgaW5zdGFuY2VzIGRlZmluZWQgaW4gY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteUluc3RhbmNlcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVFbmVtaWVzKCkge1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15SW5zdGFuY2VzIHx8ICF0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZW5lbXlUeXBlcykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJObyBlbmVteUluc3RhbmNlcyBvciBlbmVteVR5cGVzIGRlZmluZWQgaW4gZ2FtZVNldHRpbmdzLlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZW5lbXlUeXBlTWFwID0gbmV3IE1hcDxzdHJpbmcsIEVuZW15VHlwZUNvbmZpZz4oKTtcclxuICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZW5lbXlUeXBlcy5mb3JFYWNoKHR5cGUgPT4gZW5lbXlUeXBlTWFwLnNldCh0eXBlLm5hbWUsIHR5cGUpKTtcclxuXHJcbiAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15SW5zdGFuY2VzLmZvckVhY2goaW5zdGFuY2VDb25maWcgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB0eXBlQ29uZmlnID0gZW5lbXlUeXBlTWFwLmdldChpbnN0YW5jZUNvbmZpZy5lbmVteVR5cGVOYW1lKTtcclxuICAgICAgICAgICAgaWYgKCF0eXBlQ29uZmlnKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFbmVteSB0eXBlICcke2luc3RhbmNlQ29uZmlnLmVuZW15VHlwZU5hbWV9JyBub3QgZm91bmQgZm9yIGluc3RhbmNlICcke2luc3RhbmNlQ29uZmlnLm5hbWV9Jy4gU2tpcHBpbmcuYCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCh0eXBlQ29uZmlnLnRleHR1cmVOYW1lKTtcclxuICAgICAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgICAgICBtYXA6IHRleHR1cmUsXHJcbiAgICAgICAgICAgICAgICBjb2xvcjogdGV4dHVyZSA/IDB4ZmZmZmZmIDogMHhmZjAwMDAgLy8gRGVmYXVsdCByZWQgaWYgbm8gdGV4dHVyZVxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8vIENyZWF0ZSBUaHJlZS5qcyBNZXNoXHJcbiAgICAgICAgICAgIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KHR5cGVDb25maWcuZGltZW5zaW9ucy53aWR0aCwgdHlwZUNvbmZpZy5kaW1lbnNpb25zLmhlaWdodCwgdHlwZUNvbmZpZy5kaW1lbnNpb25zLmRlcHRoKTtcclxuICAgICAgICAgICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCBtYXRlcmlhbCk7XHJcbiAgICAgICAgICAgIG1lc2gucG9zaXRpb24uc2V0KGluc3RhbmNlQ29uZmlnLnBvc2l0aW9uLngsIGluc3RhbmNlQ29uZmlnLnBvc2l0aW9uLnksIGluc3RhbmNlQ29uZmlnLnBvc2l0aW9uLnopO1xyXG4gICAgICAgICAgICBpZiAoaW5zdGFuY2VDb25maWcucm90YXRpb25ZICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIG1lc2gucm90YXRpb24ueSA9IGluc3RhbmNlQ29uZmlnLnJvdGF0aW9uWTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICBtZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZChtZXNoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIENyZWF0ZSBDYW5ub24uanMgQm9keVxyXG4gICAgICAgICAgICBjb25zdCBzaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhcclxuICAgICAgICAgICAgICAgIHR5cGVDb25maWcuZGltZW5zaW9ucy53aWR0aCAvIDIsXHJcbiAgICAgICAgICAgICAgICB0eXBlQ29uZmlnLmRpbWVuc2lvbnMuaGVpZ2h0IC8gMixcclxuICAgICAgICAgICAgICAgIHR5cGVDb25maWcuZGltZW5zaW9ucy5kZXB0aCAvIDJcclxuICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICAgICAgbWFzczogdHlwZUNvbmZpZy5tYXNzLFxyXG4gICAgICAgICAgICAgICAgcG9zaXRpb246IG5ldyBDQU5OT04uVmVjMyhpbnN0YW5jZUNvbmZpZy5wb3NpdGlvbi54LCBpbnN0YW5jZUNvbmZpZy5wb3NpdGlvbi55LCBpbnN0YW5jZUNvbmZpZy5wb3NpdGlvbi56KSxcclxuICAgICAgICAgICAgICAgIHNoYXBlOiBzaGFwZSxcclxuICAgICAgICAgICAgICAgIG1hdGVyaWFsOiB0aGlzLmVuZW15TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgICAgICBmaXhlZFJvdGF0aW9uOiB0cnVlIC8vIFByZXZlbnQgZW5lbWllcyBmcm9tIHR1bWJsaW5nXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBpZiAoaW5zdGFuY2VDb25maWcucm90YXRpb25ZICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIGJvZHkucXVhdGVybmlvbi5zZXRGcm9tQXhpc0FuZ2xlKG5ldyBDQU5OT04uVmVjMygwLCAxLCAwKSwgaW5zdGFuY2VDb25maWcucm90YXRpb25ZKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkoYm9keSk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBhY3RpdmVFbmVteTogQWN0aXZlRW5lbXkgPSB7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiBpbnN0YW5jZUNvbmZpZy5uYW1lLFxyXG4gICAgICAgICAgICAgICAgbWVzaDogbWVzaCxcclxuICAgICAgICAgICAgICAgIGJvZHk6IGJvZHksXHJcbiAgICAgICAgICAgICAgICB0eXBlQ29uZmlnOiB0eXBlQ29uZmlnLFxyXG4gICAgICAgICAgICAgICAgY3VycmVudEhlYWx0aDogdHlwZUNvbmZpZy5oZWFsdGgsXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGJvZHkudXNlckRhdGEgPSBhY3RpdmVFbmVteTsgLy8gQXR0YWNoIGFjdGl2ZUVuZW15IHRvIGJvZHkgZm9yIGNvbGxpc2lvbiBsb29rdXBcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllcy5wdXNoKGFjdGl2ZUVuZW15KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgQ3JlYXRlZCAke3RoaXMuZW5lbWllcy5sZW5ndGh9IGVuZW1pZXMuYCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHVwIGFtYmllbnQgYW5kIGRpcmVjdGlvbmFsIGxpZ2h0aW5nIGluIHRoZSBzY2VuZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzZXR1cExpZ2h0aW5nKCkge1xyXG4gICAgICAgIGNvbnN0IGFtYmllbnRMaWdodCA9IG5ldyBUSFJFRS5BbWJpZW50TGlnaHQoMHg0MDQwNDAsIDEuMCk7IC8vIFNvZnQgd2hpdGUgYW1iaWVudCBsaWdodFxyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGFtYmllbnRMaWdodCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGRpcmVjdGlvbmFsTGlnaHQgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCgweGZmZmZmZiwgMC44KTsgLy8gQnJpZ2h0ZXIgZGlyZWN0aW9uYWwgbGlnaHRcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnBvc2l0aW9uLnNldCg1LCAxMCwgNSk7IC8vIFBvc2l0aW9uIHRoZSBsaWdodCBzb3VyY2VcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LmNhc3RTaGFkb3cgPSB0cnVlOyAvLyBFbmFibGUgc2hhZG93cyBmcm9tIHRoaXMgbGlnaHQgc291cmNlXHJcbiAgICAgICAgLy8gQ29uZmlndXJlIHNoYWRvdyBwcm9wZXJ0aWVzIGZvciB0aGUgZGlyZWN0aW9uYWwgbGlnaHRcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5tYXBTaXplLndpZHRoID0gMTAyNDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5tYXBTaXplLmhlaWdodCA9IDEwMjQ7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLm5lYXIgPSAwLjU7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmZhciA9IDUwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5sZWZ0ID0gLTEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5yaWdodCA9IDEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS50b3AgPSAxMDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEuYm90dG9tID0gLTEwO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGRpcmVjdGlvbmFsTGlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyB3aW5kb3cgcmVzaXppbmcgdG8ga2VlcCB0aGUgY2FtZXJhIGFzcGVjdCByYXRpbyBhbmQgcmVuZGVyZXIgc2l6ZSBjb3JyZWN0LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uV2luZG93UmVzaXplKCkge1xyXG4gICAgICAgIHRoaXMuYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCk7IC8vIEFwcGx5IHRoZSBmaXhlZCBhc3BlY3QgcmF0aW8gYW5kIGNlbnRlciB0aGUgY2FudmFzXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBcHBsaWVzIHRoZSBjb25maWd1cmVkIGZpeGVkIGFzcGVjdCByYXRpbyB0byB0aGUgcmVuZGVyZXIgYW5kIGNhbWVyYSxcclxuICAgICAqIHJlc2l6aW5nIGFuZCBjZW50ZXJpbmcgdGhlIGNhbnZhcyB0byBmaXQgd2l0aGluIHRoZSB3aW5kb3cuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCkge1xyXG4gICAgICAgIGNvbnN0IHRhcmdldEFzcGVjdFJhdGlvID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZpeGVkQXNwZWN0UmF0aW8ud2lkdGggLyB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby5oZWlnaHQ7XHJcblxyXG4gICAgICAgIGxldCBuZXdXaWR0aDogbnVtYmVyO1xyXG4gICAgICAgIGxldCBuZXdIZWlnaHQ6IG51bWJlcjtcclxuXHJcbiAgICAgICAgY29uc3Qgd2luZG93V2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aDtcclxuICAgICAgICBjb25zdCB3aW5kb3dIZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQ7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFdpbmRvd0FzcGVjdFJhdGlvID0gd2luZG93V2lkdGggLyB3aW5kb3dIZWlnaHQ7XHJcblxyXG4gICAgICAgIGlmIChjdXJyZW50V2luZG93QXNwZWN0UmF0aW8gPiB0YXJnZXRBc3BlY3RSYXRpbykge1xyXG4gICAgICAgICAgICAvLyBXaW5kb3cgaXMgd2lkZXIgdGhhbiB0YXJnZXQgYXNwZWN0IHJhdGlvLCBoZWlnaHQgaXMgdGhlIGxpbWl0aW5nIGZhY3RvclxyXG4gICAgICAgICAgICBuZXdIZWlnaHQgPSB3aW5kb3dIZWlnaHQ7XHJcbiAgICAgICAgICAgIG5ld1dpZHRoID0gbmV3SGVpZ2h0ICogdGFyZ2V0QXNwZWN0UmF0aW87XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gV2luZG93IGlzIHRhbGxlciAob3IgZXhhY3RseSkgdGhlIHRhcmdldCBhc3BlY3QgcmF0aW8sIHdpZHRoIGlzIHRoZSBsaW1pdGluZyBmYWN0b3JcclxuICAgICAgICAgICAgbmV3V2lkdGggPSB3aW5kb3dXaWR0aDtcclxuICAgICAgICAgICAgbmV3SGVpZ2h0ID0gbmV3V2lkdGggLyB0YXJnZXRBc3BlY3RSYXRpbztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNldCByZW5kZXJlciBzaXplLiBUaGUgdGhpcmQgYXJndW1lbnQgYHVwZGF0ZVN0eWxlYCBpcyBmYWxzZSBiZWNhdXNlIHdlIG1hbmFnZSBzdHlsZSBtYW51YWxseS5cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUobmV3V2lkdGgsIG5ld0hlaWdodCwgZmFsc2UpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmFzcGVjdCA9IHRhcmdldEFzcGVjdFJhdGlvO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuXHJcbiAgICAgICAgLy8gUG9zaXRpb24gYW5kIHNpemUgdGhlIGNhbnZhcyBlbGVtZW50IHVzaW5nIENTU1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5jYW52YXMuc3R5bGUsIHtcclxuICAgICAgICAgICAgd2lkdGg6IGAke25ld1dpZHRofXB4YCxcclxuICAgICAgICAgICAgaGVpZ2h0OiBgJHtuZXdIZWlnaHR9cHhgLFxyXG4gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcclxuICAgICAgICAgICAgdG9wOiAnNTAlJyxcclxuICAgICAgICAgICAgbGVmdDogJzUwJScsXHJcbiAgICAgICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLCAtNTAlKScsXHJcbiAgICAgICAgICAgIG9iamVjdEZpdDogJ2NvbnRhaW4nIC8vIEVuc3VyZXMgY29udGVudCBpcyBzY2FsZWQgYXBwcm9wcmlhdGVseSBpZiB0aGVyZSdzIGFueSBtaXNtYXRjaFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGUgdGl0bGUgc2NyZWVuIGlzIGFjdGl2ZSwgdXBkYXRlIGl0cyBzaXplIGFuZCBwb3NpdGlvbiBhcyB3ZWxsIHRvIG1hdGNoIHRoZSBjYW52YXNcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFICYmIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KSB7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuc3R5bGUsIHtcclxuICAgICAgICAgICAgICAgIHdpZHRoOiBgJHtuZXdXaWR0aH1weGAsXHJcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGAke25ld0hlaWdodH1weGAsXHJcbiAgICAgICAgICAgICAgICB0b3A6ICc1MCUnLFxyXG4gICAgICAgICAgICAgICAgbGVmdDogJzUwJScsXHJcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknLFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5JTlNUUlVDVElPTlMgJiYgdGhpcy5pbnN0cnVjdGlvbnNPdmVybGF5KSB7IC8vIE5FVzogSGFuZGxlIGluc3RydWN0aW9ucyBvdmVybGF5XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5pbnN0cnVjdGlvbnNPdmVybGF5LnN0eWxlLCB7XHJcbiAgICAgICAgICAgICAgICB3aWR0aDogYCR7bmV3V2lkdGh9cHhgLFxyXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBgJHtuZXdIZWlnaHR9cHhgLFxyXG4gICAgICAgICAgICAgICAgdG9wOiAnNTAlJyxcclxuICAgICAgICAgICAgICAgIGxlZnQ6ICc1MCUnLFxyXG4gICAgICAgICAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsIC01MCUpJyxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFRoZSBjcm9zc2hhaXIgYW5kIHNjb3JlIHRleHQgd2lsbCBhdXRvbWF0aWNhbGx5IHJlLWNlbnRlciBkdWUgdG8gdGhlaXIgJ2Fic29sdXRlJyBwb3NpdGlvbmluZ1xyXG4gICAgICAgIC8vIGFuZCAndHJhbnNsYXRlKC01MCUsIC01MCUpJyByZWxhdGl2ZSB0byB0aGUgY2FudmFzJ3MgbmV3IHBvc2l0aW9uLlxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVjb3JkcyB3aGljaCBrZXlzIGFyZSBjdXJyZW50bHkgcHJlc3NlZCBkb3duLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAgICAgIHRoaXMua2V5c1tldmVudC5rZXkudG9Mb3dlckNhc2UoKV0gPSB0cnVlO1xyXG4gICAgICAgIC8vIEFEREVEOiBIYW5kbGUganVtcCBpbnB1dCBvbmx5IHdoZW4gcGxheWluZyBhbmQgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgaWYgKGV2ZW50LmtleS50b0xvd2VyQ2FzZSgpID09PSAnICcpIHsgLy8gU3BhY2ViYXJcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVySnVtcCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVjb3JkcyB3aGljaCBrZXlzIGFyZSBjdXJyZW50bHkgcmVsZWFzZWQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25LZXlVcChldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAgICAgIHRoaXMua2V5c1tldmVudC5rZXkudG9Mb3dlckNhc2UoKV0gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgbW91c2UgbW92ZW1lbnQgZm9yIGNhbWVyYSByb3RhdGlvbiAobW91c2UgbG9vaykuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25Nb3VzZU1vdmUoZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgICAgICAvLyBPbmx5IHByb2Nlc3MgbW91c2UgbW92ZW1lbnQgaWYgdGhlIGdhbWUgaXMgcGxheWluZyBhbmQgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgY29uc3QgbW92ZW1lbnRYID0gZXZlbnQubW92ZW1lbnRYIHx8IDA7XHJcbiAgICAgICAgICAgIGNvbnN0IG1vdmVtZW50WSA9IGV2ZW50Lm1vdmVtZW50WSB8fCAwO1xyXG5cclxuICAgICAgICAgICAgLy8gQXBwbHkgaG9yaXpvbnRhbCByb3RhdGlvbiAoeWF3KSB0byB0aGUgY2FtZXJhQ29udGFpbmVyIGFyb3VuZCBpdHMgbG9jYWwgWS1heGlzICh3aGljaCBpcyBnbG9iYWwgWSlcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIucm90YXRpb24ueSAtPSBtb3ZlbWVudFggKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubW91c2VTZW5zaXRpdml0eTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFwcGx5IHZlcnRpY2FsIHJvdGF0aW9uIChwaXRjaCkgdG8gdGhlIGNhbWVyYSBpdHNlbGYgYW5kIGNsYW1wIGl0XHJcbiAgICAgICAgICAgIC8vIE1vdXNlIFVQIChtb3ZlbWVudFkgPCAwKSBub3cgaW5jcmVhc2VzIGNhbWVyYVBpdGNoIC0+IGxvb2tzIHVwLlxyXG4gICAgICAgICAgICAvLyBNb3VzZSBET1dOIChtb3ZlbWVudFkgPiAwKSBub3cgZGVjcmVhc2VzIGNhbWVyYVBpdGNoIC0+IGxvb2tzIGRvd24uXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUGl0Y2ggLT0gbW92ZW1lbnRZICogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm1vdXNlU2Vuc2l0aXZpdHk7IFxyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYVBpdGNoID0gTWF0aC5tYXgoLU1hdGguUEkgLyAyLCBNYXRoLm1pbihNYXRoLlBJIC8gMiwgdGhpcy5jYW1lcmFQaXRjaCkpOyAvLyBDbGFtcCB0byAtOTAgdG8gKzkwIGRlZ3JlZXNcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmEucm90YXRpb24ueCA9IHRoaXMuY2FtZXJhUGl0Y2g7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBIYW5kbGVzIG1vdXNlIGNsaWNrIGZvciBmaXJpbmcgYnVsbGV0cy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbk1vdXNlRG93bihldmVudDogTW91c2VFdmVudCkge1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiB0aGlzLmlzUG9pbnRlckxvY2tlZCAmJiBldmVudC5idXR0b24gPT09IDApIHsgLy8gTGVmdCBtb3VzZSBidXR0b25cclxuICAgICAgICAgICAgdGhpcy5maXJlQnVsbGV0KCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBGaXJlcyBhIGJ1bGxldCBmcm9tIHRoZSBwbGF5ZXIncyBjYW1lcmEgcG9zaXRpb24gYW5kIGRpcmVjdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBmaXJlQnVsbGV0KCkge1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldENvbmZpZyA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5idWxsZXQ7XHJcblxyXG4gICAgICAgIC8vIDEuIEdldCBidWxsZXQgaW5pdGlhbCBwb3NpdGlvbiBhbmQgZGlyZWN0aW9uXHJcbiAgICAgICAgY29uc3QgY2FtZXJhV29ybGRQb3NpdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbihjYW1lcmFXb3JsZFBvc2l0aW9uKTtcclxuXHJcbiAgICAgICAgY29uc3QgY2FtZXJhV29ybGREaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmdldFdvcmxkRGlyZWN0aW9uKGNhbWVyYVdvcmxkRGlyZWN0aW9uKTtcclxuXHJcbiAgICAgICAgLy8gMi4gQ3JlYXRlIFRocmVlLmpzIE1lc2ggZm9yIHRoZSBidWxsZXRcclxuICAgICAgICBjb25zdCBidWxsZXRNZXNoID0gbmV3IFRIUkVFLk1lc2godGhpcy5idWxsZXRHZW9tZXRyeSwgdGhpcy5idWxsZXRNYXRlcmlhbE1lc2gpO1xyXG4gICAgICAgIGJ1bGxldE1lc2gucG9zaXRpb24uY29weShjYW1lcmFXb3JsZFBvc2l0aW9uKTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChidWxsZXRNZXNoKTtcclxuXHJcbiAgICAgICAgLy8gMy4gQ3JlYXRlIENhbm5vbi5qcyBCb2R5IGZvciB0aGUgYnVsbGV0XHJcbiAgICAgICAgY29uc3QgYnVsbGV0U2hhcGUgPSBuZXcgQ0FOTk9OLlNwaGVyZShidWxsZXRDb25maWcuZGltZW5zaW9ucy5yYWRpdXMpO1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiBidWxsZXRDb25maWcubWFzcyxcclxuICAgICAgICAgICAgcG9zaXRpb246IG5ldyBDQU5OT04uVmVjMyhjYW1lcmFXb3JsZFBvc2l0aW9uLngsIGNhbWVyYVdvcmxkUG9zaXRpb24ueSwgY2FtZXJhV29ybGRQb3NpdGlvbi56KSxcclxuICAgICAgICAgICAgc2hhcGU6IGJ1bGxldFNoYXBlLFxyXG4gICAgICAgICAgICBtYXRlcmlhbDogdGhpcy5idWxsZXRNYXRlcmlhbCxcclxuICAgICAgICAgICAgLy8gQnVsbGV0cyBzaG91bGQgbm90IGJlIGFmZmVjdGVkIGJ5IHBsYXllciBtb3ZlbWVudCwgYnV0IHNob3VsZCBoYXZlIGdyYXZpdHlcclxuICAgICAgICAgICAgbGluZWFyRGFtcGluZzogMC4wMSwgLy8gU21hbGwgZGFtcGluZyB0byBwcmV2ZW50IGluZmluaXRlIHNsaWRpbmdcclxuICAgICAgICAgICAgYW5ndWxhckRhbXBpbmc6IDAuOTkgLy8gQWxsb3dzIHNvbWUgcm90YXRpb24sIGJ1dCBzdG9wcyBxdWlja2x5XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFNldCBidWxsZXQgaW5pdGlhbCB2ZWxvY2l0eVxyXG4gICAgICAgIGJ1bGxldEJvZHkudmVsb2NpdHkuc2V0KFxyXG4gICAgICAgICAgICBjYW1lcmFXb3JsZERpcmVjdGlvbi54ICogYnVsbGV0Q29uZmlnLnNwZWVkLFxyXG4gICAgICAgICAgICBjYW1lcmFXb3JsZERpcmVjdGlvbi55ICogYnVsbGV0Q29uZmlnLnNwZWVkLFxyXG4gICAgICAgICAgICBjYW1lcmFXb3JsZERpcmVjdGlvbi56ICogYnVsbGV0Q29uZmlnLnNwZWVkXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8gU3RvcmUgYSByZWZlcmVuY2UgdG8gdGhlIGFjdGl2ZSBidWxsZXQgb2JqZWN0IG9uIHRoZSBib2R5IGZvciBjb2xsaXNpb24gY2FsbGJhY2tcclxuICAgICAgICBjb25zdCBhY3RpdmVCdWxsZXQ6IEFjdGl2ZUJ1bGxldCA9IHtcclxuICAgICAgICAgICAgbWVzaDogYnVsbGV0TWVzaCxcclxuICAgICAgICAgICAgYm9keTogYnVsbGV0Qm9keSxcclxuICAgICAgICAgICAgY3JlYXRpb25UaW1lOiB0aGlzLmxhc3RUaW1lIC8gMTAwMCwgLy8gU3RvcmUgY3JlYXRpb24gdGltZSBpbiBzZWNvbmRzXHJcbiAgICAgICAgICAgIGZpcmVQb3NpdGlvbjogYnVsbGV0Qm9keS5wb3NpdGlvbi5jbG9uZSgpIC8vIFN0b3JlIGluaXRpYWwgZmlyZSBwb3NpdGlvbiBmb3IgcmFuZ2UgY2hlY2tcclxuICAgICAgICB9O1xyXG4gICAgICAgIGFjdGl2ZUJ1bGxldC5jb2xsaWRlSGFuZGxlciA9IChldmVudDogQ29sbGlkZUV2ZW50KSA9PiB0aGlzLm9uQnVsbGV0Q29sbGlkZShldmVudCwgYWN0aXZlQnVsbGV0KTsgLy8gU3RvcmUgc3BlY2lmaWMgaGFuZGxlclxyXG4gICAgICAgIGJ1bGxldEJvZHkudXNlckRhdGEgPSBhY3RpdmVCdWxsZXQ7IC8vIEF0dGFjaCB0aGUgYWN0aXZlQnVsbGV0IG9iamVjdCB0byB0aGUgQ2Fubm9uLkJvZHlcclxuXHJcbiAgICAgICAgYnVsbGV0Qm9keS5hZGRFdmVudExpc3RlbmVyKCdjb2xsaWRlJywgYWN0aXZlQnVsbGV0LmNvbGxpZGVIYW5kbGVyKTsgLy8gVXNlIHRoZSBzdG9yZWQgaGFuZGxlclxyXG5cclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkoYnVsbGV0Qm9keSk7XHJcbiAgICAgICAgdGhpcy5idWxsZXRzLnB1c2goYWN0aXZlQnVsbGV0KTtcclxuXHJcbiAgICAgICAgLy8gUGxheSBzaG9vdCBzb3VuZFxyXG4gICAgICAgIHRoaXMuc291bmRzLmdldCgnc2hvb3Rfc291bmQnKT8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJTaG9vdCBzb3VuZCBwbGF5IGRlbmllZDpcIiwgZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBIYW5kbGVzIGJ1bGxldCBjb2xsaXNpb25zLlxyXG4gICAgICogQHBhcmFtIGV2ZW50IFRoZSBDYW5ub24uanMgY29sbGlzaW9uIGV2ZW50LlxyXG4gICAgICogQHBhcmFtIGJ1bGxldCBUaGUgQWN0aXZlQnVsbGV0IGluc3RhbmNlIHRoYXQgY29sbGlkZWQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25CdWxsZXRDb2xsaWRlKGV2ZW50OiBDb2xsaWRlRXZlbnQsIGJ1bGxldDogQWN0aXZlQnVsbGV0KSB7XHJcbiAgICAgICAgLy8gSWYgdGhlIGJ1bGxldCBoYXMgYWxyZWFkeSBiZWVuIHJlbW92ZWQgb3IgbWFya2VkIGZvciByZW1vdmFsLCBkbyBub3RoaW5nLlxyXG4gICAgICAgIGlmICghdGhpcy5idWxsZXRzLmluY2x1ZGVzKGJ1bGxldCkgfHwgYnVsbGV0LnNob3VsZFJlbW92ZSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBjb2xsaWRlZEJvZHkgPSBldmVudC5ib2R5OyAvLyBUaGUgYm9keSB0aGF0IHRoZSBidWxsZXQgKGV2ZW50LnRhcmdldCkgY29sbGlkZWQgd2l0aFxyXG4gICAgICAgIGNvbnN0IG90aGVyQm9keVVzZXJEYXRhID0gY29sbGlkZWRCb2R5LnVzZXJEYXRhOyAvLyBSZXRyaWV2ZSB1c2VyRGF0YSBmb3IgdGhlIGNvbGxpZGVkIGJvZHlcclxuXHJcbiAgICAgICAgY29uc3QgaXNHcm91bmQgPSBjb2xsaWRlZEJvZHkgPT09IHRoaXMuZ3JvdW5kQm9keTtcclxuICAgICAgICBjb25zdCBpc1BsYWNlZE9iamVjdCA9IHRoaXMucGxhY2VkT2JqZWN0Qm9kaWVzLmluY2x1ZGVzKGNvbGxpZGVkQm9keSk7IC8vIFN0YXRpYyBib3hlc1xyXG5cclxuICAgICAgICAvLyBORVc6IENoZWNrIGlmIGNvbGxpZGVkIGJvZHkgaXMgYW4gZW5lbXkgYnkgY2hlY2tpbmcgaXRzIHVzZXJEYXRhIGFuZCB0eXBlQ29uZmlnXHJcbiAgICAgICAgY29uc3QgaXNFbmVteSA9IG90aGVyQm9keVVzZXJEYXRhICYmIChvdGhlckJvZHlVc2VyRGF0YSBhcyBBY3RpdmVFbmVteSkudHlwZUNvbmZpZyAhPT0gdW5kZWZpbmVkO1xyXG5cclxuICAgICAgICBpZiAoaXNHcm91bmQgfHwgaXNQbGFjZWRPYmplY3QpIHtcclxuICAgICAgICAgICAgLy8gTWFyayBidWxsZXQgZm9yIHJlbW92YWwgaW5zdGVhZCBvZiByZW1vdmluZyBpbW1lZGlhdGVseVxyXG4gICAgICAgICAgICBidWxsZXQuc2hvdWxkUmVtb3ZlID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5idWxsZXRzVG9SZW1vdmUuYWRkKGJ1bGxldCk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChpc0VuZW15KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGVuZW15ID0gb3RoZXJCb2R5VXNlckRhdGEgYXMgQWN0aXZlRW5lbXk7XHJcbiAgICAgICAgICAgIGlmICghZW5lbXkuc2hvdWxkUmVtb3ZlKSB7IC8vIERvbid0IHByb2Nlc3MgaGl0cyBvbiBlbmVtaWVzIGFscmVhZHkgbWFya2VkIGZvciByZW1vdmFsXHJcbiAgICAgICAgICAgICAgICBlbmVteS5jdXJyZW50SGVhbHRoLS07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ2hpdF9zb3VuZCcpPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIkhpdCBzb3VuZCBwbGF5IGRlbmllZDpcIiwgZSkpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYEVuZW15ICR7ZW5lbXkubmFtZX0gaGl0ISBIZWFsdGg6ICR7ZW5lbXkuY3VycmVudEhlYWx0aH1gKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoZW5lbXkuY3VycmVudEhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZW5lbXkuc2hvdWxkUmVtb3ZlID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXNUb1JlbW92ZS5hZGQoZW5lbXkpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2NvcmUgKz0gZW5lbXkudHlwZUNvbmZpZy5zY29yZVZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlU2NvcmVEaXNwbGF5KCk7IC8vIFVwZGF0ZSBzY29yZSBVSVxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc291bmRzLmdldCgnZW5lbXlfZGVhdGhfc291bmQnKT8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJFbmVteSBkZWF0aCBzb3VuZCBwbGF5IGRlbmllZDpcIiwgZSkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBFbmVteSAke2VuZW15Lm5hbWV9IGRlZmVhdGVkISBTY29yZTogJHt0aGlzLnNjb3JlfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIE1PRElGSUNBVElPTjogRGVhY3RpdmF0ZSBlbmVteSBwaHlzaWNzIGJvZHkgaW1tZWRpYXRlbHkgdXBvbiBkZWF0aFxyXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgcHJldmVudHMgZnVydGhlciBwaHlzaWNzIGludGVyYWN0aW9ucyAobGlrZSBwbGF5ZXItZW5lbXkgY29udGFjdClcclxuICAgICAgICAgICAgICAgICAgICAvLyBmb3IgYSBib2R5IHRoYXQgaXMgYWJvdXQgdG8gYmUgcmVtb3ZlZCwgcmVkdWNpbmcgcG90ZW50aWFsIHJ1bnRpbWUgZXJyb3JzLlxyXG4gICAgICAgICAgICAgICAgICAgIGVuZW15LmJvZHkuc2xlZXAoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvLyBCdWxsZXQgYWx3YXlzIGRpc2FwcGVhcnMgb24gaGl0dGluZyBhbiBlbmVteVxyXG4gICAgICAgICAgICBidWxsZXQuc2hvdWxkUmVtb3ZlID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5idWxsZXRzVG9SZW1vdmUuYWRkKGJ1bGxldCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBJdGVyYXRlcyB0aHJvdWdoIGJ1bGxldHMgdG8gbWFyayB0aGVtIGZvciByZW1vdmFsIGJhc2VkIG9uIGxpZmV0aW1lLCByYW5nZSwgb3Igb3V0LW9mLWJvdW5kcy5cclxuICAgICAqIEFjdHVhbCByZW1vdmFsIGlzIGRlZmVycmVkIHRvIGBwZXJmb3JtQnVsbGV0UmVtb3ZhbHNgLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZUJ1bGxldHMoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBjb25zdCBjdXJyZW50VGltZSA9IHRoaXMubGFzdFRpbWUgLyAxMDAwOyAvLyBDdXJyZW50IHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgIGNvbnN0IGhhbGZHcm91bmRTaXplID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyAyO1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldENvbmZpZyA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5idWxsZXQ7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5idWxsZXRzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldCA9IHRoaXMuYnVsbGV0c1tpXTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIGFscmVhZHkgbWFya2VkIGZvciByZW1vdmFsIGJ5IGNvbGxpc2lvbiBvciBwcmV2aW91cyBjaGVjaywgc2tpcCBmdXJ0aGVyIHByb2Nlc3NpbmcgZm9yIHRoaXMgYnVsbGV0IHRoaXMgZnJhbWUuXHJcbiAgICAgICAgICAgIGlmIChidWxsZXQuc2hvdWxkUmVtb3ZlKSB7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgbGlmZXRpbWVcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnRUaW1lIC0gYnVsbGV0LmNyZWF0aW9uVGltZSA+IGJ1bGxldENvbmZpZy5saWZldGltZSkge1xyXG4gICAgICAgICAgICAgICAgYnVsbGV0LnNob3VsZFJlbW92ZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldHNUb1JlbW92ZS5hZGQoYnVsbGV0KTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBvdXRzaWRlIG1hcCBib3VuZGFyaWVzIG9yIGlmIGl0IHdlbnQgdG9vIGZhciBmcm9tIGl0cyBmaXJpbmcgcG9pbnRcclxuICAgICAgICAgICAgY29uc3QgYnVsbGV0UG9zID0gYnVsbGV0LmJvZHkucG9zaXRpb247XHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3RhbmNlVG9GaXJlUG9pbnQgPSBidWxsZXRQb3MuZGlzdGFuY2VUbyhidWxsZXQuZmlyZVBvc2l0aW9uKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgICAgIGJ1bGxldFBvcy54ID4gaGFsZkdyb3VuZFNpemUgfHwgYnVsbGV0UG9zLnggPCAtaGFsZkdyb3VuZFNpemUgfHxcclxuICAgICAgICAgICAgICAgIGJ1bGxldFBvcy56ID4gaGFsZkdyb3VuZFNpemUgfHwgYnVsbGV0UG9zLnogPCAtaGFsZkdyb3VuZFNpemUgfHxcclxuICAgICAgICAgICAgICAgIGRpc3RhbmNlVG9GaXJlUG9pbnQgPiBidWxsZXRDb25maWcubWF4UmFuZ2UgfHxcclxuICAgICAgICAgICAgICAgIGJ1bGxldFBvcy55IDwgLTEwIC8vIElmIGl0IGZhbGxzIHZlcnkgZmFyIGJlbG93IHRoZSBncm91bmRcclxuICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICBidWxsZXQuc2hvdWxkUmVtb3ZlID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0c1RvUmVtb3ZlLmFkZChidWxsZXQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBQZXJmb3JtcyB0aGUgYWN0dWFsIHJlbW92YWwgb2YgYnVsbGV0cyBtYXJrZWQgZm9yIHJlbW92YWwuXHJcbiAgICAgKiBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgYWZ0ZXIgdGhlIHBoeXNpY3Mgc3RlcCB0byBhdm9pZCBtb2RpZnlpbmcgdGhlIHdvcmxkIGR1cmluZyBwaHlzaWNzIGNhbGN1bGF0aW9ucy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBwZXJmb3JtQnVsbGV0UmVtb3ZhbHMoKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBidWxsZXRUb1JlbW92ZSBvZiB0aGlzLmJ1bGxldHNUb1JlbW92ZSkge1xyXG4gICAgICAgICAgICAvLyBSZW1vdmUgZnJvbSBUaHJlZS5qcyBzY2VuZVxyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLnJlbW92ZShidWxsZXRUb1JlbW92ZS5tZXNoKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBmcm9tIENhbm5vbi5qcyB3b3JsZFxyXG4gICAgICAgICAgICB0aGlzLndvcmxkLnJlbW92ZUJvZHkoYnVsbGV0VG9SZW1vdmUuYm9keSk7XHJcblxyXG4gICAgICAgICAgICAvLyBSZW1vdmUgZXZlbnQgbGlzdGVuZXJcclxuICAgICAgICAgICAgaWYgKGJ1bGxldFRvUmVtb3ZlLmNvbGxpZGVIYW5kbGVyKSB7XHJcbiAgICAgICAgICAgICAgICBidWxsZXRUb1JlbW92ZS5ib2R5LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NvbGxpZGUnLCBidWxsZXRUb1JlbW92ZS5jb2xsaWRlSGFuZGxlcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBmcm9tIHRoZSBhY3RpdmUgYnVsbGV0cyBhcnJheVxyXG4gICAgICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMuYnVsbGV0cy5pbmRleE9mKGJ1bGxldFRvUmVtb3ZlKTtcclxuICAgICAgICAgICAgaWYgKGluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRzLnNwbGljZShpbmRleCwgMSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gQ2xlYXIgdGhlIHNldCBmb3IgdGhlIG5leHQgZnJhbWVcclxuICAgICAgICB0aGlzLmJ1bGxldHNUb1JlbW92ZS5jbGVhcigpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBVcGRhdGVzIGVuZW15IG1vdmVtZW50IGxvZ2ljIChjYWxjdWxhdGVzIHZlbG9jaXR5IGFuZCByb3RhdGlvbikuXHJcbiAgICAgKiBUaGUgYWN0dWFsIG1lc2ggc3luY2hyb25pemF0aW9uIGhhcHBlbnMgaW4gc3luY01lc2hlc1dpdGhCb2RpZXMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlRW5lbWllcyhkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIGlmICghdGhpcy5wbGF5ZXJCb2R5KSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllclBvcyA9IHRoaXMucGxheWVyQm9keS5wb3NpdGlvbjtcclxuICAgICAgICBjb25zdCBoYWxmR3JvdW5kU2l6ZSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplIC8gMjtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBlbmVteSBvZiB0aGlzLmVuZW1pZXMpIHtcclxuICAgICAgICAgICAgaWYgKGVuZW15LnNob3VsZFJlbW92ZSkge1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGVuZW15UG9zID0gZW5lbXkuYm9keS5wb3NpdGlvbjtcclxuXHJcbiAgICAgICAgICAgIC8vIENsYW1wIGVuZW15IHBvc2l0aW9uIHdpdGhpbiBncm91bmQgYm91bmRhcmllcyAqYmVmb3JlKiBtb3ZlbWVudCB0byBhdm9pZCBnZXR0aW5nIHN0dWNrIG91dHNpZGVcclxuICAgICAgICAgICAgLy8gVGhpcyBwcmV2ZW50cyBlbmVtaWVzIGZyb20gd2FuZGVyaW5nIG9mZiB0aGUgbWFwIG9yIGJlaW5nIHB1c2hlZCB0b28gZmFyLlxyXG4gICAgICAgICAgICBjb25zdCBoYWxmV2lkdGggPSBlbmVteS50eXBlQ29uZmlnLmRpbWVuc2lvbnMud2lkdGggLyAyO1xyXG4gICAgICAgICAgICBjb25zdCBoYWxmRGVwdGggPSBlbmVteS50eXBlQ29uZmlnLmRpbWVuc2lvbnMuZGVwdGggLyAyO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGVuZW15UG9zLnggPiBoYWxmR3JvdW5kU2l6ZSAtIGhhbGZXaWR0aCkgeyBlbmVteS5ib2R5LnBvc2l0aW9uLnggPSBoYWxmR3JvdW5kU2l6ZSAtIGhhbGZXaWR0aDsgaWYgKGVuZW15LmJvZHkudmVsb2NpdHkueCA+IDApIGVuZW15LmJvZHkudmVsb2NpdHkueCA9IDA7IH1cclxuICAgICAgICAgICAgZWxzZSBpZiAoZW5lbXlQb3MueCA8IC1oYWxmR3JvdW5kU2l6ZSArIGhhbGZXaWR0aCkgeyBlbmVteS5ib2R5LnBvc2l0aW9uLnggPSAtaGFsZkdyb3VuZFNpemUgKyBoYWxmV2lkdGg7IGlmIChlbmVteS5ib2R5LnZlbG9jaXR5LnggPCAwKSBlbmVteS5ib2R5LnZlbG9jaXR5LnggPSAwOyB9XHJcblxyXG4gICAgICAgICAgICBpZiAoZW5lbXlQb3MueiA+IGhhbGZHcm91bmRTaXplIC0gaGFsZkRlcHRoKSB7IGVuZW15LmJvZHkucG9zaXRpb24ueiA9IGhhbGZHcm91bmRTaXplIC0gaGFsZkRlcHRoOyBpZiAoZW5lbXkuYm9keS52ZWxvY2l0eS56ID4gMCkgZW5lbXkuYm9keS52ZWxvY2l0eS56ID0gMDsgfVxyXG4gICAgICAgICAgICBlbHNlIGlmIChlbmVteVBvcy56IDwgLWhhbGZHcm91bmRTaXplICsgaGFsZkRlcHRoKSB7IGVuZW15LmJvZHkucG9zaXRpb24ueiA9IC1oYWxmR3JvdW5kU2l6ZSArIGhhbGZEZXB0aDsgaWYgKGVuZW15LmJvZHkudmVsb2NpdHkueiA8IDApIGVuZW15LmJvZHkudmVsb2NpdHkueiA9IDA7IH1cclxuXHJcbiAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBkaXJlY3Rpb24gdG93YXJkcyBwbGF5ZXIgKGZsYXR0ZW5lZCB0byBYWiBwbGFuZSlcclxuICAgICAgICAgICAgY29uc3QgZGlyZWN0aW9uID0gbmV3IENBTk5PTi5WZWMzKCk7XHJcbiAgICAgICAgICAgIHBsYXllclBvcy52c3ViKGVuZW15UG9zLCBkaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBkaXJlY3Rpb24ueSA9IDA7IC8vIE9ubHkgY29uc2lkZXIgaG9yaXpvbnRhbCBtb3ZlbWVudFxyXG4gICAgICAgICAgICBkaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBTZXQgZW5lbXkgdmVsb2NpdHkgYmFzZWQgb24gZGlyZWN0aW9uIGFuZCBzcGVlZFxyXG4gICAgICAgICAgICBlbmVteS5ib2R5LnZlbG9jaXR5LnggPSBkaXJlY3Rpb24ueCAqIGVuZW15LnR5cGVDb25maWcuc3BlZWQ7XHJcbiAgICAgICAgICAgIGVuZW15LmJvZHkudmVsb2NpdHkueiA9IGRpcmVjdGlvbi56ICogZW5lbXkudHlwZUNvbmZpZy5zcGVlZDtcclxuICAgICAgICAgICAgLy8gZW5lbXkuYm9keS52ZWxvY2l0eS55IGlzIG1hbmFnZWQgYnkgZ3Jhdml0eSwgc28gd2UgZG9uJ3QgbW9kaWZ5IGl0IGhlcmUuXHJcblxyXG4gICAgICAgICAgICAvLyBNYWtlIGVuZW15IGxvb2sgYXQgdGhlIHBsYXllciAoeWF3IG9ubHkpXHJcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFJvdGF0aW9uWSA9IE1hdGguYXRhbjIoZGlyZWN0aW9uLngsIGRpcmVjdGlvbi56KTsgLy8gQW5nbGUgaW4gcmFkaWFuc1xyXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50UXVhdGVybmlvbiA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKGVuZW15LmJvZHkucXVhdGVybmlvbi54LCBlbmVteS5ib2R5LnF1YXRlcm5pb24ueSwgZW5lbXkuYm9keS5xdWF0ZXJuaW9uLnosIGVuZW15LmJvZHkucXVhdGVybmlvbi53KTtcclxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0UXVhdGVybmlvbiA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCkuc2V0RnJvbUF4aXNBbmdsZShcclxuICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKDAsIDEsIDApLFxyXG4gICAgICAgICAgICAgICAgdGFyZ2V0Um90YXRpb25ZXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIC8vIFNtb290aCByb3RhdGlvbiBmb3IgcGh5c2ljcyBib2R5XHJcbiAgICAgICAgICAgIGNvbnN0IHNsZXJwZWRRdWF0ZXJuaW9uID0gbmV3IFRIUkVFLlF1YXRlcm5pb24oKTtcclxuICAgICAgICAgICAgc2xlcnBlZFF1YXRlcm5pb24uc2xlcnBRdWF0ZXJuaW9ucyhjdXJyZW50UXVhdGVybmlvbiwgdGFyZ2V0UXVhdGVybmlvbiwgMC4xKTsgLy8gU21vb3RoIGZhY3RvciAwLjFcclxuICAgICAgICAgICAgZW5lbXkuYm9keS5xdWF0ZXJuaW9uLmNvcHkoc2xlcnBlZFF1YXRlcm5pb24gYXMgdW5rbm93biBhcyBDQU5OT04uUXVhdGVybmlvbik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBQZXJmb3JtcyB0aGUgYWN0dWFsIHJlbW92YWwgb2YgZW5lbWllcyBtYXJrZWQgZm9yIHJlbW92YWwuXHJcbiAgICAgKiBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgYWZ0ZXIgdGhlIHBoeXNpY3Mgc3RlcC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBwZXJmb3JtRW5lbXlSZW1vdmFscygpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IGVuZW15VG9SZW1vdmUgb2YgdGhpcy5lbmVtaWVzVG9SZW1vdmUpIHtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5yZW1vdmUoZW5lbXlUb1JlbW92ZS5tZXNoKTtcclxuICAgICAgICAgICAgdGhpcy53b3JsZC5yZW1vdmVCb2R5KGVuZW15VG9SZW1vdmUuYm9keSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMuZW5lbWllcy5pbmRleE9mKGVuZW15VG9SZW1vdmUpO1xyXG4gICAgICAgICAgICBpZiAoaW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXMuc3BsaWNlKGluZGV4LCAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmVuZW1pZXNUb1JlbW92ZS5jbGVhcigpO1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgdGhlIHBvaW50ZXIgbG9jayBzdGF0dXMgd2hlbiBpdCBjaGFuZ2VzIChlLmcuLCB1c2VyIHByZXNzZXMgRXNjKS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvblBvaW50ZXJMb2NrQ2hhbmdlKCkge1xyXG4gICAgICAgIGlmIChkb2N1bWVudC5wb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMuY2FudmFzIHx8XHJcbiAgICAgICAgICAgIChkb2N1bWVudCBhcyBhbnkpLm1velBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXMgfHxcclxuICAgICAgICAgICAgKGRvY3VtZW50IGFzIGFueSkud2Via2l0UG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLmNhbnZhcykge1xyXG4gICAgICAgICAgICB0aGlzLmlzUG9pbnRlckxvY2tlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdQb2ludGVyIGxvY2tlZCcpO1xyXG4gICAgICAgICAgICAvLyBTaG93IGNyb3NzaGFpciBvbmx5IGlmIGdhbWUgaXMgcGxheWluZyBBTkQgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgICAgICAgICAgaWYgKHRoaXMuY3Jvc3NoYWlyRWxlbWVudCAmJiB0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jcm9zc2hhaXJFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5pc1BvaW50ZXJMb2NrZWQgPSBmYWxzZTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1BvaW50ZXIgdW5sb2NrZWQnKTtcclxuICAgICAgICAgICAgLy8gSGlkZSBjcm9zc2hhaXIgd2hlbiBwb2ludGVyIGlzIHVubG9ja2VkXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmNyb3NzaGFpckVsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3Jvc3NoYWlyRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVGhlIG1haW4gZ2FtZSBsb29wLCBjYWxsZWQgb24gZXZlcnkgYW5pbWF0aW9uIGZyYW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFuaW1hdGUodGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCkge1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGUuYmluZCh0aGlzKSk7IC8vIFJlcXVlc3QgbmV4dCBmcmFtZVxyXG5cclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAodGltZSAtIHRoaXMubGFzdFRpbWUpIC8gMTAwMDsgLy8gQ2FsY3VsYXRlIGRlbHRhIHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSB0aW1lO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQbGF5ZXJNb3ZlbWVudCgpOyAvLyBVcGRhdGUgcGxheWVyJ3MgdmVsb2NpdHkgYmFzZWQgb24gaW5wdXRcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVCdWxsZXRzKGRlbHRhVGltZSk7IC8vIE5FVzogTWFyayBidWxsZXRzIGZvciByZW1vdmFsXHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlRW5lbWllcyhkZWx0YVRpbWUpOyAvLyBORVc6IFVwZGF0ZSBlbmVteSBtb3ZlbWVudFxyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVBoeXNpY3MoZGVsdGFUaW1lKTsgLy8gU3RlcCB0aGUgcGh5c2ljcyB3b3JsZFxyXG4gICAgICAgICAgICB0aGlzLnBlcmZvcm1CdWxsZXRSZW1vdmFscygpOyAvLyBORVc6IFBlcmZvcm0gYWN0dWFsIGJ1bGxldCByZW1vdmFscyAqYWZ0ZXIqIHBoeXNpY3Mgc3RlcFxyXG4gICAgICAgICAgICB0aGlzLnBlcmZvcm1FbmVteVJlbW92YWxzKCk7IC8vIE5FVzogUGVyZm9ybSBhY3R1YWwgZW5lbXkgcmVtb3ZhbHMgKmFmdGVyKiBwaHlzaWNzIHN0ZXBcclxuICAgICAgICAgICAgdGhpcy5jbGFtcFBsYXllclBvc2l0aW9uKCk7IC8vIENsYW1wIHBsYXllciBwb3NpdGlvbiB0byBwcmV2ZW50IGdvaW5nIGJleW9uZCBncm91bmQgZWRnZXNcclxuICAgICAgICAgICAgdGhpcy5zeW5jTWVzaGVzV2l0aEJvZGllcygpOyAvLyBTeW5jaHJvbml6ZSB2aXN1YWwgbWVzaGVzIHdpdGggcGh5c2ljcyBib2RpZXNcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhKTsgLy8gUmVuZGVyIHRoZSBzY2VuZVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3RlcHMgdGhlIENhbm5vbi5qcyBwaHlzaWNzIHdvcmxkIGZvcndhcmQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlUGh5c2ljcyhkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIC8vIHdvcmxkLnN0ZXAoZml4ZWRUaW1lU3RlcCwgZGVsdGFUaW1lLCBtYXhTdWJTdGVwcylcclxuICAgICAgICAvLyAxLzYwOiBBIGZpeGVkIHRpbWUgc3RlcCBvZiA2MCBwaHlzaWNzIHVwZGF0ZXMgcGVyIHNlY29uZCAoc3RhbmRhcmQpLlxyXG4gICAgICAgIC8vIGRlbHRhVGltZTogVGhlIGFjdHVhbCB0aW1lIGVsYXBzZWQgc2luY2UgdGhlIGxhc3QgcmVuZGVyIGZyYW1lLlxyXG4gICAgICAgIC8vIG1heFBoeXNpY3NTdWJTdGVwczogTGltaXRzIHRoZSBudW1iZXIgb2YgcGh5c2ljcyBzdGVwcyBpbiBvbmUgcmVuZGVyIGZyYW1lXHJcbiAgICAgICAgLy8gdG8gcHJldmVudCBpbnN0YWJpbGl0aWVzIGlmIHJlbmRlcmluZyBzbG93cyBkb3duIHNpZ25pZmljYW50bHkuXHJcbiAgICAgICAgdGhpcy53b3JsZC5zdGVwKDEgLyA2MCwgZGVsdGFUaW1lLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubWF4UGh5c2ljc1N1YlN0ZXBzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgdGhlIHBsYXllcidzIHZlbG9jaXR5IGJhc2VkIG9uIFdBU0QgaW5wdXQgYW5kIGNhbWVyYSBvcmllbnRhdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVQbGF5ZXJNb3ZlbWVudCgpIHtcclxuICAgICAgICAvLyBQbGF5ZXIgbW92ZW1lbnQgc2hvdWxkIG9ubHkgaGFwcGVuIHdoZW4gdGhlIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICAgICAgaWYgKCF0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICAvLyBJZiBwb2ludGVyIGlzIG5vdCBsb2NrZWQsIHN0b3AgaG9yaXpvbnRhbCBtb3ZlbWVudCBpbW1lZGlhdGVseVxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBFeGl0IGVhcmx5IGFzIG5vIG1vdmVtZW50IGlucHV0IHNob3VsZCBiZSBwcm9jZXNzZWRcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBlZmZlY3RpdmVQbGF5ZXJTcGVlZCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJTcGVlZDtcclxuXHJcbiAgICAgICAgLy8gTU9ESUZJRUQ6IEFwcGx5IGFpciBjb250cm9sIGZhY3RvciBpZiBwbGF5ZXIgaXMgaW4gdGhlIGFpciAobm8gY29udGFjdHMgd2l0aCBhbnkgc3RhdGljIHN1cmZhY2UpXHJcbiAgICAgICAgaWYgKHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPT09IDApIHtcclxuICAgICAgICAgICAgZWZmZWN0aXZlUGxheWVyU3BlZWQgKj0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckFpckNvbnRyb2xGYWN0b3I7IC8vIFVzZSBjb25maWd1cmFibGUgYWlyIGNvbnRyb2wgZmFjdG9yXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRZVmVsb2NpdHkgPSB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueTsgLy8gUHJlc2VydmUgdmVydGljYWwgdmVsb2NpdHlcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBtb3ZlRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMCwgMCk7IC8vIFVzZSBhIFRIUkVFLlZlY3RvcjMgZm9yIGNhbGN1bGF0aW9uIGVhc2VcclxuXHJcbiAgICAgICAgLy8gR2V0IGNhbWVyYUNvbnRhaW5lcidzIGZvcndhcmQgdmVjdG9yIChob3Jpem9udGFsIGRpcmVjdGlvbiBwbGF5ZXIgaXMgbG9va2luZylcclxuICAgICAgICBjb25zdCBjYW1lcmFEaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLmdldFdvcmxkRGlyZWN0aW9uKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgY2FtZXJhRGlyZWN0aW9uLnkgPSAwOyAvLyBGbGF0dGVuIHRoZSB2ZWN0b3IgdG8gcmVzdHJpY3QgbW92ZW1lbnQgdG8gdGhlIGhvcml6b250YWwgcGxhbmVcclxuICAgICAgICBjYW1lcmFEaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGdsb2JhbFVwID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMSwgMCk7IC8vIERlZmluZSBnbG9iYWwgdXAgdmVjdG9yIGZvciBjcm9zcyBwcm9kdWN0XHJcblxyXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgJ3JpZ2h0JyB2ZWN0b3IgcmVsYXRpdmUgdG8gY2FtZXJhJ3MgZm9yd2FyZCBkaXJlY3Rpb25cclxuICAgICAgICBjb25zdCBjYW1lcmFSaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgY2FtZXJhUmlnaHQuY3Jvc3NWZWN0b3JzKGdsb2JhbFVwLCBjYW1lcmFEaXJlY3Rpb24pLm5vcm1hbGl6ZSgpOyBcclxuXHJcbiAgICAgICAgbGV0IG1vdmluZyA9IGZhbHNlO1xyXG4gICAgICAgIC8vIFcgPC0+IFMgc3dhcCBmcm9tIHVzZXIncyBjb21tZW50cyBpbiBvcmlnaW5hbCBjb2RlOlxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ3MnXSkgeyAvLyAncycga2V5IG5vdyBtb3ZlcyBmb3J3YXJkXHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24uYWRkKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ3cnXSkgeyAvLyAndycga2V5IG5vdyBtb3ZlcyBiYWNrd2FyZFxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLnN1YihjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBBIGFuZCBEIGNvbnRyb2xzIGFzIHN0YW5kYXJkOlxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ2EnXSkgeyAvLyAnYScga2V5IG5vdyBzdHJhZmVzIGxlZnRcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5zdWIoY2FtZXJhUmlnaHQpOyBcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1snZCddKSB7IC8vICdkJyBrZXkgbm93IHN0cmFmZXMgcmlnaHRcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5hZGQoY2FtZXJhUmlnaHQpOyBcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChtb3ZpbmcpIHtcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5ub3JtYWxpemUoKS5tdWx0aXBseVNjYWxhcihlZmZlY3RpdmVQbGF5ZXJTcGVlZCk7XHJcbiAgICAgICAgICAgIC8vIERpcmVjdGx5IHNldCB0aGUgaG9yaXpvbnRhbCB2ZWxvY2l0eSBjb21wb25lbnRzLlxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IG1vdmVEaXJlY3Rpb24ueDtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSBtb3ZlRGlyZWN0aW9uLno7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gSWYgbm8gbW92ZW1lbnQga2V5cyBhcmUgcHJlc3NlZDpcclxuICAgICAgICAgICAgLy8gTU9ESUZJRUQ6IEFwcGx5IGFpciBkZWNlbGVyYXRpb24gaWYgcGxheWVyIGlzIGluIHRoZSBhaXJcclxuICAgICAgICAgICAgaWYgKHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ICo9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJBaXJEZWNlbGVyYXRpb247XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiAqPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyQWlyRGVjZWxlcmF0aW9uO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gUGxheWVyIGlzIG9uIHRoZSBncm91bmQgb3IgYSBzdGF0aWMgb2JqZWN0OiBDYW5ub24uanMgQ29udGFjdE1hdGVyaWFsIGZyaWN0aW9uIHdpbGwgaGFuZGxlIGRlY2VsZXJhdGlvbi5cclxuICAgICAgICAgICAgICAgIC8vIE5vIGV4cGxpY2l0IHZlbG9jaXR5IGRlY2F5IGlzIGFwcGxpZWQgaGVyZSBmb3IgZ3JvdW5kIG1vdmVtZW50LlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55ID0gY3VycmVudFlWZWxvY2l0eTsgLy8gUmVzdG9yZSBZIHZlbG9jaXR5IChncmF2aXR5L2p1bXBzKVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQURERUQ6IEFwcGxpZXMgYW4gdXB3YXJkIGltcHVsc2UgdG8gdGhlIHBsYXllciBib2R5IGZvciBqdW1waW5nLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHBsYXllckp1bXAoKSB7XHJcbiAgICAgICAgLy8gTU9ESUZJRUQ6IE9ubHkgYWxsb3cganVtcCBpZiB0aGUgcGxheWVyIGlzIGN1cnJlbnRseSBvbiBhbnkgc3RhdGljIHN1cmZhY2UgKGdyb3VuZCBvciBvYmplY3QpXHJcbiAgICAgICAgaWYgKHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPiAwKSB7XHJcbiAgICAgICAgICAgIC8vIENsZWFyIGFueSBleGlzdGluZyB2ZXJ0aWNhbCB2ZWxvY2l0eSB0byBlbnN1cmUgYSBjb25zaXN0ZW50IGp1bXAgaGVpZ2h0XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55ID0gMDsgXHJcbiAgICAgICAgICAgIC8vIEFwcGx5IGFuIHVwd2FyZCBpbXB1bHNlIChtYXNzICogY2hhbmdlX2luX3ZlbG9jaXR5KVxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkuYXBwbHlJbXB1bHNlKFxyXG4gICAgICAgICAgICAgICAgbmV3IENBTk5PTi5WZWMzKDAsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5qdW1wRm9yY2UsIDApLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIC8vIEFwcGx5IGltcHVsc2UgYXQgdGhlIGNlbnRlciBvZiBtYXNzXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2xhbXBzIHRoZSBwbGF5ZXIncyBwb3NpdGlvbiB3aXRoaW4gdGhlIGRlZmluZWQgZ3JvdW5kIGJvdW5kYXJpZXMuXHJcbiAgICAgKiBQcmV2ZW50cyB0aGUgcGxheWVyIGZyb20gbW92aW5nIGJleW9uZCB0aGUgJ2VuZCBvZiB0aGUgd29ybGQnLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNsYW1wUGxheWVyUG9zaXRpb24oKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnBsYXllckJvZHkgfHwgIXRoaXMuY29uZmlnKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGhhbGZHcm91bmRTaXplID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyAyO1xyXG4gICAgICAgIGNvbnN0IHBsYXllckhhbGZXaWR0aCA9IDAuNTsgLy8gRnJvbSBCb3hHZW9tZXRyeSgxLDIsMSkgaGFsZiBleHRlbnRzIGZvciBDYW5ub24uanNcclxuXHJcbiAgICAgICAgbGV0IHBvc1ggPSB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueDtcclxuICAgICAgICBsZXQgcG9zWiA9IHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi56O1xyXG4gICAgICAgIGxldCB2ZWxYID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5Lng7XHJcbiAgICAgICAgbGV0IHZlbFogPSB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkuejtcclxuXHJcbiAgICAgICAgLy8gQ2xhbXAgWCBwb3NpdGlvblxyXG4gICAgICAgIGlmIChwb3NYID4gaGFsZkdyb3VuZFNpemUgLSBwbGF5ZXJIYWxmV2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnggPSBoYWxmR3JvdW5kU2l6ZSAtIHBsYXllckhhbGZXaWR0aDtcclxuICAgICAgICAgICAgaWYgKHZlbFggPiAwKSB7IC8vIElmIG1vdmluZyBvdXR3YXJkcywgc3RvcCBob3Jpem9udGFsIHZlbG9jaXR5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHBvc1ggPCAtaGFsZkdyb3VuZFNpemUgKyBwbGF5ZXJIYWxmV2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnggPSAtaGFsZkdyb3VuZFNpemUgKyBwbGF5ZXJIYWxmV2lkdGg7XHJcbiAgICAgICAgICAgIGlmICh2ZWxYIDwgMCkgeyAvLyBJZiBtb3Zpbmcgb3V0d2FyZHMsIHN0b3AgaG9yaXpvbnRhbCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDbGFtcCBaIHBvc2l0aW9uXHJcbiAgICAgICAgaWYgKHBvc1ogPiBoYWxmR3JvdW5kU2l6ZSAtIHBsYXllckhhbGZXaWR0aCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueiA9IGhhbGZHcm91bmRTaXplIC0gcGxheWVySGFsZldpZHRoO1xyXG4gICAgICAgICAgICBpZiAodmVsWiA+IDApIHsgLy8gSWYgbW92aW5nIG91dHdhcmRzLCBzdG9wIGhvcml6b250YWwgdmVsb2NpdHlcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAocG9zWiA8IC1oYWxmR3JvdW5kU2l6ZSArIHBsYXllckhhbGZXaWR0aCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueiA9IC1oYWxmR3JvdW5kU2l6ZSArIHBsYXllckhhbGZXaWR0aDtcclxuICAgICAgICAgICAgaWYgKHZlbFogPCAwKSB7IC8vIElmIG1vdmluZyBvdXR3YXJkcywgc3RvcCBob3Jpem9udGFsIHZlbG9jaXR5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTeW5jaHJvbml6ZXMgdGhlIHZpc3VhbCBtZXNoZXMgd2l0aCB0aGVpciBjb3JyZXNwb25kaW5nIHBoeXNpY3MgYm9kaWVzLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN5bmNNZXNoZXNXaXRoQm9kaWVzKCkge1xyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIHBsYXllcidzIHZpc3VhbCBtZXNoIHBvc2l0aW9uIHdpdGggaXRzIHBoeXNpY3MgYm9keSdzIHBvc2l0aW9uXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU3luY2hyb25pemUgY2FtZXJhQ29udGFpbmVyIHBvc2l0aW9uIHdpdGggdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keSdzIHBvc2l0aW9uLlxyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcblxyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIHBsYXllcidzIHZpc3VhbCBtZXNoIGhvcml6b250YWwgcm90YXRpb24gKHlhdykgd2l0aCBjYW1lcmFDb250YWluZXIncyB5YXcuXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLnF1YXRlcm5pb24uY29weSh0aGlzLmNhbWVyYUNvbnRhaW5lci5xdWF0ZXJuaW9uKTtcclxuXHJcbiAgICAgICAgLy8gVGhlIGdyb3VuZCBhbmQgcGxhY2VkIG9iamVjdHMgYXJlIGN1cnJlbnRseSBzdGF0aWMgKG1hc3MgMCksIHNvIHRoZWlyIHZpc3VhbCBtZXNoZXNcclxuICAgICAgICAvLyBkbyBub3QgbmVlZCB0byBiZSBzeW5jaHJvbml6ZWQgd2l0aCB0aGVpciBwaHlzaWNzIGJvZGllcyBhZnRlciBpbml0aWFsIHBsYWNlbWVudC5cclxuICAgICAgICBcclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSBidWxsZXQgbWVzaGVzIHdpdGggdGhlaXIgcGh5c2ljcyBib2RpZXNcclxuICAgICAgICBmb3IgKGNvbnN0IGJ1bGxldCBvZiB0aGlzLmJ1bGxldHMpIHtcclxuICAgICAgICAgICAgaWYgKCFidWxsZXQuc2hvdWxkUmVtb3ZlKSB7XHJcbiAgICAgICAgICAgICAgICBidWxsZXQubWVzaC5wb3NpdGlvbi5jb3B5KGJ1bGxldC5ib2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgICAgICAgICBidWxsZXQubWVzaC5xdWF0ZXJuaW9uLmNvcHkoYnVsbGV0LmJvZHkucXVhdGVybmlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlF1YXRlcm5pb24pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBORVc6IFN5bmNocm9uaXplIGVuZW15IG1lc2hlcyB3aXRoIHRoZWlyIHBoeXNpY3MgYm9kaWVzXHJcbiAgICAgICAgZm9yIChjb25zdCBlbmVteSBvZiB0aGlzLmVuZW1pZXMpIHtcclxuICAgICAgICAgICAgaWYgKCFlbmVteS5zaG91bGRSZW1vdmUpIHtcclxuICAgICAgICAgICAgICAgIGVuZW15Lm1lc2gucG9zaXRpb24uY29weShlbmVteS5ib2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgICAgICAgICBlbmVteS5tZXNoLnF1YXRlcm5pb24uY29weShlbmVteS5ib2R5LnF1YXRlcm5pb24gYXMgdW5rbm93biBhcyBUSFJFRS5RdWF0ZXJuaW9uKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gU3RhcnQgdGhlIGdhbWUgd2hlbiB0aGUgRE9NIGNvbnRlbnQgaXMgZnVsbHkgbG9hZGVkXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICBuZXcgR2FtZSgpO1xyXG59KTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIkFBQUEsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksWUFBWTtBQXVCeEIsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBSEMsU0FBQUE7QUFBQSxHQUFBO0FBc0dMLE1BQU0sS0FBSztBQUFBLEVBb0VQLGNBQWM7QUFsRWQ7QUFBQSxTQUFRLFFBQW1CO0FBMkIzQjtBQUFBLFNBQVEscUJBQW1DLENBQUM7QUFDNUMsU0FBUSxxQkFBb0MsQ0FBQztBQUc3QztBQUFBLFNB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
