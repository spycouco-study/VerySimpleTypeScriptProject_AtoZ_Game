interface ImageDataConfig {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface SoundDataConfig {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface TetrominoConfig {
    name: string;
    id: number; // 1-7, corresponds to grid value and textureName
    textureName: string;
    spawnOffsetX: number; // Initial spawn X offset for proper centering
    spawnOffsetY: number; // Initial spawn Y offset, typically 0 or -1
    shapes: number[][][]; // Array of rotation states
}

interface GameConfig {
    gameSettings: {
        canvasWidth: number;
        canvasHeight: number;
        gridWidth: number;
        gridHeight: number;
        blockSize: number;
        gameBoardOffsetX: number;
        gameBoardOffsetY: number;
        initialFallSpeed: number; // ms per grid cell
        levelUpLineCount: number;
        levelUpSpeedMultiplier: number; // e.g., 0.9 for 10% faster
        scorePerLine: number;
        scorePerHardDropBlock: number;
        scorePerSoftDropBlock: number;
        holdPanelOffsetX: number;
        holdPanelOffsetY: number;
        nextPanelOffsetX: number;
        nextPanelOffsetY: number;
        infoPanelOffsetX: number;
        infoPanelOffsetY: number;
        panelWidth: number;
        panelHeight: number;
        textColor: string;
        boardBorderColor: string;
        panelBorderColor: string;
        ghostPieceAlpha: number;
    };
    tetrominoes: TetrominoConfig[];
    texts: {
        title: string;
        pressAnyKey: string;
        controlsTitle: string;
        controlsMoveLeft: string;
        controlsMoveRight: string;
        controlsSoftDrop: string;
        controlsHardDrop: string;
        controlsRotate: string;
        controlsHold: string;
        controlsPause: string;
        startText: string;
        scoreLabel: string;
        levelLabel: string;
        linesLabel: string;
        nextLabel: string;
        holdLabel: string;
        gameOverTitle: string;
        gameOverScore: string;
        pressRToRestart: string;
        pausedText: string;
    };
    assets: {
        images: ImageDataConfig[];
        sounds: SoundDataConfig[];
    };
}

// Enum for GameState
enum GameState {
    Title,
    Controls,
    Playing,
    GameOver,
    Paused
}

// Tetromino class
class Tetromino {
    id: number; // Unique ID for texture lookup and grid value
    name: string;
    shapes: number[][][]; // Array of rotation states, each state is a 2D array (matrix)
    currentRotation: number;
    x: number;
    y: number;
    textureName: string; // Key to lookup image in assets.images
    spawnOffsetX: number;
    spawnOffsetY: number;

    constructor(config: TetrominoConfig) {
        this.id = config.id;
        this.name = config.name;
        this.shapes = config.shapes;
        this.currentRotation = 0;
        this.x = 0;
        this.y = 0;
        this.textureName = config.textureName;
        this.spawnOffsetX = config.spawnOffsetX;
        this.spawnOffsetY = config.spawnOffsetY;
    }

    get shape(): number[][] {
        return this.shapes[this.currentRotation];
    }

    rotate(): void {
        this.currentRotation = (this.currentRotation + 1) % this.shapes.length;
    }

    // Creates a deep copy of the tetromino, useful for rotation checks or ghost piece
    clone(): Tetromino {
        const cloned = new Tetromino({
            id: this.id,
            name: this.name,
            shapes: this.shapes, // shapes array can be shallow copied as its content is immutable
            textureName: this.textureName,
            spawnOffsetX: this.spawnOffsetX,
            spawnOffsetY: this.spawnOffsetY,
        });
        cloned.currentRotation = this.currentRotation;
        cloned.x = this.x;
        cloned.y = this.y;
        return cloned;
    }
}

// Main Game Class
class TetrisGame {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config!: GameConfig;
    private assets: {
        images: Map<string, HTMLImageElement>;
        sounds: Map<string, HTMLAudioElement>;
    } = { images: new Map(), sounds: new Map() };

    private gameState: GameState = GameState.Title;
    private lastTimestamp: number = 0;

    // Game variables:
    private grid: number[][]; // 0 for empty, 1-7 for different block types (tetromino IDs)
    private allTetrominoTemplates: Tetromino[] = [];
    private currentPiece: Tetromino | null = null;
    private nextPiece: Tetromino | null = null;
    private holdPiece: Tetromino | null = null;
    private canSwapHold: boolean = true;
    private tetrominoQueue: Tetromino[] = []; // 7-bag generation

    private score: number = 0;
    private level: number = 1;
    private linesCleared: number = 0;
    private fallSpeed: number; // in ms per grid cell
    private lastFallTime: number = 0;

    // Input debounce/rate limiting
    private lastMoveTime: number = 0;
    private moveDelay: number = 100; // ms for horizontal movement
    private lastRotateTime: number = 0;
    private rotateDelay: number = 150; // ms for rotation
    private lastDropKeyTime: number = 0;
    private dropKeyDelay: number = 50; // ms for soft drop key

    // Game dimensions (derived from config)
    private boardWidth: number = 0;
    private boardHeight: number = 0;
    private blockSize: number = 0;
    private gameBoardX: number = 0;
    private gameBoardY: number = 0;

    // Audio tracking
    private currentBgm: HTMLAudioElement | null = null;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas with ID '${canvasId}' not found.`);
        }
        this.ctx = this.canvas.getContext('2d')!;
        this.ctx.imageSmoothingEnabled = false; // For crisp pixel art if desired

        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
        
        this.grid = []; // Will be initialized in resetGame
        this.fallSpeed = 0; // Will be initialized from config

        this.init();
    }

    private async init(): Promise<void> {
        await this.loadConfig();
        this.canvas.width = this.config.gameSettings.canvasWidth;
        this.canvas.height = this.config.gameSettings.canvasHeight;
        await this.loadAssets();
        this.setupGameDimensions();

        // Start title music
        this.currentBgm = this.playSound('bgm_title', true);

        this.gameLoop(0); // Start the game loop
    }

    private async loadConfig(): Promise<void> {
        try {
            const response = await fetch('data.json');
            this.config = await response.json();
            console.log('Game config loaded:', this.config);
        } catch (error) {
            console.error('Failed to load game config:', error);
            alert('Failed to load game configuration. Please check data.json.');
            throw error;
        }
    }

    private async loadAssets(): Promise<void> {
        const imagePromises = this.config.assets.images.map(imgConfig => {
            return new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.src = imgConfig.path;
                img.onload = () => {
                    this.assets.images.set(imgConfig.name, img);
                    resolve();
                };
                img.onerror = () => {
                    console.error(`Failed to load image: ${imgConfig.path}`);
                    reject(`Failed to load image: ${imgConfig.path}`);
                };
            });
        });

        const soundPromises = this.config.assets.sounds.map(sndConfig => {
            return new Promise<void>((resolve) => {
                const audio = new Audio(sndConfig.path);
                audio.volume = sndConfig.volume;
                // Preload can fail silently, so we just resolve.
                // Actual playback will handle errors.
                this.assets.sounds.set(sndConfig.name, audio);
                resolve();
            });
        });

        try {
            await Promise.all([...imagePromises, ...soundPromises]);
            console.log('All assets loaded.');
        } catch (error) {
            console.error('Failed to load some assets:', error);
            alert('Failed to load some game assets. Check console for details.');
            throw error;
        }
    }

    private setupGameDimensions(): void {
        const settings = this.config.gameSettings;
        this.boardWidth = settings.gridWidth;
        this.boardHeight = settings.gridHeight;
        this.blockSize = settings.blockSize;
        this.gameBoardX = settings.gameBoardOffsetX;
        this.gameBoardY = settings.gameBoardOffsetY;
    }

    private initGame(): void {
        this.allTetrominoTemplates = this.config.tetrominoes.map(
            config => new Tetromino(config)
        );
        this.resetGame();
        this.gameState = GameState.Playing;
        this.currentBgm = this.playSound('bgm_game', true);
    }

    private resetGame(): void {
        this.grid = Array(this.boardHeight).fill(null).map(() => Array(this.boardWidth).fill(0));
        this.score = 0;
        this.level = 1;
        this.linesCleared = 0;
        this.fallSpeed = this.config.gameSettings.initialFallSpeed;
        this.lastFallTime = 0;
        this.currentPiece = null;
        this.nextPiece = null;
        this.holdPiece = null;
        this.canSwapHold = true;
        this.tetrominoQueue = [];
        this.fillTetrominoQueue();
        this.newPiece();
    }

    // Fills the queue with a "7-bag" of tetrominoes
    private fillTetrominoQueue(): void {
        const bag = [...this.allTetrominoTemplates];
        // Shuffle the bag
        for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        this.tetrominoQueue.push(...bag);
    }

    private newPiece(): void {
        if (this.tetrominoQueue.length < 7) { // Refill if less than a full bag
            this.fillTetrominoQueue();
        }

        if (!this.nextPiece) {
            this.nextPiece = this.tetrominoQueue.shift()!.clone();
        }

        this.currentPiece = this.nextPiece;
        this.nextPiece = this.tetrominoQueue.shift()!.clone();

        if (this.currentPiece) {
            // Reset position to spawn point
            this.currentPiece.x = Math.floor(this.boardWidth / 2) + this.currentPiece.spawnOffsetX;
            this.currentPiece.y = this.currentPiece.spawnOffsetY;
            this.currentPiece.currentRotation = 0; // Reset rotation for new piece

            if (!this.isValidMove(this.currentPiece, 0, 0)) { // Check collision at spawn
                this.gameOver();
            }
        }
        this.canSwapHold = true;
    }

    private gameOver(): void {
        this.gameState = GameState.GameOver;
        this.playSound('sfx_gameover');
        this.stopSound('bgm_game');
        this.currentBgm = null;
    }

    // Main game loop
    private gameLoop(timestamp: number): void {
        const deltaTime = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private update(deltaTime: number): void {
        if (this.gameState === GameState.Playing) {
            this.lastFallTime += deltaTime;
            if (this.lastFallTime >= this.fallSpeed) {
                this.dropPiece();
                this.lastFallTime = 0;
            }
        }
    }

    private render(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background first
        const bgImage = this.assets.images.get(this.gameState === GameState.Title || this.gameState === GameState.Controls ? 'title_screen_bg' : 'game_bg');
        if (bgImage) {
            this.ctx.drawImage(bgImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = '#1a1a2e'; // Fallback dark sci-fi color
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        switch (this.gameState) {
            case GameState.Title:
                this.renderTitleScreen();
                break;
            case GameState.Controls:
                this.renderControlsScreen();
                break;
            case GameState.Playing:
            case GameState.Paused: // Render playing screen for paused state too, with overlay
                this.renderPlayingScreen();
                if (this.gameState === GameState.Paused) {
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                    this.drawText(this.config.texts.pausedText, this.canvas.width / 2, this.canvas.height / 2, 'white', '48px Arial', 'center');
                }
                break;
            case GameState.GameOver:
                this.renderGameOverScreen();
                break;
        }
    }

    // Input Handling
    private handleKeyDown(event: KeyboardEvent): void {
        const currentTime = performance.now();

        if (this.gameState === GameState.Title || this.gameState === GameState.Controls) {
            if (event.key === 'Escape' && this.gameState === GameState.Controls) {
                this.gameState = GameState.Title;
            } else if (this.gameState === GameState.Title) {
                this.gameState = GameState.Controls;
            } else { // Controls screen, any key can proceed to game.
                this.initGame();
            }
            return;
        }

        if (this.gameState === GameState.GameOver) {
            if (event.key.toLowerCase() === 'r') {
                this.gameState = GameState.Title;
                this.currentBgm = this.playSound('bgm_title', true); // Restart title music
            }
            return;
        }

        if (this.gameState === GameState.Paused) {
            if (event.key.toLowerCase() === 'p') {
                this.gameState = GameState.Playing;
                this.playSound('bgm_game', true);
            }
            return;
        }

        // Only process game inputs if playing
        if (this.gameState === GameState.Playing && this.currentPiece) {
            if (event.key === 'ArrowLeft' && currentTime - this.lastMoveTime > this.moveDelay) {
                if (this.movePiece(-1, 0)) this.playSound('sfx_rotate'); // Reuse rotate sound for move, or create new
                this.lastMoveTime = currentTime;
            } else if (event.key === 'ArrowRight' && currentTime - this.lastMoveTime > this.moveDelay) {
                if (this.movePiece(1, 0)) this.playSound('sfx_rotate');
                this.lastMoveTime = currentTime;
            } else if (event.key === 'ArrowDown' && currentTime - this.lastDropKeyTime > this.dropKeyDelay) {
                if (this.movePiece(0, 1)) {
                    this.score += this.config.gameSettings.scorePerSoftDropBlock;
                    this.lastFallTime = 0; // Reset fall timer on soft drop
                }
                this.lastDropKeyTime = currentTime;
            } else if (event.key === 'ArrowUp' && currentTime - this.lastRotateTime > this.rotateDelay) {
                this.rotatePiece();
                this.lastRotateTime = currentTime;
            } else if (event.key === ' ') { // Hard drop
                event.preventDefault(); // Prevent page scroll
                this.hardDrop();
            } else if (event.key.toLowerCase() === 'c' || event.key.toLowerCase() === 'shift') { // Hold piece
                this.swapHoldPiece();
            } else if (event.key.toLowerCase() === 'p') { // Pause
                this.gameState = GameState.Paused;
                this.stopSound('bgm_game');
            }
        }
    }

    private handleKeyUp(event: KeyboardEvent): void {
        // Stop soft drop if key released, allowing normal fall speed
        if (event.key === 'ArrowDown' && this.gameState === GameState.Playing) {
            // If soft drop increased fall speed, reset it or ensure normal update logic takes over.
            // Current implementation relies on lastFallTime reset for continuous soft drop.
        }
    }

    // Core Tetris Logic
    private checkCollision(piece: Tetromino, offsetX: number, offsetY: number): boolean {
        for (let row = 0; row < piece.shape.length; row++) {
            for (let col = 0; col < piece.shape[row].length; col++) {
                if (piece.shape[row][col] !== 0) {
                    const newX = piece.x + col + offsetX;
                    const newY = piece.y + row + offsetY;

                    // Check boundaries
                    if (newX < 0 || newX >= this.boardWidth || newY >= this.boardHeight) {
                        return true; // Collision with wall or floor
                    }
                    if (newY < 0) continue; // Allow pieces to be above the board, don't check grid collision for these

                    // Check collision with existing blocks
                    if (this.grid[newY][newX] !== 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private isValidMove(piece: Tetromino, offsetX: number, offsetY: number): boolean {
        // Create a temporary piece for collision check at the potential new position
        const tempPiece = piece.clone();
        tempPiece.x += offsetX;
        tempPiece.y += offsetY;

        // Check collision from the tempPiece's new position (offset parameters to checkCollision are 0,0)
        return !this.checkCollision(tempPiece, 0, 0);
    }

    private movePiece(offsetX: number, offsetY: number): boolean {
        if (this.currentPiece && this.isValidMove(this.currentPiece, offsetX, offsetY)) {
            this.currentPiece.x += offsetX;
            this.currentPiece.y += offsetY;
            return true;
        }
        return false;
    }

    private rotatePiece(): void {
        if (!this.currentPiece) return;

        const originalRotation = this.currentPiece.currentRotation;
        const originalX = this.currentPiece.x;
        const originalY = this.currentPiece.y;

        this.currentPiece.rotate();

        // Simple wall kick/floor kick for basic rotation
        const kickTests = [
            [0, 0],   // No kick
            [-1, 0],  // Kick left
            [1, 0],   // Kick right
            [0, -1],  // Kick up (for ceiling)
            [-2, 0],  // Double kick left
            [2, 0]    // Double kick right
        ];

        for (const [kx, ky] of kickTests) {
            this.currentPiece.x = originalX + kx;
            this.currentPiece.y = originalY + ky;
            if (this.isValidMove(this.currentPiece, 0, 0)) { // Check if new position (with kick) is valid
                this.playSound('sfx_rotate');
                return; // Rotation successful with kick
            }
        }

        // If no kick worked, revert to original state
        this.currentPiece.currentRotation = originalRotation;
        this.currentPiece.x = originalX;
        this.currentPiece.y = originalY;
    }

    private hardDrop(): void {
        if (!this.currentPiece) return;

        let droppedBlocks = 0;
        // Keep moving down as long as the move is valid
        while (this.isValidMove(this.currentPiece, 0, 1)) {
            this.currentPiece.y++;
            droppedBlocks++;
        }
        this.score += droppedBlocks * this.config.gameSettings.scorePerHardDropBlock;
        this.lockPiece();
    }

    private dropPiece(): void {
        if (!this.currentPiece) return;

        if (this.isValidMove(this.currentPiece, 0, 1)) {
            this.currentPiece.y++;
        } else {
            this.lockPiece();
        }
    }

    private lockPiece(): void {
        if (!this.currentPiece) return;

        for (let row = 0; row < this.currentPiece.shape.length; row++) {
            for (let col = 0; col < this.currentPiece.shape[row].length; col++) {
                if (this.currentPiece.shape[row][col] !== 0) {
                    const gridX = this.currentPiece.x + col;
                    const gridY = this.currentPiece.y + row;
                    if (gridY >= 0 && gridY < this.boardHeight && gridX >= 0 && gridX < this.boardWidth) {
                        this.grid[gridY][gridX] = this.currentPiece.id;
                    }
                }
            }
        }
        this.playSound('sfx_drop');
        this.clearLines();
        this.newPiece();
    }

    private clearLines(): void {
        let linesClearedThisTurn = 0;
        for (let row = this.boardHeight - 1; row >= 0; row--) {
            if (this.grid[row].every(cell => cell !== 0)) {
                linesClearedThisTurn++;
                this.grid.splice(row, 1); // Remove the full line
                this.grid.unshift(Array(this.boardWidth).fill(0)); // Add a new empty line at the top
                row++; // Check the new line at this row index, as all lines moved down
            }
        }

        if (linesClearedThisTurn > 0) {
            this.playSound('sfx_clear');
            this.linesCleared += linesClearedThisTurn;
            this.score += linesClearedThisTurn * this.config.gameSettings.scorePerLine * this.level; // Score based on level
            this.checkLevelUp();
        }
    }

    private checkLevelUp(): void {
        if (this.linesCleared >= this.level * this.config.gameSettings.levelUpLineCount) {
            this.level++;
            this.fallSpeed *= this.config.gameSettings.levelUpSpeedMultiplier; // Make it faster
            console.log(`Level Up! Level: ${this.level}, Fall Speed: ${this.fallSpeed.toFixed(2)}ms`);
        }
    }

    private swapHoldPiece(): void {
        if (!this.currentPiece || !this.canSwapHold) return;

        this.playSound('sfx_rotate'); // Use rotate sound for swap for now

        const tempPiece = this.currentPiece;
        if (this.holdPiece) {
            this.currentPiece = this.holdPiece.clone();
            this.currentPiece.x = Math.floor(this.boardWidth / 2) + this.currentPiece.spawnOffsetX;
            this.currentPiece.y = this.currentPiece.spawnOffsetY;
        } else {
            this.newPiece(); // Get next piece if no hold piece yet
        }
        this.holdPiece = tempPiece.clone();
        // Reset hold piece rotation and position for display
        this.holdPiece.currentRotation = 0;
        this.holdPiece.x = 0;
        this.holdPiece.y = 0;

        this.canSwapHold = false; // Can only swap once per piece drop
    }

    // Rendering Helper Functions
    private drawBlock(x: number, y: number, blockType: number, alpha: number = 1): void {
        if (blockType === 0) return; // Don't draw empty blocks

        const textureConfig = this.config.tetrominoes.find(t => t.id === blockType);
        const texture = textureConfig ? this.assets.images.get(textureConfig.textureName) : undefined;

        this.ctx.save();
        this.ctx.globalAlpha = alpha;

        if (texture) {
            this.ctx.drawImage(texture, x, y, this.blockSize, this.blockSize);
        } else {
            // Fallback if texture not found
            this.ctx.fillStyle = '#ccc';
            this.ctx.fillRect(x, y, this.blockSize, this.blockSize);
            this.ctx.strokeStyle = '#666';
            this.ctx.strokeRect(x, y, this.blockSize, this.blockSize);
        }
        this.ctx.restore();
    }

    // Modified drawPiece to accept an optional baseX and baseY for drawing origin
    private drawPiece(piece: Tetromino, offsetX: number, offsetY: number, alpha: number = 1, 
                      baseX: number | null = null, baseY: number | null = null): void {
        
        const effectiveBaseX = baseX !== null ? baseX : this.gameBoardX; // Default to game board X
        const effectiveBaseY = baseY !== null ? baseY : this.gameBoardY; // Default to game board Y

        for (let row = 0; row < piece.shape.length; row++) {
            for (let col = 0; col < piece.shape[row].length; col++) {
                if (piece.shape[row][col] !== 0) {
                    // piece.x and piece.y are the piece's coordinates relative to its base.
                    // offsetX and offsetY are additional offsets (e.g., for centering within a panel).
                    const blockX = effectiveBaseX + (piece.x + col + offsetX) * this.blockSize;
                    const blockY = effectiveBaseY + (piece.y + row + offsetY) * this.blockSize;
                    this.drawBlock(blockX, blockY, piece.id, alpha);
                }
            }
        }
    }

    private drawGrid(): void {
        // Draw existing blocks
        for (let row = 0; row < this.boardHeight; row++) {
            for (let col = 0; col < this.boardWidth; col++) {
                if (this.grid[row][col] !== 0) {
                    const blockX = this.gameBoardX + col * this.blockSize;
                    const blockY = this.gameBoardY + row * this.blockSize;
                    this.drawBlock(blockX, blockY, this.grid[row][col]);
                }
            }
        }

        // Draw grid lines
        this.ctx.strokeStyle = this.config.gameSettings.boardBorderColor;
        this.ctx.lineWidth = 1;
        for (let row = 0; row <= this.boardHeight; row++) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.gameBoardX, this.gameBoardY + row * this.blockSize);
            this.ctx.lineTo(this.gameBoardX + this.boardWidth * this.blockSize, this.gameBoardY + row * this.blockSize);
            this.ctx.stroke();
        }
        for (let col = 0; col <= this.boardWidth; col++) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.gameBoardX + col * this.blockSize, this.gameBoardY);
            this.ctx.lineTo(this.gameBoardX + col * this.blockSize, this.gameBoardY + this.boardHeight * this.blockSize);
            this.ctx.stroke();
        }
        // Draw a thicker border around the main board
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(this.gameBoardX, this.gameBoardY, this.boardWidth * this.blockSize, this.boardHeight * this.blockSize);
    }

    private drawUI(): void {
        const settings = this.config.gameSettings;
        const texts = this.config.texts;
        const PANEL_LABEL_HEIGHT_OFFSET = 50; // Vertical offset from panel's top where the piece display area begins

        const panelImage = this.assets.images.get('frame_panel');

        // Draw Hold panel
        const holdX = settings.holdPanelOffsetX;
        const holdY = settings.holdPanelOffsetY;
        if (panelImage) this.ctx.drawImage(panelImage, holdX, holdY, settings.panelWidth, settings.panelHeight);
        this.drawText(texts.holdLabel, holdX + settings.panelWidth / 2, holdY + 20, settings.textColor, '20px Arial', 'center');
        if (this.holdPiece) {
            const pieceShapeWidth = this.holdPiece.shape[0].length;
            const pieceShapeHeight = this.holdPiece.shape.length;
            const pieceDisplayWidth = pieceShapeWidth * this.blockSize;
            const pieceDisplayHeight = pieceShapeHeight * this.blockSize;

            // Calculate centering offsets within the available panel content area
            const contentWidth = settings.panelWidth;
            const contentHeight = settings.panelHeight - PANEL_LABEL_HEIGHT_OFFSET;

            const blockOffsetX = Math.floor(((contentWidth - pieceDisplayWidth) / 2) / this.blockSize);
            const blockOffsetY = Math.floor(((contentHeight - pieceDisplayHeight) / 2) / this.blockSize);

            // Draw the piece with the panel's content area origin as its base.
            // holdPiece.x and holdPiece.y are 0, so only blockOffsetX/Y are used for centering.
            this.drawPiece(this.holdPiece, blockOffsetX, blockOffsetY, 1, holdX, holdY + PANEL_LABEL_HEIGHT_OFFSET);
        }

        // Draw Next panel
        const nextX = settings.nextPanelOffsetX;
        const nextY = settings.nextPanelOffsetY;
        if (panelImage) this.ctx.drawImage(panelImage, nextX, nextY, settings.panelWidth, settings.panelHeight);
        this.drawText(texts.nextLabel, nextX + settings.panelWidth / 2, nextY + 20, settings.textColor, '20px Arial', 'center');
        if (this.nextPiece) {
            const pieceShapeWidth = this.nextPiece.shape[0].length;
            const pieceShapeHeight = this.nextPiece.shape.length;
            const pieceDisplayWidth = pieceShapeWidth * this.blockSize;
            const pieceDisplayHeight = pieceShapeHeight * this.blockSize;

            // Calculate centering offsets within the available panel content area
            const contentWidth = settings.panelWidth;
            const contentHeight = settings.panelHeight - PANEL_LABEL_HEIGHT_OFFSET;

            const blockOffsetX = Math.floor(((contentWidth - pieceDisplayWidth) / 2) / this.blockSize);
            const blockOffsetY = Math.floor(((contentHeight - pieceDisplayHeight) / 2) / this.blockSize);

            // Draw the piece with the panel's content area origin as its base.
            // nextPiece.x and nextPiece.y are 0, so only blockOffsetX/Y are used for centering.
            this.drawPiece(this.nextPiece, blockOffsetX, blockOffsetY, 1, nextX, nextY + PANEL_LABEL_HEIGHT_OFFSET);
        }

        // Draw Info panel (Score, Level, Lines)
        const infoX = settings.infoPanelOffsetX;
        const infoY = settings.infoPanelOffsetY;
        if (panelImage) this.ctx.drawImage(panelImage, infoX, infoY, settings.panelWidth, settings.panelHeight * 1.5); // Taller panel for info
        this.drawText(texts.scoreLabel + this.score, infoX + settings.panelWidth / 2, infoY + 30, settings.textColor, '24px Arial', 'center');
        this.drawText(texts.levelLabel + this.level, infoX + settings.panelWidth / 2, infoY + 70, settings.textColor, '24px Arial', 'center');
        this.drawText(texts.linesLabel + this.linesCleared, infoX + settings.panelWidth / 2, infoY + 110, settings.textColor, '24px Arial', 'center');
    }

    private drawText(text: string, x: number, y: number, color: string, font: string, align: CanvasTextAlign = 'left'): void {
        this.ctx.fillStyle = color;
        this.ctx.font = font;
        this.ctx.textAlign = align;
        this.ctx.fillText(text, x, y);
    }

    // State-specific rendering
    private renderTitleScreen(): void {
        const texts = this.config.texts;
        this.drawText(texts.title, this.canvas.width / 2, this.canvas.height / 3, 'cyan', '60px "Press Start 2P", cursive', 'center');
        this.drawText(texts.pressAnyKey, this.canvas.width / 2, this.canvas.height / 2 + 50, 'white', '24px Arial', 'center');
    }

    private renderControlsScreen(): void {
        const texts = this.config.texts;
        this.drawText(texts.controlsTitle, this.canvas.width / 2, this.canvas.height / 4, 'lime', '48px "Press Start 2P", cursive', 'center');
        let yOffset = this.canvas.height / 3 + 30;
        const lineHeight = 40;

        this.drawText(texts.controlsMoveLeft, this.canvas.width / 2, yOffset, 'white', '20px Arial', 'center');
        yOffset += lineHeight;
        this.drawText(texts.controlsMoveRight, this.canvas.width / 2, yOffset, 'white', '20px Arial', 'center');
        yOffset += lineHeight;
        this.drawText(texts.controlsSoftDrop, this.canvas.width / 2, yOffset, 'white', '20px Arial', 'center');
        yOffset += lineHeight;
        this.drawText(texts.controlsHardDrop, this.canvas.width / 2, yOffset, 'white', '20px Arial', 'center');
        yOffset += lineHeight;
        this.drawText(texts.controlsRotate, this.canvas.width / 2, yOffset, 'white', '20px Arial', 'center');
        yOffset += lineHeight;
        this.drawText(texts.controlsHold, this.canvas.width / 2, yOffset, 'white', '20px Arial', 'center');
        yOffset += lineHeight;
        this.drawText(texts.controlsPause, this.canvas.width / 2, yOffset, 'white', '20px Arial', 'center');
        yOffset += lineHeight + 30;
        this.drawText(texts.startText, this.canvas.width / 2, yOffset, 'yellow', '24px Arial', 'center');
    }

    private renderPlayingScreen(): void {
        this.drawGrid();
        this.drawUI();

        if (this.currentPiece) {
            // Draw ghost piece
            const ghostPiece = this.currentPiece.clone();
            while (this.isValidMove(ghostPiece, 0, 1)) { // Simulate fall for ghost piece
                ghostPiece.y++;
            }
            // Draw the ghost piece using its calculated final position
            this.drawPiece(ghostPiece, 0, 0, this.config.gameSettings.ghostPieceAlpha, this.gameBoardX, this.gameBoardY);

            // Draw actual current piece at its current position (no additional offset)
            this.drawPiece(this.currentPiece, 0, 0, 1, this.gameBoardX, this.gameBoardY);
        }
    }

    private renderGameOverScreen(): void {
        this.renderPlayingScreen(); // Show the final board
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const texts = this.config.texts;
        this.drawText(texts.gameOverTitle, this.canvas.width / 2, this.canvas.height / 3, 'red', '60px Arial', 'center');
        this.drawText(texts.gameOverScore + this.score, this.canvas.width / 2, this.canvas.height / 2, 'white', '30px Arial', 'center');
        this.drawText(texts.pressRToRestart, this.canvas.width / 2, this.canvas.height / 2 + 60, 'yellow', '24px Arial', 'center');
    }

    // Audio Playback
    private playSound(name: string, loop: boolean = false): HTMLAudioElement | undefined {
        const audio = this.assets.sounds.get(name);
        if (audio) {
            // Stop existing BGM if a new one is playing or looping
            if (loop && this.currentBgm && this.currentBgm !== audio) {
                this.currentBgm.pause();
                this.currentBgm.currentTime = 0;
            }

            // For SFX, clone to allow overlapping
            const soundToPlay = loop ? audio : audio.cloneNode() as HTMLAudioElement;
            soundToPlay.loop = loop;
            soundToPlay.play().catch(e => console.warn(`Audio playback failed for ${name}:`, e)); // Catch Promise rejection
            
            if (loop) {
                this.currentBgm = soundToPlay;
            }
            return soundToPlay;
        }
        console.warn(`Sound '${name}' not found.`);
        return undefined;
    }

    private stopSound(name: string): void {
        const audio = this.assets.sounds.get(name);
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            if (this.currentBgm === audio) {
                this.currentBgm = null;
            }
        }
    }

    private stopAllSounds(): void {
        this.assets.sounds.forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });
        this.currentBgm = null;
    }
}

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
    try {
        new TetrisGame('gameCanvas');
    } catch (e) {
        console.error('Failed to initialize TetrisGame:', e);
        alert('게임 초기화에 실패했습니다: ' + e.message);
    }
});
