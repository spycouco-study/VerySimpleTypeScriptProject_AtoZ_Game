// game.ts
// ====== 인터페이스 및 타입 정의 ======
interface Choice {
    text: string;
    effect: { affectionChange: number; nextDialogueIndex: number };
}
interface DialogueLine {
    speaker: string;
    text: string;
    choices?: Choice[]; // 선택지는 선택 사항
    autoEffect?: { affectionChange?: number; nextDialogueIndex?: number; };
    // ✨ 수정: 엘라의 부재를 인덱스 대신 플래그로 관리
    isEllaAbsent?: boolean; 
}

enum GameState {
    START_SCREEN,
    LOADING, // ✨ 추가: 데이터 로딩 상태
    DIALOGUE,
    CHOICE,
    ENDING
}

// ====== 게임 설정 및 변수 ======
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx: CanvasRenderingContext2D = (() => {
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error("Canvas context is not available.");
    }
    return context;
})();

canvas.width = 800;
canvas.height = 600;

const CHARACTER_NAME = "엘라";
let currentGameState: GameState = GameState.LOADING; // ✨ 초기 상태를 LOADING으로 변경
let currentDialogueIndex: number = 0;
let playerAffection: number = 0;
let playerName: string = "플레이어";

// ✨ 삭제: PLAYER_MONOLOGUES_WHERE_ELLA_IS_ABSENT 상수 제거 (JSON 파일에서 관리)

// 배경 이미지 로딩
const backgroundImage = new Image();
backgroundImage.src = 'back.png';
let isBackgroundLoaded = false;
backgroundImage.onload = () => {
    isBackgroundLoaded = true;
    updateAndDraw(); 
};
// 여주인공 이미지 로딩 추가
const girlImage = new Image();
girlImage.src = 'girl.png';
let isGirlImageLoaded = false;
girlImage.onload = () => {
    isGirlImageLoaded = true;
    updateAndDraw(); 
};

// ✨ 수정: 대화 스크립트 변수를 빈 배열로 초기화하고 로딩 함수 추가
let dialogueScript: DialogueLine[] = [];

// ✨ 추가: JSON 데이터를 비동기적으로 불러오는 함수
async function loadGameData() {
    try {
        const response = await fetch('data.json'); // dialogue.json 파일 경로
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: DialogueLine[] = await response.json();
        dialogueScript = data;
        
        console.log("스크립트 데이터 로딩 완료!");
        
        // 데이터 로딩 완료 후 시작 화면으로 전환
        currentGameState = GameState.START_SCREEN; 
    } catch (error) {
        console.error("데이터 로딩 실패:", error);
        // 로딩 실패 시 에러 화면 표시 등의 추가 로직이 필요할 수 있습니다.
        currentGameState = GameState.ENDING; // 임시로 엔딩 화면으로 보내 에러 메시지 표시
    }
    updateAndDraw(); // 데이터 로드 완료 후 화면 갱신
}


// ====== 헬퍼 함수 ======
// 텍스트 줄바꿈 처리
function wrapText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
    const words = text.split(' ');
    let line = '';
    let testLine = '';
    let metrics;
    let testWidth;
    for (let n = 0; n < words.length; n++) {
        testLine = line + words[n] + ' ';
        metrics = context.measureText(testLine);
        testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            context.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    context.fillText(line, x, y);
    return y; // 마지막 줄의 Y 좌표 반환
}

// 버튼 그리기
function drawButton(context: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, height: number, backgroundColor: string = '#4CAF50', textColor: string = 'white') {
    context.fillStyle = backgroundColor;
    context.fillRect(x, y, width, height);
    context.strokeStyle = '#333';
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    context.fillStyle = textColor;
    context.font = '18px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, x + width / 2, y + height / 2);
}

// 클릭이 버튼 영역 안에 있는지 확인
function isClickInside(clickX: number, clickY: number, elementX: number, elementY: number, elementWidth: number, elementHeight: number): boolean {
    return clickX >= elementX && clickX <= elementX + elementWidth &&
           clickY >= elementY && clickY <= elementY + elementHeight;
}

// 배경 이미지를 그리거나 로딩 중일 때 대체 배경을 그리는 헬퍼 함수
function drawBackgroundImage() {
    if (isBackgroundLoaded) {
        ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
    } else {
        // 이미지가 로드되지 않았을 경우 기본 배경색 사용
        ctx.fillStyle = '#ADD8E6'; // 연한 파란색 배경 (기존 시작 화면 색상)
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Loading background...', canvas.width / 2, canvas.height / 2);
    }
}

