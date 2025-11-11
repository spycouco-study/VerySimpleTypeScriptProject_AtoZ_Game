interface GameSettings {
    gameDurationDays: number;
    startingMoney: number;
    startingCharm: number;
    startingIntellect: number;
    startingKindness: number;
    startEvent: string;
}

interface GameData {
    gameSettings: GameSettings;
    playerStats: string[];
    npcs: NPC[];
    dialogueEvents: { [id: string]: GameEvent };
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
}

interface SoundAsset {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
    loop: boolean;
}

interface NPC {
    id: string;
    name: string;
    description: string;
    initialAffection: number;
    sprite: string;
    dialogueColors: { text: string; name: string };
    preferences: {
        gift: string;
        topic: string;
    };
}

interface Effects {
    [key: string]: number;
}

interface Choice {
    text: string;
    nextEvent: string;
    effect?: Effects;
}

interface GameEvent { // Renamed from 'Event' to avoid conflict with DOM's Event type
    type: "dialogue" | "ending";
    background?: string;
    npcId?: string;
    text: string;
    choices?: Choice[];
    effect?: Effects;
}

interface GameState {
    currentDay: number;
    maxDays: number;
    playerStats: { [key: string]: number };
    npcAffection: { [npcId: string]: number };
    currentEventId: string;
    currentDialogueText: string;
    currentChoices: Choice[];
    currentNPC: NPC | null;
    currentBackground: HTMLImageElement | null;
    dialogueColors: { text: string; name: string };
    isLoading: boolean;
    isGameOver: boolean;
    endingMessage: string;
    lastUpdateTime: number;
    waitingForStart: boolean; // Added to handle initial user interaction for audio
}

class AssetLoader {
    images: Map<string, HTMLImageElement> = new Map();
    sounds: Map<string, HTMLAudioElement> = new Map();
    private loadingPromises: Promise<void>[] = [];
    private loadedCount = 0;
    private totalAssets = 0;

    constructor() {}

    async load(data: GameData): Promise<void> {
        this.totalAssets = data.assets.images.length + data.assets.sounds.length;
        this.loadedCount = 0;
        this.loadingPromises = [];

        for (const imgAsset of data.assets.images) {
            const img = new Image();
            img.src = imgAsset.path;
            const promise = new Promise<void>((resolve) => {
                img.onload = () => {
                    this.images.set(imgAsset.name, img);
                    this.loadedCount++;
                    resolve();
                };
                img.onerror = () => {
                    console.error(`Failed to load image: ${imgAsset.path}`);
                    this.loadedCount++;
                    resolve();
                };
            });
            this.loadingPromises.push(promise);
        }

        for (const soundAsset of data.assets.sounds) {
            const audio = new Audio();
            audio.src = soundAsset.path;
            audio.volume = soundAsset.volume;
            audio.loop = soundAsset.loop;
            const promise = new Promise<void>((resolve) => {
                audio.oncanplaythrough = () => {
                    this.sounds.set(soundAsset.name, audio);
                    this.loadedCount++;
                    resolve();
                };
                audio.onerror = () => {
                    console.error(`Failed to load sound: ${soundAsset.path}`);
                    this.loadedCount++;
                    resolve();
                };
            });
            this.loadingPromises.push(promise);
        }

        await Promise.all(this.loadingPromises);
        console.log("All assets loaded!");
    }

    get progress(): number {
        if (this.totalAssets === 0) return 1;
        return this.loadedCount / this.totalAssets;
    }

    getImage(name: string): HTMLImageElement | undefined {
        return this.images.get(name);
    }

    getSound(name: string): HTMLAudioElement | undefined {
        return this.sounds.get(name);
    }

    playAudio(name: string): void {
        const audio = this.getSound(name);
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.error(`Error playing audio ${name}: ${e}`));
        } else {
            console.warn(`Audio ${name} not found.`);
        }
    }

    stopAudio(name: string): void {
        const audio = this.getSound(name);
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
    }

    stopAllAudio(): void {
        this.sounds.forEach(audio => audio.pause());
    }
}

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let gameData: GameData;
let gameState: GameState;
let assetLoader: AssetLoader;

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

const DIALOGUE_BOX_HEIGHT = 200;
const DIALOGUE_BOX_Y = CANVAS_HEIGHT - DIALOGUE_BOX_HEIGHT;
const DIALOGUE_PADDING = 20;

const CHOICE_BUTTON_WIDTH = 300;
const CHOICE_BUTTON_HEIGHT = 50;
const CHOICE_BUTTON_GAP = 10;
// CHOICE_BUTTON_START_Y is now dynamically calculated within render() and handleCanvasClick()

type ValidStartingStatKeys = 'startingCharm' | 'startingIntellect' | 'startingKindness' | 'startingMoney';

