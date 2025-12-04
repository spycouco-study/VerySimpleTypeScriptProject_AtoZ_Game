interface GameSettings {
    canvasWidth: number;
    canvasHeight: number;
    gridSize: number;
    snakeInitialLength: number;
    snakeSpeedMillis: number;
    foodScoreIncrement: number;
    gameDurationSeconds: number;
    backgroundColor: string;
    snakeColor: string;
    foodColor: string;
    textColor: string;
}

interface TextContent {
    title: string;
    pressAnyKey: string;
    instructionsTitle: string;
    instructionsText: string[];
    gameOver: string;
    timeUp: string;
    scorePrefix: string;
    timePrefix: string;
    restartGame: string;
}

interface ImageAsset {
    name: string;
    path: string;
    width: number;
    height: number;
    img?: HTMLImageElement;
}

interface SoundAsset {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
    audio?: HTMLAudioElement;
}

interface Assets {
    images: ImageAsset[];
    sounds: SoundAsset[];
}

interface GameData {
    gameSettings: GameSettings;
    textContent: TextContent;
    assets: Assets;
}

enum GameState {
    Title,
    Instructions,
    Playing,
    GameOver
}

class SnakeGame {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private data!: GameData;

    private currentGameState: GameState = GameState.Title;
    private lastFrameTime = 0;
    private lastSnakeMoveTime = 0;

    private snake: { x: number, y: number }[] = [];
    private food: { x: number, y: number } | null = null;
    private direction: { x: number, y: number } = { x: 1, y: 0 };
    private nextDirection: { x: number, y: number } | null = null;

    private score: number = 0;
    private timeLeft: number = 0;
    private gameStartTime: number = 0;

    private assetsLoadedCount: number = 0;
    private totalAssets: number = 0;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;

        document.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    async init() {
        try {
            const response = await fetch('data.json');
            this.data = await response.json();

            this.canvas.width = this.data.gameSettings.canvasWidth;
            this.canvas.height = this.data.gameSettings.canvasHeight;

            this.totalAssets = this.data.assets.images.length + this.data.assets.sounds.length;
            await this.loadAssets();

            this.gameLoop(0);
        } catch (error) {
            console.error('Failed to load game data or assets:', error);
        }
    }

