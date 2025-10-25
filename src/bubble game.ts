// game.ts
// --- Constants ---
const GRID_SIZE = 20; // 20x20 그리드
const NUM_COLORS = 6; // 6가지 색상 (0-5)
const BUBBLE_SIZE = 30; // 방울 하나의 크기 (px)
const POP_ANIMATION_DURATION = 200; // 터지는 애니메이션 지속 시간 (ms)
const FALL_ANIMATION_DURATION = 150; // 떨어지는 애니메이션 지속 시간 (ms)
// --- Global State ---
let grid: number[][] = []; // 게임 그리드 (2D 배열, 각 요소는 색상 번호)
let score: number = 0; // 현재 점수
let selectedBubble: { r: number; c: number } | null = null; // 선택된 첫 번째 방울
let isProcessingMove: boolean = false; // 현재 움직임(스왑, 매치, 중력, 채우기) 처리 중인지 여부
const gameContainer = document.createElement('div');
gameContainer.id = 'game-container';
document.body.appendChild(gameContainer);
const scoreDisplay = document.createElement('div');
scoreDisplay.id = 'score-display';
gameContainer.appendChild(scoreDisplay);
const gridElement = document.createElement('div');
gridElement.id = 'grid';
gridElement.style.gridTemplateColumns = `repeat(${GRID_SIZE}, ${BUBBLE_SIZE}px)`;
gridElement.style.gridTemplateRows = `repeat(${GRID_SIZE}, ${BUBBLE_SIZE}px)`;
gridElement.style.width = `${GRID_SIZE * BUBBLE_SIZE}px`;
gridElement.style.height = `${GRID_SIZE * BUBBLE_SIZE}px`;
gameContainer.appendChild(gridElement);
// DOM 요소를 직접 참조하는 2D 배열 (성능 최적화)
const bubbleElements: HTMLElement[][] = [];
// --- Helper Functions ---
/**
 * 그리드 내의 유효한 좌표인지 확인
 */
function isValidCoord(r: number, c: number): boolean {
    return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;
}
/**
 * 두 방울이 인접한지 확인 (상하좌우)
 */
function areAdjacent(r1: number, c1: number, r2: number, c2: number): boolean {
    const dr = Math.abs(r1 - r2);
    const dc = Math.abs(c1 - c2);
    return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}
/**
 * 점수 업데이트 및 화면에 표시
 */
function updateScore(points: number): void {
    score += points;
    scoreDisplay.textContent = `Score: ${score}`;
}
/**
 * 특정 방울의 DOM 요소를 업데이트합니다.
 */
function updateBubbleDisplay(r: number, c: number): void {
    const bubbleDiv = bubbleElements[r][c];
    const color = grid[r][c];
    if (color === -1) { // 빈 공간
        bubbleDiv.className = 'bubble empty';
        bubbleDiv.style.backgroundColor = 'transparent';
        bubbleDiv.style.transform = 'scale(0)'; // 빈 공간은 숨김
    } else {
        bubbleDiv.className = `bubble color-${color}`;
        bubbleDiv.style.backgroundColor = `var(--color-${color})`;
        bubbleDiv.style.transform = 'scale(1)'; // 방울 보임
    }
    bubbleDiv.setAttribute('data-color', color.toString());
}
/**
 * 초기 그리드를 무작위 색상으로 채웁니다.
 * 이 때, 초기 매치가 없도록 반복적으로 재구성합니다.
 */
function fillInitialGrid(): void {
    for (let r = 0; r < GRID_SIZE; r++) {
        grid[r] = [];
        bubbleElements[r] = [];
        for (let c = 0; c < GRID_SIZE; c++) {
            let newColor: number;
            // 초기 매치를 피하기 위해 색상 선택 로직
            do {
                newColor = Math.floor(Math.random() * NUM_COLORS);
            } while (
                (c >= 2 && grid[r][c - 1] === newColor && grid[r][c - 2] === newColor) || // 왼쪽으로 3개 매치 방지
                (r >= 2 && grid[r - 1][c] === newColor && grid[r - 2][c] === newColor)    // 위쪽으로 3개 매치 방지
            );
            grid[r][c] = newColor;
            const bubbleDiv = document.createElement('div');
            bubbleDiv.className = `bubble color-${newColor}`;
            bubbleDiv.style.width = `${BUBBLE_SIZE}px`;
            bubbleDiv.style.height = `${BUBBLE_SIZE}px`;
            bubbleDiv.style.backgroundColor = `var(--color-${newColor})`;
            bubbleDiv.setAttribute('data-row', r.toString());
            bubbleDiv.setAttribute('data-col', c.toString());
            bubbleDiv.setAttribute('data-color', newColor.toString());
            bubbleDiv.addEventListener('click', handleBubbleClick);
            gridElement.appendChild(bubbleDiv);
            bubbleElements[r][c] = bubbleDiv;
        }
    }
}
/**
 * 게임 초기화 함수
 */
