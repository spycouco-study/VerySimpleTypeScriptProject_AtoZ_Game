enum GameState {
    TITLE,
    PLAYING,
    GAME_OVER,
}

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

interface AssetsConfig {
    images: AssetImage[];
    sounds: AssetSound[];
}

interface FontStyle {
    font: string;
    color: string;
    shadowColor?: string;
    shadowBlur?: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
}

interface UiPosition {
    x: number;
    y: number;
}

interface InputFieldConfig {
    width: number;
    height: number;
    bottomOffset: number;
}

interface LifeHeartImageConfig {
    xOffset: number;
    yOffset: number;
    width: number;
    height: number;
}

interface UiPositionsConfig {
    chosung: UiPosition;
    timer: UiPosition;
    lives: UiPosition;
    inputField: InputFieldConfig;
    titleText: UiPosition;
    titleInstruction: UiPosition;
    gameOverText: UiPosition;
    gameOverInstruction: UiPosition;
    lifeHeartImage: LifeHeartImageConfig;
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
        title: FontStyle;
        chosung: FontStyle;
        timer: FontStyle;
        lives: FontStyle;
        inputPrompt: FontStyle;
        gameOver: FontStyle;
        instruction: FontStyle;
    };
    uiPositions: UiPositionsConfig;
    assets: AssetsConfig;
}

class AssetManager {
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();

    async loadAssets(assetsConfig: AssetsConfig): Promise<void> {
        const imagePromises = assetsConfig.images.map(img => this.loadImage(img));
        const soundPromises = assetsConfig.sounds.map(snd => this.loadSound(snd));

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log("All assets loaded.");
    }

