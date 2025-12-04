let sceneHistory: string[] = [];
let hoveredBackButton: boolean = false;

// Back button properties
const BACK_BUTTON_X = 70;
const BACK_BUTTON_Y = 60;
const BACK_BUTTON_WIDTH = 120;
const BACK_BUTTON_HEIGHT = 40;
const BACK_BUTTON_LABEL = "뒤로가기";

// ... (rest of existing game.ts code)

async function init() {
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error("Canvas element not found!");
        return;
    }
    ctx = canvas.getContext('2d')!;

    renderLoadingScreen();

    try {
        const response = await fetch('data.json');
        gameData = await response.json() as GameData;

        canvas.width = gameData.gameSettings.canvasWidth;
        canvas.height = gameData.gameSettings.canvasHeight;

        await loadAssets(gameData);
        currentGameState = GameState.TITLE;
    } catch (error) {
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
            // Initialize scene history when starting presentation from title
            if (gameData.scenes.length > 0) {
                sceneHistory = [gameData.scenes[0].id];
                currentSceneIndex = 0; // Ensure we start at the first scene
            }
            resetSceneState();
        } else if (currentGameState === GameState.PRESENTATION) {
            handlePresentationClick();
        }
    });

    requestAnimationFrame(gameLoop);
}

// ... (rest of existing game.ts code)

function handlePresentationClick() {
    const currentScene = gameData.scenes[currentSceneIndex];

    // Handle Back Button Click
    if (hoveredBackButton && sceneHistory.length > 1) {
        playSFX("click_sfx");
        sceneHistory.pop(); // Remove the current scene from history
        const previousSceneId = sceneHistory[sceneHistory.length - 1];
        const previousScene = gameData.scenes.find(s => s.id === previousSceneId);
        if (previousScene) {
            currentSceneIndex = gameData.scenes.indexOf(previousScene);
            resetSceneState(); // Reset text display for the previous scene
            return; // Back button handled, stop further processing
        }
    }

    if (currentScene.choices && hoveredButton) {
        playSFX("click_sfx");
        const targetScene = gameData.scenes.find(s => s.id === hoveredButton!.target_scene_id);
        if (targetScene) {
            // Push new scene to history BEFORE changing currentSceneIndex, if it's a new scene
            if (sceneHistory[sceneHistory.length - 1] !== targetScene.id) {
                sceneHistory.push(targetScene.id);
            }
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
        } else {
            if (currentScene.next_scene) {
                playSFX("click_sfx");
                const nextSceneId = currentScene.next_scene;
                const nextScene = gameData.scenes.find(s => s.id === nextSceneId);
                if (nextScene) {
                    // Push new scene to history BEFORE changing currentSceneIndex, if it's a new scene
                    if (sceneHistory[sceneHistory.length - 1] !== nextScene.id) {
                        sceneHistory.push(nextScene.id);
                    }
                    currentSceneIndex = gameData.scenes.indexOf(nextScene);
                    resetSceneState();
                } else {
                    console.error(`Next scene with ID ${nextSceneId} not found.`);
                    currentGameState = GameState.ENDING;
                    sceneHistory = []; // Clear history upon ending
                }
            } else {
                currentGameState = GameState.ENDING;
                playSFX("click_sfx");
                sceneHistory = []; // Clear history upon ending
            }
        }
    }
}

// ... (rest of existing game.ts code)

function updatePresentation(deltaTime: number) {
    const currentScene = gameData.scenes[currentSceneIndex];
    const settings = gameData.gameSettings;

    const textSpeed = settings.textSpeedMs / 1000;

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
    hoveredBackButton = false; // Reset back button hover state

    if (currentScene.choices) {
        for (const choice of currentScene.choices) {
            if (mouseX >= choice.x && mouseX <= choice.x + choice.width &&
                mouseY >= choice.y && mouseY <= choice.y + choice.height) {
                hoveredButton = choice;
                break;
            }
        }
    }

    // Check for back button hover (only if there's history to go back to)
    if (sceneHistory.length > 1) {
        if (mouseX >= BACK_BUTTON_X && mouseX <= BACK_BUTTON_X + BACK_BUTTON_WIDTH &&
            mouseY >= BACK_BUTTON_Y && mouseY <= BACK_BUTTON_Y + BACK_BUTTON_HEIGHT) {
            hoveredBackButton = true;
        }
    }
}

// ... (rest of existing game.ts code)

function renderPresentationScene() {
    const currentScene = gameData.scenes[currentSceneIndex];
    const settings = gameData.gameSettings;

    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(50, 50, canvas.width - 100, canvas.height - 100);

    // Render back button if there's a previous scene in history
    if (sceneHistory.length > 1) {
        renderButton(BACK_BUTTON_LABEL, BACK_BUTTON_X, BACK_BUTTON_Y, BACK_BUTTON_WIDTH, BACK_BUTTON_HEIGHT, hoveredBackButton);
    }

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

    const renderTextContent = (textLines: string[], startX: number, startY: number) => {
        let currentTextY = startY;
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        for (let i = 0; i < textLines.length; i++) {
            if (i < displayedTextIndex) {
                ctx.fillText(textLines[i], startX, currentTextY);
            } else if (i === displayedTextIndex) {
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

    const renderContentImage = (imageName: string, x: number, y: number, width: number, height: number) => {
        const img = loadedImages.get(imageName);
        if (img) {
            ctx.drawImage(img, x, y, width, height);
        } else {
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
                if(img) {
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
                    renderContentImage(currentScene.image_asset,
                                       contentBoxX + (contentBoxWidth - displayWidth) / 2,
                                       contentBoxY + (contentBoxHeight - displayHeight) / 2,
                                       displayWidth, displayHeight);
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
}