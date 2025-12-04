// TypeScript interfaces for game configuration and data
interface AssetConfig {
    name: string;
    path: string;
    width?: number;
    height?: number;
    duration_seconds?: number;
    volume?: number;
}

interface ImageDataConfig extends AssetConfig {
    width: number;
    height: number;
}

interface SoundDataConfig extends AssetConfig {
    duration_seconds: number;
    volume: number;
}

interface FishData {
    name: string;
    score: number;
    image: string; // Asset name for the fish image
    speed: number;
    miniGameDifficulty: number; // Factor for mini-game challenge
}

interface GameConfig {
    canvasWidth: number;
    canvasHeight: number;
    gameDurationSeconds: number; // Total game time
    initialBobberX: number; // Ratio of canvas width
    initialBobberY: number; // Ratio of canvas height (water surface)
    bobberMoveSpeed: number; // Speed for bobber vertical movement
    minBobberYRatio: number; // Min Y ratio for bobber vertical movement
    maxBobberYRatio: number; // Max Y ratio for bobber vertical movement
    fishingLineOffsetX: number; // X offset for fishing line start on boat
    fishingLineOffsetY: number; // Y offset for fishing line start on boat
    fishSpawnIntervalSeconds: number; // How often new fish might appear
    fishSwimSpeedMultiplier: number; // Multiplier for fish movement speed
    maxFishOnScreen: number; // Maximum number of fish visible
    bobberWidth: number;
    bobberHeight: number;
    fishDefaultWidth: number;
    fishDefaultHeight: number;
    biteTriggerRadius: number; // Distance for a fish to be "near" the bobber
    biteHoldDurationSeconds: number; // How long the hook must be near a fish for a bite
    miniGameDurationSeconds: number; // Duration of the reeling mini-game
    miniGameSuccessTarget: number; // How much 'success' is needed to catch a fish
    miniGameFailureThreshold: number; // How much 'failure' leads to losing a fish
    miniGamePressEffect: number; // How much a SPACE press contributes to success
    miniGameDecayRate: number; // How quickly success decays over time
    miniGameTargetZoneWidth: number; // Width of the target zone in the mini-game bar (0 to 1)
    miniGameBasePointerSpeed: number; // Base speed of the pointer in the mini-game
    assets: {
        images: ImageDataConfig[];
        sounds: SoundDataConfig[];
    };
    fishes: FishData[];
    ui: {
        title: string;
        pressSpace: string;
        tutorialLine1: string;
        tutorialLine2: string;
        tutorialLine3: string;
        tutorialLine4: string;
        fishCaught: string;
        fishLost: string;
        scorePrefix: string;
        timeRemainingPrefix: string;
        gameOver: string;
        loading: string;
        reelInstruction: string;
        reelTime: string;
    };
}

// Global canvas and context variables
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let game: Game;

/**
 * AssetManager class to handle loading and accessing game assets (images and sounds).
 */
class AssetManager {
    images: Map<string, HTMLImageElement> = new Map();
    sounds: Map<string, HTMLAudioElement> = new Map();
    loadedCount = 0;
    totalAssets = 0;

    /**
     * Loads all assets defined in the game configuration.
     * @param config - The asset configuration from data.json.
     */
    async loadAssets(config: GameConfig['assets']): Promise<void> {
        this.totalAssets = config.images.length + config.sounds.length;
        const promises: Promise<void>[] = [];

        for (const imgConfig of config.images) {
            promises.push(this.loadImage(imgConfig));
        }
        for (const soundConfig of config.sounds) {
            promises.push(this.loadSound(soundConfig));
        }

        await Promise.all(promises);
    }

