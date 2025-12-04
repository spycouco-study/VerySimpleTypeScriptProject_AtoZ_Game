// game.ts

// 1. HTML Canvas and Context setup
let canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
// Fallback/error handling if canvas element is not found
if (!canvas) {
    console.error("Canvas element with ID 'gameCanvas' not found. Creating a default one.");
    const body = document.getElementsByTagName('body')[0];
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'gameCanvas';
    body.appendChild(newCanvas);
    // Set default dimensions for safety before gameData is loaded
    newCanvas.width = 800;
    newCanvas.height = 600;
    canvas = newCanvas; // Update canvas reference
}
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
if (!ctx) {
    console.error("Failed to get 2D rendering context for canvas. Your browser may not support HTML5 Canvas.");
    // Potentially display a user-friendly error message on the page
}


// 2. Global Game State Variables and Types
enum GameState {
    TITLE,
    PLAYING,
    GAME_OVER
}

let currentGameState: GameState = GameState.TITLE;
let gameData: any; // Will hold the parsed data from data.json
let assets: { images: Map<string, HTMLImageElement>, sounds: Map<string, HTMLAudioElement> } = { images: new Map(), sounds: new Map() };

let currentCelebrities: any[] = []; // Shuffled list of celebrities for rounds
let currentCelebrity: any | null = null; // The celebrity for the current round
let currentCelebrityImage: HTMLImageElement | null = null; // The loaded image for the current celebrity

let timeRemaining: number = 0; // Time in milliseconds for the current round
let lives: number = 0;
let score: number = 0;

let message: string | null = null; // Message like "Correct!", "Wrong!", "Time's Up!"
let messageColor: string = '';
let messageTimer: number = 0; // How long to display the message (in seconds)

let lastFrameTime: number = 0; // For delta time calculation in the game loop

// 3. Input Element (dynamically created)
let inputElement: HTMLInputElement;

