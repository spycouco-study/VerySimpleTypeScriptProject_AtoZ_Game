"use strict";
// 생성된 TypeScript 코드를 이곳에 넣으세요. 이 코드는 game.ts에 저장될 예정입니다.
// Constants for game parameters
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
// Kart constants
const KART_WIDTH = 20;
const KART_HEIGHT = 30;
const KART_MAX_SPEED = 200; // pixels per second
const KART_REVERSE_MAX_SPEED = 100; // pixels per second for reverse
const KART_ACCELERATION = 150; // pixels per second^2
const KART_DRAG = 0.95; // Multiplier per second for speed decay
const KART_ROTATION_SPEED = 3.5; // radians per second
// Colors
const COLOR_KART = "#FF0000"; // Red
const COLOR_TRACK_INNER = "#333333"; // Dark gray
const COLOR_TRACK_OUTER = "#666666"; // Gray
const COLOR_GRASS = "#00AA00"; // Green
const COLOR_CHECKPOINT = "#0000FF"; // Blue for midpoint line
/**
 * 두 선분(P1-P2와 P3-P4)이 교차하는지 확인하는 헬퍼 함수.
 * @param p1x 첫 번째 선분의 시작점 x
 * @param p1y 첫 번째 선분의 시작점 y
 * @param p2x 첫 번째 선분의 끝점 x
 * @param p2y 첫 번째 선분의 끝점 y
 * @param p3x 두 번째 선분의 시작점 x
 * @param p3y 두 번째 선분의 시작점 y
 * @param p4x 두 번째 선분의 끝점 x
 * @param p4y 두 번째 선분의 끝점 y
 * @returns 선분이 교차하면 true, 아니면 false
 */
function segmentsIntersect(p1x, p1y, p2x, p2y, // Segment 1
p3x, p3y, p4x, p4y // Segment 2
) {
    const den = (p1x - p2x) * (p3y - p4y) - (p1y - p2y) * (p3x - p4x);
    if (den === 0) {
        return false; // Lines are parallel or collinear
    }
    const t = ((p1x - p3x) * (p3y - p4y) - (p1y - p3y) * (p3x - p4x)) / den;
    const u = -((p1x - p2x) * (p1y - p3y) - (p1y - p2y) * (p1x - p3x)) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
/**
 * 점(px, py)에서 선분(x1, y1)-(x2, y2)까지의 최단 거리를 반환하는 헬퍼 함수.
 * @param px 점의 x 좌표
 * @param py 점의 y 좌표
 * @param x1 선분의 시작점 x
 * @param y1 선분의 시작점 y
 * @param x2 선분의 끝점 x
 * @param y2 선분의 끝점 y
 * @returns 점과 선분 사이의 최단 거리
 */
function distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0)
        return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1)); // 선분이 점인 경우
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t)); // t를 0과 1 사이로 클램프하여 선분 내의 가장 가까운 점을 찾음
    const closestX = x1 + t * (x2 - x1);
    const closestY = y1 + t * (y2 - y1);
    return Math.sqrt((px - closestX) * (px - closestX) + (py - closestY) * (py - closestY));
}
/**
 * 플레이어가 조종하는 카트를 나타내는 클래스.
 */
