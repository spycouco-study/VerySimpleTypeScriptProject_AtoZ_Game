// Imports are assumed to be handled by a module bundler like Webpack/Vite in a real TS project
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// ====================================================================
// 1. 공통 상수 및 인터페이스 정의
// ====================================================================

const MAX_LAPS: number = 3;
const CAR_WIDTH: number = 1.8;
const CAR_HEIGHT: number = 1.5;
const CAR_LENGTH: number = 4.0;
const TRACK_WIDTH_RATIO: number = 6;
const TRACK_WIDTH: number = CAR_WIDTH * TRACK_WIDTH_RATIO;
const AI_NAMES: string[] = ["Racer 1", "Racer 2", "Racer 3"];

const TRACK_POINTS: THREE.Vector3[] = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(200, 0, 0),
    new THREE.Vector3(250, 0, -50),
    new THREE.Vector3(250, 0, -200),
    new THREE.Vector3(200, 0, -250),
    new THREE.Vector3(50, 0, -250),
    new THREE.Vector3(0, 0, -200),
    // 시케인 (Chicane) 구간 추가
    new THREE.Vector3(-30, 0, -100),
    new THREE.Vector3(-10, 0, -80),
    new THREE.Vector3(-50, 0, -50),
    new THREE.Vector3(-100, 0, -10),
    new THREE.Vector3(-200, 0, 0),
    new THREE.Vector3(-150, 0, 50),
    new THREE.Vector3(0, 0, 100),
];

type ItemType = 'BOOST' | 'SLOW';
type GameState = 'INITIAL' | 'COUNTDOWN' | 'RACING' | 'FINISHED';

interface CarControls {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
}

/**
 * 밀리초를 'MM:SS:ms' 형식의 문자열로 포맷합니다.
 * @param ms 시간 (밀리초)
 * @returns 포맷된 시간 문자열
 */
