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

interface AssetsConfig {
    images: ImageAsset[];
    sounds: SoundAsset[];
}

interface CanvasSettings {
    width: number;
    height: number;
}

interface GameSettings {
    initialLives: number;
    roundTimeLimitSeconds: number;
    roundResultDisplayDurationSeconds: number;
    iconSize: number;
    centralIconSize: number;
    playerIconOffset: number;
    spacing: number;
}

interface TextConfig {
    title?: string;
    subtitle?: string;
    line1?: string;
    line2?: string;
    line3?: string;
    line4?: string;
    line5?: string;
    titleFontSize?: string;
    subtitleFontSize?: string;
    lineFontSize?: string;
    fontSize?: string; // Add this property for general text font size
    fontColor: string;
    win?: string;
    lose?: string;
    timeout?: string;
    winColor?: string;
    loseColor?: string;
    livesLabel?: string;
    timerLabel?: string;
    livesFontSize?: string;
    timerFontSize?: string;
}

interface GameConfig {
    canvas: CanvasSettings;
    gameSettings: GameSettings;
    texts: {
        titleScreen: TextConfig;
        instructionsScreen: TextConfig;
        playingScreen: TextConfig;
        roundResult: TextConfig;
        gameOverScreen: TextConfig;
    };
    assets: AssetsConfig;
}

enum GameState {
    LOADING,
    TITLE,
    INSTRUCTIONS,
    PLAYING,
    ROUND_END,
    GAME_OVER,
}

enum RPSChoice {
    ROCK = "rock",
    PAPER = "paper",
    SCISSORS = "scissors",
}

enum RoundResult {
    WIN = "win",
    LOSE = "lose",
    TIMEOUT = "timeout",
}

class AssetLoader {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private totalAssets = 0;
    private loadedAssets = 0;
    private assetPromises: Promise<any>[] = [];

    async loadAll(assetsConfig: AssetsConfig): Promise<void> {
        this.totalAssets = assetsConfig.images.length + assetsConfig.sounds.length;
        this.loadedAssets = 0;

        for (const img of assetsConfig.images) {
            this.assetPromises.push(this.loadImage(img.name, img.path));
        }
        for (const snd of assetsConfig.sounds) {
            this.assetPromises.push(this.loadSound(snd.name, snd.path, snd.volume));
        }

        await Promise.all(this.assetPromises);
        console.log("All assets loaded.");
    }

    private loadImage(name: string, path: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = path;
            img.onload = () => {
                this.images.set(name, img);
                this.loadedAssets++;
                resolve();
            };
            img.onerror = (e) => {
                console.error(`Failed to load image: ${path}`, e);
                reject(e);
            };
        });
    }

    private loadSound(name: string, path: string, volume: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.src = path;
            audio.volume = volume;
            audio.oncanplaythrough = () => {
                this.sounds.set(name, audio);
                this.loadedAssets++;
                resolve();
            };
            audio.onerror = (e) => {
                console.error(`Failed to load sound: ${path}`, e);
                reject(e);
            };
            // Add a timeout for sounds that might not trigger oncanplaythrough immediately
            setTimeout(() => {
                if (!this.sounds.has(name)) {
                    console.warn(`Sound ${name} (${path}) oncanplaythrough timed out. Resolving anyway.`);
                    this.sounds.set(name, audio); 
                    this.loadedAssets++;
                    resolve();
                }
            }, 5000); // 5 seconds timeout
        });
    }

    getImage(name: string): HTMLImageElement | undefined {
        return this.images.get(name);
    }

    getSound(name: string): HTMLAudioElement | undefined {
        return this.sounds.get(name);
    }

    getLoadingProgress(): number {
        return this.totalAssets > 0 ? this.loadedAssets / this.totalAssets : 0;
    }
}

class RPSGame {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config: GameConfig;
    private assetLoader: AssetLoader;

    private gameState: GameState = GameState.LOADING;
    private lastTimestamp = 0;

    private lives: number = 0;
    private currentRoundTimer: number = 0;
    private centralIcon: RPSChoice | null = null;
    private userChoice: RPSChoice | null = null;
    private roundResult: RoundResult | null = null;
    private roundResultDisplayTimer: number = 0;
    private bgm: HTMLAudioElement | undefined;
    private playerChoiceRects: Map<RPSChoice, { x: number, y: number, width: number, height: number }> = new Map();

