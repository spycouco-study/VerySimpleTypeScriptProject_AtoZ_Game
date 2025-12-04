type GameConfig = {
    canvasWidth: number;
    canvasHeight: number;
    playerSpeed: number;
    playerShootInterval: number;
    projectileSpeed: number;
    enemySpeed: number;
    enemySpawnInterval: number;
    enemyHealth: number;
    scorePerEnemy: number;
    player: {
        width: number;
        height: number;
    };
    projectile: {
        width: number;
        height: number;
    };
    enemy: {
        width: number;
        height: number;
    };
    assets: {
        images: { name: string; path: string; width: number; height: number; }[];
        sounds: { name: string; path: string; duration_seconds: number; volume: number; }[];
    };
    colors: {
        background: string;
        text: string;
    };
    text: {
        title: string;
        startPrompt: string;
        instructions: string[];
        gameOver: string;
        restartPrompt: string;
        scoreLabel: string;
    };
};

type ImageAsset = HTMLImageElement & { name: string };
type SoundAsset = HTMLAudioElement & { name: string };

enum GameState {
    TITLE,
    INSTRUCTIONS,
    PLAYING,
    GAME_OVER
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config!: GameConfig;
    private images: Map<string, ImageAsset> = new Map();
    private sounds: Map<string, SoundAsset> = new Map();

    private gameState: GameState = GameState.TITLE;
    private lastFrameTime: number = 0;

    private player: { x: number; y: number; width: number; height: number; speed: number; lastShotTime: number; };
    private projectiles: { x: number; y: number; width: number; height: number; speed: number; }[] = [];
    private enemies: { x: number; y: number; width: number; height: number; speed: number; health: number; }[] = [];
    private score: number = 0;
    private lastEnemySpawnTime: number = 0;

