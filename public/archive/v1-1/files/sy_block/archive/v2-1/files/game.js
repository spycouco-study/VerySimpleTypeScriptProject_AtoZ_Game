"use strict";
var GameState;
(function (GameState) {
    GameState[GameState["LOADING"] = 0] = "LOADING";
    GameState[GameState["TITLE"] = 1] = "TITLE";
    GameState[GameState["PLAYING"] = 2] = "PLAYING";
    GameState[GameState["GAME_OVER_WIN"] = 3] = "GAME_OVER_WIN";
    GameState[GameState["GAME_OVER_LOSE"] = 4] = "GAME_OVER_LOSE";
})(GameState || (GameState = {}));
class AssetManager {
    constructor() {
        this.images = new Map();
        this.sounds = new Map();
    }
    async loadImages(imageAssets) {
        const promises = imageAssets.map(asset => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.src = asset.path;
                img.onload = () => {
                    this.images.set(asset.name, img);
                    resolve();
                };
                img.onerror = () => {
                    console.error(`Failed to load image: ${asset.path}`);
                    reject(new Error(`Failed to load image: ${asset.path}`));
                };
            });
        });
        await Promise.all(promises);
    }
    loadSounds(soundAssets) {
        soundAssets.forEach(asset => {
            const audio = new Audio(asset.path);
            audio.volume = asset.volume;
            this.sounds.set(asset.name, audio);
        });
    }
    getImage(name) {
        return this.images.get(name);
    }
    getSound(name) {
        return this.sounds.get(name);
    }
}
class GameObject {
    constructor(x, y, width, height, imageKey, assetManager) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.imageKey = imageKey;
        this.assetManager = assetManager;
    }
    draw(ctx) {
        const image = this.assetManager.getImage(this.imageKey);
        if (image) {
            ctx.drawImage(image, this.x, this.y, this.width, this.height);
        }
        else {
            // Fallback if image not loaded/found (e.g., draw a colored rect)
            ctx.fillStyle = 'purple';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}
class Paddle extends GameObject {
    constructor(x, y, width, height, imageKey, assetManager, maxSpeed, canvasWidth) {
        super(x, y, width, height, imageKey, assetManager);
        this.dx = 0; // for potential keyboard input, or mouse movement delta
        this.maxSpeed = maxSpeed;
        this.canvasWidth = canvasWidth;
    }
    update(deltaTime) {
        // Paddle position is usually controlled by mouse, handled directly in Game class
        // This update is left empty as the Game class will directly set this.x
        // based on mouse input.
    }
    // Method to set paddle position based on mouse X
    setX(mouseX) {
        this.x = mouseX - this.width / 2; // Center paddle on mouse
        if (this.x < 0)
            this.x = 0;
        if (this.x + this.width > this.canvasWidth)
            this.x = this.canvasWidth - this.width;
    }
}
class Ball extends GameObject {
    constructor(x, y, radius, imageKey, assetManager, speed, maxSpeed) {
        super(x, y, radius * 2, radius * 2, imageKey, assetManager); // width/height = diameter
        this.radius = radius;
        this.dx = 0;
        this.dy = 0;
        this.speed = speed;
        this.maxSpeed = maxSpeed;
    }
    update(deltaTime) {
        this.x += this.dx * this.speed * deltaTime / (1000 / 60); // Adjust speed by deltaTime for frame-rate independence
        this.y += this.dy * this.speed * deltaTime / (1000 / 60);
    }
    draw(ctx) {
        const image = this.assetManager.getImage(this.imageKey);
        if (image) {
            ctx.drawImage(image, this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
        }
        else {
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    launch(angle = Math.PI / 2) {
        this.dx = this.speed * Math.cos(angle + Math.PI / 2); // Adjust angle for Y-up coordinate system
        this.dy = -this.speed * Math.sin(angle + Math.PI / 2); // Initial Y velocity upwards
        // Normalize for consistent speed
        const magnitude = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
        if (magnitude > 0) {
            this.dx /= magnitude;
            this.dy /= magnitude;
        }
    }
    reset(x, y) {
        this.x = x;
        this.y = y;
        this.dx = 0;
        this.dy = 0;
    }
    increaseSpeed(factor) {
        this.speed = Math.min(this.maxSpeed, this.speed * factor);
    }
    getSpeed() {
        return this.speed;
    }
}
class Brick extends GameObject {
    constructor(x, y, width, height, imageKey, assetManager, health, scoreValue) {
        super(x, y, width, height, imageKey, assetManager);
        this.initialHealth = health;
        this.health = health;
        this.scoreValue = scoreValue;
    }
    hit() {
        this.health--;
        // Update image based on health or play hit animation/sound
        if (this.health <= 0) {
            this.imageKey = "brick_broken"; // Use a broken brick image if available
            return true; // Brick is broken
        }
        this.imageKey = "brick" + this.health; // Switch to an image for reduced health
        return false; // Brick is still active
    }
    update(deltaTime) {
        // Bricks don't move or update state in a simple breakout
    }
    draw(ctx) {
        const currentImageKey = this.health > 0 ? (this.imageKey.startsWith("brick") ? this.imageKey : "brick" + this.health) : "brick_broken";
        const image = this.assetManager.getImage(currentImageKey);
        if (image) {
            ctx.drawImage(image, this.x, this.y, this.width, this.height);
        }
        else {
            // Fallback for different health levels
            ctx.fillStyle = this.health === 2 ? 'gray' : (this.health === 1 ? 'lightgray' : 'darkred');
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.strokeStyle = 'black';
            ctx.strokeRect(this.x, this.y, this.width, this.height);
        }
    }
}
class Game {
    constructor() {
        this.assetManager = new AssetManager();
        this.gameState = GameState.LOADING;
        this.bricks = [];
        this.score = 0;
        this.lives = 0;
        this.lastFrameTime = 0;
        this.isBallAttachedToPaddle = true;
        this.mouseX = 0;
        this.handleMouseMove = (event) => {
            if (this.gameState === GameState.PLAYING && this.paddle) {
                this.mouseX = event.clientX - this.canvas.getBoundingClientRect().left;
                this.paddle.setX(this.mouseX);
            }
        };
        this.handleClick = () => {
            if (this.gameState === GameState.TITLE) {
                this.gameState = GameState.PLAYING;
                this.initGame();
            }
            else if (this.gameState === GameState.GAME_OVER_WIN || this.gameState === GameState.GAME_OVER_LOSE) {
                this.gameState = GameState.TITLE;
                this.stopAudio("bgm"); // Ensure BGM stops before returning to title
                this.stopAudio("game_over");
                this.stopAudio("game_win");
            }
            else if (this.gameState === GameState.PLAYING && this.isBallAttachedToPaddle) {
                this.isBallAttachedToPaddle = false;
                this.ball.launch(Math.random() * Math.PI / 2 - Math.PI / 4); // Launch at a random angle slightly left or right of straight up
            }
        };
        this.gameLoop = (timestamp) => {
            const deltaTime = timestamp - this.lastFrameTime;
            this.lastFrameTime = timestamp;
            this.update(deltaTime);
            this.render();
            requestAnimationFrame(this.gameLoop);
        };
        const canvasElement = document.getElementById('gameCanvas');
        if (!canvasElement) {
            throw new Error("Canvas element with ID 'gameCanvas' not found.");
        }
        this.canvas = canvasElement;
        const context = this.canvas.getContext('2d');
        if (!context) {
            throw new Error("Failed to get 2D rendering context for canvas.");
        }
        this.ctx = context;
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('mousedown', this.handleClick);
        this.loadGameData();
    }
    async loadGameData() {
        try {
            const response = await fetch('data.json');
            this.config = await response.json();
            this.canvas.width = this.config.canvas.width;
            this.canvas.height = this.config.canvas.height;
            this.ctx.imageSmoothingEnabled = true; // For smoother scaling
            await this.assetManager.loadImages(this.config.assets.images);
            this.assetManager.loadSounds(this.config.assets.sounds);
            this.background = this.assetManager.getImage("background");
            this.gameState = GameState.TITLE;
            this.gameLoop(0); // Start the game loop even for title screen
        }
        catch (error) {
            console.error("Failed to load game data or assets:", error);
            this.ctx.fillStyle = 'red';
            this.ctx.fillText("Error loading game. Check console.", 10, 50);
        }
    }
    initGame() {
        this.score = 0;
        this.lives = this.config.gameplay.lives;
        this.bricks = [];
        this.createBricks();
        this.createPaddleAndBall();
        this.isBallAttachedToPaddle = true;
        this.playAudio("bgm", true);
    }
    createPaddleAndBall() {
        const paddleY = this.canvas.height - this.config.paddle.height - this.config.paddle.initialYOffset;
        this.paddle = new Paddle((this.canvas.width - this.config.paddle.width) / 2, paddleY, this.config.paddle.width, this.config.paddle.height, "paddle", this.assetManager, this.config.gameplay.paddleSpeed, this.canvas.width);
        this.ball = new Ball(this.paddle.x + this.paddle.width / 2, this.paddle.y - this.config.ball.radius, this.config.ball.radius, "ball", this.assetManager, this.config.gameplay.ballSpeed, this.config.gameplay.maxBallSpeed);
    }
    createBricks() {
        const { rows, cols, width, height, padding, offsetTop, offsetLeft, healthLevels } = this.config.bricks;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const brickX = offsetLeft + c * (width + padding);
                const brickY = offsetTop + r * (height + padding);
                const health = healthLevels[Math.floor(Math.random() * healthLevels.length)]; // Random health from config
                this.bricks.push(new Brick(brickX, brickY, width, height, `brick${health}`, this.assetManager, health, this.config.gameplay.scorePerBrick));
            }
        }
    }
    update(deltaTime) {
        switch (this.gameState) {
            case GameState.PLAYING:
                this.updatePlaying(deltaTime);
                break;
            // No updates needed for TITLE, GAME_OVER, LOADING state other than input checks
        }
    }
    updatePlaying(deltaTime) {
        this.paddle.update(deltaTime); // Paddle updates its position based on mouseX
        if (this.isBallAttachedToPaddle) {
            this.ball.x = this.paddle.x + this.paddle.width / 2;
            this.ball.y = this.paddle.y - this.ball.radius;
        }
        else {
            this.ball.update(deltaTime);
            this.checkBallCollisions();
        }
        // Check game win/lose conditions
        if (this.bricks.filter(b => b.health > 0).length === 0) {
            this.gameState = GameState.GAME_OVER_WIN;
            this.playAudio("game_win");
            this.stopAudio("bgm");
        }
        else if (this.lives <= 0) {
            this.gameState = GameState.GAME_OVER_LOSE;
            this.playAudio("game_over");
            this.stopAudio("bgm");
        }
    }
    checkBallCollisions() {
        // Ball-Wall collision
        if (this.ball.x + this.ball.radius > this.canvas.width || this.ball.x - this.ball.radius < 0) {
            this.ball.dx *= -1;
            this.playAudio("bounce_wall");
            this.ball.x = Math.max(this.ball.radius, Math.min(this.canvas.width - this.ball.radius, this.ball.x)); // Prevent sticking
        }
        if (this.ball.y - this.ball.radius < 0) {
            this.ball.dy *= -1;
            this.playAudio("bounce_wall");
            this.ball.y = this.ball.radius; // Prevent sticking
        }
        // Ball-Paddle collision
        if (this.ball.y + this.ball.radius > this.paddle.y &&
            this.ball.y + this.ball.radius < this.paddle.y + this.paddle.height && // Ensure it's not fully inside paddle
            this.ball.x > this.paddle.x &&
            this.ball.x < this.paddle.x + this.paddle.width &&
            this.ball.dy > 0 // Only bounce if moving downwards
        ) {
            this.ball.dy *= -1;
            this.playAudio("bounce_paddle");
            // Adjust ball angle based on where it hit the paddle
            const hitPoint = (this.ball.x - (this.paddle.x + this.paddle.width / 2)) / (this.paddle.width / 2);
            this.ball.dx = hitPoint; // Adjust horizontal direction based on hit point
            // Normalize velocity vector to maintain consistent speed
            const magnitude = Math.sqrt(this.ball.dx * this.ball.dx + this.ball.dy * this.ball.dy);
            if (magnitude > 0) { // Avoid division by zero
                this.ball.dx /= magnitude;
                this.ball.dy /= magnitude;
            }
            this.ball.y = this.paddle.y - this.ball.radius; // Prevent ball from going into paddle
            this.ball.increaseSpeed(1.05); // Slightly increase speed after paddle bounce
        }
        // Ball below paddle (lose a life)
        if (this.ball.y + this.ball.radius > this.canvas.height) {
            this.lives--;
            this.playAudio("lose_life");
            if (this.lives > 0) {
                this.resetBall();
            }
        }
        // Ball-Brick collision
        for (let i = this.bricks.length - 1; i >= 0; i--) {
            const brick = this.bricks[i];
            if (brick.health <= 0)
                continue; // Skip broken bricks
            // Simple AABB collision check for ball (as a square for simplicity) and brick
            const ballRect = {
                x: this.ball.x - this.ball.radius,
                y: this.ball.y - this.ball.radius,
                width: this.ball.radius * 2,
                height: this.ball.radius * 2,
            };
            if (ballRect.x < brick.x + brick.width &&
                ballRect.x + ballRect.width > brick.x &&
                ballRect.y < brick.y + brick.height &&
                ballRect.y + ballRect.height > brick.y) {
                // Determine collision direction for reflection
                const prevBallX = this.ball.x - this.ball.dx * this.ball.getSpeed();
                const prevBallY = this.ball.y - this.ball.dy * this.ball.getSpeed();
                const hitFromLeft = prevBallX + this.ball.radius <= brick.x && this.ball.x + this.ball.radius > brick.x;
                const hitFromRight = prevBallX - this.ball.radius >= brick.x + brick.width && this.ball.x - this.ball.radius < brick.x + brick.width;
                const hitFromTop = prevBallY + this.ball.radius <= brick.y && this.ball.y + this.ball.radius > brick.y;
                const hitFromBottom = prevBallY - this.ball.radius >= brick.y + brick.height && this.ball.y - this.ball.radius < brick.y + brick.height;
                if (hitFromLeft || hitFromRight) {
                    this.ball.dx *= -1;
                }
                else if (hitFromTop || hitFromBottom) {
                    this.ball.dy *= -1;
                }
                else { // Corner case or deep penetration, default to vertical flip
                    this.ball.dy *= -1;
                }
                if (brick.hit()) {
                    this.score += brick.scoreValue;
                    this.playAudio("brick_break");
                }
                else {
                    this.playAudio("brick_hit");
                }
                break; // Only one brick can be hit per update cycle
            }
        }
    }
    resetBall() {
        this.isBallAttachedToPaddle = true;
        this.ball.reset(this.paddle.x + this.paddle.width / 2, this.paddle.y - this.ball.radius);
    }
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.config.canvas.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.background) {
            this.ctx.drawImage(this.background, 0, 0, this.canvas.width, this.canvas.height);
        }
        switch (this.gameState) {
            case GameState.LOADING:
                this.renderLoadingScreen();
                break;
            case GameState.TITLE:
                this.renderTitleScreen();
                break;
            case GameState.PLAYING:
                this.renderPlaying();
                break;
            case GameState.GAME_OVER_WIN:
            case GameState.GAME_OVER_LOSE:
                this.renderGameOverScreen();
                break;
        }
    }
    renderLoadingScreen() {
        this.ctx.fillStyle = this.config.textDisplay.color;
        this.ctx.font = this.config.textDisplay.font;
        this.ctx.textAlign = 'center';
        this.ctx.fillText("Loading Game...", this.canvas.width / 2, this.canvas.height / 2);
    }
    renderTitleScreen() {
        this.ctx.fillStyle = this.config.textDisplay.color;
        this.ctx.textAlign = 'center';
        this.ctx.font = this.config.textDisplay.titleScreen.font;
        this.ctx.fillText(this.config.textDisplay.titleScreen.title, this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.font = this.config.textDisplay.titleScreen.subtitleFont;
        this.ctx.fillText(this.config.textDisplay.titleScreen.subtitle, this.canvas.width / 2, this.canvas.height / 2 + 20);
    }
    renderPlaying() {
        this.paddle.draw(this.ctx);
        this.ball.draw(this.ctx);
        this.bricks.filter(b => b.health > 0).forEach(brick => brick.draw(this.ctx));
        // Draw score and lives
        this.ctx.fillStyle = this.config.textDisplay.color;
        this.ctx.font = this.config.textDisplay.font;
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Score: ${this.score}`, 10, 30);
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`Lives: ${this.lives}`, this.canvas.width - 10, 30);
    }
    renderGameOverScreen() {
        this.renderPlaying(); // Draw final game state behind overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent overlay
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.config.textDisplay.color;
        this.ctx.textAlign = 'center';
        this.ctx.font = this.config.textDisplay.gameOverScreen.font;
        const gameOverText = this.gameState === GameState.GAME_OVER_WIN ? this.config.textDisplay.gameOverScreen.winText : this.config.textDisplay.gameOverScreen.loseText;
        this.ctx.fillText(gameOverText, this.canvas.width / 2, this.canvas.height / 2 - 60);
        this.ctx.font = this.config.textDisplay.gameOverScreen.scoreFont;
        this.ctx.fillText(`Final Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.font = this.config.textDisplay.gameOverScreen.restartFont;
        this.ctx.fillText(this.config.textDisplay.gameOverScreen.restartText, this.canvas.width / 2, this.canvas.height / 2 + 60);
    }
    playAudio(name, loop = false) {
        const audio = this.assetManager.getSound(name);
        if (audio) {
            audio.currentTime = 0; // Rewind to start
            audio.loop = loop;
            audio.play().catch(e => console.warn(`Audio playback failed for ${name}:`, e));
        }
    }
    stopAudio(name) {
        const audio = this.assetManager.getSound(name);
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
    }
}
// Initialize the game when the window loads
window.onload = () => {
    try {
        new Game();
    }
    catch (e) {
        console.error("Game initialization failed:", e.message);
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = 'red';
                ctx.font = '24px Arial';
                ctx.fillText(`Fatal Error: ${e.message}`, 10, 50);
            }
        }
        else {
            document.body.innerHTML = `<p style="color:red;">Fatal Error: ${e.message}</p>`;
        }
    }
};
