// game.ts

// --- Data Interfaces (aligns with data.json) ---

interface GameConfig {
    canvasWidth: number;
    canvasHeight: number;
    initialMoney: number;
    initialEnergy: number;
    maxEnergy: number;
    energyRegenRate: number; // energy per second
    initialStress: number;
    maxStress: number;
    stressDecayRate: number; // stress per second
    focusPointsPerClick: number; // progress added per click
    taskSpawnIntervalMin: number; // milliseconds
    taskSpawnIntervalMax: number; // milliseconds
    maxActiveTasks: number;
    earlyLeaveScoreTarget: number;
    earlyLeaveMoneyBonus: number;
    gameDayDurationSeconds: number; // seconds for a full workday
    uiPanelColor: string;
    textColor: string;
    accentColor: string;
}

interface TaskData {
    id: string;
    name: string;
    description: string;
    baseDuration: number; // progress points required
    moneyReward: number;
    performanceReward: number;
    stressCost: number;
    icon: string; // asset name
}

interface UpgradeData {
    id: string;
    name: string;
    description: string;
    cost: number;
    effectType: "taskSpeedMultiplier" | "stressDecayRate" | "energyRegenRate" | "maxActiveTasks";
    effectValue: number; // multiplier or direct increment
    icon: string; // asset name
}

interface EventData {
    id: string;
    name: string;
    description: string;
    triggerChance: number; // 0 to 1
    effectType: "stressBoost" | "bonusTask" | "no_effect_yet";
    effectValue: number;
    delaySeconds: number; // how long the event effect might last or before decision
}

interface TextContent {
    title: string;
    clickToStart: string;
    instructionsTitle: string;
    instructionsText: string[];
    moneyLabel: string;
    energyLabel: string;
    stressLabel: string;
    performanceLabel: string;
    timeLabel: string;
    taskInProgress: string;
    taskComplete: string;
    upgradePanelTitle: string;
    gameOverTitle: string;
    gameOverStress: string;
    gameOverEnergy: string;
    gameWinTitle: string;
    gameWinMessage: string;
}

// Renamed to avoid conflict with DOM's ImageData
interface AssetImageData {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface SoundData {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface AssetManifest {
    images: AssetImageData[]; // Updated to AssetImageData
    sounds: SoundData[];
}

interface GameData {
    gameConfig: GameConfig;
    tasks: TaskData[];
    upgrades: UpgradeData[];
    events: EventData[];
    texts: TextContent;
    assets: AssetManifest;
}

// --- Asset Management ---

class AssetManager {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private loadedCount: number = 0;
    private totalCount: number = 0;
    private onProgress: ((progress: number) => void) | null = null;
    private onComplete: (() => void) | null = null;

    constructor(private assetManifest: AssetManifest) {
        this.totalCount = assetManifest.images.length + assetManifest.sounds.length;
    }

    public setOnProgress(callback: (progress: number) => void) {
        this.onProgress = callback;
    }

    public setOnComplete(callback: () => void) {
        this.onComplete = callback;
    }

    public async loadAll(): Promise<void> {
        const imagePromises = this.assetManifest.images.map(imgData => this.loadImage(imgData));
        const soundPromises = this.assetManifest.sounds.map(soundData => this.loadSound(soundData));

        await Promise.all([...imagePromises, ...soundPromises]);
        if (this.onComplete) {
            this.onComplete();
        }
    }