// 4. Asset Loading Function
async function loadAssets() {
    const loadImagePromises = gameData.assets.images.map((imgAsset: any) => {
        return new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.src = imgAsset.path;
            img.onload = () => {
                assets.images.set(imgAsset.name, img);
                resolve();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${imgAsset.path}`);
                reject(`Failed to load image: ${imgAsset.path}`);
            };
        });
    });

    const loadSoundPromises = gameData.assets.sounds.map((sndAsset: any) => {
        return new Promise<void>((resolve) => {
            const audio = new Audio(sndAsset.path);
            audio.volume = sndAsset.volume !== undefined ? sndAsset.volume : 1.0;
            audio.loop = sndAsset.loop || false;
            assets.sounds.set(sndAsset.name, audio);
            // For simplicity, we resolve immediately after creating the Audio object.
            // For more robust games, 'canplaythrough' event might be used for sounds.
            resolve();
        });
    });

    await Promise.all([...loadImagePromises, ...loadSoundPromises]);
    console.log('All assets loaded.');
}

// 5. Game Logic Functions
function initGame() {
    // Set canvas dimensions based on loaded gameData
    canvas.width = gameData.gameSettings.canvasWidth;
    canvas.height = gameData.gameSettings.canvasHeight;

    // Create and position input element
    inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.placeholder = 'Guess the celebrity!';
    inputElement.style.position = 'absolute'; // Position absolutely relative to the body
    inputElement.style.display = 'none'; // Hidden initially
    inputElement.style.boxSizing = 'border-box'; // Include padding and border in width/height calculation
    document.body.appendChild(inputElement);

    positionInputBox(); // Call to set initial position and style

    // Event Listeners
    document.addEventListener('keydown', handleGlobalKeyDown); // For Title/Game Over screen navigation
    inputElement.addEventListener('keydown', handleInputKeyDown); // For submitting guesses in PLAYING state

    // Start the game loop
    requestAnimationFrame(gameLoop);
}

// Dynamically position the input box relative to the canvas
function positionInputBox() {
    if (!inputElement || !gameData || !canvas) return;

    const canvasRect = canvas.getBoundingClientRect(); // Get canvas position and size on screen
    const inputBoxWidth = gameData.gameSettings.inputBoxWidth;
    const inputBoxHeight = gameData.gameSettings.inputBoxHeight;
    const inputBoxBottomMargin = gameData.gameSettings.inputBoxBottomMargin;

    // Calculate position: center horizontally, position from bottom with margin
    inputElement.style.width = `${inputBoxWidth}px`;
    inputElement.style.height = `${inputBoxHeight}px`;
    inputElement.style.left = `${canvasRect.left + (canvasRect.width - inputBoxWidth) / 2}px`;
    inputElement.style.top = `${canvasRect.top + canvasRect.height - inputBoxHeight - inputBoxBottomMargin}px`;
    inputElement.style.fontSize = gameData.gameSettings.fontSizeUI;
    inputElement.style.fontFamily = gameData.gameSettings.fontFamily;
    inputElement.style.padding = '5px 10px';
    inputElement.style.backgroundColor = '#333';
    inputElement.style.color = gameData.gameSettings.textColor;
    inputElement.style.border = '2px solid #555';
    inputElement.style.borderRadius = '5px';
    inputElement.style.outline = 'none'; // Remove default focus outline
}

function startGame() {
    lives = gameData.gameSettings.initialLives;
    score = 0;
    // Create a shuffled copy of celebrities for each new game
    currentCelebrities = [...gameData.celebrities];
    shuffleArray(currentCelebrities);
    currentGameState = GameState.PLAYING;
    inputElement.style.display = 'block'; // Show the input box
    inputElement.value = '';
    inputElement.focus(); // Focus input for immediate typing
    startRound(); // Begin the first round

    // Play BGM, handling potential autoplay policies
    const bgm = assets.sounds.get('bgm');
    if (bgm) {
        bgm.currentTime = 0; // Start BGM from the beginning
        bgm.play().catch(e => console.log("BGM autoplay prevented:", e));
    }
}

function startRound() {
    if (currentCelebrities.length === 0) {
        // If all celebrities have been guessed, reshuffle and continue
        currentCelebrities = [...gameData.celebrities];
        shuffleArray(currentCelebrities);
    }
    currentCelebrity = currentCelebrities.pop(); // Get the next celebrity from the shuffled list
    currentCelebrityImage = assets.images.get(currentCelebrity.image) || null; // Load the corresponding image

    timeRemaining = gameData.gameSettings.roundTimeSeconds * 1000; // Reset timer for the new round
    message = null; // Clear any previous message
    inputElement.value = ''; // Clear the input field
    inputElement.focus(); // Re-focus the input field
}

function checkGuess() {
    if (!currentCelebrity || !inputElement) return;

    const guess = inputElement.value.trim().toLowerCase();
    const correctName = currentCelebrity.name.toLowerCase();

    if (guess === correctName) {
        score += gameData.gameSettings.scorePerCorrect;
        message = 'Correct!';
        messageColor = gameData.gameSettings.messageCorrectColor;
        assets.sounds.get('correct')?.play();
        messageTimer = gameData.gameSettings.messageDisplayDuration;
        setTimeout(startRound, messageTimer * 1000); // Start next round after message display
    } else {
        lives--;
        message = 'Wrong!';
        messageColor = gameData.gameSettings.messageWrongColor;
        assets.sounds.get('wrong')?.play();
        messageTimer = gameData.gameSettings.messageDisplayDuration;
        if (lives <= 0) {
            setTimeout(endGame, messageTimer * 1000); // Game over if no lives left
        } else {
            setTimeout(startRound, messageTimer * 1000); // Next round if lives remain
        }
    }
    inputElement.value = ''; // Clear input after guess, regardless of correctness
}

function endGame() {
    currentGameState = GameState.GAME_OVER;
    inputElement.style.display = 'none'; // Hide the input box
    // Pause and reset BGM
    const bgm = assets.sounds.get('bgm');
    if (bgm) {
        bgm.pause();
        bgm.currentTime = 0;
    }
}

// Utility function to shuffle an array (Fisher-Yates algorithm)
function shuffleArray<T>(array: T[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// 6. Event Handlers
function handleGlobalKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
        if (currentGameState === GameState.TITLE) {
            startGame();
        } else if (currentGameState === GameState.GAME_OVER) {
            startGame(); // Press Enter to restart from game over screen
        }
    }
}

function handleInputKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && currentGameState === GameState.PLAYING) {
        checkGuess();
    }
}

// 7. Update function (game logic per frame)
function update(deltaTime: number) {
    // Convert deltaTime from milliseconds to seconds for messageTimer and other time calculations
    const deltaTimeSeconds = deltaTime / 1000;

    if (currentGameState === GameState.PLAYING) {
        // Only update time and check for timeout if no message is currently displayed.
        // This prevents the time-out logic (lives deduction, message setting) from firing
        // multiple times during the short period when a message is already being displayed
        // due to a guess (correct/wrong) or a previous time-out event.
        if (messageTimer <= 0) {
            timeRemaining -= deltaTime; // Subtract actual time passed
            if (timeRemaining <= 0) {
                timeRemaining = 0; // Ensure timer doesn't go negative for display purposes
                lives--;
                message = "Time's Up!";
                messageColor = gameData.gameSettings.messageTimeUpColor;
                assets.sounds.get('timeout')?.play();
                messageTimer = gameData.gameSettings.messageDisplayDuration; // This timer will now prevent further updates for a bit
                inputElement.value = ''; // Clear input on timeout

                if (lives <= 0) {
                    setTimeout(endGame, messageTimer * 1000); // Game over
                } else {
                    setTimeout(startRound, messageTimer * 1000); // Next round
                }
            }
        }
    }

    // Update message display timer
    if (messageTimer > 0) {
        messageTimer -= deltaTimeSeconds;
        if (messageTimer <= 0) {
            message = null; // Clear message when timer runs out
        }
    }
}

// 8. Render game elements
// This is the original render function provided by the user, now integrated into the game lifecycle
function render() {
    if (!ctx || !gameData) return; // Ensure context and gameData are available

    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the entire canvas
    ctx.fillStyle = gameData.gameSettings.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height); // Draw background

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
            const y = (canvas.height / 2) - displayHeight / 2 - 50; // Position above center of canvas

            // Draw image, scaling it to the specified display dimensions
            ctx.drawImage(currentCelebrityImage, x, y, displayWidth, displayHeight);
        }

        // Draw timer
        ctx.font = gameData.gameSettings.fontSizeUI + ' ' + gameData.gameSettings.fontFamily;
        // Ensure time remaining is not negative before displaying
        ctx.fillText(`Time: ${Math.max(0, Math.ceil(timeRemaining / 1000))}`, canvas.width / 2, 50);

        // Draw lives
        ctx.fillText(`Lives: ${lives}`, canvas.width - 100, 50);

        // Draw score
        ctx.fillText(`Score: ${score}`, 100, 50);

        // Draw message (Correct/Wrong/Time's Up)
        if (message) {
            ctx.fillStyle = messageColor;
            ctx.font = gameData.gameSettings.fontSizeMessage + ' ' + gameData.gameSettings.fontFamily;
            // Position message above the input box area (input box is positioned outside canvas)
            const inputBoxTopY = canvas.height - gameData.gameSettings.inputBoxBottomMargin - gameData.gameSettings.inputBoxHeight;
            const messageY = inputBoxTopY - 20; // 20px margin above the virtual input box position
            ctx.fillText(message, canvas.width / 2, messageY);
        }
    } else if (currentGameState === GameState.GAME_OVER) {
        ctx.font = gameData.gameSettings.fontSizeTitle + ' ' + gameData.gameSettings.fontFamily;
        ctx.fillText(gameData.gameSettings.gameOverScreenText, canvas.width / 2, canvas.height / 2 - 50);
        ctx.font = gameData.gameSettings.fontSizeUI + ' ' + gameData.gameSettings.fontFamily;
        ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2 + 10);
        ctx.fillText("Press Enter to Restart", canvas.width / 2, canvas.height / 2 + 70);
    }
}


// 9. Main Game Loop
function gameLoop(currentTime: number) {
    // Calculate delta time in milliseconds
    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;

    update(deltaTime);
    render();

    requestAnimationFrame(gameLoop); // Request the next frame
}

// 10. Initial Load (fetch data.json)
window.onload = async () => {
    try {
        const response = await fetch('data.json');
        gameData = await response.json();

        // Load assets (images and sounds)
        await loadAssets();

        // Initialize game elements and state after data and assets are fully loaded
        initGame();
        // Recalculate input box position if window resized or initially loaded without correct dimensions
        window.addEventListener('resize', positionInputBox);
        positionInputBox(); // Initial positioning after canvas setup

    } catch (error) {
        console.error('Failed to load game data or assets:', error);
        // Display an error message to the user if the game cannot load
        if (ctx && canvas) {
            ctx.fillStyle = 'red';
            ctx.font = '30px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Error loading game. Check console for details.', canvas.width / 2, canvas.height / 2);
        }
    }
};