// Define interfaces for game entities and data structure for type safety
interface GameSettings {
    canvasWidth: number;
    canvasHeight: number;
    player: {
        speed: number;
        health: number;
        width: number;
        height: number;
        fireCooldown: number;
    };
    bullet: {
        speed: number;
        width: number;
        height: number;
        damage: number;
    };
    enemy: {
        speedMin: number;
        speedMax: number;
        health: number;
        width: number;
        height: number;
        scoreValue: number;
    };
    enemySpawnInterval: number;
    initialScore: number;
    titleScreenText: string;
    gameOverScreenText: string;
    restartScreenText: string;
    fontFamily: string;
    fontSize: number;
    textColor: string;
}

interface ImageData {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface SoundData {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface GameData {
    assets: {
        images: ImageData[];
        sounds: SoundData[];
    };
    gameSettings: GameSettings;
}

interface Player {
    x: number;
    y: number;
    width: number;
    height: number;
    speed: number;
    health: number;
    lastFireTime: number;
    fireCooldown: number;
}

interface Bullet {
    x: number;
    y: number;
    width: number;
    height: number;
    speed: number;
    damage: number;
}

interface Enemy {
    x: number;
    y: number;
    width: number;
    height: number;
    speed: number;
    health: number;
    scoreValue: number;
}

type GameState = 'TITLE' | 'PLAYING' | 'GAME_OVER';

// --- Game Globals ---
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let gameData: GameData;
const loadedImages = new Map<string, HTMLImageElement>();
const loadedSounds = new Map<string, HTMLAudioElement>();

let gameState: GameState = 'TITLE';
let player: Player;
let bullets: Bullet[] = [];
let enemies: Enemy[] = [];
let score: number = 0;
let lastFrameTime: DOMHighResTimeStamp = 0;
let enemySpawnTimer: number = 0;

const pressedKeys = new Set<string>();

// --- Asset Loading ---
async function loadAssets(): Promise<void> {
    try {
        const response = await fetch('data.json');
        gameData = await response.json();

        const imagePromises = gameData.assets.images.map(imgData => {
            return new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.src = imgData.path;
                img.onload = () => {
                    loadedImages.set(imgData.name, img);
                    resolve();
                };
                img.onerror = () => reject(`Failed to load image: ${imgData.path}`);
            });
        });

