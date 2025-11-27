// game.ts

interface AssetImage {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface AssetSound {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface GameSettings {
    canvasWidth: number;
    canvasHeight: number;
    noteSpeed: number; // pixels per second
    hitZoneY: number; // Y-coordinate of the hit zone
    noteSpawnY: number; // Y-coordinate where notes appear
    noteWidth: number;
    noteHeight: number;
    laneCount: number;
    laneWidth: number;
    laneSpacing: number; // Spacing between lanes
    laneKeys: string[]; // Keys corresponding to each lane
    hitWindowPerfect: number; // Time window for perfect hit (+/- seconds)
    hitWindowGood: number; // Time window for good hit (+/- seconds)
    scorePerPerfect: number;
    scorePerGood: number;
    comboThreshold: number; // Combo starts contributing score after this many hits
    multiplierPerCombo: number; // Score multiplier increase per combo tier
    scorePenaltyPerMiss: number; // New: Score deducted when a note is missed or passed
}

interface BeatmapNote {
    time: number; // Time in seconds when the note should be hit
    lane: number; // Lane index (0 to laneCount-1)
}

interface GameData {
    gameSettings: GameSettings;
    assets: {
        images: AssetImage[];
        sounds: AssetSound[];
    };
    beatmap: BeatmapNote[];
}

enum GameState {
    TITLE = "TITLE",
    PLAYING = "PLAYING",
    GAME_OVER = "GAME_OVER",
}

enum NoteState {
    FALLING = "FALLING",
    HIT = "HIT",
    MISSED = "MISSED",
    PASSED = "PASSED", // Passed hit zone without input
}

class Note {
    lane: number;
    spawnTime: number; // Time when note appears at noteSpawnY
    arrivalTime: number; // Time when note reaches hitZoneY
    state: NoteState;
    x: number;
    y: number;
    width: number;
    height: number;
    fallDuration: number;

    constructor(lane: number, arrivalTime: number, game: Game) {
        this.lane = lane;
        this.arrivalTime = arrivalTime;
        this.state = NoteState.FALLING;

        const settings = game.gameData.gameSettings; // Accessing gameData
        this.fallDuration = (settings.hitZoneY - settings.noteSpawnY) / settings.noteSpeed;
        this.spawnTime = this.arrivalTime - this.fallDuration;

        this.width = settings.noteWidth;
        this.height = settings.noteHeight;

        const totalLanesWidth = settings.laneCount * settings.laneWidth + (settings.laneCount - 1) * settings.laneSpacing;
        const startX = (settings.canvasWidth - totalLanesWidth) / 2;
        this.x = startX + lane * (settings.laneWidth + settings.laneSpacing) + (settings.laneWidth - this.width) / 2;

        this.y = settings.noteSpawnY; // Initial Y position
    }

    update(currentTime: number, game: Game) {
        if (this.state !== NoteState.FALLING) return;

        const settings = game.gameData.gameSettings; // Accessing gameData
        const progress = Math.max(0, Math.min(1, (currentTime - this.spawnTime) / this.fallDuration));
        this.y = settings.noteSpawnY + progress * (settings.hitZoneY - settings.noteSpawnY);

        if (currentTime > this.arrivalTime + settings.hitWindowGood && this.state === NoteState.FALLING) {
            this.state = NoteState.PASSED;
            game.handleMiss(); // Calling handleMiss
        }
    }

    draw(ctx: CanvasRenderingContext2D, noteImage: HTMLImageElement) {
        if (this.state === NoteState.FALLING || this.state === NoteState.HIT) { // Draw HIT notes briefly for feedback
            ctx.drawImage(noteImage, this.x, this.y, this.width, this.height);
        }
    }
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    public readonly gameData!: GameData; // Changed from private to public readonly
    private loadedImages: Map<string, HTMLImageElement> = new Map();
    private loadedSounds: Map<string, HTMLAudioElement> = new Map();

    private gameState: GameState = GameState.TITLE;
    private lastTime: number = 0;
    private currentAudioTime: number = 0; // The official game time, synced with BGM
    private bgmAudio: HTMLAudioElement | null = null;
    private bgmStartTime: number = 0; // performance.now() when BGM started playing

    private activeNotes: Note[] = [];
    private beatmapIndex: number = 0;

    private score: number = 0;
    private combo: number = 0;
    private maxCombo: number = 0;
    private totalHits: number = 0;
    private perfectHits: number = 0;
    private goodHits: number = 0;
    private missHits: number = 0;

