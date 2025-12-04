import * as THREE from "three";
import * as CANNON from "cannon-es";
interface GameData {
  player: {
    speed: number;
    height: number;
    jumpForce: number;
    mouseSensitivity: number;
    health: number;
    gunDamage: number;
    fireRate: number;
  };
  enemies: {
    count: number;
    speed: number;
    health: number;
    spawnRadius: number;
    damage: number;
  };
  level: {
    groundSize: number;
    wallHeight: number;
    gravity: number;
  };
  assets: {
    images: Array<{
      name: string;
      path: string;
      width: number;
      height: number;
    }>;
    sounds: Array<{
      name: string;
      path: string;
      duration_seconds: number;
      volume: number;
    }>;
  };
}
class FPSGame {
  private canvas: HTMLCanvasElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private world: CANNON.World;
  private data!: GameData;
  private playerBody!: CANNON.Body;
  private velocity = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private canJump = false;
  private euler = new THREE.Euler(0, 0, 0, "YXZ");
  private lastShootTime = 0;
  private enemies: Array<{
    mesh: THREE.Mesh;
    body: CANNON.Body;
    health: number;
  }> = [];
  private bullets: Array<{
    mesh: THREE.Mesh;
    body: CANNON.Body;
    damage: number;
    lifetime: number;
  }> = [];
  private textures: Map<string, THREE.Texture> = new Map();
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private gameState: "title" | "playing" | "gameover" = "title";
  private playerHealth!: number;
  private enemiesKilled = 0;
  private keys: Set<string> = new Set();
  private mouseMovement = { x: 0, y: 0 };
  private isPointerLocked = false;
  constructor() {
    this.canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 50, 200);

