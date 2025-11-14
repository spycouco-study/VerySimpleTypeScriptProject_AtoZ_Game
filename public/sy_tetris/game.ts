class AssetLoader {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private totalAssets = 0;
    private loadedAssets = 0;
    private onProgress: ((progress: number) => void) | null = null;
    private data: any; // Store the fetched data for later access

    constructor(data: any) {
        this.data = data;
    }

    public setOnProgress(callback: (progress: number) => void) {
        this.onProgress = callback;
    }

    public async loadAssets(): Promise<void> {
        const imagePromises: Promise<void>[] = [];
        const soundPromises: Promise<void>[] = [];

        // Count total assets
        this.totalAssets = (this.data.assets.images?.length || 0) + (this.data.assets.sounds?.length || 0);
        this.loadedAssets = 0;
        this.reportProgress();

        if (this.data.assets && this.data.assets.images) {
            for (const imgConfig of this.data.assets.images) {
                const img = new Image();
                img.src = imgConfig.path;
                const promise = new Promise<void>((resolve, reject) => {
                    img.onload = () => {
                        this.images.set(imgConfig.name, img);
                        this.loadedAssets++;
                        this.reportProgress();
                        resolve();
                    };
                    img.onerror = () => {
                        console.error(`Failed to load image: ${imgConfig.path}`);
                        this.loadedAssets++;
                        this.reportProgress();
                        resolve(); // Resolve anyway to not block other assets
                    };
                });
                imagePromises.push(promise);
            }
        }

        if (this.data.assets && this.data.assets.sounds) {
            for (const soundConfig of this.data.assets.sounds) {
                const audio = new Audio(soundConfig.path);
                audio.volume = soundConfig.volume || 1.0;
                const promise = new Promise<void>((resolve, reject) => {
                    audio.oncanplaythrough = () => {
                        this.sounds.set(soundConfig.name, audio);
                        this.loadedAssets++;
                        this.reportProgress();
                        resolve();
                    };
                    audio.onerror = () => {
                        console.error(`Failed to load audio: ${soundConfig.path}`);
                        this.loadedAssets++;
                        this.reportProgress();
                        resolve(); // Resolve anyway to not block other assets
                    };
                });
                soundPromises.push(promise);
            }
        }

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log("All assets loaded.");
    }

    private reportProgress() {
        if (this.onProgress) {
            this.onProgress(this.totalAssets === 0 ? 1 : this.loadedAssets / this.totalAssets);
        }
    }

    public getImage(name: string): HTMLImageElement | undefined {
        return this.images.get(name);
    }

    public getSound(name: string): HTMLAudioElement | undefined {
        return this.sounds.get(name);
    }

    public playSound(name: string, loop: boolean = false) {
        const sound = this.getSound(name);
        if (sound) {
            sound.currentTime = 0; // Reset to start
            sound.loop = loop;
            sound.play().catch(e => console.warn(`Failed to play sound ${name}: ${e}`));
        }
    }

    public stopSound(name: string) {
        const sound = this.getSound(name);
        if (sound) {
            sound.pause();
            sound.currentTime = 0;
        }
    }
}

enum GameState {
    LOADING,
    TITLE,
    PLAYING,
    GAME_OVER,
}

interface TetrominoConfig {
    name: string;
    color: string;
    texture: string;
    shape: number[][];
}

interface GameSettings {
    canvasWidth: number;
    canvasHeight: number;
    gridWidth: number;
    gridHeight: number;
    blockSize: number;
    initialDropIntervalMs: number;
    levelUpLines: number;
    dropIntervalDecreaseFactor: number;
    scorePerLine: number;
    scorePerDoubleLine: number;
    scorePerTripleLine: number;
    scorePerTetris: number;
    softDropScorePerBlock: number;
    hardDropScorePerBlock: number;
}

interface Tetromino {
    shape: number[][];
    x: number;
    y: number;
    color: string;
    texture: string;
    config: TetrominoConfig;
}

class TetrisGame {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private assetLoader: AssetLoader;
    private data: any;
    private settings: GameSettings;

    private gameState: GameState = GameState.LOADING;
    private lastFrameTime: number = 0;

    private grid: string[][]; // Stores texture names for filled blocks
    private currentPiece: Tetromino | null = null;
    private nextPiece: Tetromino | null = null;

    private score: number = 0;
    private level: number = 1;
    private linesCleared: number = 0;
    private totalLinesCleared: number = 0;
    private dropInterval: number; // in milliseconds
    private lastDropTime: number = 0;

