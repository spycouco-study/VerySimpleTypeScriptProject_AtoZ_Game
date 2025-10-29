// // 캔버스 설정
// const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
// const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
// // ⭐ 수정: scoreDisplay 변수를 제거하고, 점수는 캔버스에 직접 그립니다.
// // 🌟 논리적 게임 크기 정의 (20x20 타일로 복구 및 고정)
// const LOGICAL_GRID_SIZE = 20; 
// const LOGICAL_PIXEL_SIZE = 400; // 20 tiles * 20 px/tile = 400
// // 게임 그리드 설정
// const TILE_SIZE = LOGICAL_PIXEL_SIZE / LOGICAL_GRID_SIZE; // 20
// const CANVAS_TILES = LOGICAL_GRID_SIZE; // 20
// const GAME_SPEED_MS = 200;
// // 타입 정의
// interface Position {
//     x: number;
//     y: number;
// }
// type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
// // 게임 상태 변수
// let snake: Position[] = [];
// let food: Position = { x: 0, y: 0 };
// let dx: number = TILE_SIZE;
// let dy: number = 0;
// let score: number = 0;
// let changingDirection: boolean = false;
// let gameInterval: number;
// // 🎵 사운드 관련 변수
// let bgm: HTMLAudioElement;
// let eatSound: HTMLAudioElement;
// // 🖼️ 뱀 이미지 에셋을 위한 타입 정의
// type SnakeImages = {
//     head: HTMLImageElement;
//     body: HTMLImageElement;
//     tail: HTMLImageElement;
//     apple: HTMLImageElement;
// };
// let snakeImages: SnakeImages;
// let assetsLoaded: boolean = false;
// // 🍎 사운드 및 이미지 미리 로드
// function preloadAssets(): void {
//     if (assetsLoaded) return;
//     // === 사운드 ===
//     bgm = new Audio('/assets/bgm.mp3');
//     bgm.loop = true;
//     bgm.volume = 0.5;
//     eatSound = new Audio('/assets/eat.mp3');
//     eatSound.volume = 0.7;
//     // === 이미지 에셋 로드 함수 ===
//     const loadImage = (src: string): HTMLImageElement => {
//         const img = new Image();
//         const absUrl = (typeof window !== 'undefined' && window.location)
//             ? (window.location.protocol + '//' + window.location.host + src)
//             : src;
//         img.src = absUrl;
//         img.onerror = () => console.error(`${src} failed to load from ${absUrl}`);
//         return img;
//     };
//     snakeImages = {
//         head: loadImage('/assets/head.png'),
//         body: loadImage('/assets/body.png'),
//         tail: loadImage('/assets/tail.png'),
//         apple: loadImage('/assets/apple.png'),
//     };
//     // 💡 모든 이미지가 로드되었는지 확인하는 로직은 복잡하므로, 일단 로드 요청만 보냅니다.
//     // 실제 게임에서는 로딩 스크린이 필요할 수 있습니다.
//     (window as any).appleImage = snakeImages.apple; // 기존 drawFood와의 호환성을 위해 유지
//     assetsLoaded = true;
// }
// // 🌟 새 함수: 캔버스 크기 조정 및 스타일 설정
// function resizeGame(): void {
//     // 화면의 가로/세로 중 작은 쪽에 맞춰 캔버스 크기를 설정
//     const minSize = Math.min(window.innerWidth, window.innerHeight);
//     // 캔버스가 차지할 실제 화면 크기 (화면의 90%를 최대 크기로 사용)
//     const newVisualSize = Math.floor(minSize * 0.9); // 🌟 0.9로 변경하여 여백 증가
//     // 캔버스 스타일 크기 적용 (시각적 확대/축소 담당)
//     // 캔버스 내부 논리적 크기는 LOGICAL_PIXEL_SIZE(400)로 고정되어,
//     // 이 스타일 크기 조절을 통해 20x20 그리드가 화면에 맞춰 확대/축소됩니다.
//     canvas.style.width = `${newVisualSize}px`;
//     canvas.style.height = `${newVisualSize}px`;
//     // 캔버스 중앙 배치 및 기타 스타일 조정
//     canvas.style.display = 'block';
//     // 마진을 0 auto로 유지하여 상하 고정 마진을 제거하고 중앙 정렬 유지
//     canvas.style.margin = '0 auto'; 
//     canvas.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.2)';
//     canvas.style.borderRadius = '8px';
//     // ⭐ 수정: HTML 점수판 관련 스타일 로직 제거
// }
// // 🎮 게임 초기화
// function initializeGame(): void {
//     // ⭐ 수정: scoreDisplay 요소를 찾아 할당하는 로직 제거
//     // 점수는 캔버스에 직접 그립니다.
//     // 🌟 캔버스 내부 해상도 설정 (20x20 그리드에 맞춰 400x400으로 고정)
//     canvas.width = LOGICAL_PIXEL_SIZE;
//     canvas.height = LOGICAL_PIXEL_SIZE;
//     // 💡 에셋 로드
//     preloadAssets();
//     // 🌟 1. 전체 화면 레이아웃 설정 및 스크롤바 제거 (기존 유지)
//     document.documentElement.style.height = '100%';
//     document.body.style.margin = '0';
//     document.body.style.padding = '0';
//     document.body.style.height = '100%'; // body가 viewport 전체를 차지하도록
//     document.body.style.overflow = 'hidden'; // 브라우저 스크롤바 제거 핵심
//     document.body.style.display = 'flex';
//     document.body.style.flexDirection = 'column';
//     document.body.style.justifyContent = 'center'; // 수직 중앙 정렬
//     document.body.style.alignItems = 'center'; // 수평 중앙 정렬
//     document.body.style.backgroundColor = '#1f2937'; // 배경색을 어둡게 설정
//     // 🌟 초기화 시 캔버스 크기 조정 및 이벤트 리스너 등록
//     resizeGame();
//     window.addEventListener('resize', resizeGame);
//     // 💡 배경음악 재생 시도 (브라우저 자동재생 방지 대응)
//     bgm.currentTime = 0;
//     bgm.play().catch(() => {
//         console.warn('🔇 배경음악 자동재생이 차단되었습니다. 키를 누르면 재생됩니다.');
//         document.addEventListener('keydown', () => bgm.play(), { once: true });
//     });
//     // 🐍 초기 뱀 위치 (중앙 근처)
//     // 10 * TILE_SIZE = 200
//     const startX = Math.floor(CANVAS_TILES / 2) * TILE_SIZE; 
//     const startY = Math.floor(CANVAS_TILES / 2) * TILE_SIZE;
//     // 🌟 초기 뱀 길이 3칸으로 설정
//     snake = [
//         { x: startX, y: startY }, // Head
//         { x: startX - TILE_SIZE, y: startY }, // Body 1
//         { x: startX - 2 * TILE_SIZE, y: startY }  // Tail
//     ];
//     dx = TILE_SIZE; // 오른쪽으로 이동 시작
//     dy = 0;
//     score = 0;
//     // ⭐ 수정: HTML 점수판 업데이트 로직 제거
//     changingDirection = false;
//     placeFood();
//     if (gameInterval) clearInterval(gameInterval);
//     gameInterval = setInterval(gameLoop, GAME_SPEED_MS);
//     document.body.style.opacity = '1';
// }
// // 🎯 게임 루프
// function gameLoop(): void {
//     if (checkGameOver()) {
//         clearInterval(gameInterval);
//         bgm.pause();
//         bgm.currentTime = 0;
//         // 🚨 alert/confirm 대신 메시지 박스 구현을 권장하지만, 임시로 confirm 사용
//         const restart = window.confirm(`게임 오버! 최종 점수: ${score}\n다시 시작하시겠습니까?`);
//         if (restart) {
//             initializeGame();
//         } else {
//             console.log('게임을 종료합니다.');
//             document.body.style.opacity = '0.5';
//         }
//         return;
//     }
//     changingDirection = false;
//     clearCanvas();
//     drawFood();
//     moveSnake();
//     drawSnake();
//     // ⭐ 추가: 점수를 캔버스에 그립니다. (모든 요소 위에 오버레이)
//     drawScoreOnCanvas();
// }
// // 🧹 캔버스 지우기
// function clearCanvas(): void {
//     ctx.fillStyle = '#eee';
//     ctx.fillRect(0, 0, canvas.width, canvas.height);
// }
// // ⭐ 추가: 점수를 캔버스 상단에 상태바 형태로 그리는 함수
// function drawScoreOnCanvas(): void {
//     if (!ctx) return;
//     const statusBarHeight = TILE_SIZE * 1.5; // 상태바 높이 (예: 20px * 1.5 = 30px)
//     const padding = 10; // 텍스트 여백
//     // 상태바 배경 (어둡고 반투명)
//     ctx.fillStyle = 'rgba(51, 51, 51, 0.7)';
//     ctx.fillRect(0, 0, canvas.width, statusBarHeight);
//     // 점수 텍스트
//     ctx.fillStyle = '#fff'; // 흰색 텍스트
//     ctx.font = 'bold 24px Arial'; // 볼드체 24px 폰트
//     ctx.textAlign = 'left'; // 좌측 정렬
//     ctx.textBaseline = 'middle'; // 세로 중앙 정렬
//     // 점수를 상태바 좌측에 그립니다.
//     ctx.fillText(`점수: ${score}`, padding, statusBarHeight / 2);
//     // 게임 제목을 상태바 우측에 그립니다.
//     ctx.textAlign = 'right'; // 우측 정렬
//     ctx.fillText('Snake Game', canvas.width - padding, statusBarHeight / 2);
// }
// // 📐 회전된 이미지 그리기 헬퍼 함수
// // 이미지를 타일 중앙을 기준으로 주어진 각도(라디안)만큼 회전시켜 그립니다.
// function drawRotatedImage(image: HTMLImageElement, x: number, y: number, angle: number): void {
//     const halfTile = TILE_SIZE / 2;
//     // 이미지 로드 실패 시 폴백 (fallback)
//     if (image.naturalWidth === 0) {
//         ctx.fillStyle = '#9B59B6'; // 가시성을 위해 보라색 폴백
//         ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
//         return;
//     }
//     ctx.save();
//     // 캔버스 원점을 타일 중앙으로 이동
//     ctx.translate(x + halfTile, y + halfTile);
//     // 회전
//     ctx.rotate(angle);
//     // 이미지를 새로운 원점을 기준으로 그립니다.
//     ctx.drawImage(image, -halfTile, -halfTile, TILE_SIZE, TILE_SIZE);
//     ctx.restore();
// }
// // 🐍 뱀 그리기 (회전 적용)
// function drawSnake(): void {
//     if (!ctx || !snakeImages || snake.length === 0) return;
//     // Head (진행 방향을 따름)
//     const head = snake[0];
//     // head.png 에셋은 위(UP, -PI/2)를 향하고 있으므로, atan2 결과에 PI/2를 더해 방향 보정
//     const headAngle = Math.atan2(dy, dx) + Math.PI / 2;
//     drawRotatedImage(snakeImages.head, head.x, head.y, headAngle);
//     // Body (머리와 꼬리 사이)
//     for (let i = 1; i < snake.length - 1; i++) {
//         const segment = snake[i];
//         if (snakeImages.body.naturalWidth > 0) {
//             // 몸통은 회전 없이 그립니다.
//             ctx.drawImage(snakeImages.body, segment.x, segment.y, TILE_SIZE, TILE_SIZE);
//         } else {
//             // Fallback: 이미지 로드 실패 시 초록색 사각형
//             ctx.fillStyle = 'green';
//             ctx.fillRect(segment.x, segment.y, TILE_SIZE, TILE_SIZE);
//         }
//     }
//     // Tail (꼬리 방향을 따름)
//     if (snake.length > 1) {
//         const tailSegment = snake[snake.length - 1];
//         const segmentBeforeTail = snake[snake.length - 2];
//         // 꼬리가 몸통으로부터 벗어나는 방향 벡터
//         const dxTail = tailSegment.x - segmentBeforeTail.x;
//         const dyTail = tailSegment.y - segmentBeforeTail.y;
//         // tail.png 에셋은 아래(DOWN, +PI/2)를 향하고 있으므로, atan2 결과에 PI/2를 빼서 방향 보정
//         const tailAngle = Math.atan2(dyTail, dxTail) - Math.PI / 2;
//         drawRotatedImage(snakeImages.tail, tailSegment.x, tailSegment.y, tailAngle);
//     } 
//     // snake.length가 1일 때는 위에서 Head만 그렸으므로 Tail은 그리지 않습니다.
// }
// // 🐍 뱀 이동
// function moveSnake(): void {
//     const head: Position = { x: snake[0].x + dx, y: snake[0].y + dy };
//     snake.unshift(head);
//     // 🍎 음식 먹었는지 확인
//     if (head.x === food.x && head.y === food.y) {
//         score += 10;
//         // ⭐ 수정: scoreDisplay를 통한 업데이트 로직 제거. 점수는 drawScoreOnCanvas에서 갱신됩니다.
//         // 🎵 효과음 재생
//         eatSound.currentTime = 0;
//         eatSound.play().catch(() => console.warn('eatSound play blocked by browser.'));
//         placeFood();
//     } else {
//         snake.pop();
//     }
// }
// // 🍎 음식 배치
// function placeFood(): void {
//     let newFood: Position;
//     do {
//         newFood = {
//             x: Math.floor(Math.random() * CANVAS_TILES) * TILE_SIZE,
//             y: Math.floor(Math.random() * CANVAS_TILES) * TILE_SIZE
//         };
//     } while (snake.some(segment => segment.x === newFood.x && segment.y === newFood.y));
//     food = newFood;
// }
// // 🍎 음식 그리기
// function drawFood(): void {
//     if (!ctx) return;
//     const img = snakeImages?.apple as HTMLImageElement | undefined;
//     if (img && img.naturalWidth > 0) {
//         try {
//             ctx.drawImage(img, food.x, food.y, TILE_SIZE, TILE_SIZE);
//             return;
//         } catch (e) {
//             console.warn('drawImage error, fallback to rect', e);
//         }
//     }
//     // 이미지 로드 실패 또는 오류 시 폴백 (Fallback)
//     ctx.fillStyle = 'red';
//     ctx.strokeStyle = 'darkred';
//     ctx.fillRect(food.x, food.y, TILE_SIZE, TILE_SIZE);
//     ctx.strokeRect(food.x, food.y, TILE_SIZE, TILE_SIZE);
// }
// // 💥 게임 오버 판정
// function checkGameOver(): boolean {
//     const head = snake[0];
//     for (let i = 1; i < snake.length; i++) {
//         if (snake[i].x === head.x && snake[i].y === head.y) return true;
//     }
//     const hitLeftWall = head.x < 0;
//     const hitRightWall = head.x >= canvas.width;
//     const hitTopWall = head.y < 0;
//     const hitBottomWall = head.y >= canvas.height;
//     return hitLeftWall || hitRightWall || hitTopWall || hitBottomWall;
// }
// // ⌨️ 방향 전환 처리
// function changeDirection(event: KeyboardEvent): void {
//     if (changingDirection) return;
//     changingDirection = true;
//     const keyPressed = event.key;
//     const goingUp = dy === -TILE_SIZE;
//     const goingDown = dy === TILE_SIZE;
//     const goingLeft = dx === -TILE_SIZE;
//     const goingRight = dx === TILE_SIZE;
//     switch (keyPressed) {
//         case 'ArrowLeft':
//             if (!goingRight) { dx = -TILE_SIZE; dy = 0; }
//             break;
//         case 'ArrowUp':
//             if (!goingDown) { dx = 0; dy = -TILE_SIZE; }
//             break;
//         case 'ArrowRight':
//             if (!goingLeft) { dx = TILE_SIZE; dy = 0; }
//             break;
//         case 'ArrowDown':
//             if (!goingUp) { dx = 0; dy = TILE_SIZE; }
//             break;
//     }
// }
// // 🚀 시작
// document.addEventListener('keydown', changeDirection);
// initializeGame();