class GameObject {
    x: number;
    y: number;
    width: number;
    height: number;
    image: HTMLImageElement;
    speed: number;

    constructor(x: number, y: number, width: number, height: number, image: HTMLImageElement, speed: number = 0) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.image = image;
        this.speed = speed;
    }

    update(deltaTime: number, gameSpeed: number): void {
        // 기본 업데이트 로직 (필요에 따라 하위 클래스에서 오버라이드)
    }

    draw(ctx: CanvasRenderingContext2D): void {
        // 기본 그리기 로직 (필요에 따라 하위 클래스에서 오버라이드)
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }
}

class ParallaxBackground extends GameObject {
    private canvasWidth: number;

    constructor(
        x: number, y: number, width: number, height: number,
        image: HTMLImageElement, speed: number, canvasWidth: number
    ) {
        super(x, y, width, height, image, speed);
        this.canvasWidth = canvasWidth;
    }

    update(deltaTime: number, gameSpeed: number) {
        this.x -= this.speed * gameSpeed * deltaTime;
        // Reset x when the entire image has scrolled off-screen to the left, to loop seamlessly.
        // This ensures this.x stays within the range (-this.width, 0] for effective tiling.
        if (this.x <= -this.width) {
            this.x += this.width;
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        let currentX = this.x;

        // Adjust currentX to be the starting point of the first visible tile
        // or the tile just about to become visible from the left.
        // This handles cases where this.x might be very negative if deltaTime is large.
        while (currentX + this.width < 0) {
            currentX += this.width;
        }

        // Draw images side-by-side until the entire canvas is covered and one extra tile
        // to ensure smooth scrolling as the next tile enters the view.
        while (currentX < this.canvasWidth + this.width) {
            ctx.drawImage(this.image, currentX, this.y, this.width, this.height);
            currentX += this.width;
        }
    }
}
