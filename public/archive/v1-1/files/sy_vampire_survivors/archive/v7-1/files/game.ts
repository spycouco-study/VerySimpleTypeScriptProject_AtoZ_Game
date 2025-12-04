// Define interfaces for game data and player state
interface Player {
    level: number;
    experience: number;
    nextLevelExp: number;
    attackCooldown: number;
    numberOfAttacks: number;
    speed: number;
    maxHealth: number;
    health: number;
    damage: number;
    // Add other player properties if they are used elsewhere and not defined in data.json's player section directly
    // e.g., position, current status, etc.
}

interface GameplayConfig {
    enemySpawnInterval: number;
    initialEnemyCount: number;
    maxEnemies: number;
    levelUpExpMultiplier: number;
    attackSpeedIncreasePerLevel: number;
}

interface LevelUpOption {
    name: string;
    description: string;
    effect: string;
}

interface UIConfig {
    font: string;
    textColor: string;
    titleScreenText: string;
    gameOverText: string;
    levelUpText: string;
    levelUpOptions: LevelUpOption[];
}

interface AssetInfo {
    name: string;
    path: string;
    width?: number;
    height?: number;
    duration_seconds?: number;
    volume?: number;
}

interface GameData {
    canvas: { width: number; height: number; };
    player: {
        speed: number;
        maxHealth: number;
        baseDamage: number;
        attackCooldown: number;
        projectileSpeed: number;
        projectileLifetime: number;
        assetName: string;
        weaponAsset: string;
        expGemAttractRadius: number;
        expBarWidth: number;
        expBarHeight: number;
        healthBarWidth: number;
        healthBarHeight: number;
        playerSize: number;
        baseNumberOfAttacks: number;
        attackSpreadAngle: number;
    };
    enemies: Array<any>; // Placeholder for enemy type, can be refined if needed
    projectiles: { assetName: string; size: number; };
    experienceGems: { assetName: string; baseValue: number; size: number; };
    gameplay: GameplayConfig;
    ui: UIConfig;
    assets: {
        images: AssetInfo[];
        sounds: AssetInfo[];
    };
}

// Define GameState enum
enum GameState {
    TITLE_SCREEN,
    PLAYING,
    PAUSED,
    LEVEL_UP,
    GAME_OVER,
    // Add other game states as necessary
}

// Declare global variables. In a full game, these would be initialized
// after loading data.json and setting up the game environment.
// For compilation purposes, we provide minimal placeholder initializations.
let player: Player = {
    level: 1,
    experience: 0,
    nextLevelExp: 100, // Example initial value
    attackCooldown: 0.5,
    numberOfAttacks: 1, // Example initial value
    speed: 150,
    maxHealth: 100,
    health: 100,
    damage: 10
};

let gameData: GameData = {
    canvas: { width: 900, height: 600 },
    player: {
        speed: 150, maxHealth: 100, baseDamage: 10, attackCooldown: 0.5,
        projectileSpeed: 300, projectileLifetime: 3, assetName: "player",
        weaponAsset: "player_bullet", expGemAttractRadius: 100,
        expBarWidth: 200, expBarHeight: 15, healthBarWidth: 150,
        healthBarHeight: 20, playerSize: 50, baseNumberOfAttacks: 3,
        attackSpreadAngle: 30
    },
    enemies: [], // Empty array for placeholder
    projectiles: { assetName: "player_bullet", size: 20 },
    experienceGems: { assetName: "exp_gem", baseValue: 10, size: 20 },
    gameplay: {
        enemySpawnInterval: 2,
        initialEnemyCount: 5,
        maxEnemies: 50,
        levelUpExpMultiplier: 1.5,
        attackSpeedIncreasePerLevel: 0.03
    },
    ui: {
        font: "Arial", textColor: "white",
        titleScreenText: "Press any key or click to start!",
        gameOverText: "GAME OVER!", levelUpText: "LEVEL UP!",
        levelUpOptions: [
            { name: "Increase Speed", description: "Moves 0.5 units faster", effect: "player.speed += 50;" }
        ] // Minimal options for placeholder
    },
    assets: { images: [], sounds: [] } // Empty arrays for placeholder
};

let gameState: GameState = GameState.TITLE_SCREEN; // Example initial state

function playerLevelUp(): void {
    player.level++;
    player.experience -= player.nextLevelExp; // Deduct only the required experience
    player.nextLevelExp = Math.floor(player.nextLevelExp * gameData.gameplay.levelUpExpMultiplier);

    // NEW: Increase attack speed (reduce attack cooldown) with each level up
    // Ensure cooldown doesn't become too small (e.g., negative or zero), setting a minimum of 0.05 seconds
    player.attackCooldown = Math.max(0.05, player.attackCooldown * (1 - gameData.gameplay.attackSpeedIncreasePerLevel));

    // When the level becomes an even number, increase the number of attacks by one.
    // This addresses the user's request that attacks should increase on even levels.
    if (player.level % 2 === 0) {
        player.numberOfAttacks++;
        console.log(`[Level Up Info] Player leveled up to ${player.level} (even). Number of attacks increased to ${player.numberOfAttacks}.`);
    } else {
        console.log(`[Level Up Info] Player leveled up to ${player.level} (odd). Number of attacks remains at ${player.numberOfAttacks}.`);
    }

    // Transition to LEVEL_UP state to pause and display choices
    gameState = GameState.LEVEL_UP;
    // Sound will be played once 'Enter' is pressed and option is chosen
}