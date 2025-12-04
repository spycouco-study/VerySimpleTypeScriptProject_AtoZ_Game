"use strict";
// game.ts
// 1. Type Declarations & Interfaces
var GameState;
(function (GameState) {
    GameState[GameState["TITLE"] = 0] = "TITLE";
    GameState[GameState["PLAYING"] = 1] = "PLAYING";
    GameState[GameState["GAME_CLEAR"] = 2] = "GAME_CLEAR";
    GameState[GameState["GAME_OVER"] = 3] = "GAME_OVER";
})(GameState || (GameState = {}));
// 2. Global Variables & Asset Maps
let game;
let data;
const loadedImages = new Map();
const loadedSounds = new Map();
// 3. Helper Functions
/**
 * Performs AABB (Axis-Aligned Bounding Box) collision detection.
 * @param rect1 First rectangle {x, y, width, height}
 * @param rect2 Second rectangle {x, y, width, height}
 * @returns True if rectangles overlap, false otherwise.
 */
function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y;
}
/**
 * Plays a sound by its name.
 * @param name The name of the sound asset.
 * @param loop If true, the sound will loop. Overrides data.json setting if specified.
 */
function playSound(name, loop) {
    const audio = loadedSounds.get(name);
    if (audio) {
        audio.currentTime = 0; // Rewind to start
        audio.loop = loop !== undefined ? loop : audio.loop;
        audio.play().catch(e => console.warn(`Error playing sound ${name}:`, e));
    }
    else {
        console.warn(`Sound "${name}" not found.`);
    }
}
/**
 * Stops a sound by its name.
 * @param name The name of the sound asset.
 */
