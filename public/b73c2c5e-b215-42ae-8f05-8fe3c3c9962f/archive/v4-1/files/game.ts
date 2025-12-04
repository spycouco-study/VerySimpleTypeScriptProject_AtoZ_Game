interface AssetImageConfig {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface AssetSoundConfig {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface AssetsConfig {
    images: AssetImageConfig[];
    sounds: AssetSoundConfig[];
}

interface LevelConfig {
    rows: number;
    cols: number;
    numAnimalTypes: number;
    timeLimitSeconds: number;
    scoreMultiplier: number;
}

interface GameConfig {
    canvasWidth: number;
    canvasHeight: number;
    boardMarginX: number;
    boardMarginY: number;
    baseTileSize: number;
    tilePadding: number;
    matchScore: number;
    penaltyTime: number;
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
    assets: AssetsConfig;
    levels: LevelConfig[];
}

// --- Utility Classes and Functions ---
class Vector2 {
    constructor(public x: number, public y: number) {}
}

// --- Asset Management ---
class AssetLoader {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private totalAssets: number = 0;
    private loadedAssets: number = 0;

    constructor() {}

    async load(assetsConfig: AssetsConfig): Promise<{ images: Map<string, HTMLImageElement>, sounds: Map<string, HTMLAudioElement> }> {
        const imagePromises = assetsConfig.images.map(img => this.loadImage(img));
        const soundPromises = assetsConfig.sounds.map(snd => this.loadSound(snd));

        this.totalAssets = imagePromises.length + soundPromises.length;
        this.loadedAssets = 0;

        await Promise.all([...imagePromises, ...soundPromises]);
        return { images: this.images, sounds: this.sounds };
    }

    private loadImage(imageConfig: AssetImageConfig): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = imageConfig.path;
            img.onload = () => {
                this.images.set(imageConfig.name, img);
                this.loadedAssets++;
                console.log(`Loaded image: ${imageConfig.name} (${this.loadedAssets}/${this.totalAssets})`);
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${imageConfig.path}`);
                reject(new Error(`Failed to load image: ${imageConfig.path}`));
            };
        });
    }

    private loadSound(soundConfig: AssetSoundConfig): Promise<void> {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.src = soundConfig.path;
            audio.preload = 'auto';
            audio.oncanplaythrough = () => { // Ensure audio is fully loaded
                this.sounds.set(soundConfig.name, audio);
                this.loadedAssets++;
                console.log(`Loaded sound: ${soundConfig.name} (${this.loadedAssets}/${this.totalAssets})`);
                resolve();
            };
            audio.onerror = () => {
                console.error(`Failed to load sound: ${soundConfig.path}`);
                reject(new Error(`Failed to load sound: ${soundConfig.path}`));
            };
            // For some browsers, checking audio.readyState might be needed if oncanplaythrough doesn't fire immediately
        });
    }
}

class AudioManager {
    private sounds: Map<string, HTMLAudioElement>;
    private bgmAudio: HTMLAudioElement | null = null;
    private bgmVolume: number = 0;
    private bgmLooping: boolean = false;

    constructor(sounds: Map<string, HTMLAudioElement>) {
        this.sounds = sounds;
    }

    play(name: string, loop: boolean = false, volume: number = 1.0): void {
        const audio = this.sounds.get(name);
        if (audio) {
            if (loop) {
                this.stopBGM(); // Stop any previous BGM
                this.bgmAudio = audio;
                this.bgmVolume = volume;
                this.bgmLooping = true;
                audio.loop = true;
                audio.volume = volume;
                audio.play().catch(e => console.error(`Error playing BGM ${name}:`, e));
            } else {
                // For sound effects, create a clone to allow simultaneous playback
                const clonedAudio = audio.cloneNode() as HTMLAudioElement;
                clonedAudio.volume = volume;
                clonedAudio.play().catch(e => console.error(`Error playing sound effect ${name}:`, e));
            }
        } else {
            console.warn(`Sound "${name}" not found.`);
        }
    }

    stop(name: string): void {
        const audio = this.sounds.get(name);
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            if (this.bgmAudio === audio) {
                this.bgmAudio = null;
                this.bgmLooping = false;
            }
        }
    }

    stopBGM(): void {
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio.currentTime = 0;
            this.bgmAudio = null;
            this.bgmLooping = false;
        }
    }

    setBGMVolume(volume: number): void {
        if (this.bgmAudio) {
            this.bgmAudio.volume = volume;
            this.bgmVolume = volume;
        }
    }

    // Helper for browser auto-play policy
    resumeBGM(): void {
        if (this.bgmAudio && this.bgmLooping && this.bgmAudio.paused) {
            this.bgmAudio.play().catch(e => console.error("Could not resume BGM:", e));
        }
    }
}

// --- UI Components ---
class Button {
    private x: number;
    private y: number;
    private width: number;
    private height: number;
    private text: string;
    private color: string;
    private hoverColor: string;
    private textColor: string;
    private isHovered: boolean = false;
    private callback: () => void;
    private ctx: CanvasRenderingContext2D;
    private font: string;

    constructor(
        ctx: CanvasRenderingContext2D,
        x: number, y: number,
        width: number, height: number,
        text: string,
        color: string, hoverColor: string, textColor: string,
        font: string,
        callback: () => void
    ) {
        this.ctx = ctx;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.text = text;
        this.color = color;
        this.hoverColor = hoverColor;
        this.textColor = textColor;
        this.font = font;
        this.callback = callback;
    }

    draw(): void {
        this.ctx.fillStyle = this.isHovered ? this.hoverColor : this.color;
        this.ctx.fillRect(this.x, this.y, this.width, this.height);

        this.ctx.fillStyle = this.textColor;
        this.ctx.font = `bold ${this.height / 2.5}px ${this.font}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(this.text, this.x + this.width / 2, this.y + this.height / 2);
    }

    handleMouseMove(mouseX: number, mouseY: number): void {
        this.isHovered = (
            mouseX >= this.x && mouseX <= this.x + this.width &&
            mouseY >= this.y && mouseY <= this.y + this.height
        );
    }

    handleClick(mouseX: number, mouseY: number): boolean {
        // Changed to explicitly check bounds on click, rather than relying solely on `isHovered`
        if (mouseX >= this.x && mouseX <= this.x + this.width &&
            mouseY >= this.y && mouseY <= this.y + this.height) {
            this.callback();
            return true;
        }
        return false;
    }
}

class GameUI {
    private ctx: CanvasRenderingContext2D;
    private config: GameConfig;
    private images: Map<string, HTMLImageElement>;
    private buttons: Button[] = [];
    private currentScore: number = 0;
    private currentTime: number = 0;
    private currentLevel: number = 0;
    private totalLevels: number = 0;

    constructor(ctx: CanvasRenderingContext2D, config: GameConfig, images: Map<string, HTMLImageElement>) {
        this.ctx = ctx;
        this.config = config;
        this.images = images;
    }

    private clearButtons(): void {
        this.buttons = [];
    }

    private addButton(x: number, y: number, width: number, height: number, text: string, callback: () => void): void {
        this.buttons.push(new Button(
            this.ctx, x, y, width, height, text,
            this.config.uiButtonColor, this.config.uiButtonHoverColor, this.config.uiButtonTextColor,
            this.config.gameFont,
            callback
        ));
    }

    drawTitleScreen(onStartGame: () => void): void {
        this.clearButtons();
        // Background is drawn by AnimalConnectGame.draw()
        this.ctx.fillStyle = this.config.uiColor;
        this.ctx.font = `bold 60px ${this.config.gameFont}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(this.config.titleScreenText, this.config.canvasWidth / 2, this.config.canvasHeight / 2 - 50);

        const buttonWidth = 200;
        const buttonHeight = 60;
        this.addButton(
            (this.config.canvasWidth - buttonWidth) / 2,
            this.config.canvasHeight / 2 + 50,
            buttonWidth, buttonHeight,
            this.config.titleButtonText,
            onStartGame
        );
        this.buttons.forEach(btn => btn.draw());
    }

    drawInstructionsScreen(onPlayGame: () => void): void {
        this.clearButtons();
        // Background is drawn by AnimalConnectGame.draw()
        this.ctx.fillStyle = this.config.uiColor;
        this.ctx.font = `20px ${this.config.gameFont}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        const lines = this.config.instructionsText.split('\n');
        const startY = 100;
        const lineHeight = 30;

        lines.forEach((line, index) => {
            this.ctx.fillText(line, this.config.canvasWidth / 2, startY + index * lineHeight);
        });

        const buttonWidth = 200;
        const buttonHeight = 60;
        this.addButton(
            (this.config.canvasWidth - buttonWidth) / 2,
            this.config.canvasHeight - 100,
            buttonWidth, buttonHeight,
            this.config.instructionsButtonText,
            onPlayGame
        );
        this.buttons.forEach(btn => btn.draw());
    }

    drawPlayingUI(score: number, time: number, level: number, totalLevels: number): void {
        this.currentScore = score;
        this.currentTime = time;
        this.currentLevel = level;
        this.totalLevels = totalLevels;

        this.ctx.fillStyle = this.config.uiColor;
        this.ctx.font = `bold 24px ${this.config.gameFont}`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`점수: ${this.currentScore}`, 10, 10);
        this.ctx.fillText(`레벨: ${this.currentLevel + 1} / ${this.totalLevels}`, 10, 40);

        this.ctx.textAlign = 'right';
        this.ctx.fillText(`시간: ${Math.max(0, Math.floor(this.currentTime))}s`, this.config.canvasWidth - 10, 10);
    }

    drawGameOverScreen(win: boolean, onRestart: () => void): void {
        this.clearButtons();
        // Background is drawn by AnimalConnectGame.draw()
        this.ctx.fillStyle = this.config.uiColor;
        this.ctx.font = `bold 50px ${this.config.gameFont}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(
            win ? this.config.gameOverWinText : this.config.gameOverLoseText,
            this.config.canvasWidth / 2, this.config.canvasHeight / 2 - 50
        );
        this.ctx.font = `bold 30px ${this.config.gameFont}`;
        this.ctx.fillText(`최종 점수: ${this.currentScore}`, this.config.canvasWidth / 2, this.config.canvasHeight / 2 + 10);

        const buttonWidth = 200;
        const buttonHeight = 60;
        this.addButton(
            (this.config.canvasWidth - buttonWidth) / 2,
            this.config.canvasHeight / 2 + 80,
            buttonWidth, buttonHeight,
            this.config.gameOverButtonText,
            onRestart
        );
        this.buttons.forEach(btn => btn.draw());
    }

    handleMouseMove(mouseX: number, mouseY: number): void {
        this.buttons.forEach(btn => btn.handleMouseMove(mouseX, mouseY));
    }

    handleClick(mouseX: number, mouseY: number): boolean {
        for (const btn of this.buttons) {
            if (btn.handleClick(mouseX, mouseY)) {
                return true;
            }
        }
        return false;
    }

    drawBackground(): void {
        const bgImage = this.images.get('background');
        if (bgImage) {
            this.ctx.drawImage(bgImage, 0, 0, this.config.canvasWidth, this.config.canvasHeight);
        } else {
            this.ctx.fillStyle = '#ADD8E6'; // Fallback background color
            this.ctx.fillRect(0, 0, this.config.canvasWidth, this.config.canvasHeight);
        }
    }
}

// --- Game Logic Classes ---
class Tile {
    image: HTMLImageElement;
    constructor(
        public row: number,
        public col: number,
        public animalType: number,
        imageMap: Map<string, HTMLImageElement>,
        public tileSize: number,
        public tilePadding: number,
        public boardMarginX: number,
        public boardMarginY:
        number
    ) {
        const imageName = `animal_${animalType}`;
        const img = imageMap.get(imageName);
        if (!img) {
            throw new Error(`Image for animal type ${animalType} (${imageName}) not found.`);
        }
        this.image = img;
    }

    draw(ctx: CanvasRenderingContext2D, isSelected: boolean, selectedOutlineColor: string): void {
        const x = this.boardMarginX + this.col * (this.tileSize + this.tilePadding);
        const y = this.boardMarginY + this.row * (this.tileSize + this.tilePadding);

        ctx.drawImage(this.image, x, y, this.tileSize, this.tileSize);

        if (isSelected) {
            ctx.strokeStyle = selectedOutlineColor;
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, this.tileSize, this.tileSize);
        }
    }

    getBounds(): { x: number, y: number, width: number, height: number } {
        const x = this.boardMarginX + this.col * (this.tileSize + this.tilePadding);
        const y = this.boardMarginY + this.row * (this.tileSize + this.tilePadding);
        return { x, y, width: this.tileSize, height: this.tileSize };
    }
}

class Pathfinder {
    private board: Board;
    private config: GameConfig;
    private rows: number;
    private cols: number;

    constructor(board: Board, config: GameConfig) {
        this.board = board;
        this.config = config;
        this.rows = board.rows;
        this.cols = board.cols;
    }

    // Helper: Check if a given cell (r, c) is outside the board, empty, or one of the selected tiles
    private _isCellClear(r: number, c: number, selectedTile1: Tile, selectedTile2: Tile): boolean {
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) {
            return true; // Outside board is considered clear
        }
        const tileAtPos = this.board.getTile(r, c);
        return tileAtPos === null || tileAtPos === selectedTile1 || tileAtPos === selectedTile2;
    }

    // Helper: Check if a straight line segment is clear
    private _isLineClear(r1: number, c1: number, r2: number, c2: number, selectedTile1: Tile, selectedTile2: Tile): boolean {
        // Horizontal line
        if (r1 === r2) {
            for (let c = Math.min(c1, c2) + 1; c < Math.max(c1, c2); c++) {
                if (!this._isCellClear(r1, c, selectedTile1, selectedTile2)) return false;
            }
        }
        // Vertical line
        else if (c1 === c2) {
            for (let r = Math.min(r1, r2) + 1; r < Math.max(r1, r2); r++) {
                if (!this._isCellClear(r, c1, selectedTile1, selectedTile2)) return false;
            }
        }
        // Diagonal or non-straight line
        else {
            return false;
        }
        return true;
    }

    // Main pathfinding logic
    findPath(tile1: Tile, tile2: Tile): boolean {
        if (!tile1 || !tile2 || tile1.animalType !== tile2.animalType || (tile1.row === tile2.row && tile1.col === tile2.col)) {
            return false; // Not same type or same tile
        }

        const r1 = tile1.row;
        const c1 = tile1.col;
        const r2 = tile2.row;
        const c2 = tile2.col;

        // 0 bends (straight line)
        if (this._isLineClear(r1, c1, r2, c2, tile1, tile2)) {
            return true;
        }

        // 1 bend (L-shape)
        // Check (r1, c2) as corner
        if (this._isCellClear(r1, c2, tile1, tile2) &&
            this._isLineClear(r1, c1, r1, c2, tile1, tile2) &&
            this._isLineClear(r1, c2, r2, c2, tile1, tile2)) {
            return true;
        }
        // Check (r2, c1) as corner
        if (this._isCellClear(r2, c1, tile1, tile2) &&
            this._isLineClear(r1, c1, r2, c1, tile1, tile2) &&
            this._isLineClear(r2, c1, r2, c2, tile1, tile2)) {
            return true;
        }

        // 2 bends (Z, U, C-shape) - iterate through all possible intermediate cells (including outside board)
        const extendMinR = -1;
        const extendMaxR = this.rows;
        const extendMinC = -1;
        const extendMaxC = this.cols;

        // Path (H-V-H) via (r1, c_intermediate) and (r2, c_intermediate)
        for (let cc = extendMinC; cc <= extendMaxC; cc++) {
            if (this._isCellClear(r1, cc, tile1, tile2) &&
                this._isCellClear(r2, cc, tile1, tile2) &&
                this._isLineClear(r1, c1, r1, cc, tile1, tile2) && // First H segment
                this._isLineClear(r1, cc, r2, cc, tile1, tile2) && // V segment
                this._isLineClear(r2, cc, r2, c2, tile1, tile2)) { // Second H segment
                return true;
            }
        }

        // Path (V-H-V) via (r_intermediate, c1) and (r_intermediate, c2)
        for (let rr = extendMinR; rr <= extendMaxR; rr++) {
            if (this._isCellClear(rr, c1, tile1, tile2) &&
                this._isCellClear(rr, c2, tile1, tile2) &&
                this._isLineClear(r1, c1, rr, c1, tile1, tile2) && // First V segment
                this._isLineClear(rr, c1, rr, c2, tile1, tile2) && // H segment
                this._isLineClear(rr, c2, r2, c2, tile1, tile2)) { // Second V segment
                return true;
            }
        }

        return false; // No path found
    }
}

class Board {
    private ctx: CanvasRenderingContext2D;
    private config: GameConfig;
    private images: Map<string, HTMLImageElement>;
    private _rows: number;
    private _cols: number;
    private _tileSize: number;
    private _tilePadding: number;
    private _boardMarginX: number;
    private _boardMarginY: number;
    private _numAnimalTypes: number;

    private grid: (Tile | null)[][];
    private pathfinder: Pathfinder;

    get rows(): number { return this._rows; }
    get cols(): number { return this._cols; }

    constructor(ctx: CanvasRenderingContext2D, config: GameConfig, images: Map<string, HTMLImageElement>) {
        this.ctx = ctx;
        this.config = config;
        this.images = images;
    }

    init(levelConfig: LevelConfig): void {
        this._rows = levelConfig.rows;
        this._cols = levelConfig.cols;
        this._tileSize = this.config.baseTileSize;
        this._tilePadding = this.config.tilePadding;
        this._boardMarginX = this.config.boardMarginX;
        this._boardMarginY = this.config.boardMarginY;
        this._numAnimalTypes = levelConfig.numAnimalTypes;

        this.grid = Array.from({ length: this._rows }, () => Array(this._cols).fill(null));
        this.pathfinder = new Pathfinder(this, this.config);
        this.generateBoard();
    }

    private generateBoard(): void {
        const totalTiles = this._rows * this._cols;
        if (totalTiles % 2 !== 0) {
            console.error("Board size must be even for tile pairing.");
            // Forcing an even number of tiles, by removing the last tile if board is odd.
            // This needs careful consideration if specific dimensions are always odd.
            // A better solution would be to always configure even dimensions in data.json.
            if (this._cols % 2 !== 0) { // If cols is odd, make it even for consistency.
                this._cols--;
            }
            if (this._rows % 2 !== 0 && this._cols % 2 !== 0) { // if both are odd, just try to make cols even
                this._rows--;
            }
            if ((this._rows * this._cols) % 2 !== 0) {
                console.error("Board dimensions still result in odd tile count after adjustment. Game might be unplayable.");
                // As a last resort, just reset cols to be 1 less to force even
                this._cols = Math.max(2, this._cols - 1);
            }
        }
        
        const currentTotalTiles = this._rows * this._cols;
        const animalTypes: number[] = [];
        // Ensure each animal type appears an even number of times
        for (let i = 0; i < currentTotalTiles / 2; i++) {
            animalTypes.push((i % this._numAnimalTypes) + 1);
            animalTypes.push((i % this._numAnimalTypes) + 1);
        }

        // Fisher-Yates shuffle
        for (let i = animalTypes.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [animalTypes[i], animalTypes[j]] = [animalTypes[j], animalTypes[i]];
        }

        let animalIndex = 0;
        for (let r = 0; r < this._rows; r++) {
            for (let c = 0; c < this._cols; c++) {
                if (animalIndex < animalTypes.length) { // Ensure we don't go out of bounds if currentTotalTiles was adjusted
                    this.grid[r][c] = new Tile(
                        r, c, animalTypes[animalIndex++],
                        this.images,
                        this._tileSize, this._tilePadding,
                        this._boardMarginX, this._boardMarginY
                    );
                } else {
                    this.grid[r][c] = null; // Fill remaining with null if board size was reduced
                }
            }
        }
    }

    draw(selectedTile: Tile | null): void {
        for (let r = 0; r < this._rows; r++) {
            for (let c = 0; c < this._cols; c++) {
                const tile = this.grid[r][c];
                if (tile) {
                    tile.draw(this.ctx, tile === selectedTile, this.config.selectedTileOutlineColor);
                }
            }
        }
    }

    getTileAt(mouseX: number, mouseY: number): Tile | null {
        for (let r = 0; r < this._rows; r++) {
            for (let c = 0; c < this._cols; c++) {
                const tile = this.grid[r][c];
                if (tile) {
                    const bounds = tile.getBounds();
                    if (mouseX >= bounds.x && mouseX < bounds.x + bounds.width &&
                        mouseY >= bounds.y && mouseY < bounds.y + bounds.height) {
                        return tile;
                    }
                }
            }
        }
        return null;
    }

    getTile(r: number, c: number): Tile | null {
        if (r < 0 || r >= this._rows || c < 0 || c >= this._cols) {
            return null; // Outside board
        }
        return this.grid[r][c];
    }

    checkMatch(tile1: Tile, tile2: Tile): boolean {
        return this.pathfinder.findPath(tile1, tile2);
    }

    removeTiles(tile1: Tile, tile2: Tile): void {
        this.grid[tile1.row][tile1.col] = null;
        this.grid[tile2.row][tile2.col] = null;
    }

    isBoardClear(): boolean {
        for (let r = 0; r < this._rows; r++) {
            for (let c = 0; c < this._cols; c++) {
                if (this.grid[r][c] !== null) {
                    return false;
                }
            }
        }
        return true;
    }

    // Optional: Check if there are any valid moves remaining (can be expensive)
    hasRemainingMatches(): boolean {
        const activeTiles: Tile[] = [];
        for (let r = 0; r < this._rows; r++) {
            for (let c = 0; c < this._cols; c++) {
                if (this.grid[r][c]) {
                    activeTiles.push(this.grid[r][c]!);
                }
            }
        }

        if (activeTiles.length === 0) return false;

        for (let i = 0; i < activeTiles.length; i++) {
            for (let j = i + 1; j < activeTiles.length; j++) {
                const tile1 = activeTiles[i];
                const tile2 = activeTiles[j];
                if (tile1.animalType === tile2.animalType && this.pathfinder.findPath(tile1, tile2)) {
                    return true;
                }
            }
        }
        return false;
    }

    // Optional: Shuffle remaining tiles if no matches are left
    shuffle(): void {
        const currentActiveTiles: Tile[] = [];
        for (let r = 0; r < this._rows; r++) {
            for (let c = 0; c < this._cols; c++) {
                if (this.grid[r][c]) {
                    currentActiveTiles.push(this.grid[r][c]!);
                    this.grid[r][c] = null; // Clear old positions
                }
            }
        }

        // Extract animal types to shuffle
        const animalTypesToShuffle = currentActiveTiles.map(tile => tile.animalType);

        // Shuffle the animal types
        for (let i = animalTypesToShuffle.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [animalTypesToShuffle[i], animalTypesToShuffle[j]] = [animalTypesToShuffle[j], animalTypesToShuffle[i]];
        }

        // Repopulate grid with shuffled types
        let typeIndex = 0;
        for (let r = 0; r < this._rows; r++) {
            for (let c = 0; c < this._cols; c++) {
                if (typeIndex < animalTypesToShuffle.length) {
                    this.grid[r][c] = new Tile(
                        r, c, animalTypesToShuffle[typeIndex++],
                        this.images,
                        this._tileSize, this._tilePadding,
                        this._boardMarginX, this._boardMarginY
                    );
                } else {
                    this.grid[r][c] = null; // Ensure cells are null if there are fewer tiles after shuffle (unlikely with even total tiles)
                }
            }
        }
    }
}

// --- Main Game Class ---
enum GameState {
    TITLE_SCREEN,
    INSTRUCTIONS_SCREEN,
    PLAYING,
    GAME_OVER_WIN,
    GAME_OVER_LOSE
}

class AnimalConnectGame {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config: GameConfig;
    private images: Map<string, HTMLImageElement>;
    private sounds: Map<string, HTMLAudioElement>;

    private audioManager: AudioManager;
    private ui: GameUI;
    private board: Board;

    private gameState: GameState = GameState.TITLE_SCREEN;

    private currentLevelIndex: number = 0;
    private score: number = 0;
    private timeRemaining: number = 0;
    private selectedTile: Tile | null = null;
    private lastMatchCheckTime: number = 0; // To prevent rapid double clicks

    constructor(canvasElementId: string, config: GameConfig, assets: { images: Map<string, HTMLImageElement>, sounds: Map<string, HTMLAudioElement> }) {
        this.canvas = document.getElementById(canvasElementId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.config = config;
        this.images = assets.images;
        this.sounds = assets.sounds;

        this.canvas.width = this.config.canvasWidth;
        this.canvas.height = this.config.canvasHeight;

        this.audioManager = new AudioManager(this.sounds);
        this.ui = new GameUI(this.ctx, this.config, this.images);
        this.board = new Board(this.ctx, this.config, this.images);

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.canvas.addEventListener('click', this.handleClick.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    }

    init(): void {
        this.currentLevelIndex = 0;
        this.score = 0;
        this.selectedTile = null;
        this.gameState = GameState.TITLE_SCREEN;
        this.audioManager.stopBGM();
        this.audioManager.play('bgm_loop', true, this.config.assets.sounds.find(s => s.name === 'bgm_loop')?.volume || 0.3);
    }

    private startLevel(levelIndex: number): void {
        if (levelIndex >= this.config.levels.length) {
            this.gameState = GameState.GAME_OVER_WIN;
            this.audioManager.play('level_complete', false, this.config.assets.sounds.find(s => s.name === 'level_complete')?.volume || 0.8);
            return;
        }

        this.currentLevelIndex = levelIndex;
        const levelConfig = this.config.levels[this.currentLevelIndex];
        this.timeRemaining = levelConfig.timeLimitSeconds;
        this.selectedTile = null;
        this.board.init(levelConfig);
        this.gameState = GameState.PLAYING;
    }

    private handleClick(event: MouseEvent): void {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        if (this.ui.handleClick(mouseX, mouseY)) {
            this.audioManager.resumeBGM(); // Try to resume BGM after user interaction
            return; // UI button click handled
        }

        if (this.gameState === GameState.PLAYING) {
            const clickedTile = this.board.getTileAt(mouseX, mouseY);
            if (clickedTile) {
                if (this.selectedTile === clickedTile) {
                    // Deselect same tile
                    this.selectedTile = null;
                    this.audioManager.play('tile_select', false, this.config.assets.sounds.find(s => s.name === 'tile_select')?.volume || 0.7);
                } else if (this.selectedTile === null) {
                    // Select first tile
                    this.selectedTile = clickedTile;
                    this.audioManager.play('tile_select', false, this.config.assets.sounds.find(s => s.name === 'tile_select')?.volume || 0.7);
                } else {
                    // Second tile selected, attempt match
                    const tile1 = this.selectedTile;
                    const tile2 = clickedTile;
                    this.selectedTile = null; // Clear selection immediately

                    if (this.board.checkMatch(tile1, tile2)) {
                        this.board.removeTiles(tile1, tile2);
                        this.score += this.config.matchScore * this.config.levels[this.currentLevelIndex].scoreMultiplier;
                        this.audioManager.play('tile_match', false, this.config.assets.sounds.find(s => s.name === 'tile_match')?.volume || 0.7);
                        if (this.board.isBoardClear()) {
                            this.audioManager.play('level_complete', false, this.config.assets.sounds.find(s => s.name === 'level_complete')?.volume || 0.8);
                            this.startLevel(this.currentLevelIndex + 1);
                        } else if (!this.board.hasRemainingMatches()) {
                             // If no matches left and board is not clear, shuffle and penalize
                             console.warn("No more matches available on board, shuffling!");
                             this.board.shuffle();
                             this.timeRemaining -= this.config.penaltyTime; // Penalize for forcing a shuffle
                             this.audioManager.play('wrong_match', false, this.config.assets.sounds.find(s => s.name === 'wrong_match')?.volume || 0.7); // Reuse wrong match sound
                             if (this.timeRemaining <= 0) { // Check for game over after penalty
                                 this.timeRemaining = 0;
                                 this.gameState = GameState.GAME_OVER_LOSE;
                                 this.audioManager.play('game_over', false, this.config.assets.sounds.find(s => s.name === 'game_over')?.volume || 0.8);
                             }
                        }
                    } else {
                        // Mismatch
                        this.timeRemaining -= this.config.penaltyTime;
                        this.audioManager.play('wrong_match', false, this.config.assets.sounds.find(s => s.name === 'wrong_match')?.volume || 0.7);
                        if (this.timeRemaining <= 0) {
                            this.timeRemaining = 0;
                            this.gameState = GameState.GAME_OVER_LOSE;
                            this.audioManager.play('game_over', false, this.config.assets.sounds.find(s => s.name === 'game_over')?.volume || 0.8);
                        }
                    }
                }
            }
        }
    }

    private handleMouseMove(event: MouseEvent): void {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        this.ui.handleMouseMove(mouseX, mouseY);
    }

    update(deltaTime: number): void {
        if (this.gameState === GameState.PLAYING) {
            this.timeRemaining -= deltaTime;
            if (this.timeRemaining <= 0) {
                this.timeRemaining = 0;
                this.gameState = GameState.GAME_OVER_LOSE;
                this.audioManager.play('game_over', false, this.config.assets.sounds.find(s => s.name === 'game_over')?.volume || 0.8);
            }
        }
    }

    private drawGameBackground(): void {
        this.ui.drawBackground();
    }

    draw(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawGameBackground(); // Always draw background first

        switch (this.gameState) {
            case GameState.TITLE_SCREEN:
                this.ui.drawTitleScreen(() => this.gameState = GameState.INSTRUCTIONS_SCREEN);
                break;
            case GameState.INSTRUCTIONS_SCREEN:
                this.ui.drawInstructionsScreen(() => this.startLevel(0));
                break;
            case GameState.PLAYING:
                this.board.draw(this.selectedTile);
                this.ui.drawPlayingUI(this.score, this.timeRemaining, this.currentLevelIndex, this.config.levels.length);
                break;
            case GameState.GAME_OVER_WIN:
                this.ui.drawGameOverScreen(true, () => this.init());
                break;
            case GameState.GAME_OVER_LOSE:
                this.ui.drawGameOverScreen(false, () => this.init());
                break;
        }
    }
}

// --- Game Initialization ---
let lastTime: number = 0;
let deltaTime: number = 0;
let gameInstance: AnimalConnectGame | null = null;

function gameLoop(currentTime: number) {
    if (!lastTime) lastTime = currentTime;
    deltaTime = (currentTime - lastTime) / 1000; // delta time in seconds
    lastTime = currentTime;

    if (gameInstance) {
        gameInstance.update(deltaTime);
        gameInstance.draw();
    }
    requestAnimationFrame(gameLoop);
}

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;

    if (!canvas) {
        console.error('Canvas element with ID "gameCanvas" not found. Please ensure your HTML includes <canvas id="gameCanvas"></canvas>.');
        const errorDiv = document.createElement('div');
        errorDiv.style.color = 'red';
        errorDiv.style.textAlign = 'center';
        errorDiv.style.marginTop = '50px';
        errorDiv.style.fontFamily = 'sans-serif';
        errorDiv.innerText = '오류: 게임 캔버스 (ID "gameCanvas")를 찾을 수 없습니다. HTML 파일에 <canvas id="gameCanvas"></canvas> 요소가 있는지 확인해주세요.';
        document.body.appendChild(errorDiv);
        return; // Stop execution if canvas is not found
    }

    fetch('data.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(async (data: GameConfig) => {
            const assetLoader = new AssetLoader();
            try {
                const loadedAssets = await assetLoader.load(data.assets);
                gameInstance = new AnimalConnectGame('gameCanvas', data, loadedAssets);
                gameInstance.init();
                requestAnimationFrame(gameLoop); // Start the game loop
            } catch (error) {
                console.error('Error loading game assets:', error);
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = 'red';
                    ctx.font = '24px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('게임 에셋 로드 중 오류 발생: ' + (error as Error).message, canvas.width / 2, canvas.height / 2);
                }
            }
        })
        .catch(error => {
            console.error('Error loading game data:', error);
            // Display an error message directly on the canvas if loading fails
            const ctx = canvas.getContext('2d');
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
