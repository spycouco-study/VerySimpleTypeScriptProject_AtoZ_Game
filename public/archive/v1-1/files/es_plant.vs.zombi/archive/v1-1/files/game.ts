interface AssetConfig {
    images: { name: string; path: string; width: number; height: number; }[];
    sounds: { name: string; path: string; duration_seconds: number; volume: number; }[];
}

interface GameData {
    canvasWidth: number;
    canvasHeight: number;
    grid: {
        rows: number;
        cols: number;
        cellSize: number;
    };
    initialSun: number;
    sunDropInterval: { min: number; max: number; };
    sunValue: number;
    plantCosts: { [key: string]: number; };
    plantStats: {
        [key: string]: {
            health: number;
            attackDamage?: number;
            attackSpeed?: number;
            productionRate?: number;
            asset: string;
            projectileAsset?: string;
        };
    };
    zombieStats: {
        [key: string]: {
            health: number;
            speed: number;
            attackDamage: number;
            attackSpeed: number;
            asset: string;
        };
    };
    projectileStats: {
        [key: string]: {
            speed: number;
            damage: number;
            asset: string;
        };
    };
    colors: {
        background: string;
        gridLine: string;
        uiBackground: string;
        textColor: string;
    };
    texts: {
        title: string;
        clickToStart: string;
        gameOver: string;
        clickToRestart: string;
        sunCounter: string;
        plantSelection: string;
    };
    assets: AssetConfig;
}

enum GameState {
    TITLE,
    PLAYING,
    GAME_OVER,
}

enum PlantType {
    SUN_PRODUCER = "SUN_PRODUCER",
    PEA_SHOOTER = "PEA_SHOOTER",
}

enum ZombieType {
    BASIC_ZOMBIE = "BASIC_ZOMBIE",
}

enum ProjectileType {
    PEA = "PEA",
}

interface GameObject {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    assetName: string;
    render(ctx: CanvasRenderingContext2D, assetManager: AssetManager): void;
}

interface Mortal {
    health: number;
    maxHealth: number;
    takeDamage(amount: number): void;
    isAlive(): boolean;
}

interface Plant extends GameObject, Mortal {
    type: PlantType;
    gridX: number;
    gridY: number;
    lastActionTime: number;
}

interface Zombie extends GameObject, Mortal {
    type: ZombieType;
    speed: number;
    attackDamage: number;
    attackSpeed: number;
    lastAttackTime: number;
    targetPlant: Plant | null;
    row: number;
}

interface Projectile extends GameObject {
    type: ProjectileType;
    speed: number;
    damage: number;
}

interface Sun extends GameObject {
    value: number;
    spawnTime: number;
    despawnDuration: number;
}

class AssetManager {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private totalAssets = 0;
    private loadedAssets = 0;
    private onProgressCallback: ((progress: number) => void) | null = null;
    private onCompleteCallback: (() => void) | null = null;

    public setCallbacks(onProgress: (progress: number) => void, onComplete: () => void) {
        this.onProgressCallback = onProgress;
        this.onCompleteCallback = onComplete;
    }

    public async loadAssets(assetConfig: AssetConfig): Promise<void> {
        this.totalAssets = assetConfig.images.length + assetConfig.sounds.length;
        this.loadedAssets = 0;

        const imagePromises = assetConfig.images.map(img => this.loadImage(img));
        const soundPromises = assetConfig.sounds.map(snd => this.loadSound(snd));

        await Promise.all([...imagePromises, ...soundPromises]);

        if (this.onCompleteCallback) {
            this.onCompleteCallback();
        }
    }

    private updateProgress(): void {
        this.loadedAssets++;
        if (this.onProgressCallback) {
            this.onProgressCallback(this.loadedAssets / this.totalAssets);
        }
    }

