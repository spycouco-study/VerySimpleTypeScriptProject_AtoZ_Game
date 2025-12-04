"use strict";
let config;
const loadedImages = new Map();
const loadedSounds = new Map();
let canvas;
let ctx;
var GameState;
(function (GameState) {
    GameState[GameState["LOADING"] = 0] = "LOADING";
    GameState[GameState["TITLE"] = 1] = "TITLE";
    GameState[GameState["PLAYING"] = 2] = "PLAYING";
    GameState[GameState["GAME_OVER"] = 3] = "GAME_OVER";
})(GameState || (GameState = {}));
let currentGameState = GameState.LOADING;
let lastTime = 0;
let deltaTime = 0; // Time elapsed since last frame in seconds
let player;
const playerBullets = [];
const enemies = [];
const enemyBullets = [];
let score = 0;
let enemySpawnTimer = 0;
let gameOverTimer = 0; // Timer for game over screen display
let gameTimer = 0; // Tracks game duration for level completion
// Background scrolling variables (using two images for seamless loop)
let backgroundPosition1 = 0;
let backgroundPosition2 = 0;
const inputState = {};
// Utility for AABB collision detection
function checkCollision(obj1, obj2) {
    return obj1.x < obj2.x + obj2.width &&
        obj1.x + obj1.width > obj2.x &&
        obj1.y < obj2.y + obj2.height &&
        obj1.y + obj1.height > obj2.y;
}
class Player {
    constructor(x, y, width, height, speed, imageName, health) {
        this.fireCooldown = 0;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.speed = speed;
        this.imageName = imageName;
        this.health = health;
        this.maxHealth = health;
    }
    draw() {
        const imgAsset = loadedImages.get(this.imageName);
        if (imgAsset) {
            ctx.drawImage(imgAsset.img, this.x, this.y, this.width, this.height);
        }
    }
    update(dt) {
        if (inputState['arrowleft'] || inputState['a']) {
            this.x -= this.speed * dt;
        }
        if (inputState['arrowright'] || inputState['d']) {
            this.x += this.speed * dt;
        }
        // Clamp player position to canvas bounds
        this.x = Math.max(0, Math.min(this.x, canvas.width - this.width));
        if (this.fireCooldown > 0) {
            this.fireCooldown -= dt;
        }
        if ((inputState[' '] || inputState['space']) && this.fireCooldown <= 0) {
            const bulletImg = config.assets.images.find(img => img.name === 'player_bullet');
            if (bulletImg) {
                playerBullets.push(new Bullet(this.x + this.width / 2 - bulletImg.width / 2, this.y, bulletImg.width, bulletImg.height, -config.game.playerBulletSpeed, // Y velocity (upwards)
                'player_bullet', config.game.playerBulletDamage, 'player'));
                this.fireCooldown = 1 / config.game.playerFireRate;
                playSound('player_shoot');
            }
        }
    }
    isOffscreen() {
        return false; // Player is always on screen
    }
}
class Bullet {
    constructor(x, y, width, height, speed, imageName, damage, owner) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.speed = speed;
        this.imageName = imageName;
        this.damage = damage;
        this.owner = owner;
    }
    draw() {
        const imgAsset = loadedImages.get(this.imageName);
        if (imgAsset) {
            ctx.drawImage(imgAsset.img, this.x, this.y, this.width, this.height);
        }
    }
    update(dt) {
        this.y += this.speed * dt;
    }
    isOffscreen() {
        return this.y + this.height < 0 || this.y > canvas.height;
    }
}
class Enemy {
    constructor(x, y, width, height, speed, imageName, health) {
        this.fireCooldown = 0;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.speed = speed;
        this.imageName = imageName;
        this.health = health;
        this.fireCooldown = Math.random() * (1 / config.game.enemyFireRate); // Initial random cooldown
    }
    draw() {
        const imgAsset = loadedImages.get(this.imageName);
        if (imgAsset) {
            ctx.drawImage(imgAsset.img, this.x, this.y, this.width, this.height);
        }
    }
    update(dt) {
        this.y += this.speed * dt;
        if (this.fireCooldown > 0) {
            this.fireCooldown -= dt;
        }
        // Enemy firing logic
        if (this.fireCooldown <= 0 && Math.random() < config.game.enemyFireChance * dt) {
            const bulletImg = config.assets.images.find(img => img.name === 'enemy_bullet');
            if (bulletImg) {
                enemyBullets.push(new Bullet(this.x + this.width / 2 - bulletImg.width / 2, this.y + this.height, bulletImg.width, bulletImg.height, config.game.enemyBulletSpeed, // Y velocity (downwards)
                'enemy_bullet', 1, // Enemy bullets deal 1 damage by default
                'enemy'));
                this.fireCooldown = 1 / config.game.enemyFireRate;
            }
        }
    }
    isOffscreen() {
        return this.y > canvas.height;
    }
}
// Sound utilities
function playSound(name) {
    const soundAsset = loadedSounds.get(name);
    if (soundAsset && !soundAsset.loop) { // Only play non-looping sounds
        // Create new Audio instance for sound effects to allow overlapping plays
        const audio = new Audio(soundAsset.audio.src);
        audio.volume = soundAsset.volume;
        audio.play().catch(e => console.error(`Error playing sound ${name}:`, e));
    }
}
function playBGM(name) {
    const soundAsset = loadedSounds.get(name);
    if (soundAsset && soundAsset.loop) { // Only play looping sounds (BGM)
        soundAsset.audio.volume = soundAsset.volume;
        soundAsset.audio.loop = true;
        soundAsset.audio.currentTime = 0; // Ensure it starts from beginning
        soundAsset.audio.play().catch(e => console.error(`Error playing BGM ${name}:`, e));
    }
}
function stopBGM(name) {
    const soundAsset = loadedSounds.get(name);
    if (soundAsset && soundAsset.loop) {
        soundAsset.audio.pause();
        soundAsset.audio.currentTime = 0;
    }
}
// Asset loading function
async function loadAssets(config) {
    const imagePromises = config.assets.images.map(async (imgConfig) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                loadedImages.set(imgConfig.name, { img: img, width: imgConfig.width, height: imgConfig.height });
                resolve();
            };
            img.onerror = () => reject(`Failed to load image: ${imgConfig.path}`);
            img.src = imgConfig.path;
        });
    });
    const soundPromises = config.assets.sounds.map(async (soundConfig) => {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.oncanplaythrough = () => {
                loadedSounds.set(soundConfig.name, { audio: audio, volume: soundConfig.volume, loop: soundConfig.loop || false });
                resolve();
            };
            audio.onerror = () => reject(`Failed to load sound: ${soundConfig.path}`);
            audio.src = soundConfig.path;
            audio.load(); // Start loading
            // Attempt to play/pause with volume 0 to load metadata and try bypassing autoplay restrictions
            audio.volume = 0;
            audio.play().then(() => audio.pause()).catch(() => { });
        });
    });
    await Promise.all([...imagePromises, ...soundPromises]);
}
// Game initialization
function initGame() {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error("Canvas element with ID 'gameCanvas' not found.");
        return;
    }
    ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error("Failed to get 2D rendering context.");
        return;
    }
    // Load configuration and assets
    fetch('data.json')
        .then(response => response.json())
        .then((data) => {
        config = data;
        canvas.width = config.game.canvasWidth;
        canvas.height = config.game.canvasHeight;
        // Initialize background positions
        const bgImageHeight = config.assets.images.find(img => img.name === 'background')?.height || canvas.height;
        backgroundPosition1 = 0;
        backgroundPosition2 = -bgImageHeight;
        return loadAssets(config);
    })
        .then(() => {
        console.log('Assets loaded successfully!');
        currentGameState = GameState.TITLE;
        requestAnimationFrame(gameLoop); // Start the game loop after assets are loaded
    })
        .catch(error => {
        console.error('Failed to load game configuration or assets:', error);
        // Display error message on canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'red';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('ERROR: ' + error, canvas.width / 2, canvas.height / 2);
    });
    // Input event listeners
    window.addEventListener('keydown', (e) => {
        inputState[e.key.toLowerCase()] = true;
        if (currentGameState === GameState.TITLE && (e.key === ' ' || e.key === 'Enter')) {
            startGame();
        }
        if (currentGameState === GameState.GAME_OVER && (e.key === ' ' || e.key === 'Enter')) {
            restartGame();
        }
    });
    window.addEventListener('keyup', (e) => {
        inputState[e.key.toLowerCase()] = false;
    });
    // Handle touch/click for starting game on mobile/touch devices
    canvas.addEventListener('click', () => {
        if (currentGameState === GameState.TITLE) {
            startGame();
        }
        if (currentGameState === GameState.GAME_OVER) {
            restartGame();
        }
    });
}
function startGame() {
    if (currentGameState !== GameState.TITLE)
        return;
    const playerImg = config.assets.images.find(img => img.name === 'player');
    if (!playerImg) {
        console.error("Player image configuration not found!");
        return;
    }
    player = new Player(canvas.width / 2 - playerImg.width / 2, canvas.height - playerImg.height - 30, playerImg.width, playerImg.height, config.game.playerSpeed, 'player', config.game.playerHealth);
    playerBullets.length = 0;
    enemies.length = 0;
    enemyBullets.length = 0;
    score = 0;
    enemySpawnTimer = 0;
    gameOverTimer = 0;
    gameTimer = 0;
    // Reset background positions
    const bgImageHeight = config.assets.images.find(img => img.name === 'background')?.height || canvas.height;
    backgroundPosition1 = 0;
    backgroundPosition2 = -bgImageHeight;
    currentGameState = GameState.PLAYING;
    playBGM('bgm');
}
function restartGame() {
    stopBGM('bgm'); // Stop BGM before restarting
    startGame();
}
function update(dt) {
    switch (currentGameState) {
        case GameState.PLAYING:
            gameTimer += dt;
            // Check for level completion
            if (gameTimer >= config.game.levelDuration) {
                currentGameState = GameState.GAME_OVER; // Simplified: level ends, you win!
                stopBGM('bgm');
                playSound('game_over'); // Assuming game_over can also be 'level complete' sound
                return;
            }
            // Background scrolling
            const bgImage = loadedImages.get('background');
            const bgImageHeight = bgImage ? bgImage.height : canvas.height;
            const effectiveScrollSpeed = config.game.scrollSpeed * config.game.backgroundSpeedMultiplier;
            backgroundPosition1 += effectiveScrollSpeed * dt;
            backgroundPosition2 += effectiveScrollSpeed * dt;
            if (backgroundPosition1 >= canvas.height) {
                backgroundPosition1 = backgroundPosition2 - bgImageHeight;
            }
            if (backgroundPosition2 >= canvas.height) {
                backgroundPosition2 = backgroundPosition1 - bgImageHeight;
            }
            player.update(dt);
            // Update player bullets
            for (let i = playerBullets.length - 1; i >= 0; i--) {
                const bullet = playerBullets[i];
                bullet.update(dt);
                if (bullet.isOffscreen()) {
                    playerBullets.splice(i, 1);
                }
            }
            // Update enemies & spawn new ones
            enemySpawnTimer += dt;
            if (enemySpawnTimer >= config.game.enemySpawnInterval && enemies.length < config.game.maxEnemies) {
                const enemyImageConfig = config.assets.images.find(img => img.name === 'enemy');
                if (enemyImageConfig) {
                    const x = Math.random() * (canvas.width - enemyImageConfig.width);
                    const y = -enemyImageConfig.height; // Spawn slightly above canvas
                    enemies.push(new Enemy(x, y, enemyImageConfig.width, enemyImageConfig.height, config.game.enemySpeed, 'enemy', config.game.enemyHealth));
                    enemySpawnTimer = 0;
                }
            }
            for (let i = enemies.length - 1; i >= 0; i--) {
                const enemy = enemies[i];
                enemy.update(dt);
                if (enemy.isOffscreen()) {
                    enemies.splice(i, 1);
                }
            }
            // Update enemy bullets
            for (let i = enemyBullets.length - 1; i >= 0; i--) {
                const bullet = enemyBullets[i];
                bullet.update(dt);
                if (bullet.isOffscreen()) {
                    enemyBullets.splice(i, 1);
                }
            }
            // Collision Detection
            // Player Bullets vs Enemies
            for (let i = playerBullets.length - 1; i >= 0; i--) {
                const bullet = playerBullets[i];
                if (bullet.owner !== 'player')
                    continue; // Only player bullets hit enemies
                for (let j = enemies.length - 1; j >= 0; j--) {
                    const enemy = enemies[j];
                    if (checkCollision(bullet, enemy)) {
                        enemy.health -= bullet.damage;
                        playerBullets.splice(i, 1); // Remove bullet
                        if (enemy.health <= 0) {
                            enemies.splice(j, 1); // Remove enemy
                            score += config.game.enemyScoreValue;
                            playSound('enemy_hit');
                        }
                        break; // Bullet can only hit one enemy
                    }
                }
            }
            // Player vs Enemies
            for (let i = enemies.length - 1; i >= 0; i--) {
                const enemy = enemies[i];
                if (checkCollision(player, enemy)) {
                    player.health -= 1; // Player takes 1 damage from collision
                    enemies.splice(i, 1); // Remove enemy
                    playSound('enemy_hit'); // Use same sound for player damage
                    if (player.health <= 0) {
                        currentGameState = GameState.GAME_OVER;
                        stopBGM('bgm');
                        playSound('game_over');
                    }
                }
            }
            // Player vs Enemy Bullets
            for (let i = enemyBullets.length - 1; i >= 0; i--) {
                const bullet = enemyBullets[i];
                if (bullet.owner !== 'enemy')
                    continue; // Only enemy bullets hit player
                if (checkCollision(player, bullet)) {
                    player.health -= bullet.damage;
                    enemyBullets.splice(i, 1); // Remove bullet
                    playSound('enemy_hit'); // Use same sound for player damage
                    if (player.health <= 0) {
                        currentGameState = GameState.GAME_OVER;
                        stopBGM('bgm');
                        playSound('game_over');
                    }
                    break; // Player can only be hit by one bullet at a time for simplicity
                }
            }
            break;
        case GameState.GAME_OVER:
            gameOverTimer += dt; // Increment timer for display purposes
            break;
    }
}
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas
    // Draw scrolling background
    const bgImage = loadedImages.get('background');
    if (bgImage) {
        ctx.drawImage(bgImage.img, 0, backgroundPosition1, canvas.width, bgImage.height);
        ctx.drawImage(bgImage.img, 0, backgroundPosition2, canvas.width, bgImage.height);
    }
    if (currentGameState === GameState.PLAYING) {
        player.draw();
        playerBullets.forEach(bullet => bullet.draw());
        enemies.forEach(enemy => enemy.draw());
        enemyBullets.forEach(bullet => bullet.draw());
        // Draw UI
        ctx.fillStyle = 'white';
        ctx.font = '20px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Score: ${score}`, 10, 30);
        ctx.fillText(`Health: ${player.health}/${player.maxHealth}`, 10, 60);
        const timeLeft = Math.max(0, Math.floor(config.game.levelDuration - gameTimer));
        ctx.fillText(`Time: ${timeLeft}s`, canvas.width - 120, 30);
    }
    else if (currentGameState === GameState.TITLE) {
        ctx.fillStyle = 'white';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Simple Shooter', canvas.width / 2, canvas.height / 2 - 50);
        ctx.font = '24px Arial';
        ctx.fillText('Press SPACE or Click to Start', canvas.width / 2, canvas.height / 2 + 20);
    }
    else if (currentGameState === GameState.GAME_OVER) {
        ctx.fillStyle = 'white';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER!', canvas.width / 2, canvas.height / 2 - 50);
        ctx.font = '36px Arial';
        ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 + 10);
        if (gameOverTimer > 1) { // Wait a bit before showing restart prompt
            ctx.font = '24px Arial';
            ctx.fillText('Press SPACE or Click to Restart', canvas.width / 2, canvas.height / 2 + 70);
        }
    }
    else if (currentGameState === GameState.LOADING) {
        ctx.fillStyle = 'white';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('LOADING...', canvas.width / 2, canvas.height / 2);
    }
}
// Main game loop
function gameLoop(timestamp) {
    if (lastTime === 0)
        lastTime = timestamp;
    deltaTime = (timestamp - lastTime) / 1000; // Convert milliseconds to seconds
    lastTime = timestamp;
    update(deltaTime);
    draw();
    requestAnimationFrame(gameLoop);
}
// Ensure the game starts when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initGame);