    private keyboardState: { [key: string]: boolean } = {};
    private lastKeyProcessed: { [key: string]: number } = {};
    private keyRepeatInterval = 100; // ms
    private initialKeyDelay = 200; // ms

    private softDropping: boolean = false;
    private hardDropping: boolean = false;

    constructor(canvasId: string, data: any) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas element with ID '${canvasId}' not found.`);
        }
        this.ctx = this.canvas.getContext('2d')!;
        this.data = data;
        this.settings = data.gameSettings;

        this.canvas.width = this.settings.canvasWidth;
        this.canvas.height = this.settings.canvasHeight;

        this.assetLoader = new AssetLoader(data);
        this.dropInterval = this.settings.initialDropIntervalMs;

        this.grid = Array(this.settings.gridHeight).fill(0).map(() => Array(this.settings.gridWidth).fill(''));

        this.setupEventListeners();
    }

    private setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            this.keyboardState[e.code] = true;
            if (e.code === 'ArrowDown' || e.code === 'Space') {
                e.preventDefault(); // Prevent page scrolling
            }

            if (this.gameState === GameState.TITLE && e.code === 'Enter') {
                this.startGame();
            } else if (this.gameState === GameState.GAME_OVER && e.code === 'Enter') {
                this.startGame(); // Restart
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keyboardState[e.code] = false;
            this.lastKeyProcessed[e.code] = 0; // Reset for repeat
        });
    }

    public async init() {
        this.assetLoader.setOnProgress(progress => this.drawLoadingScreen(progress));
        await this.assetLoader.loadAssets();
        this.gameState = GameState.TITLE;
        this.assetLoader.playSound('bgm', true);
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private startGame() {
        this.grid = Array(this.settings.gridHeight).fill(0).map(() => Array(this.settings.gridWidth).fill(''));
        this.score = 0;
        this.level = 1;
        this.linesCleared = 0;
        this.totalLinesCleared = 0;
        this.dropInterval = this.settings.initialDropIntervalMs;
        this.lastDropTime = performance.now();
        this.softDropping = false;
        this.hardDropping = false;
        this.currentPiece = null;
        this.nextPiece = null;
        this.spawnPiece(); // First piece
        this.spawnPiece(); // Next piece preview
        this.gameState = GameState.PLAYING;
        this.assetLoader.getSound('bgm')!.currentTime = 0;
        this.assetLoader.playSound('bgm', true); // Ensure BGM restarts/plays
    }

    private gameLoop(currentTime: number) {
        const deltaTime = currentTime - this.lastFrameTime;
        this.lastFrameTime = currentTime;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private update(deltaTime: number) {
        switch (this.gameState) {
            case GameState.PLAYING:
                this.handleInput(deltaTime);
                this.handlePieceDrop(deltaTime);
                break;
            case GameState.TITLE:
            case GameState.GAME_OVER:
            case GameState.LOADING:
                // Nothing to update in these states except input for title/game over
                break;
        }
    }

    private render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background image if available
        const backgroundImage = this.assetLoader.getImage('background');
        if (backgroundImage) {
            this.ctx.drawImage(backgroundImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = this.data.colors.backgroundColor || '#1a1a1a';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        switch (this.gameState) {
            case GameState.LOADING:
                // Handled by drawLoadingScreen
                break;
            case GameState.TITLE:
                this.drawTitleScreen();
                break;
            case GameState.PLAYING:
                this.drawPlayfield();
                this.drawCurrentPiece();
                this.drawUI();
                break;
            case GameState.GAME_OVER:
                this.drawPlayfield(); // Show final state of grid
                this.drawGameOverScreen();
                break;
        }
    }

    private drawLoadingScreen(progress: number) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.data.colors.backgroundColor || '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = this.data.colors.textColor || '#FFFFFF';
        this.ctx.textAlign = 'center';
        this.ctx.font = '48px Arial';
        this.ctx.fillText('Loading...', this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = '24px Arial';
        this.ctx.fillText(`${Math.round(progress * 100)}%`, this.canvas.width / 2, this.canvas.height / 2);

        // Draw progress bar
        const barWidth = 300;
        const barHeight = 20;
        const barX = (this.canvas.width - barWidth) / 2;
        const barY = this.canvas.height / 2 + 50;

        this.ctx.strokeStyle = this.data.colors.textColor || '#FFFFFF';
        this.ctx.strokeRect(barX, barY, barWidth, barHeight);
        this.ctx.fillStyle = 'lime';
        this.ctx.fillRect(barX, barY, barWidth * progress, barHeight);
    }

    private drawTitleScreen() {
        const titleLogo = this.assetLoader.getImage('title_logo');
        if (titleLogo) {
            const logoX = (this.canvas.width - titleLogo.width) / 2;
            const logoY = this.canvas.height / 2 - titleLogo.height / 2 - 50;
            this.ctx.drawImage(titleLogo, logoX, logoY);
        } else {
            this.ctx.fillStyle = this.data.colors.textColor || '#FFFFFF';
            this.ctx.textAlign = 'center';
            this.ctx.font = '72px Arial';
            this.ctx.fillText(this.data.textContents.titleScreen.title, this.canvas.width / 2, this.canvas.height / 2 - 50);
        }

        this.ctx.fillStyle = this.data.colors.textColor || '#FFFFFF';
        this.ctx.textAlign = 'center';
        this.ctx.font = '30px Arial';
        this.ctx.fillText(this.data.textContents.titleScreen.pressKey, this.canvas.width / 2, this.canvas.height / 2 + 100);
    }

    private drawGameOverScreen() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = this.data.colors.textColor || '#FFFFFF';
        this.ctx.textAlign = 'center';
        this.ctx.font = '60px Arial';
        this.ctx.fillText(this.data.textContents.gameOverScreen.gameOver, this.canvas.width / 2, this.canvas.height / 2 - 80);

        this.ctx.font = '40px Arial';
        this.ctx.fillText(`${this.data.textContents.gameOverScreen.score} ${this.score}`, this.canvas.width / 2, this.canvas.height / 2);

        this.ctx.font = '24px Arial';
        this.ctx.fillText(this.data.textContents.gameOverScreen.pressKey, this.canvas.width / 2, this.canvas.height / 2 + 80);
    }

    private drawPlayfield() {
        const gridOffsetX = (this.canvas.width - (this.settings.gridWidth * this.settings.blockSize)) / 2;
        const gridOffsetY = (this.canvas.height - (this.settings.gridHeight * this.settings.blockSize)) / 2;

        // Draw grid background
        const gridTile = this.assetLoader.getImage('grid_tile');
        if (gridTile) {
            for (let y = 0; y < this.settings.gridHeight; y++) {
                for (let x = 0; x < this.settings.gridWidth; x++) {
                    this.ctx.drawImage(
                        gridTile,
                        gridOffsetX + x * this.settings.blockSize,
                        gridOffsetY + y * this.settings.blockSize,
                        this.settings.blockSize,
                        this.settings.blockSize
                    );
                }
            }
        }

        // Draw static blocks on the grid
        for (let y = 0; y < this.settings.gridHeight; y++) {
            for (let x = 0; x < this.settings.gridWidth; x++) {
                const textureName = this.grid[y][x];
                if (textureName !== '') {
                    this.drawBlock(x, y, textureName, gridOffsetX, gridOffsetY);
                }
            }
        }

        // Draw grid lines
        this.ctx.strokeStyle = this.data.colors.gridLineColor || '#333333';
        this.ctx.lineWidth = 1;
        for (let x = 0; x <= this.settings.gridWidth; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(gridOffsetX + x * this.settings.blockSize, gridOffsetY);
            this.ctx.lineTo(gridOffsetX + x * this.settings.blockSize, gridOffsetY + this.settings.gridHeight * this.settings.blockSize);
            this.ctx.stroke();
        }
        for (let y = 0; y <= this.settings.gridHeight; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(gridOffsetX, gridOffsetY + y * this.settings.blockSize);
            this.ctx.lineTo(gridOffsetX + this.settings.gridWidth * this.settings.blockSize, gridOffsetY + y * this.settings.blockSize);
            this.ctx.stroke();
        }
    }

    private drawBlock(gridX: number, gridY: number, textureName: string, offsetX: number, offsetY: number) {
        const image = this.assetLoader.getImage(textureName);
        if (image) {
            this.ctx.drawImage(
                image,
                offsetX + gridX * this.settings.blockSize,
                offsetY + gridY * this.settings.blockSize,
                this.settings.blockSize,
                this.settings.blockSize
            );
        } else {
            // Fallback if texture not found
            this.ctx.fillStyle = 'gray'; // Use a fallback color
            this.ctx.fillRect(
                offsetX + gridX * this.settings.blockSize,
                offsetY + gridY * this.settings.blockSize,
                this.settings.blockSize,
                this.settings.blockSize
            );
            this.ctx.strokeStyle = 'black';
            this.ctx.strokeRect(
                offsetX + gridX * this.settings.blockSize,
                offsetY + gridY * this.settings.blockSize,
                this.settings.blockSize,
                this.settings.blockSize
            );
        }
    }

    private drawCurrentPiece() {
        if (!this.currentPiece) return;

        const gridOffsetX = (this.canvas.width - (this.settings.gridWidth * this.settings.blockSize)) / 2;
        const gridOffsetY = (this.canvas.height - (this.settings.gridHeight * this.settings.blockSize)) / 2;

        // Draw the ghost piece
        let ghostY = this.currentPiece.y;
        while (!this.checkCollision(this.currentPiece.shape, this.currentPiece.x, ghostY + 1)) {
            ghostY++;
        }
        for (let r = 0; r < this.currentPiece.shape.length; r++) {
            for (let c = 0; c < this.currentPiece.shape[r].length; c++) {
                if (this.currentPiece.shape[r][c]) {
                    const blockX = this.currentPiece.x + c;
                    const blockY = ghostY + r;
                    if (blockY >= 0) { // Don't draw ghost above the visible grid
                        const image = this.assetLoader.getImage(this.currentPiece.texture);
                        if (image) {
                            this.ctx.save();
                            this.ctx.globalAlpha = 0.3; // Ghost piece transparency
                            this.ctx.drawImage(
                                image,
                                gridOffsetX + blockX * this.settings.blockSize,
                                gridOffsetY + blockY * this.settings.blockSize,
                                this.settings.blockSize,
                                this.settings.blockSize
                            );
                            this.ctx.restore();
                        }
                    }
                }
            }
        }

        // Draw the actual current piece
        for (let r = 0; r < this.currentPiece.shape.length; r++) {
            for (let c = 0; c < this.currentPiece.shape[r].length; c++) {
                if (this.currentPiece.shape[r][c]) {
                    this.drawBlock(
                        this.currentPiece.x + c,
                        this.currentPiece.y + r,
                        this.currentPiece.texture,
                        gridOffsetX,
                        gridOffsetY
                    );
                }
            }
        }
    }

    private drawUI() {
        const uiOffsetX = (this.canvas.width - (this.settings.gridWidth * this.settings.blockSize)) / 2 + this.settings.gridWidth * this.settings.blockSize + 20;
        const uiOffsetY = (this.canvas.height - (this.settings.gridHeight * this.settings.blockSize)) / 2;

        this.ctx.fillStyle = this.data.colors.textColor || '#FFFFFF';
        this.ctx.textAlign = 'left';
        this.ctx.font = '24px Arial';

        this.ctx.fillText(`${this.data.textContents.ui.score} ${this.score}`, uiOffsetX, uiOffsetY + 30);
        this.ctx.fillText(`${this.data.textContents.ui.level} ${this.level}`, uiOffsetX, uiOffsetY + 60);

        this.ctx.fillText(this.data.textContents.ui.next, uiOffsetX, uiOffsetY + 120);

        // Draw next piece
        if (this.nextPiece) {
            const nextPieceOffsetX = uiOffsetX;
            const nextPieceOffsetY = uiOffsetY + 150;
            for (let r = 0; r < this.nextPiece.shape.length; r++) {
                for (let c = 0; c < this.nextPiece.shape[r].length; c++) {
                    if (this.nextPiece.shape[r][c]) {
                        const image = this.assetLoader.getImage(this.nextPiece.texture);
                        if (image) {
                            this.ctx.drawImage(
                                image,
                                nextPieceOffsetX + c * this.settings.blockSize,
                                nextPieceOffsetY + r * this.settings.blockSize,
                                this.settings.blockSize,
                                this.settings.blockSize
                            );
                        }
                    }
                }
            }
        }
    }

    private handleInput(deltaTime: number) {
        if (!this.currentPiece) return;

        const now = performance.now();

        // Hard Drop (Space)
        if (this.keyboardState['Space'] && !this.hardDropping) {
            this.hardDropping = true;
            this.hardDrop();
            return; // Hard drop takes precedence, no other moves this frame
        } else if (!this.keyboardState['Space']) {
            this.hardDropping = false;
        }

        // Rotate (ArrowUp or KeyX)
        if ((this.keyboardState['ArrowUp'] && now - (this.lastKeyProcessed['ArrowUp'] || 0) > this.initialKeyDelay) ||
            (this.keyboardState['KeyX'] && now - (this.lastKeyProcessed['KeyX'] || 0) > this.initialKeyDelay)) {
            const key = this.keyboardState['ArrowUp'] ? 'ArrowUp' : 'KeyX';
            this.rotatePiece();
            this.assetLoader.playSound('rotate');
            this.lastKeyProcessed[key] = now;
        }

        // Left (ArrowLeft)
        if (this.keyboardState['ArrowLeft']) {
            if (now - (this.lastKeyProcessed['ArrowLeft'] || 0) > (this.lastKeyProcessed['ArrowLeft'] ? this.keyRepeatInterval : this.initialKeyDelay)) {
                this.movePiece(-1, 0);
                this.lastKeyProcessed['ArrowLeft'] = now;
            }
        } else {
            this.lastKeyProcessed['ArrowLeft'] = 0;
        }

        // Right (ArrowRight)
        if (this.keyboardState['ArrowRight']) {
            if (now - (this.lastKeyProcessed['ArrowRight'] || 0) > (this.lastKeyProcessed['ArrowRight'] ? this.keyRepeatInterval : this.initialKeyDelay)) {
                this.movePiece(1, 0);
                this.lastKeyProcessed['ArrowRight'] = now;
            }
        } else {
            this.lastKeyProcessed['ArrowRight'] = 0;
        }

        // Soft Drop (ArrowDown)
        this.softDropping = this.keyboardState['ArrowDown'];
    }

    private handlePieceDrop(deltaTime: number) {
        if (!this.currentPiece) return;

        let currentDropInterval = this.dropInterval;
        if (this.softDropping) {
            currentDropInterval /= 10; // Faster drop for soft drop
        }

        if (performance.now() - this.lastDropTime > currentDropInterval) {
            if (!this.movePiece(0, 1)) {
                // Cannot move down, lock the piece
                this.lockPiece();
                this.assetLoader.playSound('drop');
                this.clearLines();
                this.spawnPiece();
            } else if (this.softDropping) {
                this.score += this.settings.softDropScorePerBlock; // Score for soft drop
            }
            this.lastDropTime = performance.now();
        }
    }

    private spawnPiece() {
        if (this.nextPiece) {
            this.currentPiece = this.nextPiece;
        } else {
            this.currentPiece = this.createRandomPiece();
        }
        this.nextPiece = this.createRandomPiece();

        // Initial position of the new piece
        this.currentPiece.x = Math.floor((this.settings.gridWidth - this.currentPiece.shape[0].length) / 2);
        this.currentPiece.y = 0; // Start at the very top

        // Check for immediate game over
        if (this.checkCollision(this.currentPiece.shape, this.currentPiece.x, this.currentPiece.y)) {
            this.gameOver();
        }
    }

    private createRandomPiece(): Tetromino {
        const tetrominoConfigs = this.data.tetrominoes;
        const randomIndex = Math.floor(Math.random() * tetrominoConfigs.length);
        const config = tetrominoConfigs[randomIndex];
        return {
            shape: config.shape,
            x: 0,
            y: 0,
            color: config.color,
            texture: config.texture,
            config: config,
        };
    }

    private checkCollision(shape: number[][], x: number, y: number): boolean {
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c] !== 0) { // If it's a block
                    const gridX = x + c;
                    const gridY = y + r;

                    // Check boundaries
                    if (gridX < 0 || gridX >= this.settings.gridWidth || gridY >= this.settings.gridHeight) {
                        return true; // Collision with wall or floor
                    }
                    if (gridY < 0) { // Allow pieces to be partly above the visible grid
                        continue;
                    }
                    // Check existing blocks on grid
                    if (this.grid[gridY][gridX] !== '') {
                        return true; // Collision with a static block
                    }
                }
            }
        }
        return false;
    }

    private movePiece(dx: number, dy: number): boolean {
        if (!this.currentPiece) return false;

        if (!this.checkCollision(this.currentPiece.shape, this.currentPiece.x + dx, this.currentPiece.y + dy)) {
            this.currentPiece.x += dx;
            this.currentPiece.y += dy;
            return true;
        }
        return false;
    }

    private rotatePiece() {
        if (!this.currentPiece) return;

        const originalShape = this.currentPiece.shape;
        const rotatedShape = this.rotateMatrix(originalShape);

        // Simple wall kick: try moving left/right if rotation collides
        const kickOffsets = [[0, 0], [-1, 0], [1, 0], [0, -1]]; // No up kick for simple implementation
        for (const [offsetX, offsetY] of kickOffsets) {
            if (!this.checkCollision(rotatedShape, this.currentPiece.x + offsetX, this.currentPiece.y + offsetY)) {
                this.currentPiece.shape = rotatedShape;
                this.currentPiece.x += offsetX;
                this.currentPiece.y += offsetY;
                return;
            }
        }
    }

    private rotateMatrix(matrix: number[][]): number[][] {
        const N = matrix.length;
        const rotated: number[][] = Array(N).fill(0).map(() => Array(N).fill(0));
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                rotated[c][N - 1 - r] = matrix[r][c];
            }
        }
        return rotated;
    }

    private lockPiece() {
        if (!this.currentPiece) return;

        for (let r = 0; r < this.currentPiece.shape.length; r++) {
            for (let c = 0; c < this.currentPiece.shape[r].length; c++) {
                if (this.currentPiece.shape[r][c] !== 0) {
                    const gridX = this.currentPiece.x + c;
                    const gridY = this.currentPiece.y + r;
                    if (gridY >= 0 && gridY < this.settings.gridHeight && gridX >= 0 && gridX < this.settings.gridWidth) {
                        this.grid[gridY][gridX] = this.currentPiece.texture;
                    }
                }
            }
        }
        this.currentPiece = null;
    }

    private hardDrop() {
        if (!this.currentPiece) return;

        const initialY = this.currentPiece.y;
        let targetY = initialY;

        // Determine how far down the piece can go
        while (!this.checkCollision(this.currentPiece.shape, this.currentPiece.x, targetY + 1)) {
            targetY++;
        }

        const dropDistance = targetY - initialY;

        // Move the piece to the target Y
        this.currentPiece.y = targetY;

        // Score for hard drop and play sound
        if (dropDistance > 0) {
            this.score += dropDistance * this.settings.hardDropScorePerBlock;
            this.assetLoader.playSound('drop'); // Play sound when it lands
        } else {
            // If dropDistance is 0 (already at bottom), still lock it and play sound
            this.assetLoader.playSound('drop');
        }

        // Lock the piece and proceed
        this.lockPiece();
        this.clearLines();
        this.spawnPiece();
    }

    private clearLines() {
        let linesClearedThisTurn = 0;
        for (let y = this.settings.gridHeight - 1; y >= 0; y--) {
            if (this.grid[y].every(cell => cell !== '')) {
                // Line is full, clear it
                this.grid.splice(y, 1); // Remove full line
                this.grid.unshift(Array(this.settings.gridWidth).fill('')); // Add empty line at top
                linesClearedThisTurn++;
                y++; // Re-check the same row index, as all rows have shifted down
            }
        }

        if (linesClearedThisTurn > 0) {
            this.assetLoader.playSound('line_clear');
            this.totalLinesCleared += linesClearedThisTurn;
            this.linesCleared += linesClearedThisTurn;

            let scoreMultiplier = 0;
            switch (linesClearedThisTurn) {
                case 1: scoreMultiplier = this.settings.scorePerLine; break;
                case 2: scoreMultiplier = this.settings.scorePerDoubleLine; break;
                case 3: scoreMultiplier = this.settings.scorePerTripleLine; break;
                case 4: scoreMultiplier = this.settings.scorePerTetris; break;
            }
            this.score += scoreMultiplier * this.level; // Score depends on level

            if (this.linesCleared >= this.settings.levelUpLines) {
                this.levelUp();
            }
        }
    }

    private levelUp() {
        this.level++;
        this.linesCleared -= this.settings.levelUpLines; // Carry over excess lines
        this.dropInterval = Math.max(50, this.dropInterval * this.settings.dropIntervalDecreaseFactor); // Cap at 50ms
        console.log(`Level Up! New level: ${this.level}, New drop interval: ${this.dropInterval}`);
    }

    private gameOver() {
        this.gameState = GameState.GAME_OVER;
        this.assetLoader.stopSound('bgm');
        this.assetLoader.playSound('game_over');
        console.log("Game Over! Score:", this.score);
    }
}

// Global initialization
async function initGame() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const gameData = await response.json();

        const game = new TetrisGame('gameCanvas', gameData);
        await game.init();

    } catch (error) {
        console.error("Failed to load game data or initialize game:", error);
    }
}

document.addEventListener('DOMContentLoaded', initGame);