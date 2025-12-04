interface GameConfig {
    canvasWidth: number;
    canvasHeight: number;
    gridSizeX: number;
    gridSizeY: number;
    blockSize: number;
    numBlockTypes: number;
    matchLength: number;
    gameDurationSeconds: number;
    gravitySpeed: number; // Pixels per second for falling blocks
    difficultySettings: {
        scoreThreshold: number;
        newBlockTypeChance: number; // Chance (0-1) to introduce a new block type when crossing threshold
        gravityModifier: number; // Multiplier for gravitySpeed
    }[];
    initialBlockTypes: number; // How many block types are available at the start
    texts: {
        title: string;
        instructions: string[];
        gameOver: string;
        playButton: string;
        instructionsButton: string;
        backButton: string;
        retryButton: string;
    };
    assets: {
        images: { name: string; path: string; width: number; height: number; }[];
        sounds: { name: string; path: string; duration_seconds: number; volume: number; }[];
    };
}

interface LoadedAssets {
    images: Map<string, HTMLImageElement>;
    sounds: Map<string, HTMLAudioElement>;
}

enum GameState {
    TITLE,
    INSTRUCTIONS,
    PLAYING,
    GAME_OVER
}

enum BlockState {
    IDLE,
    SWAPPING,
    CLEARING,
    FALLING
}

interface Block {
    type: number; // -1 for cleared/empty, 0 to numBlockTypes-1
    x: number; // Current grid x
    y: number; // Current animated y-position in grid units (can be float during falling)
    targetY: number; // Target y-position in grid units (integer) for falling
    state: BlockState;
    swapTargetX?: number; // Target x for swapping animation
    swapTargetY?: number; // Target y for swapping animation
    swapProgress?: number; // 0 to 1 for swap animation
    clearProgress?: number; // 0 to 1 for clear animation (scaling down)
}

interface SelectedBlock {
    x: number;
    y: number;
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config!: GameConfig;
    private assets!: LoadedAssets;

    private gameState: GameState = GameState.TITLE;
    private lastFrameTime = 0;

    // Game variables
    private grid: Block[][] = [];
    private score: number = 0;
    private timeLeft: number = 0;
    private selectedBlock: SelectedBlock | null = null;
    private currentDifficultyLevel: number = 0;
    private activeBlockTypes: number = 0; // Number of block types currently in play

    private gravitySpeed: number = 0; // Current gravity speed in pixels/sec
    private baseGravitySpeed: number = 0; // Base speed from config

    // Audio
    private bgm: HTMLAudioElement | null = null;

    // UI Buttons for click detection
    private buttons: { x: number; y: number; width: number; height: number; onClick: () => void }[] = [];

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;