async function initGame(): Promise<void> {
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error("Canvas element with ID 'gameCanvas' not found.");
        return;
    }
    ctx = canvas.getContext('2d')!;

    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    gameState = {
        currentDay: 0,
        maxDays: 0,
        playerStats: {},
        npcAffection: {},
        currentEventId: "loading",
        currentDialogueText: "Loading game data...",
        currentChoices: [],
        currentNPC: null,
        currentBackground: null,
        dialogueColors: { text: "#FFFFFF", name: "#FFFFFF" },
        isLoading: true,
        isGameOver: false,
        endingMessage: "",
        lastUpdateTime: performance.now(),
        waitingForStart: false, // Initially false, set to true after assets load
    };

    assetLoader = new AssetLoader();

    try {
        const response = await fetch('data.json');
        gameData = await response.json();
        console.log("Game data loaded:", gameData);

        gameState.maxDays = gameData.gameSettings.gameDurationDays;
        gameState.currentDay = 1;
        gameData.playerStats.forEach(stat => {
            const statKey = `starting${capitalize(stat)}` as ValidStartingStatKeys;
            gameState.playerStats[stat] = gameData.gameSettings[statKey];
        });
        gameData.npcs.forEach(npc => {
            gameState.npcAffection[npc.id] = npc.initialAffection;
        });

        await assetLoader.load(gameData);
        gameState.isLoading = false;
        gameState.waitingForStart = true; // Set to true after assets are loaded, waiting for user interaction
        
        canvas.addEventListener('click', handleCanvasClick);
        gameLoop();
    } catch (error) {
        console.error("Failed to load game data or assets:", error);
        gameState.currentDialogueText = `ERROR: Failed to load game. ${error instanceof Error ? error.message : String(error)}`;
        gameState.isLoading = false;
        gameState.waitingForStart = false; // Ensure it's not waiting for start if there's an error
        gameLoop();
    }
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function gameLoop(currentTime: number = performance.now()): void {
    const deltaTime = (currentTime - gameState.lastUpdateTime) / 1000;
    gameState.lastUpdateTime = currentTime;

    update(deltaTime);
    render();

    if (!gameState.isGameOver) {
        requestAnimationFrame(gameLoop);
    }
}

function update(deltaTime: number): void {
    if (gameState.isLoading || gameState.isGameOver || gameState.waitingForStart) return;
}