    private pressedKeys: Set<string> = new Set();
    private justPressedKeys: Set<string> = new Set(); // For single-press events

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas element with ID '${canvasId}' not found.`);
        }
        this.ctx = this.canvas.getContext("2d")!;
        if (!this.ctx) {
            throw new Error("Failed to get 2D rendering context.");
        }

        this.addEventListeners();
    }

    private addEventListeners() {
        window.addEventListener("keydown", (e) => this.handleKeyDown(e));
        window.addEventListener("keyup", (e) => this.handleKeyUp(e));
        // Prevent default behavior for arrow keys and spacebar, commonly used in games
        window.addEventListener("keydown", (e) => {
            if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
                e.preventDefault();
            }
        });
    }

    private handleKeyDown(event: KeyboardEvent) {
        const key = event.key.toLowerCase();
        if (!this.pressedKeys.has(key)) {
            this.pressedKeys.add(key);
            this.justPressedKeys.add(key); // Mark as just pressed
        }
    }

    private handleKeyUp(event: KeyboardEvent) {
        const key = event.key.toLowerCase();
        this.pressedKeys.delete(key);
        // Do not remove from justPressedKeys here, it will be cleared at the start of update frame
    }

    async init() {
        console.log("Loading game data...");
        try {
            const response = await fetch("data.json");
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            // gameData is initialized here, so readonly is appropriate
            (this.gameData as GameData) = await response.json() as GameData;
            console.log("Game data loaded:", this.gameData);

            this.canvas.width = this.gameData.gameSettings.canvasWidth;
            this.canvas.height = this.gameData.gameSettings.canvasHeight;

            await this.loadAssets();
            console.log("Assets loaded.");

            this.startTitleScreen();
            this.gameLoop(0); // Start the game loop
        } catch (error) {
            console.error("Failed to initialize game:", error);
            // Display an error message on the canvas if initialization fails
            this.ctx.font = "20px Arial";
            this.ctx.fillStyle = "red";
            this.ctx.textAlign = "center";
            this.ctx.fillText("Failed to load game. Check console for details.", this.canvas.width / 2, this.canvas.height / 2);
        }
    }

    private async loadAssets() {
        const imagePromises = this.gameData.assets.images.map(img => {
            return new Promise<void>((resolve, reject) => {
                const image = new Image();
                image.src = img.path;
                image.onload = () => {
                    this.loadedImages.set(img.name, image);
                    resolve();
                };
                image.onerror = () => reject(`Failed to load image: ${img.path}`);
            });
        });

        const soundPromises = this.gameData.assets.sounds.map(snd => {
            return new Promise<void>((resolve, reject) => {
                const audio = new Audio();
                audio.src = snd.path;
                audio.volume = snd.volume;
                audio.preload = "auto";
                // To avoid issues with autoplay policies, we only try to load and attach
                // The actual playback will be initiated by user interaction.
                // For sound effects, they are typically short and can be played on demand.
                // For BGM, it needs to be ready to play when the game starts.
                audio.oncanplaythrough = () => {
                    this.loadedSounds.set(snd.name, audio);
                    resolve();
                };
                audio.onerror = () => reject(`Failed to load sound: ${snd.path}`);
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
    }

    private startTitleScreen() {
        this.gameState = GameState.TITLE;
        this.resetGameStats();
    }

    private startGame() {
        this.gameState = GameState.PLAYING;
        this.activeNotes = [];
        this.beatmapIndex = 0;
        this.resetGameStats();

        this.bgmAudio = this.loadedSounds.get("bgm") || null;
        if (this.bgmAudio) {
            this.bgmAudio.currentTime = 0;
            this.bgmAudio.loop = true; // Loop BGM for continuous play until game ends
            this.bgmAudio.play().then(() => {
                this.bgmStartTime = performance.now();
                this.currentAudioTime = 0; // Initialize game time
                console.log("BGM started.");
            }).catch(error => {
                console.warn("BGM autoplay prevented:", error);
                // If autoplay is blocked, game might be out of sync.
                // For simplicity, we'll proceed but this might cause issues.
                // A common solution is to require another user interaction to play audio.
                this.bgmStartTime = performance.now(); // Assume it would have played
                this.currentAudioTime = 0;
            });
        }
    }

    private endGame() {
        this.gameState = GameState.GAME_OVER;
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio.currentTime = 0; // Reset for next play
        }
    }

    private resetGameStats() {
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.totalHits = 0;
        this.perfectHits = 0;
        this.goodHits = 0;
        this.missHits = 0;
    }

    private gameLoop(time: DOMHighResTimeStamp) {
        const deltaTime = (time - this.lastTime) / 1000; // Convert to seconds
        this.lastTime = time;

        this.update(deltaTime);
        this.draw();

        this.justPressedKeys.clear(); // Clear just pressed keys after update/draw

        requestAnimationFrame((t) => this.gameLoop(t));
    }

    private update(deltaTime: number) {
        switch (this.gameState) {
            case GameState.TITLE:
                this.updateTitleScreen();
                break;
            case GameState.PLAYING:
                this.updatePlaying(deltaTime);
                break;
            case GameState.GAME_OVER:
                this.updateGameOver();
                break;
        }
    }

    private updateTitleScreen() {
        if (this.justPressedKeys.size > 0) { // Any key press to start
            this.startGame();
        }
    }

    private updatePlaying(deltaTime: number) {
        if (this.bgmAudio && !this.bgmAudio.paused) {
            this.currentAudioTime = this.bgmAudio.currentTime;
        } else {
            // If BGM didn't play (e.g., autoplay blocked), use performance.now() as fallback
            this.currentAudioTime = (performance.now() - this.bgmStartTime) / 1000;
        }

        // Spawn new notes
        while (this.beatmapIndex < this.gameData.beatmap.length) {
            const nextNoteData = this.gameData.beatmap[this.beatmapIndex];
            // Spawn note slightly before its arrival time, so it's visible on screen
            if (nextNoteData.time - this.activeNotes.length * 0.1 <= this.currentAudioTime + 2) { // Pre-spawn buffer
                const note = new Note(nextNoteData.lane, nextNoteData.time, this);
                this.activeNotes.push(note);
                this.beatmapIndex++;
            } else {
                break;
            }
        }

        // Update existing notes and remove passed ones
        for (let i = this.activeNotes.length - 1; i >= 0; i--) {
            const note = this.activeNotes[i];
            note.update(this.currentAudioTime, this);

            // Remove notes that have been hit or fully missed/passed
            if (note.state === NoteState.HIT || note.state === NoteState.PASSED) {
                this.activeNotes.splice(i, 1);
            }
        }

        // Handle player input
        const laneKeys = this.gameData.gameSettings.laneKeys;
        for (let i = 0; i < laneKeys.length; i++) {
            const key = laneKeys[i];
            if (this.justPressedKeys.has(key)) {
                this.handlePlayerInput(i, this.currentAudioTime);
            }
        }

        // Check if song ended and all notes processed
        if (this.bgmAudio && this.bgmAudio.ended && this.activeNotes.length === 0) {
            this.endGame();
        } else if (this.currentAudioTime > (this.bgmAudio?.duration || this.gameData.assets.sounds.find(s => s.name === "bgm")?.duration_seconds || 0) + 2 && this.activeNotes.length === 0) {
             // Fallback for when BGM does not report .ended reliably or if no BGM
            this.endGame();
        }
    }

    private updateGameOver() {
        if (this.justPressedKeys.size > 0) {
            this.startTitleScreen(); // Go back to title
        }
    }

    private handlePlayerInput(lane: number, inputTime: number) {
        const settings = this.gameData.gameSettings;
        let bestNoteIndex = -1;
        let smallestDelta = Infinity;

        // Find the closest active note in the given lane
        for (let i = 0; i < this.activeNotes.length; i++) {
            const note = this.activeNotes[i];
            if (note.lane === lane && note.state === NoteState.FALLING) {
                const delta = Math.abs(inputTime - note.arrivalTime);
                if (delta < smallestDelta) {
                    smallestDelta = delta;
                    bestNoteIndex = i;
                }
            }
        }

        if (bestNoteIndex !== -1) {
            const note = this.activeNotes[bestNoteIndex];
            // Check if within hit window
            if (smallestDelta <= settings.hitWindowPerfect) {
                this.applyScore("perfect");
                note.state = NoteState.HIT; // Mark as hit to remove it
                this.perfectHits++;
                this.playEffect("hitEffect");
            } else if (smallestDelta <= settings.hitWindowGood) {
                this.applyScore("good");
                note.state = NoteState.HIT;
                this.goodHits++;
                this.playEffect("hitEffect");
            } else {
                // Too early/late, count as a miss
                this.handleMiss();
                this.playEffect("missEffect");
            }
        } else {
            // No note to hit, or note already passed/missed
            this.handleMiss();
            this.playEffect("missEffect");
        }
    }

    private applyScore(type: "perfect" | "good") {
        const settings = this.gameData.gameSettings;
        this.combo++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.totalHits++;

        let scoreValue = 0;
        if (type === "perfect") {
            scoreValue = settings.scorePerPerfect;
        } else if (type === "good") {
            scoreValue = settings.scorePerGood;
        }

        // Apply combo multiplier
        let currentMultiplier = 1;
        if (this.combo >= settings.comboThreshold) {
            currentMultiplier += Math.floor(this.combo / settings.comboThreshold) * settings.multiplierPerCombo;
        }
        this.score += scoreValue * currentMultiplier;
    }

    public handleMiss() { // Changed from private to public
        this.combo = 0;
        this.missHits++;
        this.totalHits++;
        this.score -= this.gameData.gameSettings.scorePenaltyPerMiss; // Deduct score

        // End game if score drops below zero
        if (this.score < 0) {
            this.endGame();
        }

        this.playEffect("missEffect");
    }

    private playEffect(name: string) {
        const audio = this.loadedSounds.get(name);
        if (audio) {
            // Clone the audio element for simultaneous playback if needed
            const clone = audio.cloneNode() as HTMLAudioElement;
            clone.volume = audio.volume; // Ensure cloned volume is correct
            clone.play().catch(e => console.warn(`Sound effect playback blocked: ${name}`, e));
        }
    }

    private draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBackground();

        switch (this.gameState) {
            case GameState.TITLE:
                this.drawTitleScreen();
                break;
            case GameState.PLAYING:
                this.drawPlaying();
                break;
            case GameState.GAME_OVER:
                this.drawGameOver();
                break;
        }
    }

    private drawBackground() {
        const backgroundImage = this.loadedImages.get("background");
        if (backgroundImage) {
            this.ctx.drawImage(backgroundImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = "#1a1a1a";
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    private drawTitleScreen() {
        this.ctx.fillStyle = "white";
        this.ctx.font = "bold 48px Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillText("Rhythm Game", this.canvas.width / 2, this.canvas.height / 2 - 50);

        this.ctx.font = "24px Arial";
        this.ctx.fillText("Press Any Key to Start", this.canvas.width / 2, this.canvas.height / 2 + 20);
    }

    private drawPlaying() {
        const settings = this.gameData.gameSettings;
        const noteImage = this.loadedImages.get("note");
        const hitZoneImage = this.loadedImages.get("hitZone");

        // Draw lanes and hit zone
        const totalLanesWidth = settings.laneCount * settings.laneWidth + (settings.laneCount - 1) * settings.laneSpacing;
        const startX = (settings.canvasWidth - totalLanesWidth) / 2;

        for (let i = 0; i < settings.laneCount; i++) {
            const laneX = startX + i * (settings.laneWidth + settings.laneSpacing);
            // Draw lane background
            this.ctx.fillStyle = "#333333";
            this.ctx.fillRect(laneX, 0, settings.laneWidth, this.canvas.height);

            // Draw lane input keys
            this.ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
            this.ctx.font = "20px Arial";
            this.ctx.textAlign = "center";
            this.ctx.fillText(settings.laneKeys[i].toUpperCase(), laneX + settings.laneWidth / 2, settings.hitZoneY + 50);

            // Draw hit zone for each lane
            if (hitZoneImage) {
                this.ctx.drawImage(hitZoneImage, laneX, settings.hitZoneY - hitZoneImage.height / 2, settings.laneWidth, hitZoneImage.height);
            } else {
                this.ctx.fillStyle = "#00ffff"; // Cyan for hit zone
                this.ctx.fillRect(laneX, settings.hitZoneY, settings.laneWidth, 5); // Simple line
            }

            // Highlight pressed lanes
            if (this.pressedKeys.has(settings.laneKeys[i])) {
                this.ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
                this.ctx.fillRect(laneX, settings.hitZoneY - 20, settings.laneWidth, 40);
            }
        }

        // Draw notes
        this.activeNotes.forEach(note => {
            if (noteImage) {
                note.draw(this.ctx, noteImage);
            } else {
                this.ctx.fillStyle = "red"; // Fallback color
                this.ctx.fillRect(note.x, note.y, note.width, note.height);
            }
        });

        // Draw score and combo
        this.ctx.fillStyle = "white";
        this.ctx.font = "30px Arial";
        this.ctx.textAlign = "left";
        this.ctx.fillText(`Score: ${Math.floor(this.score)}`, 20, 40);
        this.ctx.textAlign = "right";
        this.ctx.fillText(`Combo: ${this.combo}`, this.canvas.width - 20, 40);
    }

    private drawGameOver() {
        this.ctx.fillStyle = "white";
        this.ctx.font = "bold 48px Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillText("Game Over!", this.canvas.width / 2, this.canvas.height / 2 - 100);

        this.ctx.font = "30px Arial";
        this.ctx.fillText(`Final Score: ${Math.floor(this.score)}`, this.canvas.width / 2, this.canvas.height / 2 - 20);
        this.ctx.fillText(`Max Combo: ${this.maxCombo}`, this.canvas.width / 2, this.canvas.height / 2 + 30);

        const totalNotesHit = this.perfectHits + this.goodHits;
        const accuracy = this.totalHits > 0 ? (totalNotesHit / this.totalHits) * 100 : 0;
        this.ctx.fillText(`Accuracy: ${accuracy.toFixed(2)}%`, this.canvas.width / 2, this.canvas.height / 2 + 80);

        this.ctx.font = "24px Arial";
        this.ctx.fillText("Press Any Key to Restart", this.canvas.width / 2, this.canvas.height / 2 + 150);
    }
}

// Initialize the game when the DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    const game = new Game("gameCanvas");
    game.init();
});