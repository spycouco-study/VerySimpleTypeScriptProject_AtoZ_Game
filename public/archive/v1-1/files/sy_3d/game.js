"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FPSGame = void 0;
// main.ts
const THREE = __importStar(require("three"));
const PointerLockControls_js_1 = require("three/examples/jsm/controls/PointerLockControls.js");
const CANNON = __importStar(require("cannon-es"));
class FPSGame {
    constructor() {
        this.keyState = {};
        this.animate = () => {
            requestAnimationFrame(this.animate);
            const dt = 1 / 60;
            // 키 이동 적용
            this.movePlayer(dt);
            // 물리 world 진행
            this.world.step(dt);
            // 카메라를 플레이어 위치에 따라가게
            this.camera.position.set(this.playerBody.position.x, this.playerBody.position.y + 0.5, this.playerBody.position.z);
            // 렌더
            this.renderer.render(this.scene, this.camera);
        };
        // THREE 기본 세팅
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 1.6, 0);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);
        // 컨트롤(시점 제어)
        this.controls = new PointerLockControls_js_1.PointerLockControls(this.camera, document.body);
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
    movePlayer(dt) {
        const speed = 5;
        let vx = 0;
        let vz = 0;
        if (this.keyState["KeyW"])
            vz -= speed;
        if (this.keyState["KeyS"])
            vz += speed;
        if (this.keyState["KeyA"])
            vx -= speed;
        if (this.keyState["KeyD"])
            vx += speed;
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
}
exports.FPSGame = FPSGame;
// 실행
new FPSGame();
