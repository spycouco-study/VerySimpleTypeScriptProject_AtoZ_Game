"use strict";
var GameState;
(function (GameState) {
    GameState[GameState["LOADING"] = 0] = "LOADING";
    GameState[GameState["TITLE"] = 1] = "TITLE";
    GameState[GameState["PRESENTATION"] = 2] = "PRESENTATION";
    GameState[GameState["ENDING"] = 3] = "ENDING";
})(GameState || (GameState = {}));
let canvas;
let ctx;
let gameData;
let currentGameState = GameState.LOADING;
let loadedImages = new Map();
let loadedSounds = new Map();
let bgm = null;
let currentSceneIndex = 0;
let sceneHistory = []; // Stores indices of previous scenes for back navigation
let displayedTextIndex = 0;
let currentLineCharIndex = 0;
let typingTimer = 0;
let lastTimestamp = 0;
let mouseX = 0;
let mouseY = 0;
let mouseClicked = false;
let hoveredButton = null;
let backButtonHovered = false; // To track hover state for the back button
let lastTypeSoundTime = 0;
const TYPE_SOUND_INTERVAL = 0.05;
const BACK_BUTTON_X = 70; // X-coordinate for the back button
const BACK_BUTTON_Y = 70; // Y-coordinate for the back button
const BACK_BUTTON_WIDTH = 120;
const BACK_BUTTON_HEIGHT = 40;
function loadImage(asset) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = asset.path;
        img.onload = () => {
            loadedImages.set(asset.name, img);
            asset.img = img;
            resolve();
        };
        img.onerror = () => reject(`Failed to load image: ${asset.path}`);
    });
}
function loadSound(asset) {
    return new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.src = asset.path;
        audio.preload = "auto";
        audio.oncanplaythrough = () => {
            loadedSounds.set(asset.name, audio);
            asset.audio = audio;
            resolve();
        };
        audio.onerror = () => reject(`Failed to load sound: ${asset.path}`);
        audio.load();
    });
}
async function loadAssets(data) {
    const imagePromises = data.assets.images.map(loadImage);
    const soundPromises = data.assets.sounds.map(loadSound);
    await Promise.all([...imagePromises, ...soundPromises]);
    bgm = loadedSounds.get("bgm_loop") || null;
    if (bgm) {
        bgm.loop = true;
        bgm.volume = data.assets.sounds.find(s => s.name === "bgm_loop")?.volume || 0.3;
        bgm.play().catch(e => console.warn("BGM autoplay blocked:", e));
    }
}
async function init() {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error("Canvas element not found!");
        return;
    }
    ctx = canvas.getContext('2d');
    renderLoadingScreen();
    try {
        const response = await fetch('data.json');
        gameData = await response.json();
        canvas.width = gameData.gameSettings.canvasWidth;
        canvas.height = gameData.gameSettings.canvasHeight;
        await loadAssets(gameData);
        currentGameState = GameState.TITLE;
    }
    catch (error) {
        console.error("Failed to load game data or assets:", error);
        currentGameState = GameState.LOADING;
        return;
    }
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
    });
    canvas.addEventListener('click', () => {
        mouseClicked = true;
        if (bgm && bgm.paused) {
            bgm.play().catch(e => console.warn("BGM playback blocked on click:", e));
        }
        if (currentGameState === GameState.TITLE) {
            currentGameState = GameState.PRESENTATION;
            playSFX("click_sfx");
            resetSceneState();
            // No history to push here, as it's the very first scene.
        }
        else if (currentGameState === GameState.PRESENTATION) {
            // Check for back button click first
            if (sceneHistory.length > 0 && mouseX >= BACK_BUTTON_X && mouseX <= BACK_BUTTON_X + BACK_BUTTON_WIDTH &&
                mouseY >= BACK_BUTTON_Y && mouseY <= BACK_BUTTON_Y + BACK_BUTTON_HEIGHT) {
                handleBackButton();
            }
            else {
                handlePresentationClick();
            }
        }
    });
    requestAnimationFrame(gameLoop);
}
function playSFX(name, forcePlay = false) {
    const sfx = loadedSounds.get(name);
    if (sfx) {
        if (name === "type_sfx" && !forcePlay && (performance.now() - lastTypeSoundTime) / 1000 < TYPE_SOUND_INTERVAL) {
            return;
        }
        const clone = sfx.cloneNode(true);
        clone.volume = sfx.volume;
        clone.play().catch(e => console.warn(`SFX ${name} playback blocked:`, e));
        if (name === "type_sfx") {
            lastTypeSoundTime = performance.now();
        }
    }
}
function handleBackButton() {
    if (sceneHistory.length > 0) {
        playSFX("click_sfx");
        const previousSceneIndex = sceneHistory.pop();
        if (previousSceneIndex !== undefined) {
            currentSceneIndex = previousSceneIndex;
            resetSceneState();
        }
    }
}
function handlePresentationClick() {
    const currentScene = gameData.scenes[currentSceneIndex];
    if (currentScene.choices && hoveredButton) {
        playSFX("click_sfx");
        const targetScene = gameData.scenes.find(s => s.id === hoveredButton.target_scene_id);
        if (targetScene) {
            sceneHistory.push(currentSceneIndex); // Push current scene BEFORE navigating
            currentSceneIndex = gameData.scenes.indexOf(targetScene);
            resetSceneState();
            return;
        }
    }
    const totalLines = currentScene.text_content.length;
    if (displayedTextIndex < totalLines) {
        const currentLine = currentScene.text_content[displayedTextIndex];
        if (currentLineCharIndex < currentLine.length) {
            currentLineCharIndex = currentLine.length;
            playSFX("click_sfx");
            return;
        }
    }
    if (!currentScene.choices || currentScene.choices.length === 0) {
        if (displayedTextIndex < totalLines - 1) {
            displayedTextIndex++;
            currentLineCharIndex = 0;
            typingTimer = 0;
            playSFX("click_sfx");
        }
        else {
            if (currentScene.next_scene) {
                playSFX("click_sfx");
                const nextSceneId = currentScene.next_scene;
                const nextScene = gameData.scenes.find(s => s.id === nextSceneId);
                if (nextScene) {
                    sceneHistory.push(currentSceneIndex); // Push current scene BEFORE navigating
                    currentSceneIndex = gameData.scenes.indexOf(nextScene);
                    resetSceneState();
                }
                else {
                    console.error(`Next scene with ID ${nextSceneId} not found.`);
                    currentGameState = GameState.ENDING;
                }
            }
            else {
                currentGameState = GameState.ENDING;
                playSFX("click_sfx");
            }
        }
    }
}
function resetSceneState() {
    displayedTextIndex = 0;
    currentLineCharIndex = 0;
    typingTimer = 0;
    hoveredButton = null;
    backButtonHovered = false; // Reset back button hover state
    lastTypeSoundTime = 0;
}
function gameLoop(timestamp) {
    const deltaTime = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;
    update(deltaTime);
    render();
    mouseClicked = false;
    requestAnimationFrame(gameLoop);
}
function update(deltaTime) {
    switch (currentGameState) {
        case GameState.LOADING:
            break;
        case GameState.TITLE:
            break;
        case GameState.PRESENTATION:
            updatePresentation(deltaTime);
            break;
        case GameState.ENDING:
            break;
    }
}
function updatePresentation(deltaTime) {
    const currentScene = gameData.scenes[currentSceneIndex];
    const textSpeed = gameData.gameSettings.textSpeedMs / 1000;
    if (displayedTextIndex < currentScene.text_content.length) {
        const currentLine = currentScene.text_content[displayedTextIndex];
        if (currentLineCharIndex < currentLine.length) {
            typingTimer += deltaTime;
            const charsToDisplay = Math.floor(typingTimer / textSpeed);
            if (charsToDisplay > currentLineCharIndex) {
                currentLineCharIndex = Math.min(charsToDisplay, currentLine.length);
                playSFX("type_sfx");
            }
        }
    }
    hoveredButton = null;
    if (currentScene.choices) {
        for (const choice of currentScene.choices) {
            if (mouseX >= choice.x && mouseX <= choice.x + choice.width &&
                mouseY >= choice.y && mouseY <= choice.y + choice.height) {
                hoveredButton = choice;
                break;
            }
        }
    }
    // Back button hover logic
    backButtonHovered = false;
    if (sceneHistory.length > 0) { // Only enable hover if history exists
        if (mouseX >= BACK_BUTTON_X && mouseX <= BACK_BUTTON_X + BACK_BUTTON_WIDTH &&
            mouseY >= BACK_BUTTON_Y && mouseY <= BACK_BUTTON_Y + BACK_BUTTON_HEIGHT) {
            backButtonHovered = true;
        }
    }
}
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bgImage = loadedImages.get("background_main");
    if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    }
    else {
        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    switch (currentGameState) {
        case GameState.LOADING:
            renderLoadingScreen();
            break;
        case GameState.TITLE:
            renderTitleScreen();
            break;
        case GameState.PRESENTATION:
            renderPresentationScene();
            break;
        case GameState.ENDING:
            renderEndingScreen();
            break;
    }
}
function renderLoadingScreen() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.font = `48px ${gameData?.gameSettings?.fontFamily || 'Arial'}`;
    ctx.fillText("Loading...", canvas.width / 2, canvas.height / 2);
}
function renderTitleScreen() {
    const settings = gameData.gameSettings;
    ctx.fillStyle = settings.textColor;
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    ctx.font = `bold 60px ${settings.fontFamily}`;
    const titleParts = settings.titleScreenText.split(' ');
    if (titleParts.length > 1) {
        ctx.fillText(titleParts[0], canvas.width / 2, canvas.height / 2 - 80);
        ctx.fillText(titleParts.slice(1).join(' '), canvas.width / 2, canvas.height / 2 - 20);
    }
    else {
        ctx.fillText(settings.titleScreenText, canvas.width / 2, canvas.height / 2 - 50);
    }
    ctx.font = `30px ${settings.fontFamily}`;
    ctx.fillText(settings.startPromptText, canvas.width / 2, canvas.height / 2 + 100);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}