// ====== 그리기 함수 ======
function drawLoadingScreen() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackgroundImage(); // 배경 이미지 그리기
    ctx.fillStyle = 'white';
    ctx.font = '40px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('게임 데이터를 불러오는 중...', canvas.width / 2, canvas.height / 2);
}

function drawStartScreen() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackgroundImage(); // 배경 이미지 그리기
    ctx.fillStyle = 'white';
    ctx.font = '40px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('간단 연애 시뮬레이션', canvas.width / 2, canvas.height / 2 - 50);
    ctx.font = '24px Arial';
    ctx.fillText('클릭하여 시작', canvas.width / 2, canvas.height / 2 + 30);
}

function drawDialogueScreen() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackgroundImage(); // 배경 이미지 그리기

    // 데이터가 없으면 로딩 화면으로 돌아감 (안전 장치)
    if (dialogueScript.length === 0) { 
        currentGameState = GameState.LOADING;
        drawLoadingScreen();
        return;
    }

    const currentLine = dialogueScript[currentDialogueIndex];
    if (!currentLine) { // 스크립트 인덱스가 유효 범위를 벗어났을 경우 (안전 장치)
        currentGameState = GameState.ENDING;
        drawEndingScreen();
        return;
    }
    
    // 여주인공 이미지 그리기 로직 수정 ✨
    // speaker가 비어있지 않고, isEllaAbsent 플래그가 true가 아닐 때만 표시
    const shouldShowGirl = isGirlImageLoaded &&
                           currentLine.speaker !== "" && 
                           !currentLine.isEllaAbsent; // ✨ 수정된 부분: isEllaAbsent 플래그 사용
    
    if (shouldShowGirl) {
        // 이미지 크기 및 위치 조정
        const girlImageWidth = 350; 
        const girlImageHeight = 450; 
        const girlImageX = canvas.width - girlImageWidth - 50; 
        const girlImageY = canvas.height - girlImageHeight; 
        ctx.drawImage(girlImage, girlImageX, girlImageY, girlImageWidth, girlImageHeight);
    }

    // 대화 상자 배경
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(50, canvas.height - 200, canvas.width - 100, 150);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(50, canvas.height - 200, canvas.width - 100, 150);

    // 캐릭터 이름 표시
    ctx.fillStyle = '#333';
    ctx.font = '24px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(currentLine.speaker + ':', 60, canvas.height - 190);

    // 대사 표시 
    ctx.fillStyle = '#333';
    ctx.font = '20px Arial';
    const displayedText = currentLine.text.replace(/\[플레이어 이름\]/g, playerName); 
    wrapText(ctx, displayedText, 60, canvas.height - 150, canvas.width - 120, 25);

    // 다음 대사 진행 안내
    if (!currentLine.choices) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.font = '16px Arial';
        ctx.textAlign = 'right';
        ctx.fillText('클릭하여 진행 ▶', canvas.width - 70, canvas.height - 30);
    }
}

function drawChoiceScreen() {
    drawDialogueScreen(); // 대화 배경과 현재 대사는 계속 표시
    const currentLine = dialogueScript[currentDialogueIndex];
    if (currentLine && currentLine.choices) {
        let buttonY = canvas.height - 280 - (currentLine.choices.length - 1) * 60; // 버튼이 아래로 쌓이도록
        const buttonWidth = canvas.width - 200;
        const buttonHeight = 50;
        const buttonX = 100;
        const buttonSpacing = 10;
        currentLine.choices.forEach((choice, index) => {
            drawButton(ctx, choice.text, buttonX, buttonY, buttonWidth, buttonHeight, '#6495ED'); // 파란색 버튼
            buttonY += buttonHeight + buttonSpacing;
        });
    }
}

