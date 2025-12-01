// game.ts

// --- Interfaces for data.json structure ---
interface IAssetData {
    name: string;
    path: string;
}

interface IImageData extends IAssetData {
    width: number;
    height: number;
}

interface ISoundData extends IAssetData {
    duration_seconds: number;
    volume: number;
}

interface IJudgeTextSetting {
    judgment: string;
    color: string;
    timeWindowMs: number; // Milliseconds from perfect hit
    scoreMultiplier: number;
    healthChange: number; // Positive for hit, negative for miss
}

interface IGameConfig {
    canvasWidth: number;
    canvasHeight: number;
    hitLineY: number; // Y-coordinate where notes are hit (bottom of the note)
    noteFallSpeedPxPerMs: number; // Pixels per millisecond
    laneCount: number;
    laneWidth: number;
    laneSpacing: number; // Gap between lanes
    laneStartX: number; // X position of the first lane
    laneKeys: { [key: string]: number }; // Maps key name to lane index
    defaultNoteHeight: number;
    hitEffectDurationMs: number;
    judgeTextDurationMs: number;
    initialHealth: number;
    maxHealth: number;
    backgroundScrollSpeedY: number;
    perfectHitOffsetMs: number; // Offset for perfect hit: positive means hit slightly AFTER note aligns at hitLineY
}

interface ITitleScreenConfig {
    titleText: string;
    startButtonText: string;
    titleFont: string;
    startFont: string;
    titleColor: string;
    startColor: string;
    backgroundImageName: string;
}

interface IGameplayUIConfig {
    scoreFont: string;
    comboFont: string;
    healthBarColor: string;
    judgeTextFont: string;
}

interface INoteSpawnData {
    time: number; // Time in seconds from song start when note should be hit
    lane: number; // Lane index
    type: string; // e.g., "normal"
}

interface ISongData {
    name: string;
    artist: string;
    bgmAssetName: string;
    bpm: number; // Beats per minute
    notes: INoteSpawnData[];
}

interface IGameData {
    assets: {
        images: IImageData[];
        sounds: ISoundData[];
    };
    gameConfig: IGameConfig;
    titleScreen: ITitleScreenConfig;
    gameplayUI: IGameplayUIConfig;
    judgeSettings: IJudgeTextSetting[];
    noteTypes: { [key: string]: { imageAssetName: string } }; // e.g., "normal": { imageAssetName: "note_blue" }
    songs: ISongData[];
}

// --- Enums ---
enum GameState {
    LOADING = "LOADING",
    TITLE = "TITLE",
    GAMEPLAY = "GAMEPLAY",
    GAME_OVER = "GAME_OVER",
}

// --- Global Game Variables ---
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let audioContext: AudioContext;

let gameData: IGameData;
const assetCache = {
    images: new Map<string, HTMLImageElement>(),
    sounds: new Map<string, AudioBuffer>(),
};

let currentState: GameState = GameState.LOADING;
let lastUpdateTime: DOMHighResTimeStamp = 0;
let animationFrameId: number | null = null;

// Gameplay specific variables
let currentSong: ISongData | null = null;
let currentBGM: AudioBufferSourceNode | null = null;
let currentSongTimeOffset: number = 0; // AudioContext.currentTime when song started playing
let gameElapsedTime: number = 0; // Elapsed time since gameplay started (in ms), used for logic
let score: number = 0;
let combo: number = 0;
let maxCombo: number = 0;
let health: number = 0;

let activeNotes: Note[] = [];
let noteSpawnQueue: INoteSpawnData[] = [];
let hitEffects: HitEffect[] = [];
let judgeTexts: JudgeText[] = [];

let backgroundScrollY: number = 0; // For scrolling background image

// --- Game Object Classes ---

class Note {
    image: HTMLImageElement;
    x: number;
    y: number; // Top-left corner
    width: number;
    height: number;
    lane: number;
    spawnTime: number; // Song time in seconds when this note should be hit
    hit: boolean = false; // Flag to prevent multiple hits/misses

    constructor(lane: number, spawnTime: number, image: HTMLImageElement, defaultNoteHeight: number) {
        this.lane = lane;
        this.spawnTime = spawnTime;
        this.image = image;

        const laneConfig = gameData.gameConfig;
        this.width = laneConfig.laneWidth;
        this.height = defaultNoteHeight;

        this.x = laneConfig.laneStartX + lane * (laneConfig.laneWidth + laneConfig.laneSpacing);
        this.y = 0; // Will be set in update
    }

