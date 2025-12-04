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
let isSprinting = false;
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
            <p style="margin-top: 30px; font-size: 0.9em; opacity: 0.7;">WASD: \uC774\uB3D9 | Shift: \uB2EC\uB9AC\uAE30 | Space: \uC810\uD504 | \uB9C8\uC6B0\uC2A4: \uC2DC\uC810 \uC870\uC791 | \uC88C\uD074\uB9AD: \uBC1C\uC0AC</p>
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
      case "ShiftLeft":
        isSprinting = true;
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
      case "ShiftLeft":
        isSprinting = false;
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
  const basePlayerSpeed = config.player.speed;
  const currentMoveSpeed = isSprinting ? basePlayerSpeed * config.player.sprintSpeedMultiplier : basePlayerSpeed;
  const speed = currentMoveSpeed * dt;
  const bodyVelocity = playerBody.velocity;
  const currentVelocity = new THREE.Vector3(0, bodyVelocity.y, 0);
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  direction.y = 0;
  direction.normalize();
  const right = new THREE.Vector3();
  right.crossVectors(direction, new THREE.Vector3(0, 1, 0));
  right.normalize();
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSBcInRocmVlXCI7XHJcbmltcG9ydCAqIGFzIENBTk5PTiBmcm9tIFwiY2Fubm9uLWVzXCI7XHJcbmltcG9ydCB7IFBvaW50ZXJMb2NrQ29udHJvbHMgfSBmcm9tIFwidGhyZWUvZXhhbXBsZXMvanNtL2NvbnRyb2xzL1BvaW50ZXJMb2NrQ29udHJvbHMuanNcIjtcclxuXHJcbi8vIENvbmZpZ3VyYXRpb24gaW50ZXJmYWNlIGJhc2VkIG9uIGRhdGEuanNvblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgcGxheWVyOiB7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgc3ByaW50U3BlZWRNdWx0aXBsaWVyOiBudW1iZXI7IC8vIEFkZGVkIHNwcmludCBzcGVlZCBtdWx0aXBsaWVyXHJcbiAgICBqdW1wRm9yY2U6IG51bWJlcjtcclxuICAgIG1vdXNlU2Vuc2l0aXZpdHk6IG51bWJlcjtcclxuICB9O1xyXG4gIGxldmVsOiB7XHJcbiAgICBhcmVuYVNpemU6IG51bWJlcjtcclxuICAgIHdhbGxIZWlnaHQ6IG51bWJlcjtcclxuICB9O1xyXG4gIGVuZW15OiB7XHJcbiAgICBjb3VudDogbnVtYmVyO1xyXG4gICAgc2l6ZTogbnVtYmVyO1xyXG4gICAgc2NvcmVWYWx1ZTogbnVtYmVyO1xyXG4gICAgdGV4dHVyZVBhdGg6IHN0cmluZzsgLy8gUGxhY2Vob2xkZXIgZm9yIGltYWdlIGFzc2V0XHJcbiAgfTtcclxuICBhc3NldHM6IHtcclxuICAgIGJnbVBhdGg6IHN0cmluZzsgLy8gUGxhY2Vob2xkZXIgZm9yIGF1ZGlvIGFzc2V0XHJcbiAgICBzaG9vdFNmeFBhdGg6IHN0cmluZzsgLy8gUGxhY2Vob2xkZXIgZm9yIGF1ZGlvIGFzc2V0XHJcbiAgfTtcclxufVxyXG5cclxuLy8gPT09IEdsb2JhbCBTdGF0ZSBhbmQgVmFyaWFibGVzID09PVxyXG5sZXQgY29uZmlnOiBHYW1lQ29uZmlnO1xyXG5sZXQgc2NlbmU6IFRIUkVFLlNjZW5lO1xyXG5sZXQgY2FtZXJhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYTtcclxubGV0IHJlbmRlcmVyOiBUSFJFRS5XZWJHTFJlbmRlcmVyO1xyXG5sZXQgY29udHJvbHM6IFBvaW50ZXJMb2NrQ29udHJvbHM7XHJcbmxldCB3b3JsZDogQ0FOTk9OLldvcmxkO1xyXG5sZXQgbGFzdFRpbWU6IG51bWJlciA9IDA7XHJcbmxldCBpc0dhbWVSdW5uaW5nID0gZmFsc2U7XHJcbmxldCBzY29yZSA9IDA7XHJcblxyXG4vLyBQbGF5ZXIgUGh5c2ljcyBCb2R5XHJcbmxldCBwbGF5ZXJCb2R5OiBDQU5OT04uQm9keTtcclxubGV0IG1vdmVGb3J3YXJkID0gZmFsc2U7XHJcbmxldCBtb3ZlQmFja3dhcmQgPSBmYWxzZTtcclxubGV0IG1vdmVMZWZ0ID0gZmFsc2U7XHJcbmxldCBtb3ZlUmlnaHQgPSBmYWxzZTtcclxubGV0IGNhbkp1bXAgPSB0cnVlO1xyXG5sZXQgaXNTcHJpbnRpbmcgPSBmYWxzZTsgLy8gTmV3OiBUcmFja3MgaWYgcGxheWVyIGlzIHNwcmludGluZ1xyXG5cclxuLy8gRHluYW1pYyBET00gRWxlbWVudHNcclxubGV0IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XHJcbmxldCB0aXRsZVNjcmVlbjogSFRNTERpdkVsZW1lbnQ7XHJcbmxldCBodWQ6IEhUTUxEaXZFbGVtZW50O1xyXG5sZXQgc2NvcmVFbGVtZW50OiBIVE1MU3BhbkVsZW1lbnQ7XHJcblxyXG4vLyBDb2xsZWN0aW9uc1xyXG5jb25zdCBlbmVtaWVzOiB7IG1lc2g6IFRIUkVFLk1lc2g7IGJvZHk6IENBTk5PTi5Cb2R5IH1bXSA9IFtdO1xyXG5jb25zdCBlbmVteU1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgpO1xyXG5cclxuLy8gQXVkaW8gc2V0dXAgKFNpbXVsYXRpb24vUGxhY2Vob2xkZXIpXHJcbmxldCBhdWRpb0NvbnRleHQ6IEF1ZGlvQ29udGV4dDtcclxubGV0IGJnbVNvdXJjZTogQXVkaW9CdWZmZXJTb3VyY2VOb2RlIHwgbnVsbCA9IG51bGw7XHJcbmNvbnN0IGFzc2V0cyA9IHtcclxuICBzaG9vdFNmeDogbnVsbCBhcyBBdWRpb0J1ZmZlciB8IG51bGwsXHJcbiAgYmdtOiBudWxsIGFzIEF1ZGlvQnVmZmVyIHwgbnVsbCxcclxufTtcclxuXHJcbi8vID09PSBVdGlsaXR5IEZ1bmN0aW9ucyA9PT1cclxuXHJcbi8qKlxyXG4gKiBQQ00gXHVDNjI0XHVCNTE0XHVDNjI0IFx1QjM3MFx1Qzc3NFx1RDEzMFx1Qjk3QyBXQVYgQmxvYlx1QzczQ1x1Qjg1QyBcdUJDQzBcdUQ2NThcclxuICogVFRTIEFQSVx1Qzc1OCBQQ00xNiBcdUM3NTFcdUIyRjUgXHVDQzk4XHVCOUFDXHVDNUQwIFx1QzBBQ1x1QzZBOVx1QjQxOFx1QjI5NCBcdUM3MjBcdUQyRjhcdUI5QUNcdUQyRjAgKFx1QzVFQ1x1QUUzMFx1QzExQ1x1QjI5NCBcdUIyRThcdUMyMUMgXHVDMkRDXHVCQkFDXHVCODA4XHVDNzc0XHVDMTU4IFx1QkFBOVx1QzgwMSlcclxuICogQHBhcmFtIHBjbTE2IEludDE2QXJyYXkgXHVENjE1XHVDMkREXHVDNzU4IFBDTSBcdUIzNzBcdUM3NzRcdUQxMzBcclxuICogQHBhcmFtIHNhbXBsZVJhdGUgXHVDMEQ4XHVENTBDXHVCOUMxIFx1QzE4RFx1QjNDNFxyXG4gKiBAcmV0dXJucyBXQVYgXHVENjE1XHVDMkREXHVDNzU4IEJsb2JcclxuICovXHJcbmZ1bmN0aW9uIHBjbVRvV2F2KHBjbTE2OiBJbnQxNkFycmF5LCBzYW1wbGVSYXRlOiBudW1iZXIpOiBCbG9iIHtcclxuICBjb25zdCBudW1DaGFubmVscyA9IDE7XHJcbiAgY29uc3QgYnl0ZXNQZXJTYW1wbGUgPSAyOyAvLyBJbnQxNlxyXG4gIGNvbnN0IGJsb2NrQWxpZ24gPSBudW1DaGFubmVscyAqIGJ5dGVzUGVyU2FtcGxlO1xyXG4gIGNvbnN0IGJ5dGVSYXRlID0gc2FtcGxlUmF0ZSAqIGJsb2NrQWxpZ247XHJcbiAgY29uc3QgZGF0YUxlbmd0aCA9IHBjbTE2Lmxlbmd0aCAqIGJ5dGVzUGVyU2FtcGxlO1xyXG4gIGNvbnN0IGJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcig0NCArIGRhdGFMZW5ndGgpO1xyXG4gIGNvbnN0IHZpZXcgPSBuZXcgRGF0YVZpZXcoYnVmZmVyKTtcclxuXHJcbiAgLy8gUklGRiBoZWFkZXJcclxuICB3cml0ZVN0cmluZyh2aWV3LCAwLCBcIlJJRkZcIik7XHJcbiAgdmlldy5zZXRVaW50MzIoNCwgMzYgKyBkYXRhTGVuZ3RoLCB0cnVlKTtcclxuICB3cml0ZVN0cmluZyh2aWV3LCA4LCBcIldBVkVcIik7XHJcblxyXG4gIC8vIEZNVCBzdWItY2h1bmtcclxuICB3cml0ZVN0cmluZyh2aWV3LCAxMiwgXCJmbXQgXCIpO1xyXG4gIHZpZXcuc2V0VWludDMyKDE2LCAxNiwgdHJ1ZSk7IC8vIFN1Yi1jaHVuayBzaXplXHJcbiAgdmlldy5zZXRVaW50MTYoMjAsIDEsIHRydWUpOyAvLyBBdWRpbyBmb3JtYXQgKDEgPSBQQ00pXHJcbiAgdmlldy5zZXRVaW50MTYoMjIsIG51bUNoYW5uZWxzLCB0cnVlKTtcclxuICB2aWV3LnNldFVpbnQzMigyNCwgc2FtcGxlUmF0ZSwgdHJ1ZSk7XHJcbiAgdmlldy5zZXRVaW50MzIoMjgsIGJ5dGVSYXRlLCB0cnVlKTtcclxuICB2aWV3LnNldFVpbnQxNigzMiwgYmxvY2tBbGlnbiwgdHJ1ZSk7XHJcbiAgdmlldy5zZXRVaW50MTYoMzQsIDE2LCB0cnVlKTsgLy8gQml0cyBwZXIgc2FtcGxlXHJcblxyXG4gIC8vIERBVEEgc3ViLWNodW5rXHJcbiAgd3JpdGVTdHJpbmcodmlldywgMzYsIFwiZGF0YVwiKTtcclxuICB2aWV3LnNldFVpbnQzMig0MCwgZGF0YUxlbmd0aCwgdHJ1ZSk7XHJcblxyXG4gIC8vIFdyaXRlIFBDTSBkYXRhXHJcbiAgbGV0IG9mZnNldCA9IDQ0O1xyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcGNtMTYubGVuZ3RoOyBpKyssIG9mZnNldCArPSBieXRlc1BlclNhbXBsZSkge1xyXG4gICAgdmlldy5zZXRJbnQxNihvZmZzZXQsIHBjbTE2W2ldLCB0cnVlKTtcclxuICB9XHJcblxyXG4gIHJldHVybiBuZXcgQmxvYihbdmlld10sIHsgdHlwZTogXCJhdWRpby93YXZcIiB9KTtcclxuXHJcbiAgZnVuY3Rpb24gd3JpdGVTdHJpbmcodmlldzogRGF0YVZpZXcsIG9mZnNldDogbnVtYmVyLCBzdHI6IHN0cmluZykge1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcclxuICAgICAgdmlldy5zZXRVaW50OChvZmZzZXQgKyBpLCBzdHIuY2hhckNvZGVBdChpKSk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogXHVDNjI0XHVCNTE0XHVDNjI0IFx1RDMwQ1x1Qzc3Q1x1Qzc0NCBcdUI4NUNcdUI0RENcdUQ1NThcdUIyOTQgXHVDMkRDXHVCQkFDXHVCODA4XHVDNzc0XHVDMTU4IFx1RDU2OFx1QzIxOCAoXHVDMkU0XHVDODFDIFx1Qjg1Q1x1QjUyOSBcdUM1QzZcdUM3NEMpXHJcbiAqIEBwYXJhbSBwYXRoIFx1QzVEMFx1QzE0QiBcdUFDQkRcdUI4NUNcclxuICogQHJldHVybnMgXHVCODVDXHVCNERDXHVCNDFDIFx1QzYyNFx1QjUxNFx1QzYyNCBcdUJDODRcdUQzN0MgKG51bGwgXHVCQzE4XHVENjU4XHVDNzNDXHVCODVDIFx1QzJEQ1x1QkJBQ1x1QjgwOFx1Qzc3NFx1QzE1OClcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGxvYWRBdWRpbyhwYXRoOiBzdHJpbmcpOiBQcm9taXNlPEF1ZGlvQnVmZmVyIHwgbnVsbD4ge1xyXG4gIC8vIFx1QzJFNFx1QzgxQyBcdUQzMENcdUM3N0MgXHVCODVDXHVCNTI5XHVDNzQwIFx1QkQ4OFx1QUMwMFx1QjJBNVx1RDU1OFx1QkJDMFx1Qjg1QywgXHVDMTMxXHVBQ0Y1XHVDODAxXHVDNzNDXHVCODVDIFx1Qjg1Q1x1QjREQ1x1QjQxQyBcdUFDODNcdUNDOThcdUI3RkMgXHVDMkRDXHVCQkFDXHVCODA4XHVDNzc0XHVDMTU4XHVENTY5XHVCMkM4XHVCMkU0LlxyXG4gIGNvbnNvbGUubG9nKGBbQXNzZXRdIExvYWRpbmcgYXVkaW8gZnJvbTogJHtwYXRofWApO1xyXG4gIHJldHVybiBudWxsOyAvLyBcdUMyRTRcdUM4MUMgQXVkaW9CdWZmZXIgXHVCMzAwXHVDMkUwIG51bGwgXHVCQzE4XHVENjU4XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBcdUJDMzBcdUFDQkRcdUM3NENcdUM1NDVcdUM3NDQgXHVDN0FDXHVDMEREXHVENTU4XHVCMjk0IFx1QzJEQ1x1QkJBQ1x1QjgwOFx1Qzc3NFx1QzE1OCBcdUQ1NjhcdUMyMThcclxuICovXHJcbmZ1bmN0aW9uIHBsYXlCR00oKSB7XHJcbiAgaWYgKGJnbVNvdXJjZSkge1xyXG4gICAgYmdtU291cmNlLnN0b3AoKTtcclxuICAgIGJnbVNvdXJjZS5kaXNjb25uZWN0KCk7XHJcbiAgfVxyXG4gIC8vIFx1QzJFNFx1QzgxQyBCR00gXHVDN0FDXHVDMEREIFx1QjMwMFx1QzJFMCBcdUNGNThcdUMxOTQgXHVCODVDXHVBREY4XHJcbiAgY29uc29sZS5sb2coXCJbQXVkaW9dIFBsYXlpbmcgQkdNLlwiKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFx1RDZBOFx1QUNGQ1x1Qzc0Q1x1Qzc0NCBcdUM3QUNcdUMwRERcdUQ1NThcdUIyOTQgXHVDMkRDXHVCQkFDXHVCODA4XHVDNzc0XHVDMTU4IFx1RDU2OFx1QzIxOFxyXG4gKi9cclxuZnVuY3Rpb24gcGxheVNmeCh0eXBlOiBcInNob290XCIpIHtcclxuICAvLyBcdUMyRTRcdUM4MUMgXHVENkE4XHVBQ0ZDXHVDNzRDIFx1QzdBQ1x1QzBERCBcdUIzMDBcdUMyRTAgXHVDRjU4XHVDMTk0IFx1Qjg1Q1x1QURGOFxyXG4gIGNvbnNvbGUubG9nKGBbQXVkaW9dIFBsYXlpbmcgU0ZYOiAke3R5cGV9YCk7XHJcbn1cclxuXHJcbi8vID09PSBHYW1lIEluaXRpYWxpemF0aW9uIGFuZCBTZXR1cCA9PT1cclxuXHJcbi8qKlxyXG4gKiBkYXRhLmpzb25cdUM3NDQgXHVCRDg4XHVCN0VDXHVDNjQwIFx1QzEyNFx1QzgxNVx1Qzc0NCBcdUI4NUNcdUI0RENcdUQ1NjlcdUIyQzhcdUIyRTQuXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBsb2FkQ29uZmlnKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKFwiZGF0YS5qc29uXCIpO1xyXG4gICAgaWYgKCFyZXNwb25zZS5vaykgdGhyb3cgbmV3IEVycm9yKGBIVFRQIGVycm9yISBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgY29uZmlnID0gKGF3YWl0IHJlc3BvbnNlLmpzb24oKSkgYXMgR2FtZUNvbmZpZztcclxuICAgIGNvbnNvbGUubG9nKFwiR2FtZSBDb25maWcgTG9hZGVkOlwiLCBjb25maWcpO1xyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb246XCIsIGVycm9yKTtcclxuICAgIHJldHVybiBmYWxzZTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBcdUNEMDhcdUFFMzAgRE9NIFx1QzY5NFx1QzE4Q1x1Qjk3QyBcdUMxMjRcdUM4MTVcdUQ1NThcdUFDRTAgXHVEMEMwXHVDNzc0XHVEMkMwIFx1RDY1NFx1QkE3NFx1Qzc0NCBcdUQ0NUNcdUMyRENcdUQ1NjlcdUIyQzhcdUIyRTQuXHJcbiAqL1xyXG5mdW5jdGlvbiBzZXR1cERPTSgpIHtcclxuICAvLyAxLiBcdUNFRThcdUQxNENcdUM3NzRcdUIxMDggXHVDMTI0XHVDODE1OiBcdUNFOTRcdUJDODRcdUMyQTRcdUM2NDAgVUlcdUI5N0MgXHVBQzEwXHVDMkY4XHVCMjk0IFx1QzY5NFx1QzE4Q1xyXG4gIGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgY29udGFpbmVyLmlkID0gXCJnYW1lLWNvbnRhaW5lclwiO1xyXG4gIE9iamVjdC5hc3NpZ24oY29udGFpbmVyLnN0eWxlLCB7XHJcbiAgICBwb3NpdGlvbjogXCJmaXhlZFwiLFxyXG4gICAgdG9wOiBcIjBcIixcclxuICAgIGxlZnQ6IFwiMFwiLFxyXG4gICAgd2lkdGg6IFwiMTAwJVwiLFxyXG4gICAgaGVpZ2h0OiBcIjEwMCVcIixcclxuICAgIG92ZXJmbG93OiBcImhpZGRlblwiLFxyXG4gICAgZm9udEZhbWlseTogXCJzYW5zLXNlcmlmXCIsXHJcbiAgfSk7XHJcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xyXG5cclxuICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImdhbWVDYW52YXNcIikgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgaWYgKCFjYW52YXMpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoXCJDYW52YXMgZWxlbWVudCAjZ2FtZUNhbnZhcyBub3QgZm91bmQuXCIpO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICBjb250YWluZXIuYXBwZW5kQ2hpbGQoY2FudmFzKTtcclxuXHJcbiAgLy8gMi4gXHVEMEMwXHVDNzc0XHVEMkMwIFx1RDY1NFx1QkE3NCAoVGl0bGUgU2NyZWVuKVxyXG4gIHRpdGxlU2NyZWVuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICB0aXRsZVNjcmVlbi5pZCA9IFwidGl0bGUtc2NyZWVuXCI7XHJcbiAgdGl0bGVTY3JlZW4uaW5uZXJIVE1MID0gYFxyXG4gICAgICAgIDxkaXYgc3R5bGU9XCJ0ZXh0LWFsaWduOiBjZW50ZXI7IGNvbG9yOiB3aGl0ZTsgYmFja2dyb3VuZDogcmdiYSgwLDAsMCwwLjgpOyBwYWRkaW5nOiA0MHB4OyBib3JkZXItcmFkaXVzOiAxMHB4O1wiPlxyXG4gICAgICAgICAgICA8aDEgc3R5bGU9XCJmb250LXNpemU6IDNlbTsgbWFyZ2luLWJvdHRvbTogMDtcIj5TSU1QTEUgRlBTIERFTU88L2gxPlxyXG4gICAgICAgICAgICA8cCBzdHlsZT1cImZvbnQtc2l6ZTogMS4yZW07XCI+M0QgRlBTIFx1QUM4Q1x1Qzc4NCAoVGhyZWUuanMgKyBDYW5ub24uanMpPC9wPlxyXG4gICAgICAgICAgICA8YnV0dG9uIGlkPVwic3RhcnRCdXR0b25cIiBzdHlsZT1cInBhZGRpbmc6IDEwcHggMjBweDsgZm9udC1zaXplOiAxLjVlbTsgY3Vyc29yOiBwb2ludGVyOyBtYXJnaW4tdG9wOiAyMHB4OyBib3JkZXI6IG5vbmU7IGJvcmRlci1yYWRpdXM6IDVweDsgYmFja2dyb3VuZDogIzRDQUY1MDsgY29sb3I6IHdoaXRlO1wiPlx1QUM4Q1x1Qzc4NCBcdUMyRENcdUM3OTE8L2J1dHRvbj5cclxuICAgICAgICAgICAgPHAgc3R5bGU9XCJtYXJnaW4tdG9wOiAzMHB4OyBmb250LXNpemU6IDAuOWVtOyBvcGFjaXR5OiAwLjc7XCI+V0FTRDogXHVDNzc0XHVCM0Q5IHwgU2hpZnQ6IFx1QjJFQ1x1QjlBQ1x1QUUzMCB8IFNwYWNlOiBcdUM4MTBcdUQ1MDQgfCBcdUI5QzhcdUM2QjBcdUMyQTQ6IFx1QzJEQ1x1QzgxMCBcdUM4NzBcdUM3OTEgfCBcdUM4OENcdUQwNzRcdUI5QUQ6IFx1QkMxQ1x1QzBBQzwvcD5cclxuICAgICAgICA8L2Rpdj5cclxuICAgIGA7XHJcbiAgT2JqZWN0LmFzc2lnbih0aXRsZVNjcmVlbi5zdHlsZSwge1xyXG4gICAgcG9zaXRpb246IFwiYWJzb2x1dGVcIixcclxuICAgIHRvcDogXCIwXCIsXHJcbiAgICBsZWZ0OiBcIjBcIixcclxuICAgIHdpZHRoOiBcIjEwMCVcIixcclxuICAgIGhlaWdodDogXCIxMDAlXCIsXHJcbiAgICBkaXNwbGF5OiBcImZsZXhcIixcclxuICAgIGp1c3RpZnlDb250ZW50OiBcImNlbnRlclwiLFxyXG4gICAgYWxpZ25JdGVtczogXCJjZW50ZXJcIixcclxuICAgIHpJbmRleDogXCIxMDBcIixcclxuICAgIGJhY2tncm91bmRDb2xvcjogXCJyZ2JhKDAsIDAsIDAsIDAuOTUpXCIsXHJcbiAgfSk7XHJcbiAgY29udGFpbmVyLmFwcGVuZENoaWxkKHRpdGxlU2NyZWVuKTtcclxuXHJcbiAgLy8gMy4gSFVEIChIZWFkLVVwIERpc3BsYXkpXHJcbiAgaHVkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICBodWQuaWQgPSBcImh1ZFwiO1xyXG4gIGh1ZC5pbm5lckhUTUwgPSBgXHJcbiAgICAgICAgPGRpdiBzdHlsZT1cInBvc2l0aW9uOiBhYnNvbHV0ZTsgdG9wOiAyMHB4OyBsZWZ0OiAyMHB4OyBjb2xvcjogd2hpdGU7IGZvbnQtc2l6ZTogMS41ZW07IHRleHQtc2hhZG93OiAwIDAgNXB4IGJsYWNrO1wiPlxyXG4gICAgICAgICAgICBcdUM4MTBcdUMyMTg6IDxzcGFuIGlkPVwic2NvcmVcIj4wPC9zcGFuPlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICAgIDwhLS0gQ3Jvc3NoYWlyIC0tPlxyXG4gICAgICAgIDxkaXYgc3R5bGU9XCJwb3NpdGlvbjogYWJzb2x1dGU7IHRvcDogNTAlOyBsZWZ0OiA1MCU7IHRyYW5zZm9ybTogdHJhbnNsYXRlKC01MCUsIC01MCUpOyBjb2xvcjogd2hpdGU7IGZvbnQtc2l6ZTogMmVtOyBsaW5lLWhlaWdodDogMTsgdGV4dC1zaGFkb3c6IDAgMCA1cHggYmxhY2s7IHBvaW50ZXItZXZlbnRzOiBub25lO1wiPlxyXG4gICAgICAgICAgICArXHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICBgO1xyXG4gIE9iamVjdC5hc3NpZ24oaHVkLnN0eWxlLCB7XHJcbiAgICBwb3NpdGlvbjogXCJhYnNvbHV0ZVwiLFxyXG4gICAgdG9wOiBcIjBcIixcclxuICAgIGxlZnQ6IFwiMFwiLFxyXG4gICAgd2lkdGg6IFwiMTAwJVwiLFxyXG4gICAgaGVpZ2h0OiBcIjEwMCVcIixcclxuICAgIGRpc3BsYXk6IFwibm9uZVwiLCAvLyBcdUFDOENcdUM3ODQgXHVDMkRDXHVDNzkxIFx1QzgwNFx1QzVEMFx1QjI5NCBcdUMyMjhcdUFFNDBcclxuICAgIHpJbmRleDogXCI1MFwiLFxyXG4gICAgcG9pbnRlckV2ZW50czogXCJub25lXCIsXHJcbiAgfSk7XHJcbiAgY29udGFpbmVyLmFwcGVuZENoaWxkKGh1ZCk7XHJcbiAgc2NvcmVFbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzY29yZVwiKSBhcyBIVE1MU3BhbkVsZW1lbnQ7XHJcblxyXG4gIC8vIDQuIFx1Qzc3NFx1QkNBNFx1RDJCOCBcdUI5QUNcdUMyQTRcdUIxMDggXHVDMTI0XHVDODE1XHJcbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdGFydEJ1dHRvblwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIHN0YXJ0R2FtZSk7XHJcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJyZXNpemVcIiwgb25XaW5kb3dSZXNpemUsIGZhbHNlKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFRocmVlLmpzIFx1QzUyQywgXHVDRTc0XHVCQTU0XHVCNzdDLCBcdUI4MENcdUIzNTRcdUI3RUNcdUI5N0MgXHVDMTI0XHVDODE1XHVENTY5XHVCMkM4XHVCMkU0LlxyXG4gKi9cclxuZnVuY3Rpb24gc2V0dXBUaHJlZSgpIHtcclxuICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImdhbWVDYW52YXNcIikgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcblxyXG4gIHNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XHJcbiAgc2NlbmUuYmFja2dyb3VuZCA9IG5ldyBUSFJFRS5Db2xvcigweDQ0NDQ0NCk7XHJcblxyXG4gIGNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYShcclxuICAgIDc1LFxyXG4gICAgd2luZG93LmlubmVyV2lkdGggLyB3aW5kb3cuaW5uZXJIZWlnaHQsXHJcbiAgICAwLjEsXHJcbiAgICAxMDAwXHJcbiAgKTtcclxuICBjYW1lcmEucG9zaXRpb24uc2V0KDAsIGNvbmZpZy5sZXZlbC53YWxsSGVpZ2h0IC8gMiArIDAuNSwgMCk7IC8vIFBsYXllciBpbml0aWFsIHBvc2l0aW9uXHJcblxyXG4gIHJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoeyBjYW52YXM6IGNhbnZhcywgYW50aWFsaWFzOiB0cnVlIH0pO1xyXG4gIHJlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbiAgcmVuZGVyZXIuc2V0UGl4ZWxSYXRpbyh3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyk7XHJcbiAgcmVuZGVyZXIuc2hhZG93TWFwLmVuYWJsZWQgPSB0cnVlOyAvLyBcdUFERjhcdUI5QkNcdUM3OTAgXHVENjVDXHVDMTMxXHVENjU0XHJcbiAgcmVuZGVyZXIuc2hhZG93TWFwLnR5cGUgPSBUSFJFRS5QQ0ZTb2Z0U2hhZG93TWFwO1xyXG5cclxuICAvLyBcdUM4NzBcdUJBODVcclxuICBjb25zdCBsaWdodCA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KDB4ZmZmZmZmLCAzKTtcclxuICBsaWdodC5wb3NpdGlvbi5zZXQoMTAsIDIwLCAxMCk7XHJcbiAgbGlnaHQuY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgbGlnaHQuc2hhZG93Lm1hcFNpemUud2lkdGggPSAyMDQ4O1xyXG4gIGxpZ2h0LnNoYWRvdy5tYXBTaXplLmhlaWdodCA9IDIwNDg7XHJcbiAgbGlnaHQuc2hhZG93LmNhbWVyYS5uZWFyID0gMC41O1xyXG4gIGxpZ2h0LnNoYWRvdy5jYW1lcmEuZmFyID0gNTA7XHJcbiAgbGlnaHQuc2hhZG93LmNhbWVyYS5sZWZ0ID0gLTIwO1xyXG4gIGxpZ2h0LnNoYWRvdy5jYW1lcmEucmlnaHQgPSAyMDtcclxuICBsaWdodC5zaGFkb3cuY2FtZXJhLnRvcCA9IDIwO1xyXG4gIGxpZ2h0LnNoYWRvdy5jYW1lcmEuYm90dG9tID0gLTIwO1xyXG4gIHNjZW5lLmFkZChsaWdodCk7XHJcbiAgc2NlbmUuYWRkKG5ldyBUSFJFRS5BbWJpZW50TGlnaHQoMHg2NjY2NjYsIDEpKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIENhbm5vbi5qcyBcdUJCM0NcdUI5QUMgXHVDNUQ0XHVDOUM0XHVDNzQ0IFx1QzEyNFx1QzgxNVx1RDU2OVx1QjJDOFx1QjJFNC5cclxuICovXHJcbmZ1bmN0aW9uIHNldHVwUGh5c2ljcygpIHtcclxuICB3b3JsZCA9IG5ldyBDQU5OT04uV29ybGQoe1xyXG4gICAgZ3Jhdml0eTogbmV3IENBTk5PTi5WZWMzKDAsIC05LjgyLCAwKSxcclxuICB9KTtcclxuXHJcbiAgLy8gXHVDOUMwXHVCQTc0IChHcm91bmQpXHJcbiAgY29uc3QgZ3JvdW5kU2hhcGUgPSBuZXcgQ0FOTk9OLlBsYW5lKCk7XHJcbiAgY29uc3QgZ3JvdW5kQm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAsIHNoYXBlOiBncm91bmRTaGFwZSB9KTtcclxuICBncm91bmRCb2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShcclxuICAgIG5ldyBDQU5OT04uVmVjMygxLCAwLCAwKSxcclxuICAgIC1NYXRoLlBJIC8gMlxyXG4gICk7IC8vIFhcdUNEOTVcdUM3M0NcdUI4NUMgLTkwXHVCM0M0IFx1RDY4Q1x1QzgwNFxyXG4gIHdvcmxkLmFkZEJvZHkoZ3JvdW5kQm9keSk7XHJcblxyXG4gIC8vIFx1RDUwQ1x1QjgwOFx1Qzc3NFx1QzVCNCBcdUJDMTRcdUI1MTQgKFx1QUMwNFx1QjJFOFx1RDU1QyBcdUNFQTFcdUMyOTAgXHVENjE1XHVEMERDIFx1QzJEQ1x1QkJBQ1x1QjgwOFx1Qzc3NFx1QzE1OClcclxuICBjb25zdCBwbGF5ZXJSYWRpdXMgPSAwLjU7XHJcbiAgY29uc3QgcGxheWVySGVpZ2h0ID0gY29uZmlnLmxldmVsLndhbGxIZWlnaHQ7XHJcbiAgY29uc3QgcGxheWVyU2hhcGUgPSBuZXcgQ0FOTk9OLkN5bGluZGVyKFxyXG4gICAgcGxheWVyUmFkaXVzLFxyXG4gICAgcGxheWVyUmFkaXVzLFxyXG4gICAgcGxheWVySGVpZ2h0LFxyXG4gICAgMTZcclxuICApO1xyXG4gIHBsYXllckJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiA3MCwgc2hhcGU6IHBsYXllclNoYXBlIH0pO1xyXG4gIHBsYXllckJvZHkucG9zaXRpb24uc2V0KDAsIHBsYXllckhlaWdodCAvIDIgKyAxLCAwKTtcclxuICBwbGF5ZXJCb2R5LmZpeGVkUm90YXRpb24gPSB0cnVlOyAvLyBcdUQ2OENcdUM4MDQgXHVCQzI5XHVDOUMwIChGUFMgXHVDRTkwXHVCOUFEXHVEMTMwXHVDQzk4XHVCN0ZDIFx1QjYxMVx1QkMxNFx1Qjg1QyBcdUMxMUMgXHVDNzg4XHVBQzhDKVxyXG4gIHdvcmxkLmFkZEJvZHkocGxheWVyQm9keSk7XHJcblxyXG4gIC8vIFx1Q0RBOVx1QjNDQyBcdUM3NzRcdUJDQTRcdUQyQjggXHVCOUFDXHVDMkE0XHVCMTA4OiBcdUM4MTBcdUQ1MDQgXHVDMEMxXHVEMERDIFx1QzVDNVx1QjM3MFx1Qzc3NFx1RDJCOFxyXG4gIHBsYXllckJvZHkuYWRkRXZlbnRMaXN0ZW5lcihcImNvbGxpZGVcIiwgKGV2ZW50OiBhbnkpID0+IHtcclxuICAgIGNvbnN0IGNvbnRhY3QgPSBldmVudC5jb250YWN0O1xyXG4gICAgLy8gXHVDODExXHVDRDA5IFx1QjE3OFx1QjlEMCBcdUJDQTFcdUQxMzBcdUI5N0MgXHVDMEFDXHVDNkE5XHVENTU4XHVDNUVDIFx1QzlDMFx1QkE3NFx1QUNGQ1x1Qzc1OCBcdUNEQTlcdUIzQ0MgXHVBQzEwXHVDOUMwXHJcbiAgICBpZiAoY29udGFjdC5iaS5tYXNzID09PSAwKSB7XHJcbiAgICAgIC8vIGJpXHVBQzAwIFx1QzlDMFx1QkE3NFx1Qzc3OCBcdUFDQkRcdUM2QjBcclxuICAgICAgY29uc3QgdXBBeGlzID0gbmV3IENBTk5PTi5WZWMzKDAsIDEsIDApO1xyXG4gICAgICBjb25zdCBub3JtYWwgPSBuZXcgQ0FOTk9OLlZlYzMoKTtcclxuICAgICAgY29udGFjdC5uaS5uZWdhdGUobm9ybWFsKTsgLy8gbmlcdUIyOTQgYjEgLT4gYjIgXHVCQzI5XHVENUE1LCBiMShwbGF5ZXIpXHVDNzc0IGIyKGdyb3VuZClcdUM1RDAgXHVCMkZGXHVDNzQ0IFx1QjU0Q1xyXG4gICAgICBpZiAobm9ybWFsLmRvdCh1cEF4aXMpID4gMC41KSB7XHJcbiAgICAgICAgLy8gXHVBRjY0IFx1QzcwNFx1Q0FCRCBcdUJDMjlcdUQ1QTVcdUM3M0NcdUI4NUMgXHVDREE5XHVCM0NDXHVENTc0XHVDNTdDIFx1QzlDMFx1QkE3NFx1QzczQ1x1Qjg1QyBcdUFDMDRcdUM4RkNcclxuICAgICAgICBjYW5KdW1wID0gdHJ1ZTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICAvLyBcdUJDQkQgKEFyZW5hIFdhbGxzKSAtIFx1QjJFOFx1QzIxQ1x1RDU1QyBcdUMwQzFcdUM3OTAgXHVCQUE4XHVDNTkxXHJcbiAgY29uc3Qgc2l6ZSA9IGNvbmZpZy5sZXZlbC5hcmVuYVNpemU7XHJcbiAgY29uc3Qgd2FsbEhlaWdodCA9IGNvbmZpZy5sZXZlbC53YWxsSGVpZ2h0O1xyXG4gIGNvbnN0IHdhbGxNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoKTtcclxuICBjb25zdCB3YWxsU2hhcGUgPSBuZXcgQ0FOTk9OLkJveChcclxuICAgIG5ldyBDQU5OT04uVmVjMyhzaXplIC8gMiwgd2FsbEhlaWdodCAvIDIsIDAuNSlcclxuICApO1xyXG4gIGNvbnN0IHNpZGVXYWxsU2hhcGUgPSBuZXcgQ0FOTk9OLkJveChcclxuICAgIG5ldyBDQU5OT04uVmVjMygwLjUsIHdhbGxIZWlnaHQgLyAyLCBzaXplIC8gMilcclxuICApO1xyXG5cclxuICBjb25zdCB3YWxscyA9IFtcclxuICAgIC8vIEZyb250L0JhY2tcclxuICAgIHsgcG9zOiBuZXcgQ0FOTk9OLlZlYzMoMCwgd2FsbEhlaWdodCAvIDIsIC1zaXplIC8gMiksIHNoYXBlOiB3YWxsU2hhcGUgfSxcclxuICAgIHsgcG9zOiBuZXcgQ0FOTk9OLlZlYzMoMCwgd2FsbEhlaWdodCAvIDIsIHNpemUgLyAyKSwgc2hhcGU6IHdhbGxTaGFwZSB9LFxyXG4gICAgLy8gTGVmdC9SaWdodFxyXG4gICAge1xyXG4gICAgICBwb3M6IG5ldyBDQU5OT04uVmVjMygtc2l6ZSAvIDIsIHdhbGxIZWlnaHQgLyAyLCAwKSxcclxuICAgICAgc2hhcGU6IHNpZGVXYWxsU2hhcGUsXHJcbiAgICB9LFxyXG4gICAgeyBwb3M6IG5ldyBDQU5OT04uVmVjMyhzaXplIC8gMiwgd2FsbEhlaWdodCAvIDIsIDApLCBzaGFwZTogc2lkZVdhbGxTaGFwZSB9LFxyXG4gIF07XHJcblxyXG4gIHdhbGxzLmZvckVhY2goKHcpID0+IHtcclxuICAgIGNvbnN0IHdhbGxCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgbWFzczogMCxcclxuICAgICAgbWF0ZXJpYWw6IHdhbGxNYXRlcmlhbCxcclxuICAgICAgc2hhcGU6IHcuc2hhcGUsXHJcbiAgICB9KTtcclxuICAgIHdhbGxCb2R5LnBvc2l0aW9uLmNvcHkody5wb3MpO1xyXG4gICAgd29ybGQuYWRkQm9keSh3YWxsQm9keSk7XHJcblxyXG4gICAgLy8gXHVDMkRDXHVBQzAxXHVDODAxIFx1RDQ1Q1x1RDYwNCAoVGhyZWUuanMpXHJcbiAgICBjb25zdCB3YWxsTWVzaCA9IG5ldyBUSFJFRS5NZXNoKFxyXG4gICAgICBuZXcgVEhSRUUuQm94R2VvbWV0cnkoXHJcbiAgICAgICAgdy5zaGFwZS5oYWxmRXh0ZW50cy54ICogMixcclxuICAgICAgICB3LnNoYXBlLmhhbGZFeHRlbnRzLnkgKiAyLFxyXG4gICAgICAgIHcuc2hhcGUuaGFsZkV4dGVudHMueiAqIDJcclxuICAgICAgKSxcclxuICAgICAgbmV3IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsKHsgY29sb3I6IDB4OTk5OTk5IH0pXHJcbiAgICApO1xyXG4gICAgd2FsbE1lc2gucG9zaXRpb24uY29weSh3LnBvcyBhcyBhbnkpOyAvLyBDQU5OT04uVmVjMyB0byBUSFJFRS5WZWN0b3IzXHJcbiAgICB3YWxsTWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcclxuICAgIHNjZW5lLmFkZCh3YWxsTWVzaCk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBcdUQ2NThcdUFDQkQgXHVCQUE4XHVCMzc4XHVDNzQ0IFx1QzEyNFx1QzgxNVx1RDU2OVx1QjJDOFx1QjJFNC4gKFx1QzlDMFx1QkE3NCwgXHVCQ0JEIFx1QzJEQ1x1QUMwMVx1RDY1NClcclxuICovXHJcbmZ1bmN0aW9uIHNldHVwRW52aXJvbm1lbnQoKSB7XHJcbiAgLy8gXHVDOUMwXHVCQTc0IFx1QzJEQ1x1QUMwMVx1RDY1NFxyXG4gIGNvbnN0IHNpemUgPSBjb25maWcubGV2ZWwuYXJlbmFTaXplO1xyXG4gIGNvbnN0IGdyb3VuZE1lc2ggPSBuZXcgVEhSRUUuTWVzaChcclxuICAgIG5ldyBUSFJFRS5QbGFuZUdlb21ldHJ5KHNpemUsIHNpemUpLFxyXG4gICAgbmV3IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsKHsgY29sb3I6IDB4MjI4YjIyIH0pIC8vIEZvcmVzdCBHcmVlblxyXG4gICk7XHJcbiAgZ3JvdW5kTWVzaC5yb3RhdGlvbi54ID0gLU1hdGguUEkgLyAyOyAvLyBYXHVDRDk1XHVDNzNDXHVCODVDIC05MFx1QjNDNCBcdUQ2OENcdUM4MDRcclxuICBncm91bmRNZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xyXG4gIHNjZW5lLmFkZChncm91bmRNZXNoKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFx1QzgwMShFbmVteS9UYXJnZXQpXHVDNzQ0IFx1QzBERFx1QzEzMVx1RDU1OFx1QUNFMCBcdUM1MkNcdUFDRkMgXHVCQjNDXHVCOUFDIFx1QzVENFx1QzlDNFx1QzVEMCBcdUNEOTRcdUFDMDBcdUQ1NjlcdUIyQzhcdUIyRTQuXHJcbiAqL1xyXG5mdW5jdGlvbiBzcGF3bkVuZW1pZXMoKSB7XHJcbiAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoXHJcbiAgICBjb25maWcuZW5lbXkuc2l6ZSxcclxuICAgIGNvbmZpZy5lbmVteS5zaXplLFxyXG4gICAgY29uZmlnLmVuZW15LnNpemVcclxuICApO1xyXG4gIC8vIFx1Qzc3NFx1QkJGOFx1QzlDMCBcdUI4NUNcdUI1MjkgXHVDMkRDXHVCQkFDXHVCODA4XHVDNzc0XHVDMTU4OiBcdUMyRTRcdUM4MUNcdUI4NUNcdUIyOTQgVGV4dHVyZUxvYWRlclx1Qjk3QyBcdUMwQUNcdUM2QTlcdUQ1NzRcdUM1N0MgXHVENTY5XHVCMkM4XHVCMkU0LlxyXG4gIC8vIGNvbnN0IHRleHR1cmUgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpLmxvYWQoY29uZmlnLmVuZW15LnRleHR1cmVQYXRoKTtcclxuICAvLyBjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCh7IG1hcDogdGV4dHVyZSB9KTtcclxuXHJcbiAgLy8gXHVCMkU4XHVDMjFDIFx1QzBDOVx1QzBDMVx1QzczQ1x1Qjg1QyBcdUIzMDBcdUNDQjRcclxuICBjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCh7IGNvbG9yOiAweGZmNDUwMCB9KTsgLy8gT3JhbmdlIFJlZFxyXG5cclxuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvbmZpZy5lbmVteS5jb3VudDsgaSsrKSB7XHJcbiAgICAvLyBcdUJCMzRcdUM3OTFcdUM3MDQgXHVDNzA0XHVDRTU4XHJcbiAgICBjb25zdCBwb3MgPSBuZXcgQ0FOTk9OLlZlYzMoXHJcbiAgICAgIChNYXRoLnJhbmRvbSgpIC0gMC41KSAqIGNvbmZpZy5sZXZlbC5hcmVuYVNpemUgKiAwLjgsXHJcbiAgICAgIGNvbmZpZy5lbmVteS5zaXplIC8gMixcclxuICAgICAgKE1hdGgucmFuZG9tKCkgLSAwLjUpICogY29uZmlnLmxldmVsLmFyZW5hU2l6ZSAqIDAuOFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcclxuICAgIG1lc2gucG9zaXRpb24uY29weShwb3MgYXMgYW55KTtcclxuICAgIG1lc2guY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgICBzY2VuZS5hZGQobWVzaCk7XHJcblxyXG4gICAgY29uc3Qgc2hhcGUgPSBuZXcgQ0FOTk9OLkJveChcclxuICAgICAgbmV3IENBTk5PTi5WZWMzKFxyXG4gICAgICAgIGNvbmZpZy5lbmVteS5zaXplIC8gMixcclxuICAgICAgICBjb25maWcuZW5lbXkuc2l6ZSAvIDIsXHJcbiAgICAgICAgY29uZmlnLmVuZW15LnNpemUgLyAyXHJcbiAgICAgIClcclxuICAgICk7XHJcbiAgICBjb25zdCBib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgbWFzczogMCxcclxuICAgICAgbWF0ZXJpYWw6IGVuZW15TWF0ZXJpYWwsXHJcbiAgICAgIHNoYXBlOiBzaGFwZSxcclxuICAgIH0pOyAvLyBcdUM4MTVcdUM4MDFcdUM3NzggXHVEMEMwXHVBQzlGXHJcbiAgICBib2R5LnBvc2l0aW9uLmNvcHkocG9zKTtcclxuICAgIHdvcmxkLmFkZEJvZHkoYm9keSk7XHJcblxyXG4gICAgLy8gXHVCQTU0XHVDMjZDXHVDNjQwIFx1QkMxNFx1QjUxNFx1Qjk3QyBcdUM1RjBcdUFDQjBcdUQ1NThcdUM1RUMgXHVCMDk4XHVDOTExXHVDNUQwIFx1QzI3RFx1QUM4QyBcdUNDM0VcdUFDRTAgXHVDODFDXHVBQzcwXHVENTYwIFx1QzIxOCBcdUM3ODhcdUIzQzRcdUI4NUQgXHVENTY5XHVCMkM4XHVCMkU0LlxyXG4gICAgKG1lc2ggYXMgYW55KS5jYW5ub25Cb2R5ID0gYm9keTtcclxuXHJcbiAgICBlbmVtaWVzLnB1c2goeyBtZXNoLCBib2R5IH0pO1xyXG4gIH1cclxuICBjb25zb2xlLmxvZyhgU3Bhd25lZCAke2NvbmZpZy5lbmVteS5jb3VudH0gZW5lbWllcy5gKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFx1QzcwOFx1QjNDNFx1QzZCMCBcdUQwNkNcdUFFMzAgXHVCQ0MwXHVBQ0JEIFx1QzJEQyBcdUNFNzRcdUJBNTRcdUI3N0NcdUM2NDAgXHVCODBDXHVCMzU0XHVCN0VDXHVCOTdDIFx1QzVDNVx1QjM3MFx1Qzc3NFx1RDJCOFx1RDU2OVx1QjJDOFx1QjJFNC5cclxuICovXHJcbmZ1bmN0aW9uIG9uV2luZG93UmVzaXplKCkge1xyXG4gIGNhbWVyYS5hc3BlY3QgPSB3aW5kb3cuaW5uZXJXaWR0aCAvIHdpbmRvdy5pbm5lckhlaWdodDtcclxuICBjYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xyXG4gIHJlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbn1cclxuXHJcbi8vID09PSBJbnB1dCBhbmQgQ29udHJvbCA9PT1cclxuXHJcbi8qKlxyXG4gKiBcdUQzRUNcdUM3NzhcdUQxMzAgXHVCNzdEIFx1Q0VFOFx1RDJCOFx1Qjg2NFx1Qzc0NCBcdUMxMjRcdUM4MTVcdUQ1NThcdUFDRTAgXHVDNzg1XHVCODI1IFx1Qzc3NFx1QkNBNFx1RDJCOFx1Qjk3QyBcdUNDOThcdUI5QUNcdUQ1NjlcdUIyQzhcdUIyRTQuXHJcbiAqL1xyXG5mdW5jdGlvbiBzZXR1cENvbnRyb2xzKCkge1xyXG4gIGNvbnRyb2xzID0gbmV3IFBvaW50ZXJMb2NrQ29udHJvbHMoY2FtZXJhLCBjb250YWluZXIpO1xyXG5cclxuICAvLyBcdUI5QzhcdUM2QjBcdUMyQTQgXHVBQzEwXHVCM0M0IFx1Qzg3MFx1QzgwOFx1Qzc0NCBcdUM3MDRcdUQ1NzQgUG9pbnRlckxvY2tDb250cm9scyBcdUIwQjRcdUJEODAgXHVCODVDXHVDOUMxXHVDNzQ0IFx1QjM2RVx1QzVCNFx1QzUwMVx1QjJDOFx1QjJFNC5cclxuICAvLyBUaHJlZS5qc1x1Qzc1OCBQb2ludGVyTG9ja0NvbnRyb2xzXHVCMjk0IFx1QjBCNFx1QkQ4MFx1QzgwMVx1QzczQ1x1Qjg1QyBcdUFDMTBcdUIzQzQgXHVDMTI0XHVDODE1XHVDNzc0IFx1QzVDNlx1QzczQ1x1QkJDMFx1Qjg1QywgXHVDOUMxXHVDODExIFx1QUQ2Q1x1RDYwNFx1RDU2OVx1QjJDOFx1QjJFNC5cclxuICBjb25zdCBvcmlnaW5hbE9uTW91c2VNb3ZlID0gKGNvbnRyb2xzIGFzIGFueSkub25Nb3VzZU1vdmU7XHJcbiAgKGNvbnRyb2xzIGFzIGFueSkub25Nb3VzZU1vdmUgPSBmdW5jdGlvbiAoZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgIC8vIFx1QUUzMFx1QkNGOCBcdUI5QzhcdUM2QjBcdUMyQTQgXHVDNzc0XHVCM0Q5IFx1Q0M5OFx1QjlBQ1xyXG4gICAgb3JpZ2luYWxPbk1vdXNlTW92ZS5jYWxsKGNvbnRyb2xzLCBldmVudCk7XHJcblxyXG4gICAgLy8gVGhyZWUuanMgUG9pbnRlckxvY2tDb250cm9sc1x1QjI5NCBcdUNFNzRcdUJBNTRcdUI3N0MgXHVENjhDXHVDODA0XHVDNzQ0IFx1QzlDMVx1QzgxMSBcdUNDOThcdUI5QUNcdUQ1NThcdUJCQzBcdUI4NUMsXHJcbiAgICAvLyBcdUFDMTBcdUIzQzQgXHVDODcwXHVDODA4XHVDNzQ0IFx1QzcwNFx1RDU3NFx1QzExQ1x1QjI5NCBcdUIwQjRcdUJEODAgXHVDRjU0XHVCNERDXHVCOTdDIFx1QzIxOFx1QzgxNVx1RDU3NFx1QzU3QyBcdUQ1NThcdUM5QzBcdUI5Q0MsXHJcbiAgICAvLyBcdUM1RUNcdUFFMzBcdUMxMUNcdUIyOTQgXHVBRTMwXHVCQ0Y4IFBvaW50ZXJMb2NrQ29udHJvbHNcdUM3NTggXHVDNzkxXHVCM0Q5XHVDNzQ0IFx1QjUzMFx1Qjk4NVx1QjJDOFx1QjJFNC5cclxuICAgIC8vIFx1QjlDOFx1QzZCMFx1QzJBNCBcdUFDMTBcdUIzQzQoY29uZmlnLnBsYXllci5tb3VzZVNlbnNpdGl2aXR5KVx1QjI5NCBUaHJlZS5qcyBcdUNFRThcdUQyQjhcdUI4NjRcdUI3RUNcdUFDMDAgXHVBRTMwXHVCQ0Y4XHVDODAxXHVDNzNDXHVCODVDIFx1QzgxQ1x1QUNGNVx1RDU1OFx1QzlDMCBcdUM1NEFcdUFFMzAgXHVCNTRDXHVCQjM4XHVDNUQwXHJcbiAgICAvLyBcdUMyRTRcdUM4MUNcdUI4NUMgXHVBRDZDXHVENjA0XHVENTU4XHVCODI0XHVCQTc0IFx1Q0VFNFx1QzJBNFx1RDE0MCBcdUNFRThcdUQyQjhcdUI4NjRcdUI3RUNcdUFDMDAgXHVENTQ0XHVDNjk0XHVENTY5XHVCMkM4XHVCMkU0LiBcdUIyRThcdUMyMUNcdUQ2NTRcdUI5N0MgXHVDNzA0XHVENTc0IFx1QUUzMFx1QkNGOCBcdUIzRDlcdUM3OTFcdUM3NDQgXHVDNzIwXHVDOUMwXHVENTY5XHVCMkM4XHVCMkU0LlxyXG4gIH07XHJcblxyXG4gIC8vIFx1QjlDOFx1QzZCMFx1QzJBNCBcdUQwNzRcdUI5QUQgKFx1QkMxQ1x1QzBBQykgXHVDNzc0XHVCQ0E0XHVEMkI4XHJcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIHNob290LCBmYWxzZSk7XHJcblxyXG4gIC8vIFx1RDBBNCBcdUM3ODVcdUI4MjUgXHVDNzc0XHVCQ0E0XHVEMkI4XHJcbiAgY29uc3Qgb25LZXlEb3duID0gKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XHJcbiAgICBzd2l0Y2ggKGV2ZW50LmNvZGUpIHtcclxuICAgICAgY2FzZSBcIktleVdcIjpcclxuICAgICAgICBtb3ZlRm9yd2FyZCA9IHRydWU7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgXCJLZXlTXCI6XHJcbiAgICAgICAgbW92ZUJhY2t3YXJkID0gdHJ1ZTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSBcIktleUFcIjpcclxuICAgICAgICBtb3ZlTGVmdCA9IHRydWU7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgXCJLZXlEXCI6XHJcbiAgICAgICAgbW92ZVJpZ2h0ID0gdHJ1ZTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSBcIlNwYWNlXCI6XHJcbiAgICAgICAgaWYgKGNhbkp1bXApIHtcclxuICAgICAgICAgIHBsYXllckJvZHkudmVsb2NpdHkueSA9IGNvbmZpZy5wbGF5ZXIuanVtcEZvcmNlO1xyXG4gICAgICAgICAgY2FuSnVtcCA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSBcIlNoaWZ0TGVmdFwiOiAvLyBOZXc6IFNwcmludFxyXG4gICAgICAgIGlzU3ByaW50aW5nID0gdHJ1ZTtcclxuICAgICAgICBicmVhaztcclxuICAgIH1cclxuICB9O1xyXG5cclxuICBjb25zdCBvbktleVVwID0gKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XHJcbiAgICBzd2l0Y2ggKGV2ZW50LmNvZGUpIHtcclxuICAgICAgY2FzZSBcIktleVdcIjpcclxuICAgICAgICBtb3ZlRm9yd2FyZCA9IGZhbHNlO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlIFwiS2V5U1wiOlxyXG4gICAgICAgIG1vdmVCYWNrd2FyZCA9IGZhbHNlO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlIFwiS2V5QVwiOlxyXG4gICAgICAgIG1vdmVMZWZ0ID0gZmFsc2U7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgXCJLZXlEXCI6XHJcbiAgICAgICAgbW92ZVJpZ2h0ID0gZmFsc2U7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgXCJTaGlmdExlZnRcIjogLy8gTmV3OiBTdG9wIFNwcmludFxyXG4gICAgICAgIGlzU3ByaW50aW5nID0gZmFsc2U7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbiAgfTtcclxuXHJcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgb25LZXlEb3duLCBmYWxzZSk7XHJcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcImtleXVwXCIsIG9uS2V5VXAsIGZhbHNlKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFx1QUM4Q1x1Qzc4NCBcdUMyRENcdUM3OTEgXHVDMkRDIFx1RDYzOFx1Q0Q5Q1x1QjQyOVx1QjJDOFx1QjJFNC5cclxuICovXHJcbmZ1bmN0aW9uIHN0YXJ0R2FtZSgpIHtcclxuICBpZiAoaXNHYW1lUnVubmluZykgcmV0dXJuO1xyXG5cclxuICAvLyBcdUQwQzBcdUM3NzRcdUQyQzAgXHVENjU0XHVCQTc0IFx1QzIyOFx1QUUzMFx1QUUzMFxyXG4gIHRpdGxlU2NyZWVuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcclxuICBodWQuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcclxuXHJcbiAgLy8gXHVEM0VDXHVDNzc4XHVEMTMwIFx1Qjc3RCBcdUQ2NUNcdUMxMzFcdUQ2NTRcclxuICBjb250cm9scy5sb2NrKCk7XHJcblxyXG4gIC8vIFx1QUM4Q1x1Qzc4NCBcdUI4RThcdUQ1MDQgXHVDMkRDXHVDNzkxXHJcbiAgaXNHYW1lUnVubmluZyA9IHRydWU7XHJcbiAgbGFzdFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICBhbmltYXRlKCk7XHJcblxyXG4gIHBsYXlCR00oKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFx1RDUwQ1x1QjgwOFx1Qzc3NFx1QzVCNCBcdUMyRENcdUM4MTBcdUM1RDBcdUMxMUMgUmF5Y2FzdGluZ1x1Qzc0NCBcdUMwQUNcdUM2QTlcdUQ1NThcdUM1RUMgXHVCQzFDXHVDMEFDXHVENTY5XHVCMkM4XHVCMkU0LlxyXG4gKi9cclxuZnVuY3Rpb24gc2hvb3QoKSB7XHJcbiAgaWYgKCFpc0dhbWVSdW5uaW5nKSByZXR1cm47XHJcblxyXG4gIHBsYXlTZngoXCJzaG9vdFwiKTtcclxuXHJcbiAgY29uc3QgcmF5Y2FzdGVyID0gbmV3IFRIUkVFLlJheWNhc3RlcigpO1xyXG4gIC8vIFx1RDY1NFx1QkE3NCBcdUM5MTFcdUM1NTkgKDAsIDApXHVDNUQwXHVDMTFDIFx1QjgwOFx1Qzc3NFx1Qjk3QyBcdUJDMUNcdUMwQUNcclxuICByYXljYXN0ZXIuc2V0RnJvbUNhbWVyYShuZXcgVEhSRUUuVmVjdG9yMigwLCAwKSwgY2FtZXJhKTtcclxuXHJcbiAgLy8gXHVDODAxIFx1QkE1NFx1QzI2Q1x1QjlDQyBcdUIzMDBcdUMwQzFcdUM3M0NcdUI4NUMgXHVDMTI0XHVDODE1XHJcbiAgY29uc3QgdGFyZ2V0cyA9IGVuZW1pZXMubWFwKChlKSA9PiBlLm1lc2gpO1xyXG4gIGNvbnN0IGludGVyc2VjdHMgPSByYXljYXN0ZXIuaW50ZXJzZWN0T2JqZWN0cyh0YXJnZXRzKTtcclxuXHJcbiAgaWYgKGludGVyc2VjdHMubGVuZ3RoID4gMCkge1xyXG4gICAgY29uc3QgaGl0TWVzaCA9IGludGVyc2VjdHNbMF0ub2JqZWN0IGFzIFRIUkVFLk1lc2g7XHJcbiAgICByZW1vdmVFbmVteShoaXRNZXNoKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBcdUM4MDEgXHVCQTU0XHVDMjZDXHVDNjQwIFx1QkIzQ1x1QjlBQyBcdUJDMTRcdUI1MTRcdUI5N0MgXHVDNTJDXHVDNUQwXHVDMTFDIFx1QzgxQ1x1QUM3MFx1RDU2OVx1QjJDOFx1QjJFNC5cclxuICovXHJcbmZ1bmN0aW9uIHJlbW92ZUVuZW15KG1lc2g6IFRIUkVFLk1lc2gpIHtcclxuICBjb25zdCBib2R5ID0gKG1lc2ggYXMgYW55KS5jYW5ub25Cb2R5IGFzIENBTk5PTi5Cb2R5O1xyXG5cclxuICAvLyAxLiBcdUM4MTBcdUMyMTggXHVDNUM1XHVCMzcwXHVDNzc0XHVEMkI4XHJcbiAgc2NvcmUgKz0gY29uZmlnLmVuZW15LnNjb3JlVmFsdWU7XHJcbiAgc2NvcmVFbGVtZW50LnRleHRDb250ZW50ID0gc2NvcmUudG9TdHJpbmcoKTtcclxuXHJcbiAgLy8gMi4gXHVCQjNDXHVCOUFDIFx1QkMxNFx1QjUxNCBcdUM4MUNcdUFDNzBcclxuICB3b3JsZC5yZW1vdmVCb2R5KGJvZHkpO1xyXG5cclxuICAvLyAzLiBUaHJlZS5qcyBcdUJBNTRcdUMyNkMgXHVDODFDXHVBQzcwXHJcbiAgc2NlbmUucmVtb3ZlKG1lc2gpO1xyXG5cclxuICAvLyA0LiBcdUJDMzBcdUM1RjRcdUM1RDBcdUMxMUMgXHVDODFDXHVBQzcwXHJcbiAgY29uc3QgaW5kZXggPSBlbmVtaWVzLmZpbmRJbmRleCgoZSkgPT4gZS5tZXNoID09PSBtZXNoKTtcclxuICBpZiAoaW5kZXggIT09IC0xKSB7XHJcbiAgICBlbmVtaWVzLnNwbGljZShpbmRleCwgMSk7XHJcbiAgfVxyXG5cclxuICAvLyBcdUFDOENcdUM3ODQgXHVDODg1XHVCOENDIFx1Qzg3MFx1QUM3NCAoXHVCQUE4XHVCNEUwIFx1QzgwMSBcdUM4MUNcdUFDNzApXHJcbiAgaWYgKGVuZW1pZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICBlbmRHYW1lKFwiXHVDMkI5XHVCOUFDXCIpO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFx1QUM4Q1x1Qzc4NFx1Qzc0NCBcdUM4ODVcdUI4Q0NcdUQ1NThcdUFDRTAgXHVBQ0IwXHVBQ0ZDXHVCOTdDIFx1RDQ1Q1x1QzJEQ1x1RDU2OVx1QjJDOFx1QjJFNC5cclxuICovXHJcbmZ1bmN0aW9uIGVuZEdhbWUocmVzdWx0OiBzdHJpbmcpIHtcclxuICBpc0dhbWVSdW5uaW5nID0gZmFsc2U7XHJcbiAgY29udHJvbHMudW5sb2NrKCk7XHJcblxyXG4gIGlmIChiZ21Tb3VyY2UpIGJnbVNvdXJjZS5zdG9wKCk7XHJcblxyXG4gIHRpdGxlU2NyZWVuLnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcclxuICB0aXRsZVNjcmVlbi5pbm5lckhUTUwgPSBgXHJcbiAgICAgICAgPGRpdiBzdHlsZT1cInRleHQtYWxpZ246IGNlbnRlcjsgY29sb3I6IHdoaXRlOyBiYWNrZ3JvdW5kOiByZ2JhKDAsMCwwLDAuOCk7IHBhZGRpbmc6IDQwcHg7IGJvcmRlci1yYWRpdXM6IDEwcHg7XCI+XHJcbiAgICAgICAgICAgIDxoMSBzdHlsZT1cImZvbnQtc2l6ZTogM2VtOyBtYXJnaW4tYm90dG9tOiAxMHB4O1wiPlx1QUM4Q1x1Qzc4NCBcdUM4ODVcdUI4Q0M6ICR7cmVzdWx0fTwvaDE+XHJcbiAgICAgICAgICAgIDxwIHN0eWxlPVwiZm9udC1zaXplOiAyZW07XCI+XHVDRDVDXHVDODg1IFx1QzgxMFx1QzIxODogJHtzY29yZX08L3A+XHJcbiAgICAgICAgICAgIDxidXR0b24gaWQ9XCJyZXN0YXJ0QnV0dG9uXCIgc3R5bGU9XCJwYWRkaW5nOiAxMHB4IDIwcHg7IGZvbnQtc2l6ZTogMS41ZW07IGN1cnNvcjogcG9pbnRlcjsgbWFyZ2luLXRvcDogMjBweDsgYm9yZGVyOiBub25lOyBib3JkZXItcmFkaXVzOiA1cHg7IGJhY2tncm91bmQ6ICM0Q0FGNTA7IGNvbG9yOiB3aGl0ZTtcIj5cdUIyRTRcdUMyREMgXHVDMkRDXHVDNzkxPC9idXR0b24+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICBgO1xyXG5cclxuICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJlc3RhcnRCdXR0b25cIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICAvLyBcdUM1MkNcdUFDRkMgXHVCQjNDXHVCOUFDIFx1QkMxNFx1QjUxNCBcdUM3QUNcdUMxMjRcdUM4MTVcclxuICAgIHJlc2V0R2FtZSgpO1xyXG4gICAgc3RhcnRHYW1lKCk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBcdUFDOENcdUM3ODQgXHVDMEMxXHVEMERDXHVCOTdDIFx1Q0QwOFx1QUUzMFx1RDY1NFx1RDU2OVx1QjJDOFx1QjJFNC5cclxuICovXHJcbmZ1bmN0aW9uIHJlc2V0R2FtZSgpIHtcclxuICAvLyBcdUM3NzRcdUM4MDQgXHVDODAxXHVCNEU0XHVDNzQ0IFx1QkFBOFx1QjQ1MCBcdUM4MUNcdUFDNzBcclxuICBlbmVtaWVzLmZvckVhY2goKGUpID0+IHtcclxuICAgIHdvcmxkLnJlbW92ZUJvZHkoZS5ib2R5KTtcclxuICAgIHNjZW5lLnJlbW92ZShlLm1lc2gpO1xyXG4gIH0pO1xyXG4gIGVuZW1pZXMubGVuZ3RoID0gMDtcclxuXHJcbiAgLy8gXHVENTBDXHVCODA4XHVDNzc0XHVDNUI0IFx1QzcwNFx1Q0U1OCBcdUNEMDhcdUFFMzBcdUQ2NTRcclxuICBwbGF5ZXJCb2R5LnBvc2l0aW9uLnNldCgwLCBjb25maWcubGV2ZWwud2FsbEhlaWdodCAvIDIgKyAxLCAwKTtcclxuICBwbGF5ZXJCb2R5LnZlbG9jaXR5LnNldCgwLCAwLCAwKTtcclxuICBwbGF5ZXJCb2R5LmFuZ3VsYXJWZWxvY2l0eS5zZXQoMCwgMCwgMCk7XHJcblxyXG4gIC8vIFx1QzgxMFx1QzIxOCBcdUNEMDhcdUFFMzBcdUQ2NTRcclxuICBzY29yZSA9IDA7XHJcbiAgaWYgKHNjb3JlRWxlbWVudCkgc2NvcmVFbGVtZW50LnRleHRDb250ZW50ID0gXCIwXCI7XHJcblxyXG4gIC8vIFx1QzBDOFx1Qjg1Q1x1QzZCNCBcdUM4MDEgXHVDMEREXHVDMTMxXHJcbiAgc3Bhd25FbmVtaWVzKCk7XHJcblxyXG4gIGNvbnNvbGUubG9nKFwiR2FtZSBzdGF0ZSByZXNldC5cIik7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBcdUFDOENcdUM3ODRcdUM3NTggXHVCQTU0XHVDNzc4IFx1QjhFOFx1RDUwNFx1Qzc4NVx1QjJDOFx1QjJFNC5cclxuICovXHJcbmZ1bmN0aW9uIGFuaW1hdGUoKSB7XHJcbiAgaWYgKCFpc0dhbWVSdW5uaW5nKSByZXR1cm47XHJcbiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW1hdGUpO1xyXG5cclxuICBjb25zdCB0aW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgY29uc3QgZHQgPSAodGltZSAtIGxhc3RUaW1lKSAvIDEwMDA7XHJcbiAgbGFzdFRpbWUgPSB0aW1lO1xyXG5cclxuICAvLyAxLiBcdUJCM0NcdUI5QUMgXHVDNUQ0XHVDOUM0IFx1QzVDNVx1QjM3MFx1Qzc3NFx1RDJCOFxyXG4gIHdvcmxkLnN0ZXAoMSAvIDYwLCBkdCk7XHJcblxyXG4gIC8vIDIuIFx1RDUwQ1x1QjgwOFx1Qzc3NFx1QzVCNCBcdUM2QzBcdUM5QzFcdUM3ODQgXHVDQzk4XHVCOUFDXHJcbiAgLy8gQ2FsY3VsYXRlIGN1cnJlbnQgZWZmZWN0aXZlIHNwZWVkIGJhc2VkIG9uIHNwcmludCBzdGF0ZVxyXG4gIGNvbnN0IGJhc2VQbGF5ZXJTcGVlZCA9IGNvbmZpZy5wbGF5ZXIuc3BlZWQ7XHJcbiAgY29uc3QgY3VycmVudE1vdmVTcGVlZCA9IGlzU3ByaW50aW5nID8gYmFzZVBsYXllclNwZWVkICogY29uZmlnLnBsYXllci5zcHJpbnRTcGVlZE11bHRpcGxpZXIgOiBiYXNlUGxheWVyU3BlZWQ7XHJcbiAgY29uc3Qgc3BlZWQgPSBjdXJyZW50TW92ZVNwZWVkICogZHQ7IC8vIEFwcGx5IGRlbHRhIHRpbWUgdG8gZ2V0IGRpc3RhbmNlIHBlciBmcmFtZVxyXG5cclxuICBjb25zdCBib2R5VmVsb2NpdHkgPSBwbGF5ZXJCb2R5LnZlbG9jaXR5O1xyXG4gIGNvbnN0IGN1cnJlbnRWZWxvY2l0eSA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIGJvZHlWZWxvY2l0eS55LCAwKTsgLy8gUHJlc2VydmUgY3VycmVudCBZIHZlbG9jaXR5IChncmF2aXR5L2p1bXApXHJcblxyXG4gIC8vIFx1Q0U3NFx1QkE1NFx1Qjc3QyBcdUJDMjlcdUQ1QTVcdUM3NDQgXHVBRTMwXHVDOTAwXHVDNzNDXHVCODVDIFx1QzZDMFx1QzlDMVx1Qzc4NCBcdUJDQTFcdUQxMzAgXHVBQ0M0XHVDMEIwXHJcbiAgY29uc3QgZGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICBjYW1lcmEuZ2V0V29ybGREaXJlY3Rpb24oZGlyZWN0aW9uKTtcclxuICBkaXJlY3Rpb24ueSA9IDA7IC8vIFlcdUNEOTUoXHVDMjE4XHVDOUMxKSBcdUM2QzBcdUM5QzFcdUM3ODRcdUM3NDAgXHVCQjM0XHVDMkRDXHJcbiAgZGlyZWN0aW9uLm5vcm1hbGl6ZSgpOyAvLyBOb3JtYWxpemUgYWZ0ZXIgc2V0dGluZyB5IHRvIDAgdG8gbWFpbnRhaW4gY29uc2lzdGVudCBzcGVlZFxyXG5cclxuICBjb25zdCByaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgcmlnaHQuY3Jvc3NWZWN0b3JzKGRpcmVjdGlvbiwgbmV3IFRIUkVFLlZlY3RvcjMoMCwgMSwgMCkpO1xyXG4gIHJpZ2h0Lm5vcm1hbGl6ZSgpOyAvLyBOb3JtYWxpemVcclxuXHJcbiAgLy8gVGhyZWUuanMgXHVDRUU4XHVEMkI4XHVCODY0XHVDNzQwIFx1Q0U3NFx1QkE1NFx1Qjc3Q1x1Qjk3QyBcdUQ2OENcdUM4MDRcdUMyRENcdUQwQTRcdUM5QzBcdUI5Q0MsIFx1QkIzQ1x1QjlBQ1x1QjI5NCBib2R5XHVCODVDIFx1Q0M5OFx1QjlBQ1x1RDU2OVx1QjJDOFx1QjJFNC5cclxuICAvLyBcdUQ1MENcdUI4MDhcdUM3NzRcdUM1QjRcdUM3NTggXHVCQjNDXHVCOUFDIFx1QkMxNFx1QjUxNCBcdUM3MDRcdUNFNThcdUI5N0MgXHVDRTc0XHVCQTU0XHVCNzdDIFx1QzcwNFx1Q0U1OFx1QzY0MCBcdUIzRDlcdUFFMzBcdUQ2NTRcdUQ1NjlcdUIyQzhcdUIyRTQuXHJcblxyXG4gIC8vIDItMS4gXHVDMThEXHVCM0M0IFx1QzEyNFx1QzgxNSAoWVx1Q0Q5NSBcdUMxOERcdUIzQzQgXHVDNzIwXHVDOUMwKVxyXG4gIGlmIChtb3ZlRm9yd2FyZCkgY3VycmVudFZlbG9jaXR5LmFkZFNjYWxlZFZlY3RvcihkaXJlY3Rpb24sIHNwZWVkKTtcclxuICBpZiAobW92ZUJhY2t3YXJkKSBjdXJyZW50VmVsb2NpdHkuYWRkU2NhbGVkVmVjdG9yKGRpcmVjdGlvbiwgLXNwZWVkKTtcclxuICBpZiAobW92ZUxlZnQpIGN1cnJlbnRWZWxvY2l0eS5hZGRTY2FsZWRWZWN0b3IocmlnaHQsIC1zcGVlZCk7XHJcbiAgaWYgKG1vdmVSaWdodCkgY3VycmVudFZlbG9jaXR5LmFkZFNjYWxlZFZlY3RvcihyaWdodCwgc3BlZWQpO1xyXG5cclxuICAvLyBcdUJCM0NcdUI5QUMgXHVCQzE0XHVCNTE0XHVDNUQwIFx1QzBDOFx1Qjg1Q1x1QzZCNCBcdUMxOERcdUIzQzQgXHVDODAxXHVDNkE5XHJcbiAgcGxheWVyQm9keS52ZWxvY2l0eS5zZXQoY3VycmVudFZlbG9jaXR5LngsIGJvZHlWZWxvY2l0eS55LCBjdXJyZW50VmVsb2NpdHkueik7XHJcblxyXG4gIC8vIDItMi4gXHVDRTc0XHVCQTU0XHVCNzdDIFx1QzcwNFx1Q0U1OCBcdUM1QzVcdUIzNzBcdUM3NzRcdUQyQjhcclxuICBjYW1lcmEucG9zaXRpb24uY29weShwbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIGFueSk7XHJcbiAgY2FtZXJhLnBvc2l0aW9uLnkgKz0gY29uZmlnLmxldmVsLndhbGxIZWlnaHQgLyAyOyAvLyBcdUQ1MENcdUI4MDhcdUM3NzRcdUM1QjQgXHVDMkRDXHVDODEwIFx1QjE5Mlx1Qzc3NCBcdUM4NzBcdUM4MTVcclxuXHJcbiAgLy8gMy4gXHVDODAxIFx1QkE1NFx1QzI2Q1x1QzY0MCBcdUJCM0NcdUI5QUMgXHVCQzE0XHVCNTE0IFx1QjNEOVx1QUUzMFx1RDY1NCAoXHVDODAxXHVDNzQwIFx1QzgxNVx1QzgwMVx1Qzc3NFx1QkJDMFx1Qjg1QyBcdUQ1NUNcdUJDODhcdUI5Q0MgXHVENTU4XHVCQTc0IFx1QjQxOFx1QzlDMFx1QjlDQywgXHVDNTQ4XHVDODA0XHVDNzQ0IFx1QzcwNFx1RDU3NCBcdUI4RThcdUQ1MDRcdUM1RDBcdUMxMUMgXHVDQzk4XHVCOUFDKVxyXG4gIGVuZW1pZXMuZm9yRWFjaCgoZSkgPT4ge1xyXG4gICAgZS5tZXNoLnBvc2l0aW9uLmNvcHkoZS5ib2R5LnBvc2l0aW9uIGFzIGFueSk7XHJcbiAgICBlLm1lc2gucXVhdGVybmlvbi5jb3B5KGUuYm9keS5xdWF0ZXJuaW9uIGFzIGFueSk7XHJcbiAgfSk7XHJcblxyXG4gIC8vIDQuIFx1QjgwQ1x1QjM1NFx1QjlDMVxyXG4gIHJlbmRlcmVyLnJlbmRlcihzY2VuZSwgY2FtZXJhKTtcclxufVxyXG5cclxuLy8gPT09IE1haW4gRXhlY3V0aW9uIEZsb3cgPT09XHJcblxyXG4vKipcclxuICogXHVDNTYwXHVENTBDXHVCOUFDXHVDRjAwXHVDNzc0XHVDMTU4XHVDNzU4IFx1QzlDNFx1Qzc4NVx1QzgxMFx1Qzc4NVx1QjJDOFx1QjJFNC5cclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGluaXQoKSB7XHJcbiAgLy8gMS4gXHVDMTI0XHVDODE1IFx1Qjg1Q1x1QjREQ1xyXG4gIGlmICghKGF3YWl0IGxvYWRDb25maWcoKSkpIHtcclxuICAgIGRvY3VtZW50LmJvZHkuaW5uZXJIVE1MID1cclxuICAgICAgJzxkaXYgc3R5bGU9XCJjb2xvcjogcmVkOyBwYWRkaW5nOiAyMHB4O1wiPlx1QzEyNFx1QzgxNSBcdUQzMENcdUM3N0MoZGF0YS5qc29uKVx1Qzc0NCBcdUJEODhcdUI3RUNcdUM2MjRcdUIyOTQgXHVCMzcwIFx1QzJFNFx1RDMyOFx1RDU4OFx1QzJCNVx1QjJDOFx1QjJFNC48L2Rpdj4nO1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuXHJcbiAgLy8gMi4gRE9NIFx1QkMwRiBVSSBcdUMxMjRcdUM4MTVcclxuICBzZXR1cERPTSgpO1xyXG5cclxuICAvLyAzLiBcdUM2MjRcdUI1MTRcdUM2MjQgXHVDMkRDXHVCQkFDXHVCODA4XHVDNzc0XHVDMTU4IFx1Q0QwOFx1QUUzMFx1RDY1NCAoXHVDMkU0XHVDODFDXHVCODVDXHVCMjk0IGFzc2V0cyBcdUI4NUNcdUI1MjkpXHJcbiAgYXVkaW9Db250ZXh0ID0gbmV3IHdpbmRvdy5BdWRpb0NvbnRleHQoKTtcclxuICBhd2FpdCBsb2FkQXVkaW8oY29uZmlnLmFzc2V0cy5iZ21QYXRoKS50aGVuKFxyXG4gICAgKGJ1ZmZlcikgPT4gKGFzc2V0cy5iZ20gPSBidWZmZXIpXHJcbiAgKTtcclxuICBhd2FpdCBsb2FkQXVkaW8oY29uZmlnLmFzc2V0cy5zaG9vdFNmeFBhdGgpLnRoZW4oXHJcbiAgICAoYnVmZmVyKSA9PiAoYXNzZXRzLnNob290U2Z4ID0gYnVmZmVyKVxyXG4gICk7XHJcblxyXG4gIC8vIDQuIDNEL1x1QkIzQ1x1QjlBQyBcdUM1RDRcdUM5QzQgXHVDMTI0XHVDODE1XHJcbiAgc2V0dXBUaHJlZSgpO1xyXG4gIHNldHVwUGh5c2ljcygpO1xyXG4gIHNldHVwRW52aXJvbm1lbnQoKTtcclxuICBzZXR1cENvbnRyb2xzKCk7XHJcblxyXG4gIC8vIDUuIFx1Q0QwOFx1QUUzMCBcdUM4MDEgXHVDMEREXHVDMTMxXHJcbiAgc3Bhd25FbmVtaWVzKCk7XHJcblxyXG4gIGNvbnNvbGUubG9nKFxyXG4gICAgXCJJbml0aWFsaXphdGlvbiBjb21wbGV0ZS4gV2FpdGluZyBmb3IgdXNlciB0byBjbGljayAnU3RhcnQgR2FtZScuXCJcclxuICApO1xyXG59XHJcblxyXG53aW5kb3cub25sb2FkID0gaW5pdDsiXSwKICAibWFwcGluZ3MiOiAiQUFBQSxZQUFZLFdBQVc7QUFDdkIsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsMkJBQTJCO0FBMkJwQyxJQUFJO0FBQ0osSUFBSTtBQUNKLElBQUk7QUFDSixJQUFJO0FBQ0osSUFBSTtBQUNKLElBQUk7QUFDSixJQUFJLFdBQW1CO0FBQ3ZCLElBQUksZ0JBQWdCO0FBQ3BCLElBQUksUUFBUTtBQUdaLElBQUk7QUFDSixJQUFJLGNBQWM7QUFDbEIsSUFBSSxlQUFlO0FBQ25CLElBQUksV0FBVztBQUNmLElBQUksWUFBWTtBQUNoQixJQUFJLFVBQVU7QUFDZCxJQUFJLGNBQWM7QUFHbEIsSUFBSTtBQUNKLElBQUk7QUFDSixJQUFJO0FBQ0osSUFBSTtBQUdKLE1BQU0sVUFBcUQsQ0FBQztBQUM1RCxNQUFNLGdCQUFnQixJQUFJLE9BQU8sU0FBUztBQUcxQyxJQUFJO0FBQ0osSUFBSSxZQUEwQztBQUM5QyxNQUFNLFNBQVM7QUFBQSxFQUNiLFVBQVU7QUFBQSxFQUNWLEtBQUs7QUFDUDtBQVdBLFNBQVMsU0FBUyxPQUFtQixZQUEwQjtBQUM3RCxRQUFNLGNBQWM7QUFDcEIsUUFBTSxpQkFBaUI7QUFDdkIsUUFBTSxhQUFhLGNBQWM7QUFDakMsUUFBTSxXQUFXLGFBQWE7QUFDOUIsUUFBTSxhQUFhLE1BQU0sU0FBUztBQUNsQyxRQUFNLFNBQVMsSUFBSSxZQUFZLEtBQUssVUFBVTtBQUM5QyxRQUFNLE9BQU8sSUFBSSxTQUFTLE1BQU07QUFHaEMsY0FBWSxNQUFNLEdBQUcs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
