const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');

if (!ctx) {
    alert('2D context not supported for canvas!');
    throw new Error('2D context not supported');
}

// Canvas dimensions
canvas.width = 480;
canvas.height = 640;

// Game states
let gameRunning = true;
let score = 0;
let playerHealth = 3;
let gameOver = false;

// Level system variables
let currentLevel = 1;
let enemiesSpawnedInCurrentLevel = 0; // Regular enemies spawned for the current level
let bossInstance: Boss | null = null;
let isBossActive = false;
let levelState: 'spawning' | 'waiting_for_boss' | 'boss_active' | 'level_clear' | 'game_complete' = 'spawning';
let levelTransitionDelay = 0;
const LEVEL_TRANSITION_DURATION = 3000; // 3 seconds for level clear message

// New interfaces for level data
interface EnemyConfig {
    speed: number;
    health: number;
    shotCooldown: number; // ms
    amplitude: number; // for sine wave movement
    frequency: number; // for sine wave movement
    bulletSpeed: number;
    scoreValue: number;
}

interface BossConfig extends EnemyConfig {
    name: string;
    bulletPatternType: 'single' | 'spread' | 'barrage';
    specialAbilityCooldown?: number; // ms
    width: number;
    height: number;
}

interface LevelData {
    levelNumber: number;
    regularEnemiesToSpawn: number; // Total regular enemies for this level
    regularEnemySpawnInterval: number; // ms interval for spawning regular enemies
    enemyConfig: EnemyConfig; // Base config for regular enemies in this level
    bossConfig: BossConfig; // Every level has a boss
    levelClearScoreBonus: number;
}

// Game Data: Level Definitions
const LEVEL_DATA: LevelData[] = [
    {
        levelNumber: 1,
        regularEnemiesToSpawn: 5,
        regularEnemySpawnInterval: 1800,
        enemyConfig: { speed: 80, health: 1, shotCooldown: 2000, amplitude: 70, frequency: 1.5, bulletSpeed: 200, scoreValue: 10 },
        bossConfig: {
            name: "Mini-Boss",
            speed: 40, health: 5, shotCooldown: 2000, amplitude: 0, frequency: 0, bulletSpeed: 180, scoreValue: 200,
            bulletPatternType: 'single',
            width: 80, height: 70
        },
        levelClearScoreBonus: 50
    },
    {
        levelNumber: 2,
        regularEnemiesToSpawn: 7,
        regularEnemySpawnInterval: 1500,
        enemyConfig: { speed: 100, health: 1, shotCooldown: 1800, amplitude: 80, frequency: 1.8, bulletSpeed: 220, scoreValue: 15 },
        bossConfig: {
            name: "Alpha Striker",
            speed: 50, health: 10, shotCooldown: 1500, amplitude: 0, frequency: 0, bulletSpeed: 250, scoreValue: 500,
            bulletPatternType: 'spread',
            width: 120, height: 100
        },
        levelClearScoreBonus: 100
    },
    {
        levelNumber: 3,
        regularEnemiesToSpawn: 10,
        regularEnemySpawnInterval: 1200,
        enemyConfig: { speed: 120, health: 2, shotCooldown: 1500, amplitude: 90, frequency: 2.0, bulletSpeed: 250, scoreValue: 20 },
        bossConfig: {
            name: "Omega Destroyer",
            speed: 60, health: 20, shotCooldown: 1000, amplitude: 0, frequency: 0, bulletSpeed: 300, scoreValue: 1000,
            bulletPatternType: 'barrage', specialAbilityCooldown: 5000,
            width: 150, height: 130
        },
        levelClearScoreBonus: 200
    }
    // More levels can be added here following the same structure
];


// Input handling
const keys: { [key: string]: boolean } = {};
window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
});
window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Game entities
class Player {
    x: number;
    y: number;
    width: number = 40;
    height: number = 40;
    speed: number = 200; // pixels per second
    lastShotTime: number = 0;
    shotCooldown: number = 200; // milliseconds