function initGame(): void {
    score = 0;
    updateScore(0);
    gridElement.innerHTML = ''; // 기존 방울 제거
    selectedBubble = null;
    isProcessingMove = false;
    // 초기 그리드 채우기 (매치 없는 상태로)
    fillInitialGrid();
    // 초기화 후, 혹시 모를 매치(fillInitialGrid 로직이 완벽하지 않을 수 있으므로)를 한 번 더 제거
    // 이 과정은 매치 없는 상태가 될 때까지 반복
    let initialMatchesExist: boolean;
    do {
        const matches = findMatches();
        initialMatchesExist = matches.size > 0; // <<< 이 부분 수정: .length -> .size
        if (initialMatchesExist) {
            removeMatchedBubbles(matches);
            applyGravity();
            fillEmptySpaces();
        }
    } while (initialMatchesExist);
}
/**
 * 방울 클릭 핸들러
 */
function handleBubbleClick(event: Event): void {
    if (isProcessingMove) return; // 처리 중일 때는 클릭 무시
    const clickedBubbleDiv = event.target as HTMLElement;
    const r = parseInt(clickedBubbleDiv.getAttribute('data-row') || '0');
    const c = parseInt(clickedBubbleDiv.getAttribute('data-col') || '0');
    if (selectedBubble === null) {
        // 첫 번째 방울 선택
        selectedBubble = { r, c };
        clickedBubbleDiv.classList.add('selected');
    } else {
        // 두 번째 방울 선택
        const r1 = selectedBubble.r;
        const c1 = selectedBubble.c;
        // 선택 해제
        bubbleElements[r1][c1].classList.remove('selected');
        if (r === r1 && c === c1) {
            // 같은 방울을 다시 클릭한 경우, 선택 해제만
            selectedBubble = null;
        } else if (areAdjacent(r1, c1, r, c)) {
            // 인접한 두 방울을 선택한 경우, 교환
            isProcessingMove = true; // 처리 시작
            swapBubbles(r1, c1, r, c);
            selectedBubble = null; // 선택 해제
            // 스왑 후 매치 확인 및 처리
            setTimeout(() => {
                processMatches();
            }, POP_ANIMATION_DURATION); // 스왑 애니메이션 시간 대기 후 매치 처리
        } else {
            // 인접하지 않은 방울을 선택한 경우, 새롭게 선택
            selectedBubble = { r, c };
            clickedBubbleDiv.classList.add('selected');
        }
    }
}
/**
 * 두 방울의 위치를 교환합니다.
 */
function swapBubbles(r1: number, c1: number, r2: number, c2: number): void {
    // 1. 그리드 데이터 교환
    [grid[r1][c1], grid[r2][c2]] = [grid[r2][c2], grid[r1][c1]];
    // 2. DOM 요소 시각적으로 업데이트
    updateBubbleDisplay(r1, c1);
    updateBubbleDisplay(r2, c2);
}
/**
 * 매치되는 방울들을 찾아 반환합니다. (Set을 사용하여 중복 좌표 방지)
 */
function findMatches(): Set<string> {
    const matches = new Set<string>(); // "r,c" 형태의 문자열로 저장
    // 가로 매치 확인
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE - 2; c++) {
            const color = grid[r][c];
            if (color === -1) continue; // 빈 공간은 매치되지 않음
            if (grid[r][c + 1] === color && grid[r][c + 2] === color) {
                // 3개 이상 매치될 경우를 위해 확장
                let matchLength = 0;
                while (c + matchLength < GRID_SIZE && grid[r][c + matchLength] === color) {
                    matchLength++;
                }
                for (let i = 0; i < matchLength; i++) {
                    matches.add(`${r},${c + i}`);
                }
                c += matchLength - 1; // 이미 처리된 매치 건너뛰기
            }
        }
    }
    // 세로 매치 확인
    for (let c = 0; c < GRID_SIZE; c++) {
        for (let r = 0; r < GRID_SIZE - 2; r++) {
            const color = grid[r][c];
            if (color === -1) continue; // 빈 공간은 매치되지 않음
            if (grid[r + 1][c] === color && grid[r + 2][c] === color) {
                // 3개 이상 매치될 경우를 위해 확장
                let matchLength = 0;
                while (r + matchLength < GRID_SIZE && grid[r + matchLength][c] === color) {
                    matchLength++;
                }
                for (let i = 0; i < matchLength; i++) {
                    matches.add(`${r + i},${c}`);
                }
                r += matchLength - 1; // 이미 처리된 매치 건너뛰기
            }
        }
    }
    return matches;
}
/**
 * 매치된 방울들을 제거하고 점수를 업데이트합니다.
 */
function removeMatchedBubbles(matches: Set<string>): void {
    if (matches.size === 0) return;
    updateScore(matches.size); // 터진 방울 개수만큼 점수 증가
    matches.forEach(coordStr => {
        const [r, c] = coordStr.split(',').map(Number);
        grid[r][c] = -1; // -1은 빈 공간을 의미
        const bubbleDiv = bubbleElements[r][c];
        bubbleDiv.classList.add('popping'); // 터지는 애니메이션 클래스 추가
        bubbleDiv.style.transform = 'scale(0)'; // 시각적으로 작아지게
        bubbleDiv.style.backgroundColor = 'transparent'; // 색상 투명하게
        bubbleDiv.setAttribute('data-color', '-1');
    });
}
/**
 * 중력을 적용하여 빈 공간을 위에 있는 방울로 채웁니다.
 */
