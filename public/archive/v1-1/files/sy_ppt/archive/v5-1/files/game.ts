// Global declarations
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let gameSettings: any;
let loadedAssets: { images: Map<string, HTMLImageElement>; sounds: Map<string, HTMLAudioElement> } = {
  images: new Map(),
  sounds: new Map(),
};

// Game state variables
let mouseX: number = 0;
let mouseY: number = 0;
let mouseClicked: boolean = false;

enum GameState {
  TITLE,
  PRESENTATION,
}
let currentGameState: GameState = GameState.TITLE;

let bgm: HTMLAudioElement | null = null;

// Scene management
interface Scene {
  id: string;
  title: string;
  subtitle?: string;
  background_image: string;
  text_content: string[];
  image_asset: string | null;
  layout_type: 'title' | 'text_image_left' | 'text_image_right' | 'full_text' | 'text_choices' | 'image_only';
  choices?: { label: string; target_scene_id: string; x: number; y: number; width: number; height: number }[];
  next_scene: string | null;
}

let scenes: Scene[] = [];
let currentSceneIndex: number = -1; // -1 indicates no scene loaded yet
let currentScene: Scene | null = null;
let showBackButton: boolean = false; // To manage back button visibility for UI_VIEW scenes

// Text typing animation state
let textTypingState: {
  currentText: string;
  targetTextArray: string[]; // For multi-line text_content
  lineIndex: number;
  charIndex: number;
  timer: number;
  finished: boolean;
  textSpeed: number; // From gameSettings
} = {
  currentText: '',
  targetTextArray: [],
  lineIndex: 0,
  charIndex: 0,
  timer: 0,
  finished: true,
  textSpeed: 30, // Default, will be updated from settings
};


// Helper functions
async function loadAssets(assetsData: any): Promise<void> {
  const imagePromises = assetsData.images.map((img: any) => {
    return new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.src = img.path;
      image.onload = () => {
        loadedAssets.images.set(img.name, image);
        resolve();
      };
      image.onerror = () => {
        console.error(`Failed to load image: ${img.path}`);
        reject();
      };
    });
  });

  const soundPromises = assetsData.sounds.map((snd: any) => {
    const audio = new Audio(snd.path);
    audio.volume = snd.volume;
    loadedAssets.sounds.set(snd.name, audio);
    
    if (snd.name === 'bgm_loop') {
      bgm = audio;
      bgm.loop = true;
    }
    return Promise.resolve(); 
  });

  await Promise.all([...imagePromises, ...soundPromises]);
  console.log("All assets loaded.");
}

function playSFX(name: string, loop: boolean = false): void {
  const sfx = loadedAssets.sounds.get(name);
  if (sfx) {
    const sfxClone = sfx.cloneNode(true) as HTMLAudioElement;
    sfxClone.volume = sfx.volume; 
    sfxClone.loop = loop;
    sfxClone.play().catch(e => console.warn(`SFX playback blocked for ${name}:`, e));
  } else {
    console.warn(`SFX "${name}" not found.`);
  }
}

function resetTextTypingState(textLines: string[] = []): void {
    textTypingState.targetTextArray = textLines;
    textTypingState.lineIndex = 0;
    textTypingState.charIndex = 0;
    textTypingState.currentText = '';
    textTypingState.timer = 0;
    textTypingState.finished = false;
    textTypingState.textSpeed = gameSettings?.textSpeedMs || 30;
}

function updateTextTyping(deltaTime: number): void {
  if (textTypingState.finished || textTypingState.lineIndex >= textTypingState.targetTextArray.length) {
    return;
  }

  textTypingState.timer += deltaTime;
  const targetLine = textTypingState.targetTextArray[textTypingState.lineIndex];

  while (textTypingState.timer >= textTypingState.textSpeed) {
    if (textTypingState.charIndex < targetLine.length) {
      textTypingState.currentText += targetLine[textTypingState.charIndex];
      textTypingState.charIndex++;
      playSFX('type_sfx'); // Play typing sound for each character
    } else {
      // Current line finished, move to next if available
      textTypingState.lineIndex++;
      textTypingState.charIndex = 0;
      if (textTypingState.lineIndex < textTypingState.targetTextArray.length) {
        textTypingState.currentText += '\n'; // Add newline for next line if there's more text
      } else {
        textTypingState.finished = true;
      }
    }
    textTypingState.timer -= textTypingState.textSpeed;
  }
}

function loadScene(sceneId: string) {
    const nextScene = scenes.find(s => s.id === sceneId);
    if (nextScene) {
        currentScene = nextScene;
        currentSceneIndex = scenes.indexOf(nextScene);
        resetTextTypingState(currentScene.text_content);

        // Determine if back button should be shown
        showBackButton = ['ui_studio', 'ui_arcade', 'ui_player'].includes(currentScene.id);

        console.log(`Loading scene: ${currentScene.id}`);
    } else {
        console.error(`Scene with id "${sceneId}" not found.`);
    }
}

