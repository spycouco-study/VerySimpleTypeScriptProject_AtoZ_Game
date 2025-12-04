import * as THREE from "three";
import * as CANNON from "cannon-es";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
const canvas = document.getElementById("gameCanvas");
if (!canvas) {
  console.error("Canvas element with ID 'gameCanvas' not found.");
  throw new Error("Canvas element with ID 'gameCanvas' not found.");
}
let gameConfig;
let gameStarted = false;
let playerSpeed;
let jumpVelocity;
const scene = new THREE.Scene();
scene.background = new THREE.Color(8900331);
scene.fog = new THREE.Fog(8900331, 0, 500);
const camera = new THREE.PerspectiveCamera(
  75,
  canvas.clientWidth / canvas.clientHeight,
  // Use canvas dimensions
  0.1,
  1e3
);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(canvas.clientWidth, canvas.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const audioListener = new THREE.AudioListener();
camera.add(audioListener);
const audioLoader = new THREE.AudioLoader();
const textureLoader = new THREE.TextureLoader();
let loadedTextures = {};
let loadedAudioBuffers = {};
let backgroundMusic = null;
let collectSoundEffect = null;
const ambientLight = new THREE.AmbientLight(16777215, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(16777215, 0.8);
directionalLight.position.set(50, 50, 50);
directionalLight.castShadow = true;
directionalLight.shadow.camera.left = -50;
directionalLight.shadow.camera.right = 50;
directionalLight.shadow.camera.top = 50;
directionalLight.shadow.camera.bottom = -50;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
const groundGeometry = new THREE.PlaneGeometry(100, 100);
let groundTexture = null;
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 3066993,
  roughness: 0.8
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const groundBody = new CANNON.Body({
  mass: 0,
  shape: new CANNON.Plane()
});
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);
const playerGeometry = new THREE.BoxGeometry(1, 2, 1);
let playerTexture = null;
const playerMaterial = new THREE.MeshStandardMaterial({ color: 3447003 });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
player.position.set(0, 1, 0);
player.castShadow = true;
scene.add(player);
const playerShape = new CANNON.Box(new CANNON.Vec3(0.5, 1, 0.5));
const playerBody = new CANNON.Body({
  mass: 5,
  shape: playerShape,
  position: new CANNON.Vec3(0, 1, 0),
  // Body is centered at Y=1, so its base is at Y=0
  linearDamping: 0.9,
  angularDamping: 0.9
});
world.addBody(playerBody);
playerBody.fixedRotation = true;
playerBody.updateMassProperties();
const controls = new PointerLockControls(camera, document.body);
controls.object.position.set(0, 1.5, 0);
scene.add(controls.object);
const keys = {};
let canJump = false;
document.addEventListener("keydown", (e) => {
  if (!gameStarted) return;
  keys[e.key.toLowerCase()] = true;
  if (e.key === " " && canJump) {
    playerBody.velocity.y = jumpVelocity;
    canJump = false;
  }
});
document.addEventListener("keyup", (e) => {
  if (!gameStarted) return;
  keys[e.key.toLowerCase()] = false;
});
playerBody.addEventListener("collide", (event) => {
  const contactNormal = new CANNON.Vec3();
  const upAxis = new CANNON.Vec3(0, 1, 0);
  for (let i = 0; i < event.contacts.length; i++) {
    const contact = event.contacts[i];
    if (contact.bi.id === playerBody.id) {
      contact.ni.negate(contactNormal);
    } else {
      contactNormal.copy(contact.ni);
    }
    if (contactNormal.dot(upAxis) > 0.5) {
      canJump = true;
      break;
    }
  }
});
const collectibles = [];
let collectibleTexture = null;
const sphereMaterial = new THREE.MeshStandardMaterial({
  color: 16766720,
  emissive: 16755200,
  emissiveIntensity: 0.5,
  metalness: 0.7,
  roughness: 0.3
});
for (let i = 0; i < 8; i++) {
  const sphereGeometry = new THREE.SphereGeometry(0.5, 32, 32);
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.castShadow = true;
  const x = (Math.random() - 0.5) * 40;
  const z = (Math.random() - 0.5) * 40;
  sphere.position.set(x, 0.5, z);
  scene.add(sphere);
  const sphereShape = new CANNON.Sphere(0.5);
  const sphereBody = new CANNON.Body({
    mass: 0,
    shape: sphereShape,
    position: new CANNON.Vec3(x, 0.5, z)
  });
  world.addBody(sphereBody);
  collectibles.push({ mesh: sphere, body: sphereBody, collected: false });
}
const obstacles = [];
let obstacleTexture = null;
const cubeMaterial = new THREE.MeshStandardMaterial({
  color: 15158332,
  roughness: 0.7
});
for (let i = 0; i < 5; i++) {
  const cubeGeometry = new THREE.BoxGeometry(2, 2, 2);
  const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
  cube.castShadow = true;
  cube.receiveShadow = true;
  const x = (Math.random() - 0.5) * 30;
  const z = (Math.random() - 0.5) * 30;
  cube.position.set(x, 1, z);
  scene.add(cube);
  const cubeShape = new CANNON.Box(new CANNON.Vec3(1, 1, 1));
  const cubeBody = new CANNON.Body({
    mass: 0,
    shape: cubeShape,
    position: new CANNON.Vec3(x, 1, z)
  });
  world.addBody(cubeBody);
  obstacles.push({ mesh: cube, body: cubeBody });
}
let score = 0;
const scoreElement = document.createElement("div");
scoreElement.id = "score";
scoreElement.style.position = "absolute";
scoreElement.style.top = "10px";
scoreElement.style.left = "10px";
scoreElement.style.color = "white";
scoreElement.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
scoreElement.style.padding = "10px";
scoreElement.style.fontFamily = "Arial, sans-serif";
scoreElement.style.fontSize = "1.2em";
scoreElement.style.borderRadius = "5px";
scoreElement.style.zIndex = "100";
document.body.appendChild(scoreElement);
scoreElement.textContent = `Score: ${score}`;
function checkCollectibles() {
  collectibles.forEach((item) => {
    if (!item.collected) {
      const dist = playerBody.position.distanceTo(item.body.position);
      if (dist < 1.5) {
        item.collected = true;
        scene.remove(item.mesh);
        world.removeBody(item.body);
        score += 100;
        if (collectSoundEffect) {
          if (collectSoundEffect.isPlaying) {
            collectSoundEffect.stop();
          }
          collectSoundEffect.play();
        }
      }
    }
  });
}
function updatePlayer() {
  const forwardVector = new THREE.Vector3();
  const rightVector = new THREE.Vector3();
  controls.getDirection(forwardVector);
  forwardVector.y = 0;
  forwardVector.normalize();
  rightVector.crossVectors(forwardVector, new THREE.Vector3(0, 1, 0));
  rightVector.normalize();
  const desiredHorizontalVelocity = new THREE.Vector3(0, 0, 0);
  if (keys["w"] || keys["arrowup"]) desiredHorizontalVelocity.addScaledVector(forwardVector, playerSpeed);
  if (keys["s"] || keys["arrowdown"]) desiredHorizontalVelocity.addScaledVector(forwardVector, -playerSpeed);
  if (keys["a"] || keys["arrowleft"]) desiredHorizontalVelocity.addScaledVector(rightVector, -playerSpeed);
  if (keys["d"] || keys["arrowright"]) desiredHorizontalVelocity.addScaledVector(rightVector, playerSpeed);
  playerBody.velocity.x = desiredHorizontalVelocity.x;
  playerBody.velocity.z = desiredHorizontalVelocity.z;
  player.position.copy(playerBody.position);
  controls.object.position.copy(playerBody.position);
  controls.object.position.y += 0.5;
}
function animateCollectibles() {
  collectibles.forEach((item) => {
    if (!item.collected) {
      item.mesh.rotation.y += 0.02;
      item.mesh.position.y = 0.5 + Math.sin(Date.now() * 2e-3) * 0.2;
    }
  });
}
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const deltaTime = clock.getDelta();
  world.step(1 / 60, deltaTime, 3);
  if (gameStarted) {
    obstacles.forEach(({ mesh, body }) => {
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    });
    updatePlayer();
    checkCollectibles();
    animateCollectibles();
    scoreElement.textContent = `Score: ${score}`;
    if (collectibles.every((c) => c.collected)) {
      scoreElement.textContent = `Score: ${score} - YOU WIN! \u{1F389}`;
      if (backgroundMusic && backgroundMusic.isPlaying) {
        backgroundMusic.stop();
      }
    }
  }
  renderer.render(scene, camera);
}
window.addEventListener("resize", () => {
  const currentCanvas = renderer.domElement;
  const width = currentCanvas.clientWidth;
  const height = currentCanvas.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});