    constructor(canvas: HTMLCanvasElement, config: GameConfig) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
        this.config = config;
        this.assetLoader = new AssetLoader();

        this.canvas.width = config.canvas.width;
        this.canvas.height = config.canvas.height;

        this.canvas.addEventListener("click", this.handleInput.bind(this));
        document.addEventListener("visibilitychange", this.handleVisibilityChange.bind(this));
    }

    async init(): Promise<void> {
        this.gameState = GameState.LOADING;
        this.drawLoadingScreen();

        try {
            await this.assetLoader.loadAll(this.config.assets);
            this.bgm = this.assetLoader.getSound("bgm");
            if (this.bgm) {
                this.bgm.loop = true;
                this.bgm.volume = this.config.assets.sounds.find(s => s.name === "bgm")?.volume || 0.3;
            }
            this.gameState = GameState.TITLE;
            this.loop(0);
        } catch (error) {
            console.error("Game initialization failed:", error);
            this.drawErrorMessage("에셋 로딩 실패!");
        }
    }

    private handleVisibilityChange() {
        if (document.hidden && this.bgm) {
            this.bgm.pause();
        } else if (!document.hidden && this.bgm && this.gameState !== GameState.LOADING) {
            if (this.bgm.paused) { 
                this.bgm.play().catch(e => console.log("BGM play interrupted on visibility change:", e));
            }
        }
    }

    private startGame(): void {
        this.lives = this.config.gameSettings.initialLives;
        this.startRound();
        this.gameState = GameState.PLAYING;
    }

    private startRound(): void {
        this.centralIcon = this.getRandomRPSChoice();
        this.currentRoundTimer = this.config.gameSettings.roundTimeLimitSeconds;
        this.userChoice = null;
        this.roundResult = null;
        this.roundResultDisplayTimer = 0;
    }

    private getRandomRPSChoice(): RPSChoice {
        const choices = [RPSChoice.ROCK, RPSChoice.PAPER, RPSChoice.SCISSORS];
        return choices[Math.floor(Math.random() * choices.length)];
    }

    private determineRoundResult(playerChoice: RPSChoice, cpuChoice: RPSChoice): RoundResult {
        if (
            (playerChoice === RPSChoice.ROCK && cpuChoice === RPSChoice.SCISSORS) ||
            (playerChoice === RPSChoice.PAPER && cpuChoice === RPSChoice.ROCK) ||
            (playerChoice === RPSChoice.SCISSORS && cpuChoice === RPSChoice.PAPER)
        ) {
            return RoundResult.WIN;
        } else {
            return RoundResult.LOSE;
        }
    }

    private handleInput(event: MouseEvent): void {
        const clickX = event.clientX - this.canvas.offsetLeft;
        const clickY = event.clientY - this.canvas.offsetTop;

        if (this.bgm && this.bgm.paused) {
            this.bgm.play().catch(e => console.log("BGM play prevented:", e));
        }

        switch (this.gameState) {
            case GameState.TITLE:
                this.playClickSound();
                this.gameState = GameState.INSTRUCTIONS;
                break;
            case GameState.INSTRUCTIONS:
                this.playClickSound();
                this.startGame();
                break;
            case GameState.PLAYING:
                if (this.userChoice === null) {
                    for (const [choice, rect] of this.playerChoiceRects.entries()) {
                        if (clickX >= rect.x && clickX <= rect.x + rect.width &&
                            clickY >= rect.y && clickY <= rect.y + rect.height) {
                            this.playClickSound();
                            this.userChoice = choice;
                            this.processRoundEnd(this.userChoice, this.centralIcon!);
                            break;
                        }
                    }
                }
                break;
            case GameState.GAME_OVER:
                this.playClickSound();
                this.gameState = GameState.TITLE;
                break;
        }
    }

    private processRoundEnd(playerChoice: RPSChoice | null, cpuChoice: RPSChoice | null, timedOut: boolean = false): void {
        if (timedOut || playerChoice === null || cpuChoice === null) {
            this.roundResult = RoundResult.TIMEOUT;
            this.lives--;
            this.playLoseSound();
        } else {
            this.roundResult = this.determineRoundResult(playerChoice, cpuChoice);
            if (this.roundResult === RoundResult.LOSE) {
                this.lives--;
                this.playLoseSound();
            } else {
                this.playWinSound();
            }
        }
        this.gameState = GameState.ROUND_END;
        this.roundResultDisplayTimer = this.config.gameSettings.roundResultDisplayDurationSeconds;
    }

    private playClickSound(): void {
        const sound = this.assetLoader.getSound("click_sound");
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => console.log("Click sound play prevented:", e));
        }
    }

    private playWinSound(): void {
        const sound = this.assetLoader.getSound("win_sound");
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => console.log("Win sound play prevented:", e));
        }
    }

    private playLoseSound(): void {
        const sound = this.assetLoader.getSound("lose_sound");
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => console.log("Lose sound play prevented:", e));
        }
    }

    update(deltaTime: number): void {
        switch (this.gameState) {
            case GameState.PLAYING:
                this.currentRoundTimer -= deltaTime;
                if (this.currentRoundTimer <= 0) {
                    this.processRoundEnd(null, null, true);
                }
                break;
            case GameState.ROUND_END:
                this.roundResultDisplayTimer -= deltaTime;
                if (this.roundResultDisplayTimer <= 0) {
                    if (this.lives <= 0) {
                        this.gameState = GameState.GAME_OVER;
                    } else {
                        this.startRound();
                        this.gameState = GameState.PLAYING;
                    }
                }
                break;
        }
    }

    drawLoadingScreen(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = "#333333";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.textAlign = "center";
        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.font = "30px Arial";
        this.ctx.fillText("로딩 중...", this.canvas.width / 2, this.canvas.height / 2 - 20);
        const progress = this.assetLoader.getLoadingProgress();
        this.ctx.fillText(`${Math.round(progress * 100)}%`, this.canvas.width / 2, this.canvas.height / 2 + 20);
    }

    drawTitleScreen(): void {
        const texts = this.config.texts.titleScreen;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = "#1a1a1a";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.textAlign = "center";
        this.ctx.fillStyle = texts.fontColor;

        this.ctx.font = `${texts.titleFontSize} Arial`;
        this.ctx.fillText(texts.title!, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = `${texts.subtitleFontSize} Arial`;
        this.ctx.fillText(texts.subtitle!, this.canvas.width / 2, this.canvas.height / 2 + 20);
    }

    drawInstructionsScreen(): void {
        const texts = this.config.texts.instructionsScreen;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = "#1a1a1a";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.textAlign = "center";
        this.ctx.fillStyle = texts.fontColor;

        this.ctx.font = `${texts.titleFontSize} Arial`;
        this.ctx.fillText(texts.title!, this.canvas.width / 2, this.canvas.height / 2 - 150);

        this.ctx.font = `${texts.lineFontSize} Arial`;
        this.ctx.fillText(texts.line1!, this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.fillText(texts.line2!, this.canvas.width / 2, this.canvas.height / 2 - 20);
        this.ctx.fillText(texts.line3!, this.canvas.width / 2, this.canvas.height / 2 + 10);
        this.ctx.fillText(texts.line4!, this.canvas.width / 2, this.canvas.height / 2 + 40);

        this.ctx.font = `${texts.subtitleFontSize || texts.lineFontSize} Arial`;
        this.ctx.fillText(texts.line5!, this.canvas.width / 2, this.canvas.height / 2 + 120);
    }

    drawPlayingScreen(): void {
        const texts = this.config.texts.playingScreen;
        const gameSettings = this.config.gameSettings;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = "#1a1a1a";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.centralIcon) {
            const icon = this.assetLoader.getImage(this.centralIcon);
            if (icon) {
                const x = this.canvas.width / 2 - gameSettings.centralIconSize / 2;
                const y = this.canvas.height / 3 - gameSettings.centralIconSize / 2;
                this.ctx.drawImage(icon, x, y, gameSettings.centralIconSize, gameSettings.centralIconSize);
            }
        }

        const iconNames = [RPSChoice.ROCK, RPSChoice.PAPER, RPSChoice.SCISSORS];
        const iconWidth = gameSettings.iconSize;
        const iconHeight = gameSettings.iconSize;
        const totalWidth = iconNames.length * iconWidth + (iconNames.length - 1) * gameSettings.spacing;
        let currentX = (this.canvas.width - totalWidth) / 2;
        const iconY = this.canvas.height - gameSettings.playerIconOffset - iconHeight / 2;

        this.playerChoiceRects.clear();

        for (const name of iconNames) {
            const icon = this.assetLoader.getImage(name);
            if (icon) {
                this.ctx.drawImage(icon, currentX, iconY, iconWidth, iconHeight);
                this.playerChoiceRects.set(name, { x: currentX, y: iconY, width: iconWidth, height: iconHeight });
            }
            currentX += iconWidth + gameSettings.spacing;
        }

        this.ctx.textAlign = "left";
        this.ctx.fillStyle = texts.fontColor;
        this.ctx.font = `${texts.livesFontSize} Arial`;
        this.ctx.fillText(`${texts.livesLabel}${this.lives}`, 20, 40);

        this.ctx.textAlign = "right";
        this.ctx.font = `${texts.timerFontSize} Arial`;
        this.ctx.fillText(`${texts.timerLabel}${Math.max(0, Math.ceil(this.currentRoundTimer))}`, this.canvas.width - 20, 40);
    }

    drawRoundEndScreen(): void {
        this.drawPlayingScreen();
        const texts = this.config.texts.roundResult;
        this.ctx.textAlign = "center";
        this.ctx.font = `${texts.fontSize} Arial`; // This line now correctly uses 'fontSize'

        let resultText = "";
        let resultColor = "";

        if (this.roundResult === RoundResult.WIN) {
            resultText = texts.win!;
            resultColor = texts.winColor!;
        } else if (this.roundResult === RoundResult.LOSE) {
            resultText = texts.lose!;
            resultColor = texts.loseColor!;
        } else if (this.roundResult === RoundResult.TIMEOUT) {
            resultText = texts.timeout!;
            resultColor = texts.loseColor!;
        }

        this.ctx.fillStyle = resultColor;
        this.ctx.fillText(resultText, this.canvas.width / 2, this.canvas.height / 2);
    }

    drawGameOverScreen(): void {
        const texts = this.config.texts.gameOverScreen;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = "#1a1a1a";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.textAlign = "center";
        this.ctx.fillStyle = texts.fontColor;

        this.ctx.font = `${texts.titleFontSize} Arial`;
        this.ctx.fillText(texts.title!, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = `${texts.subtitleFontSize} Arial`;
        this.ctx.fillText(texts.subtitle!, this.canvas.width / 2, this.canvas.height / 2 + 20);
    }

    drawErrorMessage(message: string): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = "#550000";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.textAlign = "center";
        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.font = "30px Arial";
        this.ctx.fillText("오류 발생!", this.canvas.width / 2, this.canvas.height / 2 - 40);
        this.ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2 + 10);
        this.ctx.font = "20px Arial";
        this.ctx.fillText("콘솔을 확인하세요.", this.canvas.width / 2, this.canvas.height / 2 + 50);
    }


    draw(): void {
        switch (this.gameState) {
            case GameState.LOADING:
                this.drawLoadingScreen();
                break;
            case GameState.TITLE:
                this.drawTitleScreen();
                break;
            case GameState.INSTRUCTIONS:
                this.drawInstructionsScreen();
                break;
            case GameState.PLAYING:
                this.drawPlayingScreen();
                break;
            case GameState.ROUND_END:
                this.drawRoundEndScreen();
                break;
            case GameState.GAME_OVER:
                this.drawGameOverScreen();
                break;
        }
    }

    loop(timestamp: number): void {
        const deltaTime = (timestamp - this.lastTimestamp) / 1000;
        this.lastTimestamp = timestamp;

        if (this.gameState !== GameState.LOADING) {
            this.update(deltaTime);
        }
        this.draw();

        requestAnimationFrame(this.loop.bind(this));
    }
}

async function main() {
    const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
    if (!canvas) {
        console.error("Canvas element with ID 'gameCanvas' not found!");
        return;
    }

    try {
        const response = await fetch("data.json");
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const config: GameConfig = await response.json();
        const game = new RPSGame(canvas, config);
        game.init();
    } catch (error) {
        console.error("Error loading game configuration or starting game:", error);
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#550000";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.textAlign = "center";
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "24px Arial";
            ctx.fillText("게임 초기화 실패: 설정 파일을 로드할 수 없습니다.", canvas.width / 2, canvas.height / 2);
        }
    }
}

main();
