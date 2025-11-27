class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private gameData!: GameData;
    private gameSettings!: GameSettings;
    private assetManager: AssetManager;
    private inputHandler: InputHandler;
    private player!: Player;
    private lastTime: number = 0;
    private animationFrameId: number = 0;
    private gameState: GameState = GameState.LOADING;

    private backgrounds: BackgroundLayer[] = [];
    private ground!: BackgroundLayer;
    private obstacles: Obstacle[] = [];
    private collectibles: Collectible[] = [];

    private obstacleSpawnTimer: number = 0;
    private collectibleSpawnTimer: number = 0;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas with ID '${canvasId}' not found.`);
        }
        this.ctx = this.canvas.getContext('2d')!;
        this.assetManager = new AssetManager();
        this.inputHandler = new InputHandler(this.canvas);

        this.canvas.width = 1280;
        this.canvas.height = 720;

        this.loadGameDataAndStart();
    }

    async loadGameDataAndStart() {
        try {
            const response = await fetch('data.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.gameData = await response.json();
            this.gameSettings = this.gameData.gameSettings;

            this.canvas.width = this.gameSettings.canvasWidth;
            this.canvas.height = this.gameSettings.canvasHeight;

            await this.assetManager.loadAssets(this.gameData.assets);
            this.gameState = GameState.TITLE;
            console.log("Game ready, showing title screen.");
            this.assetManager.playSound('bgm_title', true);

            this.gameLoop(0); // Start the game loop for title screen
        } catch (error) {
            console.error("Failed to load game data or assets:", error);
            this.ctx.fillStyle = 'red';
            this.ctx.font = '30px Arial';
            this.ctx.fillText('ERROR: Failed to load game data or assets.', 50, this.canvas.height / 2);
        }
    }

    private resetGame() {
        this.obstacles = [];
        this.collectibles = [];
        this.obstacleSpawnTimer = 0;
        this.collectibleSpawnTimer = 0;

        const playerSettings = this.gameSettings.player;
        const groundSettings = this.gameSettings.ground;

        // Calculate the absolute Y coordinate of the *top edge* of the visual ground layer
        const visualGroundTopY = this.canvas.height * (1 - groundSettings.height - groundSettings.yOffset);
        // Player's top Y coordinate when perfectly grounded, considering its height and groundOffsetY
        const playerGroundedY = visualGroundTopY - playerSettings.height + playerSettings.groundOffsetY;

        this.player = new Player(
            this.gameSettings.canvasWidth * 0.1,
            playerGroundedY, // Pass the already calculated effective grounded Y
            playerSettings.width,
            playerSettings.height,
            playerSettings.runAnimationFrames,
            'cookie_jump',
            'cookie_slide',
            this.gameSettings,
            this.inputHandler,
            this.assetManager
        );
        this.player.score = 0;

        this.backgrounds = this.gameSettings.backgrounds.map(bg => {
            const image = this.assetManager.getImage(bg.name)!;
            return new BackgroundLayer(
                image,
                this.canvas.height * bg.yOffset,
                this.canvas.width,
                this.canvas.height * bg.height,
                bg.speedMultiplier
            );
        });

        const groundImage = this.assetManager.getImage(groundSettings.name)!;
        this.ground = new BackgroundLayer(
            groundImage,
            visualGroundTopY, // Ground starts at visualGroundTopY
            this.canvas.width,
            this.canvas.height * groundSettings.height,
            1.0
        );

        this.assetManager.stopSound('bgm_title');
        this.assetManager.stopSound('sfx_game_over'); // Ensure game over sound is stopped if it was playing
        this.assetManager.playSound('bgm_game', true);
    }

    private gameLoop = (currentTime: number) => {
        this.animationFrameId = requestAnimationFrame(this.gameLoop);
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        if (deltaTime > 0.1) {
            this.inputHandler.resetFrameState(); // Still reset input during large delta time
            return;
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        switch (this.gameState) {
            case GameState.LOADING:
                this.drawLoadingScreen();
                break;
            case GameState.TITLE:
                this.drawTitleScreen();
                if (this.inputHandler.wasKeyPressedThisFrame('Space') || this.inputHandler.wasClickedThisFrame()) {
                    this.gameState = GameState.GAME;
                    this.resetGame();
                }
                break;
            case GameState.GAME:
                this.updateGame(deltaTime);
                this.drawGame();
                if (this.player.health <= 0) {
                    this.gameState = GameState.GAME_OVER;
                    this.assetManager.stopSound('bgm_game');
                    this.assetManager.playSound('sfx_game_over', false);
                }
                break;
            case GameState.GAME_OVER:
                this.drawGameOverScreen();
                if (this.inputHandler.wasKeyPressedThisFrame('Space') || this.inputHandler.wasClickedThisFrame()) {
                    this.gameState = GameState.TITLE;
                    this.assetManager.playSound('bgm_title', true);
                }
                break;
        }

        this.inputHandler.resetFrameState();
    };

    private updateGame(deltaTime: number) {
        this.player.update(deltaTime, this.gameSettings.gameSpeed);

        this.backgrounds.forEach(bg => bg.update(deltaTime, this.gameSettings.gameSpeed));
        this.ground.update(deltaTime, this.gameSettings.gameSpeed);

        this.obstacleSpawnTimer -= deltaTime;
        if (this.obstacleSpawnTimer <= 0) {
            this.spawnObstacle();
            this.obstacleSpawnTimer = Math.random() *
                                     (this.gameSettings.obstacle.maxSpawnInterval - this.gameSettings.obstacle.minSpawnInterval) +
                                     this.gameSettings.obstacle.minSpawnInterval;
        }

        this.collectibleSpawnTimer -= deltaTime;
        if (this.collectibleSpawnTimer <= 0) {
            this.spawnCollectible();
            this.collectibleSpawnTimer = Math.random() *
                                        (this.gameSettings.collectible.maxSpawnInterval - this.gameSettings.collectible.minSpawnInterval) +
                                        this.gameSettings.collectible.minSpawnInterval;
        }

        this.obstacles = this.obstacles.filter(obstacle => {
            obstacle.update(deltaTime);
            if (this.player.intersects(obstacle) && !this.player.isInvincible()) {
                this.player.takeDamage(1);
                return false;
            }
            return obstacle.x + obstacle.width > 0;
        });

        this.collectibles = this.collectibles.filter(collectible => {
            collectible.update(deltaTime);
            if (this.player.intersects(collectible) && !collectible.collected) {
                collectible.collected = true;
                this.player.addScore(collectible.scoreValue);
                this.assetManager.playSound('sfx_collect', false);
                return false;
            }
            return collectible.x + collectible.width > 0;
        });
    }

    private spawnObstacle() {
        const obstacleSettings = this.gameSettings.obstacle;
        const obstacleImage = this.assetManager.getImage('obstacle_spike')!;
        // Calculate the absolute Y coordinate of the *top edge* of the visual ground layer
        const visualGroundTopY = this.canvas.height * (1 - this.gameSettings.ground.height - this.gameSettings.ground.yOffset);
        const obstacleY = visualGroundTopY - obstacleSettings.height;

        this.obstacles.push(new Obstacle(
            this.canvas.width,
            obstacleY,
            obstacleSettings.width,
            obstacleSettings.height,
            obstacleImage,
            this.gameSettings.gameSpeed * obstacleSettings.speedMultiplier
        ));
    }

    private spawnCollectible() {
        const collectibleSettings = this.gameSettings.collectible;
        const collectibleImage = this.assetManager.getImage('jelly_basic')!;
        
        // Calculate the absolute Y coordinate of the *top edge* of the visual ground layer
        const visualGroundTopY = this.canvas.height * (1 - this.gameSettings.ground.height - this.gameSettings.ground.yOffset);

        // Define the vertical range for collectible spawning based on settings
        const minHeightFromGround = collectibleSettings.minHeightFromGround;
        const maxHeightFromGround = collectibleSettings.maxHeightFromGround;

        // Calculate the Y for the *bottom* of the collectible at its lowest spawn point (closer to ground)
        const collectibleBottomY_lowest = visualGroundTopY - minHeightFromGround;
        // Calculate the Y for the *bottom* of the collectible at its highest spawn point (further from ground)
        const collectibleBottomY_highest = visualGroundTopY - maxHeightFromGround;

        // Convert these bottom Y coordinates to top-left Y coordinates for the GameObject
        const collectibleTopY_lowestSpawnPoint = collectibleBottomY_lowest - collectibleSettings.height; // This will be a larger Y value (lower on screen)
        const collectibleTopY_highestSpawnPoint = collectibleBottomY_highest - collectibleSettings.height; // This will be a smaller Y value (higher on screen)
        
        // Generate a random Y coordinate within the defined range (top-left for GameObject)
        const collectibleY = Math.random() * (collectibleTopY_lowestSpawnPoint - collectibleTopY_highestSpawnPoint) + collectibleTopY_highestSpawnPoint;

        this.collectibles.push(new Collectible(
            this.canvas.width,
            collectibleY,
            collectibleSettings.width,
            collectibleSettings.height,
            collectibleImage,
            this.gameSettings.gameSpeed * collectibleSettings.speedMultiplier,
            collectibleSettings.scoreValue
        ));
    }

    private drawGame() {
        this.backgrounds.forEach(bg => bg.draw(this.ctx));
        this.ground.draw(this.ctx);

        this.player.draw(this.ctx);
        this.obstacles.forEach(obstacle => obstacle.draw(this.ctx));
        this.collectibles.forEach(collectible => collectible.draw(this.ctx));
        this.drawUI();
    }

    private drawUI() {
        this.ctx.font = `${this.gameSettings.ui.scoreFontSize}px Arial`;
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Score: ${this.player.score}`, 20, 40);

        const barX = 20;
        const barY = 60;
        const barWidth = this.gameSettings.ui.healthBarWidth;
        const barHeight = this.gameSettings.ui.healthBarHeight;
        const maxHealth = this.gameSettings.player.maxHealth;
        const currentHealth = this.player.health;

        this.ctx.fillStyle = 'gray';
        this.ctx.fillRect(barX, barY, barWidth, barHeight);

        this.ctx.fillStyle = 'red';
        this.ctx.fillRect(barX, barY, (currentHealth / maxHealth) * barWidth, barHeight);

        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(barX, barY, barWidth, barHeight);
    }

    private drawLoadingScreen() {
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.font = '40px Arial';
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Loading Assets...', this.canvas.width / 2, this.canvas.height / 2 - 20);
        const progress = this.assetManager.getLoadingProgress();
        this.ctx.fillText(`${Math.round(progress * 100)}%`, this.canvas.width / 2, this.canvas.height / 2 + 30);
    }

    private drawTitleScreen() {
        const titleImage = this.assetManager.getImage('title_background');
        if (titleImage) {
            this.ctx.drawImage(titleImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = 'black';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        this.ctx.font = '60px Arial';
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Cookie Run Clone', this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.font = '30px Arial';
        this.ctx.fillText('Press SPACE or Click to Start', this.canvas.width / 2, this.canvas.height / 2 + 50);
    }

    private drawGameOverScreen() {
        const gameOverImage = this.assetManager.getImage('game_over_background');
        if (gameOverImage) {
            this.ctx.drawImage(gameOverImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        this.ctx.font = '80px Arial';
        this.ctx.fillStyle = 'red';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 80);
        this.ctx.font = '40px Arial';
        this.ctx.fillStyle = 'white';
        this.ctx.fillText(`Final Score: ${this.player.score}`, this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.font = '30px Arial';
        this.ctx.fillText('Press SPACE or Click for Title', this.canvas.width / 2, this.canvas.height / 2 + 80);
    }
}

// Add interfaces for the new collectible settings
interface CollectibleSettings {
    width: number;
    height: number;
    minSpawnInterval: number;
    maxSpawnInterval: number;
    scoreValue: number;
    speedMultiplier: number;
    minHeightFromGround: number; // New setting
    maxHeightFromGround: number; // New setting
}