function render(): void {
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (gameState.isLoading) {
        drawLoadingScreen();
        return;
    }

    if (gameState.waitingForStart) { // Draw a 'click to start' screen
        drawStartScreen(); 
        return;
    }

    if (gameState.currentBackground) {
        ctx.drawImage(gameState.currentBackground, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
        ctx.fillStyle = "#333333";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    if (gameState.currentNPC && gameState.currentNPC.sprite) {
        const npcImage = assetLoader.getImage(gameState.currentNPC.sprite);
        if (npcImage) {
            const targetHeight = CANVAS_HEIGHT * 0.7;
            const scale = targetHeight / npcImage.height;
            const targetWidth = npcImage.width * scale;
            const x = (CANVAS_WIDTH - targetWidth) / 2;
            const y = DIALOGUE_BOX_Y - targetHeight + 50;
            ctx.drawImage(npcImage, x, y, targetWidth, targetHeight);
        }
    }

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "24px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`Day: ${gameState.currentDay} / ${gameState.maxDays}`, CANVAS_WIDTH / 2, 30);

    let statY = 60;
    ctx.font = "18px Arial";
    ctx.textAlign = "left";
    for (const statName in gameState.playerStats) {
        ctx.fillText(`${capitalize(statName)}: ${gameState.playerStats[statName]}`, 20, statY);
        statY += 25;
    }

    let npcAffectionY = 60;
    ctx.textAlign = "right";
    for (const npcId in gameState.npcAffection) {
        const npc = gameData.npcs.find(n => n.id === npcId);
        if (npc) {
             ctx.fillText(`${npc.name} 애정: ${gameState.npcAffection[npcId]}`, CANVAS_WIDTH - 20, npcAffectionY);
             npcAffectionY += 25;
        }
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, DIALOGUE_BOX_Y, CANVAS_WIDTH, DIALOGUE_BOX_HEIGHT);

    if (gameState.currentNPC) {
        ctx.fillStyle = gameState.dialogueColors.name;
        ctx.font = "24px Arial";
        ctx.textAlign = "left";
        ctx.fillText(gameState.currentNPC.name, DIALOGUE_PADDING, DIALOGUE_BOX_Y + DIALOGUE_PADDING + 10);
    }

    ctx.fillStyle = gameState.dialogueColors.text;
    ctx.font = "20px Arial";
    ctx.textAlign = "left";
    const dialogueTextX = DIALOGUE_PADDING;
    const dialogueTextY = DIALOGUE_BOX_Y + DIALOGUE_PADDING + (gameState.currentNPC ? 40 : 10);
    drawWrappedText(gameState.currentDialogueText, dialogueTextX, dialogueTextY, CANVAS_WIDTH - DIALOGUE_PADDING * 2, 25);

    if (gameState.currentChoices && gameState.currentChoices.length > 0) {
        const startX = (CANVAS_WIDTH - CHOICE_BUTTON_WIDTH) / 2;
        
        const totalChoicesHeight = gameState.currentChoices.length * CHOICE_BUTTON_HEIGHT + 
                                  (gameState.currentChoices.length > 0 ? (gameState.currentChoices.length - 1) * CHOICE_BUTTON_GAP : 0);
        
        const choicesBlockTopY = DIALOGUE_BOX_Y - totalChoicesHeight - DIALOGUE_PADDING;

        gameState.currentChoices.forEach((choice, index) => {
            const y = choicesBlockTopY + index * (CHOICE_BUTTON_HEIGHT + CHOICE_BUTTON_GAP);
            drawButton(choice.text, startX, y, CHOICE_BUTTON_WIDTH, CHOICE_BUTTON_HEIGHT, index);
        });
    }

    if (gameState.isGameOver) {
        drawGameOverScreen();
    }
}

function drawLoadingScreen(): void {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "30px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Loading...", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);

    const barWidth = 400;
    const barHeight = 20;
    const barX = (CANVAS_WIDTH - barWidth) / 2;
    const barY = CANVAS_HEIGHT / 2 + 20;

    ctx.strokeStyle = "#FFFFFF";
    ctx.strokeRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = "#4CAF50";
    ctx.fillRect(barX, barY, barWidth * assetLoader.progress, barHeight);
    ctx.fillText(`${Math.round(assetLoader.progress * 100)}%`, CANVAS_WIDTH / 2, barY + barHeight + 30);
}

function drawStartScreen(): void {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "40px Arial";
    ctx.textAlign = "center";
    ctx.fillText("게임 시작하기", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);

    ctx.font = "24px Arial";
    ctx.fillText("화면을 클릭하세요", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);
}


function drawGameOverScreen(): void {
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "40px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Game Over", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 100);

    ctx.font = "24px Arial";
    drawWrappedText(gameState.endingMessage, (CANVAS_WIDTH - 600) / 2, CANVAS_HEIGHT / 2 - 40, 600, 30);

    ctx.font = "20px Arial";
    ctx.fillText("Click anywhere to restart", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 100);
}


function drawWrappedText(text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
    if (!ctx) return;
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line, x, currentY);
            line = words[n] + ' ';
            currentY += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, currentY);
}


function drawButton(text: string, x: number, y: number, width: number, height: number, index: number): void {
    const buttonImage = assetLoader.getImage("button_bg");
    if (buttonImage) {
        ctx.drawImage(buttonImage, x, y, width, height);
    } else {
        ctx.fillStyle = "#4CAF50";
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = "#333333";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
    }

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "18px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + width / 2, y + height / 2);
    ctx.textBaseline = "alphabetic";
}

