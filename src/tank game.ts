// // game.ts (단일 TypeScript 파일)
// // Canvas 및 Context 설정
// const canvas = document.createElement('canvas');
// canvas.id = 'gameCanvas';
// document.body.appendChild(canvas);
// const ctx = canvas.getContext('2d')!;
// // 게임 화면 크기
// const GAME_WIDTH = 1000;
// const GAME_HEIGHT = 600;
// canvas.width = GAME_WIDTH;
// canvas.height = GAME_HEIGHT;
// // --- 게임 상태 Enum ---
// enum GAME_STATE {
//     IDLE,
//     PLAYER_TURN,
//     PLAYER_CHARGING,
//     PROJECTILE_FLYING,
//     EXPLODING,
//     AI_TURN,
//     GAME_OVER
// }
// let gameState: GAME_STATE = GAME_STATE.IDLE;
// // --- 상수 정의 ---
// const GRAVITY = 0.3; // 중력 값
// const TANK_WIDTH = 50;
// const TANK_HEIGHT = 30;
// const TURRET_LENGTH = 30;
// const TANK_SPEED = 2; // 턴당 탱크 이동 속도
// const TURRET_SPEED = 1; // 포탑 각도 조절 속도 (도 단위)
// const PROJECTILE_RADIUS = 5;
// const PROJECTILE_BASE_SPEED = 15; // 포탄 기본 속도
// const PROJECTILE_MAX_SPEED_MULTIPLIER = 2; // 최대 파워 시 기본 속도 대비 배율
// const PROJECTILE_SPEED_CHARGE_RATE = 0.05; // 스페이스바 누를 시 파워 충전 속도
// const EXPLOSION_RADIUS = 40; // 폭발 반경
// const DAMAGE_RADIUS = 50; // 피해를 입히는 반경
// const CRATER_DEPTH = 15; // 분화구 깊이
// const MAX_HP = 100;
// const AI_ERROR_MARGIN_ANGLE = 5; // AI 조준 오차 (도)
// const AI_ERROR_MARGIN_POWER = 0.1; // AI 발사 파워 오차 (비율)
// const AI_MOVE_DISTANCE = 30; // AI가 지형 때문에 이동하는 거리
// const UI_BAR_HEIGHT = 40;
// const MESSAGE_BOX_WIDTH = 300;
// const MESSAGE_BOX_HEIGHT = 150;
// const SKY_COLOR = '#87CEEB'; // 밝은 파란색 하늘
// const GROUND_COLOR = '#8B4513'; // 갈색 땅
// const PLAYER_COLOR = 'blue';
// const AI_COLOR = 'red';
// const PROJECTILE_COLOR = 'black';
// const UI_BAR_COLOR = 'black';
// const MESSAGE_BOX_COLOR = 'rgba(0, 0, 0, 0.7)'; // 반투명 검은색
// // --- 유틸리티 함수 ---
// function clamp(value: number, min: number, max: number): number {
//     return Math.max(min, Math.min(value, max));
// }
// function getRandomNumber(min: number, max: number): number {
//     return Math.random() * (max - min) + min;
// }
// // --- Vector2D 클래스 ---
// class Vector2D {
//     constructor(public x: number, public y: number) {}
//     add(other: Vector2D): Vector2D {
//         return new Vector2D(this.x + other.x, this.y + other.y);
//     }
//     subtract(other: Vector2D): Vector2D {
//         return new Vector2D(this.x - other.x, this.y - other.y);
//     }
//     multiply(scalar: number): Vector2D {
//         return new Vector2D(this.x * scalar, this.y * scalar);
//     }
//     magnitude(): number {
//         return Math.sqrt(this.x * this.x + this.y * this.y);
//     }
//     normalize(): Vector2D {
//         const mag = this.magnitude();
//         return mag === 0 ? new Vector2D(0, 0) : new Vector2D(this.x / mag, this.y / mag);
//     }
// }
// // --- Terrain 클래스 ---
// class Terrain {
//     points: Vector2D[] = [];
//     constructor() {
//         this.generate();
//     }
//     generate() {
//         this.points = [];
//         const numSegments = GAME_WIDTH / 5; // 5px 간격으로 지형 포인트 생성
//         const baseHeight = GAME_HEIGHT - 100; // 땅의 기본 높이
//         const roughness = 30; // 지형의 울퉁불퉁함 정도
//         // 초기 지형 생성
//         for (let i = 0; i < numSegments; i++) {
//             const x = i * (GAME_WIDTH / numSegments);
//             let y = baseHeight + Math.sin(x / 50) * roughness + getRandomNumber(-10, 10);
//             this.points.push(new Vector2D(x, y));
//         }
//         // 양쪽 끝을 화면 바닥으로 고정
//         this.points[0].y = GAME_HEIGHT - 50;
//         this.points[this.points.length - 1].y = GAME_HEIGHT - 50;
//     }
//     draw() {
//         ctx.fillStyle = GROUND_COLOR;
//         ctx.beginPath();
//         ctx.moveTo(0, GAME_HEIGHT);
//         for (const p of this.points) {
//             ctx.lineTo(p.x, p.y);
//         }
//         ctx.lineTo(GAME_WIDTH, GAME_HEIGHT);
//         ctx.closePath();
//         ctx.fill();
//     }
//     getGroundY(x: number): number {
//         if (x < 0 || x >= GAME_WIDTH) return GAME_HEIGHT;
//         // 보간법으로 정확한 Y 값 찾기
//         const segmentWidth = GAME_WIDTH / (this.points.length - 1);
//         const index = Math.floor(x / segmentWidth);
//         const p1 = this.points[index];
//         const p2 = this.points[index + 1];
//         if (!p1 || !p2) return GAME_HEIGHT; // 경계 밖이면 화면 바닥으로 간주
//         const t = (x - p1.x) / (p2.x - p1.x);
//         return p1.y * (1 - t) + p2.y * t;
//     }
//     createCrater(x: number, y: number, radius: number) {
//         for (let i = 0; i < this.points.length; i++) {
//             const pointX = this.points[i].x;
//             const dist = Math.abs(pointX - x);
//             if (dist < radius) {
//                 // 거리에 따라 깊이가 줄어드는 분화구
//                 const depthFactor = 1 - (dist / radius); // 0 (가장자리) ~ 1 (중심)
//                 this.points[i].y += CRATER_DEPTH * depthFactor;
//                 this.points[i].y = clamp(this.points[i].y, GAME_HEIGHT - 200, GAME_HEIGHT); // 너무 깊게 파이지 않도록
//             }
//         }
//     }
// }
// // --- Projectile 클래스 ---
// class Projectile {
//     pos: Vector2D;
//     vel: Vector2D;
//     shooter: Tank;
//     trail: Vector2D[] = [];
//     isFlying: boolean = false;
//     explosionStarted: boolean = false;
//     constructor(x: number, y: number, angle: number, power: number, shooter: Tank) {
//         this.pos = new Vector2D(x, y);
//         // 각도를 라디안으로 변환하여 속도 계산 (angle은 0도가 오른쪽, 90도가 위쪽)
//         const radAngle = angle * (Math.PI / 180);
//         this.vel = new Vector2D(
//             Math.cos(radAngle) * power,
//             -Math.sin(radAngle) * power // Y축은 위로 갈수록 작아지므로 음수
//         );
//         this.shooter = shooter;
//         this.isFlying = true;
//         this.trail.push(new Vector2D(x, y));
//     }
//     update(deltaTime: number, terrain: Terrain, tanks: Tank[]) {
//         if (!this.isFlying) return;
//         // 물리 업데이트
//         this.vel.y += GRAVITY;
//         this.pos.x += this.vel.x;
//         this.pos.y += this.vel.y;
//         // 궤적 업데이트 (짧은 흰색 선)
//         this.trail.push(new Vector2D(this.pos.x, this.pos.y));
//         if (this.trail.length > 5) { // 궤적 길이 제한
//             this.trail.shift();
//         }
//         // 지형 충돌
//         if (this.pos.y >= terrain.getGroundY(this.pos.x)) {
//             this.explode(terrain, tanks);
//             return;
//         }
//         // 화면 밖으로 나가는 경우
//         if (this.pos.x < -PROJECTILE_RADIUS || this.pos.x > GAME_WIDTH + PROJECTILE_RADIUS || this.pos.y > GAME_HEIGHT + PROJECTILE_RADIUS) {
//             this.isFlying = false;
//             nextTurn();
//             return;
//         }
//         // 탱크 충돌
//         for (const tank of tanks) {
//             if (tank === this.shooter || tank.isDestroyed()) continue;
//             const tankCenter = new Vector2D(tank.pos.x + TANK_WIDTH / 2, tank.pos.y + TANK_HEIGHT / 2);
//             const distance = this.pos.subtract(tankCenter).magnitude();
//             if (distance < TANK_WIDTH / 2 + PROJECTILE_RADIUS) { // 탱크와 포탄이 겹치는지 간단히 확인
//                 this.explode(terrain, tanks);
//                 return;
//             }
//         }
//     }
//     draw() {
//         // 포탄 그리기
//         ctx.fillStyle = PROJECTILE_COLOR;
//         ctx.beginPath();
//         ctx.arc(this.pos.x, this.pos.y, PROJECTILE_RADIUS, 0, Math.PI * 2);
//         ctx.fill();
//         // 궤적 그리기
//         if (this.trail.length > 1) {
//             ctx.strokeStyle = 'white';
//             ctx.lineWidth = 1;
//             ctx.beginPath();
//             ctx.moveTo(this.trail[0].x, this.trail[0].y);
//             for (let i = 1; i < this.trail.length; i++) {
//                 ctx.lineTo(this.trail[i].x, this.trail[i].y);
//             }
//             ctx.stroke();
//         }
//     }
//     explode(terrain: Terrain, tanks: Tank[]) {
//         this.isFlying = false;
//         if (!this.explosionStarted) {
//             this.explosionStarted = true;
//             handleExplosion(this.pos, terrain, tanks);
//         }
//     }
// }
// // --- Tank 클래스 (기본) ---
// class Tank {
//     pos: Vector2D;
//     hp: number;
//     color: string;
//     turretAngle: number = 45; // 0도: 오른쪽, 90도: 위쪽 (도 단위)
//     turretPower: number = 0; // 발사 파워 (0~1)
//     isPlayer: boolean;
//     moveDistanceLeft: number; // 턴당 이동 가능한 거리
//     constructor(x: number, y: number, color: string, isPlayer: boolean) {
//         this.pos = new Vector2D(x, y);
//         this.hp = MAX_HP;
//         this.color = color;
//         this.isPlayer = isPlayer;
//         this.moveDistanceLeft = 0;
//     }
//     draw(isActiveTurn: boolean) {
//         // 몸체
//         ctx.fillStyle = this.color;
//         ctx.fillRect(this.pos.x, this.pos.y, TANK_WIDTH, TANK_HEIGHT);
//         // 포탑
//         ctx.save();
//         ctx.translate(this.pos.x + TANK_WIDTH / 2, this.pos.y + TANK_HEIGHT / 4);
//         ctx.rotate(-this.turretAngle * (Math.PI / 180)); // 각도에 따라 회전
//         ctx.fillRect(0, -5, TURRET_LENGTH, 10); // 포탑 몸체
//         ctx.restore();
//         // 체력 바
//         const hpBarWidth = TANK_WIDTH;
//         const hpBarHeight = 5;
//         const hpBarY = this.pos.y - 10;
//         ctx.fillStyle = 'gray';
//         ctx.fillRect(this.pos.x, hpBarY, hpBarWidth, hpBarHeight);
//         ctx.fillStyle = 'lime';
//         ctx.fillRect(this.pos.x, hpBarY, (this.hp / MAX_HP) * hpBarWidth, hpBarHeight);
//         // 턴 표시 (노란색 화살표)
//         if (isActiveTurn) {
//             ctx.fillStyle = 'yellow';
//             ctx.beginPath();
//             ctx.moveTo(this.pos.x + TANK_WIDTH / 2, this.pos.y - 25);
//             ctx.lineTo(this.pos.x + TANK_WIDTH / 2 - 10, this.pos.y - 15);
//             ctx.lineTo(this.pos.x + TANK_WIDTH / 2 + 10, this.pos.y - 15);
//             ctx.closePath();
//             ctx.fill();
//         }
//     }
//     move(direction: number, terrain: Terrain) { // direction: -1 (left), 1 (right)
//         if (this.moveDistanceLeft <= 0) return;
//         const originalX = this.pos.x;
//         this.pos.x = clamp(this.pos.x + direction * TANK_SPEED, 0, GAME_WIDTH - TANK_WIDTH);
//         this.pos.y = terrain.getGroundY(this.pos.x + TANK_WIDTH / 2) - TANK_HEIGHT; // 지형에 맞춰 Y 위치 조정
//         this.moveDistanceLeft -= Math.abs(this.pos.x - originalX);
//         if (this.moveDistanceLeft < 0) this.moveDistanceLeft = 0; // 혹시라도 음수가 되는 경우 방지
//     }
//     adjustTurret(direction: number) { // direction: -1 (down), 1 (up)
//         this.turretAngle = clamp(this.turretAngle + direction * TURRET_SPEED, 0, 90); // 0도 ~ 90도
//     }
//     takeDamage(amount: number) {
//         this.hp -= amount;
//         if (this.hp < 0) this.hp = 0;
//     }
//     isDestroyed(): boolean {
//         return this.hp <= 0;
//     }
//     getTurretTipPos(): Vector2D {
//         const turretBaseX = this.pos.x + TANK_WIDTH / 2;
//         const turretBaseY = this.pos.y + TANK_HEIGHT / 4;
//         const radAngle = this.turretAngle * (Math.PI / 180);
//         return new Vector2D(
//             turretBaseX + Math.cos(radAngle) * TURRET_LENGTH,
//             turretBaseY - Math.sin(radAngle) * TURRET_LENGTH
//         );
//     }
// }
// // --- PlayerTank 클래스 ---
// class PlayerTank extends Tank {
//     constructor(x: number, y: number, terrain: Terrain) {
//         super(x, terrain.getGroundY(x + TANK_WIDTH / 2) - TANK_HEIGHT, PLAYER_COLOR, true);
//     }
// }
// // --- AITank 클래스 ---
// class AITank extends Tank {
//     constructor(x: number, y: number, terrain: Terrain) {
//         super(x, terrain.getGroundY(x + TANK_WIDTH / 2) - TANK_HEIGHT, AI_COLOR, false);
//         this.turretAngle = getRandomNumber(30, 60); // AI 초기 각도 랜덤 설정
//     }
//     // AI 조준 및 발사 로직
//     aimAndFire(playerTankPos: Vector2D, terrain: Terrain): Promise<void> {
//         return new Promise(resolve => {
//             // AI가 즉시 발사하지 않고 약간의 지연을 둠
//             setTimeout(() => {
//                 // 목표 지점 (플레이어 탱크의 대략적인 중앙)
//                 const targetX = playerTankPos.x + TANK_WIDTH / 2;
//                 const targetY = playerTankPos.y + TANK_HEIGHT / 2;
//                 // AI 탱크의 현재 포탑 위치
//                 const turretTip = this.getTurretTipPos();
//                 // 1. 지형 장애물 확인 및 이동
//                 const distToPlayer = Math.abs(targetX - turretTip.x);
//                 let obstructed = false;
//                 for (let i = Math.min(turretTip.x, targetX); i < Math.max(turretTip.x, targetX); i += 10) {
//                     if (terrain.getGroundY(i) < targetY - 20) { // 플레이어보다 높은 지형이 있다면
//                         obstructed = true;
//                         break;
//                     }
//                 }
//                 if (obstructed && this.moveDistanceLeft > 0) {
//                     // 장애물이 있다면 플레이어와 반대 방향으로 이동 (오른쪽에 있다면 왼쪽으로, 왼쪽에 있다면 오른쪽으로)
//                     const moveDirection = (targetX > turretTip.x) ? -1 : 1;
//                     this.move(moveDirection, terrain);
//                     this.moveDistanceLeft = 0; // 한 턴에 한 번만 이동
//                     // 이동 후 다시 조준 시도 (재귀 호출 또는 상태 변경)
//                     // 여기서는 간단히 이동 후 다음 턴으로 넘어가게 합니다.
//                     console.log('AI moved due to obstruction.');
//                     // AI 턴 종료 (다시 다음 턴으로)
//                     resolve();
//                     return;
//                 }
//                 // 2. 조준 계산 (단순화된 방식: 고정된 파워로 최적 각도 찾기)
//                 // 실제 탄도 계산은 복잡하므로, 여기서는 몇 번의 시뮬레이션을 통해 근사치를 찾습니다.
//                 let bestAngle = 0;
//                 let bestPower = 0;
//                 let minDistance = Infinity;
//                 const testAngles: number[] = [];
//                 for (let i = 15; i <= 85; i += 5) testAngles.push(i); // 15도에서 85도까지 테스트
//                 for (const angle of testAngles) {
//                     // 고정된 파워로 계산 (AI마다 약간 다르게 설정 가능)
//                     const testPower = getRandomNumber(PROJECTILE_BASE_SPEED * 1.2, PROJECTILE_BASE_SPEED * PROJECTILE_MAX_SPEED_MULTIPLIER * 0.9);
//                     const radAngle = angle * (Math.PI / 180);
//                     let simVelX = Math.cos(radAngle) * testPower;
//                     let simVelY = -Math.sin(radAngle) * testPower;
//                     let simX = turretTip.x;
//                     let simY = turretTip.y;
//                     for (let t = 0; t < 200; t++) { // 짧은 시뮬레이션
//                         simVelY += GRAVITY;
//                         simX += simVelX;
//                         simY += simVelY;
//                         if (simY >= terrain.getGroundY(simX)) { // 땅에 닿으면
//                             const dist = Math.abs(simX - targetX);
//                             if (dist < minDistance) {
//                                 minDistance = dist;
//                                 bestAngle = angle;
//                                 bestPower = testPower;
//                             }
//                             break;
//                         }
//                         if (simX < 0 || simX > GAME_WIDTH || simY > GAME_HEIGHT) break; // 화면 밖
//                     }
//                 }
//                 if (bestAngle === 0) { // 최적 각도를 찾지 못했을 경우 기본값 설정
//                     bestAngle = getRandomNumber(30, 60);
//                     bestPower = getRandomNumber(PROJECTILE_BASE_SPEED * 1.5, PROJECTILE_BASE_SPEED * PROJECTILE_MAX_SPEED_MULTIPLIER);
//                 }
//                 // 3. 오차 적용
//                 bestAngle += getRandomNumber(-AI_ERROR_MARGIN_ANGLE, AI_ERROR_MARGIN_ANGLE);
//                 bestPower *= getRandomNumber(1 - AI_ERROR_MARGIN_POWER, 1 + AI_ERROR_MARGIN_POWER);
//                 this.turretAngle = clamp(bestAngle, 0, 90);
//                 // --- 수정 시작 ---
//                 const calculatedTurretPower: number = bestPower / PROJECTILE_BASE_SPEED; // 0~1 스케일로 변환
//                 this.turretPower = calculatedTurretPower;
//                 // 발사
//                 fireProjectile(this.turretAngle, calculatedTurretPower as number, this);
//                 // --- 수정 끝 ---
//                 resolve();
//             }, getRandomNumber(500, 1500)); // AI가 생각하는 시간
//         });
//     }
// }
// // --- 게임 변수 ---
// let terrain: Terrain;
// let playerTank: PlayerTank;
// let aiTanks: AITank[] = [];
// let allTanks: Tank[] = []; // 플레이어와 AI 탱크 모두 포함
// let currentProjectile: Projectile | null = null;
// let currentTurnIndex: number = 0;
// let lastTime: number = 0;
// let powerGaugeValue: number = 0; // 0 (min) ~ 1 (max)
// let powerGaugeVisible: boolean = false;
// let gameOverMessage: string = '';
// let messageBoxVisible: boolean = false;
// // --- 키 입력 관리 ---
// const keys: { [key: string]: boolean } = {};
// window.addEventListener('keydown', (e) => {
//     keys[e.code] = true;
// });
// window.addEventListener('keyup', (e) => {
//     keys[e.code] = false;
//     if (e.code === 'Space' && gameState === GAME_STATE.PLAYER_CHARGING) {
//         fireProjectile(playerTank.turretAngle, playerTank.turretPower, playerTank);
//     }
// });
// // --- 게임 초기화 ---
// function initGame() {
//     terrain = new Terrain();
//     // 플레이어 탱크 생성 (왼쪽)
//     playerTank = new PlayerTank(50, 0, terrain);
//     // 컴퓨터 탱크 생성 (오른쪽, 여러 대)
//     aiTanks = [];
//     const numAiTanks = getRandomNumber(2, 4); // 2~4대
//     for (let i = 0; i < numAiTanks; i++) {
//         const xPos = GAME_WIDTH - (TANK_WIDTH + 50) - (i * (TANK_WIDTH + 70));
//         aiTanks.push(new AITank(xPos, 0, terrain));
//     }
//     allTanks = [playerTank, ...aiTanks];
//     // 모든 탱크의 Y 위치를 지형에 맞게 조정
//     allTanks.forEach(tank => {
//         tank.pos.y = terrain.getGroundY(tank.pos.x + TANK_WIDTH / 2) - TANK_HEIGHT;
//     });
//     currentProjectile = null;
//     currentTurnIndex = 0;
//     gameState = GAME_STATE.PLAYER_TURN; // 플레이어 턴으로 시작
//     powerGaugeValue = 0;
//     powerGaugeVisible = false;
//     gameOverMessage = '';
//     messageBoxVisible = false;
//     console.log('Game Initialized. Player Turn.');
//     playerTank.moveDistanceLeft = TANK_WIDTH; // 턴당 이동 거리 초기화
// }
// // --- 포탄 발사 ---
// function fireProjectile(angle: number, power: number, shooter: Tank) {
//     if (currentProjectile) return; // 이미 발사된 포탄이 있다면 무시
//     const turretTip = shooter.getTurretTipPos();
//     const projectileSpeed = PROJECTILE_BASE_SPEED * power * PROJECTILE_MAX_SPEED_MULTIPLIER;
//     currentProjectile = new Projectile(turretTip.x, turretTip.y, angle, projectileSpeed, shooter);
//     gameState = GAME_STATE.PROJECTILE_FLYING;
//     powerGaugeVisible = false;
//     playerTank.turretPower = 0; // 발사 후 파워 초기화
//     console.log(`${shooter.isPlayer ? 'Player' : 'AI'} fired with angle ${angle.toFixed(1)} and power ${power.toFixed(2)}`);
// }
// // --- 폭발 처리 ---
// function handleExplosion(pos: Vector2D, terrain: Terrain, tanks: Tank[]) {
//     // 분화구 생성
//     terrain.createCrater(pos.x, pos.y, EXPLOSION_RADIUS);
//     // 탱크 피해 처리
//     for (const tank of tanks) {
//         if (tank.isDestroyed()) continue;
//         const tankCenter = new Vector2D(tank.pos.x + TANK_WIDTH / 2, tank.pos.y + TANK_HEIGHT / 2);
//         const distance = pos.subtract(tankCenter).magnitude();
//         if (distance < DAMAGE_RADIUS) {
//             // 거리에 비례하여 피해량 계산
//             const damage = Math.max(0, MAX_HP * (1 - (distance / DAMAGE_RADIUS)) * 0.5); // 최대 HP의 절반까지 피해
//             tank.takeDamage(damage);
//             console.log(`${tank.isPlayer ? 'Player' : 'AI'} Tank took ${damage.toFixed(1)} damage. HP: ${tank.hp}`);
//         }
//     }
//     // 모든 탱크의 Y 위치를 지형에 맞게 조정 (폭발로 인해 땅이 파였을 경우)
//     allTanks.forEach(tank => {
//         if (!tank.isDestroyed()) {
//              tank.pos.y = terrain.getGroundY(tank.pos.x + TANK_WIDTH / 2) - TANK_HEIGHT;
//         }
//     });
//     gameState = GAME_STATE.EXPLODING; // 잠시 폭발 상태 유지 (애니메이션 처리 예정)
//     setTimeout(() => {
//         currentProjectile = null; // 포탄 제거
//         checkWinLose(); // 승패 확인
//         if (gameState !== GAME_STATE.GAME_OVER) {
//             nextTurn(); // 다음 턴으로
//         }
//     }, 500); // 0.5초 후 폭발 효과 종료
// }
// // --- 승리/패배 조건 확인 ---
// function checkWinLose() {
//     const aliveAiTanks = aiTanks.filter(tank => !tank.isDestroyed());
//     if (playerTank.isDestroyed()) {
//         gameOverMessage = '패배했습니다!';
//         messageBoxVisible = true;
//         gameState = GAME_STATE.GAME_OVER;
//     } else if (aliveAiTanks.length === 0) {
//         gameOverMessage = '승리했습니다!';
//         messageBoxVisible = true;
//         gameState = GAME_STATE.GAME_OVER;
//     }
// }
// // --- 다음 턴으로 넘어가기 ---
// function nextTurn() {
//     if (gameState === GAME_STATE.GAME_OVER) return;
//     // 파괴된 탱크는 턴에서 제외
//     allTanks = [playerTank, ...aiTanks].filter(tank => !tank.isDestroyed());
//     if (allTanks.length === 0) { // 모든 탱크가 파괴되면 (플레이어도 파괴된 경우)
//          checkWinLose(); // 다시 승패 확인
//          return;
//     }
//     currentTurnIndex = (currentTurnIndex + 1) % allTanks.length;
//     let activeTank = allTanks[currentTurnIndex];
//     // 파괴된 탱크는 턴을 넘김
//     while (activeTank.isDestroyed()) {
//         currentTurnIndex = (currentTurnIndex + 1) % allTanks.length;
//         activeTank = allTanks[currentTurnIndex];
//         // 무한 루프 방지 (모든 탱크가 파괴될 경우)
//         if (allTanks.every(t => t.isDestroyed())) {
//             checkWinLose();
//             return;
//         }
//     }
//     if (activeTank.isPlayer) {
//         gameState = GAME_STATE.PLAYER_TURN;
//         playerTank.moveDistanceLeft = TANK_WIDTH; // 턴당 이동 거리 초기화
//         console.log('Player Turn.');
//     } else {
//         gameState = GAME_STATE.AI_TURN;
//         activeTank.moveDistanceLeft = TANK_WIDTH; // 턴당 이동 거리 초기화
//         console.log('AI Turn:', activeTank.color);
//         // AI 자동 조준 및 발사
//         (activeTank as AITank).aimAndFire(playerTank.pos, terrain).then(() => {
//             // AI가 발사까지 완료하면 다음 턴으로 넘어가도록 (fireProjectile에서 PROJECTILE_FLYING으로 바뀜)
//             // 만약 AI가 이동만 하고 발사하지 않았다면, 여기에서 다음 턴으로 바로 넘어감.
//             if (gameState === GAME_STATE.AI_TURN) {
//                  nextTurn(); // AI가 이동만 하고 발사는 안했을 경우
//             }
//         });
//     }
// }
// // --- 게임 루프 ---
// function gameLoop(currentTime: number) {
//     const deltaTime = (currentTime - lastTime) / 1000; // 초 단위
//     lastTime = currentTime;
//     // --- 업데이트 ---
//     if (gameState === GAME_STATE.PLAYER_TURN || gameState === GAME_STATE.PLAYER_CHARGING) {
//         // 플레이어 탱크 조작
//         if (keys['ArrowLeft']) {
//             playerTank.move(-1, terrain);
//         }
//         if (keys['ArrowRight']) {
//             playerTank.move(1, terrain);
//         }
//         if (keys['ArrowUp']) {
//             playerTank.adjustTurret(1);
//         }
//         if (keys['ArrowDown']) {
//             playerTank.adjustTurret(-1);
//         }
//         // 발사 파워 충전
//         if (keys['Space']) {
//             gameState = GAME_STATE.PLAYER_CHARGING;
//             powerGaugeVisible = true;
//             playerTank.turretPower = clamp(playerTank.turretPower + PROJECTILE_SPEED_CHARGE_RATE, 0, 1);
//             powerGaugeValue = playerTank.turretPower;
//         } else if (gameState === GAME_STATE.PLAYER_CHARGING) {
//             // 스페이스바를 뗌, 하지만 이미 keyup 이벤트에서 발사 처리가 됨
//         }
//     }
//     // 포탄 비행 중 업데이트
//     if (gameState === GAME_STATE.PROJECTILE_FLYING && currentProjectile) {
//         currentProjectile.update(deltaTime, terrain, allTanks);
//     }
//     // --- 그리기 ---
//     // 배경
//     ctx.fillStyle = SKY_COLOR;
//     ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
//     // 지형
//     terrain.draw();
//     // 탱크들 그리기
//     for (let i = 0; i < allTanks.length; i++) {
//         const tank = allTanks[i];
//         if (!tank.isDestroyed()) {
//             tank.draw(i === currentTurnIndex);
//         }
//     }
//     // 포탄 그리기
//     if (currentProjectile) {
//         currentProjectile.draw();
//     }
//     // UI 그리기
//     drawUI();
//     requestAnimationFrame(gameLoop);
// }
// // --- UI 그리기 ---
// function drawUI() {
//     // UI 바 (맨 아래 검은색 막대)
//     ctx.fillStyle = UI_BAR_COLOR;
//     ctx.fillRect(0, GAME_HEIGHT - UI_BAR_HEIGHT, GAME_WIDTH, UI_BAR_HEIGHT);
//     // 발사 파워 게이지 (플레이어 턴일 때만)
//     if (powerGaugeVisible && gameState === GAME_STATE.PLAYER_CHARGING || gameState === GAME_STATE.PLAYER_TURN) {
//         const gaugeWidth = 200;
//         const gaugeHeight = 20;
//         const gaugeX = (GAME_WIDTH - gaugeWidth) / 2;
//         const gaugeY = GAME_HEIGHT - UI_BAR_HEIGHT + (UI_BAR_HEIGHT - gaugeHeight) / 2;
//         ctx.strokeStyle = 'white';
//         ctx.lineWidth = 2;
//         ctx.strokeRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);
//         // 게이지 색상 변경 (초록 -> 노랑 -> 빨강)
//         let fillColor;
//         if (powerGaugeValue < 0.33) {
//             fillColor = 'lime';
//         } else if (powerGaugeValue < 0.66) {
//             fillColor = 'yellow';
//         } else {
//             fillColor = 'red';
//         }
//         ctx.fillStyle = fillColor;
//         ctx.fillRect(gaugeX, gaugeY, gaugeWidth * powerGaugeValue, gaugeHeight);
//     }
//     // 메시지 상자 (게임 오버 시)
//     if (messageBoxVisible) {
//         const msgBoxX = (GAME_WIDTH - MESSAGE_BOX_WIDTH) / 2;
//         const msgBoxY = (GAME_HEIGHT - MESSAGE_BOX_HEIGHT) / 2;
//         ctx.fillStyle = MESSAGE_BOX_COLOR;
//         ctx.fillRect(msgBoxX, msgBoxY, MESSAGE_BOX_WIDTH, MESSAGE_BOX_HEIGHT);
//         ctx.strokeStyle = 'white';
//         ctx.lineWidth = 2;
//         ctx.strokeRect(msgBoxX, msgBoxY, MESSAGE_BOX_WIDTH, MESSAGE_BOX_HEIGHT);
//         ctx.fillStyle = 'white';
//         ctx.font = '24px Arial';
//         ctx.textAlign = 'center';
//         ctx.textBaseline = 'middle';
//         ctx.fillText(gameOverMessage, msgBoxX + MESSAGE_BOX_WIDTH / 2, msgBoxY + MESSAGE_BOX_HEIGHT / 3);
//         // 다시 시작 버튼
//         const buttonWidth = 120;
//         const buttonHeight = 40;
//         const buttonX = msgBoxX + (MESSAGE_BOX_WIDTH - buttonWidth) / 2;
//         const buttonY = msgBoxY + MESSAGE_BOX_HEIGHT - buttonHeight - 20;
//         ctx.fillStyle = 'gray';
//         ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
//         ctx.strokeStyle = 'white';
//         ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
//         ctx.fillStyle = 'white';
//         ctx.font = '16px Arial';
//         ctx.fillText('다시 시작', buttonX + buttonWidth / 2, buttonY + buttonHeight / 2);
//         // "다시 시작" 버튼 클릭 이벤트
//         canvas.onclick = (e) => {
//             const rect = canvas.getBoundingClientRect();
//             const mouseX = e.clientX - rect.left;
//             const mouseY = e.clientY - rect.top;
//             if (mouseX > buttonX && mouseX < buttonX + buttonWidth &&
//                 mouseY > buttonY && mouseY < buttonY + buttonHeight) {
//                 initGame();
//                 canvas.onclick = null; // 이벤트 핸들러 제거
//             }
//         };
//     }
// }
// // 게임 시작
// initGame();
// requestAnimationFrame(gameLoop);