    private loadImage(imgData: AssetImageData): Promise<void> { // Updated to AssetImageData
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = imgData.path;
            img.onload = () => {
                this.images.set(imgData.name, img);
                this.loadedCount++;
                if (this.onProgress) {
                    this.onProgress(this.loadedCount / this.totalCount);
                }
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${imgData.path}`);
                reject(`Failed to load image: ${imgData.path}`);
            };
        });
    }

    private loadSound(soundData: SoundData): Promise<void> {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.src = soundData.path;
            audio.volume = soundData.volume;
            audio.oncanplaythrough = () => {
                this.sounds.set(soundData.name, audio);
                this.loadedCount++;
                if (this.onProgress) {
                    this.onProgress(this.loadedCount / this.totalCount);
                }
                resolve();
            };
            audio.onerror = () => {
                console.error(`Failed to load sound: ${soundData.path}`);
                reject(`Failed to load sound: ${soundData.path}`);
            };
            // For some browsers, 'oncanplaythrough' might not fire if not explicitly loaded.
            // A small timeout can act as a fallback, or we assume it's loaded enough.
            // For this simple game, we trust 'oncanplaythrough'.
        });
    }

    public getImage(name: string): HTMLImageElement | undefined {
        return this.images.get(name);
    }

    public getSound(name: string): HTMLAudioElement | undefined {
        return this.sounds.get(name);
    }

    // Public getter for sounds map, required by AudioPlayer constructor
    public getSounds(): Map<string, HTMLAudioElement> {
        return this.sounds;
    }
}

class AudioPlayer {
    private sounds: Map<string, HTMLAudioElement>;
    private currentBGM: HTMLAudioElement | null = null;
    private bgmVolume: number = 0.5; // Default BGM volume
    private sfxVolume: number = 0.7; // Default SFX volume

    constructor(sounds: Map<string, HTMLAudioElement>, bgmVolume: number, sfxVolume: number) {
        this.sounds = sounds;
        this.bgmVolume = bgmVolume;
        this.sfxVolume = sfxVolume;
    }

    public playSFX(name: string, volume?: number) {
        const sound = this.sounds.get(name);
        if (sound) {
            const sfxInstance = sound.cloneNode() as HTMLAudioElement;
            sfxInstance.volume = volume !== undefined ? volume : this.sfxVolume;
            sfxInstance.play().catch(e => console.warn("SFX playback failed:", e));
        }
    }

    public playBGM(name: string, loop: boolean = true, volume?: number) {
        if (this.currentBGM) {
            this.currentBGM.pause();
            this.currentBGM.currentTime = 0;
        }
        const sound = this.sounds.get(name);
        if (sound) {
            this.currentBGM = sound;
            this.currentBGM.loop = loop;
            this.currentBGM.volume = volume !== undefined ? volume : this.bgmVolume;
            this.currentBGM.play().catch(e => console.warn("BGM playback failed:", e));
        }
    }

    public stopBGM() {
        if (this.currentBGM) {
            this.currentBGM.pause();
            this.currentBGM.currentTime = 0;
            this.currentBGM = null;
        }
    }

    public setBGMVolume(volume: number) {
        this.bgmVolume = volume;
        if (this.currentBGM) {
            this.currentBGM.volume = volume;
        }
    }

    public setSFXVolume(volume: number) {
        this.sfxVolume = volume;
    }
}

// --- Game UI Components ---

// Updated Clickable interface to use checkHover method for hover state update
interface Clickable {
    isClicked(x: number, y: number): boolean;
    checkHover(x: number, y: number): void; // Method to update internal hover state
    onClick?: () => void;
}

class Button implements Clickable {
    public x: number;
    public y: number;
    public width: number;
    public height: number;
    public text: string;
    public onClick?: () => void;
    public isHovered: boolean = false; // Internal property for rendering
    public enabled: boolean = true;
    public imageNormal?: HTMLImageElement;
    public imageHover?: HTMLImageElement;
    public imageDisabled?: HTMLImageElement;

    constructor(x: number, y: number, width: number, height: number, text: string, onClick?: () => void, imageNormal?: HTMLImageElement, imageHover?: HTMLImageElement, imageDisabled?: HTMLImageElement) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.text = text;
        this.onClick = onClick;
        this.imageNormal = imageNormal;
        this.imageHover = imageHover;
        this.imageDisabled = imageDisabled;
    }

    public isClicked(x: number, y: number): boolean {
        return this.enabled && x >= this.x && x <= this.x + this.width && y >= this.y && y <= this.y + this.height;
    }

    public checkHover(x: number, y: number): void { // Implements Clickable.checkHover
        this.isHovered = this.enabled && x >= this.x && x <= this.x + this.width && y >= this.y && y <= this.y + this.height;
    }

    public draw(ctx: CanvasRenderingContext2D, textColor: string, accentColor: string) {
        let currentImage = this.imageNormal;
        if (!this.enabled && this.imageDisabled) {
            currentImage = this.imageDisabled;
        } else if (this.isHovered && this.imageHover) {
            currentImage = this.imageHover;
        }

        if (currentImage) {
            ctx.drawImage(currentImage, this.x, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = this.enabled ? (this.isHovered ? accentColor : "#555") : "#888";
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.strokeStyle = textColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, this.y, this.width, this.height);
        }

        ctx.fillStyle = textColor;
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.text, this.x + this.width / 2, this.y + this.height / 2);
    }
}

class ProgressBar {
    public x: number;
    public y: number;
    public width: number;
    public height: number;
    public maxValue: number;
    public currentValue: number;
    public fillColor: string;
    public bgColor: string;
    public label?: string;
    public fillImage?: HTMLImageElement;

    constructor(x: number, y: number, width: number, height: number, maxValue: number, currentValue: number, fillColor: string, bgColor: string, label?: string, fillImage?: HTMLImageElement) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.maxValue = maxValue;
        this.currentValue = currentValue;
        this.fillColor = fillColor;
        this.bgColor = bgColor;
        this.label = label;
        this.fillImage = fillImage;
    }

    public draw(ctx: CanvasRenderingContext2D, textColor: string) {
        ctx.fillStyle = this.bgColor;
        ctx.fillRect(this.x, this.y, this.width, this.height);

        const fillWidth = (this.currentValue / this.maxValue) * this.width;
        if (this.fillImage) {
            ctx.drawImage(this.fillImage, this.x, this.y, fillWidth, this.height);
        } else {
            ctx.fillStyle = this.fillColor;
            ctx.fillRect(this.x, this.y, fillWidth, this.height);
        }

        ctx.strokeStyle = "#FFF";
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x, this.y, this.width, this.height);

        if (this.label) {
            ctx.fillStyle = textColor;
            ctx.font = "16px Arial";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(`${this.label} ${Math.round(this.currentValue)}/${this.maxValue}`, this.x, this.y - 10);
        }
    }
}

// --- Game Entities ---

class Player {
    public money: number;
    public energy: number;
    public maxEnergy: number;
    public energyRegenRate: number; // per second
    public stress: number;
    public maxStress: number;
    public stressDecayRate: number; // per second
    public performanceScore: number;
    public taskSpeedMultiplier: number;
    public maxActiveTasks: number;
    public focusPointsPerClick: number;

    constructor(config: GameConfig) {
        this.money = config.initialMoney;
        this.energy = config.initialEnergy;
        this.maxEnergy = config.maxEnergy;
        this.energyRegenRate = config.energyRegenRate;
        this.stress = config.initialStress;
        this.maxStress = config.maxStress;
        this.stressDecayRate = config.stressDecayRate;
        this.performanceScore = 0;
        this.taskSpeedMultiplier = 1.0; // Base multiplier
        this.maxActiveTasks = config.maxActiveTasks;
        this.focusPointsPerClick = config.focusPointsPerClick;
    }

    public update(dt: number) {
        // Energy regeneration
        this.energy = Math.min(this.maxEnergy, this.energy + this.energyRegenRate * dt);
        // Stress decay
        this.stress = Math.max(0, this.stress - this.stressDecayRate * dt);
    }

    public addMoney(amount: number) { this.money += amount; }
    public spendMoney(amount: number) { this.money -= amount; }
    public addEnergy(amount: number) { this.energy = Math.min(this.maxEnergy, this.energy + amount); }
    public loseEnergy(amount: number) { this.energy = Math.max(0, this.energy - amount); }
    public addStress(amount: number) { this.stress = Math.min(this.maxStress, this.stress + amount); }
    public loseStress(amount: number) { this.stress = Math.max(0, this.stress - amount); }
    public addPerformance(amount: number) { this.performanceScore += amount; }

    public applyUpgrade(upgrade: UpgradeData) {
        if (upgrade.effectType === "taskSpeedMultiplier") {
            this.taskSpeedMultiplier *= upgrade.effectValue;
        } else if (upgrade.effectType === "stressDecayRate") {
            this.stressDecayRate += upgrade.effectValue;
        } else if (upgrade.effectType === "energyRegenRate") {
            this.energyRegenRate += upgrade.effectValue;
        } else if (upgrade.effectType === "maxActiveTasks") {
            this.maxActiveTasks += upgrade.effectValue;
        }
    }
}

class Task implements Clickable {
    public id: string;
    public name: string;
    public description: string;
    public icon: string;
    public maxProgress: number;
    public currentProgress: number;
    public moneyReward: number;
    public performanceReward: number;
    public stressCost: number;
    public isCompleted: boolean = false;
    public isHovered: boolean = false; // Internal property for rendering
    public x: number = 0; // Position for rendering
    public y: number = 0;
    public width: number = 0;
    public height: number = 0;
    public onClick?: () => void; // Triggered by game logic, not directly by button

    constructor(data: TaskData) {
        this.id = data.id;
        this.name = data.name;
        this.description = data.description;
        this.icon = data.icon;
        this.maxProgress = data.baseDuration;
        this.currentProgress = 0;
        this.moneyReward = data.moneyReward;
        this.performanceReward = data.performanceReward;
        this.stressCost = data.stressCost;
    }

    public update(dt: number, taskSpeedMultiplier: number) {
        // Passive progress for some tasks, or if player has auto-workers (not implemented yet)
        // For now, progress only via click
        if (this.currentProgress < this.maxProgress) {
            // Placeholder for future auto-progress
        }
    }

    public applyFocus(focusPoints: number, playerTaskSpeedMultiplier: number): number {
        if (this.isCompleted) return 0;
        const actualFocus = focusPoints * playerTaskSpeedMultiplier;
        this.currentProgress += actualFocus;
        if (this.currentProgress >= this.maxProgress) {
            this.currentProgress = this.maxProgress;
            this.isCompleted = true;
        }
        return actualFocus;
    }

    public isClicked(x: number, y: number): boolean {
        return x >= this.x && x <= this.x + this.width && y >= this.y && y <= this.y + this.height;
    }

    public checkHover(x: number, y: number): void { // Implements Clickable.checkHover
        this.isHovered = x >= this.x && x <= this.x + this.width && y >= this.y && y <= this.y + this.height;
    }

    public draw(ctx: CanvasRenderingContext2D, assetManager: AssetManager, gameConfig: GameConfig) {
        const icon = assetManager.getImage(this.icon);
        const taskSlotBg = assetManager.getImage("task_slot_bg");

        // Background / Slot
        if (taskSlotBg) {
            ctx.drawImage(taskSlotBg, this.x, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = this.isHovered ? gameConfig.accentColor : gameConfig.uiPanelColor;
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.strokeStyle = gameConfig.textColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, this.y, this.width, this.height);
        }

        // Icon
        if (icon) {
            const iconSize = this.height * 0.6;
            ctx.drawImage(icon, this.x + 10, this.y + (this.height - iconSize) / 2, iconSize, iconSize);
        }

        // Name
        ctx.fillStyle = gameConfig.textColor;
        ctx.font = "18px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(this.name, this.x + this.height * 0.6 + 20, this.y + 10);

        // Progress bar
        const progressX = this.x + this.height * 0.6 + 20;
        const progressY = this.y + this.height - 30;
        const progressBarWidth = this.width - (this.height * 0.6 + 30);
        const progressBarHeight = 15;

        const progressBar = new ProgressBar(
            progressX, progressY, progressBarWidth, progressBarHeight,
            this.maxProgress, this.currentProgress,
            gameConfig.accentColor, "#555555",
            null
        );
        progressBar.draw(ctx, gameConfig.textColor);

        // Progress text
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${Math.round(this.currentProgress)}/${this.maxProgress}`, progressX + progressBarWidth / 2, progressY + progressBarHeight / 2);
    }
}

// --- Main Game Class ---

enum GameState {
    LOADING,
    TITLE,
    INSTRUCTIONS,
    PLAYING,
    GAME_OVER,
    GAME_WIN,
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private assetManager!: AssetManager;
    private audioPlayer!: AudioPlayer;
    private gameData!: GameData;

