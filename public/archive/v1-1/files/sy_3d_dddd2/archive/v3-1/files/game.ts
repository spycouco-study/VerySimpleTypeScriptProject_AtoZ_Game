import * as THREE from "three";
import * as CANNON from "cannon-es";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

// Configuration interface based on data.json
interface GameConfig {
  player: {
    speed: number;
    jumpForce: number;
    mouseSensitivity: number;
  };
  level: {
    arenaSize: number;
    wallHeight: number;
  };
  enemy: {
    count: number;
    size: number;
    scoreValue: number;
    texturePath: string; // Placeholder for image asset
  };
  assets: {
    bgmPath: string; // Placeholder for audio asset
    shootSfxPath: string; // Placeholder for audio asset
  };
}

// === Global State and Variables ===
let config: GameConfig;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: PointerLockControls;
let world: CANNON.World;
let lastTime: number = 0;
let isGameRunning = false;
let score = 0;

// Player Physics Body
let playerBody: CANNON.Body;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = true;

// Dynamic DOM Elements
let container: HTMLElement;
let titleScreen: HTMLDivElement;
let hud: HTMLDivElement;
let scoreElement: HTMLSpanElement;

// Collections
const enemies: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
const enemyMaterial = new CANNON.Material();

// Audio setup (Simulation/Placeholder)
let audioContext: AudioContext;
let bgmSource: AudioBufferSourceNode | null = null;
const assets = {
  shootSfx: null as AudioBuffer | null,
  bgm: null as AudioBuffer | null,
};

// === Utility Functions ===

/**
 * PCM 오디오 데이터를 WAV Blob으로 변환
 * TTS API의 PCM16 응답 처리에 사용되는 유틸리티 (여기서는 단순 시뮬레이션 목적)
 * @param pcm16 Int16Array 형식의 PCM 데이터
 * @param sampleRate 샘플링 속도
 * @returns WAV 형식의 Blob
 */
function pcmToWav(pcm16: Int16Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bytesPerSample = 2; // Int16
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataLength = pcm16.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");

  // FMT sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Sub-chunk size
  view.setUint16(20, 1, true); // Audio format (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // Bits per sample

  // DATA sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  // Write PCM data
  let offset = 44;
  for (let i = 0; i < pcm16.length; i++, offset += bytesPerSample) {
    view.setInt16(offset, pcm16[i], true);
  }

  return new Blob([view], { type: "audio/wav" });

  function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}

/**
 * 오디오 파일을 로드하는 시뮬레이션 함수 (실제 로딩 없음)
 * @param path 에셋 경로
 * @returns 로드된 오디오 버퍼 (null 반환으로 시뮬레이션)
 */
async function loadAudio(path: string): Promise<AudioBuffer | null> {
  // 실제 파일 로딩은 불가능하므로, 성공적으로 로드된 것처럼 시뮬레이션합니다.
  console.log(`[Asset] Loading audio from: ${path}`);
  return null; // 실제 AudioBuffer 대신 null 반환
}

/**
 * 배경음악을 재생하는 시뮬레이션 함수
 */
function playBGM() {
  if (bgmSource) {
    bgmSource.stop();
    bgmSource.disconnect();
  }
  // 실제 BGM 재생 대신 콘솔 로그
  console.log("[Audio] Playing BGM.");
}

/**
 * 효과음을 재생하는 시뮬레이션 함수
 */
function playSfx(type: "shoot") {
  // 실제 효과음 재생 대신 콘솔 로그
  console.log(`[Audio] Playing SFX: ${type}`);
}

// === Game Initialization and Setup ===

/**
 * data.json을 불러와 설정을 로드합니다.
 */
async function loadConfig(): Promise<boolean> {
  try {
    const response = await fetch("data.json");
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    config = (await response.json()) as GameConfig;
    console.log("Game Config Loaded:", config);
    return true;
  } catch (error) {
    console.error("Failed to load game configuration:", error);
    return false;
  }
}

/**
 * 초기 DOM 요소를 설정하고 타이틀 화면을 표시합니다.
 */
