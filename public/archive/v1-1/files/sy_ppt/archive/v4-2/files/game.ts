let justNavigatedBack: boolean = false; // New: Flag to prevent immediate forward progression after back navigation

// New: Function to handle scene transitions
function goToScene(sceneId: string, pushToHistory: boolean = true) {
    const targetScene = gameData.scenes.find(s => s.id === sceneId);
    if (!targetScene) {
        console.error(`Scene with ID ${sceneId} not found.`);
        currentGameState = GameState.ENDING;
        return;
    }

    // Push current scene to history if navigating forward from presentation
    if (pushToHistory && currentGameState === GameState.PRESENTATION) {
        sceneHistory.push(gameData.scenes[currentSceneIndex].id);
    }
    
    currentSceneIndex = gameData.scenes.indexOf(targetScene);
    
    // Reset text display state based on navigation direction
    if (pushToHistory) { // Navigating forward, reset text to type from beginning
        resetTextTypingState();
        justNavigatedBack = false; // Reset flag when navigating forward
    } else { // Navigating backward, show all text immediately
        displayedTextIndex = targetScene.text_content.length > 0 ? targetScene.text_content.length - 1 : 0;
        currentLineCharIndex = targetScene.text_content.length > 0 ? targetScene.text_content[displayedTextIndex].length : 0;
        typingTimer = 0; // No typing needed if text is fully displayed
        lastTypeSoundTime = 0;
        justNavigatedBack = true; // Set flag when navigating back
    }
    
    // Reset hovered states
    hoveredButton = null;
    hoveredBackButton = false;
}

function handlePresentationClick() {
    // New: If we just navigated back, consume this click event to prevent immediate re-progression.
    // This addresses the issue where a subsequent click after going back would immediately
    // advance the scene again if the previous scene had its text fully displayed and a 'next_scene'.
    if (justNavigatedBack) {
        justNavigatedBack = false; // Reset the flag for the next potential click
        return; // Consume the click without further processing
    }

    const currentScene = gameData.scenes[currentSceneIndex];
    const settings = gameData.gameSettings;

    // New: Handle back button click first.
    // Re-evaluate hover condition at the moment of click for robustness
    const isBackButtonClicked = sceneHistory.length > 0 &&
                                mouseX >= settings.backButtonX && mouseX <= settings.backButtonX + settings.backButtonWidth &&
                                mouseY >= settings.backButtonY && mouseY <= settings.backButtonY + settings.backButtonHeight;

    if (isBackButtonClicked) {
        handleBackButton();
        return; // Consume the click
    }

    // Existing logic for choices
    if (currentScene.choices && hoveredButton) {
        playSFX("click_sfx");
        goToScene(hoveredButton!.target_scene_id, true); // Use goToScene
        return;
    }

    const totalLines = currentScene.text_content.length;
    // If not all text is displayed, complete the current line
    if (displayedTextIndex < totalLines) {
        const currentLine = currentScene.text_content[displayedTextIndex];
        if (currentLineCharIndex < currentLine.length) {
            currentLineCharIndex = currentLine.length;
            playSFX("click_sfx");
            return;
        }
    }

    // If all text is displayed and there are no choices OR if it's a linear scene
    if (!currentScene.choices || currentScene.choices.length === 0) {
        if (displayedTextIndex < totalLines - 1) { // Move to the next line of text
            displayedTextIndex++;
            currentLineCharIndex = 0;
            typingTimer = 0;
            playSFX("click_sfx");
        } else { // All text lines displayed, proceed to next scene or end
            if (currentScene.next_scene) {
                playSFX("click_sfx");
                goToScene(currentScene.next_scene, true); // Use goToScene
            } else {
                currentGameState = GameState.ENDING;
                playSFX("click_sfx");
            }
        }
    }
}