function renderPresentationScene() {
    const currentScene = gameData.scenes[currentSceneIndex];
    const settings = gameData.gameSettings;
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(50, 50, canvas.width - 100, canvas.height - 100);
    ctx.fillStyle = settings.primaryColor;
    ctx.textAlign = "left";
    ctx.font = `bold 40px ${settings.fontFamily}`;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText(currentScene.title, 80, 100);
    if (currentScene.subtitle) {
        ctx.font = `bold 30px ${settings.fontFamily}`;
        ctx.fillText(currentScene.subtitle, 80, 140);
    }
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = settings.textColor;
    ctx.font = `24px ${settings.fontFamily}`;
    const contentBoxX = 80;
    const contentBoxY = 180;
    const contentBoxWidth = canvas.width - 160;
    const contentBoxHeight = canvas.height - 180 - 80;
    const lineHeight = 30;
    const renderTextContent = (textLines, startX, startY) => {
        let currentTextY = startY;
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        for (let i = 0; i < textLines.length; i++) {
            if (i < displayedTextIndex) {
                ctx.fillText(textLines[i], startX, currentTextY);
            }
            else if (i === displayedTextIndex) {
                ctx.fillText(textLines[i].substring(0, currentLineCharIndex), startX, currentTextY);
                break;
            }
            currentTextY += lineHeight;
        }
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        return currentTextY;
    };
    const renderContentImage = (imageName, x, y, width, height) => {
        const img = loadedImages.get(imageName);
        if (img) {
            ctx.drawImage(img, x, y, width, height);
        }
        else {
            ctx.fillStyle = "#9CA3AF";
            ctx.fillRect(x, y, width, height);
            ctx.fillStyle = "#FFFFFF";
            ctx.textAlign = "center";
            ctx.font = `20px ${settings.fontFamily}`;
            ctx.fillText("No Image", x + width / 2, y + height / 2);
            ctx.textAlign = "left";
        }
    };
    switch (currentScene.layout_type) {
        case "title":
            renderTextContent(currentScene.text_content, contentBoxX, contentBoxY + contentBoxHeight / 4);
            if (currentScene.image_asset) {
                const img = loadedImages.get(currentScene.image_asset);
                if (img) {
                    const imgW = Math.min(img.width, contentBoxWidth * 0.5);
                    const imgH = (img.height / img.width) * imgW;
                    renderContentImage(currentScene.image_asset, contentBoxX + (contentBoxWidth - imgW) / 2, contentBoxY + contentBoxHeight / 2, imgW, imgH);
                }
            }
            break;
        case "full_text":
            renderTextContent(currentScene.text_content, contentBoxX, contentBoxY);
            break;
        case "text_image_left":
            renderTextContent(currentScene.text_content, contentBoxX, contentBoxY);
            if (currentScene.image_asset) {
                renderContentImage(currentScene.image_asset, contentBoxX + contentBoxWidth / 2 + 20, contentBoxY, contentBoxWidth / 2 - 40, contentBoxHeight);
            }
            break;
        case "text_image_right":
            if (currentScene.image_asset) {
                renderContentImage(currentScene.image_asset, contentBoxX, contentBoxY, contentBoxWidth / 2 - 20, contentBoxHeight);
            }
            renderTextContent(currentScene.text_content, contentBoxX + contentBoxWidth / 2 + 20, contentBoxY);
            break;
        case "image_only":
            renderTextContent(currentScene.text_content, contentBoxX, contentBoxY);
            if (currentScene.image_asset) {
                const img = loadedImages.get(currentScene.image_asset);
                if (img) {
                    const maxImgWidth = contentBoxWidth * 0.9;
                    const maxImgHeight = contentBoxHeight * 0.8;
                    let displayWidth = img.width;
                    let displayHeight = img.height;
                    if (displayWidth > maxImgWidth) {
                        displayHeight = (maxImgWidth / displayWidth) * displayHeight;
                        displayWidth = maxImgWidth;
                    }
                    if (displayHeight > maxImgHeight) {
                        displayWidth = (maxImgHeight / displayHeight) * displayWidth;
                        displayHeight = maxImgHeight;
                    }
                    renderContentImage(currentScene.image_asset, contentBoxX + (contentBoxWidth - displayWidth) / 2, contentBoxY + (contentBoxHeight - displayHeight) / 2, displayWidth, displayHeight);
                }
            }
            break;
        case "text_choices":
            renderTextContent(currentScene.text_content, contentBoxX, contentBoxY);
            if (currentScene.choices) {
                for (const choice of currentScene.choices) {
                    renderButton(choice.label, choice.x, choice.y, choice.width, choice.height, choice === hoveredButton);
                }
            }
            break;
    }
    const totalLines = currentScene.text_content.length;
    const lastLine = currentScene.text_content[totalLines - 1] || "";
    const allTextDisplayed = (displayedTextIndex >= totalLines - 1 && currentLineCharIndex >= lastLine.length) || totalLines === 0;
    if (allTextDisplayed && (!currentScene.choices || currentScene.choices.length === 0)) {
        ctx.fillStyle = settings.secondaryColor;
        ctx.textAlign = "right";
        ctx.font = `20px ${settings.fontFamily}`;
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillText(currentScene.next_scene ? "클릭하여 다음으로 이동 >>" : "클릭하여 종료 >>", canvas.width - 80, canvas.height - 80);
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }
    // Render back button if history exists
    if (sceneHistory.length > 0) {
        renderButton("뒤로가기", BACK_BUTTON_X, BACK_BUTTON_Y, BACK_BUTTON_WIDTH, BACK_BUTTON_HEIGHT, backButtonHovered);
    }
}
function renderButton(text, x, y, width, height, isHovered) {
    const settings = gameData.gameSettings;
    ctx.fillStyle = isHovered ? settings.buttonHoverColor : settings.primaryColor;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = settings.textColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = settings.textColor;
    ctx.textAlign = "center";
    ctx.font = `24px ${settings.fontFamily}`;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillText(text, x + width / 2, y + height / 2 + 8);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}
function renderEndingScreen() {
    const settings = gameData.gameSettings;
    ctx.fillStyle = settings.textColor;
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    const endingScene = gameData.scenes.find(s => s.id === "ending");
    ctx.font = `bold 60px ${settings.fontFamily}`;
    ctx.fillText(endingScene?.title || "프레젠테이션 종료", canvas.width / 2, canvas.height / 2 - 80);
    ctx.font = `30px ${settings.fontFamily}`;
    ctx.fillText(endingScene?.subtitle || "시청해주셔서 감사합니다!", canvas.width / 2, canvas.height / 2 - 20);
    ctx.font = `24px ${settings.fontFamily}`;
    ctx.fillText(endingScene?.text_content[0] || "", canvas.width / 2, canvas.height / 2 + 50);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    const alparkaLogo = loadedImages.get("alparka_logo");
    if (alparkaLogo) {
        ctx.drawImage(alparkaLogo, canvas.width / 2 - alparkaLogo.width / 2, canvas.height / 2 + 100, alparkaLogo.width, alparkaLogo.height);
    }
}
document.addEventListener('DOMContentLoaded', init);
