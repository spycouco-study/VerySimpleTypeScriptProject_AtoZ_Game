// Define enums and interfaces for better type safety and organization
enum GameState {
    LOADING = 'LOADING',
    ERROR = 'ERROR',
    TITLE = 'TITLE',
    PLAYING = 'PLAYING',
    GAME_OVER = 'GAME_OVER',
    WIN = 'WIN'
}

enum TileType {
    EMPTY = 0,
    SOLID = 1,
    BREAKABLE = 2
}

enum EntityType {
    PLAYER = 'PLAYER',
    ENEMY = 'ENEMY',
    BALLOON = 'BALLOON',
    EXPLOSION = 'EXPLOSION',
    ITEM = 'ITEM'
}

enum ItemType {
    RANGE_UP = 'RANGE_UP',
    MAX_BALLOON_UP = 'MAX_BALLOON_UP',
    SPEED_UP = 'SPEED_UP'
}

interface AssetImage {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface AssetSound {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface GameConfig {
    tileSize: number;
    playerSpeed: number;
    playerMaxHealth: number;
    balloonFuseTimeMs: number;
    explosionDurationMs: number;
    initialExplosionRange: number;
    initialMaxBalloons: number;
    enemyCount: number;
    enemySpeed: number;
    itemSpawnChance: number; // 0 to 1
    levelWidth: number; // in tiles
    levelHeight: number; // in tiles
    titleScreenText: string;
    gameOverText: string;
    winText: string;
    titleBGM: string;
    gameBGM: string;
    assets: {
        images: AssetImage[];
        sounds: AssetSound[];
    };
    mapLayouts: number[][][]; // Array of 2D tile arrays
}

interface GameData {
    gameConfig: GameConfig;
}

// --- Game Object Base Classes ---

abstract class GameObject {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    type: EntityType | TileType;
    imageName: string;
    isDead: boolean = false;

    constructor(x: number, y: number, width: number, height: number, type: EntityType | TileType, imageName: string = 'default') {
        this.id = Math.random(); // Simple unique ID
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.type = type;
        this.imageName = imageName;
    }

    abstract update(deltaTime: number, game: Game): void;
    abstract draw(ctx: CanvasRenderingContext2D, game: Game): void;

    // Add collidesWith to GameObject (moved from Player)
    collidesWith(other: GameObject): boolean {
        return this.x < other.x + other.width &&
               this.x + this.width > other.x &&
               this.y < other.y + other.height &&
               this.y + this.height > other.y;
    }
}

abstract class Character extends GameObject {
    dx: number = 0;
    dy: number = 0;
    speed: number;
    maxBalloons: number;
    currentBalloons: number = 0;
    explosionRange: number;
    health: number;
    maxHealth: number;

    constructor(x: number, y: number, width: number, height: number, type: EntityType, imageName: string, speed: number, maxHealth: number, initialExplosionRange: number, initialMaxBalloons: number) {
        super(x, y, width, height, type, imageName);
        this.speed = speed;
        this.maxHealth = maxHealth;
        this.health = maxHealth;
        this.explosionRange = initialExplosionRange;
        this.maxBalloons = initialMaxBalloons;
    }

    move(dx: number, dy: number) {
        this.dx = dx;
        this.dy = dy;
    }

    placeBalloon(game: Game): boolean {
        if (this.currentBalloons < this.maxBalloons) {
            const gridX = Math.round(this.x / game.tileSize);
            const gridY = Math.round(this.y / game.tileSize);

            // Check if there's already a balloon at this exact grid position
            const existingBalloon = game.balloons.find(b =>
                Math.round(b.x / game.tileSize) === gridX &&
                Math.round(b.y / game.tileSize) === gridY
            );

            if (!existingBalloon) {
                game.balloons.push(new WaterBalloon(
                    gridX * game.tileSize,
                    gridY * game.tileSize,
                    game.tileSize,
                    game.tileSize,
                    game.config.balloonFuseTimeMs,
                    this.explosionRange,
                    this // owner
                ));
                this.currentBalloons++;
                game.playSound('sfx_place_balloon');
                return true;
            }
        }
        return false;
    }

    takeDamage(game: Game) {
        this.health--;
        if (this.health <= 0) {
            this.isDead = true;
            game.playSound(this.type === EntityType.PLAYER ? 'sfx_player_death' : 'sfx_enemy_death');
        }
    }

    onBalloonExploded() {
        this.currentBalloons--;
        if (this.currentBalloons < 0) this.currentBalloons = 0; // Prevent negative
    }

    update(deltaTime: number, game: Game) {
        if (this.isDead) return;

        // Attempt movement
        const newX = this.x + this.dx * this.speed * deltaTime;
        const newY = this.y + this.dy * this.speed * deltaTime;

        // Collision detection for X movement
        let canMoveX = true;
        let targetRectX = { x: newX, y: this.y, width: this.width, height: this.height };
        if (this.checkCollisionWithWalls(targetRectX, game.grid, game.tileSize, game.balloons)) {
            canMoveX = false;
        }

        // Collision detection for Y movement
        let canMoveY = true;
        let targetRectY = { x: this.x, y: newY, width: this.width, height: this.height };
        if (this.checkCollisionWithWalls(targetRectY, game.grid, game.tileSize, game.balloons)) {
            canMoveY = false;
        }

        if (canMoveX) this.x = newX;
        if (canMoveY) this.y = newY;

        // Snap to grid for smoother movement when releasing keys
        const currentGridX = Math.round(this.x / game.tileSize);
        const currentGridY = Math.round(this.y / game.tileSize);

        const snapThreshold = 0.3 * game.tileSize; // Example threshold

        if (this.dx === 0) { // Only snap X if not moving horizontally
            const diffX = this.x - currentGridX * game.tileSize;
            if (Math.abs(diffX) < snapThreshold) {
                this.x = currentGridX * game.tileSize;
            }
        }
        if (this.dy === 0) { // Only snap Y if not moving vertically
            const diffY = this.y - currentGridY * game.tileSize;
            if (Math.abs(diffY) < snapThreshold) {
                this.y = currentGridY * game.tileSize;
            }
        }
    }

