import * as THREE from "three";
import * as CANNON from "cannon-es";
class FPSGame {
  constructor() {
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.canJump = false;
    this.euler = new THREE.Euler(0, 0, 0, "YXZ");
    this.lastShootTime = 0;
    this.enemies = [];
    this.bullets = [];
    this.textures = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.gameState = "title";
    this.enemiesKilled = 0;
    this.keys = /* @__PURE__ */ new Set();
    this.mouseMovement = { x: 0, y: 0 };
    this.isPointerLocked = false;
    this.canvas = document.getElementById("gameCanvas");
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(8900331);
    this.scene.fog = new THREE.Fog(8900331, 50, 200);
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.canvas.width / this.canvas.height,
      0.1,
      1e3
    );
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true
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
  async loadAssets() {
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
  setupLights() {
    const ambientLight = new THREE.AmbientLight(16777215, 0.6);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(16777215, 0.8);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    this.scene.add(dirLight);
  }
  createLevel() {
    const groundSize = this.data.level.groundSize;
    const wallHeight = this.data.level.wallHeight;
    const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 3836986,
      roughness: 0.8
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
        size: [groundSize, wallHeight, wallThickness]
      },
      {
        pos: [0, wallHeight / 2, groundSize / 2],
        rot: [0, 0, 0],
        size: [groundSize, wallHeight, wallThickness]
      },
      {
        pos: [-groundSize / 2, wallHeight / 2, 0],
        rot: [0, Math.PI / 2, 0],
        size: [groundSize, wallHeight, wallThickness]
      },
      {
        pos: [groundSize / 2, wallHeight / 2, 0],
        rot: [0, Math.PI / 2, 0],
        size: [groundSize, wallHeight, wallThickness]
      }
    ];
    wallPositions.forEach((wall) => {
      const wallGeo = new THREE.BoxGeometry(
        wall.size[0],
        wall.size[1],
        wall.size[2]
      );
      const wallMat = new THREE.MeshStandardMaterial({ color: 9127187 });
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
  createPlayer() {
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
    this.playerBody.addEventListener("collide", (e) => {
      const contact = e.contact;
      if (contact.ni.y > 0.5) {
        this.canJump = true;
      }
    });
  }
  spawnEnemies() {
    for (let i = 0; i < this.data.enemies.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = this.data.enemies.spawnRadius;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      this.createEnemy(x, 2, z);
    }
  }
  createEnemy(x, y, z) {
    const size = 2;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshStandardMaterial({
      map: this.textures.get("enemy") || null,
      color: 16729156
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
  shoot() {
    const now = Date.now();
    if (now - this.lastShootTime < 1e3 / this.data.player.fireRate) return;
    this.lastShootTime = now;
    const bulletSize = 0.2;
    const geo = new THREE.SphereGeometry(bulletSize);
    const mat = new THREE.MeshStandardMaterial({
      map: this.textures.get("bullet") || null,
      color: 16776960,
      emissive: 16776960
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
    body.position.copy(mesh.position);
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
      lifetime: 3
    });
    const shootSound = this.sounds.get("shoot");
    if (shootSound) {
      const cloned = shootSound.cloneNode();
      cloned.play().catch(() => {
      });
    }
  }
  updateEnemies(delta) {
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
      const dir = new THREE.Vector3().subVectors(playerPos, enemyPos).normalize();
      const speed = this.data.enemies.speed;
      enemy.body.velocity.x = dir.x * speed;
      enemy.body.velocity.z = dir.z * speed;
      enemy.mesh.position.copy(enemy.body.position);
      enemy.mesh.quaternion.copy(enemy.body.quaternion);
      const dist = enemyPos.distanceTo(playerPos);
      if (dist < 2 && Math.random() < 0.01) {
        this.playerHealth -= this.data.enemies.damage;
        const hitSound = this.sounds.get("hit");
        if (hitSound) {
          const cloned = hitSound.cloneNode();
          cloned.play().catch(() => {
          });
        }
      }
    });
  }
  updateBullets(delta) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.lifetime -= delta;
      bullet.mesh.position.copy(bullet.body.position);
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
              const cloned = killSound.cloneNode();
              cloned.play().catch(() => {
              });
            }
          }
          break;
        }
      }
    }
  }
  updatePlayer(delta) {
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
    this.camera.position.copy(this.playerBody.position);
    this.camera.position.y += this.data.player.height / 2;
    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= this.mouseMovement.x * this.data.player.mouseSensitivity;
    this.euler.x -= this.mouseMovement.y * this.data.player.mouseSensitivity;
    this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
    this.camera.quaternion.setFromEuler(this.euler);
    this.mouseMovement.x = 0;
    this.mouseMovement.y = 0;
  }
  drawUI() {
    const ctx = this.canvas.getContext("2d");
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
  setupEventListeners() {
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
  showTitle() {
    this.gameState = "title";
  }
  startGame() {
    this.gameState = "playing";
    this.createPlayer();
    this.spawnEnemies();
    const bgm = this.sounds.get("bgm");
    if (bgm) {
      bgm.loop = true;
      bgm.play().catch(() => {
      });
    }
  }
  restartGame() {
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
  update(delta) {
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
      if (gameoverSound) gameoverSound.play().catch(() => {
      });
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
      const delta = (now - lastTime) / 1e3;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSBcInRocmVlXCI7XHJcbmltcG9ydCAqIGFzIENBTk5PTiBmcm9tIFwiY2Fubm9uLWVzXCI7XHJcbmludGVyZmFjZSBHYW1lRGF0YSB7XHJcbiAgcGxheWVyOiB7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBqdW1wRm9yY2U6IG51bWJlcjtcclxuICAgIG1vdXNlU2Vuc2l0aXZpdHk6IG51bWJlcjtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgZ3VuRGFtYWdlOiBudW1iZXI7XHJcbiAgICBmaXJlUmF0ZTogbnVtYmVyO1xyXG4gIH07XHJcbiAgZW5lbWllczoge1xyXG4gICAgY291bnQ6IG51bWJlcjtcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgIHNwYXduUmFkaXVzOiBudW1iZXI7XHJcbiAgICBkYW1hZ2U6IG51bWJlcjtcclxuICB9O1xyXG4gIGxldmVsOiB7XHJcbiAgICBncm91bmRTaXplOiBudW1iZXI7XHJcbiAgICB3YWxsSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBncmF2aXR5OiBudW1iZXI7XHJcbiAgfTtcclxuICBhc3NldHM6IHtcclxuICAgIGltYWdlczogQXJyYXk8e1xyXG4gICAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICAgIHBhdGg6IHN0cmluZztcclxuICAgICAgd2lkdGg6IG51bWJlcjtcclxuICAgICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICB9PjtcclxuICAgIHNvdW5kczogQXJyYXk8e1xyXG4gICAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICAgIHBhdGg6IHN0cmluZztcclxuICAgICAgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyO1xyXG4gICAgICB2b2x1bWU6IG51bWJlcjtcclxuICAgIH0+O1xyXG4gIH07XHJcbn1cclxuY2xhc3MgRlBTR2FtZSB7XHJcbiAgcHJpdmF0ZSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gIHByaXZhdGUgc2NlbmU6IFRIUkVFLlNjZW5lO1xyXG4gIHByaXZhdGUgY2FtZXJhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYTtcclxuICBwcml2YXRlIHJlbmRlcmVyOiBUSFJFRS5XZWJHTFJlbmRlcmVyO1xyXG4gIHByaXZhdGUgd29ybGQ6IENBTk5PTi5Xb3JsZDtcclxuICBwcml2YXRlIGRhdGEhOiBHYW1lRGF0YTtcclxuICBwcml2YXRlIHBsYXllckJvZHkhOiBDQU5OT04uQm9keTtcclxuICBwcml2YXRlIHZlbG9jaXR5ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICBwcml2YXRlIGRpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgcHJpdmF0ZSBtb3ZlRm9yd2FyZCA9IGZhbHNlO1xyXG4gIHByaXZhdGUgbW92ZUJhY2t3YXJkID0gZmFsc2U7XHJcbiAgcHJpdmF0ZSBtb3ZlTGVmdCA9IGZhbHNlO1xyXG4gIHByaXZhdGUgbW92ZVJpZ2h0ID0gZmFsc2U7XHJcbiAgcHJpdmF0ZSBjYW5KdW1wID0gZmFsc2U7XHJcbiAgcHJpdmF0ZSBldWxlciA9IG5ldyBUSFJFRS5FdWxlcigwLCAwLCAwLCBcIllYWlwiKTtcclxuICBwcml2YXRlIGxhc3RTaG9vdFRpbWUgPSAwO1xyXG4gIHByaXZhdGUgZW5lbWllczogQXJyYXk8e1xyXG4gICAgbWVzaDogVEhSRUUuTWVzaDtcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5O1xyXG4gICAgaGVhbHRoOiBudW1iZXI7XHJcbiAgfT4gPSBbXTtcclxuICBwcml2YXRlIGJ1bGxldHM6IEFycmF5PHtcclxuICAgIG1lc2g6IFRIUkVFLk1lc2g7XHJcbiAgICBib2R5OiBDQU5OT04uQm9keTtcclxuICAgIGRhbWFnZTogbnVtYmVyO1xyXG4gICAgbGlmZXRpbWU6IG51bWJlcjtcclxuICB9PiA9IFtdO1xyXG4gIHByaXZhdGUgdGV4dHVyZXM6IE1hcDxzdHJpbmcsIFRIUkVFLlRleHR1cmU+ID0gbmV3IE1hcCgpO1xyXG4gIHByaXZhdGUgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICBwcml2YXRlIGdhbWVTdGF0ZTogXCJ0aXRsZVwiIHwgXCJwbGF5aW5nXCIgfCBcImdhbWVvdmVyXCIgPSBcInRpdGxlXCI7XHJcbiAgcHJpdmF0ZSBwbGF5ZXJIZWFsdGghOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBlbmVtaWVzS2lsbGVkID0gMDtcclxuICBwcml2YXRlIGtleXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xyXG4gIHByaXZhdGUgbW91c2VNb3ZlbWVudCA9IHsgeDogMCwgeTogMCB9O1xyXG4gIHByaXZhdGUgaXNQb2ludGVyTG9ja2VkID0gZmFsc2U7XHJcbiAgY29uc3RydWN0b3IoKSB7XHJcbiAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZ2FtZUNhbnZhc1wiKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHRoaXMuY2FudmFzLndpZHRoID0gd2luZG93LmlubmVyV2lkdGg7XHJcbiAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQ7XHJcbiAgICB0aGlzLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XHJcbiAgICB0aGlzLnNjZW5lLmJhY2tncm91bmQgPSBuZXcgVEhSRUUuQ29sb3IoMHg4N2NlZWIpO1xyXG4gICAgdGhpcy5zY2VuZS5mb2cgPSBuZXcgVEhSRUUuRm9nKDB4ODdjZWViLCA1MCwgMjAwKTtcclxuXHJcbiAgICB0aGlzLmNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYShcclxuICAgICAgNzUsXHJcbiAgICAgIHRoaXMuY2FudmFzLndpZHRoIC8gdGhpcy5jYW52YXMuaGVpZ2h0LFxyXG4gICAgICAwLjEsXHJcbiAgICAgIDEwMDBcclxuICAgICk7XHJcblxyXG4gICAgdGhpcy5yZW5kZXJlciA9IG5ldyBUSFJFRS5XZWJHTFJlbmRlcmVyKHtcclxuICAgICAgY2FudmFzOiB0aGlzLmNhbnZhcyxcclxuICAgICAgYW50aWFsaWFzOiB0cnVlLFxyXG4gICAgfSk7XHJcbiAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUodGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC5lbmFibGVkID0gdHJ1ZTtcclxuXHJcbiAgICB0aGlzLndvcmxkID0gbmV3IENBTk5PTi5Xb3JsZCgpO1xyXG5cclxuICAgIHRoaXMuc2V0dXBFdmVudExpc3RlbmVycygpO1xyXG4gIH1cclxuICBhc3luYyBpbml0KCkge1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChcImRhdGEuanNvblwiKTtcclxuICAgIHRoaXMuZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG5cclxuICAgIHRoaXMud29ybGQuZ3Jhdml0eS5zZXQoMCwgdGhpcy5kYXRhLmxldmVsLmdyYXZpdHksIDApO1xyXG5cclxuICAgIHRoaXMuc2V0dXBMaWdodHMoKTtcclxuICAgIHRoaXMuY3JlYXRlTGV2ZWwoKTtcclxuXHJcbiAgICB0aGlzLnNob3dUaXRsZSgpO1xyXG4gIH1cclxuICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKSB7XHJcbiAgICBjb25zdCB0ZXh0dXJlTG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKTtcclxuICAgIGZvciAoY29uc3QgaW1nIG9mIHRoaXMuZGF0YS5hc3NldHMuaW1hZ2VzKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgdGV4dHVyZSA9IGF3YWl0IHRleHR1cmVMb2FkZXIubG9hZEFzeW5jKGltZy5wYXRoKTtcclxuICAgICAgICB0aGlzLnRleHR1cmVzLnNldChpbWcubmFtZSwgdGV4dHVyZSk7XHJcbiAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICBjb25zb2xlLndhcm4oYENvdWxkIG5vdCBsb2FkIHRleHR1cmU6ICR7aW1nLnBhdGh9YCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmb3IgKGNvbnN0IHNuZCBvZiB0aGlzLmRhdGEuYXNzZXRzLnNvdW5kcykge1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKHNuZC5wYXRoKTtcclxuICAgICAgICBhdWRpby52b2x1bWUgPSBzbmQudm9sdW1lO1xyXG4gICAgICAgIHRoaXMuc291bmRzLnNldChzbmQubmFtZSwgYXVkaW8pO1xyXG4gICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgY29uc29sZS53YXJuKGBDb3VsZCBub3QgbG9hZCBzb3VuZDogJHtzbmQucGF0aH1gKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuICBwcml2YXRlIHNldHVwTGlnaHRzKCkge1xyXG4gICAgY29uc3QgYW1iaWVudExpZ2h0ID0gbmV3IFRIUkVFLkFtYmllbnRMaWdodCgweGZmZmZmZiwgMC42KTtcclxuICAgIHRoaXMuc2NlbmUuYWRkKGFtYmllbnRMaWdodCk7XHJcbiAgICBjb25zdCBkaXJMaWdodCA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KDB4ZmZmZmZmLCAwLjgpO1xyXG4gICAgZGlyTGlnaHQucG9zaXRpb24uc2V0KDUwLCAxMDAsIDUwKTtcclxuICAgIGRpckxpZ2h0LmNhc3RTaGFkb3cgPSB0cnVlO1xyXG4gICAgZGlyTGlnaHQuc2hhZG93LmNhbWVyYS5sZWZ0ID0gLTEwMDtcclxuICAgIGRpckxpZ2h0LnNoYWRvdy5jYW1lcmEucmlnaHQgPSAxMDA7XHJcbiAgICBkaXJMaWdodC5zaGFkb3cuY2FtZXJhLnRvcCA9IDEwMDtcclxuICAgIGRpckxpZ2h0LnNoYWRvdy5jYW1lcmEuYm90dG9tID0gLTEwMDtcclxuICAgIHRoaXMuc2NlbmUuYWRkKGRpckxpZ2h0KTtcclxuICB9XHJcbiAgcHJpdmF0ZSBjcmVhdGVMZXZlbCgpIHtcclxuICAgIGNvbnN0IGdyb3VuZFNpemUgPSB0aGlzLmRhdGEubGV2ZWwuZ3JvdW5kU2l6ZTtcclxuICAgIGNvbnN0IHdhbGxIZWlnaHQgPSB0aGlzLmRhdGEubGV2ZWwud2FsbEhlaWdodDtcclxuICAgIGNvbnN0IGdyb3VuZEdlbyA9IG5ldyBUSFJFRS5QbGFuZUdlb21ldHJ5KGdyb3VuZFNpemUsIGdyb3VuZFNpemUpO1xyXG4gICAgY29uc3QgZ3JvdW5kTWF0ID0gbmV3IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsKHtcclxuICAgICAgY29sb3I6IDB4M2E4YzNhLFxyXG4gICAgICByb3VnaG5lc3M6IDAuOCxcclxuICAgIH0pO1xyXG4gICAgY29uc3QgZ3JvdW5kID0gbmV3IFRIUkVFLk1lc2goZ3JvdW5kR2VvLCBncm91bmRNYXQpO1xyXG4gICAgZ3JvdW5kLnJvdGF0aW9uLnggPSAtTWF0aC5QSSAvIDI7XHJcbiAgICBncm91bmQucmVjZWl2ZVNoYWRvdyA9IHRydWU7XHJcbiAgICB0aGlzLnNjZW5lLmFkZChncm91bmQpO1xyXG5cclxuICAgIGNvbnN0IGdyb3VuZFNoYXBlID0gbmV3IENBTk5PTi5QbGFuZSgpO1xyXG4gICAgY29uc3QgZ3JvdW5kQm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAgfSk7XHJcbiAgICBncm91bmRCb2R5LmFkZFNoYXBlKGdyb3VuZFNoYXBlKTtcclxuICAgIGdyb3VuZEJvZHkucXVhdGVybmlvbi5zZXRGcm9tRXVsZXIoLU1hdGguUEkgLyAyLCAwLCAwKTtcclxuICAgIHRoaXMud29ybGQuYWRkQm9keShncm91bmRCb2R5KTtcclxuXHJcbiAgICBjb25zdCB3YWxsVGhpY2tuZXNzID0gMjtcclxuICAgIGNvbnN0IHdhbGxQb3NpdGlvbnMgPSBbXHJcbiAgICAgIHtcclxuICAgICAgICBwb3M6IFswLCB3YWxsSGVpZ2h0IC8gMiwgLWdyb3VuZFNpemUgLyAyXSxcclxuICAgICAgICByb3Q6IFswLCAwLCAwXSxcclxuICAgICAgICBzaXplOiBbZ3JvdW5kU2l6ZSwgd2FsbEhlaWdodCwgd2FsbFRoaWNrbmVzc10sXHJcbiAgICAgIH0sXHJcbiAgICAgIHtcclxuICAgICAgICBwb3M6IFswLCB3YWxsSGVpZ2h0IC8gMiwgZ3JvdW5kU2l6ZSAvIDJdLFxyXG4gICAgICAgIHJvdDogWzAsIDAsIDBdLFxyXG4gICAgICAgIHNpemU6IFtncm91bmRTaXplLCB3YWxsSGVpZ2h0LCB3YWxsVGhpY2tuZXNzXSxcclxuICAgICAgfSxcclxuICAgICAge1xyXG4gICAgICAgIHBvczogWy1ncm91bmRTaXplIC8gMiwgd2FsbEhlaWdodCAvIDIsIDBdLFxyXG4gICAgICAgIHJvdDogWzAsIE1hdGguUEkgLyAyLCAwXSxcclxuICAgICAgICBzaXplOiBbZ3JvdW5kU2l6ZSwgd2FsbEhlaWdodCwgd2FsbFRoaWNrbmVzc10sXHJcbiAgICAgIH0sXHJcbiAgICAgIHtcclxuICAgICAgICBwb3M6IFtncm91bmRTaXplIC8gMiwgd2FsbEhlaWdodCAvIDIsIDBdLFxyXG4gICAgICAgIHJvdDogWzAsIE1hdGguUEkgLyAyLCAwXSxcclxuICAgICAgICBzaXplOiBbZ3JvdW5kU2l6ZSwgd2FsbEhlaWdodCwgd2FsbFRoaWNrbmVzc10sXHJcbiAgICAgIH0sXHJcbiAgICBdO1xyXG5cclxuICAgIHdhbGxQb3NpdGlvbnMuZm9yRWFjaCgod2FsbCkgPT4ge1xyXG4gICAgICBjb25zdCB3YWxsR2VvID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KFxyXG4gICAgICAgIHdhbGwuc2l6ZVswXSxcclxuICAgICAgICB3YWxsLnNpemVbMV0sXHJcbiAgICAgICAgd2FsbC5zaXplWzJdXHJcbiAgICAgICk7XHJcbiAgICAgIGNvbnN0IHdhbGxNYXQgPSBuZXcgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwoeyBjb2xvcjogMHg4YjQ1MTMgfSk7XHJcbiAgICAgIGNvbnN0IHdhbGxNZXNoID0gbmV3IFRIUkVFLk1lc2god2FsbEdlbywgd2FsbE1hdCk7XHJcbiAgICAgIHdhbGxNZXNoLnBvc2l0aW9uLnNldCh3YWxsLnBvc1swXSwgd2FsbC5wb3NbMV0sIHdhbGwucG9zWzJdKTtcclxuICAgICAgd2FsbE1lc2gucm90YXRpb24ueSA9IHdhbGwucm90WzFdO1xyXG4gICAgICB3YWxsTWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgICAgd2FsbE1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7XHJcbiAgICAgIHRoaXMuc2NlbmUuYWRkKHdhbGxNZXNoKTtcclxuXHJcbiAgICAgIGNvbnN0IHdhbGxTaGFwZSA9IG5ldyBDQU5OT04uQm94KFxyXG4gICAgICAgIG5ldyBDQU5OT04uVmVjMyh3YWxsLnNpemVbMF0gLyAyLCB3YWxsLnNpemVbMV0gLyAyLCB3YWxsLnNpemVbMl0gLyAyKVxyXG4gICAgICApO1xyXG4gICAgICBjb25zdCB3YWxsQm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAgfSk7XHJcbiAgICAgIHdhbGxCb2R5LmFkZFNoYXBlKHdhbGxTaGFwZSk7XHJcbiAgICAgIHdhbGxCb2R5LnBvc2l0aW9uLnNldCh3YWxsLnBvc1swXSwgd2FsbC5wb3NbMV0sIHdhbGwucG9zWzJdKTtcclxuICAgICAgd2FsbEJvZHkucXVhdGVybmlvbi5zZXRGcm9tRXVsZXIoMCwgd2FsbC5yb3RbMV0sIDApO1xyXG4gICAgICB0aGlzLndvcmxkLmFkZEJvZHkod2FsbEJvZHkpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIHByaXZhdGUgY3JlYXRlUGxheWVyKCkge1xyXG4gICAgY29uc3QgcmFkaXVzID0gMC41O1xyXG4gICAgY29uc3QgaGVpZ2h0ID0gdGhpcy5kYXRhLnBsYXllci5oZWlnaHQ7XHJcbiAgICBjb25zdCBzaGFwZSA9IG5ldyBDQU5OT04uQ3lsaW5kZXIocmFkaXVzLCByYWRpdXMsIGhlaWdodCwgOCk7XHJcbiAgICB0aGlzLnBsYXllckJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiA4MCB9KTtcclxuICAgIHRoaXMucGxheWVyQm9keS5hZGRTaGFwZShzaGFwZSk7XHJcbiAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24uc2V0KDAsIGhlaWdodCwgMCk7XHJcbiAgICB0aGlzLnBsYXllckJvZHkubGluZWFyRGFtcGluZyA9IDAuOTtcclxuICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLnBsYXllckJvZHkpO1xyXG5cclxuICAgIHRoaXMuY2FtZXJhLnBvc2l0aW9uLnNldCgwLCBoZWlnaHQsIDApO1xyXG4gICAgdGhpcy5zY2VuZS5hZGQodGhpcy5jYW1lcmEpO1xyXG4gICAgdGhpcy5wbGF5ZXJIZWFsdGggPSB0aGlzLmRhdGEucGxheWVyLmhlYWx0aDtcclxuXHJcbiAgICB0aGlzLnBsYXllckJvZHkuYWRkRXZlbnRMaXN0ZW5lcihcImNvbGxpZGVcIiwgKGU6IGFueSkgPT4ge1xyXG4gICAgICBjb25zdCBjb250YWN0ID0gZS5jb250YWN0O1xyXG4gICAgICBpZiAoY29udGFjdC5uaS55ID4gMC41KSB7XHJcbiAgICAgICAgdGhpcy5jYW5KdW1wID0gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG4gIHByaXZhdGUgc3Bhd25FbmVtaWVzKCkge1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmRhdGEuZW5lbWllcy5jb3VudDsgaSsrKSB7XHJcbiAgICAgIGNvbnN0IGFuZ2xlID0gTWF0aC5yYW5kb20oKSAqIE1hdGguUEkgKiAyO1xyXG4gICAgICBjb25zdCByYWRpdXMgPSB0aGlzLmRhdGEuZW5lbWllcy5zcGF3blJhZGl1cztcclxuICAgICAgY29uc3QgeCA9IE1hdGguY29zKGFuZ2xlKSAqIHJhZGl1cztcclxuICAgICAgY29uc3QgeiA9IE1hdGguc2luKGFuZ2xlKSAqIHJhZGl1cztcclxuICAgICAgdGhpcy5jcmVhdGVFbmVteSh4LCAyLCB6KTtcclxuICAgIH1cclxuICB9XHJcbiAgcHJpdmF0ZSBjcmVhdGVFbmVteSh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyKSB7XHJcbiAgICBjb25zdCBzaXplID0gMjtcclxuICAgIGNvbnN0IGdlbyA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeShzaXplLCBzaXplLCBzaXplKTtcclxuICAgIGNvbnN0IG1hdCA9IG5ldyBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCh7XHJcbiAgICAgIG1hcDogdGhpcy50ZXh0dXJlcy5nZXQoXCJlbmVteVwiKSB8fCBudWxsLFxyXG4gICAgICBjb2xvcjogMHhmZjQ0NDQsXHJcbiAgICB9KTtcclxuICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW8sIG1hdCk7XHJcbiAgICBtZXNoLnBvc2l0aW9uLnNldCh4LCB5LCB6KTtcclxuICAgIG1lc2guY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgICB0aGlzLnNjZW5lLmFkZChtZXNoKTtcclxuICAgIGNvbnN0IHNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKHNpemUgLyAyLCBzaXplIC8gMiwgc2l6ZSAvIDIpKTtcclxuICAgIGNvbnN0IGJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiA1MCB9KTtcclxuICAgIGJvZHkuYWRkU2hhcGUoc2hhcGUpO1xyXG4gICAgYm9keS5wb3NpdGlvbi5zZXQoeCwgeSwgeik7XHJcbiAgICB0aGlzLndvcmxkLmFkZEJvZHkoYm9keSk7XHJcblxyXG4gICAgdGhpcy5lbmVtaWVzLnB1c2goeyBtZXNoLCBib2R5LCBoZWFsdGg6IHRoaXMuZGF0YS5lbmVtaWVzLmhlYWx0aCB9KTtcclxuICB9XHJcbiAgcHJpdmF0ZSBzaG9vdCgpIHtcclxuICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XHJcbiAgICBpZiAobm93IC0gdGhpcy5sYXN0U2hvb3RUaW1lIDwgMTAwMCAvIHRoaXMuZGF0YS5wbGF5ZXIuZmlyZVJhdGUpIHJldHVybjtcclxuICAgIHRoaXMubGFzdFNob290VGltZSA9IG5vdztcclxuICAgIGNvbnN0IGJ1bGxldFNpemUgPSAwLjI7XHJcbiAgICBjb25zdCBnZW8gPSBuZXcgVEhSRUUuU3BoZXJlR2VvbWV0cnkoYnVsbGV0U2l6ZSk7XHJcbiAgICBjb25zdCBtYXQgPSBuZXcgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwoe1xyXG4gICAgICBtYXA6IHRoaXMudGV4dHVyZXMuZ2V0KFwiYnVsbGV0XCIpIHx8IG51bGwsXHJcbiAgICAgIGNvbG9yOiAweGZmZmYwMCxcclxuICAgICAgZW1pc3NpdmU6IDB4ZmZmZjAwLFxyXG4gICAgfSk7XHJcbiAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvLCBtYXQpO1xyXG5cclxuICAgIGNvbnN0IHNwYXduRGlzdCA9IDI7XHJcbiAgICBjb25zdCBkaXIgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAtMSk7XHJcbiAgICBkaXIuYXBwbHlRdWF0ZXJuaW9uKHRoaXMuY2FtZXJhLnF1YXRlcm5pb24pO1xyXG5cclxuICAgIG1lc2gucG9zaXRpb24uY29weSh0aGlzLmNhbWVyYS5wb3NpdGlvbikuYWRkKGRpci5tdWx0aXBseVNjYWxhcihzcGF3bkRpc3QpKTtcclxuICAgIHRoaXMuc2NlbmUuYWRkKG1lc2gpO1xyXG5cclxuICAgIGNvbnN0IHNoYXBlID0gbmV3IENBTk5PTi5TcGhlcmUoYnVsbGV0U2l6ZSk7XHJcbiAgICBjb25zdCBib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHsgbWFzczogMSB9KTtcclxuICAgIGJvZHkuYWRkU2hhcGUoc2hhcGUpO1xyXG4gICAgYm9keS5wb3NpdGlvbi5jb3B5KG1lc2gucG9zaXRpb24gYXMgYW55KTtcclxuXHJcbiAgICBjb25zdCBzaG9vdERpciA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIC0xKTtcclxuICAgIHNob290RGlyLmFwcGx5UXVhdGVybmlvbih0aGlzLmNhbWVyYS5xdWF0ZXJuaW9uKTtcclxuICAgIGNvbnN0IHNwZWVkID0gNTA7XHJcbiAgICBib2R5LnZlbG9jaXR5LnNldChcclxuICAgICAgc2hvb3REaXIueCAqIHNwZWVkLFxyXG4gICAgICBzaG9vdERpci55ICogc3BlZWQsXHJcbiAgICAgIHNob290RGlyLnogKiBzcGVlZFxyXG4gICAgKTtcclxuXHJcbiAgICB0aGlzLndvcmxkLmFkZEJvZHkoYm9keSk7XHJcblxyXG4gICAgdGhpcy5idWxsZXRzLnB1c2goe1xyXG4gICAgICBtZXNoLFxyXG4gICAgICBib2R5LFxyXG4gICAgICBkYW1hZ2U6IHRoaXMuZGF0YS5wbGF5ZXIuZ3VuRGFtYWdlLFxyXG4gICAgICBsaWZldGltZTogMyxcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IHNob290U291bmQgPSB0aGlzLnNvdW5kcy5nZXQoXCJzaG9vdFwiKTtcclxuICAgIGlmIChzaG9vdFNvdW5kKSB7XHJcbiAgICAgIGNvbnN0IGNsb25lZCA9IHNob290U291bmQuY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcclxuICAgICAgY2xvbmVkLnBsYXkoKS5jYXRjaCgoKSA9PiB7fSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHByaXZhdGUgdXBkYXRlRW5lbWllcyhkZWx0YTogbnVtYmVyKSB7XHJcbiAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaCgoZW5lbXkpID0+IHtcclxuICAgICAgY29uc3QgZW5lbXlQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMyhcclxuICAgICAgICBlbmVteS5ib2R5LnBvc2l0aW9uLngsXHJcbiAgICAgICAgZW5lbXkuYm9keS5wb3NpdGlvbi55LFxyXG4gICAgICAgIGVuZW15LmJvZHkucG9zaXRpb24uelxyXG4gICAgICApO1xyXG4gICAgICBjb25zdCBwbGF5ZXJQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMyhcclxuICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueCxcclxuICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueSxcclxuICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24uelxyXG4gICAgICApO1xyXG4gICAgICBjb25zdCBkaXIgPSBuZXcgVEhSRUUuVmVjdG9yMygpXHJcbiAgICAgICAgLnN1YlZlY3RvcnMocGxheWVyUG9zLCBlbmVteVBvcylcclxuICAgICAgICAubm9ybWFsaXplKCk7XHJcbiAgICAgIGNvbnN0IHNwZWVkID0gdGhpcy5kYXRhLmVuZW1pZXMuc3BlZWQ7XHJcbiAgICAgIGVuZW15LmJvZHkudmVsb2NpdHkueCA9IGRpci54ICogc3BlZWQ7XHJcbiAgICAgIGVuZW15LmJvZHkudmVsb2NpdHkueiA9IGRpci56ICogc3BlZWQ7XHJcblxyXG4gICAgICBlbmVteS5tZXNoLnBvc2l0aW9uLmNvcHkoZW5lbXkuYm9keS5wb3NpdGlvbiBhcyBhbnkpO1xyXG4gICAgICBlbmVteS5tZXNoLnF1YXRlcm5pb24uY29weShlbmVteS5ib2R5LnF1YXRlcm5pb24gYXMgYW55KTtcclxuXHJcbiAgICAgIGNvbnN0IGRpc3QgPSBlbmVteVBvcy5kaXN0YW5jZVRvKHBsYXllclBvcyk7XHJcbiAgICAgIGlmIChkaXN0IDwgMiAmJiBNYXRoLnJhbmRvbSgpIDwgMC4wMSkge1xyXG4gICAgICAgIHRoaXMucGxheWVySGVhbHRoIC09IHRoaXMuZGF0YS5lbmVtaWVzLmRhbWFnZTtcclxuICAgICAgICBjb25zdCBoaXRTb3VuZCA9IHRoaXMuc291bmRzLmdldChcImhpdFwiKTtcclxuICAgICAgICBpZiAoaGl0U291bmQpIHtcclxuICAgICAgICAgIGNvbnN0IGNsb25lZCA9IGhpdFNvdW5kLmNsb25lTm9kZSgpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XHJcbiAgICAgICAgICBjbG9uZWQucGxheSgpLmNhdGNoKCgpID0+IHt9KTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuICBwcml2YXRlIHVwZGF0ZUJ1bGxldHMoZGVsdGE6IG51bWJlcikge1xyXG4gICAgZm9yIChsZXQgaSA9IHRoaXMuYnVsbGV0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICBjb25zdCBidWxsZXQgPSB0aGlzLmJ1bGxldHNbaV07XHJcbiAgICAgIGJ1bGxldC5saWZldGltZSAtPSBkZWx0YTtcclxuICAgICAgYnVsbGV0Lm1lc2gucG9zaXRpb24uY29weShidWxsZXQuYm9keS5wb3NpdGlvbiBhcyBhbnkpO1xyXG5cclxuICAgICAgaWYgKGJ1bGxldC5saWZldGltZSA8PSAwKSB7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5yZW1vdmUoYnVsbGV0Lm1lc2gpO1xyXG4gICAgICAgIHRoaXMud29ybGQucmVtb3ZlQm9keShidWxsZXQuYm9keSk7XHJcbiAgICAgICAgdGhpcy5idWxsZXRzLnNwbGljZShpLCAxKTtcclxuICAgICAgICBjb250aW51ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgZm9yIChsZXQgaiA9IHRoaXMuZW5lbWllcy5sZW5ndGggLSAxOyBqID49IDA7IGotLSkge1xyXG4gICAgICAgIGNvbnN0IGVuZW15ID0gdGhpcy5lbmVtaWVzW2pdO1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldFBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKFxyXG4gICAgICAgICAgYnVsbGV0LmJvZHkucG9zaXRpb24ueCxcclxuICAgICAgICAgIGJ1bGxldC5ib2R5LnBvc2l0aW9uLnksXHJcbiAgICAgICAgICBidWxsZXQuYm9keS5wb3NpdGlvbi56XHJcbiAgICAgICAgKTtcclxuICAgICAgICBjb25zdCBlbmVteVBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKFxyXG4gICAgICAgICAgZW5lbXkuYm9keS5wb3NpdGlvbi54LFxyXG4gICAgICAgICAgZW5lbXkuYm9keS5wb3NpdGlvbi55LFxyXG4gICAgICAgICAgZW5lbXkuYm9keS5wb3NpdGlvbi56XHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgaWYgKGJ1bGxldFBvcy5kaXN0YW5jZVRvKGVuZW15UG9zKSA8IDEuNSkge1xyXG4gICAgICAgICAgZW5lbXkuaGVhbHRoIC09IGJ1bGxldC5kYW1hZ2U7XHJcblxyXG4gICAgICAgICAgdGhpcy5zY2VuZS5yZW1vdmUoYnVsbGV0Lm1lc2gpO1xyXG4gICAgICAgICAgdGhpcy53b3JsZC5yZW1vdmVCb2R5KGJ1bGxldC5ib2R5KTtcclxuICAgICAgICAgIHRoaXMuYnVsbGV0cy5zcGxpY2UoaSwgMSk7XHJcblxyXG4gICAgICAgICAgaWYgKGVuZW15LmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2NlbmUucmVtb3ZlKGVuZW15Lm1lc2gpO1xyXG4gICAgICAgICAgICB0aGlzLndvcmxkLnJlbW92ZUJvZHkoZW5lbXkuYm9keSk7XHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllcy5zcGxpY2UoaiwgMSk7XHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllc0tpbGxlZCsrO1xyXG5cclxuICAgICAgICAgICAgY29uc3Qga2lsbFNvdW5kID0gdGhpcy5zb3VuZHMuZ2V0KFwia2lsbFwiKTtcclxuICAgICAgICAgICAgaWYgKGtpbGxTb3VuZCkge1xyXG4gICAgICAgICAgICAgIGNvbnN0IGNsb25lZCA9IGtpbGxTb3VuZC5jbG9uZU5vZGUoKSBhcyBIVE1MQXVkaW9FbGVtZW50O1xyXG4gICAgICAgICAgICAgIGNsb25lZC5wbGF5KCkuY2F0Y2goKCkgPT4ge30pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG4gIHByaXZhdGUgdXBkYXRlUGxheWVyKGRlbHRhOiBudW1iZXIpIHtcclxuICAgIGNvbnN0IHNwZWVkID0gdGhpcy5kYXRhLnBsYXllci5zcGVlZDtcclxuICAgIHRoaXMuZGlyZWN0aW9uLnogPSBOdW1iZXIodGhpcy5tb3ZlRm9yd2FyZCkgLSBOdW1iZXIodGhpcy5tb3ZlQmFja3dhcmQpO1xyXG4gICAgdGhpcy5kaXJlY3Rpb24ueCA9IE51bWJlcih0aGlzLm1vdmVSaWdodCkgLSBOdW1iZXIodGhpcy5tb3ZlTGVmdCk7XHJcbiAgICB0aGlzLmRpcmVjdGlvbi5ub3JtYWxpemUoKTtcclxuXHJcbiAgICB0aGlzLnZlbG9jaXR5LnNldCgwLCB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueSwgMCk7XHJcblxyXG4gICAgaWYgKHRoaXMubW92ZUZvcndhcmQgfHwgdGhpcy5tb3ZlQmFja3dhcmQpIHtcclxuICAgICAgY29uc3QgZm9yd2FyZCA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIC0xKTtcclxuICAgICAgZm9yd2FyZC5hcHBseVF1YXRlcm5pb24odGhpcy5jYW1lcmEucXVhdGVybmlvbik7XHJcbiAgICAgIGZvcndhcmQueSA9IDA7XHJcbiAgICAgIGZvcndhcmQubm9ybWFsaXplKCk7XHJcbiAgICAgIHRoaXMudmVsb2NpdHkuYWRkKGZvcndhcmQubXVsdGlwbHlTY2FsYXIodGhpcy5kaXJlY3Rpb24ueiAqIHNwZWVkKSk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMubW92ZUxlZnQgfHwgdGhpcy5tb3ZlUmlnaHQpIHtcclxuICAgICAgY29uc3QgcmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygxLCAwLCAwKTtcclxuICAgICAgcmlnaHQuYXBwbHlRdWF0ZXJuaW9uKHRoaXMuY2FtZXJhLnF1YXRlcm5pb24pO1xyXG4gICAgICByaWdodC55ID0gMDtcclxuICAgICAgcmlnaHQubm9ybWFsaXplKCk7XHJcbiAgICAgIHRoaXMudmVsb2NpdHkuYWRkKHJpZ2h0Lm11bHRpcGx5U2NhbGFyKHRoaXMuZGlyZWN0aW9uLnggKiBzcGVlZCkpO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ID0gdGhpcy52ZWxvY2l0eS54O1xyXG4gICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSB0aGlzLnZlbG9jaXR5Lno7XHJcblxyXG4gICAgdGhpcy5jYW1lcmEucG9zaXRpb24uY29weSh0aGlzLnBsYXllckJvZHkucG9zaXRpb24gYXMgYW55KTtcclxuICAgIHRoaXMuY2FtZXJhLnBvc2l0aW9uLnkgKz0gdGhpcy5kYXRhLnBsYXllci5oZWlnaHQgLyAyO1xyXG5cclxuICAgIHRoaXMuZXVsZXIuc2V0RnJvbVF1YXRlcm5pb24odGhpcy5jYW1lcmEucXVhdGVybmlvbik7XHJcbiAgICB0aGlzLmV1bGVyLnkgLT0gdGhpcy5tb3VzZU1vdmVtZW50LnggKiB0aGlzLmRhdGEucGxheWVyLm1vdXNlU2Vuc2l0aXZpdHk7XHJcbiAgICB0aGlzLmV1bGVyLnggLT0gdGhpcy5tb3VzZU1vdmVtZW50LnkgKiB0aGlzLmRhdGEucGxheWVyLm1vdXNlU2Vuc2l0aXZpdHk7XHJcbiAgICB0aGlzLmV1bGVyLnggPSBNYXRoLm1heCgtTWF0aC5QSSAvIDIsIE1hdGgubWluKE1hdGguUEkgLyAyLCB0aGlzLmV1bGVyLngpKTtcclxuICAgIHRoaXMuY2FtZXJhLnF1YXRlcm5pb24uc2V0RnJvbUV1bGVyKHRoaXMuZXVsZXIpO1xyXG5cclxuICAgIHRoaXMubW91c2VNb3ZlbWVudC54ID0gMDtcclxuICAgIHRoaXMubW91c2VNb3ZlbWVudC55ID0gMDtcclxuICB9XHJcbiAgcHJpdmF0ZSBkcmF3VUkoKSB7XHJcbiAgICBjb25zdCBjdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KFwiMmRcIikhO1xyXG4gICAgY3R4LnNhdmUoKTtcclxuICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gXCJ0aXRsZVwiKSB7XHJcbiAgICAgIGN0eC5maWxsU3R5bGUgPSBcInJnYmEoMCwgMCwgMCwgMC43KVwiO1xyXG4gICAgICBjdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICBjdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xyXG4gICAgICBjdHguZm9udCA9IFwiYm9sZCA2MHB4IEFyaWFsXCI7XHJcbiAgICAgIGN0eC50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xyXG4gICAgICBjdHguZmlsbFRleHQoXHJcbiAgICAgICAgXCJGUFMgU0hPT1RFUlwiLFxyXG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoIC8gMixcclxuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTBcclxuICAgICAgKTtcclxuXHJcbiAgICAgIGN0eC5mb250ID0gXCIzMHB4IEFyaWFsXCI7XHJcbiAgICAgIGN0eC5maWxsVGV4dChcclxuICAgICAgICBcIkNsaWNrIHRvIFN0YXJ0XCIsXHJcbiAgICAgICAgdGhpcy5jYW52YXMud2lkdGggLyAyLFxyXG4gICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MFxyXG4gICAgICApO1xyXG5cclxuICAgICAgY3R4LmZvbnQgPSBcIjIwcHggQXJpYWxcIjtcclxuICAgICAgY3R4LmZpbGxUZXh0KFxyXG4gICAgICAgIFwiV0FTRDogTW92ZSB8IE1vdXNlOiBMb29rIHwgQ2xpY2s6IFNob290IHwgU3BhY2U6IEp1bXBcIixcclxuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCAvIDIsXHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDEyMFxyXG4gICAgICApO1xyXG4gICAgfSBlbHNlIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gXCJwbGF5aW5nXCIpIHtcclxuICAgICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcclxuICAgICAgY3R4LmZvbnQgPSBcImJvbGQgMjRweCBBcmlhbFwiO1xyXG4gICAgICBjdHgudGV4dEFsaWduID0gXCJsZWZ0XCI7XHJcbiAgICAgIGN0eC5maWxsVGV4dChcclxuICAgICAgICBgSGVhbHRoOiAke01hdGgubWF4KDAsIE1hdGgucm91bmQodGhpcy5wbGF5ZXJIZWFsdGgpKX1gLFxyXG4gICAgICAgIDIwLFxyXG4gICAgICAgIDQwXHJcbiAgICAgICk7XHJcbiAgICAgIGN0eC5maWxsVGV4dChgS2lsbHM6ICR7dGhpcy5lbmVtaWVzS2lsbGVkfWAsIDIwLCA3NSk7XHJcblxyXG4gICAgICBjdHguc3Ryb2tlU3R5bGUgPSBcIndoaXRlXCI7XHJcbiAgICAgIGN0eC5saW5lV2lkdGggPSAyO1xyXG4gICAgICBjb25zdCBjZW50ZXJYID0gdGhpcy5jYW52YXMud2lkdGggLyAyO1xyXG4gICAgICBjb25zdCBjZW50ZXJZID0gdGhpcy5jYW52YXMuaGVpZ2h0IC8gMjtcclxuICAgICAgY3R4LmJlZ2luUGF0aCgpO1xyXG4gICAgICBjdHgubW92ZVRvKGNlbnRlclggLSAxMCwgY2VudGVyWSk7XHJcbiAgICAgIGN0eC5saW5lVG8oY2VudGVyWCArIDEwLCBjZW50ZXJZKTtcclxuICAgICAgY3R4LnN0cm9rZSgpO1xyXG4gICAgICBjdHguYmVnaW5QYXRoKCk7XHJcbiAgICAgIGN0eC5tb3ZlVG8oY2VudGVyWCwgY2VudGVyWSAtIDEwKTtcclxuICAgICAgY3R4LmxpbmVUbyhjZW50ZXJYLCBjZW50ZXJZICsgMTApO1xyXG4gICAgICBjdHguc3Ryb2tlKCk7XHJcbiAgICB9IGVsc2UgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBcImdhbWVvdmVyXCIpIHtcclxuICAgICAgY3R4LmZpbGxTdHlsZSA9IFwicmdiYSgwLCAwLCAwLCAwLjgpXCI7XHJcbiAgICAgIGN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgIGN0eC5maWxsU3R5bGUgPSBcInJlZFwiO1xyXG4gICAgICBjdHguZm9udCA9IFwiYm9sZCA2MHB4IEFyaWFsXCI7XHJcbiAgICAgIGN0eC50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xyXG4gICAgICBjdHguZmlsbFRleHQoXHJcbiAgICAgICAgXCJHQU1FIE9WRVJcIixcclxuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCAvIDIsXHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwXHJcbiAgICAgICk7XHJcblxyXG4gICAgICBjdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xyXG4gICAgICBjdHguZm9udCA9IFwiMzBweCBBcmlhbFwiO1xyXG4gICAgICBjdHguZmlsbFRleHQoXHJcbiAgICAgICAgYEVuZW1pZXMgS2lsbGVkOiAke3RoaXMuZW5lbWllc0tpbGxlZH1gLFxyXG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoIC8gMixcclxuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMjBcclxuICAgICAgKTtcclxuICAgICAgY3R4LmZpbGxUZXh0KFxyXG4gICAgICAgIFwiQ2xpY2sgdG8gUmVzdGFydFwiLFxyXG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoIC8gMixcclxuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgODBcclxuICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICBjdHgucmVzdG9yZSgpO1xyXG4gIH1cclxuICBwcml2YXRlIHNldHVwRXZlbnRMaXN0ZW5lcnMoKSB7XHJcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZSkgPT4ge1xyXG4gICAgICB0aGlzLmtleXMuYWRkKGUuY29kZSk7XHJcbiAgICAgIGlmIChlLmNvZGUgPT09IFwiS2V5V1wiKSB0aGlzLm1vdmVGb3J3YXJkID0gdHJ1ZTtcclxuICAgICAgaWYgKGUuY29kZSA9PT0gXCJLZXlTXCIpIHRoaXMubW92ZUJhY2t3YXJkID0gdHJ1ZTtcclxuICAgICAgaWYgKGUuY29kZSA9PT0gXCJLZXlBXCIpIHRoaXMubW92ZUxlZnQgPSB0cnVlO1xyXG4gICAgICBpZiAoZS5jb2RlID09PSBcIktleURcIikgdGhpcy5tb3ZlUmlnaHQgPSB0cnVlO1xyXG4gICAgICBpZiAoZS5jb2RlID09PSBcIlNwYWNlXCIgJiYgdGhpcy5jYW5KdW1wICYmIHRoaXMuZ2FtZVN0YXRlID09PSBcInBsYXlpbmdcIikge1xyXG4gICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55ID0gdGhpcy5kYXRhLnBsYXllci5qdW1wRm9yY2U7XHJcbiAgICAgICAgdGhpcy5jYW5KdW1wID0gZmFsc2U7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXl1cFwiLCAoZSkgPT4ge1xyXG4gICAgICB0aGlzLmtleXMuZGVsZXRlKGUuY29kZSk7XHJcblxyXG4gICAgICBpZiAoZS5jb2RlID09PSBcIktleVdcIikgdGhpcy5tb3ZlRm9yd2FyZCA9IGZhbHNlO1xyXG4gICAgICBpZiAoZS5jb2RlID09PSBcIktleVNcIikgdGhpcy5tb3ZlQmFja3dhcmQgPSBmYWxzZTtcclxuICAgICAgaWYgKGUuY29kZSA9PT0gXCJLZXlBXCIpIHRoaXMubW92ZUxlZnQgPSBmYWxzZTtcclxuICAgICAgaWYgKGUuY29kZSA9PT0gXCJLZXlEXCIpIHRoaXMubW92ZVJpZ2h0ID0gZmFsc2U7XHJcbiAgICB9KTtcclxuXHJcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIChlKSA9PiB7XHJcbiAgICAgIGlmICghdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHJldHVybjtcclxuICAgICAgdGhpcy5tb3VzZU1vdmVtZW50LnggPSBlLm1vdmVtZW50WDtcclxuICAgICAgdGhpcy5tb3VzZU1vdmVtZW50LnkgPSBlLm1vdmVtZW50WTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gXCJ0aXRsZVwiKSB7XHJcbiAgICAgICAgdGhpcy5zdGFydEdhbWUoKTtcclxuICAgICAgICB0aGlzLmNhbnZhcy5yZXF1ZXN0UG9pbnRlckxvY2soKTtcclxuICAgICAgfSBlbHNlIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gXCJnYW1lb3ZlclwiKSB7XHJcbiAgICAgICAgdGhpcy5yZXN0YXJ0R2FtZSgpO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLnJlcXVlc3RQb2ludGVyTG9jaygpO1xyXG4gICAgICB9IGVsc2UgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBcInBsYXlpbmdcIikge1xyXG4gICAgICAgIGlmICghdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgIHRoaXMuY2FudmFzLnJlcXVlc3RQb2ludGVyTG9jaygpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB0aGlzLnNob290KCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwicG9pbnRlcmxvY2tjaGFuZ2VcIiwgKCkgPT4ge1xyXG4gICAgICB0aGlzLmlzUG9pbnRlckxvY2tlZCA9IGRvY3VtZW50LnBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXM7XHJcbiAgICB9KTtcclxuXHJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcInJlc2l6ZVwiLCAoKSA9PiB7XHJcbiAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gd2luZG93LmlubmVyV2lkdGg7XHJcbiAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodDtcclxuICAgICAgdGhpcy5jYW1lcmEuYXNwZWN0ID0gdGhpcy5jYW52YXMud2lkdGggLyB0aGlzLmNhbnZhcy5oZWlnaHQ7XHJcbiAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIHByaXZhdGUgc2hvd1RpdGxlKCkge1xyXG4gICAgdGhpcy5nYW1lU3RhdGUgPSBcInRpdGxlXCI7XHJcbiAgfVxyXG4gIHByaXZhdGUgc3RhcnRHYW1lKCkge1xyXG4gICAgdGhpcy5nYW1lU3RhdGUgPSBcInBsYXlpbmdcIjtcclxuICAgIHRoaXMuY3JlYXRlUGxheWVyKCk7XHJcbiAgICB0aGlzLnNwYXduRW5lbWllcygpO1xyXG4gICAgY29uc3QgYmdtID0gdGhpcy5zb3VuZHMuZ2V0KFwiYmdtXCIpO1xyXG4gICAgaWYgKGJnbSkge1xyXG4gICAgICBiZ20ubG9vcCA9IHRydWU7XHJcbiAgICAgIGJnbS5wbGF5KCkuY2F0Y2goKCkgPT4ge30pO1xyXG4gICAgfVxyXG4gIH1cclxuICBwcml2YXRlIHJlc3RhcnRHYW1lKCkge1xyXG4gICAgdGhpcy5lbmVtaWVzLmZvckVhY2goKGUpID0+IHtcclxuICAgICAgdGhpcy5zY2VuZS5yZW1vdmUoZS5tZXNoKTtcclxuICAgICAgdGhpcy53b3JsZC5yZW1vdmVCb2R5KGUuYm9keSk7XHJcbiAgICB9KTtcclxuICAgIHRoaXMuZW5lbWllcyA9IFtdO1xyXG4gICAgdGhpcy5idWxsZXRzLmZvckVhY2goKGIpID0+IHtcclxuICAgICAgdGhpcy5zY2VuZS5yZW1vdmUoYi5tZXNoKTtcclxuICAgICAgdGhpcy53b3JsZC5yZW1vdmVCb2R5KGIuYm9keSk7XHJcbiAgICB9KTtcclxuICAgIHRoaXMuYnVsbGV0cyA9IFtdO1xyXG5cclxuICAgIGlmICh0aGlzLnBsYXllckJvZHkpIHtcclxuICAgICAgdGhpcy53b3JsZC5yZW1vdmVCb2R5KHRoaXMucGxheWVyQm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5lbmVtaWVzS2lsbGVkID0gMDtcclxuICAgIHRoaXMuc3RhcnRHYW1lKCk7XHJcbiAgfVxyXG4gIHByaXZhdGUgdXBkYXRlKGRlbHRhOiBudW1iZXIpIHtcclxuICAgIGlmICh0aGlzLmdhbWVTdGF0ZSAhPT0gXCJwbGF5aW5nXCIpIHJldHVybjtcclxuICAgIHRoaXMud29ybGQuc3RlcCgxIC8gNjAsIGRlbHRhLCAzKTtcclxuXHJcbiAgICB0aGlzLnVwZGF0ZVBsYXllcihkZWx0YSk7XHJcbiAgICB0aGlzLnVwZGF0ZUVuZW1pZXMoZGVsdGEpO1xyXG4gICAgdGhpcy51cGRhdGVCdWxsZXRzKGRlbHRhKTtcclxuXHJcbiAgICBpZiAodGhpcy5wbGF5ZXJIZWFsdGggPD0gMCAmJiB0aGlzLmdhbWVTdGF0ZSA9PT0gXCJwbGF5aW5nXCIpIHtcclxuICAgICAgdGhpcy5nYW1lU3RhdGUgPSBcImdhbWVvdmVyXCI7XHJcbiAgICAgIGNvbnN0IGJnbSA9IHRoaXMuc291bmRzLmdldChcImJnbVwiKTtcclxuICAgICAgaWYgKGJnbSkgYmdtLnBhdXNlKCk7XHJcblxyXG4gICAgICBjb25zdCBnYW1lb3ZlclNvdW5kID0gdGhpcy5zb3VuZHMuZ2V0KFwiZ2FtZW92ZXJcIik7XHJcbiAgICAgIGlmIChnYW1lb3ZlclNvdW5kKSBnYW1lb3ZlclNvdW5kLnBsYXkoKS5jYXRjaCgoKSA9PiB7fSk7XHJcblxyXG4gICAgICBpZiAoZG9jdW1lbnQucG9pbnRlckxvY2tFbGVtZW50KSB7XHJcbiAgICAgICAgZG9jdW1lbnQuZXhpdFBvaW50ZXJMb2NrKCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcbiAgc3RhcnQoKSB7XHJcbiAgICBsZXQgbGFzdFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICAgIGNvbnN0IGFuaW1hdGUgPSAoKSA9PiB7XHJcbiAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltYXRlKTtcclxuXHJcbiAgICAgIGNvbnN0IG5vdyA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICBjb25zdCBkZWx0YSA9IChub3cgLSBsYXN0VGltZSkgLyAxMDAwO1xyXG4gICAgICBsYXN0VGltZSA9IG5vdztcclxuXHJcbiAgICAgIHRoaXMudXBkYXRlKGRlbHRhKTtcclxuICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIodGhpcy5zY2VuZSwgdGhpcy5jYW1lcmEpO1xyXG4gICAgICB0aGlzLmRyYXdVSSgpO1xyXG4gICAgfTtcclxuXHJcbiAgICBhbmltYXRlKCk7XHJcbiAgfVxyXG59XHJcbmNvbnN0IGdhbWUgPSBuZXcgRlBTR2FtZSgpO1xyXG5nYW1lLmluaXQoKS50aGVuKCgpID0+IGdhbWUuc3RhcnQoKSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICJBQUFBLFlBQVksV0FBVztBQUN2QixZQUFZLFlBQVk7QUFzQ3hCLE1BQU0sUUFB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RSxJQUFJO0FBQUEsSUFDOUIsQ0FBQztBQUNELFNBQUssVUFBVSxDQUFDO0FBQ2hCLFNBQUssUUFBUSxRQUFRLENBQUMsTUFBTTtBQUMxQixXQUFLLE1BQU0sT0FBTyxFQUFFLElBQUk7QUFDeEIsV0FBSyxNQUFNLFdBQVcsRUFBRSxJQUFJO0FBQUEsSUFDOUIsQ0FBQztBQUNELFNBQUssVUFBVSxDQUFDO0FBRWhCLFFBQUksS0FBSyxZQUFZO0FBQ25CLFdBQUssTUFBTSxXQUFXLEtBQUssVUFBVTtBQUFBLElBQ3ZDO0FBRUEsU0FBSyxnQkFBZ0I7QUFDckIsU0FBSyxVQUFVO0FBQUEsRUFDakI7QUFBQSxFQUNRLE9BQU8sT0FBZTtBQUM1QixRQUFJLEtBQUssY0FBYyxVQUFXO0FBQ2xDLFNBQUssTUFBTSxLQUFLLElBQUksSUFBSSxPQUFPLENBQUM7QUFFaEMsU0FBSyxhQUFhLEtBQUs7QUFDdkIsU0FBSyxjQUFjLEtBQUs7QUFDeEIsU0FBSyxjQUFjLEtBQUs7QUFFeEIsUUFBSSxLQUFLLGdCQUFnQixLQUFLLEtBQUssY0FBYyxXQUFXO0FBQzFELFdBQUssWUFBWTtBQUNqQixZQUFNLE1BQU0sS0FBSyxPQUFPLElBQUksS0FBSztBQUNqQyxVQUFJLElBQUssS0FBSSxNQUFNO0FBRW5CLFlBQU0sZ0JBQWdCLEtBQUssT0FBTyxJQUFJLFVBQVU7QUFDaEQsVUFBSSxjQUFlLGVBQWMsS0FBSyxFQUFFLE1BQU0sTUFBTTtBQUFBLE1BQUMsQ0FBQztBQUV0RCxVQUFJLFNBQVMsb0JBQW9CO0FBQy9CLGlCQUFTLGdCQUFnQjtBQUFBLE1BQzNCO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFFBQVE7QUFDTixRQUFJLFdBQVcsWUFBWSxJQUFJO0FBQy9CLFVBQU0sVUFBVSxNQUFNO0FBQ3BCLDRCQUFzQixPQUFPO0FBRTdCLFlBQU0sTUFBTSxZQUFZLElBQUk7QUFDNUIsWUFBTSxTQUFTLE1BQU0sWUFBWTtBQUNqQyxpQkFBVztBQUVYLFdBQUssT0FBTyxLQUFLO0FBQ2pCLFdBQUssU0FBUyxPQUFPLEtBQUssT0FBTyxLQUFLLE1BQU07QUFDNUMsV0FBSyxPQUFPO0FBQUEsSUFDZDtBQUVBLFlBQVE7QUFBQSxFQUNWO0FBQ0Y7QUFDQSxNQUFNLE9BQU8sSUFBSSxRQUFRO0FBQ3pCLEtBQUssS0FBSyxFQUFFLEtBQUssTUFBTSxLQUFLLE1BQU0sQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
