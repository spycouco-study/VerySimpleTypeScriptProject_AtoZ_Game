interface AssetImage {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface AssetSound {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
    loop?: boolean;
}

interface FontSetting {
    font: string;
    color: string;
    shadowColor?: string;
    shadowBlur?: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
}

interface UIBottomOffset {
    width: number;
    height: number;
    bottomOffset: number;
}

interface UIPosition {
    x: number;
    y: number;
}

interface LifeHeartImageConfig {
    xOffset: number;
    yOffset: number;
    width: number;
    height: number;
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
        title: FontSetting;
        chosung: FontSetting;
        timer: FontSetting;
        lives: FontSetting;
        inputPrompt: FontSetting;
        gameOver: FontSetting;
        instruction: FontSetting;
        gameWon: FontSetting; // Added for game won screen
    };
    uiPositions: {
        chosung: UIPosition;
        timer: UIPosition;
        lives: UIPosition;
        inputField: UIBottomOffset;
        titleText: UIPosition;
        titleInstruction: UIPosition;
        gameOverText: UIPosition;
        gameOverInstruction: UIPosition;
        lifeHeartImage: LifeHeartImageConfig;
    };
    assets: {
        images: AssetImage[];
        sounds: AssetSound[];
    };
}

const CHOSUNG_MAP = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
    'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

function extractWordChosungs(word: string): string {
    let chosungs = '';
    for (let i = 0; i < word.length; i++) {
        const charCode = word.charCodeAt(i);
        if (charCode >= 0xAC00 && charCode <= 0xD7A3) { // Check if it's a Korean Hangul syllable
            const HANGUL_BASE = 0xAC00;
            const CHOSUNG_INTERVAL = 588; // (21 Jungseong * 28 Jongseong)
            const chosungIndex = Math.floor((charCode - HANGUL_BASE) / CHOSUNG_INTERVAL);
            chosungs += CHOSUNG_MAP[chosungIndex];
        } else {
            chosungs += word[i];
        }
    }
    return chosungs;
}

class AssetManager {
    private images = new Map<string, HTMLImageElement>();
    private sounds = new Map<string, HTMLAudioElement>();
    private loadedCount = 0;
    private totalCount = 0;

    async loadAssets(configAssets: { images: AssetImage[]; sounds: AssetSound[] }): Promise<void> {
        this.totalCount = configAssets.images.length + configAssets.sounds.length;
        this.loadedCount = 0;

        const imagePromises = configAssets.images.map(asset => this.loadImage(asset));
        const soundPromises = configAssets.sounds.map(asset => this.loadSound(asset));

        await Promise.allSettled([...imagePromises, ...soundPromises]);
        console.log('All assets load attempts complete.');
    }

    private loadImage(asset: AssetImage): Promise<void> {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                this.images.set(asset.name, img);
                this.loadedCount++;
                resolve();
            };
            img.onerror = () => {
                console.warn(`Failed to load image: ${asset.path}`);
                this.loadedCount++;
                resolve();
            };
            img.src = asset.path;
        });
    }

    private loadSound(asset: AssetSound): Promise<void> {
        return new Promise((resolve) => {
            const audio = new Audio();
            audio.oncanplaythrough = () => {
                this.sounds.set(asset.name, audio);
                audio.volume = asset.volume;
                audio.loop = asset.loop || false; // Set loop property on the original Audio element
                this.loadedCount++;
                resolve();
            };
            audio.onerror = () => {
                console.warn(`Failed to load sound: ${asset.path}`);
                this.loadedCount++;
                resolve();
            };
            audio.src = asset.path;
            audio.load();
        });
    }

    getImage(name: string): HTMLImageElement | undefined {
        return this.images.get(name);
    }

    getSound(name: string): HTMLAudioElement | undefined {
        const original = this.sounds.get(name);
        if (original) {
            if (original.loop) {
                return original;
            } else {
                const clone = original.cloneNode(true) as HTMLAudioElement;
                clone.volume = original.volume;
                clone.loop = original.loop;
                return clone;
            }
        }
        return undefined;
    }
}

enum GameState {
    TITLE,
    PLAYING,
    GAME_OVER, // Player lost all lives
    GAME_WON   // Player guessed all unique words
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
    private usedWords: Set<string> = new Set(); // Words correctly submitted by player
    private score: number = 0;

    private availableProblemWords: string[] = []; // Words available to be presented as chosung problems
    private validWordsSet: Set<string> = new Set(); // All words from config.wordList for quick lookup

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

        // Initialize available problem words with all words from the config
        this.availableProblemWords = [...this.config.wordList];
        this.shuffleArray(this.availableProblemWords);