    update(deltaTime: number, gameElapsedTimeMs: number) {
        const laneConfig = gameData.gameConfig;
        const perfectHitGameTimeMs = (this.spawnTime * 1000) + laneConfig.perfectHitOffsetMs;
        const timeRemainingForPerfectHit = perfectHitGameTimeMs - gameElapsedTimeMs;
        const distanceAboveHitLine = timeRemainingForPerfectHit * laneConfig.noteFallSpeedPxPerMs;
        this.y = laneConfig.hitLineY - distanceAboveHitLine - this.height; // Top-left of the note
    }

    render(ctx: CanvasRenderingContext2D) {
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }
}

class HitEffect {
    image: HTMLImageElement;
    x: number;
    y: number;
    width: number;
    height: number;
    lifeTime: number; // milliseconds
    maxLifeTime: number;

    constructor(x: number, y: number, image: HTMLImageElement, durationMs: number, width: number, height: number) {
        this.image = image;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.lifeTime = 0;
        this.maxLifeTime = durationMs;
    }

    update(deltaTime: number): boolean {
        this.lifeTime += deltaTime;
        return this.lifeTime >= this.maxLifeTime; // true if effect is finished
    }

    render(ctx: CanvasRenderingContext2D) {
        const alpha = 1 - (this.lifeTime / this.maxLifeTime);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        ctx.restore();
    }
}

class JudgeText {
    text: string;
    color: string;
    x: number;
    y: number;
    lifeTime: number; // milliseconds
    maxLifeTime: number;
    initialY: number;

    constructor(text: string, color: string, x: number, y: number, durationMs: number) {
        this.text = text;
        this.color = color;
        this.x = x;
        this.y = y;
        this.initialY = y;
        this.lifeTime = 0;
        this.maxLifeTime = durationMs;
    }

    update(deltaTime: number): boolean {
        this.lifeTime += deltaTime;
        // Float up animation
        this.y = this.initialY - (this.lifeTime / this.maxLifeTime) * 20; // Float up 20px
        return this.lifeTime >= this.maxLifeTime; // true if text is finished
    }

    render(ctx: CanvasRenderingContext2D) {
        const alpha = 1 - (this.lifeTime / this.maxLifeTime);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = gameData.gameplayUI.judgeTextFont;
        ctx.fillStyle = this.color;
        ctx.textAlign = "center";
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

// --- Core Game Functions ---

async function initGame() {
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error("Canvas element with ID 'gameCanvas' not found.");
        return;
    }
    ctx = canvas.getContext('2d')!;

    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    try {
        await loadGameData();
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        await loadAssets();
        transitionToState(GameState.TITLE);
        addInputListeners();
        gameLoop(0); // Start the game loop
    } catch (error) {
        console.error("Failed to initialize game:", error);
        // Optionally, display an error message on the canvas
        ctx.clearRect(0,0, canvas.width, canvas.height);
        ctx.fillStyle = "red";
        ctx.font = "30px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Error: " + (error as Error).message, canvas.width/2, canvas.height/2);
    }
}

function resizeCanvas() {
    if (!gameData) return;
    canvas.width = gameData.gameConfig.canvasWidth;
    canvas.height = gameData.gameConfig.canvasHeight;
}

async function loadGameData() {
    const response = await fetch('data.json');
    if (!response.ok) {
        throw new Error(`Failed to load data.json: ${response.statusText}`);
    }
    gameData = await response.json();
    console.log("Game data loaded:", gameData);
}

async function loadAssets() {
    const imagePromises = gameData.assets.images.map(img => {
        return new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.src = img.path;
            image.onload = () => {
                assetCache.images.set(img.name, image);
                resolve();
            };
            image.onerror = () => {
                console.warn(`Failed to load image: ${img.path}`);
                assetCache.images.set(img.name, new Image()); // Store a dummy image to prevent errors later
                resolve(); // Still resolve to let other assets load
            };
        });
    });

    const soundPromises = gameData.assets.sounds.map(sound => {
        return fetch(sound.path)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.arrayBuffer();
            })
            .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
            .then(audioBuffer => {
                assetCache.sounds.set(sound.name, audioBuffer);
            })
            .catch(error => {
                console.warn(`Failed to load sound: ${sound.path}`, error);
                assetCache.sounds.set(sound.name, audioContext.createBuffer(1, 1, 44100)); // Store a silent dummy buffer
            });
    });

    await Promise.all([...imagePromises, ...soundPromises]);
    console.log("All assets loaded.");
}

