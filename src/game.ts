// 캔버스 설정
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
const scoreDisplay = document.getElementById('score') as HTMLElement;

// 게임 그리드 설정
const TILE_SIZE = 20;
const CANVAS_TILES = canvas.width / TILE_SIZE;
const GAME_SPEED_MS = 200;

// 타입 정의
interface Position {
    x: number;
    y: number;
}
type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

// 게임 상태 변수
let snake: Position[] = [];
let food: Position = { x: 0, y: 0 };
let dx: number = TILE_SIZE;
let dy: number = 0;
let score: number = 0;
let changingDirection: boolean = false;
let gameInterval: number;

// 🎵 사운드 관련 변수
let bgm: HTMLAudioElement;
let eatSound: HTMLAudioElement;

// 🍎 사운드 및 이미지 미리 로드
function preloadAssets(): void {
    // === 사운드 ===
    bgm = new Audio('/assets/bgm.mp3');
    bgm.loop = true;
    bgm.volume = 0.5;

    eatSound = new Audio('/assets/eat.mp3');
    eatSound.volume = 0.7;

    // === 사과 이미지 ===
    const img = new Image();
    (window as any).appleImageLoaded = false;
    (window as any).appleImageError = false;
    img.onload = () => { (window as any).appleImageLoaded = true; };
    img.onerror = () => { (window as any).appleImageError = true; console.error('apple.png failed to load for', img.src); };
    const absUrl = (typeof window !== 'undefined' && window.location)
        ? (window.location.protocol + '//' + window.location.host + '/assets/apple.png')
        : '/assets/apple.png';
    img.src = absUrl;
    console.log('preloading apple from', img.src);
    (window as any).appleImage = img;
}

// 🎮 게임 초기화
function initializeGame(): void {
    // 💡 에셋이 한 번만 로드되게
    if (!bgm || !eatSound) preloadAssets();

    // 💡 배경음악 재생 시도 (브라우저 자동재생 방지 대응)
    bgm.currentTime = 0;
    bgm.play().catch(() => {
        console.warn('🔇 배경음악 자동재생이 차단되었습니다. 키를 누르면 재생됩니다.');
        document.addEventListener('keydown', () => bgm.play(), { once: true });
    });

    snake = [{ x: 10 * TILE_SIZE, y: 10 * TILE_SIZE }];
    dx = TILE_SIZE;
    dy = 0;
    score = 0;
    scoreDisplay.innerText = `점수: ${score}`;
    changingDirection = false;

    placeFood();

    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(gameLoop, GAME_SPEED_MS);

    document.body.style.opacity = '1';
}

// 🎯 게임 루프
function gameLoop(): void {
    if (checkGameOver()) {
        clearInterval(gameInterval);
        bgm.pause();
        bgm.currentTime = 0;

        const restart = confirm(`게임 오버! 최종 점수: ${score}\n다시 시작하시겠습니까?`);
        if (restart) {
            initializeGame();
        } else {
            alert('게임을 종료합니다.');
            document.body.style.opacity = '0.5';
        }
        return;
    }

    changingDirection = false;

    clearCanvas();
    drawFood();
    moveSnake();
    drawSnake();
}

// 🧹 캔버스 지우기
function clearCanvas(): void {
    ctx.fillStyle = '#eee';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// 🐍 뱀 그리기
function drawSnake(): void {
    snake.forEach((segment, index) => {
        ctx.fillStyle = (index === 0) ? 'darkgreen' : 'green';
        ctx.strokeStyle = 'lightgreen';
        ctx.fillRect(segment.x, segment.y, TILE_SIZE, TILE_SIZE);
        ctx.strokeRect(segment.x, segment.y, TILE_SIZE, TILE_SIZE);
    });
}

// 🐍 뱀 이동
function moveSnake(): void {
    const head: Position = { x: snake[0].x + dx, y: snake[0].y + dy };
    snake.unshift(head);

    // 🍎 음식 먹었는지 확인
    if (head.x === food.x && head.y === food.y) {
        score += 10;
        scoreDisplay.innerText = `점수: ${score}`;

        // 🎵 효과음 재생
        eatSound.currentTime = 0;
        eatSound.play().catch(() => console.warn('eatSound play blocked by browser.'));

        placeFood();
    } else {
        snake.pop();
    }
}

// 🍎 음식 배치
function placeFood(): void {
    let newFood: Position;
    do {
        newFood = {
            x: Math.floor(Math.random() * CANVAS_TILES) * TILE_SIZE,
            y: Math.floor(Math.random() * CANVAS_TILES) * TILE_SIZE
        };
    } while (snake.some(segment => segment.x === newFood.x && segment.y === newFood.y));
    food = newFood;
}

// 🍎 음식 그리기
function drawFood(): void {
    if (!ctx) return;
    const img = (window as any).appleImage as HTMLImageElement | undefined;
    const imgLoaded = (window as any).appleImageLoaded === true;
    const imgError = (window as any).appleImageError === true;
    if (img && imgLoaded && !imgError && img.naturalWidth > 0) {
        try {
            ctx.drawImage(img, food.x, food.y, TILE_SIZE, TILE_SIZE);
            return;
        } catch (e) {
            console.warn('drawImage error, fallback to rect', e);
        }
    }
    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'darkred';
    ctx.fillRect(food.x, food.y, TILE_SIZE, TILE_SIZE);
    ctx.strokeRect(food.x, food.y, TILE_SIZE, TILE_SIZE);
}

// 💥 게임 오버 판정
function checkGameOver(): boolean {
    const head = snake[0];

    for (let i = 1; i < snake.length; i++) {
        if (snake[i].x === head.x && snake[i].y === head.y) return true;
    }

    const hitLeftWall = head.x < 0;
    const hitRightWall = head.x >= canvas.width;
    const hitTopWall = head.y < 0;
    const hitBottomWall = head.y >= canvas.height;

    return hitLeftWall || hitRightWall || hitTopWall || hitBottomWall;
}

// ⌨️ 방향 전환 처리
function changeDirection(event: KeyboardEvent): void {
    if (changingDirection) return;
    changingDirection = true;

    const keyPressed = event.key;
    const goingUp = dy === -TILE_SIZE;
    const goingDown = dy === TILE_SIZE;
    const goingLeft = dx === -TILE_SIZE;
    const goingRight = dx === TILE_SIZE;

    switch (keyPressed) {
        case 'ArrowLeft':
            if (!goingRight) { dx = -TILE_SIZE; dy = 0; }
            break;
        case 'ArrowUp':
            if (!goingDown) { dx = 0; dy = -TILE_SIZE; }
            break;
        case 'ArrowRight':
            if (!goingLeft) { dx = TILE_SIZE; dy = 0; }
            break;
        case 'ArrowDown':
            if (!goingUp) { dx = 0; dy = TILE_SIZE; }
            break;
    }
}

// 🚀 시작
document.addEventListener('keydown', changeDirection);
initializeGame();
