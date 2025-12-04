interface GameConfig {
    gameSettings: {
        gameDurationSeconds: number;
        playerSpeed: number;
        collectibleScore: number;
        collectibleSpawnInterval: number;
        maxCollectibles: number;
        rankingSize: number;
        playerSize: number;
        collectibleSize: number;
    };
    titleScreenText: string;
    instructionsText: string;
    gameOverText: string;
    rankingScreenText: string;
    assets: {
        images: ImageAsset[];
        sounds: SoundAsset[];
    };
}

interface ImageAsset {
    name: string;
    path: string;
    width: number;
    height: number;
    image?: HTMLImageElement;
}

interface SoundAsset {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
    audio?: HTMLAudioElement;
}

interface RankEntry {
    name: string;
    score: number;
}

enum GameState {
    TITLE_SCREEN,
    INSTRUCTIONS_SCREEN,
    GAME_PLAYING,
    GAME_OVER,
    RANKING_SCREEN,
}

class AssetLoader {
    private loadedImages: Map<string, HTMLImageElement> = new Map();
    private loadedSounds: Map<string, HTMLAudioElement> = new Map();

    async loadAssets(imageAssets: ImageAsset[], soundAssets: SoundAsset[]): Promise<void> {
        const imagePromises = imageAssets.map(asset => this.loadImage(asset));
        const soundPromises = soundAssets.map(asset => this.loadSound(asset));

        await Promise.all([...imagePromises, ...soundPromises]);
    }

    private loadImage(asset: ImageAsset): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.loadedImages.set(asset.name, img);
                asset.image = img;
                resolve();
            };
            img.onerror = (e) => {
                console.error(`Failed to load image: ${asset.path}`, e);
                reject(new Error(`Failed to load image: ${asset.path}`));
            };
            img.src = asset.path;
        });
    }

    private loadSound(asset: SoundAsset): Promise<void> {
        return new Promise((resolve, reject) => {
            const audio = new Audio(asset.path);
            audio.volume = asset.volume;
            // Resolve immediately after setting attributes, actual playback will handle readiness
            this.loadedSounds.set(asset.name, audio);
            asset.audio = audio;
            resolve();
        });
    }

    getImage(name: string): HTMLImageElement | undefined {
        return this.loadedImages.get(name);
    }

    getSound(name: string): HTMLAudioElement | undefined {
        return this.loadedSounds.get(name);
    }
}

abstract class GameObject {
    x: number;
    y: number;
    width: number;
    height: number;
    image: HTMLImageElement | undefined;

    constructor(x: number, y: number, width: number, height: number, image: HTMLImageElement | undefined) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.image = image;
    }

    abstract update(deltaTime: number): void;
    abstract draw(ctx: CanvasRenderingContext2D): void;

    collidesWith(other: GameObject): boolean {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }
}

class Player extends GameObject {
    speed: number;
    score: number = 0;
    private keys: { [key: string]: boolean } = {};

    constructor(x: number, y: number, size: number, speed: number, image: HTMLImageElement | undefined) {
        super(x, y, size, size, image);
        this.speed = speed;
        this.setupInput();
    }

    private setupInput(): void {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
    }