    constructor() {
        this.x = canvas.width / 2 - this.width / 2;
        this.y = canvas.height - this.height - 30;
    }

    update(deltaTime: number) {
        if (gameOver) return;

        const moveAmount = this.speed * deltaTime;

        if (keys['ArrowLeft'] || keys['a']) {
            this.x -= moveAmount;
        }
        if (keys['ArrowRight'] || keys['d']) {
            this.x += moveAmount;
        }
        if (keys['ArrowUp'] || keys['w']) {
            this.y -= moveAmount;
        }
        if (keys['ArrowDown'] || keys['s']) {
            this.y += moveAmount;
        }

        // Keep player within canvas bounds
        this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));
        this.y = Math.max(0, Math.min(canvas.height - this.height, this.y));

        if ((keys[' '] || keys['Spacebar']) && Date.now() - this.lastShotTime > this.shotCooldown) {
            bullets.push(new Bullet(this.x + this.width / 2 - 2, this.y));
            this.lastShotTime = Date.now();
        }
    }

    draw() {
        ctx!.fillStyle = 'blue';
        ctx!.fillRect(this.x, this.y, this.width, this.height);
        ctx!.fillStyle = 'skyblue'; // cockpit
        ctx!.fillRect(this.x + this.width / 4, this.y - this.height / 4, this.width / 2, this.height / 2);
    }
}

class Bullet {
    x: number;
    y: number;
    width: number = 4;
    height: number = 10;
    speed: number = 400; // pixels per second

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    update(deltaTime: number) {
        this.y -= this.speed * deltaTime;
    }

    draw() {
        ctx!.fillStyle = 'yellow';
        ctx!.fillRect(this.x, this.y, this.width, this.height);
    }
}

// New class for enemy bullets
class EnemyBullet {
    x: number;
    y: number;
    width: number = 4;
    height: number = 10;
    speed: number; // pixels per second (slower than player bullets)
    directionX: number; // For angled shots

    constructor(x: number, y: number, speed: number = 200, directionX: number = 0) {
        this.x = x;
        this.y = y;
        this.speed = speed;
        this.directionX = directionX;
    }

    update(deltaTime: number) {
        this.y += this.speed * deltaTime; // Move downwards
        this.x += this.directionX * (this.speed * 0.3) * deltaTime; // Horizontal movement for angled shots
    }

    draw() {
        ctx!.fillStyle = 'lime'; // Different color for enemy bullets
        ctx!.fillRect(this.x, this.y, this.width, this.height);
    }
}

class Enemy {
    x: number;
    y: number;
    width: number = 30;
    height: number = 30;
    speed: number;
    health: number;
    initialX: number; // Store initial X for sine wave horizontal movement
    amplitude: number; // How far left/right it swings
    frequency: number; // How fast it swings (radians per second)
    timeAlive: number = 0; // To track elapsed time for sine wave calculation
    lastShotTime: number = 0;
    shotCooldown: number; // milliseconds between shots for this enemy
    bulletSpeed: number;
    scoreValue: number;

    constructor(x: number, y: number, config: EnemyConfig) {
        this.x = x;
        this.y = y;
        this.initialX = x; // Store the spawn X
        this.speed = config.speed;
        this.health = config.health;
        this.amplitude = config.amplitude;
        this.frequency = config.frequency;
        this.shotCooldown = config.shotCooldown;
        this.bulletSpeed = config.bulletSpeed;
        this.scoreValue = config.scoreValue;
        // Stagger initial shot times for enemies
        this.lastShotTime = Date.now() - (this.shotCooldown - (Math.random() * this.shotCooldown));
    }