function setupDOM() {
  // 1. 컨테이너 설정: 캔버스와 UI를 감싸는 요소
  container = document.createElement("div");
  container.id = "game-container";
  Object.assign(container.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    fontFamily: "sans-serif",
  });
  document.body.appendChild(container);

  const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
  if (!canvas) {
    console.error("Canvas element #gameCanvas not found.");
    return;
  }
  container.appendChild(canvas);

  // 2. 타이틀 화면 (Title Screen)
  titleScreen = document.createElement("div");
  titleScreen.id = "title-screen";
  titleScreen.innerHTML = `
        <div style="text-align: center; color: white; background: rgba(0,0,0,0.8); padding: 40px; border-radius: 10px;">
            <h1 style="font-size: 3em; margin-bottom: 0;">SIMPLE FPS DEMO</h1>
            <p style="font-size: 1.2em;">3D FPS 게임 (Three.js + Cannon.js)</p>
            <button id="startButton" style="padding: 10px 20px; font-size: 1.5em; cursor: pointer; margin-top: 20px; border: none; border-radius: 5px; background: #4CAF50; color: white;">게임 시작</button>
            <p style="margin-top: 30px; font-size: 0.9em; opacity: 0.7;">WASD: 이동 | Space: 점프 | 마우스: 시점 조작 | 좌클릭: 발사</p>
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
    backgroundColor: "rgba(0, 0, 0, 0.95)",
  });
  container.appendChild(titleScreen);

  // 3. HUD (Head-Up Display)
  hud = document.createElement("div");
  hud.id = "hud";
  hud.innerHTML = `
        <div style="position: absolute; top: 20px; left: 20px; color: white; font-size: 1.5em; text-shadow: 0 0 5px black;">
            점수: <span id="score">0</span>
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
    display: "none", // 게임 시작 전에는 숨김
    zIndex: "50",
    pointerEvents: "none",
  });
  container.appendChild(hud);
  scoreElement = document.getElementById("score") as HTMLSpanElement;

  // 4. 이벤트 리스너 설정
  document.getElementById("startButton")?.addEventListener("click", startGame);
  window.addEventListener("resize", onWindowResize, false);
}

/**
 * Three.js 씬, 카메라, 렌더러를 설정합니다.
 */
function setupThree() {
  const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x444444);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, config.level.wallHeight / 2 + 0.5, 0); // Player initial position

  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true; // 그림자 활성화
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 조명
  const light = new THREE.DirectionalLight(0xffffff, 3);
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
  scene.add(new THREE.AmbientLight(0x666666, 1));
}

/**
 * Cannon.js 물리 엔진을 설정합니다.
 */
function setupPhysics() {
  world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0),
  });

  // 지면 (Ground)
  const groundShape = new CANNON.Plane();
  const groundBody = new CANNON.Body({ mass: 0, shape: groundShape });
  groundBody.quaternion.setFromAxisAngle(
    new CANNON.Vec3(1, 0, 0),
    -Math.PI / 2
  ); // X축으로 -90도 회전
  world.addBody(groundBody);

  // 플레이어 바디 (간단한 캡슐 형태 시뮬레이션)
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
  playerBody.fixedRotation = true; // 회전 방지 (FPS 캐릭터처럼 똑바로 서 있게)
  world.addBody(playerBody);

  // 충돌 이벤트 리스너: 점프 상태 업데이트
  playerBody.addEventListener("collide", (event: any) => {
    const contact = event.contact;
    // 접촉 노말 벡터를 사용하여 지면과의 충돌 감지
    if (contact.bi.mass === 0) {
      // bi가 지면인 경우
      const upAxis = new CANNON.Vec3(0, 1, 0);
      const normal = new CANNON.Vec3();
      contact.ni.negate(normal); // ni는 b1 -> b2 방향, b1(player)이 b2(ground)에 닿을 때
      if (normal.dot(upAxis) > 0.5) {
        // 꽤 위쪽 방향으로 충돌해야 지면으로 간주
        canJump = true;
      }
    }
  });

  // 벽 (Arena Walls) - 단순한 상자 모양
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
      shape: sideWallShape,
    },
    { pos: new CANNON.Vec3(size / 2, wallHeight / 2, 0), shape: sideWallShape },
  ];

  walls.forEach((w) => {
    const wallBody = new CANNON.Body({
      mass: 0,
      material: wallMaterial,
      shape: w.shape,
    });
    wallBody.position.copy(w.pos);
    world.addBody(wallBody);

    // 시각적 표현 (Three.js)
    const wallMesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        w.shape.halfExtents.x * 2,
        w.shape.halfExtents.y * 2,
        w.shape.halfExtents.z * 2
      ),
      new THREE.MeshStandardMaterial({ color: 0x999999 })
    );
    wallMesh.position.copy(w.pos as any); // CANNON.Vec3 to THREE.Vector3
    wallMesh.receiveShadow = true;
    scene.add(wallMesh);
  });
}

/**
 * 환경 모델을 설정합니다. (지면, 벽 시각화)
 */
function setupEnvironment() {
  // 지면 시각화
  const size = config.level.arenaSize;
  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: 0x228b22 }) // Forest Green
  );
  groundMesh.rotation.x = -Math.PI / 2; // X축으로 -90도 회전
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
}

/**
 * 적(Enemy/Target)을 생성하고 씬과 물리 엔진에 추가합니다.
 */