function goToNextScene() {
    if (!currentScene) return;

    if (currentScene.next_scene) {
        loadScene(currentScene.next_scene);
    } else {
        // If no next_scene, it might be the end or a choice-driven scene.
        if (showBackButton) {
            loadScene('detailed_ui_ux'); // Hardcoding return to 'detailed_ui_ux' scene
        } else if (currentScene.id === 'ending') {
            currentGameState = GameState.TITLE; // Go back to title after ending
            currentSceneIndex = -1; // Reset scene
            currentScene = null;
        }
    }
}

function handlePresentationClick() {
    if (!currentScene) return;

    // If text typing is not finished, finish it immediately
    if (!textTypingState.finished) {
        textTypingState.currentText = textTypingState.targetTextArray.join('\n');
        textTypingState.finished = true;
        textTypingState.lineIndex = textTypingState.targetTextArray.length;
        textTypingState.charIndex = 0;
        return; // Don't advance scene yet, just finish typing
    }

    // Handle choices if available. If a scene has choices, general click should only advance text, not scene.
    // Scene advance via choices is handled by clicking the choice button itself.
    if (currentScene.layout_type === 'text_choices' && currentScene.choices) {
        return; // Clicks without specific button interaction do nothing for scene advance.
    }

    // Otherwise, go to the next scene
    goToNextScene();
}