function formatTime(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(2, '0')}`;
}

// ====================================================================
// 2. Car 클래스: 차량의 3D 및 물리 상태 관리
// ====================================================================

export class Car {
    public readonly name: string;
    public readonly isPlayer: boolean;
    public readonly isAI: boolean;
    public readonly color: number;
    public mesh: THREE.Mesh;
    public body: CANNON.Body;

    // 물리 속성
    private baseMaxSpeed: number = 30;
    public maxSpeed: number = 30;
    private readonly acceleration: number = 10;
    private readonly handling: number = 0.05;
    private readonly friction: number = 0.98;

    // 현재 상태
    public currentSpeed: number = 0;
    public rotationAngle: number = 0;
    public controls: CarControls = { up: false, down: false, left: false, right: false };
    public lapCount: number = 0;
    public lastWaypointIndex: number = -1;
    public raceFinishTime: number | null = null;
    public rank: number = 0;

    // 아이템 상태
    public currentItem: ItemType | null = null;
    public itemEffectTimer: number = 0;
    public isAffectedBySlow: boolean = false;
    public slowTimer: number = 0;

    constructor(name: string, isPlayer: boolean, position: THREE.Vector3, color: number) {
        this.name = name;
        this.isPlayer = isPlayer;
        this.isAI = !isPlayer;
        this.color = color;

        // Three.js Mesh
        const bodyGeometry = new THREE.BoxGeometry(CAR_WIDTH, CAR_HEIGHT, CAR_LENGTH);
        const bodyMaterial = new THREE.MeshPhongMaterial({ color: this.color });
        this.mesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.mesh.position.copy(position);

        // Cannon-es Body
        const bodyShape = new CANNON.Box(new CANNON.Vec3(CAR_WIDTH / 2, CAR_HEIGHT / 2, CAR_LENGTH / 2));
        this.body = new CANNON.Body({
            mass: 200,
            position: new CANNON.Vec3(position.x, position.y + CAR_HEIGHT / 2, position.z),
            shape: bodyShape,
            linearDamping: 0.5,
            angularDamping: 0.5,
        });
        this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.rotationAngle);
    }

    /** 플레이어 입력에 따라 차량 속도와 회전 각도를 업데이트합니다. */
    public updateControls(deltaTime: number): void {
        if (this.raceFinishTime) return;

        let targetSpeed: number = 0;
        if (this.isAffectedBySlow) {
            targetSpeed = this.baseMaxSpeed * 0.5;
        } else if (this.itemEffectTimer > 0) {
            targetSpeed = this.baseMaxSpeed * 1.5;
        } else {
            targetSpeed = this.baseMaxSpeed;
        }

        if (this.controls.up) {
            this.currentSpeed += this.acceleration * deltaTime;
        } else if (this.controls.down) {
            this.currentSpeed -= this.acceleration * 1.5 * deltaTime;
        } else {
            // 자연 감속
            this.currentSpeed *= this.friction ** (deltaTime * 60);
        }

        this.currentSpeed = Math.min(Math.max(this.currentSpeed, -targetSpeed / 3), targetSpeed);

        if (Math.abs(this.currentSpeed) > 0.1) {
            if (this.controls.left) {
                this.rotationAngle += this.handling * (this.currentSpeed > 0 ? 1 : -1);
            }
            if (this.controls.right) {
                this.rotationAngle -= this.handling * (this.currentSpeed > 0 ? 1 : -1);
            }
            this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.rotationAngle);
        }
    }

    /** AI 로직에 따라 차량 상태를 업데이트합니다. */
    public updateAI(waypoints: THREE.Vector3[], deltaTime: number): void {
        if (this.raceFinishTime) return;

        const currentPos = this.mesh.position;
        let nextWaypointIndex = (this.lastWaypointIndex + 1) % waypoints.length;
        let nextWaypoint = waypoints[nextWaypointIndex];

        const targetDirection = nextWaypoint.clone().sub(currentPos).setY(0).normalize();
        const carForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);

        const angle = carForward.angleTo(targetDirection);
        const cross = carForward.clone().cross(targetDirection).y;

        // 난이도 '보통'에 따른 약간의 실수 유도
        const errorFactor = (Math.random() - 0.5) * 0.1;

        if (angle > 0.1 + errorFactor) {
            if (cross > 0) {
                this.rotationAngle += this.handling * deltaTime * 50;
            } else {
                this.rotationAngle -= this.handling * deltaTime * 50;
            }
        }

        this.currentSpeed += this.acceleration * deltaTime;
        this.currentSpeed = Math.min(this.currentSpeed, this.maxSpeed);

        const distanceToNext = currentPos.distanceTo(nextWaypoint);
        const brakeDistance = 50;

        if (distanceToNext < 10) {
            this.lastWaypointIndex = nextWaypointIndex;
        }

        // 급한 코너 감속
        if (distanceToNext < brakeDistance) {
            const speedRatio = Math.max(0.3, distanceToNext / brakeDistance);
            this.currentSpeed = Math.min(this.currentSpeed, this.maxSpeed * speedRatio);
        }

        this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), this.rotationAngle);
    }

    /** 물리 엔진 업데이트 후 3D Mesh를 동기화하고 타이머를 관리합니다. */
    public updatePhysics(deltaTime: number): void {
        // Cannon Body 위치/회전 -> Three Mesh 동기화
        this.mesh.position.copy(this.body.position as unknown as THREE.Vector3);
        this.mesh.quaternion.copy(this.body.quaternion as unknown as THREE.Quaternion);

        // 현재 속도에 따른 전진 힘 적용
        const quaternion = this.body.quaternion;
        const forward = new CANNON.Vec3(0, 0, 1).applyQuaternion(quaternion);
        forward.normalize();

        const forceMagnitude = this.currentSpeed * 2000;
        this.body.applyForce(forward.scale(forceMagnitude));

        // 아이템 효과 타이머 업데이트
        if (this.itemEffectTimer > 0) {
            this.itemEffectTimer -= deltaTime;
            if (this.itemEffectTimer <= 0) {
                this.maxSpeed = this.baseMaxSpeed;
                this.itemEffectTimer = 0;
            }
        }
        if (this.slowTimer > 0) {
            this.slowTimer -= deltaTime;
            if (this.slowTimer <= 0) {
                this.isAffectedBySlow = false;
                this.slowTimer = 0;
            }
        }
    }

    /** 아이템 획득 */
    public applyItem(type: ItemType): void {
        this.currentItem = type;
    }

    /** 슬로우 아이템 피격 효과 적용 */
    public applySlowEffect(): void {
        this.isAffectedBySlow = true;
        this.slowTimer = 3;
        this.currentSpeed *= 0.5;
    }
}

// ====================================================================
// 3. Track 클래스: 트랙 생성 및 웨이포인트 정의
// ====================================================================

export class Track {
    private scene: THREE.Scene;
    private world: CANNON.World;
    public readonly waypoints: THREE.Vector3[];

    constructor(scene: THREE.Scene, world: CANNON.World) {
        this.scene = scene;
        this.world = world;
        this.waypoints = this.generateWaypoints(TRACK_POINTS);
        this.createTrackMesh();
        this.createGuardrails();
    }

    private generateWaypoints(points: THREE.Vector3[]): THREE.Vector3[] {
        const curve = new THREE.CatmullRomCurve3(points);
        const numWaypoints = 100;
        return curve.getPoints(numWaypoints).map(p => p.setY(CAR_HEIGHT / 2));
    }

    private createTrackMesh(): void {
        const curve = new THREE.CatmullRomCurve3(TRACK_POINTS);
        const tubularSegments = 200;
        const radiusSegments = 8;
        const trackGeometry = new THREE.TubeGeometry(curve, tubularSegments, TRACK_WIDTH / 2, radiusSegments, false);
        
        // 텍스처 로드 및 반복 설정
        const texture = new THREE.TextureLoader().load("https://placehold.co/128x128/374151/FFFFFF?text=Road", (tex) => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(50, 4);
        });
        const trackMaterial = new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide });
        const trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
        this.scene.add(trackMesh);

        // 바닥 (Ground)
        const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
        const groundMaterial = new THREE.MeshPhongMaterial({ color: 0x4f4f4f, side: THREE.DoubleSide });
        const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        this.scene.add(groundMesh);

        // Cannon-es Ground Body (고정 바닥)
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({
            mass: 0,
            shape: groundShape,
        });
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.world.addBody(groundBody);
    }

    private createGuardrails(): void {
        const curve = new THREE.CatmullRomCurve3(TRACK_POINTS);
        const numSegments = 200;
        const points = curve.getPoints(numSegments);
        const height = 3;

        const railMaterial = new THREE.MeshPhongMaterial({ color: 0xcccccc });

        for (let i = 0; i < points.length; i++) {
            const currentPoint = points[i];
            const nextPoint = points[(i + 1) % points.length];

            const direction = nextPoint.clone().sub(currentPoint).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const side = direction.clone().cross(up).normalize();

            const offset = side.clone().multiplyScalar(TRACK_WIDTH / 2 + 1);

            const leftPos = currentPoint.clone().add(offset).setY(height / 2);
            this.createGuardrailSegment(leftPos, direction, height, railMaterial);

            const rightPos = currentPoint.clone().sub(offset).setY(height / 2);
            this.createGuardrailSegment(rightPos, direction, height, railMaterial);
        }
    }

    private createGuardrailSegment(position: THREE.Vector3, direction: THREE.Vector3, height: number, material: THREE.Material): void {
        const segmentLength = 5;
        const railGeometry = new THREE.BoxGeometry(0.5, height, segmentLength);
        const railMesh = new THREE.Mesh(railGeometry, material);

        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
        railMesh.quaternion.copy(quaternion);
        railMesh.position.copy(position);
        this.scene.add(railMesh);

        // Cannon-es Body (Static)
        const shape = new CANNON.Box(new CANNON.Vec3(0.5 / 2, height / 2, segmentLength / 2));
        const body = new CANNON.Body({
            mass: 0,
            shape: shape,
            position: new CANNON.Vec3(position.x, position.y, position.z),
        });
        body.quaternion.copy(railMesh.quaternion as unknown as CANNON.Quaternion);

        // 가드레일은 마찰력을 낮게 설정하여 차량이 미끄러지도록 처리
        body.material = new CANNON.Material({ friction: 0.1, restitution: 0.2 });
        this.world.addBody(body);
    }
}

// ====================================================================
// 4. Item 클래스: 아이템 관리
// ====================================================================

export class Item {
    public readonly type: ItemType;
    public isCollected: boolean = false;
    public mesh: THREE.Mesh;

    constructor(type: ItemType, position: THREE.Vector3) {
        this.type = type;
        
        const color = type === 'BOOST' ? 0xffa500 : 0x00bfff;
        this.mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshLambertMaterial({ color: color })
        );
        this.mesh.position.copy(position).setY(CAR_HEIGHT);
        this.mesh.userData = { isItem: true, itemType: type };
    }

    public update(deltaTime: number): void {
        if (!this.isCollected) {
            this.mesh.rotation.y += deltaTime * 2;
        }
    }
}


// ====================================================================
// 5. RacingGame 클래스: 게임의 모든 로직 및 상태 관리
// ====================================================================

export class RacingGame {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private world: CANNON.World;
    private track: Track;

    public state: GameState = 'INITIAL';
    public players: Car[] = [];
    public playerCar!: Car; // !: 초기화가 constructor 외부에서 이루어짐을 명시
    public items: Item[] = [];
    
    private startTime: number = 0;
    private currentLapTime: number = 0;
    private bestLapTime: number = Infinity;
    private itemSpawnTimer: number = 0;
    public rankings: Car[] = [];

    constructor(containerId: string) {
        this.setupThreeJS(containerId);
        this.setupCannonJS();
        this.track = new Track(this.scene, this.world);
        this.initCars();
        this.initListeners();
        this.animate();
        this.showMessage('레이스 준비!', '방향키로 조작하세요.');
    }

    private setupThreeJS(containerId: string): void {
        const container = document.getElementById(containerId);
        if (!container) throw new Error("Game container not found.");

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0x404040, 5);
        this.scene.add(ambientLight);
        const sunLight = new THREE.DirectionalLight(0xffffff, 3);
        sunLight.position.set(100, 150, 100);
        this.scene.add(sunLight);

        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    private setupCannonJS(): void {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.allowSleep = true;
    }

    private initCars(): void {
        const startPos = new THREE.Vector3(0, 0, -50);

        // 플레이어 차량
        this.playerCar = new Car("Player", true, startPos.clone(), 0x3b82f6);
        this.scene.add(this.playerCar.mesh);
        this.world.addBody(this.playerCar.body);
        this.players.push(this.playerCar);

        // AI 차량 3대
        const colors = [0xfb7185, 0x10b981, 0xfacc15];
        AI_NAMES.forEach((name, index) => {
            const aiPos = startPos.clone().add(new THREE.Vector3((index + 1) * (CAR_WIDTH + 1), 0, 0));
            const aiCar = new Car(name, false, aiPos, colors[index]);
            this.scene.add(aiCar.mesh);
            this.world.addBody(aiCar.body);
            this.players.push(aiCar);
        });
    }

    private initListeners(): void {
        document.addEventListener('keydown', (e: KeyboardEvent) => this.handleControls(e.key, true));
        document.addEventListener('keyup', (e: KeyboardEvent) => this.handleControls(e.key, false));

        const useItemBtn = document.getElementById('use-item-btn');
        if (useItemBtn) useItemBtn.addEventListener('click', this.useItem.bind(this));
        
        const startButton = document.getElementById('start-button');
        if (startButton) startButton.addEventListener('click', this.startGame.bind(this));

        this.players.forEach(car => {
            car.body.addEventListener('collide', (e: { body: CANNON.Body }) => {
                const otherBody = e.body;
                const isAnotherCar = this.players.some(p => p.body === otherBody && p !== car);
                if (isAnotherCar) {
                    car.currentSpeed *= 0.8;
                }
            });
        });
    }

    private handleControls(key: string, isPressed: boolean): void {
        if (this.state !== 'RACING') return;

        switch (key) {
            case 'ArrowUp':
            case 'w':
            case 'W':
                this.playerCar.controls.up = isPressed;
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                this.playerCar.controls.down = isPressed;
                break;
            case 'ArrowLeft':
            case 'a':
            case 'A':
                this.playerCar.controls.left = isPressed;
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                this.playerCar.controls.right = isPressed;
                break;
            case ' ':
                if (isPressed) this.useItem();
                break;
        }
    }

    /** HUD의 아이템 정보를 업데이트합니다. */
    public updateHUDItem(): void {
        const itemIcon = document.getElementById('item-icon');
        const itemName = document.getElementById('item-name');
        const useBtn = document.getElementById('use-item-btn') as HTMLButtonElement | null;

        if (!itemIcon || !itemName || !useBtn) return;

        if (this.playerCar.currentItem === 'BOOST') {
            itemIcon.innerHTML = '🚀';
            itemName.textContent = '스피드 부스트';
            useBtn.disabled = false;
            useBtn.textContent = '아이템 사용 (Space)';
        } else if (this.playerCar.currentItem === 'SLOW') {
            itemIcon.innerHTML = '🐢';
            itemName.textContent = '슬로우 다운';
            useBtn.disabled = false;
            useBtn.textContent = '아이템 사용 (Space)';
        } else {
            itemIcon.innerHTML = '➖';
            itemName.textContent = '아이템 없음';
            useBtn.disabled = true;
            if (this.playerCar.itemEffectTimer > 0) {
                itemName.textContent = `부스트 발동 (${this.playerCar.itemEffectTimer.toFixed(1)}s)`;
            } else if (this.playerCar.isAffectedBySlow) {
                itemName.textContent = `슬로우 피격 (${this.playerCar.slowTimer.toFixed(1)}s)`;
            }
        }
    }

    private useItem(): void {
        if (this.state !== 'RACING' || !this.playerCar.currentItem) return;

        const itemType: ItemType = this.playerCar.currentItem;
        this.playerCar.currentItem = null;

        if (itemType === 'BOOST') {
            this.playerCar.maxSpeed = this.playerCar.baseMaxSpeed * 1.5;
            this.playerCar.itemEffectTimer = 5;
        } else if (itemType === 'SLOW') {
            let targetAI: Car | null = null;
            let minDistance = Infinity;

            this.players.filter(p => p.isAI).forEach(ai => {
                const distance = this.playerCar.mesh.position.distanceTo(ai.mesh.position);
                const diffZ = ai.mesh.position.z - this.playerCar.mesh.position.z;
                if (diffZ > -10 && distance < minDistance) {
                    minDistance = distance;
                    targetAI = ai;
                }
            });

            if (targetAI) {
                targetAI.applySlowEffect();
            }
        }
        this.updateHUDItem();
    }

    private updateRaceState(deltaTime: number): void {
        if (this.state !== 'RACING') return;

        this.currentLapTime += deltaTime * 1000;

        // 랩/웨이포인트 업데이트
        this.players.forEach(car => {
            if (car.raceFinishTime) return;

            const currentPos = car.mesh.position;
            const nextWaypointIndex = (car.lastWaypointIndex + 1) % this.track.waypoints.length;
            const nextWaypoint = this.track.waypoints[nextWaypointIndex];

            if (currentPos.distanceTo(nextWaypoint) < 10) {
                car.lastWaypointIndex = nextWaypointIndex;

                if (car.lastWaypointIndex === 0) {
                    car.lapCount++;
                    if (car.isPlayer && car.lapCount > 1) {
                        const lastLapTime = this.currentLapTime;
                        this.bestLapTime = Math.min(this.bestLapTime, lastLapTime);
                        this.currentLapTime = 0;
                    } else if (car.isPlayer && car.lapCount === 1) {
                        this.currentLapTime = 0;
                    }

                    if (car.lapCount > MAX_LAPS) {
                        car.raceFinishTime = Date.now();
                    }
                }
            }
        });

        // 순위 계산
        this.rankings = this.players
            .filter(p => !p.raceFinishTime)
            .sort((a, b) => {
                if (a.lapCount !== b.lapCount) return b.lapCount - a.lapCount;
                if (a.lastWaypointIndex !== b.lastWaypointIndex) return b.lastWaypointIndex - a.lastWaypointIndex;

                const nextA = this.track.waypoints[(a.lastWaypointIndex + 1) % this.track.waypoints.length];
                const nextB = this.track.waypoints[(b.lastWaypointIndex + 1) % this.track.waypoints.length];
                const distA = a.mesh.position.distanceTo(nextA);
                const distB = b.mesh.position.distanceTo(nextB);
                return distA - distB;
            });

        const finished = this.players
            .filter(p => p.raceFinishTime)
            .sort((a, b) => (a.raceFinishTime as number) - (b.raceFinishTime as number));
        this.rankings = [...finished, ...this.rankings];

        this.rankings.forEach((car, index) => car.rank = index + 1);

        // HUD 업데이트
        const playerRank = this.playerCar.rank;
        const playerLap = Math.min(this.playerCar.lapCount + 1, MAX_LAPS);
        
        document.getElementById('rank-display')!.textContent = `순위: ${playerRank}/${this.players.length}`;
        document.getElementById('lap-display')!.textContent = `랩: ${playerLap}/${MAX_LAPS}`;
        document.getElementById('time-display')!.textContent = `시간: ${formatTime(this.currentLapTime)}`;
        document.getElementById('best-time-display')!.textContent = `베스트 랩: ${this.bestLapTime === Infinity ? '--' : formatTime(this.bestLapTime)}`;
        this.updateHUDItem();


        // 레이스 종료 처리
        if (this.playerCar.raceFinishTime) {
            this.state = 'FINISHED';
            this.showResults();
        }
    }

    private updateItems(deltaTime: number): void {
        this.itemSpawnTimer -= deltaTime;
        if (this.itemSpawnTimer <= 0 && this.items.length < 3) {
            this.spawnItem();
            this.itemSpawnTimer = Math.random() * 10 + 10;
        }

        this.items.forEach(item => item.update(deltaTime));

        this.items.filter(i => !i.isCollected).forEach(item => {
            const distance = this.playerCar.mesh.position.distanceTo(item.mesh.position);
            // 아이템이 없고, 충분히 가까울 때 획득
            if (distance < 3 && !this.playerCar.currentItem) {
                this.playerCar.applyItem(item.type);
                item.isCollected = true;
                this.scene.remove(item.mesh);
                this.updateHUDItem();
            }
        });

        this.items = this.items.filter(i => !i.isCollected);
    }

    private spawnItem(): void {
        const type: ItemType = Math.random() < 0.5 ? 'BOOST' : 'SLOW';
        const randomIndex = Math.floor(Math.random() * this.track.waypoints.length);
        const spawnPos = this.track.waypoints[randomIndex].clone().setY(CAR_HEIGHT);

        const newItem = new Item(type, spawnPos);
        this.items.push(newItem);
        this.scene.add(newItem.mesh);
    }

    private updateCamera(): void {
        const carPos = this.playerCar.mesh.position;
        const offset = new THREE.Vector3(-30, 20, -30);
        const targetPos = carPos.clone().add(offset);

        this.camera.position.lerp(targetPos, 0.1);
        this.camera.lookAt(carPos.x, carPos.y + 2, carPos.z);
    }

    /** 게임을 시작하고 카운트다운 메시지를 제거합니다. */
    public startGame(): void {
        document.getElementById('message-box')!.style.display = 'none';
        this.state = 'RACING';
        this.startTime = Date.now();
    }

    private showMessage(title: string, content: string): void {
        const messageBox = document.getElementById('message-box');
        if (!messageBox) return;

        document.getElementById('message-title')!.textContent = title;
        document.getElementById('message-content')!.innerHTML = content;
        const startButton = document.getElementById('start-button') as HTMLButtonElement;
        startButton.style.display = this.state === 'INITIAL' ? 'block' : 'none';
        messageBox.style.display = 'block';
    }

    private showResults(): void {
        const title = this.playerCar.rank === 1 ? "🎉 우승! 🎉" : `${this.playerCar.rank}위로 완주`;
        
        let content = "<table class='min-w-full divide-y divide-gray-700 mt-4'>";
        content += "<thead class='bg-gray-700'><tr><th class='p-3'>순위</th><th class='p-3'>이름</th><th class='p-3'>완주 시간</th></tr></thead><tbody class='divide-y divide-gray-700'>";
        
        this.rankings.forEach((car, index) => {
            const time = car.raceFinishTime ? formatTime(car.raceFinishTime - this.startTime) : '--';
            const rowClass = car.isPlayer ? 'bg-blue-800/50 font-bold' : '';
            content += `<tr class='${rowClass}'>
                <td class='p-3'>${index + 1}</td>
                <td class='p-3'>${car.name}</td>
                <td class='p-3'>${time}</td>
            </tr>`;
        });
        content += "</tbody></table>";
        
        this.showMessage(title, content);
    }

    private onWindowResize(): void {
        const container = document.getElementById('game-container');
        if (container) {
            this.camera.aspect = container.clientWidth / container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(container.clientWidth, container.clientHeight);
        }
    }

    private animate(): void {
        requestAnimationFrame(this.animate.bind(this));

        const deltaTime = 1 / 60; 

        this.world.step(deltaTime);

        this.players.forEach(car => {
            if (this.state === 'RACING' && car.isPlayer) {
                car.updateControls(deltaTime);
            } else if (this.state === 'RACING' && car.isAI) {
                car.updateAI(this.track.waypoints, deltaTime);
            }
            car.updatePhysics(deltaTime);
        });

        this.updateCamera();
        this.renderer.render(this.scene, this.camera);

        if (this.state === 'RACING') {
            this.updateRaceState(deltaTime);
            this.updateItems(deltaTime);
        }
    }
}

// ====================================================================
// 6. 브라우저 환경에서 실행을 위한 초기화 (트랜스파일 후 실행될 코드)
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 이 코드는 트랜스파일된 후 실행되므로, window 객체에 접근하여 게임 인스턴스를 저장합니다.
    (window as any).game = new RacingGame('game-container');
});