function transitionToState(newState: GameState) {
    console.log(`Transitioning from ${currentState} to ${newState}`);
    currentState = newState;

    // State-specific setup
    switch (newState) {
        case GameState.TITLE:
            if (currentBGM) {
                currentBGM.stop();
                currentBGM = null;
            }
            break;
        case GameState.GAMEPLAY:
            startGameplay();
            break;
        case GameState.GAME_OVER:
            if (currentBGM) {
                currentBGM.stop();
                currentBGM = null;
            }
            break;
    }
}

function startGameplay() {
    if (!gameData.songs || gameData.songs.length === 0) {
        console.error("No songs defined in data.json!");
        transitionToState(GameState.TITLE);
        return;
    }

    currentSong = gameData.songs[0]; // For this example, always picks the first song
    score = 0;
    combo = 0;
    maxCombo = 0;
    health = gameData.gameConfig.initialHealth;
    gameElapsedTime = 0;
    activeNotes = [];
    hitEffects = [];
    judgeTexts = [];
    backgroundScrollY = 0;

    // Populate note spawn queue, sorted by time
    noteSpawnQueue = [...currentSong.notes].sort((a, b) => a.time - b.time);

    const bgmBuffer = assetCache.sounds.get(currentSong.bgmAssetName);
    if (bgmBuffer) {
        const soundInfo = gameData.assets.sounds.find(s => s.name === currentSong!.bgmAssetName);
        playBGM(bgmBuffer, soundInfo?.volume || 1.0, false); // Play BGM once (not looping)
        if (currentBGM) {
            currentBGM.onended = () => {
                console.log("Song ended.");
                // Ensure we only transition if still in gameplay (e.g., not already Game Over by health)
                if (currentState === GameState.GAMEPLAY) {
                    transitionToState(GameState.GAME_OVER);
                }
            };
        }
    } else {
        console.warn(`BGM asset ${currentSong.bgmAssetName} not found.`);
        // Game will continue without music; fallback game over condition based on notes will apply.
    }

    currentSongTimeOffset = audioContext.currentTime;
}

function playBGM(buffer: AudioBuffer, volume: number, loop: boolean = false) { // Added 'loop' parameter
    if (currentBGM) {
        currentBGM.stop();
        currentBGM = null;
    }
    currentBGM = audioContext.createBufferSource();
    currentBGM.buffer = buffer;

    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume;
    currentBGM.connect(gainNode);
    gainNode.connect(audioContext.destination);

    currentBGM.loop = loop; // Use the 'loop' parameter
    currentBGM.start(0);
}

function playEffect(assetName: string) {
    const effectBuffer = assetCache.sounds.get(assetName);
    if (effectBuffer) {
        const source = audioContext.createBufferSource();
        source.buffer = effectBuffer;

        const soundData = gameData.assets.sounds.find(s => s.name === assetName);
        const volume = soundData ? soundData.volume : 1.0;

        const gainNode = audioContext.createGain();
        gainNode.gain.value = volume;
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);

        source.start(0);
    } else {
        console.warn(`Effect asset ${assetName} not found.`);
    }
}


function gameLoop(timestamp: DOMHighResTimeStamp) {
    if (!lastUpdateTime) {
        lastUpdateTime = timestamp;
    }
    const deltaTime = timestamp - lastUpdateTime; // in milliseconds
    lastUpdateTime = timestamp;

    update(deltaTime);
    render();

    animationFrameId = requestAnimationFrame(gameLoop);
}

function update(deltaTime: number) {
    switch (currentState) {
        case GameState.LOADING:
            break;
        case GameState.TITLE:
            break;
        case GameState.GAMEPLAY:
            updateGameplay(deltaTime);
            break;
        case GameState.GAME_OVER:
            break;
    }
}