    update(deltaTime: number) {
        this.timeAlive += deltaTime;
        // Vertical movement
        this.y += this.speed * deltaTime;
        // Horizontal sine wave movement for "constant movement"
        this.x = this.initialX + Math.sin(this.timeAlive * this.frequency) * this.amplitude;

        // Keep enemy within horizontal canvas bounds even with sine wave
        this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));

        // Enemy firing logic
        if (Date.now() - this.lastShotTime > this.shotCooldown) {
            // Fire a bullet from the bottom-center of the enemy
            enemyBullets.push(new EnemyBullet(this.x + this.width / 2 - 2, this.y + this.height, this.bulletSpeed));
            this.lastShotTime = Date.now();
        }
    }

    draw() {
        ctx!.fillStyle = 'red';
        ctx!.fillRect(this.x, this.y, this.width, this.height);
        ctx!.fillStyle = 'orange'; // cockpit
        ctx!.fillRect(this.x + this.width / 4, this.y + this.height / 4, this.width / 2, this.height / 2);
    }
}

class Boss extends Enemy {
    name: string;
    bulletPatternType: 'single' | 'spread' | 'barrage';
    specialAbilityCooldown: number | undefined;
    lastSpecialAbilityTime: number = 0;
    maxHealth: number; // Store max health for health bar display

    constructor(x: number, y: number, config: BossConfig) {
        super(x, y, config); // Pass config to Enemy constructor
        this.width = config.width; // Boss is bigger
        this.height = config.height;
        this.speed = config.speed; // Boss might have different base speed
        this.health = config.health;
        this.maxHealth = config.health; // Store max health for health bar display
        this.shotCooldown = config.shotCooldown;
        this.bulletSpeed = config.bulletSpeed; // Boss bullets might be faster
        this.scoreValue = config.scoreValue;

        this.name = config.name;
        this.bulletPatternType = config.bulletPatternType;
        this.specialAbilityCooldown = config.specialAbilityCooldown;
        // Boss typically doesn't move horizontally with sine wave by default,
        // but amplitude/frequency are inherited from Enemy if config sets them.
        this.amplitude = config.amplitude || 0;
        this.frequency = config.frequency || 0;
        this.initialX = x;
        this.lastShotTime = Date.now() - (this.shotCooldown - (Math.random() * this.shotCooldown * 0.5));
    }

    update(deltaTime: number) {
        this.timeAlive += deltaTime;
        // Boss moves down until a certain point, then stops or moves differently
        if (this.y < canvas.height / 4 - this.height / 2) { // Boss stops around 1/4 of the screen height
            this.y += this.speed * deltaTime;
        } else if (this.amplitude > 0 && this.frequency > 0) { // If it has lateral movement config
            this.x = this.initialX + Math.sin(this.timeAlive * this.frequency) * this.amplitude;
        }

        // Keep boss within horizontal canvas bounds
        this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));

        // Boss firing logic
        if (Date.now() - this.lastShotTime > this.shotCooldown) {
            this.fireBulletPattern();
            this.lastShotTime = Date.now();
        }

        // Special ability (if any)
        if (this.specialAbilityCooldown && Date.now() - this.lastSpecialAbilityTime > this.specialAbilityCooldown) {
            this.fireSpecialAbility();
            this.lastSpecialAbilityTime = Date.now();
        }
    }

    fireBulletPattern() {
        const bulletSpawnX = this.x + this.width / 2 - 2;
        const bulletSpawnY = this.y + this.height;
        switch (this.bulletPatternType) {
            case 'single':
                enemyBullets.push(new EnemyBullet(bulletSpawnX, bulletSpawnY, this.bulletSpeed));
                break;
            case 'spread':
                enemyBullets.push(new EnemyBullet(bulletSpawnX, bulletSpawnY, this.bulletSpeed));
                enemyBullets.push(new EnemyBullet(this.x + this.width / 4, bulletSpawnY, this.bulletSpeed, -0.5));
                enemyBullets.push(new EnemyBullet(this.x + 3 * this.width / 4, bulletSpawnY, this.bulletSpeed, 0.5));
                break;
            case 'barrage':
                for (let i = 0; i < 5; i++) {
                    setTimeout(() => {
                        const offset = (Math.random() - 0.5) * this.width * 0.4;
                        enemyBullets.push(new EnemyBullet(bulletSpawnX + offset, bulletSpawnY, this.bulletSpeed * 1.2));
                    }, i * 120);
                }
                break;
        }
    }

    fireSpecialAbility() {
        // Example: A wider spread or a small burst of faster bullets
        if (this.bulletPatternType === 'barrage') {
            for (let i = 0; i < 7; i++) {
                setTimeout(() => {
                    const angleOffset = (i - 3) * 0.3; // -3, -2, -1, 0, 1, 2, 3
                    enemyBullets.push(new EnemyBullet(this.x + this.width / 2 - 2, this.y + this.height, this.bulletSpeed * 1.5, angleOffset));
                }, i * 80);
            }
        } else if (this.bulletPatternType === 'spread') {
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    const offset = (i - 1) * this.width * 0.3;
                    enemyBullets.push(new EnemyBullet(this.x + this.width / 2 - 2 + offset, this.y + this.height, this.bulletSpeed * 1.3));
                }, i * 150);
            }
        }
    }

    draw() {
        ctx!.fillStyle = 'purple';
        ctx!.fillRect(this.x, this.y, this.width, this.height);
        ctx!.fillStyle = 'magenta';
        ctx!.fillRect(this.x + this.width / 4, this.y + this.height / 4, this.width / 2, this.height / 2);

        // Draw boss health bar
        const healthBarWidth = this.width * 0.8;
        const healthBarHeight = 5;
        const healthBarX = this.x + (this.width - healthBarWidth) / 2;
        const healthBarY = this.y + this.height + 10;
        ctx!.fillStyle = 'gray';
        ctx!.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
        ctx!.fillStyle = 'green';
        ctx!.fillRect(healthBarX, healthBarY, healthBarWidth * (this.health / this.maxHealth), healthBarHeight);

        // Draw boss name
        ctx!.fillStyle = 'white';
        ctx!.font = '16px Arial';
        ctx!.textAlign = 'center';
        ctx!.fillText(this.name, this.x + this.width / 2, this.y - 15);
        ctx!.textAlign = 'left';
    }
}

