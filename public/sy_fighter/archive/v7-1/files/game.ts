// Type definitions for data.json
interface CanvasConfig {
    width: number;
    height: number;
}

interface ImageAssetConfig {
    name: string;
    path: string;
    width: number; // Added for output format compliance
    height: number; // Added for output format compliance
}

interface SoundAssetConfig {
    name: string;
    path: string;
    volume: number;
    loop: boolean;
    duration_seconds: number; // Added for output format compliance
}

interface AssetsConfig {
    images: ImageAssetConfig[];
    sounds: SoundAssetConfig[];
}

interface ControlsConfig {
    left: string;
    right: string;
    jump: string;
    lightPunch: string;
    heavyKick: string;
    block: string;
}

interface GameSettings {
    gravity: number;
    groundY: number;
    playerStartXOffset: number;
    playerSpacing: number;
    maxHealth: number;
    walkSpeed: number;
    jumpVelocity: number;
    attackDuration: number; // in seconds
    hitStunDuration: number; // in seconds
    lightPunchDamage: number;
    heavyKickDamage: number;
    blockDamageReduction: number;
    player1Controls: ControlsConfig;
    player2Controls: ControlsConfig;
}

interface HitboxConfig {
    x: number; // Relative to character's top-left corner
    y: number;
    width: number;
    height: number;
}

interface AnimationData {
    x: number; // x-coord of top-left frame on sprite sheet
    y: number; // y-coord of top-left frame on sprite sheet
    frameWidth: number; // width of a single frame on sprite sheet
    frameHeight: number; // height of a single frame on sprite sheet
    frames: number; // total frames in animation
    frameDelay: number; // time per frame in seconds
    hitbox?: HitboxConfig;
    damage?: string; // Key in gameSettings for damage value
    sfx?: string; // Name of sound effect asset
}

interface CharacterConfig {
    name: string;
    spriteSheet: string; // Name of image asset
    width: number; // Rendered width of character on canvas
    height: number; // Rendered height of character on canvas
    animations: { [key: string]: AnimationData };
}

interface StageConfig {
    name: string;
    background: string; // Name of image asset
}

interface TitleScreenUI {
    titleText: string;
    subtitleText: string;
    titleFont: string;
    subtitleFont: string;
    textColor: string;
    blinkRate: number; // in seconds
}

interface HealthBarUI {
    height: number;
    widthFactor: number; // percentage of canvas width
    player1Color: string;
    player2Color: string;
    borderColor: string;
    borderThickness: number;
    padding: number; // padding from top/left/right
    offsetX: number; // x offset for player1 bar, player2 bar mirrored
}

interface GameOverScreenUI {
    text: string;
    font: string;
    textColor: string;
}

interface UIConfig {
    titleScreen: TitleScreenUI;
    healthBar: HealthBarUI;
    gameOverScreen: GameOverScreenUI;
}

interface GameConfig {
    canvas: CanvasConfig;
    assets: AssetsConfig;
    gameSettings: GameSettings;
    characters: CharacterConfig[];
    stages: StageConfig[];
    ui: UIConfig;
}

// Global game variables
let gameCanvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let gameConfig: GameConfig;
let lastTime: number = 0;
let deltaTime: number = 0;

// Enums
enum GameState {
    LOADING,
    TITLE,
    PLAYING,
    GAME_OVER,
}

enum CharacterState {
    IDLE,
    WALKING,
    JUMPING,
    ATTACKING,
    HIT,
    BLOCKING,
}

enum FacingDirection {
    LEFT = -1,
    RIGHT = 1,
}

// Utility for collision detection
interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