function updateGameplay(deltaTime: number) {
    if (!currentSong || !gameData) return;

    gameElapsedTime += deltaTime;

    const config = gameData.gameConfig;
    const songTimeSeconds = gameElapsedTime / 1000;

    // --- Spawn Notes ---
    const timeToFallFromTopToHitLineMs = (canvas.height / config.noteFallSpeedPxPerMs);
    const earliestSpawnTimeForVisibleNote = songTimeSeconds - (timeToFallFromTopToHitLineMs / 1000);

    while (noteSpawnQueue.length > 0 && noteSpawnQueue[0].time <= earliestSpawnTimeForVisibleNote + 0.1) { // Add a small buffer for spawn
        const noteData = noteSpawnQueue.shift()!;
        const noteType = gameData.noteTypes[noteData.type];
        if (!noteType) {
            console.warn(`Note type ${noteData.type} not found in noteTypes.`);
            continue;
        }
        const noteImage = assetCache.images.get(noteType.imageAssetName);
        if (noteImage) {
            activeNotes.push(new Note(noteData.lane, noteData.time, noteImage, config.defaultNoteHeight));
        } else {
            console.warn(`Note image for asset ${noteType.imageAssetName} not found.`);
        }
    }

    // --- Update Notes & Check for Misses ---
    for (let i = activeNotes.length - 1; i >= 0; i--) {
        const note = activeNotes[i];
        if (note.hit) continue;

        note.update(deltaTime, gameElapsedTime);

        const perfectHitGameTimeMs = (note.spawnTime * 1000) + config.perfectHitOffsetMs;
        const timeDiffFromPerfectMs = gameElapsedTime - perfectHitGameTimeMs;

        // Find the widest 'Miss' window to determine when a note is fully past its hit opportunity
        const missSetting = gameData.judgeSettings.find(j => j.judgment === "Miss");
        const missWindowEnd = missSetting ? missSetting.timeWindowMs : Infinity;

        // If the note has passed its perfect hit time + miss window, it's an auto-miss
        if (timeDiffFromPerfectMs > missWindowEnd && !note.hit) {
            processHit(note, timeDiffFromPerfectMs, true); // true for auto-miss
            activeNotes.splice(i, 1); // Remove the note
        }
    }
    // Remove notes that have been hit
    activeNotes = activeNotes.filter(note => !note.hit);

    // --- Update Hit Effects ---
    for (let i = hitEffects.length - 1; i >= 0; i--) {
        if (hitEffects[i].update(deltaTime)) {
            hitEffects.splice(i, 1);
        }
    }

    // --- Update Judge Texts ---
    for (let i = judgeTexts.length - 1; i >= 0; i--) {
        if (judgeTexts[i].update(deltaTime)) {
            judgeTexts.splice(i, 1);
        }
    }

    // --- Update Background Scroll ---
    const bgImage = assetCache.images.get(gameData.titleScreen.backgroundImageName);
    if (bgImage) {
        backgroundScrollY = (backgroundScrollY + config.backgroundScrollSpeedY * deltaTime) % bgImage.height;
    }

    // --- Check Game Over Condition ---
    if (health <= 0) {
        transitionToState(GameState.GAME_OVER);
    } else if (!currentBGM && currentSong && noteSpawnQueue.length === 0 && activeNotes.length === 0 && gameElapsedTime / 1000 > (currentSong.notes[currentSong.notes.length - 1]?.time || 0) + 3) {
        // Fallback: If no BGM is playing (e.g., failed to load),
        // transition to Game Over when all notes processed and a buffer time passed after the last note.
        // currentSong.notes[currentSong.notes.length - 1]?.time handles case of empty notes array.
        transitionToState(GameState.GAME_OVER);
    }
    // Primary Game Over condition for song completion is handled by currentBGM.onended in startGameplay.
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    switch (currentState) {
        case GameState.LOADING:
            drawLoadingScreen();
            break;
        case GameState.TITLE:
            drawTitleScreen();
            break;
        case GameState.GAMEPLAY:
            drawGameplay();
            break;
        case GameState.GAME_OVER:
            drawGameOverScreen();
            break;
    }
}

function drawLoadingScreen() {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "30px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText("Loading Assets...", canvas.width / 2, canvas.height / 2);
}