class Background {
    scrollSpeed: number = 50; // pixels per second
    scrollY: number = 0;

    update(deltaTime: number) {
        this.scrollY += this.scrollSpeed * deltaTime;
        if (this.scrollY >= canvas.height) {
            this.scrollY = 0;
        }
    }

    draw() {
        // Draw two background segments to simulate seamless scrolling
        ctx!.fillStyle = '#333'; // Dark background for space
        ctx!.fillRect(0, this.scrollY, canvas.width, canvas.height);
        ctx!.fillRect(0, this.scrollY - canvas.height, canvas.width, canvas.height);

        // Add some stars for visual effect
        ctx!.fillStyle = 'white';
        const numStars = 50;
        for (let i = 0; i < numStars; i++) {
            const starX = (i * 103 + this.scrollY * 0.1) % canvas.width; // Offset based on scroll to make them move
            const starY = (i * 71 + this.scrollY * 0.5) % (canvas.height * 2); // Scroll stars faster
            if (starY < canvas.height) { // Only draw visible stars
                ctx!.fillRect(starX, starY, 1, 1);
            }
        }
    }
}

// Collision detection (AABB)
function checkCollision(obj1: { x: number; y: number; width: number; height: number }, obj2: { x: number; y: number; width: number; height: number }) {
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
}

const player = new Player();
const bullets: Bullet[] = [];
const enemies: Enemy[] = [];
const enemyBullets: EnemyBullet[] = []; // New array for enemy bullets
const background = new Background();

let lastEnemySpawnTime = 0; // Managed by level system now

let lastTime = 0;

// Function to reset game state for a new level or game start
function resetGameStateForLevel() {
    enemies.length = 0;
    enemyBullets.length = 0;
    bullets.length = 0; // Clear player bullets
    enemiesSpawnedInCurrentLevel = 0;
    bossInstance = null;
    isBossActive = false;
    levelTransitionDelay = 0;
    lastEnemySpawnTime = Date.now(); // Reset spawn timer
    player.x = canvas.width / 2 - player.width / 2; // Reset player position
    player.y = canvas.height - player.height - 30;
    // Player health and score are persistent across levels, unless reset on game over
}

