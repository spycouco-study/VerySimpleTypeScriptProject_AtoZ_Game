class BubbleMatchGame {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private grid: number[][]; // 방울 색상을 저장하는 2D 배열 (숫자로 색상 인덱스 표현)
    private GRID_SIZE: number = 7; // 그리드 크기 (4x4에서 7x7으로 변경)
    private CELL_SIZE: number; // 각 셀의 크기
    private COLORS: string[] = ['red', 'blue', 'green', 'purple', 'orange', 'yellow']; // 사용 가능한 6가지 색상
    private EMPTY_CELL: number = -1; // 빈 셀을 나타내는 값
    private score: number = 0; // 현재 점수
    private selectedBubble: { row: number, col: number } | null = null; // 선택된 방울의 좌표
    private isProcessing: boolean = false; // 매치 처리, 방울 낙하, 리필 등의 작업 중인지 여부 (중복 클릭 방지)
    private isGameOver: boolean = false; // 게임 오버 상태인지 여부 (새로 추가됨)
    private gameOverReason: string = ''; // 게임 오버 원인을 저장할 새 속성
    private gameStarted: boolean = false; // 게임 시작 여부를 나타내는 새 속성
    // --- 새로운 상태바 및 시간 제한 관련 속성 ---
    private statusBarHeight: number = 40; // 상태바의 높이 (픽셀)
    private gameDuration: number = 60; // 게임 시간 제한 (초) - 1분으로 변경 (이전 120초)
    private timeRemaining: number; // 남은 시간 (초)
    private timerInterval: number | null = null; // setInterval ID를 저장할 변
    // --- 애셋 관련 새 속성 ---
    private spriteSheet: HTMLImageElement | null = null;
    private SPRITE_SHEET_PATH: string = 'assets/animals.png';
    private SPRITE_WIDTH: number = 250; // animals.png 내 개별 스프라이트의 가로 크기 (가정) - **수정됨**
    private SPRITE_HEIGHT: number = 250; // animals.png 내 개별 스프라이트의 세로 크기 (가정) - **수정됨**
    private spriteMap: { sx: number, sy: number }[] = []; // 각 colorIndex에 해당하는 스프라이트 시트 내 시작 X, Y 좌표
    private audioBGM: HTMLAudioElement | null = null;
    private audioEat: HTMLAudioElement | null = null;
    private BGM_PATH: string = 'assets/bgm.mp3';
    private EAT_SFX_PATH: string = 'assets/eat.mp3';
    // --- 배경 이미지 관련 새 속성 ---
    private backgroundImage: HTMLImageElement | null = null; // 배경 이미지를 위한 새 속성
    private BACKGROUND_IMAGE_PATH: string = 'assets/back.png'; // 배경 이미지 경로
    // --- 애셋 관련 끝 ---
    // --- 애니메이션 관련 새 속성 ---
    private animationQueue: { color: number, startX: number, startY: number, targetX: number, targetY: number }[] = [];
    private animationStartTime: number | null = null;
    private animationDuration: number = 250; // 방울 이동 애니메이션 지속 시간 (ms)
    private isAnimatingMovement: boolean = false; // 방울 이동 애니메이션 중인지 여부
    // 변경: animatingPops에 startTime 속성 추가
    private animatingPops: { color: number, x: number, y: number, startTime: number }[] = [];
    // private popStartTime: number | null = null; // 이제 각 방울이 개별 startTime을 가질 것이므로 필요 없음
    private popDuration: number = 200; // 방울 터지는 애니메이션 지속 시간 (ms)
    // 새로 추가된 방울 터짐 효과 스프라이트 관련 속성
    private popEffectSpriteSheet: HTMLImageElement | null = null;
    private POP_EFFECT_SPRITE_PATH: string = 'assets/bubble_effect.png';
    private POP_EFFECT_FRAME_WIDTH: number; // 동적으로 계산될 예정 (1535 / 5 = 307)
    private POP_EFFECT_FRAME_HEIGHT: number = 305;
    private POP_EFFECT_NUM_FRAMES: number = 5; // 1535px 너비에 5개 프레임 가정
    // --- 애니메이션 관련 끝 ---
    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            console.error(`ID '${canvasId}'를 가진 캔버스를 찾을 수 없습니다.`);
            return;
        }
        this.ctx = this.canvas.getContext('2d')!;
        this.canvas.width = 600;
        this.canvas.height = 600 + this.statusBarHeight; // 캔버스 높이에 상태바 높이 추가
        this.CELL_SIZE = this.canvas.width / this.GRID_SIZE; // GRID_SIZE 변경에 따라 CELL_SIZE 자동 조정
        this.timeRemaining = this.gameDuration; // 남은 시간 초기화
        // 애셋 로딩 후 게임 초기화 및 시작 (이제 바로 시작하지 않고 시작 화면을 그림)
        this.loadAssets().then(() => {
            this.drawStartScreen(); // 애셋 로딩 완료 후 시작 화면을 그립니다.
            console.log("애셋 로딩 완료. '게임시작' 버튼을 눌러 게임을 시작하세요.");
        }).catch(error => {
            console.error("애셋 로딩 실패:", error);
            // 애셋 로딩 실패 시 폴백 (스프라이트/음악 없이 게임 진행)
            // 즉시 게임을 시작하지 않고 시작 화면을 그립니다.
            this.drawStartScreen(); // 폴백 시에도 시작 화면을 그립니다.
            alert("애셋 로딩에 실패했습니다. 스프라이트 및 배경 음악/효과음 없이 게임이 시작됩니다.");
        });
        this.attachEventListeners(); // 이벤트 리스너는 게임 시작 전부터 활성화되어야 합니다.
    }
    /**
     * (새로 추가됨)
     * 게임 시작 전 화면에 '게임시작' 버튼 등을 그립니다.
     */
    private drawStartScreen(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // 배경 이미지 (옵션)
        if (this.backgroundImage) {
            this.ctx.globalAlpha = 1.0; // 시작 화면에서는 완전한 투명도로
            this.ctx.drawImage(this.backgroundImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = '#1a1a1a'; // 어두운 배경
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('Bubble Match!', this.canvas.width / 2, this.canvas.height / 2 - 50);
        // '게임시작' 버튼 영역 (텍스트 + 배경)
        const buttonText = '게임시작';
        const buttonWidth = 200;
        const buttonHeight = 60;
        // 캔버스 중앙에 버튼 위치 조정
        const buttonX = this.canvas.width / 2 - buttonWidth / 2;
        const buttonY = this.canvas.height / 2 + 20;
        this.ctx.fillStyle = '#4CAF50'; // 버튼 배경색
        this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
        this.ctx.strokeStyle = '#388E3C'; // 버튼 테두리
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 30px Arial';
        this.ctx.fillText(buttonText, this.canvas.width / 2, buttonY + buttonHeight / 2);
    }
    /**
     * (새로 추가됨)
     * 게임 시작 버튼 클릭 시 호출되어 실제 게임을 시작합니다.
     * 게임이 다시 시작될 때도 호출될 수 있도록 수정됩니다.
     */
    private async startGame(): Promise<void> {
        // 기존: if (this.gameStarted) return; // 이미 시작되었으면 다시 시작하지 않음
        // 수정: 이 플래그는 게임의 라이프사이클을 관리하는 데 사용되므로,
        // 새로 시작할 때는 항상 true로 설정하고 기존 상태를 초기화합니다.
        this.gameStarted = true; // 게임 시작 (또는 다시 시작)
        this.score = 0; // 점수 초기화
        this.timeRemaining = this.gameDuration; // 시간 초기화
        this.isGameOver = false; // 게임 오버 상태 초기화
        this.gameOverReason = ''; // 게임 오버 사유 초기화
        this.selectedBubble = null; // 선택된 방울 초기화
        // 타이머가 이미 실행 중이면 중지 (새 게임 시작 시)
        if (this.timerInterval !== null) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        // BGM이 재생 중이면 멈추고 처음으로 되감기 (새 게임 시작 시)
        if (this.audioBGM) {
            this.audioBGM.pause();
            this.audioBGM.currentTime = 0;
        }
        this.initializeGrid(); // 그리드 초기화
        this.draw(); // 초기 그리드 상태를 한 번 그립니다. (바로 위에 상태바가 표시됨)
        await this._startInitialMatchProcessing(); // 게임 시작 시 자동으로 터지는 매치 처리
        this.startTimer(); // 게임 시작과 함께 타이머 시작
        console.log("게임이 시작되었습니다! 방울을 클릭하여 플레이하세요.");
        // 배경 음악 재생 시도 (사용자 클릭 이벤트 내에서 호출되므로 자동재생 가능성 높음)
        if (this.audioBGM && this.audioBGM.paused) {
            this.audioBGM.play().catch(e => {
                console.warn("BGM 재생 시도 실패:", e);
            });
        }
    }
    /**
     * 게임에 필요한 이미지 및 오디오 애셋을 미리 로드합니다.
     */
    private loadAssets(): Promise<void> {
        return new Promise((resolve, reject) => {
            let loadedCount = 0;
            // totalAssets 수를 5로 변경: spriteSheet, audioBGM, audioEat, backgroundImage, popEffectSpriteSheet
            const totalAssets = 5; 
            const assetLoaded = () => {
                loadedCount++;
                if (loadedCount === totalAssets) {
                    resolve();
                }
            };
            // 스프라이트 시트 로드
            this.spriteSheet = new Image();
            this.spriteSheet.onload = () => {
                // 가정: animals.png는 6개의 스프라이트가 가로로 나열된 형태
                for (let i = 0; i < this.COLORS.length; i++) {
                    this.spriteMap.push({ sx: i * this.SPRITE_WIDTH, sy: 0 });
                }
                assetLoaded();
            };
            this.spriteSheet.onerror = () => {
                console.error(`스프라이트 시트 로딩 실패: ${this.SPRITE_SHEET_PATH}`);
                reject(`Failed to load ${this.SPRITE_SHEET_PATH}`);
            };
            this.spriteSheet.src = this.SPRITE_SHEET_PATH;
            // 배경 음악 로드
            this.audioBGM = new Audio(this.BGM_PATH);
            this.audioBGM.loop = true;
            this.audioBGM.oncanplaythrough = assetLoaded; // 재생 준비 완료 시 카운트
            this.audioBGM.onerror = () => {
                console.warn(`배경 음악 로딩 실패: ${this.BGM_PATH}. 게임은 계속 진행됩니다.`);
                assetLoaded(); // 경고 후에도 진행 (애셋 로드 카운트)
            };
            this.audioBGM.load(); // 오디오 명시적 로드
            // 효과음 로드
            this.audioEat = new Audio(this.EAT_SFX_PATH);
            this.audioEat.oncanplaythrough = assetLoaded;
            this.audioEat.onerror = () => {
                console.warn(`효과음 로딩 실패: ${this.EAT_SFX_PATH}. 게임은 계속 진행됩니다.`);
                assetLoaded(); // 경고 후에도 진행 (애셋 로드 카운트)
            };
            this.audioEat.load(); // 오디오 명시적 로드
            // 배경 이미지 로드 (새로 추가됨)
            this.backgroundImage = new Image();
            this.backgroundImage.onload = assetLoaded;
            this.backgroundImage.onerror = () => {
                console.warn(`배경 이미지 로딩 실패: ${this.BACKGROUND_IMAGE_PATH}. 게임은 계속 진행됩니다.`);
                assetLoaded(); // 경고 후에도 진행 (애셋 로드 카운트)
            };
            this.backgroundImage.src = this.BACKGROUND_IMAGE_PATH;
            // 방울 터짐 효과 스프라이트 시트 로드 (새로 추가됨)
            this.popEffectSpriteSheet = new Image();
            this.popEffectSpriteSheet.onload = () => {
                this.POP_EFFECT_FRAME_WIDTH = this.popEffectSpriteSheet!.width / this.POP_EFFECT_NUM_FRAMES;
                assetLoaded();
            };
            this.popEffectSpriteSheet.onerror = () => {
                console.error(`방울 터짐 효과 스프라이트 시트 로딩 실패: ${this.POP_EFFECT_SPRITE_PATH}`);
                // 이 애셋이 필수가 아닐 경우 resolve 대신 reject를 발생시키지 않을 수 있음
                // 여기서는 로딩 실패 시 에러를 반환합니다.
                reject(`Failed to load ${this.POP_EFFECT_SPRITE_PATH}`);
            };
            this.popEffectSpriteSheet.src = this.POP_EFFECT_SPRITE_PATH;
        });
    }
    /**
     * 게임 그리드를 무작위 방울로 초기화합니다.
     * 게임 시작 시 터뜨릴 수 있는 방울 그룹이 하나 이상 있도록 보장합니다.
     */
    private initializeGrid(): void {
        let initialMatchesFound = false;
        do {
            this.grid = Array(this.GRID_SIZE).fill(0).map(() => Array(this.GRID_SIZE).fill(this.EMPTY_CELL));
            for (let r = 0; r < this.GRID_SIZE; r++) {
                for (let c = 0; c < this.GRID_SIZE; c++) {
                    // 각 셀을 채울 때 매치 여부를 확인하지 않고 무작위 색상 할당
                    this.grid[r][c] = Math.floor(Math.random() * this.COLORS.length);
                }
            }
            // 그리드 전체를 채운 후, 형성된 매치가 있는지 확인
            if (this.findMatches(this.grid).size > 0) {
                initialMatchesFound = true;
            }
        } while (!initialMatchesFound); // 매치가 발견될 때까지 그리드 재생성 반복
    }
    /**
     * 주어진 위치 (r, c)에 방울을 놓았을 때,
     * 그 방울이 주변의 방울들과 함께 즉시 3개 이상의 매치를 형성하는지 확인합니다.
     * (주로 리필 시 사용)
     * @param targetGrid (선택 사항) 매치 확인에 사용할 그리드 (기본값: this.grid)
     */
    private hasMatchAt(r: number, c: number, targetGrid: number[][] = this.grid): boolean {
        const color = targetGrid[r][c];
        if (color === this.EMPTY_CELL) return false;
        // 수평 매치 확인 (왼쪽 두 칸)
        if (c > 1 && targetGrid[r][c - 1] === color && targetGrid[r][c - 2] === color) return true;
        // 수직 매치 확인 (위쪽 두 칸)
        if (r > 1 && targetGrid[r - 1][c] === color && targetGrid[r - 2][c] === color) return true;
        return false;
    }
    /**
     * 캔버스 클릭 이벤트 리스너를 부착합니다.
     */
    private attachEventListeners(): void {
        this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));
    }
    /**
     * 캔버스 클릭 이벤트 핸들러입니다.
     * 방울 선택 및 교환 로직을 처리합니다.
     * 게임 시작 전 '게임시작' 버튼과 게임 오버 후 '새 게임' 버튼 클릭도 처리합니다.
     */
    private handleCanvasClick(event: MouseEvent): void {
        // 브라우저의 자동 재생 정책으로 인해 배경 음악이 아직 재생되지 않았다면,
        // 사용자 클릭 이벤트 발생 시 재생을 시도합니다. (startGame()에서도 시도하지만, 혹시 몰라 한 번 더 시도)
        // 이 부분은 게임이 이미 시작되었고 게임 오버 상태가 아닐 때만 의미가 있습니다.
        if (this.audioBGM && this.audioBGM.paused && this.gameStarted && !this.isGameOver) {
            this.audioBGM.play().catch(e => {
                console.warn("사용자 클릭으로 배경 음악 재생 시도 실패:", e);
            });
        }
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        // --- 게임 오버 상태일 때 '새 게임' 버튼 클릭 처리 ---
        if (this.isGameOver) {
            const buttonWidth = 200;
            const buttonHeight = 60;
            const buttonX = this.canvas.width / 2 - buttonWidth / 2;
            const buttonY = (this.canvas.height + this.statusBarHeight) / 2 + 100; // draw()와 동일한 위치
            if (mouseX >= buttonX && mouseX <= buttonX + buttonWidth &&
                mouseY >= buttonY && mouseY <= buttonY + buttonHeight) {
                console.log("'새 게임' 버튼 클릭됨.");
                this.startGame(); // 새 게임 시작
            }
            return; // 게임 오버 상태에서는 다른 클릭 이벤트를 처리하지 않습니다.
        }
        // --- 게임 시작 전 '게임시작' 버튼 클릭 처리 ---
        if (!this.gameStarted) {
            // '게임시작' 버튼 영역 확인 (drawStartScreen()과 동일한 계산)
            const buttonWidth = 200;
            const buttonHeight = 60;
            const buttonX = this.canvas.width / 2 - buttonWidth / 2;
            const buttonY = this.canvas.height / 2 + 20;
            if (mouseX >= buttonX && mouseX <= buttonX + buttonWidth &&
                mouseY >= buttonY && mouseY <= buttonY + buttonHeight) {
                this.startGame(); // 버튼 클릭 시 게임 시작
            }
            return; // 게임이 시작되지 않았으면 더 이상 진행하지 않음
        }
        // --- 게임 플레이 중인 경우 (isGameOver = false, gameStarted = true) ---
        // 처리 또는 애니메이션 중이면 클릭 무시
        if (this.isProcessing || this.isAnimatingMovement || this.animatingPops.length > 0) {
            console.log("게임 처리 또는 애니메이션 중입니다. 잠시 기다려주세요.");
            return;
        }
        let mouseYAdjusted = mouseY - this.statusBarHeight;
        const col = Math.floor(mouseX / this.CELL_SIZE);
        const row = Math.floor(mouseYAdjusted / this.CELL_SIZE);
        if (row < 0 || row >= this.GRID_SIZE || col < 0 || col >= this.GRID_SIZE) {
            this.selectedBubble = null;
            this.draw();
            return;
        }
        if (this.selectedBubble === null) {
            this.selectedBubble = { row, col };
        } else {
            const r1 = this.selectedBubble.row;
            const c1 = this.selectedBubble.col;
            const r2 = row;
            const c2 = col;
            const isAdjacent = (Math.abs(r1 - r2) + Math.abs(c1 - c2)) === 1;
            if (isAdjacent) {
                this.trySwapAndMatch(r1, c1, r2, c2);
            } else {
                this.selectedBubble = { row, col };
                if (r1 === r2 && c1 === c2) {
                    this.selectedBubble = null;
                }
            }
        }
        this.draw();
    }
    /**
     * 게임 화면을 그립니다. (배경, 방울, 선택 하이라이트, 점수)
     * @param movementProgress 현재 이동 애니메이션 진행률 (0~1). 기본값 1 (정지 상태).
     * // @param popProgress 현재 터지는 애니메이션 진행률 (0~1). 기본값 0 (터지지 않음). -> 개별 방울에서 계산하므로 이 매개변수는 삭제
     */
    private draw(movementProgress: number = 1): void { // popProgress 매개변수 삭제
        // 게임이 시작되지 않았다면 시작 화면을 그립니다. (맨 처음 게임 시작 전 상태)
        if (!this.gameStarted) {
            this.drawStartScreen();
            return;
        }
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // --- 상태바 그리기 ---
        this.ctx.fillStyle = '#333'; // 상태바 배경색
        this.ctx.fillRect(0, 0, this.canvas.width, this.statusBarHeight);
        // 점수 표시 (상태바 내)
        this.ctx.fillStyle = 'white';
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle'; // 텍스트를 세로 중앙에 배치
        this.ctx.fillText(`점수: ${this.score}`, 10, this.statusBarHeight / 2);
        // 시간 표시 (상태바 내)
        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = this.timeRemaining % 60;
        const timeText = `시간: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        this.ctx.textAlign = 'right';
        // 시간이 10초 이하일 경우 빨간색으로 표시
        this.ctx.fillStyle = this.timeRemaining <= 10 && this.timeRemaining > 0 ? 'red' : 'white'; 
        this.ctx.fillText(timeText, this.canvas.width - 10, this.statusBarHeight / 2);
        this.ctx.textAlign = 'left'; // 기본 정렬로 되돌림
        // --- 게임 영역 그리기 (모든 Y 좌표에 statusBarHeight 오프셋 적용) ---
        // 배경 이미지 그리기
        if (this.backgroundImage) {
            this.ctx.globalAlpha = 0.3; // 배경 이미지 투명도 30% 설정
            // drawImage의 y 좌표 및 height 조정
            this.ctx.drawImage(this.backgroundImage, 0, this.statusBarHeight, this.canvas.width, this.canvas.height - this.statusBarHeight);
            this.ctx.globalAlpha = 1.0; // 다른 요소들을 위해 투명도 원복
        }
        // 그리드 라인 그리기
        for (let r = 0; r < this.GRID_SIZE; r++) {
            for (let c = 0; c < this.GRID_SIZE; c++) {
                this.ctx.strokeStyle = '#ccc';
                this.ctx.lineWidth = 0.5;
                // Y 좌표에 statusBarHeight 추가
                this.ctx.strokeRect(c * this.CELL_SIZE, r * this.CELL_SIZE + this.statusBarHeight, this.CELL_SIZE, this.CELL_SIZE);
            }
        }
        // 이동 애니메이션 중인 방울들의 목표 좌표를 추적하여 정적 방울 그리기에서 제외
        const movingTargetCoords = new Set<string>();
        if (this.isAnimatingMovement) {
            for (const move of this.animationQueue) {
                // 목표 Y 픽셀 좌표에서 statusBarHeight를 뺀 값으로 행 계산
                const targetR = Math.round((move.targetY - this.statusBarHeight) / this.CELL_SIZE);
                const targetC = Math.round(move.targetX / this.CELL_SIZE);
                movingTargetCoords.add(`${targetR},${targetC}`);
            }
        }
        // 1. 그리드의 정적 방울 그리기 (움직이지 않거나 움직임 애니메이션이 끝난 방울)
        for (let r = 0; r < this.GRID_SIZE; r++) {
            for (let c = 0; c < this.GRID_SIZE; c++) {
                const bubbleColorIndex = this.grid[r][c]; // this.grid는 항상 최종 상태를 반영
                if (bubbleColorIndex !== this.EMPTY_CELL && !movingTargetCoords.has(`${r},${c}`)) {
                    const x = c * this.CELL_SIZE;
                    const y = r * this.CELL_SIZE + this.statusBarHeight; // Y 좌표에 statusBarHeight 추가
                    // FIX: isSelected가 'boolean | null' 타입이 될 수 있으므로, 명시적으로 boolean으로 변환
                    const isSelected: boolean = !!(this.selectedBubble && this.selectedBubble.row === r && this.selectedBubble.col === c);
                    this.drawBubble(bubbleColorIndex, x, y, isSelected);
                }
            }
        }
        // 2. 이동 애니메이션 중인 방울 그리기 (정적 방울 위에 그려짐)
        if (this.isAnimatingMovement) {
            for (const bubble of this.animationQueue) {
                const currentX = bubble.startX + (bubble.targetX - bubble.startX) * movementProgress;
                const currentY = bubble.startY + (bubble.targetY - bubble.startY) * movementProgress;
                this.drawBubble(bubble.color, currentX, currentY, false); // 이동 중에는 선택 하이라이트 없음
            }
        }
        // 3. 터지는 애니메이션 중인 방울 그리기 (가장 위에 그려짐) - 이제 개별 progress 사용
        // 이 루프에서 drawBubbleFade와 drawPopEffectSprite를 모두 호출
        const currentTime = performance.now();
        for (const popBubble of this.animatingPops) {
            const popProgress = Math.min(1, (currentTime - popBubble.startTime) / this.popDuration);
            if (popProgress < 1) { // 애니메이션이 아직 끝나지 않았다면
                this.drawBubbleFade(popBubble.color, popBubble.x, popBubble.y, popProgress);
                this.drawPopEffectSprite(popBubble.x, popBubble.y, popProgress);
            }
        }
        // 게임 오버 오버레이 (시간 초과 또는 더 이상 움직일 수 없을 때 표시)
        if (this.isGameOver) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // 반투명 검은색 오버레이
            // Y 좌표 및 높이 조정
            this.ctx.fillRect(0, this.statusBarHeight, this.canvas.width, this.canvas.height - this.statusBarHeight);
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            // 텍스트 Y 좌표 조정: (캔버스 총 높이 + 상태바 높이) / 2 - 30 (중앙에 가깝게)
            this.ctx.fillText('Game Over!', this.canvas.width / 2, (this.canvas.height + this.statusBarHeight) / 2 - 30);
            this.ctx.font = '24px Arial';
            // 게임 오버 원인 표시
            this.ctx.fillText(this.gameOverReason, this.canvas.width / 2, (this.canvas.height + this.statusBarHeight) / 2 + 20);
            this.ctx.fillText(`Final Score: ${this.score}`, this.canvas.width / 2, (this.canvas.height + this.statusBarHeight) / 2 + 60);
            // --- '새 게임' 버튼 추가 ---
            const buttonText = '새 게임';
            const buttonWidth = 200;
            const buttonHeight = 60;
            const buttonX = this.canvas.width / 2 - buttonWidth / 2;
            const buttonY = (this.canvas.height + this.statusBarHeight) / 2 + 100; // 게임 오버 텍스트 아래에 위치
            this.ctx.fillStyle = '#4CAF50'; // 버튼 배경색
            this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
            this.ctx.strokeStyle = '#388E3C'; // 버튼 테두리
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 30px Arial';
            this.ctx.fillText(buttonText, this.canvas.width / 2, buttonY + buttonHeight / 2);
        } 
        // 기존 '더 이상 움직일 수 없습니다!' 경고 메시지 로직은 `endGame()`에서 `isGameOver`를 설정하므로 제거됩니다.
    }
    /**
     * 단일 방울을 그리는 헬퍼 함수 (스프라이트 적용)
     */
    private drawBubble(colorIndex: number, x: number, y: number, isSelected: boolean): void {
        if (colorIndex === this.EMPTY_CELL) return;
        // 스프라이트 시트가 로드되었고 해당 스프라이트 정보가 있다면 이미지를 그립니다.
        if (this.spriteSheet && this.spriteMap[colorIndex]) {
            const spriteInfo = this.spriteMap[colorIndex];
            // 셀 크기에 맞춰 스프라이트를 그릴 크기 조정 (약간의 패딩)
            const drawSize = this.CELL_SIZE - 10;
            const offsetX = (this.CELL_SIZE - drawSize) / 2;
            const offsetY = (this.CELL_SIZE - drawSize) / 2;
            this.ctx.drawImage(
                this.spriteSheet,
                spriteInfo.sx,
                spriteInfo.sy,
                this.SPRITE_WIDTH,
                this.SPRITE_HEIGHT,
                x + offsetX,
                y + offsetY,
                drawSize,
                drawSize
            );
        } else {
            // 스프라이트 로딩에 실패했거나 정보가 없는 경우, 기존처럼 색상 원형 방울을 그립니다.
            this.ctx.fillStyle = this.COLORS[colorIndex];
            this.ctx.beginPath();
            this.ctx.arc(
                x + this.CELL_SIZE / 2,
                y + this.CELL_SIZE / 2,
                this.CELL_SIZE / 2 - 5,
                0,
                Math.PI * 2
            );
            this.ctx.fill();
            this.ctx.strokeStyle = 'black';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
        }
        if (isSelected) {
            this.ctx.strokeStyle = 'cyan';
            this.ctx.lineWidth = 4;
            this.ctx.beginPath();
            this.ctx.arc(
                x + this.CELL_SIZE / 2,
                y + this.CELL_SIZE / 2,
                this.CELL_SIZE / 2 - 3,
                0,
                Math.PI * 2
            );
            this.ctx.stroke();
        }
    }
    /**
     * 터지는 애니메이션 중인 단일 방울의 사라지는 모습을 그리는 헬퍼 함수 (스프라이트 적용)
     * progress가 0이면 완전한 상태, 1이면 완전히 사라진 상태
     * (기존 drawPoppingBubble 함수가 drawBubbleFade로 이름 변경됨)
     */
    private drawBubbleFade(colorIndex: number, x: number, y: number, progress: number): void {
        const opacity = 1 - progress; // 투명도: 1에서 0으로 감소
        const scale = 1 - progress * 0.5; // 크기: 1에서 0.5로 감소 (절반 크기까지 줄어듦)
        if (opacity <= 0 || scale <= 0) return; // 완전히 사라지면 그리지 않음
        this.ctx.save();
        this.ctx.globalAlpha = opacity;
        // 스프라이트 시트가 로드되었고 해당 스프라이트 정보가 있다면 이미지를 그립니다.
        if (this.spriteSheet && this.spriteMap[colorIndex]) {
            const spriteInfo = this.spriteMap[colorIndex];
            const initialDrawSize = this.CELL_SIZE - 10; // drawBubble과 동일하게 초기 그리기 크기 설정
            const currentDrawSize = initialDrawSize * scale;
            const offsetX = (this.CELL_SIZE - currentDrawSize) / 2;
            const offsetY = (this.CELL_SIZE - currentDrawSize) / 2;
            this.ctx.drawImage(
                this.spriteSheet,
                spriteInfo.sx,
                spriteInfo.sy,
                this.SPRITE_WIDTH,
                this.SPRITE_HEIGHT,
                x + offsetX,
                y + offsetY,
                currentDrawSize,
                currentDrawSize
            );
        } else {
            // 스프라이트 로딩에 실패했거나 정보가 없는 경우, 기존처럼 색상 원형 방울을 그립니다.
            const radius = (this.CELL_SIZE / 2 - 5) * scale;
            this.ctx.fillStyle = this.COLORS[colorIndex];
            this.ctx.beginPath();
            this.ctx.arc(
                x + this.CELL_SIZE / 2,
                y + this.CELL_SIZE / 2,
                radius,
                0,
                Math.PI * 2
            );
            this.ctx.fill();
            this.ctx.strokeStyle = 'black';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
        }
        this.ctx.restore();
    }
    /**
     * 터지는 방울 위에 재생되는 효과 스프라이트를 그리는 헬퍼 함수
     * progress는 0에서 1까지 진행되며, 효과의 프레임과 크기, 투명도에 영향을 줍니다.
     */
    private drawPopEffectSprite(x: number, y: number, progress: number): void {
        // 효과 스프라이트 시트가 로드되지 않았거나 애니메이션이 완료되면 그리지 않음
        if (!this.popEffectSpriteSheet || progress >= 1) return;
        // 현재 애니메이션 프레임 인덱스 계산
        const currentFrameIndex = Math.min(
            this.POP_EFFECT_NUM_FRAMES - 1,
            Math.floor(progress * this.POP_EFFECT_NUM_FRAMES)
        );
        const sx = currentFrameIndex * this.POP_EFFECT_FRAME_WIDTH;
        const sy = 0; // 가정: 모든 프레임이 첫 번째 행에 있음
        // 효과 스프라이트의 크기 및 위치 조정 (방울 중앙에 오도록)
        // 예를 들어, 방울 크기보다 약간 작게 시작하여 커지면서 퍼져나가는 효과
        const initialEffectSize = this.CELL_SIZE * 0.8; // 방울보다 약간 작게 시작
        const maxEffectSize = this.CELL_SIZE * 1.5; // 최대 크기 (방울의 1.5배)
        const currentEffectSize = initialEffectSize + (maxEffectSize - initialEffectSize) * progress;
        const offsetX = (this.CELL_SIZE - currentEffectSize) / 2;
        const offsetY = (this.CELL_SIZE - currentEffectSize) / 2;
        const alpha = 1 - progress; // 효과는 진행될수록 투명해짐
        this.ctx.save();
        this.ctx.globalAlpha = alpha; // 투명도 적용
        this.ctx.drawImage(
            this.popEffectSpriteSheet,
            sx,
            sy,
            this.POP_EFFECT_FRAME_WIDTH,
            this.POP_EFFECT_FRAME_HEIGHT,
            x + offsetX,
            y + offsetY,
            currentEffectSize,
            currentEffectSize
        );
        this.ctx.restore();
    }
    /**
     * 그리드 좌표를 캔버스 픽셀 좌표로 변환합니다.
     * 상태바 높이를 고려하여 Y 좌표를 조정합니다.
     */
    private getCanvasCoords(row: number, col: number): { x: number, y: number } {
        return {
            x: col * this.CELL_SIZE,
            y: row * this.CELL_SIZE + this.statusBarHeight // Y 좌표에 statusBarHeight 추가
        };
    }
    /**
     * 게임 시작 시 그리드에 존재하는 초기 매치들을 자동으로 처리합니다.
     * `constructor`에서 `await` 없이 호출하기 위한 비동기 래퍼입니다.
     */
    private async _startInitialMatchProcessing(): Promise<void> {
        this.isProcessing = true; // 초기 처리 중 사용자 입력 방지
        console.log("게임 시작 시 초기 매치 처리 중...");
        // 배경 음악이 준비되었다면 재생 시도 (브라우저 정책으로 실패할 수 있음)
        if (this.audioBGM) {
            this.audioBGM.play().catch(e => {
                console.warn("BGM 자동 재생이 차단되었습니다. 사용자 클릭 시 재생을 시도합니다.", e);
            });
        }
        await this._processMatchesCycle(); // 매치 처리 시작
        this.isProcessing = false; // 처리 완료 후 사용자 입력 허용
        this.draw(); // 최종 상태를 그립니다.
        this.endGame(); // 수정: 초기 그리드 처리 후 게임 오버 조건을 확인합니다.
    }
    /**
     * 매치를 찾아 제거하고, 중력을 적용하며, 리필하는 일련의 과정을 매치가 없을 때까지 반복합니다.
     * 점수 업데이트도 이 안에서 이루어집니다.
     * @returns {Promise<boolean>} 매치가 한 번이라도 처리되었으면 true, 아니면 false를 반환합니다.
     */
    private async _processMatchesCycle(): Promise<boolean> {
        let matchesFoundInCycle = false;
        let matches = this.findMatches();
        while (matches.size > 0) {
            matchesFoundInCycle = true;
            this.score += matches.size; // 매치된 방울 수만큼 점수 추가
            // 1. 매치된 방울 제거 및 터지는 애니메이션
            const removedBubbleInfo: { color: number, x: number, y: number }[] = [];
            for (const matchKey of matches) {
                const [r, c] = matchKey.split(',').map(Number);
                const coords = this.getCanvasCoords(r, c);
                removedBubbleInfo.push({ color: this.grid[r][c], x: coords.x, y: coords.y });
                this.grid[r][c] = this.EMPTY_CELL; // 그리드에서 즉시 제거
            }
            this.draw(); // 빈 셀 상태를 먼저 그립니다.
            await this.animatePop(removedBubbleInfo); // 터지는 애니메이션 시작 및 완료 대기
            // 2. 중력 적용 및 리필 계산
            const { movements, finalGridState } = this.calculateGravityAndRefillChanges();
            this.grid = finalGridState; // 실제 grid를 계산된 최종 상태로 업데이트
            await this.animateMovement(movements); // 방울 이동 애니메이션 시작 및 완료 대기
            // 3. 중력 적용 및 리필로 인해 새로운 매치가 생겼는지 다시 확인 (연쇄 반응)
            matches = this.findMatches();
        }
        return matchesFoundInCycle;
    }
    /**
     * 두 방울을 교환하고, 매치를 확인하며, 매치 처리(제거, 중력, 리필)를 수행합니다.
     * 연쇄 반응을 처리하기 위해 매치가 더 이상 없을 때까지 반복합니다.
     */
    private async trySwapAndMatch(r1: number, c1: number, r2: number, c2: number): Promise<void> {
        this.isProcessing = true; // 처리 중 플래그 설정
        this.selectedBubble = null; // 선택 상태 해제
        const color1 = this.grid[r1][c1];
        const color2 = this.grid[r2][c2];
        const coords1 = this.getCanvasCoords(r1, c1);
        const coords2 = this.getCanvasCoords(r2, c2);
        // 1. 방울 교환 애니메이션을 위한 움직임 정보 생성
        const swapMovements = [
            { color: color1, startX: coords1.x, startY: coords1.y, targetX: coords2.x, targetY: coords2.y },
            { color: color2, startX: coords2.x, startY: coords2.y, targetX: coords1.x, targetY: coords1.y }
        ];
        // 2. 논리적 그리드를 즉시 교환된 상태로 업데이트
        this.grid[r1][c1] = color2;
        this.grid[r2][c2] = color1;
        // 3. 교환 애니메이션 실행 및 완료 대기
        await this.animateMovement(swapMovements);
        // 4. 매치 확인
        let matches = this.findMatches();
        if (matches.size === 0) {
            // 매치가 없는 경우, 방울을 원래대로 되돌리고 턴을 종료합니다.
            // 되돌리는 애니메이션을 위한 움직임 정보 생성
            const revertMovements = [
                { color: color1, startX: coords2.x, startY: coords2.y, targetX: coords1.x, targetY: coords1.y },
                { color: color2, startX: coords1.x, startY: coords1.y, targetX: coords2.x, targetY: coords2.y }
            ];
            // 논리적 그리드를 원래 상태로 되돌립니다.
            this.grid[r1][c1] = color1;
            this.grid[r2][c2] = color2;
            await this.animateMovement(revertMovements); // 되돌리는 애니메이션 실행
            this.isProcessing = false;
            this.draw(); // 최종 상태 그리기
            return;
        }
        // 5. 매치가 있는 경우, 연쇄 반응 처리
        await this._processMatchesCycle(); // _processMatchesCycle 내부에서 점수 업데이트 및 연쇄 반응 모두 처리
        this.isProcessing = false; // 모든 처리가 완료되면 플래그 해제
        this.draw(); // 모든 연쇄 반응이 끝난 후 최종 화면을 그립니다.
        this.endGame(); // 모든 턴이 끝난 후 게임 종료 조건을 확인합니다.
    }
    /**
     * 현재 그리드에서 3개 이상의 방울이 수평 또는 수직으로 일치하는 모든 매치를 찾아 반환합니다.
     * 중복을 피하기 위해 Set<string> 형태로 좌표를 저장합니다 ("row,col" 형식).
     * @param targetGrid (선택 사항) 매치 확인에 사용할 그리드 (기본값: this.grid)
     */
    private findMatches(targetGrid: number[][] = this.grid): Set<string> { // targetGrid 매개변수 추가
        const matches = new Set<string>();
        const addMatch = (r: number, c: number) => matches.add(`${r},${c}`);
        // 수평 매치 확인
        for (let r = 0; r < this.GRID_SIZE; r++) {
            for (let c = 0; c < this.GRID_SIZE - 2; c++) {
                const color = targetGrid[r][c]; // targetGrid 사용
                if (color === this.EMPTY_CELL) continue;
                if (targetGrid[r][c + 1] === color && targetGrid[r][c + 2] === color) { // targetGrid 사용
                    addMatch(r, c);
                    addMatch(r, c + 1);
                    addMatch(r, c + 2);
                    let i = c + 3;
                    while (i < this.GRID_SIZE && targetGrid[r][i] === color) { // targetGrid 사용
                        addMatch(r, i);
                        i++;
                    }
                }
            }
        }
        // 수직 매치 확인
        for (let c = 0; c < this.GRID_SIZE; c++) {
            for (let r = 0; r < this.GRID_SIZE - 2; r++) {
                const color = targetGrid[r][c]; // targetGrid 사용
                if (color === this.EMPTY_CELL) continue;
                if (targetGrid[r + 1][c] === color && targetGrid[r + 2][c] === color) { // targetGrid 사용
                    addMatch(r, c);
                    addMatch(r + 1, c);
                    addMatch(r + 2, c);
                    let i = r + 3;
                    while (i < this.GRID_SIZE && targetGrid[i][c] === color) { // targetGrid 사용
                        addMatch(i, c);
                        i++;
                    }
                }
            }
        }
        return matches;
    }
    /**
     * 중력 적용 및 빈 공간 리필에 따른 방울들의 움직임과 최종 그리드 상태를 계산합니다.
     * 이 함수는 실제 `this.grid`를 변경하지 않고, 변경될 내용을 반환합니다.
     */
    private calculateGravityAndRefillChanges(): { movements: typeof this.animationQueue, finalGridState: number[][] } {
        const movements: typeof this.animationQueue = [];
        const tempGrid = Array.from(this.grid.map(row => Array.from(row))); // 현재 그리드의 복사본 (임시 작업용)
        // 1. 중력 적용 계산
        for (let c = 0; c < this.GRID_SIZE; c++) { // 각 열에 대해
            let emptyRow = this.GRID_SIZE - 1; // 해당 열에서 가장 아래쪽에 있는 빈 셀의 위치
            for (let r = this.GRID_SIZE - 1; r >= 0; r--) { // 열의 바닥에서부터 위로 탐색
                if (tempGrid[r][c] !== this.EMPTY_CELL) {
                    // 현재 셀에 방울이 있다면
                    if (emptyRow !== r) {
                        // 방울이 이동해야 할 경우, 움직임 정보 기록
                        const color = tempGrid[r][c];
                        const startCoords = this.getCanvasCoords(r, c);
                        const targetCoords = this.getCanvasCoords(emptyRow, c);
                        movements.push({ color, startX: startCoords.x, startY: startCoords.y, targetX: targetCoords.x, targetY: targetCoords.y });
                        tempGrid[emptyRow][c] = color; // 임시 그리드에 방울 이동 적용
                        tempGrid[r][c] = this.EMPTY_CELL; // 원래 위치를 빈 상태로 만듭니다.
                    }
                    emptyRow--; // 다음 빈 셀을 찾기 위해 위로 이동
                }
            }
        }
        // 2. 빈 공간 리필 계산
        for (let r = 0; r < this.GRID_SIZE; r++) { // 각 행에 대해
            for (let c = 0; c < this.GRID_SIZE; c++) {
                if (tempGrid[r][c] === this.EMPTY_CELL) {
                    let newColor: number;
                    do {
                        newColor = Math.floor(Math.random() * this.COLORS.length);
                        tempGrid[r][c] = newColor; // 임시 그리드에 새로운 방울 할당
                    } while (this.hasMatchAt(r, c, tempGrid)); // 임시 그리드 상태를 기반으로 매치 확인
                    // 새로운 방울은 화면 상단 밖에서 떨어져 내려오는 것으로 간주
                    const targetCoords = this.getCanvasCoords(r, c);
                    // 시작 Y 위치를 캔버스 위로 설정하여 떨어지는 애니메이션 생성 (상태바 높이 포함)
                    const startY = -this.CELL_SIZE * (r + 1) + this.statusBarHeight; 
                    movements.push({ color: newColor, startX: targetCoords.x, startY: startY, targetX: targetCoords.x, targetY: targetCoords.y });
                }
            }
        }
        return { movements, finalGridState: tempGrid };
    }
    /**
     * 방울의 움직임을 애니메이션합니다.
     */
    private animateMovement(movements: typeof this.animationQueue): Promise<void> {
        if (movements.length === 0) {
            this.draw(); // 최종 정지 상태를 그립니다.
            return Promise.resolve();
        }
        this.animationQueue = movements;
        this.isAnimatingMovement = true;
        this.animationStartTime = performance.now();
        return new Promise(resolve => {
            const animateLoop = () => {
                const currentTime = performance.now();
                const progress = Math.min(1, (currentTime - this.animationStartTime!) / this.animationDuration);
                this.draw(progress); // 현재 진행률로 화면을 그립니다.
                if (progress < 1) {
                    requestAnimationFrame(animateLoop); // 다음 프레임 요청
                } else {
                    // 애니메이션 완료
                    this.isAnimatingMovement = false;
                    this.animationQueue = []; // 대기열 비우기
                    this.draw(); // 최종 정지 상태를 그립니다.
                    resolve();
                }
            };
            requestAnimationFrame(animateLoop); // 첫 번째 애니메이션 프레임 요청
        });
    }
    /**
     * 매치되어 제거되는 방울들의 터지는 애니메이션을 수행합니다.
     */
    private animatePop(removedBubbles: { color: number, x: number, y: number }[]): Promise<void> {
        if (removedBubbles.length === 0) {
            this.draw();
            return Promise.resolve();
        }
        // 효과음 재생
        if (this.audioEat) {
            // 한 번의 터지는 애니메이션에 하나의 효과음 재생
            this.audioEat.currentTime = 0; // 효과음을 처음부터 재생
            this.audioEat.play().catch(e => console.warn("효과음 재생 실패:", e));
        }
        // 기존 animatingPops에 startTime 추가
        this.animatingPops = removedBubbles.map(bubble => ({ ...bubble, startTime: performance.now() }));
        // this.popStartTime = performance.now(); // 이제 각 방울이 개별 startTime을 가질 것이므로 이 줄은 필요 없음.
        return new Promise(resolve => {
            const animatePopLoop = () => {
                const currentTime = performance.now();
                // 완료되지 않은 애니메이션만 유지
                this.animatingPops = this.animatingPops.filter(popBubble => {
                    const progress = (currentTime - popBubble.startTime) / this.popDuration;
                    return progress < 1;
                });
                // draw 함수를 호출하여 현재 애니메이션 프레임을 그립니다.
                // 이동 애니메이션은 없고, popProgress는 drawBubbleFade/drawPopEffectSprite에서 개별적으로 계산합니다.
                this.draw(1); 
                if (this.animatingPops.length > 0) {
                    requestAnimationFrame(animatePopLoop);
                } else {
                    // 모든 방울 터짐 애니메이션 완료
                    // this.animatingPops = []; // 필터링으로 이미 비워짐
                    this.draw(); // 최종 정지 상태를 그립니다.
                    resolve();
                }
            };
            requestAnimationFrame(animatePopLoop);
        });
    }
    /**
     * 지정된 밀리초(ms)만큼 대기하는 비동기 딜레이 함수입니다.
     * 애니메이션 및 시각적 피드백을 위해 사용됩니다.
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * (새로 추가됨)
     * 게임 타이머를 시작합니다.
     */
    private startTimer(): void {
        if (this.timerInterval !== null) {
            clearInterval(this.timerInterval);
        }
        this.timerInterval = setInterval(() => {
            if (this.isGameOver) { // 게임 오버 상태면 타이머 중지
                clearInterval(this.timerInterval!);
                this.timerInterval = null;
                return;
            }
            this.timeRemaining--;
            this.draw(); // 매 초 화면 업데이트
            if (this.timeRemaining <= 0) {
                clearInterval(this.timerInterval!);
                this.timerInterval = null;
                this.endGame(true); // 시간 초과로 인한 게임 오버 처리
            }
        }, 1000) as unknown as number; // setInterval의 반환 값 타입 추론 오류 방지
    }
    /**
     * (새로 추가됨)
     * 현재 그리드 상태에서 가능한 움직임이 있는지 확인합니다.
     * 어떤 인접한 방울을 교환했을 때 매치가 발생하면 true를 반환합니다.
     */
    private canMakeMove(): boolean {
        // 현재 그리드의 깊은 복사본을 만듭니다.
        const tempGrid = Array.from(this.grid.map(row => Array.from(row)));
        // 모든 셀을 순회합니다.
        for (let r = 0; r < this.GRID_SIZE; r++) {
            for (let c = 0; c < this.GRID_SIZE; c++) {
                const currentColor = tempGrid[r][c];
                if (currentColor === this.EMPTY_CELL) continue;
                // 인접한 셀 (오른쪽, 아래)만 확인하여 모든 고유한 쌍을 커버합니다.
                const directions = [[0, 1], [1, 0]]; // [dr, dc] -> [오른쪽, 아래]
                for (const [dr, dc] of directions) {
                    const nr = r + dr;
                    const nc = c + dc;
                    // 유효한 그리드 범위 내에 있는지 확인
                    if (nr >= 0 && nr < this.GRID_SIZE && nc >= 0 && nc < this.GRID_SIZE) {
                        const adjacentColor = tempGrid[nr][nc];
                        // 가상의 교환 수행
                        [tempGrid[r][c], tempGrid[nr][nc]] = [adjacentColor, currentColor];
                        // 가상의 그리드에서 매치 확인
                        const matches = this.findMatches(tempGrid);
                        // 가상의 교환 되돌리기 (다음 시뮬레이션을 위해 그리드 상태 복원)
                        [tempGrid[r][c], tempGrid[nr][nc]] = [currentColor, adjacentColor];
                        if (matches.size > 0) {
                            // console.log(`[DEBUG] canMakeMove: 가능한 움직임 발견! (${r},${c})와 (${nr},${nc}) 교환 시 매치 생성.`);
                            // console.log(`[DEBUG] 생성될 매치 좌표:`, Array.from(matches));
                            return true; // 가능한 움직임을 찾았습니다.
                        }
                    }
                }
            }
        }
        // console.log(`[DEBUG] canMakeMove: 가능한 움직임이 없습니다. 게임 오버 조건 충족.`);
        return false; // 가능한 움직임이 없습니다.
    }
    /**
     * (새로 추가됨)
     * 게임 오버 조건을 확인하고, 게임 오버 시 상태를 업데이트합니다.
     * @param timedOut 시간 제한으로 게임 오버가 발생했는지 여부
     */
    private endGame(timedOut: boolean = false): void {
        if (this.isGameOver) return; // 이미 게임 오버 상태면 중복 처리 방지
        // 게임 오버 원인을 먼저 판단
        if (timedOut) {
            this.gameOverReason = "Time's Up!";
        } else if (!this.canMakeMove()) {
            this.gameOverReason = "No More Moves!";
        } else {
            // 게임 오버 조건에 해당하지 않는 경우
            console.log("게임 오버 조건이 아닙니다. 가능한 움직임이 있습니다.");
            return;
        }
        // 게임 오버 상태로 진입
        this.isGameOver = true;
        console.log(`Game Over! Reason: ${this.gameOverReason}`);
        // 타이머 중지
        if (this.timerInterval !== null) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        // 게임 오버 오버레이를 표시하기 위해 화면 업데이트
        this.draw();
    }
}
// DOM이 완전히 로드된 후 게임을 초기화합니다.
document.addEventListener('DOMContentLoaded', () => {
    new BubbleMatchGame('gameCanvas');
});