        // Initialize set for quick validity checks and win condition
        this.validWordsSet = new Set(this.config.wordList);

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
            case GameState.GAME_WON: // Added GAME_WON
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
            case GameState.GAME_WON: // Added GAME_WON render
                this.drawGameWonScreen();
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
        // Display score or words remaining if needed
        this.drawText(`점수: ${this.score} (${this.usedWords.size}/${this.validWordsSet.size})`, livesTextX, livesTextY + 60, fontSettings.instruction, 'left');
    }

    private drawGameOverScreen(): void {
        this.drawBackground();
        const { uiPositions, fontSettings } = this.config;
        this.drawText('게임 오버!', uiPositions.gameOverText.x, uiPositions.gameOverText.y, fontSettings.gameOver);
        this.drawText(`최종 점수: ${this.score} 단어`, uiPositions.gameOverText.x, uiPositions.gameOverText.y + 70, fontSettings.instruction);
        this.drawText('다시 시작하려면 아무 곳이나 클릭하세요', uiPositions.gameOverInstruction.x, uiPositions.gameOverInstruction.y + 100, fontSettings.instruction);
    }

    private drawGameWonScreen(): void {
        this.drawBackground();
        const { uiPositions, fontSettings } = this.config;
        this.drawText('축하합니다!', uiPositions.gameOverText.x, uiPositions.gameOverText.y - 40, fontSettings.gameWon);
        this.drawText('모든 단어를 맞췄습니다!', uiPositions.gameOverText.x, uiPositions.gameOverText.y + 20, fontSettings.instruction);
        this.drawText(`최종 점수: ${this.score} 단어`, uiPositions.gameOverText.x, uiPositions.gameOverText.y + 90, fontSettings.instruction);
        this.drawText('다시 시작하려면 아무 곳이나 클릭하세요', uiPositions.gameOverInstruction.x, uiPositions.gameOverInstruction.y + 150, fontSettings.instruction);
    }

    private handleCanvasClick = (event: MouseEvent) => {
        if (this.gameState === GameState.TITLE) {
            this.startGame();
        } else if (this.gameState === GameState.GAME_OVER || this.gameState === GameState.GAME_WON) { // Modified to include GAME_WON
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

    private playSound(name: string): void {
        const audio = this.assetManager.getSound(name);
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.warn(`Error playing sound ${name}:`, e));
        }
    }

    private playBGM(play: boolean): void {
        const bgm = this.assetManager.getSound('bgm');
        if (bgm) {
            if (play) {
                if (bgm.paused) {
                    bgm.play().catch(e => console.warn("BGM playback failed:", e));
                }
            } else {
                if (!bgm.paused) {
                    bgm.pause();
                    bgm.currentTime = 0;
                }
            }
        }
    }

    private startGame(): void {
        this.gameState = GameState.PLAYING;
        this.lives = this.config.initialLives;
        this.score = 0;
        this.usedWords.clear(); // Clear used words for a new game
        this.inputField.style.display = 'block';
        this.inputField.focus();
        this.availableProblemWords = [...this.config.wordList];
        this.shuffleArray(this.availableProblemWords);
        this.newRound();
        this.playBGM(true);
    }

    private resetGame(): void {
        this.gameState = GameState.TITLE;
        this.initGame(); // Re-initialize game state including clearing usedWords
        this.inputField.style.display = 'none';
        this.playBGM(false);
    }

    private newRound(): void {
        if (this.availableProblemWords.length === 0) {
            // All words have been presented as *problems*. Re-shuffle for more rounds.
            this.availableProblemWords = [...this.config.wordList];
            this.shuffleArray(this.availableProblemWords);
            // IMPORTANT CHANGE: Do NOT clear `this.usedWords` here.
            // `usedWords` tracks all unique words answered by the player across the entire game session.
            console.log('All problem words used as problems once. Reshuffling word list for new problems.');
        }

        const problemWord = this.availableProblemWords.pop(); // Pop to ensure problems don't immediately repeat
        if (problemWord) {
            const fullChosung = extractWordChosungs(problemWord);
            this.currentChosung = fullChosung.substring(0, this.config.chosungLength);
        } else {
            // This case should ideally not happen if availableProblemWords is always re-populated
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

        const isValidWord = this.validWordsSet.has(word);
        if (!isValidWord) {
            this.loseLife('wrong');
            this.newRound();
            return;
        }

        const extractedChosung = extractWordChosungs(word);

        const isChosungMatch = extractedChosung.startsWith(this.currentChosung);
        const isDuplicate = this.usedWords.has(word); // Check if this specific word was already successfully answered

        if (isChosungMatch && !isDuplicate) {
            this.usedWords.add(word);
            this.score++;
            this.playSound('correct');
            
            // Check for win condition after a successful answer
            if (this.usedWords.size === this.validWordsSet.size) {
                this.endGame(true); // Player won!
                return; // Game has ended, no need for newRound
            }

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
            this.endGame(false); // Player lost
        }
    }

    // Modified endGame to accept a `won` parameter
    private endGame(won: boolean = false): void {
        this.gameState = won ? GameState.GAME_WON : GameState.GAME_OVER;
        this.inputField.style.display = 'none';
        this.playSound(won ? 'gameWin' : 'gameOver'); // Play specific win/lose sound
        this.playBGM(false);
    }

    private shuffleArray<T>(array: T[]): void {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const game = new Game('gameCanvas');
    game.loadGame();
});