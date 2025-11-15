interface AssetImageData {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface SoundData {
    name: string;
    path: string;
    volume: number;
    loop: boolean;
}

interface GameAssets {
    images: { [key: string]: HTMLImageElement };
    sounds: { [key: string]: HTMLAudioElement };
}

interface GameConfig {
    boardWidth: number;
    boardHeight: number;
    hiddenRows: number;
    cellSize: number;
    puyoColors: string[];
    gravitySpeed: number;
    fallAcceleration: number;
    resolutionFallSpeed: number; // New config for faster falling during resolution
    minMatchCount: number;
    chainBonusMultiplier: number;
    scorePerPuyo: number;
    titleScreenText: string;
    startPromptText: string;
    gameOverText: string;
    gameOverPromptText: string;
    nextPuyoPreviewCount: number;
    uiPanelWidthCells: number;
}

interface KeyConfig {
    moveLeft: string;
    moveRight: string;
    moveDown: string;
    rotateLeft: string;
    rotateRight: string;
    startGame: string;
    hardDrop: string; // Added for hard drop functionality
}

interface DataJson {
    game: GameConfig;
    keys: KeyConfig;
    assets: {
        images: AssetImageData[];
        sounds: SoundData[];
    };
}

interface Puyo {
    color: string;
    isEmpty: boolean;
}

interface PuyoBlock {
    x: number;
    y: number;
    color: string;
}

interface PuyoPairTemplate {
    pivot: PuyoBlock;
    other: PuyoBlock;
    rotationState: number;
}

enum GameState {
    TITLE,
    PLAYING,
    GAME_RESOLUTION,
    GAME_OVER
}

enum GameResolutionState {
    IDLE,
    APPLY_GRAVITY_TO_FLOATING,
    CHECK_MATCHES,
    APPLY_GRAVITY_TO_BOARD_PUYOS,
}

class InputHandler {
    private keys: { [key: string]: boolean } = {};
    private keyMap: KeyConfig;
    private pressedKeysThisFrame: Set<string> = new Set();

    constructor(keyMap: KeyConfig) {
        this.keyMap = keyMap;
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
    }

    private onKeyDown = (e: KeyboardEvent) => {
        if (!this.keys[e.code]) {
            this.keys[e.code] = true;
            this.pressedKeysThisFrame.add(e.code);
        }
    };

    private onKeyUp = (e: KeyboardEvent) => {
        this.keys[e.code] = false;
    };

    public isKeyDown(keyName: keyof KeyConfig): boolean {
        return this.keys[this.keyMap[keyName]];
    }

    public isKeyPressed(keyName: keyof KeyConfig): boolean {
        return this.pressedKeysThisFrame.has(this.keyMap[keyName]);
    }

    public update() {
        this.pressedKeysThisFrame.clear();
    }

    public dispose() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
    }
}

class PuyoGame {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private gameData!: GameConfig;
    private keys!: KeyConfig;
    private assets: GameAssets = { images: {}, sounds: {} };
    private inputHandler!: InputHandler;

    private gameState: GameState = GameState.TITLE;
    private gameResolutionState: GameResolutionState = GameResolutionState.IDLE;

    private board: Puyo[][] = [];
    private activePuyos: PuyoBlock[] = [];
    private floatingPuyos: PuyoBlock[] = [];
    private nextPuyoPairs: PuyoPairTemplate[] = [];
    private currentPuyoRotationState: number = 0;

    private score: number = 0;
    private lastUpdateTime: DOMHighResTimeStamp = 0;
    private gravityTimer: number = 0;
    private currentFallSpeed: number = 0;
    private chainCount: number = 0;
    private matchSoundPlayedThisChain: boolean = false;

