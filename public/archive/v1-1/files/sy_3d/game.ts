// main.ts
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import * as CANNON from "cannon-es";

export class FPSGame {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: PointerLockControls;
  world: CANNON.World;
  playerBody: CANNON.Body;

  keyState: Record<string, boolean> = {};

  constructor() {
    // THREE 기본 세팅
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 1.6, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    // 컨트롤(시점 제어)
    this.controls = new PointerLockControls(this.camera, document.body);
    document.addEventListener("click", () => this.controls.lock());

    // 물리 world
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);

    // 바닥 물리
    const ground = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
    });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);

    // THREE 바닥
    const groundGeo = new THREE.PlaneGeometry(50, 50);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    this.scene.add(groundMesh);

    // 조명
    const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(light);

    // 플레이어 콜라이더 (캡슐 대신 단순 구)
    this.playerBody = new CANNON.Body({
      mass: 70,
      shape: new CANNON.Sphere(0.5),
      position: new CANNON.Vec3(0, 2, 0),
    });
    this.playerBody.linearDamping = 0.9; // 관성 줄이기
    this.world.addBody(this.playerBody);

    // 키 입력
    window.addEventListener("keydown", (e) => (this.keyState[e.code] = true));
    window.addEventListener("keyup", (e) => (this.keyState[e.code] = false));

    // 루프 시작
    this.animate();
  }

  movePlayer(dt: number) {
    const speed = 5;

    let vx = 0;
    let vz = 0;

    if (this.keyState["KeyW"]) vz -= speed;
    if (this.keyState["KeyS"]) vz += speed;
    if (this.keyState["KeyA"]) vx -= speed;
    if (this.keyState["KeyD"]) vx += speed;

    // 카메라 방향 기준 이동
    const angle = this.camera.rotation.y;
    const forwardX = Math.sin(angle);
    const forwardZ = Math.cos(angle);

    const rightX = Math.sin(angle + Math.PI / 2);
    const rightZ = Math.cos(angle + Math.PI / 2);

    const vel = this.playerBody.velocity;
    vel.x = forwardX * vz + rightX * vx;
    vel.z = forwardZ * vz + rightZ * vx;
  }

  animate = () => {
    requestAnimationFrame(this.animate);

    const dt = 1 / 60;

    // 키 이동 적용
    this.movePlayer(dt);

    // 물리 world 진행
    this.world.step(dt);

    // 카메라를 플레이어 위치에 따라가게
    this.camera.position.set(
      this.playerBody.position.x,
      this.playerBody.position.y + 0.5,
      this.playerBody.position.z
    );

    // 렌더
    this.renderer.render(this.scene, this.camera);
  };
}

// 실행
new FPSGame();