    private gameState: GameState = GameState.LOADING;
    private player!: Player;
    private activeTasks: Task[] = [];
    private allTasksData: TaskData[] = [];
    private availableUpgradesData: UpgradeData[] = [];
    private purchasedUpgradeIds: Set<string> = new Set();
    private eventsData: EventData[] = [];
    private currentEvent: EventData | null = null;
    private eventDisplayTimer: number = 0; // How long an event message stays

    private uiElements: Clickable[] = [];
    private gameButtons: Button[] = []; // Buttons for the current screen
    private taskButtons: Task[] = []; // Tasks as clickable elements
    private upgradeButtons: Button[] = []; // Upgrade buttons

    private lastTimestamp: DOMHighResTimeStamp = 0;
    private mouseX: number = 0;
    private mouseY: number = 0;
    private isMouseDown: boolean = false; // To track if mouse button is held down for task focus

    private taskSpawnTimer: number = 0;
    private gameTimeElapsed: number = 0; // For workday timer
    private eventTriggerTimer: number = 0;

    // UI positions and sizes
    private readonly UI_TASK_PANEL_X: number;
    private readonly UI_TASK_PANEL_Y: number;
    private readonly UI_TASK_PANEL_WIDTH: number;
    private readonly UI_TASK_HEIGHT: number = 80;
    private readonly UI_TASK_SPACING: number = 10;

