class TetrisGame {
    // ... (rest of the class code remains unchanged until renderPlayingScreen)

    private renderPlayingScreen(): void {
        this.drawGrid();
        this.drawUI();

        if (this.currentPiece) {
            // Calculate and draw ghost piece
            const ghostPiece = this.currentPiece.clone();
            // Move ghostPiece down until it collides
            while (this.isValidMove(ghostPiece, 0, 1)) {
                ghostPiece.y++;
            }
            // Draw ghost piece at its final calculated position (ghostPiece.x, ghostPiece.y)
            this.drawPiece(ghostPiece, 0, 0, this.config.gameSettings.ghostPieceAlpha);

            // Draw actual current piece at its current position (this.currentPiece.x, this.currentPiece.y)
            this.drawPiece(this.currentPiece, 0, 0, 1);
        }
    }

    // Audio Playback
    // ... (rest of the class code)
}
