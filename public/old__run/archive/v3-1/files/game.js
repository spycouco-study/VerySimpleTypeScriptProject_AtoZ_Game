"use strict";
// 플레이어 클래스
class Player_ {
    // <<<<< 스프라이트 관련 추가 끝 >>>>>
    // --- 추가/수정 끝 ---
    constructor(x, y) {
        this.width = 40;
        this.height = 60;
        this.dy = 0; // Y축 속도
        this.isJumping = false;
        this.onGround = false;
        // --- 추가/수정 시작 ---
        this.jumpCount = 0; // 0: 지상, 1: 첫 점프, 2: 2단 점프
        this.spriteLoaded = false;
        this.SPRITE_SHEET_PATH = 'bear.png'; // 스프라이트 이미지 경로
        this.SPRITE_FRAME_WIDTH = 222; // 단일 스프라이트 프레임의 너비 (666 / 3 = 222)
        this.SPRITE_FRAME_HEIGHT = 222; // 단일 스프라이트 프레임의 높이 (222 / 1 = 222)
        // 2번째와 3번째 이미지만 사용 (0-indexed: 1과 2)
        this.animationFrames = [1, 2];
        this.currentAnimationFrameIndex = 0; // animationFrames 배열 내의 인덱스
        this.animationTimer = 0;
        this.animationFrameDuration = 8; // 각 프레임을 유지할 게임 업데이트 틱 수 (낮을수록 빠름)
        this.x = x;
        this.y = y;
        // <<<<< 스프라이트 로딩 추가 시작 >>>>>
        this.spriteImage = new Image();
        this.spriteImage.onload = () => {
            this.spriteLoaded = true;
        };
        this.spriteImage.onerror = () => {
            console.error(`Failed to load sprite image: ${this.SPRITE_SHEET_PATH}`);
        };
        this.spriteImage.src = this.SPRITE_SHEET_PATH;
        // <<<<< 스프라이트 로딩 추가 끝 >>>>>
    }
    // 수정: 플레이어는 이제 순수하게 중력만 적용하고, onGround 상태 및 바닥 충돌 처리는 Game 클래스에서 전적으로 담당합니다.
    update(GRAVITY) {
        this.dy += GRAVITY;
        this.y += this.dy;
        // onGround 상태는 Game.checkCollisions에서 설정하므로, 여기서 직접 변경하지 않습니다.
        // <<<<< 스프라이트 애니메이션 업데이트 로직 추가 시작 >>>>>
        this.animationTimer++;
        if (this.animationTimer >= this.animationFrameDuration) {
            this.animationTimer = 0;
            this.currentAnimationFrameIndex = (this.currentAnimationFrameIndex + 1) % this.animationFrames.length;
        }
        // <<<<< 스프라이트 애니메이션 업데이트 로직 추가 끝 >>>>>
    }
    jump(JUMP_STRENGTH) {
        // --- 수정 시작 ---
        if (this.onGround) {
            this.dy = -JUMP_STRENGTH;
            this.isJumping = true;
            this.onGround = false; // 점프하면 공중으로 간주
            this.jumpCount = 1; // 첫 점프
        }
        else if (this.isJumping && this.jumpCount < 2) { // 2단 점프 허용
            this.dy = -JUMP_STRENGTH * 0.8; // 2단 점프는 약간 약하게
            this.jumpCount = 2;
        }
        // --- 수정 끝 ---
    }
    draw(ctx, scrollOffset) {
        // <<<<< 기존 ctx.fillRect()를 스프라이트 그리기 로직으로 수정 시작 >>>>>
        if (this.spriteLoaded) {
            const frameIndex = this.animationFrames[this.currentAnimationFrameIndex];
            const sourceX = frameIndex * this.SPRITE_FRAME_WIDTH;
            const sourceY = 8; // 스프라이트 시트가 한 줄이므로 Y는 항상 0 -> 요청에 따라 8로 변경
            ctx.drawImage(this.spriteImage, sourceX, sourceY, this.SPRITE_FRAME_WIDTH, this.SPRITE_FRAME_HEIGHT, this.x, // 플레이어 x는 화면에 고정된 위치 (scrollOffset과 무관)
            this.y, this.width, // 플레이어의 충돌 박스 크기에 맞춰 스프라이트를 스케일
            this.height);
        }
        else {
            // 스프라이트가 로드되지 않았을 경우, 임시로 파란색 사각형을 그립니다.
            ctx.fillStyle = 'blue';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
        // <<<<< 기존 ctx.fillRect()를 스프라이트 그리기 로직으로 수정 끝 >>>>>
    }
    isColliding(other, scrollOffset) {
        const playerWorldX = this.x; // 플레이어 X는 화면 고정
        const otherWorldX = other.x - scrollOffset; // 다른 객체는 스크롤 적용
        return playerWorldX < otherWorldX + other.width &&
            playerWorldX + this.width > otherWorldX &&
            this.y < other.y + other.height &&
            this.y + this.height > other.y;
    }
    // --- 추가 시작 ---
    // jumpCount를 외부에서 안전하게 초기화할 수 있는 public 메서드 추가
    resetJumpCount() {
        this.jumpCount = 0;
    }
}
// 장애물 클래스
class Obstacle {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }
    draw(ctx, scrollOffset) {
        ctx.fillStyle = 'brown';
        ctx.fillRect(this.x - scrollOffset, this.y, this.width, this.height);
    }
    isColliding(other, scrollOffset) {
        // 이 함수는 플레이어에서 호출되므로, 플레이어의 isColliding을 사용하는 것이 더 정확합니다.
        // 여기서는 기본 구현을 제공하지만, 실제 충돌 검사는 플레이어 클래스에서 처리합니다.
        return false;
    }
}
// 적(방해꾼) 클래스
class Enemy {
    constructor(x, y, patrolSpeed = 1, movementRange = 100) {
        this.width = 40;
        this.height = 40;
        this.isAlive = true;
        this.currentDirection = 1; // 1: 오른쪽, -1: 왼쪽
        this.x = x;
        this.y = y;
        this.initialX = x; // 초기 x를 이동 범위의 중심으로 설정
        this.patrolSpeed = patrolSpeed;
        this.movementRange = movementRange;
    }
    // --- 수정 시작 ---
    // 수정: 적이 좌우로 움직이도록 update 메서드 변경, 장애물 충돌 검사 추가
    update(groundY, obstacles, scrollOffset) {
        // 좌우 이동 로직
        this.x += this.currentDirection * this.patrolSpeed;
        // 이동 범위 체크 및 방향 변경
        if (this.currentDirection === 1 && this.x >= this.initialX + this.movementRange / 2) {
            this.currentDirection = -1; // 너무 오른쪽으로 가면 왼쪽으로
            this.x = this.initialX + this.movementRange / 2; // 경계에 정확히 맞춤
        }
        else if (this.currentDirection === -1 && this.x <= this.initialX - this.movementRange / 2) {
            this.currentDirection = 1; // 너무 왼쪽으로 가면 오른쪽으로
            this.x = this.initialX - this.movementRange / 2; // 경계에 정확히 맞춤
        }
        // 장애물과의 충돌 검사 (월드 좌표 사용)
        for (const obs of obstacles) {
            // AABB 충돌 검사 (적의 x, y는 월드 좌표, 장애물의 x, y도 월드 좌표)
            if (this.x < obs.x + obs.width &&
                this.x + this.width > obs.x &&
                this.y < obs.y + obs.height &&
                this.y + this.height > obs.y) {
                // 충돌 감지! 방향 전환
                this.currentDirection *= -1;
                // 장애물 안에서 빠져나오기 위한 위치 조정
                if (this.currentDirection === -1) { // 이전에 오른쪽으로 이동 중이었고, 이제 왼쪽으로 이동 (장애물 왼쪽 면에 부딪힘)
                    this.x = obs.x - this.width - 1; // 장애물 왼쪽 밖으로 적을 이동
                }
                else { // 이전에 왼쪽으로 이동 중이었고, 이제 오른쪽으로 이동 (장애물 오른쪽 면에 부딪힘)
                    this.x = obs.x + obs.width + 1; // 장애물 오른쪽 밖으로 적을 이동
                }
                // 한 프레임에 여러 장애물에 부딪히는 것을 방지하기 위해 첫 충돌 후 루프 종료
                break;
            }
        }
        // 적은 바닥에 고정
        this.y = groundY - this.height;
    }
    // --- 수정 끝 ---
    draw(ctx, scrollOffset) {
        if (this.isAlive) {
            ctx.fillStyle = 'red';
            ctx.fillRect(this.x - scrollOffset, this.y, this.width, this.height);
        }
    }
    isColliding(other, scrollOffset) {
        // 이 함수는 플레이어에서 호출되므로, 플레이어의 isColliding을 사용하는 것이 더 정확합니다.
        return false;
    }
}
// 목표 지점 클래스
class Goal {
    constructor(x, y) {
        this.width = 50;
        this.height = 100;
        this.x = x;
        this.y = y;
    }
    draw(ctx, scrollOffset) {
        ctx.fillStyle = 'green';
        ctx.fillRect(this.x - scrollOffset, this.y, this.width, this.height);
        ctx.fillStyle = 'white';
        ctx.font = '20px Arial';
        ctx.fillText('GOAL!', this.x - scrollOffset + 5, this.y + this.height / 2);
    }
    isColliding(other, scrollOffset) {
        return false;
    }
}
// 버블 이펙트 클래스
class BubbleEffect {
    constructor(x, y, image, width = 40, height = 40, lifetime = 40) {
        this.currentFrame = 0;
        this.x = x;
        this.y = y;
        this.image = image;
        this.width = width;
        this.height = height;
        this.lifetime = lifetime;
        this.fadeStartFrame = Math.floor(lifetime * 0.5); // 수명 절반이 지나면 페이드 아웃 시작
    }
    draw(ctx, scrollOffset) {
        if (!this.image.complete || this.image.naturalWidth === 0) {
            return; // 이미지가 로드되지 않았으면 그리지 않음
        }
        let alpha = 1;
        if (this.currentFrame >= this.fadeStartFrame) {
            // 페이드 아웃 계산
            alpha = 1 - ((this.currentFrame - this.fadeStartFrame) / (this.lifetime - this.fadeStartFrame));
        }
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha); // 투명도가 0보다 작아지지 않도록 보장
        ctx.drawImage(this.image, this.x - scrollOffset, this.y, this.width, this.height);
        ctx.restore();
    }
    update() {
        this.currentFrame++;
        // 이펙트가 위로 살짝 떠오르는 효과
        this.y -= 0.5; // 프레임당 0.5픽셀씩 위로 이동
        return this.currentFrame >= this.lifetime; // 수명이 다하면 true 반환
    }
}
// --- 추가 끝 ---
class Game {
    // <<< 이펙트 관련 속성 추가 끝 >>>
    // --- 수정 끝 ---
    constructor() {
        this.obstacles = [];
        this.enemies = [];
        this.scrollOffset = 0;
        this.gameSpeed = 3; // 게임 스크롤 속도
        this.GRAVITY = 0.5;
        this.JUMP_STRENGTH = 12;
        this.gameStarted = false;
        this.gameOver = false;
        this.gameWon = false;
        // --- 수정 시작 ---
        // 구름 배열 추가
        this.clouds = [];
        this.CLOUD_PARALLAX_SPEED = 0.3; // 모든 구름에 적용될 고정된 패럴랙스 속도 계수
        // 수정: 랜덤 생성을 위한 상수들 (간격 및 맵 길이 증가)
        this.LEVEL_MAX_X = 9000; // 전체 맵 길이 (기존 7000 -> 9000으로 증가)
        this.MIN_OBSTACLE_WIDTH = 60;
        this.MAX_OBSTACLE_WIDTH = 150;
        this.MIN_OBSTACLE_HEIGHT = 30;
        this.MAX_OBSTACLE_HEIGHT = 100;
        this.MIN_OBSTACLE_GAP = 120; // 장애물 사이 최소 간격 (기존 300 -> 120으로 감소)
        this.MAX_OBSTACLE_GAP = 250; // 장애물 사이 최대 간격 (기존 600 -> 250으로 감소)
        this.MIN_ENEMY_PATROL_RANGE = 80;
        this.MAX_ENEMY_PATROL_RANGE = 200;
        this.MIN_ENEMY_SPEED = 0.8;
        this.MAX_ENEMY_SPEED = 2;
        this.MIN_ENEMY_GAP = 150; // 적 사이 최소 간격 (기존 400 -> 150으로 감소)
        this.MAX_ENEMY_GAP = 300; // 적 사이 최대 간격 (기존 800 -> 300으로 감소)
        this.bubbleEffectLoaded = false;
        this.activeEffects = []; // 현재 활성화된 버블 이펙트들을 저장할 배열
        this.canvas = document.getElementById('gameCanvas');
        if (!this.canvas) {
            console.error("Canvas element with ID 'gameCanvas' not found.");
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = 800;
        this.canvas.height = 400;
        this.GROUND_Y = this.canvas.height - 40; // 바닥의 Y 좌표
        this.player = new Player_(this.canvas.width / 4, this.GROUND_Y - 60); // 플레이어 초기 위치
        this.setupLevel();
        // --- 추가 시작 ---
        this.generateClouds(); // 구름 생성
        // <<< 버블 이펙트 이미지 로딩 추가 시작 >>>
        this.bubbleEffectImage = new Image();
        this.bubbleEffectImage.onload = () => {
            this.bubbleEffectLoaded = true;
        };
        this.bubbleEffectImage.onerror = () => {
            console.error("Failed to load bubble effect image: assets/bubble_effect.png");
        };
        this.bubbleEffectImage.src = 'bubble_effect.png';
        // <<< 버블 이펙트 이미지 로딩 추가 끝 >>>
        // --- 추가 끝 ---
        this.addEventListeners();
        this.startGameLoop();
    }
    // 수정: 랜덤 정수를 얻는 헬퍼 함수
    getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    // --- 추가 시작 ---
    // 구름 생성 메서드
    generateClouds() {
        this.clouds = [];
        const numClouds = 8; // 생성할 구름의 수
        for (let i = 0; i < numClouds; i++) {
            this.clouds.push({
                x: this.getRandomInt(0, this.canvas.width),
                y: this.getRandomInt(20, this.canvas.height / 2 - 30),
                width: this.getRandomInt(80, 150),
                height: this.getRandomInt(30, 60),
                // speedFactor: Math.random() * 0.5 + 0.1 // 기존: 무작위 speedFactor
                speedFactor: this.CLOUD_PARALLAX_SPEED // 수정: 고정된 speedFactor 적용
            });
        }
    }
    // --- 추가 끝 ---
    // --- setupLevel 메서드 수정 시작 ---
    setupLevel() {
        this.obstacles = [];
        this.enemies = [];
        let currentX = this.canvas.width + 100; // 플레이어 시작 지점 이후부터 배치 시작
        const GOAL_BUFFER = 200; // 목표 지점 앞에 최소한 확보할 공간
        const effectiveLevelEnd = this.LEVEL_MAX_X - GOAL_BUFFER; // 사물을 배치할 실제 끝 지점
        // effectiveLevelEnd까지 사물을 지속적으로 배치
        while (currentX < effectiveLevelEnd) {
            // 장애물 또는 적 중 하나를 무작위로 선택하여 배치 (장애물 50%, 적 50%)
            const placeObstacle = Math.random() < 0.5;
            if (placeObstacle) {
                const width = this.getRandomInt(this.MIN_OBSTACLE_WIDTH, this.MAX_OBSTACLE_WIDTH);
                const height = this.getRandomInt(this.MIN_OBSTACLE_HEIGHT, this.MAX_OBSTACLE_HEIGHT);
                const y = this.GROUND_Y - height;
                this.obstacles.push(new Obstacle(currentX, y, width, height));
                currentX += width; // 사물 너비만큼 currentX 증가
                // 다음 사물과의 간격 결정
                let gap = this.getRandomInt(this.MIN_OBSTACLE_GAP, this.MAX_OBSTACLE_GAP);
                // gap을 더했을 때 effectiveLevelEnd를 초과하면 gap을 줄임
                if (currentX + gap > effectiveLevelEnd) {
                    gap = Math.max(this.MIN_OBSTACLE_GAP, effectiveLevelEnd - currentX);
                    if (gap <= 0)
                        break; // 더 이상 공간이 없으면 루프 종료
                }
                currentX += gap; // 간격만큼 currentX 증가
            }
            else { // 적 배치
                const patrolSpeed = this.getRandomInt(this.MIN_ENEMY_SPEED * 10, this.MAX_ENEMY_SPEED * 10) / 10;
                const movementRange = this.getRandomInt(this.MIN_ENEMY_PATROL_RANGE, this.MAX_ENEMY_PATROL_RANGE);
                // 적은 바닥에 고정되므로 y는 GROUND_Y - height로 설정
                this.enemies.push(new Enemy(currentX, this.GROUND_Y - 40, patrolSpeed, movementRange));
                currentX += this.enemies[this.enemies.length - 1].width; // 적 너비만큼 currentX 증가
                // 다음 사물과의 간격 결정
                let gap = this.getRandomInt(this.MIN_ENEMY_GAP, this.MAX_ENEMY_GAP);
                // gap을 더했을 때 effectiveLevelEnd를 초과하면 gap을 줄임
                if (currentX + gap > effectiveLevelEnd) {
                    gap = Math.max(this.MIN_ENEMY_GAP, effectiveLevelEnd - currentX);
                    if (gap <= 0)
                        break; // 더 이상 공간이 없으면 루프 종료
                }
                currentX += gap; // 간격만큼 currentX 증가
            }
            // 무한 루프 방지 (안전 장치)
            if (this.obstacles.length + this.enemies.length > 300) { // 객체 최대 수를 200에서 300으로 증가
                console.warn("Too many objects generated, breaking loop to prevent infinite loop.");
                break;
            }
        }
        // 목표 지점 생성: LEVEL_MAX_X 끝에 배치
        this.goal = new Goal(this.LEVEL_MAX_X, this.GROUND_Y - 100);
    }
    // --- setupLevel 메서드 수정 끝 ---
    addEventListeners() {
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
    }
    handleKeyDown(event) {
        if (event.code === 'Space') {
            if (!this.gameStarted && !this.gameOver && !this.gameWon) {
                this.gameStarted = true;
            }
            else if (this.gameOver || this.gameWon) {
                this.resetGame();
            }
            else {
                this.player.jump(this.JUMP_STRENGTH);
            }
        }
    }
    resetGame() {
        this.scrollOffset = 0;
        this.player = new Player_(this.canvas.width / 4, this.GROUND_Y - 60);
        this.setupLevel(); // 레벨 초기화 (장애물, 적 다시 생성)
        // --- 추가 시작 ---
        this.generateClouds(); // 구름도 다시 생성
        this.activeEffects = []; // 이펙트도 초기화
        // --- 추가 끝 ---
        this.gameStarted = false;
        this.gameOver = false;
        this.gameWon = false;
    }
    update() {
        if (!this.gameStarted || this.gameOver || this.gameWon) {
            return;
        }
        // 스크롤 업데이트 (세계가 왼쪽으로 움직이는 효과)
        this.scrollOffset += this.gameSpeed;
        // --- 수정 시작 (구름 위치 업데이트 주석 명확화) ---
        // 구름 위치 업데이트 (패럴랙스 스크롤 및 무한 반복)
        this.clouds.forEach(cloud => {
            // 구름은 플레이어 이동에 맞춰 뒤로 밀리는(왼쪽으로 이동하는) 효과를 줍니다.
            // player가 앞으로 이동하는 만큼 (scrollOffset이 증가하는 만큼)
            // cloud.x는 뒤로 (왼쪽으로) 이동해야 합니다.
            // speedFactor를 곱하여 배경이 전경보다 더 느리게 움직이도록 합니다 (패럴랙스 효과).
            cloud.x -= this.gameSpeed * cloud.speedFactor;
            // 구름이 화면 왼쪽으로 완전히 벗어나면 오른쪽에서 다시 나타나게 하여 무한 스크롤 효과를 줍니다.
            // cloud.x는 이미 패럴랙스 스크롤이 적용된 화면 좌표이므로, 0과 직접 비교합니다.
            if (cloud.x + cloud.width < 0) {
                cloud.x = this.canvas.width + this.getRandomInt(0, 200); // 화면 오른쪽 밖으로 재배치
                cloud.y = this.getRandomInt(20, this.canvas.height / 2 - 30); // Y 위치도 랜덤 조정
                cloud.width = this.getRandomInt(80, 150);
                cloud.height = this.getRandomInt(30, 60);
                // speedFactor: Math.random() * 0.5 + 0.1; // 기존: 재배치 시에도 무작위 speedFactor
                cloud.speedFactor = this.CLOUD_PARALLAX_SPEED; // 수정: 고정된 speedFactor 적용
            }
        });
        // --- 수정 끝 ---
        // <<< 활성 이펙트 업데이트 및 제거 시작 >>>
        const nextActiveEffects = [];
        for (const effect of this.activeEffects) {
            if (!effect.update()) { // 이펙트가 아직 종료되지 않았으면
                nextActiveEffects.push(effect);
            }
        }
        this.activeEffects = nextActiveEffects;
        // <<< 활성 이펙트 업데이트 및 제거 끝 >>>
        // 수정: 플레이어의 onGround 상태를 매 프레임 초기화하고, checkCollisions에서 모든 바닥 충돌을 처리합니다.
        this.player.onGround = false;
        this.player.update(this.GRAVITY); // Player.update는 이제 중력만 적용합니다.
        // 적 업데이트 (죽은 적 제거)
        this.enemies = this.enemies.filter(enemy => enemy.isAlive);
        // --- 수정 시작 ---
        // Enemy.update에 obstacles와 scrollOffset 전달
        this.enemies.forEach(enemy => enemy.update(this.GROUND_Y, this.obstacles, this.scrollOffset));
        // --- 수정 끝 ---
        this.checkCollisions(); // 모든 충돌 검사 및 플레이어 바닥 상태 업데이트
    }
    checkCollisions() {
        // 1. 메인 바닥 (GROUND_Y) 충돌 처리
        if (this.player.y + this.player.height >= this.GROUND_Y) {
            this.player.y = this.GROUND_Y - this.player.height;
            this.player.dy = 0;
            this.player.isJumping = false;
            this.player.onGround = true; // 메인 바닥에 닿았으므로 onGround = true
            // --- 수정 시작 --- (line: 370)
            this.player.resetJumpCount(); // 지면에 닿으면 점프 횟수 초기화
            // --- 수정 끝 ---
        }
        // 2. 수정: 장애물 충돌 - 플레이어가 장애물 위에 올라탈 수 있도록 수정하고, 밟아도 죽지 않도록 변경
        for (const obs of this.obstacles) {
            // 플레이어의 이전 Y 위치를 사용하여 플레이어가 장애물 위로 떨어지는지 확인
            const playerPreviousY = this.player.y - this.player.dy;
            const playerPreviousBottom = playerPreviousY + this.player.height;
            const obstacleTop = obs.y;
            // 플레이어와 장애물이 현재 겹치는지 확인 (AABB 충돌)
            const playerWorldX = this.player.x;
            const obsWorldX = obs.x - this.scrollOffset; // 다른 객체는 스크롤 적용
            const isCurrentlyOverlapping = playerWorldX < obsWorldX + obs.width &&
                playerWorldX + this.player.width > obsWorldX &&
                this.player.y < obs.y + obs.height &&
                this.player.y + this.player.height > obs.y;
            if (isCurrentlyOverlapping) {
                // 플레이어가 하강 중이고, 이전 프레임에는 장애물 위에 있었는데 현재 프레임에는 장애물 상단과 겹치는 경우 (착지)
                // 장애물은 메인 바닥보다 위에 있을 수 있으므로 이 조건이 메인 바닥 조건보다 우선합니다.
                if (this.player.dy >= 0 && // 플레이어가 떨어지거나 정지 상태
                    playerPreviousBottom <= obstacleTop && // 이전에는 장애물 위였거나 같은 높이였음
                    this.player.y + this.player.height > obstacleTop) { // 현재는 장애물 상단과 겹침
                    // 플레이어를 장애물 위에 놓습니다.
                    this.player.y = obstacleTop - this.player.height;
                    this.player.dy = 0; // 수직 이동 중지
                    this.player.isJumping = false;
                    this.player.onGround = true; // 장애물 위에 착지했으므로 onGround = true
                    // --- 수정 시작 --- (line: 398)
                    this.player.resetJumpCount(); // 장애물에 착지하면 점프 횟수 초기화
                    // --- 수정 끝 ---
                    break; // 여러 장애물에 동시에 착지할 수 없으므로 루프 종료
                }
                else {
                    // --- 수정 시작 ---
                    // 착지가 아닌 다른 형태의 충돌 (옆이나 아래에서 부딪힘)은 게임 오버
                    this.gameOver = true;
                    return; // 게임 오버이므로 더 이상의 충돌 검사는 필요 없음
                    // --- 수정 끝 ---
                }
            }
        }
        // 3. 적 충돌 (기존 로직 유지)
        for (const enemy of this.enemies) {
            if (!enemy.isAlive)
                continue;
            if (this.player.isColliding(enemy, this.scrollOffset)) {
                // 플레이어가 적의 위에 떨어지는 경우 (밟기)
                const playerBottom = this.player.y + this.player.height;
                const enemyTop = enemy.y;
                const playerPreviousBottom = (this.player.y - this.player.dy) + this.player.height;
                // 플레이어가 떨어지는 중이고, 이전 프레임에는 적 위에 없었지만 현재 프레임에 적 위에 있다면 밟기
                if (this.player.dy > 0 && playerPreviousBottom <= enemyTop && playerBottom >= enemyTop) {
                    enemy.isAlive = false; // 적 제거
                    this.player.dy = -this.JUMP_STRENGTH * 0.7; // 플레이어 살짝 튕겨 오르기
                    // <<< 수정 요청 사항 적용 시작 >>>
                    // 방해꾼(적)을 밟았을 때 이펙트 표시
                    if (this.bubbleEffectLoaded) {
                        // 효과를 적의 위치에 생성합니다. 적의 중앙에 오도록 x를 조정합니다.
                        // 이펙트를 적의 너비/높이에 맞춰 생성하고, 적의 상단 약간 위에서 시작하도록 y를 조정합니다.
                        this.activeEffects.push(new BubbleEffect(enemy.x + (enemy.width - enemy.width) / 2, // 적의 중앙 X (적 너비와 이펙트 너비가 같으면 enemy.x)
                        enemy.y - enemy.height / 2, // 적의 상단에서 이펙트 높이의 절반만큼 위로 (떠오르는 느낌)
                        this.bubbleEffectImage, enemy.width, // 이펙트 너비를 적 너비에 맞춤
                        enemy.height, // 이펙트 높이를 적 높이에 맞춤
                        40 // 이펙트 지속 시간 (프레임)
                        ));
                    }
                    // <<< 수정 요청 사항 적용 끝 >>>
                }
                else {
                    this.gameOver = true; // 적에게 닿으면 게임 오버
                    break;
                }
            }
        }
        // 4. 목표 지점 충돌
        if (this.player.isColliding(this.goal, this.scrollOffset)) {
            this.gameWon = true;
        }
    }
    draw() {
        // 배경 그리기
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'lightblue';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        // --- 수정 시작 (구름 그리기 주석 명확화) ---
        // 구름 그리기 (패럴랙스 효과 적용)
        this.clouds.forEach(cloud => {
            this.ctx.fillStyle = 'white';
            // 구름은 플레이어 이동에 맞춰 뒤로만 밀리고(패럴랙스 효과), 플레이어와 같은 속도로
            // 함께 움직이지 않도록 이미 update() 메서드에서 최종 화면 좌표(cloud.x)를 계산했습니다.
            // 따라서 여기에 scrollOffset을 다시 적용하지 않고 cloud.x를 직접 사용하여
            // 배경처럼 자연스럽게 뒤로 흘러가는 움직임을 구현합니다.
            this.ctx.fillRect(cloud.x, cloud.y, cloud.width, cloud.height);
        });
        // --- 수정 끝 ---
        // 바닥 그리기
        this.ctx.fillStyle = 'darkgreen';
        this.ctx.fillRect(0, this.GROUND_Y, this.canvas.width, this.canvas.height - this.GROUND_Y);
        // 장애물 그리기
        this.obstacles.forEach(obs => obs.draw(this.ctx, this.scrollOffset));
        // 적 그리기
        this.enemies.forEach(enemy => enemy.draw(this.ctx, this.scrollOffset));
        // 목표 그리기
        this.goal.draw(this.ctx, this.scrollOffset);
        // 플레이어 그리기
        this.player.draw(this.ctx, this.scrollOffset);
        // <<< 수정 요청 사항 적용 시작 >>>
        // 이펙트 그리기 (플레이어보다 위에 표시)
        this.activeEffects.forEach(effect => effect.draw(this.ctx, this.scrollOffset));
        // <<< 수정 요청 사항 적용 끝 >>>
        // 게임 상태 메시지
        if (!this.gameStarted && !this.gameOver && !this.gameWon) {
            this.drawMessage("PRESS SPACE TO START");
        }
        else if (this.gameOver) {
            this.drawMessage("GAME OVER! Press SPACE to Restart");
        }
        else if (this.gameWon) {
            this.drawMessage("YOU WIN! Press SPACE to Restart");
        }
    }
    drawMessage(message) {
        this.ctx.fillStyle = 'black';
        this.ctx.font = '30px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2);
    }
    startGameLoop() {
        const loop = () => {
            this.update();
            this.draw();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}
// 게임 시작
window.onload = () => {
    new Game();
};
