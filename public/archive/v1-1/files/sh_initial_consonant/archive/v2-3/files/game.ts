enum GameState {
    TITLE,
    PLAYING,
    GAME_OVER,
}

interface FontConfig {
    font: string;
    color: string;
    shadowColor?: string;
    shadowBlur?: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
}

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
    loop?: boolean;
}

interface GameConfig {
    canvasWidth: number;
    canvasHeight: number;
    backgroundColor: string;
    roundTimeSeconds: number;
    initialLives: number;
    chosungLength: number;
    wordList: string[];
    fontSettings: {
        title: FontConfig;
        chosung: FontConfig;
        timer: FontConfig;
        lives: FontConfig;
        inputPrompt: FontConfig;
        gameOver: FontConfig;
        instruction: FontConfig;
    };
    uiPositions: {
        chosung: { x: number; y: number; };
        timer: { x: number; y: number; };
        lives: { x: number; y: number; };
        inputField: { width: number; height: number; bottomOffset: number; };
        titleText: { x: number; y: number; };
        titleInstruction: { x: number; y: number; };
        gameOverText: { x: number; y: number; };
        gameOverInstruction: { x: number; y: number; };
        lifeHeartImage: { xOffset: number; yOffset: number; width: number; height: number; };
    };
    assets: {
        images: AssetImageConfig[];
        sounds: AssetSoundConfig[];
    };
}

class AssetManager {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();
    private totalAssets: number = 0;
    private loadedAssets: number = 0;

    async loadAssets(assetConfig: GameConfig['assets']): Promise<void> {
        this.totalAssets = assetConfig.images.length + assetConfig.sounds.length;
        this.loadedAssets = 0;

        const imagePromises = assetConfig.images.map(img => this.loadImage(img));
        const soundPromises = assetConfig.sounds.map(snd => this.loadSound(snd));

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log('All assets loaded.');
    }

    private loadImage(imgConfig: AssetImageConfig): Promise<void> {
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
                this.loadedAssets++;
                resolve();
            };
        });
    }

    private loadSound(sndConfig: AssetSoundConfig): Promise<void> {
        return new Promise((resolve, reject) => {
            const audio = new Audio(sndConfig.path);
            audio.volume = sndConfig.volume;
            audio.loop = sndConfig.loop || false;
            
            audio.oncanplaythrough = () => {
                this.sounds.set(sndConfig.name, audio);
                this.loadedAssets++;
                resolve();
            };
            audio.onerror = () => {
                console.error(`Failed to load sound: ${sndConfig.path}`);
                this.loadedAssets++;
                resolve();
            };
            audio.load();
        });
    }

    getImage(name: string): HTMLImageElement | undefined {
        return this.images.get(name);
    }

    getSound(name: string): HTMLAudioElement | undefined {
        return this.sounds.get(name);
    }
}

const CHOSUNG_LIST = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