    private loadImage(config: ImageDataConfig): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = config.path;
            img.onload = () => {
                this.images.set(config.name, img);
                this.loadedCount++;
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${config.path}`);
                reject();
            };
        });
    }

    private loadSound(config: SoundDataConfig): Promise<void> {
        return new Promise((resolve) => {
            const audio = new Audio(config.path);
            audio.volume = config.volume;
            audio.preload = 'auto';
            audio.oncanplaythrough = () => {
                this.sounds.set(config.name, audio);
                this.loadedCount++;
                resolve();
            };
            audio.onerror = () => {
                console.warn(`Failed to load sound: ${config.path}`);
                this.loadedCount++;
                resolve(); // Resolve even on error to not block game
            };
        });
    }

    getImage(name: string): HTMLImageElement | undefined {
        return this.images.get(name);
    }

    playSound(name: string, loop: boolean = false, volume?: number): HTMLAudioElement | undefined {
        const audio = this.sounds.get(name);
        if (audio) {
            const clone = audio.cloneNode() as HTMLAudioElement; // Clone to allow multiple concurrent plays
            clone.loop = loop;
            clone.volume = volume !== undefined ? volume : audio.volume;
            clone.play().catch(e => console.warn(`Audio play failed for ${name}:`, e));
            return clone;
        }
        return undefined;
    }

    stopSound(audio: HTMLAudioElement) {
        audio.pause();
        audio.currentTime = 0;
    }

    getLoadingProgress(): number {
        return this.totalAssets > 0 ? this.loadedCount / this.totalAssets : 0;
    }
}

/**
 * Enum for managing different states of the game.
 */
enum GameState {
    LOADING,
    TITLE_SCREEN,
    TUTORIAL_SCREEN,
    WAITING_FOR_BITE,
    REELING_MINIGAME,
    GAME_OVER,
}

/**
 * Bobber game object.
 */
class Bobber {
    x: number;
    y: number;
    width: number;
    height: number;
    imageName: string;

    constructor(x: number, y: number, width: number, height: number, imageName: string) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.imageName = imageName;
    }

    draw(ctx: CanvasRenderingContext2D, assetManager: AssetManager) {
        const img = assetManager.getImage(this.imageName);
        if (img) {
            ctx.drawImage(img, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        }
    }
}

/**
 * Fish game object.
 */
class Fish {
    x: number;
    y: number;
    width: number;
    height: number;
    imageName: string;
    speed: number;
    data: FishData; // Reference to its data config
    direction: number; // -1 for left, 1 for right

    constructor(x: number, y: number, width: number, height: number, data: FishData) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.imageName = data.image;
        this.speed = data.speed;
        this.data = data;
        this.direction = Math.random() < 0.5 ? -1 : 1; // Start moving randomly
    }

    update(deltaTime: number, canvasWidth: number, bobberX: number) {
        this.x += this.speed * this.direction * deltaTime;

        // Simple boundary check and change direction
        if (this.x < 0 || this.x > canvasWidth) {
            this.direction *= -1;
            this.x = Math.max(0, Math.min(canvasWidth, this.x)); // Clamp position
        }

        // Add a slight pull towards the bobber when close
        // This makes fish more likely to be near the bobber if player holds it still
        const distanceToBobber = Math.abs(this.x - bobberX);
        if (distanceToBobber < 200) { // If within 200px of bobber
            const pullDirection = (bobberX - this.x > 0) ? 1 : -1;
            this.x += pullDirection * this.speed * deltaTime * (1 - distanceToBobber / 200) * 0.5; // Weaker pull
        }
    }

    draw(ctx: CanvasRenderingContext2D, assetManager: AssetManager) {
        const img = assetManager.getImage(this.imageName);
        if (img) {
            ctx.save();
            ctx.translate(this.x, this.y);
            // Flip image if moving left
            if (this.direction === -1) {
                ctx.scale(-1, 1);
            }
            ctx.drawImage(img, -this.width / 2, -this.height / 2, this.width, this.height);
            ctx.restore();
        }
    }
}

/**
 * Main Game class responsible for managing game state, logic, and rendering.
 */
class Game {
    private config!: GameConfig;
    private assetManager: AssetManager = new AssetManager();
    private currentState: GameState = GameState.LOADING;
    private lastTime: DOMHighResTimeStamp = 0;
    private bgmAudio: HTMLAudioElement | undefined;
    private score: number = 0;
    private gameTimer: number = 0; // In seconds
    private fishSpawnTimer: number = 0; // In seconds
    private fishes: Fish[] = [];
    private bobber!: Bobber;
    private keysPressed: Set<string> = new Set();
    private caughtFishName: string | null = null; // For displaying catch outcome
    private outcomeDisplayTimer: number = 0; // How long to display outcome

    // Bobber movement
    private bobberMoveDirection: number = 0; // 0: none, -1: up, 1: down

    // Bite detection
    private fishUnderBobber: Fish | null = null;
    private fishUnderBobberTimer: number = 0;

    // Mini-game variables
    private miniGameSuccess: number = 0;
    private miniGameFailure: number = 0;
    private miniGameTimer: number = 0;
    private miniGamePointerPosition: number = 0; // -1 to 1 representing left to right
    private miniGameTargetZoneCenter: number = 0; // -1 to 1
    private currentFishInMinigame: Fish | undefined; // The actual fish object currently being reeled

    constructor(private canvas: HTMLCanvasElement, private ctx: CanvasRenderingContext2D) {
        // Default canvas size, will be overwritten by config
        this.canvas.width = 800;
        this.canvas.height = 600;
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
    }

    /**
     * Starts the game by loading configuration and assets, then initiating the game loop.
     */
    async start(): Promise<void> {
        await this.loadConfig();
        this.initGame(); // Initialize game components after config is loaded
        this.loop(0); // Start the game loop
    }

    private async loadConfig(): Promise<void> {
        try {
            const response = await fetch('data.json');
            this.config = await response.json() as GameConfig;
            this.canvas.width = this.config.canvasWidth;
            this.canvas.height = this.config.canvasHeight;
            await this.assetManager.loadAssets(this.config.assets);
            this.currentState = GameState.TITLE_SCREEN; // Transition to title screen after loading
        } catch (error) {
            console.error("Failed to load game configuration or assets:", error);
            // Fallback to a failure state if critical loading fails
            this.currentState = GameState.GAME_OVER;
        }
    }

    /**
     * Initializes or resets game-specific variables for a new game session.
     */
    private initGame(): void {
        this.score = 0;
        this.gameTimer = this.config.gameDurationSeconds;
        this.fishSpawnTimer = 0;
        this.fishes = [];
        this.bobber = new Bobber(
            this.config.initialBobberX * this.canvas.width,
            this.config.initialBobberY * this.canvas.height, // Bobber starts at water surface
            this.config.bobberWidth,
            this.config.bobberHeight,
            'bobber'
        );

        // Stop any previous BGM and start new one
        if (this.bgmAudio) {
            this.assetManager.stopSound(this.bgmAudio);
        }
        this.bgmAudio = this.assetManager.playSound('bgm', true, this.config.assets.sounds.find(s => s.name === 'bgm')?.volume);

        // Reset mini-game specific variables
        this.miniGameSuccess = 0;
        this.miniGameFailure = 0;
        this.miniGameTimer = 0;
        this.miniGamePointerPosition = 0;
        this.miniGameTargetZoneCenter = 0;
        this.currentFishInMinigame = undefined;
        this.caughtFishName = null;
        this.outcomeDisplayTimer = 0;

        // Reset bobber and bite detection variables
        this.bobberMoveDirection = 0;
        this.fishUnderBobber = null;
        this.fishUnderBobberTimer = 0;
    }

    /**
     * Handles keyboard key down events.
     * @param event - The KeyboardEvent object.
     */
    private handleKeyDown = (event: KeyboardEvent): void => {
        this.keysPressed.add(event.code);

        if (event.code === 'Space') {
            event.preventDefault(); // Prevent page scrolling with spacebar

            switch (this.currentState) {
                case GameState.TITLE_SCREEN:
                    this.currentState = GameState.TUTORIAL_SCREEN;
                    this.assetManager.playSound('select');
                    break;
                case GameState.TUTORIAL_SCREEN:
                    this.currentState = GameState.WAITING_FOR_BITE;
                    this.assetManager.playSound('select');
                    break;
                case GameState.REELING_MINIGAME:
                    // Only apply effect if within target zone for more challenge
                    const targetZoneStart = this.miniGameTargetZoneCenter - this.config.miniGameTargetZoneWidth / 2;
                    const targetZoneEnd = this.miniGameTargetZoneCenter + this.config.miniGameTargetZoneWidth / 2;
                    if (this.miniGamePointerPosition >= targetZoneStart && this.miniGamePointerPosition <= targetZoneEnd) {
                        this.miniGameSuccess += this.config.miniGamePressEffect;
                    }
                    this.assetManager.playSound('reel', false, 0.7);
                    break;
                case GameState.GAME_OVER:
                    this.initGame(); // Reset game state
                    this.currentState = GameState.TITLE_SCREEN; // Go back to title for restart
                    this.assetManager.playSound('select');
                    break;
            }
        } else if (this.currentState === GameState.WAITING_FOR_BITE) {
            if (event.code === 'ArrowUp') {
                this.bobberMoveDirection = -1;
            } else if (event.code === 'ArrowDown') {
                this.bobberMoveDirection = 1;
            }
        }
    }

    /**
     * Handles keyboard key up events.
     * @param event - The KeyboardEvent object.
     */
    private handleKeyUp = (event: KeyboardEvent): void => {
        this.keysPressed.delete(event.code);
        if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
            this.bobberMoveDirection = 0; // Stop bobber movement
        }
    }

    /**
     * The main game loop, called by requestAnimationFrame.
     * @param currentTime - The current time provided by requestAnimationFrame.
     */
    private loop = (currentTime: DOMHighResTimeStamp): void => {
        const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame(this.loop);
    }

    /**
     * Updates game logic based on the current state and time elapsed.
     * @param deltaTime - The time elapsed since the last frame, in seconds.
     */
    private update(deltaTime: number): void {
        if (this.currentState === GameState.LOADING) return;

        // Attempt to play BGM if it paused, typically due to browser autoplay policies
        if (this.bgmAudio && this.bgmAudio.paused && this.currentState !== GameState.TITLE_SCREEN && this.currentState !== GameState.TUTORIAL_SCREEN) {
             this.bgmAudio.play().catch(e => console.warn("Failed to resume BGM:", e));
        }

        switch (this.currentState) {
            case GameState.TITLE_SCREEN:
            case GameState.TUTORIAL_SCREEN:
            case GameState.GAME_OVER:
                // No specific update logic, just waiting for user input to transition
                break;
            case GameState.WAITING_FOR_BITE:
                this.gameTimer -= deltaTime;
                if (this.gameTimer <= 0) {
                    this.currentState = GameState.GAME_OVER;
                    if (this.bgmAudio) this.assetManager.stopSound(this.bgmAudio);
                    this.assetManager.playSound('gameOverSound');
                    break;
                }

                // Update bobber position based on input
                if (this.bobberMoveDirection !== 0) {
                    this.bobber.y += this.bobberMoveDirection * this.config.bobberMoveSpeed * deltaTime;
                    this.bobber.y = Math.max(
                        this.config.minBobberYRatio * this.canvas.height,
                        Math.min(this.config.maxBobberYRatio * this.canvas.height, this.bobber.y)
                    );
                }

                // Update fish movement
                this.fishes.forEach(fish => fish.update(deltaTime * this.config.fishSwimSpeedMultiplier, this.canvas.width, this.bobber.x));

                // Spawn fish
                this.fishSpawnTimer += deltaTime;
                if (this.fishSpawnTimer >= this.config.fishSpawnIntervalSeconds) {
                    this.fishSpawnTimer = 0;
                    this.spawnFish();
                }

                // Manage outcome display
                if (this.caughtFishName !== null) {
                    this.outcomeDisplayTimer -= deltaTime;
                    if (this.outcomeDisplayTimer <= 0) {
                        this.caughtFishName = null;
                    }
                }

                // Check for bite only if no outcome is currently displayed
                if (this.caughtFishName === null) {
                    let closestFish: Fish | null = null;
                    let minDistanceSq = Infinity;

                    for (const fish of this.fishes) {
                        const dx = fish.x - this.bobber.x;
                        const dy = fish.y - this.bobber.y;
                        const distanceSq = dx * dx + dy * dy;

                        // Check if within biteTriggerRadius
                        if (distanceSq <= this.config.biteTriggerRadius * this.config.biteTriggerRadius) {
                            if (distanceSq < minDistanceSq) {
                                minDistanceSq = distanceSq;
                                closestFish = fish;
                            }
                        }
                    }

                    if (closestFish) {
                        if (this.fishUnderBobber === closestFish) {
                            this.fishUnderBobberTimer += deltaTime;
                            if (this.fishUnderBobberTimer >= this.config.biteHoldDurationSeconds) {
                                this.currentState = GameState.REELING_MINIGAME;
                                this.assetManager.playSound('bite');
                                this.initMiniGame(this.fishUnderBobber); // Pass the actual Fish object

                                // Remove the fish from the screen instantly upon bite
                                const index = this.fishes.indexOf(this.fishUnderBobber);
                                if (index > -1) {
                                    this.fishes.splice(index, 1);
                                }
                                this.fishUnderBobber = null; // Reset for next bite
                                this.fishUnderBobberTimer = 0;
                            }
                        } else {
                            // New fish detected or switched to a different closest fish
                            this.fishUnderBobber = closestFish;
                            this.fishUnderBobberTimer = 0; // Start timer for this new fish
                        }
                    } else {
                        // No fish near bobber
                        this.fishUnderBobber = null;
                        this.fishUnderBobberTimer = 0;
                    }
                }
                break;
            case GameState.REELING_MINIGAME:
                this.miniGameTimer -= deltaTime;
                if (this.miniGameTimer <= 0) {
                    this.resolveMiniGame(); // Time's up, resolve based on success/failure
                    break;
                }

                // Decay success over time
                this.miniGameSuccess = Math.max(0, this.miniGameSuccess - this.config.miniGameDecayRate * deltaTime);

                // Update pointer position (moves left/right)
                this.miniGamePointerPosition += this.config.miniGameBasePointerSpeed * deltaTime;
                if (this.miniGamePointerPosition > 1 || this.miniGamePointerPosition < -1) {
                    this.config.miniGameBasePointerSpeed *= -1; // Reverse direction
                    this.miniGamePointerPosition = Math.max(-1, Math.min(1, this.miniGamePointerPosition)); // Clamp
                }

                // Check if pointer is outside target zone
                const targetZoneStart = this.miniGameTargetZoneCenter - this.config.miniGameTargetZoneWidth / 2;
                const targetZoneEnd = this.miniGameTargetZoneCenter + this.config.miniGameTargetZoneWidth / 2;

                if (!(this.miniGamePointerPosition >= targetZoneStart && this.miniGamePointerPosition <= targetZoneEnd)) {
                    this.miniGameFailure += deltaTime; // Failure increases over time outside zone
                }

                if (this.miniGameFailure >= this.config.miniGameFailureThreshold) {
                    this.resolveMiniGame(false); // Forced fail if failure threshold reached
                } else if (this.miniGameSuccess >= this.config.miniGameSuccessTarget) {
                    this.resolveMiniGame(true); // Forced success if success target reached
                }
                break;
        }
    }

    /**
     * Spawns a new fish at a random position below the water line.
     */
    private spawnFish(): void {
        const fishConfig = this.config.fishes[Math.floor(Math.random() * this.config.fishes.length)];
        const spawnX = Math.random() * this.canvas.width;

        const waterLineY = this.config.initialBobberY * this.canvas.height;
        const minSpawnY = waterLineY + this.config.fishDefaultHeight / 2 + 10; // 10px buffer below water surface
        const maxSpawnY = this.canvas.height - this.config.fishDefaultHeight / 2 - 10; // 10px buffer from bottom edge

        // Ensure there's a valid range for spawning
        if (minSpawnY < maxSpawnY) {
            const spawnY = minSpawnY + Math.random() * (maxSpawnY - minSpawnY);
            const newFish = new Fish(
                spawnX,
                spawnY,
                this.config.fishDefaultWidth,
                this.config.fishDefaultHeight,
                fishConfig
            );
            this.fishes.push(newFish);

            // Limit the number of fish on screen
            if (this.fishes.length > this.config.maxFishOnScreen) {
                this.fishes.shift(); // Remove the oldest fish
            }
        } else {
            console.warn("Fish spawn range is invalid. Check canvas dimensions, initialBobberY, and fishDefaultHeight in config.");
        }
    }

    /**
     * Initializes the reeling mini-game.
     * @param fish - The actual Fish object that initiated the mini-game.
     */
    private initMiniGame(fish: Fish): void {
        this.miniGameSuccess = 0;
        this.miniGameFailure = 0;
        this.miniGameTimer = this.config.miniGameDurationSeconds;
        this.miniGamePointerPosition = 0; // Start pointer at center
        this.miniGameTargetZoneCenter = (Math.random() * 1.6) - 0.8; // Random position between -0.8 and 0.8
        this.currentFishInMinigame = fish; // Store the actual fish instance

        // Adjust mini-game parameters based on fish difficulty
        this.config.miniGameBasePointerSpeed = 1.0 + (fish.data.miniGameDifficulty * 0.5);
        // Randomize initial pointer speed direction
        if (Math.random() < 0.5) { this.config.miniGameBasePointerSpeed *= -1; }
        this.config.miniGameDecayRate = 0.8 + (fish.data.miniGameDifficulty * 0.2);
    }

    /**
     * Resolves the mini-game, determining if the fish was caught or lost.
     * @param forcedOutcome - Optional boolean to force a success or failure (e.g., if target/threshold reached early).
     */
    private resolveMiniGame(forcedOutcome?: boolean): void {
        const caught = forcedOutcome !== undefined ? forcedOutcome : (this.miniGameSuccess >= this.config.miniGameSuccessTarget);

        if (caught && this.currentFishInMinigame) {
            this.score += this.currentFishInMinigame.data.score; // Access score from fish.data
            this.assetManager.playSound('catch');
            this.caughtFishName = this.config.ui.fishCaught; // Display "Caught!" message
            // The fish has already been removed from the `fishes` array when the mini-game started.
        } else {
            this.assetManager.playSound('fail');
            this.caughtFishName = this.config.ui.fishLost; // Display "Lost!" message
            // If the fish is lost, it's considered to have "gotten away" and is not re-added to the screen.
        }

        this.currentFishInMinigame = undefined; // Clear fish in mini-game
        this.outcomeDisplayTimer = 2; // Display message for 2 seconds
        this.currentState = GameState.WAITING_FOR_BITE; // Return to waiting
    }

    /**
     * Draws all game elements to the canvas based on the current game state.
     */
    private draw(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background first for all states (except loading)
        const background = this.assetManager.getImage('background');
        if (background) {
            this.ctx.drawImage(background, 0, 0, this.canvas.width, this.canvas.height);
        }

        switch (this.currentState) {
            case GameState.LOADING:
                this.drawLoadingScreen();
                break;
            case GameState.TITLE_SCREEN:
                this.drawTitleScreen();
                break;
            case GameState.TUTORIAL_SCREEN:
                this.drawTutorialScreen();
                break;
            case GameState.WAITING_FOR_BITE:
            case GameState.REELING_MINIGAME:
                this.drawGameplay();
                if (this.currentState === GameState.REELING_MINIGAME) {
                    this.drawMiniGameUI();
                }
                if (this.caughtFishName !== null) {
                    this.drawOutcomeMessage();
                }
                break;
            case GameState.GAME_OVER:
                this.drawGameplay(); // Draw game scene behind game over screen
                this.drawGameOverScreen();
                break;
        }
    }

    private drawLoadingScreen(): void {
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`${this.config.ui.loading} ${Math.round(this.assetManager.getLoadingProgress() * 100)}%`, this.canvas.width / 2, this.canvas.height / 2);
    }

    private drawTitleScreen(): void {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Semi-transparent overlay
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = 'white';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.config.ui.title, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = '24px Arial';
        this.ctx.fillText(this.config.ui.pressSpace, this.canvas.width / 2, this.canvas.height / 2 + 50);
    }

    private drawTutorialScreen(): void {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Semi-transparent overlay
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = 'white';
        this.ctx.font = '30px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('조작법', this.canvas.width / 2, this.canvas.height / 2 - 120);

        this.ctx.font = '20px Arial';
        this.ctx.fillText(this.config.ui.tutorialLine1, this.canvas.width / 2, this.canvas.height / 2 - 60);
        this.ctx.fillText(this.config.ui.tutorialLine2, this.canvas.width / 2, this.canvas.height / 2 - 30);
        this.ctx.fillText(this.config.ui.tutorialLine3, this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.fillText(this.config.ui.tutorialLine4, this.canvas.width / 2, this.canvas.height / 2 + 30);

        this.ctx.font = '24px Arial';
        this.ctx.fillText(this.config.ui.pressSpace, this.canvas.width / 2, this.canvas.height / 2 + 100);
    }

    private drawGameplay(): void {
        const waterLineY = this.config.initialBobberY * this.canvas.height;

        // Draw boat
        const boat = this.assetManager.getImage('boat');
        if (boat) {
            const boatX = this.canvas.width / 2 - boat.width / 2;
            const boatY = waterLineY - boat.height; // Bottom of boat at water line
            this.ctx.drawImage(boat, boatX, boatY, boat.width, boat.height);

            // Draw fishing line (from boat to bobber)
            this.ctx.strokeStyle = 'white';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            // Line starts from a point on the boat where the fishing rod might be
            this.ctx.moveTo(boatX + this.config.fishingLineOffsetX, boatY + this.config.fishingLineOffsetY);
            this.ctx.lineTo(this.bobber.x, this.bobber.y);
            this.ctx.stroke();
        }

        this.bobber.draw(this.ctx, this.assetManager);
        this.fishes.forEach(fish => fish.draw(this.ctx, this.assetManager));

        // Draw UI elements (score, timer)
        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`${this.config.ui.scorePrefix}${this.score}`, 10, 30);
        this.ctx.fillText(`${this.config.ui.timeRemainingPrefix}${Math.ceil(this.gameTimer)}`, 10, 60);
    }

    private drawMiniGameUI(): void {
        // Draw background overlay for mini-game
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, this.canvas.height - 150, this.canvas.width, 150); // Bottom bar area

        const barY = this.canvas.height - 100;
        const barHeight = 30;
        const barWidth = this.canvas.width * 0.8;
        const barX = (this.canvas.width - barWidth) / 2;

        // Draw mini-game bar background
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(barX, barY, barWidth, barHeight);

        // Draw target zone
        const targetZoneWidthPx = barWidth * this.config.miniGameTargetZoneWidth;
        const targetZoneX = barX + (this.miniGameTargetZoneCenter * (barWidth / 2)) + (barWidth / 2) - (targetZoneWidthPx / 2);
        this.ctx.fillStyle = 'rgba(0, 255, 0, 0.5)'; // Green target zone
        this.ctx.fillRect(targetZoneX, barY, targetZoneWidthPx, barHeight);

        // Draw pointer
        const pointerX = barX + (this.miniGamePointerPosition * (barWidth / 2)) + (barWidth / 2);
        this.ctx.fillStyle = 'yellow';
        this.ctx.fillRect(pointerX - 5, barY - 10, 10, barHeight + 20); // Pointer wider and taller

        // Draw success bar
        const successBarWidth = (this.miniGameSuccess / this.config.miniGameSuccessTarget) * barWidth;
        this.ctx.fillStyle = 'blue';
        this.ctx.fillRect(barX, barY + barHeight + 10, successBarWidth, 10);

        // Draw failure bar
        const failureBarWidth = (this.miniGameFailure / this.config.miniGameFailureThreshold) * barWidth;
        this.ctx.fillStyle = 'red';
        this.ctx.fillRect(barX, barY + barHeight + 25, failureBarWidth, 10);

        // Display instructions and timer
        this.ctx.fillStyle = 'white';
        this.ctx.font = '28px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.config.ui.reelInstruction, this.canvas.width / 2, barY - 30);

        this.ctx.font = '20px Arial';
        this.ctx.fillText(`${this.config.ui.reelTime}${Math.ceil(this.miniGameTimer)}s`, this.canvas.width / 2, barY + barHeight + 50);
    }

    private drawOutcomeMessage(): void {
        if (this.caughtFishName) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            this.ctx.fillRect(0, this.canvas.height / 2 - 50, this.canvas.width, 100);
            this.ctx.fillStyle = 'white';
            this.ctx.font = '40px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(this.caughtFishName, this.canvas.width / 2, this.canvas.height / 2 + 10);
        }
    }

    private drawGameOverScreen(): void {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Dark overlay
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = 'white';
        this.ctx.font = '60px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.config.ui.gameOver, this.canvas.width / 2, this.canvas.height / 2 - 80);

        this.ctx.font = '36px Arial';
        this.ctx.fillText(`${this.config.ui.scorePrefix}${this.score}`, this.canvas.width / 2, this.canvas.height / 2);

        this.ctx.font = '24px Arial';
        this.ctx.fillText(this.config.ui.pressSpace, this.canvas.width / 2, this.canvas.height / 2 + 80);
    }
}

// Initialize the game when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error("Canvas element with ID 'gameCanvas' not found!");
        return;
    }
    ctx = canvas.getContext('2d')!;
    if (!ctx) {
        console.error("Failed to get 2D rendering context for canvas!");
        return;
    }

    game = new Game(canvas, ctx);
    game.start();
});