    checkCollisionWithWalls(rect: { x: number, y: number, width: number, height: number }, grid: TileType[][], tileSize: number, balloons: WaterBalloon[]): boolean {
        const left = Math.floor(rect.x / tileSize);
        const right = Math.ceil((rect.x + rect.width) / tileSize) - 1;
        const top = Math.floor(rect.y / tileSize);
        const bottom = Math.ceil((rect.y + rect.height) / tileSize) - 1;

        for (let y = top; y <= bottom; y++) {
            for (let x = left; x <= right; x++) {
                if (x < 0 || x >= grid[0].length || y < 0 || y >= grid.length) {
                    return true; // Out of bounds
                }
                if (grid[y][x] === TileType.SOLID || grid[y][x] === TileType.BREAKABLE) {
                    return true;
                }
                // Also collide with existing balloons
                if (balloons.some(b => !b.isDead && Math.round(b.x / tileSize) === x && Math.round(b.y / tileSize) === y)) {
                    // Make sure the character is not already standing on that balloon's tile
                    const currentGridX = Math.round(this.x / tileSize);
                    const currentGridY = Math.round(this.y / tileSize);
                    if (!(currentGridX === x && currentGridY === y)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
}

class Player extends Character {
    currentKeys: Set<string> = new Set();
    canPlaceBalloon: boolean = true; // For debounce

    constructor(x: number, y: number, width: number, height: number, speed: number, maxHealth: number, initialExplosionRange: number, initialMaxBalloons: number) {
        super(x, y, width, height, EntityType.PLAYER, 'player', speed, maxHealth, initialExplosionRange, initialMaxBalloons);
    }

    update(deltaTime: number, game: Game) {
        if (this.isDead) return;

        let dx = 0;
        let dy = 0;

        if (this.currentKeys.has('ArrowLeft')) dx = -1;
        if (this.currentKeys.has('ArrowRight')) dx = 1;
        if (this.currentKeys.has('ArrowUp')) dy = -1;
        if (this.currentKeys.has('ArrowDown')) dy = 1;

        // Normalize diagonal movement speed
        if (dx !== 0 && dy !== 0) {
            const magnitude = Math.sqrt(dx * dx + dy * dy);
            dx /= magnitude;
            dy /= magnitude;
        }

        this.move(dx, dy);
        super.update(deltaTime, game); // Call Character's update for movement and collisions

        if (this.currentKeys.has(' ')) { // Changed from 'Space' to ' ' for consistency
            if (this.canPlaceBalloon) {
                this.placeBalloon(game);
                this.canPlaceBalloon = false; // Debounce
                setTimeout(() => this.canPlaceBalloon = true, 200); // Small delay to prevent rapid fire
            }
        } else {
            // If spacebar is released, allow placing again immediately (or keep debounce)
            // For now, keep debounce, the `canPlaceBalloon` flag will handle it.
        }


        // Check for item pickup
        game.items.forEach(item => {
            if (!item.isDead && this.collidesWith(item)) {
                item.applyEffect(this);
                item.isDead = true;
                game.playSound('sfx_item_pickup');
            }
        });
    }

    draw(ctx: CanvasRenderingContext2D, game: Game) {
        if (this.isDead) return;
        game.drawImage(ctx, this.imageName, this.x, this.y, this.width, this.height);

        // Draw health bar
        const healthBarHeight = 5;
        const healthBarWidth = this.width;
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x, this.y - healthBarHeight - 2, healthBarWidth, healthBarHeight);
        ctx.fillStyle = 'lime';
        ctx.fillRect(this.x, this.y - healthBarHeight - 2, healthBarWidth * (this.health / this.maxHealth), healthBarHeight);
    }
}

class Enemy extends Character {
    private targetPlayer: Player | null = null;
    private targetPosition: { x: number, y: number } | null = null;
    private movementTimer: number = 0;
    private movementInterval: number = 300; // ms to re-evaluate movement
    private balloonPlaceTimer: number = 0;
    private balloonPlaceInterval: number = 2000; // ms
    private path: { x: number, y: number }[] = [];

    constructor(x: number, y: number, width: number, height: number, speed: number, maxHealth: number, initialExplosionRange: number, initialMaxBalloons: number) {
        super(x, y, width, height, EntityType.ENEMY, 'enemy', speed, maxHealth, initialExplosionRange, initialMaxBalloons);
    }

    update(deltaTime: number, game: Game) {
        if (this.isDead) return;

        this.movementTimer -= deltaTime;
        this.balloonPlaceTimer -= deltaTime;

        // Find closest active player
        this.targetPlayer = game.players.filter(p => !p.isDead && p.type === EntityType.PLAYER).sort((a, b) => {
            const distA = Math.hypot(this.x - a.x, this.y - a.y);
            const distB = Math.hypot(this.x - b.x, this.y - b.y);
            return distA - distB;
        })[0] as Player || null;

        const currentGridX = Math.round(this.x / game.tileSize);
        const currentGridY = Math.round(this.y / game.tileSize);

        this.dx = 0;
        this.dy = 0;

        // Basic AI Logic
        if (this.targetPlayer) {
            const playerGridX = Math.round(this.targetPlayer.x / game.tileSize);
            const playerGridY = Math.round(this.targetPlayer.y / game.tileSize);

            // Avoid explosions
            let dangerZones: { x: number, y: number }[] = [];
            game.explosions.forEach(exp => {
                const ex = Math.round(exp.x / game.tileSize);
                const ey = Math.round(exp.y / game.tileSize);
                dangerZones.push({x:ex, y:ey});
            });

            if (this.isStandingInExplosion(dangerZones, currentGridX, currentGridY) || this.isNextToExplosion(game, currentGridX, currentGridY, dangerZones)) {
                // Try to evade
                this.evade(currentGridX, currentGridY, dangerZones, game);
            } else {
                // Pathfind to player or to a breakable block
                if (this.movementTimer <= 0 || !this.targetPosition || (currentGridX === Math.round(this.targetPosition.x / game.tileSize) && currentGridY === Math.round(this.targetPosition.y / game.tileSize))) {
                    this.path = this.findPath(game, currentGridX, currentGridY, playerGridX, playerGridY);
                    if (this.path.length > 1) { // path[0] is current position
                        const nextStep = this.path[1];
                        this.targetPosition = { x: nextStep.x * game.tileSize, y: nextStep.y * game.tileSize };
                    } else {
                        // If no direct path to player, try to find a nearby breakable block
                        const breakableTarget = this.findNearbyBreakableBlock(game, currentGridX, currentGridY);
                        if (breakableTarget) {
                            this.path = this.findPath(game, currentGridX, currentGridY, breakableTarget.x, breakableTarget.y);
                            if (this.path.length > 1) {
                                const nextStep = this.path[1];
                                this.targetPosition = { x: nextStep.x * game.tileSize, y: nextStep.y * game.tileSize };
                            } else {
                                this.targetPosition = null; // Can't reach breakable
                            }
                        } else {
                            this.targetPosition = null; // No target
                        }
                    }
                    this.movementTimer = this.movementInterval + Math.random() * 200; // Randomize next move decision
                }

                if (this.targetPosition) {
                    const targetCellX = Math.round(this.targetPosition.x / game.tileSize);
                    const targetCellY = Math.round(this.targetPosition.y / game.tileSize);

                    if (currentGridX < targetCellX) this.dx = 1;
                    else if (currentGridX > targetCellX) this.dx = -1;
                    if (currentGridY < targetCellY) this.dy = 1;
                    else if (currentGridY > targetCellY) this.dy = -1;
                }
            }

            // Place balloon logic
            if (this.balloonPlaceTimer <= 0) {
                if (this.shouldPlaceBalloon(game, currentGridX, currentGridY, playerGridX, playerGridY)) {
                    if (this.placeBalloon(game)) {
                        this.balloonPlaceTimer = this.balloonPlaceInterval + Math.random() * 1000;
                    }
                }
            }
        }

        // Normalize diagonal movement speed
        if (this.dx !== 0 && this.dy !== 0) {
            const magnitude = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
            this.dx /= magnitude;
            this.dy /= magnitude;
        }

        super.update(deltaTime, game); // Call Character's update for movement and collisions

        // Check for item pickup
        game.items.forEach(item => {
            if (!item.isDead && this.collidesWith(item)) {
                item.applyEffect(this);
                item.isDead = true;
                game.playSound('sfx_item_pickup');
            }
        });
    }

    draw(ctx: CanvasRenderingContext2D, game: Game) {
        if (this.isDead) return;
        game.drawImage(ctx, this.imageName, this.x, this.y, this.width, this.height);

        // Draw health bar
        const healthBarHeight = 5;
        const healthBarWidth = this.width;
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x, this.y - healthBarHeight - 2, healthBarWidth, healthBarHeight);
        ctx.fillStyle = 'yellow';
        ctx.fillRect(this.x, this.y - healthBarHeight - 2, healthBarWidth * (this.health / this.maxHealth), healthBarHeight);
    }

    // --- AI Helper Functions ---

    isPassable(game: Game, x: number, y: number): boolean {
        return x >= 0 && x < game.grid[0].length && y >= 0 && y < game.grid.length &&
               (game.grid[y][x] === TileType.EMPTY || game.items.some(item => !item.isDead && Math.round(item.x / game.tileSize) === x && Math.round(item.y / game.tileSize) === y));
    }

    isBlockedByBalloon(game: Game, x: number, y: number): boolean {
        return game.balloons.some(b => Math.round(b.x / game.tileSize) === x && Math.round(b.y / game.tileSize) === y);
    }

    // Simple BFS for pathfinding
    findPath(game: Game, startX: number, startY: number, targetX: number, targetY: number): { x: number, y: number }[] {
        const queue: { x: number, y: number, path: { x: number, y: number }[] }[] = [];
        const visited = new Set<string>();

        queue.push({ x: startX, y: startY, path: [{ x: startX, y: startY }] });
        visited.add(`${startX},${startY}`);

        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // Up, Down, Left, Right

        while (queue.length > 0) {
            const { x, y, path } = queue.shift()!;

            if (x === targetX && y === targetY) {
                return path;
            }

            for (const [dx, dy] of directions) {
                const newX = x + dx;
                const newY = y + dy;
                const newPosKey = `${newX},${newY}`;

                if (this.isPassable(game, newX, newY) && !visited.has(newPosKey) && !this.isBlockedByBalloon(game, newX, newY)) {
                    visited.add(newPosKey);
                    queue.push({ x: newX, y: newY, path: [...path, { x: newX, y: newY }] });
                }
            }
        }
        return []; // No path found
    }

    shouldPlaceBalloon(game: Game, currentGridX: number, currentGridY: number, playerGridX: number, playerGridY: number): boolean {
        if (this.currentBalloons >= this.maxBalloons) return false;

        // Don't place if standing in a future explosion path (from existing balloons)
        if (game.balloons.some(b => Math.round(b.x / game.tileSize) === currentGridX && Math.round(b.y / game.tileSize) === currentGridY)) {
            return false;
        }

        // Check if a nearby block or player would be hit
        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        for (const [dx, dy] of directions) {
            for (let i = 1; i <= this.explosionRange; i++) {
                const targetX = currentGridX + dx * i;
                const targetY = currentGridY + dy * i;

                if (targetX < 0 || targetX >= game.grid[0].length || targetY < 0 || targetY >= game.grid.length) break;

                // Hit solid block, stop explosion in this direction
                if (game.grid[targetY][targetX] === TileType.SOLID) break;

                // Hit breakable block or a player
                const hitBreakable = game.grid[targetY][targetX] === TileType.BREAKABLE;
                const hitPlayer = this.targetPlayer && Math.round(this.targetPlayer.x / game.tileSize) === targetX && Math.round(this.targetPlayer.y / game.tileSize) === targetY;

                if (hitBreakable || hitPlayer) {
                    // Ensure the enemy has an escape path after placing the balloon
                    if (this.canEscapeAfterPlacing(game, currentGridX, currentGridY, targetX, targetY, this.explosionRange)) {
                        return true;
                    }
                    break;
                }
            }
        }
        return false;
    }

    canEscapeAfterPlacing(game: Game, currentGridX: number, currentGridY: number, balloonTargetX: number, balloonTargetY: number, explosionRange: number): boolean {
        const queue: { x: number, y: number, path: { x: number, y: number }[] }[] = [];
        const visited = new Set<string>();

        // We assume a balloon is placed at (currentGridX, currentGridY)
        // And it will explode in a cross pattern up to explosionRange.
        // We need to find if there's a safe adjacent cell to move to.

        const explosionCells = new Set<string>();
        explosionCells.add(`${currentGridX},${currentGridY}`);
        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        for (const [dx, dy] of directions) {
            for (let i = 1; i <= explosionRange; i++) {
                const ex = currentGridX + dx * i;
                const ey = currentGridY + dy * i;
                if (ex < 0 || ex >= game.grid[0].length || ey < 0 || ey >= game.grid.length) break;
                if (game.grid[ey][ex] === TileType.SOLID) break;
                explosionCells.add(`${ex},${ey}`);
                if (game.grid[ey][ex] === TileType.BREAKABLE) break;
            }
        }

        // Check immediately adjacent cells
        for (const [dx, dy] of directions) {
            const nextX = currentGridX + dx;
            const nextY = currentGridY + dy;
            const nextPosKey = `${nextX},${nextY}`;

            // If the next cell is passable and not part of the impending explosion
            if (this.isPassable(game, nextX, nextY) && !explosionCells.has(nextPosKey)) {
                return true; // Found a safe adjacent escape route
            }
        }

        return false;
    }


    isStandingInExplosion(dangerZones: { x: number, y: number }[], gridX: number, gridY: number): boolean {
        return dangerZones.some(dz => dz.x === gridX && dz.y === gridY);
    }

    isNextToExplosion(game: Game, gridX: number, gridY: number, dangerZones: { x: number, y: number }[]): boolean {
        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        for (const [dx, dy] of directions) {
            const checkX = gridX + dx;
            const checkY = gridY + dy;
            if (dangerZones.some(dz => dz.x === checkX && dz.y === checkY)) {
                return true;
            }
        }
        return false;
    }

    evade(currentGridX: number, currentGridY: number, dangerZones: { x: number, y: number }[], game: Game) {
        let bestEscapeDirection: { dx: number, dy: number } | null = null;
        let maxSafetyDistance = -1; // Higher means safer

        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];

        for (const [dx, dy] of directions) {
            const nextX = currentGridX + dx;
            const nextY = currentGridY + dy;

            if (this.isPassable(game, nextX, nextY) && !this.isBlockedByBalloon(game, nextX, nextY)) {
                const pathFromNext = this.findPathAwayFromDanger(game, nextX, nextY, dangerZones);
                if (pathFromNext.length > 0) {
                    // The path leads to a safe cell. Let's pick the one with the shortest path to safety.
                    // Or, even better, the one that leads to a cell *furthest* from danger zones.
                    let pathSafetyMetric = pathFromNext.length; // Shorter path to safety is better

                    if(pathSafetyMetric > maxSafetyDistance) {
                        maxSafetyDistance = pathSafetyMetric;
                        bestEscapeDirection = { dx, dy };
                    }
                }
            }
        }

        if (bestEscapeDirection) {
            this.dx = bestEscapeDirection.dx;
            this.dy = bestEscapeDirection.dy;
        } else {
            // If no safe path immediately found, try random movement if possible
            const possibleMoves = directions.filter(([dx, dy]) =>
                this.isPassable(game, currentGridX + dx, currentGridY + dy) &&
                !this.isBlockedByBalloon(game, currentGridX + dx, currentGridY + dy)
            );
            if (possibleMoves.length > 0) {
                const [dx, dy] = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
                this.dx = dx;
                this.dy = dy;
            } else {
                this.dx = 0; // Trapped
                this.dy = 0;
            }
        }
    }

    findPathAwayFromDanger(game: Game, startX: number, startY: number, dangerZones: { x: number, y: number }[]): { x: number, y: number }[] {
        const queue: { x: number, y: number, path: { x: number, y: number }[] }[] = [];
        const visited = new Set<string>();

        queue.push({ x: startX, y: startY, path: [{ x: startX, y: startY }] });
        visited.add(`${startX},${startY}`);

        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];

        while (queue.length > 0) {
            const { x, y, path } = queue.shift()!;

            // Check if current position is safe (not in a danger zone)
            const isSafe = !dangerZones.some(dz => dz.x === x && dz.y === y);
            if (isSafe) {
                return path; // Found a path to a safe spot
            }

            for (const [dx, dy] of directions) {
                const newX = x + dx;
                const newY = y + dy;
                const newPosKey = `${newX},${newY}`;

                if (this.isPassable(game, newX, newY) && !visited.has(newPosKey) && !this.isBlockedByBalloon(game, newX, newY)) {
                    visited.add(newPosKey);
                    queue.push({ x: newX, y: newY, path: [...path, { x: newX, y: newY }] });
                }
            }
        }
        return []; // No path to safety found
    }

    findNearbyBreakableBlock(game: Game, currentGridX: number, currentGridY: number): { x: number, y: number } | null {
        // Simple BFS to find the closest breakable block
        const queue: { x: number, y: number, dist: number }[] = [];
        const visited = new Set<string>();

        queue.push({ x: currentGridX, y: currentGridY, dist: 0 });
        visited.add(`${currentGridX},${currentGridY}`);

        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];

        while (queue.length > 0) {
            const { x, y, dist } = queue.shift()!;

            if (game.grid[y][x] === TileType.BREAKABLE) {
                return { x, y };
            }

            for (const [dx, dy] of directions) {
                const newX = x + dx;
                const newY = y + dy;
                const newPosKey = `${newX},${newY}`;

                if (this.isPassable(game, newX, newY) && !visited.has(newPosKey)) {
                    visited.add(newPosKey);
                    queue.push({ x: newX, y: newY, dist: dist + 1 });
                }
            }
        }
        return null; // No breakable block found
    }
}

class WaterBalloon extends GameObject {
    private fuseTime: number;
    private timer: number;
    private explosionRange: number;
    private owner: Character;

