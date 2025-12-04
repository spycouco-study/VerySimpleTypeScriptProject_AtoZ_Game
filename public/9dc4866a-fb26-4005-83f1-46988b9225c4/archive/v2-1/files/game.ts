interface GameConfig {
    canvasWidth: number;
    canvasHeight: number;
    grid: {
        rows: number;
        cols: number;
        blockSize: number;
    };
    gameplay: {
        timeLimitSeconds: number;
        minMatch: number;
        scorePerMatch: number;
        initialScore: number;
    };
    colors: {
        background: string;
        gridLine: string;
        text: string;
        selection: string;
        overlay: string;
    };
    text: {
        title: string;
        clickToStart: string;
        instructionsTitle: string;
        instructions: string[];
        gameOverTitle: string;
        timeUp: string;
        scoreLabel: string;
        timeLabel: string;
        restartGame: string;
    };
    assets: {
        images: ImageAsset[];
        sounds: SoundAsset[];
    };
}

interface ImageAsset {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface SoundAsset {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

type BlockType = string | null; // Use image names as block types, null for empty

enum GameState {
    TITLE = 'TITLE',
    INSTRUCTIONS = 'INSTRUCTIONS',
    PLAYING = 'PLAYING',
    GAME_OVER = 'GAME_OVER',
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config!: GameConfig; // Loaded from data.json
    private assets: {
        images: Map<string, HTMLImageElement>;
        sounds: Map<string, HTMLAudioElement>;
    };
    private gameState: GameState = GameState.TITLE;
    private lastFrameTime: number = 0;

    private grid: BlockType[][];
    private score: number = 0;
    private timeLeft: number = 0;
    private selectedBlock: { row: number; col: number } | null = null;
    private isProcessingMove: boolean = false; // To prevent multiple moves/inputs during cascades

