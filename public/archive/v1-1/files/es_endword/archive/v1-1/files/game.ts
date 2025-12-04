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

interface GameConfig {
    canvasWidth: number;
    canvasHeight: number;
    titleScreenText: string;
    startPromptText: string;
    gameOverText: string;
    restartPromptText: string;
    fontFamily: string;
    textColor: string;
    backgroundColor: string;
    inputBoxColor: string;
    inputTextColor: string;
    errorTextColor: string;
    correctTextColor: string;
    wordList: string[];
    initialWord: string;
    assets: AssetsConfig;
}

enum GameState {
    TITLE,
    PLAYING,
    GAME_OVER,
}

class AssetManager {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private loadedCount: number = 0;
    private totalAssets: number = 0;

    async load(assetsConfig: AssetsConfig): Promise<void> {
        this.totalAssets = assetsConfig.images.length + assetsConfig.sounds.length;
        if (this.totalAssets === 0) {
            return Promise.resolve();
        }

        const imagePromises = assetsConfig.images.map(img => this.loadImage(img));
        const soundPromises = assetsConfig.sounds.map(snd => this.loadSound(snd));

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log("All assets loaded.");
    }

    private loadImage(asset: ImageAsset): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.images.set(asset.name, img);
                this.loadedCount++;
                resolve();
            };
            img.onerror = (e) => {
                console.error(`Failed to load image: ${asset.path}`, e);
                reject(e);
            };
            img.src = asset.path;
        });
    }

    private loadSound(asset: SoundAsset): Promise<void> {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.oncanplaythrough = () => {
                this.sounds.set(asset.name, audio);
                audio.volume = asset.volume;
                this.loadedCount++;
                resolve();
            };
            audio.onerror = (e) => {
                console.error(`Failed to load sound: ${asset.path}`, e);
                reject(e);
            };
            audio.src = asset.path;
            audio.load(); // Request to load the audio
        });
    }

    getImage(name: string): HTMLImageElement | undefined {
        return this.images.get(name);
    }

    getSound(name: string): HTMLAudioElement | undefined {
        return this.sounds.get(name);
    }

    getLoadingProgress(): number {
        return this.totalAssets > 0 ? this.loadedCount / this.totalAssets : 1;
    }
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config!: GameConfig;
    private assetManager: AssetManager = new AssetManager();
    private gameState: GameState = GameState.TITLE;
    private lastTime: number = 0;
    private currentWord: string = "";
    private userInput: string = "";
    private usedWords: Set<string> = new Set();
    private score: number = 0;
    private errorMessage: string = "";
    private errorMessageTimer: number = 0;
    private readonly ERROR_MESSAGE_DURATION = 2000; // 2 seconds
    private bgmAudio: HTMLAudioElement | undefined;
    private loadingComplete: boolean = false;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas element with ID '${canvasId}' not found.`);
        }
        this.ctx = this.canvas.getContext('2d')!;

        this.init();
    }

    private async init() {
        await this.loadConfig();
        this.canvas.width = this.config.canvasWidth;
        this.canvas.height = this.config.canvasHeight;
        this.setupEventListeners();
        await this.assetManager.load(this.config.assets);
        this.loadingComplete = true;
        this.bgmAudio = this.assetManager.getSound('bgm');
        if (this.bgmAudio) {
            this.bgmAudio.loop = true;
            this.bgmAudio.volume = this.config.assets.sounds.find(s => s.name === 'bgm')?.volume || 0.5;
        }
        this.resetGame();
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private async loadConfig(): Promise<void> {
        try {
            const response = await fetch('data.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.config = await response.json();
            console.log("Configuration loaded:", this.config);
        } catch (error) {
            console.error("Failed to load game configuration:", error);
            throw error;
        }
    }

    private setupEventListeners() {
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        this.canvas.addEventListener('click', this.handleClick.bind(this));
    }

    private resetGame() {
        this.currentWord = this.config.initialWord;
        this.userInput = "";
        this.usedWords = new Set();
        this.usedWords.add(this.config.initialWord.toLowerCase());
        this.score = 0;
        this.errorMessage = "";
        this.errorMessageTimer = 0;
    }

    private startGame() {
        this.gameState = GameState.PLAYING;
        if (this.bgmAudio) {
            this.bgmAudio.play().catch(e => console.warn("BGM playback failed:", e));
        }
    }

    private gameLoop(timestamp: number) {
        if (!this.lastTime) this.lastTime = timestamp;
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private update(deltaTime: number) {
        if (!this.loadingComplete) return;

        if (this.errorMessageTimer > 0) {
            this.errorMessageTimer -= deltaTime;
            if (this.errorMessageTimer <= 0) {
                this.errorMessage = "";
            }
        }
    }

    private render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const background = this.assetManager.getImage('background');
        if (background) {
            this.ctx.drawImage(background, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = this.config.backgroundColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        if (!this.loadingComplete) {
            this.drawLoadingScreen();
            return;
        }

        this.ctx.fillStyle = this.config.textColor;
        this.ctx.font = `30px ${this.config.fontFamily}`;
        this.ctx.textAlign = 'center';

        switch (this.gameState) {
            case GameState.TITLE:
                this.drawTitleScreen();
                break;
            case GameState.PLAYING:
                this.drawPlayingScreen();
                break;
            case GameState.GAME_OVER:
                this.drawGameOverScreen();
                break;
        }
    }

    private drawLoadingScreen() {
        this.ctx.fillStyle = this.config.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.config.textColor;
        this.ctx.font = `40px ${this.config.fontFamily}`;
        this.ctx.fillText("로딩 중...", this.canvas.width / 2, this.canvas.height / 2 - 50);
        const progress = this.assetManager.getLoadingProgress();
        this.ctx.fillText(`${Math.round(progress * 100)}%`, this.canvas.width / 2, this.canvas.height / 2 + 50);
    }

    private drawTitleScreen() {
        this.ctx.font = `50px ${this.config.fontFamily}`;
        this.ctx.fillText(this.config.titleScreenText, this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.font = `25px ${this.config.fontFamily}`;
        this.ctx.fillText(this.config.startPromptText, this.canvas.width / 2, this.canvas.height / 2 + 50);
    }

    private drawPlayingScreen() {
        this.ctx.textAlign = 'left';
        this.ctx.font = `20px ${this.config.fontFamily}`;
        this.ctx.fillText(`점수: ${this.score}`, 50, 50);

        this.ctx.textAlign = 'center';
        this.ctx.font = `40px ${this.config.fontFamily}`;
        this.ctx.fillText(`현재 단어: ${this.currentWord}`, this.canvas.width / 2, this.canvas.height / 2 - 80);

        const inputBoxWidth = 400;
        const inputBoxHeight = 60;
        const inputBoxX = (this.canvas.width - inputBoxWidth) / 2;
        const inputBoxY = this.canvas.height / 2 + 20;

        this.ctx.fillStyle = this.config.inputBoxColor;
        this.ctx.fillRect(inputBoxX, inputBoxY, inputBoxWidth, inputBoxHeight);
        this.ctx.strokeStyle = this.config.textColor;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(inputBoxX, inputBoxY, inputBoxWidth, inputBoxHeight);

        this.ctx.fillStyle = this.config.inputTextColor;
        this.ctx.font = `30px ${this.config.fontFamily}`;
        this.ctx.textAlign = 'left';
        this.ctx.fillText(this.userInput, inputBoxX + 10, inputBoxY + inputBoxHeight / 2 + 10);

        if (this.errorMessage) {
            this.ctx.fillStyle = this.config.errorTextColor;
            this.ctx.font = `25px ${this.config.fontFamily}`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText(this.errorMessage, this.canvas.width / 2, inputBoxY + inputBoxHeight + 50);
        }
    }

    private drawGameOverScreen() {
        this.ctx.font = `50px ${this.config.fontFamily}`;
        this.ctx.fillText(this.config.gameOverText + this.score, this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.font = `25px ${this.config.fontFamily}`;
        this.ctx.fillText(this.config.restartPromptText, this.canvas.width / 2, this.canvas.height / 2 + 50);
    }

    private handleKeyDown(event: KeyboardEvent) {
        if (!this.loadingComplete) return;

        if (this.gameState === GameState.PLAYING) {
            const key = event.key;
            // Allow Korean, English, numbers
            if (key.length === 1 && (/[ㄱ-힣]/.test(key) || /[a-zA-Z0-9]/.test(key))) { 
                this.userInput += key;
            } else if (key === 'Backspace') {
                this.userInput = this.userInput.slice(0, -1);
            } else if (key === 'Enter') {
                this.submitWord();
            }
        }
    }

    private handleClick() {
        if (!this.loadingComplete) return;

        if (this.gameState === GameState.TITLE) {
            this.startGame();
        } else if (this.gameState === GameState.GAME_OVER) {
            this.resetGame();
            this.gameState = GameState.TITLE;
            if (this.bgmAudio) {
                this.bgmAudio.pause();
                this.bgmAudio.currentTime = 0;
            }
        }
    }

    private submitWord() {
        const trimmedInput = this.userInput.trim();
        if (trimmedInput.length === 0) {
            this.showError("단어를 입력하세요!");
            return;
        }

        const lastCharOfCurrentWord = this.currentWord.charAt(this.currentWord.length - 1);
        const firstCharOfInput = trimmedInput.charAt(0);

        if (firstCharOfInput !== lastCharOfCurrentWord) {
            this.showError(`'${lastCharOfCurrentWord}'(으)로 시작해야 합니다!`);
            this.playIncorrectSound();
            this.gameState = GameState.GAME_OVER;
            return;
        }

        // Convert word list to a Set for faster lookup and normalize to lowercase
        const wordListSet = new Set(this.config.wordList.map(word => word.toLowerCase()));

        if (!wordListSet.has(trimmedInput.toLowerCase())) {
            this.showError("사전에 없는 단어입니다!");
            this.playIncorrectSound();
            this.gameState = GameState.GAME_OVER;
            return;
        }

        if (this.usedWords.has(trimmedInput.toLowerCase())) {
            this.showError("이미 사용한 단어입니다!");
            this.playIncorrectSound();
            this.gameState = GameState.GAME_OVER;
            return;
        }

        this.playCorrectSound();
        this.currentWord = trimmedInput;
        this.usedWords.add(trimmedInput.toLowerCase());
        this.score++;
        this.userInput = "";
        this.errorMessage = "";
    }

    private showError(message: string) {
        this.errorMessage = message;
        this.errorMessageTimer = this.ERROR_MESSAGE_DURATION;
    }

    private playSound(name: string) {
        const sound = this.assetManager.getSound(name);
        if (sound) {
            const clone = sound.cloneNode() as HTMLAudioElement;
            clone.volume = sound.volume;
            clone.play().catch(e => console.warn(`Sound playback failed for ${name}:`, e));
        }
    }

    private playCorrectSound() {
        this.playSound('correct');
    }

    private playIncorrectSound() {
        this.playSound('incorrect');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        new Game('gameCanvas');
    } catch (e) {
        console.error("Failed to initialize game:", e);
        const body = document.body;
        if (body) {
            body.innerHTML = '<p style="color:red; text-align:center;">게임 초기화에 실패했습니다. 콘솔을 확인해주세요.</p>';
        }
    }
});