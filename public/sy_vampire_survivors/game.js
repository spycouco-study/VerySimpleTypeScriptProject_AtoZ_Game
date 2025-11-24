var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2["TITLE"] = "TITLE";
  GameState2["PLAYING"] = "PLAYING";
  GameState2["LEVEL_UP"] = "LEVEL_UP";
  GameState2["GAME_OVER"] = "GAME_OVER";
  return GameState2;
})(GameState || {});
let canvas;
let ctx;
let gameData;
let assets = { images: /* @__PURE__ */ new Map(), sounds: /* @__PURE__ */ new Map() };
let player;
let enemies = [];
let projectiles = [];
let experienceGems = [];
let items = [];
let gameState = "TITLE" /* TITLE */;
let lastUpdateTime = 0;
let deltaTime = 0;
let keysPressed = {};
let lastEnemySpawnTime = 0;
let enemyIdCounter = 0;
let gameTimer = 0;
let finalSurvivalTime = 0;
let cameraX = 0;
let cameraY = 0;
let currentEffectiveMaxEnemies;
let currentEffectiveEnemySpawnInterval;
async function loadGameData() {
  try {
    const response = await fetch("data.json");
    gameData = await response.json();
    canvas = document.getElementById("gameCanvas");
    if (!canvas) {
      console.error('Canvas element with ID "gameCanvas" not found.');
      return;
    }
    ctx = canvas.getContext("2d");
    canvas.width = gameData.canvas.width;
    canvas.height = gameData.canvas.height;
    await loadAssets();
    initGame();
    gameLoop(0);
  } catch (error) {
    console.error("Failed to load game data or assets:", error);
  }
}
async function loadAssets() {
  const imagePromises = gameData.assets.images.map((img) => {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.src = img.path;
      image.onload = () => {
        assets.images.set(img.name, image);
        resolve();
      };
      image.onerror = () => {
        console.error(`Failed to load image: ${img.path}`);
        reject(new Error(`Failed to load image: ${img.path}`));
      };
    });
  });
  const soundPromises = gameData.assets.sounds.map((snd) => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.src = snd.path;
      audio.volume = snd.volume;
      audio.oncanplaythrough = () => {
        assets.sounds.set(snd.name, audio);
        resolve();
      };
      audio.onerror = () => {
        console.error(`Failed to load sound: ${snd.path}`);
        reject(new Error(`Failed to load sound: ${snd.path}`));
      };
    });
  });
  await Promise.all([...imagePromises, ...soundPromises]);
  console.log("All assets loaded.");
}
function initGame() {
  window.addEventListener("keydown", (e) => {
    keysPressed[e.key.toLowerCase()] = true;
    if (gameState === "TITLE" /* TITLE */) {
      startNewGame();
    } else if (gameState === "GAME_OVER" /* GAME_OVER */ && e.key.toLowerCase() === " ") {
      startNewGame();
    } else if (gameState === "LEVEL_UP" /* LEVEL_UP */ && e.key.toLowerCase() === " ") {
      if (gameData.ui.levelUpOptions.length > 0) {
        applyLevelUpEffect(gameData.ui.levelUpOptions[0]);
      }
      gameState = "PLAYING" /* PLAYING */;
      playSound("level_up");
    }
  });
  window.addEventListener("keyup", (e) => {
    keysPressed[e.key.toLowerCase()] = false;
  });
  canvas.addEventListener("click", () => {
    if (gameState === "TITLE" /* TITLE */) {
      startNewGame();
    }
  });
  gameState = "TITLE" /* TITLE */;
}
function startNewGame() {
  player = {
    x: gameData.canvas.mapWidth / 2,
    // Player starts in the center of the *map*
    y: gameData.canvas.mapHeight / 2,
    // Player starts in the center of the *map*
    dx: 0,
    dy: 0,
    health: gameData.player.maxHealth,
    maxHealth: gameData.player.maxHealth,
    speed: gameData.player.speed,
    damage: gameData.player.baseDamage,
    attackCooldown: gameData.player.attackCooldown,
    // Start with base cooldown
    currentAttackCooldown: 0,
    level: 1,
    experience: 0,
    nextLevelExp: 100,
    assetName: gameData.player.assetName,
    weaponAsset: gameData.player.weaponAsset,
    expGemAttractRadius: gameData.player.expGemAttractRadius,
    // Base value
    // Calculate player collision size as an average or representative dimension
    // Using average of drawWidth and drawHeight to maintain a similar 'size' feel for collision
    size: (gameData.player.playerDrawWidth + gameData.player.playerDrawHeight) / 2,
    // For collision detection
    drawWidth: gameData.player.playerDrawWidth,
    // For drawing the sprite
    drawHeight: gameData.player.playerDrawHeight,
    // For drawing the sprite
    numberOfAttacks: gameData.player.baseNumberOfAttacks,
    // Initial number of attacks
    // NEW: Item effect properties
    currentMagnetAttractRadius: gameData.player.expGemAttractRadius,
    // Start with base
    magnetEffectTimer: 0,
    specialAttackEffectTimer: 0,
    isSpecialAttacking: false,
    specialAttackFireCooldown: 0,
    // Ready to fire initially
    specialAttackBaseFireRate: gameData.player.specialAttackBaseFireRate,
    hitSoundCooldown: 0
    // NEW: Initialize to 0, ready to play sound
  };
  enemies = [];
  projectiles = [];
  experienceGems = [];
  items = [];
  lastEnemySpawnTime = 0;
  enemyIdCounter = 0;
  gameTimer = 0;
  finalSurvivalTime = 0;
  currentEffectiveMaxEnemies = gameData.gameplay.baseMaxEnemies;
  currentEffectiveEnemySpawnInterval = gameData.gameplay.baseEnemySpawnInterval;
  updateCamera();
  for (let i = 0; i < gameData.gameplay.initialEnemyCount; i++) {
    spawnSingleEnemy(true);
  }
  stopAllSounds();
  playBGM("bgm");
  gameState = "PLAYING" /* PLAYING */;
}
function stopAllSounds() {
  assets.sounds.forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
}
function playBGM(name) {
  const audio = assets.sounds.get(name);
  if (audio) {
    audio.loop = true;
    audio.play().catch((e) => console.warn("BGM playback failed (user interaction required):", e));
  }
}
function playSound(name) {
  const audio = assets.sounds.get(name);
  if (audio) {
    const clonedAudio = audio.cloneNode();
    clonedAudio.volume = audio.volume;
    clonedAudio.play().catch((e) => console.warn("SFX playback failed:", e));
  }
}
function gameLoop(currentTime) {
  deltaTime = (currentTime - lastUpdateTime) / 1e3;
  lastUpdateTime = currentTime;
  update(deltaTime);
  render();
  requestAnimationFrame(gameLoop);
}
function update(dt) {
  gameTimer += dt;
  if (gameState === "PLAYING" /* PLAYING */) {
    updatePlayer(dt);
    updateCamera();
    updateProjectiles(dt);
    updateEnemies(dt);
    updateExperienceGems(dt);
    updateItems(dt);
    checkCollisions();
    spawnEnemies(dt);
  }
}
function updatePlayer(dt) {
  player.dx = 0;
  player.dy = 0;
  if (keysPressed["w"] || keysPressed["arrowup"]) player.dy = -1;
  if (keysPressed["s"] || keysPressed["arrowdown"]) player.dy = 1;
  if (keysPressed["a"] || keysPressed["arrowleft"]) player.dx = -1;
  if (keysPressed["d"] || keysPressed["arrowright"]) player.dx = 1;
  if (player.dx !== 0 && player.dy !== 0) {
    const magnitude = Math.sqrt(player.dx * player.dx + player.dy * player.dy);
    player.dx /= magnitude;
    player.dy /= magnitude;
  }
  player.x += player.dx * player.speed * dt;
  player.y += player.dy * player.speed * dt;
  player.x = Math.max(player.size / 2, Math.min(gameData.canvas.mapWidth - player.size / 2, player.x));
  player.y = Math.max(player.size / 2, Math.min(gameData.canvas.mapHeight - player.size / 2, player.y));
  if (player.hitSoundCooldown > 0) {
    player.hitSoundCooldown -= dt;
  }
  if (player.magnetEffectTimer > 0) {
    player.magnetEffectTimer -= dt;
    if (player.magnetEffectTimer <= 0) {
      player.magnetEffectTimer = 0;
      player.currentMagnetAttractRadius = gameData.player.expGemAttractRadius;
      console.log("Magnet effect ended.");
    }
  }
  if (player.specialAttackEffectTimer > 0) {
    player.specialAttackEffectTimer -= dt;
    if (player.specialAttackEffectTimer <= 0) {
      player.specialAttackEffectTimer = 0;
      player.isSpecialAttacking = false;
      player.specialAttackFireCooldown = 0;
      console.log("Special Attack effect ended.");
    } else {
      player.specialAttackFireCooldown -= dt;
      if (player.specialAttackFireCooldown <= 0) {
        const numProjectiles = gameData.items.find((item) => item.name === "special_attack")?.effectValue || 15;
        fireRadialAttack(numProjectiles);
        playSound("shoot");
        player.specialAttackFireCooldown = player.specialAttackBaseFireRate;
      }
    }
  }
  if (!player.isSpecialAttacking) {
    player.currentAttackCooldown -= dt;
    if (player.currentAttackCooldown <= 0) {
      playerFireAttack();
      player.currentAttackCooldown = player.attackCooldown;
      playSound("shoot");
    }
  }
}
function updateCamera() {
  let targetCameraX = player.x - canvas.width / 2;
  let targetCameraY = player.y - canvas.height / 2;
  if (gameData.canvas.mapWidth <= canvas.width) {
    cameraX = (gameData.canvas.mapWidth - canvas.width) / 2;
  } else {
    cameraX = Math.max(0, Math.min(targetCameraX, gameData.canvas.mapWidth - canvas.width));
  }
  if (gameData.canvas.mapHeight <= canvas.height) {
    cameraY = (gameData.canvas.mapHeight - canvas.height) / 2;
  } else {
    cameraY = Math.max(0, Math.min(targetCameraY, gameData.canvas.mapHeight - canvas.height));
  }
}
function findClosestEnemy(x, y) {
  let closest = null;
  let minDistanceSq = Infinity;
  for (const enemy of enemies) {
    const dx = enemy.x - x;
    const dy = enemy.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      closest = enemy;
    }
  }
  return closest;
}
function playerFireAttack() {
  const targetEnemy = findClosestEnemy(player.x, player.y);
  if (!targetEnemy) return;
  const initialDx = targetEnemy.x - player.x;
  const initialDy = targetEnemy.y - player.y;
  const initialAngle = Math.atan2(initialDy, initialDx);
  const numAttacks = player.numberOfAttacks;
  const spreadAngleRad = gameData.player.attackSpreadAngle * (Math.PI / 180);
  let startAngleOffset = 0;
  let angleStep = 0;
  if (numAttacks > 1) {
    angleStep = spreadAngleRad / (numAttacks - 1);
    startAngleOffset = -spreadAngleRad / 2;
  }
  for (let i = 0; i < numAttacks; i++) {
    const currentAngle = initialAngle + startAngleOffset + i * angleStep;
    const projSpeed = gameData.player.projectileSpeed;
    const vx = Math.cos(currentAngle) * projSpeed;
    const vy = Math.sin(currentAngle) * projSpeed;
    projectiles.push({
      x: player.x,
      y: player.y,
      vx,
      vy,
      damage: player.damage,
      lifetime: gameData.player.projectileLifetime,
      assetName: gameData.projectiles.assetName,
      size: gameData.projectiles.size
      // Projectile still uses 'size' for collision and drawing
    });
  }
}
function fireRadialAttack(numProjectiles) {
  const angleStep = 2 * Math.PI / numProjectiles;
  for (let i = 0; i < numProjectiles; i++) {
    const currentAngle = i * angleStep;
    const projSpeed = gameData.player.projectileSpeed;
    const vx = Math.cos(currentAngle) * projSpeed;
    const vy = Math.sin(currentAngle) * projSpeed;
    projectiles.push({
      x: player.x,
      y: player.y,
      vx,
      vy,
      damage: player.damage,
      // Special attack projectiles use player damage
      lifetime: gameData.player.projectileLifetime,
      assetName: gameData.projectiles.assetName,
      size: gameData.projectiles.size
    });
  }
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;
    proj.lifetime -= dt;
    if (proj.lifetime <= 0) {
      projectiles.splice(i, 1);
    }
  }
}
function updateEnemies(dt) {
  for (const enemy of enemies) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      enemy.x += dx / dist * enemy.speed * dt;
      enemy.y += dy / dist * enemy.speed * dt;
    }
  }
}
function updateExperienceGems(dt) {
  for (let i = experienceGems.length - 1; i >= 0; i--) {
    const gem = experienceGems[i];
    const dx = player.x - gem.x;
    const dy = player.y - gem.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < player.currentMagnetAttractRadius && dist > 0) {
      const attractSpeed = player.speed * 2;
      gem.x += dx / dist * attractSpeed * dt;
      gem.y += dy / dist * attractSpeed * dt;
    }
    gem.lifetime -= dt;
    if (gem.lifetime <= 0) {
      experienceGems.splice(i, 1);
      continue;
    }
  }
}
function updateItems(dt) {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    item.currentLifetime -= dt;
    if (item.currentLifetime <= 0) {
      items.splice(i, 1);
      continue;
    }
    const dx = player.x - item.x;
    const dy = player.y - item.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < player.currentMagnetAttractRadius && dist > 0) {
      const attractSpeed = player.speed * 2;
      item.x += dx / dist * attractSpeed * dt;
      item.y += dy / dist * attractSpeed * dt;
    }
  }
}
function spawnEnemies(dt) {
  lastEnemySpawnTime += dt;
  if (lastEnemySpawnTime >= currentEffectiveEnemySpawnInterval && enemies.length < currentEffectiveMaxEnemies) {
    lastEnemySpawnTime = 0;
    spawnSingleEnemy(false);
  }
}
function spawnSingleEnemy(initialSpawn) {
  const enemyTypeConfig = selectRandomEnemyType();
  if (!enemyTypeConfig) return;
  let x, y;
  const spawnPadding = 50;
  if (initialSpawn) {
    x = player.x + (Math.random() - 0.5) * canvas.width * 0.8;
    y = player.y + (Math.random() - 0.5) * canvas.height * 0.8;
  } else {
    const side = Math.floor(Math.random() * 4);
    switch (side) {
      case 0:
        x = cameraX + Math.random() * canvas.width;
        y = cameraY - spawnPadding;
        break;
      case 1:
        x = cameraX + canvas.width + spawnPadding;
        y = cameraY + Math.random() * canvas.height;
        break;
      case 2:
        x = cameraX + Math.random() * canvas.width;
        y = cameraY + canvas.height + spawnPadding;
        break;
      case 3:
        x = cameraX - spawnPadding;
        y = cameraY + Math.random() * canvas.height;
        break;
      default:
        x = 0;
        y = 0;
    }
  }
  x = Math.max(enemyTypeConfig.size / 2, Math.min(gameData.canvas.mapWidth - enemyTypeConfig.size / 2, x));
  y = Math.max(enemyTypeConfig.size / 2, Math.min(gameData.canvas.mapHeight - enemyTypeConfig.size / 2, y));
  const levelFactor = player.level - 1;
  const healthScale = 1 + levelFactor * gameData.gameplay.enemyHealthScalePerLevel;
  const speedScale = 1 + levelFactor * gameData.gameplay.enemySpeedScalePerLevel;
  const damageScale = 1 + levelFactor * gameData.gameplay.enemyDamageScalePerLevel;
  enemies.push({
    id: enemyIdCounter++,
    x,
    y,
    health: enemyTypeConfig.maxHealth * healthScale,
    maxHealth: enemyTypeConfig.maxHealth * healthScale,
    // Max health also needs to scale for health bar drawing
    speed: enemyTypeConfig.speed * speedScale,
    damage: enemyTypeConfig.damage * damageScale,
    assetName: enemyTypeConfig.assetName,
    expReward: enemyTypeConfig.expReward,
    // Experience reward can also scale if desired
    size: enemyTypeConfig.size
    // Enemy still uses 'size'
  });
}
function selectRandomEnemyType() {
  const totalWeight = gameData.enemies.reduce((sum, enemy) => sum + enemy.spawnRateWeight, 0);
  let random = Math.random() * totalWeight;
  for (const enemyType of gameData.enemies) {
    if (random < enemyType.spawnRateWeight) {
      return enemyType;
    }
    random -= enemyType.spawnRateWeight;
  }
  return void 0;
}
function selectRandomItemType() {
  const totalWeight = gameData.items.reduce((sum, item) => sum + item.spawnRateWeight, 0);
  if (totalWeight === 0) return void 0;
  let random = Math.random() * totalWeight;
  for (const itemType of gameData.items) {
    if (random < itemType.spawnRateWeight) {
      return itemType;
    }
    random -= itemType.spawnRateWeight;
  }
  return void 0;
}
function dropItem(x, y) {
  if (Math.random() < gameData.gameplay.itemDropChanceOnEnemyDefeat && items.length < gameData.gameplay.maxSimultaneousItems) {
    const itemTypeConfig = selectRandomItemType();
    if (!itemTypeConfig) return;
    items.push({
      x,
      y,
      size: itemTypeConfig.size,
      type: itemTypeConfig.name,
      assetName: itemTypeConfig.assetName,
      effectDuration: itemTypeConfig.effectDuration,
      effectValue: itemTypeConfig.effectValue,
      totalLifetime: itemTypeConfig.totalLifetime,
      currentLifetime: itemTypeConfig.totalLifetime
    });
    console.log(`Dropped item: ${itemTypeConfig.name} at (${x.toFixed(0)}, ${y.toFixed(0)})`);
  }
}
function isWithinBounds(x, y, size) {
  return x + size / 2 > cameraX && x - size / 2 < cameraX + canvas.width && y + size / 2 > cameraY && y - size / 2 < cameraY + canvas.height;
}
function checkCollisions() {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    for (let j = enemies.length - 1; j >= 0; j--) {
      const enemy = enemies[j];
      if (isColliding(proj, enemy)) {
        enemy.health -= proj.damage;
        projectiles.splice(i, 1);
        playSound("enemy_hit");
        if (enemy.health <= 0) {
          dropExperienceGem(enemy.x, enemy.y, enemy.expReward);
          dropItem(enemy.x, enemy.y);
          enemies.splice(j, 1);
        }
        break;
      }
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (isColliding(player, enemy)) {
      player.health -= enemy.damage * deltaTime;
      if (player.hitSoundCooldown <= 0) {
        playSound("player_hit");
        player.hitSoundCooldown = gameData.player.hitSoundCooldownDuration;
      }
      if (player.health <= 0) {
        finalSurvivalTime = gameTimer;
        gameState = "GAME_OVER" /* GAME_OVER */;
        stopAllSounds();
        playBGM("game_over_music");
      }
    }
  }
  for (let i = experienceGems.length - 1; i >= 0; i--) {
    const gem = experienceGems[i];
    if (isColliding(player, gem)) {
      player.experience += gem.value;
      experienceGems.splice(i, 1);
      playSound("gem_collect");
      if (player.experience >= player.nextLevelExp) {
        playerLevelUp();
      }
    }
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (isColliding(player, item)) {
      applyItemEffect(item);
      items.splice(i, 1);
    }
  }
}
function isColliding(obj1, obj2) {
  const distanceX = obj1.x - obj2.x;
  const distanceY = obj1.y - obj2.y;
  const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
  const combinedRadius = obj1.size / 2 + obj2.size / 2;
  return distance < combinedRadius;
}
function dropExperienceGem(x, y, value) {
  experienceGems.push({
    x,
    y,
    value,
    assetName: gameData.experienceGems.assetName,
    size: gameData.experienceGems.size,
    lifetime: gameData.experienceGems.totalLifetime
    // ADDED: Initialize lifetime
  });
}
function applyItemEffect(item) {
  switch (item.type) {
    case "magnet":
      player.magnetEffectTimer = item.effectDuration;
      player.currentMagnetAttractRadius = gameData.player.expGemAttractRadius + item.effectValue;
      console.log(`Magnet activated! Attract radius: ${player.currentMagnetAttractRadius} for ${item.effectDuration}s.`);
      playSound("item_collect");
      break;
    case "special_attack":
      player.specialAttackEffectTimer = item.effectDuration;
      player.isSpecialAttacking = true;
      player.specialAttackFireCooldown = 0;
      playSound("special_attack_activate");
      console.log(`Special Attack activated! Radial attack for ${item.effectDuration}s.`);
      break;
    case "health_potion":
      const healthBefore = player.health;
      player.health = Math.min(player.maxHealth, player.health + item.effectValue);
      console.log(`Health Potion collected! Healed ${player.health - healthBefore} HP. Current health: ${player.health}/${player.maxHealth}.`);
      playSound("item_collect");
      break;
    default:
      console.warn(`Unknown item type collected: ${item.type}`);
  }
}
function playerLevelUp() {
  player.level++;
  player.experience -= player.nextLevelExp;
  player.nextLevelExp = Math.floor(player.nextLevelExp * gameData.gameplay.levelUpExpMultiplier);
  player.attackCooldown = Math.max(0.05, player.attackCooldown * (1 - gameData.gameplay.attackSpeedIncreasePerLevel));
  if (player.level % 3 === 0) {
    player.numberOfAttacks++;
    console.log(`Player leveled up to ${player.level}! Number of attacks increased to ${player.numberOfAttacks}.`);
  }
  currentEffectiveMaxEnemies = gameData.gameplay.baseMaxEnemies + (player.level - 1) * gameData.gameplay.maxEnemiesIncreasePerLevel;
  currentEffectiveEnemySpawnInterval = Math.max(
    gameData.gameplay.minEnemySpawnInterval,
    gameData.gameplay.baseEnemySpawnInterval * Math.pow(gameData.gameplay.spawnIntervalReductionFactorPerLevel, player.level - 1)
  );
  gameState = "LEVEL_UP" /* LEVEL_UP */;
}
function applyLevelUpEffect(option) {
  try {
    eval(option.effect);
    player.health = Math.min(player.health, player.maxHealth);
  } catch (e) {
    console.error("Failed to apply level up effect:", option.effect, e);
  }
}
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  switch (gameState) {
    case "TITLE" /* TITLE */:
      drawTitleScreen();
      break;
    case "PLAYING" /* PLAYING */:
    case "LEVEL_UP" /* LEVEL_UP */:
      drawGameplay();
      drawUI();
      if (gameState === "LEVEL_UP" /* LEVEL_UP */) {
        drawLevelUpScreen();
      }
      break;
    case "GAME_OVER" /* GAME_OVER */:
      drawGameplay();
      drawGameOverScreen();
      break;
  }
}
function drawSprite(assetName, x, y, width, height, applyShadow = true, relativeToCamera = true) {
  const image = assets.images.get(assetName);
  if (image) {
    let drawX, drawY;
    if (relativeToCamera) {
      drawX = x - width / 2 - cameraX;
      drawY = y - height / 2 - cameraY;
    } else {
      drawX = x - width / 2;
      drawY = y - height / 2;
    }
    ctx.save();
    if (gameData.graphics.shadowEnabled && applyShadow) {
      ctx.shadowColor = gameData.graphics.shadowColor;
      ctx.shadowBlur = gameData.graphics.shadowBlur;
      ctx.shadowOffsetX = gameData.graphics.shadowOffsetX;
      ctx.shadowOffsetY = gameData.graphics.shadowOffsetY;
    }
    ctx.drawImage(image, drawX, drawY, width, height);
    ctx.restore();
  } else {
    ctx.fillStyle = "red";
    let fallbackDrawX, fallbackDrawY;
    if (relativeToCamera) {
      fallbackDrawX = x - width / 2 - cameraX;
      fallbackDrawY = y - height / 2 - cameraY;
    } else {
      fallbackDrawX = x - width / 2;
      fallbackDrawY = y - height / 2;
    }
    ctx.fillRect(fallbackDrawX, fallbackDrawY, width, height);
    console.warn(`Image asset "${assetName}" not found. Drawing placeholder.`);
  }
}
function drawTitleScreen() {
  const titleImageName = gameData.ui.titleScreenImage;
  if (titleImageName) {
    drawSprite(titleImageName, canvas.width / 2, canvas.height / 2, canvas.width, canvas.height, false, false);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.textAlign = "center";
  ctx.fillStyle = gameData.ui.textColor;
  ctx.font = `bold 48px ${gameData.ui.font}`;
  ctx.fillText(gameData.ui.gameTitleText, canvas.width / 2, canvas.height / 2 - 50);
  const blinkFrequency = gameData.ui.titleScreenBlinkFrequency;
  const shouldDrawPressAnyKeyText = Math.floor(gameTimer * blinkFrequency) % 2 === 0;
  if (shouldDrawPressAnyKeyText) {
    ctx.font = `24px ${gameData.ui.font}`;
    const textY = canvas.height - gameData.ui.titleScreenTextYOffsetFromBottom;
    ctx.fillText(gameData.ui.titleScreenText, canvas.width / 2, textY);
  }
}
function drawGameplay() {
  const backgroundImageName = gameData.canvas.backgroundImage;
  const backgroundImage = assets.images.get(backgroundImageName);
  if (backgroundImage) {
    drawSprite(backgroundImageName, gameData.canvas.mapWidth / 2, gameData.canvas.mapHeight / 2, gameData.canvas.mapWidth, gameData.canvas.mapHeight, false);
  } else {
    ctx.fillStyle = "#333";
    ctx.fillRect(0 - cameraX, 0 - cameraY, gameData.canvas.mapWidth, gameData.canvas.mapHeight);
  }
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 5;
  ctx.strokeRect(0 - cameraX, 0 - cameraY, gameData.canvas.mapWidth, gameData.canvas.mapHeight);
  drawSprite(player.assetName, player.x, player.y, player.drawWidth, player.drawHeight);
  for (const enemy of enemies) {
    drawSprite(enemy.assetName, enemy.x, enemy.y, enemy.size, enemy.size);
    drawHealthBar(enemy.x - cameraX, enemy.y - enemy.size / 2 - 10 - cameraY, enemy.size, 5, enemy.health, enemy.maxHealth, "red", "darkred");
  }
  for (const proj of projectiles) {
    drawSprite(proj.assetName, proj.x, proj.y, proj.size, proj.size);
  }
  for (const gem of experienceGems) {
    let shouldDrawGem = true;
    if (gem.lifetime <= gameData.experienceGems.blinkThresholdSeconds) {
      if (Math.floor(gameTimer * gameData.experienceGems.blinkFrequency) % 2 !== 0) {
        shouldDrawGem = false;
      }
    }
    if (shouldDrawGem) {
      drawSprite(gem.assetName, gem.x, gem.y, gem.size, gem.size);
    }
  }
  for (const item of items) {
    drawSprite(item.assetName, item.x, item.y, item.size, item.size);
  }
}
function drawHealthBar(x, y, width, height, currentHealth, maxHealth, fillColor, bgColor) {
  ctx.fillStyle = bgColor;
  ctx.fillRect(x - width / 2, y, width, height);
  ctx.fillStyle = fillColor;
  ctx.fillRect(x - width / 2, y, currentHealth / maxHealth * width, height);
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - width / 2, y, width, height);
}
function drawRoundedRect(x, y, width, height, radius, fillColor = null, strokeColor = null, strokeWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}
function drawUI() {
  const healthBarConfig = gameData.ui.healthBar;
  const healthBarX = 10;
  const healthBarY = 10;
  const healthBarWidth = healthBarConfig.width;
  const healthBarHeight = healthBarConfig.height;
  const healthBarRadius = healthBarConfig.cornerRadius;
  const currentHealthWidth = player.health / player.maxHealth * healthBarWidth;
  drawRoundedRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight, healthBarRadius, healthBarConfig.backgroundColor);
  drawRoundedRect(healthBarX, healthBarY, currentHealthWidth, healthBarHeight, healthBarRadius, healthBarConfig.fillColor);
  drawRoundedRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight, healthBarRadius, null, healthBarConfig.borderColor, 2);
  ctx.font = gameData.ui.barLabelFont;
  ctx.textAlign = "center";
  ctx.save();
  ctx.shadowColor = healthBarConfig.labelShadowColor;
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = healthBarConfig.labelColor;
  ctx.fillText(`HP: ${Math.ceil(player.health)}/${player.maxHealth}`, healthBarX + healthBarWidth / 2, healthBarY + healthBarHeight + healthBarConfig.labelYOffset);
  ctx.restore();
  const expBarConfig = gameData.ui.expBar;
  const expBarX = 10;
  const expBarY = healthBarY + healthBarHeight + 30;
  const expBarWidth = expBarConfig.width;
  const expBarHeight = expBarConfig.height;
  const expBarRadius = expBarConfig.cornerRadius;
  const currentExpWidth = player.experience / player.nextLevelExp * expBarWidth;
  drawRoundedRect(expBarX, expBarY, expBarWidth, expBarHeight, expBarRadius, expBarConfig.backgroundColor);
  drawRoundedRect(expBarX, expBarY, currentExpWidth, expBarHeight, expBarRadius, expBarConfig.fillColor);
  drawRoundedRect(expBarX, expBarY, expBarWidth, expBarHeight, expBarRadius, null, expBarConfig.borderColor, 2);
  ctx.font = gameData.ui.barLabelFont;
  ctx.textAlign = "center";
  ctx.save();
  ctx.shadowColor = expBarConfig.labelShadowColor;
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = expBarConfig.labelColor;
  ctx.fillText(`LV ${player.level} | EXP: ${Math.ceil(player.experience)}/${player.nextLevelExp}`, expBarX + expBarWidth / 2, expBarY + expBarHeight + expBarConfig.labelYOffset);
  ctx.restore();
  ctx.font = `18px ${gameData.ui.font}`;
  ctx.fillStyle = gameData.ui.textColor;
  ctx.textAlign = "right";
  ctx.fillText(`Time: ${Math.floor(gameTimer / 60).toString().padStart(2, "0")}:${Math.floor(gameTimer % 60).toString().padStart(2, "0")}`, canvas.width - 10, 30);
  ctx.textAlign = "right";
  ctx.fillText(`Enemies: ${enemies.length} / ${Math.floor(currentEffectiveMaxEnemies)}`, canvas.width - 10, 60);
  ctx.fillText(`Spawn Interval: ${currentEffectiveEnemySpawnInterval.toFixed(2)}s`, canvas.width - 10, 90);
  let uiEffectX = canvas.width - 10;
  const uiEffectY = expBarY + expBarHeight + 30;
  const uiEffectIconSize = 30;
  const uiEffectTextOffset = uiEffectIconSize / 2 + 5;
  if (player.magnetEffectTimer > 0) {
    drawSprite("item_magnet", uiEffectX - uiEffectIconSize / 2, uiEffectY + uiEffectIconSize / 2, uiEffectIconSize, uiEffectIconSize, false, false);
    ctx.textAlign = "center";
    ctx.fillStyle = gameData.ui.textColor;
    ctx.font = `14px ${gameData.ui.font}`;
    ctx.fillText(`${Math.ceil(player.magnetEffectTimer)}s`, uiEffectX - uiEffectIconSize / 2, uiEffectY + uiEffectIconSize + uiEffectTextOffset);
    uiEffectX -= uiEffectIconSize + 20;
  }
  if (player.specialAttackEffectTimer > 0) {
    drawSprite("item_special_attack", uiEffectX - uiEffectIconSize / 2, uiEffectY + uiEffectIconSize / 2, uiEffectIconSize, uiEffectIconSize, false, false);
    ctx.textAlign = "center";
    ctx.fillStyle = gameData.ui.textColor;
    ctx.font = `14px ${gameData.ui.font}`;
    ctx.fillText(`${Math.ceil(player.specialAttackEffectTimer)}s`, uiEffectX - uiEffectIconSize / 2, uiEffectY + uiEffectIconSize + uiEffectTextOffset);
    uiEffectX -= uiEffectIconSize + 20;
  }
}
function drawLevelUpScreen() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.fillStyle = gameData.ui.textColor;
  ctx.font = `bold 36px ${gameData.ui.font}`;
  ctx.fillText(`${gameData.ui.levelUpText} Choose an upgrade (Level ${player.level})`, canvas.width / 2, canvas.height / 2 - 100);
  ctx.font = `24px ${gameData.ui.font}`;
  if (gameData.ui.levelUpOptions.length > 0) {
    const option2 = gameData.ui.levelUpOptions[0];
    ctx.fillText(`[Spacebar] ${option2.name}: ${option2.description}`, canvas.width / 2, canvas.height / 2);
  } else {
    ctx.fillText("No upgrades available.", canvas.width / 2, canvas.height / 2);
  }
}
function drawGameOverScreen() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.fillStyle = gameData.ui.textColor;
  ctx.font = `bold 48px ${gameData.ui.font}`;
  ctx.fillText(gameData.ui.gameOverText, canvas.width / 2, canvas.height / 2 - 50);
  ctx.font = `24px ${gameData.ui.font}`;
  ctx.fillText(`You survived for: ${Math.floor(finalSurvivalTime / 60).toString().padStart(2, "0")}:${Math.floor(finalSurvivalTime % 60).toString().padStart(2, "0")}`, canvas.width / 2, canvas.height / 2 + 20);
  ctx.fillText("Press Spacebar to restart.", canvas.width / 2, canvas.height / 2 + 60);
}
loadGameData();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gRGVmaW5lIHR5cGVzIGZvciBnYW1lIGRhdGEgYW5kIGVudGl0aWVzXHJcbmludGVyZmFjZSBHYW1lRGF0YSB7XHJcbiAgICBjYW52YXM6IHtcclxuICAgICAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgICAgIG1hcFdpZHRoOiBudW1iZXI7IC8vIE5FVzogVG90YWwgd2lkdGggb2YgdGhlIHBsYXlhYmxlIG1hcCBhcmVhXHJcbiAgICAgICAgbWFwSGVpZ2h0OiBudW1iZXI7IC8vIE5FVzogVG90YWwgaGVpZ2h0IG9mIHRoZSBwbGF5YWJsZSBtYXAgYXJlYVxyXG4gICAgICAgIGJhY2tncm91bmRJbWFnZTogc3RyaW5nOyAvLyBORVc6IEFzc2V0IG5hbWUgZm9yIHRoZSBnYW1lIGJhY2tncm91bmQgaW1hZ2VcclxuICAgIH07XHJcbiAgICBwbGF5ZXI6IHtcclxuICAgICAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgICAgIG1heEhlYWx0aDogbnVtYmVyO1xyXG4gICAgICAgIGJhc2VEYW1hZ2U6IG51bWJlcjtcclxuICAgICAgICBhdHRhY2tDb29sZG93bjogbnVtYmVyOyAvLyBpbiBzZWNvbmRzXHJcbiAgICAgICAgcHJvamVjdGlsZVNwZWVkOiBudW1iZXI7IC8vIHBpeGVscyBwZXIgc2Vjb25kXHJcbiAgICAgICAgcHJvamVjdGlsZUxpZmV0aW1lOiBudW1iZXI7IC8vIGluIHNlY29uZHNcclxuICAgICAgICBhc3NldE5hbWU6IHN0cmluZztcclxuICAgICAgICB3ZWFwb25Bc3NldDogc3RyaW5nO1xyXG4gICAgICAgIGV4cEdlbUF0dHJhY3RSYWRpdXM6IG51bWJlcjtcclxuICAgICAgICAvLyBleHBCYXJXaWR0aDogbnVtYmVyOyAvLyBSRU1PVkVEOiBNb3ZlZCB0byB1aS5leHBCYXJcclxuICAgICAgICAvLyBleHBCYXJIZWlnaHQ6IG51bWJlcjsgLy8gUkVNT1ZFRDogTW92ZWQgdG8gdWkuZXhwQmFyXHJcbiAgICAgICAgLy8gaGVhbHRoQmFyV2lkdGg6IG51bWJlcjsgLy8gUkVNT1ZFRDogTW92ZWQgdG8gdWkuaGVhbHRoQmFyXHJcbiAgICAgICAgLy8gaGVhbHRoQmFySGVpZ2h0OiBudW1iZXI7IC8vIFJFTU9WRUQ6IE1vdmVkIHRvIHVpLmhlYWx0aEJhclxyXG4gICAgICAgIC8vIHBsYXllclNpemU6IG51bWJlcjsgLy8gRHJhd2luZyBzaXplIGZvciB0aGUgcGxheWVyIHNwcml0ZSAtIFJFTU9WRURcclxuICAgICAgICBwbGF5ZXJEcmF3V2lkdGg6IG51bWJlcjsgLy8gTkVXOiBEcmF3aW5nIHdpZHRoIGZvciB0aGUgcGxheWVyIHNwcml0ZVxyXG4gICAgICAgIHBsYXllckRyYXdIZWlnaHQ6IG51bWJlcjsgLy8gTkVXOiBEcmF3aW5nIGhlaWdodCBmb3IgdGhlIHBsYXllciBzcHJpdGVcclxuICAgICAgICBiYXNlTnVtYmVyT2ZBdHRhY2tzOiBudW1iZXI7IC8vIEluaXRpYWwgbnVtYmVyIG9mIHByb2plY3RpbGVzIGZpcmVkIHBlciBhdHRhY2tcclxuICAgICAgICBhdHRhY2tTcHJlYWRBbmdsZTogbnVtYmVyOyAvLyBUb3RhbCBzcHJlYWQgYW5nbGUgaW4gZGVncmVlcyBmb3IgbXVsdGlwbGUgcHJvamVjdGlsZXNcclxuICAgICAgICBzcGVjaWFsQXR0YWNrQmFzZUZpcmVSYXRlOiBudW1iZXI7IC8vIE5FVzogSG93IG9mdGVuIHNwZWNpYWwgYXR0YWNrIGZpcmVzIHdoZW4gYWN0aXZlXHJcbiAgICAgICAgaGl0U291bmRDb29sZG93bkR1cmF0aW9uOiBudW1iZXI7IC8vIE5FVzogRHVyYXRpb24gZm9yIHBsYXllciBoaXQgc291bmQgY29vbGRvd25cclxuICAgIH07XHJcbiAgICBlbmVtaWVzOiBBcnJheTx7XHJcbiAgICAgICAgbmFtZTogc3RyaW5nO1xyXG4gICAgICAgIGFzc2V0TmFtZTogc3RyaW5nO1xyXG4gICAgICAgIG1heEhlYWx0aDogbnVtYmVyO1xyXG4gICAgICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgZGFtYWdlOiBudW1iZXI7IC8vIERhbWFnZSBwZXIgc2Vjb25kIHdoZW4gY29sbGlkaW5nIHdpdGggcGxheWVyXHJcbiAgICAgICAgZXhwUmV3YXJkOiBudW1iZXI7XHJcbiAgICAgICAgc3Bhd25SYXRlV2VpZ2h0OiBudW1iZXI7IC8vIEZvciB3ZWlnaHRlZCByYW5kb20gc3Bhd25pbmdcclxuICAgICAgICBzaXplOiBudW1iZXI7IC8vIERyYXdpbmcgc2l6ZSBmb3IgdGhlIGVuZW15IHNwcml0ZSAoYWxzbyB1c2VkIGZvciBjb2xsaXNpb24pXHJcbiAgICB9PjtcclxuICAgIHByb2plY3RpbGVzOiB7XHJcbiAgICAgICAgYXNzZXROYW1lOiBzdHJpbmc7XHJcbiAgICAgICAgc2l6ZTogbnVtYmVyOyAvLyBEcmF3aW5nIHNpemUgZm9yIHRoZSBwcm9qZWN0aWxlIHNwcml0ZSAoYWxzbyB1c2VkIGZvciBjb2xsaXNpb24pXHJcbiAgICB9O1xyXG4gICAgZXhwZXJpZW5jZUdlbXM6IHtcclxuICAgICAgICBhc3NldE5hbWU6IHN0cmluZztcclxuICAgICAgICBiYXNlVmFsdWU6IG51bWJlcjtcclxuICAgICAgICBzaXplOiBudW1iZXI7IC8vIERyYXdpbmcgc2l6ZSBmb3IgdGhlIGdlbSBzcHJpdGUgKGFsc28gdXNlZCBmb3IgY29sbGlzaW9uKVxyXG4gICAgICAgIHRvdGFsTGlmZXRpbWU6IG51bWJlcjsgLy8gQURERUQ6IFRvdGFsIHRpbWUgYW4gZXhwZXJpZW5jZSBnZW0gd2lsbCBleGlzdCBiZWZvcmUgZGVzcGF3bmluZ1xyXG4gICAgICAgIGJsaW5rVGhyZXNob2xkU2Vjb25kczogbnVtYmVyOyAvLyBBRERFRDogVGltZSByZW1haW5pbmcgd2hlbiBnZW0gc3RhcnRzIHRvIGJsaW5rXHJcbiAgICAgICAgYmxpbmtGcmVxdWVuY3k6IG51bWJlcjsgLy8gQURERUQ6IEhvdyBtYW55IHRpbWVzIHBlciBzZWNvbmQgdGhlIGdlbSBibGlua3Mgd2hlbiBiZWxvdyB0aHJlc2hvbGRcclxuICAgIH07XHJcbiAgICBpdGVtczogQXJyYXk8eyAvLyBORVc6IEl0ZW0gZGVmaW5pdGlvbnNcclxuICAgICAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICAgICAgYXNzZXROYW1lOiBzdHJpbmc7XHJcbiAgICAgICAgc2l6ZTogbnVtYmVyO1xyXG4gICAgICAgIGVmZmVjdER1cmF0aW9uOiBudW1iZXI7IC8vIER1cmF0aW9uIG9mIHRoZSBpdGVtJ3MgZWZmZWN0IG9uY2UgY29sbGVjdGVkIChzZWNvbmRzKVxyXG4gICAgICAgIGVmZmVjdFZhbHVlOiBudW1iZXI7ICAgIC8vIFNwZWNpZmljIHZhbHVlIGZvciB0aGUgZWZmZWN0IChlLmcuLCBib251cyBhdHRyYWN0IHJhZGl1cywgbnVtIHByb2plY3RpbGVzLCBoZWFsIGFtb3VudClcclxuICAgICAgICBzcGF3blJhdGVXZWlnaHQ6IG51bWJlcjsgLy8gRm9yIHdlaWdodGVkIHJhbmRvbSBzcGF3bmluZ1xyXG4gICAgICAgIHRvdGFsTGlmZXRpbWU6IG51bWJlcjsgLy8gSG93IGxvbmcgaXRlbSBleGlzdHMgb24gbWFwIGJlZm9yZSBkZXNwYXduaW5nXHJcbiAgICB9PjtcclxuICAgIGdhbWVwbGF5OiB7XHJcbiAgICAgICAgYmFzZUVuZW15U3Bhd25JbnRlcnZhbDogbnVtYmVyOyAvLyBpbiBzZWNvbmRzIC0gUkVOQU1FRFxyXG4gICAgICAgIHNwYXduSW50ZXJ2YWxSZWR1Y3Rpb25GYWN0b3JQZXJMZXZlbDogbnVtYmVyOyAvLyBORVc6IE11bHRpcGxpZXIgdG8gcmVkdWNlIHNwYXduIGludGVydmFsIHBlciBsZXZlbCAoZS5nLiwgMC45OCBmb3IgMiUgZmFzdGVyKVxyXG4gICAgICAgIG1pbkVuZW15U3Bhd25JbnRlcnZhbDogbnVtYmVyOyAvLyBORVc6IE1pbmltdW0gcG9zc2libGUgc3Bhd24gaW50ZXJ2YWxcclxuICAgICAgICBpbml0aWFsRW5lbXlDb3VudDogbnVtYmVyO1xyXG4gICAgICAgIGJhc2VNYXhFbmVtaWVzOiBudW1iZXI7IC8vIFJFTkFNRURcclxuICAgICAgICBtYXhFbmVtaWVzSW5jcmVhc2VQZXJMZXZlbDogbnVtYmVyOyAvLyBORVc6IEhvdyBtYW55IG1heCBlbmVtaWVzIGluY3JlYXNlIHBlciBwbGF5ZXIgbGV2ZWxcclxuICAgICAgICBlbmVteUhlYWx0aFNjYWxlUGVyTGV2ZWw6IG51bWJlcjsgLy8gTkVXOiBQZXJjZW50YWdlIGluY3JlYXNlIGluIGVuZW15IGhlYWx0aCBwZXIgcGxheWVyIGxldmVsXHJcbiAgICAgICAgZW5lbXlTcGVlZFNjYWxlUGVyTGV2ZWw6IG51bWJlcjsgLy8gTkVXOiBQZXJjZW50YWdlIGluY3JlYXNlIGluIGVuZW15IHNwZWVkIHBlciBwbGF5ZXIgbGV2ZWxcclxuICAgICAgICBlbmVteURhbWFnZVNjYWxlUGVyTGV2ZWw6IG51bWJlcjsgLy8gTkVXOiBQZXJjZW50YWdlIGluY3JlYXNlIGluIGVuZW15IGRhbWFnZSBwZXIgbGV2ZWxcclxuICAgICAgICBsZXZlbFVwRXhwTXVsdGlwbGllcjogbnVtYmVyOyAvLyBIb3cgbXVjaCBuZXh0IGxldmVsIGV4cCBpbmNyZWFzZXNcclxuICAgICAgICBhdHRhY2tTcGVlZEluY3JlYXNlUGVyTGV2ZWw6IG51bWJlcjsgLy8gUGVyY2VudGFnZSByZWR1Y3Rpb24gaW4gYXR0YWNrIGNvb2xkb3duIHBlciBsZXZlbCAoZS5nLiwgMC4wMiBmb3IgMiUpXHJcbiAgICAgICAgaXRlbURyb3BDaGFuY2VPbkVuZW15RGVmZWF0OiBudW1iZXI7IC8vIE5FVzogQ2hhbmNlIGZvciBhbiBpdGVtIHRvIGRyb3Agd2hlbiBhbiBlbmVteSBpcyBkZWZlYXRlZFxyXG4gICAgICAgIG1heFNpbXVsdGFuZW91c0l0ZW1zOiBudW1iZXI7IC8vIE5FVzogTWF4IGl0ZW1zIG9uIHNjcmVlbiBhdCBvbmNlXHJcbiAgICB9O1xyXG4gICAgdWk6IHtcclxuICAgICAgICBmb250OiBzdHJpbmc7XHJcbiAgICAgICAgdGV4dENvbG9yOiBzdHJpbmc7XHJcbiAgICAgICAgZ2FtZVRpdGxlVGV4dDogc3RyaW5nOyAvLyBORVc6IFRpdGxlIHRleHQgZm9yIHRoZSBnYW1lJ3MgdGl0bGUgc2NyZWVuXHJcbiAgICAgICAgdGl0bGVTY3JlZW5UZXh0OiBzdHJpbmc7XHJcbiAgICAgICAgZ2FtZU92ZXJUZXh0OiBzdHJpbmc7XHJcbiAgICAgICAgbGV2ZWxVcFRleHQ6IHN0cmluZztcclxuICAgICAgICBsZXZlbFVwT3B0aW9uczogQXJyYXk8eyBuYW1lOiBzdHJpbmc7IGRlc2NyaXB0aW9uOiBzdHJpbmc7IGVmZmVjdDogc3RyaW5nIH0+O1xyXG4gICAgICAgIHRpdGxlU2NyZWVuSW1hZ2U6IHN0cmluZzsgLy8gTkVXOiBBc3NldCBuYW1lIGZvciB0aGUgdGl0bGUgc2NyZWVuIGJhY2tncm91bmQgaW1hZ2VcclxuICAgICAgICB0aXRsZVNjcmVlblRleHRZT2Zmc2V0RnJvbUJvdHRvbTogbnVtYmVyOyAvLyBORVc6IE9mZnNldCBmcm9tIGJvdHRvbSBmb3IgXCJQcmVzcyBhbnkga2V5IHRvIHN0YXJ0XCIgdGV4dFxyXG4gICAgICAgIHRpdGxlU2NyZWVuQmxpbmtGcmVxdWVuY3k6IG51bWJlcjsgICAgIC8vIE5FVzogRnJlcXVlbmN5IGZvciBibGlua2luZyBcIlByZXNzIGFueSBrZXkgdG8gc3RhcnRcIiB0ZXh0XHJcbiAgICAgICAgLy8gTkVXOiBQbGF5ZXIgSGVhbHRoIEJhciBVSSBzZXR0aW5nc1xyXG4gICAgICAgIGhlYWx0aEJhcjoge1xyXG4gICAgICAgICAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICAgICAgZmlsbENvbG9yOiBzdHJpbmc7XHJcbiAgICAgICAgICAgIGJhY2tncm91bmRDb2xvcjogc3RyaW5nO1xyXG4gICAgICAgICAgICBib3JkZXJDb2xvcjogc3RyaW5nO1xyXG4gICAgICAgICAgICBsYWJlbENvbG9yOiBzdHJpbmc7XHJcbiAgICAgICAgICAgIGxhYmVsU2hhZG93Q29sb3I6IHN0cmluZztcclxuICAgICAgICAgICAgY29ybmVyUmFkaXVzOiBudW1iZXI7XHJcbiAgICAgICAgICAgIGxhYmVsWU9mZnNldDogbnVtYmVyO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgLy8gTkVXOiBQbGF5ZXIgRXhwZXJpZW5jZSBCYXIgVUkgc2V0dGluZ3NcclxuICAgICAgICBleHBCYXI6IHtcclxuICAgICAgICAgICAgd2lkdGg6IG51bWJlcjtcclxuICAgICAgICAgICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgICAgIGZpbGxDb2xvcjogc3RyaW5nO1xyXG4gICAgICAgICAgICBiYWNrZ3JvdW5kQ29sb3I6IHN0cmluZztcclxuICAgICAgICAgICAgYm9yZGVyQ29sb3I6IHN0cmluZztcclxuICAgICAgICAgICAgbGFiZWxDb2xvcjogc3RyaW5nO1xyXG4gICAgICAgICAgICBsYWJlbFNoYWRvd0NvbG9yOiBzdHJpbmc7XHJcbiAgICAgICAgICAgIGNvcm5lclJhZGl1czogbnVtYmVyO1xyXG4gICAgICAgICAgICBsYWJlbFlPZmZzZXQ6IG51bWJlcjtcclxuICAgICAgICB9O1xyXG4gICAgICAgIGJhckxhYmVsRm9udDogc3RyaW5nOyAvLyBORVc6IEZvbnQgc3BlY2lmaWNhbGx5IGZvciBoZWFsdGgvZXhwIGJhciBsYWJlbHNcclxuICAgIH07XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0+O1xyXG4gICAgICAgIHNvdW5kczogQXJyYXk8eyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyOyB2b2x1bWU6IG51bWJlciB9PjtcclxuICAgIH07XHJcbiAgICAvLyBORVc6IEdyYXBoaWNzIHNldHRpbmdzLCBpbmNsdWRpbmcgc2hhZG93IHByb3BlcnRpZXNcclxuICAgIGdyYXBoaWNzOiB7XHJcbiAgICAgICAgc2hhZG93RW5hYmxlZDogYm9vbGVhbjtcclxuICAgICAgICBzaGFkb3dDb2xvcjogc3RyaW5nO1xyXG4gICAgICAgIHNoYWRvd09mZnNldFg6IG51bWJlcjtcclxuICAgICAgICBzaGFkb3dPZmZzZXRZOiBudW1iZXI7XHJcbiAgICAgICAgc2hhZG93Qmx1cjogbnVtYmVyO1xyXG4gICAgfTtcclxufVxyXG5cclxuLy8gSW50ZXJmYWNlcyBmb3IgZ2FtZSBlbnRpdGllc1xyXG5pbnRlcmZhY2UgR2FtZU9iamVjdCB7XHJcbiAgICB4OiBudW1iZXI7XHJcbiAgICB5OiBudW1iZXI7XHJcbiAgICBzaXplOiBudW1iZXI7IC8vIFVzZWQgZm9yIGNvbGxpc2lvbiBhbmQgZm9yIGRyYXdpbmcgb3RoZXIgc3F1YXJlIG9iamVjdHNcclxufVxyXG5cclxuaW50ZXJmYWNlIFBsYXllciBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgZHg6IG51bWJlcjtcclxuICAgIGR5OiBudW1iZXI7XHJcbiAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgIG1heEhlYWx0aDogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGRhbWFnZTogbnVtYmVyO1xyXG4gICAgYXR0YWNrQ29vbGRvd246IG51bWJlcjtcclxuICAgIGN1cnJlbnRBdHRhY2tDb29sZG93bjogbnVtYmVyO1xyXG4gICAgbGV2ZWw6IG51bWJlcjtcclxuICAgIGV4cGVyaWVuY2U6IG51bWJlcjtcclxuICAgIG5leHRMZXZlbEV4cDogbnVtYmVyO1xyXG4gICAgYXNzZXROYW1lOiBzdHJpbmc7XHJcbiAgICB3ZWFwb25Bc3NldDogc3RyaW5nO1xyXG4gICAgZXhwR2VtQXR0cmFjdFJhZGl1czogbnVtYmVyOyAvLyBCYXNlIGF0dHJhY3QgcmFkaXVzXHJcbiAgICBkcmF3V2lkdGg6IG51bWJlcjsgLy8gTkVXOiBTcGVjaWZpYyB3aWR0aCBmb3IgZHJhd2luZyB0aGUgcGxheWVyIHNwcml0ZVxyXG4gICAgZHJhd0hlaWdodDogbnVtYmVyOyAvLyBORVc6IFNwZWNpZmljIGhlaWdodCBmb3IgZHJhd2luZyB0aGUgcGxheWVyIHNwcml0ZVxyXG4gICAgbnVtYmVyT2ZBdHRhY2tzOiBudW1iZXI7IC8vIE5FVzogTnVtYmVyIG9mIHByb2plY3RpbGVzIGZpcmVkIHBlciBhdHRhY2tcclxuXHJcbiAgICAvLyBORVc6IEl0ZW0gcmVsYXRlZCBwcm9wZXJ0aWVzXHJcbiAgICBjdXJyZW50TWFnbmV0QXR0cmFjdFJhZGl1czogbnVtYmVyOyAvLyBEeW5hbWljYWxseSB1cGRhdGVkIGF0dHJhY3QgcmFkaXVzIGluY2x1ZGluZyBtYWduZXQgaXRlbSBlZmZlY3RcclxuICAgIG1hZ25ldEVmZmVjdFRpbWVyOiBudW1iZXI7ICAgICAgICAgIC8vIFRpbWVyIGZvciBtYWduZXQgZWZmZWN0XHJcbiAgICBzcGVjaWFsQXR0YWNrRWZmZWN0VGltZXI6IG51bWJlcjsgICAvLyBUaW1lciBmb3Igc3BlY2lhbCBhdHRhY2sgZWZmZWN0XHJcbiAgICBpc1NwZWNpYWxBdHRhY2tpbmc6IGJvb2xlYW47ICAgICAgICAvLyBGbGFnIHRvIGluZGljYXRlIGlmIHNwZWNpYWwgYXR0YWNrIGlzIGFjdGl2ZVxyXG4gICAgc3BlY2lhbEF0dGFja0ZpcmVDb29sZG93bjogbnVtYmVyOyAvLyBGb3IgY29udHJvbGxpbmcgcmFkaWFsIGF0dGFjayBmaXJlIHJhdGVcclxuICAgIHNwZWNpYWxBdHRhY2tCYXNlRmlyZVJhdGU6IG51bWJlcjsgLy8gRm9yIHNwZWNpYWwgYXR0YWNrIGZpcmUgcmF0ZSBpbiBkYXRhLmpzb25cclxuICAgIGhpdFNvdW5kQ29vbGRvd246IG51bWJlcjsgLy8gTkVXOiBDb29sZG93biBmb3IgcGxheWVyX2hpdCBzb3VuZFxyXG59XHJcblxyXG5pbnRlcmZhY2UgRW5lbXkgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIGlkOiBudW1iZXI7XHJcbiAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgIG1heEhlYWx0aDogbnVtYmVyOyAvLyBLZWVwIG1heCBoZWFsdGggZm9yIGhlYWx0aCBiYXIgZHJhd2luZ1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGRhbWFnZTogbnVtYmVyO1xyXG4gICAgYXNzZXROYW1lOiBzdHJpbmc7XHJcbiAgICBleHBSZXdhcmQ6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFByb2plY3RpbGUgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIHZ4OiBudW1iZXI7XHJcbiAgICB2eTogbnVtYmVyO1xyXG4gICAgZGFtYWdlOiBudW1iZXI7XHJcbiAgICBsaWZldGltZTogbnVtYmVyOyAvLyBpbiBzZWNvbmRzXHJcbiAgICBhc3NldE5hbWU6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEV4cGVyaWVuY2VHZW0gZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIHZhbHVlOiBudW1iZXI7XHJcbiAgICBhc3NldE5hbWU6IHN0cmluZztcclxuICAgIHNpemU6IG51bWJlcjtcclxuICAgIGxpZmV0aW1lOiBudW1iZXI7IC8vIEFEREVEOiBDdXJyZW50IHJlbWFpbmluZyBsaWZldGltZSBvZiB0aGUgZ2VtXHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBpdGVtcyB0aGF0IGRyb3BcclxuaW50ZXJmYWNlIEl0ZW0gZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIHR5cGU6IHN0cmluZzsgLy8gZS5nLiwgXCJtYWduZXRcIiwgXCJzcGVjaWFsX2F0dGFja1wiLCBcImhlYWx0aF9wb3Rpb25cIlxyXG4gICAgYXNzZXROYW1lOiBzdHJpbmc7XHJcbiAgICBlZmZlY3REdXJhdGlvbjogbnVtYmVyOyAvLyB0b3RhbCBkdXJhdGlvbiBvZiB0aGUgaXRlbSdzIGVmZmVjdCBvbmNlIGNvbGxlY3RlZFxyXG4gICAgZWZmZWN0VmFsdWU6IG51bWJlcjsgICAgLy8gc3BlY2lmaWMgdmFsdWUgZm9yIHRoZSBlZmZlY3QgKGUuZy4sIGJvbnVzIGF0dHJhY3QgcmFkaXVzLCBudW0gcHJvamVjdGlsZXMsIGhlYWwgYW1vdW50KVxyXG4gICAgdG90YWxMaWZldGltZTogbnVtYmVyOyAgLy8gSG93IGxvbmcgaXRlbSBleGlzdHMgb24gbWFwIGJlZm9yZSBkZXNwYXduaW5nXHJcbiAgICBjdXJyZW50TGlmZXRpbWU6IG51bWJlcjsgLy8gUmVtYWluaW5nIGxpZmV0aW1lXHJcbn1cclxuXHJcbmludGVyZmFjZSBMb2FkZWRBc3NldHMge1xyXG4gICAgaW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PjtcclxuICAgIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD47XHJcbn1cclxuXHJcbi8vIEVudW0gZm9yIG1hbmFnaW5nIGdhbWUgc3RhdGVzXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFID0gJ1RJVExFJyxcclxuICAgIFBMQVlJTkcgPSAnUExBWUlORycsXHJcbiAgICBMRVZFTF9VUCA9ICdMRVZFTF9VUCcsXHJcbiAgICBHQU1FX09WRVIgPSAnR0FNRV9PVkVSJyxcclxufVxyXG5cclxuLy8gR2xvYmFsIGdhbWUgdmFyaWFibGVzXHJcbmxldCBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG5sZXQgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbmxldCBnYW1lRGF0YTogR2FtZURhdGE7XHJcbmxldCBhc3NldHM6IExvYWRlZEFzc2V0cyA9IHsgaW1hZ2VzOiBuZXcgTWFwKCksIHNvdW5kczogbmV3IE1hcCgpIH07XHJcblxyXG5sZXQgcGxheWVyOiBQbGF5ZXI7XHJcbmxldCBlbmVtaWVzOiBFbmVteVtdID0gW107XHJcbmxldCBwcm9qZWN0aWxlczogUHJvamVjdGlsZVtdID0gW107XHJcbmxldCBleHBlcmllbmNlR2VtczogRXhwZXJpZW5jZUdlbVtdID0gW107XHJcbmxldCBpdGVtczogSXRlbVtdID0gW107IC8vIE5FVzogQXJyYXkgdG8gaG9sZCBzcGF3bmVkIGl0ZW1zXHJcblxyXG5sZXQgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbmxldCBsYXN0VXBkYXRlVGltZSA9IDA7XHJcbmxldCBkZWx0YVRpbWUgPSAwOyAvLyBUaW1lIHNpbmNlIGxhc3QgZnJhbWUgaW4gc2Vjb25kc1xyXG5cclxubGV0IGtleXNQcmVzc2VkOiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfSA9IHt9O1xyXG5cclxubGV0IGxhc3RFbmVteVNwYXduVGltZSA9IDA7XHJcbi8vIFJFTU9WRUQ6IGxldCBsYXN0SXRlbVNwYXduVGltZSA9IDA7IC8vIE5FVzogVGltZXIgZm9yIGl0ZW0gc3Bhd25pbmdcclxubGV0IGVuZW15SWRDb3VudGVyID0gMDtcclxubGV0IGdhbWVUaW1lciA9IDA7IC8vIEluIHNlY29uZHNcclxubGV0IGZpbmFsU3Vydml2YWxUaW1lOiBudW1iZXIgPSAwOyAvLyBNT0RJRklFRDogU3RvcmVzIHRoZSBnYW1lIHRpbWUgd2hlbiBHQU1FX09WRVIgc3RhdGUgaXMgcmVhY2hlZC5cclxuXHJcbmxldCBjYW1lcmFYOiBudW1iZXIgPSAwOyAvLyBORVc6IFgtY29vcmRpbmF0ZSBvZiB0aGUgY2FtZXJhJ3MgdG9wLWxlZnQgY29ybmVyIGluIHdvcmxkIHNwYWNlXHJcbmxldCBjYW1lcmFZOiBudW1iZXIgPSAwOyAvLyBORVc6IFktY29vcmRpbmF0ZSBvZiB0aGUgY2FtZXJhJ3MgdG9wLWxlZnQgY29ybmVyIGluIHdvcmxkIHNwYWNlXHJcblxyXG4vLyBORVc6IER5bmFtaWMgZ2FtZXBsYXkgdmFsdWVzIGJhc2VkIG9uIHBsYXllciBsZXZlbFxyXG5sZXQgY3VycmVudEVmZmVjdGl2ZU1heEVuZW1pZXM6IG51bWJlcjtcclxubGV0IGN1cnJlbnRFZmZlY3RpdmVFbmVteVNwYXduSW50ZXJ2YWw6IG51bWJlcjtcclxuXHJcbi8vIC0tLSBBc3NldCBMb2FkaW5nIC0tLVxyXG5hc3luYyBmdW5jdGlvbiBsb2FkR2FtZURhdGEoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgIGdhbWVEYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG5cclxuICAgICAgICBjYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZUNhbnZhcycpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghY2FudmFzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0NhbnZhcyBlbGVtZW50IHdpdGggSUQgXCJnYW1lQ2FudmFzXCIgbm90IGZvdW5kLicpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGN0eCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuICAgICAgICBjYW52YXMud2lkdGggPSBnYW1lRGF0YS5jYW52YXMud2lkdGg7XHJcbiAgICAgICAgY2FudmFzLmhlaWdodCA9IGdhbWVEYXRhLmNhbnZhcy5oZWlnaHQ7XHJcblxyXG4gICAgICAgIGF3YWl0IGxvYWRBc3NldHMoKTtcclxuICAgICAgICBpbml0R2FtZSgpO1xyXG4gICAgICAgIGdhbWVMb29wKDApOyAvLyBTdGFydCB0aGUgZ2FtZSBsb29wXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgZGF0YSBvciBhc3NldHM6JywgZXJyb3IpO1xyXG4gICAgfVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBsb2FkQXNzZXRzKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IGdhbWVEYXRhLmFzc2V0cy5pbWFnZXMubWFwKGltZyA9PiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1hZ2UgPSBuZXcgSW1hZ2UoKTtcclxuICAgICAgICAgICAgaW1hZ2Uuc3JjID0gaW1nLnBhdGg7XHJcbiAgICAgICAgICAgIGltYWdlLm9ubG9hZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGFzc2V0cy5pbWFnZXMuc2V0KGltZy5uYW1lLCBpbWFnZSk7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGltYWdlLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWcucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2ltZy5wYXRofWApKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSBnYW1lRGF0YS5hc3NldHMuc291bmRzLm1hcChzbmQgPT4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKCk7XHJcbiAgICAgICAgICAgIGF1ZGlvLnNyYyA9IHNuZC5wYXRoO1xyXG4gICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzbmQudm9sdW1lO1xyXG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgYXNzZXRzLnNvdW5kcy5zZXQoc25kLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NuZC5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7c25kLnBhdGh9YCkpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgIGNvbnNvbGUubG9nKCdBbGwgYXNzZXRzIGxvYWRlZC4nKTtcclxufVxyXG5cclxuLy8gLS0tIEdhbWUgSW5pdGlhbGl6YXRpb24gLS0tXHJcbmZ1bmN0aW9uIGluaXRHYW1lKCk6IHZvaWQge1xyXG4gICAgLy8gRXZlbnQgTGlzdGVuZXJzIGZvciBpbnB1dFxyXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xyXG4gICAgICAgIGtleXNQcmVzc2VkW2Uua2V5LnRvTG93ZXJDYXNlKCldID0gdHJ1ZTsgLy8gVXNlIHRvTG93ZXJDYXNlIGZvciBjYXNlLWluc2Vuc2l0aXZpdHlcclxuICAgICAgICBpZiAoZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUpIHtcclxuICAgICAgICAgICAgc3RhcnROZXdHYW1lKCk7IC8vIEFueSBrZXkgdG8gc3RhcnQgZnJvbSB0aXRsZSBzY3JlZW5cclxuICAgICAgICB9IGVsc2UgaWYgKGdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUiAmJiBlLmtleS50b0xvd2VyQ2FzZSgpID09PSAnICcpIHtcclxuICAgICAgICAgICAgLy8gT05MWSBTcGFjZWJhciB0byByZXN0YXJ0IGZyb20gZ2FtZSBvdmVyXHJcbiAgICAgICAgICAgIHN0YXJ0TmV3R2FtZSgpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuTEVWRUxfVVAgJiYgZS5rZXkudG9Mb3dlckNhc2UoKSA9PT0gJyAnKSB7IC8vIENoYW5nZWQgJ0VudGVyJyB0byAnU3BhY2ViYXInXHJcbiAgICAgICAgICAgIC8vIEZvciBzaW1wbGljaXR5LCBhdXRvbWF0aWNhbGx5IGFwcGx5IHRoZSBmaXJzdCBsZXZlbCB1cCBvcHRpb25cclxuICAgICAgICAgICAgaWYgKGdhbWVEYXRhLnVpLmxldmVsVXBPcHRpb25zLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgIGFwcGx5TGV2ZWxVcEVmZmVjdChnYW1lRGF0YS51aS5sZXZlbFVwT3B0aW9uc1swXSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICAgICAgICAgIHBsYXlTb3VuZCgnbGV2ZWxfdXAnKTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIChlKSA9PiB7XHJcbiAgICAgICAga2V5c1ByZXNzZWRbZS5rZXkudG9Mb3dlckNhc2UoKV0gPSBmYWxzZTtcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEhhbmRsZSBjbGljayBmb3IgdGl0bGUgc2NyZWVuIC8gZ2FtZSBvdmVyIHJlc3RhcnRcclxuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgICBpZiAoZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUpIHsgLy8gT25seSBjbGljayB0byBzdGFydCBmcm9tIHRpdGxlIHNjcmVlblxyXG4gICAgICAgICAgICBzdGFydE5ld0dhbWUoKTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBJbml0aWFsIHNldHVwIGZvciB0aGUgZ2FtZSwgc3RhcnRpbmcgaW4gVElUTEUgc3RhdGVcclxuICAgIGdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxufVxyXG5cclxuZnVuY3Rpb24gc3RhcnROZXdHYW1lKCk6IHZvaWQge1xyXG4gICAgLy8gUmVzZXQgcGxheWVyIHN0YXRlXHJcbiAgICBwbGF5ZXIgPSB7XHJcbiAgICAgICAgeDogZ2FtZURhdGEuY2FudmFzLm1hcFdpZHRoIC8gMiwgLy8gUGxheWVyIHN0YXJ0cyBpbiB0aGUgY2VudGVyIG9mIHRoZSAqbWFwKlxyXG4gICAgICAgIHk6IGdhbWVEYXRhLmNhbnZhcy5tYXBIZWlnaHQgLyAyLCAvLyBQbGF5ZXIgc3RhcnRzIGluIHRoZSBjZW50ZXIgb2YgdGhlICptYXAqXHJcbiAgICAgICAgZHg6IDAsXHJcbiAgICAgICAgZHk6IDAsXHJcbiAgICAgICAgaGVhbHRoOiBnYW1lRGF0YS5wbGF5ZXIubWF4SGVhbHRoLFxyXG4gICAgICAgIG1heEhlYWx0aDogZ2FtZURhdGEucGxheWVyLm1heEhlYWx0aCxcclxuICAgICAgICBzcGVlZDogZ2FtZURhdGEucGxheWVyLnNwZWVkLFxyXG4gICAgICAgIGRhbWFnZTogZ2FtZURhdGEucGxheWVyLmJhc2VEYW1hZ2UsXHJcbiAgICAgICAgYXR0YWNrQ29vbGRvd246IGdhbWVEYXRhLnBsYXllci5hdHRhY2tDb29sZG93biwgLy8gU3RhcnQgd2l0aCBiYXNlIGNvb2xkb3duXHJcbiAgICAgICAgY3VycmVudEF0dGFja0Nvb2xkb3duOiAwLFxyXG4gICAgICAgIGxldmVsOiAxLFxyXG4gICAgICAgIGV4cGVyaWVuY2U6IDAsXHJcbiAgICAgICAgbmV4dExldmVsRXhwOiAxMDAsXHJcbiAgICAgICAgYXNzZXROYW1lOiBnYW1lRGF0YS5wbGF5ZXIuYXNzZXROYW1lLFxyXG4gICAgICAgIHdlYXBvbkFzc2V0OiBnYW1lRGF0YS5wbGF5ZXIud2VhcG9uQXNzZXQsXHJcbiAgICAgICAgZXhwR2VtQXR0cmFjdFJhZGl1czogZ2FtZURhdGEucGxheWVyLmV4cEdlbUF0dHJhY3RSYWRpdXMsIC8vIEJhc2UgdmFsdWVcclxuICAgICAgICAvLyBDYWxjdWxhdGUgcGxheWVyIGNvbGxpc2lvbiBzaXplIGFzIGFuIGF2ZXJhZ2Ugb3IgcmVwcmVzZW50YXRpdmUgZGltZW5zaW9uXHJcbiAgICAgICAgLy8gVXNpbmcgYXZlcmFnZSBvZiBkcmF3V2lkdGggYW5kIGRyYXdIZWlnaHQgdG8gbWFpbnRhaW4gYSBzaW1pbGFyICdzaXplJyBmZWVsIGZvciBjb2xsaXNpb25cclxuICAgICAgICBzaXplOiAoZ2FtZURhdGEucGxheWVyLnBsYXllckRyYXdXaWR0aCArIGdhbWVEYXRhLnBsYXllci5wbGF5ZXJEcmF3SGVpZ2h0KSAvIDIsIC8vIEZvciBjb2xsaXNpb24gZGV0ZWN0aW9uXHJcbiAgICAgICAgZHJhd1dpZHRoOiBnYW1lRGF0YS5wbGF5ZXIucGxheWVyRHJhd1dpZHRoLCAgIC8vIEZvciBkcmF3aW5nIHRoZSBzcHJpdGVcclxuICAgICAgICBkcmF3SGVpZ2h0OiBnYW1lRGF0YS5wbGF5ZXIucGxheWVyRHJhd0hlaWdodCwgLy8gRm9yIGRyYXdpbmcgdGhlIHNwcml0ZVxyXG4gICAgICAgIG51bWJlck9mQXR0YWNrczogZ2FtZURhdGEucGxheWVyLmJhc2VOdW1iZXJPZkF0dGFja3MsIC8vIEluaXRpYWwgbnVtYmVyIG9mIGF0dGFja3NcclxuXHJcbiAgICAgICAgLy8gTkVXOiBJdGVtIGVmZmVjdCBwcm9wZXJ0aWVzXHJcbiAgICAgICAgY3VycmVudE1hZ25ldEF0dHJhY3RSYWRpdXM6IGdhbWVEYXRhLnBsYXllci5leHBHZW1BdHRyYWN0UmFkaXVzLCAvLyBTdGFydCB3aXRoIGJhc2VcclxuICAgICAgICBtYWduZXRFZmZlY3RUaW1lcjogMCxcclxuICAgICAgICBzcGVjaWFsQXR0YWNrRWZmZWN0VGltZXI6IDAsXHJcbiAgICAgICAgaXNTcGVjaWFsQXR0YWNraW5nOiBmYWxzZSxcclxuICAgICAgICBzcGVjaWFsQXR0YWNrRmlyZUNvb2xkb3duOiAwLCAvLyBSZWFkeSB0byBmaXJlIGluaXRpYWxseVxyXG4gICAgICAgIHNwZWNpYWxBdHRhY2tCYXNlRmlyZVJhdGU6IGdhbWVEYXRhLnBsYXllci5zcGVjaWFsQXR0YWNrQmFzZUZpcmVSYXRlLFxyXG4gICAgICAgIGhpdFNvdW5kQ29vbGRvd246IDAsIC8vIE5FVzogSW5pdGlhbGl6ZSB0byAwLCByZWFkeSB0byBwbGF5IHNvdW5kXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIENsZWFyIGVudGl0aWVzXHJcbiAgICBlbmVtaWVzID0gW107XHJcbiAgICBwcm9qZWN0aWxlcyA9IFtdO1xyXG4gICAgZXhwZXJpZW5jZUdlbXMgPSBbXTtcclxuICAgIGl0ZW1zID0gW107IC8vIE5FVzogQ2xlYXIgaXRlbXNcclxuXHJcbiAgICAvLyBSZXNldCBnYW1lIHN0YXRlIHZhcmlhYmxlc1xyXG4gICAgbGFzdEVuZW15U3Bhd25UaW1lID0gMDtcclxuICAgIC8vIFJFTU9WRUQ6IGxhc3RJdGVtU3Bhd25UaW1lID0gMDsgLy8gTkVXOiBSZXNldCBpdGVtIHNwYXduIHRpbWVyXHJcbiAgICBlbmVteUlkQ291bnRlciA9IDA7XHJcbiAgICBnYW1lVGltZXIgPSAwOyAvLyBSZXNldCBnYW1lIHRpbWVyIG9uIG5ldyBnYW1lXHJcbiAgICBmaW5hbFN1cnZpdmFsVGltZSA9IDA7IC8vIE1PRElGSUVEOiBSZXNldCBmaW5hbCBzdXJ2aXZhbCB0aW1lIG9uIG5ldyBnYW1lXHJcblxyXG4gICAgLy8gTkVXOiBJbml0aWFsaXplIGR5bmFtaWMgZ2FtZXBsYXkgdmFsdWVzIGJhc2VkIG9uIGRhdGEgYW5kIHN0YXJ0aW5nIGxldmVsIChsZXZlbCAxKVxyXG4gICAgY3VycmVudEVmZmVjdGl2ZU1heEVuZW1pZXMgPSBnYW1lRGF0YS5nYW1lcGxheS5iYXNlTWF4RW5lbWllcztcclxuICAgIGN1cnJlbnRFZmZlY3RpdmVFbmVteVNwYXduSW50ZXJ2YWwgPSBnYW1lRGF0YS5nYW1lcGxheS5iYXNlRW5lbXlTcGF3bkludGVydmFsO1xyXG5cclxuICAgIC8vIEluaXRpYWxpemUgY2FtZXJhIHBvc2l0aW9uIGJhc2VkIG9uIHBsYXllcidzIHN0YXJ0aW5nIHBvc2l0aW9uXHJcbiAgICB1cGRhdGVDYW1lcmEoKTtcclxuXHJcbiAgICAvLyBQb3B1bGF0ZSBpbml0aWFsIGVuZW1pZXMgKHRoZXNlIGRvIG5vdCBzY2FsZSB3aXRoIHBsYXllciBsZXZlbCAxLCBhcyAocGxheWVyLmxldmVsIC0gMSkgKiBzY2FsZSBpcyAwKVxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBnYW1lRGF0YS5nYW1lcGxheS5pbml0aWFsRW5lbXlDb3VudDsgaSsrKSB7XHJcbiAgICAgICAgc3Bhd25TaW5nbGVFbmVteSh0cnVlKTsgLy8gU3Bhd24gaW5pdGlhbGx5IHdpdGhpbiBjYW1lcmEgdmlldywgYXJvdW5kIHBsYXllclxyXG4gICAgfVxyXG5cclxuICAgIHN0b3BBbGxTb3VuZHMoKTsgLy8gU3RvcCBhbnkgcHJldmlvdXMgQkdNIG9yIFNGWCAoaW5jbHVkaW5nIGdhbWUgb3ZlciBtdXNpYylcclxuICAgIHBsYXlCR00oJ2JnbScpO1xyXG4gICAgZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN0b3BBbGxTb3VuZHMoKTogdm9pZCB7XHJcbiAgICBhc3NldHMuc291bmRzLmZvckVhY2goYXVkaW8gPT4ge1xyXG4gICAgICAgIGF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgYXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBsYXlCR00obmFtZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICBjb25zdCBhdWRpbyA9IGFzc2V0cy5zb3VuZHMuZ2V0KG5hbWUpO1xyXG4gICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgYXVkaW8ubG9vcCA9IHRydWU7XHJcbiAgICAgICAgLy8gQXR0ZW1wdCB0byBwbGF5LCBjYXRjaCBwb3RlbnRpYWwgZXJyb3JzIChlLmcuLCB1c2VyIGludGVyYWN0aW9uIHJlcXVpcmVkKVxyXG4gICAgICAgIGF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihcIkJHTSBwbGF5YmFjayBmYWlsZWQgKHVzZXIgaW50ZXJhY3Rpb24gcmVxdWlyZWQpOlwiLCBlKSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgIGNvbnN0IGF1ZGlvID0gYXNzZXRzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAvLyBDbG9uZSB0aGUgYXVkaW8gZWxlbWVudCB0byBhbGxvdyBtdWx0aXBsZSBzaW11bHRhbmVvdXMgcGxheXMgd2l0aG91dCBjdXR0aW5nIG9mZiBwcmV2aW91cyBvbmVzXHJcbiAgICAgICAgY29uc3QgY2xvbmVkQXVkaW8gPSBhdWRpby5jbG9uZU5vZGUoKSBhcyBIVE1MQXVkaW9FbGVtZW50O1xyXG4gICAgICAgIGNsb25lZEF1ZGlvLnZvbHVtZSA9IGF1ZGlvLnZvbHVtZTsgLy8gUmV0YWluIG9yaWdpbmFsIHZvbHVtZVxyXG4gICAgICAgIGNsb25lZEF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihcIlNGWCBwbGF5YmFjayBmYWlsZWQ6XCIsIGUpKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gLS0tIEdhbWUgTG9vcCAtLS1cclxuZnVuY3Rpb24gZ2FtZUxvb3AoY3VycmVudFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXApOiB2b2lkIHtcclxuICAgIC8vIENhbGN1bGF0ZSBkZWx0YVRpbWUgaW4gc2Vjb25kc1xyXG4gICAgZGVsdGFUaW1lID0gKGN1cnJlbnRUaW1lIC0gbGFzdFVwZGF0ZVRpbWUpIC8gMTAwMDtcclxuICAgIGxhc3RVcGRhdGVUaW1lID0gY3VycmVudFRpbWU7XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICByZW5kZXIoKTtcclxuXHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZ2FtZUxvb3ApO1xyXG59XHJcblxyXG4vLyAtLS0gVXBkYXRlIExvZ2ljIC0tLVxyXG5mdW5jdGlvbiB1cGRhdGUoZHQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgLy8gTU9ESUZJRUQ6IGdhbWVUaW1lciBhbHdheXMgdXBkYXRlcyBmb3IgdGl0bGUgc2NyZWVuIGJsaW5raW5nIGFuZCBnZW5lcmFsIGdhbWUgdGltZVxyXG4gICAgZ2FtZVRpbWVyICs9IGR0O1xyXG5cclxuICAgIGlmIChnYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgdXBkYXRlUGxheWVyKGR0KTtcclxuICAgICAgICB1cGRhdGVDYW1lcmEoKTsgLy8gTkVXOiBVcGRhdGUgY2FtZXJhIGFmdGVyIHBsYXllciBtb3ZlbWVudFxyXG4gICAgICAgIHVwZGF0ZVByb2plY3RpbGVzKGR0KTtcclxuICAgICAgICB1cGRhdGVFbmVtaWVzKGR0KTtcclxuICAgICAgICB1cGRhdGVFeHBlcmllbmNlR2VtcyhkdCk7XHJcbiAgICAgICAgdXBkYXRlSXRlbXMoZHQpOyAvLyBORVc6IFVwZGF0ZSBpdGVtcyAoZS5nLiwgZGVzcGF3biB0aW1lciBhbmQgYXR0cmFjdGlvbilcclxuICAgICAgICBjaGVja0NvbGxpc2lvbnMoKTtcclxuICAgICAgICBzcGF3bkVuZW1pZXMoZHQpO1xyXG4gICAgICAgIC8vIFJFTU9WRUQ6IHNwYXduSXRlbXMoZHQpIGZ1bmN0aW9uIGFzIGl0ZW1zIG5vdyBkcm9wIGZyb20gZW5lbWllc1xyXG4gICAgfVxyXG4gICAgLy8gT3RoZXIgc3RhdGVzIChUSVRMRSwgTEVWRUxfVVAsIEdBTUVfT1ZFUikgZG8gbm90IHVwZGF0ZSBnYW1lIGxvZ2ljIG9yIHRpbWVyIChleGNlcHQgZm9yIHRoZSBnZW5lcmFsIGdhbWVUaW1lcilcclxufVxyXG5cclxuZnVuY3Rpb24gdXBkYXRlUGxheWVyKGR0OiBudW1iZXIpOiB2b2lkIHtcclxuICAgIHBsYXllci5keCA9IDA7XHJcbiAgICBwbGF5ZXIuZHkgPSAwO1xyXG5cclxuICAgIC8vIE1vdmVtZW50IGlucHV0XHJcbiAgICBpZiAoa2V5c1ByZXNzZWRbJ3cnXSB8fCBrZXlzUHJlc3NlZFsnYXJyb3d1cCddKSBwbGF5ZXIuZHkgPSAtMTtcclxuICAgIGlmIChrZXlzUHJlc3NlZFsncyddIHx8IGtleXNQcmVzc2VkWydhcnJvd2Rvd24nXSkgcGxheWVyLmR5ID0gMTtcclxuICAgIGlmIChrZXlzUHJlc3NlZFsnYSddIHx8IGtleXNQcmVzc2VkWydhcnJvd2xlZnQnXSkgcGxheWVyLmR4ID0gLTE7XHJcbiAgICBpZiAoa2V5c1ByZXNzZWRbJ2QnXSB8fCBrZXlzUHJlc3NlZFsnYXJyb3dyaWdodCddKSBwbGF5ZXIuZHggPSAxO1xyXG5cclxuICAgIC8vIE5vcm1hbGl6ZSBkaWFnb25hbCBtb3ZlbWVudCBzcGVlZFxyXG4gICAgaWYgKHBsYXllci5keCAhPT0gMCAmJiBwbGF5ZXIuZHkgIT09IDApIHtcclxuICAgICAgICBjb25zdCBtYWduaXR1ZGUgPSBNYXRoLnNxcnQocGxheWVyLmR4ICogcGxheWVyLmR4ICsgcGxheWVyLmR5ICogcGxheWVyLmR5KTtcclxuICAgICAgICBwbGF5ZXIuZHggLz0gbWFnbml0dWRlO1xyXG4gICAgICAgIHBsYXllci5keSAvPSBtYWduaXR1ZGU7XHJcbiAgICB9XHJcblxyXG4gICAgcGxheWVyLnggKz0gcGxheWVyLmR4ICogcGxheWVyLnNwZWVkICogZHQ7XHJcbiAgICBwbGF5ZXIueSArPSBwbGF5ZXIuZHkgKiBwbGF5ZXIuc3BlZWQgKiBkdDtcclxuXHJcbiAgICAvLyBLZWVwIHBsYXllciB3aXRoaW4gKm1hcCogYm91bmRzIChub3QgY2FudmFzIGJvdW5kcylcclxuICAgIC8vIFVzaW5nIHBsYXllci5zaXplIGZvciBib3VuZGFyeSBjaGVja3MsIGNvbnNpc3RlbnQgd2l0aCBjb2xsaXNpb24gZGV0ZWN0aW9uXHJcbiAgICBwbGF5ZXIueCA9IE1hdGgubWF4KHBsYXllci5zaXplIC8gMiwgTWF0aC5taW4oZ2FtZURhdGEuY2FudmFzLm1hcFdpZHRoIC0gcGxheWVyLnNpemUgLyAyLCBwbGF5ZXIueCkpO1xyXG4gICAgcGxheWVyLnkgPSBNYXRoLm1heChwbGF5ZXIuc2l6ZSAvIDIsIE1hdGgubWluKGdhbWVEYXRhLmNhbnZhcy5tYXBIZWlnaHQgLSBwbGF5ZXIuc2l6ZSAvIDIsIHBsYXllci55KSk7XHJcblxyXG4gICAgLy8gTkVXOiBEZWNyZW1lbnQgcGxheWVyIGhpdCBzb3VuZCBjb29sZG93blxyXG4gICAgaWYgKHBsYXllci5oaXRTb3VuZENvb2xkb3duID4gMCkge1xyXG4gICAgICAgIHBsYXllci5oaXRTb3VuZENvb2xkb3duIC09IGR0O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIE5FVzogVXBkYXRlIGl0ZW0gZWZmZWN0IHRpbWVyc1xyXG4gICAgaWYgKHBsYXllci5tYWduZXRFZmZlY3RUaW1lciA+IDApIHtcclxuICAgICAgICBwbGF5ZXIubWFnbmV0RWZmZWN0VGltZXIgLT0gZHQ7XHJcbiAgICAgICAgaWYgKHBsYXllci5tYWduZXRFZmZlY3RUaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgIHBsYXllci5tYWduZXRFZmZlY3RUaW1lciA9IDA7XHJcbiAgICAgICAgICAgIHBsYXllci5jdXJyZW50TWFnbmV0QXR0cmFjdFJhZGl1cyA9IGdhbWVEYXRhLnBsYXllci5leHBHZW1BdHRyYWN0UmFkaXVzOyAvLyBSZXNldCB0byBiYXNlXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdNYWduZXQgZWZmZWN0IGVuZGVkLicpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAocGxheWVyLnNwZWNpYWxBdHRhY2tFZmZlY3RUaW1lciA+IDApIHtcclxuICAgICAgICBwbGF5ZXIuc3BlY2lhbEF0dGFja0VmZmVjdFRpbWVyIC09IGR0O1xyXG4gICAgICAgIGlmIChwbGF5ZXIuc3BlY2lhbEF0dGFja0VmZmVjdFRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgcGxheWVyLnNwZWNpYWxBdHRhY2tFZmZlY3RUaW1lciA9IDA7XHJcbiAgICAgICAgICAgIHBsYXllci5pc1NwZWNpYWxBdHRhY2tpbmcgPSBmYWxzZTtcclxuICAgICAgICAgICAgcGxheWVyLnNwZWNpYWxBdHRhY2tGaXJlQ29vbGRvd24gPSAwOyAvLyBSZXNldFxyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnU3BlY2lhbCBBdHRhY2sgZWZmZWN0IGVuZGVkLicpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIFNwZWNpYWwgYXR0YWNrIGlzIGFjdGl2ZSwgZmlyZSByYWRpYWwgYXR0YWNrc1xyXG4gICAgICAgICAgICBwbGF5ZXIuc3BlY2lhbEF0dGFja0ZpcmVDb29sZG93biAtPSBkdDtcclxuICAgICAgICAgICAgaWYgKHBsYXllci5zcGVjaWFsQXR0YWNrRmlyZUNvb2xkb3duIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG51bVByb2plY3RpbGVzID0gZ2FtZURhdGEuaXRlbXMuZmluZChpdGVtID0+IGl0ZW0ubmFtZSA9PT0gJ3NwZWNpYWxfYXR0YWNrJyk/LmVmZmVjdFZhbHVlIHx8IDE1O1xyXG4gICAgICAgICAgICAgICAgZmlyZVJhZGlhbEF0dGFjayhudW1Qcm9qZWN0aWxlcyk7XHJcbiAgICAgICAgICAgICAgICBwbGF5U291bmQoJ3Nob290Jyk7IC8vIENhbiBiZSBhIGRpZmZlcmVudCBzb3VuZFxyXG4gICAgICAgICAgICAgICAgcGxheWVyLnNwZWNpYWxBdHRhY2tGaXJlQ29vbGRvd24gPSBwbGF5ZXIuc3BlY2lhbEF0dGFja0Jhc2VGaXJlUmF0ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBQbGF5ZXIgYXV0by1hdHRhY2sgbG9naWMgKG9ubHkgaWYgbm90IGN1cnJlbnRseSBzcGVjaWFsIGF0dGFja2luZylcclxuICAgIGlmICghcGxheWVyLmlzU3BlY2lhbEF0dGFja2luZykge1xyXG4gICAgICAgIHBsYXllci5jdXJyZW50QXR0YWNrQ29vbGRvd24gLT0gZHQ7XHJcbiAgICAgICAgaWYgKHBsYXllci5jdXJyZW50QXR0YWNrQ29vbGRvd24gPD0gMCkge1xyXG4gICAgICAgICAgICBwbGF5ZXJGaXJlQXR0YWNrKCk7IC8vIENhbGxzIHRoZSB0YXJnZXRlZCBhdHRhY2sgZnVuY3Rpb25cclxuICAgICAgICAgICAgcGxheWVyLmN1cnJlbnRBdHRhY2tDb29sZG93biA9IHBsYXllci5hdHRhY2tDb29sZG93bjtcclxuICAgICAgICAgICAgcGxheVNvdW5kKCdzaG9vdCcpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gTkVXOiBGdW5jdGlvbiB0byB1cGRhdGUgdGhlIGNhbWVyYSdzIHBvc2l0aW9uXHJcbmZ1bmN0aW9uIHVwZGF0ZUNhbWVyYSgpOiB2b2lkIHtcclxuICAgIC8vIENhbGN1bGF0ZSByYXcgY2FtZXJhIHBvc2l0aW9uLCBjZW50ZXJpbmcgb24gcGxheWVyXHJcbiAgICBsZXQgdGFyZ2V0Q2FtZXJhWCA9IHBsYXllci54IC0gY2FudmFzLndpZHRoIC8gMjtcclxuICAgIGxldCB0YXJnZXRDYW1lcmFZID0gcGxheWVyLnkgLSBjYW52YXMuaGVpZ2h0IC8gMjtcclxuXHJcbiAgICAvLyBDbGFtcCBjYW1lcmEgdG8gbWFwIGJvdW5kYXJpZXNcclxuICAgIC8vIEhvcml6b250YWwgY2xhbXBpbmdcclxuICAgIGlmIChnYW1lRGF0YS5jYW52YXMubWFwV2lkdGggPD0gY2FudmFzLndpZHRoKSB7XHJcbiAgICAgICAgLy8gTWFwIGlzIHNtYWxsZXIgdGhhbiBvciBlcXVhbCB0byBjYW52YXMgd2lkdGgsIGNlbnRlciBpdFxyXG4gICAgICAgIGNhbWVyYVggPSAoZ2FtZURhdGEuY2FudmFzLm1hcFdpZHRoIC0gY2FudmFzLndpZHRoKSAvIDI7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIE1hcCBpcyBsYXJnZXIgdGhhbiBjYW52YXMgd2lkdGgsIGNsYW1wIHRvIGVkZ2VzXHJcbiAgICAgICAgY2FtZXJhWCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHRhcmdldENhbWVyYVgsIGdhbWVEYXRhLmNhbnZhcy5tYXBXaWR0aCAtIGNhbnZhcy53aWR0aCkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFZlcnRpY2FsIGNsYW1waW5nXHJcbiAgICBpZiAoZ2FtZURhdGEuY2FudmFzLm1hcEhlaWdodCA8PSBjYW52YXMuaGVpZ2h0KSB7XHJcbiAgICAgICAgLy8gTWFwIGlzIHNtYWxsZXIgdGhhbiBvciBlcXVhbCB0byBjYW52YXMgaGVpZ2h0LCBjZW50ZXIgaXRcclxuICAgICAgICBjYW1lcmFZID0gKGdhbWVEYXRhLmNhbnZhcy5tYXBIZWlnaHQgLSBjYW52YXMuaGVpZ2h0KSAvIDI7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIE1hcCBpcyBsYXJnZXIgdGhhbiBjYW52YXMgaGVpZ2h0LCBjbGFtcCB0byBlZGdlc1xyXG4gICAgICAgIGNhbWVyYVkgPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0YXJnZXRDYW1lcmFZLCBnYW1lRGF0YS5jYW52YXMubWFwSGVpZ2h0IC0gY2FudmFzLmhlaWdodCkpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBmaW5kQ2xvc2VzdEVuZW15KHg6IG51bWJlciwgeTogbnVtYmVyKTogRW5lbXkgfCBudWxsIHtcclxuICAgIGxldCBjbG9zZXN0OiBFbmVteSB8IG51bGwgPSBudWxsO1xyXG4gICAgbGV0IG1pbkRpc3RhbmNlU3EgPSBJbmZpbml0eTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IGVuZW15IG9mIGVuZW1pZXMpIHtcclxuICAgICAgICBjb25zdCBkeCA9IGVuZW15LnggLSB4O1xyXG4gICAgICAgIGNvbnN0IGR5ID0gZW5lbXkueSAtIHk7XHJcbiAgICAgICAgY29uc3QgZGlzdFNxID0gZHggKiBkeCArIGR5ICogZHk7XHJcblxyXG4gICAgICAgIGlmIChkaXN0U3EgPCBtaW5EaXN0YW5jZVNxKSB7XHJcbiAgICAgICAgICAgIG1pbkRpc3RhbmNlU3EgPSBkaXN0U3E7XHJcbiAgICAgICAgICAgIGNsb3Nlc3QgPSBlbmVteTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gY2xvc2VzdDtcclxufVxyXG5cclxuLy8gRnVuY3Rpb24gdG8gaGFuZGxlIHBsYXllcidzIG5vcm1hbCAodGFyZ2V0ZWQvc3ByZWFkKSBhdHRhY2tcclxuZnVuY3Rpb24gcGxheWVyRmlyZUF0dGFjaygpOiB2b2lkIHtcclxuICAgIGNvbnN0IHRhcmdldEVuZW15ID0gZmluZENsb3Nlc3RFbmVteShwbGF5ZXIueCwgcGxheWVyLnkpO1xyXG4gICAgaWYgKCF0YXJnZXRFbmVteSkgcmV0dXJuOyAvLyBObyB0YXJnZXQsIG5vIGF0dGFja1xyXG5cclxuICAgIGNvbnN0IGluaXRpYWxEeCA9IHRhcmdldEVuZW15LnggLSBwbGF5ZXIueDtcclxuICAgIGNvbnN0IGluaXRpYWxEeSA9IHRhcmdldEVuZW15LnkgLSBwbGF5ZXIueTtcclxuICAgIGNvbnN0IGluaXRpYWxBbmdsZSA9IE1hdGguYXRhbjIoaW5pdGlhbER5LCBpbml0aWFsRHgpOyAvLyBBbmdsZSB0byB0YXJnZXQgaW4gcmFkaWFuc1xyXG5cclxuICAgIGNvbnN0IG51bUF0dGFja3MgPSBwbGF5ZXIubnVtYmVyT2ZBdHRhY2tzO1xyXG4gICAgY29uc3Qgc3ByZWFkQW5nbGVSYWQgPSBnYW1lRGF0YS5wbGF5ZXIuYXR0YWNrU3ByZWFkQW5nbGUgKiAoTWF0aC5QSSAvIDE4MCk7IC8vIENvbnZlcnQgZGVncmVlcyB0byByYWRpYW5zXHJcblxyXG4gICAgbGV0IHN0YXJ0QW5nbGVPZmZzZXQgPSAwO1xyXG4gICAgbGV0IGFuZ2xlU3RlcCA9IDA7XHJcblxyXG4gICAgaWYgKG51bUF0dGFja3MgPiAxKSB7XHJcbiAgICAgICAgYW5nbGVTdGVwID0gc3ByZWFkQW5nbGVSYWQgLyAobnVtQXR0YWNrcyAtIDEpO1xyXG4gICAgICAgIHN0YXJ0QW5nbGVPZmZzZXQgPSAtc3ByZWFkQW5nbGVSYWQgLyAyO1xyXG4gICAgfVxyXG4gICAgLy8gSWYgbnVtQXR0YWNrcyBpcyAxLCBzdGFydEFuZ2xlT2Zmc2V0IGFuZCBhbmdsZVN0ZXAgcmVtYWluIDAsXHJcbiAgICAvLyBjYXVzaW5nIGEgc2luZ2xlIHByb2plY3RpbGUgdG8gZmlyZSBzdHJhaWdodCBhdCB0aGUgdGFyZ2V0LlxyXG5cclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbnVtQXR0YWNrczsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgY3VycmVudEFuZ2xlID0gaW5pdGlhbEFuZ2xlICsgc3RhcnRBbmdsZU9mZnNldCArIChpICogYW5nbGVTdGVwKTtcclxuXHJcbiAgICAgICAgY29uc3QgcHJvalNwZWVkID0gZ2FtZURhdGEucGxheWVyLnByb2plY3RpbGVTcGVlZDtcclxuICAgICAgICBjb25zdCB2eCA9IE1hdGguY29zKGN1cnJlbnRBbmdsZSkgKiBwcm9qU3BlZWQ7XHJcbiAgICAgICAgY29uc3QgdnkgPSBNYXRoLnNpbihjdXJyZW50QW5nbGUpICogcHJvalNwZWVkO1xyXG5cclxuICAgICAgICBwcm9qZWN0aWxlcy5wdXNoKHtcclxuICAgICAgICAgICAgeDogcGxheWVyLngsXHJcbiAgICAgICAgICAgIHk6IHBsYXllci55LFxyXG4gICAgICAgICAgICB2eDogdngsXHJcbiAgICAgICAgICAgIHZ5OiB2eSxcclxuICAgICAgICAgICAgZGFtYWdlOiBwbGF5ZXIuZGFtYWdlLFxyXG4gICAgICAgICAgICBsaWZldGltZTogZ2FtZURhdGEucGxheWVyLnByb2plY3RpbGVMaWZldGltZSxcclxuICAgICAgICAgICAgYXNzZXROYW1lOiBnYW1lRGF0YS5wcm9qZWN0aWxlcy5hc3NldE5hbWUsXHJcbiAgICAgICAgICAgIHNpemU6IGdhbWVEYXRhLnByb2plY3RpbGVzLnNpemUsIC8vIFByb2plY3RpbGUgc3RpbGwgdXNlcyAnc2l6ZScgZm9yIGNvbGxpc2lvbiBhbmQgZHJhd2luZ1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBORVc6IEZ1bmN0aW9uIHRvIGhhbmRsZSBzcGVjaWFsIHJhZGlhbCBhdHRhY2tcclxuZnVuY3Rpb24gZmlyZVJhZGlhbEF0dGFjayhudW1Qcm9qZWN0aWxlczogbnVtYmVyKTogdm9pZCB7XHJcbiAgICBjb25zdCBhbmdsZVN0ZXAgPSAoMiAqIE1hdGguUEkpIC8gbnVtUHJvamVjdGlsZXM7XHJcblxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBudW1Qcm9qZWN0aWxlczsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgY3VycmVudEFuZ2xlID0gaSAqIGFuZ2xlU3RlcDtcclxuICAgICAgICBjb25zdCBwcm9qU3BlZWQgPSBnYW1lRGF0YS5wbGF5ZXIucHJvamVjdGlsZVNwZWVkO1xyXG4gICAgICAgIGNvbnN0IHZ4ID0gTWF0aC5jb3MoY3VycmVudEFuZ2xlKSAqIHByb2pTcGVlZDtcclxuICAgICAgICBjb25zdCB2eSA9IE1hdGguc2luKGN1cnJlbnRBbmdsZSkgKiBwcm9qU3BlZWQ7XHJcblxyXG4gICAgICAgIHByb2plY3RpbGVzLnB1c2goe1xyXG4gICAgICAgICAgICB4OiBwbGF5ZXIueCxcclxuICAgICAgICAgICAgeTogcGxheWVyLnksXHJcbiAgICAgICAgICAgIHZ4OiB2eCxcclxuICAgICAgICAgICAgdnk6IHZ5LFxyXG4gICAgICAgICAgICBkYW1hZ2U6IHBsYXllci5kYW1hZ2UsIC8vIFNwZWNpYWwgYXR0YWNrIHByb2plY3RpbGVzIHVzZSBwbGF5ZXIgZGFtYWdlXHJcbiAgICAgICAgICAgIGxpZmV0aW1lOiBnYW1lRGF0YS5wbGF5ZXIucHJvamVjdGlsZUxpZmV0aW1lLFxyXG4gICAgICAgICAgICBhc3NldE5hbWU6IGdhbWVEYXRhLnByb2plY3RpbGVzLmFzc2V0TmFtZSxcclxuICAgICAgICAgICAgc2l6ZTogZ2FtZURhdGEucHJvamVjdGlsZXMuc2l6ZSxcclxuICAgICAgICB9KTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gdXBkYXRlUHJvamVjdGlsZXMoZHQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgZm9yIChsZXQgaSA9IHByb2plY3RpbGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgY29uc3QgcHJvaiA9IHByb2plY3RpbGVzW2ldO1xyXG4gICAgICAgIHByb2oueCArPSBwcm9qLnZ4ICogZHQ7XHJcbiAgICAgICAgcHJvai55ICs9IHByb2oudnkgKiBkdDtcclxuICAgICAgICBwcm9qLmxpZmV0aW1lIC09IGR0O1xyXG5cclxuICAgICAgICAvLyBSZW1vdmUgaWYgbGlmZXRpbWUgZXhwaXJlcy4gUHJvamVjdGlsZXMgZGVzcGF3biBhZnRlciBsaWZldGltZSwgbm90IG5lY2Vzc2FyaWx5IHdoZW4gb2ZmLXNjcmVlbi5cclxuICAgICAgICBpZiAocHJvai5saWZldGltZSA8PSAwKSB7XHJcbiAgICAgICAgICAgIHByb2plY3RpbGVzLnNwbGljZShpLCAxKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVwZGF0ZUVuZW1pZXMoZHQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgZm9yIChjb25zdCBlbmVteSBvZiBlbmVtaWVzKSB7XHJcbiAgICAgICAgLy8gTW92ZSB0b3dhcmRzIHBsYXllclxyXG4gICAgICAgIGNvbnN0IGR4ID0gcGxheWVyLnggLSBlbmVteS54O1xyXG4gICAgICAgIGNvbnN0IGR5ID0gcGxheWVyLnkgLSBlbmVteS55O1xyXG4gICAgICAgIGNvbnN0IGRpc3QgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xyXG5cclxuICAgICAgICBpZiAoZGlzdCA+IDApIHtcclxuICAgICAgICAgICAgZW5lbXkueCArPSAoZHggLyBkaXN0KSAqIGVuZW15LnNwZWVkICogZHQ7XHJcbiAgICAgICAgICAgIGVuZW15LnkgKz0gKGR5IC8gZGlzdCkgKiBlbmVteS5zcGVlZCAqIGR0O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gdXBkYXRlRXhwZXJpZW5jZUdlbXMoZHQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgZm9yIChsZXQgaSA9IGV4cGVyaWVuY2VHZW1zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgY29uc3QgZ2VtID0gZXhwZXJpZW5jZUdlbXNbaV07XHJcbiAgICAgICAgY29uc3QgZHggPSBwbGF5ZXIueCAtIGdlbS54O1xyXG4gICAgICAgIGNvbnN0IGR5ID0gcGxheWVyLnkgLSBnZW0ueTtcclxuICAgICAgICBjb25zdCBkaXN0ID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcclxuXHJcbiAgICAgICAgLy8gQXR0cmFjdCBnZW1zIGlmIHBsYXllciBpcyB3aXRoaW4gdGhlIGF0dHJhY3QgcmFkaXVzICh1c2luZyBjdXJyZW50TWFnbmV0QXR0cmFjdFJhZGl1cylcclxuICAgICAgICBpZiAoZGlzdCA8IHBsYXllci5jdXJyZW50TWFnbmV0QXR0cmFjdFJhZGl1cyAmJiBkaXN0ID4gMCkgeyAvLyBNT0RJRklFRFxyXG4gICAgICAgICAgICBjb25zdCBhdHRyYWN0U3BlZWQgPSBwbGF5ZXIuc3BlZWQgKiAyOyAvLyBHZW1zIG1vdmUgZmFzdGVyIHRoYW4gcGxheWVyXHJcbiAgICAgICAgICAgIGdlbS54ICs9IChkeCAvIGRpc3QpICogYXR0cmFjdFNwZWVkICogZHQ7XHJcbiAgICAgICAgICAgIGdlbS55ICs9IChkeSAvIGRpc3QpICogYXR0cmFjdFNwZWVkICogZHQ7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBBRERFRDogRGVjcmVtZW50IGxpZmV0aW1lIGFuZCByZW1vdmUgaWYgZXhwaXJlZFxyXG4gICAgICAgIGdlbS5saWZldGltZSAtPSBkdDtcclxuICAgICAgICBpZiAoZ2VtLmxpZmV0aW1lIDw9IDApIHtcclxuICAgICAgICAgICAgZXhwZXJpZW5jZUdlbXMuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgICBjb250aW51ZTsgLy8gTW92ZSB0byB0aGUgbmV4dCBnZW0sIHByZXZlbnRpbmcgZnVydGhlciBwcm9jZXNzaW5nIG9mIGEgcmVtb3ZlZCBnZW1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIE5FVzogVXBkYXRlIGl0ZW1zIGxpZmV0aW1lIGFuZCBhZGQgYXR0cmFjdGlvblxyXG5mdW5jdGlvbiB1cGRhdGVJdGVtcyhkdDogbnVtYmVyKTogdm9pZCB7XHJcbiAgICBmb3IgKGxldCBpID0gaXRlbXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICBjb25zdCBpdGVtID0gaXRlbXNbaV07XHJcbiAgICAgICAgaXRlbS5jdXJyZW50TGlmZXRpbWUgLT0gZHQ7XHJcbiAgICAgICAgaWYgKGl0ZW0uY3VycmVudExpZmV0aW1lIDw9IDApIHtcclxuICAgICAgICAgICAgaXRlbXMuc3BsaWNlKGksIDEpOyAvLyBSZW1vdmUgaWYgbGlmZXRpbWUgZXhwaXJlc1xyXG4gICAgICAgICAgICBjb250aW51ZTsgLy8gTW92ZSB0byB0aGUgbmV4dCBpdGVtLCBza2lwIGF0dHJhY3Rpb24gZm9yIGV4cGlyZWQgaXRlbXNcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE5FVzogQXR0cmFjdCBpdGVtcyB0b3dhcmRzIHBsYXllciBzaW1pbGFyIHRvIGV4cGVyaWVuY2UgZ2Vtc1xyXG4gICAgICAgIGNvbnN0IGR4ID0gcGxheWVyLnggLSBpdGVtLng7XHJcbiAgICAgICAgY29uc3QgZHkgPSBwbGF5ZXIueSAtIGl0ZW0ueTtcclxuICAgICAgICBjb25zdCBkaXN0ID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcclxuXHJcbiAgICAgICAgLy8gQXR0cmFjdCBpdGVtcyBpZiBwbGF5ZXIgaXMgd2l0aGluIHRoZSBhdHRyYWN0IHJhZGl1cyAodXNpbmcgY3VycmVudE1hZ25ldEF0dHJhY3RSYWRpdXMpXHJcbiAgICAgICAgLy8gSXRlbXMgYXJlIGNvbGxlY3RlZCBieSB0aGUgY29sbGlzaW9uIGNoZWNrLCBzbyBqdXN0IG1vdmUgdGhlbSBoZXJlLlxyXG4gICAgICAgIGlmIChkaXN0IDwgcGxheWVyLmN1cnJlbnRNYWduZXRBdHRyYWN0UmFkaXVzICYmIGRpc3QgPiAwKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGF0dHJhY3RTcGVlZCA9IHBsYXllci5zcGVlZCAqIDI7IC8vIEl0ZW1zIG1vdmUgZmFzdGVyIHRoYW4gcGxheWVyLCBzYW1lIGFzIGdlbXNcclxuICAgICAgICAgICAgaXRlbS54ICs9IChkeCAvIGRpc3QpICogYXR0cmFjdFNwZWVkICogZHQ7XHJcbiAgICAgICAgICAgIGl0ZW0ueSArPSAoZHkgLyBkaXN0KSAqIGF0dHJhY3RTcGVlZCAqIGR0O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIHNwYXduRW5lbWllcyhkdDogbnVtYmVyKTogdm9pZCB7XHJcbiAgICBsYXN0RW5lbXlTcGF3blRpbWUgKz0gZHQ7XHJcbiAgICAvLyBVc2UgZHluYW1pYyBlZmZlY3RpdmUgc3Bhd24gaW50ZXJ2YWwgYW5kIG1heCBlbmVtaWVzXHJcbiAgICBpZiAobGFzdEVuZW15U3Bhd25UaW1lID49IGN1cnJlbnRFZmZlY3RpdmVFbmVteVNwYXduSW50ZXJ2YWwgJiYgZW5lbWllcy5sZW5ndGggPCBjdXJyZW50RWZmZWN0aXZlTWF4RW5lbWllcykge1xyXG4gICAgICAgIGxhc3RFbmVteVNwYXduVGltZSA9IDA7XHJcbiAgICAgICAgc3Bhd25TaW5nbGVFbmVteShmYWxzZSk7IC8vIFNwYXduIGNvbnRpbnVvdXNseSBvZmYtc2NyZWVuIChyZWxhdGl2ZSB0byBjYW1lcmEgdmlldylcclxuICAgIH1cclxufVxyXG5cclxuLy8gUkVNT1ZFRDogc3Bhd25JdGVtcyhkdCkgZnVuY3Rpb24gYXMgaXRlbXMgbm93IGRyb3AgZnJvbSBlbmVtaWVzXHJcblxyXG5mdW5jdGlvbiBzcGF3blNpbmdsZUVuZW15KGluaXRpYWxTcGF3bjogYm9vbGVhbik6IHZvaWQge1xyXG4gICAgY29uc3QgZW5lbXlUeXBlQ29uZmlnID0gc2VsZWN0UmFuZG9tRW5lbXlUeXBlKCk7XHJcbiAgICBpZiAoIWVuZW15VHlwZUNvbmZpZykgcmV0dXJuO1xyXG5cclxuICAgIGxldCB4LCB5O1xyXG4gICAgY29uc3Qgc3Bhd25QYWRkaW5nID0gNTA7IC8vIERpc3RhbmNlIG9mZi1zY3JlZW4gZm9yIHJlZ3VsYXIgc3Bhd25zXHJcblxyXG4gICAgaWYgKGluaXRpYWxTcGF3bikge1xyXG4gICAgICAgIC8vIEZvciBpbml0aWFsIGVuZW1pZXMsIHNwYXduIHRoZW0gc29tZXdoYXQgY2VudGVyZWQgb24gdGhlIHNjcmVlbiwgYXJvdW5kIHRoZSBwbGF5ZXJcclxuICAgICAgICB4ID0gcGxheWVyLnggKyAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiBjYW52YXMud2lkdGggKiAwLjg7XHJcbiAgICAgICAgeSA9IHBsYXllci55ICsgKE1hdGgucmFuZG9tKCkgLSAwLjUpICogY2FudmFzLmhlaWdodCAqIDAuODtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gRm9yIGNvbnRpbnVvdXMgc3Bhd25zLCBzcGF3biBjb21wbGV0ZWx5IG9mZi1zY3JlZW4gKnJlbGF0aXZlIHRvIHRoZSBjdXJyZW50IGNhbWVyYSB2aWV3KlxyXG4gICAgICAgIGNvbnN0IHNpZGUgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiA0KTsgLy8gMDp0b3AsIDE6cmlnaHQsIDI6Ym90dG9tLCAzOmxlZnRcclxuXHJcbiAgICAgICAgc3dpdGNoIChzaWRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgMDogLy8gVG9wIChhYm92ZSBjYW1lcmEgdmlldylcclxuICAgICAgICAgICAgICAgIHggPSBjYW1lcmFYICsgTWF0aC5yYW5kb20oKSAqIGNhbnZhcy53aWR0aDtcclxuICAgICAgICAgICAgICAgIHkgPSBjYW1lcmFZIC0gc3Bhd25QYWRkaW5nO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgMTogLy8gUmlnaHQgKHJpZ2h0IG9mIGNhbWVyYSB2aWV3KVxyXG4gICAgICAgICAgICAgICAgeCA9IGNhbWVyYVggKyBjYW52YXMud2lkdGggKyBzcGF3blBhZGRpbmc7XHJcbiAgICAgICAgICAgICAgICB5ID0gY2FtZXJhWSArIE1hdGgucmFuZG9tKCkgKiBjYW52YXMuaGVpZ2h0O1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgMjogLy8gQm90dG9tIChiZWxvdyBjYW1lcmEgdmlldylcclxuICAgICAgICAgICAgICAgIHggPSBjYW1lcmFYICsgTWF0aC5yYW5kb20oKSAqIGNhbnZhcy53aWR0aDtcclxuICAgICAgICAgICAgICAgIHkgPSBjYW1lcmFZICsgY2FudmFzLmhlaWdodCArIHNwYXduUGFkZGluZztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIDM6IC8vIExlZnQgKGxlZnQgb2YgY2FtZXJhIHZpZXcpXHJcbiAgICAgICAgICAgICAgICB4ID0gY2FtZXJhWCAtIHNwYXduUGFkZGluZztcclxuICAgICAgICAgICAgICAgIHkgPSBjYW1lcmFZICsgTWF0aC5yYW5kb20oKSAqIGNhbnZhcy5oZWlnaHQ7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDogLy8gU2hvdWxkIG5vdCBoYXBwZW5cclxuICAgICAgICAgICAgICAgIHggPSAwOyB5ID0gMDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2xhbXAgdGhlIHNwYXduIHBvc2l0aW9uIHRvIGVuc3VyZSBpdCdzIHN0aWxsIHdpdGhpbiB0aGUgb3ZlcmFsbCBtYXAgYm91bmRhcmllc1xyXG4gICAgeCA9IE1hdGgubWF4KGVuZW15VHlwZUNvbmZpZy5zaXplIC8gMiwgTWF0aC5taW4oZ2FtZURhdGEuY2FudmFzLm1hcFdpZHRoIC0gZW5lbXlUeXBlQ29uZmlnLnNpemUgLyAyLCB4KSk7XHJcbiAgICB5ID0gTWF0aC5tYXgoZW5lbXlUeXBlQ29uZmlnLnNpemUgLyAyLCBNYXRoLm1pbihnYW1lRGF0YS5jYW52YXMubWFwSGVpZ2h0IC0gZW5lbXlUeXBlQ29uZmlnLnNpemUgLyAyLCB5KSk7XHJcblxyXG4gICAgLy8gTkVXOiBBcHBseSBsZXZlbCBzY2FsaW5nIHRvIGVuZW15IHN0YXRzIGJhc2VkIG9uIHBsYXllcidzIGN1cnJlbnQgbGV2ZWxcclxuICAgIC8vIExldmVsIDEgaGFzIGEgZmFjdG9yIG9mIDAsIExldmVsIDIgaGFzIDEsIGV0Yy5cclxuICAgIGNvbnN0IGxldmVsRmFjdG9yID0gcGxheWVyLmxldmVsIC0gMTtcclxuICAgIGNvbnN0IGhlYWx0aFNjYWxlID0gMSArIGxldmVsRmFjdG9yICogZ2FtZURhdGEuZ2FtZXBsYXkuZW5lbXlIZWFsdGhTY2FsZVBlckxldmVsO1xyXG4gICAgY29uc3Qgc3BlZWRTY2FsZSA9IDEgKyBsZXZlbEZhY3RvciAqIGdhbWVEYXRhLmdhbWVwbGF5LmVuZW15U3BlZWRTY2FsZVBlckxldmVsO1xyXG4gICAgY29uc3QgZGFtYWdlU2NhbGUgPSAxICsgbGV2ZWxGYWN0b3IgKiBnYW1lRGF0YS5nYW1lcGxheS5lbmVteURhbWFnZVNjYWxlUGVyTGV2ZWw7XHJcblxyXG4gICAgZW5lbWllcy5wdXNoKHtcclxuICAgICAgICBpZDogZW5lbXlJZENvdW50ZXIrKyxcclxuICAgICAgICB4OiB4LFxyXG4gICAgICAgIHk6IHksXHJcbiAgICAgICAgaGVhbHRoOiBlbmVteVR5cGVDb25maWcubWF4SGVhbHRoICogaGVhbHRoU2NhbGUsXHJcbiAgICAgICAgbWF4SGVhbHRoOiBlbmVteVR5cGVDb25maWcubWF4SGVhbHRoICogaGVhbHRoU2NhbGUsIC8vIE1heCBoZWFsdGggYWxzbyBuZWVkcyB0byBzY2FsZSBmb3IgaGVhbHRoIGJhciBkcmF3aW5nXHJcbiAgICAgICAgc3BlZWQ6IGVuZW15VHlwZUNvbmZpZy5zcGVlZCAqIHNwZWVkU2NhbGUsXHJcbiAgICAgICAgZGFtYWdlOiBlbmVteVR5cGVDb25maWcuZGFtYWdlICogZGFtYWdlU2NhbGUsXHJcbiAgICAgICAgYXNzZXROYW1lOiBlbmVteVR5cGVDb25maWcuYXNzZXROYW1lLFxyXG4gICAgICAgIGV4cFJld2FyZDogZW5lbXlUeXBlQ29uZmlnLmV4cFJld2FyZCwgLy8gRXhwZXJpZW5jZSByZXdhcmQgY2FuIGFsc28gc2NhbGUgaWYgZGVzaXJlZFxyXG4gICAgICAgIHNpemU6IGVuZW15VHlwZUNvbmZpZy5zaXplLCAvLyBFbmVteSBzdGlsbCB1c2VzICdzaXplJ1xyXG4gICAgfSk7XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBzZWxlY3RSYW5kb21FbmVteVR5cGUoKTogR2FtZURhdGFbJ2VuZW1pZXMnXVtudW1iZXJdIHwgdW5kZWZpbmVkIHtcclxuICAgIGNvbnN0IHRvdGFsV2VpZ2h0ID0gZ2FtZURhdGEuZW5lbWllcy5yZWR1Y2UoKHN1bSwgZW5lbXkpID0+IHN1bSArIGVuZW15LnNwYXduUmF0ZVdlaWdodCwgMCk7XHJcbiAgICBsZXQgcmFuZG9tID0gTWF0aC5yYW5kb20oKSAqIHRvdGFsV2VpZ2h0O1xyXG5cclxuICAgIGZvciAoY29uc3QgZW5lbXlUeXBlIG9mIGdhbWVEYXRhLmVuZW1pZXMpIHtcclxuICAgICAgICBpZiAocmFuZG9tIDwgZW5lbXlUeXBlLnNwYXduUmF0ZVdlaWdodCkge1xyXG4gICAgICAgICAgICByZXR1cm4gZW5lbXlUeXBlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByYW5kb20gLT0gZW5lbXlUeXBlLnNwYXduUmF0ZVdlaWdodDtcclxuICAgIH1cclxuICAgIHJldHVybiB1bmRlZmluZWQ7IC8vIFNob3VsZCBub3QgaGFwcGVuIGlmIHRvdGFsV2VpZ2h0ID4gMFxyXG59XHJcblxyXG4vLyBORVc6IFNlbGVjdCByYW5kb20gaXRlbSB0eXBlXHJcbmZ1bmN0aW9uIHNlbGVjdFJhbmRvbUl0ZW1UeXBlKCk6IEdhbWVEYXRhWydpdGVtcyddW251bWJlcl0gfCB1bmRlZmluZWQge1xyXG4gICAgY29uc3QgdG90YWxXZWlnaHQgPSBnYW1lRGF0YS5pdGVtcy5yZWR1Y2UoKHN1bSwgaXRlbSkgPT4gc3VtICsgaXRlbS5zcGF3blJhdGVXZWlnaHQsIDApO1xyXG4gICAgaWYgKHRvdGFsV2VpZ2h0ID09PSAwKSByZXR1cm4gdW5kZWZpbmVkO1xyXG5cclxuICAgIGxldCByYW5kb20gPSBNYXRoLnJhbmRvbSgpICogdG90YWxXZWlnaHQ7XHJcblxyXG4gICAgZm9yIChjb25zdCBpdGVtVHlwZSBvZiBnYW1lRGF0YS5pdGVtcykge1xyXG4gICAgICAgIGlmIChyYW5kb20gPCBpdGVtVHlwZS5zcGF3blJhdGVXZWlnaHQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGl0ZW1UeXBlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByYW5kb20gLT0gaXRlbVR5cGUuc3Bhd25SYXRlV2VpZ2h0O1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHVuZGVmaW5lZDsgLy8gU2hvdWxkIG5vdCBoYXBwZW4gaWYgdG90YWxXZWlnaHQgPiAwXHJcbn1cclxuXHJcbi8vIE5FVzogRnVuY3Rpb24gdG8gZHJvcCBhbiBpdGVtIGF0IGEgc3BlY2lmaWMgbG9jYXRpb24gd2hlbiBhbiBlbmVteSBkaWVzXHJcbmZ1bmN0aW9uIGRyb3BJdGVtKHg6IG51bWJlciwgeTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAvLyBPbmx5IGRyb3AgYW4gaXRlbSBpZiB0aGVyZSdzIGEgY29uZmlndXJlZCBjaGFuY2UgYW5kIHdlIGhhdmVuJ3QgaGl0IHRoZSBtYXggc2ltdWx0YW5lb3VzIGl0ZW1zXHJcbiAgICBpZiAoTWF0aC5yYW5kb20oKSA8IGdhbWVEYXRhLmdhbWVwbGF5Lml0ZW1Ecm9wQ2hhbmNlT25FbmVteURlZmVhdCAmJiBpdGVtcy5sZW5ndGggPCBnYW1lRGF0YS5nYW1lcGxheS5tYXhTaW11bHRhbmVvdXNJdGVtcykge1xyXG4gICAgICAgIGNvbnN0IGl0ZW1UeXBlQ29uZmlnID0gc2VsZWN0UmFuZG9tSXRlbVR5cGUoKTtcclxuICAgICAgICBpZiAoIWl0ZW1UeXBlQ29uZmlnKSByZXR1cm47IC8vIE5vIGl0ZW1zIGRlZmluZWQgb3Igd2VpZ2h0cyBzdW0gdG8gMFxyXG5cclxuICAgICAgICBpdGVtcy5wdXNoKHtcclxuICAgICAgICAgICAgeDogeCxcclxuICAgICAgICAgICAgeTogeSxcclxuICAgICAgICAgICAgc2l6ZTogaXRlbVR5cGVDb25maWcuc2l6ZSxcclxuICAgICAgICAgICAgdHlwZTogaXRlbVR5cGVDb25maWcubmFtZSxcclxuICAgICAgICAgICAgYXNzZXROYW1lOiBpdGVtVHlwZUNvbmZpZy5hc3NldE5hbWUsXHJcbiAgICAgICAgICAgIGVmZmVjdER1cmF0aW9uOiBpdGVtVHlwZUNvbmZpZy5lZmZlY3REdXJhdGlvbixcclxuICAgICAgICAgICAgZWZmZWN0VmFsdWU6IGl0ZW1UeXBlQ29uZmlnLmVmZmVjdFZhbHVlLFxyXG4gICAgICAgICAgICB0b3RhbExpZmV0aW1lOiBpdGVtVHlwZUNvbmZpZy50b3RhbExpZmV0aW1lLFxyXG4gICAgICAgICAgICBjdXJyZW50TGlmZXRpbWU6IGl0ZW1UeXBlQ29uZmlnLnRvdGFsTGlmZXRpbWUsXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYERyb3BwZWQgaXRlbTogJHtpdGVtVHlwZUNvbmZpZy5uYW1lfSBhdCAoJHt4LnRvRml4ZWQoMCl9LCAke3kudG9GaXhlZCgwKX0pYCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzV2l0aGluQm91bmRzKHg6IG51bWJlciwgeTogbnVtYmVyLCBzaXplOiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgIC8vIENoZWNrcyBpZiBhbiBvYmplY3QgaXMgd2l0aGluIHRoZSBjdXJyZW50bHkgdmlzaWJsZSAqY2FudmFzKiBib3VuZHMsIGNvbnNpZGVyaW5nIGNhbWVyYSBvZmZzZXRcclxuICAgIHJldHVybiB4ICsgc2l6ZSAvIDIgPiBjYW1lcmFYICYmIHggLSBzaXplIC8gMiA8IGNhbWVyYVggKyBjYW52YXMud2lkdGggJiZcclxuICAgICAgICAgICB5ICsgc2l6ZSAvIDIgPiBjYW1lcmFZICYmIHkgLSBzaXplIC8gMiA8IGNhbWVyYVkgKyBjYW52YXMuaGVpZ2h0O1xyXG59XHJcblxyXG4vLyAtLS0gQ29sbGlzaW9uIERldGVjdGlvbiAtLS1cclxuZnVuY3Rpb24gY2hlY2tDb2xsaXNpb25zKCk6IHZvaWQge1xyXG4gICAgLy8gUHJvamVjdGlsZS1FbmVteSBjb2xsaXNpb25zXHJcbiAgICBmb3IgKGxldCBpID0gcHJvamVjdGlsZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICBjb25zdCBwcm9qID0gcHJvamVjdGlsZXNbaV07XHJcbiAgICAgICAgZm9yIChsZXQgaiA9IGVuZW1pZXMubGVuZ3RoIC0gMTsgaiA+PSAwOyBqLS0pIHtcclxuICAgICAgICAgICAgY29uc3QgZW5lbXkgPSBlbmVtaWVzW2pdO1xyXG4gICAgICAgICAgICBpZiAoaXNDb2xsaWRpbmcocHJvaiwgZW5lbXkpKSB7XHJcbiAgICAgICAgICAgICAgICBlbmVteS5oZWFsdGggLT0gcHJvai5kYW1hZ2U7XHJcbiAgICAgICAgICAgICAgICBwcm9qZWN0aWxlcy5zcGxpY2UoaSwgMSk7IC8vIFJlbW92ZSBwcm9qZWN0aWxlIG9uIGhpdFxyXG4gICAgICAgICAgICAgICAgcGxheVNvdW5kKCdlbmVteV9oaXQnKTtcclxuICAgICAgICAgICAgICAgIGlmIChlbmVteS5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGRyb3BFeHBlcmllbmNlR2VtKGVuZW15LngsIGVuZW15LnksIGVuZW15LmV4cFJld2FyZCk7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gTkVXOiBDaGFuY2UgdG8gZHJvcCBhbiBpdGVtIHdoZW4gYW4gZW5lbXkgaXMgZGVmZWF0ZWRcclxuICAgICAgICAgICAgICAgICAgICBkcm9wSXRlbShlbmVteS54LCBlbmVteS55KTtcclxuICAgICAgICAgICAgICAgICAgICBlbmVtaWVzLnNwbGljZShqLCAxKTsgLy8gUmVtb3ZlIGRlZmVhdGVkIGVuZW15XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhazsgLy8gQSBwcm9qZWN0aWxlIGNhbiBvbmx5IGhpdCBvbmUgZW5lbXlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBQbGF5ZXItRW5lbXkgY29sbGlzaW9uc1xyXG4gICAgZm9yIChsZXQgaSA9IGVuZW1pZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICBjb25zdCBlbmVteSA9IGVuZW1pZXNbaV07XHJcbiAgICAgICAgaWYgKGlzQ29sbGlkaW5nKHBsYXllciwgZW5lbXkpKSB7XHJcbiAgICAgICAgICAgIHBsYXllci5oZWFsdGggLT0gZW5lbXkuZGFtYWdlICogZGVsdGFUaW1lOyAvLyBBcHBseSBkYW1hZ2Ugb3ZlciB0aW1lXHJcbiAgICAgICAgICAgIC8vIEZvciBub3csIHBsYXlpbmcgaGl0IHNvdW5kIHJlcGVhdGVkbHkgZHVyaW5nIGNvbGxpc2lvbiBpcyB0b28gbm9pc3kuXHJcbiAgICAgICAgICAgIC8vIEEgY29vbGRvd24gb3IgZGVkaWNhdGVkICdwbGF5ZXJfZGFtYWdlZCcgZXZlbnQgY291bGQgYmUgdXNlZC5cclxuICAgICAgICAgICAgLy8gTkVXOiBQbGF5IHBsYXllcl9oaXQgc291bmQgd2l0aCBjb29sZG93blxyXG4gICAgICAgICAgICBpZiAocGxheWVyLmhpdFNvdW5kQ29vbGRvd24gPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgcGxheVNvdW5kKCdwbGF5ZXJfaGl0Jyk7XHJcbiAgICAgICAgICAgICAgICBwbGF5ZXIuaGl0U291bmRDb29sZG93biA9IGdhbWVEYXRhLnBsYXllci5oaXRTb3VuZENvb2xkb3duRHVyYXRpb247XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChwbGF5ZXIuaGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIC8vIE1PRElGSUVEOiBTdG9yZSB0aGUgZ2FtZSB0aW1lIHdoZW4gZ2FtZSBvdmVyIGhhcHBlbnNcclxuICAgICAgICAgICAgICAgIGZpbmFsU3Vydml2YWxUaW1lID0gZ2FtZVRpbWVyO1xyXG4gICAgICAgICAgICAgICAgZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICAgICAgICAgIHN0b3BBbGxTb3VuZHMoKTsgLy8gU3RvcCBCR00gb24gZ2FtZSBvdmVyXHJcbiAgICAgICAgICAgICAgICBwbGF5QkdNKCdnYW1lX292ZXJfbXVzaWMnKTsgLy8gUGxheSBnYW1lIG92ZXIgbXVzaWNcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvLyBPcHRpb25hbDogYWRkIGtub2NrYmFjayBmb3IgcGxheWVyIG9yIGVuZW15XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFBsYXllci1FeHBlcmllbmNlR2VtIGNvbGxpc2lvbnNcclxuICAgIGZvciAobGV0IGkgPSBleHBlcmllbmNlR2Vtcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgIGNvbnN0IGdlbSA9IGV4cGVyaWVuY2VHZW1zW2ldO1xyXG4gICAgICAgIGlmIChpc0NvbGxpZGluZyhwbGF5ZXIsIGdlbSkpIHtcclxuICAgICAgICAgICAgcGxheWVyLmV4cGVyaWVuY2UgKz0gZ2VtLnZhbHVlO1xyXG4gICAgICAgICAgICBleHBlcmllbmNlR2Vtcy5zcGxpY2UoaSwgMSk7IC8vIFJlbW92ZSBjb2xsZWN0ZWQgZ2VtXHJcbiAgICAgICAgICAgIHBsYXlTb3VuZCgnZ2VtX2NvbGxlY3QnKTtcclxuICAgICAgICAgICAgaWYgKHBsYXllci5leHBlcmllbmNlID49IHBsYXllci5uZXh0TGV2ZWxFeHApIHtcclxuICAgICAgICAgICAgICAgIHBsYXllckxldmVsVXAoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBORVc6IFBsYXllci1JdGVtIGNvbGxpc2lvbnMgKG5vdyB0aGF0IGl0ZW1zIGFyZSBhdHRyYWN0ZWQsIHRoaXMgaGFuZGxlcyBmaW5hbCBjb2xsZWN0aW9uKVxyXG4gICAgZm9yIChsZXQgaSA9IGl0ZW1zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgY29uc3QgaXRlbSA9IGl0ZW1zW2ldO1xyXG4gICAgICAgIGlmIChpc0NvbGxpZGluZyhwbGF5ZXIsIGl0ZW0pKSB7XHJcbiAgICAgICAgICAgIGFwcGx5SXRlbUVmZmVjdChpdGVtKTtcclxuICAgICAgICAgICAgaXRlbXMuc3BsaWNlKGksIDEpOyAvLyBSZW1vdmUgY29sbGVjdGVkIGl0ZW1cclxuICAgICAgICAgICAgLy8gU291bmQgaXMgbm93IHBsYXllZCBpbnNpZGUgYXBwbHlJdGVtRWZmZWN0LCB0byBhbGxvdyBmb3Igc3BlY2lmaWMgc291bmRzIHBlciBpdGVtIHR5cGVcclxuICAgICAgICAgICAgLy8gcGxheVNvdW5kKCdpdGVtX2NvbGxlY3QnKTsgLy8gUkVNT1ZFRDogTW92ZWQgdG8gYXBwbHlJdGVtRWZmZWN0XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBTaW1wbGUgY2lyY3VsYXIgY29sbGlzaW9uIGRldGVjdGlvbiAoYXBwcm94aW1hdGVkIHdpdGggc2l6ZSBhcyBkaWFtZXRlcilcclxuZnVuY3Rpb24gaXNDb2xsaWRpbmcob2JqMTogR2FtZU9iamVjdCwgb2JqMjogR2FtZU9iamVjdCk6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgZGlzdGFuY2VYID0gb2JqMS54IC0gb2JqMi54O1xyXG4gICAgY29uc3QgZGlzdGFuY2VZID0gb2JqMS55IC0gb2JqMi55O1xyXG4gICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLnNxcnQoZGlzdGFuY2VYICogZGlzdGFuY2VYICsgZGlzdGFuY2VZICogZGlzdGFuY2VZKTtcclxuXHJcbiAgICBjb25zdCBjb21iaW5lZFJhZGl1cyA9IChvYmoxLnNpemUgLyAyKSArIChvYmoyLnNpemUgLyAyKTtcclxuICAgIHJldHVybiBkaXN0YW5jZSA8IGNvbWJpbmVkUmFkaXVzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkcm9wRXhwZXJpZW5jZUdlbSh4OiBudW1iZXIsIHk6IG51bWJlciwgdmFsdWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgZXhwZXJpZW5jZUdlbXMucHVzaCh7XHJcbiAgICAgICAgeDogeCxcclxuICAgICAgICB5OiB5LFxyXG4gICAgICAgIHZhbHVlOiB2YWx1ZSxcclxuICAgICAgICBhc3NldE5hbWU6IGdhbWVEYXRhLmV4cGVyaWVuY2VHZW1zLmFzc2V0TmFtZSxcclxuICAgICAgICBzaXplOiBnYW1lRGF0YS5leHBlcmllbmNlR2Vtcy5zaXplLFxyXG4gICAgICAgIGxpZmV0aW1lOiBnYW1lRGF0YS5leHBlcmllbmNlR2Vtcy50b3RhbExpZmV0aW1lLCAvLyBBRERFRDogSW5pdGlhbGl6ZSBsaWZldGltZVxyXG4gICAgfSk7XHJcbn1cclxuXHJcbi8vIE5FVzogQXBwbHkgaXRlbSBlZmZlY3QgdG8gcGxheWVyXHJcbmZ1bmN0aW9uIGFwcGx5SXRlbUVmZmVjdChpdGVtOiBJdGVtKTogdm9pZCB7XHJcbiAgICBzd2l0Y2ggKGl0ZW0udHlwZSkge1xyXG4gICAgICAgIGNhc2UgJ21hZ25ldCc6XHJcbiAgICAgICAgICAgIHBsYXllci5tYWduZXRFZmZlY3RUaW1lciA9IGl0ZW0uZWZmZWN0RHVyYXRpb247XHJcbiAgICAgICAgICAgIC8vIE1hZ25ldCBlZmZlY3QgdmFsdWUgaXMgQURERUQgdG8gYmFzZSByYWRpdXNcclxuICAgICAgICAgICAgcGxheWVyLmN1cnJlbnRNYWduZXRBdHRyYWN0UmFkaXVzID0gZ2FtZURhdGEucGxheWVyLmV4cEdlbUF0dHJhY3RSYWRpdXMgKyBpdGVtLmVmZmVjdFZhbHVlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgTWFnbmV0IGFjdGl2YXRlZCEgQXR0cmFjdCByYWRpdXM6ICR7cGxheWVyLmN1cnJlbnRNYWduZXRBdHRyYWN0UmFkaXVzfSBmb3IgJHtpdGVtLmVmZmVjdER1cmF0aW9ufXMuYCk7XHJcbiAgICAgICAgICAgIHBsYXlTb3VuZCgnaXRlbV9jb2xsZWN0Jyk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgJ3NwZWNpYWxfYXR0YWNrJzpcclxuICAgICAgICAgICAgcGxheWVyLnNwZWNpYWxBdHRhY2tFZmZlY3RUaW1lciA9IGl0ZW0uZWZmZWN0RHVyYXRpb247XHJcbiAgICAgICAgICAgIHBsYXllci5pc1NwZWNpYWxBdHRhY2tpbmcgPSB0cnVlO1xyXG4gICAgICAgICAgICBwbGF5ZXIuc3BlY2lhbEF0dGFja0ZpcmVDb29sZG93biA9IDA7IC8vIEltbWVkaWF0ZWx5IHJlYWR5IHRvIGZpcmVcclxuICAgICAgICAgICAgcGxheVNvdW5kKCdzcGVjaWFsX2F0dGFja19hY3RpdmF0ZScpOyAvLyBQbGF5IHNwZWNpYWwgYXR0YWNrIHNvdW5kXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBTcGVjaWFsIEF0dGFjayBhY3RpdmF0ZWQhIFJhZGlhbCBhdHRhY2sgZm9yICR7aXRlbS5lZmZlY3REdXJhdGlvbn1zLmApO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlICdoZWFsdGhfcG90aW9uJzogLy8gTkVXOiBIZWFsdGggUG90aW9uIGl0ZW1cclxuICAgICAgICAgICAgY29uc3QgaGVhbHRoQmVmb3JlID0gcGxheWVyLmhlYWx0aDtcclxuICAgICAgICAgICAgcGxheWVyLmhlYWx0aCA9IE1hdGgubWluKHBsYXllci5tYXhIZWFsdGgsIHBsYXllci5oZWFsdGggKyBpdGVtLmVmZmVjdFZhbHVlKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYEhlYWx0aCBQb3Rpb24gY29sbGVjdGVkISBIZWFsZWQgJHtwbGF5ZXIuaGVhbHRoIC0gaGVhbHRoQmVmb3JlfSBIUC4gQ3VycmVudCBoZWFsdGg6ICR7cGxheWVyLmhlYWx0aH0vJHtwbGF5ZXIubWF4SGVhbHRofS5gKTtcclxuICAgICAgICAgICAgcGxheVNvdW5kKCdpdGVtX2NvbGxlY3QnKTsgLy8gUmV1c2UgZ2VuZXJhbCBpdGVtIGNvbGxlY3Qgc291bmRcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBVbmtub3duIGl0ZW0gdHlwZSBjb2xsZWN0ZWQ6ICR7aXRlbS50eXBlfWApO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBwbGF5ZXJMZXZlbFVwKCk6IHZvaWQge1xyXG4gICAgcGxheWVyLmxldmVsKys7XHJcbiAgICBwbGF5ZXIuZXhwZXJpZW5jZSAtPSBwbGF5ZXIubmV4dExldmVsRXhwOyAvLyBEZWR1Y3Qgb25seSB0aGUgcmVxdWlyZWQgZXhwZXJpZW5jZVxyXG4gICAgcGxheWVyLm5leHRMZXZlbEV4cCA9IE1hdGguZmxvb3IocGxheWVyLm5leHRMZXZlbEV4cCAqIGdhbWVEYXRhLmdhbWVwbGF5LmxldmVsVXBFeHBNdWx0aXBsaWVyKTtcclxuXHJcbiAgICAvLyBORVc6IEluY3JlYXNlIGF0dGFjayBzcGVlZCAocmVkdWNlIGF0dGFjayBjb29sZG93bikgd2l0aCBlYWNoIGxldmVsIHVwXHJcbiAgICAvLyBFbnN1cmUgY29vbGRvd24gZG9lc24ndCBiZWNvbWUgdG9vIHNtYWxsIChlLmcuLCBuZWdhdGl2ZSBvciB6ZXJvKSwgc2V0dGluZyBhIG1pbmltdW0gb2YgMC4wNSBzZWNvbmRzXHJcbiAgICBwbGF5ZXIuYXR0YWNrQ29vbGRvd24gPSBNYXRoLm1heCgwLjA1LCBwbGF5ZXIuYXR0YWNrQ29vbGRvd24gKiAoMSAtIGdhbWVEYXRhLmdhbWVwbGF5LmF0dGFja1NwZWVkSW5jcmVhc2VQZXJMZXZlbCkpO1xyXG5cclxuICAgIC8vIFVTRVIgUkVRVUVTVDogV2hlbiB0aGUgbGV2ZWwgYmVjb21lcyBhIG11bHRpcGxlIG9mIDMsIGluY3JlYXNlIHRoZSBudW1iZXIgb2YgYXR0YWNrcyBieSBvbmVcclxuICAgIGlmIChwbGF5ZXIubGV2ZWwgJSAzID09PSAwKSB7XHJcbiAgICAgICAgcGxheWVyLm51bWJlck9mQXR0YWNrcysrO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBQbGF5ZXIgbGV2ZWxlZCB1cCB0byAke3BsYXllci5sZXZlbH0hIE51bWJlciBvZiBhdHRhY2tzIGluY3JlYXNlZCB0byAke3BsYXllci5udW1iZXJPZkF0dGFja3N9LmApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFVTRVIgUkVRVUVTVDogRHluYW1pY2FsbHkgYWRqdXN0IGVuZW15IHNwYXduaW5nIGFuZCBkaWZmaWN1bHR5XHJcbiAgICAvLyAxLiBJbmNyZWFzZSBtYXggZW5lbWllcyBhbGxvd2VkIGJhc2VkIG9uIHBsYXllciBsZXZlbFxyXG4gICAgY3VycmVudEVmZmVjdGl2ZU1heEVuZW1pZXMgPSBnYW1lRGF0YS5nYW1lcGxheS5iYXNlTWF4RW5lbWllcyArIChwbGF5ZXIubGV2ZWwgLSAxKSAqIGdhbWVEYXRhLmdhbWVwbGF5Lm1heEVuZW1pZXNJbmNyZWFzZVBlckxldmVsO1xyXG4gICAgLy8gMi4gRGVjcmVhc2UgZW5lbXkgc3Bhd24gaW50ZXJ2YWwgKHNwYXduIGZhc3RlcikgYmFzZWQgb24gcGxheWVyIGxldmVsXHJcbiAgICAvLyBVc2luZyBNYXRoLnBvdyBmb3IgbXVsdGlwbGljYXRpdmUgcmVkdWN0aW9uIHBlciBsZXZlbC5cclxuICAgIGN1cnJlbnRFZmZlY3RpdmVFbmVteVNwYXduSW50ZXJ2YWwgPSBNYXRoLm1heChcclxuICAgICAgICBnYW1lRGF0YS5nYW1lcGxheS5taW5FbmVteVNwYXduSW50ZXJ2YWwsXHJcbiAgICAgICAgZ2FtZURhdGEuZ2FtZXBsYXkuYmFzZUVuZW15U3Bhd25JbnRlcnZhbCAqIE1hdGgucG93KGdhbWVEYXRhLmdhbWVwbGF5LnNwYXduSW50ZXJ2YWxSZWR1Y3Rpb25GYWN0b3JQZXJMZXZlbCwgcGxheWVyLmxldmVsIC0gMSlcclxuICAgICk7XHJcblxyXG4gICAgLy8gVHJhbnNpdGlvbiB0byBMRVZFTF9VUCBzdGF0ZSB0byBwYXVzZSBhbmQgZGlzcGxheSBjaG9pY2VzXHJcbiAgICBnYW1lU3RhdGUgPSBHYW1lU3RhdGUuTEVWRUxfVVA7XHJcbiAgICAvLyBTb3VuZCB3aWxsIGJlIHBsYXllZCBvbmNlICdFbnRlcicgaXMgcHJlc3NlZCBhbmQgb3B0aW9uIGlzIGNob3NlblxyXG59XHJcblxyXG5mdW5jdGlvbiBhcHBseUxldmVsVXBFZmZlY3Qob3B0aW9uOiBHYW1lRGF0YVsndWknXVsnbGV2ZWxVcE9wdGlvbnMnXVtudW1iZXJdKTogdm9pZCB7XHJcbiAgICAvLyBUaGlzIGlzIGEgc2ltcGxlIGludGVycHJldGF0aW9uIG9mIGVmZmVjdHMgZGlyZWN0bHkgZnJvbSBKU09OIHN0cmluZy5cclxuICAgIC8vIEluIGEgcHJvZHVjdGlvbiBnYW1lLCBhIG1vcmUgcm9idXN0IHN5c3RlbSAoZS5nLiwgZnVuY3Rpb24gbWFwcGluZykgd291bGQgYmUgdXNlZC5cclxuICAgIHRyeSB7XHJcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWV2YWxcclxuICAgICAgICBldmFsKG9wdGlvbi5lZmZlY3QpOyAvLyBFeGVjdXRlIHRoZSBlZmZlY3Qgc3RyaW5nLiBXQVJOSU5HOiBldmFsIGlzIGRhbmdlcm91cyBpbiByZWFsIGFwcHMhXHJcbiAgICAgICAgLy8gUmUtY2xhbXAgaGVhbHRoIGFmdGVyIG1heEhlYWx0aCBjaGFuZ2VcclxuICAgICAgICBwbGF5ZXIuaGVhbHRoID0gTWF0aC5taW4ocGxheWVyLmhlYWx0aCwgcGxheWVyLm1heEhlYWx0aCk7XHJcbiAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGFwcGx5IGxldmVsIHVwIGVmZmVjdDonLCBvcHRpb24uZWZmZWN0LCBlKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gLS0tIFJlbmRlcmluZyAtLS1cclxuZnVuY3Rpb24gcmVuZGVyKCk6IHZvaWQge1xyXG4gICAgY3R4LmNsZWFyUmVjdCgwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgIHN3aXRjaCAoZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgIGRyYXdUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLkxFVkVMX1VQOiAvLyBTaG93IGdhbWUgaW4gYmFja2dyb3VuZCBkdXJpbmcgbGV2ZWwgdXBcclxuICAgICAgICAgICAgZHJhd0dhbWVwbGF5KCk7XHJcbiAgICAgICAgICAgIGRyYXdVSSgpO1xyXG4gICAgICAgICAgICBpZiAoZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuTEVWRUxfVVApIHtcclxuICAgICAgICAgICAgICAgIGRyYXdMZXZlbFVwU2NyZWVuKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICBkcmF3R2FtZXBsYXkoKTsgLy8gU2hvdyBmaW5hbCBnYW1lIHN0YXRlXHJcbiAgICAgICAgICAgIGRyYXdHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgIH1cclxufVxyXG5cclxuLy8gRHJhd3MgYW4gaW1hZ2UgYXNzZXQsIHNjYWxlZCB0byBzcGVjaWZpZWQgd2lkdGgvaGVpZ2h0IGFuZCBjZW50ZXJlZCBhdCAoeCx5KVxyXG4vLyBBZGRlZCBhcHBseVNoYWRvdyBwYXJhbWV0ZXIgdG8gY29udHJvbCB3aGV0aGVyIHNoYWRvd3MgYXJlIGRyYXduIGZvciB0aGlzIHNwZWNpZmljIHNwcml0ZVxyXG4vLyBORVc6IGFkZGVkIHJlbGF0aXZlVG9DYW1lcmEgcGFyYW1ldGVyLCBpZiBmYWxzZSwgeCx5IGFyZSBjYW52YXMgY29vcmRpbmF0ZXMgKG5vdCB3b3JsZCBjb29yZGluYXRlcylcclxuZnVuY3Rpb24gZHJhd1Nwcml0ZShhc3NldE5hbWU6IHN0cmluZywgeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBhcHBseVNoYWRvdzogYm9vbGVhbiA9IHRydWUsIHJlbGF0aXZlVG9DYW1lcmE6IGJvb2xlYW4gPSB0cnVlKTogdm9pZCB7XHJcbiAgICBjb25zdCBpbWFnZSA9IGFzc2V0cy5pbWFnZXMuZ2V0KGFzc2V0TmFtZSk7XHJcbiAgICBpZiAoaW1hZ2UpIHtcclxuICAgICAgICBsZXQgZHJhd1gsIGRyYXdZO1xyXG5cclxuICAgICAgICBpZiAocmVsYXRpdmVUb0NhbWVyYSkge1xyXG4gICAgICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIHRvcC1sZWZ0IGRyYXdpbmcgcG9zaXRpb24gcmVsYXRpdmUgdG8gdGhlIGNhbWVyYVxyXG4gICAgICAgICAgICBkcmF3WCA9IHggLSB3aWR0aCAvIDIgLSBjYW1lcmFYO1xyXG4gICAgICAgICAgICBkcmF3WSA9IHkgLSBoZWlnaHQgLyAyIC0gY2FtZXJhWTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyB4LCB5IGFyZSBhbHJlYWR5IGNhbnZhcy1yZWxhdGl2ZSBjb29yZGluYXRlcywgY2VudGVyIHRoZSBpbWFnZVxyXG4gICAgICAgICAgICBkcmF3WCA9IHggLSB3aWR0aCAvIDI7XHJcbiAgICAgICAgICAgIGRyYXdZID0geSAtIGhlaWdodCAvIDI7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjdHguc2F2ZSgpOyAvLyBTYXZlIHRoZSBjdXJyZW50IGNhbnZhcyByZW5kZXJpbmcgY29udGV4dCBzdGF0ZVxyXG5cclxuICAgICAgICAvLyBBcHBseSBzaGFkb3cgcHJvcGVydGllcyBpZiBlbmFibGVkIGluIGdhbWVEYXRhIGFuZCByZXF1ZXN0ZWQgZm9yIHRoaXMgc3ByaXRlXHJcbiAgICAgICAgaWYgKGdhbWVEYXRhLmdyYXBoaWNzLnNoYWRvd0VuYWJsZWQgJiYgYXBwbHlTaGFkb3cpIHtcclxuICAgICAgICAgICAgY3R4LnNoYWRvd0NvbG9yID0gZ2FtZURhdGEuZ3JhcGhpY3Muc2hhZG93Q29sb3I7XHJcbiAgICAgICAgICAgIGN0eC5zaGFkb3dCbHVyID0gZ2FtZURhdGEuZ3JhcGhpY3Muc2hhZG93Qmx1cjtcclxuICAgICAgICAgICAgY3R4LnNoYWRvd09mZnNldFggPSBnYW1lRGF0YS5ncmFwaGljcy5zaGFkb3dPZmZzZXRYO1xyXG4gICAgICAgICAgICBjdHguc2hhZG93T2Zmc2V0WSA9IGdhbWVEYXRhLmdyYXBoaWNzLnNoYWRvd09mZnNldFk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBEcmF3IHRoZSBpbWFnZSAod2l0aCBzaGFkb3cgaWYgY29uZmlndXJlZClcclxuICAgICAgICBjdHguZHJhd0ltYWdlKGltYWdlLCBkcmF3WCwgZHJhd1ksIHdpZHRoLCBoZWlnaHQpO1xyXG5cclxuICAgICAgICBjdHgucmVzdG9yZSgpOyAvLyBSZXN0b3JlIHRoZSBjYW52YXMgcmVuZGVyaW5nIGNvbnRleHQgc3RhdGUgKHJlbW92ZXMgc2hhZG93IHNldHRpbmdzKVxyXG5cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gRmFsbGJhY2s6IGRyYXcgYSBjb2xvcmVkIHJlY3RhbmdsZSBpZiBpbWFnZSBub3QgZm91bmRcclxuICAgICAgICBjdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgLy8gTm90ZTogRmFsbGJhY2sgcmVjdGFuZ2xlIGRyYXdpbmcgYWxzbyBuZWVkcyB0byByZXNwZWN0IGNhbWVyYSBwb3NpdGlvblxyXG4gICAgICAgIC8vIFRoaXMgbG9naWMgbmVlZHMgdG8gbWlycm9yIHRoZSBkcmF3WC9kcmF3WSBjYWxjdWxhdGlvbiBhYm92ZVxyXG4gICAgICAgIGxldCBmYWxsYmFja0RyYXdYLCBmYWxsYmFja0RyYXdZO1xyXG4gICAgICAgIGlmIChyZWxhdGl2ZVRvQ2FtZXJhKSB7XHJcbiAgICAgICAgICAgIGZhbGxiYWNrRHJhd1ggPSB4IC0gd2lkdGggLyAyIC0gY2FtZXJhWDtcclxuICAgICAgICAgICAgZmFsbGJhY2tEcmF3WSA9IHkgLSBoZWlnaHQgLyAyIC0gY2FtZXJhWTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBmYWxsYmFja0RyYXdYID0geCAtIHdpZHRoIC8gMjtcclxuICAgICAgICAgICAgZmFsbGJhY2tEcmF3WSA9IHkgLSBoZWlnaHQgLyAyO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjdHguZmlsbFJlY3QoZmFsbGJhY2tEcmF3WCwgZmFsbGJhY2tEcmF3WSwgd2lkdGgsIGhlaWdodCk7XHJcbiAgICAgICAgY29uc29sZS53YXJuKGBJbWFnZSBhc3NldCBcIiR7YXNzZXROYW1lfVwiIG5vdCBmb3VuZC4gRHJhd2luZyBwbGFjZWhvbGRlci5gKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZHJhd1RpdGxlU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgLy8gRHJhdyB0aGUgdGl0bGUgc2NyZWVuIGltYWdlIGZpcnN0LCBmaWxsaW5nIHRoZSBlbnRpcmUgY2FudmFzXHJcbiAgICAvLyBJdCdzIG5vdCByZWxhdGl2ZSB0byB0aGUgY2FtZXJhLCBhbmQgaXQgZG9lc24ndCBuZWVkIGEgc2hhZG93LlxyXG4gICAgY29uc3QgdGl0bGVJbWFnZU5hbWUgPSBnYW1lRGF0YS51aS50aXRsZVNjcmVlbkltYWdlO1xyXG4gICAgaWYgKHRpdGxlSW1hZ2VOYW1lKSB7XHJcbiAgICAgICAgZHJhd1Nwcml0ZSh0aXRsZUltYWdlTmFtZSwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIsIGNhbnZhcy53aWR0aCwgY2FudmFzLmhlaWdodCwgZmFsc2UsIGZhbHNlKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gRmFsbGJhY2s6IGNsZWFyIHRoZSBjYW52YXMgaWYgbm8gdGl0bGUgaW1hZ2UgaXMgc3BlY2lmaWVkXHJcbiAgICAgICAgY3R4LmNsZWFyUmVjdCgwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSAnYmxhY2snO1xyXG4gICAgICAgIGN0eC5maWxsUmVjdCgwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIE92ZXJsYXkgdGV4dFxyXG4gICAgY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgY3R4LmZpbGxTdHlsZSA9IGdhbWVEYXRhLnVpLnRleHRDb2xvcjtcclxuICAgIGN0eC5mb250ID0gYGJvbGQgNDhweCAke2dhbWVEYXRhLnVpLmZvbnR9YDtcclxuICAgIGN0eC5maWxsVGV4dChnYW1lRGF0YS51aS5nYW1lVGl0bGVUZXh0LCBjYW52YXMud2lkdGggLyAyLCBjYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuXHJcbiAgICAvLyBNT0RJRklFRDogXCJQcmVzcyBhbnkga2V5IHRvIHN0YXJ0XCIgdGV4dCBtb3ZlZCB0byBib3R0b20gYW5kIGJsaW5rc1xyXG4gICAgY29uc3QgYmxpbmtGcmVxdWVuY3kgPSBnYW1lRGF0YS51aS50aXRsZVNjcmVlbkJsaW5rRnJlcXVlbmN5O1xyXG4gICAgY29uc3Qgc2hvdWxkRHJhd1ByZXNzQW55S2V5VGV4dCA9IChNYXRoLmZsb29yKGdhbWVUaW1lciAqIGJsaW5rRnJlcXVlbmN5KSAlIDIgPT09IDApO1xyXG5cclxuICAgIGlmIChzaG91bGREcmF3UHJlc3NBbnlLZXlUZXh0KSB7XHJcbiAgICAgICAgY3R4LmZvbnQgPSBgMjRweCAke2dhbWVEYXRhLnVpLmZvbnR9YDtcclxuICAgICAgICBjb25zdCB0ZXh0WSA9IGNhbnZhcy5oZWlnaHQgLSBnYW1lRGF0YS51aS50aXRsZVNjcmVlblRleHRZT2Zmc2V0RnJvbUJvdHRvbTtcclxuICAgICAgICBjdHguZmlsbFRleHQoZ2FtZURhdGEudWkudGl0bGVTY3JlZW5UZXh0LCBjYW52YXMud2lkdGggLyAyLCB0ZXh0WSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdHYW1lcGxheSgpOiB2b2lkIHtcclxuICAgIC8vIE5FVzogRHJhdyBiYWNrZ3JvdW5kIGltYWdlIGZpcnN0XHJcbiAgICBjb25zdCBiYWNrZ3JvdW5kSW1hZ2VOYW1lID0gZ2FtZURhdGEuY2FudmFzLmJhY2tncm91bmRJbWFnZTtcclxuICAgIGNvbnN0IGJhY2tncm91bmRJbWFnZSA9IGFzc2V0cy5pbWFnZXMuZ2V0KGJhY2tncm91bmRJbWFnZU5hbWUpO1xyXG5cclxuICAgIGlmIChiYWNrZ3JvdW5kSW1hZ2UpIHtcclxuICAgICAgICAvLyBEcmF3IHRoZSBiYWNrZ3JvdW5kIGltYWdlIHRvIGNvdmVyIHRoZSBlbnRpcmUgbWFwLCBhZGp1c3RlZCBieSBjYW1lcmFcclxuICAgICAgICAvLyBUaGUgZHJhd1Nwcml0ZSBmdW5jdGlvbiBhbHJlYWR5IHN1YnRyYWN0cyBjYW1lcmFYL1kgYW5kIGNlbnRlcnMgdGhlIGltYWdlLlxyXG4gICAgICAgIC8vIFNvIHdlIHBhc3MgdGhlIGNlbnRlciBvZiB0aGUgbWFwIGFzIHgseSBhbmQgbWFwIGRpbWVuc2lvbnMgYXMgd2lkdGgsaGVpZ2h0LlxyXG4gICAgICAgIC8vIElNUE9SVEFOVDogQmFja2dyb3VuZCBzaG91bGQgTk9UIGhhdmUgYSBzaGFkb3csIHNvIHBhc3MgJ2ZhbHNlJyBmb3IgYXBwbHlTaGFkb3dcclxuICAgICAgICBkcmF3U3ByaXRlKGJhY2tncm91bmRJbWFnZU5hbWUsIGdhbWVEYXRhLmNhbnZhcy5tYXBXaWR0aCAvIDIsIGdhbWVEYXRhLmNhbnZhcy5tYXBIZWlnaHQgLyAyLCBnYW1lRGF0YS5jYW52YXMubWFwV2lkdGgsIGdhbWVEYXRhLmNhbnZhcy5tYXBIZWlnaHQsIGZhbHNlKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gRmFsbGJhY2s6IGRyYXcgYSBzb2xpZCBjb2xvciBpZiBiYWNrZ3JvdW5kIGltYWdlIGlzIG5vdCBmb3VuZFxyXG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSAnIzMzMyc7IC8vIERhcmsgZ3JheSBmYWxsYmFja1xyXG4gICAgICAgIGN0eC5maWxsUmVjdCgwIC0gY2FtZXJhWCwgMCAtIGNhbWVyYVksIGdhbWVEYXRhLmNhbnZhcy5tYXBXaWR0aCwgZ2FtZURhdGEuY2FudmFzLm1hcEhlaWdodCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIE9wdGlvbmFsOiBEcmF3IG1hcCBib3VuZGFyaWVzIGZvciBkZWJ1Z2dpbmcgcHVycG9zZXNcclxuICAgIC8vIFRoaXMgd2lsbCBhcHBlYXIgcmVsYXRpdmUgdG8gdGhlIGNhbWVyYSwgc28gaXQgbW92ZXMgYXMgdGhlIGNhbWVyYSBtb3Zlc1xyXG4gICAgY3R4LnN0cm9rZVN0eWxlID0gJ3JnYmEoMjU1LCAyNTUsIDI1NSwgMC41KSc7XHJcbiAgICBjdHgubGluZVdpZHRoID0gNTtcclxuICAgIGN0eC5zdHJva2VSZWN0KDAgLSBjYW1lcmFYLCAwIC0gY2FtZXJhWSwgZ2FtZURhdGEuY2FudmFzLm1hcFdpZHRoLCBnYW1lRGF0YS5jYW52YXMubWFwSGVpZ2h0KTtcclxuICAgIFxyXG4gICAgLy8gRHJhdyBwbGF5ZXJcclxuICAgIC8vIFVzZSBwbGF5ZXIuZHJhd1dpZHRoIGFuZCBwbGF5ZXIuZHJhd0hlaWdodCBmb3IgZHJhd2luZ1xyXG4gICAgZHJhd1Nwcml0ZShwbGF5ZXIuYXNzZXROYW1lLCBwbGF5ZXIueCwgcGxheWVyLnksIHBsYXllci5kcmF3V2lkdGgsIHBsYXllci5kcmF3SGVpZ2h0KTsgLy8gYXBwbHlTaGFkb3cgZGVmYXVsdHMgdG8gdHJ1ZVxyXG5cclxuICAgIC8vIERyYXcgZW5lbWllc1xyXG4gICAgZm9yIChjb25zdCBlbmVteSBvZiBlbmVtaWVzKSB7XHJcbiAgICAgICAgLy8gRW5lbWllcyBzdGlsbCB1c2UgYSBzaW5nbGUgJ3NpemUnIGZvciBib3RoIGRyYXdpbmcgYW5kIGNvbGxpc2lvbiAoc3F1YXJlIHNwcml0ZSBhc3N1bXB0aW9uKVxyXG4gICAgICAgIGRyYXdTcHJpdGUoZW5lbXkuYXNzZXROYW1lLCBlbmVteS54LCBlbmVteS55LCBlbmVteS5zaXplLCBlbmVteS5zaXplKTsgLy8gYXBwbHlTaGFkb3cgZGVmYXVsdHMgdG8gdHJ1ZVxyXG4gICAgICAgIC8vIERyYXcgZW5lbXkgaGVhbHRoIGJhclxyXG4gICAgICAgIGRyYXdIZWFsdGhCYXIoZW5lbXkueCAtIGNhbWVyYVgsIGVuZW15LnkgLSBlbmVteS5zaXplIC8gMiAtIDEwIC0gY2FtZXJhWSwgZW5lbXkuc2l6ZSwgNSwgZW5lbXkuaGVhbHRoLCBlbmVteS5tYXhIZWFsdGgsICdyZWQnLCAnZGFya3JlZCcpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERyYXcgcHJvamVjdGlsZXNcclxuICAgIGZvciAoY29uc3QgcHJvaiBvZiBwcm9qZWN0aWxlcykge1xyXG4gICAgICAgIC8vIFByb2plY3RpbGVzIHN0aWxsIHVzZSBhIHNpbmdsZSAnc2l6ZScgZm9yIGJvdGggZHJhd2luZyBhbmQgY29sbGlzaW9uIChzcXVhcmUgc3ByaXRlIGFzc3VtcHRpb24pXHJcbiAgICAgICAgZHJhd1Nwcml0ZShwcm9qLmFzc2V0TmFtZSwgcHJvai54LCBwcm9qLnksIHByb2ouc2l6ZSwgcHJvai5zaXplKTsgLy8gYXBwbHlTaGFkb3cgZGVmYXVsdHMgdG8gdHJ1ZVxyXG4gICAgfVxyXG5cclxuICAgIC8vIERyYXcgZXhwZXJpZW5jZSBnZW1zXHJcbiAgICBmb3IgKGNvbnN0IGdlbSBvZiBleHBlcmllbmNlR2Vtcykge1xyXG4gICAgICAgIC8vIEFEREVEOiBCbGlua2luZyBsb2dpYyBmb3IgZXhwZXJpZW5jZSBnZW1zXHJcbiAgICAgICAgbGV0IHNob3VsZERyYXdHZW0gPSB0cnVlO1xyXG4gICAgICAgIGlmIChnZW0ubGlmZXRpbWUgPD0gZ2FtZURhdGEuZXhwZXJpZW5jZUdlbXMuYmxpbmtUaHJlc2hvbGRTZWNvbmRzKSB7XHJcbiAgICAgICAgICAgIC8vIERldGVybWluZSBpZiB0aGUgZ2VtIHNob3VsZCBiZSBkcmF3biBiYXNlZCBvbiBjdXJyZW50IHRpbWUgZm9yIGJsaW5raW5nIGVmZmVjdFxyXG4gICAgICAgICAgICAvLyBXZSB1c2UgTWF0aC5mbG9vcihnYW1lVGltZXIgKiBnYW1lRGF0YS5leHBlcmllbmNlR2Vtcy5ibGlua0ZyZXF1ZW5jeSkgJSAyIHRvIGFsdGVybmF0ZSBkcmF3aW5nL25vdCBkcmF3aW5nXHJcbiAgICAgICAgICAgIGlmIChNYXRoLmZsb29yKGdhbWVUaW1lciAqIGdhbWVEYXRhLmV4cGVyaWVuY2VHZW1zLmJsaW5rRnJlcXVlbmN5KSAlIDIgIT09IDApIHtcclxuICAgICAgICAgICAgICAgIHNob3VsZERyYXdHZW0gPSBmYWxzZTsgLy8gU2tpcCBkcmF3aW5nIHRoaXMgZnJhbWUgdG8gY3JlYXRlIGJsaW5rIGVmZmVjdFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoc2hvdWxkRHJhd0dlbSkge1xyXG4gICAgICAgICAgICAvLyBHZW1zIHN0aWxsIHVzZSBhIHNpbmdsZSAnc2l6ZScgZm9yIGJvdGggZHJhd2luZyBhbmQgY29sbGlzaW9uIChzcXVhcmUgc3ByaXRlIGFzc3VtcHRpb24pXHJcbiAgICAgICAgICAgIGRyYXdTcHJpdGUoZ2VtLmFzc2V0TmFtZSwgZ2VtLngsIGdlbS55LCBnZW0uc2l6ZSwgZ2VtLnNpemUpOyAvLyBhcHBseVNoYWRvdyBkZWZhdWx0cyB0byB0cnVlXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIE5FVzogRHJhdyBpdGVtc1xyXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zKSB7XHJcbiAgICAgICAgZHJhd1Nwcml0ZShpdGVtLmFzc2V0TmFtZSwgaXRlbS54LCBpdGVtLnksIGl0ZW0uc2l6ZSwgaXRlbS5zaXplKTsgLy8gYXBwbHlTaGFkb3cgZGVmYXVsdHMgdG8gdHJ1ZVxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gZHJhdyBhIGhlYWx0aCBiYXIgKHVzZWQgZm9yIGVuZW1pZXMpXHJcbmZ1bmN0aW9uIGRyYXdIZWFsdGhCYXIoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBjdXJyZW50SGVhbHRoOiBudW1iZXIsIG1heEhlYWx0aDogbnVtYmVyLCBmaWxsQ29sb3I6IHN0cmluZywgYmdDb2xvcjogc3RyaW5nKTogdm9pZCB7XHJcbiAgICBjdHguZmlsbFN0eWxlID0gYmdDb2xvcjtcclxuICAgIGN0eC5maWxsUmVjdCh4IC0gd2lkdGggLyAyLCB5LCB3aWR0aCwgaGVpZ2h0KTtcclxuICAgIGN0eC5maWxsU3R5bGUgPSBmaWxsQ29sb3I7XHJcbiAgICBjdHguZmlsbFJlY3QoeCAtIHdpZHRoIC8gMiwgeSwgKGN1cnJlbnRIZWFsdGggLyBtYXhIZWFsdGgpICogd2lkdGgsIGhlaWdodCk7XHJcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSAnYmxhY2snO1xyXG4gICAgY3R4LmxpbmVXaWR0aCA9IDE7XHJcbiAgICBjdHguc3Ryb2tlUmVjdCh4IC0gd2lkdGggLyAyLCB5LCB3aWR0aCwgaGVpZ2h0KTtcclxufVxyXG5cclxuLy8gTkVXOiBIZWxwZXIgZnVuY3Rpb24gdG8gZHJhdyBhIHJvdW5kZWQgcmVjdGFuZ2xlXHJcbmZ1bmN0aW9uIGRyYXdSb3VuZGVkUmVjdCh4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHJhZGl1czogbnVtYmVyLCBmaWxsQ29sb3I6IHN0cmluZyB8IG51bGwgPSBudWxsLCBzdHJva2VDb2xvcjogc3RyaW5nIHwgbnVsbCA9IG51bGwsIHN0cm9rZVdpZHRoOiBudW1iZXIgPSAxKTogdm9pZCB7XHJcbiAgICBjdHguYmVnaW5QYXRoKCk7XHJcbiAgICBjdHgubW92ZVRvKHggKyByYWRpdXMsIHkpO1xyXG4gICAgY3R4LmxpbmVUbyh4ICsgd2lkdGggLSByYWRpdXMsIHkpO1xyXG4gICAgY3R4LnF1YWRyYXRpY0N1cnZlVG8oeCArIHdpZHRoLCB5LCB4ICsgd2lkdGgsIHkgKyByYWRpdXMpO1xyXG4gICAgY3R4LmxpbmVUbyh4ICsgd2lkdGgsIHkgKyBoZWlnaHQgLSByYWRpdXMpO1xyXG4gICAgY3R4LnF1YWRyYXRpY0N1cnZlVG8oeCArIHdpZHRoLCB5ICsgaGVpZ2h0LCB4ICsgd2lkdGggLSByYWRpdXMsIHkgKyBoZWlnaHQpO1xyXG4gICAgY3R4LmxpbmVUbyh4ICsgcmFkaXVzLCB5ICsgaGVpZ2h0KTtcclxuICAgIGN0eC5xdWFkcmF0aWNDdXJ2ZVRvKHgsIHkgKyBoZWlnaHQsIHgsIHkgKyBoZWlnaHQgLSByYWRpdXMpO1xyXG4gICAgY3R4LmxpbmVUbyh4LCB5ICsgcmFkaXVzKTtcclxuICAgIGN0eC5xdWFkcmF0aWNDdXJ2ZVRvKHgsIHksIHggKyByYWRpdXMsIHkpOyAvKiBGSVg6IENoYW5nZWQgJ3F1YWRyYXRpY0N1cnZlQ3VydmVUbycgdG8gJ3F1YWRyYXRpY0N1cnZlVG8nICovXHJcbiAgICBjdHguY2xvc2VQYXRoKCk7XHJcblxyXG4gICAgaWYgKGZpbGxDb2xvcikge1xyXG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBmaWxsQ29sb3I7XHJcbiAgICAgICAgY3R4LmZpbGwoKTtcclxuICAgIH1cclxuICAgIGlmIChzdHJva2VDb2xvcikge1xyXG4gICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IHN0cm9rZUNvbG9yO1xyXG4gICAgICAgIGN0eC5saW5lV2lkdGggPSBzdHJva2VXaWR0aDtcclxuICAgICAgICBjdHguc3Ryb2tlKCk7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBkcmF3VUkoKTogdm9pZCB7XHJcbiAgICAvLyBIZWFsdGggQmFyXHJcbiAgICBjb25zdCBoZWFsdGhCYXJDb25maWcgPSBnYW1lRGF0YS51aS5oZWFsdGhCYXI7XHJcbiAgICBjb25zdCBoZWFsdGhCYXJYID0gMTA7XHJcbiAgICBjb25zdCBoZWFsdGhCYXJZID0gMTA7XHJcbiAgICBjb25zdCBoZWFsdGhCYXJXaWR0aCA9IGhlYWx0aEJhckNvbmZpZy53aWR0aDtcclxuICAgIGNvbnN0IGhlYWx0aEJhckhlaWdodCA9IGhlYWx0aEJhckNvbmZpZy5oZWlnaHQ7XHJcbiAgICBjb25zdCBoZWFsdGhCYXJSYWRpdXMgPSBoZWFsdGhCYXJDb25maWcuY29ybmVyUmFkaXVzO1xyXG4gICAgY29uc3QgY3VycmVudEhlYWx0aFdpZHRoID0gKHBsYXllci5oZWFsdGggLyBwbGF5ZXIubWF4SGVhbHRoKSAqIGhlYWx0aEJhcldpZHRoO1xyXG5cclxuICAgIC8vIERyYXcgaGVhbHRoIGJhciBiYWNrZ3JvdW5kXHJcbiAgICBkcmF3Um91bmRlZFJlY3QoaGVhbHRoQmFyWCwgaGVhbHRoQmFyWSwgaGVhbHRoQmFyV2lkdGgsIGhlYWx0aEJhckhlaWdodCwgaGVhbHRoQmFyUmFkaXVzLCBoZWFsdGhCYXJDb25maWcuYmFja2dyb3VuZENvbG9yKTtcclxuICAgIC8vIERyYXcgaGVhbHRoIGJhciBmaWxsXHJcbiAgICBkcmF3Um91bmRlZFJlY3QoaGVhbHRoQmFyWCwgaGVhbHRoQmFyWSwgY3VycmVudEhlYWx0aFdpZHRoLCBoZWFsdGhCYXJIZWlnaHQsIGhlYWx0aEJhclJhZGl1cywgaGVhbHRoQmFyQ29uZmlnLmZpbGxDb2xvcik7XHJcbiAgICAvLyBEcmF3IGhlYWx0aCBiYXIgYm9yZGVyXHJcbiAgICBkcmF3Um91bmRlZFJlY3QoaGVhbHRoQmFyWCwgaGVhbHRoQmFyWSwgaGVhbHRoQmFyV2lkdGgsIGhlYWx0aEJhckhlaWdodCwgaGVhbHRoQmFyUmFkaXVzLCBudWxsLCBoZWFsdGhCYXJDb25maWcuYm9yZGVyQ29sb3IsIDIpO1xyXG5cclxuICAgIC8vIEhlYWx0aCBiYXIgdGV4dFxyXG4gICAgY3R4LmZvbnQgPSBnYW1lRGF0YS51aS5iYXJMYWJlbEZvbnQ7XHJcbiAgICBjdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICBjdHguc2F2ZSgpO1xyXG4gICAgY3R4LnNoYWRvd0NvbG9yID0gaGVhbHRoQmFyQ29uZmlnLmxhYmVsU2hhZG93Q29sb3I7XHJcbiAgICBjdHguc2hhZG93Qmx1ciA9IDM7XHJcbiAgICBjdHguc2hhZG93T2Zmc2V0WCA9IDE7XHJcbiAgICBjdHguc2hhZG93T2Zmc2V0WSA9IDE7XHJcbiAgICBjdHguZmlsbFN0eWxlID0gaGVhbHRoQmFyQ29uZmlnLmxhYmVsQ29sb3I7XHJcbiAgICBjdHguZmlsbFRleHQoYEhQOiAke01hdGguY2VpbChwbGF5ZXIuaGVhbHRoKX0vJHtwbGF5ZXIubWF4SGVhbHRofWAsIGhlYWx0aEJhclggKyBoZWFsdGhCYXJXaWR0aCAvIDIsIGhlYWx0aEJhclkgKyBoZWFsdGhCYXJIZWlnaHQgKyBoZWFsdGhCYXJDb25maWcubGFiZWxZT2Zmc2V0KTtcclxuICAgIGN0eC5yZXN0b3JlKCk7XHJcblxyXG5cclxuICAgIC8vIEV4cGVyaWVuY2UgQmFyXHJcbiAgICBjb25zdCBleHBCYXJDb25maWcgPSBnYW1lRGF0YS51aS5leHBCYXI7XHJcbiAgICBjb25zdCBleHBCYXJYID0gMTA7XHJcbiAgICBjb25zdCBleHBCYXJZID0gaGVhbHRoQmFyWSArIGhlYWx0aEJhckhlaWdodCArIDMwO1xyXG4gICAgY29uc3QgZXhwQmFyV2lkdGggPSBleHBCYXJDb25maWcud2lkdGg7XHJcbiAgICBjb25zdCBleHBCYXJIZWlnaHQgPSBleHBCYXJDb25maWcuaGVpZ2h0O1xyXG4gICAgY29uc3QgZXhwQmFyUmFkaXVzID0gZXhwQmFyQ29uZmlnLmNvcm5lclJhZGl1cztcclxuICAgIGNvbnN0IGN1cnJlbnRFeHBXaWR0aCA9IChwbGF5ZXIuZXhwZXJpZW5jZSAvIHBsYXllci5uZXh0TGV2ZWxFeHApICogZXhwQmFyV2lkdGg7XHJcblxyXG4gICAgLy8gRHJhdyBleHAgYmFyIGJhY2tncm91bmRcclxuICAgIGRyYXdSb3VuZGVkUmVjdChleHBCYXJYLCBleHBCYXJZLCBleHBCYXJXaWR0aCwgZXhwQmFySGVpZ2h0LCBleHBCYXJSYWRpdXMsIGV4cEJhckNvbmZpZy5iYWNrZ3JvdW5kQ29sb3IpO1xyXG4gICAgLy8gRHJhdyBleHAgYmFyIGZpbGxcclxuICAgIGRyYXdSb3VuZGVkUmVjdChleHBCYXJYLCBleHBCYXJZLCBjdXJyZW50RXhwV2lkdGgsIGV4cEJhckhlaWdodCwgZXhwQmFyUmFkaXVzLCBleHBCYXJDb25maWcuZmlsbENvbG9yKTtcclxuICAgIC8vIERyYXcgZXhwIGJhciBib3JkZXJcclxuICAgIGRyYXdSb3VuZGVkUmVjdChleHBCYXJYLCBleHBCYXJZLCBleHBCYXJXaWR0aCwgZXhwQmFySGVpZ2h0LCBleHBCYXJSYWRpdXMsIG51bGwsIGV4cEJhckNvbmZpZy5ib3JkZXJDb2xvciwgMik7XHJcblxyXG4gICAgLy8gRXhwZXJpZW5jZSBiYXIgdGV4dFxyXG4gICAgY3R4LmZvbnQgPSBnYW1lRGF0YS51aS5iYXJMYWJlbEZvbnQ7XHJcbiAgICBjdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICBjdHguc2F2ZSgpO1xyXG4gICAgY3R4LnNoYWRvd0NvbG9yID0gZXhwQmFyQ29uZmlnLmxhYmVsU2hhZG93Q29sb3I7XHJcbiAgICBjdHguc2hhZG93Qmx1ciA9IDM7XHJcbiAgICBjdHguc2hhZG93T2Zmc2V0WCA9IDE7XHJcbiAgICBjdHguc2hhZG93T2Zmc2V0WSA9IDE7XHJcbiAgICBjdHguZmlsbFN0eWxlID0gZXhwQmFyQ29uZmlnLmxhYmVsQ29sb3I7XHJcbiAgICBjdHguZmlsbFRleHQoYExWICR7cGxheWVyLmxldmVsfSB8IEVYUDogJHtNYXRoLmNlaWwocGxheWVyLmV4cGVyaWVuY2UpfS8ke3BsYXllci5uZXh0TGV2ZWxFeHB9YCwgZXhwQmFyWCArIGV4cEJhcldpZHRoIC8gMiwgZXhwQmFyWSArIGV4cEJhckhlaWdodCArIGV4cEJhckNvbmZpZy5sYWJlbFlPZmZzZXQpO1xyXG4gICAgY3R4LnJlc3RvcmUoKTtcclxuXHJcbiAgICAvLyBHYW1lIFRpbWVyXHJcbiAgICBjdHguZm9udCA9IGAxOHB4ICR7Z2FtZURhdGEudWkuZm9udH1gOyAvLyBSZXZlcnQgdG8gYmFzZSBmb250IGZvciBvdGhlciBVSVxyXG4gICAgY3R4LmZpbGxTdHlsZSA9IGdhbWVEYXRhLnVpLnRleHRDb2xvcjtcclxuICAgIGN0eC50ZXh0QWxpZ24gPSAncmlnaHQnO1xyXG4gICAgY3R4LmZpbGxUZXh0KGBUaW1lOiAke01hdGguZmxvb3IoZ2FtZVRpbWVyIC8gNjApLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKX06JHtNYXRoLmZsb29yKGdhbWVUaW1lciAlIDYwKS50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyl9YCwgY2FudmFzLndpZHRoIC0gMTAsIDMwKTtcclxuXHJcbiAgICAvLyBEaXNwbGF5IGN1cnJlbnQgZW5lbXkgY291bnQgYW5kIHNwYXduIGludGVydmFsIGZvciBkZWJ1Z2dpbmcvaW5mb1xyXG4gICAgY3R4LnRleHRBbGlnbiA9ICdyaWdodCc7XHJcbiAgICBjdHguZmlsbFRleHQoYEVuZW1pZXM6ICR7ZW5lbWllcy5sZW5ndGh9IC8gJHtNYXRoLmZsb29yKGN1cnJlbnRFZmZlY3RpdmVNYXhFbmVtaWVzKX1gLCBjYW52YXMud2lkdGggLSAxMCwgNjApO1xyXG4gICAgY3R4LmZpbGxUZXh0KGBTcGF3biBJbnRlcnZhbDogJHtjdXJyZW50RWZmZWN0aXZlRW5lbXlTcGF3bkludGVydmFsLnRvRml4ZWQoMil9c2AsIGNhbnZhcy53aWR0aCAtIDEwLCA5MCk7XHJcblxyXG4gICAgLy8gTkVXOiBEcmF3IGFjdGl2ZSBpdGVtIGVmZmVjdHMgVUlcclxuICAgIGxldCB1aUVmZmVjdFggPSBjYW52YXMud2lkdGggLSAxMDsgLy8gUmlnaHQgc2lkZSBvZiB0aGUgY2FudmFzXHJcbiAgICBjb25zdCB1aUVmZmVjdFkgPSBleHBCYXJZICsgZXhwQmFySGVpZ2h0ICsgMzA7IC8vIEJlbG93IEVYUCBiYXJcclxuICAgIGNvbnN0IHVpRWZmZWN0SWNvblNpemUgPSAzMDtcclxuICAgIGNvbnN0IHVpRWZmZWN0VGV4dE9mZnNldCA9IHVpRWZmZWN0SWNvblNpemUgLyAyICsgNTsgLy8gVGV4dCBiZWxvdyBpY29uXHJcblxyXG4gICAgaWYgKHBsYXllci5tYWduZXRFZmZlY3RUaW1lciA+IDApIHtcclxuICAgICAgICAvLyBEcmF3IE1hZ25ldCBpY29uIChmaXhlZCBvbiBjYW52YXMsIG5vIHNoYWRvdylcclxuICAgICAgICBkcmF3U3ByaXRlKCdpdGVtX21hZ25ldCcsIHVpRWZmZWN0WCAtIHVpRWZmZWN0SWNvblNpemUvMiwgdWlFZmZlY3RZICsgdWlFZmZlY3RJY29uU2l6ZS8yLCB1aUVmZmVjdEljb25TaXplLCB1aUVmZmVjdEljb25TaXplLCBmYWxzZSwgZmFsc2UpO1xyXG4gICAgICAgIGN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICBjdHguZmlsbFN0eWxlID0gZ2FtZURhdGEudWkudGV4dENvbG9yO1xyXG4gICAgICAgIGN0eC5mb250ID0gYDE0cHggJHtnYW1lRGF0YS51aS5mb250fWA7XHJcbiAgICAgICAgY3R4LmZpbGxUZXh0KGAke01hdGguY2VpbChwbGF5ZXIubWFnbmV0RWZmZWN0VGltZXIpfXNgLCB1aUVmZmVjdFggLSB1aUVmZmVjdEljb25TaXplLzIsIHVpRWZmZWN0WSArIHVpRWZmZWN0SWNvblNpemUgKyB1aUVmZmVjdFRleHRPZmZzZXQpO1xyXG4gICAgICAgIHVpRWZmZWN0WCAtPSAodWlFZmZlY3RJY29uU2l6ZSArIDIwKTsgLy8gTW92ZSBsZWZ0IGZvciBuZXh0IGljb25cclxuICAgIH1cclxuXHJcbiAgICBpZiAocGxheWVyLnNwZWNpYWxBdHRhY2tFZmZlY3RUaW1lciA+IDApIHtcclxuICAgICAgICAvLyBEcmF3IFNwZWNpYWwgQXR0YWNrIGljb24gKGZpeGVkIG9uIGNhbnZhcywgbm8gc2hhZG93KVxyXG4gICAgICAgIGRyYXdTcHJpdGUoJ2l0ZW1fc3BlY2lhbF9hdHRhY2snLCB1aUVmZmVjdFggLSB1aUVmZmVjdEljb25TaXplLzIsIHVpRWZmZWN0WSArIHVpRWZmZWN0SWNvblNpemUvMiwgdWlFZmZlY3RJY29uU2l6ZSwgdWlFZmZlY3RJY29uU2l6ZSwgZmFsc2UsIGZhbHNlKTtcclxuICAgICAgICBjdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IGdhbWVEYXRhLnVpLnRleHRDb2xvcjtcclxuICAgICAgICBjdHguZm9udCA9IGAxNHB4ICR7Z2FtZURhdGEudWkuZm9udH1gO1xyXG4gICAgICAgIGN0eC5maWxsVGV4dChgJHtNYXRoLmNlaWwocGxheWVyLnNwZWNpYWxBdHRhY2tFZmZlY3RUaW1lcil9c2AsIHVpRWZmZWN0WCAtIHVpRWZmZWN0SWNvblNpemUvMiwgdWlFZmZlY3RZICsgdWlFZmZlY3RJY29uU2l6ZSArIHVpRWZmZWN0VGV4dE9mZnNldCk7XHJcbiAgICAgICAgdWlFZmZlY3RYIC09ICh1aUVmZmVjdEljb25TaXplICsgMjApOyAvLyBNb3ZlIGxlZnQgZm9yIG5leHQgaWNvblxyXG4gICAgfVxyXG4gICAgLy8gTm8gc3BlY2lmaWMgVUkgZm9yIGhlYWx0aCBwb3Rpb24gYXMgaXQncyBhbiBpbnN0YW50IGVmZmVjdFxyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3TGV2ZWxVcFNjcmVlbigpOiB2b2lkIHtcclxuICAgIGN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjcpJzsgLy8gU2VtaS10cmFuc3BhcmVudCBvdmVybGF5XHJcbiAgICBjdHguZmlsbFJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICBjdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICBjdHguZmlsbFN0eWxlID0gZ2FtZURhdGEudWkudGV4dENvbG9yO1xyXG4gICAgY3R4LmZvbnQgPSBgYm9sZCAzNnB4ICR7Z2FtZURhdGEudWkuZm9udH1gO1xyXG4gICAgY3R4LmZpbGxUZXh0KGAke2dhbWVEYXRhLnVpLmxldmVsVXBUZXh0fSBDaG9vc2UgYW4gdXBncmFkZSAoTGV2ZWwgJHtwbGF5ZXIubGV2ZWx9KWAsIGNhbnZhcy53aWR0aCAvIDIsIGNhbnZhcy5oZWlnaHQgLyAyIC0gMTAwKTtcclxuXHJcbiAgICBjdHguZm9udCA9IGAyNHB4ICR7Z2FtZURhdGEudWkuZm9udH1gO1xyXG4gICAgaWYgKGdhbWVEYXRhLnVpLmxldmVsVXBPcHRpb25zLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAvLyBEaXNwbGF5IHRoZSBmaXJzdCBvcHRpb24gKGZvciBzaW1wbGljaXR5IGluIHRoaXMgYmFzaWMgdmVyc2lvbilcclxuICAgICAgICBjb25zdCBvcHRpb24gPSBnYW1lRGF0YS51aS5sZXZlbFVwT3B0aW9uc1swXTtcclxuICAgICAgICAvLyBVcGRhdGVkIHRleHQgdG8gcmVmbGVjdCBTcGFjZWJhclxyXG4gICAgICAgIGN0eC5maWxsVGV4dChgW1NwYWNlYmFyXSAke29wdGlvbi5uYW1lfTogJHtvcHRpb24uZGVzY3JpcHRpb259YCwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjdHguZmlsbFRleHQoJ05vIHVwZ3JhZGVzIGF2YWlsYWJsZS4nLCBjYW52YXMud2lkdGggLyAyLCBjYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdHYW1lT3ZlclNjcmVlbigpOiB2b2lkIHtcclxuICAgIGN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjcpJzsgLy8gU2VtaS10cmFuc3BhcmVudCBvdmVybGF5XHJcbiAgICBjdHguZmlsbFJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICBjdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICBjdHguZmlsbFN0eWxlID0gZ2FtZURhdGEudWkudGV4dENvbG9yO1xyXG4gICAgY3R4LmZvbnQgPSBgYm9sZCA0OHB4ICR7Z2FtZURhdGEudWkuZm9udH1gO1xyXG4gICAgY3R4LmZpbGxUZXh0KGdhbWVEYXRhLnVpLmdhbWVPdmVyVGV4dCwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcblxyXG4gICAgLy8gTU9ESUZJRUQ6IERpc3BsYXkgZmluYWxTdXJ2aXZhbFRpbWUgaW5zdGVhZCBvZiBnYW1lVGltZXJcclxuICAgIGN0eC5mb250ID0gYDI0cHggJHtnYW1lRGF0YS51aS5mb250fWA7XHJcbiAgICBjdHguZmlsbFRleHQoYFlvdSBzdXJ2aXZlZCBmb3I6ICR7TWF0aC5mbG9vcihmaW5hbFN1cnZpdmFsVGltZSAvIDYwKS50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyl9OiR7TWF0aC5mbG9vcihmaW5hbFN1cnZpdmFsVGltZSAlIDYwKS50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyl9YCwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIgKyAyMCk7XHJcbiAgICBjdHguZmlsbFRleHQoJ1ByZXNzIFNwYWNlYmFyIHRvIHJlc3RhcnQuJywgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIgKyA2MCk7XHJcbn1cclxuXHJcbi8vIFN0YXJ0IHRoZSBnYW1lIGJ5IGxvYWRpbmcgZGF0YVxyXG5sb2FkR2FtZURhdGEoKTsiXSwKICAibWFwcGluZ3MiOiAiQUE2TUEsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsV0FBQSxXQUFRO0FBQ1IsRUFBQUEsV0FBQSxhQUFVO0FBQ1YsRUFBQUEsV0FBQSxjQUFXO0FBQ1gsRUFBQUEsV0FBQSxlQUFZO0FBSlgsU0FBQUE7QUFBQSxHQUFBO0FBUUwsSUFBSTtBQUNKLElBQUk7QUFDSixJQUFJO0FBQ0osSUFBSSxTQUF1QixFQUFFLFFBQVEsb0JBQUksSUFBSSxHQUFHLFFBQVEsb0JBQUksSUFBSSxFQUFFO0FBRWxFLElBQUk7QUFDSixJQUFJLFVBQW1CLENBQUM7QUFDeEIsSUFBSSxjQUE0QixDQUFDO0FBQ2pDLElBQUksaUJBQWtDLENBQUM7QUFDdkMsSUFBSSxRQUFnQixDQUFDO0FBRXJCLElBQUksWUFBdUI7QUFDM0IsSUFBSSxpQkFBaUI7QUFDckIsSUFBSSxZQUFZO0FBRWhCLElBQUksY0FBMEMsQ0FBQztBQUUvQyxJQUFJLHFCQUFxQjtBQUV6QixJQUFJLGlCQUFpQjtBQUNyQixJQUFJLFlB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