    private bgmAudio: HTMLAudioElement | null = null;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas with ID '${canvasId}' not found.`);
        }
        this.ctx = this.canvas.getContext('2d')!;
        this.assets = { images: new Map(), sounds: new Map() };

        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));

        // Initialize grid as an empty array, will be populated after config/assets load
        this.grid = [];

        this.loadConfig().then(() => {
            this.canvas.width = this.config.canvasWidth;
            this.canvas.height = this.config.canvasHeight;

            // 게임 화면을 화면 중앙에 위치시키기 위한 스타일 추가
            this.canvas.style.display = 'block';
            this.canvas.style.margin = '0 auto'; // 가로 중앙 정렬

            // body 요소에 Flexbox 스타일을 적용하여 캔버스를 화면 중앙에 배치
            document.body.style.display = 'flex';
            document.body.style.justifyContent = 'center';
            document.body.style.alignItems = 'center';
            document.body.style.minHeight = '100vh'; // body가 뷰포트 전체 높이를 차지하도록 함
            document.body.style.margin = '0'; // body의 기본 마진 제거
            document.body.style.overflow = 'hidden'; // 스크롤바 방지

            this.loadAssets().then(() => {
                this.initGame();
                requestAnimationFrame(this.gameLoop.bind(this));
            });
        }).catch(error => {
            console.error("Failed to load game configuration or assets:", error);
        });
    }

    private async loadConfig(): Promise<void> {
        const response = await fetch('data.json');
        this.config = await response.json();
    }

    private async loadAssets(): Promise<void> {
        const imagePromises = this.config.assets.images.map(img => {
            return new Promise<void>((resolve, reject) => {
                const image = new Image();
                image.src = img.path;
                image.onload = () => {
                    this.assets.images.set(img.name, image);
                    resolve();
                };
                image.onerror = () => reject(`Failed to load image: ${img.path}`);
            });
        });

        const soundPromises = this.config.assets.sounds.map(snd => {
            return new Promise<void>((resolve) => {
                const audio = new Audio(snd.path);
                audio.volume = snd.volume;
                audio.addEventListener('canplaythrough', () => {
                    this.assets.sounds.set(snd.name, audio);
                    resolve();
                }, { once: true });
                audio.load();
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log("All assets loaded.");
    }

    private initGame(): void {
        this.gameState = GameState.TITLE;
        this.score = this.config.gameplay.initialScore;
        this.timeLeft = this.config.gameplay.timeLimitSeconds;
        this.selectedBlock = null;
        this.isProcessingMove = false;
        this.playBGM();
    }

    private startGame(): void {
        this.gameState = GameState.PLAYING;
        this.score = this.config.gameplay.initialScore;
        this.timeLeft = this.config.gameplay.timeLimitSeconds;
        this.selectedBlock = null;
        this.isProcessingMove = false;
        this.generateGrid();
        this.playBGM();
    }

    private playBGM(): void {
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio.currentTime = 0;
        }

        const bgm = this.assets.sounds.get('bgm_loop');
        if (bgm) {
            this.bgmAudio = bgm;
            this.bgmAudio.loop = true;
            this.bgmAudio.play().catch(e => console.warn("BGM auto-play blocked:", e));
        }
    }

    private gameLoop(timestamp: number): void {
        if (!this.lastFrameTime) {
            this.lastFrameTime = timestamp;
        }
        const deltaTime = (timestamp - this.lastFrameTime) / 1000; // in seconds
        this.lastFrameTime = timestamp;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private update(deltaTime: number): void {
        switch (this.gameState) {
            case GameState.PLAYING:
                if (this.timeLeft > 0) {
                    this.timeLeft -= deltaTime;
                } else {
                    this.timeLeft = 0;
                    this.gameState = GameState.GAME_OVER;
                    if (this.bgmAudio) this.bgmAudio.pause();
                }
                break;
            // No updates for other states needed for now
        }
    }

    private render(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.config.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background image if available
        const gameBg = this.assets.images.get('game_bg');
        if (gameBg) {
            this.ctx.drawImage(gameBg, 0, 0, this.canvas.width, this.canvas.height);
        }

        switch (this.gameState) {
            case GameState.TITLE:
                this.drawTitleScreen();
                break;
            case GameState.INSTRUCTIONS:
                this.drawInstructionsScreen();
                break;
            case GameState.PLAYING:
                this.drawGridAndBlocks();
                this.drawUI();
                break;
            case GameState.GAME_OVER:
                this.drawGameOverScreen();
                break;
        }
    }

    private handleMouseDown(event: MouseEvent): void {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        switch (this.gameState) {
            case GameState.TITLE:
                this.gameState = GameState.INSTRUCTIONS;
                break;
            case GameState.INSTRUCTIONS:
                this.startGame();
                break;
            case GameState.PLAYING:
                if (this.isProcessingMove) return; // Ignore input if game is processing a move

                const col = Math.floor(mouseX / this.config.grid.blockSize);
                const row = Math.floor(mouseY / this.config.grid.blockSize);

                if (row >= 0 && row < this.config.grid.rows && col >= 0 && col < this.config.grid.cols) {
                    if (this.selectedBlock) {
                        const sRow = this.selectedBlock.row;
                        const sCol = this.selectedBlock.col;

                        // Check if adjacent
                        const isAdjacent = (Math.abs(sRow - row) + Math.abs(sCol - col)) === 1;

                        if (isAdjacent) {
                            this.isProcessingMove = true;
                            this.trySwap(sRow, sCol, row, col);
                        }
                        this.selectedBlock = null; // Deselect after attempted swap
                    } else {
                        this.selectedBlock = { row, col };
                    }
                }
                break;
            case GameState.GAME_OVER:
                this.initGame(); // Go back to title screen
                break;
        }
    }

    private drawTitleScreen(): void {
        const titleBg = this.assets.images.get('title_bg');
        if (titleBg) {
            this.ctx.drawImage(titleBg, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = this.config.colors.overlay;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.font = 'bold 48px sans-serif';
        this.ctx.fillText(this.config.text.title, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = '24px sans-serif';
        this.ctx.fillText(this.config.text.clickToStart, this.canvas.width / 2, this.canvas.height / 2 + 30);
    }

    private drawInstructionsScreen(): void {
        const titleBg = this.assets.images.get('title_bg');
        if (titleBg) {
            this.ctx.drawImage(titleBg, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = this.config.colors.overlay;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.font = 'bold 36px sans-serif';
        this.ctx.fillText(this.config.text.instructionsTitle, this.canvas.width / 2, this.canvas.height / 2 - 100);

        this.ctx.font = '20px sans-serif';
        const lineHeight = 30;
        this.config.text.instructions.forEach((line, index) => {
            this.ctx.fillText(line, this.canvas.width / 2, this.canvas.height / 2 - 50 + index * lineHeight);
        });

        this.ctx.font = '24px sans-serif';
        this.ctx.fillText(this.config.text.clickToStart, this.canvas.width / 2, this.canvas.height / 2 + 100);
    }

    private drawGameOverScreen(): void {
        this.ctx.fillStyle = this.config.colors.overlay;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.font = 'bold 48px sans-serif';
        this.ctx.fillText(this.config.text.gameOverTitle, this.canvas.width / 2, this.canvas.height / 2 - 80);

        this.ctx.font = '36px sans-serif';
        this.ctx.fillText(`${this.config.text.timeUp}`, this.canvas.width / 2, this.canvas.height / 2 - 20);
        this.ctx.fillText(`${this.config.text.scoreLabel} ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 30);