class Kart {
    constructor(startX, startY, startAngle) {
        this.x = startX;
        this.y = startY;
        this.prevX = startX; // 초기 prevX, prevY 설정
        this.prevY = startY;
        this.angle = startAngle;
        this.speed = 0;
        this.isAccelerating = false;
        this.isBraking = false;
        this.isTurningLeft = false;
        this.isTurningRight = false;
    }
    /**
     * 카트의 상태를 업데이트합니다.
     * @param deltaTime 이전 프레임 이후 경과한 시간 (초)
     */
    update(deltaTime) {
        // 현재 위치를 이전 위치로 저장
        this.prevX = this.x;
        this.prevY = this.y;
        // 회전 적용
        if (this.isTurningLeft) {
            this.angle -= KART_ROTATION_SPEED * deltaTime;
        }
        if (this.isTurningRight) {
            this.angle += KART_ROTATION_SPEED * deltaTime;
        }
        // 가속/감속 적용
        if (this.isAccelerating) {
            this.speed += KART_ACCELERATION * deltaTime;
        }
        else if (this.isBraking) {
            // 's' 키는 속도에 따라 제동 또는 후진 가속으로 작동
            if (this.speed > 0) {
                this.speed -= KART_ACCELERATION * deltaTime * 1.5; // 전진 중에는 제동
                this.speed = Math.max(0, this.speed); // 속도가 0 미만으로 내려가지 않도록
            }
            else {
                this.speed -= KART_ACCELERATION * deltaTime; // 후진 중에는 후진 가속
                this.speed = Math.max(-KART_REVERSE_MAX_SPEED, this.speed); // 최대 후진 속도 제한
            }
        }
        // 마찰에 의한 속도 감쇠 적용
        this.speed *= Math.pow(KART_DRAG, deltaTime);
        // 속도 제한 (최소 후진 속도, 최대 전진 속도)
        this.speed = Math.max(-KART_REVERSE_MAX_SPEED, Math.min(this.speed, KART_MAX_SPEED));
        // 현재 속도와 방향에 따라 위치 업데이트
        this.x += Math.cos(this.angle) * this.speed * deltaTime;
        this.y += Math.sin(this.angle) * this.speed * deltaTime;
        // 게임 화면 경계 내에 카트를 유지 (간단한 경계 체크)
        this.x = Math.max(0, Math.min(this.x, GAME_WIDTH));
        this.y = Math.max(0, Math.min(this.y, GAME_HEIGHT));
    }
    /**
     * 캔버스에 카트를 그립니다.
     * @param ctx 캔버스 2D 렌더링 컨텍스트
     */
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        // 카트의 기본 방향이 아래를 향한다고 가정하고, 현재 각도에 따라 회전합니다.
        // angle=0일 때 오른쪽으로 움직이므로, 아래를 보는 스프라이트를 오른쪽으로 돌리려면 PI/2를 더합니다.
        ctx.rotate(this.angle + Math.PI / 2);
        ctx.fillStyle = COLOR_KART;
        ctx.fillRect(-KART_WIDTH / 2, -KART_HEIGHT / 2, KART_WIDTH, KART_HEIGHT);
        // 카트의 전방 방향을 나타내는 '헤드라이트'를 그립니다.
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(-KART_WIDTH / 4, KART_HEIGHT / 2 - 5, KART_WIDTH / 2, 5);
        ctx.restore();
    }
}
/**
 * 게임의 전반적인 로직을 관리하는 메인 클래스.
 */
