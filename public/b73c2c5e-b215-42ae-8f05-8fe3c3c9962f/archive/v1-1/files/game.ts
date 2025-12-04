// Define common interfaces that will be used both in TypeScript and Data
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

interface GameAssets {
    images: ImageAsset[];
    sounds: SoundAsset[];
}

interface LevelConfig {
    rows: number;
    cols: number;
    numAnimalTypes: number; // Max animal ID to use for this level (from 1 to N)
    timeLimitSeconds: number;
    scoreMultiplier: number; // Multiplier for score earned in this level
}

interface GameConfig {
    canvasWidth: number;
    canvasHeight: number;
    boardMarginX: number; // Minimum margin on x-axis for the board
    boardMarginY: number; // Minimum margin on y-axis for the board
    baseTileSize: number; // Preferred tile size, will scale down if board too big
    tilePadding: number; // Padding between the visual image and the tile boundary
    matchScore: number;
    penaltyTime: number; // Time penalty in seconds for a wrong match
    assets: GameAssets;
    levels: LevelConfig[];
    titleScreenText: string;
    titleButtonText: string;
    instructionsText: string;
    instructionsButtonText: string;
    gameOverWinText: string;
    gameOverLoseText: string;
    gameOverButtonText: string;
    gameFont: string;
    uiColor: string;
    uiButtonColor: string;
    uiButtonHoverColor: string;
    uiButtonTextColor: string;
    selectedTileOutlineColor: string;
}

// Enums for GameState
enum GameState {
    TITLE,
    INSTRUCTIONS,
    PLAYING,
    GAME_OVER
}

// AssetManager class for loading and managing game assets (images and sounds)
class AssetManager {
    private imageAssets: Map<string, HTMLImageElement> = new Map();
    private soundAssets: Map<string, HTMLAudioElement> = new Map();
    private imagesLoaded = 0;
    private soundsLoaded = 0;
    private totalImages = 0;
    private totalSounds = 0;

    constructor(private config: GameAssets) {
        this.totalImages = config.images.length;
        this.totalSounds = config.sounds.length;
    }

    // Loads all images and sounds specified in the config
    async loadAssets(): Promise<void> {
        const imagePromises = this.config.images.map(img => this.loadImage(img));
        const soundPromises = this.config.sounds.map(snd => this.loadSound(snd));

        await Promise.all([...imagePromises, ...soundPromises]);
    }