async function loadAssets(assetsConfig) {
  const texturePromises = assetsConfig.images.map((img) => {
    return new Promise((resolve, reject) => {
      textureLoader.load(img.path, (texture) => {
        loadedTextures[img.name] = texture;
        resolve();
      }, void 0, (err) => {
        console.error(`Failed to load texture: ${img.path}`, err);
        reject(err);
      });
    });
  });
  const soundPromises = assetsConfig.sounds.map((snd) => {
    return new Promise((resolve, reject) => {
      audioLoader.load(snd.path, (buffer) => {
        loadedAudioBuffers[snd.name] = buffer;
        resolve();
      }, void 0, (err) => {
        console.error(`Failed to load sound: ${snd.path}`, err);
        reject(err);
      });
    });
  });
  await Promise.all([...texturePromises, ...soundPromises]);
  console.log("All assets loaded.");
}
async function loadGameData() {
  try {
    const response = await fetch("data.json");
    gameConfig = await response.json();
    console.log("Game config loaded:", gameConfig);
    playerSpeed = gameConfig.playerSpeed !== void 0 ? gameConfig.playerSpeed : 7;
    jumpVelocity = gameConfig.jumpVelocity !== void 0 ? gameConfig.jumpVelocity : 8;
    if (gameConfig.assets) {
      await loadAssets(gameConfig.assets);
      groundTexture = loadedTextures["ground_texture"];
      if (groundTexture) {
        groundTexture.wrapS = THREE.RepeatWrapping;
        groundTexture.wrapT = THREE.RepeatWrapping;
        groundTexture.repeat.set(10, 10);
        groundMaterial.map = groundTexture;
        groundMaterial.needsUpdate = true;
        groundMaterial.color.set(16777215);
      }
      playerTexture = loadedTextures["player_texture"];
      if (playerTexture) {
        playerMaterial.map = playerTexture;
        playerMaterial.needsUpdate = true;
        playerMaterial.color.set(16777215);
      }
      collectibleTexture = loadedTextures["collectible_texture"];
      if (collectibleTexture) {
        sphereMaterial.map = collectibleTexture;
        sphereMaterial.needsUpdate = true;
        sphereMaterial.color.set(16777215);
      }
      obstacleTexture = loadedTextures["obstacle_texture"];
      if (obstacleTexture) {
        cubeMaterial.map = obstacleTexture;
        cubeMaterial.needsUpdate = true;
        cubeMaterial.color.set(16777215);
      }
      if (loadedAudioBuffers["background_music"]) {
        backgroundMusic = new THREE.Audio(audioListener);
        backgroundMusic.setBuffer(loadedAudioBuffers["background_music"]);
        backgroundMusic.setLoop(true);
        backgroundMusic.setVolume(gameConfig.assets.sounds.find((s) => s.name === "background_music")?.volume || 0.5);
      }
      if (loadedAudioBuffers["collect_sound"]) {
        collectSoundEffect = new THREE.Audio(audioListener);
        collectSoundEffect.setBuffer(loadedAudioBuffers["collect_sound"]);
        collectSoundEffect.setVolume(gameConfig.assets.sounds.find((s) => s.name === "collect_sound")?.volume || 1);
      }
    }
    setupTitleScreen();
  } catch (error) {
    console.error("Failed to load game data or assets:", error);
    throw new Error("Failed to load game data or assets.");
  }
}
function setupTitleScreen() {
  const titleScreenDiv = document.createElement("div");
  titleScreenDiv.id = "titleScreen";
  titleScreenDiv.style.position = "absolute";
  titleScreenDiv.style.top = "0";
  titleScreenDiv.style.left = "0";
  titleScreenDiv.style.width = "100%";
  titleScreenDiv.style.height = "100%";
  titleScreenDiv.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
  titleScreenDiv.style.color = "white";
  titleScreenDiv.style.display = "flex";
  titleScreenDiv.style.flexDirection = "column";
  titleScreenDiv.style.justifyContent = "center";
  titleScreenDiv.style.alignItems = "center";
  titleScreenDiv.style.fontSize = "2em";
  titleScreenDiv.style.textAlign = "center";
  titleScreenDiv.style.zIndex = "1000";
  const titleText = document.createElement("h1");
  titleText.textContent = gameConfig.gameTitle || "Sample 3D Game";
  titleText.style.marginBottom = "20px";
  titleScreenDiv.appendChild(titleText);
  const startButton = document.createElement("button");
  startButton.textContent = gameConfig.startButtonText || "Click to Start";
  startButton.style.padding = "15px 30px";
  startButton.style.fontSize = "1em";
  startButton.style.backgroundColor = "#4CAF50";
  startButton.style.color = "white";
  startButton.style.border = "none";
  startButton.style.borderRadius = "5px";
  startButton.style.cursor = "pointer";
  startButton.style.marginTop = "20px";
  startButton.onmouseover = () => startButton.style.backgroundColor = "#45a049";
  startButton.onmouseout = () => startButton.style.backgroundColor = "#4CAF50";
  titleScreenDiv.appendChild(startButton);
  document.body.appendChild(titleScreenDiv);
  startButton.addEventListener("click", () => {
    gameStarted = true;
    titleScreenDiv.remove();
    controls.lock();
    if (backgroundMusic) {
      backgroundMusic.play();
    }
    animate();
  });
}
loadGameData();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gM0QgR2FtZSBFeGFtcGxlIHdpdGggVGhyZWUuanMgYW5kIENhbm5vbi5qc1xyXG5pbXBvcnQgKiBhcyBUSFJFRSBmcm9tIFwidGhyZWVcIjtcclxuaW1wb3J0ICogYXMgQ0FOTk9OIGZyb20gXCJjYW5ub24tZXNcIjtcclxuaW1wb3J0IHsgUG9pbnRlckxvY2tDb250cm9scyB9IGZyb20gXCJ0aHJlZS9leGFtcGxlcy9qc20vY29udHJvbHMvUG9pbnRlckxvY2tDb250cm9scy5qc1wiO1xyXG5cclxuLy8gR2V0IHRoZSBjYW52YXMgZWxlbWVudFxyXG5jb25zdCBjYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImdhbWVDYW52YXNcIikgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbmlmICghY2FudmFzKSB7XHJcbiAgY29uc29sZS5lcnJvcihcIkNhbnZhcyBlbGVtZW50IHdpdGggSUQgJ2dhbWVDYW52YXMnIG5vdCBmb3VuZC5cIik7XHJcbiAgdGhyb3cgbmV3IEVycm9yKFwiQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCAnZ2FtZUNhbnZhcycgbm90IGZvdW5kLlwiKTtcclxufVxyXG5cclxuLy8gR2xvYmFsIGdhbWUgY29uZmlndXJhdGlvbiBhbmQgc3RhdGVcclxubGV0IGdhbWVDb25maWc6IGFueTtcclxubGV0IGdhbWVTdGFydGVkOiBib29sZWFuID0gZmFsc2U7XHJcbmxldCBwbGF5ZXJTcGVlZDogbnVtYmVyO1xyXG5sZXQganVtcFZlbG9jaXR5OiBudW1iZXI7XHJcblxyXG4vLyBTY2VuZSBzZXR1cFxyXG5jb25zdCBzY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xyXG5zY2VuZS5iYWNrZ3JvdW5kID0gbmV3IFRIUkVFLkNvbG9yKDB4ODdjZWViKTtcclxuc2NlbmUuZm9nID0gbmV3IFRIUkVFLkZvZygweDg3Y2VlYiwgMCwgNTAwKTtcclxuXHJcbi8vIENhbWVyYSBzZXR1cFxyXG5jb25zdCBjYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEoXHJcbiAgNzUsXHJcbiAgY2FudmFzLmNsaWVudFdpZHRoIC8gY2FudmFzLmNsaWVudEhlaWdodCwgLy8gVXNlIGNhbnZhcyBkaW1lbnNpb25zXHJcbiAgMC4xLFxyXG4gIDEwMDBcclxuKTtcclxuLy8gSW5pdGlhbCBjYW1lcmEgcG9zaXRpb24gd2lsbCBiZSBzZXQgYnkgUG9pbnRlckxvY2tDb250cm9sc1xyXG5cclxuLy8gUmVuZGVyZXIgc2V0dXBcclxuY29uc3QgcmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcih7IGNhbnZhczogY2FudmFzLCBhbnRpYWxpYXM6IHRydWUgfSk7IC8vIERyYXcgZGlyZWN0bHkgdG8gdGhlIHNwZWNpZmllZCBjYW52YXNcclxucmVuZGVyZXIuc2V0U2l6ZShjYW52YXMuY2xpZW50V2lkdGgsIGNhbnZhcy5jbGllbnRIZWlnaHQpOyAvLyBVc2UgY2FudmFzIGRpbWVuc2lvbnNcclxucmVuZGVyZXIuc2hhZG93TWFwLmVuYWJsZWQgPSB0cnVlO1xyXG5yZW5kZXJlci5zaGFkb3dNYXAudHlwZSA9IFRIUkVFLlBDRlNvZnRTaGFkb3dNYXA7XHJcblxyXG4vLyBBdWRpbyBzZXR1cFxyXG5jb25zdCBhdWRpb0xpc3RlbmVyID0gbmV3IFRIUkVFLkF1ZGlvTGlzdGVuZXIoKTtcclxuY2FtZXJhLmFkZChhdWRpb0xpc3RlbmVyKTtcclxuY29uc3QgYXVkaW9Mb2FkZXIgPSBuZXcgVEhSRUUuQXVkaW9Mb2FkZXIoKTtcclxuY29uc3QgdGV4dHVyZUxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKCk7XHJcblxyXG5sZXQgbG9hZGVkVGV4dHVyZXM6IHsgW25hbWU6IHN0cmluZ106IFRIUkVFLlRleHR1cmUgfSA9IHt9O1xyXG5sZXQgbG9hZGVkQXVkaW9CdWZmZXJzOiB7IFtuYW1lOiBzdHJpbmddOiBBdWRpb0J1ZmZlciB9ID0ge307XHJcbmxldCBiYWNrZ3JvdW5kTXVzaWM6IFRIUkVFLkF1ZGlvIHwgbnVsbCA9IG51bGw7XHJcbmxldCBjb2xsZWN0U291bmRFZmZlY3Q6IFRIUkVFLkF1ZGlvIHwgbnVsbCA9IG51bGw7XHJcblxyXG4vLyBMaWdodGluZ1xyXG5jb25zdCBhbWJpZW50TGlnaHQgPSBuZXcgVEhSRUUuQW1iaWVudExpZ2h0KDB4ZmZmZmZmLCAwLjYpO1xyXG5zY2VuZS5hZGQoYW1iaWVudExpZ2h0KTtcclxuXHJcbmNvbnN0IGRpcmVjdGlvbmFsTGlnaHQgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCgweGZmZmZmZiwgMC44KTtcclxuZGlyZWN0aW9uYWxMaWdodC5wb3NpdGlvbi5zZXQoNTAsIDUwLCA1MCk7XHJcbmRpcmVjdGlvbmFsTGlnaHQuY2FzdFNoYWRvdyA9IHRydWU7XHJcbmRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5sZWZ0ID0gLTUwO1xyXG5kaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEucmlnaHQgPSA1MDtcclxuZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLnRvcCA9IDUwO1xyXG5kaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEuYm90dG9tID0gLTUwO1xyXG5kaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5tYXBTaXplLndpZHRoID0gMjA0ODtcclxuZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cubWFwU2l6ZS5oZWlnaHQgPSAyMDQ4O1xyXG5zY2VuZS5hZGQoZGlyZWN0aW9uYWxMaWdodCk7XHJcblxyXG4vLyBQaHlzaWNzIHdvcmxkXHJcbmNvbnN0IHdvcmxkID0gbmV3IENBTk5PTi5Xb3JsZCgpO1xyXG53b3JsZC5ncmF2aXR5LnNldCgwLCAtOS44MiwgMCk7XHJcblxyXG4vLyBHcm91bmRcclxuY29uc3QgZ3JvdW5kR2VvbWV0cnkgPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeSgxMDAsIDEwMCk7XHJcbmxldCBncm91bmRUZXh0dXJlOiBUSFJFRS5UZXh0dXJlIHwgbnVsbCA9IG51bGw7XHJcbmNvbnN0IGdyb3VuZE1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsKHtcclxuICBjb2xvcjogMHgyZWNjNzEsXHJcbiAgcm91Z2huZXNzOiAwLjgsXHJcbn0pO1xyXG5jb25zdCBncm91bmQgPSBuZXcgVEhSRUUuTWVzaChncm91bmRHZW9tZXRyeSwgZ3JvdW5kTWF0ZXJpYWwpO1xyXG5ncm91bmQucm90YXRpb24ueCA9IC1NYXRoLlBJIC8gMjtcclxuZ3JvdW5kLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xyXG5zY2VuZS5hZGQoZ3JvdW5kKTtcclxuXHJcbmNvbnN0IGdyb3VuZEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gIG1hc3M6IDAsXHJcbiAgc2hhcGU6IG5ldyBDQU5OT04uUGxhbmUoKSxcclxufSk7XHJcbmdyb3VuZEJvZHkucXVhdGVybmlvbi5zZXRGcm9tRXVsZXIoLU1hdGguUEkgLyAyLCAwLCAwKTtcclxud29ybGQuYWRkQm9keShncm91bmRCb2R5KTtcclxuXHJcbi8vIFBsYXllclxyXG5jb25zdCBwbGF5ZXJHZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgxLCAyLCAxKTtcclxubGV0IHBsYXllclRleHR1cmU6IFRIUkVFLlRleHR1cmUgfCBudWxsID0gbnVsbDtcclxuY29uc3QgcGxheWVyTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwoeyBjb2xvcjogMHgzNDk4ZGIgfSk7XHJcbmNvbnN0IHBsYXllciA9IG5ldyBUSFJFRS5NZXNoKHBsYXllckdlb21ldHJ5LCBwbGF5ZXJNYXRlcmlhbCk7XHJcbnBsYXllci5wb3NpdGlvbi5zZXQoMCwgMSwgMCk7IC8vIFBsYXllciBtZXNoIGlzIGNlbnRlcmVkIGF0IFk9MSwgc28gaXRzIGJhc2UgaXMgYXQgWT0wXHJcbnBsYXllci5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuc2NlbmUuYWRkKHBsYXllcik7XHJcblxyXG5jb25zdCBwbGF5ZXJTaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMygwLjUsIDEsIDAuNSkpOyAvLyBIYWxmLWV4dGVudHNcclxuY29uc3QgcGxheWVyQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgbWFzczogNSxcclxuICBzaGFwZTogcGxheWVyU2hhcGUsXHJcbiAgcG9zaXRpb246IG5ldyBDQU5OT04uVmVjMygwLCAxLCAwKSwgLy8gQm9keSBpcyBjZW50ZXJlZCBhdCBZPTEsIHNvIGl0cyBiYXNlIGlzIGF0IFk9MFxyXG4gIGxpbmVhckRhbXBpbmc6IDAuOSxcclxuICBhbmd1bGFyRGFtcGluZzogMC45LFxyXG59KTtcclxud29ybGQuYWRkQm9keShwbGF5ZXJCb2R5KTtcclxuXHJcbi8vIFByZXZlbnQgcGxheWVyIGZyb20gcm90YXRpbmdcclxucGxheWVyQm9keS5maXhlZFJvdGF0aW9uID0gdHJ1ZTtcclxucGxheWVyQm9keS51cGRhdGVNYXNzUHJvcGVydGllcygpO1xyXG5cclxuLy8gQ29udHJvbHNcclxuY29uc3QgY29udHJvbHMgPSBuZXcgUG9pbnRlckxvY2tDb250cm9scyhjYW1lcmEsIGRvY3VtZW50LmJvZHkpO1xyXG4vLyBTZXQgaW5pdGlhbCBwb3NpdGlvbiBvZiBjb250cm9scyAocGxheWVyJ3MgZXllIGxldmVsKS4gUGxheWVyIGlzIDIgdW5pdHMgdGFsbCwgY2VudGVyIGF0IDEsIHNvIGV5ZSBsZXZlbCBjb3VsZCBiZSAxLjUuXHJcbmNvbnRyb2xzLm9iamVjdC5wb3NpdGlvbi5zZXQoMCwgMS41LCAwKTsgLy8gRklYOiBDaGFuZ2VkIGdldE9iamVjdCgpIHRvIG9iamVjdFxyXG5zY2VuZS5hZGQoY29udHJvbHMub2JqZWN0KTsgLy8gRklYOiBDaGFuZ2VkIGdldE9iamVjdCgpIHRvIG9iamVjdFxyXG5cclxuY29uc3Qga2V5czogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0gPSB7fTtcclxubGV0IGNhbkp1bXAgPSBmYWxzZTtcclxuXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChlKSA9PiB7XHJcbiAgaWYgKCFnYW1lU3RhcnRlZCkgcmV0dXJuOyAvLyBJZ25vcmUgaW5wdXQgaWYgZ2FtZSBoYXNuJ3Qgc3RhcnRlZFxyXG4gIGtleXNbZS5rZXkudG9Mb3dlckNhc2UoKV0gPSB0cnVlO1xyXG5cclxuICBpZiAoZS5rZXkgPT09IFwiIFwiICYmIGNhbkp1bXApIHtcclxuICAgIHBsYXllckJvZHkudmVsb2NpdHkueSA9IGp1bXBWZWxvY2l0eTsgLy8gVXNlIGNvbmZpZ3VyYWJsZSBqdW1wIHZlbG9jaXR5XHJcbiAgICBjYW5KdW1wID0gZmFsc2U7XHJcbiAgfVxyXG59KTtcclxuXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXl1cFwiLCAoZSkgPT4ge1xyXG4gIGlmICghZ2FtZVN0YXJ0ZWQpIHJldHVybjsgLy8gSWdub3JlIGlucHV0IGlmIGdhbWUgaGFzbid0IHN0YXJ0ZWRcclxuICBrZXlzW2Uua2V5LnRvTG93ZXJDYXNlKCldID0gZmFsc2U7XHJcbn0pO1xyXG5cclxuLy8gQ2hlY2sgaWYgcGxheWVyIGNhbiBqdW1wXHJcbnBsYXllckJvZHkuYWRkRXZlbnRMaXN0ZW5lcihcImNvbGxpZGVcIiwgKGV2ZW50OiBhbnkpID0+IHtcclxuICAvLyBDaGVjayBpZiBwbGF5ZXIgY29sbGlkZWQgd2l0aCB0aGUgZ3JvdW5kIG9yIGFub3RoZXIgYm9keSBiZWxvdyBpdFxyXG4gIGNvbnN0IGNvbnRhY3ROb3JtYWwgPSBuZXcgQ0FOTk9OLlZlYzMoKTtcclxuICBjb25zdCB1cEF4aXMgPSBuZXcgQ0FOTk9OLlZlYzMoMCwgMSwgMCk7XHJcblxyXG4gIC8vIENoZWNrIGNvbnRhY3RzIGZvciBhIG5vcm1hbCBwb2ludGluZyByb3VnaGx5IHVwd2FyZHNcclxuICBmb3IgKGxldCBpID0gMDsgaSA8IGV2ZW50LmNvbnRhY3RzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICBjb25zdCBjb250YWN0ID0gZXZlbnQuY29udGFjdHNbaV07XHJcbiAgICBpZiAoY29udGFjdC5iaS5pZCA9PT0gcGxheWVyQm9keS5pZCkge1xyXG4gICAgICBjb250YWN0Lm5pLm5lZ2F0ZShjb250YWN0Tm9ybWFsKTsgLy8gTm9ybWFsIHBvaW50cyBmcm9tIGJvZHkgQiB0byBBXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBjb250YWN0Tm9ybWFsLmNvcHkoY29udGFjdC5uaSk7IC8vIE5vcm1hbCBwb2ludHMgZnJvbSBib2R5IEEgdG8gQlxyXG4gICAgfVxyXG5cclxuICAgIC8vIElmIHRoZSBub3JtYWwgaXMgcG9pbnRpbmcgbW9zdGx5IHVwd2FyZHMsIHdlIGFyZSBvbiB0aGUgZ3JvdW5kXHJcbiAgICBpZiAoY29udGFjdE5vcm1hbC5kb3QodXBBeGlzKSA+IDAuNSkgeyAvLyBUaHJlc2hvbGQgZm9yIFwibW9zdGx5IHVwd2FyZHNcIlxyXG4gICAgICBjYW5KdW1wID0gdHJ1ZTtcclxuICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbiAgfVxyXG59KTtcclxuXHJcbi8vIENvbGxlY3RpYmxlIHNwaGVyZXNcclxuY29uc3QgY29sbGVjdGlibGVzOiB7XHJcbiAgbWVzaDogVEhSRUUuTWVzaDtcclxuICBib2R5OiBDQU5OT04uQm9keTtcclxuICBjb2xsZWN0ZWQ6IGJvb2xlYW47XHJcbn1bXSA9IFtdO1xyXG5sZXQgY29sbGVjdGlibGVUZXh0dXJlOiBUSFJFRS5UZXh0dXJlIHwgbnVsbCA9IG51bGw7XHJcbmNvbnN0IHNwaGVyZU1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsKHtcclxuICBjb2xvcjogMHhmZmQ3MDAsXHJcbiAgZW1pc3NpdmU6IDB4ZmZhYTAwLFxyXG4gIGVtaXNzaXZlSW50ZW5zaXR5OiAwLjUsXHJcbiAgbWV0YWxuZXNzOiAwLjcsXHJcbiAgcm91Z2huZXNzOiAwLjMsXHJcbn0pO1xyXG5mb3IgKGxldCBpID0gMDsgaSA8IDg7IGkrKykge1xyXG4gIGNvbnN0IHNwaGVyZUdlb21ldHJ5ID0gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KDAuNSwgMzIsIDMyKTtcclxuICBjb25zdCBzcGhlcmUgPSBuZXcgVEhSRUUuTWVzaChzcGhlcmVHZW9tZXRyeSwgc3BoZXJlTWF0ZXJpYWwpO1xyXG4gIHNwaGVyZS5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuXHJcbiAgY29uc3QgeCA9IChNYXRoLnJhbmRvbSgpIC0gMC41KSAqIDQwO1xyXG4gIGNvbnN0IHogPSAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiA0MDtcclxuICBzcGhlcmUucG9zaXRpb24uc2V0KHgsIDAuNSwgeik7XHJcbiAgc2NlbmUuYWRkKHNwaGVyZSk7XHJcblxyXG4gIGNvbnN0IHNwaGVyZVNoYXBlID0gbmV3IENBTk5PTi5TcGhlcmUoMC41KTtcclxuICBjb25zdCBzcGhlcmVCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgIG1hc3M6IDAsXHJcbiAgICBzaGFwZTogc3BoZXJlU2hhcGUsXHJcbiAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKHgsIDAuNSwgeiksXHJcbiAgfSk7XHJcbiAgd29ybGQuYWRkQm9keShzcGhlcmVCb2R5KTtcclxuXHJcbiAgY29sbGVjdGlibGVzLnB1c2goeyBtZXNoOiBzcGhlcmUsIGJvZHk6IHNwaGVyZUJvZHksIGNvbGxlY3RlZDogZmFsc2UgfSk7XHJcbn1cclxuXHJcbi8vIFNvbWUgb2JzdGFjbGUgY3ViZXNcclxuY29uc3Qgb2JzdGFjbGVzOiB7IG1lc2g6IFRIUkVFLk1lc2g7IGJvZHk6IENBTk5PTi5Cb2R5IH1bXSA9IFtdO1xyXG5sZXQgb2JzdGFjbGVUZXh0dXJlOiBUSFJFRS5UZXh0dXJlIHwgbnVsbCA9IG51bGw7XHJcbmNvbnN0IGN1YmVNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCh7XHJcbiAgY29sb3I6IDB4ZTc0YzNjLFxyXG4gIHJvdWdobmVzczogMC43LFxyXG59KTtcclxuZm9yIChsZXQgaSA9IDA7IGkgPCA1OyBpKyspIHtcclxuICBjb25zdCBjdWJlR2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMiwgMiwgMik7XHJcbiAgY29uc3QgY3ViZSA9IG5ldyBUSFJFRS5NZXNoKGN1YmVHZW9tZXRyeSwgY3ViZU1hdGVyaWFsKTtcclxuICBjdWJlLmNhc3RTaGFkb3cgPSB0cnVlO1xyXG4gIGN1YmUucmVjZWl2ZVNoYWRvdyA9IHRydWU7XHJcblxyXG4gIGNvbnN0IHggPSAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiAzMDtcclxuICBjb25zdCB6ID0gKE1hdGgucmFuZG9tKCkgLSAwLjUpICogMzA7XHJcbiAgY3ViZS5wb3NpdGlvbi5zZXQoeCwgMSwgeik7XHJcbiAgc2NlbmUuYWRkKGN1YmUpO1xyXG5cclxuICBjb25zdCBjdWJlU2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoMSwgMSwgMSkpO1xyXG4gIGNvbnN0IGN1YmVCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgIG1hc3M6IDAsXHJcbiAgICBzaGFwZTogY3ViZVNoYXBlLFxyXG4gICAgcG9zaXRpb246IG5ldyBDQU5OT04uVmVjMyh4LCAxLCB6KSxcclxuICB9KTtcclxuICB3b3JsZC5hZGRCb2R5KGN1YmVCb2R5KTtcclxuXHJcbiAgb2JzdGFjbGVzLnB1c2goeyBtZXNoOiBjdWJlLCBib2R5OiBjdWJlQm9keSB9KTtcclxufVxyXG5cclxuLy8gU2NvcmUgZGlzcGxheSAoZHluYW1pY2FsbHkgY3JlYXRlZClcclxubGV0IHNjb3JlID0gMDtcclxuY29uc3Qgc2NvcmVFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuc2NvcmVFbGVtZW50LmlkID0gXCJzY29yZVwiO1xyXG5zY29yZUVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSBcImFic29sdXRlXCI7XHJcbnNjb3JlRWxlbWVudC5zdHlsZS50b3AgPSBcIjEwcHhcIjtcclxuc2NvcmVFbGVtZW50LnN0eWxlLmxlZnQgPSBcIjEwcHhcIjtcclxuc2NvcmVFbGVtZW50LnN0eWxlLmNvbG9yID0gXCJ3aGl0ZVwiO1xyXG5zY29yZUVsZW1lbnQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gXCJyZ2JhKDAsIDAsIDAsIDAuNSlcIjtcclxuc2NvcmVFbGVtZW50LnN0eWxlLnBhZGRpbmcgPSBcIjEwcHhcIjtcclxuc2NvcmVFbGVtZW50LnN0eWxlLmZvbnRGYW1pbHkgPSBcIkFyaWFsLCBzYW5zLXNlcmlmXCI7XHJcbnNjb3JlRWxlbWVudC5zdHlsZS5mb250U2l6ZSA9IFwiMS4yZW1cIjtcclxuc2NvcmVFbGVtZW50LnN0eWxlLmJvcmRlclJhZGl1cyA9IFwiNXB4XCI7XHJcbnNjb3JlRWxlbWVudC5zdHlsZS56SW5kZXggPSBcIjEwMFwiO1xyXG5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHNjb3JlRWxlbWVudCk7XHJcbnNjb3JlRWxlbWVudC50ZXh0Q29udGVudCA9IGBTY29yZTogJHtzY29yZX1gO1xyXG5cclxuZnVuY3Rpb24gY2hlY2tDb2xsZWN0aWJsZXMoKSB7XHJcbiAgY29sbGVjdGlibGVzLmZvckVhY2goKGl0ZW0pID0+IHtcclxuICAgIGlmICghaXRlbS5jb2xsZWN0ZWQpIHtcclxuICAgICAgY29uc3QgZGlzdCA9IHBsYXllckJvZHkucG9zaXRpb24uZGlzdGFuY2VUbyhpdGVtLmJvZHkucG9zaXRpb24pO1xyXG4gICAgICBpZiAoZGlzdCA8IDEuNSkge1xyXG4gICAgICAgIGl0ZW0uY29sbGVjdGVkID0gdHJ1ZTtcclxuICAgICAgICBzY2VuZS5yZW1vdmUoaXRlbS5tZXNoKTtcclxuICAgICAgICB3b3JsZC5yZW1vdmVCb2R5KGl0ZW0uYm9keSk7XHJcbiAgICAgICAgc2NvcmUgKz0gMTAwO1xyXG4gICAgICAgIGlmIChjb2xsZWN0U291bmRFZmZlY3QpIHtcclxuICAgICAgICAgIGlmIChjb2xsZWN0U291bmRFZmZlY3QuaXNQbGF5aW5nKSB7XHJcbiAgICAgICAgICAgIGNvbGxlY3RTb3VuZEVmZmVjdC5zdG9wKCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBjb2xsZWN0U291bmRFZmZlY3QucGxheSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiB1cGRhdGVQbGF5ZXIoKSB7XHJcbiAgLy8gQ2FsY3VsYXRlIGRlc2lyZWQgbW92ZW1lbnQgZGlyZWN0aW9uIGJhc2VkIG9uIGNvbnRyb2xzIG9yaWVudGF0aW9uXHJcbiAgY29uc3QgZm9yd2FyZFZlY3RvciA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgY29uc3QgcmlnaHRWZWN0b3IgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG5cclxuICBjb250cm9scy5nZXREaXJlY3Rpb24oZm9yd2FyZFZlY3Rvcik7IC8vIEdldHMgZm9yd2FyZCB2ZWN0b3Igb2YgdGhlIGNhbWVyYVxyXG4gIGZvcndhcmRWZWN0b3IueSA9IDA7IC8vIFJlc3RyaWN0IG1vdmVtZW50IHRvIGhvcml6b250YWwgcGxhbmVcclxuICBmb3J3YXJkVmVjdG9yLm5vcm1hbGl6ZSgpO1xyXG5cclxuICByaWdodFZlY3Rvci5jcm9zc1ZlY3RvcnMoZm9yd2FyZFZlY3RvciwgbmV3IFRIUkVFLlZlY3RvcjMoMCwgMSwgMCkpOyAvLyBDYWxjdWxhdGUgcmlnaHQgdmVjdG9yXHJcbiAgcmlnaHRWZWN0b3Iubm9ybWFsaXplKCk7XHJcblxyXG4gIC8vIERlc2lyZWQgaG9yaXpvbnRhbCB2ZWxvY2l0eSB2ZWN0b3IgZnJvbSBpbnB1dFxyXG4gIGNvbnN0IGRlc2lyZWRIb3Jpem9udGFsVmVsb2NpdHkgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAwKTtcclxuICBpZiAoa2V5c1tcIndcIl0gfHwga2V5c1tcImFycm93dXBcIl0pIGRlc2lyZWRIb3Jpem9udGFsVmVsb2NpdHkuYWRkU2NhbGVkVmVjdG9yKGZvcndhcmRWZWN0b3IsIHBsYXllclNwZWVkKTtcclxuICBpZiAoa2V5c1tcInNcIl0gfHwga2V5c1tcImFycm93ZG93blwiXSkgZGVzaXJlZEhvcml6b250YWxWZWxvY2l0eS5hZGRTY2FsZWRWZWN0b3IoZm9yd2FyZFZlY3RvciwgLXBsYXllclNwZWVkKTtcclxuICBpZiAoa2V5c1tcImFcIl0gfHwga2V5c1tcImFycm93bGVmdFwiXSkgZGVzaXJlZEhvcml6b250YWxWZWxvY2l0eS5hZGRTY2FsZWRWZWN0b3IocmlnaHRWZWN0b3IsIC1wbGF5ZXJTcGVlZCk7XHJcbiAgaWYgKGtleXNbXCJkXCJdIHx8IGtleXNbXCJhcnJvd3JpZ2h0XCJdKSBkZXNpcmVkSG9yaXpvbnRhbFZlbG9jaXR5LmFkZFNjYWxlZFZlY3RvcihyaWdodFZlY3RvciwgcGxheWVyU3BlZWQpO1xyXG5cclxuICAvLyBBcHBseSBkZXNpcmVkIGhvcml6b250YWwgdmVsb2NpdHkgdG8gcGxheWVyIGJvZHksIHByZXNlcnZpbmcgdmVydGljYWwgdmVsb2NpdHlcclxuICBwbGF5ZXJCb2R5LnZlbG9jaXR5LnggPSBkZXNpcmVkSG9yaXpvbnRhbFZlbG9jaXR5Lng7XHJcbiAgcGxheWVyQm9keS52ZWxvY2l0eS56ID0gZGVzaXJlZEhvcml6b250YWxWZWxvY2l0eS56O1xyXG5cclxuICAvLyBTeW5jIFRocmVlLmpzIHBsYXllciBtZXNoIHRvIENhbm5vbi5qcyBwbGF5ZXIgYm9keVxyXG4gIHBsYXllci5wb3NpdGlvbi5jb3B5KHBsYXllckJvZHkucG9zaXRpb24gYXMgYW55KTtcclxuICAvLyBwbGF5ZXIucXVhdGVybmlvbi5jb3B5KHBsYXllckJvZHkucXVhdGVybmlvbiBhcyBhbnkpOyAvLyBQbGF5ZXIgYm9keSBoYXMgZml4ZWQgcm90YXRpb25cclxuXHJcbiAgLy8gU3luYyBjb250cm9scyAoY2FtZXJhKSBwb3NpdGlvbiB0byBwbGF5ZXIgYm9keSBwb3NpdGlvbiAoYXQgZXllIGxldmVsKVxyXG4gIGNvbnRyb2xzLm9iamVjdC5wb3NpdGlvbi5jb3B5KHBsYXllckJvZHkucG9zaXRpb24gYXMgYW55KTsgLy8gRklYOiBDaGFuZ2VkIGdldE9iamVjdCgpIHRvIG9iamVjdFxyXG4gIGNvbnRyb2xzLm9iamVjdC5wb3NpdGlvbi55ICs9IDAuNTsgLy8gT2Zmc2V0IGJ5IGhhbGYgcGxheWVyIGhlaWdodCArIHNtYWxsIGFtb3VudCBmb3IgZXllIGxldmVsIC8vIEZJWDogQ2hhbmdlZCBnZXRPYmplY3QoKSB0byBvYmplY3RcclxufVxyXG5cclxuLy8gUm90YXRlIGNvbGxlY3RpYmxlc1xyXG5mdW5jdGlvbiBhbmltYXRlQ29sbGVjdGlibGVzKCkge1xyXG4gIGNvbGxlY3RpYmxlcy5mb3JFYWNoKChpdGVtKSA9PiB7XHJcbiAgICBpZiAoIWl0ZW0uY29sbGVjdGVkKSB7XHJcbiAgICAgIGl0ZW0ubWVzaC5yb3RhdGlvbi55ICs9IDAuMDI7XHJcbiAgICAgIGl0ZW0ubWVzaC5wb3NpdGlvbi55ID0gMC41ICsgTWF0aC5zaW4oRGF0ZS5ub3coKSAqIDAuMDAyKSAqIDAuMjtcclxuICAgIH1cclxuICB9KTtcclxufVxyXG5cclxuLy8gQW5pbWF0aW9uIGxvb3BcclxuY29uc3QgY2xvY2sgPSBuZXcgVEhSRUUuQ2xvY2soKTtcclxuXHJcbmZ1bmN0aW9uIGFuaW1hdGUoKSB7XHJcbiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW1hdGUpO1xyXG5cclxuICBjb25zdCBkZWx0YVRpbWUgPSBjbG9jay5nZXREZWx0YSgpO1xyXG4gIHdvcmxkLnN0ZXAoMSAvIDYwLCBkZWx0YVRpbWUsIDMpOyAvLyBQaHlzaWNzIHN0ZXAgcnVucyBhbHdheXMgZm9yIGNvbnNpc3RlbmN5XHJcblxyXG4gIGlmIChnYW1lU3RhcnRlZCkge1xyXG4gICAgLy8gVXBkYXRlIG9ic3RhY2xlc1xyXG4gICAgb2JzdGFjbGVzLmZvckVhY2goKHsgbWVzaCwgYm9keSB9KSA9PiB7XHJcbiAgICAgIG1lc2gucG9zaXRpb24uY29weShib2R5LnBvc2l0aW9uIGFzIGFueSk7XHJcbiAgICAgIG1lc2gucXVhdGVybmlvbi5jb3B5KGJvZHkucXVhdGVybmlvbiBhcyBhbnkpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgdXBkYXRlUGxheWVyKCk7XHJcbiAgICBjaGVja0NvbGxlY3RpYmxlcygpO1xyXG4gICAgYW5pbWF0ZUNvbGxlY3RpYmxlcygpO1xyXG5cclxuICAgIC8vIFVwZGF0ZSBzY29yZVxyXG4gICAgc2NvcmVFbGVtZW50LnRleHRDb250ZW50ID0gYFNjb3JlOiAke3Njb3JlfWA7XHJcblxyXG4gICAgLy8gV2luIGNvbmRpdGlvblxyXG4gICAgaWYgKGNvbGxlY3RpYmxlcy5ldmVyeSgoYykgPT4gYy5jb2xsZWN0ZWQpKSB7XHJcbiAgICAgIHNjb3JlRWxlbWVudC50ZXh0Q29udGVudCA9IGBTY29yZTogJHtzY29yZX0gLSBZT1UgV0lOISBcdUQ4M0NcdURGODlgO1xyXG4gICAgICAvLyBPcHRpb25hbGx5IHN0b3AgZ2FtZSBvciBzaG93IGVuZCBzY3JlZW4gaGVyZVxyXG4gICAgICAvLyBnYW1lU3RhcnRlZCA9IGZhbHNlO1xyXG4gICAgICBpZiAoYmFja2dyb3VuZE11c2ljICYmIGJhY2tncm91bmRNdXNpYy5pc1BsYXlpbmcpIHtcclxuICAgICAgICBiYWNrZ3JvdW5kTXVzaWMuc3RvcCgpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZW5kZXJlci5yZW5kZXIoc2NlbmUsIGNhbWVyYSk7XHJcbn1cclxuXHJcbi8vIEhhbmRsZSB3aW5kb3cgcmVzaXplXHJcbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwicmVzaXplXCIsICgpID0+IHtcclxuICBjb25zdCBjdXJyZW50Q2FudmFzID0gcmVuZGVyZXIuZG9tRWxlbWVudDtcclxuICBjb25zdCB3aWR0aCA9IGN1cnJlbnRDYW52YXMuY2xpZW50V2lkdGg7XHJcbiAgY29uc3QgaGVpZ2h0ID0gY3VycmVudENhbnZhcy5jbGllbnRIZWlnaHQ7XHJcblxyXG4gIGNhbWVyYS5hc3BlY3QgPSB3aWR0aCAvIGhlaWdodDtcclxuICBjYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xyXG4gIHJlbmRlcmVyLnNldFNpemUod2lkdGgsIGhlaWdodCk7XHJcbn0pO1xyXG5cclxuLy8gLS0tIEFzc2V0IExvYWRpbmcgLS0tXHJcblxyXG5hc3luYyBmdW5jdGlvbiBsb2FkQXNzZXRzKGFzc2V0c0NvbmZpZzogYW55KSB7XHJcbiAgY29uc3QgdGV4dHVyZVByb21pc2VzID0gYXNzZXRzQ29uZmlnLmltYWdlcy5tYXAoKGltZzogYW55KSA9PiB7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICB0ZXh0dXJlTG9hZGVyLmxvYWQoaW1nLnBhdGgsICh0ZXh0dXJlKSA9PiB7XHJcbiAgICAgICAgbG9hZGVkVGV4dHVyZXNbaW1nLm5hbWVdID0gdGV4dHVyZTtcclxuICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgIH0sIHVuZGVmaW5lZCwgKGVycikgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHRleHR1cmU6ICR7aW1nLnBhdGh9YCwgZXJyKTtcclxuICAgICAgICByZWplY3QoZXJyKTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9KTtcclxuXHJcbiAgY29uc3Qgc291bmRQcm9taXNlcyA9IGFzc2V0c0NvbmZpZy5zb3VuZHMubWFwKChzbmQ6IGFueSkgPT4ge1xyXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgYXVkaW9Mb2FkZXIubG9hZChzbmQucGF0aCwgKGJ1ZmZlcikgPT4ge1xyXG4gICAgICAgIGxvYWRlZEF1ZGlvQnVmZmVyc1tzbmQubmFtZV0gPSBidWZmZXI7XHJcbiAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICB9LCB1bmRlZmluZWQsIChlcnIpID0+IHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtzbmQucGF0aH1gLCBlcnIpO1xyXG4gICAgICAgIHJlamVjdChlcnIpO1xyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG4gIH0pO1xyXG5cclxuICBhd2FpdCBQcm9taXNlLmFsbChbLi4udGV4dHVyZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgY29uc29sZS5sb2coXCJBbGwgYXNzZXRzIGxvYWRlZC5cIik7XHJcbn1cclxuXHJcblxyXG4vLyAtLS0gR2FtZSBEYXRhIExvYWRpbmcgYW5kIFRpdGxlIFNjcmVlbiAtLS1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGxvYWRHYW1lRGF0YSgpIHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICBnYW1lQ29uZmlnID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgY29uc29sZS5sb2coXCJHYW1lIGNvbmZpZyBsb2FkZWQ6XCIsIGdhbWVDb25maWcpO1xyXG5cclxuICAgIHBsYXllclNwZWVkID0gZ2FtZUNvbmZpZy5wbGF5ZXJTcGVlZCAhPT0gdW5kZWZpbmVkID8gZ2FtZUNvbmZpZy5wbGF5ZXJTcGVlZCA6IDc7IC8vIERlZmF1bHQgc3BlZWRcclxuICAgIGp1bXBWZWxvY2l0eSA9IGdhbWVDb25maWcuanVtcFZlbG9jaXR5ICE9PSB1bmRlZmluZWQgPyBnYW1lQ29uZmlnLmp1bXBWZWxvY2l0eSA6IDg7IC8vIERlZmF1bHQganVtcCBzdHJlbmd0aFxyXG5cclxuICAgIC8vIExvYWQgYWxsIGFzc2V0cyBzcGVjaWZpZWQgaW4gZ2FtZUNvbmZpZ1xyXG4gICAgaWYgKGdhbWVDb25maWcuYXNzZXRzKSB7XHJcbiAgICAgIGF3YWl0IGxvYWRBc3NldHMoZ2FtZUNvbmZpZy5hc3NldHMpO1xyXG5cclxuICAgICAgLy8gQXBwbHkgdGV4dHVyZXMgdG8gbWF0ZXJpYWxzXHJcbiAgICAgIGdyb3VuZFRleHR1cmUgPSBsb2FkZWRUZXh0dXJlc1tcImdyb3VuZF90ZXh0dXJlXCJdO1xyXG4gICAgICBpZiAoZ3JvdW5kVGV4dHVyZSkge1xyXG4gICAgICAgIGdyb3VuZFRleHR1cmUud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcclxuICAgICAgICBncm91bmRUZXh0dXJlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XHJcbiAgICAgICAgZ3JvdW5kVGV4dHVyZS5yZXBlYXQuc2V0KDEwLCAxMCk7XHJcbiAgICAgICAgZ3JvdW5kTWF0ZXJpYWwubWFwID0gZ3JvdW5kVGV4dHVyZTtcclxuICAgICAgICBncm91bmRNYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWU7XHJcbiAgICAgICAgZ3JvdW5kTWF0ZXJpYWwuY29sb3Iuc2V0KDB4ZmZmZmZmKTsgLy8gU2V0IHRvIHdoaXRlIHRvIGZ1bGx5IHNob3cgdGV4dHVyZVxyXG4gICAgICB9XHJcblxyXG4gICAgICBwbGF5ZXJUZXh0dXJlID0gbG9hZGVkVGV4dHVyZXNbXCJwbGF5ZXJfdGV4dHVyZVwiXTtcclxuICAgICAgaWYgKHBsYXllclRleHR1cmUpIHtcclxuICAgICAgICBwbGF5ZXJNYXRlcmlhbC5tYXAgPSBwbGF5ZXJUZXh0dXJlO1xyXG4gICAgICAgIHBsYXllck1hdGVyaWFsLm5lZWRzVXBkYXRlID0gdHJ1ZTtcclxuICAgICAgICBwbGF5ZXJNYXRlcmlhbC5jb2xvci5zZXQoMHhmZmZmZmYpOyAvLyBTZXQgdG8gd2hpdGUgdG8gZnVsbHkgc2hvdyB0ZXh0dXJlXHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbGxlY3RpYmxlVGV4dHVyZSA9IGxvYWRlZFRleHR1cmVzW1wiY29sbGVjdGlibGVfdGV4dHVyZVwiXTtcclxuICAgICAgaWYgKGNvbGxlY3RpYmxlVGV4dHVyZSkge1xyXG4gICAgICAgIHNwaGVyZU1hdGVyaWFsLm1hcCA9IGNvbGxlY3RpYmxlVGV4dHVyZTtcclxuICAgICAgICBzcGhlcmVNYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWU7XHJcbiAgICAgICAgc3BoZXJlTWF0ZXJpYWwuY29sb3Iuc2V0KDB4ZmZmZmZmKTsgLy8gU2V0IHRvIHdoaXRlIHRvIGZ1bGx5IHNob3cgdGV4dHVyZVxyXG4gICAgICB9XHJcblxyXG4gICAgICBvYnN0YWNsZVRleHR1cmUgPSBsb2FkZWRUZXh0dXJlc1tcIm9ic3RhY2xlX3RleHR1cmVcIl07XHJcbiAgICAgIGlmIChvYnN0YWNsZVRleHR1cmUpIHtcclxuICAgICAgICBjdWJlTWF0ZXJpYWwubWFwID0gb2JzdGFjbGVUZXh0dXJlO1xyXG4gICAgICAgIGN1YmVNYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWU7XHJcbiAgICAgICAgY3ViZU1hdGVyaWFsLmNvbG9yLnNldCgweGZmZmZmZik7IC8vIFNldCB0byB3aGl0ZSB0byBmdWxseSBzaG93IHRleHR1cmVcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gSW5pdGlhbGl6ZSBhdWRpbyBvYmplY3RzXHJcbiAgICAgIGlmIChsb2FkZWRBdWRpb0J1ZmZlcnNbXCJiYWNrZ3JvdW5kX211c2ljXCJdKSB7XHJcbiAgICAgICAgYmFja2dyb3VuZE11c2ljID0gbmV3IFRIUkVFLkF1ZGlvKGF1ZGlvTGlzdGVuZXIpO1xyXG4gICAgICAgIGJhY2tncm91bmRNdXNpYy5zZXRCdWZmZXIobG9hZGVkQXVkaW9CdWZmZXJzW1wiYmFja2dyb3VuZF9tdXNpY1wiXSk7XHJcbiAgICAgICAgYmFja2dyb3VuZE11c2ljLnNldExvb3AodHJ1ZSk7XHJcbiAgICAgICAgYmFja2dyb3VuZE11c2ljLnNldFZvbHVtZShnYW1lQ29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZCgoczogYW55KSA9PiBzLm5hbWUgPT09IFwiYmFja2dyb3VuZF9tdXNpY1wiKT8udm9sdW1lIHx8IDAuNSk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKGxvYWRlZEF1ZGlvQnVmZmVyc1tcImNvbGxlY3Rfc291bmRcIl0pIHtcclxuICAgICAgICBjb2xsZWN0U291bmRFZmZlY3QgPSBuZXcgVEhSRUUuQXVkaW8oYXVkaW9MaXN0ZW5lcik7XHJcbiAgICAgICAgY29sbGVjdFNvdW5kRWZmZWN0LnNldEJ1ZmZlcihsb2FkZWRBdWRpb0J1ZmZlcnNbXCJjb2xsZWN0X3NvdW5kXCJdKTtcclxuICAgICAgICBjb2xsZWN0U291bmRFZmZlY3Quc2V0Vm9sdW1lKGdhbWVDb25maWcuYXNzZXRzLnNvdW5kcy5maW5kKChzOiBhbnkpID0+IHMubmFtZSA9PT0gXCJjb2xsZWN0X3NvdW5kXCIpPy52b2x1bWUgfHwgMS4wKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHNldHVwVGl0bGVTY3JlZW4oKTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIGdhbWUgZGF0YSBvciBhc3NldHM6XCIsIGVycm9yKTtcclxuICAgIHRocm93IG5ldyBFcnJvcihcIkZhaWxlZCB0byBsb2FkIGdhbWUgZGF0YSBvciBhc3NldHMuXCIpO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gc2V0dXBUaXRsZVNjcmVlbigpIHtcclxuICBjb25zdCB0aXRsZVNjcmVlbkRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgdGl0bGVTY3JlZW5EaXYuaWQgPSBcInRpdGxlU2NyZWVuXCI7XHJcbiAgdGl0bGVTY3JlZW5EaXYuc3R5bGUucG9zaXRpb24gPSBcImFic29sdXRlXCI7XHJcbiAgdGl0bGVTY3JlZW5EaXYuc3R5bGUudG9wID0gXCIwXCI7XHJcbiAgdGl0bGVTY3JlZW5EaXYuc3R5bGUubGVmdCA9IFwiMFwiO1xyXG4gIHRpdGxlU2NyZWVuRGl2LnN0eWxlLndpZHRoID0gXCIxMDAlXCI7XHJcbiAgdGl0bGVTY3JlZW5EaXYuc3R5bGUuaGVpZ2h0ID0gXCIxMDAlXCI7XHJcbiAgdGl0bGVTY3JlZW5EaXYuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gXCJyZ2JhKDAsIDAsIDAsIDAuOClcIjtcclxuICB0aXRsZVNjcmVlbkRpdi5zdHlsZS5jb2xvciA9IFwid2hpdGVcIjtcclxuICB0aXRsZVNjcmVlbkRpdi5zdHlsZS5kaXNwbGF5ID0gXCJmbGV4XCI7XHJcbiAgdGl0bGVTY3JlZW5EaXYuc3R5bGUuZmxleERpcmVjdGlvbiA9IFwiY29sdW1uXCI7XHJcbiAgdGl0bGVTY3JlZW5EaXYuc3R5bGUuanVzdGlmeUNvbnRlbnQgPSBcImNlbnRlclwiO1xyXG4gIHRpdGxlU2NyZWVuRGl2LnN0eWxlLmFsaWduSXRlbXMgPSBcImNlbnRlclwiO1xyXG4gIHRpdGxlU2NyZWVuRGl2LnN0eWxlLmZvbnRTaXplID0gXCIyZW1cIjtcclxuICB0aXRsZVNjcmVlbkRpdi5zdHlsZS50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xyXG4gIHRpdGxlU2NyZWVuRGl2LnN0eWxlLnpJbmRleCA9IFwiMTAwMFwiOyAvLyBFbnN1cmUgaXQncyBvbiB0b3BcclxuXHJcbiAgY29uc3QgdGl0bGVUZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImgxXCIpO1xyXG4gIHRpdGxlVGV4dC50ZXh0Q29udGVudCA9IGdhbWVDb25maWcuZ2FtZVRpdGxlIHx8IFwiU2FtcGxlIDNEIEdhbWVcIjtcclxuICB0aXRsZVRleHQuc3R5bGUubWFyZ2luQm90dG9tID0gXCIyMHB4XCI7XHJcbiAgdGl0bGVTY3JlZW5EaXYuYXBwZW5kQ2hpbGQodGl0bGVUZXh0KTtcclxuXHJcbiAgY29uc3Qgc3RhcnRCdXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xyXG4gIHN0YXJ0QnV0dG9uLnRleHRDb250ZW50ID0gZ2FtZUNvbmZpZy5zdGFydEJ1dHRvblRleHQgfHwgXCJDbGljayB0byBTdGFydFwiO1xyXG4gIHN0YXJ0QnV0dG9uLnN0eWxlLnBhZGRpbmcgPSBcIjE1cHggMzBweFwiO1xyXG4gIHN0YXJ0QnV0dG9uLnN0eWxlLmZvbnRTaXplID0gXCIxZW1cIjtcclxuICBzdGFydEJ1dHRvbi5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBcIiM0Q0FGNTBcIjtcclxuICBzdGFydEJ1dHRvbi5zdHlsZS5jb2xvciA9IFwid2hpdGVcIjtcclxuICBzdGFydEJ1dHRvbi5zdHlsZS5ib3JkZXIgPSBcIm5vbmVcIjtcclxuICBzdGFydEJ1dHRvbi5zdHlsZS5ib3JkZXJSYWRpdXMgPSBcIjVweFwiO1xyXG4gIHN0YXJ0QnV0dG9uLnN0eWxlLmN1cnNvciA9IFwicG9pbnRlclwiO1xyXG4gIHN0YXJ0QnV0dG9uLnN0eWxlLm1hcmdpblRvcCA9IFwiMjBweFwiO1xyXG4gIHN0YXJ0QnV0dG9uLm9ubW91c2VvdmVyID0gKCkgPT4gc3RhcnRCdXR0b24uc3R5bGUuYmFja2dyb3VuZENvbG9yID0gXCIjNDVhMDQ5XCI7XHJcbiAgc3RhcnRCdXR0b24ub25tb3VzZW91dCA9ICgpID0+IHN0YXJ0QnV0dG9uLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IFwiIzRDQUY1MFwiO1xyXG4gIHRpdGxlU2NyZWVuRGl2LmFwcGVuZENoaWxkKHN0YXJ0QnV0dG9uKTtcclxuXHJcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aXRsZVNjcmVlbkRpdik7XHJcblxyXG4gIHN0YXJ0QnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICBnYW1lU3RhcnRlZCA9IHRydWU7XHJcbiAgICB0aXRsZVNjcmVlbkRpdi5yZW1vdmUoKTtcclxuICAgIGNvbnRyb2xzLmxvY2soKTsgLy8gUmVxdWVzdCBwb2ludGVyIGxvY2sgYWZ0ZXIgdXNlciBpbnRlcmFjdGlvblxyXG4gICAgaWYgKGJhY2tncm91bmRNdXNpYykge1xyXG4gICAgICBiYWNrZ3JvdW5kTXVzaWMucGxheSgpO1xyXG4gICAgfVxyXG4gICAgYW5pbWF0ZSgpOyAvLyBTdGFydCB0aGUgYW5pbWF0aW9uIGxvb3AgYWZ0ZXIgZGlzbWlzc2luZyB0aXRsZSBzY3JlZW5cclxuICB9KTtcclxufVxyXG5cclxuLy8gU3RhcnQgYnkgbG9hZGluZyBnYW1lIGRhdGFcclxubG9hZEdhbWVEYXRhKCk7Il0sCiAgIm1hcHBpbmdzIjogIkFBQ0EsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksWUFBWTtBQUN4QixTQUFTLDJCQUEyQjtBQUdwQyxNQUFNLFNBQVMsU0FBUyxlQUFlLFlBQVk7QUFDbkQsSUFBSSxD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
