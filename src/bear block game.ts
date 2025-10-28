// export {};

// // Brick Breaker Game (block breaker) - TypeScript 단일 파일
// // HTML에 <canvas id="game" width="480" height="320"></canvas> 필요
// const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
// const ctx = canvas.getContext("2d")!;
// const WIDTH = canvas.width;
// const HEIGHT = canvas.height;
// // Ball
// let ballRadius = 7;
// let x = WIDTH / 2;
// let y = HEIGHT - 30;
// let dx = 2;
// let dy = -2;
// // Paddle
// // 사용자의 요청에 따라 밑판(Paddle)을 정사각형 모양에 가깝게 변경 (너비: 75, 높이: 75로 변경)
// const paddleHeight = 75; 
// const paddleWidth = 75;
// let paddleX = (WIDTH - paddleWidth) / 2;
// let paddleDx = 5;
// // --- Bricks Configuration Updated ---
// const BRICK_PADDING = 0; // 빈틈 없이 채우기 위해 패딩을 0으로 설정
// const BRICK_ROW_COUNT = 5;
// const BRICK_COLUMN_COUNT = 8; // 480px에 맞게 열 개수 조정 (480 / 60 = 8)
// const BRICK_WIDTH = WIDTH / BRICK_COLUMN_COUNT; // 480 / 8 = 60
// const BRICK_HEIGHT = 20;
// const BRICK_OFFSET_TOP = 120; // 일반 블록을 더 아래로 이동 (Y=120에서 시작)
// const BRICK_OFFSET_LEFT = 0; // 빈틈 없이 채우기 위해 왼쪽 오프셋을 0으로 설정
// interface Brick {
//     x: number;
//     y: number;
//     status: number;
//     color: string;
// }
// const bricks: Brick[][] = [];
// for(let c=0; c<BRICK_COLUMN_COUNT; c++) {
//     bricks[c] = [];
//     for(let r=0; r<BRICK_ROW_COUNT; r++) {
//         bricks[c][r] = { 
//             x: 0, 
//             y: 0, 
//             status: 1, 
//             // **일반 블록 색상 변경: 노란색과 주황색이 교차되도록**
//             color: r % 2 === 0 ? "#ffcc00" : "#ff9900" // 노란색과 주황색
//         };
//     }
// }
// // --- Boss Block Configuration ---
// const BOSS_SIZE = 40;
// const BOSS_X = (WIDTH - BOSS_SIZE) / 2; // 캔버스 중앙에 배치
// // BOSS_Y는 10으로 유지하여 윗 영역에 홀로 배치
// const BOSS_Y = 10; 
// let bossStatus = 1; // 1: 살아있음, 0: 깨짐
// // Input
// let rightPressed = false;
// let leftPressed = false;
// document.addEventListener("keydown", (e) => {
//     if(e.key === "Right" || e.key === "ArrowRight") rightPressed = true;
//     if(e.key === "Left" || e.key === "ArrowLeft") leftPressed = true;
// });
// document.addEventListener("keyup", (e) => {
//     if(e.key === "Right" || e.key === "ArrowRight") rightPressed = false;
//     if(e.key === "Left" || e.key === "ArrowLeft") leftPressed = false;
// });
// // Drawing functions
// function drawBall() {
//     ctx.beginPath();
//     ctx.arc(x, y, ballRadius, 0, Math.PI*2);
//     ctx.fillStyle = "#f60";
//     ctx.fill();
//     ctx.closePath();
// }
// // --- 스프라이트 애니메이션 관련 코드 ---
// const bearSprite = new Image();
// bearSprite.src = "./assets/bear.png"; 
// // honey.png 이미지 로드
// const honeySprite = new Image();
// honeySprite.src = "./assets/honey.png"; 
// // **배경 이미지 로드: back.png로 변경**
// const backImage = new Image();
// backImage.src = "./assets/back.png";
// // 배경 음악 객체 추가
// let bgm: HTMLAudioElement;
// // 블록 깨짐 효과음 객체 추가
// let brickHitSound: HTMLAudioElement;