function handleCanvasClick(event: MouseEvent): void {
    if (gameState.isLoading) return;

    if (gameState.waitingForStart) {
        assetLoader.playAudio("bgm_main"); // Play BGM on user interaction
        triggerEvent(gameData.gameSettings.startEvent); // Start the game logic
        gameState.waitingForStart = false; // Clear the flag
        assetLoader.playAudio("sfx_click"); // Play a click sound for feedback
        return;
    }

    if (gameState.isGameOver) {
        resetGame();
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    if (gameState.currentChoices && gameState.currentChoices.length > 0) {
        const startX = (CANVAS_WIDTH - CHOICE_BUTTON_WIDTH) / 2;
        
        const totalChoicesHeight = gameState.currentChoices.length * CHOICE_BUTTON_HEIGHT + 
                                  (gameState.currentChoices.length > 0 ? (gameState.currentChoices.length - 1) * CHOICE_BUTTON_GAP : 0);
        const choicesBlockTopY = DIALOGUE_BOX_Y - totalChoicesHeight - DIALOGUE_PADDING;

        for (let i = 0; i < gameState.currentChoices.length; i++) {
            const y = choicesBlockTopY + i * (CHOICE_BUTTON_HEIGHT + CHOICE_BUTTON_GAP);
            if (mouseX >= startX && mouseX <= startX + CHOICE_BUTTON_WIDTH &&
                mouseY >= y && mouseY <= y + CHOICE_BUTTON_HEIGHT) {
                processChoice(i);
                assetLoader.playAudio("sfx_click");
                return;
            }
        }
    }
}

function processChoice(choiceIndex: number): void {
    if (choiceIndex < 0 || choiceIndex >= gameState.currentChoices.length) return;

    const chosen = gameState.currentChoices[choiceIndex];
    if (chosen.effect) {
        applyEffects(chosen.effect);
    }
    triggerEvent(chosen.nextEvent);
}

function applyEffects(effects: Effects | undefined): void {
    if (!effects) return;

    let positiveEffect = false;
    let negativeEffect = false;

    for (const key in effects) {
        if (key.startsWith("celebrity_") && key.endsWith("_affection")) {
            const npcId = key.replace("_affection", "");
            gameState.npcAffection[npcId] += effects[key];
            if (effects[key] > 0) positiveEffect = true;
            if (effects[key] < 0) negativeEffect = true;
            console.log(`${npcId} affection changed by ${effects[key]}. New: ${gameState.npcAffection[npcId]}`);
        } else if (gameState.playerStats.hasOwnProperty(key)) {
            gameState.playerStats[key] += effects[key];
            if (effects[key] > 0) positiveEffect = true;
            if (effects[key] < 0) negativeEffect = true;
            console.log(`Player ${key} changed by ${effects[key]}. New: ${gameState.playerStats[key]}`);
        }
    }

    if (positiveEffect) assetLoader.playAudio("sfx_positive");
    if (negativeEffect) assetLoader.playAudio("sfx_negative");
}


function triggerEvent(eventId: string): void {
    // Handle "advance_day" as a special internal event before looking it up in dialogueEvents.
    if (eventId === "advance_day") {
        advanceDay();
        return; 
    }

    const event = gameData.dialogueEvents[eventId];
    if (!event) {
        console.error(`Event '${eventId}' not found.`);
        gameState.currentDialogueText = `ERROR: Event '${eventId}' not found.`;
        gameState.currentChoices = [];
        return;
    }

    gameState.currentEventId = eventId;
    gameState.currentDialogueText = event.text;
    gameState.currentChoices = event.choices || [];
    gameState.currentNPC = event.npcId ? gameData.npcs.find(npc => npc.id === event.npcId) || null : null;
    gameState.dialogueColors = gameState.currentNPC ? gameState.currentNPC.dialogueColors : { text: "#FFFFFF", name: "#FFFFFF" };
    gameState.currentBackground = event.background ? assetLoader.getImage(event.background) || null : null;

    if (event.effect) {
        applyEffects(event.effect);
    }

    if (event.type === "ending") {
        showEnding();
    }
}

function advanceDay(): void {
    gameState.currentDay++;
    if (gameState.currentDay > gameState.maxDays) {
        triggerEvent("game_over_time");
    } else {
        triggerEvent("day_start");
    }
}

function showEnding(): void {
    gameState.isGameOver = true;
    assetLoader.stopAllAudio();

    let endingText = "당신의 연예계 커리어는 성공적이었습니다!\n\n";

    endingText += "== 최종 능력치 ==\n";
    for (const statName in gameState.playerStats) {
        endingText += `${capitalize(statName)}: ${gameState.playerStats[statName]}\n`;
    }
    endingText += "\n";

    endingText += "== 연예인들과의 관계 ==\n";
    gameData.npcs.forEach(npc => {
        const affection = gameState.npcAffection[npc.id];
        let relationshipStatus = "평범한 관계";
        if (affection >= 100) relationshipStatus = "매우 좋은 관계!";
        else if (affection >= 50) relationshipStatus = "친밀한 관계";
        else if (affection < 0) relationshipStatus = "거리가 있는 관계...";
        endingText += `${npc.name}: ${affection} (${relationshipStatus})\n`;
    });

    gameState.endingMessage = endingText;
}

function resetGame(): void {
    assetLoader.stopAllAudio();

    gameState = {
        currentDay: 0,
        maxDays: 0,
        playerStats: {},
        npcAffection: {},
        currentEventId: "loading",
        currentDialogueText: "Restarting game...",
        currentChoices: [],
        currentNPC: null,
        currentBackground: null,
        dialogueColors: { text: "#FFFFFF", name: "#FFFFFF" },
        isLoading: false,
        isGameOver: false,
        endingMessage: "",
        lastUpdateTime: performance.now(),
        waitingForStart: true, // Reset to waiting for user interaction
    };

    gameState.maxDays = gameData.gameSettings.gameDurationDays;
    gameState.currentDay = 1;
    gameData.playerStats.forEach(stat => {
        const statKey = `starting${capitalize(stat)}` as ValidStartingStatKeys;
        gameState.playerStats[stat] = gameData.gameSettings[statKey];
    });
    gameData.npcs.forEach(npc => {
        gameState.npcAffection[npc.id] = npc.initialAffection;
    });

    // BGM and start event will be handled by handleCanvasClick when waitingForStart is true
    
    if (!gameState.isGameOver) {
        requestAnimationFrame(gameLoop);
    }
}

window.onload = initGame;