    constructor(x: number, y: number, width: number, height: number, fuseTimeMs: number, explosionRange: number, owner: Character) {
        super(x, y, width, height, EntityType.BALLOON, 'water_balloon');
        this.fuseTime = fuseTimeMs;
        this.timer = fuseTimeMs;
        this.explosionRange = explosionRange;
        this.owner = owner;
    }

    update(deltaTime: number, game: Game) {
        if (this.isDead) return;

        this.timer -= deltaTime;
        if (this.timer <= 0) {
            this.explode(game);
            this.isDead = true;
            this.owner.onBalloonExploded();
        }
    }

    explode(game: Game) {
        game.playSound('sfx_explosion');

        const gridX = Math.round(this.x / game.tileSize);
        const gridY = Math.round(this.y / game.tileSize);

        const cellsToExplode = new Set<string>();
        cellsToExplode.add(`${gridX},${gridY}`); // Center

        const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];

        for (const [dx, dy] of directions) {
            for (let i = 1; i <= this.explosionRange; i++) {
                const targetX = gridX + (dx as number) * i;
                const targetY = gridY + (dy as number) * i;

                if (targetX < 0 || targetX >= game.grid[0].length || targetY < 0 || targetY >= game.grid.length) {
                    break; // Out of bounds
                }

                const tileAtTarget = game.grid[targetY][targetX];

                if (tileAtTarget === TileType.SOLID) {
                    break; // Solid block stops explosion
                }

                cellsToExplode.add(`${targetX},${targetY}`); // Add cell to hit list

                if (tileAtTarget === TileType.BREAKABLE) {
                    break; // Breakable block stops explosion past it
                }

                // Chain reaction with other balloons
                const hitBalloon = game.balloons.find(b =>
                    !b.isDead &&
                    Math.round(b.x / game.tileSize) === targetX &&
                    Math.round(b.y / game.tileSize) === targetY
                );
                if (hitBalloon && hitBalloon !== this) { // Don't re-explode self
                    hitBalloon.explode(game); // Trigger immediate explosion
                    hitBalloon.isDead = true;
                    hitBalloon.owner.onBalloonExploded();
                    break; // Chain reaction also stops explosion past it
                }
            }
        }