    private gameBoardPixelWidth: number = 0;
    private gameBoardPixelHeight: number = 0;
    private uiAreaPixelWidth: number = 0;
    private uiAreaStartX: number = 0;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas element with id '${canvasId}' not found.`);
        }
        this.ctx = this.canvas.getContext('2d')!;
    }

    async loadData(dataPath: string): Promise<void> {
        const response = await fetch(dataPath);
        const data: DataJson = await response.json();
        this.gameData = data.game;
        this.keys = data.keys;

        this.gameBoardPixelWidth = this.gameData.boardWidth * this.gameData.cellSize;
        // gameBoardPixelHeight는 숨겨진 행을 포함한 전체 보드 높이로 설정하여 Game Over 시 전체를 보여줄 수 있도록 함
        this.gameBoardPixelHeight = (this.gameData.boardHeight + this.gameData.hiddenRows) * this.gameData.cellSize;
        this.uiAreaPixelWidth = this.gameData.uiPanelWidthCells * this.gameData.cellSize;
        this.uiAreaStartX = this.gameBoardPixelWidth;

        this.canvas.width = this.gameBoardPixelWidth + this.uiAreaPixelWidth;
        this.canvas.height = this.gameBoardPixelHeight;

        await this.loadAssets(data.assets.images, data.assets.sounds);
    }

    private async loadAssets(imageData: AssetImageData[], soundData: SoundData[]): Promise<void> {
        const imagePromises = imageData.map(img => {
            return new Promise<void>((resolve, reject) => {
                const image = new Image();
                image.src = img.path;
                image.onload = () => {
                    this.assets.images[img.name] = image;
                    resolve();
                };
                image.onerror = () => reject(`Failed to load image: ${img.path}`);
            });
        });

        const soundPromises = soundData.map(snd => {
            return new Promise<void>((resolve, reject) => {
                const audio = new Audio(snd.path);
                audio.volume = snd.volume;
                audio.loop = snd.loop;
                audio.addEventListener('canplaythrough', () => {
                    this.assets.sounds[snd.name] = audio;
                }, { once: true });
                audio.addEventListener('error', () => reject(`Failed to load sound: ${snd.path}`), { once: true });
                audio.load(); // Start loading the audio
                // Resolve immediately for faster loading, actual playback will handle readiness
                resolve();
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
    }

    initializeGame(): void {
        this.inputHandler = new InputHandler(this.keys);
        this.resetGame();
        this.loop(0);
    }

    private resetGame(): void {
        this.score = 0;
        this.chainCount = 0;
        this.gravityTimer = 0;
        this.currentFallSpeed = this.gameData.gravitySpeed;

        this.board = Array(this.gameData.boardHeight + this.gameData.hiddenRows).fill(null)
            .map(() => Array(this.gameData.boardWidth).fill({ color: '', isEmpty: true }));

        this.activePuyos = [];
        this.floatingPuyos = [];
        this.nextPuyoPairs = [];
        for (let i = 0; i < this.gameData.nextPuyoPreviewCount + 1; i++) {
            this.nextPuyoPairs.push(this.createRandomPuyoPairTemplate());
        }
        this.spawnNewPuyoPair();
    }

    private playBGM(): void {
        if (this.assets.sounds['bgm']) {
            this.assets.sounds['bgm'].currentTime = 0;
            this.assets.sounds['bgm'].play().catch(e => console.warn("BGM auto-play failed:", e));
        }
    }

    private playSFX(name: string): void {
        if (this.assets.sounds[name]) {
            // Create a new Audio instance to allow multiple simultaneous SFX playback
            const sfx = new Audio(this.assets.sounds[name].src);
            sfx.volume = this.assets.sounds[name].volume;
            sfx.play().catch(e => console.warn(`SFX '${name}' playback failed:`, e));
        }
    }

    private createRandomPuyoPairTemplate(): PuyoPairTemplate {
        const colors = this.gameData.puyoColors;
        const color1 = colors[Math.floor(Math.random() * colors.length)];
        const color2 = colors[Math.floor(Math.random() * colors.length)];

        const startX = Math.floor(this.gameData.boardWidth / 2) - 1;
        const startY = 0;

        return {
            pivot: { x: startX, y: startY, color: color1 },
            other: { x: startX + 1, y: startY, color: color2 },
            rotationState: 0
        };
    }

    private spawnNewPuyoPair(): void {
        const newPairTemplate = this.nextPuyoPairs.shift()!;
        this.nextPuyoPairs.push(this.createRandomPuyoPairTemplate());

        this.activePuyos = [
            { x: newPairTemplate.pivot.x, y: newPairTemplate.pivot.y, color: newPairTemplate.pivot.color },
            { x: newPairTemplate.other.x, y: newPairTemplate.other.y, color: newPairTemplate.other.color }
        ];
        this.currentPuyoRotationState = 0;

        this.gravityTimer = 0;
        this.currentFallSpeed = this.gameData.gravitySpeed;
        this.chainCount = 0;
        this.matchSoundPlayedThisChain = false;

        // Existing game over check: if spawn points are blocked
        if (this.checkCollisionForBlocks(this.activePuyos, 0, 0, [])) {
            this.gameState = GameState.GAME_OVER;
        }
    }

    private loop = (currentTime: DOMHighResTimeStamp) => {
        if (this.lastUpdateTime === 0) {
            this.lastUpdateTime = currentTime;
        }
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = currentTime;

        this.update(deltaTime);
        this.render();
        this.inputHandler.update();

        requestAnimationFrame(this.loop);
    };

    private update(deltaTime: number): void {
        switch (this.gameState) {
            case GameState.TITLE:
                if (this.inputHandler.isKeyPressed('startGame')) {
                    this.gameState = GameState.PLAYING;
                    this.resetGame();
                    this.playBGM();
                }
                break;
            case GameState.PLAYING:
                this.handleInput();
                this.applyGravityToActivePuyos(deltaTime);
                break;
            case GameState.GAME_RESOLUTION:
                this.processGameResolution(deltaTime);
                break;
            case GameState.GAME_OVER:
                if (this.inputHandler.isKeyPressed('startGame')) {
                    this.gameState = GameState.TITLE;
                }
                break;
        }
    }

    private handleInput(): void {
        if (this.activePuyos.length === 0) return;

        if (this.inputHandler.isKeyPressed('moveLeft')) {
            this.moveActivePuyos(-1, 0);
        }
        if (this.inputHandler.isKeyPressed('moveRight')) {
            this.moveActivePuyos(1, 0);
        }
        // Check for hard drop first, it overrides soft drop
        if (this.inputHandler.isKeyPressed('hardDrop')) {
            this.hardDropActivePuyos();
        } else if (this.inputHandler.isKeyDown('moveDown')) {
            this.currentFallSpeed = this.gameData.gravitySpeed + this.gameData.fallAcceleration;
        } else {
            this.currentFallSpeed = this.gameData.gravitySpeed;
        }
        if (this.inputHandler.isKeyPressed('rotateLeft')) {
            this.rotateActivePuyos(false);
        }
        if (this.inputHandler.isKeyPressed('rotateRight')) {
            this.rotateActivePuyos(true);
        }
    }

    private hardDropActivePuyos(): void {
        if (this.activePuyos.length === 0) return;

        // Move the active puyos down as a unit as far as possible
        while (!this.checkCollisionForBlocks(this.activePuyos, 0, 1, [])) {
            for (const puyo of this.activePuyos) {
                puyo.y++;
            }
        }

        // After moving as a unit, check if individual puyos are blocked or still floating.
        const landedPuyos: PuyoBlock[] = [];
        const newFloatingPuyos: PuyoBlock[] = [];

        for (const puyo of this.activePuyos) {
            // Check if this individual puyo can still fall one more step
            if (!this.checkCollisionForBlocks([puyo], 0, 1, [])) {
                // It can still fall, so it's a floating puyo
                newFloatingPuyos.push(puyo);
            } else {
                // It has landed
                landedPuyos.push(puyo);
            }
        }

        // Place all puyos that have landed onto the board
        for (const puyo of landedPuyos) {
            this.placePuyoOnBoard(puyo);
        }
        // Add any puyos that are still floating to the general floating puyos list
        this.floatingPuyos.push(...newFloatingPuyos);

        this.activePuyos = []; // Clear active puyos as they are now handled
        this.startResolutionPhase(); // Immediately start the game resolution phase
    }

    private applyGravityToActivePuyos(deltaTime: number): void {
        this.gravityTimer += deltaTime;
        const fallInterval = 1 / this.currentFallSpeed;

        if (this.gravityTimer < fallInterval) {
            return;
        }
        this.gravityTimer -= fallInterval;

        if (this.activePuyos.length === 0) {
            this.startResolutionPhase();
            return;
        }

        const pivot = this.activePuyos[0];
        const other = this.activePuyos.length > 1 ? this.activePuyos[1] : null;

        const canPivotFall = !this.checkCollisionForBlocks([pivot], 0, 1, []);
        const canOtherFall = other && !this.checkCollisionForBlocks([other], 0, 1, []);

        let transitionToResolution = false;

        if (this.activePuyos.length === 1) {
            if (canPivotFall) {
                pivot.y++;
            } else {
                this.placePuyoOnBoard(pivot);
                this.activePuyos = [];
                transitionToResolution = true;
            }
        } else {
            if (canPivotFall && canOtherFall) {
                pivot.y++;
                other!.y++;
            } else if (!canPivotFall && !canOtherFall) {
                this.placePuyoOnBoard(pivot);
                this.placePuyoOnBoard(other!);
                this.activePuyos = [];
                transitionToResolution = true;
            } else {
                if (!canPivotFall) {
                    this.placePuyoOnBoard(pivot);
                } else {
                    this.floatingPuyos.push(pivot);
                }
                if (!canOtherFall) {
                    this.placePuyoOnBoard(other!);
                } else {
                    this.floatingPuyos.push(other!);
                }
                this.activePuyos = [];
                transitionToResolution = true;
            }
        }

        if (transitionToResolution) {
            this.startResolutionPhase();
        }
    }

    private moveActivePuyos(dx: number, dy: number): boolean {
        if (this.activePuyos.length === 0) return false;

        if (!this.checkCollisionForBlocks(this.activePuyos, dx, dy, [])) {
            for (const puyo of this.activePuyos) {
                puyo.x += dx;
                puyo.y += dy;
            }
            return true;
        }
        return false;
    }

    private rotateActivePuyos(clockwise: boolean): void {
        if (this.activePuyos.length !== 2) return;

        const pivot = this.activePuyos[0];
        const other = this.activePuyos[1];

        const originalPivot = { ...pivot };
        const originalOther = { ...other };
        const originalRotationState = this.currentPuyoRotationState;

        let relX = other.x - pivot.x;
        let relY = other.y - pivot.y;

        let newRelX, newRelY;
        if (clockwise) {
            newRelX = -relY;
            newRelY = relX;
            this.currentPuyoRotationState = (this.currentPuyoRotationState + 1) % 4;
        } else {
            newRelX = relY;
            newRelY = -relX;
            this.currentPuyoRotationState = (this.currentPuyoRotationState + 3) % 4;
        }

        other.x = pivot.x + newRelX;
        other.y = pivot.y + newRelY;

        if (this.checkCollisionForBlocks(this.activePuyos, 0, 0, [])) {
            const kicks = [
                { dx: 0, dy: 0 },
                { dx: 1, dy: 0 },
                { dx: -1, dy: 0 },
                { dx: 0, dy: -1 }
            ];

            let kickSuccessful = false;
            for (const kick of kicks) {
                if (!this.checkCollisionForBlocks(this.activePuyos, kick.dx, kick.dy, [])) {
                    pivot.x += kick.dx;
                    pivot.y += kick.dy;
                    other.x += kick.dx;
                    other.y += kick.dy;
                    kickSuccessful = true;
                    break;
                }
            }

            if (!kickSuccessful) {
                pivot.x = originalPivot.x;
                pivot.y = originalPivot.y;
                other.x = originalOther.x;
                other.y = originalOther.y;
                this.currentPuyoRotationState = originalRotationState;
            }
        }
    }

    private checkCollisionForBlocks(blocks: PuyoBlock[], dx: number, dy: number, ignoreBlocks: PuyoBlock[] = []): boolean {
        for (const puyo of blocks) {
            const newX = puyo.x + dx;
            const newY = puyo.y + dy;

            if (newX < 0 || newX >= this.gameData.boardWidth || newY >= this.board.length) {
                return true;
            }
            if (newY >= 0 && !this.board[newY][newX].isEmpty) {
                let isSelf = false;
                for (const ignoredPuyo of ignoreBlocks) {
                    if (ignoredPuyo.x === newX && ignoredPuyo.y === newY) {
                        isSelf = true;
                        break;
                    }
                }
                if (!isSelf) {
                    return true;
                }
            }
        }
        return false;
    }

    private placePuyoOnBoard(puyo: PuyoBlock): void {
        if (puyo.y >= 0 && puyo.y < this.board.length && puyo.x >= 0 && puyo.x < this.gameData.boardWidth) {
            this.board[puyo.y][puyo.x] = { color: puyo.color, isEmpty: false };
        }
    }

    private startResolutionPhase(): void {
        this.gameState = GameState.GAME_RESOLUTION;
        this.gameResolutionState = GameResolutionState.APPLY_GRAVITY_TO_FLOATING;
        this.gravityTimer = 0;
        this.currentFallSpeed = this.gameData.resolutionFallSpeed; // Use faster gravity for resolution
    }

    private endResolutionPhase(): void {
        // Game Over condition: Check if any puyo is in the lowest hidden row (just above the visible board)
        if (this.isGameOverDueToHighStack()) {
            this.gameState = GameState.GAME_OVER;
            return; // Game is over, do not spawn a new puyo pair
        }

        this.chainCount = 0;
        this.matchSoundPlayedThisChain = false;
        this.spawnNewPuyoPair();
        this.gameState = GameState.PLAYING;
        this.gameResolutionState = GameResolutionState.IDLE;
    }

    private isGameOverDueToHighStack(): boolean {
        // Game over when a puyo reaches the very top row (index 0) of the board.
        const gameOverRowIndex = 0; 

        for (let c = 0; c < this.gameData.boardWidth; c++) {
            if (!this.board[gameOverRowIndex][c].isEmpty) {
                return true; // A puyo is found in the very top row, game over
            }
        }
        return false;
    }

    private processGameResolution(deltaTime: number): void {
        this.gravityTimer += deltaTime;
        const fallInterval = 1 / this.currentFallSpeed;

        if (this.gravityTimer < fallInterval) {
            return;
        }
        this.gravityTimer -= fallInterval;

        switch (this.gameResolutionState) {
            case GameResolutionState.APPLY_GRAVITY_TO_FLOATING:
                this.handleFloatingPuyosGravity();
                if (this.floatingPuyos.length === 0) {
                    this.gameResolutionState = GameResolutionState.CHECK_MATCHES;
                }
                break;
            case GameResolutionState.CHECK_MATCHES:
                const matchesFound = this.processMatches();

                if (matchesFound) {
                    this.chainCount++;
                    if (this.chainCount === 1) {
                        this.playSFX('match_sfx');
                    } else {
                        this.playSFX('chain_sfx');
                    }
                    this.gameResolutionState = GameResolutionState.APPLY_GRAVITY_TO_BOARD_PUYOS;
                } else {
                    this.endResolutionPhase();
                }
                break;
            case GameResolutionState.APPLY_GRAVITY_TO_BOARD_PUYOS:
                const puyosThatBecameFloating = this.identifyAndReleaseUnsupportedPuyosFromBoard();

                if (puyosThatBecameFloating.length > 0) {
                    this.floatingPuyos.push(...puyosThatBecameFloating);
                    this.gameResolutionState = GameResolutionState.APPLY_GRAVITY_TO_FLOATING;
                } else {
                    this.gameResolutionState = GameResolutionState.CHECK_MATCHES;
                }
                break;
        }
    }

    private handleFloatingPuyosGravity(): void {
        let newFloatingPuyos: PuyoBlock[] = [];

        // Ensure floating puyos are within board vertical bounds before processing
        const validFloatingPuyos = this.floatingPuyos.filter(puyo => puyo.y < this.board.length);

        for (const puyo of validFloatingPuyos) {
            // No ignoreBlocks needed here as floating puyos should collide with everything.
            const canFall = !this.checkCollisionForBlocks([puyo], 0, 1);
            if (canFall) {
                puyo.y++;
                newFloatingPuyos.push(puyo);
            } else {
                this.placePuyoOnBoard(puyo);
            }
        }
        this.floatingPuyos = newFloatingPuyos;
    }

    private identifyAndReleaseUnsupportedPuyosFromBoard(): PuyoBlock[] {
        const releasedPuyos: PuyoBlock[] = [];
        for (let c = 0; c < this.gameData.boardWidth; c++) {
            // Iterate from bottom up to ensure correct support check
            for (let r = this.board.length - 2; r >= 0; r--) {
                const puyo = this.board[r][c];
                // Check if the puyo is not empty and the cell directly below it is empty
                if (!puyo.isEmpty && this.board[r + 1][c].isEmpty) {
                    releasedPuyos.push({ x: c, y: r, color: puyo.color });
                    this.board[r][c] = { color: '', isEmpty: true }; // Clear the original position
                }
            }
        }
        return releasedPuyos;
    }

    private processMatches(): boolean {
        let matchedPuyos: { x: number, y: number }[] = [];
        const visited: boolean[][] = Array(this.board.length).fill(null)
            .map(() => Array(this.gameData.boardWidth).fill(false));

        for (let r = 0; r < this.board.length; r++) {
            for (let c = 0; c < this.gameData.boardWidth; c++) {
                const puyo = this.board[r][c];
                if (!puyo.isEmpty && !visited[r][c]) {
                    const group = this.findConnectedPuyos(r, c, puyo.color, visited);
                    if (group.length >= this.gameData.minMatchCount) {
                        matchedPuyos.push(...group);
                    }
                }
            }
        }

        if (matchedPuyos.length > 0) {
            this.clearPuyos(matchedPuyos);
            this.addScore(matchedPuyos.length);
            return true;
        }
        return false;
    }

    private findConnectedPuyos(r: number, c: number, color: string, visited: boolean[][]): { x: number, y: number }[] {
        const stack: { r: number, c: number }[] = [{ r, c }];
        const group: { x: number, y: number }[] = [];
        visited[r][c] = true;

        const neighbors = [
            { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
            { dr: 0, dc: -1 }, { dr: 0, dc: 1 }
        ];

        while (stack.length > 0) {
            const current = stack.pop()!;
            group.push({ x: current.c, y: current.r });

            for (const neighbor of neighbors) {
                const nr = current.r + neighbor.dr;
                const nc = current.c + neighbor.dc;

                if (nr >= 0 && nr < this.board.length &&
                    nc >= 0 && nc < this.gameData.boardWidth &&
                    !visited[nr][nc] &&
                    !this.board[nr][nc].isEmpty &&
                    this.board[nr][nc].color === color) {
                    visited[nr][nc] = true;
                    stack.push({ r: nr, c: nc });
                }
            }
        }
        return group;
    }

    private clearPuyos(puyosToClear: { x: number, y: number }[]): void {
        for (const puyo of puyosToClear) {
            this.board[puyo.y][puyo.x] = { color: '', isEmpty: true };
        }
    }

    private addScore(clearedPuyosCount: number): void {
        let chainMultiplier = 1;
        if (this.chainCount > 0) {
            chainMultiplier = Math.pow(this.gameData.chainBonusMultiplier, this.chainCount - 1);
        }
        this.score += clearedPuyosCount * this.gameData.scorePerPuyo * chainMultiplier;
    }

    private render(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 배경과 UI 패널 구분선은 전체 캔버스 높이에 걸쳐 그림
        const bgImage = this.assets.images['background'];
        if (bgImage) {
            this.ctx.drawImage(bgImage, 0, 0, this.gameBoardPixelWidth, this.canvas.height, 0, 0, this.gameBoardPixelWidth, this.canvas.height);
            this.ctx.fillStyle = 'rgba(50, 50, 50, 0.8)';
            this.ctx.fillRect(this.uiAreaStartX, 0, this.uiAreaPixelWidth, this.canvas.height);
        } else {
            this.ctx.fillStyle = '#333';
            this.ctx.fillRect(0, 0, this.gameBoardPixelWidth, this.canvas.height);
            this.ctx.fillStyle = '#555';
            this.ctx.fillRect(this.uiAreaStartX, 0, this.uiAreaPixelWidth, this.canvas.height);
        }

        this.ctx.strokeStyle = '#999';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(this.uiAreaStartX, 0);
        this.ctx.lineTo(this.uiAreaStartX, this.canvas.height);
        this.ctx.stroke();

        // 게임 보드 렌더링
        this.drawBoard();

        // activePuyos와 floatingPuyos 렌더링
        // 게임 상태와 관계없이 항상 보드 배열의 절대 Y좌표를 사용하여 화면에 그림
        // hiddenRows는 이제 시각적으로 숨겨지지 않고, 보드의 상단 부분으로 나타납니다.
        const puyoDrawingYOffset = 0;
        
        if (this.gameState === GameState.PLAYING || 
            (this.gameState === GameState.GAME_RESOLUTION && this.gameResolutionState === GameResolutionState.APPLY_GRAVITY_TO_FLOATING)) {
            for (const puyo of this.activePuyos) {
                this.drawPuyo(puyo.x, puyo.y - puyoDrawingYOffset, puyo.color);
            }
            for (const puyo of this.floatingPuyos) {
                this.drawPuyo(puyo.x, puyo.y - puyoDrawingYOffset, puyo.color);
            }
        }

        // UI 요소들은 캔버스 변환의 영향을 받지 않으므로, 항상 캔버스 최상단(Y=0)을 기준으로 그림
        this.drawNextPuyoPreview();
        this.drawUI();

        if (this.gameState === GameState.TITLE) {
            this.drawTitleScreen();
        } else if (this.gameState === GameState.GAME_OVER) {
            this.drawGameOverScreen();
        }
    }

    private drawBoard(): void {
        // 게임 상태와 관계없이 보드 배열의 절대 Y좌표를 사용하여 그림.
        // hiddenRows는 이제 시각적으로 숨겨지지 않고, 보드의 상단 부분으로 나타납니다.
        const boardRenderYOffset = 0;

        for (let r = 0; r < this.board.length; r++) {
            for (let c = 0; c < this.gameData.boardWidth; c++) {
                const puyo = this.board[r][c];
                if (!puyo.isEmpty) {
                    // 실제 그리기 Y 좌표는 보드 Y 좌표에서 보정값을 뺀 값.
                    // 보정값이 0이므로 r이 그대로 screenY로 사용됨.
                    this.drawPuyo(c, r - boardRenderYOffset, puyo.color);
                }
            }
        }
    }

    private drawPuyo(boardX: number, boardY: number, color: string): void {
        const cellSize = this.gameData.cellSize;
        const screenX = boardX * cellSize;
        const screenY = boardY * cellSize; // Y 좌표는 이미 보정되어 넘어옴
        const puyoImage = this.assets.images[`puyo_${color}`];

        if (puyoImage) {
            this.ctx.drawImage(puyoImage, screenX, screenY, cellSize, cellSize);
        } else {
            this.ctx.fillStyle = color;
            this.ctx.fillRect(screenX, screenY, cellSize, cellSize);
            this.ctx.strokeStyle = 'black';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(screenX, screenY, cellSize, cellSize);
        }
    }

    private drawPuyoAtScreenCoord(screenX: number, screenY: number, color: string): void {
        const cellSize = this.gameData.cellSize;
        const puyoImage = this.assets.images[`puyo_${color}`];

        if (puyoImage) {
            this.ctx.drawImage(puyoImage, screenX, screenY, cellSize, cellSize);
        } else {
            this.ctx.fillStyle = color;
            this.ctx.fillRect(screenX, screenY, cellSize, cellSize);
            this.ctx.strokeStyle = 'black';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(screenX, screenY, cellSize, cellSize);
        }
    }

    private drawNextPuyoPreview(): void {
        const cellSize = this.gameData.cellSize;
        const previewXOrigin = this.uiAreaStartX + 10;
        // UI 요소는 캔버스 최상단(Y=0)을 기준으로 배치되므로, hiddenRows에 따른 Y좌표 보정이 필요 없음.
        const previewYOrigin = 10; 

        this.ctx.fillStyle = 'white';
        this.ctx.font = '16px Arial';
        this.ctx.fillText("NEXT", previewXOrigin, previewYOrigin + 15);

        for (let i = 0; i < this.gameData.nextPuyoPreviewCount; i++) {
            const puyoPairTemplate = this.nextPuyoPairs[i];
            const puyoPairOffsetY = i * (cellSize * 2 + 10);

            const puyoScreenY = previewYOrigin + 30 + puyoPairOffsetY;
            
            this.drawPuyoAtScreenCoord(previewXOrigin, puyoScreenY, puyoPairTemplate.pivot.color);
            this.drawPuyoAtScreenCoord(previewXOrigin + cellSize, puyoScreenY, puyoPairTemplate.other.color);
        }
    }

    private drawUI(): void {
        const textX = this.uiAreaStartX + 10;
        // UI는 캔버스 전체 높이 기준으로 Y 좌표를 계산. 이는 게임 상태와 무관하게 동일.
        let textY = this.canvas.height - (this.gameData.cellSize * 2); 

        this.ctx.fillStyle = 'white';
        this.ctx.font = '20px Arial';

        this.ctx.fillText(`Score: ${Math.floor(this.score)}`, textX, textY);
        textY += 30;

        if (this.chainCount > 0) {
            this.ctx.fillText(`Chain: ${this.chainCount}`, textX, textY);
        }
    }

    private drawTitleScreen(): void {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        this.ctx.font = '48px Arial';
        this.ctx.fillText(this.gameData.titleScreenText, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = '24px Arial';
        this.ctx.fillText(this.gameData.startPromptText, this.canvas.width / 2, this.canvas.height / 2 + 20);

        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'alphabetic';
    }

    private drawGameOverScreen(): void {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        this.ctx.font = '48px Arial';
        this.ctx.fillText(this.gameData.gameOverText, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = '24px Arial';
        this.ctx.fillText(`Final Score: ${Math.floor(this.score)}`, this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.fillText(this.gameData.gameOverPromptText, this.canvas.width / 2, this.canvas.height / 2 + 50);

        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'alphabetic';
    }
}

async function initGame() {
    const game = new PuyoGame('gameCanvas');
    try {
        await game.loadData('data.json');
        game.initializeGame();
    } catch (error) {
        console.error("Failed to initialize game:", error);
    }
}

document.addEventListener('DOMContentLoaded', initGame);