    // Loads a single image asset
    private loadImage(asset: ImageAsset): Promise<void> {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = asset.path;
            img.onload = () => {
                this.imageAssets.set(asset.name, img);
                this.imagesLoaded++;
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${asset.path}`);
                this.imagesLoaded++; // Still count to avoid blocking all
                resolve(); // Resolve anyway to proceed with other assets
            };
        });
    }

    // Loads a single sound asset
    private loadSound(asset: SoundAsset): Promise<void> {
        return new Promise((resolve) => {
            const audio = new Audio(asset.path);
            audio.volume = asset.volume;
            // Preload metadata to ensure it's ready
            audio.addEventListener('canplaythrough', () => {
                this.soundAssets.set(asset.name, audio);
                this.soundsLoaded++;
                resolve();
            }, { once: true });
            audio.addEventListener('error', () => {
                console.error(`Failed to load sound: ${asset.path}`);
                this.soundsLoaded++; // Still count to avoid blocking all
                resolve(); // Resolve anyway to proceed
            });
            audio.load();
        });
    }

    // Retrieves an image by its name
    getImage(name: string): HTMLImageElement | undefined {
        return this.imageAssets.get(name);
    }

    // Plays a sound by its name
    playSound(name: string, loop: boolean = false): void {
        const audio = this.soundAssets.get(name);
        if (audio) {
            audio.currentTime = 0; // Rewind to start
            audio.loop = loop;
            audio.play().catch(e => console.warn(`Sound playback failed for ${name}:`, e));
        }
    }

    // Stops a sound by its name
    stopSound(name: string): void {
        const audio = this.soundAssets.get(name);
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
    }

    // Checks if all assets are loaded
    isReady(): boolean {
        return this.imagesLoaded === this.totalImages && this.soundsLoaded === this.totalSounds;
    }
}

// Main Animal Connect Game class
class AnimalConnectGame {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config: GameConfig;
    private assets: AssetManager;
    private gameState: GameState = GameState.TITLE;

    private currentLevelIndex: number = 0;
    private board: number[][]; // Game board: 0 for empty, >0 for animal ID
    private selectedTiles: { x: number; y: number }[] = []; // Stores coordinates of selected tiles
    private remainingTime: number = 0;
    private score: number = 0;
    private matchedPairs: number = 0; // Number of pairs matched in the current level
    private totalPairs: number = 0;   // Total pairs to match in the current level
    private gameLoopRequestId: number;
    private lastFrameTime: DOMHighResTimeStamp = 0;
    private currentLevelConfig: LevelConfig; // Configuration for the current level

    // UI elements for button interactions
    private titleButtonRect: { x: number, y: number, width: number, height: number };
    private instructionsButtonRect: { x: number, y: number, width: number, height: number };
    private gameOverButtonRect: { x: number, y: number, width: number, height: number };
    private hoveredButton: 'title' | 'instructions' | 'gameOver' | null = null; // Tracks which button is hovered

    // Board rendering properties
    private boardOffsetX: number;
    private boardOffsetY: number;
    private tileSize: number;

    constructor(canvasId: string, config: GameConfig) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.config = config;
        this.assets = new AssetManager(config.assets);

        this.canvas.width = this.config.canvasWidth;
        this.canvas.height = this.config.canvasHeight;

        this.setupEventListeners();
    }

    // Initializes the game by loading assets and setting up the initial state
    async init(): Promise<void> {
        await this.assets.loadAssets();
        this.currentLevelIndex = 0; // Start from the first level
        this.currentLevelConfig = this.config.levels[this.currentLevelIndex];
        this.calculateBoardDimensions(); // Calculate initial board dimensions
        this.startTitleScreen();
        this.gameLoopRequestId = requestAnimationFrame(this.gameLoop);
    }

    // Calculates the size and position of the game board and tiles to fit the canvas
    private calculateBoardDimensions(): void {
        const { rows, cols } = this.currentLevelConfig;
        const maxBoardWidth = this.canvas.width - 2 * this.config.boardMarginX;
        const maxBoardHeight = this.canvas.height - 2 * this.config.boardMarginY;

        const tileWidthFromCols = maxBoardWidth / cols;
        const tileHeightFromRows = maxBoardHeight / rows;

        // Use the smaller of the two to ensure all tiles fit, capped by baseTileSize
        this.tileSize = Math.min(this.config.baseTileSize, tileWidthFromCols, tileHeightFromRows);

        // Center the board on the canvas
        const actualBoardWidth = this.tileSize * cols;
        const actualBoardHeight = this.tileSize * rows;
        this.boardOffsetX = (this.canvas.width - actualBoardWidth) / 2;
        this.boardOffsetY = (this.canvas.height - actualBoardHeight) / 2;
    }

    // Sets up mouse event listeners for interaction
    private setupEventListeners(): void {
        this.canvas.addEventListener('click', this.handleClick);
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
    }

    // Handles mouse click events based on the current game state
    private handleClick = (event: MouseEvent): void => {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        if (this.gameState === GameState.TITLE) {
            if (this.isPointInRect(mouseX, mouseY, this.titleButtonRect)) {
                this.assets.playSound('tile_select');
                this.showInstructions();
            }
        } else if (this.gameState === GameState.INSTRUCTIONS) {
            if (this.isPointInRect(mouseX, mouseY, this.instructionsButtonRect)) {
                this.assets.playSound('tile_select');
                this.startGame();
            }
        } else if (this.gameState === GameState.PLAYING) {
            this.handleGameClick(mouseX, mouseY);
        } else if (this.gameState === GameState.GAME_OVER) {
            if (this.isPointInRect(mouseX, mouseY, this.gameOverButtonRect)) {
                this.assets.playSound('tile_select');
                this.resetGame();
                this.startTitleScreen(); // Go back to title screen
            }
        }
    };

    // Handles mouse move events to update button hover states
    private handleMouseMove = (event: MouseEvent): void => {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        this.hoveredButton = null; // Reset hovered button
        if (this.gameState === GameState.TITLE && this.isPointInRect(mouseX, mouseY, this.titleButtonRect)) {
            this.hoveredButton = 'title';
        } else if (this.gameState === GameState.INSTRUCTIONS && this.isPointInRect(mouseX, mouseY, this.instructionsButtonRect)) {
            this.hoveredButton = 'instructions';
        } else if (this.gameState === GameState.GAME_OVER && this.isPointInRect(mouseX, mouseY, this.gameOverButtonRect)) {
            this.hoveredButton = 'gameOver';
        }
    };

    // Checks if a point (mouseX, mouseY) is within a given rectangle
    private isPointInRect(x: number, y: number, rect: { x: number, y: number, width: number, height: number }): boolean {
        if (!rect) return false;
        return x >= rect.x && x <= rect.x + rect.width &&
               y >= rect.y && y <= rect.y + rect.height;
    }

    // Sets the game state to title screen
    private startTitleScreen(): void {
        this.assets.stopSound('bgm_loop'); // Ensure BGM is stopped
        this.gameState = GameState.TITLE;
        this.draw(); // Redraw immediately for state change
    }

    // Sets the game state to instructions screen
    private showInstructions(): void {
        this.gameState = GameState.INSTRUCTIONS;
        this.draw(); // Redraw immediately for state change
    }

    // Starts the actual game play
    private startGame(): void {
        this.assets.playSound('bgm_loop', true); // Start BGM loop
        this.gameState = GameState.PLAYING;
        this.score = 0;
        this.currentLevelIndex = 0; // Start from level 0 for a new game
        this.nextLevel();
    }

    // Resets game-specific variables
    private resetGame(): void {
        cancelAnimationFrame(this.gameLoopRequestId);
        this.currentLevelIndex = 0;
        this.score = 0;
        this.matchedPairs = 0;
        this.selectedTiles = [];
        this.assets.stopSound('bgm_loop');
    }

    // Ends the game and shows the game over screen
    private gameOver(won: boolean): void {
        this.assets.stopSound('bgm_loop');
        this.assets.playSound('game_over');
        this.gameState = GameState.GAME_OVER;
        this.draw();
    }

    // Proceeds to the next level or ends the game if all levels are complete
    private nextLevel(): void {
        if (this.currentLevelIndex >= this.config.levels.length) {
            // All levels completed, player wins!
            this.gameOver(true);
            return;
        }

        this.currentLevelConfig = this.config.levels[this.currentLevelIndex];
        this.calculateBoardDimensions(); // Recalculate board based on new level config

        this.remainingTime = this.currentLevelConfig.timeLimitSeconds;
        this.selectedTiles = [];
        this.matchedPairs = 0;
        this.generateBoard(); // Generate new board for the level

        if (this.currentLevelIndex > 0) { // Play level complete sound if not the very first level
            this.assets.playSound('level_complete');
        }
    }

    // Generates a new game board with animal tiles
    private generateBoard(): void {
        const { rows, cols, numAnimalTypes } = this.currentLevelConfig;

        // Initialize board with zeros
        this.board = Array(rows).fill(0).map(() => Array(cols).fill(0));
        const totalTiles = rows * cols;
        // Ensure totalTiles is even, if not, adjust logic or data to avoid issues.
        // Assuming (rows * cols) is always even for pair matching.
        this.totalPairs = totalTiles / 2;

        const animalPool: number[] = [];
        // Fill the pool with pairs of animal IDs (1 to numAnimalTypes)
        for (let i = 0; i < this.totalPairs; i++) {
            const animalId = (i % numAnimalTypes) + 1;
            animalPool.push(animalId, animalId);
        }

        // Shuffle the animal pool to randomize tile placement
        for (let i = animalPool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [animalPool[i], animalPool[j]] = [animalPool[j], animalPool[i]]; // ES6 swap
        }

        // Populate the board with shuffled animal IDs
        let poolIndex = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                this.board[r][c] = animalPool[poolIndex++];
            }
        }
    }

    // Handles a click event on the game board during PLAYING state
    private handleGameClick(mouseX: number, mouseY: number): void {
        const { rows, cols } = this.currentLevelConfig;

        // Convert mouse coordinates to grid coordinates
        const gridX = Math.floor((mouseX - this.boardOffsetX) / this.tileSize);
        const gridY = Math.floor((mouseY - this.boardOffsetY) / this.tileSize);

        // Check if click is outside board bounds
        if (gridX < 0 || gridX >= cols || gridY < 0 || gridY >= rows) {
            return;
        }

        const clickedTileValue = this.board[gridY][gridX];

        // Do nothing if an empty tile is clicked
        if (clickedTileValue === 0) {
            return;
        }

        this.assets.playSound('tile_select');

        // Check if the clicked tile is already selected
        const existingSelectionIndex = this.selectedTiles.findIndex(
            tile => tile.x === gridX && tile.y === gridY
        );

        if (existingSelectionIndex !== -1) {
            // Deselect the tile if it was already selected
            this.selectedTiles.splice(existingSelectionIndex, 1);
        } else {
            // Add the tile to selection
            this.selectedTiles.push({ x: gridX, y: gridY });

            if (this.selectedTiles.length === 2) {
                const [tile1, tile2] = this.selectedTiles;

                // If same tile clicked twice, deselect both
                if (tile1.x === tile2.x && tile1.y === tile2.y) {
                    this.selectedTiles = [];
                    return;
                }

                // Check for match and connection
                if (this.board[tile1.y][tile1.x] === this.board[tile2.y][tile2.x]) {
                    if (this.canConnect(tile1.x, tile1.y, tile2.x, tile2.y)) {
                        this.assets.playSound('tile_match');
                        this.score += this.config.matchScore * this.currentLevelConfig.scoreMultiplier;
                        this.matchedPairs++;

                        // Clear the matched tiles from the board
                        this.board[tile1.y][tile1.x] = 0;
                        this.board[tile2.y][tile2.x] = 0;

                        this.selectedTiles = []; // Clear selection

                        // Check if all pairs are matched in the current level
                        if (this.matchedPairs === this.totalPairs) {
                            this.currentLevelIndex++;
                            this.nextLevel(); // Go to the next level
                        }
                    } else {
                        // Mismatch: tiles have same value but cannot connect
                        this.assets.playSound('wrong_match');
                        this.remainingTime = Math.max(0, this.remainingTime - this.config.penaltyTime);
                        this.selectedTiles = []; // Deselect both
                    }
                } else {
                    // Mismatch: tiles have different values
                    this.assets.playSound('wrong_match');
                    this.remainingTime = Math.max(0, this.remainingTime - this.config.penaltyTime);
                    this.selectedTiles = []; // Deselect both
                }
            }
        }
    }

    // Helper for pathfinding: Checks if a cell is empty or one of the points to be ignored
    private isCellEmptyOrIgnored(cx: number, cy: number, ignorePoints: { x: number, y: number }[]): boolean {
        const { rows, cols } = this.currentLevelConfig;

        // A cell outside the board is considered 'empty' for pathfinding purposes
        if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) {
            return true;
        }

        // Check if the cell is one of the explicitly ignored points (e.g., the selected tiles themselves)
        for (const p of ignorePoints) {
            if (p.x === cx && p.y === cy) {
                return true;
            }
        }

        // Otherwise, check if the cell is truly empty on the board
        return this.board[cy][cx] === 0;
    }

    // Helper for pathfinding: Checks if a straight horizontal or vertical path between two points is clear
    private checkStraightPath(x1: number, y1: number, x2: number, y2: number, ignorePoints: { x: number, y: number }[]): boolean {
        // If the path is between identical or adjacent cells, it's considered clear (no intermediate cells)
        if ((x1 === x2 && Math.abs(y1 - y2) <= 1) || (y1 === y2 && Math.abs(x1 - x2) <= 1)) {
            return true;
        }

        if (x1 === x2) { // Vertical path
            const startY = Math.min(y1, y2);
            const endY = Math.max(y1, y2);
            // Iterate through intermediate cells
            for (let y = startY + 1; y < endY; y++) {
                if (!this.isCellEmptyOrIgnored(x1, y, ignorePoints)) {
                    return false; // Path blocked
                }
            }
            return true; // Path is clear
        } else if (y1 === y2) { // Horizontal path
            const startX = Math.min(x1, x2);
            const endX = Math.max(x1, x2);
            // Iterate through intermediate cells
            for (let x = startX + 1; x < endX; x++) {
                if (!this.isCellEmptyOrIgnored(x, y1, ignorePoints)) {
                    return false; // Path blocked
                }
            }
            return true; // Path is clear
        }
        return false; // Not a straight path
    }

    // Determines if two tiles at (x1, y1) and (x2, y2) can be connected
    private canConnect(x1: number, y1: number, x2: number, y2: number): boolean {
        const ignore = [{ x: x1, y: y1 }, { x: x2, y: y2 }]; // The selected tiles themselves don't block paths

        // 0-turn connection (Direct horizontal or vertical path)
        if (this.checkStraightPath(x1, y1, x2, y2, ignore)) {
            return true;
        }

        // 1-turn connections (L-shape paths)
        // Check via corner (x1, y2)
        if (this.isCellEmptyOrIgnored(x1, y2, ignore) &&
            this.checkStraightPath(x1, y1, x1, y2, ignore) &&
            this.checkStraightPath(x1, y2, x2, y2, ignore)) {
            return true;
        }
        // Check via corner (x2, y1)
        if (this.isCellEmptyOrIgnored(x2, y1, ignore) &&
            this.checkStraightPath(x1, y1, x2, y1, ignore) &&
            this.checkStraightPath(x2, y1, x2, y2, ignore)) {
            return true;
        }

        // 2-turn connections (Z or U-shape paths)
        const { rows, cols } = this.currentLevelConfig;

        // Horizontal-Vertical-Horizontal (HVH) pathing: (x1,y1) -> (px,y1) -> (px,y2) -> (x2,y2)
        // Iterate through all possible intermediate column positions (px), including outside the board
        for (let px = -1; px <= cols; px++) {
            if (this.isCellEmptyOrIgnored(px, y1, ignore) && // First turn point
                this.isCellEmptyOrIgnored(px, y2, ignore) && // Second turn point
                this.checkStraightPath(x1, y1, px, y1, ignore) && // Path segment 1
                this.checkStraightPath(px, y1, px, y2, ignore) && // Path segment 2
                this.checkStraightPath(px, y2, x2, y2, ignore)) { // Path segment 3
                return true;
            }
        }

        // Vertical-Horizontal-Vertical (VHV) pathing: (x1,y1) -> (x1,py) -> (x2,py) -> (x2,y2)
        // Iterate through all possible intermediate row positions (py), including outside the board
        for (let py = -1; py <= rows; py++) {
            if (this.isCellEmptyOrIgnored(x1, py, ignore) && // First turn point
                this.isCellEmptyOrIgnored(x2, py, ignore) && // Second turn point
                this.checkStraightPath(x1, y1, x1, py, ignore) && // Path segment 1
                this.checkStraightPath(x1, py, x2, py, ignore) && // Path segment 2
                this.checkStraightPath(x2, py, x2, y2, ignore)) { // Path segment 3
                return true;
            }
        }

        return false; // No valid path found
    }

    // Main game loop, continuously updates and draws the game
    private gameLoop = (currentTime: DOMHighResTimeStamp): void => {
        if (!this.lastFrameTime) {
            this.lastFrameTime = currentTime;
        }
        const deltaTime = (currentTime - this.lastFrameTime) / 1000; // Delta time in seconds
        this.lastFrameTime = currentTime;

        this.update(deltaTime); // Update game logic
        this.draw();          // Draw game state

        this.gameLoopRequestId = requestAnimationFrame(this.gameLoop);
    };

    // Updates game logic, especially the timer for PLAYING state
    private update(deltaTime: number): void {
        if (this.gameState === GameState.PLAYING) {
            this.remainingTime -= deltaTime;
            if (this.remainingTime <= 0) {
                this.remainingTime = 0;
                this.gameOver(false); // Time ran out, player loses
            }
        }
    }

    // Clears the canvas and draws the current game screen based on state
    private draw(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background image or a fallback color
        const bgImage = this.assets.getImage('background');
        if (bgImage) {
            this.ctx.drawImage(bgImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = '#ADD8E6'; // Light blue fallback
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        switch (this.gameState) {
            case GameState.TITLE:
                this.drawTitleScreen();
                break;
            case GameState.INSTRUCTIONS:
                this.drawInstructionsScreen();
                break;
            case GameState.PLAYING:
                this.drawGameScreen();
                break;
            case GameState.GAME_OVER:
                // Pass true for win only if all levels are completed.
                const wonGame = this.currentLevelIndex >= this.config.levels.length && this.matchedPairs === this.totalPairs;
                this.drawGameOverScreen(wonGame);
                break;
        }
    }

    // Draws the title screen elements
    private drawTitleScreen(): void {
        this.ctx.font = `bold 48px ${this.config.gameFont}`;
        this.ctx.fillStyle = this.config.uiColor;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle'; // Center text vertically
        this.ctx.fillText(this.config.titleScreenText, this.canvas.width / 2, this.canvas.height / 3);

        const buttonText = this.config.titleButtonText;
        const buttonWidth = 240;
        const buttonHeight = 70;
        const buttonX = (this.canvas.width - buttonWidth) / 2;
        const buttonY = this.canvas.height / 2 + 50;

        this.titleButtonRect = { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };

        // Draw button
        this.ctx.fillStyle = this.hoveredButton === 'title' ? this.config.uiButtonHoverColor : this.config.uiButtonColor;
        this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
        this.ctx.strokeStyle = this.config.uiColor;
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);

        // Draw button text
        this.ctx.font = `bold 28px ${this.config.gameFont}`;
        this.ctx.fillStyle = this.config.uiButtonTextColor;
        this.ctx.fillText(buttonText, this.canvas.width / 2, buttonY + buttonHeight / 2);
    }

    // Draws the instructions screen elements
    private drawInstructionsScreen(): void {
        this.ctx.font = `bold 36px ${this.config.gameFont}`;
        this.ctx.fillStyle = this.config.uiColor;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText("게임 방법", this.canvas.width / 2, 80);

        this.ctx.font = `20px ${this.config.gameFont}`;
        this.ctx.textAlign = 'left';
        const instructionLines = this.config.instructionsText.split('\n');
        let currentY = 140;
        const startX = this.canvas.width / 2 - 250; // Adjust for left alignment
        for (const line of instructionLines) {
            this.ctx.fillText(line, startX, currentY);
            currentY += 28; // Line spacing
        }

        const buttonText = this.config.instructionsButtonText;
        const buttonWidth = 240;
        const buttonHeight = 70;
        const buttonX = (this.canvas.width - buttonWidth) / 2;
        const buttonY = this.canvas.height - 100;

        this.instructionsButtonRect = { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };

        // Draw button
        this.ctx.fillStyle = this.hoveredButton === 'instructions' ? this.config.uiButtonHoverColor : this.config.uiButtonColor;
        this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
        this.ctx.strokeStyle = this.config.uiColor;
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);

        // Draw button text
        this.ctx.font = `bold 28px ${this.config.gameFont}`;
        this.ctx.fillStyle = this.config.uiButtonTextColor;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(buttonText, this.canvas.width / 2, buttonY + buttonHeight / 2);
    }

    // Draws the game board and UI elements during active gameplay
    private drawGameScreen(): void {
        const { rows, cols } = this.currentLevelConfig;

        // Draw board tiles
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const animalId = this.board[r][c];
                const isSelected = this.selectedTiles.some(tile => tile.x === c && tile.y === r);
                this.drawTile(c, r, animalId, isSelected);
            }
        }

        // Draw UI elements (level, score, time)
        this.ctx.fillStyle = this.config.uiColor;
        this.ctx.font = `bold 24px ${this.config.gameFont}`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';

        this.ctx.fillText(`레벨: ${this.currentLevelIndex + 1}`, 20, 20);
        this.ctx.fillText(`점수: ${Math.floor(this.score)}`, 20, 50);

        this.ctx.textAlign = 'right';
        const timeColor = this.remainingTime <= 10 ? 'red' : this.config.uiColor; // Change timer color if low
        this.ctx.fillStyle = timeColor;
        this.ctx.fillText(`시간: ${Math.max(0, Math.floor(this.remainingTime))}초`, this.canvas.width - 20, 20);
    }

    // Draws a single animal tile on the board
    private drawTile(gridX: number, gridY: number, animalId: number, isSelected: boolean): void {
        const x = this.boardOffsetX + gridX * this.tileSize + this.config.tilePadding;
        const y = this.boardOffsetY + gridY * this.tileSize + this.config.tilePadding;
        const size = this.tileSize - 2 * this.config.tilePadding;

        if (animalId === 0) {
            // Draw empty tile background
            this.ctx.fillStyle = '#CCC'; // Light grey for empty
            this.ctx.fillRect(x, y, size, size);
        } else {
            // Get animal image based on ID (e.g., "animal_1", "animal_2")
            const imageName = `animal_${animalId}`;
            const animalImage = this.assets.getImage(imageName);

            if (animalImage) {
                this.ctx.drawImage(animalImage, x, y, size, size);
            } else {
                // Fallback for missing image: draw a colored square with ID
                this.ctx.fillStyle = '#888';
                this.ctx.fillRect(x, y, size, size);
                this.ctx.fillStyle = '#FFF';
                this.ctx.font = `16px ${this.config.gameFont}`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(`? ${animalId}`, x + size / 2, y + size / 2);
            }
        }

        // Draw selection outline if the tile is selected
        if (isSelected) {
            this.ctx.strokeStyle = this.config.selectedTileOutlineColor;
            this.ctx.lineWidth = 4;
            this.ctx.strokeRect(x, y, size, size);
        }
    }

    // Draws the game over screen (win or lose)
    private drawGameOverScreen(won: boolean): void {
        this.ctx.font = `bold 48px ${this.config.gameFont}`;
        this.ctx.fillStyle = this.config.uiColor;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Display appropriate message based on win/loss
        const message = won ? this.config.gameOverWinText : this.config.gameOverLoseText;
        this.ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 3);

        this.ctx.font = `24px ${this.config.gameFont}`;
        this.ctx.fillText(`최종 점수: ${Math.floor(this.score)}`, this.canvas.width / 2, this.canvas.height / 2);

        const buttonText = this.config.gameOverButtonText;
        const buttonWidth = 240;
        const buttonHeight = 70;
        const buttonX = (this.canvas.width - buttonWidth) / 2;
        const buttonY = this.canvas.height / 2 + 100;

        this.gameOverButtonRect = { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };

        // Draw button
        this.ctx.fillStyle = this.hoveredButton === 'gameOver' ? this.config.uiButtonHoverColor : this.config.uiButtonColor;
        this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
        this.ctx.strokeStyle = this.config.uiColor;
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);

        // Draw button text
        this.ctx.font = `bold 28px ${this.config.gameFont}`;
        this.ctx.fillStyle = this.config.uiButtonTextColor;
        this.ctx.fillText(buttonText, this.canvas.width / 2, buttonY + buttonHeight / 2);
    }
}

// Global initialization logic: fetches game configuration and starts the game
document.addEventListener('DOMContentLoaded', () => {
    fetch('data.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            const game = new AnimalConnectGame('gameCanvas', data);
            game.init();
        })
        .catch(error => {
            console.error('Error loading game data:', error);
            // Display an error message directly on the canvas if loading fails
            const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
            const ctx = canvas?.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = 'red';
                ctx.font = '24px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('게임 로드 중 오류 발생: ' + error.message, canvas.width / 2, canvas.height / 2);
            }
        });
});