        const soundPromises = gameData.assets.sounds.map(soundData => {
            return new Promise<void>((resolve) => {
                const audio = new Audio(soundData.path);
                audio.volume = soundData.volume;
                audio.oncanplaythrough = () => {
                    loadedSounds.set(soundData.name, audio);
                    resolve();
                };
                audio.onerror = () => {
                    console.warn(`Failed to load sound: ${soundData.path}`);
                    loadedSounds.set(soundData.name, audio); // Still add it, just might not play
                    resolve();
                };
                // Add a timeout to prevent indefinite blocking if sound fails to load event
                setTimeout(() => {
                    if (!loadedSounds.has(soundData.name)) {
                        console.warn(`Sound loading timeout for: ${soundData.path}. Proceeding.`);
                        loadedSounds.set(soundData.name, audio); // Ensure it's in the map even if failed
                        resolve();
                    }
                }, 5000); // 5 second timeout
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log('All assets loaded.');
    } catch (error) {
        console.error('Error loading game data or assets:', error);
        alert('Failed to load game. Please check console for details.');
    }
}

// --- Input Handling ---
function handleKeyDown(event: KeyboardEvent) {
    pressedKeys.add(event.code);
    if (gameState === 'TITLE' || gameState === 'GAME_OVER') {
        startGame();
    }
}

function handleKeyUp(event: KeyboardEvent) {
    pressedKeys.delete(event.code);
}

// --- Game Initialization & State Management ---
function initGame(): void {
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error('Canvas element with ID "gameCanvas" not found.');
        return;
    }
    ctx = canvas.getContext('2d')!;

    canvas.width = gameData.gameSettings.canvasWidth;
    canvas.height = gameData.gameSettings.canvasHeight;

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Initial setup for BGM
    const bgm = loadedSounds.get('bgm');
    if (bgm) {
        bgm.loop = true;
        bgm.volume = gameData.assets.sounds.find(s => s.name === 'bgm')?.volume ?? 0.3;
    }

    requestAnimationFrame(gameLoop); // Start the game loop
}

function resetGame(): void {
    player = {
        x: gameData.gameSettings.canvasWidth / 2 - gameData.gameSettings.player.width / 2,
        y: gameData.gameSettings.canvasHeight - gameData.gameSettings.player.height - 20,
        width: gameData.gameSettings.player.width,
        height: gameData.gameSettings.player.height,
        speed: gameData.gameSettings.player.speed,
        health: gameData.gameSettings.player.health,
        lastFireTime: 0,
        fireCooldown: gameData.gameSettings.player.fireCooldown
    };
    bullets = [];
    enemies = [];
    score = gameData.gameSettings.initialScore;
    enemySpawnTimer = gameData.gameSettings.enemySpawnInterval;
}

function startGame(): void {
    if (gameState === 'TITLE' || gameState === 'GAME_OVER') {
        resetGame();
        gameState = 'PLAYING';
        // Start BGM if not already playing or paused
        const bgm = loadedSounds.get('bgm');
        if (bgm && bgm.paused) {
            bgm.play().catch(e => console.error("BGM autoplay prevented (likely due to browser policy):", e));
        }
    }
}

function endGame(): void {
    gameState = 'GAME_OVER';
    const bgm = loadedSounds.get('bgm');
    if (bgm) {
        bgm.pause();
        bgm.currentTime = 0; // Rewind BGM
    }
}

// --- Game Loop ---
function gameLoop(currentTime: DOMHighResTimeStamp): void {
    const deltaTime = (currentTime - lastFrameTime) / 1000; // Convert ms to seconds
    lastFrameTime = currentTime;

    update(deltaTime);
    draw();

    requestAnimationFrame(gameLoop);
}

// --- Update Game State ---
function update(deltaTime: number): void {
    switch (gameState) {
        case 'TITLE':
            // No updates, just waiting for input
            break;
        case 'PLAYING':
            updatePlayingState(deltaTime);
            break;
        case 'GAME_OVER':
            // No updates, just waiting for input to restart
            break;
    }
}

function updatePlayingState(deltaTime: number): void {
    // Player movement
    if (pressedKeys.has('ArrowLeft') || pressedKeys.has('KeyA')) {
        player.x -= player.speed * deltaTime;
    }
    if (pressedKeys.has('ArrowRight') || pressedKeys.has('KeyD')) {
        player.x += player.speed * deltaTime;
    }
    // Clamp player position
    player.x = Math.max(0, Math.min(player.x, gameData.gameSettings.canvasWidth - player.width));

    // Player shooting
    const currentTimeInSeconds = lastFrameTime / 1000;
    if ((pressedKeys.has('Space') || pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) && (currentTimeInSeconds - player.lastFireTime > player.fireCooldown)) {
        bullets.push({
            x: player.x + player.width / 2 - gameData.gameSettings.bullet.width / 2,
            y: player.y,
            width: gameData.gameSettings.bullet.width,
            height: gameData.gameSettings.bullet.height,
            speed: gameData.gameSettings.bullet.speed,
            damage: gameData.gameSettings.bullet.damage
        });
        player.lastFireTime = currentTimeInSeconds;
        playSound('shoot');
    }

    // Update bullets
    bullets = bullets.filter(bullet => {
        bullet.y -= bullet.speed * deltaTime;
        return bullet.y + bullet.height > 0; // Keep bullets on screen
    });

    // Spawn enemies
    enemySpawnTimer -= deltaTime;
    if (enemySpawnTimer <= 0) {
        enemies.push({
            x: Math.random() * (gameData.gameSettings.canvasWidth - gameData.gameSettings.enemy.width),
            y: -gameData.gameSettings.enemy.height, // Start above screen
            width: gameData.gameSettings.enemy.width,
            height: gameData.gameSettings.enemy.height,
            speed: Math.random() * (gameData.gameSettings.enemy.speedMax - gameData.gameSettings.enemy.speedMin) + gameData.gameSettings.enemy.speedMin,
            health: gameData.gameSettings.enemy.health,
            scoreValue: gameData.gameSettings.enemy.scoreValue
        });
        enemySpawnTimer = gameData.gameSettings.enemySpawnInterval;
    }

    // Update enemies
    enemies = enemies.filter(enemy => {
        enemy.y += enemy.speed * deltaTime;
        return enemy.y < gameData.gameSettings.canvasHeight; // Keep enemies on screen
    });

    // Collision detection: Bullet vs Enemy
    bullets.forEach((bullet, bIndex) => {
        enemies.forEach((enemy, eIndex) => {
            if (checkCollision(bullet, enemy)) {
                bullet.y = -100; // Mark bullet for removal
                enemy.health -= bullet.damage;
                if (enemy.health <= 0) {
                    enemy.y = gameData.gameSettings.canvasHeight + 100; // Mark enemy for removal
                    score += enemy.scoreValue;
                    playSound('explosion');
                }
            }
        });
    });
    bullets = bullets.filter(bullet => bullet.y !== -100);
    enemies = enemies.filter(enemy => enemy.y !== gameData.gameSettings.canvasHeight + 100);

    // Collision detection: Player vs Enemy
    enemies.forEach(enemy => {
        if (checkCollision(player, enemy)) {
            player.health--;
            enemy.y = gameData.gameSettings.canvasHeight + 100; // Mark enemy for removal
            playSound('player_hit');
            if (player.health <= 0) {
                endGame();
            }
        }
    });
    enemies = enemies.filter(enemy => enemy.y !== gameData.gameSettings.canvasHeight + 100);
}

// --- Drawing ---
function draw(): void {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background (if present)
    const backgroundImage = loadedImages.get('background');
    if (backgroundImage) {
        ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#000000'; // Default background color
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    switch (gameState) {
        case 'TITLE':
            drawTextCentered(gameData.gameSettings.titleScreenText, canvas.height / 2);
            drawTextCentered("Press any key to start", canvas.height / 2 + gameData.gameSettings.fontSize);
            break;
        case 'PLAYING':
            drawPlayingState();
            break;
        case 'GAME_OVER':
            drawTextCentered(gameData.gameSettings.gameOverScreenText + score, canvas.height / 2 - 30);
            drawTextCentered(gameData.gameSettings.restartScreenText, canvas.height / 2 + 30);
            break;
    }
}

function drawPlayingState(): void {
    // Draw player
    drawImage('player', player.x, player.y, player.width, player.height);

    // Draw bullets
    bullets.forEach(bullet => {
        drawImage('bullet', bullet.x, bullet.y, bullet.width, bullet.height);
    });

    // Draw enemies
    enemies.forEach(enemy => {
        drawImage('enemy', enemy.x, enemy.y, enemy.width, enemy.height);
    });

    // Draw UI (Score and Health)
    ctx.fillStyle = gameData.gameSettings.textColor;
    ctx.font = `${gameData.gameSettings.fontSize / 2}px ${gameData.gameSettings.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Score: ${score}`, 10, 10);
    ctx.fillText(`Health: ${player.health}`, 10, 10 + gameData.gameSettings.fontSize / 2 + 5);
}


// --- Helper Functions ---
function drawImage(imageName: string, x: number, y: number, width: number, height: number): void {
    const img = loadedImages.get(imageName);
    if (img) {
        ctx.drawImage(img, x, y, width, height);
    } else {
        console.warn(`Image '${imageName}' not found.`);
        // Fallback: draw a colored rectangle if image not loaded
        ctx.fillStyle = 'red';
        ctx.fillRect(x, y, width, height);
    }
}

function playSound(soundName: string): void {
    const audio = loadedSounds.get(soundName);
    if (audio) {
        // To play multiple instances of a sound, we need to clone it
        const clonedAudio = audio.cloneNode() as HTMLAudioElement;
        clonedAudio.volume = audio.volume; // Keep original volume
        clonedAudio.play().catch(e => console.warn(`Sound '${soundName}' playback prevented:`, e));
    } else {
        console.warn(`Sound '${soundName}' not found.`);
    }
}

function checkCollision(obj1: { x: number; y: number; width: number; height: number; }, obj2: { x: number; y: number; width: number; height: number; }): boolean {
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
}

function drawTextCentered(text: string, y: number): void {
    ctx.fillStyle = gameData.gameSettings.textColor;
    ctx.font = `${gameData.gameSettings.fontSize}px ${gameData.gameSettings.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, y);
    ctx.textAlign = 'left'; // Reset for other text drawing
    ctx.textBaseline = 'alphabetic'; // Reset
}

// --- Entry Point ---
// Load assets, then initialize and start the game loop
loadAssets().then(() => {
    initGame();
}).catch(err => {
    console.error("Game failed to initialize:", err);
});