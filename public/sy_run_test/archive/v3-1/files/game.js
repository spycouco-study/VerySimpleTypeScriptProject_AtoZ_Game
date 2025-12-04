"use strict";
class Player {
    constructor(config, startY) {
        this.config = config;
        this.x = config.startX;
        this.y = startY - config.height;
        this.width = config.width;
        this.height = config.height;
        this.velocityY = 0;
        this.isJumping = false; // Initially on ground
        this.jumpCount = 0; // Initially no jumps performed
        this.maxJumps = config.maxJumps;
        this.currentFrame = 0;
        this.animationTimer = 0;
        this.moveSpeed = config.moveSpeed;
        this.directionX = 0;
    }
    update(deltaTime, gravity, groundY) {
        // Horizontal movement
        this.x += this.directionX * this.moveSpeed * deltaTime;
        this.x = Math.max(this.config.startX, this.x);
        // Vertical movement
        this.velocityY += gravity * deltaTime;
        this.y += this.velocityY * deltaTime;
        // Check if player has landed on the ground
        if (this.y + this.height >= groundY) {
            this.y = groundY - this.height;
            this.velocityY = 0;
            if (this.isJumping) { // If player was airborne and just landed
                this.isJumping = false;
                this.jumpCount = 0; // Reset jump count when player is firmly on the ground
            }
        }
        else {
            // Player is airborne if not on ground
            this.isJumping = true;
        }
        // Animation logic
        if (!this.isJumping) { // On ground
            if (this.directionX === 0) { // Idle animation
                this.currentFrame = 0;
                this.animationTimer = 0;
            }
            else { // Running animation
                this.animationTimer += deltaTime;
                if (this.animationTimer >= this.config.animationSpeed) {
                    this.currentFrame = (this.currentFrame + 1) % this.config.spriteFrames.length;
                    this.animationTimer = 0;
                }
            }
        }
        else { // Airborne (jumping/falling)
            this.currentFrame = 0; // Show first frame (jump/idle frame)
        }
    }
    jump(jumpForce) {
        // Allow jump only if current jump count is less than max allowed jumps
        if (this.jumpCount < this.maxJumps) {
            this.velocityY = -jumpForce;
            this.isJumping = true; // Mark as airborne
            this.jumpCount++; // Increment the jump counter
        }
    }
    getBounds() {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    }
}
class Obstacle {
    constructor(config, worldX, groundY) {
        this.config = config;
        this.type = config.name;
        this.width = config.width;
        this.height = config.height;
        this.x = worldX; // World X position for the obstacle
        this.y = groundY - this.height;
    }
    update(_deltaTime) {
        // Obstacles are static in world coordinates.
        // Their screen position changes due to world scrolling, handled by Game class.
    }
    getBounds() {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    }
}
class Background {
    constructor(canvasWidth, canvasHeight, imageName) {
        this.width = canvasWidth;
        this.height = canvasHeight;
        this.imageName = imageName;
    }
}
class Game {
    constructor(canvasId, dataUrl = 'data.json') {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            throw new Error(`Canvas with ID '${canvasId}' not found.`);
        }
        this.canvas = canvas;
        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get 2D rendering context.');
        }
        this.ctx = ctx;
        this.loadedImages = new Map();
        this.loadedSounds = new Map();
        this.obstacles = [];
        this.backgrounds = [];
        this.lastTime = 0;
        this.gameState = 'START_SCREEN'; // Game starts in the start screen
        this.score = 0;
        this.obstacleSpawnTimer = 0;
        this.nextObstacleSpawnTime = 0;
        this.groundY = 0;
        this.worldOffsetX = 0;
        this.isLeftKeyDown = false;
        this.isRightKeyDown = false;
        this.loadDataAndAssets(dataUrl).then(() => {
            // Do not call initGame() here. It will be called when game transitions from START_SCREEN to RUNNING.
            this.addEventListeners();
            this.startGameLoop(); // Start the loop to render the start screen
        }).catch(error => {
            console.error('Failed to load game data or assets:', error);
        });
    }
    async loadDataAndAssets(dataUrl) {
        const response = await fetch(dataUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch game data: ${response.statusText}`);
        }
        this.gameData = await response.json();
        this.canvas.width = this.gameData.game.canvasWidth;
        this.canvas.height = this.gameData.game.canvasHeight;
        this.groundY = this.gameData.game.canvasHeight - this.gameData.game.groundHeight;
        const imagePromises = this.gameData.assets.images.map(asset => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.src = asset.path;
                img.onload = () => {
                    this.loadedImages.set(asset.name, img);
                    resolve();
                };
                img.onerror = () => reject(new Error(`Failed to load image: ${asset.path}`));
            });
        });
        const soundPromises = this.gameData.assets.sounds.map(asset => {
            return new Promise((resolve, reject) => {
                const audio = new Audio();
                audio.src = asset.path;
                audio.volume = asset.volume;
                audio.oncanplaythrough = () => {
                    this.loadedSounds.set(asset.name, audio);
                    resolve();
                };
                audio.onerror = () => reject(new Error(`Failed to load sound: ${asset.path}`));
                audio.load();
            });
        });
        await Promise.all([...imagePromises, ...soundPromises]);
    }
    initGame() {
        // This method resets the game state for a new round
        this.player = new Player(this.gameData.player, this.groundY);
        this.obstacles = [];
        this.score = 0;
        this.obstacleSpawnTimer = 0;
        this.nextObstacleSpawnTime = this.getRandomObstacleSpawnTime();
        this.worldOffsetX = 0;
        this.backgrounds = [];
        if (this.gameData.assets.images.some(img => img.name === 'background')) {
            this.backgrounds.push(new Background(this.canvas.width, this.canvas.height, 'background'));
        }
        this.isLeftKeyDown = false;
        this.isRightKeyDown = false;
        this.player.directionX = 0; // Ensure player starts stationary
        // BGM is played when transitioning from START_SCREEN/GAME_OVER to RUNNING in handleKeyDown
    }
    addEventListeners() {
        window.addEventListener('keydown', this.handleKeyDown.bind(this));
        window.addEventListener('keyup', this.handleKeyUp.bind(this));
    }
    handleKeyDown(event) {
        if (event.code === 'Space') {
            if (this.gameState === 'START_SCREEN' || this.gameState === 'GAME_OVER') {
                this.initGame(); // Reset game state for new round
                this.gameState = 'RUNNING'; // Start the game
                this.playBGM('bgm'); // Start BGM when game begins
            }
            else if (this.gameState === 'RUNNING') {
                this.player.jump(this.gameData.player.jumpForce);
                this.playSound('jump');
            }
        }
        // Handle movement keys only if the game is currently running
        if (this.gameState === 'RUNNING') {
            if (event.code === 'ArrowLeft') {
                this.isLeftKeyDown = true;
            }
            if (event.code === 'ArrowRight') {
                this.isRightKeyDown = true;
            }
            this.updatePlayerDirectionX();
        }
    }
    handleKeyUp(event) {
        // Handle movement keys only if the game is currently running
        if (this.gameState === 'RUNNING') {
            if (event.code === 'ArrowLeft') {
                this.isLeftKeyDown = false;
            }
            if (event.code === 'ArrowRight') {
                this.isRightKeyDown = false;
            }
            this.updatePlayerDirectionX();
        }
    }
    // Determines player's horizontal direction based on key states
    updatePlayerDirectionX() {
        if (this.isLeftKeyDown && !this.isRightKeyDown) {
            this.player.directionX = -1;
        }
        else if (this.isRightKeyDown && !this.isLeftKeyDown) {
            this.player.directionX = 1;
        }
        else {
            this.player.directionX = 0;
        }
    }
    startGameLoop() {
        requestAnimationFrame(this.gameLoop.bind(this));
    }
    gameLoop(currentTime) {
        if (!this.lastTime) {
            this.lastTime = currentTime;
        }
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        // Game state determines what to render and update
        switch (this.gameState) {
            case 'START_SCREEN':
                this.renderStartScreen();
                break;
            case 'RUNNING':
                this.update(deltaTime);
                this.render();
                break;
            case 'GAME_OVER':
                this.renderGameOver();
                break;
        }
        requestAnimationFrame(this.gameLoop.bind(this));
    }
    update(deltaTime) {
        const previousPlayerX = this.player.x;
        const previousPlayerY = this.player.y; // Capture player Y before update for stomp detection
        this.player.update(deltaTime, this.gameData.game.gravity, this.groundY);
        // Scrolling Logic: Keep player near the configured screen X ratio
        const targetPlayerScreenX = this.canvas.width * this.gameData.game.playerScreenXRatio;
        let calculatedWorldOffsetX = this.player.x - targetPlayerScreenX;
        calculatedWorldOffsetX = Math.max(0, calculatedWorldOffsetX);
        this.worldOffsetX = Math.max(this.worldOffsetX, calculatedWorldOffsetX);
        this.player.x = Math.max(this.player.x, this.worldOffsetX);
        // Obstacle spawning
        this.obstacleSpawnTimer += deltaTime;
        if (this.obstacleSpawnTimer >= this.nextObstacleSpawnTime) {
            this.spawnObstacle();
            this.obstacleSpawnTimer = 0;
            this.nextObstacleSpawnTime = this.getRandomObstacleSpawnTime();
        }
        const playerBounds = this.player.getBounds();
        let gameOverTriggered = false;
        // Update and check collisions for obstacles
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obstacle = this.obstacles[i];
            obstacle.update(deltaTime);
            if (obstacle.x + obstacle.width < this.worldOffsetX - this.player.width) {
                this.obstacles.splice(i, 1);
                continue;
            }
            const obstacleBounds = obstacle.getBounds();
            // AABB collision detection
            const isColliding = (playerBounds.x < obstacleBounds.x + obstacleBounds.width &&
                playerBounds.x + playerBounds.width > obstacleBounds.x &&
                playerBounds.y < obstacleBounds.y + obstacleBounds.height &&
                playerBounds.y + playerBounds.height > obstacleBounds.y);
            if (isColliding) {
                // Determine if it's a stomp or a regular collision
                const wasAboveObstacle = previousPlayerY + this.player.height <= obstacleBounds.y + 5; // A small epsilon
                const isFalling = this.player.velocityY > 0;
                const verticalOverlapDepth = (playerBounds.y + playerBounds.height) - obstacleBounds.y;
                const isVerticalStompOverlap = verticalOverlapDepth > 0 && verticalOverlapDepth < obstacleBounds.height * 0.7;
                if (wasAboveObstacle && isFalling && isVerticalStompOverlap) {
                    // Stomp! Player bounces off the obstacle.
                    this.playSound('jump'); // Re-use jump sound for bounce effect
                    this.player.velocityY = -this.gameData.player.jumpForce * 0.7; // Apply bounce velocity directly
                    this.player.isJumping = true; // Player is now airborne
                    // IMPORTANT: Stomping does NOT increment or reset player.jumpCount.
                    // This allows for double jump after a stomp if available.
                    this.score += this.gameData.game.stompScore;
                    this.obstacles.splice(i, 1);
                }
                else {
                    // Regular collision -> Game Over
                    gameOverTriggered = true;
                    break;
                }
            }
        }
        if (gameOverTriggered) {
            this.gameOver();
            return;
        }
        // Score update: only increase score if the player is moving forward in the world
        if (this.player.x > previousPlayerX) {
            this.score += this.gameData.game.scorePerSecond * deltaTime;
        }
    }
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // Render Backgrounds with parallax
        this.backgrounds.forEach(bg => {
            const bgAsset = this.gameData.assets.images.find(a => a.name === bg.imageName);
            if (bgAsset) {
                const parallaxFactor = 0.2;
                const parallaxOffset = (this.worldOffsetX * parallaxFactor) % bg.width;
                let currentX = -parallaxOffset;
                while (currentX < this.canvas.width) {
                    this.drawSprite(bg.imageName, 0, 0, bgAsset.width, bgAsset.height, currentX, 0, bg.width, bg.height);
                    currentX += bg.width;
                }
            }
        });
        // Render Ground
        const groundImageInfo = this.gameData.assets.images.find(img => img.name === 'ground');
        if (groundImageInfo) {
            let currentX = -(this.worldOffsetX % groundImageInfo.width);
            while (currentX < this.canvas.width) {
                this.drawSprite('ground', 0, 0, groundImageInfo.width, groundImageInfo.height, currentX, this.groundY, groundImageInfo.width, this.gameData.game.groundHeight);
                currentX += groundImageInfo.width;
            }
        }
        else {
            this.ctx.fillStyle = '#7a5a3a';
            this.ctx.fillRect(0, this.groundY, this.canvas.width, this.gameData.game.groundHeight);
        }
        // Render Obstacles, adjusting their world X by worldOffsetX to get screen X
        this.obstacles.forEach(obstacle => {
            const obstacleAsset = this.gameData.obstacles.find(o => o.name === obstacle.type);
            if (obstacleAsset) {
                this.drawSprite('obstacles', obstacleAsset.sprite.x, obstacleAsset.sprite.y, obstacleAsset.sprite.width, obstacleAsset.sprite.height, obstacle.x - this.worldOffsetX, obstacle.y, obstacle.width, obstacle.height);
            }
        });
        // Render Player, adjusting their world X by worldOffsetX to get screen X
        const playerAsset = this.gameData.assets.images.find(a => a.name === 'player');
        if (playerAsset) {
            const playerSprite = this.gameData.player.spriteFrames[this.player.currentFrame];
            this.drawSprite('player', playerSprite.x, playerSprite.y, playerSprite.width, playerSprite.height, this.player.x - this.worldOffsetX, this.player.y, this.player.width, this.player.height);
        }
        this.ctx.fillStyle = 'black';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`Score: ${Math.floor(this.score)}`, this.canvas.width - 20, 30);
    }
    renderStartScreen() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('PRESS SPACE TO START', this.canvas.width / 2, this.canvas.height / 2);
    }
    renderGameOver() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 40);
        this.ctx.font = '30px Arial';
        this.ctx.fillText(`Final Score: ${Math.floor(this.score)}`, this.canvas.width / 2, this.canvas.height / 2 + 10);
        this.ctx.font = '20px Arial';
        this.ctx.fillText('Press SPACE to Restart', this.canvas.width / 2, this.canvas.height / 2 + 60);
    }
    drawSprite(imageName, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight) {
        const image = this.loadedImages.get(imageName);
        if (image) {
            this.ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
        }
        else {
            this.ctx.fillStyle = 'red';
            this.ctx.fillRect(dx, dy, dWidth, dHeight);
        }
    }
    playSound(soundName) {
        const audio = this.loadedSounds.get(soundName);
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.warn(`Failed to play sound '${soundName}':`, e));
        }
    }
    playBGM(soundName) {
        const audio = this.loadedSounds.get(soundName);
        if (audio) {
            audio.loop = true;
            audio.play().catch(e => console.warn(`Failed to play BGM '${soundName}':`, e));
        }
    }
    getRandomObstacleSpawnTime() {
        const min = this.gameData.game.obstacleSpawnIntervalMin;
        const max = this.gameData.game.obstacleSpawnIntervalMax;
        return Math.random() * (max - min) + min;
    }
    spawnObstacle() {
        const randomIndex = Math.floor(Math.random() * this.gameData.obstacles.length);
        const obstacleConfig = this.gameData.obstacles[randomIndex];
        let potentialSpawnX;
        const minScreenEdgeSpawnX = this.worldOffsetX + this.canvas.width + 100;
        if (this.obstacles.length === 0) {
            potentialSpawnX = minScreenEdgeSpawnX;
        }
        else {
            const lastObstacle = this.obstacles[this.obstacles.length - 1];
            const rightmostExistingObstacleEdge = lastObstacle.x + lastObstacle.width;
            const minGapSpawnX = rightmostExistingObstacleEdge + this.gameData.game.minObstacleGap;
            potentialSpawnX = Math.max(minScreenEdgeSpawnX, minGapSpawnX);
        }
        const randomXOffset = Math.random() * (this.gameData.game.minObstacleGap / 2 + 50);
        const spawnX = potentialSpawnX + randomXOffset;
        const newObstacle = new Obstacle(obstacleConfig, spawnX, this.groundY);
        this.obstacles.push(newObstacle);
    }
    gameOver() {
        this.gameState = 'GAME_OVER'; // Transition to GAME_OVER state
        this.playSound('hit');
        const bgm = this.loadedSounds.get('bgm');
        if (bgm) {
            bgm.pause();
            bgm.currentTime = 0;
        }
    }
}
window.onload = () => {
    new Game('gameCanvas', 'data.json');
};