// Drawing functions
function clearCanvas(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawRect(x: number, y: number, width: number, height: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

function drawText(
  text: string,
  x: number,
  y: number,
  color: string,
  font: string,
  align: CanvasTextAlign = 'left',
  maxWidth?: number
): void {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  if (maxWidth) {
    ctx.fillText(text, x, y, maxWidth);
  } else {
    ctx.fillText(text, x, y);
  }
}

function drawImage(imageName: string, x: number, y: number, width: number, height: number): void {
  const img = loadedAssets.images.get(imageName);
  if (img) {
    ctx.drawImage(img, x, y, width, height);
  } else {
    console.warn(`Image "${imageName}" not found. Drawing placeholder.`);
    ctx.fillStyle = 'gray';
    ctx.fillRect(x, y, width, height);
  }
}

// Layout specific drawing
function drawTitleScreen(): void {
    if (!gameSettings) return;

    // Background image
    drawImage("background_main", 0, 0, canvas.width, canvas.height); 

    // Title
    ctx.textAlign = 'center';
    ctx.fillStyle = gameSettings.textColor;
    ctx.font = `bold 60px ${gameSettings.fontFamily}`;
    ctx.fillText(gameSettings.titleScreenText, canvas.width / 2, canvas.height / 2 - 50);

    // Start prompt
    ctx.font = `30px ${gameSettings.fontFamily}`;
    ctx.fillText(gameSettings.startPromptText, canvas.width / 2, canvas.height / 2 + 50);
}

function drawSceneContent(scene: Scene): void {
    if (!gameSettings) return;

    // Background
    drawImage(scene.background_image, 0, 0, canvas.width, canvas.height);

    // Common text styles
    ctx.fillStyle = gameSettings.textColor;
    ctx.font = `24px ${gameSettings.fontFamily}`;
    ctx.textAlign = 'left';
    const textStartX = 100;
    let textY = 100;
    const lineHeight = 35; // Adjust as needed

    // Scene title
    ctx.font = `bold 40px ${gameSettings.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(scene.title, canvas.width / 2, 60);
    ctx.textAlign = 'left'; // Reset

    // Scene subtitle if exists
    if (scene.subtitle) {
        ctx.font = `italic 30px ${gameSettings.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.fillText(scene.subtitle, canvas.width / 2, 110);
        ctx.textAlign = 'left';
        textY = 150; // Adjust start Y for text_content
    } else {
        textY = 100; // Adjust start Y if no subtitle
    }

    // Content based on layout type
    if (scene.layout_type === 'title') {
        ctx.font = `30px ${gameSettings.fontFamily}`;
        ctx.textAlign = 'center';
        textTypingState.currentText.split('\n').forEach((line, index) => {
            ctx.fillText(line, canvas.width / 2, canvas.height / 2 + index * lineHeight + 50);
        });
        ctx.textAlign = 'left';
    } else if (scene.layout_type === 'full_text') {
        ctx.font = `24px ${gameSettings.fontFamily}`;
        textTypingState.currentText.split('\n').forEach((line, index) => {
            ctx.fillText(line, textStartX, textY + index * lineHeight);
        });
    } else if (scene.layout_type === 'text_image_left' || scene.layout_type === 'text_image_right') {
        const imageWidth = 400; // Fixed width for image in these layouts
        const imageHeight = 300; // Fixed height for image
        const textAreaWidth = canvas.width - (imageWidth + 150); // 100px padding + 50px gap
        const textX = scene.layout_type === 'text_image_left' ? textStartX + imageWidth + 50 : textStartX;
        const imageX = scene.layout_type === 'text_image_left' ? textStartX : canvas.width - textStartX - imageWidth;
        const imageY = canvas.height / 2 - imageHeight / 2;

        if (scene.image_asset) {
            drawImage(scene.image_asset, imageX, imageY, imageWidth, imageHeight);
        }
        
        ctx.font = `24px ${gameSettings.fontFamily}`;
        const lines = textTypingState.currentText.split('\n');
        
        // Special rendering for markdown table in 'ai_data' scene
        if (scene.id === 'ai_data') {
            const tableLines = lines.filter(l => l.startsWith('|'));
            const normalTextLines = lines.filter(l => !l.startsWith('|'));
            let currentTextY = textY;

            // Draw normal text first
            normalTextLines.forEach((line, index) => {
                ctx.fillText(line, textX, currentTextY + index * lineHeight);
            });
            currentTextY += normalTextLines.length * lineHeight;

            // Draw table
            if (tableLines.length > 0) {
                const cellPadding = 15;
                const cellHeight = lineHeight + 10;
                const colWidths = [100, 300, 150, 200]; // Pre-defined widths for the table columns

                tableLines.forEach((tableLine, tableRowIndex) => {
                    const cells = tableLine.split('|').map(cell => cell.trim()).filter(cell => cell !== '');
                    if (cells.length === 0) return;

                    let currentColumnX = textX;
                    
                    cells.forEach((cell, cellIndex) => {
                        const cellWidth = colWidths[cellIndex] || 100; 

                        // Draw background for header row
                        if (tableRowIndex === 0) {
                            ctx.fillStyle = gameSettings.primaryColor;
                            ctx.fillRect(currentColumnX, currentTextY, cellWidth, cellHeight);
                        } else if (tableRowIndex === 1) { // Separator row
                            ctx.strokeStyle = gameSettings.textColor;
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.moveTo(currentColumnX, currentTextY + cellHeight / 2);
                            ctx.lineTo(currentColumnX + cellWidth, currentTextY + cellHeight / 2);
                            ctx.stroke();
                        }

                        ctx.fillStyle = gameSettings.textColor;
                        ctx.textAlign = (tableRowIndex === 0 || tableRowIndex === 1) ? 'center' : 'left';
                        
                        if (tableRowIndex !== 1) { // Skip drawing text for the separator row
                            ctx.fillText(cell, currentColumnX + (tableRowIndex === 0 ? cellWidth / 2 : cellPadding), currentTextY + lineHeight);
                        }
                        
                        ctx.strokeStyle = gameSettings.textColor;
                        ctx.lineWidth = 1;
                        ctx.strokeRect(currentColumnX, currentTextY, cellWidth, cellHeight);

                        currentColumnX += cellWidth;
                    });
                    currentTextY += cellHeight;
                });
            }
        } else { // Normal text rendering for other scenes
            lines.forEach((line, index) => {
                ctx.fillText(line, textX, textY + index * lineHeight);
            });
        }
    } else if (scene.layout_type === 'image_only') {
        if (scene.image_asset) {
            drawImage(scene.image_asset, canvas.width / 2 - 450, canvas.height / 2 - 250, 900, 500); // UI images are 900x500
        }
        ctx.font = `24px ${gameSettings.fontFamily}`;
        ctx.textAlign = 'center';
        textTypingState.currentText.split('\n').forEach((line, index) => {
            ctx.fillText(line, canvas.width / 2, canvas.height - 80 + index * lineHeight);
        });
        ctx.textAlign = 'left';
    } else if (scene.layout_type === 'text_choices' && scene.choices) {
        ctx.font = `24px ${gameSettings.fontFamily}`;
        textTypingState.currentText.split('\n').forEach((line, index) => {
            ctx.fillText(line, textStartX, textY + index * lineHeight);
        });

        // Draw choice buttons
        scene.choices.forEach(choice => {
            let buttonColor = gameSettings.primaryColor;
            if (mouseX >= choice.x && mouseX <= choice.x + choice.width &&
                mouseY >= choice.y && mouseY <= choice.y + choice.height) {
                buttonColor = gameSettings.buttonHoverColor;
            }
            drawRect(choice.x, choice.y, choice.width, choice.height, buttonColor);
            ctx.fillStyle = gameSettings.textColor;
            ctx.font = `24px ${gameSettings.fontFamily}`;
            ctx.textAlign = 'center';
            ctx.fillText(choice.label, choice.x + choice.width / 2, choice.y + choice.height / 2 + 8);
        });
        ctx.textAlign = 'left'; // Reset
    }

    // Draw back button if applicable
    if (showBackButton) {
        const btnX = gameSettings.backButtonX;
        const btnY = gameSettings.backButtonY;
        const btnWidth = gameSettings.backButtonWidth;
        const btnHeight = gameSettings.backButtonHeight;
        
        let buttonColor = gameSettings.primaryColor;
        if (mouseX >= btnX && mouseX <= btnX + btnWidth &&
            mouseY >= btnY && mouseY <= btnY + btnHeight) {
            buttonColor = gameSettings.buttonHoverColor;
        }

        drawRect(btnX, btnY, btnWidth, btnHeight, buttonColor);
        ctx.fillStyle = gameSettings.textColor;
        ctx.font = `24px ${gameSettings.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.fillText(gameSettings.backButtonLabel, btnX + btnWidth / 2, btnY + btnHeight / 2 + 8);
        ctx.textAlign = 'left';
    }
}


// Main game functions
let lastFrameTime: number = 0;
function gameLoop(timestamp: number): void {
  const deltaTime = timestamp - lastFrameTime;
  lastFrameTime = timestamp;

  update(deltaTime);
  draw();

  requestAnimationFrame(gameLoop);
}

function update(deltaTime: number): void {
  // Update typing animation only in PRESENTATION state and if not finished
  if (currentGameState === GameState.PRESENTATION) {
    updateTextTyping(deltaTime);
  }

  // mouseClicked is a momentary state, reset after each update cycle
  // This approach means the click is processed on the first frame it's true.
  // If needed for prolonged click detection, modify.
  if (mouseClicked) {
    // We handle the click in the event listener directly for immediate response.
    // So, mouseClicked flag is primarily for rendering click-state feedback, if any.
    // For this context, it's reset immediately after click event processing.
  }
}

function draw(): void {
  clearCanvas();

  switch (currentGameState) {
    case GameState.TITLE:
      drawTitleScreen();
      break;
    case GameState.PRESENTATION:
      if (currentScene) {
        drawSceneContent(currentScene);
      }
      break;
  }
}

// Initialization on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error("Canvas element with ID 'gameCanvas' not found!");
    return;
  }
  ctx = canvas.getContext('2d')!;

  try {
    const response = await fetch('data.json');
    const data = await response.json();
    gameSettings = data.gameSettings;
    scenes = data.scenes; // Load scenes from data.json

    // Set canvas dimensions from settings
    canvas.width = gameSettings.canvasWidth;
    canvas.height = gameSettings.canvasHeight;

    // Load assets
    await loadAssets(data.assets);

    // Initial scene setup - we start in TITLE state, first scene will be loaded on click
    // loadScene(scenes[0].id); // Don't load first scene yet, wait for title screen interaction

    // Start game loop
    requestAnimationFrame(gameLoop);
  } catch (error) {
    console.error('Failed to load game data or assets:', error);
  }
});

// Event listeners
canvas.addEventListener('click', (e) => {
    mouseClicked = true;
    
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;

    if (bgm && bgm.paused) {
        bgm.play().catch(err => console.warn("BGM playback blocked on click:", err));
    }

    if (currentGameState === GameState.TITLE) {
        currentGameState = GameState.PRESENTATION;
        playSFX("click_sfx");
        if (scenes.length > 0) {
             loadScene(scenes[0].id); // Load the very first scene
        }
    } else if (currentGameState === GameState.PRESENTATION) {
        // Handle back button click
        if (showBackButton) {
            const btnX = gameSettings.backButtonX;
            const btnY = gameSettings.backButtonY;
            const btnWidth = gameSettings.backButtonWidth;
            const btnHeight = gameSettings.backButtonHeight;
            if (mouseX >= btnX && mouseX <= btnX + btnWidth &&
                mouseY >= btnY && mouseY <= btnY + btnHeight) {
                playSFX("click_sfx");
                loadScene('detailed_ui_ux'); // Hardcoded return to 'detailed_ui_ux' as per data.json flow
                mouseClicked = false; // Consume click for button
                return; 
            }
        }
        
        if (currentScene && currentScene.layout_type === 'text_choices' && currentScene.choices) {
            let choiceClicked = false;
            for (const choice of currentScene.choices) {
                if (mouseX >= choice.x && mouseX <= choice.x + choice.width &&
                    mouseY >= choice.y && mouseY <= choice.y + choice.height) {
                    playSFX("click_sfx");
                    loadScene(choice.target_scene_id);
                    choiceClicked = true;
                    break;
                }
            }
            if (choiceClicked) {
                mouseClicked = false; // Consume click for button
                return;
            }
            // If no specific button was clicked, a general click should still advance typing if not finished.
        }
        handlePresentationClick(); // This function will advance text typing or scene if applicable.
    }
    mouseClicked = false; // Reset mouseClicked after processing
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});