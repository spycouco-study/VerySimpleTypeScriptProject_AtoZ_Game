class Game {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    /**
     * Game 클래스의 생성자입니다.
     * 지정된 ID의 캔버스 요소를 찾고 2D 렌더링 컨텍스트를 초기화합니다.
     * @param canvasId 캔버스 요소의 ID 문자열.
     */
    constructor(canvasId: string) {
        // 캔버스 요소를 가져옵니다. TypeScript에게 HTMLCanvasElement임을 알립니다.
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        // 캔버스 요소가 없으면 에러를 발생시킵니다.
        if (!this.canvas) {
            throw new Error(`Canvas element with ID '${canvasId}' not found.`);
        }
        // 2D 렌더링 컨텍스트를 가져옵니다.
        // '!' (non-null assertion operator)는 개발자가 이 값이 null이 아님을 확신할 때 사용합니다.
        // 실제 애플리케이션에서는 null 체크를 하는 것이 더 안전할 수 있습니다.
        this.ctx = this.canvas.getContext('2d')!;
        // 2D 컨텍스트를 지원하지 않으면 에러를 발생시킵니다.
        if (!this.ctx) {
            throw new Error("2D rendering context not supported by your browser.");
        }
        // 캔버스 크기를 설정합니다. HTML에서 width/height 속성으로 설정할 수도 있습니다.
        this.canvas.width = 800;
        this.canvas.height = 600;
    }
    /**
     * 게임을 시작합니다.
     * 이 예제에서는 텍스트를 한 번 그리는 것으로 충분합니다.
     * 실제 게임에서는 여기에 게임 루프(`requestAnimationFrame`)를 시작하는 로직이 들어갈 것입니다.
     */
    public start(): void {
        console.log("Game started! Drawing '안녕하세요!' on canvas.");
        this.draw(); // 캔버스에 내용을 그립니다.
    }
    /**
     * 캔버스에 게임 요소를 그립니다.
     * 이 예제에서는 "안녕하세요!" 텍스트를 캔버스 중앙에 그립니다.
     */
    private draw(): void {
        // 캔버스 전체를 지워서 이전에 그려진 내용을 제거합니다.
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // 텍스트의 폰트 스타일을 설정합니다.
        // 'Noto Sans KR'은 한글 지원이 좋은 폰트이며, 없으면 일반 sans-serif 폰트를 사용합니다.
        this.ctx.font = '48px Noto Sans KR, sans-serif';
        // 텍스트 색상을 흰색으로 설정합니다.
        this.ctx.fillStyle = 'white';
        // 텍스트를 수평 중앙으로 정렬합니다.
        this.ctx.textAlign = 'center';
        // 텍스트를 수직 중앙으로 정렬합니다.
        this.ctx.textBaseline = 'middle';
        const text = '안녕하세요!';
        // 캔버스 중앙 좌표를 계산합니다.
        const x = this.canvas.width / 2;
        const y = this.canvas.height / 2;
        // 텍스트를 캔버스 중앙에 그립니다.
        this.ctx.fillText(text, x, y);
    }
    // 실제 게임에서는 다음과 같은 게임 루프가 있을 수 있습니다:
    /*
    private update(): void {
        // 게임 상태 업데이트 로직 (예: 캐릭터 이동, 점수 계산 등)
    }
    private gameLoop = () => { // `this` 컨텍스트 유지를 위해 화살표 함수 사용
        this.update();
        this.draw();
        requestAnimationFrame(this.gameLoop); // 다음 프레임에 다시 호출
    }
    public startContinuousLoop(): void {
        requestAnimationFrame(this.gameLoop); // 게임 루프 시작
    }
    */
}
// DOM이 완전히 로드된 후에 게임을 초기화하고 시작합니다.
document.addEventListener('DOMContentLoaded', () => {
    try {
        const game = new Game('gameCanvas'); // 'gameCanvas' ID를 가진 캔버스로 게임 인스턴스 생성
        game.start(); // 게임 시작 (이 경우 텍스트를 한 번 그림)
    } catch (error: any) {
        console.error("게임 초기화 실패:", error.message);
        // 사용자에게 오류 메시지를 표시할 수도 있습니다.
        const body = document.querySelector('body');
        if (body) {
            body.innerHTML = `<p style="color: red; text-align: center; font-size: 20px;">오류: ${error.message}<br>캔버스 요소를 찾을 수 없거나 브라우저가 2D 렌더링을 지원하지 않습니다.</p>`;
        }
    }
});