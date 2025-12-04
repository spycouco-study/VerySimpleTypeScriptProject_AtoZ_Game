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

enum NoteType {
    TAP = "TAP",
    HOLD = "HOLD",
    SLIDE = "SLIDE",
}

interface GameSettings {
    canvasWidth: number;
    canvasHeight: number;
    noteSpeed: number; // pixels per second
    hitZoneY: number; // Y-coordinate of the hit zone (bottom of the note)
    noteSpawnY: number; // Y-coordinate where notes appear (top of the note)
    noteWidth: number;
    noteHeight: number;
    laneCount: number;
    laneWidth: number;
    laneSpacing: number; // Spacing between lanes
    laneKeys: string[]; // Keys corresponding to each lane
    hitWindowPerfect: number; // Time window for perfect hit (+/- seconds)
    hitWindowGreat: number; // New: Time window for great hit (+/- seconds)
    hitWindowGood: number; // Time window for good hit (+/- seconds)
    scorePerPerfect: number;
    scorePerGreat: number; // New: Score for a great hit
    scorePerGood: number;
    comboThreshold: number; // Combo starts contributing score after this many hits
    multiplierPerCombo: number; // Score multiplier increase per combo tier
    scorePenaltyPerMiss: number; // Score deducted when a note is missed or passed
    bpm: number; // New: Beats per minute
    timeSignature: string; // New: Time signature (e.g., "4/4")
    beatOffset: number; // New: Offset for the first downbeat in milliseconds
    fallDuration: number; // Added: Calculated property for time a note takes to fall
}

interface BeatmapNote {
    time: number; // Time in seconds when the note should be hit (or start for Hold/Slide)
    lane: number; // Lane index (0 to laneCount-1)
    type?: NoteType; // Optional, defaults to TAP
    duration?: number; // For HOLD notes, how long to hold (seconds)
    endLane?: number; // For SLIDE notes, the ending lane (for visual or input path)
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
    HIT = "HIT",          // Successfully hit (tap/slide, or initial press of hold)
    HOLDING = "HOLDING",  // Actively holding a hold note (simplified: means initial hit was successful)
    MISSED = "MISSED",    // Completely missed by input timing or wrong input
    PASSED = "PASSED",    // Note passed hit zone without input
}

class Note {
    lane: number;
    spawnTime: number; // Time when note appears at noteSpawnY
    arrivalTime: number; // Time in seconds when the *bottom* of the note should reach hitZoneY
    state: NoteState;
    x: number;
    y: number; // Y-coordinate of the *top* of the note
    width: number;
    height: number; // Standard height of the note graphic
    // Removed fallDuration from Note class, as it's now a global game setting.

    type: NoteType;
    duration?: number; // For HOLD notes
    endLane?: number; // For SLIDE notes
    
    // For simplified HOLD note processing:
    isHolding: boolean; // True if the initial hit for a HOLD note was successful

    constructor(lane: number, arrivalTime: number, game: Game, type: NoteType = NoteType.TAP, duration?: number, endLane?: number) {
        this.lane = lane;
        this.arrivalTime = arrivalTime;
        this.state = NoteState.FALLING;

        const settings = game.gameData.gameSettings;
        // Use the pre-calculated fallDuration from game settings
        this.spawnTime = this.arrivalTime - settings.fallDuration; // Note's TOP spawns at noteSpawnY

        this.width = settings.noteWidth;
        this.height = settings.noteHeight;

        const totalLanesWidth = settings.laneCount * settings.laneWidth + (settings.laneCount - 1) * settings.laneSpacing;
        const startX = (settings.canvasWidth - totalLanesWidth) / 2;
        this.x = startX + lane * (settings.laneWidth + settings.laneSpacing) + (settings.laneWidth - this.width) / 2;

        this.y = settings.noteSpawnY; // Initial Y position (top of the note)

        this.type = type;
        this.duration = duration;
        this.endLane = endLane;
        this.isHolding = false;
    }