function spawnEnemies() {
  const geometry = new THREE.BoxGeometry(
    config.enemy.size,
    config.enemy.size,
    config.enemy.size
  );
  // 이미지 로딩 시뮬레이션: 실제로는 TextureLoader를 사용해야 합니다.
  // const texture = new THREE.TextureLoader().load(config.enemy.texturePath);
  // const material = new THREE.MeshStandardMaterial({ map: texture });

  // 단순 색상으로 대체
  const material = new THREE.MeshStandardMaterial({ color: 0xff4500 }); // Orange Red

  for (let i = 0; i < config.enemy.count; i++) {
    // 무작위 위치
    const pos = new CANNON.Vec3(
      (Math.random() - 0.5) * config.level.arenaSize * 0.8,
      config.enemy.size / 2,
      (Math.random() - 0.5) * config.level.arenaSize * 0.8
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(pos as any);
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
      shape: shape,
    }); // 정적인 타겟
    body.position.copy(pos);
    world.addBody(body);

    // 메쉬와 바디를 연결하여 나중에 쉽게 찾고 제거할 수 있도록 합니다.
    (mesh as any).cannonBody = body;

    enemies.push({ mesh, body });
  }
  console.log(`Spawned ${config.enemy.count} enemies.`);
}

/**
 * 윈도우 크기 변경 시 카메라와 렌더러를 업데이트합니다.
 */
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// === Input and Control ===

/**
 * 포인터 락 컨트롤을 설정하고 입력 이벤트를 처리합니다.
 */
