// Define interfaces for data structure
interface AssetImage {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface AssetSound {
    name: string;
    path: string;
    volume: number;
    loop?: boolean;
}

interface CelebrityData {
    name: string;
    image: string; // Refers to the name of the image asset
}

interface GameSettings {
    initialLives: number;
    roundTimeSeconds: number;
    canvasWidth: number;
    canvasHeight: number;
    titleScreenText: string;
    gameOverScreenText: string;
    celebrityImageDisplayWidth: number;
    celebrityImageDisplayHeight: number;
    inputBoxHeight: number;
    inputBoxWidth: number;
    inputBoxBottomMargin: number;
    scorePerCorrect: number;
    messageDisplayDuration: number;
    fontFamily: string;
    fontSizeTitle: string;
    fontSizeUI: string;
    fontSizeMessage: string;
    textColor: string;
    backgroundColor: string;
    messageCorrectColor: string;
    messageWrongColor: string;
    messageTimeUpColor: string;
}

interface GameData {
    celebrities: CelebrityData[];
    gameSettings: GameSettings;
    assets: {
        images: AssetImage[];
        sounds: AssetSound[];
    };
}

// Game State Enum
enum GameState {
    TITLE,
    PLAYING,
    GAME_OVER,
}

// Global variables for game state and assets
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let gameData: GameData;
let loadedImages: Map<string, HTMLImageElement> = new Map();
let loadedSounds: Map<string, HTMLAudioElement> = new Map();
let inputElement: HTMLInputElement;

let currentGameState: GameState = GameState.TITLE;
let lives: number = 0;
let score: number = 0;
let currentCelebrity: CelebrityData | null = null;
let currentCelebrityImage: HTMLImageElement | null = null;
let timeRemaining: number = 0; // in milliseconds
let lastFrameTime: number = 0;
let message: string = '';
let messageColor: string = '';
let messageTimer: number = 0; // duration for message display (in seconds)

let previousCelebrityIndex: number = -1; // To prevent picking the same celebrity twice in a row
let gameStartedOnce: boolean = false; // To track if game has ever started for BGM autoplay policy

// Function to load assets
async function loadAssets(data: GameData): Promise<void> {
    const imagePromises = data.assets.images.map(async (imgAsset) => {
        return new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.src = imgAsset.path;
            img.onload = () => {
                loadedImages.set(imgAsset.name, img);
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${imgAsset.path}`);
                reject();
            };
        });
    });

    const soundPromises = data.assets.sounds.map(async (sndAsset) => {
        return new Promise<void>((resolve, reject) => {
            const audio = new Audio();
            audio.src = sndAsset.path;
            audio.volume = sndAsset.volume;
            if (sndAsset.loop) {
                audio.loop = true;
            }
            audio.oncanplaythrough = () => {
                loadedSounds.set(sndAsset.name, audio);
                resolve();
            };
            audio.onerror = () => {
                console.error(`Failed to load sound: ${sndAsset.path}`);
                reject();
            };
        });
    });

    await Promise.all([...imagePromises, ...soundPromises]);
    console.log("All assets loaded.");
}

// Function to initialize the game elements (canvas, input)
function initializeGameElements() {
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error("Canvas element 'gameCanvas' not found!");
        return;
    }
    ctx = canvas.getContext('2d')!;

    canvas.width = gameData.gameSettings.canvasWidth;
    canvas.height = gameData.gameSettings.canvasHeight;

    // Create and style the input element dynamically
    inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.id = 'gameInput';
    document.body.appendChild(inputElement);

    // Style the input element
    inputElement.style.position = 'absolute';
    inputElement.style.width = `${gameData.gameSettings.inputBoxWidth}px`;
    inputElement.style.height = `${gameData.gameSettings.inputBoxHeight}px`;
    inputElement.style.left = `${(canvas.offsetLeft + canvas.width / 2) - gameData.gameSettings.inputBoxWidth / 2}px`;
    inputElement.style.top = `${canvas.offsetTop + canvas.height - gameData.gameSettings.inputBoxBottomMargin - gameData.gameSettings.inputBoxHeight}px`;
    inputElement.style.fontSize = gameData.gameSettings.fontSizeUI;
    inputElement.style.textAlign = 'center';
    inputElement.style.border = '2px solid #ccc';
    inputElement.style.padding = '5px';
    inputElement.style.boxSizing = 'border-box';
    inputElement.style.backgroundColor = '#333';
    inputElement.style.color = '#eee';
    inputElement.style.outline = 'none';
    inputElement.style.display = 'none'; // Initially hidden
    inputElement.placeholder = 'Enter celebrity name...';

    // Event listener for input submission
    inputElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && currentGameState === GameState.PLAYING) {
            submitGuess(inputElement.value);
            inputElement.value = ''; // Clear input after submission
            e.preventDefault(); // Prevent default Enter key behavior (e.g., form submission)
            e.stopPropagation(); // Prevent the event from bubbling up to the document, which could trigger a game restart
        }
    });

    // Event listener for starting/restarting game
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (currentGameState === GameState.TITLE || currentGameState === GameState.GAME_OVER)) {
            startGame();
        }
    });
}

// Start a new game
function startGame() {
    lives = gameData.gameSettings.initialLives;
    score = 0;
    currentGameState = GameState.PLAYING;
    message = '';
    messageTimer = 0;
    previousCelebrityIndex = -1; // Reset for new game
    if (inputElement) {
        inputElement.style.display = 'block';
        inputElement.focus();
    }
    pickNewCelebrity();
    resetTimer();

    // Play background music if not already playing or paused
    if (loadedSounds.has('bgm')) {
        const bgm = loadedSounds.get('bgm')!;
        if (!gameStartedOnce) { // Only attempt to play on first start after user interaction
            bgm.currentTime = 0; // Rewind for clean start
            bgm.play().catch(e => console.warn("BGM autoplay prevented. User interaction needed:", e));
            gameStartedOnce = true;
        } else if (bgm.paused) { // If BGM was stopped (e.g., game over), restart it
            bgm.currentTime = 0; // Rewind for clean start
            bgm.play().catch(e => console.warn("BGM playback failed on restart:", e));
        }
    }
}

// Pick a new celebrity
function pickNewCelebrity() {
    if (gameData.celebrities.length === 0) {
        console.warn("No celebrities defined in data.json!");
        return;
    }
    let newIndex: number;
    do {
        newIndex = Math.floor(Math.random() * gameData.celebrities.length);
    } while (newIndex === previousCelebrityIndex && gameData.celebrities.length > 1); // Ensure different from previous, unless only one celebrity
    previousCelebrityIndex = newIndex;

    currentCelebrity = gameData.celebrities[newIndex];
    currentCelebrityImage = loadedImages.get(currentCelebrity.image) || null;
    if (!currentCelebrityImage) {
        console.error(`Image for celebrity ${currentCelebrity.name} not found: ${currentCelebrity.image}`);
    }
    // console.log(`Current celebrity: ${currentCelebrity.name}`); // For debugging
}

// Reset the round timer
function resetTimer() {
    timeRemaining = gameData.gameSettings.roundTimeSeconds * 1000; // convert to ms
}

// Submit guess logic
function submitGuess(guess: string) {
    if (!currentCelebrity) return;

    const correctName = currentCelebrity.name.toLowerCase().trim();
    const submittedGuess = guess.toLowerCase().trim();

    if (submittedGuess === correctName) {
        handleCorrectGuess();
    } else {
        handleWrongGuess();
    }
}

// Handle correct guess
function handleCorrectGuess() {
    score += gameData.gameSettings.scorePerCorrect;
    message = 'Correct!';
    messageColor = gameData.gameSettings.messageCorrectColor;
    messageTimer = gameData.gameSettings.messageDisplayDuration;
    if (loadedSounds.has('correct')) {
        loadedSounds.get('correct')!.currentTime = 0; // Rewind sound
        loadedSounds.get('correct')!.play().catch(e => console.warn("Sound playback failed:", e));
    }
    pickNewCelebrity();
    resetTimer();
}

// Handle wrong guess
function handleWrongGuess() {
    lives--;
    message = `Wrong! It was ${currentCelebrity?.name}`;
    messageColor = gameData.gameSettings.messageWrongColor;
    messageTimer = gameData.gameSettings.messageDisplayDuration;
    if (loadedSounds.has('wrong')) {
        loadedSounds.get('wrong')!.currentTime = 0; // Rewind sound
        loadedSounds.get('wrong')!.play().catch(e => console.warn("Sound playback failed:", e));
    }
    if (lives <= 0) {
        gameOver();
    } else {
        pickNewCelebrity();
        resetTimer();
    }
}

// Handle time's up
function handleTimesUp() {
    lives--;
    message = `Time's Up! It was ${currentCelebrity?.name}`;
    messageColor = gameData.gameSettings.messageTimeUpColor;
    messageTimer = gameData.gameSettings.messageDisplayDuration;
    if (loadedSounds.has('timeout')) { // Assuming a 'timeout' sound asset
        loadedSounds.get('timeout')!.currentTime = 0; // Rewind sound
        loadedSounds.get('timeout')!.play().catch(e => console.warn("Sound playback failed:", e));
    }
    if (lives <= 0) {
        gameOver();
    } else {
        pickNewCelebrity();
        resetTimer();
    }
}

// Game over logic
function gameOver() {
    currentGameState = GameState.GAME_OVER;
    if (inputElement) {
        inputElement.style.display = 'none';
        inputElement.value = '';
    }
    if (loadedSounds.has('bgm')) { // Stop BGM on game over
        const bgm = loadedSounds.get('bgm')!;
        bgm.pause();
        bgm.currentTime = 0; // Reset BGM to start
    }
    // gameStartedOnce remains true, to prevent re-attempting autoplay on future restarts,
    // assuming browser policies are already satisfied after first interaction.
}

// Update game state
function update(deltaTime: number) {
    if (currentGameState === GameState.PLAYING) {
        timeRemaining -= deltaTime;
        if (timeRemaining <= 0) {
            handleTimesUp();
        }
    }

    if (messageTimer > 0) {
        messageTimer -= deltaTime / 1000; // message timer is in seconds
        if (messageTimer <= 0) {
            message = '';
            messageColor = '';
        }
    }
}

// Render game elements
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = gameData.gameSettings.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = gameData.gameSettings.textColor;
    ctx.font = gameData.gameSettings.fontSizeUI + ' ' + gameData.gameSettings.fontFamily;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (currentGameState === GameState.TITLE) {
        ctx.font = gameData.gameSettings.fontSizeTitle + ' ' + gameData.gameSettings.fontFamily;
        ctx.fillText(gameData.gameSettings.titleScreenText, canvas.width / 2, canvas.height / 2);
    } else if (currentGameState === GameState.PLAYING) {
        // Draw celebrity image
        if (currentCelebrityImage) {
            const displayWidth = gameData.gameSettings.celebrityImageDisplayWidth;
            const displayHeight = gameData.gameSettings.celebrityImageDisplayHeight;
            const x = (canvas.width - displayWidth) / 2;
            const y = (canvas.height / 2) - displayHeight / 2 - 50; // Position above center

            // Draw image, scaling it to the specified display dimensions
            ctx.drawImage(currentCelebrityImage, x, y, displayWidth, displayHeight);
        }

        // Draw timer
        ctx.font = gameData.gameSettings.fontSizeUI + ' ' + gameData.gameSettings.fontFamily;
        ctx.fillText(`Time: ${Math.max(0, Math.ceil(timeRemaining / 1000))}`, canvas.width / 2, 50);

        // Draw lives
        ctx.fillText(`Lives: ${lives}`, canvas.width - 100, 50);

        // Draw score
        ctx.fillText(`Score: ${score}`, 100, 50);

        // Draw message (Correct/Wrong/Time's Up)
        if (message) {
            ctx.fillStyle = messageColor;
            ctx.font = gameData.gameSettings.fontSizeMessage + ' ' + gameData.gameSettings.fontFamily;
            // Position message below the celebrity image, above input box area
            ctx.fillText(message, canvas.width / 2, canvas.height / 2 + gameData.gameSettings.celebrityImageDisplayHeight / 2 + 30);
        }
    } else if (currentGameState === GameState.GAME_OVER) {
        ctx.font = gameData.gameSettings.fontSizeTitle + ' ' + gameData.gameSettings.fontFamily;
        ctx.fillText(gameData.gameSettings.gameOverScreenText, canvas.width / 2, canvas.height / 2 - 50);
        ctx.font = gameData.gameSettings.fontSizeUI + ' ' + gameData.gameSettings.fontFamily;
        ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2 + 10);
        ctx.fillText("Press Enter to Restart", canvas.width / 2, canvas.height / 2 + 70);
    }
}

// Main game loop
function gameLoop(currentTime: number) {
    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;

    update(deltaTime);
    render();

    requestAnimationFrame(gameLoop);
}

// Main function to start the game
async function main() {
    try {
        const response = await fetch('data.json');
        gameData = await response.json();
        console.log("Game data loaded:", gameData);

        initializeGameElements();
        await loadAssets(gameData);

        lastFrameTime = performance.now(); // Initialize lastFrameTime
        requestAnimationFrame(gameLoop); // Start the game loop

    } catch (error) {
        console.error('Failed to load game data or assets:', error);
        // Display an error message on the canvas if possible
        if (ctx) {
            ctx.fillStyle = 'red';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Error loading game. Check console for details.', canvas.width / 2, canvas.height / 2);
        }
    }
}

main(); // Execute the main function to start everything