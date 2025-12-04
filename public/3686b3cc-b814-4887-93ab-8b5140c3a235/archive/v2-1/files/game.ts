interface ImageAssetConfig {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface SoundAssetConfig {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface AssetsConfig {
    images: ImageAssetConfig[];
    sounds: SoundAssetConfig[];
}

interface BeatmapConfig {
    songName: string;
    bpm: number;
    offset: number; // Global offset for beatmap in milliseconds
    bgmSound: string; // Name of the sound asset for BGM
    notes: [number, number][]; // Array of [time_ms_from_game_start_to_hit, lane_index]
}

interface TitleScreenConfig {
    title: string;
    startButtonText: string;
}

interface InstructionScreenConfig {
    title: string;
    instructions: string[];
    continueButtonText: string;
}

interface GameOverScreenConfig {
    title: string;
    restartButtonText: string;
}

interface GameConfigData {
    canvasWidth: number;
    canvasHeight: number;
    backgroundColor: string;
    textColor: string;
    titleScreen: TitleScreenConfig;
    instructionScreen: InstructionScreenConfig;
    gameOverScreen: GameOverScreenConfig;
    noteSpeed: number; // Not directly used with noteFallDurationMs for note position, but for context
    initialHealth: number;
    healthPenaltyOnMiss: number; // Negative value for misses/auto-misses
    healthGainOnHit: number; // Positive value for hits
    hitZoneY: number; // Y-coordinate of the top of the hit zone
    hitZoneHeight: number;
    hitZoneColor: string; // Color for hit zone fallback
    hitTolerance: number; // Max pixel distance from note center to hit zone center for any hit
    perfectTimingThreshold: number; // Max pixel distance for 'PERFECT' hit
    goodTimingThreshold: number; // Max pixel distance for 'GOOD' hit
    noteMissOffset: number; // How far below hit zone a note can go before it's an auto-miss
    numLanes: number;
    laneWidth: number;
    laneGap: number;
    laneStartX: number; // X-coordinate of the first lane
    noteWidth: number; // Configured width for notes, overriding image width
    noteHeight: number; // Configured height for notes, overriding image height
    noteImageNames: string[]; // Names of image assets to use for notes
    keyBindings: string[]; // Array of keyboard event.code for each lane
    scorePerHit: number;
    perfectBonus: number;
    noteFallDurationMs: number; // Time in milliseconds for a note to fall from spawn point to hit zone center
    perfectColor: string;
    goodColor: string;
}

// Structure for data.json root
interface RawGameData {
    config: GameConfigData;
    assets: AssetsConfig;
    beatmap: BeatmapConfig;
}

interface LoadedImageAsset extends ImageAssetConfig {
    img: HTMLImageElement;
}

interface LoadedSoundAsset extends SoundAssetConfig {
    audio: HTMLAudioElement;
}

enum GameState {
    TITLE_SCREEN,
    INSTRUCTIONS_SCREEN,
    PLAYING,
    GAME_OVER
}

interface Note {
    x: number;
    y: number;
    width: number; // Now comes from config
    height: number; // Now comes from config
    lane: number;
    startTime: number; // The exact time (ms from game start) this note should be hit
    image: HTMLImageElement;
    hit: boolean; // True if player has successfully hit this note
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number; // frames
    color: string;
    image: HTMLImageElement | null;
    size: number;
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config!: GameConfigData;
    private beatmap!: BeatmapConfig;
    private assets: {
        images: { [key: string]: LoadedImageAsset };
        sounds: { [key: string]: LoadedSoundAsset };
    };
    private assetConfigs!: AssetsConfig; // Temporary storage for asset definitions from JSON

    private gameState: GameState = GameState.TITLE_SCREEN;

    // Game state variables
    private score: number = 0;
    private combo: number = 0;
    private health: number = 0;
    private notes: Note[] = [];
    private pressedKeys: Set<string> = new Set();
    private lastFrameTime: DOMHighResTimeStamp = 0;
    private beatmapCurrentNoteIndex: number = 0;
    private gameStartTime: DOMHighResTimeStamp = 0;
    private bgmAudio: HTMLAudioElement | null = null;
    private hitEffectParticles: Particle[] = [];

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            console.error(`Canvas with ID '${canvasId}' not found.`);
            return;
        }
        this.ctx = this.canvas.getContext('2d')!;
        this.assets = { images: {}, sounds: {} };

        // Set initial canvas size, will be overwritten by config
        this.canvas.width = 1280;
        this.canvas.height = 720;

        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
        document.addEventListener('click', this.handleClick);
    }

    async init() {
        await this.loadConfig();
        await this.loadAssets();
        this.resetGame();
        this.lastFrameTime = performance.now();
        requestAnimationFrame(this.gameLoop);
    }

    private async loadConfig() {
        const response = await fetch('data.json');
        const rawData: RawGameData = await response.json();
        this.config = rawData.config;
        this.beatmap = rawData.beatmap;
        this.assetConfigs = rawData.assets;

        // Apply canvas dimensions from config
        this.canvas.width = this.config.canvasWidth;
        this.canvas.height = this.config.canvasHeight;
    }

    private async loadAssets() {
        const imagePromises = this.assetConfigs.images.map(assetConfig => {
            return new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.src = assetConfig.path;
                img.onload = () => {
                    const loadedAsset: LoadedImageAsset = { ...assetConfig, img: img };
                    this.assets.images[assetConfig.name] = loadedAsset;
                    resolve();
                };
                img.onerror = () => {
                    console.error(`Failed to load image: ${assetConfig.path}`);
                    reject();
                };
            });
        });

        const soundPromises = this.assetConfigs.sounds.map(assetConfig => {
            return new Promise<void>((resolve, reject) => {
                const audio = new Audio();
                audio.src = assetConfig.path;
                audio.volume = assetConfig.volume;
                audio.oncanplaythrough = () => {
                    const loadedAsset: LoadedSoundAsset = { ...assetConfig, audio: audio };
                    this.assets.sounds[assetConfig.name] = loadedAsset;
                    resolve();
                };
                audio.onerror = () => {
                    console.error(`Failed to load sound: ${assetConfig.path}`);
                    reject();
                };
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
    }

    private resetGame() {
        this.score = 0;
        this.combo = 0;
        this.health = this.config.initialHealth;
        this.notes = [];
        this.beatmapCurrentNoteIndex = 0;
        this.pressedKeys.clear();
        this.gameStartTime = 0;
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio.currentTime = 0;
        }
        this.hitEffectParticles = [];
    }

    private startGame() {
        this.resetGame();
        this.gameState = GameState.PLAYING;
        this.gameStartTime = performance.now(); // Record actual game start time
        
        const bgmAsset = this.assets.sounds[this.beatmap.bgmSound];
        if (bgmAsset && bgmAsset.audio) {
            this.bgmAudio = bgmAsset.audio;
            this.bgmAudio.loop = false;
            this.bgmAudio.currentTime = 0; // Ensure starts from beginning
            this.bgmAudio.play().catch(e => console.error("BGM playback failed:", e));
        }
    }

    private handleKeyDown = (event: KeyboardEvent) => {
        if (!this.pressedKeys.has(event.code)) {
            this.pressedKeys.add(event.code);
            this.handlePlayerInput(event.code);
        }
    }

    private handleKeyUp = (event: KeyboardEvent) => {
        this.pressedKeys.delete(event.code);
    }

    private handleClick = (event: MouseEvent) => {
        this.playSound('sfx_button');
        if (this.gameState === GameState.TITLE_SCREEN) {
            this.gameState = GameState.INSTRUCTIONS_SCREEN;
        } else if (this.gameState === GameState.INSTRUCTIONS_SCREEN) {
            this.startGame();
        } else if (this.gameState === GameState.GAME_OVER) {
            this.gameState = GameState.TITLE_SCREEN;
        }
    }

    private playSound(name: string) {
        const soundAsset = this.assets.sounds[name];
        if (soundAsset && soundAsset.audio) {
            const audio = soundAsset.audio.cloneNode() as HTMLAudioElement;
            audio.volume = soundAsset.audio.volume;
            audio.play().catch(e => console.warn(`Sound playback failed for ${name}:`, e));
        }
    }

    private handlePlayerInput(keyCode: string) {
        if (this.gameState !== GameState.PLAYING) return;

        const laneIndex = this.config.keyBindings.indexOf(keyCode);
        if (laneIndex === -1) return; // Not a game key

        let bestNoteIndex = -1;
        let minDistance = Infinity;

        // Find the closest non-hit note in the correct lane within the hit zone tolerance
        for (let i = 0; i < this.notes.length; i++) {
            const note = this.notes[i];
            if (note.lane === laneIndex && !note.hit) {
                const noteCenterY = note.y + note.height / 2;
                const hitZoneCenterY = this.config.hitZoneY + this.config.hitZoneHeight / 2;
                const distance = Math.abs(noteCenterY - hitZoneCenterY);

                if (distance <= this.config.hitTolerance && distance < minDistance) {
                    bestNoteIndex = i;
                    minDistance = distance;
                }
            }
        }

        if (bestNoteIndex !== -1) {
            const note = this.notes[bestNoteIndex];
            note.hit = true; // Mark as hit to prevent double hitting
            this.notes.splice(bestNoteIndex, 1); // Remove hit note

            let feedbackColor = '';
            let scoreToAdd = 0;
            let healthChange = this.config.healthGainOnHit;

            if (minDistance <= this.config.perfectTimingThreshold) {
                scoreToAdd = this.config.scorePerHit + this.config.perfectBonus;
                this.combo++;
                feedbackColor = this.config.perfectColor;
            } else if (minDistance <= this.config.goodTimingThreshold) {
                scoreToAdd = this.config.scorePerHit;
                this.combo++;
                feedbackColor = this.config.goodColor;
            } else {
                // This case should ideally be caught by hitTolerance. If it occurs, it's a weak hit.
                scoreToAdd = Math.floor(this.config.scorePerHit / 2);
                this.combo++;
                feedbackColor = this.config.goodColor;
            }

            this.score += scoreToAdd;
            this.health = Math.min(this.config.initialHealth, this.health + healthChange); // Cap health
            this.playSound('sfx_hit');
            
            this.spawnParticles('perfect_effect', note.x + note.width / 2, note.y + note.height / 2, feedbackColor);
        } else {
            // Key pressed but no note in hit zone -> consider it a miss
            this.combo = 0;
            this.health = Math.max(0, this.health + this.config.healthPenaltyOnMiss);
            this.playSound('sfx_miss');
        }
    }

    private spawnParticles(imageName: string, x: number, y: number, color: string) {
        const particleCount = 5;
        const particleImage = this.assets.images[imageName]?.img || null;
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1;
            this.hitEffectParticles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - Math.random() * 3 - 1, // Upwards bias
                life: 45 + Math.random() * 15, // frames
                color: color,
                image: particleImage,
                size: Math.random() * 10 + 15 // Larger particles
            });
        }
    }

    private gameLoop = (currentTime: DOMHighResTimeStamp) => {
        const deltaTime = (currentTime - this.lastFrameTime) / 1000; // in seconds
        this.lastFrameTime = currentTime;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame(this.gameLoop);
    }

    private update(deltaTime: number) {
        if (this.gameState === GameState.PLAYING) {
            const elapsedTime = performance.now() - this.gameStartTime;

            // Generate notes from beatmap
            while (this.beatmapCurrentNoteIndex < this.beatmap.notes.length) {
                const noteData = this.beatmap.notes[this.beatmapCurrentNoteIndex];
                const noteHitTimeMs = noteData[0] + this.beatmap.offset; // Time note should be hit
                
                // Spawn the note if current time reaches its spawn window
                if (elapsedTime >= noteHitTimeMs - this.config.noteFallDurationMs) {
                    const laneIndex = noteData[1];
                    const noteImageName = this.config.noteImageNames[Math.floor(Math.random() * this.config.noteImageNames.length)];
                    const imageAsset = this.assets.images[noteImageName];

                    if (imageAsset) {
                        const laneX = this.config.laneStartX + laneIndex * (this.config.laneWidth + this.config.laneGap);
                        
                        // Use configured note dimensions instead of image asset dimensions
                        const noteWidth = this.config.noteWidth;
                        const noteHeight = this.config.noteHeight;

                        this.notes.push({
                            x: laneX + (this.config.laneWidth - noteWidth) / 2, // Center note in lane
                            y: -noteHeight, // Start above the screen
                            width: noteWidth,
                            height: noteHeight,
                            lane: laneIndex,
                            startTime: noteHitTimeMs,
                            image: imageAsset.img!,
                            hit: false
                        });
                    }
                    this.beatmapCurrentNoteIndex++;
                } else {
                    break;
                }
            }

            // Update notes positions and check for auto-misses
            for (let i = this.notes.length - 1; i >= 0; i--) {
                const note = this.notes[i];
                
                // Calculate note Y position based on target hit time and fall duration
                const timeSinceSpawn = elapsedTime - (note.startTime - this.config.noteFallDurationMs);
                if (timeSinceSpawn < 0) continue; // Note not yet spawned visually

                const progress = timeSinceSpawn / this.config.noteFallDurationMs;
                const targetNoteTopYAtHit = this.config.hitZoneY + this.config.hitZoneHeight / 2 - note.height / 2;
                note.y = -note.height + progress * (targetNoteTopYAtHit + note.height);


                // If note passes the hit zone bottom without being hit
                if (!note.hit && (note.y > this.config.hitZoneY + this.config.hitZoneHeight + this.config.noteMissOffset)) {
                    this.notes.splice(i, 1);
                    this.combo = 0;
                    this.health = Math.max(0, this.health + this.config.healthPenaltyOnMiss);
                    this.playSound('sfx_miss');
                }
            }

            // Update particles
            for (let i = this.hitEffectParticles.length - 1; i >= 0; i--) {
                const p = this.hitEffectParticles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.2; // Gravity effect
                p.life--;
                if (p.life <= 0) {
                    this.hitEffectParticles.splice(i, 1);
                }
            }

            // Check for game over (health or song end)
            if (this.health <= 0) {
                this.gameState = GameState.GAME_OVER;
                if (this.bgmAudio) {
                    this.bgmAudio.pause();
                }
            } else if (this.beatmapCurrentNoteIndex >= this.beatmap.notes.length && this.notes.length === 0) {
                // All notes processed and fallen off screen
                this.gameState = GameState.GAME_OVER;
                if (this.bgmAudio) {
                    this.bgmAudio.pause();
                }
            }

        }
    }

    private draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background
        const bgImage = this.assets.images['background']?.img;
        if (bgImage) {
            this.ctx.drawImage(bgImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = this.config.backgroundColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        switch (this.gameState) {
            case GameState.TITLE_SCREEN:
                this.drawTitleScreen();
                break;
            case GameState.INSTRUCTIONS_SCREEN:
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
        this.ctx.fillStyle = this.config.textColor;
        this.ctx.font = 'bold 48px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.config.titleScreen.title, this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = '24px sans-serif';
        this.ctx.fillText(this.config.titleScreen.startButtonText, this.canvas.width / 2, this.canvas.height / 2 + 50);
    }

    private drawInstructionsScreen() {
        this.ctx.fillStyle = this.config.textColor;
        this.ctx.font = 'bold 36px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.config.instructionScreen.title, this.canvas.width / 2, this.canvas.height / 4);

        this.ctx.font = '24px sans-serif';
        const lineHeight = 30;
        let y = this.canvas.height / 3;
        this.config.instructionScreen.instructions.forEach((line: string) => {
            this.ctx.fillText(line, this.canvas.width / 2, y);
            y += lineHeight;
        });

        this.ctx.font = '24px sans-serif';
        this.ctx.fillText(this.config.instructionScreen.continueButtonText, this.canvas.width / 2, this.canvas.height - 100);
    }

    private drawPlayingScreen() {
        // Draw hit zones (indicators)
        for (let i = 0; i < this.config.numLanes; i++) {
            const laneX = this.config.laneStartX + i * (this.config.laneWidth + this.config.laneGap);
            const indicatorImage = this.assets.images['hit_indicator']?.img;

            if (indicatorImage) {
                // Scale indicator image to fill the lane width and hit zone height
                this.ctx.drawImage(
                    indicatorImage,
                    laneX,
                    this.config.hitZoneY,
                    this.config.laneWidth,
                    this.config.hitZoneHeight
                );
            } else {
                this.ctx.fillStyle = this.config.hitZoneColor; // Fallback to configured color
                this.ctx.fillRect(laneX, this.config.hitZoneY, this.config.laneWidth, this.config.hitZoneHeight);
            }
            
            // Draw lane lines
            this.ctx.strokeStyle = '#555555';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(laneX, 0);
            this.ctx.lineTo(laneX, this.canvas.height);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(laneX + this.config.laneWidth, 0);
            this.ctx.lineTo(laneX + this.config.laneWidth, this.canvas.height);
            this.ctx.stroke();
        }

        // Draw notes
        this.notes.forEach(note => {
            if (note.image) {
                this.ctx.drawImage(note.image, note.x, note.y, note.width, note.height);
            } else {
                this.ctx.fillStyle = '#f00'; // Fallback
                this.ctx.fillRect(note.x, note.y, note.width, note.height);
            }
        });

        // Draw particles
        this.hitEffectParticles.forEach(p => {
            if (p.image) {
                this.ctx.globalAlpha = p.life / 60; // Fade out based on life
                this.ctx.drawImage(p.image, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
                this.ctx.globalAlpha = 1;
            } else {
                 this.ctx.fillStyle = p.color;
                this.ctx.globalAlpha = p.life / 60; // Fade out
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.globalAlpha = 1;
            }
        });

        // Draw UI
        this.ctx.fillStyle = this.config.textColor;
        this.ctx.font = '24px sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`점수: ${this.score}`, 20, 40);
        this.ctx.fillText(`콤보: ${this.combo}`, 20, 70);

        // Draw Health Bar
        const healthBarWidth = 200;
        const healthBarHeight = 20;
        const healthBarX = this.canvas.width - healthBarWidth - 20;
        const healthBarY = 30;
        this.ctx.fillStyle = '#555'; // Background of health bar
        this.ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
        
        // Health color gradient from red to green
        const healthRatio = this.health / this.config.initialHealth;
        const hue = healthRatio * 120; // 0 (red) to 120 (green)
        this.ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        this.ctx.fillRect(healthBarX, healthBarY, healthRatio * healthBarWidth, healthBarHeight);
        
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
    }

    private drawGameOverScreen() {
        this.ctx.fillStyle = this.config.textColor;
        this.ctx.font = 'bold 48px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.config.gameOverScreen.title, this.canvas.width / 2, this.canvas.height / 2 - 100);

        this.ctx.font = '36px sans-serif';
        this.ctx.fillText(`최종 점수: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.fillText(`최고 콤보: ${this.combo}`, this.canvas.width / 2, this.canvas.height / 2 + 50);

        this.ctx.font = '24px sans-serif';
        this.ctx.fillText(this.config.gameOverScreen.restartButtonText, this.canvas.width / 2, this.canvas.height / 2 + 150);
    }
}

// Global scope
window.onload = () => {
    const game = new Game('gameCanvas');
    game.init();
};