    update(currentTime: number, game: Game) {
        if (this.state !== NoteState.FALLING && this.state !== NoteState.HOLDING) return;

        const settings = game.gameData.gameSettings;
        // Calculate the total distance the *top* of the note travels
        const travelDistanceForTop = settings.hitZoneY - settings.noteHeight - settings.noteSpawnY;
        // Calculate progress based on the global fallDuration
        const progress = Math.max(0, Math.min(1, (currentTime - this.spawnTime) / settings.fallDuration));
        
        // this.y is the Y-coordinate of the *top* of the note
        this.y = settings.noteSpawnY + progress * travelDistanceForTop;
        
        // For HOLD notes, the visual length will be drawn above this.y

        // Check for missed notes (passed hit zone without input)
        // If currentTime passes the arrivalTime + good hit window, and it's still falling
        if (this.state === NoteState.FALLING && currentTime > this.arrivalTime + settings.hitWindowGood) {
            this.state = NoteState.PASSED;
            game.handleMiss(this);
        }
        
        // For simplified HOLD notes, if successfully "hit" (state is HOLDING) and its duration passes
        if (this.state === NoteState.HOLDING && this.type === NoteType.HOLD && this.duration) {
            if (currentTime >= this.arrivalTime + this.duration) {
                // The hold duration has finished. Mark as HIT (successfully completed).
                // This is a simplification; a full implementation would track keyup.
                this.state = NoteState.HIT;
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, noteImage: HTMLImageElement, game: Game) {
        // Do not draw notes that are already processed or are merely in a transitional 'HIT' state
        if (this.state === NoteState.HIT && this.type !== NoteType.HOLD) return; // Tap/Slide disappear instantly
        if (this.state === NoteState.MISSED || this.state === NoteState.PASSED) return; // Missed/Passed disappear

        const settings = game.gameData.gameSettings;
        let totalVisualHeight = this.height; // Default total height for TAP/SLIDE notes
        let fillColor = "#FF0000"; // Default: Red for TAP

        if (this.type === NoteType.HOLD && this.duration) {
            const holdPixelLength = this.duration * settings.noteSpeed; // Pixels representing the hold duration
            const holdTrailY = this.y - holdPixelLength; // Trail starts above the main note image
            totalVisualHeight = this.height + holdPixelLength; // Total visual height of the entire hold note
            fillColor = "#0000FF"; // Blue for HOLD

            // Draw the hold trail part (above the main note image)
            ctx.fillStyle = fillColor;
            ctx.fillRect(this.x, holdTrailY, this.width, holdPixelLength);
        } else if (this.type === NoteType.SLIDE) {
            fillColor = "#00FF00"; // Green for SLIDE
        }

        // Draw the main note image (or a fallback rectangle)
        if (noteImage) {
            ctx.drawImage(noteImage, this.x, this.y, this.width, this.height);
        } else {
            // Fallback rectangle for the main note part
            ctx.fillStyle = fillColor;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }

        // Add a visual indicator for SLIDE notes
        if (this.type === NoteType.SLIDE) {
            ctx.fillStyle = "white"; // Small dot or arrow
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.height / 4, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Visual feedback for notes being held (e.g., brighter color)
        if (this.state === NoteState.HOLDING) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.4)"; // Semi-transparent white overlay
            // Overlay should cover the entire visible part of the note, including hold trail
            const overlayY = (this.type === NoteType.HOLD && this.duration) ? (this.y - (this.duration * settings.noteSpeed)) : this.y;
            const overlayHeight = totalVisualHeight; // Use the calculated totalVisualHeight
            ctx.fillRect(this.x, overlayY, this.width, overlayHeight);
        }
    }
}

class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    public readonly gameData!: GameData;
    private loadedImages: Map<string, HTMLImageElement> = new Map();
    private loadedSounds: Map<string, HTMLAudioElement> = new Map();

    private gameState: GameState = GameState.TITLE;
    private lastTime: number = 0;
    private currentAudioTime: number = 0;
    private bgmAudio: HTMLAudioElement | null = null;
    private bgmStartTime: number = 0;

    private activeNotes: Note[] = [];
    private beatmapIndex: number = 0;

    private score: number = 0;
    private combo: number = 0;
    private maxCombo: number = 0;
    private totalHits: number = 0;
    private perfectHits: number = 0;
    private greatHits: number = 0; // New
    private goodHits: number = 0;
    private missHits: number = 0;