class Game {
    constructor(canvasId, trackData) {
        this.lastTime = 0; // 마지막 프레임 시간
        this.currentLap = 0; // 현재 진행 중인 랩
        this.totalLaps = 3; // 총 랩 수: 사용자 요청에 따라 3바퀴로 설정됩니다.
        this.isGameOver = false; // 게임 종료 여부
        this.lapCooldown = 2000; // 랩 중복 카운팅 방지를 위한 쿨다운 (ms)
        // 랩 인정 강화를 위한 상태 변수
        this.hasCrossedFinishLineOnce = false; // 랩 시작 시 결승선을 한 번 통과했는지
        this.hasCrossedMidpoint = false; // 결승선 통과 후 중간 지점을 통과했는지
        this.lastLapCompletedTime = 0; // 마지막으로 랩이 인정된 시간
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            throw new Error(`Canvas with ID '${canvasId}' not found.`);
        }
        this.ctx = this.canvas.getContext("2d");
        this.canvas.width = GAME_WIDTH;
        this.canvas.height = GAME_HEIGHT;
        this.trackConfig = trackData;
        // 트랙의 첫 번째 경로 지점에서 카트를 초기화합니다.
        this.playerKart = new Kart(this.trackConfig.path[0].x, this.trackConfig.path[0].y, this.trackConfig.startAngle);
        // 이벤트 핸들러의 `this` 컨텍스트를 바인딩합니다.
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.gameLoop = this.gameLoop.bind(this);
    }
    /**
     * 게임을 초기화하고 시작합니다.
     * 키보드 이벤트 리스너를 설정하고 게임 루프를 시작합니다.
     */
    init() {
        document.addEventListener("keydown", this.handleKeyDown);
        document.addEventListener("keyup", this.handleKeyUp);
        this.gameLoop(0); // 게임 루프 시작
    }
    /**
     * 키보드 눌림 이벤트를 처리합니다. (w, s, a, d 키만 사용)
     */
    handleKeyDown(event) {
        if (this.isGameOver)
            return; // 게임 오버시 입력 무시
        switch (event.key) {
            case "w":
                this.playerKart.isAccelerating = true;
                break;
            case "s":
                this.playerKart.isBraking = true;
                break;
            case "a":
                this.playerKart.isTurningLeft = true;
                break;
            case "d":
                this.playerKart.isTurningRight = true;
                break;
        }
    }
    /**
     * 키보드 떼어짐 이벤트를 처리합니다. (w, s, a, d 키만 사용)
     */
    handleKeyUp(event) {
        if (this.isGameOver)
            return; // 게임 오버시 입력 무시
        switch (event.key) {
            case "w":
                this.playerKart.isAccelerating = false;
                break;
            case "s":
                this.playerKart.isBraking = false;
                break;
            case "a":
                this.playerKart.isTurningLeft = false;
                break;
            case "d":
                this.playerKart.isTurningRight = false;
                break;
        }
    }
    /**
     * 게임 로직을 업데이트합니다.
     * @param deltaTime 이전 프레임 이후 경과한 시간 (초)
     */
    update(deltaTime) {
        if (this.isGameOver) {
            return; // 게임이 종료되면 업데이트 중지
        }
        this.playerKart.update(deltaTime);
        this.checkTrackBoundaries(); // 트랙 이탈 확인
        this.checkLapCompletion(); // 랩 완료 확인
    }
    /**
     * 카트가 트랙 안에 있는지 확인하고, 트랙 밖이면 제자리로 돌려놓습니다.
     */
    checkTrackBoundaries() {
        if (!this.isPointOnTrack(this.playerKart.x, this.playerKart.y)) {
            // 트랙 밖으로 나갔으면 이전 위치로 되돌리고 속도 0으로 설정
            this.playerKart.x = this.playerKart.prevX;
            this.playerKart.y = this.playerKart.prevY;
            this.playerKart.speed = 0;
        }
    }
    /**
     * 주어진 점이 트랙 내부에 있는지 확인합니다.
     * 트랙의 중앙선과 트랙 너비를 기준으로 판단합니다.
     */
    isPointOnTrack(px, py) {
        const path = this.trackConfig.path;
        const trackWidth = this.trackConfig.width;
        const trackRadius = trackWidth / 2; // 중앙선에서 트랙 가장자리까지의 거리
        // 각 트랙 경로 세그먼트에 대해 카트와의 거리 확인
        for (let i = 0; i < path.length; i++) {
            const p1 = path[i];
            const p2 = path[(i + 1) % path.length]; // 닫힌 루프를 위해 마지막 점과 첫 점을 연결
            const d = distToSegment(px, py, p1.x, p1.y, p2.x, p2.y);
            if (d <= trackRadius) {
                return true; // 트랙 세그먼트 중 하나에 충분히 가까우면 트랙 위로 간주
            }
        }
        return false;
    }
    /**
     * 랩 완료 여부를 확인하고 처리합니다.
     * 결승선 -> 중간 지점 -> 결승선 순서로 통과해야 랩으로 인정됩니다.
     */
    checkLapCompletion() {
        const kart = this.playerKart;
        const finishLine = this.trackConfig.finishLine;
        const midpointLine = this.trackConfig.midpointLine;
        const currentTime = performance.now(); // 밀리초 단위 현재 시간
        // 카트의 이동 경로와 결승선/중간 지점 선분이 교차하는지 확인
        const crossedFinishLine = segmentsIntersect(kart.prevX, kart.prevY, kart.x, kart.y, finishLine.x1, finishLine.y1, finishLine.x2, finishLine.y2);
        const crossedMidpoint = segmentsIntersect(kart.prevX, kart.prevY, kart.x, kart.y, midpointLine.x1, midpointLine.y1, midpointLine.x2, midpointLine.y2);
        if (crossedFinishLine) {
            // 결승선을 처음 통과하는 경우 (랩 시작)
            if (!this.hasCrossedFinishLineOnce && !this.hasCrossedMidpoint) {
                this.hasCrossedFinishLineOnce = true;
                // console.log("Finish line crossed - Start of lap sequence.");
            }
            // 랩을 완료하고 결승선을 다시 통과하는 경우
            else if (this.hasCrossedFinishLineOnce && this.hasCrossedMidpoint) {
                // 랩 쿨다운 시간을 적용하여 너무 빠르게 여러 번 카운트되는 것을 방지
                if (currentTime - this.lastLapCompletedTime > this.lapCooldown) {
                    this.currentLap++;
                    this.lastLapCompletedTime = currentTime;
                    // console.log(`Lap ${this.currentLap} completed!`);
                    if (this.currentLap >= this.totalLaps) {
                        this.isGameOver = true;
                        console.log("Game Over! You completed all laps.");
                    }
                }
                // 중요 수정: 랩 카운트 여부(쿨다운)와 관계없이 다음 랩 트래킹을 위해 상태 초기화
                // 이전에 쿨다운으로 인해 랩이 카운트되지 않았을 경우,
                // 플래그가 true로 남아있어 다음 랩의 시작 조건을 만족하지 못하는 문제를 해결합니다.
                this.hasCrossedFinishLineOnce = false;
                this.hasCrossedMidpoint = false;
            }
            // 그 외의 결승선 통과 (예: 뒤로 통과, 이미 통과 상태인데 다시 통과 등)는 무시하거나 상태를 리셋
            // 또는 쿨다운 중 중복 통과 방지를 위해 상태 유지
        }
        if (crossedMidpoint) {
            // 결승선 통과 후 중간 지점을 통과한 경우
            if (this.hasCrossedFinishLineOnce && !this.hasCrossedMidpoint) {
                this.hasCrossedMidpoint = true;
                // console.log("Midpoint crossed - Ready to complete lap.");
            }
        }
    }
    /**
     * 게임 트랙을 캔버스에 그립니다.
     */
    drawTrack() {
        const ctx = this.ctx;
        const path = this.trackConfig.path;
        const trackWidth = this.trackConfig.width;
        const finishLine = this.trackConfig.finishLine;
        const midpointLine = this.trackConfig.midpointLine;
        // 잔디 배경 그리기
        ctx.fillStyle = COLOR_GRASS;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        // 트랙의 외부 경계 그리기
        ctx.beginPath();
        ctx.strokeStyle = COLOR_TRACK_OUTER;
        ctx.lineWidth = trackWidth;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.lineTo(path[0].x, path[0].y); // 트랙이 닫힌 루프일 경우 시작점으로 다시 연결
        ctx.stroke();
        // 트랙의 내부 도로(중앙 부분) 그리기
        ctx.beginPath();
        ctx.strokeStyle = COLOR_TRACK_INNER;
        ctx.lineWidth = trackWidth * 0.7; // 외부보다 약간 좁은 폭
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.lineTo(path[0].x, path[0].y); // 트랙이 닫힌 루프일 경우 시작점으로 다시 연결
        ctx.stroke();
        // 골인 지점 그리기 (검은색 테두리, 흰색 내부 선)
        ctx.lineWidth = 7; // 테두리 두께
        ctx.strokeStyle = "#000000"; // 검은색 테두리
        ctx.beginPath();
        ctx.moveTo(finishLine.x1, finishLine.y1);
        ctx.lineTo(finishLine.x2, finishLine.y2);
        ctx.stroke();
        ctx.lineWidth = 3; // 내부 선 두께
        ctx.strokeStyle = "#FFFFFF"; // 흰색 내부 선
        ctx.beginPath();
        ctx.moveTo(finishLine.x1, finishLine.y1);
        ctx.lineTo(finishLine.x2, finishLine.y2);
        ctx.stroke();
        // 중간 지점 선 그리기 (파란색)
        ctx.lineWidth = 3;
        ctx.strokeStyle = COLOR_CHECKPOINT;
        ctx.beginPath();
        ctx.moveTo(midpointLine.x1, midpointLine.y1);
        ctx.lineTo(midpointLine.x2, midpointLine.y2);
        ctx.stroke();
    }
    /**
     * 캔버스에 모든 게임 요소를 그립니다.
     */
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); // 캔버스 지우기
        this.drawTrack(); // 트랙 그리기
        this.playerKart.draw(this.ctx); // 플레이어 카트 그리기
        // HUD (Head-Up Display) 요소 그리기
        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.font = "24px Arial";
        this.ctx.textAlign = "left";
        this.ctx.fillText(`Lap: ${this.currentLap} / ${this.totalLaps}`, 10, 30);
        this.ctx.fillText(`Speed: ${this.playerKart.speed.toFixed(0)}`, 10, 60);
        // 게임 오버 메시지 표시
        if (this.isGameOver) {
            this.ctx.textAlign = "center";
            this.ctx.font = "48px Arial";
            this.ctx.fillText("GAME OVER!", GAME_WIDTH / 2, GAME_HEIGHT / 2);
            this.ctx.font = "30px Arial";
            this.ctx.fillText("Press F5 to Restart", GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50);
        }
    }
    /**
     * 게임의 메인 루프입니다.
     * @param timestamp 현재 시간 (DOMHighResTimeStamp)
     */
    gameLoop(timestamp) {
        const deltaTime = (timestamp - this.lastTime) / 1000; // ms를 초 단위로 변환
        this.lastTime = timestamp;
        this.update(deltaTime);
        this.draw();
        if (!this.isGameOver) {
            requestAnimationFrame(this.gameLoop); // 게임 오버가 아니면 다음 프레임 요청
        }
    }
}
// DOM이 완전히 로드된 후에 게임을 초기화합니다.
document.addEventListener("DOMContentLoaded", () => {
    // data.json이 로드되지 않았을 경우를 대비한 기본 트랙 설정.
    // 이 예제에서는 data.json 파일이 로드되어 `trackData` 변수에 할당된다고 가정합니다.
    const defaultTrackData = {
        width: 100, // 트랙 폭
        path: [
            { "x": 300, "y": 100 },
            { "x": 500, "y": 100 },
            { "x": 500, "y": 250 },
            { "x": 300, "y": 250 },
            { "x": 300, "y": 400 },
            { "x": 500, "y": 400 },
            { "x": 500, "y": 250 },
            { "x": 300, "y": 250 },
            { "x": 300, "y": 100 }
        ],
        startAngle: 0, // 카트 시작 방향 (오른쪽)
        finishLine: { x1: 400, y1: 50, x2: 400, y2: 150 }, // 트랙 상단 중앙의 결승선
        midpointLine: { x1: 400, y1: 350, x2: 400, y2: 450 } // 트랙 하단 중앙의 중간 지점
    };
    // `trackData`가 정의되어 있다면 해당 데이터를 사용하고, 아니면 `defaultTrackData`를 사용합니다.
    const currentTrackData = typeof trackData !== 'undefined' ? trackData : defaultTrackData;
    const game = new Game("gameCanvas", currentTrackData);
    game.init();
});