        // Now apply effects to all determined explosion cells
        cellsToExplode.forEach(cellKey => {
            const [cx, cy] = cellKey.split(',').map(Number);

            // Create explosion visual effect
            let explosionImageName = 'explosion_center'; // Default to center
            if (cx === gridX && cy === gridY) {
                explosionImageName = 'explosion_center';
            } else {
                // Determine if it's horizontal or vertical end
                let dirType = '';
                if (cx === gridX) dirType = 'vertical';
                if (cy === gridY) dirType = 'horizontal';

                if (dirType) {
                    let isExplosionEnd = true; // Assume it's an end piece
                    const dx_offset = cx - gridX;
                    const dy_offset = cy - gridY;

                    // Check if the next cell in the same direction is part of this explosion,
                    // or if it's a solid block, meaning this is indeed an end.
                    const nextX_in_direction = cx + Math.sign(dx_offset);
                    const nextY_in_direction = cy + Math.sign(dy_offset);

                    const nextCellKey_in_direction = `${nextX_in_direction},${nextY_in_direction}`;

                    if (cellsToExplode.has(nextCellKey_in_direction)) {
                        isExplosionEnd = false; // There's more explosion in this direction
                    }
                    if (isExplosionEnd) {
                         if (dirType) explosionImageName = `explosion_${dirType}_end`;
                    } else {
                        explosionImageName = `explosion_${dirType}`;
                    }
                }
            }
            game.explosions.push(new Explosion(cx * game.tileSize, cy * game.tileSize, game.tileSize, game.tileSize, game.config.explosionDurationMs, explosionImageName));

            // Destroy breakable blocks
            if (game.grid[cy][cx] === TileType.BREAKABLE) {
                game.grid[cy][cx] = TileType.EMPTY;
                if (Math.random() < game.config.itemSpawnChance) {
                    game.items.push(new Item(cx * game.tileSize, cy * game.tileSize, game.tileSize, game.tileSize, game.config.explosionDurationMs * 2)); // Items last longer
                }
            }

            // Damage characters
            [game.player, ...game.enemies].forEach(char => {
                if (!char.isDead) {
                    const charGridX = Math.round(char.x / game.tileSize);
                    const charGridY = Math.round(char.y / game.tileSize);
                    if (charGridX === cx && charGridY === cy) {
                        char.takeDamage(game);
                    }
                }
            });
        });
    }