function checkCollision(rect1: Rect, rect2: Rect): boolean {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

// Asset Loader
class AssetLoader {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private totalAssets: number = 0;
    private loadedAssets: number = 0;

    async load(config: AssetsConfig): Promise<void> {
        const imagePromises = config.images.map(img => this.loadImage(img));
        const soundPromises = config.sounds.map(snd => this.loadSound(snd));
        this.totalAssets = imagePromises.length + soundPromises.length;

        await Promise.allSettled([...imagePromises, ...soundPromises]);
        console.log(`Loaded ${this.loadedAssets}/${this.totalAssets} assets.`);
    }

    private loadImage(imgConfig: ImageAssetConfig): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = imgConfig.path;
            img.onload = () => {
                this.images.set(imgConfig.name, img);
                this.loadedAssets++;
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${imgConfig.path}`);
                reject(new Error(`Failed to load image: ${imgConfig.path}`));
            };
        });
    }

    private loadSound(sndConfig: SoundAssetConfig): Promise<void> {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.src = sndConfig.path;
            audio.volume = sndConfig.volume;
            audio.loop = sndConfig.loop;
            // Await can be tricky with audio, as 'canplaythrough' might not fire for all browsers
            // or might be slow. For now, we'll assume it loads fairly quickly and resolve.
            // A more robust solution would be to use Web Audio API or ensure 'canplaythrough'.
            audio.oncanplaythrough = () => {
                 this.sounds.set(sndConfig.name, audio);
                 this.loadedAssets++;
                 resolve();
            };
            audio.onerror = () => {
                console.error(`Failed to load sound: ${sndConfig.path}`);
                reject(new Error(`Failed to load sound: ${sndConfig.path}`));
            };
            // In case oncanplaythrough doesn't fire immediately for short sounds
            setTimeout(() => {
                if (!this.sounds.has(sndConfig.name)) {
                     this.sounds.set(sndConfig.name, audio);
                     this.loadedAssets++;
                     resolve();
                }
            }, 500); // Give it half a second
        });
    }

    getImage(name: string): HTMLImageElement {
        const img = this.images.get(name);
        if (!img) {
            throw new Error(`Image "${name}" not found.`);
        }
        return img;
    }

    getSound(name: string): HTMLAudioElement {
        const sound = this.sounds.get(name);
        if (!sound) {
            throw new Error(`Sound "${name}" not found.`);
        }
        return sound;
    }

    playSound(name: string, loop: boolean = false): HTMLAudioElement | undefined {
        const sound = this.sounds.get(name);
        if (sound) {
            // Clone the sound for non-looping effects to allow simultaneous playback
            if (!loop) {
                const clone = sound.cloneNode() as HTMLAudioElement;
                clone.volume = sound.volume;
                clone.play().catch(e => console.warn(`Sound playback failed for ${name}:`, e));
                return clone;
            } else {
                sound.play().catch(e => console.warn(`Sound playback failed for ${name}:`, e));
                return sound;
            }
        }
        return undefined;
    }

    stopSound(name: string) {
        const sound = this.sounds.get(name);
        if (sound) {
            sound.pause();
            sound.currentTime = 0;
        }
    }
}

// Input Handler
class InputHandler {
    private pressedKeys: Set<string> = new Set();
    private game: Game;

    constructor(game: Game) {
        this.game = game;
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
    }

    private onKeyDown = (e: KeyboardEvent) => {
        if (!e.repeat) { // Ignore key repeat
            this.pressedKeys.add(e.code);
            // Handle game state specific input
            if (this.game.state === GameState.TITLE && e.code === 'Enter') {
                this.game.startGame();
            } else if (this.game.state === GameState.GAME_OVER && e.code === 'Enter') {
                this.game.resetGame();
            }
        }
    }

    private onKeyUp = (e: KeyboardEvent) => {
        this.pressedKeys.delete(e.code);
    }

    isKeyDown(code: string): boolean {
        return this.pressedKeys.has(code);
    }

    clearKeys() {
        this.pressedKeys.clear();
    }
}

// Character Class
class Character {
    x: number;
    y: number;
    vx: number = 0;
    vy: number = 0;
    health: number;
    facing: FacingDirection;
    characterState: CharacterState = CharacterState.IDLE;

    private config: CharacterConfig;
    private spriteSheet: HTMLImageElement;
    private currentAnimationName: string = 'idle';
    private animationFrame: number = 0;
    private frameTimer: number = 0; // time elapsed for current frame
    private attackTimer: number = 0; // duration of current attack
    private hitStunTimer: number = 0; // duration of hit stun
    private playerControls: ControlsConfig;
    private gameSettings: GameSettings;
    private assetLoader: AssetLoader;
    private playerIndex: number; // 0 for P1, 1 for P2
    private isAttackingCollisionWindow: boolean = false; // Is the hitbox active?

    constructor(
        config: CharacterConfig,
        spriteSheet: HTMLImageElement,
        initialX: number,
        initialY: number,
        facing: FacingDirection,
        playerControls: ControlsConfig,
        gameSettings: GameSettings,
        assetLoader: AssetLoader,
        playerIndex: number
    ) {
        this.config = config;
        this.spriteSheet = spriteSheet;
        this.x = initialX;
        this.y = initialY;
        this.facing = facing;
        this.health = gameSettings.maxHealth;
        this.playerControls = playerControls;
        this.gameSettings = gameSettings;
        this.assetLoader = assetLoader;
        this.playerIndex = playerIndex;
    }

    // Public getter for width
    public get width(): number {
        return this.config.width;
    }

    // Public getter for height (optional, but good practice for external access)
    public get height(): number {
        return this.config.height;
    }

    update(deltaTime: number, opponent: Character) {
        // Apply gravity
        this.vy += this.gameSettings.gravity * deltaTime;

        // Update position
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // Ground collision
        if (this.y + this.config.height > this.gameSettings.groundY) {
            this.y = this.gameSettings.groundY - this.config.height;
            if (this.vy > 0) this.vy = 0;
            if (this.characterState === CharacterState.JUMPING) {
                this.changeState(CharacterState.IDLE);
            }
        }

        // Keep characters within canvas bounds
        this.x = Math.max(0, Math.min(gameConfig.canvas.width - this.config.width, this.x));

        // Update timers
        if (this.hitStunTimer > 0) {
            this.hitStunTimer -= deltaTime;
            if (this.hitStunTimer <= 0) {
                this.changeState(CharacterState.IDLE);
            }
            // During hit stun, no other actions
            this.vx = 0; // Stop horizontal movement during hit stun
            return;
        }

        if (this.attackTimer > 0) {
            this.attackTimer -= deltaTime;
            const currentAnim = this.config.animations[this.currentAnimationName];
            // Activate hitbox in the middle of the attack animation (arbitrary, can be refined per animation)
            const attackWindowStart = currentAnim.frameDelay * (currentAnim.frames / 2);
            const attackWindowEnd = currentAnim.frameDelay * (currentAnim.frames / 2 + 1); // 2 frames active
            const elapsedAttackTime = this.config.animations[this.currentAnimationName].frameDelay * this.animationFrame;

            this.isAttackingCollisionWindow = (elapsedAttackTime >= attackWindowStart && elapsedAttackTime < attackWindowEnd);

            if (this.isAttackingCollisionWindow && this.checkAttackCollision(opponent)) {
                // Collision detected, opponent takes damage.
                // Reset flag to prevent multiple hits from one attack animation
                this.isAttackingCollisionWindow = false;
            }

            if (this.attackTimer <= 0) {
                this.changeState(CharacterState.IDLE);
            }
        }

        // Update animation frame
        this.frameTimer += deltaTime;
        const currentAnim = this.config.animations[this.currentAnimationName];
        if (this.frameTimer >= currentAnim.frameDelay) {
            this.animationFrame = (this.animationFrame + 1) % currentAnim.frames;
            this.frameTimer -= currentAnim.frameDelay;
        }

        // Determine facing direction (only if not blocking or hitstun)
        if (this.characterState !== CharacterState.HIT && this.characterState !== CharacterState.BLOCKING) {
            if (this.x < opponent.x) {
                this.facing = FacingDirection.RIGHT;
            } else {
                this.facing = FacingDirection.LEFT;
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        const anim = this.config.animations[this.currentAnimationName];
        if (!anim) {
            console.warn(`Animation "${this.currentAnimationName}" not found for character "${this.config.name}"`);
            return;
        }

        const sx = anim.x + this.animationFrame * anim.frameWidth;
        const sy = anim.y;
        const sWidth = anim.frameWidth;
        const sHeight = anim.frameHeight;
        const dWidth = this.config.width;
        const dHeight = this.config.height;

        ctx.save();
        if (this.facing === FacingDirection.LEFT) {
            ctx.translate(this.x + dWidth, this.y);
            ctx.scale(-1, 1);
            ctx.drawImage(this.spriteSheet, sx, sy, sWidth, sHeight, 0, 0, dWidth, dHeight);
        } else {
            ctx.drawImage(this.spriteSheet, sx, sy, sWidth, sHeight, this.x, this.y, dWidth, dHeight);
        }

        // Optional: Draw hitbox for debugging
        // if (anim.hitbox && this.characterState === CharacterState.ATTACKING && this.isAttackingCollisionWindow) {
        //     ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        //     let hitboxX = this.x + anim.hitbox.x;
        //     if (this.facing === FacingDirection.LEFT) {
        //         hitboxX = this.x + (this.config.width - (anim.hitbox.x + anim.hitbox.width));
        //     }
        //     ctx.fillRect(hitboxX, this.y + anim.hitbox.y, anim.hitbox.width, anim.hitbox.height);
        // }
        ctx.restore();
    }

    handleInput(input: InputHandler) {
        // Higher priority states: HIT or ATTACKING
        if (this.characterState === CharacterState.HIT || this.characterState === CharacterState.ATTACKING) {
            this.vx = 0;
            return; // Cannot act while hit or attacking
        }

        // Blocking takes precedence over movement and attacks
        if (input.isKeyDown(this.playerControls.block)) {
            if (this.characterState !== CharacterState.BLOCKING) {
                this.changeState(CharacterState.BLOCKING);
            }
            this.vx = 0; // Cannot move while blocking
            return; // Exit as block is active, no other inputs processed
        } else if (this.characterState === CharacterState.BLOCKING) {
            // If block key released, go back to idle
            this.changeState(CharacterState.IDLE);
        }

        // If not in HIT, ATTACKING, or BLOCKING states, process other inputs
        this.vx = 0; // Reset horizontal velocity

        // Movement
        if (input.isKeyDown(this.playerControls.left)) {
            this.vx = -this.gameSettings.walkSpeed;
            if (this.characterState === CharacterState.IDLE) this.changeState(CharacterState.WALKING);
        } else if (input.isKeyDown(this.playerControls.right)) {
            this.vx = this.gameSettings.walkSpeed;
            if (this.characterState === CharacterState.IDLE) this.changeState(CharacterState.WALKING);
        } else {
            if (this.characterState === CharacterState.WALKING) this.changeState(CharacterState.IDLE);
        }

        // Jump
        if (input.isKeyDown(this.playerControls.jump) && this.characterState !== CharacterState.JUMPING) {
            this.vy = this.gameSettings.jumpVelocity;
            this.changeState(CharacterState.JUMPING);
            this.assetLoader.playSound('sfx_jump');
        }

        // Attacks
        if (input.isKeyDown(this.playerControls.lightPunch)) {
            this.attack('light_punch');
        } else if (input.isKeyDown(this.playerControls.heavyKick)) {
            this.attack('heavy_kick');
        }
    }

    changeState(newState: CharacterState) {
        if (this.characterState === newState) return; // No change needed

        this.characterState = newState;
        this.animationFrame = 0;
        this.frameTimer = 0;

        switch (newState) {
            case CharacterState.IDLE:
                this.currentAnimationName = 'idle';
                break;
            case CharacterState.WALKING:
                this.currentAnimationName = 'walk';
                break;
            case CharacterState.JUMPING:
                this.currentAnimationName = 'jump';
                break;
            case CharacterState.ATTACKING:
                // Animation name and attack timer are set by the `attack()` method.
                break;
            case CharacterState.HIT:
                this.currentAnimationName = 'hit';
                this.hitStunTimer = this.gameSettings.hitStunDuration;
                this.vx = 0; // Stop movement on hit
                break;
            case CharacterState.BLOCKING:
                this.currentAnimationName = 'block';
                this.vx = 0; // Ensure no movement while blocking
                break;
        }
    }

    attack(attackAnimName: string) {
        if (this.characterState === CharacterState.ATTACKING || this.characterState === CharacterState.JUMPING || this.characterState === CharacterState.HIT || this.characterState === CharacterState.BLOCKING) {
            return; // Cannot attack while already attacking, jumping, hit, or blocking
        }

        const anim = this.config.animations[attackAnimName];
        if (!anim || !anim.hitbox) {
            console.warn(`Attack animation "${attackAnimName}" or its hitbox not configured.`);
            return;
        }

        this.currentAnimationName = attackAnimName; // Set animation before changing state
        this.changeState(CharacterState.ATTACKING);
        this.attackTimer = anim.frameDelay * anim.frames; // Attack duration based on animation length
        this.isAttackingCollisionWindow = true; // Set true initially, then check specific frame window
        if (anim.sfx) {
            this.assetLoader.playSound(anim.sfx);
        }
    }

    getHitbox(): Rect | null {
        if (this.characterState !== CharacterState.ATTACKING || !this.isAttackingCollisionWindow) {
            return null;
        }
        const anim = this.config.animations[this.currentAnimationName];
        if (!anim || !anim.hitbox) {
            return null;
        }

        let hitboxX = this.x + anim.hitbox.x;
        // Flip hitbox x if facing left
        if (this.facing === FacingDirection.LEFT) {
            hitboxX = this.x + (this.config.width - (anim.hitbox.x + anim.hitbox.width));
        }

        return {
            x: hitboxX,
            y: this.y + anim.hitbox.y,
            width: anim.hitbox.width,
            height: anim.hitbox.height,
        };
    }

    getCollisionBox(): Rect {
        return {
            x: this.x,
            y: this.y,
            width: this.config.width,
            height: this.config.height
        };
    }

    private checkAttackCollision(opponent: Character): boolean {
        const myHitbox = this.getHitbox();
        const opponentCollisionBox = opponent.getCollisionBox();

        if (myHitbox && checkCollision(myHitbox, opponentCollisionBox)) {
            const attackAnim = this.config.animations[this.currentAnimationName];
            if (attackAnim && attackAnim.damage) {
                const damageAmount = this.gameSettings[attackAnim.damage as keyof GameSettings] as number;
                if (typeof damageAmount === 'number') {
                    opponent.takeDamage(damageAmount);
                    return true;
                }
            }
        }
        return false;
    }

    takeDamage(amount: number) {
        if (this.characterState === CharacterState.HIT) return; // Cannot be hit multiple times consecutively

        let finalDamage = amount;
        if (this.characterState === CharacterState.BLOCKING) {
            finalDamage *= this.gameSettings.blockDamageReduction; // Reduce damage if blocking
            this.health -= finalDamage;
            this.health = Math.max(0, this.health); // Health cannot go below 0
            this.assetLoader.playSound('sfx_block'); // Play block sound
            // No hit stun or state change if block is successful
            return;
        }

        // Normal hit processing
        this.health -= finalDamage;
        this.health = Math.max(0, this.health); // Health cannot go below 0
        this.assetLoader.playSound('sfx_hit');
        this.changeState(CharacterState.HIT); // Enter hit stun
    }

    isAlive(): boolean {
        return this.health > 0;
    }

    // Reset character for a new round/game
    reset(initialX: number, facing: FacingDirection) {
        this.x = initialX;
        this.y = this.gameSettings.groundY - this.config.height;
        this.vx = 0;
        this.vy = 0;
        this.health = this.gameSettings.maxHealth;
        this.facing = facing;
        this.changeState(CharacterState.IDLE);
        this.attackTimer = 0;
        this.hitStunTimer = 0;
        this.isAttackingCollisionWindow = false;
    }
}


// Main Game Class
class Game {
    private _state: GameState = GameState.LOADING;
    private assetLoader: AssetLoader;
    private inputHandler: InputHandler;
    private player1: Character | null = null;
    private player2: Character | null = null;
    private bgmTitle: HTMLAudioElement | undefined;
    private bgmGame: HTMLAudioElement | undefined;
    private titleBlinkTimer: number = 0;
    private showTitleSubtitle: boolean = true;
    private gameOverSoundPlayed: boolean = false;


    constructor() {
        gameCanvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        if (!gameCanvas) {
            throw new Error('Canvas element with ID "gameCanvas" not found.');
        }
        ctx = gameCanvas.getContext('2d') as CanvasRenderingContext2D;
        if (!ctx) {
            throw new Error('Failed to get 2D rendering context for canvas.');
        }
        this.assetLoader = new AssetLoader();
        this.inputHandler = new InputHandler(this);
    }

    get state(): GameState {
        return this._state;
    }

    async init() {
        this._state = GameState.LOADING;
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
        ctx.font = '30px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText('Loading Game Data...', gameCanvas.width / 2, gameCanvas.height / 2);

        try {
            const response = await fetch('data.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            gameConfig = await response.json() as GameConfig;

            gameCanvas.width = gameConfig.canvas.width;
            gameCanvas.height = gameConfig.canvas.height;
            ctx.imageSmoothingEnabled = false; // For pixel-art style

            await this.assetLoader.load(gameConfig.assets);
            console.log('All assets loaded.');

            // Initialize BGM
            this.bgmTitle = this.assetLoader.getSound('bgm_title');
            this.bgmGame = this.assetLoader.getSound('bgm_game');

            // Initialize characters
            const p1Config = gameConfig.characters[0];
            const p2Config = gameConfig.characters[1] || gameConfig.characters[0]; // Default to same character if only one defined

            this.player1 = new Character(
                p1Config,
                this.assetLoader.getImage(p1Config.spriteSheet),
                gameConfig.gameSettings.playerStartXOffset,
                gameConfig.gameSettings.groundY - p1Config.height,
                FacingDirection.RIGHT,
                gameConfig.gameSettings.player1Controls,
                gameConfig.gameSettings,
                this.assetLoader,
                0
            );

            this.player2 = new Character(
                p2Config,
                this.assetLoader.getImage(p2Config.spriteSheet),
                gameConfig.canvas.width - gameConfig.gameSettings.playerStartXOffset - p2Config.width,
                gameConfig.gameSettings.groundY - p2Config.height,
                FacingDirection.LEFT,
                gameConfig.gameSettings.player2Controls,
                gameConfig.gameSettings,
                this.assetLoader,
                1
            );


            this._state = GameState.TITLE;
            if (this.bgmTitle) this.bgmTitle.play();
            requestAnimationFrame(this.gameLoop);

        } catch (error) {
            console.error('Failed to initialize game:', error);
            ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
            ctx.fillStyle = 'red';
            ctx.fillText('Failed to load game. Check console for errors.', gameCanvas.width / 2, gameCanvas.height / 2);
        }
    }

    startGame() {
        if (this._state === GameState.TITLE) {
            this._state = GameState.PLAYING;
            if (this.bgmTitle) this.bgmTitle.pause();
            if (this.bgmTitle) this.bgmTitle.currentTime = 0;
            if (this.bgmGame) this.bgmGame.play();
            this.gameOverSoundPlayed = false;
        }
    }

    resetGame() {
        if (this.player1) {
            this.player1.reset(
                gameConfig.gameSettings.playerStartXOffset,
                FacingDirection.RIGHT
            );
        }
        if (this.player2) {
            this.player2.reset(
                gameConfig.canvas.width - gameConfig.gameSettings.playerStartXOffset - this.player2.width,
                FacingDirection.LEFT
            );
        }
        this._state = GameState.TITLE;
        this.inputHandler.clearKeys();
        if (this.bgmGame) this.bgmGame.pause();
        if (this.bgmGame) this.bgmGame.currentTime = 0;
        if (this.bgmTitle) this.bgmTitle.play();
        this.gameOverSoundPlayed = false;
    }

    gameLoop = (currentTime: number) => {
        if (!lastTime) lastTime = currentTime;
        deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
        lastTime = currentTime;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame(this.gameLoop);
    }

    update(dt: number) {
        switch (this._state) {
            case GameState.LOADING:
                // Nothing to update, waiting for assets
                break;
            case GameState.TITLE:
                this.titleBlinkTimer += dt;
                if (this.titleBlinkTimer >= gameConfig.ui.titleScreen.blinkRate) {
                    this.showTitleSubtitle = !this.showTitleSubtitle;
                    this.titleBlinkTimer = 0;
                }
                break;
            case GameState.PLAYING:
                if (this.player1) this.player1.handleInput(this.inputHandler);
                if (this.player2) this.player2.handleInput(this.inputHandler);

                // Update characters, passing opponent for collision/facing logic
                if (this.player1 && this.player2) {
                    this.player1.update(dt, this.player2);
                    this.player2.update(dt, this.player1);

                    // Check for game over
                    if (!this.player1.isAlive() || !this.player2.isAlive()) {
                        this._state = GameState.GAME_OVER;
                        if (this.bgmGame) this.bgmGame.pause();
                        if (this.bgmGame) this.bgmGame.currentTime = 0;
                    }
                }
                break;
            case GameState.GAME_OVER:
                if (!this.gameOverSoundPlayed) {
                    this.assetLoader.playSound('sfx_game_over');
                    this.gameOverSoundPlayed = true;
                }
                // Optionally allow input for restart
                break;
        }
    }

    render() {
        // Clear canvas
        ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

        switch (this._state) {
            case GameState.LOADING:
                // Loading screen already drawn in init, just keep it.
                break;
            case GameState.TITLE:
                this.drawTitleScreen();
                break;
            case GameState.PLAYING:
            case GameState.GAME_OVER: // Draw game elements even in game over state
                this.drawGameBackground();
                if (this.player1) this.player1.draw(ctx);
                if (this.player2) this.player2.draw(ctx);
                this.drawHealthBars();
                if (this._state === GameState.GAME_OVER) {
                    this.drawGameOverScreen();
                }
                break;
        }
    }

    private drawTitleScreen() {
        const titleBg = this.assetLoader.getImage('title_bg');
        ctx.drawImage(titleBg, 0, 0, gameCanvas.width, gameCanvas.height);

        ctx.font = gameConfig.ui.titleScreen.titleFont;
        ctx.fillStyle = gameConfig.ui.titleScreen.textColor;
        ctx.textAlign = 'center';
        ctx.fillText(gameConfig.ui.titleScreen.titleText, gameCanvas.width / 2, gameCanvas.height / 2 - 50);

        if (this.showTitleSubtitle) {
            ctx.font = gameConfig.ui.titleScreen.subtitleFont;
            ctx.fillText(gameConfig.ui.titleScreen.subtitleText, gameCanvas.width / 2, gameCanvas.height / 2 + 50);
        }
    }

    private drawGameBackground() {
        const stageBg = this.assetLoader.getImage(gameConfig.stages[0].background);
        ctx.drawImage(stageBg, 0, 0, gameCanvas.width, gameCanvas.height);
    }

    private drawHealthBars() {
        const ui = gameConfig.ui.healthBar;
        const barWidth = gameConfig.canvas.width * ui.widthFactor;
        const barY = ui.padding;

        if (this.player1 && this.player2) {
            // Player 1 Health Bar (left)
            ctx.strokeStyle = ui.borderColor;
            ctx.lineWidth = ui.borderThickness;
            ctx.strokeRect(ui.offsetX, barY, barWidth, ui.height);
            ctx.fillStyle = ui.player1Color;
            ctx.fillRect(ui.offsetX + ui.borderThickness, barY + ui.borderThickness,
                         (barWidth - 2 * ui.borderThickness) * (this.player1.health / gameConfig.gameSettings.maxHealth),
                         ui.height - 2 * ui.borderThickness);

            // Player 2 Health Bar (right)
            const p2BarX = gameConfig.canvas.width - barWidth - ui.offsetX;
            ctx.strokeRect(p2BarX, barY, barWidth, ui.height);
            ctx.fillStyle = ui.player2Color;
            ctx.fillRect(p2BarX + ui.borderThickness + (barWidth - 2 * ui.borderThickness) * (1 - this.player2.health / gameConfig.gameSettings.maxHealth),
                         barY + ui.borderThickness,
                         (barWidth - 2 * ui.borderThickness) * (this.player2.health / gameConfig.gameSettings.maxHealth),
                         ui.height - 2 * ui.borderThickness);
        }
    }

    private drawGameOverScreen() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

        ctx.font = gameConfig.ui.gameOverScreen.font;
        ctx.fillStyle = gameConfig.ui.gameOverScreen.textColor;
        ctx.textAlign = 'center';
        ctx.fillText(gameConfig.ui.gameOverScreen.text, gameCanvas.width / 2, gameCanvas.height / 2);

        ctx.font = gameConfig.ui.titleScreen.subtitleFont; // Reuse subtitle font for instruction
        ctx.fillStyle = gameConfig.ui.titleScreen.textColor;
        ctx.fillText(gameConfig.ui.titleScreen.subtitleText, gameCanvas.width / 2, gameCanvas.height / 2 + 80);
    }
}

// Entry point
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    game.init();
});