// No longer need to import setInterval from "timers" as it's a browser global or not used
// import { setInterval } from "timers"; 

// Interfaces for data.json configuration
interface Asset {
    name: string;
    path: string;
    width?: number;
    height?: number;
    duration_seconds?: number;
    volume?: number;
}

interface GameConfig {
    canvasWidth: number;
    canvasHeight: number;
    backgroundColor: string;
    timerDurationSeconds: number;
    initialLives: number;
    lifeIconWidth: number;
    lifeIconHeight: number;
    consonants: string[];
    assets: {
        images: Asset[];
        sounds: Asset[];
    };
    ui: {
        titleText: string;
        startPrompt: string;
        gameOverText: string;
        finalScoreText: string;
        restartPrompt: string;
        초성Font: string;
        timerFont: string;
        livesFont: string;
        scoreFont: string;
        defaultFont: string;
        timerCriticalColor: string;
        defaultTextColor: string;
        gameOverTextColor: string;
        초성Color: string;
    };
}

// Game class
export class 초성Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config: GameConfig | null = null;

    private gameState: 'TITLE' | 'PLAYING' | 'GAME_OVER' = 'TITLE';

    // Game variables
    private lives: number = 0;
    private current초성: string = '';
    private timeLeft: number = 0;
    private score: number = 0;
    private enteredWords: Set<string> = new Set();
    private inputElement: HTMLInputElement;

    // Asset management
    private images: Map<string, HTMLImageElement> = new Map();
    private sounds: Map<string, HTMLAudioElement> = new Map();

    // Animation frame and timing
    private lastFrameTime: DOMHighResTimeStamp = 0;

    /**
     * Initializes the 초성Game.
     * @param canvasId The ID of the HTML canvas element.
     * @param inputId The ID of the HTML input element for word entry.
     */
    constructor(canvasId: string, inputId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.inputElement = document.getElementById(inputId) as HTMLInputElement;

        if (!this.canvas) {
            console.error(`Canvas element with ID '${canvasId}' not found.`);
            return;
        }
        if (!this.ctx) {
            console.error("Failed to get 2D rendering context for canvas.");
            return;
        }
        if (!this.inputElement) {
            console.error(`Input element with ID '${inputId}' not found.`);
            return;
        }

        this.inputElement.addEventListener('keydown', this.handleInputKeydown);
        this.canvas.addEventListener('click', this.handleCanvasClick);

        // Hide input initially
        this.inputElement.style.display = 'none';

        this.loadGameData().then(() => {
            if (this.config) {
                this.canvas.width = this.config.canvasWidth;
                this.canvas.height = this.config.canvasHeight;
            }
            return this.loadAssets();
        }).then(() => {
            console.log("Game initialized and assets loaded.");
            this.gameLoop(0); // Start the game loop after loading everything
        }).catch(e => console.error("Error during game initialization:", e));

        window.addEventListener('resize', this.resizeCanvas); // Basic responsiveness
    }

    private resizeCanvas = (): void => {
        if (this.config) {
            // In this specific game, canvas size is fixed by config, so resize just redraws.
            // For truly responsive games, this would adjust canvas dimensions based on window.
            this.canvas.width = this.config.canvasWidth;
            this.canvas.height = this.config.canvasHeight;
            this.draw(); // Redraw on resize
        }
    }

    /**
     * Loads game configuration from data.json.
     */
    private async loadGameData(): Promise<void> {
        try {
            const response = await fetch('data.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.config = await response.json() as GameConfig;
            console.log("Game config loaded:", this.config);
        } catch (error) {
            console.error("Failed to load game data:", error);
            throw error;
        }
    }

    /**
     * Loads all image and sound assets specified in the configuration.
     */
    private async loadAssets(): Promise<void> {
        if (!this.config) {
            throw new Error("Game config not loaded, cannot load assets.");
        }

        const imagePromises = this.config.assets.images.map(asset => {
            return new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.src = asset.path;
                img.onload = () => {
                    this.images.set(asset.name, img);
                    resolve();
                };
                img.onerror = () => reject(new Error(`Failed to load image: ${asset.path}`));
            });
        });

        const soundPromises = this.config.assets.sounds.map(asset => {
            return new Promise<void>((resolve, reject) => {
                const audio = new Audio(asset.path);
                audio.oncanplaythrough = () => { // Ensures audio data is buffered enough to play
                    this.sounds.set(asset.name, audio);
                    if (asset.volume !== undefined) {
                        audio.volume = asset.volume;
                    }
                    resolve();
                };
                audio.onerror = () => reject(new Error(`Failed to load sound: ${asset.path}`));
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log("All assets loaded.");
    }

    /**
     * Plays a sound asset.
     * @param name The name of the sound asset.
     * @param loop Whether the sound should loop.
     */
    private playSound(name: string, loop: boolean = false): void {
        const audio = this.sounds.get(name);
        if (audio) {
            audio.currentTime = 0; // Reset to start for instant replay
            audio.loop = loop;
            audio.play().catch(e => console.warn(`Failed to play sound ${name}:`, e));
        }
    }

    /**
     * Stops a playing sound asset.
     * @param name The name of the sound asset.
     */
    private stopSound(name: string): void {
        const audio = this.sounds.get(name);
        if (audio) {
            audio.pause();
            audio.currentTime = 0; // Reset for next play
        }
    }

    /**
     * Starts the game, transitioning from the title screen to playing state.
     */
    private startGame(): void {
        if (!this.config) return;

        this.gameState = 'PLAYING';
        this.lives = this.config.initialLives;
        this.score = 0;
        this.enteredWords.clear();
        this.inputElement.value = '';
        this.inputElement.style.display = 'block';
        this.inputElement.focus(); // Focus the input field for immediate typing
        this.generateNewProblem();
        this.playSound('bgm', true); // Play background music
    }

    /**
     * Generates a new 초성 problem.
     * Selects two random consonants and resets the timer.
     */
    private generateNewProblem(): void {
        if (!this.config) return;

        const 초성Array = this.config.consonants;
        const c1 = 초성Array[Math.floor(Math.random() * 초성Array.length)];
        const c2 = 초성Array[Math.floor(Math.random() * 초성Array.length)];
        this.current초성 = c1 + c2;
        this.timeLeft = this.config.timerDurationSeconds;
        this.inputElement.value = ''; // Clear input for new problem
        this.inputElement.focus(); // Re-focus after generating new problem
    }

    /**
     * Checks if the entered word is valid: matches 초성 and is not a duplicate.
     * @param word The word entered by the user.
     * @returns true if the word is valid, false otherwise.
     */
    private checkWord(word: string): boolean {
        if (!this.config) return false;

        const trimmedWord = word.trim();
        if (trimmedWord.length < 2) return false; // Minimum 2 chars for 2 초성

        // Check for duplicates
        if (this.enteredWords.has(trimmedWord)) {
            console.log(`Duplicate word entered: ${trimmedWord}`);
            return false;
        }

        const extracted초성 = this.getKoreanInitialConsonants(trimmedWord);
        const isValid = extracted초성 === this.current초성;

        if (isValid) {
            this.enteredWords.add(trimmedWord); // Add to set only if valid
        }
        return isValid;
    }

    /**
     * Extracts the initial consonants (초성) from a Korean word.
     * Only the first two syllables' 초성 are extracted, as per game rules.
     * @param word The Korean word string.
     * @returns A string of initial consonants (e.g., "ㅅㄱ" for "사과").
     */
    private getKoreanInitialConsonants(word: string): string {
        if (!this.config) return '';

        let result = '';
        const 초성_리스트 = this.config.consonants; // Same list as configured

        for (let i = 0; i < word.length; i++) {
            const charCode = word.charCodeAt(i);

            // Check if it's a Korean Hangul syllable (AC00-D7A3)
            if (charCode >= 0xAC00 && charCode <= 0xD7A3) {
                const uni = charCode - 0xAC00;
                const 초성_인덱스 = Math.floor(uni / 28 / 21); // Formula to get 초성 index
                result += 초성_리스트[초성_인덱스];
            }
            // Stop after extracting 2 initial consonants
            if (result.length >= 2) break;
        }
        return result.substring(0, 2); // Ensure we return exactly two (or fewer if word is too short)
    }

    /**
     * Handles keyboard input, specifically the 'Enter' key for word submission.
     */
    private handleInputKeydown = (event: KeyboardEvent): void => {
        if (event.key === 'Enter' && this.gameState === 'PLAYING') {
            const word = this.inputElement.value.trim();
            if (word) {
                if (this.checkWord(word)) {
                    this.score++;
                    this.playSound('correct');
                    this.generateNewProblem();
                } else {
                    this.loseLife();
                    this.playSound('incorrect');
                }
            }
        }
    }

    /**
     * Handles clicks on the canvas for game state transitions (start/restart).
     */
    private handleCanvasClick = (): void => {
        if (this.gameState === 'TITLE') {
            this.startGame();
        } else if (this.gameState === 'GAME_OVER') {
            this.gameState = 'TITLE'; // Go back to title screen from game over
            this.inputElement.style.display = 'none'; // Hide input
        }
    }

    /**
     * Decrements a life. If lives reach 0, triggers game over.
     */
    private loseLife(): void {
        this.lives--;
        if (this.lives <= 0) {
            this.gameOver();
        } else {
            this.generateNewProblem(); // New problem after losing a life
        }
    }

    /**
     * Transitions the game to the 'GAME_OVER' state.
     */
    private gameOver(): void {
        this.gameState = 'GAME_OVER';
        this.stopSound('bgm');
        this.playSound('gameover');
        this.inputElement.style.display = 'none'; // Hide input field
    }

    /**
     * Updates game logic based on the time elapsed since the last frame.
     * @param deltaTime The time difference in seconds.
     */
    private update(deltaTime: number): void {
        if (!this.config) return;

        if (this.gameState === 'PLAYING') {
            this.timeLeft -= deltaTime;
            if (this.timeLeft <= 0) {
                this.timeLeft = 0;
                this.loseLife(); // Time out, lose a life
                this.playSound('timeout');
            }
        }
    }

    /**
     * Draws all game elements on the canvas based on the current game state.
     */
    private draw(): void {
        if (!this.config) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background image or solid color
        const bgImg = this.images.get('background');
        if (bgImg) {
            this.ctx.drawImage(bgImg, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = this.config.backgroundColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = this.config.ui.defaultTextColor;

        switch (this.gameState) {
            case 'TITLE':
                this.drawTitleScreen();
                break;
            case 'PLAYING':
                this.drawPlayingScreen();
                break;
            case 'GAME_OVER':
                this.drawGameOverScreen();
                break;
        }
    }

    /**
     * Draws the title screen.
     */
    private drawTitleScreen(): void {
        if (!this.config) return;
        this.ctx.font = this.config.ui.초성Font;
        this.ctx.fillText(this.config.ui.titleText, this.canvas.width / 2, this.canvas.height / 3);
        this.ctx.font = this.config.ui.defaultFont;
        this.ctx.fillText(this.config.ui.startPrompt, this.canvas.width / 2, this.canvas.height / 2);
    }

    /**
     * Draws the main playing screen elements.
     */
    private drawPlayingScreen(): void {
        if (!this.config) return;

        // 초성 display (Top Center)
        this.ctx.font = this.config.ui.초성Font;
        this.ctx.fillStyle = this.config.ui.초성Color;
        this.ctx.fillText(this.current초성, this.canvas.width / 2, 100);

        // Timer (Top Right)
        this.ctx.font = this.config.ui.timerFont;
        this.ctx.fillStyle = this.timeLeft <= 5 ? this.config.ui.timerCriticalColor : this.config.ui.defaultTextColor;
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`시간: ${Math.ceil(this.timeLeft)}s`, this.canvas.width - 20, 50);

        // Lives (Top Left)
        this.ctx.textAlign = 'left';
        const lifeIcon = this.images.get('life_icon');
        if (lifeIcon) {
            for (let i = 0; i < this.lives; i++) {
                this.ctx.drawImage(lifeIcon, 20 + i * (this.config.lifeIconWidth + 5), 20, this.config.lifeIconWidth, this.config.lifeIconHeight);
            }
        } else {
            this.ctx.font = this.config.ui.livesFont;
            this.ctx.fillStyle = this.config.ui.defaultTextColor;
            this.ctx.fillText(`목숨: ${this.lives}`, 20, 50);
        }

        // Score
        this.ctx.font = this.config.ui.scoreFont;
        this.ctx.fillStyle = this.config.ui.defaultTextColor;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`점수: ${this.score}`, this.canvas.width / 2, this.canvas.height - 100);
    }

    /**
     * Draws the game over screen.
     */
    private drawGameOverScreen(): void {
        if (!this.config) return;
        this.ctx.font = this.config.ui.초성Font;
        this.ctx.fillStyle = this.config.ui.gameOverTextColor;
        this.ctx.fillText(this.config.ui.gameOverText, this.canvas.width / 2, this.canvas.height / 3);
        this.ctx.font = this.config.ui.timerFont;
        this.ctx.fillStyle = this.config.ui.defaultTextColor;
        this.ctx.fillText(`${this.config.ui.finalScoreText} ${this.score}`, this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.font = this.config.ui.defaultFont;
        this.ctx.fillText(this.config.ui.restartPrompt, this.canvas.width / 2, this.canvas.height * 2 / 3);
    }

    /**
     * The main game loop, responsible for updating game state and redrawing.
     * @param timestamp The current time provided by requestAnimationFrame.
     */
    private gameLoop = (timestamp: DOMHighResTimeStamp): void => {
        if (this.config === null) {
            // If config is not loaded, just keep requesting frames until it is.
            requestAnimationFrame(this.gameLoop);
            return;
        }

        const deltaTime = (timestamp - this.lastFrameTime) / 1000; // Convert to seconds
        this.lastFrameTime = timestamp;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame(this.gameLoop);
    }
}