    draw(ctx: CanvasRenderingContext2D, game: Game) {
        if (this.isDead) return;
        // Optionally draw a pulsating effect or countdown for the balloon
        const scale = 0.8 + 0.2 * Math.sin(this.timer / game.config.balloonFuseTimeMs * Math.PI * 2); // Pulsating based on timer
        const scaledWidth = this.width * scale;
        const scaledHeight = this.height * scale;
        const offsetX = (this.width - scaledWidth) / 2;
        const offsetY = (this.height - scaledHeight) / 2;

        game.drawImage(ctx, this.imageName, this.x + offsetX, this.y + offsetY, scaledWidth, scaledHeight);
    }
}

class Explosion extends GameObject {
    private timer: number;
    private duration: number;

    constructor(x: number, y: number, width: number, height: number, durationMs: number, imageName: string) {
        super(x, y, width, height, EntityType.EXPLOSION, imageName);
        this.duration = durationMs;
        this.timer = durationMs;
    }

    update(deltaTime: number, game: Game) {
        this.timer -= deltaTime;
        if (this.timer <= 0) {
            this.isDead = true;
        }
    }

    draw(ctx: CanvasRenderingContext2D, game: Game) {
        if (this.isDead) return;
        const alpha = this.timer / this.duration; // Fade out
        ctx.save();
        ctx.globalAlpha = alpha;
        game.drawImage(ctx, this.imageName, this.x, this.y, this.width, this.height);
        ctx.restore();
    }
}

class Item extends GameObject {
    itemType: ItemType;
    private duration: number; // How long item stays on ground