function stopSound(name) {
    const audio = loadedSounds.get(name);
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
    }
}
// 4. Base Classes
class Camera {
    constructor(canvasWidth, canvasHeight, mapWidth, mapHeight) {
        this.x = 0;
        this.y = 0;
        this.width = canvasWidth;
        this.height = canvasHeight;
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
    }
    /**
     * Updates the camera position to center on a target object.
     * @param target The object to center the camera on.
     */
    update(target) {
        this.x = target.x - this.width / 2 + target.width / 2;
        this.y = target.y - this.height / 2 + target.height / 2;
        // Clamp camera to map boundaries
        this.x = Math.max(0, Math.min(this.x, this.mapWidth - this.width));
        this.y = Math.max(0, Math.min(this.y, this.mapHeight - this.height));
    }
    /**
     * Converts a world coordinate to a screen coordinate for drawing.
     * @param worldX X coordinate in world space.
     * @returns X coordinate in screen space.
     */
    toScreenX(worldX) {
        return worldX - this.x;
    }
    /**
     * Converts a world coordinate to a screen coordinate for drawing.
     * @param worldY Y coordinate in world space.
     * @returns Y coordinate in screen space.
     */
    toScreenY(worldY) {
        return worldY - this.y;
    }
}
class GameObject {
    constructor(x, y, width, height, spriteName) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.spriteName = spriteName;
        this.image = loadedImages.get(spriteName) || null;
        this.isAlive = true;
    }
    /**
     * Draws the object on the canvas, considering camera offset.
     * @param ctx The 2D rendering context.
     * @param camera The game camera.
     */
    draw(ctx, camera) {
        if (this.image && this.isAlive) {
            ctx.drawImage(this.image, camera.toScreenX(this.x), camera.toScreenY(this.y), this.width, this.height);
        }
    }
}
// 5. Game Entity Classes
class Player extends GameObject {
    constructor(config) {
        super(config.initialX, config.initialY, config.width, config.height, config.sprite);
        this.speed = data.gameSettings.playerSpeed;
        this.inventory = new Map();
        this.maxRecyclables = config.maxRecyclables;
        this.companionMonsters = [];
        this.maxCompanionMonsters = config.maxCompanionMonsters;
        this.messages = [];
    }
    /**
     * Displays a temporary message on the screen.
     * @param text The message to display.
     * @param durationMs How long the message should be visible in milliseconds.
     */
    showMessage(text, durationMs = 2000) {
        this.messages.push({ text, timer: durationMs });
    }
    /**
     * Updates player movement and message timers.
     * @param deltaTime The time elapsed since the last update in seconds.
     * @param keysPressed An object indicating which keys are currently pressed.
     * @param mapCollisions Array of collision rectangles for the map.
     * @param mapWidth The width of the game map.
     * @param mapHeight The height of the game map.
     */
    update(deltaTime, keysPressed, mapCollisions, mapWidth, mapHeight) {
        let newX = this.x;
        let newY = this.y;
        if (keysPressed['ArrowUp'])
            newY -= this.speed * deltaTime;
        if (keysPressed['ArrowDown'])
            newY += this.speed * deltaTime;
        if (keysPressed['ArrowLeft'])
            newX -= this.speed * deltaTime;
        if (keysPressed['ArrowRight'])
            newX += this.speed * deltaTime;
        // Clamp to map boundaries
        newX = Math.max(0, Math.min(newX, mapWidth - this.width));
        newY = Math.max(0, Math.min(newY, mapHeight - this.height));
        // Collision detection for X movement
        let canMoveX = true;
        const testRectX = { x: newX, y: this.y, width: this.width, height: this.height };
        for (const wall of mapCollisions) {
            if (checkCollision(testRectX, wall)) {
                canMoveX = false;
                break;
            }
        }
        if (canMoveX)
            this.x = newX;
        // Collision detection for Y movement
        let canMoveY = true;
        const testRectY = { x: this.x, y: newY, width: this.width, height: this.height };
        for (const wall of mapCollisions) {
            if (checkCollision(testRectY, wall)) {
                canMoveY = false;
                break;
            }
        }
        if (canMoveY)
            this.y = newY;
        // Update messages
        this.messages = this.messages.filter(msg => {
            msg.timer -= deltaTime * 1000;
            return msg.timer > 0;
        });
    }
    /**
     * Adds a recyclable item to the inventory.
     * @param recyclableId The ID of the recyclable item.
     */
    addRecyclable(recyclableId) {
        let currentTotal = 0;
        this.inventory.forEach(count => currentTotal += count);
        if (currentTotal >= this.maxRecyclables) {
            this.showMessage(data.uiMessages.inventoryFull);
            return;
        }
        const currentCount = this.inventory.get(recyclableId) || 0;
        this.inventory.set(recyclableId, currentCount + 1);
        playSound('sfx_collect');
    }
    /**
     * Uses recyclables from inventory.
     * @param recyclableId The ID of the recyclable to use.
     * @param count The number of items to use.
     * @returns True if items were used, false otherwise.
     */
    useRecyclables(recyclableId, count) {
        const currentCount = this.inventory.get(recyclableId) || 0;
        if (currentCount >= count) {
            this.inventory.set(recyclableId, currentCount - count);
            if (this.inventory.get(recyclableId) === 0) {
                this.inventory.delete(recyclableId);
            }
            return true;
        }
        return false;
    }
    /**
     * Calculates the total number of recyclables in the inventory.
     * @returns The total count of recyclables.
     */
    inventoryTotal() {
        let total = 0;
        this.inventory.forEach(count => total += count);
        return total;
    }
}
class Recyclable extends GameObject {
    constructor(x, y, config) {
        super(x, y, config.width, config.height, config.sprite);
        this.id = config.id;
        this.name = config.name;
    }
}
var MonsterState;
(function (MonsterState) {
    MonsterState[MonsterState["IDLE"] = 0] = "IDLE";
    MonsterState[MonsterState["WANDERING"] = 1] = "WANDERING";
    MonsterState[MonsterState["CHASING"] = 2] = "CHASING";
    MonsterState[MonsterState["COMBAT"] = 3] = "COMBAT";
})(MonsterState || (MonsterState = {}));
class Monster extends GameObject {
    constructor(x, y, config) {
        super(x, y, config.width, config.height, config.sprite);
        this.id = config.id;
        this.name = config.name;
        this.hp = config.baseHp;
        this.maxHp = config.baseHp;
        this.atk = config.baseAtk;
        this.speed = config.speed;
        this.combatRange = config.combatRange;
        this.state = MonsterState.IDLE;
        this.target = null;
        this.combatCooldown = 0;
        this.maxCombatCooldown = 0.5; // Attack every 0.5 seconds
        this.level = 1;
        this.despawnTimer = -1; // -1 means not despawning
    }
    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp < 0)
            this.hp = 0;
        if (this.hp === 0)
            this.isAlive = false;
    }
    startDespawn(delayMs) {
        this.despawnTimer = delayMs;
        playSound('sfx_defeat');
    }
    draw(ctx, camera) {
        super.draw(ctx, camera);
        if (!this.isAlive)
            return;
        // Draw HP bar
        const screenX = camera.toScreenX(this.x);
        const screenY = camera.toScreenY(this.y);
        const barWidth = this.width;
        const barHeight = 5;
        const hpPercentage = this.hp / this.maxHp;
        ctx.fillStyle = 'black';
        ctx.fillRect(screenX, screenY - barHeight - 2, barWidth, barHeight);
        ctx.fillStyle = hpPercentage > 0.3 ? 'lime' : 'red';
        ctx.fillRect(screenX, screenY - barHeight - 2, barWidth * hpPercentage, barHeight);
        ctx.strokeStyle = 'black';
        ctx.strokeRect(screenX, screenY - barHeight - 2, barWidth, barHeight);
    }
}
class PlayerMonster extends Monster {
    constructor(x, y, config, leader, followOffset) {
        super(x, y, config);
        this.levelUpHp = config.levelUpHp || 0;
        this.levelUpAtk = config.levelUpAtk || 0;
        this.followOffset = followOffset;
        this.leader = leader;
    }
    update(deltaTime, wildMonsters, mapCollisions, mapWidth, mapHeight) {
        if (!this.isAlive)
            return;
        if (this.despawnTimer > 0) {
            this.despawnTimer -= deltaTime * 1000;
            if (this.despawnTimer <= 0) {
                this.isAlive = false;
            }
            return;
        }
        // Find nearest wild monster
        let nearestWildMonster = null;
        let minDistanceSq = Infinity;
        for (const wildMon of wildMonsters) {
            if (!wildMon.isAlive)
                continue;
            const distSq = (this.x - wildMon.x) ** 2 + (this.y - wildMon.y) ** 2;
            if (distSq < minDistanceSq) {
                minDistanceSq = distSq;
                nearestWildMonster = wildMon;
            }
        }
        const followX = this.leader.x + this.followOffset.x;
        const followY = this.leader.y + this.followOffset.y;
        const distanceToFollowPointSq = (this.x - followX) ** 2 + (this.y - followY) ** 2;
        const followThresholdSq = (this.speed * deltaTime * 2) ** 2; // If further than 2x movement range, start moving
        if (nearestWildMonster && Math.sqrt(minDistanceSq) < this.combatRange * 5) { // Prioritize combat if wild monster is somewhat nearby
            this.target = nearestWildMonster;
            this.state = MonsterState.CHASING;
        }
        else if (distanceToFollowPointSq > followThresholdSq) { // Else, follow player
            this.target = null;
            this.state = MonsterState.CHASING; // Re-use chasing for following
        }
        else {
            this.state = MonsterState.IDLE;
        }
        // Movement logic
        let targetX = this.x;
        let targetY = this.y;
        if (this.state === MonsterState.CHASING) {
            if (this.target) { // Chasing a wild monster
                targetX = this.target.x;
                targetY = this.target.y;
            }
            else { // Following player
                targetX = followX;
                targetY = followY;
            }
            const angle = Math.atan2(targetY - this.y, targetX - this.x);
            const moveX = Math.cos(angle) * this.speed * deltaTime;
            const moveY = Math.sin(angle) * this.speed * deltaTime;
            let newX = this.x + moveX;
            let newY = this.y + moveY;
            // Clamp to map boundaries
            newX = Math.max(0, Math.min(newX, mapWidth - this.width));
            newY = Math.max(0, Math.min(newY, mapHeight - this.height));
            // Collision detection for X movement
            let canMoveX = true;
            const testRectX = { x: newX, y: this.y, width: this.width, height: this.height };
            for (const wall of mapCollisions) {
                if (checkCollision(testRectX, wall)) {
                    canMoveX = false;
                    break;
                }
            }
            if (canMoveX)
                this.x = newX;
            // Collision detection for Y movement
            let canMoveY = true;
            const testRectY = { x: this.x, y: newY, width: this.width, height: this.height };
            for (const wall of mapCollisions) {
                if (checkCollision(testRectY, wall)) {
                    canMoveY = false;
                    break;
                }
            }
            if (canMoveY)
                this.y = newY;
        }
        // Combat logic
        if (this.target && this.target.isAlive && Math.sqrt(minDistanceSq) < this.combatRange) {
            this.state = MonsterState.COMBAT;
            this.combatCooldown -= deltaTime;
            if (this.combatCooldown <= 0) {
                this.target.takeDamage(this.atk);
                playSound('sfx_hit');
                if (!this.target.isAlive) { // Target defeated
                    this.levelUp();
                    this.target.startDespawn(data.gameSettings.monsterDespawnDelayMs);
                    this.target = null; // Clear target
                    this.state = MonsterState.IDLE;
                    this.leader.showMessage(data.uiMessages.wildMonsterCleared);
                }
                this.combatCooldown = this.maxCombatCooldown;
            }
        }
    }
    levelUp() {
        this.level++;
        this.maxHp += this.levelUpHp;
        this.hp = this.maxHp; // Restore HP on level up
        this.atk += this.levelUpAtk;
        playSound('sfx_levelup');
    }
}
class WildMonster extends Monster {
    constructor(x, y, config) {
        super(x, y, config);
        this.wanderDurationMin = config.wanderDurationMin || 1;
        this.wanderDurationMax = config.wanderDurationMax || 3;
        this.wanderTimer = 0;
        this.wanderTargetX = x;
        this.wanderTargetY = y;
        this.state = MonsterState.WANDERING; // Wild monsters start wandering
        this.pickNewWanderTarget();
    }
    /**
     * Picks a new random target for wandering within a certain radius.
     */
    pickNewWanderTarget() {
        const wanderRadius = 150; // How far it can wander from current position
        this.wanderTargetX = this.x + (Math.random() * 2 - 1) * wanderRadius;
        this.wanderTargetY = this.y + (Math.random() * 2 - 1) * wanderRadius;
        this.wanderTimer = this.wanderDurationMin + Math.random() * (this.wanderDurationMax - this.wanderDurationMin);
    }
    update(deltaTime, mapWidth, mapHeight, mapCollisions, playerMonsters) {
        if (!this.isAlive)
            return;
        if (this.despawnTimer > 0) {
            this.despawnTimer -= deltaTime * 1000;
            if (this.despawnTimer <= 0) {
                this.isAlive = false;
            }
            return;
        }
        // Find nearest player monster
        let nearestPlayerMonster = null;
        let minDistanceSq = Infinity;
        for (const playerMon of playerMonsters) {
            if (!playerMon.isAlive)
                continue;
            const distSq = (this.x - playerMon.x) ** 2 + (this.y - playerMon.y) ** 2;
            if (distSq < minDistanceSq) {
                minDistanceSq = distSq;
                nearestPlayerMonster = playerMon;
            }
        }
        if (nearestPlayerMonster && Math.sqrt(minDistanceSq) < this.combatRange * 5) { // If player monster is somewhat nearby
            this.target = nearestPlayerMonster;
            this.state = MonsterState.CHASING;
        }
        else {
            this.target = null;
            this.state = MonsterState.WANDERING;
        }
        // Movement logic
        let targetX = this.x;
        let targetY = this.y;
        if (this.state === MonsterState.CHASING && this.target) {
            targetX = this.target.x;
            targetY = this.target.y;
        }
        else if (this.state === MonsterState.WANDERING) {
            this.wanderTimer -= deltaTime;
            if (this.wanderTimer <= 0 || (Math.abs(this.x - this.wanderTargetX) < 5 && Math.abs(this.y - this.wanderTargetY) < 5)) {
                this.pickNewWanderTarget();
            }
            targetX = this.wanderTargetX;
            targetY = this.wanderTargetY;
        }
        const angle = Math.atan2(targetY - this.y, targetX - this.x);
        const moveX = Math.cos(angle) * this.speed * deltaTime;
        const moveY = Math.sin(angle) * this.speed * deltaTime;
        let newX = this.x + moveX;
        let newY = this.y + moveY;
        // Clamp to map boundaries
        newX = Math.max(0, Math.min(newX, mapWidth - this.width));
        newY = Math.max(0, Math.min(newY, mapHeight - this.height));
        // Collision detection for X movement
        let canMoveX = true;
        const testRectX = { x: newX, y: this.y, width: this.width, height: this.height };
        for (const wall of mapCollisions) {
            if (checkCollision(testRectX, wall)) {
                canMoveX = false;
                break;
            }
        }
        if (canMoveX)
            this.x = newX;
        // Collision detection for Y movement
        let canMoveY = true;
        const testRectY = { x: this.x, y: newY, width: this.width, height: this.height };
        for (const wall of mapCollisions) {
            if (checkCollision(testRectY, wall)) {
                canMoveY = false;
                break;
            }
        }
        if (canMoveY)
            this.y = newY;
        // Combat logic
        if (this.target && this.target.isAlive && Math.sqrt(minDistanceSq) < this.combatRange) {
            this.state = MonsterState.COMBAT;
            this.combatCooldown -= deltaTime;
            if (this.combatCooldown <= 0) {
                this.target.takeDamage(this.atk);
                playSound('sfx_hit');
                if (!this.target.isAlive) { // Target defeated
                    this.target.startDespawn(data.gameSettings.monsterDespawnDelayMs);
                    this.target = null;
                    this.state = MonsterState.WANDERING; // Go back to wandering
                    this.pickNewWanderTarget(); // Pick new target
                }
                this.combatCooldown = this.maxCombatCooldown;
            }
        }
    }
}
// 6. Main Game Class
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = data.gameSettings.canvasWidth;
        this.canvas.height = data.gameSettings.canvasHeight;
        this.camera = new Camera(this.canvas.width, this.canvas.height, data.gameSettings.mapWidth, data.gameSettings.mapHeight);
        this.player = new Player(data.player);
        this.recyclables = [];
        this.wildMonsters = [];
        this.gameState = GameState.TITLE;
        this.lastTime = 0;
        this.keysPressed = {};
        this.isCombiningMonsters = false;
        this.selectedRecyclableForCombine = null;
        this.combineCount = 0;
        this.currentUIMessage = "";
        this.uiMessageTimer = 0;
        this.setupEventListeners();
    }
    /**
     * Sets up keyboard and mouse event listeners.
     */
    setupEventListeners() {
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
        this.canvas.addEventListener('click', this.handleClick.bind(this));
    }
    /**
     * Handles keydown events for player movement and interactions.
     * @param event The keyboard event.
     */
    handleKeyDown(event) {
        this.keysPressed[event.key] = true;
        if (this.gameState === GameState.PLAYING) {
            if (event.key === ' ') { // Spacebar for item collection
                this.interactWithRecyclables();
            }
            else if (event.key === 'p' || event.key === 'P') { // 'P' key for monster combination
                this.isCombiningMonsters = !this.isCombiningMonsters;
                this.selectedRecyclableForCombine = null;
                this.combineCount = 0;
            }
            else if (this.isCombiningMonsters) {
                const numKey = parseInt(event.key, 10);
                if (!isNaN(numKey) && numKey > 0) {
                    this.tryCombineMonster(numKey - 1); // 0-indexed for simplicity
                }
            }
        }
        else if (this.gameState === GameState.TITLE || this.gameState === GameState.GAME_CLEAR || this.gameState === GameState.GAME_OVER) {
            // Any key to restart/start from title
            this.handleClick();
        }
    }
    /**
     * Handles keyup events to clear key pressed state.
     * @param event The keyboard event.
     */
    handleKeyUp(event) {
        this.keysPressed[event.key] = false;
    }
    /**
     * Handles click events, primarily for starting the game from the title screen.
     */
    handleClick() {
        if (this.gameState === GameState.TITLE) {
            this.setState(GameState.PLAYING);
            this.startGame();
        }
        else if (this.gameState === GameState.GAME_CLEAR || this.gameState === GameState.GAME_OVER) {
            this.setState(GameState.TITLE);
            this.resetGame();
        }
    }
    /**
     * Sets the current game state and performs related actions.
     * @param newState The new game state.
     */
    setState(newState) {
        this.gameState = newState;
        if (newState === GameState.PLAYING) {
            playSound('bgm_main', true);
        }
        else {
            stopSound('bgm_main');
        }
    }
    /**
     * Starts the game, spawning initial items and monsters.
     */
    startGame() {
        this.spawnRecyclables(data.gameSettings.recyclableSpawnCount);
        this.spawnWildMonsters(data.gameSettings.wildMonsterSpawnCount);
    }
    /**
     * Resets the game state to prepare for a new game.
     */
    resetGame() {
        this.player = new Player(data.player);
        this.recyclables = [];
        this.wildMonsters = [];
        this.isCombiningMonsters = false;
        this.selectedRecyclableForCombine = null;
        this.combineCount = 0;
        this.currentUIMessage = "";
        this.uiMessageTimer = 0;
    }
    /**
     * Spawns recyclable items randomly on the map.
     * @param count The number of recyclables to spawn.
     */
    spawnRecyclables(count) {
        for (let i = 0; i < count; i++) {
            const config = data.recyclables[Math.floor(Math.random() * data.recyclables.length)];
            let x, y;
            let collisionDetected;
            do {
                collisionDetected = false;
                x = Math.random() * (data.gameSettings.mapWidth - config.width);
                y = Math.random() * (data.gameSettings.mapHeight - config.height);
                const itemRect = { x, y, width: config.width, height: config.height };
                for (const wall of data.mapCollisions) {
                    if (checkCollision(itemRect, wall)) {
                        collisionDetected = true;
                        break;
                    }
                }
            } while (collisionDetected);
            this.recyclables.push(new Recyclable(x, y, config));
        }
    }
    /**
     * Spawns wild monsters randomly on the map.
     * @param count The number of wild monsters to spawn.
     */
    spawnWildMonsters(count) {
        for (let i = 0; i < count; i++) {
            const config = data.wildMonsters[Math.floor(Math.random() * data.wildMonsters.length)];
            let x, y;
            let collisionDetected;
            do {
                collisionDetected = false;
                x = Math.random() * (data.gameSettings.mapWidth - config.width);
                y = Math.random() * (data.gameSettings.mapHeight - config.height);
                const monsterRect = { x, y, width: config.width, height: config.height };
                for (const wall of data.mapCollisions) {
                    if (checkCollision(monsterRect, wall)) {
                        collisionDetected = true;
                        break;
                    }
                }
            } while (collisionDetected);
            this.wildMonsters.push(new WildMonster(x, y, config));
        }
    }
    /**
     * Handles player interaction with nearby recyclables.
     */
    interactWithRecyclables() {
        this.recyclables = this.recyclables.filter(item => {
            if (checkCollision(this.player, item)) {
                this.player.addRecyclable(item.id);
                return false; // Remove item from field
            }
            return true;
        });
    }
    /**
     * Attempts to combine recyclables into a monster based on a selected recipe.
     * @param selectedOptionIndex The index of the item type the player wants to use.
     */
    tryCombineMonster(selectedOptionIndex) {
        const availableRecyclableTypes = Array.from(this.player.inventory.keys());
        if (selectedOptionIndex < 0 || selectedOptionIndex >= availableRecyclableTypes.length) {
            return; // Invalid selection
        }
        const selectedRecyclableId = availableRecyclableTypes[selectedOptionIndex];
        if (this.selectedRecyclableForCombine === selectedRecyclableId) {
            this.combineCount++;
        }
        else {
            this.selectedRecyclableForCombine = selectedRecyclableId;
            this.combineCount = 1;
        }
        // Find a matching recipe
        const recipe = data.monsterCombinations.find(r => {
            // Check if inputRecyclables for this recipe contains enough of selectedRecyclableId
            // And if player actually has enough.
            const requiredCountForSelected = r.inputRecyclables.filter(id => id === selectedRecyclableId).length;
            return requiredCountForSelected > 0 && this.combineCount >= requiredCountForSelected;
        });
        if (recipe) {
            // Check if player has all ingredients for the recipe
            let canCombine = true;
            const requiredItems = new Map();
            recipe.inputRecyclables.forEach(itemId => {
                requiredItems.set(itemId, (requiredItems.get(itemId) || 0) + 1);
            });
            for (const [itemId, count] of requiredItems.entries()) {
                if ((this.player.inventory.get(itemId) || 0) < count) {
                    canCombine = false;
                    break;
                }
            }
            if (canCombine) {
                if (this.player.companionMonsters.filter(m => m.isAlive).length >= this.player.maxCompanionMonsters) {
                    this.player.showMessage(data.uiMessages.companionLimitReached);
                    this.selectedRecyclableForCombine = null;
                    this.combineCount = 0;
                    return;
                }
                // Consume items
                for (const [itemId, count] of requiredItems.entries()) {
                    this.player.useRecyclables(itemId, count);
                }
                // Create monster
                const monsterConfig = data.playerMonsters.find(m => m.id === recipe.outputMonsterId);
                if (monsterConfig) {
                    const existingPlayerMonstersCount = this.player.companionMonsters.filter(m => m.isAlive).length;
                    const offsetAngle = (existingPlayerMonstersCount / this.player.maxCompanionMonsters) * 2 * Math.PI;
                    const offsetRadius = 60;
                    const offsetX = Math.cos(offsetAngle) * offsetRadius;
                    const offsetY = Math.sin(offsetAngle) * offsetRadius;
                    const newMonster = new PlayerMonster(this.player.x + offsetX, this.player.y + offsetY, monsterConfig, this.player, { x: offsetX, y: offsetY });
                    this.player.companionMonsters.push(newMonster);
                    this.player.showMessage(data.uiMessages.monsterCreated);
                    playSound('sfx_combine');
                }
                this.selectedRecyclableForCombine = null; // Reset selection after successful combine
                this.combineCount = 0;
            }
            else {
                this.player.showMessage(data.uiMessages.notEnoughRecyclables);
            }
        }
        else if (this.combineCount > 0) { // If player is trying but no recipe matches
            // For prototype, keep it simple and just don't combine
        }
    }
    /**
     * Main game update loop.
     * @param currentTime The current timestamp provided by requestAnimationFrame.
     */
    update(currentTime) {
        const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
        this.lastTime = currentTime;
        if (this.gameState === GameState.PLAYING) {
            this.player.update(deltaTime, this.keysPressed, data.mapCollisions, data.gameSettings.mapWidth, data.gameSettings.mapHeight);
            this.camera.update(this.player);
            // Update player's companion monsters
            this.player.companionMonsters.forEach(monster => {
                if (monster.isAlive) {
                    monster.update(deltaTime, this.wildMonsters, data.mapCollisions, data.gameSettings.mapWidth, data.gameSettings.mapHeight);
                }
            });
            // Clean up defeated player monsters, but keep despawning ones
            this.player.companionMonsters = this.player.companionMonsters.filter(m => m.isAlive || m.despawnTimer > 0);
            // Update wild monsters
            this.wildMonsters.forEach(monster => {
                if (monster.isAlive) {
                    monster.update(deltaTime, data.gameSettings.mapWidth, data.gameSettings.mapHeight, data.mapCollisions, this.player.companionMonsters);
                }
            });
            // Clean up defeated wild monsters, but keep despawning ones
            this.wildMonsters = this.wildMonsters.filter(m => m.isAlive || m.despawnTimer > 0);
            // Check game clear condition
            if (this.wildMonsters.filter(m => m.isAlive).length === 0) {
                if (this.gameState === GameState.PLAYING) {
                    this.setState(GameState.GAME_CLEAR);
                }
            }
            // Game over condition: All player's companion monsters are defeated,
            // AND the player has at least one companion monster currently or previously,
            // AND there are still wild monsters remaining.
            const activePlayerMonstersCount = this.player.companionMonsters.filter(m => m.isAlive).length;
            const wildMonstersRemainingCount = this.wildMonsters.filter(m => m.isAlive).length;
            if (this.player.companionMonsters.length > 0 && // Player has *ever* had a monster
                activePlayerMonstersCount === 0 && // And now has no active monsters
                wildMonstersRemainingCount > 0) { // And there are still wild monsters to fight
                if (this.gameState === GameState.PLAYING) {
                    this.setState(GameState.GAME_OVER);
                    this.player.showMessage(data.uiMessages.playerMonsterDefeated);
                }
            }
        }
        this.render();
        requestAnimationFrame(this.update.bind(this));
    }
    /**
     * Draws all game elements on the canvas.
     */
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // Always draw a background for visibility in all states.
        // It will be overwritten by the game-specific background in PLAYING state.
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.font = '20px Arial';
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'center';
        if (this.gameState === GameState.TITLE) {
            this.ctx.fillText(data.gameSettings.titleScreenText, this.canvas.width / 2, this.canvas.height / 2);
        }
        else if (this.gameState === GameState.GAME_CLEAR) {
            this.ctx.fillText(data.gameSettings.gameClearText, this.canvas.width / 2, this.canvas.height / 2);
        }
        else if (this.gameState === GameState.GAME_OVER) {
            this.ctx.fillText(data.gameSettings.gameOverText, this.canvas.width / 2, this.canvas.height / 2);
        }
        else if (this.gameState === GameState.PLAYING) {
            // Draw background (specific for PLAYING state)
            this.ctx.fillStyle = '#66BB66'; // Green for grass/city ground
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            // Draw map collision objects (walls/buildings)
            this.ctx.fillStyle = '#AAAAAA'; // Gray for walls
            for (const wall of data.mapCollisions) {
                this.ctx.fillRect(this.camera.toScreenX(wall.x), this.camera.toScreenY(wall.y), wall.width, wall.height);
            }
            // Draw recyclables
            this.recyclables.forEach(item => item.draw(this.ctx, this.camera));
            // Draw player
            this.player.draw(this.ctx, this.camera);
            // Draw player's companion monsters
            this.player.companionMonsters.forEach(monster => monster.draw(this.ctx, this.camera));
            // Draw wild monsters
            this.wildMonsters.forEach(monster => monster.draw(this.ctx, this.camera));
            // Draw UI
            this.drawUI();
            this.drawCombineUI();
            this.drawMessages();
        }
    }
    /**
     * Draws the main game UI (inventory, companion count).
     */
    drawUI() {
        this.ctx.font = '16px Arial';
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`재활용품: ${this.player.inventoryTotal()}/${this.player.maxRecyclables}`, 10, 20);
        this.ctx.fillText(`몬스터: ${this.player.companionMonsters.filter(m => m.isAlive).length}/${this.player.maxCompanionMonsters}`, 10, 40);
        this.ctx.fillText(`남은 야생 몬스터: ${this.wildMonsters.filter(m => m.isAlive).length}`, 10, 60);
    }
    /**
     * Draws temporary messages from the player's message queue.
     */
    drawMessages() {
        this.ctx.font = '20px Arial';
        this.ctx.fillStyle = 'yellow';
        this.ctx.textAlign = 'center';
        let yOffset = this.canvas.height - 40;
        for (const msg of this.player.messages) {
            this.ctx.fillText(msg.text, this.canvas.width / 2, yOffset);
            yOffset -= 25;
        }
    }
    /**
     * Draws the monster combination UI.
     */
    drawCombineUI() {
        if (!this.isCombiningMonsters)
            return;
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(this.canvas.width / 2 - 200, this.canvas.height / 2 - 150, 400, 300);
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'left';
        this.ctx.font = '20px Arial';
        this.ctx.fillText("몬스터 조합", this.canvas.width / 2 - 180, this.canvas.height / 2 - 120);
        this.ctx.font = '16px Arial';
        let y = this.canvas.height / 2 - 80;
        const availableRecyclableTypes = Array.from(this.player.inventory.keys());
        if (availableRecyclableTypes.length === 0) {
            this.ctx.fillText("소지한 재활용품이 없습니다.", this.canvas.width / 2 - 180, y);
            y += 20;
        }
        else {
            this.ctx.fillText("--- 소지 재활용품 ---", this.canvas.width / 2 - 180, y);
            y += 20;
            availableRecyclableTypes.forEach((id, index) => {
                const config = data.recyclables.find(r => r.id === id);
                if (config) {
                    this.ctx.fillText(`${index + 1}. ${config.name}: ${this.player.inventory.get(id) || 0}개`, this.canvas.width / 2 - 180, y);
                    y += 20;
                }
            });
        }
        y += 20;
        this.ctx.fillText(data.uiMessages.monsterCombinePrompt, this.canvas.width / 2 - 180, y);
        y += 20;
        if (this.selectedRecyclableForCombine) {
            const config = data.recyclables.find(r => r.id === this.selectedRecyclableForCombine);
            if (config) {
                this.ctx.fillText(`선택: ${config.name} (${this.combineCount}개)`, this.canvas.width / 2 - 180, y);
            }
        }
    }
}
// 7. Initialization & Entry Point
async function loadAssets(data) {
    const imagePromises = data.assets.images.map(asset => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = asset.path;
            img.onload = () => {
                loadedImages.set(asset.name, img);
                resolve();
            };
            img.onerror = () => reject(`Failed to load image: ${asset.path}`);
        });
    });
    const soundPromises = data.assets.sounds.map(asset => {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.src = asset.path;
            audio.volume = asset.volume;
            audio.loop = asset.loop;
            audio.oncanplaythrough = () => {
                loadedSounds.set(asset.name, audio);
                resolve();
            };
            audio.onerror = () => reject(`Failed to load sound: ${asset.path}`);
            audio.load(); // Start loading the audio
        });
    });
    await Promise.all([...imagePromises, ...soundPromises]);
}
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('data.json');
        data = await response.json();
        console.log("Game data loaded:", data);
        await loadAssets(data);
        console.log("Assets loaded.");
        game = new Game();
        game.lastTime = performance.now(); // Initialize lastTime
        requestAnimationFrame(game.update.bind(game)); // Start game loop
    }
    catch (error) {
        console.error("Failed to load game data or assets:", error);
    }
});