    private keys: Set<string> = new Set();
    private bgmAudio: HTMLAudioElement | null = null;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas with ID '${canvasId}' not found.`);
        }
        this.ctx = this.canvas.getContext('2d')!;
        this.canvas.width = 800;
        this.canvas.height = 600;

        this.player = { x: 0, y: 0, width: 0, height: 0, speed: 0, lastShotTime: 0 };
    }

    async start() {
        await this.loadConfig();
        this.canvas.width = this.config.canvasWidth;
        this.canvas.height = this.config.canvasHeight;
        await this.loadAssets();
        this.setupInput();
        this.initGame();
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private async loadConfig() {
        const response = await fetch('data.json');
        this.config = await response.json() as GameConfig;
    }

    private async loadAssets() {
        const loadImagePromises = this.config.assets.images.map(imgData => {
            return new Promise<ImageAsset>((resolve, reject) => {
                const img = new Image();
                img.src = imgData.path;
                img.onload = () => resolve(Object.assign(img, { name: imgData.name }));
                img.onerror = () => reject(new Error(`Failed to load image: ${imgData.path}`));
            });
        });

        const loadSoundPromises = this.config.assets.sounds.map(sndData => {
            return new Promise<SoundAsset>((resolve, reject) => {
                const audio = new Audio();
                audio.src = sndData.path;
                audio.volume = sndData.volume;
                audio.oncanplaythrough = () => resolve(Object.assign(audio, { name: sndData.name }));
                audio.onerror = () => reject(new Error(`Failed to load sound: ${sndData.path}`));
            });
        });

        const loadedImages = await Promise.all(loadImagePromises);
        loadedImages.forEach(img => this.images.set(img.name, img));

        const loadedSounds = await Promise.all(loadSoundPromises);
        loadedSounds.forEach(snd => this.sounds.set(snd.name, snd));
    }

    private setupInput() {
        window.addEventListener('keydown', (e) => {
            this.keys.add(e.key.toLowerCase());
            if (this.gameState === GameState.TITLE && e.key === ' ') {
                this.gameState = GameState.INSTRUCTIONS;
                this.playBGM();
            } else if (this.gameState === GameState.INSTRUCTIONS && e.key === ' ') {
                this.gameState = GameState.PLAYING;
                this.initGame();
            } else if (this.gameState === GameState.GAME_OVER && e.key.toLowerCase() === 'r') {
                this.gameState = GameState.TITLE;
                this.score = 0;
                this.resetEntities();
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys.delete(e.key.toLowerCase());
        });
    }

    private playSound(name: string, loop: boolean = false) {
        const sound = this.sounds.get(name);
        if (sound) {
            if (name === 'bgm') {
                if (this.bgmAudio) this.bgmAudio.pause(); // Stop any existing BGM
                this.bgmAudio = sound.cloneNode(true) as HTMLAudioElement;
                this.bgmAudio.volume = sound.volume;
                this.bgmAudio.loop = loop;
                this.bgmAudio.play().catch(e => console.error("Error playing BGM:", e));
            } else {
                const clonedSound = sound.cloneNode() as HTMLAudioElement;
                clonedSound.volume = sound.volume;
                clonedSound.loop = loop;
                clonedSound.play().catch(e => console.error("Error playing sound effect:", e));
            }
        }
    }

    private stopBGM() {
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio.currentTime = 0;
            this.bgmAudio = null;
        }
    }

    private playBGM() {
        if (!this.bgmAudio) {
            this.playSound('bgm', true);
        } else if (this.bgmAudio.paused) {
            this.bgmAudio.play().catch(e => console.error("Error resuming BGM:", e));
        }
    }


    private initGame() {
        this.score = 0;
        this.resetEntities();

        this.player.width = this.config.player.width;
        this.player.height = this.config.player.height;
        this.player.x = (this.canvas.width - this.player.width) / 2;
        this.player.y = this.canvas.height - this.player.height - 20;
        this.player.speed = this.config.playerSpeed;
        this.player.lastShotTime = 0;

        this.lastEnemySpawnTime = 0;
    }

    private resetEntities() {
        this.projectiles = [];
        this.enemies = [];
    }

    private gameLoop(timestamp: number) {
        const deltaTime = (timestamp - this.lastFrameTime) / 1000;
        this.lastFrameTime = timestamp;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    private update(deltaTime: number) {
        switch (this.gameState) {
            case GameState.PLAYING:
                this.updatePlaying(deltaTime);
                break;
        }
    }

    private updatePlaying(deltaTime: number) {
        // Player movement
        if (this.keys.has('a') || this.keys.has('arrowleft')) {
            this.player.x -= this.player.speed * deltaTime;
        }
        if (this.keys.has('d') || this.keys.has('arrowright')) {
            this.player.x += this.player.speed * deltaTime;
        }
        if (this.player.x < 0) this.player.x = 0;
        if (this.player.x + this.player.width > this.canvas.width) this.player.x = this.canvas.width - this.player.width;

        // Player shooting
        if (this.keys.has(' ') && performance.now() - this.player.lastShotTime > this.config.playerShootInterval) {
            this.projectiles.push({
                x: this.player.x + this.player.width / 2 - this.config.projectile.width / 2,
                y: this.player.y,
                width: this.config.projectile.width,
                height: this.config.projectile.height,
                speed: this.config.projectileSpeed
            });
            this.player.lastShotTime = performance.now();
            this.playSound('shoot_effect');
        }

        // Update projectiles
        this.projectiles = this.projectiles.filter(p => {
            p.y -= p.speed * deltaTime;
            return p.y + p.height > 0;
        });

        // Spawn enemies
        if (performance.now() - this.lastEnemySpawnTime > this.config.enemySpawnInterval) {
            this.enemies.push({
                x: Math.random() * (this.canvas.width - this.config.enemy.width),
                y: -this.config.enemy.height,
                width: this.config.enemy.width,
                height: this.config.enemy.height,
                speed: this.config.enemySpeed,
                health: this.config.enemyHealth
            });
            this.lastEnemySpawnTime = performance.now();
        }

        // Update enemies
        this.enemies = this.enemies.filter(e => {
            e.y += e.speed * deltaTime;
            if (e.y > this.canvas.height) {
                this.gameState = GameState.GAME_OVER;
                this.stopBGM();
                return false;
            }
            return true;
        });

        // Collision detection: Projectiles vs Enemies
        this.projectiles.forEach(p => {
            this.enemies.forEach(e => {
                if (this.checkCollision(p, e)) {
                    this.playSound('hit_effect');
                    e.health--;
                    p.y = -100;
                    if (e.health <= 0) {
                        e.y = this.canvas.height + 100;
                        this.score += this.config.scorePerEnemy;
                    }
                }
            });
        });

        this.projectiles = this.projectiles.filter(p => p.y !== -100);
        this.enemies = this.enemies.filter(e => e.y !== this.canvas.height + 100 && e.health > 0);
    }

    private checkCollision(rect1: { x: number; y: number; width: number; height: number; }, rect2: { x: number; y: number; width: number; height: number; }) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }

    private draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = this.config.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const backgroundImage = this.images.get('background');
        if (backgroundImage) {
            this.ctx.drawImage(backgroundImage, 0, 0, this.canvas.width, this.canvas.height);
        }

        switch (this.gameState) {
            case GameState.TITLE:
                this.drawTitleScreen();
                break;
            case GameState.INSTRUCTIONS:
                this.drawInstructionsScreen();
                break;
            case GameState.PLAYING:
                this.drawPlayingScreen();
                break;
            case GameState.GAME_OVER:
                this.drawGameOverScreen();
                break;
        }
    }

    private drawTitleScreen() {
        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.font = '48px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.config.text.title, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = '24px sans-serif';
        this.ctx.fillText(this.config.text.startPrompt, this.canvas.width / 2, this.canvas.height / 2 + 50);
    }

    private drawInstructionsScreen() {
        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.font = '36px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("게임 조작법", this.canvas.width / 2, this.canvas.height / 2 - 100);

        this.ctx.font = '24px sans-serif';
        let yOffset = -40;
        this.config.text.instructions.forEach(line => {
            this.ctx.fillText(line, this.canvas.width / 2, this.canvas.height / 2 + yOffset);
            yOffset += 30;
        });

        this.ctx.fillText(this.config.text.startPrompt, this.canvas.width / 2, this.canvas.height / 2 + 100);
    }

    private drawPlayingScreen() {
        // Draw player
        const playerImage = this.images.get('player');
        if (playerImage) {
            this.ctx.drawImage(playerImage, this.player.x, this.player.y, this.player.width, this.player.height);
        }

        // Draw projectiles
        const projectileImage = this.images.get('projectile');
        if (projectileImage) {
            this.projectiles.forEach(p => {
                this.ctx.drawImage(projectileImage, p.x, p.y, p.width, p.height);
            });
        }

        // Draw enemies
        const enemyImage = this.images.get('enemy');
        if (enemyImage) {
            this.enemies.forEach(e => {
                this.ctx.drawImage(enemyImage, e.x, e.y, e.width, e.height);
            });
        }

        // Draw score
        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.font = '24px sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`${this.config.text.scoreLabel}: ${this.score}`, 10, 30);
    }

    private drawGameOverScreen() {
        this.ctx.fillStyle = this.config.colors.text;
        this.ctx.font = '48px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.config.text.gameOver, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = '36px sans-serif';
        this.ctx.fillText(`${this.config.text.scoreLabel}: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2);

        this.ctx.font = '24px sans-serif';
        this.ctx.fillText(this.config.text.restartPrompt, this.canvas.width / 2, this.canvas.height / 2 + 50);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const game = new Game('gameCanvas');
    game.start();
});
