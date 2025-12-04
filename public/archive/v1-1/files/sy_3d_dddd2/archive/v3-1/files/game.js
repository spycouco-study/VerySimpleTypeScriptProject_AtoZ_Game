import * as THREE from "three";
import * as CANNON from "cannon-es";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
let config;
let scene;
let camera;
let renderer;
let controls;
let world;
let lastTime = 0;
let isGameRunning = false;
let score = 0;
let playerBody;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = true;
let container;
let titleScreen;
let hud;
let scoreElement;
const enemies = [];
const enemyMaterial = new CANNON.Material();
let audioContext;
let bgmSource = null;
const assets = {
  shootSfx: null,
  bgm: null
};
function pcmToWav(pcm16, sampleRate) {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataLength = pcm16.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);
  let offset = 44;
  for (let i = 0; i < pcm16.length; i++, offset += bytesPerSample) {
    view.setInt16(offset, pcm16[i], true);
  }
  return new Blob([view], { type: "audio/wav" });
  function writeString(view2, offset2, str) {
    for (let i = 0; i < str.length; i++) {
      view2.setUint8(offset2 + i, str.charCodeAt(i));
    }
  }
}
async function loadAudio(path) {
  console.log(`[Asset] Loading audio from: ${path}`);
  return null;
}
function playBGM() {
  if (bgmSource) {
    bgmSource.stop();
    bgmSource.disconnect();
  }
  console.log("[Audio] Playing BGM.");
}
function playSfx(type) {
  console.log(`[Audio] Playing SFX: ${type}`);
}
async function loadConfig() {
  try {
    const response = await fetch("data.json");
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    config = await response.json();
    console.log("Game Config Loaded:", config);
    return true;
  } catch (error) {
    console.error("Failed to load game configuration:", error);
    return false;
  }
}
function setupDOM() {
  container = document.createElement("div");
  container.id = "game-container";
  Object.assign(container.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    fontFamily: "sans-serif"
  });
  document.body.appendChild(container);
  const canvas = document.getElementById("gameCanvas");
  if (!canvas) {
    console.error("Canvas element #gameCanvas not found.");
    return;
  }
  container.appendChild(canvas);
  titleScreen = document.createElement("div");
  titleScreen.id = "title-screen";
  titleScreen.innerHTML = `
        <div style="text-align: center; color: white; background: rgba(0,0,0,0.8); padding: 40px; border-radius: 10px;">
            <h1 style="font-size: 3em; margin-bottom: 0;">SIMPLE FPS DEMO</h1>
            <p style="font-size: 1.2em;">3D FPS \uAC8C\uC784 (Three.js + Cannon.js)</p>
            <button id="startButton" style="padding: 10px 20px; font-size: 1.5em; cursor: pointer; margin-top: 20px; border: none; border-radius: 5px; background: #4CAF50; color: white;">\uAC8C\uC784 \uC2DC\uC791</button>
            <p style="margin-top: 30px; font-size: 0.9em; opacity: 0.7;">WASD: \uC774\uB3D9 | Space: \uC810\uD504 | \uB9C8\uC6B0\uC2A4: \uC2DC\uC810 \uC870\uC791 | \uC88C\uD074\uB9AD: \uBC1C\uC0AC</p>
        </div>
    `;
  Object.assign(titleScreen.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: "100",
    backgroundColor: "rgba(0, 0, 0, 0.95)"
  });
  container.appendChild(titleScreen);
  hud = document.createElement("div");
  hud.id = "hud";
  hud.innerHTML = `
        <div style="position: absolute; top: 20px; left: 20px; color: white; font-size: 1.5em; text-shadow: 0 0 5px black;">
            \uC810\uC218: <span id="score">0</span>
        </div>
        <!-- Crosshair -->
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 2em; line-height: 1; text-shadow: 0 0 5px black; pointer-events: none;">
            +
        </div>
    `;
  Object.assign(hud.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    display: "none",
    // 게임 시작 전에는 숨김
    zIndex: "50",
    pointerEvents: "none"
  });
  container.appendChild(hud);
  scoreElement = document.getElementById("score");
  document.getElementById("startButton")?.addEventListener("click", startGame);
  window.addEventListener("resize", onWindowResize, false);
}
function setupThree() {
  const canvas = document.getElementById("gameCanvas");
  scene = new THREE.Scene();
  scene.background = new THREE.Color(4473924);
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1e3
  );
  camera.position.set(0, config.level.wallHeight / 2 + 0.5, 0);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const light = new THREE.DirectionalLight(16777215, 3);
  light.position.set(10, 20, 10);
  light.castShadow = true;
  light.shadow.mapSize.width = 2048;
  light.shadow.mapSize.height = 2048;
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = 50;
  light.shadow.camera.left = -20;
  light.shadow.camera.right = 20;
  light.shadow.camera.top = 20;
  light.shadow.camera.bottom = -20;
  scene.add(light);
  scene.add(new THREE.AmbientLight(6710886, 1));
}
function setupPhysics() {
  world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0)
  });
  const groundShape = new CANNON.Plane();
  const groundBody = new CANNON.Body({ mass: 0, shape: groundShape });
  groundBody.quaternion.setFromAxisAngle(
    new CANNON.Vec3(1, 0, 0),
    -Math.PI / 2
  );
  world.addBody(groundBody);
  const playerRadius = 0.5;
  const playerHeight = config.level.wallHeight;
  const playerShape = new CANNON.Cylinder(
    playerRadius,
    playerRadius,
    playerHeight,
    16
  );
  playerBody = new CANNON.Body({ mass: 70, shape: playerShape });
  playerBody.position.set(0, playerHeight / 2 + 1, 0);
  playerBody.fixedRotation = true;
  world.addBody(playerBody);
  playerBody.addEventListener("collide", (event) => {
    const contact = event.contact;
    if (contact.bi.mass === 0) {
      const upAxis = new CANNON.Vec3(0, 1, 0);
      const normal = new CANNON.Vec3();
      contact.ni.negate(normal);
      if (normal.dot(upAxis) > 0.5) {
        canJump = true;
      }
    }
  });
  const size = config.level.arenaSize;
  const wallHeight = config.level.wallHeight;
  const wallMaterial = new CANNON.Material();
  const wallShape = new CANNON.Box(
    new CANNON.Vec3(size / 2, wallHeight / 2, 0.5)
  );
  const sideWallShape = new CANNON.Box(
    new CANNON.Vec3(0.5, wallHeight / 2, size / 2)
  );
  const walls = [
    // Front/Back
    { pos: new CANNON.Vec3(0, wallHeight / 2, -size / 2), shape: wallShape },
    { pos: new CANNON.Vec3(0, wallHeight / 2, size / 2), shape: wallShape },
    // Left/Right
    {
      pos: new CANNON.Vec3(-size / 2, wallHeight / 2, 0),
      shape: sideWallShape
    },
    { pos: new CANNON.Vec3(size / 2, wallHeight / 2, 0), shape: sideWallShape }
  ];
  walls.forEach((w) => {
    const wallBody = new CANNON.Body({
      mass: 0,
      material: wallMaterial,
      shape: w.shape
    });
    wallBody.position.copy(w.pos);
    world.addBody(wallBody);
    const wallMesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        w.shape.halfExtents.x * 2,
        w.shape.halfExtents.y * 2,
        w.shape.halfExtents.z * 2
      ),
      new THREE.MeshStandardMaterial({ color: 10066329 })
    );
    wallMesh.position.copy(w.pos);
    wallMesh.receiveShadow = true;
    scene.add(wallMesh);
  });
}
function setupEnvironment() {
  const size = config.level.arenaSize;
  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: 2263842 })
    // Forest Green
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
}
function spawnEnemies() {
  const geometry = new THREE.BoxGeometry(
    config.enemy.size,
    config.enemy.size,
    config.enemy.size
  );
  const material = new THREE.MeshStandardMaterial({ color: 16729344 });
  for (let i = 0; i < config.enemy.count; i++) {
    const pos = new CANNON.Vec3(
      (Math.random() - 0.5) * config.level.arenaSize * 0.8,
      config.enemy.size / 2,
      (Math.random() - 0.5) * config.level.arenaSize * 0.8
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    scene.add(mesh);
    const shape = new CANNON.Box(
      new CANNON.Vec3(
        config.enemy.size / 2,
        config.enemy.size / 2,
        config.enemy.size / 2
      )
    );
    const body = new CANNON.Body({
      mass: 0,
      material: enemyMaterial,
      shape
    });
    body.position.copy(pos);
    world.addBody(body);
    mesh.cannonBody = body;
    enemies.push({ mesh, body });
  }
  console.log(`Spawned ${config.enemy.count} enemies.`);
}
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
function setupControls() {
  controls = new PointerLockControls(camera, container);
  const originalOnMouseMove = controls.onMouseMove;
  controls.onMouseMove = function(event) {
    originalOnMouseMove.call(controls, event);
  };
  document.addEventListener("click", shoot, false);
  const onKeyDown = (event) => {
    switch (event.code) {
      case "KeyW":
        moveForward = true;
        break;
      case "KeyS":
        moveBackward = true;
        break;
      case "KeyA":
        moveLeft = true;
        break;
      case "KeyD":
        moveRight = true;
        break;
      case "Space":
        if (canJump) {
          playerBody.velocity.y = config.player.jumpForce;
          canJump = false;
        }
        break;
    }
  };
  const onKeyUp = (event) => {
    switch (event.code) {
      case "KeyW":
        moveForward = false;
        break;
      case "KeyS":
        moveBackward = false;
        break;
      case "KeyA":
        moveLeft = false;
        break;
      case "KeyD":
        moveRight = false;
        break;
    }
  };
  document.addEventListener("keydown", onKeyDown, false);
  document.addEventListener("keyup", onKeyUp, false);
}
function startGame() {
  if (isGameRunning) return;
  titleScreen.style.display = "none";
  hud.style.display = "block";
  controls.lock();
  isGameRunning = true;
  lastTime = performance.now();
  animate();
  playBGM();
}
function shoot() {
  if (!isGameRunning) return;
  playSfx("shoot");
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const targets = enemies.map((e) => e.mesh);
  const intersects = raycaster.intersectObjects(targets);
  if (intersects.length > 0) {
    const hitMesh = intersects[0].object;
    removeEnemy(hitMesh);
  }
}
function removeEnemy(mesh) {
  const body = mesh.cannonBody;
  score += config.enemy.scoreValue;
  scoreElement.textContent = score.toString();
  world.removeBody(body);
  scene.remove(mesh);
  const index = enemies.findIndex((e) => e.mesh === mesh);
  if (index !== -1) {
    enemies.splice(index, 1);
  }
  if (enemies.length === 0) {
    endGame("\uC2B9\uB9AC");
  }
}
function endGame(result) {
  isGameRunning = false;
  controls.unlock();
  if (bgmSource) bgmSource.stop();
  titleScreen.style.display = "flex";
  titleScreen.innerHTML = `
        <div style="text-align: center; color: white; background: rgba(0,0,0,0.8); padding: 40px; border-radius: 10px;">
            <h1 style="font-size: 3em; margin-bottom: 10px;">\uAC8C\uC784 \uC885\uB8CC: ${result}</h1>
            <p style="font-size: 2em;">\uCD5C\uC885 \uC810\uC218: ${score}</p>
            <button id="restartButton" style="padding: 10px 20px; font-size: 1.5em; cursor: pointer; margin-top: 20px; border: none; border-radius: 5px; background: #4CAF50; color: white;">\uB2E4\uC2DC \uC2DC\uC791</button>
        </div>
    `;
  document.getElementById("restartButton")?.addEventListener("click", () => {
    resetGame();
    startGame();
  });
}
function resetGame() {
  enemies.forEach((e) => {
    world.removeBody(e.body);
    scene.remove(e.mesh);
  });
  enemies.length = 0;
  playerBody.position.set(0, config.level.wallHeight / 2 + 1, 0);
  playerBody.velocity.set(0, 0, 0);
  playerBody.angularVelocity.set(0, 0, 0);
  score = 0;
  if (scoreElement) scoreElement.textContent = "0";
  spawnEnemies();
  console.log("Game state reset.");
}
function animate() {
  if (!isGameRunning) return;
  requestAnimationFrame(animate);
  const time = performance.now();
  const dt = (time - lastTime) / 1e3;
  lastTime = time;
  world.step(1 / 60, dt);
  const speed = config.player.speed * dt;
  const bodyVelocity = playerBody.velocity;
  const currentVelocity = new THREE.Vector3(0, bodyVelocity.y, 0);
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  direction.y = 0;
  const right = new THREE.Vector3();
  right.crossVectors(direction, new THREE.Vector3(0, 1, 0));
  if (moveForward) currentVelocity.addScaledVector(direction, speed);
  if (moveBackward) currentVelocity.addScaledVector(direction, -speed);
  if (moveLeft) currentVelocity.addScaledVector(right, -speed);
  if (moveRight) currentVelocity.addScaledVector(right, speed);
  playerBody.velocity.set(currentVelocity.x, bodyVelocity.y, currentVelocity.z);
  camera.position.copy(playerBody.position);
  camera.position.y += config.level.wallHeight / 2;
  enemies.forEach((e) => {
    e.mesh.position.copy(e.body.position);
    e.mesh.quaternion.copy(e.body.quaternion);
  });
  renderer.render(scene, camera);
}
async function init() {
  if (!await loadConfig()) {
    document.body.innerHTML = '<div style="color: red; padding: 20px;">\uC124\uC815 \uD30C\uC77C(data.json)\uC744 \uBD88\uB7EC\uC624\uB294 \uB370 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.</div>';
    return;
  }
  setupDOM();
  audioContext = new window.AudioContext();
  await loadAudio(config.assets.bgmPath).then(
    (buffer) => assets.bgm = buffer
  );
  await loadAudio(config.assets.shootSfxPath).then(
    (buffer) => assets.shootSfx = buffer
  );
  setupThree();
  setupPhysics();
  setupEnvironment();
  setupControls();
  spawnEnemies();
  console.log(
    "Initialization complete. Waiting for user to click 'Start Game'."
  );
}
window.onload = init;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSBcInRocmVlXCI7XHJcbmltcG9ydCAqIGFzIENBTk5PTiBmcm9tIFwiY2Fubm9uLWVzXCI7XHJcbmltcG9ydCB7IFBvaW50ZXJMb2NrQ29udHJvbHMgfSBmcm9tIFwidGhyZWUvZXhhbXBsZXMvanNtL2NvbnRyb2xzL1BvaW50ZXJMb2NrQ29udHJvbHMuanNcIjtcclxuXHJcbi8vIENvbmZpZ3VyYXRpb24gaW50ZXJmYWNlIGJhc2VkIG9uIGRhdGEuanNvblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgcGxheWVyOiB7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAganVtcEZvcmNlOiBudW1iZXI7XHJcbiAgICBtb3VzZVNlbnNpdGl2aXR5OiBudW1iZXI7XHJcbiAgfTtcclxuICBsZXZlbDoge1xyXG4gICAgYXJlbmFTaXplOiBudW1iZXI7XHJcbiAgICB3YWxsSGVpZ2h0OiBudW1iZXI7XHJcbiAgfTtcclxuICBlbmVteToge1xyXG4gICAgY291bnQ6IG51bWJlcjtcclxuICAgIHNpemU6IG51bWJlcjtcclxuICAgIHNjb3JlVmFsdWU6IG51bWJlcjtcclxuICAgIHRleHR1cmVQYXRoOiBzdHJpbmc7IC8vIFBsYWNlaG9sZGVyIGZvciBpbWFnZSBhc3NldFxyXG4gIH07XHJcbiAgYXNzZXRzOiB7XHJcbiAgICBiZ21QYXRoOiBzdHJpbmc7IC8vIFBsYWNlaG9sZGVyIGZvciBhdWRpbyBhc3NldFxyXG4gICAgc2hvb3RTZnhQYXRoOiBzdHJpbmc7IC8vIFBsYWNlaG9sZGVyIGZvciBhdWRpbyBhc3NldFxyXG4gIH07XHJcbn1cclxuXHJcbi8vID09PSBHbG9iYWwgU3RhdGUgYW5kIFZhcmlhYmxlcyA9PT1cclxubGV0IGNvbmZpZzogR2FtZUNvbmZpZztcclxubGV0IHNjZW5lOiBUSFJFRS5TY2VuZTtcclxubGV0IGNhbWVyYTogVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmE7XHJcbmxldCByZW5kZXJlcjogVEhSRUUuV2ViR0xSZW5kZXJlcjtcclxubGV0IGNvbnRyb2xzOiBQb2ludGVyTG9ja0NvbnRyb2xzO1xyXG5sZXQgd29ybGQ6IENBTk5PTi5Xb3JsZDtcclxubGV0IGxhc3RUaW1lOiBudW1iZXIgPSAwO1xyXG5sZXQgaXNHYW1lUnVubmluZyA9IGZhbHNlO1xyXG5sZXQgc2NvcmUgPSAwO1xyXG5cclxuLy8gUGxheWVyIFBoeXNpY3MgQm9keVxyXG5sZXQgcGxheWVyQm9keTogQ0FOTk9OLkJvZHk7XHJcbmxldCBtb3ZlRm9yd2FyZCA9IGZhbHNlO1xyXG5sZXQgbW92ZUJhY2t3YXJkID0gZmFsc2U7XHJcbmxldCBtb3ZlTGVmdCA9IGZhbHNlO1xyXG5sZXQgbW92ZVJpZ2h0ID0gZmFsc2U7XHJcbmxldCBjYW5KdW1wID0gdHJ1ZTtcclxuXHJcbi8vIER5bmFtaWMgRE9NIEVsZW1lbnRzXHJcbmxldCBjb250YWluZXI6IEhUTUxFbGVtZW50O1xyXG5sZXQgdGl0bGVTY3JlZW46IEhUTUxEaXZFbGVtZW50O1xyXG5sZXQgaHVkOiBIVE1MRGl2RWxlbWVudDtcclxubGV0IHNjb3JlRWxlbWVudDogSFRNTFNwYW5FbGVtZW50O1xyXG5cclxuLy8gQ29sbGVjdGlvbnNcclxuY29uc3QgZW5lbWllczogeyBtZXNoOiBUSFJFRS5NZXNoOyBib2R5OiBDQU5OT04uQm9keSB9W10gPSBbXTtcclxuY29uc3QgZW5lbXlNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoKTtcclxuXHJcbi8vIEF1ZGlvIHNldHVwIChTaW11bGF0aW9uL1BsYWNlaG9sZGVyKVxyXG5sZXQgYXVkaW9Db250ZXh0OiBBdWRpb0NvbnRleHQ7XHJcbmxldCBiZ21Tb3VyY2U6IEF1ZGlvQnVmZmVyU291cmNlTm9kZSB8IG51bGwgPSBudWxsO1xyXG5jb25zdCBhc3NldHMgPSB7XHJcbiAgc2hvb3RTZng6IG51bGwgYXMgQXVkaW9CdWZmZXIgfCBudWxsLFxyXG4gIGJnbTogbnVsbCBhcyBBdWRpb0J1ZmZlciB8IG51bGwsXHJcbn07XHJcblxyXG4vLyA9PT0gVXRpbGl0eSBGdW5jdGlvbnMgPT09XHJcblxyXG4vKipcclxuICogUENNIFx1QzYyNFx1QjUxNFx1QzYyNCBcdUIzNzBcdUM3NzRcdUQxMzBcdUI5N0MgV0FWIEJsb2JcdUM3M0NcdUI4NUMgXHVCQ0MwXHVENjU4XHJcbiAqIFRUUyBBUElcdUM3NTggUENNMTYgXHVDNzUxXHVCMkY1IFx1Q0M5OFx1QjlBQ1x1QzVEMCBcdUMwQUNcdUM2QTlcdUI0MThcdUIyOTQgXHVDNzIwXHVEMkY4XHVCOUFDXHVEMkYwIChcdUM1RUNcdUFFMzBcdUMxMUNcdUIyOTQgXHVCMkU4XHVDMjFDIFx1QzJEQ1x1QkJBQ1x1QjgwOFx1Qzc3NFx1QzE1OCBcdUJBQTlcdUM4MDEpXHJcbiAqIEBwYXJhbSBwY20xNiBJbnQxNkFycmF5IFx1RDYxNVx1QzJERFx1Qzc1OCBQQ00gXHVCMzcwXHVDNzc0XHVEMTMwXHJcbiAqIEBwYXJhbSBzYW1wbGVSYXRlIFx1QzBEOFx1RDUwQ1x1QjlDMSBcdUMxOERcdUIzQzRcclxuICogQHJldHVybnMgV0FWIFx1RDYxNVx1QzJERFx1Qzc1OCBCbG9iXHJcbiAqL1xyXG5mdW5jdGlvbiBwY21Ub1dhdihwY20xNjogSW50MTZBcnJheSwgc2FtcGxlUmF0ZTogbnVtYmVyKTogQmxvYiB7XHJcbiAgY29uc3QgbnVtQ2hhbm5lbHMgPSAxO1xyXG4gIGNvbnN0IGJ5dGVzUGVyU2FtcGxlID0gMjsgLy8gSW50MTZcclxuICBjb25zdCBibG9ja0FsaWduID0gbnVtQ2hhbm5lbHMgKiBieXRlc1BlclNhbXBsZTtcclxuICBjb25zdCBieXRlUmF0ZSA9IHNhbXBsZVJhdGUgKiBibG9ja0FsaWduO1xyXG4gIGNvbnN0IGRhdGFMZW5ndGggPSBwY20xNi5sZW5ndGggKiBieXRlc1BlclNhbXBsZTtcclxuICBjb25zdCBidWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoNDQgKyBkYXRhTGVuZ3RoKTtcclxuICBjb25zdCB2aWV3ID0gbmV3IERhdGFWaWV3KGJ1ZmZlcik7XHJcblxyXG4gIC8vIFJJRkYgaGVhZGVyXHJcbiAgd3JpdGVTdHJpbmcodmlldywgMCwgXCJSSUZGXCIpO1xyXG4gIHZpZXcuc2V0VWludDMyKDQsIDM2ICsgZGF0YUxlbmd0aCwgdHJ1ZSk7XHJcbiAgd3JpdGVTdHJpbmcodmlldywgOCwgXCJXQVZFXCIpO1xyXG5cclxuICAvLyBGTVQgc3ViLWNodW5rXHJcbiAgd3JpdGVTdHJpbmcodmlldywgMTIsIFwiZm10IFwiKTtcclxuICB2aWV3LnNldFVpbnQzMigxNiwgMTYsIHRydWUpOyAvLyBTdWItY2h1bmsgc2l6ZVxyXG4gIHZpZXcuc2V0VWludDE2KDIwLCAxLCB0cnVlKTsgLy8gQXVkaW8gZm9ybWF0ICgxID0gUENNKVxyXG4gIHZpZXcuc2V0VWludDE2KDIyLCBudW1DaGFubmVscywgdHJ1ZSk7XHJcbiAgdmlldy5zZXRVaW50MzIoMjQsIHNhbXBsZVJhdGUsIHRydWUpO1xyXG4gIHZpZXcuc2V0VWludDMyKDI4LCBieXRlUmF0ZSwgdHJ1ZSk7XHJcbiAgdmlldy5zZXRVaW50MTYoMzIsIGJsb2NrQWxpZ24sIHRydWUpO1xyXG4gIHZpZXcuc2V0VWludDE2KDM0LCAxNiwgdHJ1ZSk7IC8vIEJpdHMgcGVyIHNhbXBsZVxyXG5cclxuICAvLyBEQVRBIHN1Yi1jaHVua1xyXG4gIHdyaXRlU3RyaW5nKHZpZXcsIDM2LCBcImRhdGFcIik7XHJcbiAgdmlldy5zZXRVaW50MzIoNDAsIGRhdGFMZW5ndGgsIHRydWUpO1xyXG5cclxuICAvLyBXcml0ZSBQQ00gZGF0YVxyXG4gIGxldCBvZmZzZXQgPSA0NDtcclxuICBmb3IgKGxldCBpID0gMDsgaSA8IHBjbTE2Lmxlbmd0aDsgaSsrLCBvZmZzZXQgKz0gYnl0ZXNQZXJTYW1wbGUpIHtcclxuICAgIHZpZXcuc2V0SW50MTYob2Zmc2V0LCBwY20xNltpXSwgdHJ1ZSk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gbmV3IEJsb2IoW3ZpZXddLCB7IHR5cGU6IFwiYXVkaW8vd2F2XCIgfSk7XHJcblxyXG4gIGZ1bmN0aW9uIHdyaXRlU3RyaW5nKHZpZXc6IERhdGFWaWV3LCBvZmZzZXQ6IG51bWJlciwgc3RyOiBzdHJpbmcpIHtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIHZpZXcuc2V0VWludDgob2Zmc2V0ICsgaSwgc3RyLmNoYXJDb2RlQXQoaSkpO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFx1QzYyNFx1QjUxNFx1QzYyNCBcdUQzMENcdUM3N0NcdUM3NDQgXHVCODVDXHVCNERDXHVENTU4XHVCMjk0IFx1QzJEQ1x1QkJBQ1x1QjgwOFx1Qzc3NFx1QzE1OCBcdUQ1NjhcdUMyMTggKFx1QzJFNFx1QzgxQyBcdUI4NUNcdUI1MjkgXHVDNUM2XHVDNzRDKVxyXG4gKiBAcGFyYW0gcGF0aCBcdUM1RDBcdUMxNEIgXHVBQ0JEXHVCODVDXHJcbiAqIEByZXR1cm5zIFx1Qjg1Q1x1QjREQ1x1QjQxQyBcdUM2MjRcdUI1MTRcdUM2MjQgXHVCQzg0XHVEMzdDIChudWxsIFx1QkMxOFx1RDY1OFx1QzczQ1x1Qjg1QyBcdUMyRENcdUJCQUNcdUI4MDhcdUM3NzRcdUMxNTgpXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBsb2FkQXVkaW8ocGF0aDogc3RyaW5nKTogUHJvbWlzZTxBdWRpb0J1ZmZlciB8IG51bGw+IHtcclxuICAvLyBcdUMyRTRcdUM4MUMgXHVEMzBDXHVDNzdDIFx1Qjg1Q1x1QjUyOVx1Qzc0MCBcdUJEODhcdUFDMDBcdUIyQTVcdUQ1NThcdUJCQzBcdUI4NUMsIFx1QzEzMVx1QUNGNVx1QzgwMVx1QzczQ1x1Qjg1QyBcdUI4NUNcdUI0RENcdUI0MUMgXHVBQzgzXHVDQzk4XHVCN0ZDIFx1QzJEQ1x1QkJBQ1x1QjgwOFx1Qzc3NFx1QzE1OFx1RDU2OVx1QjJDOFx1QjJFNC5cclxuICBjb25zb2xlLmxvZyhgW0Fzc2V0XSBMb2FkaW5nIGF1ZGlvIGZyb206ICR7cGF0aH1gKTtcclxuICByZXR1cm4gbnVsbDsgLy8gXHVDMkU0XHVDODFDIEF1ZGlvQnVmZmVyIFx1QjMwMFx1QzJFMCBudWxsIFx1QkMxOFx1RDY1OFxyXG59XHJcblxyXG4vKipcclxuICogXHVCQzMwXHVBQ0JEXHVDNzRDXHVDNTQ1XHVDNzQ0IFx1QzdBQ1x1QzBERFx1RDU1OFx1QjI5NCBcdUMyRENcdUJCQUNcdUI4MDhcdUM3NzRcdUMxNTggXHVENTY4XHVDMjE4XHJcbiAqL1xyXG5mdW5jdGlvbiBwbGF5QkdNKCkge1xyXG4gIGlmIChiZ21Tb3VyY2UpIHtcclxuICAgIGJnbVNvdXJjZS5zdG9wKCk7XHJcbiAgICBiZ21Tb3VyY2UuZGlzY29ubmVjdCgpO1xyXG4gIH1cclxuICAvLyBcdUMyRTRcdUM4MUMgQkdNIFx1QzdBQ1x1QzBERCBcdUIzMDBcdUMyRTAgXHVDRjU4XHVDMTk0IFx1Qjg1Q1x1QURGOFxyXG4gIGNvbnNvbGUubG9nKFwiW0F1ZGlvXSBQbGF5aW5nIEJHTS5cIik7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBcdUQ2QThcdUFDRkNcdUM3NENcdUM3NDQgXHVDN0FDXHVDMEREXHVENTU4XHVCMjk0IFx1QzJEQ1x1QkJBQ1x1QjgwOFx1Qzc3NFx1QzE1OCBcdUQ1NjhcdUMyMThcclxuICovXHJcbmZ1bmN0aW9uIHBsYXlTZngodHlwZTogXCJzaG9vdFwiKSB7XHJcbiAgLy8gXHVDMkU0XHVDODFDIFx1RDZBOFx1QUNGQ1x1Qzc0QyBcdUM3QUNcdUMwREQgXHVCMzAwXHVDMkUwIFx1Q0Y1OFx1QzE5NCBcdUI4NUNcdUFERjhcclxuICBjb25zb2xlLmxvZyhgW0F1ZGlvXSBQbGF5aW5nIFNGWDogJHt0eXBlfWApO1xyXG59XHJcblxyXG4vLyA9PT0gR2FtZSBJbml0aWFsaXphdGlvbiBhbmQgU2V0dXAgPT09XHJcblxyXG4vKipcclxuICogZGF0YS5qc29uXHVDNzQ0IFx1QkQ4OFx1QjdFQ1x1QzY0MCBcdUMxMjRcdUM4MTVcdUM3NDQgXHVCODVDXHVCNERDXHVENTY5XHVCMkM4XHVCMkU0LlxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gbG9hZENvbmZpZygpOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChcImRhdGEuanNvblwiKTtcclxuICAgIGlmICghcmVzcG9uc2Uub2spIHRocm93IG5ldyBFcnJvcihgSFRUUCBlcnJvciEgc3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgIGNvbmZpZyA9IChhd2FpdCByZXNwb25zZS5qc29uKCkpIGFzIEdhbWVDb25maWc7XHJcbiAgICBjb25zb2xlLmxvZyhcIkdhbWUgQ29uZmlnIExvYWRlZDpcIiwgY29uZmlnKTtcclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgZ2FtZSBjb25maWd1cmF0aW9uOlwiLCBlcnJvcik7XHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogXHVDRDA4XHVBRTMwIERPTSBcdUM2OTRcdUMxOENcdUI5N0MgXHVDMTI0XHVDODE1XHVENTU4XHVBQ0UwIFx1RDBDMFx1Qzc3NFx1RDJDMCBcdUQ2NTRcdUJBNzRcdUM3NDQgXHVENDVDXHVDMkRDXHVENTY5XHVCMkM4XHVCMkU0LlxyXG4gKi9cclxuZnVuY3Rpb24gc2V0dXBET00oKSB7XHJcbiAgLy8gMS4gXHVDRUU4XHVEMTRDXHVDNzc0XHVCMTA4IFx1QzEyNFx1QzgxNTogXHVDRTk0XHVCQzg0XHVDMkE0XHVDNjQwIFVJXHVCOTdDIFx1QUMxMFx1QzJGOFx1QjI5NCBcdUM2OTRcdUMxOENcclxuICBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gIGNvbnRhaW5lci5pZCA9IFwiZ2FtZS1jb250YWluZXJcIjtcclxuICBPYmplY3QuYXNzaWduKGNvbnRhaW5lci5zdHlsZSwge1xyXG4gICAgcG9zaXRpb246IFwiZml4ZWRcIixcclxuICAgIHRvcDogXCIwXCIsXHJcbiAgICBsZWZ0OiBcIjBcIixcclxuICAgIHdpZHRoOiBcIjEwMCVcIixcclxuICAgIGhlaWdodDogXCIxMDAlXCIsXHJcbiAgICBvdmVyZmxvdzogXCJoaWRkZW5cIixcclxuICAgIGZvbnRGYW1pbHk6IFwic2Fucy1zZXJpZlwiLFxyXG4gIH0pO1xyXG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcclxuXHJcbiAgY29uc3QgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJnYW1lQ2FudmFzXCIpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gIGlmICghY2FudmFzKSB7XHJcbiAgICBjb25zb2xlLmVycm9yKFwiQ2FudmFzIGVsZW1lbnQgI2dhbWVDYW52YXMgbm90IGZvdW5kLlwiKTtcclxuICAgIHJldHVybjtcclxuICB9XHJcbiAgY29udGFpbmVyLmFwcGVuZENoaWxkKGNhbnZhcyk7XHJcblxyXG4gIC8vIDIuIFx1RDBDMFx1Qzc3NFx1RDJDMCBcdUQ2NTRcdUJBNzQgKFRpdGxlIFNjcmVlbilcclxuICB0aXRsZVNjcmVlbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdGl0bGVTY3JlZW4uaWQgPSBcInRpdGxlLXNjcmVlblwiO1xyXG4gIHRpdGxlU2NyZWVuLmlubmVySFRNTCA9IGBcclxuICAgICAgICA8ZGl2IHN0eWxlPVwidGV4dC1hbGlnbjogY2VudGVyOyBjb2xvcjogd2hpdGU7IGJhY2tncm91bmQ6IHJnYmEoMCwwLDAsMC44KTsgcGFkZGluZzogNDBweDsgYm9yZGVyLXJhZGl1czogMTBweDtcIj5cclxuICAgICAgICAgICAgPGgxIHN0eWxlPVwiZm9udC1zaXplOiAzZW07IG1hcmdpbi1ib3R0b206IDA7XCI+U0lNUExFIEZQUyBERU1PPC9oMT5cclxuICAgICAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDEuMmVtO1wiPjNEIEZQUyBcdUFDOENcdUM3ODQgKFRocmVlLmpzICsgQ2Fubm9uLmpzKTwvcD5cclxuICAgICAgICAgICAgPGJ1dHRvbiBpZD1cInN0YXJ0QnV0dG9uXCIgc3R5bGU9XCJwYWRkaW5nOiAxMHB4IDIwcHg7IGZvbnQtc2l6ZTogMS41ZW07IGN1cnNvcjogcG9pbnRlcjsgbWFyZ2luLXRvcDogMjBweDsgYm9yZGVyOiBub25lOyBib3JkZXItcmFkaXVzOiA1cHg7IGJhY2tncm91bmQ6ICM0Q0FGNTA7IGNvbG9yOiB3aGl0ZTtcIj5cdUFDOENcdUM3ODQgXHVDMkRDXHVDNzkxPC9idXR0b24+XHJcbiAgICAgICAgICAgIDxwIHN0eWxlPVwibWFyZ2luLXRvcDogMzBweDsgZm9udC1zaXplOiAwLjllbTsgb3BhY2l0eTogMC43O1wiPldBU0Q6IFx1Qzc3NFx1QjNEOSB8IFNwYWNlOiBcdUM4MTBcdUQ1MDQgfCBcdUI5QzhcdUM2QjBcdUMyQTQ6IFx1QzJEQ1x1QzgxMCBcdUM4NzBcdUM3OTEgfCBcdUM4OENcdUQwNzRcdUI5QUQ6IFx1QkMxQ1x1QzBBQzwvcD5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIGA7XHJcbiAgT2JqZWN0LmFzc2lnbih0aXRsZVNjcmVlbi5zdHlsZSwge1xyXG4gICAgcG9zaXRpb246IFwiYWJzb2x1dGVcIixcclxuICAgIHRvcDogXCIwXCIsXHJcbiAgICBsZWZ0OiBcIjBcIixcclxuICAgIHdpZHRoOiBcIjEwMCVcIixcclxuICAgIGhlaWdodDogXCIxMDAlXCIsXHJcbiAgICBkaXNwbGF5OiBcImZsZXhcIixcclxuICAgIGp1c3RpZnlDb250ZW50OiBcImNlbnRlclwiLFxyXG4gICAgYWxpZ25JdGVtczogXCJjZW50ZXJcIixcclxuICAgIHpJbmRleDogXCIxMDBcIixcclxuICAgIGJhY2tncm91bmRDb2xvcjogXCJyZ2JhKDAsIDAsIDAsIDAuOTUpXCIsXHJcbiAgfSk7XHJcbiAgY29udGFpbmVyLmFwcGVuZENoaWxkKHRpdGxlU2NyZWVuKTtcclxuXHJcbiAgLy8gMy4gSFVEIChIZWFkLVVwIERpc3BsYXkpXHJcbiAgaHVkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBodWQuaWQgPSBcImh1ZFwiO1xyXG4gIGh1ZC5pbm5lckhUTUwgPSBgXHJcbiAgICAgICAgPGRpdiBzdHlsZT1cInBvc2l0aW9uOiBhYnNvbHV0ZTsgdG9wOiAyMHB4OyBsZWZ0OiAyMHB4OyBjb2xvcjogd2hpdGU7IGZvbnQtc2l6ZTogMS41ZW07IHRleHQtc2hhZG93OiAwIDAgNXB4IGJsYWNrO1wiPlxyXG4gICAgICAgICAgICBcdUM4MTBcdUMyMTg6IDxzcGFuIGlkPVwic2NvcmVcIj4wPC9zcGFuPlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDwhLS0gQ3Jvc3NoYWlyIC0tPlxyXG4gICAgICAgIDxkaXYgc3R5bGU9XCJwb3NpdGlvbjogYWJzb2x1dGU7IHRvcDogNTAlOyBsZWZ0OiA1MCU7IHRyYW5zZm9ybTogdHJhbnNsYXRlKC01MCUsIC01MCUpOyBjb2xvcjogd2hpdGU7IGZvbnQtc2l6ZTogMmVtOyBsaW5lLWhlaWdodDogMTsgdGV4dC1zaGFkb3c6IDAgMCA1cHggYmxhY2s7IHBvaW50ZXItZXZlbnRzOiBub25lO1wiPlxyXG4gICAgICAgICAgICArXHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICBgO1xyXG4gIE9iamVjdC5hc3NpZ24oaHVkLnN0eWxlLCB7XHJcbiAgICBwb3NpdGlvbjogXCJhYnNvbHV0ZVwiLFxyXG4gICAgdG9wOiBcIjBcIixcclxuICAgIGxlZnQ6IFwiMFwiLFxyXG4gICAgd2lkdGg6IFwiMTAwJVwiLFxyXG4gICAgaGVpZ2h0OiBcIjEwMCVcIixcclxuICAgIGRpc3BsYXk6IFwibm9uZVwiLCAvLyBcdUFDOENcdUM3ODQgXHVDMkRDXHVDNzkxIFx1QzgwNFx1QzVEMFx1QjI5NCBcdUMyMjhcdUFFNDBcclxuICAgIHpJbmRleDogXCI1MFwiLFxyXG4gICAgcG9pbnRlckV2ZW50czogXCJub25lXCIsXHJcbiAgfSk7XHJcbiAgY29udGFpbmVyLmFwcGVuZENoaWxkKGh1ZCk7XHJcbiAgc2NvcmVFbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzY29yZVwiKSBhcyBIVE1MU3BhbkVsZW1lbnQ7XHJcblxyXG4gIC8vIDQuIFx1Qzc3NFx1QkNBNFx1RDJCOCBcdUI5QUNcdUMyQTRcdUIxMDggXHVDMTI0XHVDODE1XHJcbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGFydEJ1dHRvblwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIHN0YXJ0R2FtZSk7XHJcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgb25XaW5kb3dSZXNpemUsIGZhbHNlKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFRocmVlLmpzIFx1QzUyQywgXHVDRTc0XHVCQTU0XHVCNzdDLCBcdUI4MENcdUIzNTRcdUI3RUNcdUI5N0MgXHVDMTI0XHVDODE1XHVENTY5XHVCMkM4XHVCMkU0LlxyXG4gKi9cclxuZnVuY3Rpb24gc2V0dXBUaHJlZSgpIHtcclxuICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImdhbWVDYW52YXNcIikgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcblxyXG4gIHNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XHJcbiAgc2NlbmUuYmFja2dyb3VuZCA9IG5ldyBUSFJFRS5Db2xvcigweDQ0NDQ0NCk7XHJcblxyXG4gIGNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYShcclxuICAgIDc1LFxyXG4gICAgd2luZG93LmlubmVyV2lkdGggLyB3aW5kb3cuaW5uZXJIZWlnaHQsXHJcbiAgICAwLjEsXHJcbiAgICAxMDAwXHJcbiAgKTtcclxuICBjYW1lcmEucG9zaXRpb24uc2V0KDAsIGNvbmZpZy5sZXZlbC53YWxsSGVpZ2h0IC8gMiArIDAuNSwgMCk7IC8vIFBsYXllciBpbml0aWFsIHBvc2l0aW9uXHJcblxyXG4gIHJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoeyBjYW52YXM6IGNhbnZhcywgYW50aWFsaWFzOiB0cnVlIH0pO1xyXG4gIHJlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbiAgcmVuZGVyZXIuc2V0UGl4ZWxSYXRpbyh3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyk7XHJcbiAgcmVuZGVyZXIuc2hhZG93TWFwLmVuYWJsZWQgPSB0cnVlOyAvLyBcdUFERjhcdUI5QkNcdUM3OTAgXHVENjVDXHVDMTMxXHVENjU0XHJcbiAgcmVuZGVyZXIuc2hhZG93TWFwLnR5cGUgPSBUSFJFRS5QQ0ZTb2Z0U2hhZG93TWFwO1xyXG5cclxuICAvLyBcdUM4NzBcdUJBODVcclxuICBjb25zdCBsaWdodCA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KDB4ZmZmZmZmLCAzKTtcclxuICBsaWdodC5wb3NpdGlvbi5zZXQoMTAsIDIwLCAxMCk7XHJcbiAgbGlnaHQuY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgbGlnaHQuc2hhZG93Lm1hcFNpemUud2lkdGggPSAyMDQ4O1xyXG4gIGxpZ2h0LnNoYWRvdy5tYXBTaXplLmhlaWdodCA9IDIwNDg7XHJcbiAgbGlnaHQuc2hhZG93LmNhbWVyYS5uZWFyID0gMC41O1xyXG4gIGxpZ2h0LnNoYWRvdy5jYW1lcmEuZmFyID0gNTA7XHJcbiAgbGlnaHQuc2hhZG93LmNhbWVyYS5sZWZ0ID0gLTIwO1xyXG4gIGxpZ2h0LnNoYWRvdy5jYW1lcmEucmlnaHQgPSAyMDtcclxuICBsaWdodC5zaGFkb3cuY2FtZXJhLnRvcCA9IDIwO1xyXG4gIGxpZ2h0LnNoYWRvdy5jYW1lcmEuYm90dG9tID0gLTIwO1xyXG4gIHNjZW5lLmFkZChsaWdodCk7XHJcbiAgc2NlbmUuYWRkKG5ldyBUSFJFRS5BbWJpZW50TGlnaHQoMHg2NjY2NjYsIDEpKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENhbm5vbi5qcyBcdUJCM0NcdUI5QUMgXHVDNUQ0XHVDOUM0XHVDNzQ0IFx1QzEyNFx1QzgxNVx1RDU2OVx1QjJDOFx1QjJFNC5cclxuICovXHJcbmZ1bmN0aW9uIHNldHVwUGh5c2ljcygpIHtcclxuICB3b3JsZCA9IG5ldyBDQU5OT04uV29ybGQoe1xyXG4gICAgZ3Jhdml0eTogbmV3IENBTk5PTi5WZWMzKDAsIC05LjgyLCAwKSxcclxuICB9KTtcclxuXHJcbiAgLy8gXHVDOUMwXHVCQTc0IChHcm91bmQpXHJcbiAgY29uc3QgZ3JvdW5kU2hhcGUgPSBuZXcgQ0FOTk9OLlBsYW5lKCk7XHJcbiAgY29uc3QgZ3JvdW5kQm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAsIHNoYXBlOiBncm91bmRTaGFwZSB9KTtcclxuICBncm91bmRCb2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShcclxuICAgIG5ldyBDQU5OT04uVmVjMygxLCAwLCAwKSxcclxuICAgIC1NYXRoLlBJIC8gMlxyXG4gICk7IC8vIFhcdUNEOTVcdUM3M0NcdUI4NUMgLTkwXHVCM0M0IFx1RDY4Q1x1QzgwNFxyXG4gIHdvcmxkLmFkZEJvZHkoZ3JvdW5kQm9keSk7XHJcblxyXG4gIC8vIFx1RDUwQ1x1QjgwOFx1Qzc3NFx1QzVCNCBcdUJDMTRcdUI1MTQgKFx1QUMwNFx1QjJFOFx1RDU1QyBcdUNFQTFcdUMyOTAgXHVENjE1XHVEMERDIFx1QzJEQ1x1QkJBQ1x1QjgwOFx1Qzc3NFx1QzE1OClcclxuICBjb25zdCBwbGF5ZXJSYWRpdXMgPSAwLjU7XHJcbiAgY29uc3QgcGxheWVySGVpZ2h0ID0gY29uZmlnLmxldmVsLndhbGxIZWlnaHQ7XHJcbiAgY29uc3QgcGxheWVyU2hhcGUgPSBuZXcgQ0FOTk9OLkN5bGluZGVyKFxyXG4gICAgcGxheWVyUmFkaXVzLFxyXG4gICAgcGxheWVyUmFkaXVzLFxyXG4gICAgcGxheWVySGVpZ2h0LFxyXG4gICAgMTZcclxuICApO1xyXG4gIHBsYXllckJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiA3MCwgc2hhcGU6IHBsYXllclNoYXBlIH0pO1xyXG4gIHBsYXllckJvZHkucG9zaXRpb24uc2V0KDAsIHBsYXllckhlaWdodCAvIDIgKyAxLCAwKTtcclxuICBwbGF5ZXJCb2R5LmZpeGVkUm90YXRpb24gPSB0cnVlOyAvLyBcdUQ2OENcdUM4MDQgXHVCQzI5XHVDOUMwIChGUFMgXHVDRTkwXHVCOUFEXHVEMTMwXHVDQzk4XHVCN0ZDIFx1QjYxMVx1QkMxNFx1Qjg1QyBcdUMxMUMgXHVDNzg4XHVBQzhDKVxyXG4gIHdvcmxkLmFkZEJvZHkocGxheWVyQm9keSk7XHJcblxyXG4gIC8vIFx1Q0RBOVx1QjNDQyBcdUM3NzRcdUJDQTRcdUQyQjggXHVCOUFDXHVDMkE0XHVCMTA4OiBcdUM4MTBcdUQ1MDQgXHVDMEMxXHVEMERDIFx1QzVDNVx1QjM3MFx1Qzc3NFx1RDJCOFxyXG4gIHBsYXllckJvZHkuYWRkRXZlbnRMaXN0ZW5lcihcImNvbGxpZGVcIiwgKGV2ZW50OiBhbnkpID0+IHtcclxuICAgIGNvbnN0IGNvbnRhY3QgPSBldmVudC5jb250YWN0O1xyXG4gICAgLy8gXHVDODExXHVDRDA5IFx1QjE3OFx1QjlEMCBcdUJDQTFcdUQxMzBcdUI5N0MgXHVDMEFDXHVDNkE5XHVENTU4XHVDNUVDIFx1QzlDMFx1QkE3NFx1QUNGQ1x1Qzc1OCBcdUNEQTlcdUIzQ0MgXHVBQzEwXHVDOUMwXHJcbiAgICBpZiAoY29udGFjdC5iaS5tYXNzID09PSAwKSB7XHJcbiAgICAgIC8vIGJpXHVBQzAwIFx1QzlDMFx1QkE3NFx1Qzc3OCBcdUFDQkRcdUM2QjBcclxuICAgICAgY29uc3QgdXBBeGlzID0gbmV3IENBTk5PTi5WZWMzKDAsIDEsIDApO1xyXG4gICAgICBjb25zdCBub3JtYWwgPSBuZXcgQ0FOTk9OLlZlYzMoKTtcclxuICAgICAgY29udGFjdC5uaS5uZWdhdGUobm9ybWFsKTsgLy8gbmlcdUIyOTQgYjEgLT4gYjIgXHVCQzI5XHVENUE1LCBiMShwbGF5ZXIpXHVDNzc0IGIyKGdyb3VuZClcdUM1RDAgXHVCMkZGXHVDNzQ0IFx1QjU0Q1xyXG4gICAgICBpZiAobm9ybWFsLmRvdCh1cEF4aXMpID4gMC41KSB7XHJcbiAgICAgICAgLy8gXHVBRjY0IFx1QzcwNFx1Q0FCRCBcdUJDMjlcdUQ1QTVcdUM3M0NcdUI4NUMgXHVDREE5XHVCM0NDXHVENTc0XHVDNTdDIFx1QzlDMFx1QkE3NFx1QzczQ1x1Qjg1QyBcdUFDMDRcdUM4RkNcclxuICAgICAgICBjYW5KdW1wID0gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICAvLyBcdUJDQkQgKEFyZW5hIFdhbGxzKSAtIFx1QjJFOFx1QzIxQ1x1RDU1QyBcdUMwQzFcdUM3OTAgXHVCQUE4XHVDNTkxXHJcbiAgY29uc3Qgc2l6ZSA9IGNvbmZpZy5sZXZlbC5hcmVuYVNpemU7XHJcbiAgY29uc3Qgd2FsbEhlaWdodCA9IGNvbmZpZy5sZXZlbC53YWxsSGVpZ2h0O1xyXG4gIGNvbnN0IHdhbGxNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoKTtcclxuICBjb25zdCB3YWxsU2hhcGUgPSBuZXcgQ0FOTk9OLkJveChcclxuICAgIG5ldyBDQU5OT04uVmVjMyhzaXplIC8gMiwgd2FsbEhlaWdodCAvIDIsIDAuNSlcclxuICApO1xyXG4gIGNvbnN0IHNpZGVXYWxsU2hhcGUgPSBuZXcgQ0FOTk9OLkJveChcclxuICAgIG5ldyBDQU5OT04uVmVjMygwLjUsIHdhbGxIZWlnaHQgLyAyLCBzaXplIC8gMilcclxuICApO1xyXG5cclxuICBjb25zdCB3YWxscyA9IFtcclxuICAgIC8vIEZyb250L0JhY2tcclxuICAgIHsgcG9zOiBuZXcgQ0FOTk9OLlZlYzMoMCwgd2FsbEhlaWdodCAvIDIsIC1zaXplIC8gMiksIHNoYXBlOiB3YWxsU2hhcGUgfSxcclxuICAgIHsgcG9zOiBuZXcgQ0FOTk9OLlZlYzMoMCwgd2FsbEhlaWdodCAvIDIsIHNpemUgLyAyKSwgc2hhcGU6IHdhbGxTaGFwZSB9LFxyXG4gICAgLy8gTGVmdC9SaWdodFxyXG4gICAge1xyXG4gICAgICBwb3M6IG5ldyBDQU5OT04uVmVjMygtc2l6ZSAvIDIsIHdhbGxIZWlnaHQgLyAyLCAwKSxcclxuICAgICAgc2hhcGU6IHNpZGVXYWxsU2hhcGUsXHJcbiAgICB9LFxyXG4gICAgeyBwb3M6IG5ldyBDQU5OT04uVmVjMyhzaXplIC8gMiwgd2FsbEhlaWdodCAvIDIsIDApLCBzaGFwZTogc2lkZVdhbGxTaGFwZSB9LFxyXG4gIF07XHJcblxyXG4gIHdhbGxzLmZvckVhY2goKHcpID0+IHtcclxuICAgIGNvbnN0IHdhbGxCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgbWFzczogMCxcclxuICAgICAgbWF0ZXJpYWw6IHdhbGxNYXRlcmlhbCxcclxuICAgICAgc2hhcGU6IHcuc2hhcGUsXHJcbiAgICB9KTtcclxuICAgIHdhbGxCb2R5LnBvc2l0aW9uLmNvcHkody5wb3MpO1xyXG4gICAgd29ybGQuYWRkQm9keSh3YWxsQm9keSk7XHJcblxyXG4gICAgLy8gXHVDMkRDXHVBQzAxXHVDODAxIFx1RDQ1Q1x1RDYwNCAoVGhyZWUuanMpXHJcbiAgICBjb25zdCB3YWxsTWVzaCA9IG5ldyBUSFJFRS5NZXNoKFxyXG4gICAgICBuZXcgVEhSRUUuQm94R2VvbWV0cnkoXHJcbiAgICAgICAgdy5zaGFwZS5oYWxmRXh0ZW50cy54ICogMixcclxuICAgICAgICB3LnNoYXBlLmhhbGZFeHRlbnRzLnkgKiAyLFxyXG4gICAgICAgIHcuc2hhcGUuaGFsZkV4dGVudHMueiAqIDJcclxuICAgICAgKSxcclxuICAgICAgbmV3IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsKHsgY29sb3I6IDB4OTk5OTk5IH0pXHJcbiAgICApO1xyXG4gICAgd2FsbE1lc2gucG9zaXRpb24uY29weSh3LnBvcyBhcyBhbnkpOyAvLyBDQU5OT04uVmVjMyB0byBUSFJFRS5WZWN0b3IzXHJcbiAgICB3YWxsTWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcclxuICAgIHNjZW5lLmFkZCh3YWxsTWVzaCk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBcdUQ2NThcdUFDQkQgXHVCQUE4XHVCMzc4XHVDNzQ0IFx1QzEyNFx1QzgxNVx1RDU2OVx1QjJDOFx1QjJFNC4gKFx1QzlDMFx1QkE3NCwgXHVCQ0JEIFx1QzJEQ1x1QUMwMVx1RDY1NClcclxuICovXHJcbmZ1bmN0aW9uIHNldHVwRW52aXJvbm1lbnQoKSB7XHJcbiAgLy8gXHVDOUMwXHVCQTc0IFx1QzJEQ1x1QUMwMVx1RDY1NFxyXG4gIGNvbnN0IHNpemUgPSBjb25maWcubGV2ZWwuYXJlbmFTaXplO1xyXG4gIGNvbnN0IGdyb3VuZE1lc2ggPSBuZXcgVEhSRUUuTWVzaChcclxuICAgIG5ldyBUSFJFRS5QbGFuZUdlb21ldHJ5KHNpemUsIHNpemUpLFxyXG4gICAgbmV3IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsKHsgY29sb3I6IDB4MjI4YjIyIH0pIC8vIEZvcmVzdCBHcmVlblxyXG4gICk7XHJcbiAgZ3JvdW5kTWVzaC5yb3RhdGlvbi54ID0gLU1hdGguUEkgLyAyOyAvLyBYXHVDRDk1XHVDNzNDXHVCODVDIC05MFx1QjNDNCBcdUQ2OENcdUM4MDRcclxuICBncm91bmRNZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xyXG4gIHNjZW5lLmFkZChncm91bmRNZXNoKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFx1QzgwMShFbmVteS9UYXJnZXQpXHVDNzQ0IFx1QzBERFx1QzEzMVx1RDU1OFx1QUNFMCBcdUM1MkNcdUFDRkMgXHVCQjNDXHVCOUFDIFx1QzVENFx1QzlDNFx1QzVEMCBcdUNEOTRcdUFDMDBcdUQ1NjlcdUIyQzhcdUIyRTQuXHJcbiAqL1xyXG5mdW5jdGlvbiBzcGF3bkVuZW1pZXMoKSB7XHJcbiAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoXHJcbiAgICBjb25maWcuZW5lbXkuc2l6ZSxcclxuICAgIGNvbmZpZy5lbmVteS5zaXplLFxyXG4gICAgY29uZmlnLmVuZW15LnNpemVcclxuICApO1xyXG4gIC8vIFx1Qzc3NFx1QkJGOFx1QzlDMCBcdUI4NUNcdUI1MjkgXHVDMkRDXHVCQkFDXHVCODA4XHVDNzc0XHVDMTU4OiBcdUMyRTRcdUM4MUNcdUI4NUNcdUIyOTQgVGV4dHVyZUxvYWRlclx1Qjk3QyBcdUMwQUNcdUM2QTlcdUQ1NzRcdUM1N0MgXHVENTY5XHVCMkM4XHVCMkU0LlxyXG4gIC8vIGNvbnN0IHRleHR1cmUgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpLmxvYWQoY29uZmlnLmVuZW15LnRleHR1cmVQYXRoKTtcclxuICAvLyBjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCh7IG1hcDogdGV4dHVyZSB9KTtcclxuXHJcbiAgLy8gXHVCMkU4XHVDMjFDIFx1QzBDOVx1QzBDMVx1QzczQ1x1Qjg1QyBcdUIzMDBcdUNDQjRcclxuICBjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCh7IGNvbG9yOiAweGZmNDUwMCB9KTsgLy8gT3JhbmdlIFJlZFxyXG5cclxuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvbmZpZy5lbmVteS5jb3VudDsgaSsrKSB7XHJcbiAgICAvLyBcdUJCMzRcdUM3OTFcdUM3MDQgXHVDNzA0XHVDRTU4XHJcbiAgICBjb25zdCBwb3MgPSBuZXcgQ0FOTk9OLlZlYzMoXHJcbiAgICAgIChNYXRoLnJhbmRvbSgpIC0gMC41KSAqIGNvbmZpZy5sZXZlbC5hcmVuYVNpemUgKiAwLjgsXHJcbiAgICAgIGNvbmZpZy5lbmVteS5zaXplIC8gMixcclxuICAgICAgKE1hdGgucmFuZG9tKCkgLSAwLjUpICogY29uZmlnLmxldmVsLmFyZW5hU2l6ZSAqIDAuOFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcclxuICAgIG1lc2gucG9zaXRpb24uY29weShwb3MgYXMgYW55KTtcclxuICAgIG1lc2guY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgICBzY2VuZS5hZGQobWVzaCk7XHJcblxyXG4gICAgY29uc3Qgc2hhcGUgPSBuZXcgQ0FOTk9OLkJveChcclxuICAgICAgbmV3IENBTk5PTi5WZWMzKFxyXG4gICAgICAgIGNvbmZpZy5lbmVteS5zaXplIC8gMixcclxuICAgICAgICBjb25maWcuZW5lbXkuc2l6ZSAvIDIsXHJcbiAgICAgICAgY29uZmlnLmVuZW15LnNpemUgLyAyXHJcbiAgICAgIClcclxuICAgICk7XHJcbiAgICBjb25zdCBib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgbWFzczogMCxcclxuICAgICAgbWF0ZXJpYWw6IGVuZW15TWF0ZXJpYWwsXHJcbiAgICAgIHNoYXBlOiBzaGFwZSxcclxuICAgIH0pOyAvLyBcdUM4MTVcdUM4MDFcdUM3NzggXHVEMEMwXHVBQzlGXHJcbiAgICBib2R5LnBvc2l0aW9uLmNvcHkocG9zKTtcclxuICAgIHdvcmxkLmFkZEJvZHkoYm9keSk7XHJcblxyXG4gICAgLy8gXHVCQTU0XHVDMjZDXHVDNjQwIFx1QkMxNFx1QjUxNFx1Qjk3QyBcdUM1RjBcdUFDQjBcdUQ1NThcdUM1RUMgXHVCMDk4XHVDOTExXHVDNUQwIFx1QzI3RFx1QUM4QyBcdUNDM0VcdUFDRTAgXHVDODFDXHVBQzcwXHVENTYwIFx1QzIxOCBcdUM3ODhcdUIzQzRcdUI4NUQgXHVENTY5XHVCMkM4XHVCMkU0LlxyXG4gICAgKG1lc2ggYXMgYW55KS5jYW5ub25Cb2R5ID0gYm9keTtcclxuXHJcbiAgICBlbmVtaWVzLnB1c2goeyBtZXNoLCBib2R5IH0pO1xyXG4gIH1cclxuICBjb25zb2xlLmxvZyhgU3Bhd25lZCAke2NvbmZpZy5lbmVteS5jb3VudH0gZW5lbWllcy5gKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFx1QzcwOFx1QjNDNFx1QzZCMCBcdUQwNkNcdUFFMzAgXHVCQ0MwXHVBQ0JEIFx1QzJEQyBcdUNFNzRcdUJBNTRcdUI3N0NcdUM2NDAgXHVCODBDXHVCMzU0XHVCN0VDXHVCOTdDIFx1QzVDNVx1QjM3MFx1Qzc3NFx1RDJCOFx1RDU2OVx1QjJDOFx1QjJFNC5cclxuICovXHJcbmZ1bmN0aW9uIG9uV2luZG93UmVzaXplKCkge1xyXG4gIGNhbWVyYS5hc3BlY3QgPSB3aW5kb3cuaW5uZXJXaWR0aCAvIHdpbmRvdy5pbm5lckhlaWdodDtcclxuICBjYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xyXG4gIHJlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbn1cclxuXHJcbi8vID09PSBJbnB1dCBhbmQgQ29udHJvbCA9PT1cclxuXHJcbi8qKlxyXG4gKiBcdUQzRUNcdUM3NzhcdUQxMzAgXHVCNzdEIFx1Q0VFOFx1RDJCOFx1Qjg2NFx1Qzc0NCBcdUMxMjRcdUM4MTVcdUQ1NThcdUFDRTAgXHVDNzg1XHVCODI1IFx1Qzc3NFx1QkNBNFx1RDJCOFx1Qjk3QyBcdUNDOThcdUI5QUNcdUQ1NjlcdUIyQzhcdUIyRTQuXHJcbiAqL1xyXG5mdW5jdGlvbiBzZXR1cENvbnRyb2xzKCkge1xyXG4gIGNvbnRyb2xzID0gbmV3IFBvaW50ZXJMb2NrQ29udHJvbHMoY2FtZXJhLCBjb250YWluZXIpO1xyXG5cclxuICAvLyBcdUI5QzhcdUM2QjBcdUMyQTQgXHVBQzEwXHVCM0M0IFx1Qzg3MFx1QzgwOFx1Qzc0NCBcdUM3MDRcdUQ1NzQgUG9pbnRlckxvY2tDb250cm9scyBcdUIwQjRcdUJEODAgXHVCODVDXHVDOUMxXHVDNzQ0IFx1QjM2RVx1QzVCNFx1QzUwMVx1QjJDOFx1QjJFNC5cclxuICAvLyBUaHJlZS5qc1x1Qzc1OCBQb2ludGVyTG9ja0NvbnRyb2xzXHVCMjk0IFx1QjBCNFx1QkQ4MFx1QzgwMVx1QzczQ1x1Qjg1QyBcdUFDMTBcdUIzQzQgXHVDMTI0XHVDODE1XHVDNzc0IFx1QzVDNlx1QzczQ1x1QkJDMFx1Qjg1QywgXHVDOUMxXHVDODExIFx1QUQ2Q1x1RDYwNFx1RDU2OVx1QjJDOFx1QjJFNC5cclxuICBjb25zdCBvcmlnaW5hbE9uTW91c2VNb3ZlID0gKGNvbnRyb2xzIGFzIGFueSkub25Nb3VzZU1vdmU7XHJcbiAgKGNvbnRyb2xzIGFzIGFueSkub25Nb3VzZU1vdmUgPSBmdW5jdGlvbiAoZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgIC8vIFx1QUUzMFx1QkNGOCBcdUI5QzhcdUM2QjBcdUMyQTQgXHVDNzc0XHVCM0Q5IFx1Q0M5OFx1QjlBQ1xyXG4gICAgb3JpZ2luYWxPbk1vdXNlTW92ZS5jYWxsKGNvbnRyb2xzLCBldmVudCk7XHJcblxyXG4gICAgLy8gVGhyZWUuanMgUG9pbnRlckxvY2tDb250cm9sc1x1QjI5NCBcdUNFNzRcdUJBNTRcdUI3N0MgXHVENjhDXHVDODA0XHVDNzQ0IFx1QzlDMVx1QzgxMSBcdUNDOThcdUI5QUNcdUQ1NThcdUJCQzBcdUI4NUMsXHJcbiAgICAvLyBcdUFDMTBcdUIzQzQgXHVDODcwXHVDODA4XHVDNzQ0IFx1QzcwNFx1RDU3NFx1QzExQ1x1QjI5NCBcdUIwQjRcdUJEODAgXHVDRjU0XHVCNERDXHVCOTdDIFx1QzIxOFx1QzgxNVx1RDU3NFx1QzU3QyBcdUQ1NThcdUM5QzBcdUI5Q0MsXHJcbiAgICAvLyBcdUM1RUNcdUFFMzBcdUMxMUNcdUIyOTQgXHVBRTMwXHVCQ0Y4IFBvaW50ZXJMb2NrQ29udHJvbHNcdUM3NTggXHVDNzkxXHVCM0Q5XHVDNzQ0IFx1QjUzMFx1Qjk4NVx1QjJDOFx1QjJFNC5cclxuICAgIC8vIFx1QjlDOFx1QzZCMFx1QzJBNCBcdUFDMTBcdUIzQzQoY29uZmlnLnBsYXllci5tb3VzZVNlbnNpdGl2aXR5KVx1QjI5NCBUaHJlZS5qcyBcdUNFRThcdUQyQjhcdUI4NjRcdUI3RUNcdUFDMDAgXHVBRTMwXHVCQ0Y4XHVDODAxXHVDNzNDXHVCODVDIFx1QzgxQ1x1QUNGNVx1RDU1OFx1QzlDMCBcdUM1NEFcdUFFMzAgXHVCNTRDXHVCQjM4XHVDNUQwXHJcbiAgICAvLyBcdUMyRTRcdUM4MUNcdUI4NUMgXHVBRDZDXHVENjA0XHVENTU4XHVCODI0XHVCQTc0IFx1Q0VFNFx1QzJBNFx1RDE0MCBcdUNFRThcdUQyQjhcdUI4NjRcdUI3RUNcdUFDMDAgXHVENTQ0XHVDNjk0XHVENTY5XHVCMkM4XHVCMkU0LiBcdUIyRThcdUMyMUNcdUQ2NTRcdUI5N0MgXHVDNzA0XHVENTc0IFx1QUUzMFx1QkNGOCBcdUIzRDlcdUM3OTFcdUM3NDQgXHVDNzIwXHVDOUMwXHVENTY5XHVCMkM4XHVCMkU0LlxyXG4gIH07XHJcblxyXG4gIC8vIFx1QjlDOFx1QzZCMFx1QzJBNCBcdUQwNzRcdUI5QUQgKFx1QkMxQ1x1QzBBQykgXHVDNzc0XHVCQ0E0XHVEMkI4XHJcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIHNob290LCBmYWxzZSk7XHJcblxyXG4gIC8vIFx1RDBBNCBcdUM3ODVcdUI4MjUgXHVDNzc0XHVCQ0E0XHVEMkI4XHJcbiAgY29uc3Qgb25LZXlEb3duID0gKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XHJcbiAgICBzd2l0Y2ggKGV2ZW50LmNvZGUpIHtcclxuICAgICAgY2FzZSBcIktleVdcIjpcclxuICAgICAgICBtb3ZlRm9yd2FyZCA9IHRydWU7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgXCJLZXlTXCI6XHJcbiAgICAgICAgbW92ZUJhY2t3YXJkID0gdHJ1ZTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSBcIktleUFcIjpcclxuICAgICAgICBtb3ZlTGVmdCA9IHRydWU7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgXCJLZXlEXCI6XHJcbiAgICAgICAgbW92ZVJpZ2h0ID0gdHJ1ZTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSBcIlNwYWNlXCI6XHJcbiAgICAgICAgaWYgKGNhbkp1bXApIHtcclxuICAgICAgICAgIHBsYXllckJvZHkudmVsb2NpdHkueSA9IGNvbmZpZy5wbGF5ZXIuanVtcEZvcmNlO1xyXG4gICAgICAgICAgY2FuSnVtcCA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBicmVhaztcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBjb25zdCBvbktleVVwID0gKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XHJcbiAgICBzd2l0Y2ggKGV2ZW50LmNvZGUpIHtcclxuICAgICAgY2FzZSBcIktleVdcIjpcclxuICAgICAgICBtb3ZlRm9yd2FyZCA9IGZhbHNlO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlIFwiS2V5U1wiOlxyXG4gICAgICAgIG1vdmVCYWNrd2FyZCA9IGZhbHNlO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlIFwiS2V5QVwiOlxyXG4gICAgICAgIG1vdmVMZWZ0ID0gZmFsc2U7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgXCJLZXlEXCI6XHJcbiAgICAgICAgbW92ZVJpZ2h0ID0gZmFsc2U7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgb25LZXlEb3duLCBmYWxzZSk7XHJcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImtleXVwXCIsIG9uS2V5VXAsIGZhbHNlKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFx1QUM4Q1x1Qzc4NCBcdUMyRENcdUM3OTEgXHVDMkRDIFx1RDYzOFx1Q0Q5Q1x1QjQyOVx1QjJDOFx1QjJFNC5cclxuICovXHJcbmZ1bmN0aW9uIHN0YXJ0R2FtZSgpIHtcclxuICBpZiAoaXNHYW1lUnVubmluZykgcmV0dXJuO1xyXG5cclxuICAvLyBcdUQwQzBcdUM3NzRcdUQyQzAgXHVENjU0XHVCQTc0IFx1QzIyOFx1QUUzMFx1QUUzMFxyXG4gIHRpdGxlU2NyZWVuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcclxuICBodWQuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcclxuXHJcbiAgLy8gXHVEM0VDXHVDNzc4XHVEMTMwIFx1Qjc3RCBcdUQ2NUNcdUMxMzFcdUQ2NTRcclxuICBjb250cm9scy5sb2NrKCk7XHJcblxyXG4gIC8vIFx1QUM4Q1x1Qzc4NCBcdUI4RThcdUQ1MDQgXHVDMkRDXHVDNzkxXHJcbiAgaXNHYW1lUnVubmluZyA9IHRydWU7XHJcbiAgbGFzdFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICBhbmltYXRlKCk7XHJcblxyXG4gIHBsYXlCR00oKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFx1RDUwQ1x1QjgwOFx1Qzc3NFx1QzVCNCBcdUMyRENcdUM4MTBcdUM1RDBcdUMxMUMgUmF5Y2FzdGluZ1x1Qzc0NCBcdUMwQUNcdUM2QTlcdUQ1NThcdUM1RUMgXHVCQzFDXHVDMEFDXHVENTY5XHVCMkM4XHVCMkU0LlxyXG4gKi9cclxuZnVuY3Rpb24gc2hvb3QoKSB7XHJcbiAgaWYgKCFpc0dhbWVSdW5uaW5nKSByZXR1cm47XHJcblxyXG4gIHBsYXlTZngoXCJzaG9vdFwiKTtcclxuXHJcbiAgY29uc3QgcmF5Y2FzdGVyID0gbmV3IFRIUkVFLlJheWNhc3RlcigpO1xyXG4gIC8vIFx1RDY1NFx1QkE3NCBcdUM5MTFcdUM1NTkgKDAsIDApXHVDNUQwXHVDMTFDIFx1QjgwOFx1Qzc3NFx1Qjk3QyBcdUJDMUNcdUMwQUNcclxuICByYXljYXN0ZXIuc2V0RnJvbUNhbWVyYShuZXcgVEhSRUUuVmVjdG9yMigwLCAwKSwgY2FtZXJhKTtcclxuXHJcbiAgLy8gXHVDODAxIFx1QkE1NFx1QzI2Q1x1QjlDQyBcdUIzMDBcdUMwQzFcdUM3M0NcdUI4NUMgXHVDMTI0XHVDODE1XHJcbiAgY29uc3QgdGFyZ2V0cyA9IGVuZW1pZXMubWFwKChlKSA9PiBlLm1lc2gpO1xyXG4gIGNvbnN0IGludGVyc2VjdHMgPSByYXljYXN0ZXIuaW50ZXJzZWN0T2JqZWN0cyh0YXJnZXRzKTtcclxuXHJcbiAgaWYgKGludGVyc2VjdHMubGVuZ3RoID4gMCkge1xyXG4gICAgY29uc3QgaGl0TWVzaCA9IGludGVyc2VjdHNbMF0ub2JqZWN0IGFzIFRIUkVFLk1lc2g7XHJcbiAgICByZW1vdmVFbmVteShoaXRNZXNoKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBcdUM4MDEgXHVCQTU0XHVDMjZDXHVDNjQwIFx1QkIzQ1x1QjlBQyBcdUJDMTRcdUI1MTRcdUI5N0MgXHVDNTJDXHVDNUQwXHVDMTFDIFx1QzgxQ1x1QUM3MFx1RDU2OVx1QjJDOFx1QjJFNC5cclxuICovXHJcbmZ1bmN0aW9uIHJlbW92ZUVuZW15KG1lc2g6IFRIUkVFLk1lc2gpIHtcclxuICBjb25zdCBib2R5ID0gKG1lc2ggYXMgYW55KS5jYW5ub25Cb2R5IGFzIENBTk5PTi5Cb2R5O1xyXG5cclxuICAvLyAxLiBcdUM4MTBcdUMyMTggXHVDNUM1XHVCMzcwXHVDNzc0XHVEMkI4XHJcbiAgc2NvcmUgKz0gY29uZmlnLmVuZW15LnNjb3JlVmFsdWU7XHJcbiAgc2NvcmVFbGVtZW50LnRleHRDb250ZW50ID0gc2NvcmUudG9TdHJpbmcoKTtcclxuXHJcbiAgLy8gMi4gXHVCQjNDXHVCOUFDIFx1QkMxNFx1QjUxNCBcdUM4MUNcdUFDNzBcclxuICB3b3JsZC5yZW1vdmVCb2R5KGJvZHkpO1xyXG5cclxuICAvLyAzLiBUaHJlZS5qcyBcdUJBNTRcdUMyNkMgXHVDODFDXHVBQzcwXHJcbiAgc2NlbmUucmVtb3ZlKG1lc2gpO1xyXG5cclxuICAvLyA0LiBcdUJDMzBcdUM1RjRcdUM1RDBcdUMxMUMgXHVDODFDXHVBQzcwXHJcbiAgY29uc3QgaW5kZXggPSBlbmVtaWVzLmZpbmRJbmRleCgoZSkgPT4gZS5tZXNoID09PSBtZXNoKTtcclxuICBpZiAoaW5kZXggIT09IC0xKSB7XHJcbiAgICBlbmVtaWVzLnNwbGljZShpbmRleCwgMSk7XHJcbiAgfVxyXG5cclxuICAvLyBcdUFDOENcdUM3ODQgXHVDODg1XHVCOENDIFx1Qzg3MFx1QUM3NCAoXHVCQUE4XHVCNEUwIFx1QzgwMSBcdUM4MUNcdUFDNzApXHJcbiAgaWYgKGVuZW1pZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICBlbmRHYW1lKFwiXHVDMkI5XHVCOUFDXCIpO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFx1QUM4Q1x1Qzc4NFx1Qzc0NCBcdUM4ODVcdUI4Q0NcdUQ1NThcdUFDRTAgXHVBQ0IwXHVBQ0ZDXHVCOTdDIFx1RDQ1Q1x1QzJEQ1x1RDU2OVx1QjJDOFx1QjJFNC5cclxuICovXHJcbmZ1bmN0aW9uIGVuZEdhbWUocmVzdWx0OiBzdHJpbmcpIHtcclxuICBpc0dhbWVSdW5uaW5nID0gZmFsc2U7XHJcbiAgY29udHJvbHMudW5sb2NrKCk7XHJcblxyXG4gIGlmIChiZ21Tb3VyY2UpIGJnbVNvdXJjZS5zdG9wKCk7XHJcblxyXG4gIHRpdGxlU2NyZWVuLnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcclxuICB0aXRsZVNjcmVlbi5pbm5lckhUTUwgPSBgXHJcbiAgICAgICAgPGRpdiBzdHlsZT1cInRleHQtYWxpZ246IGNlbnRlcjsgY29sb3I6IHdoaXRlOyBiYWNrZ3JvdW5kOiByZ2JhKDAsMCwwLDAuOCk7IHBhZGRpbmc6IDQwcHg7IGJvcmRlci1yYWRpdXM6IDEwcHg7XCI+XHJcbiAgICAgICAgICAgIDxoMSBzdHlsZT1cImZvbnQtc2l6ZTogM2VtOyBtYXJnaW4tYm90dG9tOiAxMHB4O1wiPlx1QUM4Q1x1Qzc4NCBcdUM4ODVcdUI4Q0M6ICR7cmVzdWx0fTwvaDE+XHJcbiAgICAgICAgICAgIDxwIHN0eWxlPVwiZm9udC1zaXplOiAyZW07XCI+XHVDRDVDXHVDODg1IFx1QzgxMFx1QzIxODogJHtzY29yZX08L3A+XHJcbiAgICAgICAgICAgIDxidXR0b24gaWQ9XCJyZXN0YXJ0QnV0dG9uXCIgc3R5bGU9XCJwYWRkaW5nOiAxMHB4IDIwcHg7IGZvbnQtc2l6ZTogMS41ZW07IGN1cnNvcjogcG9pbnRlcjsgbWFyZ2luLXRvcDogMjBweDsgYm9yZGVyOiBub25lOyBib3JkZXItcmFkaXVzOiA1cHg7IGJhY2tncm91bmQ6ICM0Q0FGNTA7IGNvbG9yOiB3aGl0ZTtcIj5cdUIyRTRcdUMyREMgXHVDMkRDXHVDNzkxPC9idXR0b24+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICBgO1xyXG5cclxuICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJlc3RhcnRCdXR0b25cIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICAvLyBcdUM1MkNcdUFDRkMgXHVCQjNDXHVCOUFDIFx1QkMxNFx1QjUxNCBcdUM3QUNcdUMxMjRcdUM4MTVcclxuICAgIHJlc2V0R2FtZSgpO1xyXG4gICAgc3RhcnRHYW1lKCk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBcdUFDOENcdUM3ODQgXHVDMEMxXHVEMERDXHVCOTdDIFx1Q0QwOFx1QUUzMFx1RDY1NFx1RDU2OVx1QjJDOFx1QjJFNC5cclxuICovXHJcbmZ1bmN0aW9uIHJlc2V0R2FtZSgpIHtcclxuICAvLyBcdUM3NzRcdUM4MDQgXHVDODAxXHVCNEU0XHVDNzQ0IFx1QkFBOFx1QjQ1MCBcdUM4MUNcdUFDNzBcclxuICBlbmVtaWVzLmZvckVhY2goKGUpID0+IHtcclxuICAgIHdvcmxkLnJlbW92ZUJvZHkoZS5ib2R5KTtcclxuICAgIHNjZW5lLnJlbW92ZShlLm1lc2gpO1xyXG4gIH0pO1xyXG4gIGVuZW1pZXMubGVuZ3RoID0gMDtcclxuXHJcbiAgLy8gXHVENTBDXHVCODA4XHVDNzc0XHVDNUI0IFx1QzcwNFx1Q0U1OCBcdUNEMDhcdUFFMzBcdUQ2NTRcclxuICBwbGF5ZXJCb2R5LnBvc2l0aW9uLnNldCgwLCBjb25maWcubGV2ZWwud2FsbEhlaWdodCAvIDIgKyAxLCAwKTtcclxuICBwbGF5ZXJCb2R5LnZlbG9jaXR5LnNldCgwLCAwLCAwKTtcclxuICBwbGF5ZXJCb2R5LmFuZ3VsYXJWZWxvY2l0eS5zZXQoMCwgMCwgMCk7XHJcblxyXG4gIC8vIFx1QzgxMFx1QzIxOCBcdUNEMDhcdUFFMzBcdUQ2NTRcclxuICBzY29yZSA9IDA7XHJcbiAgaWYgKHNjb3JlRWxlbWVudCkgc2NvcmVFbGVtZW50LnRleHRDb250ZW50ID0gXCIwXCI7XHJcblxyXG4gIC8vIFx1QzBDOFx1Qjg1Q1x1QzZCNCBcdUM4MDEgXHVDMEREXHVDMTMxXHJcbiAgc3Bhd25FbmVtaWVzKCk7XHJcblxyXG4gIGNvbnNvbGUubG9nKFwiR2FtZSBzdGF0ZSByZXNldC5cIik7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBcdUFDOENcdUM3ODRcdUM3NTggXHVCQTU0XHVDNzc4IFx1QjhFOFx1RDUwNFx1Qzc4NVx1QjJDOFx1QjJFNC5cclxuICovXHJcbmZ1bmN0aW9uIGFuaW1hdGUoKSB7XHJcbiAgaWYgKCFpc0dhbWVSdW5uaW5nKSByZXR1cm47XHJcbiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW1hdGUpO1xyXG5cclxuICBjb25zdCB0aW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgY29uc3QgZHQgPSAodGltZSAtIGxhc3RUaW1lKSAvIDEwMDA7XHJcbiAgbGFzdFRpbWUgPSB0aW1lO1xyXG5cclxuICAvLyAxLiBcdUJCM0NcdUI5QUMgXHVDNUQ0XHVDOUM0IFx1QzVDNVx1QjM3MFx1Qzc3NFx1RDJCOFxyXG4gIHdvcmxkLnN0ZXAoMSAvIDYwLCBkdCk7XHJcblxyXG4gIC8vIDIuIFx1RDUwQ1x1QjgwOFx1Qzc3NFx1QzVCNCBcdUM2QzBcdUM5QzFcdUM3ODQgXHVDQzk4XHVCOUFDXHJcbiAgY29uc3Qgc3BlZWQgPSBjb25maWcucGxheWVyLnNwZWVkICogZHQ7XHJcbiAgY29uc3QgYm9keVZlbG9jaXR5ID0gcGxheWVyQm9keS52ZWxvY2l0eTtcclxuICBjb25zdCBjdXJyZW50VmVsb2NpdHkgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCBib2R5VmVsb2NpdHkueSwgMCk7XHJcblxyXG4gIC8vIFx1Q0U3NFx1QkE1NFx1Qjc3QyBcdUJDMjlcdUQ1QTVcdUM3NDQgXHVBRTMwXHVDOTAwXHVDNzNDXHVCODVDIFx1QzZDMFx1QzlDMVx1Qzc4NCBcdUJDQTFcdUQxMzAgXHVBQ0M0XHVDMEIwXHJcbiAgY29uc3QgZGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICBjYW1lcmEuZ2V0V29ybGREaXJlY3Rpb24oZGlyZWN0aW9uKTtcclxuICBkaXJlY3Rpb24ueSA9IDA7IC8vIFlcdUNEOTUoXHVDMjE4XHVDOUMxKSBcdUM2QzBcdUM5QzFcdUM3ODRcdUM3NDAgXHVCQjM0XHVDMkRDXHJcblxyXG4gIGNvbnN0IHJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICByaWdodC5jcm9zc1ZlY3RvcnMoZGlyZWN0aW9uLCBuZXcgVEhSRUUuVmVjdG9yMygwLCAxLCAwKSk7XHJcblxyXG4gIC8vIFRocmVlLmpzIFx1Q0VFOFx1RDJCOFx1Qjg2NFx1Qzc0MCBcdUNFNzRcdUJBNTRcdUI3N0NcdUI5N0MgXHVENjhDXHVDODA0XHVDMkRDXHVEMEE0XHVDOUMwXHVCOUNDLCBcdUJCM0NcdUI5QUNcdUIyOTQgYm9keVx1Qjg1QyBcdUNDOThcdUI5QUNcdUQ1NjlcdUIyQzhcdUIyRTQuXHJcbiAgLy8gXHVENTBDXHVCODA4XHVDNzc0XHVDNUI0XHVDNzU4IFx1QkIzQ1x1QjlBQyBcdUJDMTRcdUI1MTQgXHVDNzA0XHVDRTU4XHVCOTdDIFx1Q0U3NFx1QkE1NFx1Qjc3QyBcdUM3MDRcdUNFNThcdUM2NDAgXHVCM0Q5XHVBRTMwXHVENjU0XHVENTY5XHVCMkM4XHVCMkU0LlxyXG5cclxuICAvLyAyLTEuIFx1QzE4RFx1QjNDNCBcdUMxMjRcdUM4MTUgKFlcdUNEOTUgXHVDMThEXHVCM0M0IFx1QzcyMFx1QzlDMClcclxuICBpZiAobW92ZUZvcndhcmQpIGN1cnJlbnRWZWxvY2l0eS5hZGRTY2FsZWRWZWN0b3IoZGlyZWN0aW9uLCBzcGVlZCk7XHJcbiAgaWYgKG1vdmVCYWNrd2FyZCkgY3VycmVudFZlbG9jaXR5LmFkZFNjYWxlZFZlY3RvcihkaXJlY3Rpb24sIC1zcGVlZCk7XHJcbiAgaWYgKG1vdmVMZWZ0KSBjdXJyZW50VmVsb2NpdHkuYWRkU2NhbGVkVmVjdG9yKHJpZ2h0LCAtc3BlZWQpO1xyXG4gIGlmIChtb3ZlUmlnaHQpIGN1cnJlbnRWZWxvY2l0eS5hZGRTY2FsZWRWZWN0b3IocmlnaHQsIHNwZWVkKTtcclxuXHJcbiAgLy8gXHVCQjNDXHVCOUFDIFx1QkMxNFx1QjUxNFx1QzVEMCBcdUMwQzhcdUI4NUNcdUM2QjQgXHVDMThEXHVCM0M0IFx1QzgwMVx1QzZBOVxyXG4gIHBsYXllckJvZHkudmVsb2NpdHkuc2V0KGN1cnJlbnRWZWxvY2l0eS54LCBib2R5VmVsb2NpdHkueSwgY3VycmVudFZlbG9jaXR5LnopO1xyXG5cclxuICAvLyAyLTIuIFx1Q0U3NFx1QkE1NFx1Qjc3QyBcdUM3MDRcdUNFNTggXHVDNUM1XHVCMzcwXHVDNzc0XHVEMkI4XHJcbiAgY2FtZXJhLnBvc2l0aW9uLmNvcHkocGxheWVyQm9keS5wb3NpdGlvbiBhcyBhbnkpO1xyXG4gIGNhbWVyYS5wb3NpdGlvbi55ICs9IGNvbmZpZy5sZXZlbC53YWxsSGVpZ2h0IC8gMjsgLy8gXHVENTBDXHVCODA4XHVDNzc0XHVDNUI0IFx1QzJEQ1x1QzgxMCBcdUIxOTJcdUM3NzQgXHVDODcwXHVDODE1XHJcblxyXG4gIC8vIDMuIFx1QzgwMSBcdUJBNTRcdUMyNkNcdUM2NDAgXHVCQjNDXHVCOUFDIFx1QkMxNFx1QjUxNCBcdUIzRDlcdUFFMzBcdUQ2NTQgKFx1QzgwMVx1Qzc0MCBcdUM4MTVcdUM4MDFcdUM3NzRcdUJCQzBcdUI4NUMgXHVENTVDXHVCQzg4XHVCOUNDIFx1RDU1OFx1QkE3NCBcdUI0MThcdUM5QzBcdUI5Q0MsIFx1QzU0OFx1QzgwNFx1Qzc0NCBcdUM3MDRcdUQ1NzQgXHVCOEU4XHVENTA0XHVDNUQwXHVDMTFDIFx1Q0M5OFx1QjlBQylcclxuICBlbmVtaWVzLmZvckVhY2goKGUpID0+IHtcclxuICAgIGUubWVzaC5wb3NpdGlvbi5jb3B5KGUuYm9keS5wb3NpdGlvbiBhcyBhbnkpO1xyXG4gICAgZS5tZXNoLnF1YXRlcm5pb24uY29weShlLmJvZHkucXVhdGVybmlvbiBhcyBhbnkpO1xyXG4gIH0pO1xyXG5cclxuICAvLyA0LiBcdUI4MENcdUIzNTRcdUI5QzFcclxuICByZW5kZXJlci5yZW5kZXIoc2NlbmUsIGNhbWVyYSk7XHJcbn1cclxuXHJcbi8vID09PSBNYWluIEV4ZWN1dGlvbiBGbG93ID09PVxyXG5cclxuLyoqXHJcbiAqIFx1QzU2MFx1RDUwQ1x1QjlBQ1x1Q0YwMFx1Qzc3NFx1QzE1OFx1Qzc1OCBcdUM5QzRcdUM3ODVcdUM4MTBcdUM3ODVcdUIyQzhcdUIyRTQuXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBpbml0KCkge1xyXG4gIC8vIDEuIFx1QzEyNFx1QzgxNSBcdUI4NUNcdUI0RENcclxuICBpZiAoIShhd2FpdCBsb2FkQ29uZmlnKCkpKSB7XHJcbiAgICBkb2N1bWVudC5ib2R5LmlubmVySFRNTCA9XHJcbiAgICAgICc8ZGl2IHN0eWxlPVwiY29sb3I6IHJlZDsgcGFkZGluZzogMjBweDtcIj5cdUMxMjRcdUM4MTUgXHVEMzBDXHVDNzdDKGRhdGEuanNvbilcdUM3NDQgXHVCRDg4XHVCN0VDXHVDNjI0XHVCMjk0IFx1QjM3MCBcdUMyRTRcdUQzMjhcdUQ1ODhcdUMyQjVcdUIyQzhcdUIyRTQuPC9kaXY+JztcclxuICAgIHJldHVybjtcclxuICB9XHJcblxyXG4gIC8vIDIuIERPTSBcdUJDMEYgVUkgXHVDMTI0XHVDODE1XHJcbiAgc2V0dXBET00oKTtcclxuXHJcbiAgLy8gMy4gXHVDNjI0XHVCNTE0XHVDNjI0IFx1QzJEQ1x1QkJBQ1x1QjgwOFx1Qzc3NFx1QzE1OCBcdUNEMDhcdUFFMzBcdUQ2NTQgKFx1QzJFNFx1QzgxQ1x1Qjg1Q1x1QjI5NCBhc3NldHMgXHVCODVDXHVCNTI5KVxyXG4gIGF1ZGlvQ29udGV4dCA9IG5ldyB3aW5kb3cuQXVkaW9Db250ZXh0KCk7XHJcbiAgYXdhaXQgbG9hZEF1ZGlvKGNvbmZpZy5hc3NldHMuYmdtUGF0aCkudGhlbihcclxuICAgIChidWZmZXIpID0+IChhc3NldHMuYmdtID0gYnVmZmVyKVxyXG4gICk7XHJcbiAgYXdhaXQgbG9hZEF1ZGlvKGNvbmZpZy5hc3NldHMuc2hvb3RTZnhQYXRoKS50aGVuKFxyXG4gICAgKGJ1ZmZlcikgPT4gKGFzc2V0cy5zaG9vdFNmeCA9IGJ1ZmZlcilcclxuICApO1xyXG5cclxuICAvLyA0LiAzRC9cdUJCM0NcdUI5QUMgXHVDNUQ0XHVDOUM0IFx1QzEyNFx1QzgxNVxyXG4gIHNldHVwVGhyZWUoKTtcclxuICBzZXR1cFBoeXNpY3MoKTtcclxuICBzZXR1cEVudmlyb25tZW50KCk7XHJcbiAgc2V0dXBDb250cm9scygpO1xyXG5cclxuICAvLyA1LiBcdUNEMDhcdUFFMzAgXHVDODAxIFx1QzBERFx1QzEzMVxyXG4gIHNwYXduRW5lbWllcygpO1xyXG5cclxuICBjb25zb2xlLmxvZyhcclxuICAgIFwiSW5pdGlhbGl6YXRpb24gY29tcGxldGUuIFdhaXRpbmcgZm9yIHVzZXIgdG8gY2xpY2sgJ1N0YXJ0IEdhbWUnLlwiXHJcbiAgKTtcclxufVxyXG5cclxud2luZG93Lm9ubG9hZCA9IGluaXQ7XHJcbiJdLAogICJtYXBwaW5ncyI6ICJBQUFBLFlBQVksV0FBVztBQUN2QixZQUFZLFlBQVk7QUFDeEIsU0FBUywyQkFBMkI7QUEwQnBDLElBQUk7QUFDSixJQUFJO0FBQ0osSUFBSTtBQUNKLElBQUk7QUFDSixJQUFJO0FBQ0osSUFBSTtBQUNKLElBQUksV0FBbUI7QUFDdkIsSUFBSSxnQkFBZ0I7QUFDcEIsSUFBSSxRQUFRO0FBR1osSUFBSTtBQUNKLElBQUksY0FBYztBQUNsQixJQUFJLGVBQWU7QUFDbkIsSUFBSSxXQUFXO0FBQ2YsSUFBSSxZQUFZO0FBQ2hCLElBQUksVUFBVTtBQUdkLElBQUk7QUFDSixJQUFJO0FBQ0osSUFBSTtBQUNKLElBQUk7QUFHSixNQUFNLFVBQXFELENBQUM7QUFDNUQsTUFBTSxnQkFBZ0IsSUFBSSxPQUFPLFNBQVM7QUFHMUMsSUFBSTtBQUNKLElBQUksWUFBMEM7QUFDOUMsTUFBTSxTQUFTO0FBQUEsRUFDYixVQUFVO0FBQUEsRUFDVixLQUFLO0FBQ1A7QUFXQSxTQUFTLFNBQVMsT0FBbUIsWUFBMEI7QUFDN0QsUUFBTSxjQUFjO0FBQ3BCLFFBQU0saUJBQWlCO0FBQ3ZCLFFBQU0sYUFBYSxjQUFjO0FBQ2pDLFFBQU0sV0FBVyxhQUFhO0FBQzlCLFFBQU0sYUFBYSxNQUFNLFNBQVM7QUFDbEMsUUFB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