    private loadImage(imageConfig: AssetImage): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = imageConfig.path;
            img.onload = () => {
                this.images.set(imageConfig.name, img);
                resolve();
            };
            img.onerror = (e) => {
                console.error(`Failed to load image: ${imageConfig.path}`, e);
                reject(new Error(`Failed to load image: ${imageConfig.path}`));
            };
        });
    }

    private loadSound(soundConfig: AssetSound): Promise<void> {
        return new Promise((resolve, reject) => {
            const audio = new Audio(soundConfig.path);
            audio.preload = 'auto'; // Preload the audio
            audio.volume = soundConfig.volume;
            if (soundConfig.loop !== undefined) {
                audio.loop = soundConfig.loop;
            }

            // Using canplaythrough to ensure audio is ready to play without interruption
            audio.addEventListener('canplaythrough', () => {
                this.sounds.set(soundConfig.name, audio);
                resolve();
            }, { once: true });

            audio.addEventListener('error', (e) => {
                console.error(`Failed to load sound: ${soundConfig.path}`, e);
                reject(new Error(`Failed to load sound: ${soundConfig.path}`));
            });
            // Initiating load. In many cases, setting `src` already begins loading.
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

// Korean unicode ranges
const HANGUL_SYLLABLE_START = 0xAC00; // '가'
const HANGUL_SYLLABLE_END = 0xD7A3;   // '힣'

// Initial consonants (Chosung)
const CHOSUNGS = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
    'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

/**
 * 한글 단어에서 초성만을 추출합니다.
 * @param word 초성을 추출할 한글 단어
 * @returns 추출된 초성 문자열
 */
function extractWordChosungs(word: string): string {
    let chosungs = '';
    for (const char of word) {
        const charCode = char.charCodeAt(0);

        // 한글 음절 범위에 속하는지 확인
        if (charCode >= HANGUL_SYLLABLE_START && charCode <= HANGUL_SYLLABLE_END) {
            const unicodeOffset = charCode - HANGUL_SYLLABLE_START;

            // 초성, 중성, 종성 분리
            const CHOSUNG_INDEX = Math.floor(unicodeOffset / (21 * 28));

            if (CHOSUNG_INDEX >= 0 && CHOSUNG_INDEX < CHOSUNGS.length) {
                chosungs += CHOSUNGS[CHOSUNG_INDEX];
            }
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
    private usedWords: Set<string> = new Set(); // Stores words that have been *correctly entered*
    private score: number = 0;

    private availableProblemWords: string[] = []; // Stores words from config.wordList not yet presented as problems
    private validWordsSet: Set<string> = new Set(); // Added for efficient lookup of valid words

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
            transition: 'all 0.3s ease', // Smooth transitions for visual effects
        });
        document.body.appendChild(input);

        // Add focus/blur styles for visual feedback
        input.addEventListener('focus', () => {
            input.style.boxShadow = '0 0 0 0.2rem rgba(0, 123, 255, 0.25), 0 6px 15px rgba(0,0,0,0.2)';
            input.style.transform = 'scale(1.02)'; // Slight scale effect
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

            // Apply styling to the canvas element itself for a frame effect
            this.canvas.style.border = '4px solid #343a40';
            this.canvas.style.borderRadius = '10px';
            this.canvas.style.boxShadow = '0 10px 20px rgba(0,0,0,0.3)';
            this.canvas.style.display = 'block';
            this.canvas.style.margin = '50px auto'; // Centers the canvas horizontally on the page

            await this.assetManager.loadAssets(this.config.assets);
            this.initGame();
            this.gameLoop(0); // Start the game loop
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

        // Initialize and shuffle the word list for problems
        this.availableProblemWords = [...this.config.wordList];
        this.shuffleArray(this.availableProblemWords);

        // Initialize the set of valid words for quick lookup
        this.validWordsSet = new Set(this.config.wordList);

        // Position and size input field based on config
        const inputConfig = this.config.uiPositions.inputField;
        const inputWidth = inputConfig.width;
        const inputHeight = inputConfig.height;

        // Get canvas position relative to viewport
        const canvasRect = this.canvas.getBoundingClientRect();

        // Calculate input field's position relative to the canvas's actual position
        const inputLeft = canvasRect.left + (canvasRect.width - inputWidth) / 2;
        const inputTop = canvasRect.top + canvasRect.height - inputHeight - inputConfig.bottomOffset;

        Object.assign(this.inputField.style, {
            width: `${inputWidth}px`,
            height: `${inputHeight}px`,
            left: `${inputLeft}px`,
            top: `${inputTop}px`,
            lineHeight: `${inputHeight}px` // Vertically center text in input field
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
                // Only pause BGM if it's currently playing, to avoid errors on initial load
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

    // Modified drawText to support canvas shadows
    private drawText(text: string, x: number, y: number, fontConfig: { font: string; color: string; shadowColor?: string; shadowBlur?: number; shadowOffsetX?: number; shadowOffsetY?: number; }, align: CanvasTextAlign = 'center', baseline: CanvasTextBaseline = 'middle'): void {
        this.ctx.font = fontConfig.font;
        this.ctx.textAlign = align;
        this.ctx.textBaseline = baseline;

        // Apply shadow if configured
        if (fontConfig.shadowColor) {
            this.ctx.shadowColor = fontConfig.shadowColor;
            this.ctx.shadowBlur = fontConfig.shadowBlur !== undefined ? fontConfig.shadowBlur : 5;
            this.ctx.shadowOffsetX = fontConfig.shadowOffsetX !== undefined ? fontConfig.shadowOffsetX : 2;
            this.ctx.shadowOffsetY = fontConfig.shadowOffsetY !== undefined ? fontConfig.shadowOffsetY : 2;
        }

        this.ctx.fillStyle = fontConfig.color;
        this.ctx.fillText(text, x, y);

        // Reset shadow properties after drawing to prevent affecting other elements
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

    // New method to draw the game background
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
        this.drawBackground(); // Draw background first
        const { uiPositions, fontSettings } = this.config;
        this.drawText('초성 게임', uiPositions.titleText.x, uiPositions.titleText.y, fontSettings.title);
        this.drawText('아무 곳이나 클릭하여 시작하세요', uiPositions.titleInstruction.x, uiPositions.titleInstruction.y, fontSettings.instruction);
    }

    private drawPlayingScreen(): void {
        this.drawBackground(); // Draw background first
        const { uiPositions, fontSettings, initialLives } = this.config;

        // Chosung
        this.drawText(this.currentChosung, uiPositions.chosung.x, uiPositions.chosung.y, fontSettings.chosung);

        // Timer
        const timeRemaining = Math.max(0, Math.floor(this.currentRoundTime));
        this.drawText(`시간: ${timeRemaining}`, uiPositions.timer.x, uiPositions.timer.y, fontSettings.timer, 'right');

        // Lives
        const livesTextX = uiPositions.lives.x;
        const livesTextY = uiPositions.lives.y;
        
        const heartConfig = uiPositions.lifeHeartImage;
        for (let i = 0; i < initialLives; i++) {
            // Increased spacing between hearts for better visual separation
            const heartX = livesTextX + heartConfig.xOffset + (i * (heartConfig.width + 10));
            const heartY = livesTextY + heartConfig.yOffset;
            if (i < this.lives) {
                this.drawImageScaled('heart', heartX, heartY, heartConfig.width, heartConfig.height);
            }
        }
    }

    private drawGameOverScreen(): void {
        this.drawBackground(); // Draw background first
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
        // Reinitialize problem words and start a new round
        this.availableProblemWords = [...this.config.wordList];
        this.shuffleArray(this.availableProblemWords);
        this.newRound();
        this.playBGM(true);
    }

    private resetGame(): void {
        this.gameState = GameState.TITLE;
        this.initGame(); // Re-initializes all game state including word lists
        this.inputField.style.display = 'none';
        this.playBGM(false);
    }

    private newRound(): void {
        if (this.availableProblemWords.length === 0) {
            // All words used as problems, reshuffle the list for continuous play
            this.availableProblemWords = [...this.config.wordList];
            this.shuffleArray(this.availableProblemWords);
            this.usedWords.clear(); // Clear answered words as problems will now repeat
            console.log('All problem words used. Reshuffling word list and clearing used answers.');
        }

        const problemWord = this.availableProblemWords.pop(); // Get a word from the shuffled list
        if (problemWord) {
            const fullChosung = extractWordChosungs(problemWord);
            // Use config.chosungLength to determine how many characters of the chosung to display
            this.currentChosung = fullChosung.substring(0, this.config.chosungLength);
        } else {
            // This case should ideally not be reached if availableProblemWords is handled correctly
            this.currentChosung = '초성 없음'; // Fallback
            console.error('No problem word available!');
        }
        
        this.currentRoundTime = this.config.roundTimeSeconds;
    }

    private checkAnswer(word: string): void {
        if (!word) {
            this.loseLife('wrong');
            this.newRound(); // Start new round after incorrect answer
            return;
        }

        const extractedChosung = extractWordChosungs(word);

        const isChosungMatch = extractedChosung.startsWith(this.currentChosung);
        const isDuplicate = this.usedWords.has(word);
        // MODIFIED: Check if the entered word is actually present in the predefined word list
        const isValidWord = this.validWordsSet.has(word);

        if (isChosungMatch && !isDuplicate && isValidWord) { // MODIFIED CONDITION
            this.usedWords.add(word);
            this.score++;
            this.playSound('correct');
            this.newRound();
        } else {
            this.loseLife('wrong');
            this.newRound(); // Start new round after incorrect answer
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

    // Helper function to shuffle an array
    private shuffleArray<T>(array: T[]): void {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}