    private pressedKeys: Set<string> = new Set();
    private justPressedKeys: Set<string> = new Set();

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
            this.justPressedKeys.add(key);
        }
    }

    private handleKeyUp(event: KeyboardEvent) {
        const key = event.key.toLowerCase();
        this.pressedKeys.delete(key);
        // If a hold note was being held, this keyup might end it.
        // For the current simplified hold logic, this is not actively tracked here.
    }

    async init() {
        console.log("Loading game data...");
        try {
            const response = await fetch("data.json");
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            (this.gameData as GameData) = await response.json() as GameData;
            
            // Calculate fallDuration based on loaded settings and add it to gameSettings
            const settings = this.gameData.gameSettings;
            // fallDuration is the time it takes for the *bottom* of the note to reach hitZoneY
            settings.fallDuration = (settings.hitZoneY - settings.noteSpawnY - settings.noteHeight) / settings.noteSpeed;
            if (settings.fallDuration < 0) {
                console.warn("Calculated fallDuration is negative. Adjusting to 0. Check noteSpawnY, hitZoneY, and noteHeight.");
                settings.fallDuration = 0;
            }
            
            console.log("Game data loaded:", this.gameData);

            this.canvas.width = this.gameData.gameSettings.canvasWidth;
            this.canvas.height = this.gameData.gameSettings.canvasHeight;

            await this.loadAssets();
            console.log("Assets loaded.");

            this.startTitleScreen();
            this.gameLoop(0);
        } catch (error) {
            console.error("Failed to initialize game:", error);
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
            this.bgmAudio.loop = false; // BGM should not loop in a rhythm game, it ends.
            this.bgmAudio.play().then(() => {
                this.bgmStartTime = performance.now();
                this.currentAudioTime = 0;
                console.log("BGM started.");
            }).catch(error => {
                console.warn("BGM autoplay prevented:", error);
                this.bgmStartTime = performance.now();
                this.currentAudioTime = 0;
            });
        }
    }

    private endGame() {
        this.gameState = GameState.GAME_OVER;
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            this.bgmAudio.currentTime = 0;
        }
    }

    private resetGameStats() {
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.totalHits = 0;
        this.perfectHits = 0;
        this.greatHits = 0;
        this.goodHits = 0;
        this.missHits = 0;
    }

    private gameLoop(time: DOMHighResTimeStamp) {
        const deltaTime = (time - this.lastTime) / 1000;
        this.lastTime = time;

        this.update(deltaTime);
        this.draw();

        this.justPressedKeys.clear();

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
        if (this.justPressedKeys.size > 0) {
            this.startGame();
        }
    }

    private updatePlaying(deltaTime: number) {
        if (this.bgmAudio && !this.bgmAudio.paused) {
            this.currentAudioTime = this.bgmAudio.currentTime;
        } else {
            this.currentAudioTime = (performance.now() - this.bgmStartTime) / 1000;
        }

        // Spawn new notes
        while (this.beatmapIndex < this.gameData.beatmap.length) {
            const nextNoteData = this.gameData.beatmap[this.beatmapIndex];
            // Calculate when the note's *top* should appear at noteSpawnY
            const noteSpawnTime = nextNoteData.time - this.gameData.gameSettings.fallDuration;
            
            // For hold notes, they should appear earlier to show their full length
            let effectiveSpawnTime = noteSpawnTime;
            if (nextNoteData.type === NoteType.HOLD && nextNoteData.duration) {
                // If the entire hold note (length + graphic) should be visible as it falls.
                // For simplified visual, spawn based on arrivalTime, and the visual extends 'upwards'.
                // If it should appear for the full duration, it needs to spawn even earlier.
                // For current simplified logic, just spawn based on the arrival time.
            }

            if (this.currentAudioTime >= effectiveSpawnTime) {
                const note = new Note(nextNoteData.lane, nextNoteData.time, this, nextNoteData.type, nextNoteData.duration, nextNoteData.endLane);
                this.activeNotes.push(note);
                this.beatmapIndex++;
            } else {
                break;
            }
        }

        // Update existing notes and remove processed ones
        for (let i = this.activeNotes.length - 1; i >= 0; i--) {
            const note = this.activeNotes[i];
            note.update(this.currentAudioTime, this);

            // Remove notes that have been explicitly hit or completely processed (missed/passed, including completed holds)
            if (note.state === NoteState.HIT || note.state === NoteState.MISSED || note.state === NoteState.PASSED) {
                this.activeNotes.splice(i, 1);
            }
        }

        // Handle player input (key down for TAP/SLIDE/HOLD start)
        const laneKeys = this.gameData.gameSettings.laneKeys;
        for (let i = 0; i < laneKeys.length; i++) {
            const key = laneKeys[i];
            if (this.justPressedKeys.has(key)) {
                this.handlePlayerInput(i, this.currentAudioTime);
            }
        }

        // Check if song ended and all notes processed
        const bgmDuration = this.gameData.assets.sounds.find(s => s.name === "bgm")?.duration_seconds || 0;
        if ((this.bgmAudio && this.bgmAudio.ended) || this.currentAudioTime > bgmDuration + 2) { // Add buffer
            if (this.activeNotes.length === 0) {
                this.endGame();
            }
        }
    }

    private updateGameOver() {
        if (this.justPressedKeys.size > 0) {
            this.startTitleScreen();
        }
    }

    private handlePlayerInput(lane: number, inputTime: number) {
        const settings = this.gameData.gameSettings;
        let bestNoteIndex = -1;
        let smallestDelta = Infinity;
        let targetNote: Note | null = null;

        // Find the closest active FALLING note in the given lane
        for (let i = 0; i < this.activeNotes.length; i++) {
            const note = this.activeNotes[i];
            // Only consider falling notes for initial input detection
            if (note.lane === lane && note.state === NoteState.FALLING) {
                const delta = Math.abs(inputTime - note.arrivalTime);
                if (delta < smallestDelta) {
                    smallestDelta = delta;
                    bestNoteIndex = i;
                    targetNote = note;
                }
            }
        }

        if (targetNote) {
            // Apply judgment based on hit windows
            if (smallestDelta <= settings.hitWindowPerfect) {
                this.applyJudgment("perfect", targetNote);
            } else if (smallestDelta <= settings.hitWindowGreat) {
                this.applyJudgment("great", targetNote);
            } else if (smallestDelta <= settings.hitWindowGood) {
                this.applyJudgment("good", targetNote);
            } else {
                // Too early/late, count as a miss
                this.handleMiss(targetNote);
            }
        } else {
            // No note to hit, or note already passed/missed or is a HOLD note that finished.
            // This is a "phantom" hit, which counts as a miss.
            this.handleMiss(null);
        }
    }

    private applyJudgment(type: "perfect" | "great" | "good", note: Note) {
        const settings = this.gameData.gameSettings;
        this.combo++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.totalHits++;

        let scoreValue = 0;
        if (type === "perfect") {
            scoreValue = settings.scorePerPerfect;
            this.perfectHits++;
        } else if (type === "great") {
            scoreValue = settings.scorePerGreat;
            this.greatHits++;
        } else if (type === "good") {
            scoreValue = settings.scorePerGood;
            this.goodHits++;
        }

        // Apply combo multiplier
        let currentMultiplier = 1;
        if (this.combo >= settings.comboThreshold) {
            currentMultiplier += Math.floor(this.combo / settings.comboThreshold) * settings.multiplierPerCombo;
        }
        this.score += scoreValue * currentMultiplier;

        // Handle note state based on type
        if (note.type === NoteType.HOLD) {
            note.state = NoteState.HOLDING; // Mark as holding
            note.isHolding = true; // For visual feedback
            // For a full implementation, you'd track hold start time and require a keyup at 'arrivalTime + duration'
        } else {
            note.state = NoteState.HIT; // For TAP and SLIDE, it's just a single hit
        }
        this.playEffect("hitEffect");
    }

    public handleMiss(note: Note | null) {
        this.combo = 0; // Combo breaks on any miss
        this.missHits++;
        this.totalHits++;
        this.score -= this.gameData.gameSettings.scorePenaltyPerMiss;

        // Mark the specific note as missed if provided
        if (note && (note.state === NoteState.FALLING || note.state === NoteState.HOLDING)) {
            note.state = NoteState.MISSED;
        }

        if (this.score < 0) {
            this.endGame();
        }
        this.playEffect("missEffect");
    }

    private playEffect(name: string) {
        const audio = this.loadedSounds.get(name);
        if (audio) {
            const clone = audio.cloneNode() as HTMLAudioElement;
            clone.volume = audio.volume;
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

        const totalLanesWidth = settings.laneCount * settings.laneWidth + (settings.laneCount - 1) * settings.laneSpacing;
        const startX = (settings.canvasWidth - totalLanesWidth) / 2;

        for (let i = 0; i < settings.laneCount; i++) {
            const laneX = startX + i * (settings.laneWidth + settings.laneSpacing);
            this.ctx.fillStyle = "#333333";
            this.ctx.fillRect(laneX, 0, settings.laneWidth, this.canvas.height);

            this.ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
            this.ctx.font = "20px Arial";
            this.ctx.textAlign = "center";
            this.ctx.fillText(settings.laneKeys[i].toUpperCase(), laneX + settings.laneWidth / 2, settings.hitZoneY + 50);

            if (hitZoneImage) {
                this.ctx.drawImage(hitZoneImage, laneX, settings.hitZoneY - hitZoneImage.height / 2, settings.laneWidth, hitZoneImage.height);
            } else {
                this.ctx.fillStyle = "#00ffff";
                this.ctx.fillRect(laneX, settings.hitZoneY, settings.laneWidth, 5);
            }

            if (this.pressedKeys.has(settings.laneKeys[i])) {
                this.ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
                this.ctx.fillRect(laneX, settings.hitZoneY - 20, settings.laneWidth, 40);
            }
        }

        this.activeNotes.forEach(note => {
            note.draw(this.ctx, noteImage!, this);
        });

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

        const totalNotesHit = this.perfectHits + this.greatHits + this.goodHits;
        const accuracy = this.totalHits > 0 ? (totalNotesHit / this.totalHits) * 100 : 0;
        this.ctx.fillText(`Accuracy: ${accuracy.toFixed(2)}%`, this.canvas.width / 2, this.canvas.height / 2 + 80);

        this.ctx.font = "24px Arial";
        this.ctx.fillText("Press Any Key to Restart", this.canvas.width / 2, this.canvas.height / 2 + 150);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const game = new Game("gameCanvas");
    game.init();
});