function drawTitleScreen() {
    const titleConfig = gameData.titleScreen;
    const background = assetCache.images.get(titleConfig.backgroundImageName);
    if (background) {
        ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = "#333";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.font = titleConfig.titleFont;
    ctx.fillStyle = titleConfig.titleColor;
    ctx.textAlign = "center";
    ctx.fillText(titleConfig.titleText, canvas.width / 2, canvas.height / 2 - 50);

    ctx.font = titleConfig.startFont;
    ctx.fillStyle = titleConfig.startColor;
    ctx.fillText(titleConfig.startButtonText, canvas.width / 2, canvas.height / 2 + 50);
}

function drawGameplay() {
    const config = gameData.gameConfig;

    // Draw scrolling background
    const bgImage = assetCache.images.get(gameData.titleScreen.backgroundImageName);
    if (bgImage) {
        const imgHeight = bgImage.height;
        let currentY = backgroundScrollY;
        while (currentY < canvas.height) {
            ctx.drawImage(bgImage, 0, currentY, canvas.width, imgHeight);
            currentY += imgHeight;
        }
        currentY = backgroundScrollY - imgHeight;
        while (currentY < canvas.height) {
            ctx.drawImage(bgImage, 0, currentY, canvas.width, imgHeight);
            currentY += imgHeight;
        }
    } else {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Draw Lanes
    for (let i = 0; i < config.laneCount; i++) {
        const laneX = config.laneStartX + i * (config.laneWidth + config.laneSpacing);
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        ctx.fillRect(laneX, 0, config.laneWidth, canvas.height);
    }

    // Draw Notes
    for (const note of activeNotes) {
        note.render(ctx);
    }

    // Draw Hit Effects
    for (const effect of hitEffects) {
        effect.render(ctx);
    }

    // Draw Hit Line
    ctx.strokeStyle = "rgba(255, 255, 0, 0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, config.hitLineY);
    ctx.lineTo(canvas.width, config.hitLineY);
    ctx.stroke();

    // Draw Judge Texts
    for (const text of judgeTexts) {
        text.render(ctx);
    }

    // Draw UI (Score, Combo, Health)
    ctx.fillStyle = "white";
    ctx.textAlign = "left";
    ctx.font = gameData.gameplayUI.scoreFont;
    ctx.fillText(`Score: ${score}`, 20, 40);

    ctx.textAlign = "center";
    ctx.font = gameData.gameplayUI.comboFont;
    if (combo > 0) {
        ctx.fillText(`Combo: ${combo}`, canvas.width / 2, 80);
    }

    // Health Bar
    const healthBarWidth = 200;
    const healthBarHeight = 20;
    const healthBarX = canvas.width - healthBarWidth - 20;
    const healthBarY = 20;

    ctx.fillStyle = "gray";
    ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
    ctx.fillStyle = gameData.gameplayUI.healthBarColor;
    const currentHealthWidth = (health / gameData.gameConfig.maxHealth) * healthBarWidth;
    ctx.fillRect(healthBarX, healthBarY, Math.max(0, currentHealthWidth), healthBarHeight);
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1;
    ctx.strokeRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
}

function drawGameOverScreen() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = "60px Arial";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2 - 100);

    ctx.font = "30px Arial";
    ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2);
    ctx.fillText(`Max Combo: ${maxCombo}`, canvas.width / 2, canvas.height / 2 + 50);
    ctx.fillText("Press R to Restart or Esc for Title", canvas.width / 2, canvas.height / 2 + 150);
}


function addInputListeners() {
    window.addEventListener('keydown', handleKeyDown);
}

function handleKeyDown(event: KeyboardEvent) {
    if (event.repeat) return; // Ignore key repeat

    switch (currentState) {
        case GameState.TITLE:
            transitionToState(GameState.GAMEPLAY);
            break;
        case GameState.GAMEPLAY:
            handleGameplayInput(event.key);
            break;
        case GameState.GAME_OVER:
            if (event.key.toLowerCase() === 'r') {
                transitionToState(GameState.GAMEPLAY); // Restart current song
            } else if (event.key === 'Escape') {
                transitionToState(GameState.TITLE); // Go to title
            }
            break;
    }
}