    update(deltaTime: number): void {
        let dx = 0;
        let dy = 0;

        if (this.keys['ArrowUp'] || this.keys['w'] || this.keys['W']) dy -= 1;
        if (this.keys['ArrowDown'] || this.keys['s'] || this.keys['S']) dy += 1;
        if (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A']) dx -= 1;
        if (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D']) dx += 1;

        if (dx !== 0 || dy !== 0) {
            const magnitude = Math.sqrt(dx * dx + dy * dy);
            this.x += (dx / magnitude) * this.speed * deltaTime;
            this.y += (dy / magnitude) * this.speed * deltaTime;
        }

        this.x = Math.max(0, Math.min(this.x, gameCanvas.width - this.width));
        this.y = Math.max(0, Math.min(this.y, gameCanvas.height - this.height));
    }

    draw(ctx: CanvasRenderingContext2D): void {
        if (this.image) {
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = 'blue';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

class Collectible extends GameObject {
    constructor(x: number, y: number, size: number, image: HTMLImageElement | undefined) {
        super(x, y, size, size, image);
    }

    update(deltaTime: number): void {
        // Collectibles don't move
    }

    draw(ctx: CanvasRenderingContext2D): void {
        if (this.image) {
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        } else {
            ctx.fillStyle = 'gold';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }
}

let gameCanvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let gameConfig: GameConfig;
let assetLoader = new AssetLoader();
let gameState: GameState = GameState.TITLE_SCREEN;

let player: Player;
let collectibles: Collectible[] = [];

let lastTime: number = 0;
let gameTimer: number = 0;
let collectibleSpawnTimer: number = 0;

let rankings: RankEntry[] = [];
const RANKING_STORAGE_KEY = 'collector_challenge_rankings';

async function initGame(): Promise<void> {
    gameCanvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!gameCanvas) {
        console.error('Canvas element not found!');
        return;
    }
    ctx = gameCanvas.getContext('2d')!;

    gameCanvas.width = 800;
    gameCanvas.height = 600;

    try {
        const response = await fetch('data.json');
        gameConfig = await response.json();
    } catch (error) {
        console.error('Failed to load game config:', error);
        return;
    }

    try {
        await assetLoader.loadAssets(gameConfig.assets.images, gameConfig.assets.sounds);
        console.log('Assets loaded successfully!');
    } catch (error) {
        console.error('Failed to load assets:', error);
        return;
    }

    loadRankings();

    window.addEventListener('keydown', handleInput);
    window.addEventListener('click', handleInput);

    requestAnimationFrame(gameLoop);
}

function handleInput(event: KeyboardEvent | MouseEvent): void {
    if (gameState === GameState.TITLE_SCREEN) {
        gameState = GameState.INSTRUCTIONS_SCREEN;
        const bgm = gameConfig.assets.sounds.find(s => s.name === "bgm")?.audio;
        if (bgm) {
            bgm.loop = true;
            bgm.play().catch(e => console.log("BGM auto-play blocked:", e));
        }
    } else if (gameState === GameState.INSTRUCTIONS_SCREEN) {
        startGame();
    } else if (gameState === GameState.GAME_OVER) {
        gameState = GameState.RANKING_SCREEN;
    } else if (gameState === GameState.RANKING_SCREEN) {
        resetGame();
        gameState = GameState.TITLE_SCREEN;
    }
}

function startGame(): void {
    gameState = GameState.GAME_PLAYING;
    player = new Player(
        gameCanvas.width / 2 - gameConfig.gameSettings.playerSize / 2,
        gameCanvas.height / 2 - gameConfig.gameSettings.playerSize / 2,
        gameConfig.gameSettings.playerSize,
        gameConfig.gameSettings.playerSpeed,
        assetLoader.getImage('player')
    );
    collectibles = [];
    player.score = 0;
    gameTimer = gameConfig.gameSettings.gameDurationSeconds;
    collectibleSpawnTimer = 0;
}

function resetGame(): void {
    player = null as any;
    collectibles = [];
    gameTimer = 0;
    collectibleSpawnTimer = 0;
    const bgm = gameConfig.assets.sounds.find(s => s.name === "bgm")?.audio;
    if (bgm) {
        bgm.pause();
        bgm.currentTime = 0;
    }
}

function gameLoop(timestamp: number): void {
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    update(deltaTime);
    draw();

    requestAnimationFrame(gameLoop);
}

function update(deltaTime: number): void {
    switch (gameState) {
        case GameState.GAME_PLAYING:
            gameTimer -= deltaTime;
            if (gameTimer <= 0) {
                gameTimer = 0;
                handleGameOver();
                return;
            }

            player.update(deltaTime);

            collectibleSpawnTimer -= deltaTime;
            if (collectibleSpawnTimer <= 0 && collectibles.length < gameConfig.gameSettings.maxCollectibles) {
                spawnCollectible();
                collectibleSpawnTimer = gameConfig.gameSettings.collectibleSpawnInterval;
            }

            for (let i = collectibles.length - 1; i >= 0; i--) {
                const collectible = collectibles[i];
                if (player.collidesWith(collectible)) {
                    player.score += gameConfig.gameSettings.collectibleScore;
                    const collectSound = gameConfig.assets.sounds.find(s => s.name === "collect")?.audio;
                    if (collectSound) {
                        collectSound.currentTime = 0;
                        collectSound.play().catch(e => console.log("Collect sound play blocked:", e));
                    }
                    collectibles.splice(i, 1);
                    if (collectibles.length < gameConfig.gameSettings.maxCollectibles) {
                        spawnCollectible();
                    }
                }
            }
            break;
    }
}

function draw(): void {
    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

    const bgImage = assetLoader.getImage('background');
    if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, gameCanvas.width, gameCanvas.height);
    } else {
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
    }

    switch (gameState) {
        case GameState.TITLE_SCREEN:
            drawTitleScreen();
            break;
        case GameState.INSTRUCTIONS_SCREEN:
            drawInstructionsScreen();
            break;
        case GameState.GAME_PLAYING:
            player.draw(ctx);
            collectibles.forEach(collectible => collectible.draw(ctx));
            drawGameUI();
            break;
        case GameState.GAME_OVER:
            drawGameOverScreen();
            break;
        case GameState.RANKING_SCREEN:
            drawRankingScreen();
            break;
    }
}

function drawTitleScreen(): void {
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.font = '48px sans-serif';
    ctx.fillText(gameConfig.titleScreenText, gameCanvas.width / 2, gameCanvas.height / 2 - 50);
    ctx.font = '24px sans-serif';
    ctx.fillText('아무 키나 눌러 시작', gameCanvas.width / 2, gameCanvas.height / 2 + 50);
}

function drawInstructionsScreen(): void {
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.font = '36px sans-serif';
    ctx.fillText('게임 방법', gameCanvas.width / 2, gameCanvas.height / 2 - 100);
    ctx.font = '20px sans-serif';
    const lines = gameConfig.instructionsText.split('\n');
    lines.forEach((line, index) => {
        ctx.fillText(line, gameCanvas.width / 2, gameCanvas.height / 2 - 30 + index * 30);
    });
    ctx.font = '24px sans-serif';
    ctx.fillText('계속하려면 아무 키나 눌러주세요.', gameCanvas.width / 2, gameCanvas.height / 2 + 100);
}

function drawGameUI(): void {
    ctx.fillStyle = 'white';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`점수: ${player.score}`, 10, 30);
    ctx.textAlign = 'right';
    ctx.fillText(`시간: ${gameTimer.toFixed(1)}s`, gameCanvas.width - 10, 30);
}

function handleGameOver(): void {
    gameState = GameState.GAME_OVER;
    const bgm = gameConfig.assets.sounds.find(s => s.name === "bgm")?.audio;
    if (bgm) {
        bgm.pause();
        bgm.currentTime = 0;
    }
    addScoreToRanking(player.score);
}

function drawGameOverScreen(): void {
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.font = '48px sans-serif';
    ctx.fillText(gameConfig.gameOverText, gameCanvas.width / 2, gameCanvas.height / 2 - 50);
    ctx.font = '36px sans-serif';
    ctx.fillText(`${player.score} 점`, gameCanvas.width / 2, gameCanvas.height / 2 + 10);
    ctx.font = '24px sans-serif';
    ctx.fillText('아무 키나 눌러 랭킹 보기', gameCanvas.width / 2, gameCanvas.height / 2 + 100);
}

function spawnCollectible(): void {
    const x = Math.random() * (gameCanvas.width - gameConfig.gameSettings.collectibleSize);
    const y = Math.random() * (gameCanvas.height - gameConfig.gameSettings.collectibleSize);
    collectibles.push(new Collectible(x, y, gameConfig.gameSettings.collectibleSize, assetLoader.getImage('collectible')));
}

function loadRankings(): void {
    const storedRankings = localStorage.getItem(RANKING_STORAGE_KEY);
    if (storedRankings) {
        rankings = JSON.parse(storedRankings);
    } else {
        rankings = [];
    }
}

function saveRankings(): void {
    localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(rankings));
}

function addScoreToRanking(score: number): void {
    if (rankings.length < gameConfig.gameSettings.rankingSize || score > (rankings.length > 0 ? rankings[rankings.length - 1].score : -1)) {
        let playerName = prompt(`축하합니다! 최고 점수 ${score}점을 기록했습니다! 당신의 이름을 입력하세요 (3글자 이내):`);
        playerName = playerName ? playerName.substring(0, 3).toUpperCase() : 'AAA';
        rankings.push({ name: playerName, score: score });
        rankings.sort((a, b) => b.score - a.score);
        rankings = rankings.slice(0, gameConfig.gameSettings.rankingSize);
        saveRankings();
    }
}

function drawRankingScreen(): void {
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.font = '48px sans-serif';
    ctx.fillText(gameConfig.rankingScreenText, gameCanvas.width / 2, 80);

    ctx.font = '30px sans-serif';
    if (rankings.length === 0) {
        ctx.fillText('아직 랭킹이 없습니다!', gameCanvas.width / 2, gameCanvas.height / 2);
    } else {
        rankings.forEach((entry, index) => {
            const y = 150 + index * 40;
            ctx.fillText(`${index + 1}. ${entry.name} - ${entry.score} 점`, gameCanvas.width / 2, y);
        });
    }

    ctx.font = '24px sans-serif';
    ctx.fillText('아무 키나 눌러 타이틀로 돌아가기', gameCanvas.width / 2, gameCanvas.height - 80);
}

document.addEventListener('DOMContentLoaded', initGame);