    constructor(x: number, y: number, width: number, height: number, durationMs: number) {
        const randomType = Math.random();
        let type: ItemType;
        let imageName: string;
        if (randomType < 0.33) {
            type = ItemType.RANGE_UP;
            imageName = 'item_range_up';
        } else if (randomType < 0.66) {
            type = ItemType.MAX_BALLOON_UP;
            imageName = 'item_max_balloon_up';
        } else {
            type = ItemType.SPEED_UP;
            imageName = 'item_speed_up';
        }

        super(x, y, width, height, EntityType.ITEM, imageName);
        this.itemType = type;
        this.duration = durationMs;
    }

    update(deltaTime: number, game: Game) {
        this.duration -= deltaTime;
        if (this.duration <= 0) {
            this.isDead = true;
        }
    }

    applyEffect(character: Character) {
        switch (this.itemType) {
            case ItemType.RANGE_UP:
                character.explosionRange++;
                break;
            case ItemType.MAX_BALLOON_UP:
                character.maxBalloons++;
                break;
            case ItemType.SPEED_UP:
                character.speed += 0.02; // Small speed boost
                break;
        }
    }

    draw(ctx: CanvasRenderingContext2D, game: Game) {
        if (this.isDead) return;
        const scale = 0.8 + 0.1 * Math.sin(Date.now() / 200); // Pulsing effect
        const scaledWidth = this.width * scale;
        const scaledHeight = this.height * scale;
        const offsetX = (this.width - scaledWidth) / 2;
        const offsetY = (this.height - scaledHeight) / 2;
        game.drawImage(ctx, this.imageName, this.x + offsetX, this.y + offsetY, scaledWidth, scaledHeight);
    }
}


// --- Main Game Class ---

class Game {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    config: GameConfig;

    gameState: GameState = GameState.LOADING; // Initialize to LOADING state
    lastTime: number = 0;

    images: Map<string, HTMLImageElement> = new Map();
    sounds: Map<string, HTMLAudioElement> = new Map();

    grid: TileType[][] = [];
    player: Player;
    enemies: Enemy[] = [];
    balloons: WaterBalloon[] = [];
    explosions: Explosion[] = [];
    items: Item[] = [];

    // All characters (player + enemies) for general purpose checks
    players: Character[] = [];

    // Game state properties
    tileSize: number;
    levelWidth: number;
    levelHeight: number;

    constructor(canvasId: string, config: GameConfig) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.config = config;

        this.tileSize = config.tileSize;
        this.levelWidth = config.levelWidth;
        this.levelHeight = config.levelHeight;

        this.canvas.width = this.levelWidth * this.tileSize;
        this.canvas.height = this.levelHeight * this.tileSize;

        this.ctx.imageSmoothingEnabled = false; // For pixel art

        // Dummy player for initialization before actual player is created
        // This is a workaround for `this.player` being used in `initGame` before actual assignment.
        // A better approach would be to make `player` optional and check for its existence.
        this.player = new Player(0,0,0,0,0,0,0,0);

        // Start the game loop immediately to display the loading screen
        this.gameLoop(0);

        this.loadAssets().then(() => {
            console.log('Assets loaded. Initializing game and starting title screen.');
            this.initGame(); // Initialize game objects once assets are ready
            this.startTitleScreen(); // Sets gameState to TITLE
        }).catch(error => {
            console.error('Failed to load assets:', error);
            this.gameState = GameState.ERROR; // Set state to ERROR if asset loading fails
        });

        this.setupInput();
    }