        this.ctx.font = '24px sans-serif';
        this.ctx.fillText(this.config.text.restartGame, this.canvas.width / 2, this.canvas.height / 2 + 100);
    }

    private drawGridAndBlocks(): void {
        const { rows, cols, blockSize } = this.config.grid;
        
        // Draw grid background and blocks
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const blockType = this.grid[r][c];
                const x = c * blockSize;
                const y = r * blockSize;

                // Draw cell background for checkerboard effect
                this.ctx.fillStyle = (r + c) % 2 === 0 ? '#AAD751' : '#A2D149';
                this.ctx.fillRect(x, y, blockSize, blockSize);

                if (blockType) {
                    const blockImg = this.assets.images.get(blockType);
                    if (blockImg) {
                        this.ctx.drawImage(blockImg, x, y, blockSize, blockSize);
                    }
                }

                // Draw selection highlight
                if (this.selectedBlock && this.selectedBlock.row === r && this.selectedBlock.col === c) {
                    this.ctx.strokeStyle = this.config.colors.selection;
                    this.ctx.lineWidth = 4;
                    this.ctx.strokeRect(x + 2, y + 2, blockSize - 4, blockSize - 4);
                }
            }
        }
    }

    private drawUI(): void {
        this.ctx.textAlign = 'left';
        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.font = 'bold 24px sans-serif';
        this.ctx.fillText(`${this.config.text.scoreLabel} ${this.score}`, 10, this.canvas.height - 30);

        this.ctx.textAlign = 'right';
        const displayTime = Math.max(0, Math.floor(this.timeLeft)); // No negative time display
        this.ctx.fillText(`${this.config.text.timeLabel} ${displayTime}`, this.canvas.width - 10, this.canvas.height - 30);
    }

    private generateGrid(): void {
        const { rows, cols } = this.config.grid;
        const blockNames = this.config.assets.images.filter(img => img.name.startsWith('block_')).map(img => img.name);
        this.grid = Array(rows).fill(0).map(() => Array(cols).fill(null));

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let blockType: BlockType;
                do {
                    blockType = blockNames[Math.floor(Math.random() * blockNames.length)];
                } while (
                    (c >= this.config.gameplay.minMatch -1 && this.grid[r][c - 1] === blockType && this.grid[r][c - 2] === blockType) || // Check horizontal match
                    (r >= this.config.gameplay.minMatch -1 && this.grid[r - 1][c] === blockType && this.grid[r - 2][c] === blockType)    // Check vertical match
                );
                this.grid[r][c] = blockType;
            }
        }
    }

    private getBlock(r: number, c: number): BlockType {
        if (r < 0 || r >= this.config.grid.rows || c < 0 || c >= this.config.grid.cols) {
            return null;
        }
        return this.grid[r][c];
    }

    private setBlock(r: number, c: number, type: BlockType): void {
        if (r >= 0 && r < this.config.grid.rows && c >= 0 && c < this.config.grid.cols) {
            this.grid[r][c] = type;
        }
    }

    private async trySwap(r1: number, c1: number, r2: number, c2: number): Promise<void> {
        const temp = this.getBlock(r1, c1);
        this.setBlock(r1, c1, this.getBlock(r2, c2));
        this.setBlock(r2, c2, temp);

        // Check for matches after temporary swap
        const matches = this.findAllMatches();

        if (matches.length > 0) {
            this.playMatchSound();
            this.score += matches.length * this.config.gameplay.scorePerMatch;
            await this.processMatchesAndCascades(matches);
        } else {
            // No match, swap back
            const tempBack = this.getBlock(r1, c1);
            this.setBlock(r1, c1, this.getBlock(r2, c2));
            this.setBlock(r2, c2, tempBack);
        }
        this.isProcessingMove = false;
    }

    private findAllMatches(): { row: number, col: number }[] {
        const matches: { row: number, col: number }[] = [];
        const { rows, cols } = this.config.grid;
        const minMatch = this.config.gameplay.minMatch;
    
        // Horizontal matches
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const blockType = this.getBlock(r, c);
                if (blockType === null) continue;
    
                let horizontalMatchCount = 1;
                for (let i = 1; c + i < cols; i++) {
                    if (this.getBlock(r, c + i) === blockType) {
                        horizontalMatchCount++;
                    } else {
                        break;
                    }
                }
                if (horizontalMatchCount >= minMatch) {
                    for (let i = 0; i < horizontalMatchCount; i++) {
                        if (!matches.some(m => m.row === r && m.col === c + i)) {
                            matches.push({ row: r, col: c + i });
                        }
                    }
                }
            }
        }
    
        // Vertical matches
        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                const blockType = this.getBlock(r, c);
                if (blockType === null) continue;
    
                let verticalMatchCount = 1;
                for (let i = 1; r + i < rows; i++) {
                    if (this.getBlock(r + i, c) === blockType) {
                        verticalMatchCount++;
                    } else {
                        break;
                    }
                }
                if (verticalMatchCount >= minMatch) {
                    for (let i = 0; i < verticalMatchCount; i++) {
                        if (!matches.some(m => m.row === r + i && m.col === c)) {
                            matches.push({ row: r + i, col: c });
                        }
                    }
                }
            }
        }
        return matches;
    }
    
    private async processMatchesAndCascades(initialMatches: { row: number, col: number }[]): Promise<void> {
        let currentMatches = initialMatches;

        while (currentMatches.length > 0) {
            // Remove matched blocks
            currentMatches.forEach(({ row, col }) => this.setBlock(row, col, null));
            await this.delay(100); // Small delay for visual effect of blocks disappearing

            // Drop blocks
            this.dropBlocks();
            await this.delay(200); // Small delay for visual effect of blocks falling

            // Fill new blocks
            this.fillEmptyBlocks();
            await this.delay(100); // Small delay for visual effect of new blocks appearing

            // Check for new cascade matches
            currentMatches = this.findAllMatches();
            if (currentMatches.length > 0) {
                this.playMatchSound(); // Play sound for cascade matches
                this.score += currentMatches.length * this.config.gameplay.scorePerMatch;
            }
        }
    }

    private dropBlocks(): void {
        const { rows, cols } = this.config.grid;
        for (let c = 0; c < cols; c++) {
            let emptySpaces = 0;
            for (let r = rows - 1; r >= 0; r--) {
                if (this.getBlock(r, c) === null) {
                    emptySpaces++;
                } else if (emptySpaces > 0) {
                    // Move block down by `emptySpaces` amount
                    this.setBlock(r + emptySpaces, c, this.getBlock(r, c));
                    this.setBlock(r, c, null);
                }
            }
        }
    }

    private fillEmptyBlocks(): void {
        const { rows, cols } = this.config.grid;
        const blockNames = this.config.assets.images.filter(img => img.name.startsWith('block_')).map(img => img.name);

        for (let r = 0; r < rows; r++) { // Iterate from top to bottom
            for (let c = 0; c < cols; c++) {
                if (this.getBlock(r, c) === null) {
                    this.setBlock(r, c, blockNames[Math.floor(Math.random() * blockNames.length)]);
                }
            }
        }
    }

    private playMatchSound(): void {
        const matchSound = this.assets.sounds.get('match_sound');
        if (matchSound) {
            const clone = matchSound.cloneNode(true) as HTMLAudioElement;
            clone.volume = matchSound.volume;
            clone.play().catch(e => console.warn("Match sound play blocked:", e));
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
    new Game('gameCanvas');
});
