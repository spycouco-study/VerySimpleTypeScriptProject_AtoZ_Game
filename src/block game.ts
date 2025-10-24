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
// const paddleHeight = 75; // 원래 10 -> 75로 변경
// const paddleWidth = 75;
// let paddleX = (WIDTH - paddleWidth) / 2;
// let paddleDx = 5;

// // Bricks
// const brickRowCount = 5;
// const brickColumnCount = 7;
// const brickWidth = 55;
// const brickHeight = 20;
// const brickPadding = 10;
// const brickOffsetTop = 30;
// const brickOffsetLeft = 30;

// interface Brick {
//     x: number;
//     y: number;
//     status: number;
// }
// const bricks: Brick[][] = [];
// for(let c=0; c<brickColumnCount; c++) {
//     bricks[c] = [];
//     for(let r=0; r<brickRowCount; r++) {
//         bricks[c][r] = { x: 0, y: 0, status: 1 };
//     }
// }

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
// function drawPaddle() {
//     ctx.beginPath();
//     // y 좌표를 HEIGHT - paddleHeight로 설정하여 캔버스 하단에 정확히 위치시킵니다.
//     ctx.rect(paddleX, HEIGHT-paddleHeight, paddleWidth, paddleHeight);
//     ctx.fillStyle = "#09f";
//     ctx.fill();
//     ctx.closePath();
// }

// function drawBricks() {
//     for(let c=0; c<brickColumnCount; c++) {
//         for(let r=0; r<brickRowCount; r++) {
//             if(bricks[c][r].status === 1) {
//                 let brickX = c * (brickWidth + brickPadding) + brickOffsetLeft;
//                 let brickY = r * (brickHeight + brickPadding) + brickOffsetTop;
//                 bricks[c][r].x = brickX;
//                 bricks[c][r].y = brickY;
//                 ctx.beginPath();
//                 ctx.rect(brickX, brickY, brickWidth, brickHeight);
//                 ctx.fillStyle = "#32c98d";
//                 ctx.fill();
//                 ctx.closePath();
//             }
//         }
//     }
// }

// function collisionDetection() {
//     for(let c=0; c<brickColumnCount; c++) {
//         for(let r=0; r<brickRowCount; r++) {
//             let b = bricks[c][r];
//             if(b.status === 1) {
//                 if(
//                     x > b.x && x < b.x + brickWidth &&
//                     y > b.y && y < b.y + brickHeight
//                 ) {
//                     dy = -dy;
//                     b.status = 0;
//                     score++;
//                     if(score === brickRowCount*brickColumnCount) {
//                         alert("YOU WIN!");
//                         document.location.reload();
//                     }
//                 }
//             }
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
//     // 패들의 y 위치 (캔버스 상단 기준)
//     const paddleY = HEIGHT - paddleHeight;

//     // 공이 패들 x 범위 내에 있는지 확인
//     const isBallInPaddleXRange = x + ballRadius > paddleX && x - ballRadius < paddleX + paddleWidth;
    
//     // 공이 패들 y 범위 내에 있는지 확인
//     const isBallInPaddleYRange = y + ballRadius > paddleY && y - ballRadius < HEIGHT;

//     if (isBallInPaddleXRange && isBallInPaddleYRange) {
//         // 공의 이전 위치를 추론하여 어느 방향에서 충돌했는지 판단
//         const prevX = x - dx;
//         const prevY = y - dy;

//         // 1. 공의 아랫면이 패들의 윗면과 충돌
//         if (prevY + ballRadius <= paddleY && y + ballRadius > paddleY) {
//             dy = -dy;
//             // 패들 중앙에서 벗어난 정도에 따라 dx 조정 (기존 로직 유지)
//             let hit = x - (paddleX + paddleWidth / 2);
//             dx = dx + hit * 0.05; 
//             return;
//         }

//         // 2. 공의 측면이 패들의 좌/우 측면과 충돌 (공의 y 중앙이 패들 높이 범위 내에 있을 때)
//         // 공이 패들 상단 높이(paddleY)를 이미 넘어선 상태라면
//         if (y + ballRadius > paddleY && prevY - ballRadius >= HEIGHT - paddleHeight) {
            
//             // 왼쪽 측면 충돌
//             if (prevX + ballRadius <= paddleX && x + ballRadius > paddleX) {
//                 dx = -dx;
//                 return;
//             }
            
//             // 오른쪽 측면 충돌
//             if (prevX - ballRadius >= paddleX + paddleWidth && x - ballRadius < paddleX + paddleWidth) {
//                 dx = -dx;
//                 return;
//             }
//         }
        
//         // **참고:** 모서리 충돌(Corner Collision)은 복잡하여 2D 게임에서는 보통 단순화합니다.
//         // 여기서는 상단 충돌을 우선시하고, 측면 충돌은 공의 중심이 패들 범위 내에 있을 때만 확인합니다.
//     }
// }


// function draw() {
//     ctx.clearRect(0, 0, WIDTH, HEIGHT);
//     drawBricks();
//     drawBall();
//     drawPaddle();
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
    
//     // 패들 충돌 감지 로직 호출
//     checkPaddleCollision();

//     // 공이 패들 영역을 지나쳤고, 캔버스 바닥에 닿았을 때 (Game Over/Life Lost)
//     if(y + dy > HEIGHT + ballRadius) { // HEIGHT보다 ballRadius만큼 더 내려갔을 때
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

// draw();