        this.canvas.addEventListener('click', this.handleClick);
    }

    public async start(): Promise<void> {
        await this.loadConfig();
        this.setupCanvas();
        await this.loadAssets();
        this.initGameVariables();
        this.bgm = this.assets.sounds.get('bgm') || null;
        if (this.bgm) {
            this.bgm.loop = true;
            this.bgm.volume = this.config.assets.sounds.find(s => s.name === 'bgm')?.volume || 0.5;
        }
        requestAnimationFrame(this.gameLoop);
    }

    private async loadConfig(): Promise<void> {
        const response = await fetch('data.json');
        this.config = await response.json();
    }

    private setupCanvas(): void {
        this.canvas.width = this.config.canvasWidth;
        this.canvas.height = this.config.canvasHeight;
        this.ctx.font = '24px Arial'; // Use a basic font
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
    }

    private async loadAssets(): Promise<void> {
        const imagePromises = this.config.assets.images.map(img => {
            return new Promise<[string, HTMLImageElement]>((resolve, reject) => {
                const image = new Image();
                image.src = img.path;
                image.onload = () => resolve([img.name, image]);
                image.onerror = (e) => {
                    console.error(`Failed to load image: ${img.path}`, e);
                    // Resolve with a dummy image or null to allow game to proceed
                    const dummyImage = new Image(); // Fallback
                    resolve([img.name, dummyImage]);
                };
            });
        });

        const soundPromises = this.config.assets.sounds.map(snd => {
            return new Promise<[string, HTMLAudioElement]>((resolve) => {
                const audio = new Audio();
                audio.src = snd.path;
                audio.volume = snd.volume;
                audio.load(); // Preload audio
                audio.onerror = (e) => {
                    console.error(`Failed to load sound: ${snd.path}`, e);
                };
                resolve([snd.name, audio]); // Resolve even if load fails, to let game start
            });
        });

        const loadedImages = await Promise.all(imagePromises);
        const loadedSounds = await Promise.all(soundPromises);

        this.assets = {
            images: new Map(loadedImages),
            sounds: new Map(loadedSounds)
        };
    }

    private initGameVariables(): void {
        this.score = 0;
        this.timeLeft = this.config.gameDurationSeconds;
        this.selectedBlock = null;
        this.currentDifficultyLevel = 0;
        this.activeBlockTypes = this.config.initialBlockTypes;
        this.baseGravitySpeed = this.config.gravitySpeed;
        this.gravitySpeed = this.baseGravitySpeed;

        this.initGrid();
    }

    private initGrid(): void {
        this.grid = [];
        for (let y = 0; y < this.config.gridSizeY; y++) {
            this.grid.push([]);
            for (let x = 0; x < this.config.gridSizeX; x++) {
                // Initialize blocks with y position slightly above their target (for initial fall)
                this.grid[y].push(this.createRandomBlock(x, y - this.config.gridSizeY));
            }
        }
        // Let them fall into place initially
        for (let y = 0; y < this.config.gridSizeY; y++) {
            for (let x = 0; x < this.config.gridSizeX; x++) {
                this.grid[y][x].targetY = y;
                this.grid[y][x].state = BlockState.FALLING;
            }
        }
        // Resolve initial matches after blocks have fallen (this needs a small delay or loop through updates)
        // For simplicity, we can let the game loop sort it out on first few frames, or regenerate explicitly.
        // Let's resolve immediately, but ensure they don't fall from above screen again.
        let matchesFound = true;
        while (matchesFound) {
            matchesFound = false;
            const matchedCoordinates = this.findMatches();
            if (matchedCoordinates.length > 0) {
                matchesFound = true;
                for (const { x, y } of matchedCoordinates) {
                    // Replace immediately, not by falling
                    this.grid[y][x] = this.createRandomBlock(x, y);
                }
            }
        }
    }

    private createRandomBlock(x: number, y: number): Block {
        const type = Math.floor(Math.random() * this.activeBlockTypes);
        return { type, x, y, targetY: y, state: BlockState.IDLE };
    }

    private gameLoop = (currentTime: DOMHighResTimeStamp): void => {
        const deltaTime = (currentTime - this.lastFrameTime) / 1000; // in seconds
        this.lastFrameTime = currentTime;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame(this.gameLoop);
    }

    private update(deltaTime: number): void {
        switch (this.gameState) {
            case GameState.PLAYING:
                this.timeLeft -= deltaTime;
                if (this.timeLeft <= 0) {
                    this.timeLeft = 0;
                    this.gameState = GameState.GAME_OVER;
                    this.playSound('game_over');
                    if (this.bgm) {
                        this.bgm.pause();
                        this.bgm.currentTime = 0;
                    }
                }

                this.updateDifficulty();
                this.updateBlocks(deltaTime);
                break;
            // No updates needed for TITLE, INSTRUCTIONS, GAME_OVER states beyond input
        }
    }

    private updateBlocks(deltaTime: number): void {
        let anyBlockAnimating = false;

        // Update all block animations (falling, swapping, clearing)
        for (let y = 0; y < this.config.gridSizeY; y++) {
            for (let x = 0; x < this.config.gridSizeX; x++) {
                const block = this.grid[y][x];

                if (block.state === BlockState.FALLING) {
                    anyBlockAnimating = true;
                    block.y += this.gravitySpeed * deltaTime / this.config.blockSize; // Fall by fraction of block size
                    if (block.y >= block.targetY) {
                        block.y = block.targetY;
                        block.state = BlockState.IDLE;
                    }
                } else if (block.state === BlockState.SWAPPING) {
                    anyBlockAnimating = true;
                    if (block.swapProgress === undefined) block.swapProgress = 0;
                    block.swapProgress += 2.5 * deltaTime; // Faster swap animation speed
                    if (block.swapProgress >= 1) {
                        block.swapProgress = 1;
                        // The actual grid swap and match check is handled by `performSwap`'s setTimeout
                        // This block will transition to IDLE or back to SWAPPING (for swap back) by `performSwap`.
                    }
                } else if (block.state === BlockState.CLEARING) {
                    anyBlockAnimating = true;
                    if (block.clearProgress === undefined) block.clearProgress = 0;
                    block.clearProgress += 2.5 * deltaTime; // Faster clear animation speed
                    if (block.clearProgress >= 1) {
                        block.type = -1; // Mark as cleared
                        block.state = BlockState.IDLE; // Transition to IDLE after clearing animation
                        block.clearProgress = undefined;
                    }
                }
            }
        }

        // Only process game logic (gravity, new blocks, matches) if no blocks are animating
        if (!anyBlockAnimating) {
            let blocksNeedGravityOrFill = false;
            // Check for cleared blocks
            for (let y = 0; y < this.config.gridSizeY; y++) {
                for (let x = 0; x < this.config.gridSizeX; x++) {
                    if (this.grid[y][x].type === -1) {
                        blocksNeedGravityOrFill = true;
                        break;
                    }
                }
                if (blocksNeedGravityOrFill) break;
            }

            if (blocksNeedGravityOrFill) {
                this.applyGravity();
                this.fillNewBlocks();
            } else {
                // If no blocks needed gravity/fill, check for new matches (cascades)
                const matchedCoordinates = this.findMatches();
                if (matchedCoordinates.length > 0) {
                    this.playSound('match');
                    this.score += matchedCoordinates.length * 10;
                    for (const { x, y } of matchedCoordinates) {
                        this.grid[y][x].state = BlockState.CLEARING;
                        this.grid[y][x].clearProgress = 0;
                    }
                }
            }
        }
    }

    private findMatches(): { x: number; y: number }[] {
        const matches: { x: number; y: number }[] = [];
        const matchedGrid: boolean[][] = Array.from({ length: this.config.gridSizeY }, () =>
            Array(this.config.gridSizeX).fill(false)
        );

        // Check horizontal matches
        for (let y = 0; y < this.config.gridSizeY; y++) {
            for (let x = 0; x < this.config.gridSizeX - (this.config.matchLength - 1); x++) {
                const blockType = this.grid[y][x].type;
                if (blockType === -1) continue; // Skip cleared blocks

                let matchCount = 1;
                for (let i = 1; i < this.config.matchLength; i++) {
                    if (this.grid[y][x + i] && this.grid[y][x + i].type === blockType) {
                        matchCount++;
                    } else {
                        break;
                    }
                }
                if (matchCount >= this.config.matchLength) {
                    for (let i = 0; i < matchCount; i++) {
                        if (!matchedGrid[y][x + i]) {
                            matches.push({ x: x + i, y });
                            matchedGrid[y][x + i] = true;
                        }
                    }
                }
            }
        }

        // Check vertical matches
        for (let x = 0; x < this.config.gridSizeX; x++) {
            for (let y = 0; y < this.config.gridSizeY - (this.config.matchLength - 1); y++) {
                const blockType = this.grid[y][x].type;
                if (blockType === -1) continue; // Skip cleared blocks

                let matchCount = 1;
                for (let i = 1; i < this.config.matchLength; i++) {
                    if (this.grid[y + i] && this.grid[y + i][x] && this.grid[y + i][x].type === blockType) {
                        matchCount++;
                    } else {
                        break;
                    }
                }
                if (matchCount >= this.config.matchLength) {
                    for (let i = 0; i < matchCount; i++) {
                        if (!matchedGrid[y + i][x]) {
                            matches.push({ x, y: y + i });
                            matchedGrid[y + i][x] = true;
                        }
                    }
                }
            }
        }
        return matches;
    }

    private applyGravity(): void {
        for (let x = 0; x < this.config.gridSizeX; x++) {
            let emptySpots: number[] = []; // Y-coordinates of empty spots from bottom to top
            for (let y = this.config.gridSizeY - 1; y >= 0; y--) {
                const block = this.grid[y][x];
                if (block.type === -1) { // -1 means cleared/empty
                    emptySpots.push(y);
                } else if (emptySpots.length > 0) {
                    // Move this block down to the lowest empty spot
                    const targetY = emptySpots.shift()!; // Get the lowest empty spot
                    this.grid[targetY][x] = { ...block, x: x, y: y, targetY: targetY, state: BlockState.FALLING };
                    this.grid[y][x] = { type: -1, x: x, y: y, targetY: y, state: BlockState.IDLE }; // The original spot is now empty
                    emptySpots.push(y); // This spot is now empty
                }
            }
        }
    }

    private fillNewBlocks(): void {
        for (let y = 0; y < this.config.gridSizeY; y++) {
            for (let x = 0; x < this.config.gridSizeX; x++) {
                if (this.grid[y][x].type === -1) {
                    // Generate new block at the top,
                    // set its initial y above grid, and targetY to its grid position
                    const newBlockType = Math.floor(Math.random() * this.activeBlockTypes);
                    this.grid[y][x] = {
                        type: newBlockType,
                        x: x,
                        y: y - (this.config.gridSizeY), // Start above the screen by a few block heights
                        targetY: y,
                        state: BlockState.FALLING
                    };
                }
            }
        }
    }

    private updateDifficulty(): void {
        // Ensure difficulty levels are defined
        if (!this.config.difficultySettings || this.config.difficultySettings.length === 0) {
            return;
        }

        const nextDifficultyIndex = this.currentDifficultyLevel + 1;
        if (nextDifficultyIndex < this.config.difficultySettings.length) { // Ensure there is a next level
            const nextDifficulty = this.config.difficultySettings[nextDifficultyIndex];
            if (this.score >= nextDifficulty.scoreThreshold) {
                this.currentDifficultyLevel = nextDifficultyIndex; // Increment level
                // Apply difficulty changes
                if (nextDifficulty.gravityModifier) {
                    this.gravitySpeed = this.baseGravitySpeed * nextDifficulty.gravityModifier;
                }
                // Introduce new block types gradually, capped by total numBlockTypes
                if (this.activeBlockTypes < this.config.numBlockTypes && Math.random() < nextDifficulty.newBlockTypeChance) {
                    this.activeBlockTypes++;
                    console.log(`Difficulty increased! Active block types: ${this.activeBlockTypes}, Gravity: ${this.gravitySpeed}`);
                }
            }
        }
    }

    private render(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBackground();

        // Clear buttons for the current frame to repopulate based on game state
        this.buttons = [];

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
                this.drawGameOverScreen();
                break;
        }
    }

    private drawBackground(): void {
        const bgImage = this.assets.images.get('background');
        if (bgImage && bgImage.width > 0) { // Check if image loaded properly
            this.ctx.drawImage(bgImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = '#333';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    private drawTitleScreen(): void {
        this.ctx.fillStyle = '#FFF';
        this.ctx.font = '48px Arial';
        this.ctx.fillText(this.config.texts.title, this.canvas.width / 2, this.canvas.height / 3);

        this.drawButton(this.canvas.width / 2, this.canvas.height / 2, 200, 60, this.config.texts.playButton, () => {
            this.gameState = GameState.PLAYING;
            this.initGameVariables(); // Re-initialize for new game
            this.playSound('click');
            if (this.bgm) {
                this.bgm.play().catch(e => console.error("BGM play failed:", e));
            }
        });

        this.drawButton(this.canvas.width / 2, this.canvas.height / 2 + 80, 200, 60, this.config.texts.instructionsButton, () => {
            this.gameState = GameState.INSTRUCTIONS;
            this.playSound('click');
        });
    }

    private drawInstructionsScreen(): void {
        this.ctx.fillStyle = '#FFF';
        this.ctx.font = '36px Arial';
        this.ctx.fillText('조작법', this.canvas.width / 2, this.canvas.height / 4);

        this.ctx.font = '20px Arial';
        let yOffset = this.canvas.height / 3;
        for (const line of this.config.texts.instructions) {
            this.ctx.fillText(line, this.canvas.width / 2, yOffset);
            yOffset += 30;
        }

        this.drawButton(this.canvas.width / 2, this.canvas.height * 0.8, 150, 50, this.config.texts.backButton, () => {
            this.gameState = GameState.TITLE;
            this.playSound('click');
        });
    }

    private drawGameScreen(): void {
        const boardOffsetX = (this.canvas.width - this.config.gridSizeX * this.config.blockSize) / 2;
        const boardOffsetY = (this.canvas.height - this.config.gridSizeY * this.config.blockSize) / 2 + 50;

        // Draw grid lines
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.lineWidth = 1;
        for (let y = 0; y <= this.config.gridSizeY; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(boardOffsetX, boardOffsetY + y * this.config.blockSize);
            this.ctx.lineTo(boardOffsetX + this.config.gridSizeX * this.config.blockSize, boardOffsetY + y * this.config.blockSize);
            this.ctx.stroke();
        }
        for (let x = 0; x <= this.config.gridSizeX; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(boardOffsetX + x * this.config.blockSize, boardOffsetY);
            this.ctx.lineTo(boardOffsetX + x * this.config.blockSize, boardOffsetY + this.config.gridSizeY * this.config.blockSize);
            this.ctx.stroke();
        }

        for (let y = 0; y < this.config.gridSizeY; y++) {
            for (let x = 0; x < this.config.gridSizeX; x++) {
                const block = this.grid[y][x];
                if (block.type === -1) continue; // Don't draw cleared blocks

                let drawX = boardOffsetX + block.x * this.config.blockSize;
                let drawY = boardOffsetY + block.y * this.config.blockSize; // Use current animated y for falling

                if (block.state === BlockState.SWAPPING) {
                    const startX = boardOffsetX + block.x * this.config.blockSize;
                    const startY = boardOffsetY + (block.y * this.config.blockSize); // Use current animated y as start
                    const endX = boardOffsetX + (block.swapTargetX || block.x) * this.config.blockSize;
                    const endY = boardOffsetY + (block.swapTargetY || block.y) * this.config.blockSize;

                    drawX = startX + (endX - startX) * (block.swapProgress || 0);
                    drawY = startY + (endY - startY) * (block.swapProgress || 0);
                } else if (block.state === BlockState.CLEARING) {
                    const scale = 1 - (block.clearProgress || 0);
                    const halfBlock = this.config.blockSize / 2;
                    const scaledSize = this.config.blockSize * scale;
                    const offset = halfBlock * (1 - scale);
                    drawX += offset;
                    drawY += offset;
                    this.drawBlock(block.type, drawX, drawY, scaledSize, scaledSize);
                    continue; // Skip normal drawing path for clearing blocks
                }
                this.drawBlock(block.type, drawX, drawY);
            }
        }

        // Draw selected block highlight
        if (this.selectedBlock) {
            const highlightX = boardOffsetX + this.selectedBlock.x * this.config.blockSize;
            const highlightY = boardOffsetY + this.selectedBlock.y * this.config.blockSize;
            const selectionImage = this.assets.images.get('selection');
            if (selectionImage && selectionImage.width > 0) {
                this.ctx.drawImage(selectionImage, highlightX, highlightY, this.config.blockSize, this.config.blockSize);
            } else {
                this.ctx.strokeStyle = 'lime';
                this.ctx.lineWidth = 3;
                this.ctx.strokeRect(highlightX, highlightY, this.config.blockSize, this.config.blockSize);
            }
        }

        // Draw UI
        this.ctx.fillStyle = '#FFF';
        this.ctx.font = '28px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Score: ${this.score}`, 20, 40);
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`Time: ${Math.max(0, Math.floor(this.timeLeft))}`, this.canvas.width - 20, 40);
        this.ctx.textAlign = 'center'; // Reset for other texts
    }

    private drawBlock(type: number, x: number, y: number, width?: number, height?: number): void {
        const blockWidth = width || this.config.blockSize;
        const blockHeight = height || this.config.blockSize;
        const imageName = `block_${type}`;
        const blockImage = this.assets.images.get(imageName);

        if (blockImage && blockImage.width > 0) {
            this.ctx.drawImage(blockImage, x, y, blockWidth, blockHeight);
        } else {
            // Fallback: draw colored rectangle
            const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
            this.ctx.fillStyle = colors[type % colors.length];
            this.ctx.fillRect(x, y, blockWidth, blockHeight);
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(x, y, blockWidth, blockHeight);
        }
    }

    private drawGameOverScreen(): void {
        this.ctx.fillStyle = '#FFF';
        this.ctx.font = '48px Arial';
        this.ctx.fillText(this.config.texts.gameOver, this.canvas.width / 2, this.canvas.height / 3);
        this.ctx.font = '36px Arial';
        this.ctx.fillText(`Final Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2);

        this.drawButton(this.canvas.width / 2, this.canvas.height * 0.7, 200, 60, this.config.texts.retryButton, () => {
            this.gameState = GameState.PLAYING;
            this.initGameVariables();
            this.playSound('click');
            if (this.bgm) {
                this.bgm.play().catch(e => console.error("BGM play failed:", e));
            }
        });

        this.drawButton(this.canvas.width / 2, this.canvas.height * 0.7 + 80, 200, 60, this.config.texts.backButton, () => {
            this.gameState = GameState.TITLE;
            this.playSound('click');
        });
    }

    private drawButton(x: number, y: number, width: number, height: number, text: string, onClick: () => void): void {
        const btnX = x - width / 2;
        const btnY = y - height / 2;

        this.ctx.fillStyle = '#666';
        this.ctx.fillRect(btnX, btnY, width, height);
        this.ctx.strokeStyle = '#FFF';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(btnX, btnY, width, height);

        this.ctx.fillStyle = '#FFF';
        this.ctx.font = '28px Arial';
        this.ctx.fillText(text, x, y);

        // Store button data for click handling
        this.buttons.push({ x: btnX, y: btnY, width, height, onClick });
    }

    private handleClick = (event: MouseEvent): void => {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        switch (this.gameState) {
            case GameState.TITLE:
            case GameState.INSTRUCTIONS:
            case GameState.GAME_OVER:
                // Check if any UI button was clicked
                for (const button of this.buttons) {
                    if (mouseX >= button.x && mouseX <= button.x + button.width &&
                        mouseY >= button.y && mouseY <= button.y + button.height) {
                        button.onClick();
                        return;
                    }
                }
                break;

            case GameState.PLAYING:
                // Prevent clicks if any block is animating
                for (let r = 0; r < this.config.gridSizeY; r++) {
                    for (let c = 0; c < this.config.gridSizeX; c++) {
                        if (this.grid[r][c].state !== BlockState.IDLE) {
                            return;
                        }
                    }
                }

                const boardOffsetX = (this.canvas.width - this.config.gridSizeX * this.config.blockSize) / 2;
                const boardOffsetY = (this.canvas.height - this.config.gridSizeY * this.config.blockSize) / 2 + 50;

                if (mouseX >= boardOffsetX && mouseX < boardOffsetX + this.config.gridSizeX * this.config.blockSize &&
                    mouseY >= boardOffsetY && mouseY < boardOffsetY + this.config.gridSizeY * this.config.blockSize) {

                    const gridX = Math.floor((mouseX - boardOffsetX) / this.config.blockSize);
                    const gridY = Math.floor((mouseY - boardOffsetY) / this.config.blockSize);

                    this.handleBlockClick(gridX, gridY);
                }
                break;
        }
    }

    private playSound(name: string): void {
        const audio = this.assets.sounds.get(name);
        if (audio) {
            // Clone the node to play multiple sounds simultaneously if needed
            const clonedAudio = audio.cloneNode() as HTMLAudioElement;
            clonedAudio.volume = audio.volume;
            clonedAudio.play().catch(e => console.error(`Failed to play sound ${name}:`, e));
        }
    }

    private handleBlockClick(x: number, y: number): void {
        if (this.selectedBlock === null) {
            // First click, select the block
            this.selectedBlock = { x, y };
        } else {
            // Second click, try to swap
            const dx = Math.abs(x - this.selectedBlock.x);
            const dy = Math.abs(y - this.selectedBlock.y);

            if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
                // Adjacent block, perform swap
                this.performSwap(this.selectedBlock.x, this.selectedBlock.y, x, y);
            }
            this.selectedBlock = null; // Deselect after second click
        }
    }

    private performSwap(x1: number, y1: number, x2: number, y2: number): void {
        const block1 = this.grid[y1][x1];
        const block2 = this.grid[y2][x2];

        // Animate swap
        block1.state = BlockState.SWAPPING;
        block1.swapTargetX = x2;
        block1.swapTargetY = y2;
        block1.swapProgress = 0;

        block2.state = BlockState.SWAPPING;
        block2.swapTargetX = x1;
        block2.swapTargetY = y1;
        block2.swapProgress = 0;

        this.playSound('swap');

        // Wait for animation to complete (approx 0.4 seconds based on 2.5 * deltaTime)
        setTimeout(() => {
            // Temporarily update grid positions (for match check)
            [this.grid[y1][x1], this.grid[y2][x2]] = [this.grid[y2][x2], this.grid[y1][x1]];

            // Update block's internal (x,y) to reflect new grid position
            block1.x = x2;
            block1.y = y2;
            block2.x = x1;
            block2.y = y1;

            const matches = this.findMatches();
            if (matches.length === 0) {
                // No match, swap back
                this.playSound('swap'); // Play swap sound again for swap back
                block1.state = BlockState.SWAPPING;
                block1.swapTargetX = x1;
                block1.swapTargetY = y1;
                block1.swapProgress = 0;

                block2.state = BlockState.SWAPPING;
                block2.swapTargetX = x2;
                block2.swapTargetY = y2;
                block2.swapProgress = 0;

                setTimeout(() => {
                    // Revert grid positions
                    [this.grid[y1][x1], this.grid[y2][x2]] = [this.grid[y2][x2], this.grid[y1][x1]];
                    // Revert block's internal (x,y)
                    block1.x = x1;
                    block1.y = y1;
                    block2.x = x2;
                    block2.y = y2;
                    // Reset states and swap properties
                    block1.state = BlockState.IDLE;
                    block2.state = BlockState.IDLE;
                    block1.swapTargetX = undefined;
                    block1.swapTargetY = undefined;
                    block1.swapProgress = undefined;
                    block2.swapTargetX = undefined;
                    block2.swapTargetY = undefined;
                    block2.swapProgress = undefined;
                }, 400); // Duration of swap back animation
            } else {
                // Matches found, they will be processed by the update loop (setting CLEARING state)
                // Reset states and swap properties for blocks that were involved in match
                block1.state = BlockState.IDLE;
                block2.state = BlockState.IDLE;
                block1.swapTargetX = undefined;
                block1.swapTargetY = undefined;
                block1.swapProgress = undefined;
                block2.swapTargetX = undefined;
                block2.swapTargetY = undefined;
                block2.swapProgress = undefined;
            }
        }, 400); // Duration of initial swap animation
    }
}

// Global scope to initialize the game
window.onload = () => {
    const game = new Game('gameCanvas');
    game.start().catch(e => console.error("Game failed to start:", e));
};