    this.camera = new THREE.PerspectiveCamera(
      75,
      this.canvas.width / this.canvas.height,
      0.1,
      1000
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setSize(this.canvas.width, this.canvas.height);
    this.renderer.shadowMap.enabled = true;

    this.world = new CANNON.World();

    this.setupEventListeners();
  }
  async init() {
    const response = await fetch("data.json");
    this.data = await response.json();
    await this.loadAssets();

    this.world.gravity.set(0, this.data.level.gravity, 0);

    this.setupLights();
    this.createLevel();

    this.showTitle();
  }
  private async loadAssets() {
    const textureLoader = new THREE.TextureLoader();
    for (const img of this.data.assets.images) {
      try {
        const texture = await textureLoader.loadAsync(img.path);
        this.textures.set(img.name, texture);
      } catch (e) {
        console.warn(`Could not load texture: ${img.path}`);
      }
    }

    for (const snd of this.data.assets.sounds) {
      try {
        const audio = new Audio(snd.path);
        audio.volume = snd.volume;
        this.sounds.set(snd.name, audio);
      } catch (e) {
        console.warn(`Could not load sound: ${snd.path}`);
      }
    }
  }
  private setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    this.scene.add(dirLight);
  }
  private createLevel() {
    const groundSize = this.data.level.groundSize;
    const wallHeight = this.data.level.wallHeight;
    const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x3a8c3a,
      roughness: 0.8,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0 });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);

    const wallThickness = 2;
    const wallPositions = [
      {
        pos: [0, wallHeight / 2, -groundSize / 2],
        rot: [0, 0, 0],
        size: [groundSize, wallHeight, wallThickness],
      },
      {
        pos: [0, wallHeight / 2, groundSize / 2],
        rot: [0, 0, 0],
        size: [groundSize, wallHeight, wallThickness],
      },
      {
        pos: [-groundSize / 2, wallHeight / 2, 0],
        rot: [0, Math.PI / 2, 0],
        size: [groundSize, wallHeight, wallThickness],
      },
      {
        pos: [groundSize / 2, wallHeight / 2, 0],
        rot: [0, Math.PI / 2, 0],
        size: [groundSize, wallHeight, wallThickness],
      },
    ];

    wallPositions.forEach((wall) => {
      const wallGeo = new THREE.BoxGeometry(
        wall.size[0],
        wall.size[1],
        wall.size[2]
      );
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.position.set(wall.pos[0], wall.pos[1], wall.pos[2]);
      wallMesh.rotation.y = wall.rot[1];
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      this.scene.add(wallMesh);

      const wallShape = new CANNON.Box(
        new CANNON.Vec3(wall.size[0] / 2, wall.size[1] / 2, wall.size[2] / 2)
      );
      const wallBody = new CANNON.Body({ mass: 0 });
      wallBody.addShape(wallShape);
      wallBody.position.set(wall.pos[0], wall.pos[1], wall.pos[2]);
      wallBody.quaternion.setFromEuler(0, wall.rot[1], 0);
      this.world.addBody(wallBody);
    });
  }
  private createPlayer() {
    const radius = 0.5;
    const height = this.data.player.height;
    const shape = new CANNON.Cylinder(radius, radius, height, 8);
    this.playerBody = new CANNON.Body({ mass: 80 });
    this.playerBody.addShape(shape);
    this.playerBody.position.set(0, height, 0);
    this.playerBody.linearDamping = 0.9;
    this.world.addBody(this.playerBody);

    this.camera.position.set(0, height, 0);
    this.scene.add(this.camera);
    this.playerHealth = this.data.player.health;

    this.playerBody.addEventListener("collide", (e: any) => {
      const contact = e.contact;
      if (contact.ni.y > 0.5) {
        this.canJump = true;
      }
    });
  }
  private spawnEnemies() {
    for (let i = 0; i < this.data.enemies.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = this.data.enemies.spawnRadius;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      this.createEnemy(x, 2, z);
    }
  }
  private createEnemy(x: number, y: number, z: number) {
    const size = 2;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshStandardMaterial({
      map: this.textures.get("enemy") || null,
      color: 0xff4444,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const shape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
    const body = new CANNON.Body({ mass: 50 });
    body.addShape(shape);
    body.position.set(x, y, z);
    this.world.addBody(body);

    this.enemies.push({ mesh, body, health: this.data.enemies.health });
  }
  private shoot() {
    const now = Date.now();
    if (now - this.lastShootTime < 1000 / this.data.player.fireRate) return;
    this.lastShootTime = now;
    const bulletSize = 0.2;
    const geo = new THREE.SphereGeometry(bulletSize);
    const mat = new THREE.MeshStandardMaterial({
      map: this.textures.get("bullet") || null,
      color: 0xffff00,
      emissive: 0xffff00,
    });
    const mesh = new THREE.Mesh(geo, mat);

    const spawnDist = 2;
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.camera.quaternion);

    mesh.position.copy(this.camera.position).add(dir.multiplyScalar(spawnDist));
    this.scene.add(mesh);

    const shape = new CANNON.Sphere(bulletSize);
    const body = new CANNON.Body({ mass: 1 });
    body.addShape(shape);
    body.position.copy(mesh.position as any);

    const shootDir = new THREE.Vector3(0, 0, -1);
    shootDir.applyQuaternion(this.camera.quaternion);
    const speed = 50;
    body.velocity.set(
      shootDir.x * speed,
      shootDir.y * speed,
      shootDir.z * speed
    );

    this.world.addBody(body);

    this.bullets.push({
      mesh,
      body,
      damage: this.data.player.gunDamage,
      lifetime: 3,
    });

    const shootSound = this.sounds.get("shoot");
    if (shootSound) {
      const cloned = shootSound.cloneNode() as HTMLAudioElement;
      cloned.play().catch(() => {});
    }
  }
  private updateEnemies(delta: number) {
    this.enemies.forEach((enemy) => {
      const enemyPos = new THREE.Vector3(
        enemy.body.position.x,
        enemy.body.position.y,
        enemy.body.position.z
      );
      const playerPos = new THREE.Vector3(
        this.playerBody.position.x,
        this.playerBody.position.y,
        this.playerBody.position.z
      );
      const dir = new THREE.Vector3()
        .subVectors(playerPos, enemyPos)
        .normalize();
      const speed = this.data.enemies.speed;
      enemy.body.velocity.x = dir.x * speed;
      enemy.body.velocity.z = dir.z * speed;

      enemy.mesh.position.copy(enemy.body.position as any);
      enemy.mesh.quaternion.copy(enemy.body.quaternion as any);

      const dist = enemyPos.distanceTo(playerPos);
      if (dist < 2 && Math.random() < 0.01) {
        this.playerHealth -= this.data.enemies.damage;
        const hitSound = this.sounds.get("hit");
        if (hitSound) {
          const cloned = hitSound.cloneNode() as HTMLAudioElement;
          cloned.play().catch(() => {});
        }
      }
    });
  }
  private updateBullets(delta: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.lifetime -= delta;
      bullet.mesh.position.copy(bullet.body.position as any);

      if (bullet.lifetime <= 0) {
        this.scene.remove(bullet.mesh);
        this.world.removeBody(bullet.body);
        this.bullets.splice(i, 1);
        continue;
      }

      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const enemy = this.enemies[j];
        const bulletPos = new THREE.Vector3(
          bullet.body.position.x,
          bullet.body.position.y,
          bullet.body.position.z
        );
        const enemyPos = new THREE.Vector3(
          enemy.body.position.x,
          enemy.body.position.y,
          enemy.body.position.z
        );

        if (bulletPos.distanceTo(enemyPos) < 1.5) {
          enemy.health -= bullet.damage;

          this.scene.remove(bullet.mesh);
          this.world.removeBody(bullet.body);
          this.bullets.splice(i, 1);

          if (enemy.health <= 0) {
            this.scene.remove(enemy.mesh);
            this.world.removeBody(enemy.body);
            this.enemies.splice(j, 1);
            this.enemiesKilled++;

            const killSound = this.sounds.get("kill");
            if (killSound) {
              const cloned = killSound.cloneNode() as HTMLAudioElement;
              cloned.play().catch(() => {});
            }
          }

          break;
        }
      }
    }
  }
  private updatePlayer(delta: number) {
    const speed = this.data.player.speed;
    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.normalize();

    this.velocity.set(0, this.playerBody.velocity.y, 0);

    if (this.moveForward || this.moveBackward) {
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion(this.camera.quaternion);
      forward.y = 0;
      forward.normalize();
      this.velocity.add(forward.multiplyScalar(this.direction.z * speed));
    }

    if (this.moveLeft || this.moveRight) {
      const right = new THREE.Vector3(1, 0, 0);
      right.applyQuaternion(this.camera.quaternion);
      right.y = 0;
      right.normalize();
      this.velocity.add(right.multiplyScalar(this.direction.x * speed));
    }

    this.playerBody.velocity.x = this.velocity.x;
    this.playerBody.velocity.z = this.velocity.z;

    this.camera.position.copy(this.playerBody.position as any);
    this.camera.position.y += this.data.player.height / 2;

    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= this.mouseMovement.x * this.data.player.mouseSensitivity;
    this.euler.x -= this.mouseMovement.y * this.data.player.mouseSensitivity;
    this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
    this.camera.quaternion.setFromEuler(this.euler);

    this.mouseMovement.x = 0;
    this.mouseMovement.y = 0;
  }
  private drawUI() {
    const ctx = this.canvas.getContext("2d")!;
    ctx.save();
    if (this.gameState === "title") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      ctx.fillStyle = "white";
      ctx.font = "bold 60px Arial";
      ctx.textAlign = "center";
      ctx.fillText(
        "FPS SHOOTER",
        this.canvas.width / 2,
        this.canvas.height / 2 - 50
      );

      ctx.font = "30px Arial";
      ctx.fillText(
        "Click to Start",
        this.canvas.width / 2,
        this.canvas.height / 2 + 50
      );

      ctx.font = "20px Arial";
      ctx.fillText(
        "WASD: Move | Mouse: Look | Click: Shoot | Space: Jump",
        this.canvas.width / 2,
        this.canvas.height / 2 + 120
      );
    } else if (this.gameState === "playing") {
      ctx.fillStyle = "white";
      ctx.font = "bold 24px Arial";
      ctx.textAlign = "left";
      ctx.fillText(
        `Health: ${Math.max(0, Math.round(this.playerHealth))}`,
        20,
        40
      );
      ctx.fillText(`Kills: ${this.enemiesKilled}`, 20, 75);

      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      const centerX = this.canvas.width / 2;
      const centerY = this.canvas.height / 2;
      ctx.beginPath();
      ctx.moveTo(centerX - 10, centerY);
      ctx.lineTo(centerX + 10, centerY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - 10);
      ctx.lineTo(centerX, centerY + 10);
      ctx.stroke();
    } else if (this.gameState === "gameover") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      ctx.fillStyle = "red";
      ctx.font = "bold 60px Arial";
      ctx.textAlign = "center";
      ctx.fillText(
        "GAME OVER",
        this.canvas.width / 2,
        this.canvas.height / 2 - 50
      );

      ctx.fillStyle = "white";
      ctx.font = "30px Arial";
      ctx.fillText(
        `Enemies Killed: ${this.enemiesKilled}`,
        this.canvas.width / 2,
        this.canvas.height / 2 + 20
      );
      ctx.fillText(
        "Click to Restart",
        this.canvas.width / 2,
        this.canvas.height / 2 + 80
      );
    }

    ctx.restore();
  }
  private setupEventListeners() {
    document.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === "KeyW") this.moveForward = true;
      if (e.code === "KeyS") this.moveBackward = true;
      if (e.code === "KeyA") this.moveLeft = true;
      if (e.code === "KeyD") this.moveRight = true;
      if (e.code === "Space" && this.canJump && this.gameState === "playing") {
        this.playerBody.velocity.y = this.data.player.jumpForce;
        this.canJump = false;
      }
    });

    document.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);

      if (e.code === "KeyW") this.moveForward = false;
      if (e.code === "KeyS") this.moveBackward = false;
      if (e.code === "KeyA") this.moveLeft = false;
      if (e.code === "KeyD") this.moveRight = false;
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.isPointerLocked) return;
      this.mouseMovement.x = e.movementX;
      this.mouseMovement.y = e.movementY;
    });

    this.canvas.addEventListener("click", () => {
      if (this.gameState === "title") {
        this.startGame();
        this.canvas.requestPointerLock();
      } else if (this.gameState === "gameover") {
        this.restartGame();
        this.canvas.requestPointerLock();
      } else if (this.gameState === "playing") {
        if (!this.isPointerLocked) {
          this.canvas.requestPointerLock();
        } else {
          this.shoot();
        }
      }
    });

    document.addEventListener("pointerlockchange", () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas;
    });

    window.addEventListener("resize", () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.camera.aspect = this.canvas.width / this.canvas.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.canvas.width, this.canvas.height);
    });
  }
  private showTitle() {
    this.gameState = "title";
  }
  private startGame() {
    this.gameState = "playing";
    this.createPlayer();
    this.spawnEnemies();
    const bgm = this.sounds.get("bgm");
    if (bgm) {
      bgm.loop = true;
      bgm.play().catch(() => {});
    }
  }
  private restartGame() {
    this.enemies.forEach((e) => {
      this.scene.remove(e.mesh);
      this.world.removeBody(e.body);
    });
    this.enemies = [];
    this.bullets.forEach((b) => {
      this.scene.remove(b.mesh);
      this.world.removeBody(b.body);
    });
    this.bullets = [];

    if (this.playerBody) {
      this.world.removeBody(this.playerBody);
    }

    this.enemiesKilled = 0;
    this.startGame();
  }
  private update(delta: number) {
    if (this.gameState !== "playing") return;
    this.world.step(1 / 60, delta, 3);

    this.updatePlayer(delta);
    this.updateEnemies(delta);
    this.updateBullets(delta);

    if (this.playerHealth <= 0 && this.gameState === "playing") {
      this.gameState = "gameover";
      const bgm = this.sounds.get("bgm");
      if (bgm) bgm.pause();

      const gameoverSound = this.sounds.get("gameover");
      if (gameoverSound) gameoverSound.play().catch(() => {});

      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    }
  }
  start() {
    let lastTime = performance.now();
    const animate = () => {
      requestAnimationFrame(animate);

      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      this.update(delta);
      this.renderer.render(this.scene, this.camera);
      this.drawUI();
    };

    animate();
  }
}
const game = new FPSGame();
game.init().then(() => game.start());