    private loadImage(imgConfig: { name: string; path: string; width: number; height: number; }): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = imgConfig.path;
            img.onload = () => {
                this.images.set(imgConfig.name, img);
                this.updateProgress();
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${imgConfig.path}`);
                this.updateProgress();
                resolve();
            };
        });
    }

    private loadSound(soundConfig: { name: string; path: string; duration_seconds: number; volume: number; }): Promise<void> {
        return new Promise((resolve, reject) => {
            const audio = new Audio(soundConfig.path);
            audio.volume = soundConfig.volume;
            audio.load(); // Start loading
            audio.oncanplaythrough = () => {
                this.sounds.set(soundConfig.name, audio);
                this.updateProgress();
                resolve();
            };
            audio.onerror = () => {
                console.error(`Failed to load sound: ${soundConfig.path}`);
                this.updateProgress();
                resolve();
            };
            // In case it's already loaded/cached
            if (audio.readyState >= 3) { // HAVE_FUTURE_DATA
                this.sounds.set(soundConfig.name, audio);
                this.updateProgress();
                resolve();
            }
        });
    }

    public getImage(name: string): HTMLImageElement | undefined {
        return this.images.get(name);
    }

    public playSound(name: string, loop: boolean = false): HTMLAudioElement | undefined {
        const audio = this.sounds.get(name);
        if (audio) {
            const clonedAudio = audio.cloneNode() as HTMLAudioElement;
            clonedAudio.loop = loop;
            clonedAudio.play().catch(e => console.warn(`Audio playback failed for ${name}:`, e));
            return clonedAudio;
        }
        return undefined;
    }

    public stopSound(audio: HTMLAudioElement): void {
        audio.pause();
        audio.currentTime = 0;
    }
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private assetManager: AssetManager;
    private gameData!: GameData;

    private lastTime: DOMHighResTimeStamp = 0;
    private gameState: GameState = GameState.TITLE;

    private sunCount: number = 0;
    private plants: Plant[] = [];
    private zombies: Zombie[] = [];
    private projectiles: Projectile[] = [];
    private suns: Sun[] = [];

    private selectedPlantType: PlantType | null = null;
    private hoveredGridCell: { x: number; y: number; } | null = null;

    private nextZombieSpawnTime: number = 0;
    private zombieSpawnInterval: number = 5000;
    private lastSunDropTime: number = 0;
    private nextSunDropInterval: number = 0;

    private backgroundMusic: HTMLAudioElement | undefined;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas element with ID '${canvasId}' not found.`);
        }
        this.ctx = this.canvas.getContext("2d")!;
        this.assetManager = new AssetManager();

        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('click', this.handleClick.bind(this));
    }

    public async init(): Promise<void> {
        this.ctx.fillStyle = "black";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = "white";
        this.ctx.font = "24px Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillText("Loading Game Data...", this.canvas.width / 2, this.canvas.height / 2);

        try {
            const response = await fetch('data.json');
            this.gameData = await response.json() as GameData;

            this.canvas.width = this.gameData.canvasWidth;
            this.canvas.height = this.gameData.canvasHeight;

            this.assetManager.setCallbacks(
                (progress) => {
                    this.ctx.fillStyle = "black";
                    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                    this.ctx.fillStyle = "white";
                    this.ctx.fillText(`Loading Assets: ${Math.round(progress * 100)}%`, this.canvas.width / 2, this.canvas.height / 2);
                },
                () => {
                    this.startGameLoop();
                }
            );

            await this.assetManager.loadAssets(this.gameData.assets);

            this.resetGame();

        } catch (error) {
            console.error("Failed to load game data or assets:", error);
            this.ctx.fillStyle = "red";
            this.ctx.fillText("Error loading game. Check console.", this.canvas.width / 2, this.canvas.height / 2);
        }
    }

    private startGameLoop(): void {
        this.lastTime = performance.now();
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private gameLoop(currentTime: DOMHighResTimeStamp): void {
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private update(deltaTime: number): void {
        switch (this.gameState) {
            case GameState.TITLE:
                break;
            case GameState.PLAYING:
                this.updatePlaying(deltaTime);
                break;
            case GameState.GAME_OVER:
                break;
        }
    }

    private updatePlaying(deltaTime: number): void {
        if (this.lastTime >= this.nextZombieSpawnTime) {
            this.spawnZombie(ZombieType.BASIC_ZOMBIE, Math.floor(Math.random() * this.gameData.grid.rows));
            this.nextZombieSpawnTime = this.lastTime + this.zombieSpawnInterval;
        }

        if (this.lastTime >= this.lastSunDropTime + this.nextSunDropInterval) {
            this.dropSunFromSky();
            this.lastSunDropTime = this.lastTime;
            this.nextSunDropInterval = Math.random() * (this.gameData.sunDropInterval.max - this.gameData.sunDropInterval.min) + this.gameData.sunDropInterval.min;
        }

        this.plants.forEach(plant => {
            if (plant.type === PlantType.PEA_SHOOTER) {
                const plantConfig = this.gameData.plantStats[plant.type];
                if (plantConfig.attackSpeed && this.lastTime - plant.lastActionTime >= plantConfig.attackSpeed) {
                    const targetZombie = this.zombies.find(z => z.row === plant.gridY && z.x > plant.x);
                    if (targetZombie) {
                        this.spawnProjectile(ProjectileType.PEA, plant.x + plant.width / 2, plant.y + plant.height / 2);
                        plant.lastActionTime = this.lastTime;
                        this.assetManager.playSound("shoot_sfx");
                    }
                }
            } else if (plant.type === PlantType.SUN_PRODUCER) {
                const plantConfig = this.gameData.plantStats[plant.type];
                if (plantConfig.productionRate && this.lastTime - plant.lastActionTime >= plantConfig.productionRate) {
                    this.spawnSun(plant.x + plant.width / 2, plant.y + plant.height / 2, this.gameData.sunValue);
                    plant.lastActionTime = this.lastTime;
                }
            }
        });

        this.projectiles = this.projectiles.filter(projectile => {
            projectile.x += projectile.speed * (deltaTime / 1000);

            for (let i = 0; i < this.zombies.length; i++) {
                const zombie = this.zombies[i];
                if (this.checkCollision(projectile, zombie)) {
                    zombie.takeDamage(projectile.damage);
                    if (!zombie.isAlive()) {
                        this.zombies.splice(i, 1);
                        i--;
                        this.assetManager.playSound("zombie_die_sfx");
                    } else {
                        this.assetManager.playSound("zombie_hit_sfx");
                    }
                    return false;
                }
            }
            return projectile.x < this.canvas.width;
        });

        this.zombies = this.zombies.filter(zombie => {
            const plantsInRow = this.plants.filter(p => p.gridY === zombie.row && p.x < zombie.x);
            let targetPlant: Plant | null = null;
            if (plantsInRow.length > 0) {
                targetPlant = plantsInRow.reduce((prev, curr) => (curr.x > prev.x ? curr : prev));
            }

            if (targetPlant && this.checkCollision(zombie, targetPlant)) {
                if (this.lastTime - zombie.lastAttackTime >= zombie.attackSpeed) {
                    targetPlant.takeDamage(zombie.attackDamage);
                    zombie.lastAttackTime = this.lastTime;
                    this.assetManager.playSound("zombie_attack_sfx");
                }
                if (!targetPlant.isAlive()) {
                    this.plants = this.plants.filter(p => p.id !== targetPlant!.id);
                    targetPlant = null;
                }
            } else {
                zombie.x -= zombie.speed * (deltaTime / 1000);
            }

            if (zombie.x + zombie.width < 0) {
                this.gameState = GameState.GAME_OVER;
                this.assetManager.playSound("game_over_sfx");
                if (this.backgroundMusic) {
                    this.assetManager.stopSound(this.backgroundMusic);
                }
                this.backgroundMusic = this.assetManager.playSound("bgm_game_over", true);
                return false;
            }
            return true;
        });

        this.suns = this.suns.filter(sun => {
            return this.lastTime - sun.spawnTime < sun.despawnDuration;
        });
    }

    private render(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        switch (this.gameState) {
            case GameState.TITLE:
                this.renderTitle();
                break;
            case GameState.PLAYING:
                this.renderPlaying();
                break;
            case GameState.GAME_OVER:
                this.renderGameOver();
                break;
        }
    }

    private renderTitle(): void {
        const bgImage = this.assetManager.getImage("title_background");
        if (bgImage) {
            this.ctx.drawImage(bgImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = this.gameData.colors.background;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.ctx.fillStyle = this.gameData.colors.textColor;
        this.ctx.font = "bold 60px 'Press Start 2P', cursive";
        this.ctx.textAlign = "center";
        this.ctx.fillText(this.gameData.texts.title, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = "24px 'Press Start 2P', cursive";
        this.ctx.fillText(this.gameData.texts.clickToStart, this.canvas.width / 2, this.canvas.height / 2 + 50);
    }

    private renderPlaying(): void {
        const cellSize = this.gameData.grid.cellSize;
        const rows = this.gameData.grid.rows;
        const cols = this.gameData.grid.cols;

        const bgImage = this.assetManager.getImage("background");
        if (bgImage) {
            this.ctx.drawImage(bgImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = this.gameData.colors.background;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.ctx.strokeStyle = this.gameData.colors.gridLine;
        this.ctx.lineWidth = 1;
        for (let r = 0; r <= rows; r++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, r * cellSize);
            this.ctx.lineTo(cols * cellSize, r * cellSize);
            this.ctx.stroke();
        }
        for (let c = 0; c <= cols; c++) {
            this.ctx.beginPath();
            this.ctx.moveTo(c * cellSize, 0);
            this.ctx.lineTo(c * cellSize, rows * cellSize);
            this.ctx.stroke();
        }

        if (this.hoveredGridCell && this.selectedPlantType) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.fillRect(this.hoveredGridCell.x * cellSize, this.hoveredGridCell.y * cellSize, cellSize, cellSize);
        }

        this.plants.forEach(plant => plant.render(this.ctx, this.assetManager));
        this.zombies.forEach(zombie => zombie.render(this.ctx, this.assetManager));
        this.projectiles.forEach(projectile => projectile.render(this.ctx, this.assetManager));
        this.suns.forEach(sun => sun.render(this.ctx, this.assetManager));

        this.renderUI();
    }

    private renderGameOver(): void {
        const bgImage = this.assetManager.getImage("game_over_background");
        if (bgImage) {
            this.ctx.drawImage(bgImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.ctx.fillStyle = this.gameData.colors.textColor;
        this.ctx.font = "bold 60px 'Press Start 2P', cursive";
        this.ctx.textAlign = "center";
        this.ctx.fillText(this.gameData.texts.gameOver, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = "24px 'Press Start 2P', cursive";
        this.ctx.fillText(this.gameData.texts.clickToRestart, this.canvas.width / 2, this.canvas.height / 2 + 50);
    }

    private renderUI(): void {
        const uiHeight = 80;
        this.ctx.fillStyle = this.gameData.colors.uiBackground;
        this.ctx.fillRect(0, 0, this.canvas.width, uiHeight);

        this.ctx.fillStyle = this.gameData.colors.textColor;
        this.ctx.font = "30px Arial";
        this.ctx.textAlign = "left";
        this.ctx.fillText(`${this.gameData.texts.sunCounter}: ${this.sunCount}`, 20, uiHeight / 2 + 10);

        const buttonStartX = this.canvas.width / 2 - (Object.keys(PlantType).length * (50 + 10)) / 2;
        let currentButtonX = buttonStartX;
        const buttonSize = 50;
        const padding = 10;
        const buttonY = (uiHeight - buttonSize) / 2;

        Object.values(PlantType).forEach((type) => {
            const plantConfig = this.gameData.plantStats[type];
            const cost = this.gameData.plantCosts[type];

            this.ctx.fillStyle = this.selectedPlantType === type ? 'yellow' : 'lightgray';
            this.ctx.fillRect(currentButtonX, buttonY, buttonSize, buttonSize);
            this.ctx.strokeStyle = 'black';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(currentButtonX, buttonY, buttonSize, buttonSize);

            const plantImage = this.assetManager.getImage(plantConfig.asset);
            if (plantImage) {
                this.ctx.drawImage(plantImage, currentButtonX + 5, buttonY + 5, buttonSize - 10, buttonSize - 10);
            }

            this.ctx.fillStyle = 'blue';
            this.ctx.font = "14px Arial";
            this.ctx.textAlign = "center";
            this.ctx.fillText(`${cost}`, currentButtonX + buttonSize / 2, buttonY + buttonSize + 15);

            currentButtonX += buttonSize + padding;
        });
    }

    private handleClick(event: MouseEvent): void {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        switch (this.gameState) {
            case GameState.TITLE:
                this.gameState = GameState.PLAYING;
                this.resetGame();
                if (this.backgroundMusic) {
                    this.assetManager.stopSound(this.backgroundMusic);
                }
                this.backgroundMusic = this.assetManager.playSound("bgm_game", true);
                break;
            case GameState.PLAYING:
                const uiHeight = 80;
                if (mouseY < uiHeight) {
                    const buttonStartX = this.canvas.width / 2 - (Object.keys(PlantType).length * (50 + 10)) / 2;
                    let currentButtonX = buttonStartX;
                    const buttonSize = 50;
                    const padding = 10;
                    const buttonY = (uiHeight - buttonSize) / 2;

                    Object.values(PlantType).forEach(type => {
                        if (mouseX > currentButtonX && mouseX < currentButtonX + buttonSize &&
                            mouseY > buttonY && mouseY < buttonY + buttonSize) {
                            this.selectedPlantType = (this.selectedPlantType === type) ? null : type;
                            this.assetManager.playSound("ui_click_sfx");
                        }
                        currentButtonX += buttonSize + padding;
                    });
                } else {
                    const cellSize = this.gameData.grid.cellSize;
                    const gridX = Math.floor(mouseX / cellSize);
                    const gridY = Math.floor(mouseY / cellSize);

                    let sunCollected = false;
                    this.suns = this.suns.filter(sun => {
                        if (this.checkClick(mouseX, mouseY, sun)) {
                            this.sunCount += sun.value;
                            sunCollected = true;
                            this.assetManager.playSound("sun_collect_sfx");
                            return false;
                        }
                        return true;
                    });

                    if (sunCollected) return;

                    if (this.selectedPlantType) {
                        if (gridX >= 0 && gridX < this.gameData.grid.cols &&
                            gridY >= 0 && gridY < this.gameData.grid.rows) {
                            const existingPlant = this.plants.find(p => p.gridX === gridX && p.gridY === gridY);
                            if (!existingPlant) {
                                const cost = this.gameData.plantCosts[this.selectedPlantType];
                                if (this.sunCount >= cost) {
                                    this.placePlant(this.selectedPlantType, gridX, gridY);
                                    this.sunCount -= cost;
                                    this.selectedPlantType = null;
                                    this.assetManager.playSound("plant_place_sfx");
                                } else {
                                    this.assetManager.playSound("error_sfx");
                                }
                            } else {
                                this.assetManager.playSound("error_sfx");
                            }
                        }
                    }
                }
                break;
            case GameState.GAME_OVER:
                this.gameState = GameState.TITLE;
                if (this.backgroundMusic) {
                    this.assetManager.stopSound(this.backgroundMusic);
                }
                this.backgroundMusic = this.assetManager.playSound("bgm_title", true);
                break;
        }
    }

    private handleMouseMove(event: MouseEvent): void {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        if (this.gameState === GameState.PLAYING && this.selectedPlantType) {
            const cellSize = this.gameData.grid.cellSize;
            const gridX = Math.floor(mouseX / cellSize);
            const gridY = Math.floor(mouseY / cellSize);
            this.hoveredGridCell = { x: gridX, y: gridY };
        } else {
            this.hoveredGridCell = null;
        }
    }

    private resetGame(): void {
        this.sunCount = this.gameData.initialSun;
        this.plants = [];
        this.zombies = [];
        this.projectiles = [];
        this.suns = [];
        this.selectedPlantType = null;
        this.hoveredGridCell = null;
        this.nextZombieSpawnTime = this.lastTime + this.zombieSpawnInterval;
        this.lastSunDropTime = this.lastTime;
        this.nextSunDropInterval = Math.random() * (this.gameData.sunDropInterval.max - this.gameData.sunDropInterval.min) + this.gameData.sunDropInterval.min;

        if (this.backgroundMusic) {
            this.assetManager.stopSound(this.backgroundMusic);
        }
        if (this.gameState === GameState.TITLE) {
            this.backgroundMusic = this.assetManager.playSound("bgm_title", true);
        } else if (this.gameState === GameState.PLAYING) {
            this.backgroundMusic = this.assetManager.playSound("bgm_game", true);
        }
    }

    private placePlant(type: PlantType, gridX: number, gridY: number): void {
        const plantConfig = this.gameData.plantStats[type];
        const cellSize = this.gameData.grid.cellSize;
        const plantWidth = cellSize * 0.8;
        const plantHeight = cellSize * 0.8;
        const offsetX = (cellSize - plantWidth) / 2;
        const offsetY = (cellSize - plantHeight) / 2;

        const newPlant: Plant = {
            id: `plant-${Date.now()}-${Math.random()}`,
            type: type,
            x: gridX * cellSize + offsetX,
            y: gridY * cellSize + offsetY,
            width: plantWidth,
            height: plantHeight,
            assetName: plantConfig.asset,
            health: plantConfig.health,
            maxHealth: plantConfig.health,
            gridX: gridX,
            gridY: gridY,
            lastActionTime: 0,
            takeDamage: function (amount: number) { this.health -= amount; },
            isAlive: function () { return this.health > 0; },
            render: function (ctx: CanvasRenderingContext2D, assetManager: AssetManager) {
                const img = assetManager.getImage(this.assetName);
                if (img) {
                    ctx.drawImage(img, this.x, this.y, this.width, this.height);
                } else {
                    ctx.fillStyle = 'green';
                    ctx.fillRect(this.x, this.y, this.width, this.height);
                }
                if (this.health < this.maxHealth) {
                    const barWidth = this.width;
                    const barHeight = 5;
                    ctx.fillStyle = 'red';
                    ctx.fillRect(this.x, this.y - barHeight - 2, barWidth, barHeight);
                    ctx.fillStyle = 'lime';
                    ctx.fillRect(this.x, this.y - barHeight - 2, barWidth * (this.health / this.maxHealth), barHeight);
                }
            }
        };
        this.plants.push(newPlant);
    }

    private spawnZombie(type: ZombieType, row: number): void {
        const zombieConfig = this.gameData.zombieStats[type];
        const cellSize = this.gameData.grid.cellSize;
        const zombieWidth = cellSize * 0.9;
        const zombieHeight = cellSize * 0.9;
        const offsetY = (cellSize - zombieHeight) / 2;

        const newZombie: Zombie = {
            id: `zombie-${Date.now()}-${Math.random()}`,
            type: type,
            x: this.canvas.width,
            y: row * cellSize + offsetY,
            width: zombieWidth,
            height: zombieHeight,
            assetName: zombieConfig.asset,
            health: zombieConfig.health,
            maxHealth: zombieConfig.health,
            speed: zombieConfig.speed,
            attackDamage: zombieConfig.attackDamage,
            attackSpeed: zombieConfig.attackSpeed,
            lastAttackTime: 0,
            targetPlant: null,
            row: row,
            takeDamage: function (amount: number) { this.health -= amount; },
            isAlive: function () { return this.health > 0; },
            render: function (ctx: CanvasRenderingContext2D, assetManager: AssetManager) {
                const img = assetManager.getImage(this.assetName);
                if (img) {
                    ctx.drawImage(img, this.x, this.y, this.width, this.height);
                } else {
                    ctx.fillStyle = 'purple';
                    ctx.fillRect(this.x, this.y, this.width, this.height);
                }
                if (this.health < this.maxHealth) {
                    const barWidth = this.width;
                    const barHeight = 5;
                    ctx.fillStyle = 'red';
                    ctx.fillRect(this.x, this.y - barHeight - 2, barWidth, barHeight);
                    ctx.fillStyle = 'lime';
                    ctx.fillRect(this.x, this.y - barHeight - 2, barWidth * (this.health / this.maxHealth), barHeight);
                }
            }
        };
        this.zombies.push(newZombie);
    }

    private spawnProjectile(type: ProjectileType, x: number, y: number): void {
        const projectileConfig = this.gameData.projectileStats[type];
        const projectileWidth = 20;
        const projectileHeight = 20;

        const newProjectile: Projectile = {
            id: `projectile-${Date.now()}-${Math.random()}`,
            type: type,
            x: x,
            y: y,
            width: projectileWidth,
            height: projectileHeight,
            assetName: projectileConfig.asset,
            speed: projectileConfig.speed,
            damage: projectileConfig.damage,
            render: function (ctx: CanvasRenderingContext2D, assetManager: AssetManager) {
                const img = assetManager.getImage(this.assetName);
                if (img) {
                    ctx.drawImage(img, this.x, this.y, this.width, this.height);
                } else {
                    ctx.fillStyle = 'orange';
                    ctx.fillRect(this.x, this.y, this.width, this.height);
                }
            }
        };
        this.projectiles.push(newProjectile);
    }

    private spawnSun(x: number, y: number, value: number): void {
        const sunWidth = 50;
        const sunHeight = 50;
        const newSun: Sun = {
            id: `sun-${Date.now()}-${Math.random()}`,
            x: x - sunWidth / 2,
            y: y - sunHeight / 2,
            width: sunWidth,
            height: sunHeight,
            assetName: "sun_icon",
            value: value,
            spawnTime: this.lastTime,
            despawnDuration: 10000,
            render: function (ctx: CanvasRenderingContext2D, assetManager: AssetManager) {
                const img = assetManager.getImage(this.assetName);
                if (img) {
                    ctx.drawImage(img, this.x, this.y, this.width, this.height);
                } else {
                    ctx.fillStyle = 'yellow';
                    ctx.fillRect(this.x, this.y, this.width, this.height);
                }
            }
        };
        this.suns.push(newSun);
    }

    private dropSunFromSky(): void {
        const randomCol = Math.floor(Math.random() * this.gameData.grid.cols);
        const randomX = randomCol * this.gameData.grid.cellSize + this.gameData.grid.cellSize / 2;
        const randomY = Math.random() * (this.gameData.grid.rows * this.gameData.grid.cellSize * 0.5) + this.gameData.grid.cellSize * 0.1;
        this.spawnSun(randomX, randomY, this.gameData.sunValue);
    }

    private checkCollision(obj1: GameObject, obj2: GameObject): boolean {
        return obj1.x < obj2.x + obj2.width &&
            obj1.x + obj1.width > obj2.x &&
            obj1.y < obj2.y + obj2.height &&
            obj1.y + obj1.height > obj2.y;
    }

    private checkClick(clickX: number, clickY: number, obj: GameObject): boolean {
        return clickX > obj.x && clickX < obj.x + obj.width &&
            clickY > obj.y && clickY < obj.y + obj.height;
    }
}

window.addEventListener('load', () => {
    const game = new Game('gameCanvas');
    game.init();
});