    async loadAssets(): Promise<void> {
        const imagePromises = this.config.assets.images.map(img => {
            return new Promise<void>((resolve, reject) => {
                const image = new Image();
                image.src = img.path;
                image.onload = () => {
                    this.images.set(img.name, image);
                    resolve();
                };
                image.onerror = () => reject(`Failed to load image: ${img.path}`);
            });
        });

        const soundPromises = this.config.assets.sounds.map(snd => {
            return new Promise<void>((resolve, reject) => {
                const audio = new Audio();
                audio.src = snd.path;
                audio.volume = snd.volume;
                // Preload can fail or be blocked by browser policies,
                // so we don't block game start on sound loading errors
                audio.oncanplaythrough = () => {
                    this.sounds.set(snd.name, audio);
                    resolve();
                };
                audio.onerror = () => {
                    console.warn(`Failed to load sound: ${snd.path}`);
                    resolve(); // Resolve anyway to not block game
                };
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log('All assets processed.');
    }

    playSound(name: string, loop: boolean = false) {
        const audioTemplate = this.sounds.get(name);
        if (audioTemplate) {
            // Cloning audio for effects to allow multiple simultaneous plays
            const audio = audioTemplate.cloneNode() as HTMLAudioElement;
            audio.volume = audioTemplate.volume;
            audio.loop = loop;
            audio.currentTime = 0; // Reset to start
            audio.play().catch(e => console.warn(`Failed to play sound ${name}:`, e));

            // To prevent memory leak, stop looping sounds when game state changes
            if (loop) {
                // Keep track of looping sounds
            } else {
                // For one-shot sounds, remove after playing
                audio.onended = () => audio.remove();
            }
        }
    }

    stopSound(name: string) {
        // Need to stop all instances of a looping sound, not just the template
        // For simplicity, stopping the template and relying on game state to manage new plays
        const audio = this.sounds.get(name);
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            audio.loop = false;
        }
        // If multiple cloned instances are playing, this won't stop them.
        // A more robust system would involve tracking all active Audio objects.
    }

    stopAllSounds() {
        this.sounds.forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
            audio.loop = false;
        });
        // Also need to stop any cloned instances. This is a current limitation.
        // For now, assume cloning happens primarily for SFX, and BGM is managed by the main instance.
    }

    drawImage(ctx: CanvasRenderingContext2D, imageName: string, x: number, y: number, width: number, height: number) {
        const image = this.images.get(imageName);
        if (image) {
            ctx.drawImage(image, x, y, width, height);
        } else {
            console.warn(`Image "${imageName}" not found.`);
            // Fallback: draw a colored rectangle
            ctx.fillStyle = 'magenta';
            ctx.fillRect(x, y, width, height);
            ctx.fillStyle = 'black';
            ctx.fillText(imageName, x, y + height / 2);
        }
    }

    setupInput() {
        document.addEventListener('keydown', (e) => {
            if (this.gameState === GameState.TITLE || this.gameState === GameState.GAME_OVER || this.gameState === GameState.WIN) {
                if (e.key === 'Enter') { // Modified to only check for 'Enter'
                    this.startGame();
                }
            } else if (this.gameState === GameState.PLAYING) {
                this.player.currentKeys.add(e.key);
            }
        });

        document.addEventListener('keyup', (e) => {
            if (this.gameState === GameState.PLAYING) {
                this.player.currentKeys.delete(e.key);
                // Reset player dx/dy if key for that direction is released
                if (!this.player.currentKeys.has('ArrowLeft') && !this.player.currentKeys.has('ArrowRight')) {
                    this.player.dx = 0;
                }
                if (!this.player.currentKeys.has('ArrowUp') && !this.player.currentKeys.has('ArrowDown')) {
                    this.player.dy = 0;
                }
            }
        });
    }

    initGame() {
        this.resetGame();

        // Create player
        this.player = new Player(
            this.tileSize, // Start at 1,1 grid pos
            this.tileSize,
            this.tileSize * 0.8, // Slightly smaller than tile for visual
            this.tileSize * 0.8,
            this.config.playerSpeed,
            this.config.playerMaxHealth,
            this.config.initialExplosionRange,
            this.config.initialMaxBalloons
        );
        this.players.push(this.player);

        // Spawn enemies
        const enemySpawnPoints: { x: number, y: number }[] = [];
        // Top right, bottom left, bottom right corners (avoiding player start, 1,1)
        enemySpawnPoints.push({ x: this.levelWidth - 2, y: 1 });
        enemySpawnPoints.push({ x: 1, y: this.levelHeight - 2 });
        enemySpawnPoints.push({ x: this.levelWidth - 2, y: this.levelHeight - 2 });

        for (let i = 0; i < this.config.enemyCount && i < enemySpawnPoints.length; i++) {
            const spawn = enemySpawnPoints[i];
            const enemy = new Enemy(
                spawn.x * this.tileSize,
                spawn.y * this.tileSize,
                this.tileSize * 0.8,
                this.tileSize * 0.8,
                this.config.enemySpeed,
                this.config.playerMaxHealth, // Enemies have same health as player
                this.config.initialExplosionRange,
                this.config.initialMaxBalloons
            );
            this.enemies.push(enemy);
            this.players.push(enemy); // Add enemies to the general players array
        }

        this.generateMap();
    }

    resetGame() {
        this.grid = [];
        this.players = []; // Clear all characters
        this.enemies = [];
        this.balloons = [];
        this.explosions = [];
        this.items = [];
        this.player = null as any; // Will be re-initialized
        this.stopAllSounds(); // Ensure all sounds are stopped
    }

    generateMap() {
        const layoutIndex = Math.floor(Math.random() * this.config.mapLayouts.length);
        const layout = this.config.mapLayouts[layoutIndex];

        this.grid = Array(this.levelHeight).fill(null).map(() => Array(this.levelWidth).fill(TileType.EMPTY));

        for (let y = 0; y < this.levelHeight; y++) {
            for (let x = 0; x < this.levelWidth; x++) {
                if (x === 0 || x === this.levelWidth - 1 || y === 0 || y === this.levelHeight - 1) {
                    this.grid[y][x] = TileType.SOLID; // Outer walls
                } else if (x % 2 === 0 && y % 2 === 0) {
                    this.grid[y][x] = TileType.SOLID; // Inner grid walls
                } else {
                    this.grid[y][x] = TileType.EMPTY;
                }
            }
        }

        // Apply a predefined layout for breakable blocks
        for (let y = 0; y < this.levelHeight; y++) {
            for (let x = 0; x < this.levelWidth; x++) {
                if (layout[y][x] === TileType.BREAKABLE) {
                    // Ensure player spawn area and adjacent cells (1,1; 1,2; 2,1) are clear
                    // Also clear enemy spawn areas (levelWidth-2,1; 1,levelHeight-2; levelWidth-2,levelHeight-2)
                    const isPlayerSpawnArea = (x === 1 && y === 1) || (x === 1 && y === 2) || (x === 2 && y === 1);
                    const isEnemySpawnArea = (x === this.levelWidth - 2 && y === 1) ||
                                             (x === 1 && y === this.levelHeight - 2) ||
                                             (x === this.levelWidth - 2 && y === this.levelHeight - 2);

                    if (!isPlayerSpawnArea && !isEnemySpawnArea) {
                        this.grid[y][x] = TileType.BREAKABLE;
                    }
                }
            }
        }
    }


    startTitleScreen() {
        this.gameState = GameState.TITLE;
        this.playSound(this.config.titleBGM, true);
    }

    startGame() {
        if (this.gameState === GameState.PLAYING) return;
        this.initGame(); // Reset and re-initialize game elements
        this.gameState = GameState.PLAYING;
        this.stopSound(this.config.titleBGM);
        this.playSound(this.config.gameBGM, true);
    }

    gameOver(won: boolean) {
        this.stopSound(this.config.gameBGM);
        this.gameState = won ? GameState.WIN : GameState.GAME_OVER;
        // Optionally play a winning/losing sound
    }

    gameLoop(currentTime: number) {
        const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
        this.lastTime = currentTime;

        this.update(deltaTime * 1000); // Pass delta in ms
        this.draw();

        requestAnimationFrame((t) => this.gameLoop(t));
    }

    update(deltaTime: number) {
        if (this.gameState !== GameState.PLAYING) {
            // Only game objects are updated during PLAYING state
            // Loading/Error/Title/Game Over screens don't have active game objects
            return;
        }

        // Update player
        if (!this.player.isDead) {
            this.player.update(deltaTime, this);
        }

        // Update enemies
        this.enemies.forEach(enemy => enemy.update(deltaTime, this));

        // Update balloons
        this.balloons.forEach(balloon => balloon.update(deltaTime, this));
        this.balloons = this.balloons.filter(b => !b.isDead);

        // Update explosions
        this.explosions.forEach(explosion => explosion.update(deltaTime, this));
        this.explosions = this.explosions.filter(e => !e.isDead);

        // Update items
        this.items.forEach(item => item.update(deltaTime, this));
        this.items = this.items.filter(item => !item.isDead);

        this.checkGameEndConditions();
    }

    checkGameEndConditions() {
        const livingCharacters = this.players.filter(char => !char.isDead);

        if (this.player.isDead) {
            this.gameOver(false); // Player lost
            return;
        }

        if (livingCharacters.length === 1 && livingCharacters[0].type === EntityType.PLAYER) {
            this.gameOver(true); // Player won
            return;
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        switch (this.gameState) {
            case GameState.LOADING:
                this.drawLoadingScreen();
                break;
            case GameState.ERROR:
                this.drawErrorScreen();
                break;
            case GameState.TITLE:
                this.drawTitleScreen();
                break;
            case GameState.PLAYING:
                this.drawGameScreen();
                break;
            case GameState.GAME_OVER:
                this.drawGameOverScreen();
                break;
            case GameState.WIN:
                this.drawWinScreen();
                break;
        }
    }

    drawGameScreen() {
        this.drawBackground();
        this.drawGrid();
        this.drawEntities();
        this.drawHUD();
    }

    drawBackground() {
        // Draw a repeating background tile or a single large background image
        // For simplicity, let's use a solid color or a single image if available
        this.drawImage(this.ctx, 'background', 0, 0, this.canvas.width, this.canvas.height);
    }

    drawGrid() {
        for (let y = 0; y < this.levelHeight; y++) {
            for (let x = 0; x < this.levelWidth; x++) {
                const tileType = this.grid[y][x];
                let imageName: string | undefined;

                switch (tileType) {
                    case TileType.SOLID:
                        imageName = 'block_solid';
                        break;
                    case TileType.BREAKABLE:
                        imageName = 'block_breakable';
                        break;
                    case TileType.EMPTY:
                        // No specific image for empty, background already drawn
                        break;
                }

                if (imageName) {
                    this.drawImage(this.ctx, imageName, x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
                }
            }
        }
    }

    drawEntities() {
        // Draw items
        this.items.forEach(item => item.draw(this.ctx, this));
        // Draw player
        this.player.draw(this.ctx, this);
        // Draw enemies
        this.enemies.forEach(enemy => enemy.draw(this.ctx, this));
        // Draw balloons
        this.balloons.forEach(balloon => balloon.draw(this.ctx, this));
        // Draw explosions (on top of everything)
        this.explosions.forEach(explosion => explosion.draw(this.ctx, this));
    }

    drawHUD() {
        this.ctx.fillStyle = 'white';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(`Health: ${this.player.health}/${this.player.maxHealth}`, 10, 5);
        this.ctx.fillText(`Balloons: ${this.player.currentBalloons}/${this.player.maxBalloons}`, 10, 25);
        this.ctx.fillText(`Range: ${this.player.explosionRange}`, 10, 45);
        const livingPlayersCount = this.players.filter(char => !char.isDead).length;
        this.ctx.fillText(`Players Left: ${livingPlayersCount}`, 10, 65);
    }

    drawLoadingScreen() {
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '30px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('Loading Assets...', this.canvas.width / 2, this.canvas.height / 2);
    }

    drawErrorScreen() {
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'red';
        this.ctx.font = '30px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('ERROR: Failed to load game!', this.canvas.width / 2, this.canvas.height / 2 - 20);
        this.ctx.font = '20px Arial';
        this.ctx.fillText('Check console for details.', this.canvas.width / 2, this.canvas.height / 2 + 20);
    }

    drawTitleScreen() {
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(this.config.titleScreenText, this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.font = '24px Arial';
        this.ctx.fillText('Press ENTER to Start', this.canvas.width / 2, this.canvas.height / 2 + 50); // Modified text
    }

    drawGameOverScreen() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'red';
        this.ctx.font = '60px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(this.config.gameOverText, this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px Arial';
        this.ctx.fillText('Press ENTER to Restart', this.canvas.width / 2, this.canvas.height / 2 + 50); // Modified text
    }

    drawWinScreen() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'gold';
        this.ctx.font = '60px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(this.config.winText, this.canvas.width / 2, this.canvas.height / 2 - 50);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '24px Arial';
        this.ctx.fillText('Press ENTER to Play Again', this.canvas.width / 2, this.canvas.height / 2 + 50); // Modified text
    }
}

// Global variable for the game instance
declare global {
    interface Window {
        game: Game;
    }
}

// Entry point: fetch data.json and start the game
document.addEventListener('DOMContentLoaded', () => {
    fetch('data.json')
        .then(response => response.json())
        .then((data: GameData) => {
            window.game = new Game('gameCanvas', data.gameConfig);
        })
        .catch(error => {
            console.error('Error loading game data:', error);
            // If fetch fails, we can't create the Game instance with the config.
            // A minimal error display here would require creating a Canvas and drawing to it,
            // but the Game class itself is designed to handle this once instantiated.
            // For now, rely on the console error.
            const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    canvas.width = 800; // default size if config not loaded
                    canvas.height = 600;
                    ctx.fillStyle = 'black';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = 'red';
                    ctx.font = '30px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('FATAL ERROR: Failed to load data.json!', canvas.width / 2, canvas.height / 2 - 20);
                    ctx.font = '20px Arial';
                    ctx.fillText('Check console for details.', canvas.width / 2, canvas.height / 2 + 20);
                }
            }
        });
});
export {};