function advanceLevel() {
    currentLevel++;
    if (currentLevel > LEVEL_DATA.length) {
        levelState = 'game_complete'; // All levels cleared
        gameOver = true;
        gameRunning = false;
        return;
    }
    levelState = 'spawning';
    resetGameStateForLevel();
}

function update(currentTime: number) {
    if (!gameRunning) return;

    const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
    lastTime = currentTime;

    if (gameOver) {
        // Game over state, no further updates to entities
        return;
    }

    // Update background
    background.update(deltaTime);

    // Update player
    player.update(deltaTime);

    // Update player bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.update(deltaTime);
        if (bullet.y + bullet.height < 0) {
            bullets.splice(i, 1); // Remove off-screen player bullets
        }
    }

    // --- Level Management Logic ---
    const currentLevelData = LEVEL_DATA[currentLevel - 1];

    if (levelState === 'spawning') {
        // Spawn regular enemies
        if (Date.now() - lastEnemySpawnTime > currentLevelData.regularEnemySpawnInterval &&
            enemiesSpawnedInCurrentLevel < currentLevelData.regularEnemiesToSpawn) {
            const randomX = Math.random() * (canvas.width - 40);
            enemies.push(new Enemy(randomX, -40, currentLevelData.enemyConfig));
            enemiesSpawnedInCurrentLevel++;
            lastEnemySpawnTime = Date.now();
        }

        // Check if all regular enemies for the level have been spawned AND all currently active enemies are defeated
        if (enemiesSpawnedInCurrentLevel >= currentLevelData.regularEnemiesToSpawn && enemies.length === 0) {
            // Trigger boss spawn
            bossInstance = new Boss(canvas.width / 2 - currentLevelData.bossConfig.width / 2, -currentLevelData.bossConfig.height, currentLevelData.bossConfig);
            isBossActive = true;
            enemyBullets.length = 0; // Clear enemy bullets before boss fight
            levelState = 'waiting_for_boss';
        }
    } else if (levelState === 'waiting_for_boss') {
        // Boss has just appeared, let it move into position.
        // It's technically active, but this state could be used for a boss intro.
        // Once boss is sufficiently visible (e.g., entered screen fully), switch to active state
        if (bossInstance && bossInstance.y >= 0) { 
            levelState = 'boss_active';
        }
    } else if (levelState === 'boss_active') {
        // Update boss, handle boss-specific logic.
        // Boss defeat check is handled in collision detection.
        if (bossInstance && bossInstance.health <= 0) {
            // Boss defeated logic already handled in collision (score added there)
            isBossActive = false;
            bossInstance = null;
            enemyBullets.length = 0; // Clear boss bullets
            levelState = 'level_clear';
            levelTransitionDelay = Date.now(); // Start timer for level transition
            score += currentLevelData.levelClearScoreBonus; // Add level clear bonus after boss
        }
    } else if (levelState === 'level_clear') {
        // Display level clear message, wait for transition
        if (Date.now() - levelTransitionDelay > LEVEL_TRANSITION_DURATION) {
            advanceLevel();
        }
    } else if (levelState === 'game_complete') {
        // Game completed, nothing to update further, UI will show message.
        return;
    }
    // --- End Level Management Logic ---


    // Update enemies (if any)
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        enemy.update(deltaTime);
        if (enemy.y > canvas.height) { // Remove off-screen enemies
            enemies.splice(i, 1);
        }
    }

    // Update boss if active
    if (bossInstance && isBossActive) {
        bossInstance.update(deltaTime);
    }

    // Update enemy bullets
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const bullet = enemyBullets[i];
        bullet.update(deltaTime);
        if (bullet.y > canvas.height || bullet.x < -bullet.width || bullet.x > canvas.width + bullet.width) { // Remove off-screen enemy bullets (bottom and sides)
            enemyBullets.splice(i, 1);
        }
    }

    // Collision detection

    // Player Bullet-Enemy collision
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        let bulletHit = false;

        // Check collision with regular enemies
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            if (checkCollision(bullet, enemy)) {
                enemy.health--;
                if (enemy.health <= 0) {
                    enemies.splice(j, 1); // Remove enemy
                    score += currentLevelData.enemyConfig.scoreValue;
                }
                bullets.splice(i, 1); // Remove bullet
                bulletHit = true;
                break; // A player bullet can only hit one enemy
            }
        }
        // Check collision with boss
        if (!bulletHit && bossInstance && isBossActive && i >= 0) { // Check i again as it might have been spliced
            const currentBullet = bullets[i]; // Get the bullet again after potential splice
            if (checkCollision(currentBullet, bossInstance)) {
                bossInstance.health--;
                bullets.splice(i, 1); // Remove bullet
                bulletHit = true;
                if (bossInstance.health <= 0) {
                    // Boss defeated - score for boss is added here
                    score += currentLevelData.bossConfig.scoreValue;
                }
            }
        }
    }

    // Player-Enemy collision (regular enemies)
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        if (checkCollision(player, enemy)) {
            enemies.splice(i, 1); // Remove enemy
            playerHealth--;
            if (playerHealth <= 0) {
                gameOver = true;
                gameRunning = false;
            }
            break; // Player can only collide with one enemy per frame for simplicity
        }
    }

    // Player-Boss collision
    if (bossInstance && isBossActive && checkCollision(player, bossInstance)) {
        playerHealth--; // Player takes damage from boss collision
        if (playerHealth <= 0) {
            gameOver = true;
            gameRunning = false;
        }
        // Boss does not take damage from player collision for simplicity
    }

    // Player-EnemyBullet collision
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const enemyBullet = enemyBullets[i];
        if (checkCollision(player, enemyBullet)) {
            enemyBullets.splice(i, 1); // Remove enemy bullet
            playerHealth--;
            if (playerHealth <= 0) {
                gameOver = true;
                gameRunning = false;
            }
            // For simplicity, a player can be hit by multiple enemy bullets in one frame
        }
    }
}