function extractWordChosungs(word: string): string {
    let chosungs = '';
    for (const char of word) {
        const charCode = char.charCodeAt(0);
        if (charCode >= 0xAC00 && charCode <= 0xD7A3) { // Hangul Syllable range
            const unicode = charCode - 0xAC00;
            const chosungIndex = Math.floor(unicode / (21 * 28));
            chosungs += CHOSUNG_LIST[chosungIndex];
        } else {
            chosungs += char; 
        }
    }
    return chosungs;
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config!: GameConfig;
    private assetManager: AssetManager;
    private inputField: HTMLInputElement;
    private gameLoopRequestId: number = 0;

    private gameState: GameState = GameState.TITLE;
    private lastTime: DOMHighResTimeStamp = 0;

    private currentChosung: string = '';
    private currentRoundTime: number = 0;
    private lives: number = 0;
    private usedWords: Set<string> = new Set();
    private score: number = 0;

    private availableProblemWords: string[] = [];
    private validWords: Set<string> = new Set();

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas with ID "${canvasId}" not found.`);
        }
        this.ctx = this.canvas.getContext('2d')!;
        if (!this.ctx) {
            throw new Error('Failed to get 2D rendering context for canvas.');
        }

        this.assetManager = new AssetManager();
        this.inputField = this.createInputField();

        this.canvas.addEventListener('click', this.handleCanvasClick);
        this.inputField.addEventListener('keydown', this.handleInputKeyDown);

        this.inputField.style.display = 'none';
    }

    private createInputField(): HTMLInputElement {
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 10;
        input.placeholder = '단어를 입력하세요...';
        Object.assign(input.style, {
            position: 'absolute',
            border: 'none',
            padding: '12px 20px',
            fontSize: '28px',
            textAlign: 'center',
            backgroundColor: '#ffffff',
            color: '#343a40',
            borderRadius: '15px',
            boxShadow: '0 6px 15px rgba(0,0,0,0.2)',
            outline: 'none',
            fontFamily: "'Malgun Gothic', '맑은 고딕', sans-serif",
            transition: 'all 0.3s ease',
        });
        document.body.appendChild(input);

        input.addEventListener('focus', () => {
            input.style.boxShadow = '0 0 0 0.2rem rgba(0, 123, 255, 0.25), 0 6px 15px rgba(0,0,0,0.2)';
            input.style.transform = 'scale(1.02)';
        });
        input.addEventListener('blur', () => {
            input.style.boxShadow = '0 6px 15px rgba(0,0,0,0.2)';
            input.style.transform = 'scale(1)';
        });

        return input;
    }

    async loadGame(): Promise<void> {
        try {
            const response = await fetch('data.json');
            this.config = await response.json();

            this.canvas.width = this.config.canvasWidth;
            this.canvas.height = this.config.canvasHeight;

            this.canvas.style.border = '4px solid #343a40';
            this.canvas.style.borderRadius = '10px';
            this.canvas.style.boxShadow = '0 10px 20px rgba(0,0,0,0.3)';
            this.canvas.style.display = 'block';
            this.canvas.style.margin = '50px auto';

            await this.assetManager.loadAssets(this.config.assets);
            this.initGame();
            this.gameLoop(0);
        } catch (error) {
            console.error('Failed to load game configuration or assets:', error);
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.font = "24px Arial";
            this.ctx.fillStyle = "red";
            this.ctx.textAlign = "center";
            this.ctx.fillText("게임 로드 실패! 콘솔을 확인하세요.", this.canvas.width / 2, this.canvas.height / 2);
        }
    }

    private initGame(): void {
        this.lives = this.config.initialLives;
        this.score = 0;
        this.usedWords.clear();
        this.currentChosung = '';
        this.currentRoundTime = 0;

        this.availableProblemWords = [...this.config.wordList];
        this.shuffleArray(this.availableProblemWords);

        this.validWords = new Set(this.config.wordList);

        const inputConfig = this.config.uiPositions.inputField;
        const inputWidth = inputConfig.width;
        const inputHeight = inputConfig.height;

        const canvasRect = this.canvas.getBoundingClientRect();

        const inputLeft = canvasRect.left + (canvasRect.width - inputWidth) / 2;
        const inputTop = canvasRect.top + canvasRect.height - inputHeight - inputConfig.bottomOffset;

        Object.assign(this.inputField.style, {
            width: `${inputWidth}px`,
            height: `${inputHeight}px`,
            left: `${inputLeft}px`,
            top: `${inputTop}px`,
            lineHeight: `${inputHeight}px`
        });
    }

    private gameLoop = (timestamp: DOMHighResTimeStamp) => {
        const deltaTime = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        this.update(deltaTime);
        this.render();

        this.gameLoopRequestId = requestAnimationFrame(this.gameLoop);
    };

    private update(deltaTime: number): void {
        switch (this.gameState) {
            case GameState.PLAYING:
                this.currentRoundTime -= deltaTime;
                if (this.currentRoundTime <= 0) {
                    this.currentRoundTime = 0;
                    this.loseLife('wrong');
                    this.newRound();
                }
                break;
            case GameState.TITLE:
            case GameState.GAME_OVER:
                this.playBGM(false); 
                break;
        }
    }

    private render(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

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

    private drawText(text: string, x: number, y: number, fontConfig: { font: string; color: string; shadowColor?: string; shadowBlur?: number; shadowOffsetX?: number; shadowOffsetY?: number; }, align: CanvasTextAlign = 'center', baseline: CanvasTextBaseline = 'middle'): void {
        this.ctx.font = fontConfig.font;
        this.ctx.textAlign = align;
        this.ctx.textBaseline = baseline;

        if (fontConfig.shadowColor) {
            this.ctx.shadowColor = fontConfig.shadowColor;
            this.ctx.shadowBlur = fontConfig.shadowBlur !== undefined ? fontConfig.shadowBlur : 5;
            this.ctx.shadowOffsetX = fontConfig.shadowOffsetX !== undefined ? fontConfig.shadowOffsetX : 2;
            this.ctx.shadowOffsetY = fontConfig.shadowOffsetY !== undefined ? fontConfig.shadowOffsetY : 2;
        }

        this.ctx.fillStyle = fontConfig.color;
        this.ctx.fillText(text, x, y);

        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
    }

    private drawImageScaled(imageName: string, x: number, y: number, width: number, height: number): void {
        const img = this.assetManager.getImage(imageName);
        if (img) {
            this.ctx.drawImage(img, x, y, width, height);
        } else {
            this.ctx.fillStyle = 'gray';
            this.ctx.fillRect(x, y, width, height);
        }
    }

    private drawBackground(): void {
        const bgImage = this.assetManager.getImage('background');
        if (bgImage) {
            this.ctx.drawImage(bgImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = this.config.backgroundColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    private drawTitleScreen(): void {
        this.drawBackground();
        const { uiPositions, fontSettings } = this.config;
        this.drawText('초성 게임', uiPositions.titleText.x, uiPositions.titleText.y, fontSettings.title);
        this.drawText('아무 곳이나 클릭하여 시작하세요', uiPositions.titleInstruction.x, uiPositions.titleInstruction.y, fontSettings.instruction);
    }

    private drawPlayingScreen(): void {
        this.drawBackground();
        const { uiPositions, fontSettings, initialLives } = this.config;

        this.drawText(this.currentChosung, uiPositions.chosung.x, uiPositions.chosung.y, fontSettings.chosung);

        const timeRemaining = Math.max(0, Math.floor(this.currentRoundTime));
        this.drawText(`시간: ${timeRemaining}`, uiPositions.timer.x, uiPositions.timer.y, fontSettings.timer, 'right');

        const livesTextX = uiPositions.lives.x;
        const livesTextY = uiPositions.lives.y;
        
        const heartConfig = uiPositions.lifeHeartImage;
        for (let i = 0; i < initialLives; i++) {
            const heartX = livesTextX + heartConfig.xOffset + (i * (heartConfig.width + 10));
            const heartY = livesTextY + heartConfig.yOffset;
            if (i < this.lives) {
                this.drawImageScaled('heart', heartX, heartY, heartConfig.width, heartConfig.height);
            }
        }
    }

    private drawGameOverScreen(): void {
        this.drawBackground();
        const { uiPositions, fontSettings } = this.config;
        this.drawText('게임 오버!', uiPositions.gameOverText.x, uiPositions.gameOverText.y, fontSettings.gameOver);
        this.drawText(`점수: ${this.score} 단어`, uiPositions.gameOverText.x, uiPositions.gameOverText.y + 70, fontSettings.instruction);
        this.drawText('다시 시작하려면 아무 곳이나 클릭하세요', uiPositions.gameOverInstruction.x, uiPositions.gameOverInstruction.y + 100, fontSettings.instruction);
    }

    private handleCanvasClick = (event: MouseEvent) => {
        if (this.gameState === GameState.TITLE) {
            this.startGame();
        } else if (this.gameState === GameState.GAME_OVER) {
            this.resetGame();
        }
    };

    private handleInputKeyDown = (event: KeyboardEvent) => {
        if (this.gameState === GameState.PLAYING && event.key === 'Enter') {
            this.checkAnswer(this.inputField.value.trim());
            this.inputField.value = '';
            event.preventDefault();
        }
    };

    private playSound(name: string, loop: boolean = false): void {
        const audio = this.assetManager.getSound(name);
        if (audio) {
            audio.loop = loop;
            audio.currentTime = 0;
            audio.play().catch(e => console.warn(`Error playing sound ${name}:`, e));
        }
    }

    private playBGM(play: boolean): void {
        const bgm = this.assetManager.getSound('bgm');
        if (bgm) {
            if (play && bgm.paused) {
                bgm.loop = true;
                bgm.play().catch(e => console.warn("BGM playback failed:", e));
            } else if (!play && !bgm.paused) {
                bgm.pause();
                bgm.currentTime = 0;
            }
        }
    }

    private startGame(): void {
        this.gameState = GameState.PLAYING;
        this.lives = this.config.initialLives;
        this.score = 0;
        this.usedWords.clear();
        this.inputField.style.display = 'block';
        this.inputField.focus();
        this.availableProblemWords = [...this.config.wordList];
        this.shuffleArray(this.availableProblemWords);
        this.validWords = new Set(this.config.wordList);
        this.newRound();
        this.playBGM(true);
    }

    private resetGame(): void {
        this.gameState = GameState.TITLE;
        this.initGame();
        this.inputField.style.display = 'none';
        this.playBGM(false);
    }

    private newRound(): void {
        if (this.availableProblemWords.length === 0) {
            this.availableProblemWords = [...this.config.wordList];
            this.shuffleArray(this.availableProblemWords);
            this.usedWords.clear();
            console.log('All problem words used. Reshuffling word list and clearing used answers.');
        }

        const problemWord = this.availableProblemWords.pop();
        if (problemWord) {
            const fullChosung = extractWordChosungs(problemWord);
            this.currentChosung = fullChosung.substring(0, this.config.chosungLength);
        } else {
            this.currentChosung = '초성 없음';
            console.error('No problem word available!');
        }
        
        this.currentRoundTime = this.config.roundTimeSeconds;
    }

    private checkAnswer(word: string): void {
        if (!word) {
            this.loseLife('wrong');
            this.newRound();
            return;
        }

        const extractedChosung = extractWordChosungs(word);

        const isChosungMatch = extractedChosung.startsWith(this.currentChosung);
        const isDuplicate = this.usedWords.has(word);
        const isRealWord = this.validWords.has(word);

        if (isChosungMatch && !isDuplicate && isRealWord) {
            this.usedWords.add(word);
            this.score++;
            this.playSound('correct');
            this.newRound();
        } else {
            this.loseLife('wrong');
            this.newRound();
        }
    }

    private loseLife(soundName: string): void {
        this.lives--;
        this.playSound(soundName);
        if (this.lives <= 0) {
            this.endGame();
        }
    }

    private endGame(): void {
        this.gameState = GameState.GAME_OVER;
        this.inputField.style.display = 'none';
        this.playSound('gameOver');
        this.playBGM(false);
    }

    private shuffleArray<T>(array: T[]): void {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}