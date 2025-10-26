class BubbleMatchGame {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private grid: number[][]; // 방울 색상을 저장하는 2D 배열 (숫자로 색상 인덱스 표현)
    private GRID_SIZE: number = 7; // 그리드 크기 (5x5에서 7x7으로 변경)
    private CELL_SIZE: number; // 각 셀의 크기
    private COLORS: string[] = ['red', 'blue', 'green', 'purple', 'orange', 'yellow']; // 사용 가능한 6가지 색상
    private EMPTY_CELL: number = -1; // 빈 셀을 나타내는 값
    private score: number = 0; // 현재 점수
    private selectedBubble: { row: number, col: number } | null = null; // 선택된 방울의 좌표
    private isProcessing: boolean = false; // 매치 처리, 방울 낙하, 리필 등의 작업 중인지 여부 (중복 클릭 방지)
    private isGameOver: boolean = false; // 게임 오버 상태인지 여부 (새로 추가됨)
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
    private animatingPops: { color: number, x: number, y: number }[] = [];
    private popStartTime: number | null = null;
    private popDuration: number = 200; // 방울 터지는 애니메이션 지속 시간 (ms)
    // --- 애니메이션 관련 끝 ---
    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            console.error(`ID '${canvasId}'를 가진 캔버스를 찾을 수 없습니다.`);
            return;
        }
        this.ctx = this.canvas.getContext('2d')!;
        this.canvas.width = 600;
        this.canvas.height = 600;
        this.CELL_SIZE = this.canvas.width / this.GRID_SIZE; // GRID_SIZE 변경에 따라 CELL_SIZE 자동 조정
        // 애셋 로딩 후 게임 초기화 및 시작
        this.loadAssets().then(() => {
            this.initializeGrid();
            // 초기 그리드 상태를 한 번 그립니다. (자동 폭발 전)
            this.draw();
            // 게임 시작 시 바로 터지는 방울들을 처리합니다.
            this._startInitialMatchProcessing();
            this.attachEventListeners();
            console.log("게임이 시작되었습니다! 방울을 클릭하여 플레이하세요.");
        }).catch(error => {
            console.error("애셋 로딩 실패:", error);
            // 애셋 로딩 실패 시 폴백 (스프라이트/음악 없이 게임 진행)
            this.initializeGrid();
            this.draw(); // 폴백: 원형 방울로 그립니다.
            this._startInitialMatchProcessing();
            this.attachEventListeners();
            alert("애셋 로딩에 실패했습니다. 스프라이트 및 배경 음악/효과음 없이 게임이 시작됩니다.");
        });
    }
    /**
     * 게임에 필요한 이미지 및 오디오 애셋을 미리 로드합니다.
     */
    private loadAssets(): Promise<void> {
        return new Promise((resolve, reject) => {
            let loadedCount = 0;
            const totalAssets = 4; // spriteSheet, audioBGM, audioEat, backgroundImage (3 -> 4로 변경)
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
     */
    private handleCanvasClick(event: MouseEvent): void {
        // 브라우저의 자동 재생 정책으로 인해 배경 음악이 아직 재생되지 않았다면,
        // 사용자 클릭 이벤트 발생 시 재생을 시도합니다.
        if (this.audioBGM && this.audioBGM.paused) {
            this.audioBGM.play().catch(e => {
                console.warn("사용자 클릭으로 배경 음악 재생 시도 실패:", e);
            });
        }
        // 게임 처리, 애니메이션 중이거나 게임 오버 상태이면 클릭 무시
        if (this.isProcessing || this.isAnimatingMovement || this.animatingPops.length > 0 || this.isGameOver) {
            console.log("게임 처리 또는 애니메이션 중이거나 게임 오버 상태입니다. 잠시 기다려주세요.");
            return;
        }
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const col = Math.floor(mouseX / this.CELL_SIZE);
        const row = Math.floor(mouseY / this.CELL_SIZE);
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
     * @param popProgress 현재 터지는 애니메이션 진행률 (0~1). 기본값 0 (터지지 않음).
     */
    private draw(movementProgress: number = 1, popProgress: number = 0): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // 배경 이미지 그리기 (새로 추가됨)
        if (this.backgroundImage) {
            this.ctx.globalAlpha = 0.3; // 배경 이미지 투명도 30% 설정 (0.5 -> 0.7 -> 0.3로 변경)
            this.ctx.drawImage(this.backgroundImage, 0, 0, this.canvas.width, this.canvas.height);
            this.ctx.globalAlpha = 1.0; // 다른 요소들을 위해 투명도 원복
        }
        // 그리드 라인 그리기
        for (let r = 0; r < this.GRID_SIZE; r++) {
            for (let c = 0; c < this.GRID_SIZE; c++) {
                this.ctx.strokeStyle = '#ccc';
                this.ctx.lineWidth = 0.5;
                this.ctx.strokeRect(c * this.CELL_SIZE, r * this.CELL_SIZE, this.CELL_SIZE, this.CELL_SIZE);
            }
        }
        // 이동 애니메이션 중인 방울들의 목표 좌표를 추적하여 정적 방울 그리기에서 제외
        const movingTargetCoords = new Set<string>();
        if (this.isAnimatingMovement) {
            for (const move of this.animationQueue) {
                const targetR = Math.round(move.targetY / this.CELL_SIZE); // 부동소수점 오차 방지를 위해 반올림
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
                    const y = r * this.CELL_SIZE;
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
        // 3. 터지는 애니메이션 중인 방울 그리기 (가장 위에 그려짐)
        if (this.animatingPops.length > 0) {
            for (const popBubble of this.animatingPops) {
                this.drawPoppingBubble(popBubble.color, popBubble.x, popBubble.y, popProgress);
            }
        }
        // 점수 표시
        this.ctx.fillStyle = 'white';
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`점수: ${this.score}`, 10, 10);
        // 게임 오버 오버레이 (새로 추가됨)
        if (this.isGameOver) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // 반투명 검은색 오버레이
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 48px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('Game Over!', this.canvas.width / 2, this.canvas.height / 2 - 30);
            this.ctx.font = '24px Arial';
            this.ctx.fillText('No more moves possible.', this.canvas.width / 2, this.canvas.height / 2 + 20);
            this.ctx.fillText(`Final Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 60);
        }
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
     * 터지는 애니메이션 중인 단일 방울을 그리는 헬퍼 함수 (스프라이트 적용)
     * progress가 0이면 완전한 상태, 1이면 완전히 사라진 상태
     */
    private drawPoppingBubble(colorIndex: number, x: number, y: number, progress: number): void {
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
     * 그리드 좌표를 캔버스 픽셀 좌표로 변환합니다.
     */
    private getCanvasCoords(row: number, col: number): { x: number, y: number } {
        return {
            x: col * this.CELL_SIZE,
            y: row * this.CELL_SIZE
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
        const initialMatchesProcessed = await this._processMatchesCycle(); // 매치 처리 시작
        if (initialMatchesProcessed) {
            console.log("초기 매치가 성공적으로 처리되었습니다.");
        } else {
            console.log("초기 그리드에 즉시 터질 매치가 없었습니다.");
        }
        this.isProcessing = false; // 처리 완료 후 사용자 입력 허용
        this.draw(); // 최종 상태를 그립니다.
        this.checkGameOver(); // 초기 세팅 후 게임 오버 조건 확인
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
            // 되돌린 후에도 게임 오버 확인이 필요할 수 있으나, 일반적으로 매치가 없으면 게임 오버로 이어지지 않으므로 여기서는 생략.
            // (즉, 유효한 움직임을 시도한 것이 아니므로 게임 오버 조건 검사를 하지 않음)
            return;
        }
        // 5. 매치가 있는 경우, 연쇄 반응 처리
        await this._processMatchesCycle(); // _processMatchesCycle 내부에서 점수 업데이트 및 연쇄 반응 모두 처리
        this.isProcessing = false; // 모든 처리가 완료되면 플래그 해제
        this.draw(); // 모든 연쇄 반응이 끝난 후 최종 화면을 그립니다.
        this.checkGameOver(); // (새로 추가됨) 모든 턴이 끝난 후 게임 종료 조건을 확인합니다.
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
                    // 시작 Y 위치를 캔버스 위로 설정하여 떨어지는 애니메이션 생성
                    const startY = -this.CELL_SIZE * (r + 1); // 더 위에서 시작하여 더 길게 떨어지는 느낌
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
    private animatePop(removedBubbles: typeof this.animatingPops): Promise<void> {
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
        this.animatingPops = removedBubbles;
        this.popStartTime = performance.now();
        return new Promise(resolve => {
            const animatePopLoop = () => {
                const currentTime = performance.now();
                const progress = Math.min(1, (currentTime - this.popStartTime!) / this.popDuration);
                // draw 함수가 이동 애니메이션과 터지는 애니메이션을 동시에 처리할 수 있도록,
                // 이 시점에는 이동 애니메이션이 없으므로 movementProgress는 1, popProgress는 현재 진행률을 전달
                this.draw(1, progress);
                if (progress < 1) {
                    requestAnimationFrame(animatePopLoop);
                } else {
                    this.animatingPops = []; // 터지는 방울 목록 비우기
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
                        // 최적화: 동일한 색상의 방울을 교환하는 것은 새로운 매치를 생성하지 않으므로 건너뜁니다.
                        if (currentColor === adjacentColor) {
                            continue;
                        }
                        // 가상의 교환 수행
                        [tempGrid[r][c], tempGrid[nr][nc]] = [adjacentColor, currentColor];
                        // 가상의 그리드에서 매치 확인
                        const matches = this.findMatches(tempGrid);
                        // 가상의 교환 되돌리기 (다음 시뮬레이션을 위해 그리드 상태 복원)
                        [tempGrid[r][c], tempGrid[nr][nc]] = [currentColor, adjacentColor];
                        if (matches.size > 0) {
                            console.log(`[DEBUG] canMakeMove: 가능한 움직임 발견! (${r},${c})와 (${nr},${nc}) 교환 시 매치 생성.`);
                            console.log(`[DEBUG] 생성될 매치 좌표:`, Array.from(matches));
                            return true; // 가능한 움직임을 찾았습니다.
                        }
                    }
                }
            }
        }
        console.log(`[DEBUG] canMakeMove: 가능한 움직임이 없습니다. 게임 오버 조건 충족.`);
        return false; // 가능한 움직임이 없습니다.
    }
    /**
     * (새로 추가됨)
     * 게임 오버 조건을 확인하고, 게임 오버 시 상태를 업데이트합니다.
     */
    private checkGameOver(): void {
        if (!this.canMakeMove()) {
            this.isGameOver = true;
            console.log("Game Over! No more moves possible.");
            this.draw(); // 게임 오버 메시지를 표시하기 위해 화면을 다시 그립니다.
        } else {
            console.log("게임 오버 조건이 아닙니다. 가능한 움직임이 있습니다.");
        }
    }
}
// DOM이 완전히 로드된 후 게임을 초기화합니다.
document.addEventListener('DOMContentLoaded', () => {
    new BubbleMatchGame('gameCanvas');
});