function draw() {
    ctx!.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    background.draw();

    // Draw player
    player.draw();

    // Draw player bullets
    bullets.forEach(bullet => bullet.draw());

    // Draw enemies
    enemies.forEach(enemy => enemy.draw());

    // Draw enemy bullets
    enemyBullets.forEach(bullet => bullet.draw());

    // Draw boss
    if (bossInstance && isBossActive) {
        bossInstance.draw();
    }

    // Draw UI
    ctx!.fillStyle = 'white';
    ctx!.font = '20px Arial';
    ctx!.fillText(`Score: ${score}`, 10, 30);
    ctx!.fillText(`Health: ${playerHealth}`, 10, 60);
    ctx!.fillText(`Level: ${currentLevel}`, 10, 90);

    if (gameOver) {
        ctx!.fillStyle = 'red';
        ctx!.font = '40px Arial';
        ctx!.textAlign = 'center';
        if (levelState === 'game_complete') {
            ctx!.fillText('YOU WIN!', canvas.width / 2, canvas.height / 2 - 20);
            ctx!.font = '25px Arial';
            ctx!.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2 + 20);
        } else {
            ctx!.fillText('GAME OVER!', canvas.width / 2, canvas.height / 2);
        }
        ctx!.font = '20px Arial';
        ctx!.fillText('Press F5 to Restart', canvas.width / 2, canvas.height / 2 + 60);
        ctx!.textAlign = 'left';
    } else if (levelState === 'level_clear') {
        ctx!.fillStyle = 'green';
        ctx!.font = '40px Arial';
        ctx!.textAlign = 'center';
        ctx!.fillText(`LEVEL ${currentLevel} CLEARED!`, canvas.width / 2, canvas.height / 2);
        ctx!.textAlign = 'left';
    }
}

function gameLoop(currentTime: number) {
    if (!lastTime) lastTime = currentTime;
    update(currentTime);
    draw();
    if (gameRunning) {
        requestAnimationFrame(gameLoop);
    }
}

// Start the game loop
resetGameStateForLevel(); // Initialize level 1 state
requestAnimationFrame(gameLoop);