    private async loadAssets() {
        const imagePromises = this.data.assets.images.map(asset => {
            return new Promise<void>((resolve) => {
                asset.img = new Image();
                asset.img.src = asset.path;
                asset.img.onload = () => {
                    this.assetsLoadedCount++;
                    resolve();
                };
                asset.img.onerror = () => {
                    console.error(`Failed to load image: ${asset.path}`);
                    this.assetsLoadedCount++;
                    resolve();
                };
            });
        });

        const soundPromises = this.data.assets.sounds.map(asset => {
            return new Promise<void>((resolve) => {
                asset.audio = new Audio(asset.path);
                asset.audio.oncanplaythrough = () => {
                    this.assetsLoadedCount++;
                    if (asset.audio) {
                        asset.audio.volume = asset.volume;
                    }
                    resolve();
                };
                asset.audio.onerror = () => {
                    console.error(`Failed to load audio: ${asset.path}`);
                    this.assetsLoadedCount++;
                    resolve();
                };
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log('All assets loaded.');
    }

    private getAsset<T extends 'images' | 'sounds'>(type: T, name: string): (T extends 'images' ? ImageAsset : SoundAsset) | undefined {
        return this.data.assets[type].find(asset => asset.name === name) as any;
    }

    private playSound(name: string, loop: boolean = false) {
        const sound = this.getAsset('sounds', name);
        if (sound?.audio) {
            sound.audio.currentTime = 0;
            sound.audio.loop = loop;
            sound.audio.play().catch(e => console.warn(`Audio playback failed for ${name}:`, e));
        }
    }

    private stopSound(name: string) {
        const sound = this.getAsset('sounds', name);
        if (sound?.audio) {
            sound.audio.pause();
            sound.audio.currentTime = 0;
        }
    }

    private handleKeyDown(event: KeyboardEvent) {
        switch (this.currentGameState) {
            case GameState.Title:
                this.currentGameState = GameState.Instructions;
                break;
            case GameState.Instructions:
                this.startGame();
                break;
            case GameState.Playing:
                this.updateDirection(event.key);
                break;
            case GameState.GameOver:
                this.resetGame();
                break;
        }
    }

    private updateDirection(key: string) {
        const currentDir = this.direction;
        let newDir: { x: number, y: number } | null = null;

        if (key === 'ArrowUp' && currentDir.y === 0) newDir = { x: 0, y: -1 };
        else if (key === 'ArrowDown' && currentDir.y === 0) newDir = { x: 0, y: 1 };
        else if (key === 'ArrowLeft' && currentDir.x === 0) newDir = { x: -1, y: 0 };
        else if (key === 'ArrowRight' && currentDir.x === 0) newDir = { x: 1, y: 0 };

        if (newDir) {
            this.nextDirection = newDir;
        }
    }

    private startGame() {
        this.currentGameState = GameState.Playing;
        this.score = 0;
        this.timeLeft = this.data.gameSettings.gameDurationSeconds;
        this.gameStartTime = performance.now();

        this.snake = [];
        for (let i = 0; i < this.data.gameSettings.snakeInitialLength; i++) {
            this.snake.push({
                x: Math.floor(this.canvas.width / (2 * this.data.gameSettings.gridSize)) - i,
                y: Math.floor(this.canvas.height / (2 * this.data.gameSettings.gridSize))
            });
        }
        this.direction = { x: 1, y: 0 };
        this.nextDirection = null;
        this.generateFood();

        this.playSound('bgm', true);
    }

    private resetGame() {
        this.stopSound('bgm');
        this.currentGameState = GameState.Title;
    }

    private generateFood() {
        let newFoodPos: { x: number, y: number };
        const maxGridX = this.canvas.width / this.data.gameSettings.gridSize;
        const maxGridY = this.canvas.height / this.data.gameSettings.gridSize;

        do {
            newFoodPos = {
                x: Math.floor(Math.random() * maxGridX),
                y: Math.floor(Math.random() * maxGridY)
            };
        } while (this.snake.some(segment => segment.x === newFoodPos.x && segment.y === newFoodPos.y));

        this.food = newFoodPos;
    }

    private update(deltaTime: number) {
        if (this.currentGameState === GameState.Playing) {
            const currentTime = performance.now();
            const elapsedFromGameStart = (currentTime - this.gameStartTime) / 1000;
            this.timeLeft = Math.max(0, this.data.gameSettings.gameDurationSeconds - elapsedFromGameStart);

            if (this.timeLeft <= 0) {
                this.currentGameState = GameState.GameOver;
                this.stopSound('bgm');
                this.playSound('game_over_sound');
                return;
            }

            if (currentTime - this.lastSnakeMoveTime > this.data.gameSettings.snakeSpeedMillis) {
                this.lastSnakeMoveTime = currentTime;

                if (this.nextDirection) {
                    this.direction = this.nextDirection;
                    this.nextDirection = null;
                }

                const head = { ...this.snake[0] };
                head.x += this.direction.x;
                head.y += this.direction.y;

                if (this.snake.slice(1).some(segment => segment.x === head.x && segment.y === head.y)) {
                    this.currentGameState = GameState.GameOver;
                    this.stopSound('bgm');
                    this.playSound('game_over_sound');
                    return;
                }

                const maxGridX = this.canvas.width / this.data.gameSettings.gridSize;
                const maxGridY = this.canvas.height / this.data.gameSettings.gridSize;
                if (head.x < 0 || head.x >= maxGridX || head.y < 0 || head.y >= maxGridY) {
                    this.currentGameState = GameState.GameOver;
                    this.stopSound('bgm');
                    this.playSound('game_over_sound');
                    return;
                }

                this.snake.unshift(head);

                if (this.food && head.x === this.food.x && head.y === this.food.y) {
                    this.score += this.data.gameSettings.foodScoreIncrement;
                    this.generateFood();
                    this.playSound('eat_sound');
                } else {
                    this.snake.pop();
                }
            }
        }
    }

    private draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const bgAsset = this.getAsset('images', 'background');
        if (bgAsset?.img?.complete) {
            this.ctx.drawImage(bgAsset.img, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = this.data.gameSettings.backgroundColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        switch (this.currentGameState) {
            case GameState.Title:
                this.drawTitleScreen();
                break;
            case GameState.Instructions:
                this.drawInstructionsScreen();
                break;
            case GameState.Playing:
                this.drawGamePlay();
                break;
            case GameState.GameOver:
                this.drawGameOverScreen();
                break;
        }
    }

    private drawTextCentered(text: string, y: number, fontSize: number, color: string, font: string = 'Arial') {
        this.ctx.fillStyle = color;
        this.ctx.font = `${fontSize}px ${font}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, this.canvas.width / 2, y);
    }

    private drawTitleScreen() {
        const { textContent, gameSettings } = this.data;
        this.drawTextCentered(textContent.title, this.canvas.height * 0.4, 60, gameSettings.textColor);
        this.drawTextCentered(textContent.pressAnyKey, this.canvas.height * 0.6, 30, gameSettings.textColor);
    }

    private drawInstructionsScreen() {
        const { textContent, gameSettings } = this.data;
        this.drawTextCentered(textContent.instructionsTitle, this.canvas.height * 0.2, 40, gameSettings.textColor);

        let yOffset = this.canvas.height * 0.35;
        textContent.instructionsText.forEach(line => {
            this.drawTextCentered(line, yOffset, 24, gameSettings.textColor);
            yOffset += 30;
        });

        this.drawTextCentered(textContent.pressAnyKey, this.canvas.height * 0.85, 30, gameSettings.textColor);
    }

    private drawGamePlay() {
        const { gameSettings, textContent } = this.data;
        const gridSize = gameSettings.gridSize;

        if (this.food) {
            const foodAsset = this.getAsset('images', 'food');
            if (foodAsset?.img?.complete) {
                this.ctx.drawImage(foodAsset.img, this.food.x * gridSize, this.food.y * gridSize, gridSize, gridSize);
            } else {
                this.ctx.fillStyle = gameSettings.foodColor;
                this.ctx.fillRect(this.food.x * gridSize, this.food.y * gridSize, gridSize, gridSize);
            }
        }

        this.snake.forEach((segment, index) => {
            const asset = index === 0 ? this.getAsset('images', 'snake_head') : this.getAsset('images', 'snake_body');
            if (asset?.img?.complete) {
                this.ctx.drawImage(asset.img, segment.x * gridSize, segment.y * gridSize, gridSize, gridSize);
            } else {
                this.ctx.fillStyle = gameSettings.snakeColor;
                this.ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize, gridSize);
            }
        });

        this.ctx.fillStyle = gameSettings.textColor;
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`${textContent.scorePrefix} ${this.score}`, 10, 10);
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`${textContent.timePrefix} ${Math.ceil(this.timeLeft)}`, this.canvas.width - 10, 10);
    }

    private drawGameOverScreen() {
        const { textContent, gameSettings } = this.data;
        this.drawTextCentered(textContent.gameOver, this.canvas.height * 0.3, 50, gameSettings.textColor);
        if (this.timeLeft <= 0) {
            this.drawTextCentered(textContent.timeUp, this.canvas.height * 0.4, 40, gameSettings.textColor);
        }
        this.drawTextCentered(`${textContent.scorePrefix} ${this.score}`, this.canvas.height * 0.5, 35, gameSettings.textColor);
        this.drawTextCentered(textContent.restartGame, this.canvas.height * 0.7, 28, gameSettings.textColor);
    }

    private gameLoop(currentTime: number) {
        const deltaTime = currentTime - this.lastFrameTime;
        this.lastFrameTime = currentTime;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame(this.gameLoop.bind(this));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const game = new SnakeGame('gameCanvas');
    game.init();
});
