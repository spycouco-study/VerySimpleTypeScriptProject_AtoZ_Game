// snake.ts

// 캔버스 설정
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
const scoreDisplay = document.getElementById('score') as HTMLElement;

// 게임 그리드 설정
const TILE_SIZE = 20; // 뱀 한 칸의 크기 (20px * 20px)
const CANVAS_TILES = canvas.width / TILE_SIZE; 
const GAME_SPEED_MS = 200; // 💡수정: 100ms -> 200ms로 변경하여 속도 늦춤

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

// 게임 초기화
function initializeGame(): void {
    // 뱀 초기 위치 (가운데에서 시작)
    snake = [{ x: 10 * TILE_SIZE, y: 10 * TILE_SIZE }];
    dx = TILE_SIZE;
    dy = 0;
    score = 0;
    scoreDisplay.innerText = `점수: ${score}`;
    changingDirection = false;
    
    placeFood();
    
    // 이전 인터벌 제거 및 새 인터벌 시작
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(gameLoop, GAME_SPEED_MS);

    // 게임 시작 시 재시작 안내 문구 제거
    document.body.style.opacity = '1';
}

// 게임 루프 (매 200ms마다 실행)
function gameLoop(): void {
    if (checkGameOver()) {
        clearInterval(gameInterval);
        
        // 💡수정: 게임 종료 후 재시작 여부를 묻는 기능 추가
        const restart = confirm(`게임 오버! 최종 점수: ${score}\n다시 시작하시겠습니까?`);
        
        if (restart) {
            initializeGame();
        } else {
            alert('게임을 종료합니다.');
            // 게임 종료 시 캔버스 흐리게 처리 (선택 사항)
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

// 캔버스 지우기
function clearCanvas(): void {
    ctx.fillStyle = '#eee';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// 뱀 그리기
function drawSnake(): void {
    snake.forEach((segment, index) => {
        // 머리 색상
        ctx.fillStyle = (index === 0) ? 'darkgreen' : 'green';
        // 외곽선
        ctx.strokeStyle = 'lightgreen';
        
        // 사각형 그리기
        ctx.fillRect(segment.x, segment.y, TILE_SIZE, TILE_SIZE);
        ctx.strokeRect(segment.x, segment.y, TILE_SIZE, TILE_SIZE);
    });
}

// 뱀 이동
function moveSnake(): void {
    // 새 머리 위치 계산
    const head: Position = { x: snake[0].x + dx, y: snake[0].y + dy };

    // 새 머리를 뱀 배열 맨 앞에 추가
    snake.unshift(head);

    // 음식 먹었는지 확인
    if (head.x === food.x && head.y === food.y) {
        score += 10;
        scoreDisplay.innerText = `점수: ${score}`;
        placeFood(); // 새 음식 배치 (꼬리를 제거하지 않음으로써 뱀 길이 증가)
    } else {
        snake.pop(); // 꼬리 제거 (이동)
    }
}

// 음식 배치
function placeFood(): void {
    let newFood: Position;
    do {
        // 랜덤 타일 좌표 계산
        newFood = {
            x: Math.floor(Math.random() * CANVAS_TILES) * TILE_SIZE,
            y: Math.floor(Math.random() * CANVAS_TILES) * TILE_SIZE
        };
    } while (snake.some(segment => segment.x === newFood.x && segment.y === newFood.y)); // 뱀 몸통과 겹치지 않게
    
    food = newFood;
}

// 음식 그리기
function drawFood(): void {
    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'darkred';
    ctx.fillRect(food.x, food.y, TILE_SIZE, TILE_SIZE);
    ctx.strokeRect(food.x, food.y, TILE_SIZE, TILE_SIZE);
}

// 게임 오버 조건 확인
function checkGameOver(): boolean {
    const head = snake[0];
    
    // 1. 자기 몸통 충돌 (머리를 제외한 나머지 몸통과 충돌했는지 확인)
    for (let i = 1; i < snake.length; i++) {
        if (snake[i].x === head.x && snake[i].y === head.y) return true;
    }
    
    // 2. 벽 충돌
    const hitLeftWall = head.x < 0;
    const hitRightWall = head.x >= canvas.width;
    const hitTopWall = head.y < 0;
    const hitBottomWall = head.y >= canvas.height;
    
    return hitLeftWall || hitRightWall || hitTopWall || hitBottomWall;
}

// 방향 전환 처리
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

// 이벤트 리스너 등록 및 게임 시작
document.addEventListener('keydown', changeDirection);
initializeGame();