    // Removed 'readonly' modifier as these are assigned after canvas width is known
    private UI_UPGRADE_PANEL_X: number;
    private UI_UPGRADE_PANEL_Y: number;
    private readonly UI_UPGRADE_PANEL_WIDTH: number;
    private readonly UI_UPGRADE_PANEL_HEIGHT: number;
    private readonly UI_UPGRADE_BUTTON_WIDTH: number = 250;
    private readonly UI_UPGRADE_BUTTON_HEIGHT: number = 60;
    private readonly UI_UPGRADE_SPACING: number = 15;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas with ID '${canvasId}' not found.`);
        }
        this.ctx = this.canvas.getContext("2d")!;
        this.addEventListeners();

        // Initialize default sizes, will be updated after config is loaded
        this.UI_TASK_PANEL_WIDTH = 500;
        this.UI_TASK_PANEL_X = 10;
        this.UI_TASK_PANEL_Y = 100;

        this.UI_UPGRADE_PANEL_WIDTH = 300;
        this.UI_UPGRADE_PANEL_HEIGHT = 600;
        // Initial assignment, will be updated after canvas width is set
        this.UI_UPGRADE_PANEL_X = this.canvas.width - this.UI_UPGRADE_PANEL_WIDTH - 10;
        this.UI_UPGRADE_PANEL_Y = 100;

        this.loadGameDataAndAssets();
    }

    private addEventListeners() {
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    }

    // Helper to get mouse coordinates considering canvas scaling
    private getMouseCoordinates(event: MouseEvent): { x: number, y: number } {
        const rect = this.canvas.getBoundingClientRect();
        // Calculate the scaling factor if the canvas's CSS dimensions differ from its drawing surface dimensions
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;
        return { x, y };
    }

    private async loadGameDataAndAssets() {
        try {
            const response = await fetch('data.json');
            this.gameData = await response.json();

            this.canvas.width = this.gameData.gameConfig.canvasWidth;
            this.canvas.height = this.gameData.gameConfig.canvasHeight;

            this.UI_UPGRADE_PANEL_X = this.canvas.width - this.UI_UPGRADE_PANEL_WIDTH - 10;
            this.UI_UPGRADE_PANEL_Y = 100; // Fixed Y

            this.assetManager = new AssetManager(this.gameData.assets);
            // Use getSounds() to access the private sounds map
            this.audioPlayer = new AudioPlayer(this.assetManager.getSounds(),
                                            this.gameData.assets.sounds.find(s => s.name === "bgm_office")?.volume || 0.3,
                                            this.gameData.assets.sounds.find(s => s.name === "sfx_click")?.volume || 0.7);

            this.assetManager.setOnProgress(progress => {
                this.renderLoadingScreen(progress);
            });
            this.assetManager.setOnComplete(() => {
                this.initGame();
            });

            await this.assetManager.loadAll();
        } catch (error) {
            console.error("Failed to load game data or assets:", error);
            // Optionally render an error screen
        }
    }

    private initGame() {
        this.player = new Player(this.gameData.gameConfig);
        this.allTasksData = [...this.gameData.tasks];
        this.availableUpgradesData = [...this.gameData.upgrades];
        this.eventsData = [...this.gameData.events];
        this.activeTasks = [];
        this.purchasedUpgradeIds.clear();
        this.gameTimeElapsed = 0;
        this.taskSpawnTimer = this.getRandomTaskSpawnInterval();
        this.eventTriggerTimer = 10; // First event check after 10 seconds

        this.setupTitleScreen();
        this.gameLoop(0); // Start the game loop
    }

    private setupTitleScreen() {
        this.gameState = GameState.TITLE;
        this.uiElements = [];
        this.gameButtons = [];

        this.audioPlayer.playBGM("bgm_office");

        const startButton = new Button(
            this.canvas.width / 2 - 150 / 2,
            this.canvas.height - 100,
            150, 50,
            this.gameData.texts.clickToStart,
            () => this.setupInstructionsScreen(),
            this.assetManager.getImage("button_normal"),
            this.assetManager.getImage("button_hover")
        );
        this.gameButtons.push(startButton);
        this.uiElements.push(startButton);
    }

    private setupInstructionsScreen() {
        this.gameState = GameState.INSTRUCTIONS;
        this.uiElements = [];
        this.gameButtons = [];

        const playButton = new Button(
            this.canvas.width / 2 - 150 / 2,
            this.canvas.height - 100,
            150, 50,
            this.gameData.texts.instructionsText[this.gameData.texts.instructionsText.length - 1],
            () => this.startGameplay(),
            this.assetManager.getImage("button_normal"),
            this.assetManager.getImage("button_hover")
        );
        this.gameButtons.push(playButton);
        this.uiElements.push(playButton);
    }

    private startGameplay() {
        this.gameState = GameState.PLAYING;
        this.uiElements = [];
        this.taskButtons = [];
        this.upgradeButtons = [];
        this.gameButtons = []; // Clear any residual buttons

        this.setupUpgradePanelButtons();
        // Tasks are dynamically added to taskButtons
    }

    private setupUpgradePanelButtons() {
        this.upgradeButtons = [];
        // Clear previous upgrade buttons from uiElements to prevent duplicates and old references
        this.uiElements = this.uiElements.filter(el => !(el instanceof Button && this.availableUpgradesData.some(u => el.text.includes(u.name))));

        let upgradeButtonY = this.UI_UPGRADE_PANEL_Y + 50; // Start below title

        this.availableUpgradesData.forEach(upgradeData => {
            const isPurchased = this.purchasedUpgradeIds.has(upgradeData.id);
            const buttonText = isPurchased ? `${upgradeData.name} (구매됨)` : `${upgradeData.name} (₩${upgradeData.cost})`;
            const button = new Button(
                this.UI_UPGRADE_PANEL_X + (this.UI_UPGRADE_PANEL_WIDTH - this.UI_UPGRADE_BUTTON_WIDTH) / 2,
                upgradeButtonY,
                this.UI_UPGRADE_BUTTON_WIDTH,
                this.UI_UPGRADE_BUTTON_HEIGHT,
                buttonText,
                () => this.buyUpgrade(upgradeData.id),
                this.assetManager.getImage("button_normal"),
                this.assetManager.getImage("button_hover"),
                this.assetManager.getImage("button_normal") // Use normal as disabled look for now
            );
            button.enabled = !isPurchased && this.player.money >= upgradeData.cost;
            this.upgradeButtons.push(button);
            this.uiElements.push(button); // Add to general UI elements for click/hover
            upgradeButtonY += this.UI_UPGRADE_BUTTON_HEIGHT + this.UI_UPGRADE_SPACING;
        });
    }

    private getRandomTaskSpawnInterval(): number {
        const { taskSpawnIntervalMin, taskSpawnIntervalMax } = this.gameData.gameConfig;
        return Math.random() * (taskSpawnIntervalMax - taskSpawnIntervalMin) + taskSpawnIntervalMin;
    }

    private spawnRandomTask() {
        if (this.activeTasks.length >= this.player.maxActiveTasks || this.allTasksData.length === 0) {
            return;
        }

        const availableTasks = this.allTasksData; // All tasks can be spawned again
        const randomTaskData = availableTasks[Math.floor(Math.random() * availableTasks.length)];
        const newTask = new Task(randomTaskData);
        this.activeTasks.push(newTask);
        this.taskButtons.push(newTask); // Add to clickable tasks
        this.uiElements.push(newTask);
    }

    private buyUpgrade(upgradeId: string) {
        this.audioPlayer.playSFX("sfx_click");
        const upgradeData = this.availableUpgradesData.find(u => u.id === upgradeId);
        if (upgradeData && !this.purchasedUpgradeIds.has(upgradeData.id) && this.player.money >= upgradeData.cost) {
            this.player.spendMoney(upgradeData.cost);
            this.player.applyUpgrade(upgradeData);
            this.purchasedUpgradeIds.add(upgradeData.id);
            this.audioPlayer.playSFX("sfx_upgrade");
            this.setupUpgradePanelButtons(); // Re-render upgrade buttons to show changes
        }
    }

    private triggerRandomEvent() {
        const potentialEvents = this.eventsData.filter(e => Math.random() < e.triggerChance);
        if (potentialEvents.length > 0) {
            this.audioPlayer.playSFX("sfx_event");
            this.currentEvent = potentialEvents[Math.floor(Math.random() * potentialEvents.length)];
            this.eventDisplayTimer = 5; // Display for 5 seconds

            if (this.currentEvent.effectType === "stressBoost") {
                this.player.addStress(this.currentEvent.effectValue);
            } else if (this.currentEvent.effectType === "bonusTask") {
                // Spawn an additional task
                this.spawnRandomTask();
            }
        }
        this.eventTriggerTimer = Math.random() * 20 + 15; // Next event check between 15-35 seconds
    }

    private gameLoop(timestamp: DOMHighResTimeStamp) {
        const deltaTime = (timestamp - this.lastTimestamp) / 1000; // seconds
        this.lastTimestamp = timestamp;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private update(dt: number) {
        switch (this.gameState) {
            case GameState.PLAYING:
                this.player.update(dt);
                this.gameTimeElapsed += dt;

                // Task spawning
                this.taskSpawnTimer -= dt * 1000; // Convert dt to ms for comparison
                if (this.taskSpawnTimer <= 0) {
                    this.spawnRandomTask();
                    this.taskSpawnTimer = this.getRandomTaskSpawnInterval();
                }

                // Event triggering
                this.eventTriggerTimer -= dt;
                if (this.eventTriggerTimer <= 0) {
                    this.triggerRandomEvent();
                }

                // Event display timer
                if (this.currentEvent && this.eventDisplayTimer > 0) {
                    this.eventDisplayTimer -= dt;
                    if (this.eventDisplayTimer <= 0) {
                        this.currentEvent = null; // Hide event
                    }
                }

                // Task progress from clicks
                if (this.isMouseDown) {
                    const clickedTask = this.taskButtons.find(task => task.isHovered);
                    if (clickedTask && !clickedTask.isCompleted && this.player.energy > 0) {
                        const progressMade = clickedTask.applyFocus(this.player.focusPointsPerClick * dt, this.player.taskSpeedMultiplier);
                        if (progressMade > 0) {
                            this.player.loseEnergy(progressMade * 0.1); // Energy cost per progress point
                            this.player.addStress(progressMade * clickedTask.stressCost / clickedTask.maxProgress * 0.1); // Stress cost per progress point
                        }
                        if (clickedTask.isCompleted) {
                            this.audioPlayer.playSFX("sfx_task_complete");
                            this.player.addMoney(clickedTask.moneyReward);
                            this.player.addPerformance(clickedTask.performanceReward);
                            
                            // Remove completed task from activeTasks, taskButtons, and uiElements
                            this.activeTasks = this.activeTasks.filter(t => t !== clickedTask);
                            this.taskButtons = this.taskButtons.filter(t => t !== clickedTask);
                            this.uiElements = this.uiElements.filter(el => el !== clickedTask); // This comparison should now be fine

                            this.setupUpgradePanelButtons(); // Check if new upgrades are affordable
                        }
                    }
                }

                // Game Over / Win Conditions
                if (this.player.stress >= this.player.maxStress) {
                    this.setGameOver(this.gameData.texts.gameOverStress);
                } else if (this.player.energy <= 0 && this.activeTasks.some(t => !t.isCompleted)) {
                    // Consider game over if energy is 0 and there are still uncompleted tasks
                    // For simplicity, let's make it an immediate game over if energy is 0 and tasks are present
                    this.setGameOver(this.gameData.texts.gameOverEnergy);
                } else if (this.gameTimeElapsed >= this.gameData.gameConfig.gameDayDurationSeconds) {
                    if (this.player.performanceScore >= this.gameData.gameConfig.earlyLeaveScoreTarget) {
                        this.setGameWin();
                    } else {
                        this.setGameOver(`칼퇴 목표 달성 실패! ${this.player.performanceScore}/${this.gameData.gameConfig.earlyLeaveScoreTarget}`);
                    }
                }
                break;
            default:
                // No specific update logic for other states
                break;
        }
    }

    private render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        switch (this.gameState) {
            case GameState.LOADING:
                // renderLoadingScreen is called directly by assetManager.onProgress
                break;
            case GameState.TITLE:
                this.renderTitleScreen();
                break;
            case GameState.INSTRUCTIONS:
                this.renderInstructionsScreen();
                break;
            case GameState.PLAYING:
                this.renderGameplayScreen();
                break;
            case GameState.GAME_OVER:
            case GameState.GAME_WIN:
                this.renderEndScreen();
                break;
        }

        // Draw common UI elements if any, or specific for current state
        this.gameButtons.forEach(btn => btn.draw(this.ctx, this.gameData.gameConfig.textColor, this.gameData.gameConfig.accentColor));
    }

    private renderLoadingScreen(progress: number) {
        this.ctx.fillStyle = "#222222";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.font = "30px Arial";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText("게임 로딩 중...", this.canvas.width / 2, this.canvas.height / 2 - 50);

        const progressBarWidth = 400;
        const progressBarHeight = 30;
        const progressBarX = this.canvas.width / 2 - progressBarWidth / 2;
        const progressBarY = this.canvas.height / 2;

        this.ctx.fillStyle = "#555555";
        this.ctx.fillRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight);

        this.ctx.fillStyle = this.gameData?.gameConfig.accentColor || "#FFAA00";
        this.ctx.fillRect(progressBarX, progressBarY, progressBarWidth * progress, progressBarHeight);

        this.ctx.strokeStyle = "#FFFFFF";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight);

        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.font = "20px Arial";
        this.ctx.fillText(`${Math.round(progress * 100)}%`, this.canvas.width / 2, this.canvas.height / 2 + 20);
    }

    private renderTitleScreen() {
        const bg = this.assetManager.getImage("title_bg");
        if (bg) {
            this.ctx.drawImage(bg, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = "#4A6B8A";
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.ctx.fillStyle = this.gameData.gameConfig.textColor;
        this.ctx.font = "60px Arial";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText(this.gameData.texts.title, this.canvas.width / 2, this.canvas.height / 2 - 50);
    }

    private renderInstructionsScreen() {
        const bg = this.assetManager.getImage("office_bg");
        if (bg) {
            this.ctx.drawImage(bg, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = "#6B8E23";
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.ctx.fillStyle = "rgba(0,0,0,0.7)";
        this.ctx.fillRect(50, 50, this.canvas.width - 100, this.canvas.height - 150); // Panel for text

        this.ctx.fillStyle = this.gameData.gameConfig.textColor;
        this.ctx.font = "40px Arial";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "top";
        this.ctx.fillText(this.gameData.texts.instructionsTitle, this.canvas.width / 2, 70);

        this.ctx.font = "20px Arial";
        this.ctx.textAlign = "left";
        let textY = 150;
        this.gameData.texts.instructionsText.slice(0, -1).forEach(line => {
            this.ctx.fillText(line, 70, textY);
            textY += 30;
        });
    }

    private renderGameplayScreen() {
        const bg = this.assetManager.getImage("office_bg");
        if (bg) {
            this.ctx.drawImage(bg, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = "#6B8E23";
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        // Top UI Panel for player stats
        const uiPanelHeight = 80;
        this.ctx.fillStyle = this.gameData.gameConfig.uiPanelColor;
        this.ctx.fillRect(0, 0, this.canvas.width, uiPanelHeight);

        this.ctx.fillStyle = this.gameData.gameConfig.textColor;
        this.ctx.font = "24px Arial";
        this.ctx.textAlign = "left";
        this.ctx.textBaseline = "middle";

        // Player Avatar (optional)
        const playerAvatar = this.assetManager.getImage("player_avatar");
        if (playerAvatar) {
            this.ctx.drawImage(playerAvatar, 10, 10, 60, 60);
        }

        // Money
        this.ctx.fillText(`${this.gameData.texts.moneyLabel}${Math.round(this.player.money)}`, 90, uiPanelHeight / 2);

        // Energy Bar
        const energyBar = new ProgressBar(
            this.canvas.width / 2 - 200, 20, 180, 20,
            this.player.maxEnergy, this.player.energy,
            "#00FF00", "#555555",
            this.gameData.texts.energyLabel,
            this.assetManager.getImage("energy_bar_fill")
        );
        energyBar.draw(this.ctx, this.gameData.gameConfig.textColor);

        // Stress Bar
        const stressBar = new ProgressBar(
            this.canvas.width / 2 - 200, 50, 180, 20,
            this.player.maxStress, this.player.stress,
            "#FF0000", "#555555",
            this.gameData.texts.stressLabel,
            this.assetManager.getImage("stress_bar_fill")
        );
        stressBar.draw(this.ctx, this.gameData.gameConfig.textColor);

        // Performance Score
        this.ctx.fillText(`${this.gameData.texts.performanceLabel}${this.player.performanceScore}/${this.gameData.gameConfig.earlyLeaveScoreTarget}`, this.canvas.width - 250, 30);

        // Workday Timer
        const remainingTime = this.gameData.gameConfig.gameDayDurationSeconds - this.gameTimeElapsed;
        const minutes = Math.floor(remainingTime / 60);
        const seconds = Math.floor(remainingTime % 60);
        this.ctx.fillText(`${this.gameData.texts.timeLabel}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`, this.canvas.width - 250, 60);


        // Task Panel
        this.ctx.fillStyle = this.gameData.gameConfig.uiPanelColor;
        this.ctx.fillRect(this.UI_TASK_PANEL_X, this.UI_TASK_PANEL_Y, this.UI_TASK_PANEL_WIDTH, this.canvas.height - this.UI_TASK_PANEL_Y - 10);
        this.ctx.strokeStyle = this.gameData.gameConfig.textColor;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(this.UI_TASK_PANEL_X, this.UI_TASK_PANEL_Y, this.UI_TASK_PANEL_WIDTH, this.canvas.height - this.UI_TASK_PANEL_Y - 10);

        this.ctx.fillStyle = this.gameData.gameConfig.textColor;
        this.ctx.font = "28px Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillText("내 업무", this.UI_TASK_PANEL_X + this.UI_TASK_PANEL_WIDTH / 2, this.UI_TASK_PANEL_Y + 30);


        let currentTaskY = this.UI_TASK_PANEL_Y + 60;
        this.activeTasks.forEach(task => {
            task.x = this.UI_TASK_PANEL_X + 10;
            task.y = currentTaskY;
            task.width = this.UI_TASK_PANEL_WIDTH - 20;
            task.height = this.UI_TASK_HEIGHT;
            task.draw(this.ctx, this.assetManager, this.gameData.gameConfig);
            currentTaskY += this.UI_TASK_HEIGHT + this.UI_TASK_SPACING;
        });

        // Upgrade Panel
        this.ctx.fillStyle = this.gameData.gameConfig.uiPanelColor;
        this.ctx.fillRect(this.UI_UPGRADE_PANEL_X, this.UI_UPGRADE_PANEL_Y, this.UI_UPGRADE_PANEL_WIDTH, this.UI_UPGRADE_PANEL_HEIGHT);
        this.ctx.strokeStyle = this.gameData.gameConfig.textColor;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(this.UI_UPGRADE_PANEL_X, this.UI_UPGRADE_PANEL_Y, this.UI_UPGRADE_PANEL_WIDTH, this.UI_UPGRADE_PANEL_HEIGHT);

        this.ctx.fillStyle = this.gameData.gameConfig.textColor;
        this.ctx.font = "28px Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillText(this.gameData.texts.upgradePanelTitle, this.UI_UPGRADE_PANEL_X + this.UI_UPGRADE_PANEL_WIDTH / 2, this.UI_UPGRADE_PANEL_Y + 30);

        this.upgradeButtons.forEach(btn => btn.draw(this.ctx, this.gameData.gameConfig.textColor, this.gameData.gameConfig.accentColor));

        // Event popup
        if (this.currentEvent) {
            const popupWidth = 400;
            const popupHeight = 150;
            const popupX = (this.canvas.width - popupWidth) / 2;
            const popupY = (this.canvas.height - popupHeight) / 2;

            this.ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
            this.ctx.fillRect(popupX, popupY, popupWidth, popupHeight);
            this.ctx.strokeStyle = this.gameData.gameConfig.accentColor;
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(popupX, popupY, popupWidth, popupHeight);

            this.ctx.fillStyle = this.gameData.gameConfig.textColor;
            this.ctx.font = "24px Arial";
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            this.ctx.fillText(this.currentEvent.name, popupX + popupWidth / 2, popupY + 40);
            this.ctx.font = "16px Arial";
            this.ctx.fillText(this.currentEvent.description, popupX + popupWidth / 2, popupY + 90);
        }
    }

    private renderEndScreen() {
        const bg = this.assetManager.getImage("office_bg");
        if (bg) {
            this.ctx.drawImage(bg, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = "#6B8E23";
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.ctx.fillStyle = "rgba(0,0,0,0.7)";
        this.ctx.fillRect(50, 50, this.canvas.width - 100, this.canvas.height - 150);

        this.ctx.fillStyle = this.gameData.gameConfig.textColor;
        this.ctx.font = "60px Arial";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";

        let titleText = "";
        let messageText = "";

        if (this.gameState === GameState.GAME_OVER) {
            titleText = this.gameData.texts.gameOverTitle;
            messageText = this.currentEvent?.description || this.gameData.texts.gameOverStress; // Use event desc as reason or default
        } else if (this.gameState === GameState.GAME_WIN) {
            titleText = this.gameData.texts.gameWinTitle;
            messageText = this.gameData.texts.gameWinMessage;
        }

        this.ctx.fillText(titleText, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = "24px Arial";
        this.ctx.fillText(messageText, this.canvas.width / 2, this.canvas.height / 2 + 20);

        const restartButton = new Button(
            this.canvas.width / 2 - 150 / 2,
            this.canvas.height - 100,
            150, 50,
            "다시 시작",
            () => this.initGame(), // Re-initialize game to restart
            this.assetManager.getImage("button_normal"),
            this.assetManager.getImage("button_hover")
        );
        restartButton.draw(this.ctx, this.gameData.gameConfig.textColor, this.gameData.gameConfig.accentColor);
        this.uiElements = [restartButton]; // Only restart button is clickable
    }

    private setGameOver(reason: string) {
        this.gameState = GameState.GAME_OVER;
        this.currentEvent = { id: "game_over_reason", name: this.gameData.texts.gameOverTitle, description: reason, triggerChance: 0, effectType: "no_effect_yet", effectValue: 0, delaySeconds: 0 };
        this.uiElements = []; // Clear current clickable elements
    }

    private setGameWin() {
        this.gameState = GameState.GAME_WIN;
        this.player.addMoney(this.gameData.gameConfig.earlyLeaveMoneyBonus); // Bonus for winning
        this.uiElements = []; // Clear current clickable elements
    }

    // --- Input Handlers ---
    private onMouseMove(event: MouseEvent) {
        const coords = this.getMouseCoordinates(event);
        this.mouseX = coords.x;
        this.mouseY = coords.y;

        // All elements in uiElements now conform to the new Clickable interface
        this.uiElements.forEach(el => {
            el.checkHover(this.mouseX, this.mouseY);
        });
    }

    private onMouseDown(event: MouseEvent) {
        this.isMouseDown = true;
    }

    private onMouseUp(event: MouseEvent) {
        this.isMouseDown = false;
        const coords = this.getMouseCoordinates(event);
        const clickX = coords.x;
        const clickY = coords.y;

        // Find and trigger click action
        for (const el of this.uiElements) {
            if (el.isClicked(clickX, clickY)) {
                this.audioPlayer.playSFX("sfx_click");
                if (el.onClick) {
                    el.onClick();
                }
                // The task progression logic when holding mouse is in update loop.
                // The restart button on end screens has its own onClick handler.
                // No need for explicit `this.initGame()` here, as the button's onClick handles it.
                return; // Only process one click
            }
        }
    }
}

// Start the game when the window loads
window.onload = () => {
    try {
        new Game("gameCanvas");
    } catch (e) {
        console.error("Failed to initialize game:", e);
        const body = document.querySelector('body');
        if (body) {
            body.innerHTML = `<div style="color: red; text-align: center; margin-top: 50px;">
                <h1>게임 실행 오류</h1>
                <p>게임 초기화 중 문제가 발생했습니다: ${e instanceof Error ? e.message : String(e)}</p>
                <p>콘솔을 확인하여 자세한 오류 정보를 확인해주세요.</p>
            </div>`;
        }
    }
};