function applyGravity(): void {
    for (let c = 0; c < GRID_SIZE; c++) {
        let emptyCount = 0;
        // 아래에서 위로 스캔하면서 빈 공간을 찾고, 유효한 방울을 아래로 내림
        for (let r = GRID_SIZE - 1; r >= 0; r--) {
            if (grid[r][c] === -1) {
                emptyCount++;
            } else if (emptyCount > 0) {
                // 현재 방울을 emptyCount만큼 아래로 이동
                grid[r + emptyCount][c] = grid[r][c];
                grid[r][c] = -1; // 원래 자리는 빈 공간으로
            }
        }
    }
}
/**
 * 빈 공간을 새로운 무작위 방울로 채웁니다.
 */
function fillEmptySpaces(): void {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (grid[r][c] === -1) {
                grid[r][c] = Math.floor(Math.random() * NUM_COLORS);
            }
        }
    }
}
/**
 * 매치 확인, 제거, 중력, 채우기 과정을 총괄하는 핵심 로직.
 * 연쇄 반응을 위해 재귀적으로 호출될 수 있습니다.
 */
async function processMatches(): Promise<void> {
    const matches = findMatches();
    if (matches.size === 0) {
        // 더 이상 매치가 없으면 처리 종료, 사용자 입력 활성화
        isProcessingMove = false;
        // console.log("No more matches. Move complete.");
        return;
    }
    // 매치된 방울 제거 (시각적 애니메이션 포함)
    removeMatchedBubbles(matches);
    await new Promise(resolve => setTimeout(resolve, POP_ANIMATION_DURATION)); // 터지는 애니메이션 대기
    // 중력 적용
    applyGravity();
    // DOM 업데이트 (중력으로 떨어진 방울들)
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            updateBubbleDisplay(r, c);
        }
    }
    await new Promise(resolve => setTimeout(resolve, FALL_ANIMATION_DURATION)); // 떨어지는 애니메이션 대기
    // 빈 공간 채우기
    fillEmptySpaces();
    // DOM 업데이트 (새로운 방울들)
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            updateBubbleDisplay(r, c);
        }
    }
    await new Promise(resolve => setTimeout(resolve, FALL_ANIMATION_DURATION)); // 새로운 방울 나타나는 애니메이션 대기
    // 연쇄 반응 확인을 위해 다시 매치 확인
    processMatches();
}
// --- Main Execution ---
// CSS 스타일을 동적으로 추가 (하나의 파일로 구성하기 위함)
const style = document.createElement('style');
style.textContent = `
    body {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        min-height: 100vh;
        margin: 0;
        background-color: lightgray; /* 색상 추가 */
        font-family: 'Arial', sans-serif;
        color: #333; /* 색상 추가 */
    }
    #game-container { /* 누락된 선택자 추가 */
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-top: 50px;
        padding: 20px;
        background-color: white; /* 색상 추가 */
        border-radius: 8px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    }
    #score-display { /* 누락된 선택자 추가 */
        font-size: 24px;
        margin-bottom: 20px;
        font-weight: bold;
    }
    #grid { /* 누락된 선택자 추가 */
        display: grid;
        border: 2px solid #666; /* 색상 추가 */
        background-color: #eee; /* 색상 추가 */
        touch-action: none; /* 모바일에서 드래그 스크롤 방지 */
    }
    .bubble {
        width: ${BUBBLE_SIZE}px;
        height: ${BUBBLE_SIZE}px;
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        box-sizing: border-box;
        border: 2px solid rgba(0,0,0,0.1);
        transition: transform ${POP_ANIMATION_DURATION}ms ease-out, 
                    background-color ${POP_ANIMATION_DURATION}ms ease-out,
                    border ${POP_ANIMATION_DURATION}ms ease-out;
    }
    .bubble.selected {
        border: 3px solid #007bff; /* 색상 추가 */
        transform: scale(1.1);
    }
    .bubble.popping {
        transform: scale(0);
        opacity: 0;
        transition: transform ${POP_ANIMATION_DURATION}ms ease-out, 
                    opacity ${POP_ANIMATION_DURATION}ms ease-out;
    }
    /* Colors */
    :root {
        --color-0: #FF6B6B; /* 빨강 */
        --color-1: #4ECDC4; /* 청록 */
        --color-2: #45B7D1; /* 하늘 */
        --color-3: #F7FFF7; /* 아이보리 */
        --color-4: #FCCA46; /* 노랑 */
        --color-5: #A1C3D1; /* 파랑-회색 */
    }
    .color-0 { background-color: var(--color-0); }
    .color-1 { background-color: var(--color-1); }
    .color-2 { background-color: var(--color-2); }
    .color-3 { background-color: var(--color-3); }
    .color-4 { background-color: var(--color-4); }
    .color-5 { background-color: var(--color-5); }
`;
document.head.appendChild(style);
document.addEventListener('DOMContentLoaded', initGame);