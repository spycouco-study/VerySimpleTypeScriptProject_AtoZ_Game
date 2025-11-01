// // game.ts
// // ====== 인터페이스 및 타입 정의 ======
// interface Choice {
//     text: string;
//     effect: { affectionChange: number; nextDialogueIndex: number };
// }
// interface DialogueLine {
//     speaker: string;
//     text: string;
//     choices?: Choice[]; // 선택지는 선택 사항
//     // ✨ 수정: 선택지 없이 자동 효과/다음 대화로 넘어갈 경우를 위한 속성 추가
//     autoEffect?: { affectionChange?: number; nextDialogueIndex?: number; };
// }
// enum GameState {
//     START_SCREEN,
//     DIALOGUE,
//     CHOICE,
//     ENDING
// }
// // ====== 게임 설정 및 변수 ======
// const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
// // ctx 변수를 CanvasRenderingContext2D 타입으로 명확히 선언하고 초기화합니다.
// // null 체크 로직을 즉시 실행 함수 내에 넣어, ctx가 항상 유효한 Context 객체임을 보장합니다.
// const ctx: CanvasRenderingContext2D = (() => {
//     const context = canvas.getContext('2d');
//     if (!context) {
//         throw new Error("Canvas context is not available.");
//     }
//     return context;
// })();
// canvas.width = 800;
// canvas.height = 600;
// const CHARACTER_NAME = "엘라";
// let currentGameState: GameState = GameState.START_SCREEN;
// let currentDialogueIndex: number = 0;
// let playerAffection: number = 0; // 엘라에 대한 플레이어의 호감도
// let playerName: string = "플레이어"; // ✨ 추가: 플레이어 이름을 저장할 변수
// // ✨ 추가: 엘라가 화면에 보이지 않아야 하는 특정 독백 대화 인덱스 정의
// const PLAYER_MONOLOGUES_WHERE_ELLA_IS_ABSENT = new Set([0, 31, 36, 44]);
// // 배경 이미지 로딩
// const backgroundImage = new Image();
// backgroundImage.src = 'assets/back.png';
// let isBackgroundLoaded = false;
// backgroundImage.onload = () => {
//     isBackgroundLoaded = true;
//     updateAndDraw(); // 이미지가 로드되면 화면을 다시 그림
// };
// // 여주인공 이미지 로딩 추가
// const girlImage = new Image();
// girlImage.src = 'assets/girl.png';
// let isGirlImageLoaded = false;
// girlImage.onload = () => {
//     isGirlImageLoaded = true;
//     updateAndDraw(); // 이미지가 로드되면 화면을 다시 그림
// };
// // 대화 스크립트 정의
// // ✨ 수정: `const`를 `let`으로 변경하고, 배열 리터럴을 감싸던 괄호를 제거.
// // 초기화 시 `dialogueScript.length`를 참조하지 못하므로 임시 값(null)을 사용합니다.
// let dialogueScript: DialogueLine[] = (
//     [
//         // 0: 시작
//         { speaker: "나", text: "음... 여기가 그 유명한 공원인가. 오랜만에 한가한 주말이네." }, // 독백 - 엘라 안 보임
//         { speaker: CHARACTER_NAME, text: "어머, 실례합니다. 혹시 이 근처에 분위기 좋은 카페 아세요? 지도를 봐도 잘 모르겠어서요." },
//         { speaker: "나", text: "네, 저기 길 건너편에 아기자기하고 조용한 카페가 하나 있어요. 제가 가는 길이라 안내해 드릴 수 있는데..." }, // 대화 중 - 엘라 보임
//         { speaker: CHARACTER_NAME, text: "정말요? 다행이다! 고마워요! 아, 제 이름은 엘라예요. 당신은...?" },
//         { speaker: "나", text: "아, 저는 [플레이어 이름]이라고 합니다. 반갑습니다, 엘라 씨." }, // 대화 중 - 엘라 보임
//         {
//             speaker: CHARACTER_NAME, text: "반가워요, [플레이어 이름]님! 혹시 지금 바쁘지 않으시면, 그 카페에서 저랑 같이 커피 한 잔 하실래요? 저 혼자라 좀 심심했거든요.",
//             choices: [
//                 { text: "네, 좋아요! 저도 마침 목이 말랐어요.", effect: { affectionChange: 15, nextDialogueIndex: 6 } }, // 카페 동행
//                 { text: "죄송하지만, 다음에요. 오늘은 좀 바빠서...", effect: { affectionChange: -10, nextDialogueIndex: 30 } } // 거절
//             ]
//         },
//         // --- 카페 동행 경로 (nextDialogueIndex: 6) ---
//         // 6
//         { speaker: CHARACTER_NAME, text: "앗, 정말요? 다행이다! [플레이어 이름]님 덕분에 혼자서 헤매지 않겠네요." }, // ✨ 주석: 이전에는 쉼표가 누락되었을 수 있습니다.
//         { speaker: "나", text: "천만에요. 저도 좋은 시간을 보낼 것 같아요." }, // ✨ 주석: 이전에는 쉼표가 누락되었을 수 있습니다.
//         { speaker: CHARACTER_NAME, text: "이곳 분위기 정말 좋네요! [플레이어 이름]님 덕분에 좋은 곳 알아가요." }, // ✨ 주석: 이전에는 쉼표가 누락되었을 수 있습니다.
//         { // dialogueScript[9]
//             speaker: "나", text: "엘라 씨는 어떤 종류의 커피를 좋아하세요? 저는 개인적으로 산미 있는 아메리카노를 즐겨 마셔요.",
//             choices: [
//                 { text: "저도 아메리카노요. 깔끔한 맛이 좋죠.", effect: { affectionChange: 5, nextDialogueIndex: 10 } }, // 취향 일치
//                 { text: "저는 달콤한 라떼나 카푸치노를 좋아해요.", effect: { affectionChange: 0, nextDialogueIndex: 11 } } // 취향 다름
//             ]
//         },
//         // 10: 아메리카노 선택 시 (이전 오류: love game.ts(146,5)는 이 객체 앞에 쉼표가 필요했을 수 있습니다.)
//         { speaker: CHARACTER_NAME, text: "어머, 정말요? 저도 가끔 아메리카노를 마시는데, 취향이 비슷하시네요! 뭔가 통하는 기분인데요?", autoEffect: { affectionChange: 5, nextDialogueIndex: 12 } }, // ✨ 주석: 여기에 쉼표가 누락되었을 수 있습니다.
//         // 11: 라떼/카푸치노 선택 시
//         { speaker: CHARACTER_NAME, text: "아, 그렇군요! 저는 달콤한 라떼를 주로 마시는데, 아메리카노도 매력이 있죠. 다음에 한 번 도전해봐야겠네요.", autoEffect: { affectionChange: 0, nextDialogueIndex: 12 } }, // ✨ 주석: 여기에 쉼표가 누락되었을 수 있습니다.
//         // 12: 공통 대화
//         { speaker: "나", text: "엘라 씨는 주말에 주로 뭘 하면서 보내세요? 이렇게 카페에 오시는 걸 좋아하시나 봐요." }, // ✨ 주석: 이전에는 쉼표가 누락되었을 수 있습니다.
//         { speaker: CHARACTER_NAME, text: "네, 저는 카페에서 책 읽는 걸 좋아해요. 그리고 가끔은 전시회 구경도 가고요. [플레이어 이름]님은요?" }, // ✨ 주석: 이전에는 쉼표가 누락되었을 수 있습니다.
//         { // dialogueScript[14] (이전 오류: love game.ts(154,5)는 이 객체 또는 이전 객체 앞에 쉼표가 필요했을 수 있습니다.)
//             speaker: "나", text: "음... 저는 주로 새로운 장소를 탐험하거나, 가끔은 사진을 찍으러 다니곤 해요.",
//             choices: [
//                 { text: "사진이요? 어떤 사진을 주로 찍으세요?", effect: { affectionChange: 10, nextDialogueIndex: 15 } }, // 관심 표현
//                 { text: "저도 책 읽는 걸 좋아해요. 요즘 읽으시는 책 있으세요?", effect: { affectionChange: 5, nextDialogueIndex: 16 } } // 공통 관심사 어필
//             ]
//         },
//         // 15: 사진 질문 시 (이전 오류: love game.ts(159,5)는 이 객체 앞에 쉼표가 필요했을 수 있습니다.)
//         { speaker: CHARACTER_NAME, text: "와, 사진이라니 멋지네요! 저는 풍경 사진이나 거리 스냅 사진을 좋아해요. [플레이어 이름]님은요?", autoEffect: { affectionChange: 5, nextDialogueIndex: 17 } }, // ✨ 주석: 여기에 쉼표가 누락되었을 수 있습니다.
//         // 16: 책 질문 시
//         { speaker: CHARACTER_NAME, text: "요즘은 좀 감성적인 소설을 읽고 있어요. [플레이어 이름]님도 혹시 그런 장르 좋아하세요? 다음에 추천해 드릴게요!", autoEffect: { affectionChange: 0, nextDialogueIndex: 17 } }, // ✨ 주석: 여기에 쉼표가 누락되었을 수 있습니다.
//         // 17: 공통 대화 - 전시회 제안
//         { speaker: CHARACTER_NAME, text: "어, 저기 보니까 작은 미술 전시회 포스터가 있네요! 마침 제가 가보려던 곳인데... 혹시 [플레이어 이름]님도 미술 좋아하세요?" },
//         { // dialogueScript[18]
//             speaker: CHARACTER_NAME, text: "혹시 괜찮으시면, 저랑 같이 전시회 구경 가실래요? 여기서 멀지 않아요.",
//             choices: [
//                 { text: "좋아요! 마침 저도 흥미가 있었어요.", effect: { affectionChange: 15, nextDialogueIndex: 19 } }, // 전시회 동행
//                 { text: "음... 오늘은 이만 헤어져야 할 것 같아요.", effect: { affectionChange: -5, nextDialogueIndex: 35 } } // 거절 (카페에서 헤어짐)
//             ]
//         },
//         // --- 전시회 동행 경로 (nextDialogueIndex: 19) ---
//         // 19
//         { speaker: "나", text: "전시회는 오랜만인데, 엘라 씨 덕분에 좋은 구경하겠네요." },
//         { speaker: CHARACTER_NAME, text: "저야말로 [플레이어 이름]님 덕분에 덜 심심하네요! 저 작품 좀 보세요, 정말 신비롭지 않아요?" },
//         { speaker: "나", text: "그러게요. 작가의 의도가 궁금해지네요." },
//         { speaker: CHARACTER_NAME, text: "어머! 제가 뭘 떨어뜨렸나 봐요... 아, 핸드폰이네요!" },
//         {
//             speaker: "나", text: "괜찮으세요? 제가 주워 드릴게요.",
//             choices: [
//                 { text: "얼른 핸드폰을 주워 건넨다.", effect: { affectionChange: 10, nextDialogueIndex: 24 } }, // 친절
//                 { text: "괜찮으신지 먼저 묻는다.", effect: { affectionChange: 5, nextDialogueIndex: 25 } } // 배려
//             ]
//         },
//         // 24: 핸드폰 주워 건넴
//         { speaker: CHARACTER_NAME, text: "고마워요, [플레이어 이름]님! 덕분에 큰일 날 뻔했어요. 섬세하게 챙겨주셔서 감동이에요.", autoEffect: { affectionChange: 5, nextDialogueIndex: 26 } },
//         // 25: 괜찮은지 물음
//         { speaker: CHARACTER_NAME, text: "네, 괜찮아요! 걱정해주셔서 고마워요, [플레이어 이름]님. 저의 덜렁거리는 모습까지 보게 되네요.", autoEffect: { affectionChange: 0, nextDialogueIndex: 26 } },
//         // 26: 공통 대화
//         { speaker: "나", text: "별말씀을요. 다행히 액정은 괜찮아 보이네요." },
//         { speaker: CHARACTER_NAME, text: "정말 [플레이어 이름]님 덕분에 오늘 하루가 더 즐거운 것 같아요. 시간이 벌써 이렇게 됐다니 아쉽네요." },
//         { speaker: "나", text: "그러게요. 저도 엘라 씨 덕분에 뜻깊은 시간이었어요." },
//         {
//             speaker: CHARACTER_NAME, text: "음... 혹시 다음에 또 만날 수 있을까요? 제 연락처 여기 있어요.",
//             choices: [
//                 { text: "네, 좋아요! 저도 엘라 씨와 더 알아가고 싶어요. 제 연락처도 드릴게요.", effect: { affectionChange: 20, nextDialogueIndex: 40 } }, // 연락처 교환
//                 { text: "생각해볼게요. 오늘 즐거웠어요.", effect: { affectionChange: 0, nextDialogueIndex: 41 } } // 생각 중
//             ]
//         },
//         // --- 카페 동행 거절 경로 (nextDialogueIndex: 30) ---
//         // 30
//         { speaker: CHARACTER_NAME, text: "아, 그러시군요. 아쉽지만 어쩔 수 없죠. 다음에 기회가 되면 꼭 만나요." }, // ✨ 주석: 이전에는 쉼표가 누락되었을 수 있습니다.
//         { speaker: "나", text: "네, 다음에 꼭! (엘라의 표정에서 아쉬움이 묻어나는 것 같다...)" }, // 독백 - 엘라 안 보임
//         { speaker: "", text: "엘라와의 짧은 만남이 끝났다. 왠지 모를 아쉬움이 남는다..." }, // 나레이션 - 엘라 안 보임
//         { speaker: "", text: "시간이 흘러..." }, // 나레이션 - 엘라 안 보임
//         // ✨ 수정: dialogueScript.length 대신 undefined를 임시로 사용하고, 나중에 실제 값으로 업데이트
//         { speaker: "", text: "대화 종료.", autoEffect: { nextDialogueIndex: undefined } }, // 엔딩으로 직행 (수정됨)
//         // --- 전시회 거절 / 카페에서 헤어짐 경로 (nextDialogueIndex: 35) ---
//         // 35
//         { speaker: CHARACTER_NAME, text: "아, 그러시군요. 알겠습니다. 그럼 다음에 기회가 되면..." }, // ✨ 주석: 이전에는 쉼표가 누락되었을 수 있습니다.
//         { speaker: "나", text: "(엘라의 표정이 조금 어두워진 것 같다.) 네, 오늘 즐거웠어요." }, // 독백 - 엘라 안 보임
//         { speaker: "", text: "엘라와의 만남이 아쉽게 마무리되었다. 다음을 기약할 수 있을까..." }, // 나레이션 - 엘라 안 보임
//         { speaker: "", text: "시간이 흘러..." }, // 나레이션 - 엘라 안 보임
//         // ✨ 수정: dialogueScript.length 대신 undefined를 임시로 사용하고, 나중에 실제 값으로 업데이트
//         { speaker: "", text: "대화 종료.", autoEffect: { nextDialogueIndex: undefined } }, // 엔딩으로 직행 (수정됨)
//         // --- 최종 엔딩 분기 (nextDialogueIndex: 40) ---
//         // 40: 연락처 교환
//         { speaker: CHARACTER_NAME, text: "네! 좋아요! 제 연락처 여기 있어요. 조만간 다시 만나요, [플레이어 이름]님!" }, // ✨ 주석: 이전에는 쉼표가 누락되었을 수 있습니다.
//         { speaker: "나", text: "네, 엘라 씨! 조심히 가세요. (설레는 마음으로 연락처를 저장한다.)" },
//         // ✨ 수정: dialogueScript.length 대신 undefined를 임시로 사용하고, 나중에 실제 값으로 업데이트
//         { speaker: "", text: "아름다운 만남의 시작을 예감하며...", autoEffect: { nextDialogueIndex: undefined } }, // 엔딩으로 직행 (수정됨)
//         // 41: 생각 중
//         { speaker: CHARACTER_NAME, text: "아... 네, 알겠습니다. 오늘 즐거웠어요. 그럼 이만..." }, // ✨ 주석: 이전에는 쉼표가 누락되었을 수 있습니다.
//         { speaker: "나", text: "(엘라가 약간 서운한 표정으로 뒤돌아섰다. 너무 신중했던 걸까...)" },
//         // ✨ 수정: dialogueScript.length 대신 undefined를 임시로 사용하고, 나중에 실제 값으로 업데이트
//         { speaker: "", text: "엘라와의 관계는 어떻게 될까? 미래는 아직 미지수이다...", autoEffect: { nextDialogueIndex: undefined } } // 엔딩으로 직행 (수정됨)
//     ]
// );
// // ✨ 추가: dialogueScript가 완전히 정의된 후, nextDialogueIndex 값을 dialogueScript.length로 업데이트
// dialogueScript[34].autoEffect!.nextDialogueIndex = dialogueScript.length;
// dialogueScript[39].autoEffect!.nextDialogueIndex = dialogueScript.length;
// dialogueScript[42].autoEffect!.nextDialogueIndex = dialogueScript.length;
// dialogueScript[45].autoEffect!.nextDialogueIndex = dialogueScript.length;
// // ====== 헬퍼 함수 ======
// // 텍스트 줄바꿈 처리
// function wrapText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
//     const words = text.split(' ');
//     let line = '';
//     let testLine = '';
//     let metrics;
//     let testWidth;
//     for (let n = 0; n < words.length; n++) {
//         testLine = line + words[n] + ' ';
//         metrics = context.measureText(testLine);
//         testWidth = metrics.width;
//         if (testWidth > maxWidth && n > 0) {
//             context.fillText(line, x, y);
//             line = words[n] + ' ';
//             y += lineHeight;
//         } else {
//             line = testLine;
//         }
//     }
//     context.fillText(line, x, y);
//     return y; // 마지막 줄의 Y 좌표 반환
// }
// // 버튼 그리기
// function drawButton(context: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, height: number, backgroundColor: string = '#4CAF50', textColor: string = 'white') {
//     context.fillStyle = backgroundColor;
//     context.fillRect(x, y, width, height);
//     context.strokeStyle = '#333';
//     context.lineWidth = 2;
//     context.strokeRect(x, y, width, height);
//     context.fillStyle = textColor;
//     context.font = '18px Arial';
//     context.textAlign = 'center';
//     context.textBaseline = 'middle';
//     context.fillText(text, x + width / 2, y + height / 2);
// }
// // 클릭이 버튼 영역 안에 있는지 확인
// function isClickInside(clickX: number, clickY: number, elementX: number, elementY: number, elementWidth: number, elementHeight: number): boolean {
//     return clickX >= elementX && clickX <= elementX + elementWidth &&
//            clickY >= elementY && clickY <= elementY + elementHeight;
// }
// // 배경 이미지를 그리거나 로딩 중일 때 대체 배경을 그리는 헬퍼 함수
// function drawBackgroundImage() {
//     if (isBackgroundLoaded) {
//         ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
//     } else {
//         // 이미지가 로드되지 않았을 경우 기본 배경색 사용
//         ctx.fillStyle = '#ADD8E6'; // 연한 파란색 배경 (기존 시작 화면 색상)
//         ctx.fillRect(0, 0, canvas.width, canvas.height);
//         ctx.fillStyle = 'white';
//         ctx.font = '24px Arial';
//         ctx.textAlign = 'center';
//         ctx.textBaseline = 'middle';
//         ctx.fillText('Loading background...', canvas.width / 2, canvas.height / 2);
//     }
// }
// // ====== 그리기 함수 ======
// function drawStartScreen() {
//     ctx.clearRect(0, 0, canvas.width, canvas.height);
//     drawBackgroundImage(); // 배경 이미지 그리기
//     ctx.fillStyle = 'white';
//     ctx.font = '40px Arial';
//     ctx.textAlign = 'center';
//     ctx.textBaseline = 'middle';
//     ctx.fillText('간단 연애 시뮬레이션', canvas.width / 2, canvas.height / 2 - 50);
//     ctx.font = '24px Arial';
//     ctx.fillText('클릭하여 시작', canvas.width / 2, canvas.height / 2 + 30);
// }
// function drawDialogueScreen() {
//     ctx.clearRect(0, 0, canvas.width, canvas.height);
//     drawBackgroundImage(); // 배경 이미지 그리기
//     const currentLine = dialogueScript[currentDialogueIndex];
//     if (!currentLine) { // 스크립트 인덱스가 유효 범위를 벗어났을 경우 (안전 장치)
//         currentGameState = GameState.ENDING;
//         drawEndingScreen();
//         return;
//     }
//     // 여주인공 이미지 그리기 로직 수정 ✨
//     // 플레이어가 엘라와 함께 있는 동안(대화 중이거나 같은 장면에 있을 때) 엘라를 계속 표시하되,
//     // 나레이션이거나 플레이어의 독백으로 엘라가 명백히 부재할 때는 표시하지 않음.
//     const shouldShowGirl = isGirlImageLoaded &&
//                            currentLine.speaker !== "" && // 나레이션일 때는 엘라를 표시하지 않음
//                            !PLAYER_MONOLOGUES_WHERE_ELLA_IS_ABSENT.has(currentDialogueIndex); // 특정 독백 인덱스일 때도 표시하지 않음
//     if (shouldShowGirl) {
//         // 이미지 크기 및 위치 조정 (예시: 화면의 오른쪽 아래, 대화 상자 위)
//         const girlImageWidth = 350; // 이미지 너비
//         const girlImageHeight = 450; // 이미지 높이
//         const girlImageX = canvas.width - girlImageWidth - 50; // 오른쪽에서 50px 여백
//         const girlImageY = canvas.height - girlImageHeight; // 바닥에 맞춰서 배치
//         ctx.drawImage(girlImage, girlImageX, girlImageY, girlImageWidth, girlImageHeight);
//     }
//     // 대화 상자 배경
//     ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
//     ctx.fillRect(50, canvas.height - 200, canvas.width - 100, 150);
//     ctx.strokeStyle = '#333';
//     ctx.lineWidth = 2;
//     ctx.strokeRect(50, canvas.height - 200, canvas.width - 100, 150);
//     // 캐릭터 이름 표시
//     ctx.fillStyle = '#333';
//     ctx.font = '24px Arial';
//     ctx.textAlign = 'left';
//     ctx.textBaseline = 'top';
//     ctx.fillText(currentLine.speaker + ':', 60, canvas.height - 190);
//     // 대사 표시 ✨: [플레이어 이름]을 실제 플레이어 이름으로 대체
//     ctx.fillStyle = '#333';
//     ctx.font = '20px Arial';
//     const displayedText = currentLine.text.replace(/\[플레이어 이름\]/g, playerName); // ✨ 수정된 부분
//     wrapText(ctx, displayedText, 60, canvas.height - 150, canvas.width - 120, 25);
//     // 다음 대사 진행 안내
//     if (!currentLine.choices) {
//         ctx.fillStyle = 'rgba(0,0,0,0.5)';
//         ctx.font = '16px Arial';
//         ctx.textAlign = 'right';
//         ctx.fillText('클릭하여 진행 ▶', canvas.width - 70, canvas.height - 30);
//     }
// }
// function drawChoiceScreen() {
//     drawDialogueScreen(); // 대화 배경과 현재 대사는 계속 표시
//     const currentLine = dialogueScript[currentDialogueIndex];
//     if (currentLine && currentLine.choices) {
//         let buttonY = canvas.height - 280 - (currentLine.choices.length - 1) * 60; // 버튼이 아래로 쌓이도록
//         const buttonWidth = canvas.width - 200;
//         const buttonHeight = 50;
//         const buttonX = 100;
//         const buttonSpacing = 10;
//         currentLine.choices.forEach((choice, index) => {
//             drawButton(ctx, choice.text, buttonX, buttonY, buttonWidth, buttonHeight, '#6495ED'); // 파란색 버튼
//             buttonY += buttonHeight + buttonSpacing;
//         });
//     }
// }
// function drawEndingScreen() {
//     ctx.clearRect(0, 0, canvas.width, canvas.height);
//     drawBackgroundImage(); // 배경 이미지 그리기
//     ctx.fillStyle = 'white';
//     ctx.font = '36px Arial';
//     ctx.textAlign = 'center';
//     ctx.textBaseline = 'middle';
//     let endingText = "";
//     if (playerAffection >= 40) { // 호감도 기준 상향 조정
//         endingText = `${playerName}님, 엘라와 아름다운 인연을 시작했습니다!`;
//     } else if (playerAffection >= 10) { // 호감도 기준 조정
//         endingText = `${playerName}님, 엘라와 평범하지만 기분 좋은 만남을 가졌습니다.`;
//     } else {
//         endingText = `${playerName}님, 엘라와의 관계가 아쉽게 마무리되었습니다...`;
//     }
//     ctx.fillText(endingText, canvas.width / 2, canvas.height / 2 - 50);
//     ctx.font = '24px Arial';
//     ctx.fillText(`엘라의 호감도: ${playerAffection}`, canvas.width / 2, canvas.height / 2);
//     ctx.fillText('클릭하여 다시 시작', canvas.width / 2, canvas.height / 2 + 50);
// }
// // ====== 게임 루프 및 이벤트 핸들러 ======
// function updateAndDraw() {
//     switch (currentGameState) {
//         case GameState.START_SCREEN:
//             drawStartScreen();
//             break;
//         case GameState.DIALOGUE:
//             drawDialogueScreen();
//             break;
//         case GameState.CHOICE:
//             drawChoiceScreen();
//             break;
//         case GameState.ENDING:
//             drawEndingScreen();
//             break;
//     }
// }
// function handleClick(event: MouseEvent) {
//     const rect = canvas.getBoundingClientRect();
//     const clickX = event.clientX - rect.left;
//     const clickY = event.clientY - rect.top;
//     switch (currentGameState) {
//         case GameState.START_SCREEN: // ✨ 수정된 부분: 이름 입력 로직 추가
//             const inputName = prompt("당신의 이름을 입력해주세요:", "플레이어");
//             if (inputName !== null && inputName.trim() !== "") {
//                 playerName = inputName.trim();
//             } else {
//                 playerName = "모험가"; // 이름이 입력되지 않았을 경우 기본값
//             }
//             currentGameState = GameState.DIALOGUE;
//             currentDialogueIndex = 0;
//             playerAffection = 0;
//             break;
//         case GameState.DIALOGUE:
//             const currentLine = dialogueScript[currentDialogueIndex];
//             if (!currentLine) { // 스크립트가 끝났을 경우 처리 (안전 장치)
//                 currentGameState = GameState.ENDING;
//                 break;
//             }
//             if (currentLine.choices) {
//                 // 선택지가 있는 대화 상태에서는 클릭으로 진행하지 않고 선택지를 기다림
//                 currentGameState = GameState.CHOICE;
//             } else {
//                 // ✨ 수정: autoEffect 처리 로직 추가
//                 if (currentLine.autoEffect) {
//                     if (currentLine.autoEffect.affectionChange !== undefined) {
//                         playerAffection += currentLine.autoEffect.affectionChange;
//                     }
//                     if (currentLine.autoEffect.nextDialogueIndex !== undefined) {
//                         currentDialogueIndex = currentLine.autoEffect.nextDialogueIndex;
//                     } else {
//                         currentDialogueIndex++; // autoEffect가 nextDialogueIndex를 명시하지 않으면 순차 진행
//                     }
//                 } else {
//                     currentDialogueIndex++; // 일반적인 순차 진행
//                 }
//                 // 다음 대화 인덱스가 스크립트 길이를 넘어서면 엔딩으로 전환
//                 if (currentDialogueIndex >= dialogueScript.length) {
//                     currentGameState = GameState.ENDING;
//                 }
//             }
//             break;
//         case GameState.CHOICE:
//             // 선택지 클릭 처리
//             const dialogue = dialogueScript[currentDialogueIndex];
//             if (dialogue && dialogue.choices) {
//                 let buttonY = canvas.height - 280 - (dialogue.choices.length - 1) * 60;
//                 const buttonWidth = canvas.width - 200;
//                 const buttonHeight = 50;
//                 const buttonX = 100;
//                 const buttonSpacing = 10;
//                 for (let i = 0; i < dialogue.choices.length; i++) {
//                     if (isClickInside(clickX, clickY, buttonX, buttonY, buttonWidth, buttonHeight)) {
//                         const choice = dialogue.choices[i];
//                         playerAffection += choice.effect.affectionChange;
//                         currentDialogueIndex = choice.effect.nextDialogueIndex;
//                         currentGameState = GameState.DIALOGUE; // 선택 후 다시 대화 상태로
//                         break;
//                     }
//                     buttonY += buttonHeight + buttonSpacing;
//                 }
//             } else {
//                 // 실수로 CHOICE 상태인데 선택지가 없으면 그냥 대화로 돌려보냄
//                 currentGameState = GameState.DIALOGUE;
//             }
//             break;
//         case GameState.ENDING:
//             currentGameState = GameState.START_SCREEN; // 다시 시작 화면으로
//             break;
//     }
//     updateAndDraw(); // 상태 변경 후 즉시 화면 업데이트
// }
// // 이벤트 리스너 등록
// canvas.addEventListener('click', handleClick);
// // 초기 화면 그리기
// updateAndDraw();