function setupControls() {
  controls = new PointerLockControls(camera, container);

  // 마우스 감도 조절을 위해 PointerLockControls 내부 로직을 덮어씁니다.
  // Three.js의 PointerLockControls는 내부적으로 감도 설정이 없으므로, 직접 구현합니다.
  const originalOnMouseMove = (controls as any).onMouseMove;
  (controls as any).onMouseMove = function (event: MouseEvent) {
    // 기본 마우스 이동 처리
    originalOnMouseMove.call(controls, event);

    // Three.js PointerLockControls는 카메라 회전을 직접 처리하므로,
    // 감도 조절을 위해서는 내부 코드를 수정해야 하지만,
    // 여기서는 기본 PointerLockControls의 작동을 따릅니다.
    // 마우스 감도(config.player.mouseSensitivity)는 Three.js 컨트롤러가 기본적으로 제공하지 않기 때문에
    // 실제로 구현하려면 커스텀 컨트롤러가 필요합니다. 단순화를 위해 기본 동작을 유지합니다.
  };

  // 마우스 클릭 (발사) 이벤트
  document.addEventListener("click", shoot, false);

  // 키 입력 이벤트
  const onKeyDown = (event: KeyboardEvent) => {
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

  const onKeyUp = (event: KeyboardEvent) => {
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

/**
 * 게임 시작 시 호출됩니다.
 */
function startGame() {
  if (isGameRunning) return;

  // 타이틀 화면 숨기기
  titleScreen.style.display = "none";
  hud.style.display = "block";

  // 포인터 락 활성화
  controls.lock();

  // 게임 루프 시작
  isGameRunning = true;
  lastTime = performance.now();
  animate();

  playBGM();
}

/**
 * 플레이어 시점에서 Raycasting을 사용하여 발사합니다.
 */
function shoot() {
  if (!isGameRunning) return;

  playSfx("shoot");

  const raycaster = new THREE.Raycaster();
  // 화면 중앙 (0, 0)에서 레이를 발사
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

  // 적 메쉬만 대상으로 설정
  const targets = enemies.map((e) => e.mesh);
  const intersects = raycaster.intersectObjects(targets);

  if (intersects.length > 0) {
    const hitMesh = intersects[0].object as THREE.Mesh;
    removeEnemy(hitMesh);
  }
}

/**
 * 적 메쉬와 물리 바디를 씬에서 제거합니다.
 */
function removeEnemy(mesh: THREE.Mesh) {
  const body = (mesh as any).cannonBody as CANNON.Body;

  // 1. 점수 업데이트
  score += config.enemy.scoreValue;
  scoreElement.textContent = score.toString();

  // 2. 물리 바디 제거
  world.removeBody(body);

  // 3. Three.js 메쉬 제거
  scene.remove(mesh);

  // 4. 배열에서 제거
  const index = enemies.findIndex((e) => e.mesh === mesh);
  if (index !== -1) {
    enemies.splice(index, 1);
  }

  // 게임 종료 조건 (모든 적 제거)
  if (enemies.length === 0) {
    endGame("승리");
  }
}

/**
 * 게임을 종료하고 결과를 표시합니다.
 */
function endGame(result: string) {
  isGameRunning = false;
  controls.unlock();

  if (bgmSource) bgmSource.stop();

  titleScreen.style.display = "flex";
  titleScreen.innerHTML = `
        <div style="text-align: center; color: white; background: rgba(0,0,0,0.8); padding: 40px; border-radius: 10px;">
            <h1 style="font-size: 3em; margin-bottom: 10px;">게임 종료: ${result}</h1>
            <p style="font-size: 2em;">최종 점수: ${score}</p>
            <button id="restartButton" style="padding: 10px 20px; font-size: 1.5em; cursor: pointer; margin-top: 20px; border: none; border-radius: 5px; background: #4CAF50; color: white;">다시 시작</button>
        </div>
    `;

  document.getElementById("restartButton")?.addEventListener("click", () => {
    // 씬과 물리 바디 재설정
    resetGame();
    startGame();
  });
}

/**
 * 게임 상태를 초기화합니다.
 */
function resetGame() {
  // 이전 적들을 모두 제거
  enemies.forEach((e) => {
    world.removeBody(e.body);
    scene.remove(e.mesh);
  });
  enemies.length = 0;

  // 플레이어 위치 초기화
  playerBody.position.set(0, config.level.wallHeight / 2 + 1, 0);
  playerBody.velocity.set(0, 0, 0);
  playerBody.angularVelocity.set(0, 0, 0);

  // 점수 초기화
  score = 0;
  if (scoreElement) scoreElement.textContent = "0";

  // 새로운 적 생성
  spawnEnemies();

  console.log("Game state reset.");
}

/**
 * 게임의 메인 루프입니다.
 */
function animate() {
  if (!isGameRunning) return;
  requestAnimationFrame(animate);

  const time = performance.now();
  const dt = (time - lastTime) / 1000;
  lastTime = time;

  // 1. 물리 엔진 업데이트
  world.step(1 / 60, dt);

  // 2. 플레이어 움직임 처리
  const speed = config.player.speed * dt;
  const bodyVelocity = playerBody.velocity;
  const currentVelocity = new THREE.Vector3(0, bodyVelocity.y, 0);

  // 카메라 방향을 기준으로 움직임 벡터 계산
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  direction.y = 0; // Y축(수직) 움직임은 무시

  const right = new THREE.Vector3();
  right.crossVectors(direction, new THREE.Vector3(0, 1, 0));

  // Three.js 컨트롤은 카메라를 회전시키지만, 물리는 body로 처리합니다.
  // 플레이어의 물리 바디 위치를 카메라 위치와 동기화합니다.

  // 2-1. 속도 설정 (Y축 속도 유지)
  if (moveForward) currentVelocity.addScaledVector(direction, speed);
  if (moveBackward) currentVelocity.addScaledVector(direction, -speed);
  if (moveLeft) currentVelocity.addScaledVector(right, -speed);
  if (moveRight) currentVelocity.addScaledVector(right, speed);

  // 물리 바디에 새로운 속도 적용
  playerBody.velocity.set(currentVelocity.x, bodyVelocity.y, currentVelocity.z);

  // 2-2. 카메라 위치 업데이트
  camera.position.copy(playerBody.position as any);
  camera.position.y += config.level.wallHeight / 2; // 플레이어 시점 높이 조정

  // 3. 적 메쉬와 물리 바디 동기화 (적은 정적이므로 한번만 하면 되지만, 안전을 위해 루프에서 처리)
  enemies.forEach((e) => {
    e.mesh.position.copy(e.body.position as any);
    e.mesh.quaternion.copy(e.body.quaternion as any);
  });

  // 4. 렌더링
  renderer.render(scene, camera);
}

// === Main Execution Flow ===

/**
 * 애플리케이션의 진입점입니다.
 */
async function init() {
  // 1. 설정 로드
  if (!(await loadConfig())) {
    document.body.innerHTML =
      '<div style="color: red; padding: 20px;">설정 파일(data.json)을 불러오는 데 실패했습니다.</div>';
    return;
  }

  // 2. DOM 및 UI 설정
  setupDOM();

  // 3. 오디오 시뮬레이션 초기화 (실제로는 assets 로딩)
  audioContext = new window.AudioContext();
  await loadAudio(config.assets.bgmPath).then(
    (buffer) => (assets.bgm = buffer)
  );
  await loadAudio(config.assets.shootSfxPath).then(
    (buffer) => (assets.shootSfx = buffer)
  );

  // 4. 3D/물리 엔진 설정
  setupThree();
  setupPhysics();
  setupEnvironment();
  setupControls();

  // 5. 초기 적 생성
  spawnEnemies();

  console.log(
    "Initialization complete. Waiting for user to click 'Start Game'."
  );
}

window.onload = init;
