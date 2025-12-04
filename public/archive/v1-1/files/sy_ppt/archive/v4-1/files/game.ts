canvas.addEventListener('click', (e) => {
    mouseClicked = true;
    
    // 클릭 이벤트가 발생한 정확한 좌표로 mouseX, mouseY를 업데이트합니다.
    // 이는 마우스 움직임(mousemove)과 클릭 순간의 좌표 불일치로 인한 오류를 방지합니다.
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;

    if (bgm && bgm.paused) {
        bgm.play().catch(e => console.warn("BGM playback blocked on click:", e));
    }

    if (currentGameState === GameState.TITLE) {
        currentGameState = GameState.PRESENTATION;
        playSFX("click_sfx");
        resetTextTypingState();
    } else if (currentGameState === GameState.PRESENTATION) {
        handlePresentationClick();
    }
});