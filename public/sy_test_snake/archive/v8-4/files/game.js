"use strict";
class AssetLoader {
    constructor() {
        this.images = new Map();
        this.sounds = new Map();
        this.config = null;
    }
    async loadConfig(configPath) {
        const response = await fetch(configPath);
        if (!response.ok) {
            throw new Error(`Failed to fetch config: ${response.statusText}`);
        }
        const loadedConfig = await response.json(); // Assign to a typed local variable
        this.config = loadedConfig; // Then assign to the class property
        return loadedConfig; // Return the typed local variable to match Promise<GameConfig>
    }
    async loadAssets() {
        if (!this.config) {
            throw new Error('Config not loaded. Call loadConfig first.');
        }
        const imagePromises = this.config.assets.images.map(asset => this.loadImage(asset));
        const soundPromises = this.config.assets.sounds.map(asset => this.loadSound(asset));
        await Promise.all([...imagePromises, ...soundPromises]);
        console.log('All assets loaded.');
    }
    loadImage(asset) {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = asset.path;
            img.onload = () => {
                this.images.set(asset.name, img);
                resolve();
            };
            img.onerror = () => {
                console.warn(`Failed to load image: ${asset.path}. Falling back to color rendering if applicable.`);
                resolve(); // Resolve to allow other assets to load even if one fails
            };
        });
    }
    loadSound(asset) {
        return new Promise((resolve) => {
            const audio = new Audio();
            audio.src = asset.path;
            audio.volume = asset.volume;
            audio.preload = 'auto'; // Preload to ensure it's ready
            audio.load();
            audio.oncanplaythrough = () => {
                this.sounds.set(asset.name, audio);
                resolve();
            };
            audio.onerror = () => {
                console.warn(`Failed to load sound: ${asset.path}. Sound will not play.`);
                resolve(); // Resolve to allow other assets to load
            };
            // Handle cases where oncanplaythrough might not fire (e.g., if already loaded)
            if (audio.readyState >= 3) { // HAVE_FUTURE_DATA or HAVE_ENOUGH_DATA
                this.sounds.set(asset.name, audio);
                resolve();
            }
        });
    }
    getImage(name) {
        return this.images.get(name);
    }
    getSound(name) {
        return this.sounds.get(name);
    }
}
class SnakeGame {
    constructor(canvasId, config, assetLoader) {
        this.animationFrameId = null;
        this.lastFrameTime = 0;
        this.bgmAudio = null;
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            throw new Error(`Canvas with ID "${canvasId}" not found.`);
        }
        this.ctx = this.canvas.getContext('2d');
        if (!this.ctx) {
            throw new Error('Failed to get 2D rendering context.');
        }
        this.config = config;
        this.assetLoader = assetLoader;
        this.canvas.width = config.canvasWidth;
        this.canvas.height = config.canvasHeight;
        this.cellSize = this.canvas.width / config.gridSize;
        this.state = this.initialGameState();
        this.setupEventListeners();
    }
    initialGameState() {
        const startX = Math.floor(this.config.gridSize / 2);
        const startY = Math.floor(this.config.gridSize / 2);
        const initialSnake = [];
        for (let i = 0; i < this.config.initialSnakeLength; i++) {
            initialSnake.push({ x: startX - i, y: startY }); // Snake starts horizontally, facing right
        }
        return {
            snake: initialSnake,
            food: { x: -1, y: -1 }, // Placeholder, will be spawned
            currentDirection: 'RIGHT',
            nextDirection: 'RIGHT',
            score: 0,
            gameOver: false,
            gameStarted: false,
            lastMoveTime: 0,
        };
    }
    setupEventListeners() {
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
    }
    handleKeyDown(event) {
        if (!this.state.gameStarted) {
            if (event.code === 'Space') {
                this.startGame();
            }
            return;
        }
        if (this.state.gameOver) {
            if (event.code === 'Space') {
                this.resetGame();
                this.startGame();
            }
            return;
        }
        // Prevent immediate reverse turns
        const currentDir = this.state.currentDirection;
        let newDirection = null;
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                if (currentDir !== 'DOWN')
                    newDirection = 'UP';
                break;
            case 'ArrowDown':
            case 'KeyS':
                if (currentDir !== 'UP')
                    newDirection = 'DOWN';
                break;
            case 'ArrowLeft':
            case 'KeyA':
                if (currentDir !== 'RIGHT')
                    newDirection = 'LEFT';
                break;
            case 'ArrowRight':
            case 'KeyD':
                if (currentDir !== 'LEFT')
                    newDirection = 'RIGHT';
                break;
        }
        if (newDirection !== null) {
            this.state.nextDirection = newDirection;
        }
    }
    startGame() {
        this.state.gameStarted = true;
        this.state.gameOver = false;
        this.state.lastMoveTime = performance.now();
        this.spawnFood();
        this.playBGM();
        this.loop(performance.now());
    }
    resetGame() {
        this.state = this.initialGameState();
        if (this.bgmAudio) { // Safely check before accessing properties to fix TS2779
            this.bgmAudio.pause();
            this.bgmAudio.currentTime = 0;
        }
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    playBGM() {
        const bgm = this.assetLoader.getSound('bgm');
        if (bgm) {
            this.bgmAudio = bgm;
            this.bgmAudio.loop = true;
            this.bgmAudio.play().catch(e => console.warn("BGM autoplay prevented:", e));
        }
    }
    playSound(name) {
        const sound = this.assetLoader.getSound(name);
        if (sound) {
            const clonedSound = sound.cloneNode();
            clonedSound.volume = sound.volume;
            clonedSound.play().catch(e => console.warn(`Sound "${name}" autoplay prevented:`, e));
        }
    }
    spawnFood() {
        let attempts = 0;
        while (attempts < this.config.foodSpawnAttempts) {
            const x = Math.floor(Math.random() * this.config.gridSize);
            const y = Math.floor(Math.random() * this.config.gridSize);
            const isOccupied = this.state.snake.some(segment => segment.x === x && segment.y === y);
            if (!isOccupied) {
                this.state.food = { x, y };
                return;
            }
            attempts++;
        }
        console.warn('Could not spawn food after multiple attempts. Food might not appear.');
    }
    loop(currentTime) {
        if (this.state.gameOver && this.state.gameStarted) {
            this.drawGameOverScreen();
            return;
        }
        this.lastFrameTime = currentTime;
        if (this.state.gameStarted && !this.state.gameOver && currentTime - this.state.lastMoveTime > this.config.initialSpeedMs) {
            this.update();
            this.state.lastMoveTime = currentTime;
        }
        this.draw();
        this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
    }
    update() {
        this.state.currentDirection = this.state.nextDirection;
        const head = { ...this.state.snake[0] };
        switch (this.state.currentDirection) {
            case 'UP':
                head.y--;
                break;
            case 'DOWN':
                head.y++;
                break;
            case 'LEFT':
                head.x--;
                break;
            case 'RIGHT':
                head.x++;
                break;
        }
        // --- Collision Detection ---
        let isGameOver = false;
        // 1. Wall collision
        if (head.x < 0 || head.x >= this.config.gridSize || head.y < 0 || head.y >= this.config.gridSize) {
            if (this.config.wallCollision === 'gameOver') {
                isGameOver = true;
            }
            else { // 'wrap'
                if (head.x < 0)
                    head.x = this.config.gridSize - 1;
                else if (head.x >= this.config.gridSize)
                    head.x = 0;
                if (head.y < 0)
                    head.y = this.config.gridSize - 1;
                else if (head.y >= this.config.gridSize)
                    head.y = 0;
            }
        }
        // 2. Self collision (only if selfCollision is true and after potential wrap)
        if (this.config.selfCollision) {
            // Check against all segments *except* the tail, which will be removed or moved
            for (let i = 0; i < this.state.snake.length - (this.state.snake.length > this.config.initialSnakeLength ? 0 : 1); i++) {
                if (head.x === this.state.snake[i].x && head.y === this.state.snake[i].y) {
                    isGameOver = true;
                    break;
                }
            }
        }
        if (isGameOver) {
            this.state.gameOver = true;
            this.playSound('gameOver');
            if (this.bgmAudio) { // Safely pause BGM
                this.bgmAudio.pause();
            }
            return;
        }
        // Add new head
        this.state.snake.unshift(head);
        // 3. Food collision
        if (head.x === this.state.food.x && head.y === this.state.food.y) {
            this.state.score += 1;
            this.playSound('eat');
            this.spawnFood(); // Don't remove tail
        }
        else {
            this.state.snake.pop(); // Remove tail
        }
    }
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.config.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        if (!this.state.gameStarted) {
            this.drawTitleScreen();
            return;
        }
        // Draw Food
        const foodImage = this.assetLoader.getImage('food');
        if (this.state.food.x !== -1 && this.state.food.y !== -1) { // Only draw if food is spawned
            if (foodImage) {
                this.ctx.drawImage(foodImage, this.state.food.x * this.cellSize, this.state.food.y * this.cellSize, this.cellSize, this.cellSize);
            }
            else {
                this.ctx.fillStyle = this.config.colors.food;
                this.ctx.fillRect(this.state.food.x * this.cellSize, this.state.food.y * this.cellSize, this.cellSize, this.cellSize);
            }
        }
        // Draw Snake
        const snakeHeadImage = this.assetLoader.getImage('snakeHead');
        const snakeBodyImage = this.assetLoader.getImage('snakeBody');
        this.state.snake.forEach((segment, index) => {
            const x = segment.x * this.cellSize;
            const y = segment.y * this.cellSize;
            if (index === 0 && snakeHeadImage) { // Head
                this.ctx.drawImage(snakeHeadImage, x, y, this.cellSize, this.cellSize);
            }
            else if (snakeBodyImage) { // Body
                this.ctx.drawImage(snakeBodyImage, x, y, this.cellSize, this.cellSize);
            }
            else { // Fallback to color
                this.ctx.fillStyle = index === 0 ? this.config.colors.snakeHead : this.config.colors.snakeBody;
                this.ctx.fillRect(x, y, this.cellSize, this.cellSize);
            }
        });
        // Draw Score
        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.font = `${this.cellSize * 0.8}px Arial`;
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`${this.config.text.scorePrefix}${this.state.score}`, 10, 10);
        if (this.state.gameOver) {
            this.drawGameOverScreen();
        }
    }
    drawTitleScreen() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.font = `${this.canvas.width * 0.1}px Arial`;
        this.ctx.fillText(this.config.text.title, this.canvas.width / 2, this.canvas.height / 2 - this.cellSize * 2);
        this.ctx.font = `${this.canvas.width * 0.05}px Arial`;
        this.ctx.fillText(this.config.text.pressSpaceToStart, this.canvas.width / 2, this.canvas.height / 2 + this.cellSize);
    }
    drawGameOverScreen() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.font = `${this.canvas.width * 0.1}px Arial`;
        this.ctx.fillText(this.config.text.gameOver, this.canvas.width / 2, this.canvas.height / 2 - this.cellSize * 2);
        this.ctx.font = `${this.canvas.width * 0.05}px Arial`;
        this.ctx.fillText(`${this.config.text.scorePrefix}${this.state.score}`, this.canvas.width / 2, this.canvas.height / 2 - this.cellSize);
        this.ctx.font = `${this.canvas.width * 0.04}px Arial`;
        this.ctx.fillText(this.config.text.pressSpaceToStart, this.canvas.width / 2, this.canvas.height / 2 + this.cellSize);
    }
    async init() {
        this.lastFrameTime = performance.now();
        this.loop(this.lastFrameTime); // Start the loop to draw the title screen initially
    }
}
// Global initialization
document.addEventListener('DOMContentLoaded', async () => {
    const assetLoader = new AssetLoader();
    let config;
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    try {
        if (!canvas || !ctx) {
            throw new Error('Canvas element or 2D rendering context not found.');
        }
        config = await assetLoader.loadConfig('data.json');
        await assetLoader.loadAssets();
        console.log("Game assets and config loaded.");
        const game = new SnakeGame('gameCanvas', config, assetLoader);
        await game.init();
    }
    catch (error) {
        console.error('Failed to initialize game:', error);
        if (canvas && ctx) {
            canvas.width = 600; // Default size for error display
            canvas.height = 600;
            ctx.fillStyle = 'red';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'white';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Error loading game. Check console for details.', canvas.width / 2, canvas.height / 2);
        }
        else {
            document.body.innerHTML = '<p style="color:red;">Error: Canvas element not found or context unavailable. See console.</p>';
        }
    }
});