// // BGM이 사용자 상호작용 후 재생되었는지 확인하는 플래그
// let bgmPlayedAfterInteraction = false;
// const spriteWidth = 222; // 666 / 3
// const spriteHeight = 222; // 원본 이미지 높이
// // 프레임 정의 (sourceX, sourceY, sourceWidth, sourceHeight)
// // [0] 가만히 서 있는 모습
// // [1] 우측 이동 모습 1
// // [2] 우측 이동 모습 2
// const animationFrames = [
//     { sX: 0, sY: 0, sW: spriteWidth, sH: spriteHeight },
//     { sX: spriteWidth, sY: 0, sW: spriteWidth, sH: spriteHeight },
//     { sX: spriteWidth * 2, sY: 0, sW: spriteWidth, sH: spriteHeight }
// ];
// let currentFrameIndex = 0;
// let animationFrameCounter = 0;
// const animationSpeed = 10; // 프레임 전환 속도 (값이 낮을수록 빠름)
// function drawPaddle() {
//     // 애니메이션 프레임 선택 로직
//     if (leftPressed || rightPressed) {
//         // 움직일 때 두 번째와 세 번째 프레임을 번갈아 가며 사용 (인덱스 1, 2)
//         animationFrameCounter++;
//         if (animationFrameCounter % animationSpeed === 0) {
//             currentFrameIndex = (currentFrameIndex === 1) ? 2 : 1;
//         }
//     } else {
//         // 가만히 있을 때 첫 번째 프레임 사용 (인덱스 0)
//         currentFrameIndex = 0;
//         animationFrameCounter = 0; // 멈췄을 때 카운터 초기화
//     }
//     const frame = animationFrames[currentFrameIndex];
//     // **좌우 반전 로직**
//     ctx.save(); // 현재 캔버스 상태 저장
//     if (leftPressed && !rightPressed) { // 왼쪽으로 움직일 때만 반전
//         ctx.translate(paddleX + paddleWidth, HEIGHT - paddleHeight); // 회전 중심을 이미지의 오른쪽 상단으로 이동
//         ctx.scale(-1, 1); // X축 반전 (좌우 반전)
//         // 이미지를 그릴 때, x 좌표를 음수로 지정하여 반전된 상태에서 올바른 위치에 그려지도록 합니다.
//         ctx.drawImage(
//             bearSprite,
//             frame.sX, frame.sY, frame.sW, frame.sH,
//             0, 0, paddleWidth, paddleHeight // translate 했으므로 x,y는 0,0이 됩니다.
//         );
//     } else { // 오른쪽으로 움직이거나 멈춰 있을 때
//         ctx.drawImage(
//             bearSprite,
//             frame.sX, frame.sY, frame.sW, frame.sH,
//             paddleX, HEIGHT - paddleHeight, paddleWidth, paddleHeight
//         );
//     }
//     ctx.restore(); // 캔버스 상태 복원 (다른 그리기 작업에 영향 주지 않도록)
// }
// // --- 스프라이트 애니메이션 관련 코드 끝 ---
// // 일반 벽돌과 보스 벽돌을 모두 그리는 함수
// function drawBricks() {
//     // 1. 일반 벽돌 그리기 (빈틈 없음)
//     for(let c=0; c<BRICK_COLUMN_COUNT; c++) {
//         for(let r=0; r<BRICK_ROW_COUNT; r++) {
//             if(bricks[c][r].status === 1) {
//                 let brickX = c * BRICK_WIDTH + BRICK_OFFSET_LEFT;
//                 let brickY = r * BRICK_HEIGHT + BRICK_OFFSET_TOP;
//                 bricks[c][r].x = brickX;
//                 bricks[c][r].y = brickY;
//                 ctx.beginPath();
//                 ctx.rect(brickX, brickY, BRICK_WIDTH, BRICK_HEIGHT);
//                 ctx.fillStyle = bricks[c][r].color;
//                 ctx.fill();
//                 ctx.closePath();
//             }
//         }
//     }
//     // 2. 보스 블록 그리기 (정사각형)
//     if (bossStatus === 1) {
//         // honey.png 이미지로 그리기 시도
//         if (honeySprite.complete && honeySprite.naturalWidth !== 0) {
//             ctx.drawImage(honeySprite, BOSS_X, BOSS_Y, BOSS_SIZE, BOSS_SIZE);
//         } else {
//             // 이미지 로드 실패 시 대체 사각형 및 텍스트 표시
//             ctx.beginPath();
//             ctx.rect(BOSS_X, BOSS_Y, BOSS_SIZE, BOSS_SIZE);
//             ctx.fillStyle = "#ff5555"; // 보스 블록은 빨간색
//             ctx.shadowColor = "#ff0000";
//             ctx.shadowBlur = 10;
//             ctx.fill();
//             ctx.closePath();
//             ctx.shadowBlur = 0; // 그림자 효과 리셋
//             ctx.font = "bold 14px Arial";
//             ctx.fillStyle = "#fff";
//             ctx.textAlign = "center";
//             ctx.fillText("BOSS", BOSS_X + BOSS_SIZE / 2, BOSS_Y + BOSS_SIZE / 2 + 5);
//             ctx.textAlign = "start";
//         }
//     }
// }
// // 일반 벽돌과 보스 블록 충돌 감지
// function collisionDetection() {
//     // 1. 일반 벽돌 충돌 감지
//     for(let c=0; c<BRICK_COLUMN_COUNT; c++) {
//         for(let r=0; r<BRICK_ROW_COUNT; r++) {
//             let b = bricks[c][r];
//             if(b.status === 1) {
//                 if(
//                     x > b.x && x < b.x + BRICK_WIDTH &&
//                     y > b.y && y < b.y + BRICK_HEIGHT
//                 ) {
//                     dy = -dy;
//                     b.status = 0; // 일반 벽돌은 깨지지만 점수만 오름 (승리 조건 아님)
//                     score++;
//                     // **블록 깨짐 효과음 재생**
//                     brickHitSound.currentTime = 0; // 사운드를 처음으로 되감기
//                     brickHitSound.play().catch(e => console.warn("Brick hit sound failed to play:", e));
//                 }
//             }
//         }
//     }
//     // 2. 보스 블록 충돌 감지 (승리 조건)
//     if (bossStatus === 1) {
//         if(
//             x + ballRadius > BOSS_X && x - ballRadius < BOSS_X + BOSS_SIZE &&
//             y + ballRadius > BOSS_Y && y - ballRadius < BOSS_Y + BOSS_SIZE
//         ) {
//             // 충돌 시 공의 방향 반전
//             // X축 충돌 확인 (좌우 측면)
//             // 보스 블록은 공이 부딪힐 때마다 방향이 반전되도록 단순화
//             if (x < BOSS_X || x > BOSS_X + BOSS_SIZE) {
//                  dx = -dx;
//             } 
//             // Y축 충돌 확인 (상하 측면)
//             if (y < BOSS_Y || y > BOSS_Y + BOSS_SIZE) {
//                  dy = -dy;
//             }
//             // 보스 블록 깨짐 처리
//             bossStatus = 0;
//             score += 100; // 보스 격파 보너스 점수
//             // **보스 블록 깨짐 효과음 재생**
//             brickHitSound.currentTime = 0; // 사운드를 처음으로 되감기
//             brickHitSound.play().catch(e => console.warn("Boss hit sound failed to play:", e));
//             // **승리 조건**: 보스 블록이 깨지면 승리
//             alert("BOSS DOWN! YOU WIN!");
//             document.location.reload();
//         }
//     }
// }
// let score = 0;
// let lives = 3;
// function drawScore() {
//     ctx.font = "16px Arial";
//     ctx.fillStyle = "#333";
//     ctx.fillText("Score: "+score, 8, 20);
// }
// function drawLives() {
//     ctx.font = "16px Arial";
//     ctx.fillStyle = "#333";
//     ctx.fillText("Lives: "+lives, WIDTH-75, 20);
// }
// function checkPaddleCollision() {
//     const paddleY = HEIGHT - paddleHeight;
//     const isBallInPaddleXRange = x + ballRadius > paddleX && x - ballRadius < paddleX + paddleWidth;
//     const isBallInPaddleYRange = y + ballRadius > paddleY && y - ballRadius < HEIGHT;
//     if (isBallInPaddleXRange && isBallInPaddleYRange) {
//         const prevX = x - dx;
//         const prevY = y - dy;
//         if (prevY + ballRadius <= paddleY && y + ballRadius > paddleY) {
//             dy = -dy;
//             let hit = x - (paddleX + paddleWidth / 2);
//             dx = dx + hit * 0.05; 
//             return;
//         }
//         if (y + ballRadius > paddleY && prevY - ballRadius >= HEIGHT - paddleHeight) {
//             if (prevX + ballRadius <= paddleX && x + ballRadius > paddleX) {
//                 dx = -dx;
//                 return;
//             }
//             if (prevX - ballRadius >= paddleX + paddleWidth && x - ballRadius < paddleX + paddleWidth) {
//                 dx = -dx;
//                 return;
//             }
//         }
//     }
// }
// // 사용자 상호작용 후 BGM 재생을 시도하는 함수
// function tryPlayBgmAfterInteraction() {
//     if (!bgmPlayedAfterInteraction) {
//         bgm.play().then(() => {
//             console.log("BGM started after user interaction.");
//             bgmPlayedAfterInteraction = true;
//             // 재생 성공 시 이벤트 리스너 제거
//             document.removeEventListener('click', tryPlayBgmAfterInteraction);
//             document.removeEventListener('keydown', tryPlayBgmAfterInteraction);
//         }).catch(e => {
//             console.warn("BGM still blocked after interaction:", e);
//             // 여전히 재생되지 않으면, 다음 상호작용을 기다림 (이벤트 리스너가 제거되지 않았으므로)
//         });
//     }
// }
// // --- 모든 이미지 로드 완료를 기다리는 로직 ---
// let imagesLoadedCount = 0;
// const totalImages = 3; // bearSprite, honeySprite, backImage
// function imageLoaded() {
//     imagesLoadedCount++;
//     if (imagesLoadedCount === totalImages) {
//         // 모든 이미지가 로드되면 게임 시작
//         // 배경 음악 초기화 및 재생 시도
//         bgm = new Audio('assets/bgm.mp3');
//         bgm.loop = true;
//         bgm.volume = 0.3; // 적절한 볼륨 설정
//         bgm.play().catch(error => {
//             console.warn("Autoplay of BGM prevented. User interaction required:", error);
//             // 브라우저의 자동 재생 정책에 따라 초기 재생이 실패할 수 있습니다.
//             // 사용자가 화면을 클릭하거나 키를 누르면 재생되도록 이벤트를 추가합니다.
//             if (!bgmPlayedAfterInteraction) {
//                 document.addEventListener('click', tryPlayBgmAfterInteraction, { once: true });
//                 document.addEventListener('keydown', tryPlayBgmAfterInteraction, { once: true });
//                 console.log("Waiting for user interaction to play BGM...");
//             }
//         });