function handleGameplayInput(key: string) {
    const config = gameData.gameConfig;
    const laneIndex = config.laneKeys[key.toLowerCase()];

    if (laneIndex === undefined) {
        // Not a recognized game key
        return;
    }

    let hitNote: Note | null = null;
    let closestTimeDiffAbsolute = Infinity; // Absolute time difference from perfect hit (ms)
    let perfectHitGameTimeMs = 0;

    // Sort judge settings by timeWindowMs in ascending order to find the widest miss window
    const missSetting = gameData.judgeSettings.find(j => j.judgment === "Miss");
    const maxJudgeWindow = missSetting ? missSetting.timeWindowMs : 0; // The widest window for any judgment

    for (const note of activeNotes) {
        if (note.lane === laneIndex && !note.hit) {
            const notePerfectHitGameTimeMs = (note.spawnTime * 1000) + config.perfectHitOffsetMs;
            const timeDiff = gameElapsedTime - notePerfectHitGameTimeMs;
            const absoluteTimeDiff = Math.abs(timeDiff);

            // Only consider notes within the maximum judgment window
            if (absoluteTimeDiff <= maxJudgeWindow && absoluteTimeDiff < closestTimeDiffAbsolute) {
                closestTimeDiffAbsolute = absoluteTimeDiff;
                hitNote = note;
                perfectHitGameTimeMs = notePerfectHitGameTimeMs;
            }
        }
    }

    if (hitNote) {
        processHit(hitNote, gameElapsedTime - perfectHitGameTimeMs, false); // false for player hit
        hitNote.hit = true; // Mark as hit for removal
    } else {
        // No note hit in this lane within the window or no note at all
        // Treat as a "Bad Press"
        const missPenalty = gameData.judgeSettings.find(j => j.judgment === "Miss")?.healthChange || -10;
        health += missPenalty;
        health = Math.max(0, health);
        combo = 0;
        playEffect("miss_effect"); // Play miss sound for bad press

        const laneX = config.laneStartX + laneIndex * (config.laneWidth + config.laneSpacing);
        judgeTexts.push(new JudgeText("Bad Press", "grey", laneX + config.laneWidth / 2, config.hitLineY - 50, gameData.gameConfig.judgeTextDurationMs));
    }
}

function processHit(note: Note, timeDifference: number, isAutoMiss: boolean) {
    const config = gameData.gameConfig;
    let judgment: IJudgeTextSetting | undefined;
    let absoluteTimeDiff = Math.abs(timeDifference);

    // Find the judgment based on time difference, from narrowest to widest window
    const sortedJudgeSettings = [...gameData.judgeSettings].sort((a, b) => a.timeWindowMs - b.timeWindowMs);

    for (const setting of sortedJudgeSettings) {
        if (absoluteTimeDiff <= setting.timeWindowMs) {
            judgment = setting;
            break;
        }
    }

    if (isAutoMiss) {
        judgment = gameData.judgeSettings.find(j => j.judgment === "Miss");
        if (!judgment) { // Fallback if "Miss" isn't explicitly defined
            judgment = { judgment: "Miss", color: "red", timeWindowMs: Infinity, scoreMultiplier: 0, healthChange: -20 };
        }
    }

    if (judgment) {
        score += Math.floor(judgment.scoreMultiplier * (1 + combo / 10)); // Example scoring logic with combo multiplier

        if (judgment.judgment === "Miss" || isAutoMiss) {
            combo = 0;
            playEffect("miss_effect");
        } else {
            combo++;
            maxCombo = Math.max(maxCombo, combo);
            playEffect("hit_effect");
        }

        health += judgment.healthChange;
        health = Math.max(0, Math.min(health, config.maxHealth));

        const laneX = config.laneStartX + note.lane * (config.laneWidth + config.laneSpacing);
        judgeTexts.push(new JudgeText(judgment.judgment, judgment.color, laneX + config.laneWidth / 2, config.hitLineY - 50, config.judgeTextDurationMs));

        const hitEffectImage = assetCache.images.get("hit_effect");
        if (hitEffectImage) {
            hitEffects.push(new HitEffect(
                laneX + (config.laneWidth - note.width) / 2, // Centered horizontally
                config.hitLineY - note.height / 2, // Centered vertically on the hit line
                hitEffectImage,
                config.hitEffectDurationMs,
                note.width,
                note.height
            ));
        }
    } else {
        console.warn("No judgment found for time difference:", timeDifference, " (This should not happen)");
        // Default miss logic if no judgment setting matches (as a fallback)
        health -= 10;
        combo = 0;
        health = Math.max(0, health);
        playEffect("miss_effect");
    }
}

// Initialize the game when the DOM is ready
document.addEventListener('DOMContentLoaded', initGame);