function drawEndingScreen() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackgroundImage(); // 배경 이미지 그리기
    
    // 로딩 실패 시 에러 메시지
    if (dialogueScript.length === 0 && currentGameState === GameState.ENDING) {
        ctx.fillStyle = 'red';
        ctx.font = '36px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText("데이터 로딩에 실패했습니다. 'dialogue.json' 파일을 확인해주세요.", canvas.width / 2, canvas.height / 2);
        return;
    }

    ctx.fillStyle = 'white';
    ctx.font = '36px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let endingText = "";
    if (playerAffection >= 40) { // 호감도 기준 상향 조정
        endingText = `${playerName}님, 엘라와 아름다운 인연을 시작했습니다!`;
    } else if (playerAffection >= 10) { // 호감도 기준 조정
        endingText = `${playerName}님, 엘라와 평범하지만 기분 좋은 만남을 가졌습니다.`;
    } else {
        endingText = `${playerName}님, 엘라와의 관계가 아쉽게 마무리되었습니다...`;
    }

    ctx.fillText(endingText, canvas.width / 2, canvas.height / 2 - 50);
    ctx.font = '24px Arial';
    ctx.fillText(`엘라의 호감도: ${playerAffection}`, canvas.width / 2, canvas.height / 2);
    ctx.fillText('클릭하여 다시 시작', canvas.width / 2, canvas.height / 2 + 50);
}

// ====== 게임 루프 및 이벤트 핸들러 ======
function updateAndDraw() {
    switch (currentGameState) {
        case GameState.LOADING: // ✨ LOADING 상태 추가
            drawLoadingScreen();
            break;
        case GameState.START_SCREEN:
            drawStartScreen();
            break;
        case GameState.DIALOGUE:
            drawDialogueScreen();
            break;
        case GameState.CHOICE:
            drawChoiceScreen();
            break;
        case GameState.ENDING:
            drawEndingScreen();
            break;
    }
}

function handleClick(event: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    switch (currentGameState) {
        case GameState.LOADING: // 로딩 중에는 클릭 무시
            return; 
        case GameState.START_SCREEN: 
            const inputName = prompt("당신의 이름을 입력해주세요:", "플레이어");
            if (inputName !== null && inputName.trim() !== "") {
                playerName = inputName.trim();
            } else {
                playerName = "모험가"; 
            }
            currentGameState = GameState.DIALOGUE;
            currentDialogueIndex = 0;
            playerAffection = 0;
            break;

        case GameState.DIALOGUE:
            const currentLine = dialogueScript[currentDialogueIndex];
            if (!currentLine) { 
                currentGameState = GameState.ENDING;
                break;
            }
            if (currentLine.choices) {
                currentGameState = GameState.CHOICE;
            } else {
                if (currentLine.autoEffect) {
                    if (currentLine.autoEffect.affectionChange !== undefined) {
                        playerAffection += currentLine.autoEffect.affectionChange;
                    }
                    if (currentLine.autoEffect.nextDialogueIndex !== undefined) {
                        currentDialogueIndex = currentLine.autoEffect.nextDialogueIndex;
                    } else {
                        currentDialogueIndex++; 
                    }
                } else {
                    currentDialogueIndex++; 
                }
                
                // 다음 대화 인덱스가 스크립트 길이를 넘어서면 엔딩으로 전환
                if (currentDialogueIndex >= dialogueScript.length) {
                    currentGameState = GameState.ENDING;
                }
            }
            break;

        case GameState.CHOICE:
            // 선택지 클릭 처리 로직은 변경 없음
            const dialogue = dialogueScript[currentDialogueIndex];
            if (dialogue && dialogue.choices) {
                let buttonY = canvas.height - 280 - (dialogue.choices.length - 1) * 60;
                const buttonWidth = canvas.width - 200;
                const buttonHeight = 50;
                const buttonX = 100;
                const buttonSpacing = 10;
                for (let i = 0; i < dialogue.choices.length; i++) {
                    if (isClickInside(clickX, clickY, buttonX, buttonY, buttonWidth, buttonHeight)) {
                        const choice = dialogue.choices[i];
                        playerAffection += choice.effect.affectionChange;
                        currentDialogueIndex = choice.effect.nextDialogueIndex;
                        currentGameState = GameState.DIALOGUE; // 선택 후 다시 대화 상태로
                        break;
                    }
                    buttonY += buttonHeight + buttonSpacing;
                }
            } else {
                currentGameState = GameState.DIALOGUE;
            }
            break;
            
        case GameState.ENDING:
            currentGameState = GameState.START_SCREEN; // 다시 시작 화면으로
            break;
    }
    updateAndDraw(); // 상태 변경 후 즉시 화면 업데이트
}

// 이벤트 리스너 등록
canvas.addEventListener('click', handleClick);

// ✨ 수정: 초기 화면 그리기 대신 데이터 로딩 함수 호출
loadGameData();