//         // **블록 깨짐 효과음 초기화**
//         brickHitSound = new Audio('assets/eat.mp3');
//         brickHitSound.volume = 0.7; // 적절한 볼륨 설정

//         draw();
//     }
// }
// // 각 이미지의 onload와 onerror 핸들러 설정
// bearSprite.onload = imageLoaded;
// bearSprite.onerror = () => {
//     console.error("Failed to load bear.png. Paddle will use fallback.");
//     imageLoaded(); // 실패해도 카운트는 증가시켜 게임 진행
// };
// honeySprite.onload = imageLoaded;
// honeySprite.onerror = () => {
//     console.error("Failed to load honey.png. Boss block will use fallback.");
//     imageLoaded();
// };
// backImage.onload = imageLoaded;
// backImage.onerror = () => {
//     console.error("Failed to load back.png. Game will use clear background.");
//     imageLoaded();
// };
// // --- 이미지 로드 로직 끝 ---
// function draw() {
//     ctx.clearRect(0, 0, WIDTH, HEIGHT);
//     // **배경 그리기 (투명도 50%)**
//     if (backImage.complete && backImage.naturalWidth !== 0) {
//         ctx.save(); // 현재 상태 저장 (globalAlpha를 변경하기 위함)
//         ctx.globalAlpha = 0.5; // 투명도 50%
//         ctx.drawImage(backImage, 0, 0, WIDTH, HEIGHT);
//         ctx.restore(); // 원래 상태 복원 (globalAlpha를 1.0으로 되돌림)
//     } else {
//         // 배경 이미지 로드 실패 시 투명 배경 유지 또는 단색 배경으로 대체
//         ctx.fillStyle = "#add8e6"; // 연한 파란색 배경
//         ctx.fillRect(0, 0, WIDTH, HEIGHT);
//     }
//     drawBricks();
//     if (bearSprite.complete && bearSprite.naturalWidth !== 0) {
//         drawPaddle(); 
//     } else {
//         ctx.beginPath();
//         ctx.rect(paddleX, HEIGHT - paddleHeight, paddleWidth, paddleHeight);
//         ctx.fillStyle = "#09f"; 
//         ctx.fill();
//         ctx.closePath();
//     }
//     drawBall(); 
//     drawScore();
//     drawLives();
//     collisionDetection();
//     // Ball movement
//     if(x + dx > WIDTH-ballRadius || x + dx < ballRadius) {
//         dx = -dx;
//     }
//     if(y + dy < ballRadius) {
//         dy = -dy;
//     } 
//     checkPaddleCollision();
//     if(y + dy > HEIGHT + ballRadius) {
//         lives--;
//         if(!lives) {
//             alert("GAME OVER");
//             document.location.reload();
//         } else {
//             x = WIDTH/2;
//             y = HEIGHT-30;
//             dx = 2;
//             dy = -2;
//             paddleX = (WIDTH - paddleWidth) / 2;
//         }
//     }
//     x += dx;
//     y += dy;
//     // Paddle movement
//     if(rightPressed && paddleX < WIDTH-paddleWidth) {
//         paddleX += paddleDx;
//     } else if(leftPressed && paddleX > 0) {
//         paddleX -= paddleDx;
//     }
//     requestAnimationFrame(draw);
// }
// // 모든 이미지가 로드될 때까지 draw 함수 호출을 지연시킴
// // 이 부분은 기존에 각각의 onload에 있던 draw() 호출을 대체합니다.
// // 이제 imageLoaded 함수에서 모든 이미지가 로드되었는지 확인하고 draw()를 한 번만 호출합니다.
// // 초기 호출은 이 스크립트가 실행될 때 발생합니다. 모든 이미지가 로드될 때까지 기다립니다.