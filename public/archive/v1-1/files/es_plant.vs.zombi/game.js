var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["PLAYING"] = 1] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 2] = "GAME_OVER";
  return GameState2;
})(GameState || {});
var PlantType = /* @__PURE__ */ ((PlantType2) => {
  PlantType2["SUN_PRODUCER"] = "SUN_PRODUCER";
  PlantType2["PEA_SHOOTER"] = "PEA_SHOOTER";
  return PlantType2;
})(PlantType || {});
var ZombieType = /* @__PURE__ */ ((ZombieType2) => {
  ZombieType2["BASIC_ZOMBIE"] = "BASIC_ZOMBIE";
  return ZombieType2;
})(ZombieType || {});
var ProjectileType = /* @__PURE__ */ ((ProjectileType2) => {
  ProjectileType2["PEA"] = "PEA";
  return ProjectileType2;
})(ProjectileType || {});
class AssetManager {
  constructor() {
    this.images = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.totalAssets = 0;
    this.loadedAssets = 0;
    this.onProgressCallback = null;
    this.onCompleteCallback = null;
  }
  setCallbacks(onProgress, onComplete) {
    this.onProgressCallback = onProgress;
    this.onCompleteCallback = onComplete;
  }
  async loadAssets(assetConfig) {
    this.totalAssets = assetConfig.images.length + assetConfig.sounds.length;
    this.loadedAssets = 0;
    const imagePromises = assetConfig.images.map((img) => this.loadImage(img));
    const soundPromises = assetConfig.sounds.map((snd) => this.loadSound(snd));
    await Promise.all([...imagePromises, ...soundPromises]);
    if (this.onCompleteCallback) {
      this.onCompleteCallback();
    }
  }
  updateProgress() {
    this.loadedAssets++;
    if (this.onProgressCallback) {
      this.onProgressCallback(this.loadedAssets / this.totalAssets);
    }
  }
  loadImage(imgConfig) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = imgConfig.path;
      img.onload = () => {
        this.images.set(imgConfig.name, img);
        this.updateProgress();
        resolve();
      };
      img.onerror = () => {
        console.error(`Failed to load image: ${imgConfig.path}`);
        this.updateProgress();
        resolve();
      };
    });
  }
  loadSound(soundConfig) {
    return new Promise((resolve, reject) => {
      const audio = new Audio(soundConfig.path);
      audio.volume = soundConfig.volume;
      audio.load();
      audio.oncanplaythrough = () => {
        this.sounds.set(soundConfig.name, audio);
        this.updateProgress();
        resolve();
      };
      audio.onerror = () => {
        console.error(`Failed to load sound: ${soundConfig.path}`);
        this.updateProgress();
        resolve();
      };
      if (audio.readyState >= 3) {
        this.sounds.set(soundConfig.name, audio);
        this.updateProgress();
        resolve();
      }
    });
  }
  getImage(name) {
    return this.images.get(name);
  }
  playSound(name, loop = false) {
    const audio = this.sounds.get(name);
    if (audio) {
      const clonedAudio = audio.cloneNode();
      clonedAudio.loop = loop;
      clonedAudio.play().catch((e) => console.warn(`Audio playback failed for ${name}:`, e));
      return clonedAudio;
    }
    return void 0;
  }
  stopSound(audio) {
    audio.pause();
    audio.currentTime = 0;
  }
}
class Game {
  constructor(canvasId) {
    this.lastTime = 0;
    this.gameState = 0 /* TITLE */;
    this.sunCount = 0;
    this.plants = [];
    this.zombies = [];
    this.projectiles = [];
    this.suns = [];
    this.selectedPlantType = null;
    this.hoveredGridCell = null;
    this.nextZombieSpawnTime = 0;
    this.zombieSpawnInterval = 5e3;
    this.lastSunDropTime = 0;
    this.nextSunDropInterval = 0;
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas element with ID '${canvasId}' not found.`);
    }
    this.ctx = this.canvas.getContext("2d");
    this.assetManager = new AssetManager();
    this.canvas.addEventListener("mousemove", this.handleMouseMove.bind(this));
    this.canvas.addEventListener("click", this.handleClick.bind(this));
  }
  async init() {
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "white";
    this.ctx.font = "24px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText("Loading Game Data...", this.canvas.width / 2, this.canvas.height / 2);
    try {
      const response = await fetch("data.json");
      this.gameData = await response.json();
      this.canvas.width = this.gameData.canvasWidth;
      this.canvas.height = this.gameData.canvasHeight;
      this.assetManager.setCallbacks(
        (progress) => {
          this.ctx.fillStyle = "black";
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
          this.ctx.fillStyle = "white";
          this.ctx.fillText(`Loading Assets: ${Math.round(progress * 100)}%`, this.canvas.width / 2, this.canvas.height / 2);
        },
        () => {
          this.startGameLoop();
        }
      );
      await this.assetManager.loadAssets(this.gameData.assets);
      this.resetGame();
    } catch (error) {
      console.error("Failed to load game data or assets:", error);
      this.ctx.fillStyle = "red";
      this.ctx.fillText("Error loading game. Check console.", this.canvas.width / 2, this.canvas.height / 2);
    }
  }
  startGameLoop() {
    this.lastTime = performance.now();
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  gameLoop(currentTime) {
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    this.update(deltaTime);
    this.render();
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  update(deltaTime) {
    switch (this.gameState) {
      case 0 /* TITLE */:
        break;
      case 1 /* PLAYING */:
        this.updatePlaying(deltaTime);
        break;
      case 2 /* GAME_OVER */:
        break;
    }
  }
  updatePlaying(deltaTime) {
    if (this.lastTime >= this.nextZombieSpawnTime) {
      this.spawnZombie("BASIC_ZOMBIE" /* BASIC_ZOMBIE */, Math.floor(Math.random() * this.gameData.grid.rows));
      this.nextZombieSpawnTime = this.lastTime + this.zombieSpawnInterval;
    }
    if (this.lastTime >= this.lastSunDropTime + this.nextSunDropInterval) {
      this.dropSunFromSky();
      this.lastSunDropTime = this.lastTime;
      this.nextSunDropInterval = Math.random() * (this.gameData.sunDropInterval.max - this.gameData.sunDropInterval.min) + this.gameData.sunDropInterval.min;
    }
    this.plants.forEach((plant) => {
      if (plant.type === "PEA_SHOOTER" /* PEA_SHOOTER */) {
        const plantConfig = this.gameData.plantStats[plant.type];
        if (plantConfig.attackSpeed && this.lastTime - plant.lastActionTime >= plantConfig.attackSpeed) {
          const targetZombie = this.zombies.find((z) => z.row === plant.gridY && z.x > plant.x);
          if (targetZombie) {
            this.spawnProjectile("PEA" /* PEA */, plant.x + plant.width / 2, plant.y + plant.height / 2);
            plant.lastActionTime = this.lastTime;
            this.assetManager.playSound("shoot_sfx");
          }
        }
      } else if (plant.type === "SUN_PRODUCER" /* SUN_PRODUCER */) {
        const plantConfig = this.gameData.plantStats[plant.type];
        if (plantConfig.productionRate && this.lastTime - plant.lastActionTime >= plantConfig.productionRate) {
          this.spawnSun(plant.x + plant.width / 2, plant.y + plant.height / 2, this.gameData.sunValue);
          plant.lastActionTime = this.lastTime;
        }
      }
    });
    this.projectiles = this.projectiles.filter((projectile) => {
      projectile.x += projectile.speed * (deltaTime / 1e3);
      for (let i = 0; i < this.zombies.length; i++) {
        const zombie = this.zombies[i];
        if (this.checkCollision(projectile, zombie)) {
          zombie.takeDamage(projectile.damage);
          if (!zombie.isAlive()) {
            this.zombies.splice(i, 1);
            i--;
            this.assetManager.playSound("zombie_die_sfx");
          } else {
            this.assetManager.playSound("zombie_hit_sfx");
          }
          return false;
        }
      }
      return projectile.x < this.canvas.width;
    });
    this.zombies = this.zombies.filter((zombie) => {
      const plantsInRow = this.plants.filter((p) => p.gridY === zombie.row && p.x < zombie.x);
      let targetPlant = null;
      if (plantsInRow.length > 0) {
        targetPlant = plantsInRow.reduce((prev, curr) => curr.x > prev.x ? curr : prev);
      }
      if (targetPlant && this.checkCollision(zombie, targetPlant)) {
        if (this.lastTime - zombie.lastAttackTime >= zombie.attackSpeed) {
          targetPlant.takeDamage(zombie.attackDamage);
          zombie.lastAttackTime = this.lastTime;
          this.assetManager.playSound("zombie_attack_sfx");
        }
        if (!targetPlant.isAlive()) {
          this.plants = this.plants.filter((p) => p.id !== targetPlant.id);
          targetPlant = null;
        }
      } else {
        zombie.x -= zombie.speed * (deltaTime / 1e3);
      }
      if (zombie.x + zombie.width < 0) {
        this.gameState = 2 /* GAME_OVER */;
        this.assetManager.playSound("game_over_sfx");
        if (this.backgroundMusic) {
          this.assetManager.stopSound(this.backgroundMusic);
        }
        this.backgroundMusic = this.assetManager.playSound("bgm_game_over", true);
        return false;
      }
      return true;
    });
    this.suns = this.suns.filter((sun) => {
      return this.lastTime - sun.spawnTime < sun.despawnDuration;
    });
  }
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    switch (this.gameState) {
      case 0 /* TITLE */:
        this.renderTitle();
        break;
      case 1 /* PLAYING */:
        this.renderPlaying();
        break;
      case 2 /* GAME_OVER */:
        this.renderGameOver();
        break;
    }
  }
  renderTitle() {
    const bgImage = this.assetManager.getImage("title_background");
    if (bgImage) {
      this.ctx.drawImage(bgImage, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = this.gameData.colors.background;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.ctx.fillStyle = this.gameData.colors.textColor;
    this.ctx.font = "bold 60px 'Press Start 2P', cursive";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.gameData.texts.title, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = "24px 'Press Start 2P', cursive";
    this.ctx.fillText(this.gameData.texts.clickToStart, this.canvas.width / 2, this.canvas.height / 2 + 50);
  }
  renderPlaying() {
    const cellSize = this.gameData.grid.cellSize;
    const rows = this.gameData.grid.rows;
    const cols = this.gameData.grid.cols;
    const bgImage = this.assetManager.getImage("background");
    if (bgImage) {
      this.ctx.drawImage(bgImage, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = this.gameData.colors.background;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.ctx.strokeStyle = this.gameData.colors.gridLine;
    this.ctx.lineWidth = 1;
    for (let r = 0; r <= rows; r++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, r * cellSize);
      this.ctx.lineTo(cols * cellSize, r * cellSize);
      this.ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      this.ctx.beginPath();
      this.ctx.moveTo(c * cellSize, 0);
      this.ctx.lineTo(c * cellSize, rows * cellSize);
      this.ctx.stroke();
    }
    if (this.hoveredGridCell && this.selectedPlantType) {
      this.ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      this.ctx.fillRect(this.hoveredGridCell.x * cellSize, this.hoveredGridCell.y * cellSize, cellSize, cellSize);
    }
    this.plants.forEach((plant) => plant.render(this.ctx, this.assetManager));
    this.zombies.forEach((zombie) => zombie.render(this.ctx, this.assetManager));
    this.projectiles.forEach((projectile) => projectile.render(this.ctx, this.assetManager));
    this.suns.forEach((sun) => sun.render(this.ctx, this.assetManager));
    this.renderUI();
  }
  renderGameOver() {
    const bgImage = this.assetManager.getImage("game_over_background");
    if (bgImage) {
      this.ctx.drawImage(bgImage, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.ctx.fillStyle = this.gameData.colors.textColor;
    this.ctx.font = "bold 60px 'Press Start 2P', cursive";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.gameData.texts.gameOver, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = "24px 'Press Start 2P', cursive";
    this.ctx.fillText(this.gameData.texts.clickToRestart, this.canvas.width / 2, this.canvas.height / 2 + 50);
  }
  renderUI() {
    const uiHeight = 80;
    this.ctx.fillStyle = this.gameData.colors.uiBackground;
    this.ctx.fillRect(0, 0, this.canvas.width, uiHeight);
    this.ctx.fillStyle = this.gameData.colors.textColor;
    this.ctx.font = "30px Arial";
    this.ctx.textAlign = "left";
    this.ctx.fillText(`${this.gameData.texts.sunCounter}: ${this.sunCount}`, 20, uiHeight / 2 + 10);
    const buttonStartX = this.canvas.width / 2 - Object.keys(PlantType).length * (50 + 10) / 2;
    let currentButtonX = buttonStartX;
    const buttonSize = 50;
    const padding = 10;
    const buttonY = (uiHeight - buttonSize) / 2;
    Object.values(PlantType).forEach((type) => {
      const plantConfig = this.gameData.plantStats[type];
      const cost = this.gameData.plantCosts[type];
      this.ctx.fillStyle = this.selectedPlantType === type ? "yellow" : "lightgray";
      this.ctx.fillRect(currentButtonX, buttonY, buttonSize, buttonSize);
      this.ctx.strokeStyle = "black";
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(currentButtonX, buttonY, buttonSize, buttonSize);
      const plantImage = this.assetManager.getImage(plantConfig.asset);
      if (plantImage) {
        this.ctx.drawImage(plantImage, currentButtonX + 5, buttonY + 5, buttonSize - 10, buttonSize - 10);
      }
      this.ctx.fillStyle = "blue";
      this.ctx.font = "14px Arial";
      this.ctx.textAlign = "center";
      this.ctx.fillText(`${cost}`, currentButtonX + buttonSize / 2, buttonY + buttonSize + 15);
      currentButtonX += buttonSize + padding;
    });
  }
  handleClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    switch (this.gameState) {
      case 0 /* TITLE */:
        this.gameState = 1 /* PLAYING */;
        this.resetGame();
        if (this.backgroundMusic) {
          this.assetManager.stopSound(this.backgroundMusic);
        }
        this.backgroundMusic = this.assetManager.playSound("bgm_game", true);
        break;
      case 1 /* PLAYING */:
        const uiHeight = 80;
        if (mouseY < uiHeight) {
          const buttonStartX = this.canvas.width / 2 - Object.keys(PlantType).length * (50 + 10) / 2;
          let currentButtonX = buttonStartX;
          const buttonSize = 50;
          const padding = 10;
          const buttonY = (uiHeight - buttonSize) / 2;
          Object.values(PlantType).forEach((type) => {
            if (mouseX > currentButtonX && mouseX < currentButtonX + buttonSize && mouseY > buttonY && mouseY < buttonY + buttonSize) {
              this.selectedPlantType = this.selectedPlantType === type ? null : type;
              this.assetManager.playSound("ui_click_sfx");
            }
            currentButtonX += buttonSize + padding;
          });
        } else {
          const cellSize = this.gameData.grid.cellSize;
          const gridX = Math.floor(mouseX / cellSize);
          const gridY = Math.floor(mouseY / cellSize);
          let sunCollected = false;
          this.suns = this.suns.filter((sun) => {
            if (this.checkClick(mouseX, mouseY, sun)) {
              this.sunCount += sun.value;
              sunCollected = true;
              this.assetManager.playSound("sun_collect_sfx");
              return false;
            }
            return true;
          });
          if (sunCollected) return;
          if (this.selectedPlantType) {
            if (gridX >= 0 && gridX < this.gameData.grid.cols && gridY >= 0 && gridY < this.gameData.grid.rows) {
              const existingPlant = this.plants.find((p) => p.gridX === gridX && p.gridY === gridY);
              if (!existingPlant) {
                const cost = this.gameData.plantCosts[this.selectedPlantType];
                if (this.sunCount >= cost) {
                  this.placePlant(this.selectedPlantType, gridX, gridY);
                  this.sunCount -= cost;
                  this.selectedPlantType = null;
                  this.assetManager.playSound("plant_place_sfx");
                } else {
                  this.assetManager.playSound("error_sfx");
                }
              } else {
                this.assetManager.playSound("error_sfx");
              }
            }
          }
        }
        break;
      case 2 /* GAME_OVER */:
        this.gameState = 0 /* TITLE */;
        if (this.backgroundMusic) {
          this.assetManager.stopSound(this.backgroundMusic);
        }
        this.backgroundMusic = this.assetManager.playSound("bgm_title", true);
        break;
    }
  }
  handleMouseMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    if (this.gameState === 1 /* PLAYING */ && this.selectedPlantType) {
      const cellSize = this.gameData.grid.cellSize;
      const gridX = Math.floor(mouseX / cellSize);
      const gridY = Math.floor(mouseY / cellSize);
      this.hoveredGridCell = { x: gridX, y: gridY };
    } else {
      this.hoveredGridCell = null;
    }
  }
  resetGame() {
    this.sunCount = this.gameData.initialSun;
    this.plants = [];
    this.zombies = [];
    this.projectiles = [];
    this.suns = [];
    this.selectedPlantType = null;
    this.hoveredGridCell = null;
    this.nextZombieSpawnTime = this.lastTime + this.zombieSpawnInterval;
    this.lastSunDropTime = this.lastTime;
    this.nextSunDropInterval = Math.random() * (this.gameData.sunDropInterval.max - this.gameData.sunDropInterval.min) + this.gameData.sunDropInterval.min;
    if (this.backgroundMusic) {
      this.assetManager.stopSound(this.backgroundMusic);
    }
    if (this.gameState === 0 /* TITLE */) {
      this.backgroundMusic = this.assetManager.playSound("bgm_title", true);
    } else if (this.gameState === 1 /* PLAYING */) {
      this.backgroundMusic = this.assetManager.playSound("bgm_game", true);
    }
  }
  placePlant(type, gridX, gridY) {
    const plantConfig = this.gameData.plantStats[type];
    const cellSize = this.gameData.grid.cellSize;
    const plantWidth = cellSize * 0.8;
    const plantHeight = cellSize * 0.8;
    const offsetX = (cellSize - plantWidth) / 2;
    const offsetY = (cellSize - plantHeight) / 2;
    const newPlant = {
      id: `plant-${Date.now()}-${Math.random()}`,
      type,
      x: gridX * cellSize + offsetX,
      y: gridY * cellSize + offsetY,
      width: plantWidth,
      height: plantHeight,
      assetName: plantConfig.asset,
      health: plantConfig.health,
      maxHealth: plantConfig.health,
      gridX,
      gridY,
      lastActionTime: 0,
      takeDamage: function(amount) {
        this.health -= amount;
      },
      isAlive: function() {
        return this.health > 0;
      },
      render: function(ctx, assetManager) {
        const img = assetManager.getImage(this.assetName);
        if (img) {
          ctx.drawImage(img, this.x, this.y, this.width, this.height);
        } else {
          ctx.fillStyle = "green";
          ctx.fillRect(this.x, this.y, this.width, this.height);
        }
        if (this.health < this.maxHealth) {
          const barWidth = this.width;
          const barHeight = 5;
          ctx.fillStyle = "red";
          ctx.fillRect(this.x, this.y - barHeight - 2, barWidth, barHeight);
          ctx.fillStyle = "lime";
          ctx.fillRect(this.x, this.y - barHeight - 2, barWidth * (this.health / this.maxHealth), barHeight);
        }
      }
    };
    this.plants.push(newPlant);
  }
  spawnZombie(type, row) {
    const zombieConfig = this.gameData.zombieStats[type];
    const cellSize = this.gameData.grid.cellSize;
    const zombieWidth = cellSize * 0.9;
    const zombieHeight = cellSize * 0.9;
    const offsetY = (cellSize - zombieHeight) / 2;
    const newZombie = {
      id: `zombie-${Date.now()}-${Math.random()}`,
      type,
      x: this.canvas.width,
      y: row * cellSize + offsetY,
      width: zombieWidth,
      height: zombieHeight,
      assetName: zombieConfig.asset,
      health: zombieConfig.health,
      maxHealth: zombieConfig.health,
      speed: zombieConfig.speed,
      attackDamage: zombieConfig.attackDamage,
      attackSpeed: zombieConfig.attackSpeed,
      lastAttackTime: 0,
      targetPlant: null,
      row,
      takeDamage: function(amount) {
        this.health -= amount;
      },
      isAlive: function() {
        return this.health > 0;
      },
      render: function(ctx, assetManager) {
        const img = assetManager.getImage(this.assetName);
        if (img) {
          ctx.drawImage(img, this.x, this.y, this.width, this.height);
        } else {
          ctx.fillStyle = "purple";
          ctx.fillRect(this.x, this.y, this.width, this.height);
        }
        if (this.health < this.maxHealth) {
          const barWidth = this.width;
          const barHeight = 5;
          ctx.fillStyle = "red";
          ctx.fillRect(this.x, this.y - barHeight - 2, barWidth, barHeight);
          ctx.fillStyle = "lime";
          ctx.fillRect(this.x, this.y - barHeight - 2, barWidth * (this.health / this.maxHealth), barHeight);
        }
      }
    };
    this.zombies.push(newZombie);
  }
  spawnProjectile(type, x, y) {
    const projectileConfig = this.gameData.projectileStats[type];
    const projectileWidth = 20;
    const projectileHeight = 20;
    const newProjectile = {
      id: `projectile-${Date.now()}-${Math.random()}`,
      type,
      x,
      y,
      width: projectileWidth,
      height: projectileHeight,
      assetName: projectileConfig.asset,
      speed: projectileConfig.speed,
      damage: projectileConfig.damage,
      render: function(ctx, assetManager) {
        const img = assetManager.getImage(this.assetName);
        if (img) {
          ctx.drawImage(img, this.x, this.y, this.width, this.height);
        } else {
          ctx.fillStyle = "orange";
          ctx.fillRect(this.x, this.y, this.width, this.height);
        }
      }
    };
    this.projectiles.push(newProjectile);
  }
  spawnSun(x, y, value) {
    const sunWidth = 50;
    const sunHeight = 50;
    const newSun = {
      id: `sun-${Date.now()}-${Math.random()}`,
      x: x - sunWidth / 2,
      y: y - sunHeight / 2,
      width: sunWidth,
      height: sunHeight,
      assetName: "sun_icon",
      value,
      spawnTime: this.lastTime,
      despawnDuration: 1e4,
      render: function(ctx, assetManager) {
        const img = assetManager.getImage(this.assetName);
        if (img) {
          ctx.drawImage(img, this.x, this.y, this.width, this.height);
        } else {
          ctx.fillStyle = "yellow";
          ctx.fillRect(this.x, this.y, this.width, this.height);
        }
      }
    };
    this.suns.push(newSun);
  }
  dropSunFromSky() {
    const randomCol = Math.floor(Math.random() * this.gameData.grid.cols);
    const randomX = randomCol * this.gameData.grid.cellSize + this.gameData.grid.cellSize / 2;
    const randomY = Math.random() * (this.gameData.grid.rows * this.gameData.grid.cellSize * 0.5) + this.gameData.grid.cellSize * 0.1;
    this.spawnSun(randomX, randomY, this.gameData.sunValue);
  }
  checkCollision(obj1, obj2) {
    return obj1.x < obj2.x + obj2.width && obj1.x + obj1.width > obj2.x && obj1.y < obj2.y + obj2.height && obj1.y + obj1.height > obj2.y;
  }
  checkClick(clickX, clickY, obj) {
    return clickX > obj.x && clickX < obj.x + obj.width && clickY > obj.y && clickY < obj.y + obj.height;
  }
}
window.addEventListener("load", () => {
  const game = new Game("gameCanvas");
  game.init();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEFzc2V0Q29uZmlnIHtcclxuICAgIGltYWdlczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH1bXTtcclxuICAgIHNvdW5kczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyOyB2b2x1bWU6IG51bWJlcjsgfVtdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZURhdGEge1xyXG4gICAgY2FudmFzV2lkdGg6IG51bWJlcjtcclxuICAgIGNhbnZhc0hlaWdodDogbnVtYmVyO1xyXG4gICAgZ3JpZDoge1xyXG4gICAgICAgIHJvd3M6IG51bWJlcjtcclxuICAgICAgICBjb2xzOiBudW1iZXI7XHJcbiAgICAgICAgY2VsbFNpemU6IG51bWJlcjtcclxuICAgIH07XHJcbiAgICBpbml0aWFsU3VuOiBudW1iZXI7XHJcbiAgICBzdW5Ecm9wSW50ZXJ2YWw6IHsgbWluOiBudW1iZXI7IG1heDogbnVtYmVyOyB9O1xyXG4gICAgc3VuVmFsdWU6IG51bWJlcjtcclxuICAgIHBsYW50Q29zdHM6IHsgW2tleTogc3RyaW5nXTogbnVtYmVyOyB9O1xyXG4gICAgcGxhbnRTdGF0czoge1xyXG4gICAgICAgIFtrZXk6IHN0cmluZ106IHtcclxuICAgICAgICAgICAgaGVhbHRoOiBudW1iZXI7XHJcbiAgICAgICAgICAgIGF0dGFja0RhbWFnZT86IG51bWJlcjtcclxuICAgICAgICAgICAgYXR0YWNrU3BlZWQ/OiBudW1iZXI7XHJcbiAgICAgICAgICAgIHByb2R1Y3Rpb25SYXRlPzogbnVtYmVyO1xyXG4gICAgICAgICAgICBhc3NldDogc3RyaW5nO1xyXG4gICAgICAgICAgICBwcm9qZWN0aWxlQXNzZXQ/OiBzdHJpbmc7XHJcbiAgICAgICAgfTtcclxuICAgIH07XHJcbiAgICB6b21iaWVTdGF0czoge1xyXG4gICAgICAgIFtrZXk6IHN0cmluZ106IHtcclxuICAgICAgICAgICAgaGVhbHRoOiBudW1iZXI7XHJcbiAgICAgICAgICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgICAgIGF0dGFja0RhbWFnZTogbnVtYmVyO1xyXG4gICAgICAgICAgICBhdHRhY2tTcGVlZDogbnVtYmVyO1xyXG4gICAgICAgICAgICBhc3NldDogc3RyaW5nO1xyXG4gICAgICAgIH07XHJcbiAgICB9O1xyXG4gICAgcHJvamVjdGlsZVN0YXRzOiB7XHJcbiAgICAgICAgW2tleTogc3RyaW5nXToge1xyXG4gICAgICAgICAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgICAgICAgICBkYW1hZ2U6IG51bWJlcjtcclxuICAgICAgICAgICAgYXNzZXQ6IHN0cmluZztcclxuICAgICAgICB9O1xyXG4gICAgfTtcclxuICAgIGNvbG9yczoge1xyXG4gICAgICAgIGJhY2tncm91bmQ6IHN0cmluZztcclxuICAgICAgICBncmlkTGluZTogc3RyaW5nO1xyXG4gICAgICAgIHVpQmFja2dyb3VuZDogc3RyaW5nO1xyXG4gICAgICAgIHRleHRDb2xvcjogc3RyaW5nO1xyXG4gICAgfTtcclxuICAgIHRleHRzOiB7XHJcbiAgICAgICAgdGl0bGU6IHN0cmluZztcclxuICAgICAgICBjbGlja1RvU3RhcnQ6IHN0cmluZztcclxuICAgICAgICBnYW1lT3Zlcjogc3RyaW5nO1xyXG4gICAgICAgIGNsaWNrVG9SZXN0YXJ0OiBzdHJpbmc7XHJcbiAgICAgICAgc3VuQ291bnRlcjogc3RyaW5nO1xyXG4gICAgICAgIHBsYW50U2VsZWN0aW9uOiBzdHJpbmc7XHJcbiAgICB9O1xyXG4gICAgYXNzZXRzOiBBc3NldENvbmZpZztcclxufVxyXG5cclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgVElUTEUsXHJcbiAgICBQTEFZSU5HLFxyXG4gICAgR0FNRV9PVkVSLFxyXG59XHJcblxyXG5lbnVtIFBsYW50VHlwZSB7XHJcbiAgICBTVU5fUFJPRFVDRVIgPSBcIlNVTl9QUk9EVUNFUlwiLFxyXG4gICAgUEVBX1NIT09URVIgPSBcIlBFQV9TSE9PVEVSXCIsXHJcbn1cclxuXHJcbmVudW0gWm9tYmllVHlwZSB7XHJcbiAgICBCQVNJQ19aT01CSUUgPSBcIkJBU0lDX1pPTUJJRVwiLFxyXG59XHJcblxyXG5lbnVtIFByb2plY3RpbGVUeXBlIHtcclxuICAgIFBFQSA9IFwiUEVBXCIsXHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lT2JqZWN0IHtcclxuICAgIGlkOiBzdHJpbmc7XHJcbiAgICB4OiBudW1iZXI7XHJcbiAgICB5OiBudW1iZXI7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBhc3NldE5hbWU6IHN0cmluZztcclxuICAgIHJlbmRlcihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXIpOiB2b2lkO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTW9ydGFsIHtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgbWF4SGVhbHRoOiBudW1iZXI7XHJcbiAgICB0YWtlRGFtYWdlKGFtb3VudDogbnVtYmVyKTogdm9pZDtcclxuICAgIGlzQWxpdmUoKTogYm9vbGVhbjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFBsYW50IGV4dGVuZHMgR2FtZU9iamVjdCwgTW9ydGFsIHtcclxuICAgIHR5cGU6IFBsYW50VHlwZTtcclxuICAgIGdyaWRYOiBudW1iZXI7XHJcbiAgICBncmlkWTogbnVtYmVyO1xyXG4gICAgbGFzdEFjdGlvblRpbWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFpvbWJpZSBleHRlbmRzIEdhbWVPYmplY3QsIE1vcnRhbCB7XHJcbiAgICB0eXBlOiBab21iaWVUeXBlO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGF0dGFja0RhbWFnZTogbnVtYmVyO1xyXG4gICAgYXR0YWNrU3BlZWQ6IG51bWJlcjtcclxuICAgIGxhc3RBdHRhY2tUaW1lOiBudW1iZXI7XHJcbiAgICB0YXJnZXRQbGFudDogUGxhbnQgfCBudWxsO1xyXG4gICAgcm93OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBQcm9qZWN0aWxlIGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICB0eXBlOiBQcm9qZWN0aWxlVHlwZTtcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBkYW1hZ2U6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFN1biBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgdmFsdWU6IG51bWJlcjtcclxuICAgIHNwYXduVGltZTogbnVtYmVyO1xyXG4gICAgZGVzcGF3bkR1cmF0aW9uOiBudW1iZXI7XHJcbn1cclxuXHJcbmNsYXNzIEFzc2V0TWFuYWdlciB7XHJcbiAgICBwcml2YXRlIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIHRvdGFsQXNzZXRzID0gMDtcclxuICAgIHByaXZhdGUgbG9hZGVkQXNzZXRzID0gMDtcclxuICAgIHByaXZhdGUgb25Qcm9ncmVzc0NhbGxiYWNrOiAoKHByb2dyZXNzOiBudW1iZXIpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIG9uQ29tcGxldGVDYWxsYmFjazogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgcHVibGljIHNldENhbGxiYWNrcyhvblByb2dyZXNzOiAocHJvZ3Jlc3M6IG51bWJlcikgPT4gdm9pZCwgb25Db21wbGV0ZTogKCkgPT4gdm9pZCkge1xyXG4gICAgICAgIHRoaXMub25Qcm9ncmVzc0NhbGxiYWNrID0gb25Qcm9ncmVzcztcclxuICAgICAgICB0aGlzLm9uQ29tcGxldGVDYWxsYmFjayA9IG9uQ29tcGxldGU7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGFzeW5jIGxvYWRBc3NldHMoYXNzZXRDb25maWc6IEFzc2V0Q29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdGhpcy50b3RhbEFzc2V0cyA9IGFzc2V0Q29uZmlnLmltYWdlcy5sZW5ndGggKyBhc3NldENvbmZpZy5zb3VuZHMubGVuZ3RoO1xyXG4gICAgICAgIHRoaXMubG9hZGVkQXNzZXRzID0gMDtcclxuXHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IGFzc2V0Q29uZmlnLmltYWdlcy5tYXAoaW1nID0+IHRoaXMubG9hZEltYWdlKGltZykpO1xyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSBhc3NldENvbmZpZy5zb3VuZHMubWFwKHNuZCA9PiB0aGlzLmxvYWRTb3VuZChzbmQpKTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMub25Db21wbGV0ZUNhbGxiYWNrKSB7XHJcbiAgICAgICAgICAgIHRoaXMub25Db21wbGV0ZUNhbGxiYWNrKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlUHJvZ3Jlc3MoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMrKztcclxuICAgICAgICBpZiAodGhpcy5vblByb2dyZXNzQ2FsbGJhY2spIHtcclxuICAgICAgICAgICAgdGhpcy5vblByb2dyZXNzQ2FsbGJhY2sodGhpcy5sb2FkZWRBc3NldHMgLyB0aGlzLnRvdGFsQXNzZXRzKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkSW1hZ2UoaW1nQ29uZmlnOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgfSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBpbWcuc3JjID0gaW1nQ29uZmlnLnBhdGg7XHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmltYWdlcy5zZXQoaW1nQ29uZmlnLm5hbWUsIGltZyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVByb2dyZXNzKCk7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7aW1nQ29uZmlnLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVByb2dyZXNzKCk7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkU291bmQoc291bmRDb25maWc6IHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjsgdm9sdW1lOiBudW1iZXI7IH0pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbyhzb3VuZENvbmZpZy5wYXRoKTtcclxuICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gc291bmRDb25maWcudm9sdW1lO1xyXG4gICAgICAgICAgICBhdWRpby5sb2FkKCk7IC8vIFN0YXJ0IGxvYWRpbmdcclxuICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc291bmRzLnNldChzb3VuZENvbmZpZy5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVByb2dyZXNzKCk7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtzb3VuZENvbmZpZy5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVQcm9ncmVzcygpO1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAvLyBJbiBjYXNlIGl0J3MgYWxyZWFkeSBsb2FkZWQvY2FjaGVkXHJcbiAgICAgICAgICAgIGlmIChhdWRpby5yZWFkeVN0YXRlID49IDMpIHsgLy8gSEFWRV9GVVRVUkVfREFUQVxyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KHNvdW5kQ29uZmlnLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlUHJvZ3Jlc3MoKTtcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBnZXRJbWFnZShuYW1lOiBzdHJpbmcpOiBIVE1MSW1hZ2VFbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pbWFnZXMuZ2V0KG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBwbGF5U291bmQobmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gZmFsc2UpOiBIVE1MQXVkaW9FbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuc291bmRzLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgY29uc3QgY2xvbmVkQXVkaW8gPSBhdWRpby5jbG9uZU5vZGUoKSBhcyBIVE1MQXVkaW9FbGVtZW50O1xyXG4gICAgICAgICAgICBjbG9uZWRBdWRpby5sb29wID0gbG9vcDtcclxuICAgICAgICAgICAgY2xvbmVkQXVkaW8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBBdWRpbyBwbGF5YmFjayBmYWlsZWQgZm9yICR7bmFtZX06YCwgZSkpO1xyXG4gICAgICAgICAgICByZXR1cm4gY2xvbmVkQXVkaW87XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0b3BTb3VuZChhdWRpbzogSFRNTEF1ZGlvRWxlbWVudCk6IHZvaWQge1xyXG4gICAgICAgIGF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgYXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHByaXZhdGUgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBwcml2YXRlIGFzc2V0TWFuYWdlcjogQXNzZXRNYW5hZ2VyO1xyXG4gICAgcHJpdmF0ZSBnYW1lRGF0YSE6IEdhbWVEYXRhO1xyXG5cclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXAgPSAwO1xyXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuXHJcbiAgICBwcml2YXRlIHN1bkNvdW50OiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBwbGFudHM6IFBsYW50W10gPSBbXTtcclxuICAgIHByaXZhdGUgem9tYmllczogWm9tYmllW10gPSBbXTtcclxuICAgIHByaXZhdGUgcHJvamVjdGlsZXM6IFByb2plY3RpbGVbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBzdW5zOiBTdW5bXSA9IFtdO1xyXG5cclxuICAgIHByaXZhdGUgc2VsZWN0ZWRQbGFudFR5cGU6IFBsYW50VHlwZSB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBob3ZlcmVkR3JpZENlbGw6IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IH0gfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBwcml2YXRlIG5leHRab21iaWVTcGF3blRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIHpvbWJpZVNwYXduSW50ZXJ2YWw6IG51bWJlciA9IDUwMDA7XHJcbiAgICBwcml2YXRlIGxhc3RTdW5Ecm9wVGltZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgbmV4dFN1bkRyb3BJbnRlcnZhbDogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwcml2YXRlIGJhY2tncm91bmRNdXNpYzogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihjYW52YXNJZDogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNhbnZhcykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbnZhcyBlbGVtZW50IHdpdGggSUQgJyR7Y2FudmFzSWR9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpITtcclxuICAgICAgICB0aGlzLmFzc2V0TWFuYWdlciA9IG5ldyBBc3NldE1hbmFnZXIoKTtcclxuXHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5oYW5kbGVNb3VzZU1vdmUuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmhhbmRsZUNsaWNrLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBhc3luYyBpbml0KCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwiYmxhY2tcIjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IFwiMjRweCBBcmlhbFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9IFwiY2VudGVyXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoXCJMb2FkaW5nIEdhbWUgRGF0YS4uLlwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICAgICAgdGhpcy5nYW1lRGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKSBhcyBHYW1lRGF0YTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5nYW1lRGF0YS5jYW52YXNXaWR0aDtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5nYW1lRGF0YS5jYW52YXNIZWlnaHQ7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5zZXRDYWxsYmFja3MoXHJcbiAgICAgICAgICAgICAgICAocHJvZ3Jlc3MpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcImJsYWNrXCI7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBMb2FkaW5nIEFzc2V0czogJHtNYXRoLnJvdW5kKHByb2dyZXNzICogMTAwKX0lYCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGFydEdhbWVMb29wKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFzc2V0TWFuYWdlci5sb2FkQXNzZXRzKHRoaXMuZ2FtZURhdGEuYXNzZXRzKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucmVzZXRHYW1lKCk7XHJcblxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBnYW1lIGRhdGEgb3IgYXNzZXRzOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwicmVkXCI7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KFwiRXJyb3IgbG9hZGluZyBnYW1lLiBDaGVjayBjb25zb2xlLlwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0R2FtZUxvb3AoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5sYXN0VGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZUxvb3AoY3VycmVudFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXApOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSBjdXJyZW50VGltZSAtIHRoaXMubGFzdFRpbWU7XHJcbiAgICAgICAgdGhpcy5sYXN0VGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgIHRoaXMucmVuZGVyKCk7XHJcblxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVQbGF5aW5nKGRlbHRhVGltZSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlUGxheWluZyhkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmxhc3RUaW1lID49IHRoaXMubmV4dFpvbWJpZVNwYXduVGltZSkge1xyXG4gICAgICAgICAgICB0aGlzLnNwYXduWm9tYmllKFpvbWJpZVR5cGUuQkFTSUNfWk9NQklFLCBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0aGlzLmdhbWVEYXRhLmdyaWQucm93cykpO1xyXG4gICAgICAgICAgICB0aGlzLm5leHRab21iaWVTcGF3blRpbWUgPSB0aGlzLmxhc3RUaW1lICsgdGhpcy56b21iaWVTcGF3bkludGVydmFsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHRoaXMubGFzdFRpbWUgPj0gdGhpcy5sYXN0U3VuRHJvcFRpbWUgKyB0aGlzLm5leHRTdW5Ecm9wSW50ZXJ2YWwpIHtcclxuICAgICAgICAgICAgdGhpcy5kcm9wU3VuRnJvbVNreSgpO1xyXG4gICAgICAgICAgICB0aGlzLmxhc3RTdW5Ecm9wVGltZSA9IHRoaXMubGFzdFRpbWU7XHJcbiAgICAgICAgICAgIHRoaXMubmV4dFN1bkRyb3BJbnRlcnZhbCA9IE1hdGgucmFuZG9tKCkgKiAodGhpcy5nYW1lRGF0YS5zdW5Ecm9wSW50ZXJ2YWwubWF4IC0gdGhpcy5nYW1lRGF0YS5zdW5Ecm9wSW50ZXJ2YWwubWluKSArIHRoaXMuZ2FtZURhdGEuc3VuRHJvcEludGVydmFsLm1pbjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMucGxhbnRzLmZvckVhY2gocGxhbnQgPT4ge1xyXG4gICAgICAgICAgICBpZiAocGxhbnQudHlwZSA9PT0gUGxhbnRUeXBlLlBFQV9TSE9PVEVSKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwbGFudENvbmZpZyA9IHRoaXMuZ2FtZURhdGEucGxhbnRTdGF0c1twbGFudC50eXBlXTtcclxuICAgICAgICAgICAgICAgIGlmIChwbGFudENvbmZpZy5hdHRhY2tTcGVlZCAmJiB0aGlzLmxhc3RUaW1lIC0gcGxhbnQubGFzdEFjdGlvblRpbWUgPj0gcGxhbnRDb25maWcuYXR0YWNrU3BlZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRab21iaWUgPSB0aGlzLnpvbWJpZXMuZmluZCh6ID0+IHoucm93ID09PSBwbGFudC5ncmlkWSAmJiB6LnggPiBwbGFudC54KTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGFyZ2V0Wm9tYmllKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3Bhd25Qcm9qZWN0aWxlKFByb2plY3RpbGVUeXBlLlBFQSwgcGxhbnQueCArIHBsYW50LndpZHRoIC8gMiwgcGxhbnQueSArIHBsYW50LmhlaWdodCAvIDIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwbGFudC5sYXN0QWN0aW9uVGltZSA9IHRoaXMubGFzdFRpbWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZChcInNob290X3NmeFwiKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocGxhbnQudHlwZSA9PT0gUGxhbnRUeXBlLlNVTl9QUk9EVUNFUikge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGxhbnRDb25maWcgPSB0aGlzLmdhbWVEYXRhLnBsYW50U3RhdHNbcGxhbnQudHlwZV07XHJcbiAgICAgICAgICAgICAgICBpZiAocGxhbnRDb25maWcucHJvZHVjdGlvblJhdGUgJiYgdGhpcy5sYXN0VGltZSAtIHBsYW50Lmxhc3RBY3Rpb25UaW1lID49IHBsYW50Q29uZmlnLnByb2R1Y3Rpb25SYXRlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGF3blN1bihwbGFudC54ICsgcGxhbnQud2lkdGggLyAyLCBwbGFudC55ICsgcGxhbnQuaGVpZ2h0IC8gMiwgdGhpcy5nYW1lRGF0YS5zdW5WYWx1ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcGxhbnQubGFzdEFjdGlvblRpbWUgPSB0aGlzLmxhc3RUaW1lO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMucHJvamVjdGlsZXMgPSB0aGlzLnByb2plY3RpbGVzLmZpbHRlcihwcm9qZWN0aWxlID0+IHtcclxuICAgICAgICAgICAgcHJvamVjdGlsZS54ICs9IHByb2plY3RpbGUuc3BlZWQgKiAoZGVsdGFUaW1lIC8gMTAwMCk7XHJcblxyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuem9tYmllcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgem9tYmllID0gdGhpcy56b21iaWVzW2ldO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuY2hlY2tDb2xsaXNpb24ocHJvamVjdGlsZSwgem9tYmllKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHpvbWJpZS50YWtlRGFtYWdlKHByb2plY3RpbGUuZGFtYWdlKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXpvbWJpZS5pc0FsaXZlKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy56b21iaWVzLnNwbGljZShpLCAxKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaS0tO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoXCJ6b21iaWVfZGllX3NmeFwiKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoXCJ6b21iaWVfaGl0X3NmeFwiKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBwcm9qZWN0aWxlLnggPCB0aGlzLmNhbnZhcy53aWR0aDtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy56b21iaWVzID0gdGhpcy56b21iaWVzLmZpbHRlcih6b21iaWUgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBwbGFudHNJblJvdyA9IHRoaXMucGxhbnRzLmZpbHRlcihwID0+IHAuZ3JpZFkgPT09IHpvbWJpZS5yb3cgJiYgcC54IDwgem9tYmllLngpO1xyXG4gICAgICAgICAgICBsZXQgdGFyZ2V0UGxhbnQ6IFBsYW50IHwgbnVsbCA9IG51bGw7XHJcbiAgICAgICAgICAgIGlmIChwbGFudHNJblJvdy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICB0YXJnZXRQbGFudCA9IHBsYW50c0luUm93LnJlZHVjZSgocHJldiwgY3VycikgPT4gKGN1cnIueCA+IHByZXYueCA/IGN1cnIgOiBwcmV2KSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmICh0YXJnZXRQbGFudCAmJiB0aGlzLmNoZWNrQ29sbGlzaW9uKHpvbWJpZSwgdGFyZ2V0UGxhbnQpKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5sYXN0VGltZSAtIHpvbWJpZS5sYXN0QXR0YWNrVGltZSA+PSB6b21iaWUuYXR0YWNrU3BlZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICB0YXJnZXRQbGFudC50YWtlRGFtYWdlKHpvbWJpZS5hdHRhY2tEYW1hZ2UpO1xyXG4gICAgICAgICAgICAgICAgICAgIHpvbWJpZS5sYXN0QXR0YWNrVGltZSA9IHRoaXMubGFzdFRpbWU7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKFwiem9tYmllX2F0dGFja19zZnhcIik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAoIXRhcmdldFBsYW50LmlzQWxpdmUoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxhbnRzID0gdGhpcy5wbGFudHMuZmlsdGVyKHAgPT4gcC5pZCAhPT0gdGFyZ2V0UGxhbnQhLmlkKTtcclxuICAgICAgICAgICAgICAgICAgICB0YXJnZXRQbGFudCA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB6b21iaWUueCAtPSB6b21iaWUuc3BlZWQgKiAoZGVsdGFUaW1lIC8gMTAwMCk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmICh6b21iaWUueCArIHpvbWJpZS53aWR0aCA8IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZChcImdhbWVfb3Zlcl9zZnhcIik7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5iYWNrZ3JvdW5kTXVzaWMpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5zdG9wU291bmQodGhpcy5iYWNrZ3JvdW5kTXVzaWMpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdGhpcy5iYWNrZ3JvdW5kTXVzaWMgPSB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoXCJiZ21fZ2FtZV9vdmVyXCIsIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLnN1bnMgPSB0aGlzLnN1bnMuZmlsdGVyKHN1biA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmxhc3RUaW1lIC0gc3VuLnNwYXduVGltZSA8IHN1bi5kZXNwYXduRHVyYXRpb247XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW5kZXIoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJUaXRsZSgpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlclBsYXlpbmcoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlckdhbWVPdmVyKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW5kZXJUaXRsZSgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBiZ0ltYWdlID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoXCJ0aXRsZV9iYWNrZ3JvdW5kXCIpO1xyXG4gICAgICAgIGlmIChiZ0ltYWdlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShiZ0ltYWdlLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmdhbWVEYXRhLmNvbG9ycy5iYWNrZ3JvdW5kO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuZ2FtZURhdGEuY29sb3JzLnRleHRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gXCJib2xkIDYwcHggJ1ByZXNzIFN0YXJ0IDJQJywgY3Vyc2l2ZVwiO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9IFwiY2VudGVyXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5nYW1lRGF0YS50ZXh0cy50aXRsZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gXCIyNHB4ICdQcmVzcyBTdGFydCAyUCcsIGN1cnNpdmVcIjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmdhbWVEYXRhLnRleHRzLmNsaWNrVG9TdGFydCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNTApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVuZGVyUGxheWluZygpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBjZWxsU2l6ZSA9IHRoaXMuZ2FtZURhdGEuZ3JpZC5jZWxsU2l6ZTtcclxuICAgICAgICBjb25zdCByb3dzID0gdGhpcy5nYW1lRGF0YS5ncmlkLnJvd3M7XHJcbiAgICAgICAgY29uc3QgY29scyA9IHRoaXMuZ2FtZURhdGEuZ3JpZC5jb2xzO1xyXG5cclxuICAgICAgICBjb25zdCBiZ0ltYWdlID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoXCJiYWNrZ3JvdW5kXCIpO1xyXG4gICAgICAgIGlmIChiZ0ltYWdlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShiZ0ltYWdlLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmdhbWVEYXRhLmNvbG9ycy5iYWNrZ3JvdW5kO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gdGhpcy5nYW1lRGF0YS5jb2xvcnMuZ3JpZExpbmU7XHJcbiAgICAgICAgdGhpcy5jdHgubGluZVdpZHRoID0gMTtcclxuICAgICAgICBmb3IgKGxldCByID0gMDsgciA8PSByb3dzOyByKyspIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguYmVnaW5QYXRoKCk7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4Lm1vdmVUbygwLCByICogY2VsbFNpemUpO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5saW5lVG8oY29scyAqIGNlbGxTaXplLCByICogY2VsbFNpemUpO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5zdHJva2UoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPD0gY29sczsgYysrKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmJlZ2luUGF0aCgpO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5tb3ZlVG8oYyAqIGNlbGxTaXplLCAwKTtcclxuICAgICAgICAgICAgdGhpcy5jdHgubGluZVRvKGMgKiBjZWxsU2l6ZSwgcm93cyAqIGNlbGxTaXplKTtcclxuICAgICAgICAgICAgdGhpcy5jdHguc3Ryb2tlKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAodGhpcy5ob3ZlcmVkR3JpZENlbGwgJiYgdGhpcy5zZWxlY3RlZFBsYW50VHlwZSkge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgyNTUsIDI1NSwgMjU1LCAwLjMpJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QodGhpcy5ob3ZlcmVkR3JpZENlbGwueCAqIGNlbGxTaXplLCB0aGlzLmhvdmVyZWRHcmlkQ2VsbC55ICogY2VsbFNpemUsIGNlbGxTaXplLCBjZWxsU2l6ZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnBsYW50cy5mb3JFYWNoKHBsYW50ID0+IHBsYW50LnJlbmRlcih0aGlzLmN0eCwgdGhpcy5hc3NldE1hbmFnZXIpKTtcclxuICAgICAgICB0aGlzLnpvbWJpZXMuZm9yRWFjaCh6b21iaWUgPT4gem9tYmllLnJlbmRlcih0aGlzLmN0eCwgdGhpcy5hc3NldE1hbmFnZXIpKTtcclxuICAgICAgICB0aGlzLnByb2plY3RpbGVzLmZvckVhY2gocHJvamVjdGlsZSA9PiBwcm9qZWN0aWxlLnJlbmRlcih0aGlzLmN0eCwgdGhpcy5hc3NldE1hbmFnZXIpKTtcclxuICAgICAgICB0aGlzLnN1bnMuZm9yRWFjaChzdW4gPT4gc3VuLnJlbmRlcih0aGlzLmN0eCwgdGhpcy5hc3NldE1hbmFnZXIpKTtcclxuXHJcbiAgICAgICAgdGhpcy5yZW5kZXJVSSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVuZGVyR2FtZU92ZXIoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYmdJbWFnZSA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKFwiZ2FtZV9vdmVyX2JhY2tncm91bmRcIik7XHJcbiAgICAgICAgaWYgKGJnSW1hZ2UpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGJnSW1hZ2UsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwicmdiYSgwLCAwLCAwLCAwLjcpXCI7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5nYW1lRGF0YS5jb2xvcnMudGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBcImJvbGQgNjBweCAnUHJlc3MgU3RhcnQgMlAnLCBjdXJzaXZlXCI7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmdhbWVEYXRhLnRleHRzLmdhbWVPdmVyLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBcIjI0cHggJ1ByZXNzIFN0YXJ0IDJQJywgY3Vyc2l2ZVwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuZ2FtZURhdGEudGV4dHMuY2xpY2tUb1Jlc3RhcnQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDUwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlbmRlclVJKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHVpSGVpZ2h0ID0gODA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5nYW1lRGF0YS5jb2xvcnMudWlCYWNrZ3JvdW5kO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB1aUhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuZ2FtZURhdGEuY29sb3JzLnRleHRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gXCIzMHB4IEFyaWFsXCI7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJsZWZ0XCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGhpcy5nYW1lRGF0YS50ZXh0cy5zdW5Db3VudGVyfTogJHt0aGlzLnN1bkNvdW50fWAsIDIwLCB1aUhlaWdodCAvIDIgKyAxMCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJ1dHRvblN0YXJ0WCA9IHRoaXMuY2FudmFzLndpZHRoIC8gMiAtIChPYmplY3Qua2V5cyhQbGFudFR5cGUpLmxlbmd0aCAqICg1MCArIDEwKSkgLyAyO1xyXG4gICAgICAgIGxldCBjdXJyZW50QnV0dG9uWCA9IGJ1dHRvblN0YXJ0WDtcclxuICAgICAgICBjb25zdCBidXR0b25TaXplID0gNTA7XHJcbiAgICAgICAgY29uc3QgcGFkZGluZyA9IDEwO1xyXG4gICAgICAgIGNvbnN0IGJ1dHRvblkgPSAodWlIZWlnaHQgLSBidXR0b25TaXplKSAvIDI7XHJcblxyXG4gICAgICAgIE9iamVjdC52YWx1ZXMoUGxhbnRUeXBlKS5mb3JFYWNoKCh0eXBlKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBsYW50Q29uZmlnID0gdGhpcy5nYW1lRGF0YS5wbGFudFN0YXRzW3R5cGVdO1xyXG4gICAgICAgICAgICBjb25zdCBjb3N0ID0gdGhpcy5nYW1lRGF0YS5wbGFudENvc3RzW3R5cGVdO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5zZWxlY3RlZFBsYW50VHlwZSA9PT0gdHlwZSA/ICd5ZWxsb3cnIDogJ2xpZ2h0Z3JheSc7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGN1cnJlbnRCdXR0b25YLCBidXR0b25ZLCBidXR0b25TaXplLCBidXR0b25TaXplKTtcclxuICAgICAgICAgICAgdGhpcy5jdHguc3Ryb2tlU3R5bGUgPSAnYmxhY2snO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5saW5lV2lkdGggPSAyO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5zdHJva2VSZWN0KGN1cnJlbnRCdXR0b25YLCBidXR0b25ZLCBidXR0b25TaXplLCBidXR0b25TaXplKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHBsYW50SW1hZ2UgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZShwbGFudENvbmZpZy5hc3NldCk7XHJcbiAgICAgICAgICAgIGlmIChwbGFudEltYWdlKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UocGxhbnRJbWFnZSwgY3VycmVudEJ1dHRvblggKyA1LCBidXR0b25ZICsgNSwgYnV0dG9uU2l6ZSAtIDEwLCBidXR0b25TaXplIC0gMTApO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnYmx1ZSc7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSBcIjE0cHggQXJpYWxcIjtcclxuICAgICAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7Y29zdH1gLCBjdXJyZW50QnV0dG9uWCArIGJ1dHRvblNpemUgLyAyLCBidXR0b25ZICsgYnV0dG9uU2l6ZSArIDE1KTtcclxuXHJcbiAgICAgICAgICAgIGN1cnJlbnRCdXR0b25YICs9IGJ1dHRvblNpemUgKyBwYWRkaW5nO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlQ2xpY2soZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCByZWN0ID0gdGhpcy5jYW52YXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3QgbW91c2VYID0gZXZlbnQuY2xpZW50WCAtIHJlY3QubGVmdDtcclxuICAgICAgICBjb25zdCBtb3VzZVkgPSBldmVudC5jbGllbnRZIC0gcmVjdC50b3A7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmJhY2tncm91bmRNdXNpYykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnN0b3BTb3VuZCh0aGlzLmJhY2tncm91bmRNdXNpYyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJhY2tncm91bmRNdXNpYyA9IHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZChcImJnbV9nYW1lXCIsIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICBjb25zdCB1aUhlaWdodCA9IDgwO1xyXG4gICAgICAgICAgICAgICAgaWYgKG1vdXNlWSA8IHVpSGVpZ2h0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYnV0dG9uU3RhcnRYID0gdGhpcy5jYW52YXMud2lkdGggLyAyIC0gKE9iamVjdC5rZXlzKFBsYW50VHlwZSkubGVuZ3RoICogKDUwICsgMTApKSAvIDI7XHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IGN1cnJlbnRCdXR0b25YID0gYnV0dG9uU3RhcnRYO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJ1dHRvblNpemUgPSA1MDtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBwYWRkaW5nID0gMTA7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYnV0dG9uWSA9ICh1aUhlaWdodCAtIGJ1dHRvblNpemUpIC8gMjtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgT2JqZWN0LnZhbHVlcyhQbGFudFR5cGUpLmZvckVhY2godHlwZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtb3VzZVggPiBjdXJyZW50QnV0dG9uWCAmJiBtb3VzZVggPCBjdXJyZW50QnV0dG9uWCArIGJ1dHRvblNpemUgJiZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vdXNlWSA+IGJ1dHRvblkgJiYgbW91c2VZIDwgYnV0dG9uWSArIGJ1dHRvblNpemUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0ZWRQbGFudFR5cGUgPSAodGhpcy5zZWxlY3RlZFBsYW50VHlwZSA9PT0gdHlwZSkgPyBudWxsIDogdHlwZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZChcInVpX2NsaWNrX3NmeFwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50QnV0dG9uWCArPSBidXR0b25TaXplICsgcGFkZGluZztcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2VsbFNpemUgPSB0aGlzLmdhbWVEYXRhLmdyaWQuY2VsbFNpemU7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZ3JpZFggPSBNYXRoLmZsb29yKG1vdXNlWCAvIGNlbGxTaXplKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBncmlkWSA9IE1hdGguZmxvb3IobW91c2VZIC8gY2VsbFNpemUpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBsZXQgc3VuQ29sbGVjdGVkID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zdW5zID0gdGhpcy5zdW5zLmZpbHRlcihzdW4gPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5jaGVja0NsaWNrKG1vdXNlWCwgbW91c2VZLCBzdW4pKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN1bkNvdW50ICs9IHN1bi52YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1bkNvbGxlY3RlZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoXCJzdW5fY29sbGVjdF9zZnhcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChzdW5Db2xsZWN0ZWQpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuc2VsZWN0ZWRQbGFudFR5cGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGdyaWRYID49IDAgJiYgZ3JpZFggPCB0aGlzLmdhbWVEYXRhLmdyaWQuY29scyAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZ3JpZFkgPj0gMCAmJiBncmlkWSA8IHRoaXMuZ2FtZURhdGEuZ3JpZC5yb3dzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZ1BsYW50ID0gdGhpcy5wbGFudHMuZmluZChwID0+IHAuZ3JpZFggPT09IGdyaWRYICYmIHAuZ3JpZFkgPT09IGdyaWRZKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZXhpc3RpbmdQbGFudCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvc3QgPSB0aGlzLmdhbWVEYXRhLnBsYW50Q29zdHNbdGhpcy5zZWxlY3RlZFBsYW50VHlwZV07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuc3VuQ291bnQgPj0gY29zdCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYWNlUGxhbnQodGhpcy5zZWxlY3RlZFBsYW50VHlwZSwgZ3JpZFgsIGdyaWRZKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdW5Db3VudCAtPSBjb3N0O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGVkUGxhbnRUeXBlID0gbnVsbDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKFwicGxhbnRfcGxhY2Vfc2Z4XCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZChcImVycm9yX3NmeFwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZChcImVycm9yX3NmeFwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmJhY2tncm91bmRNdXNpYykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnN0b3BTb3VuZCh0aGlzLmJhY2tncm91bmRNdXNpYyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJhY2tncm91bmRNdXNpYyA9IHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZChcImJnbV90aXRsZVwiLCB0cnVlKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZU1vdXNlTW92ZShldmVudDogTW91c2VFdmVudCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHJlY3QgPSB0aGlzLmNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBjb25zdCBtb3VzZVggPSBldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0O1xyXG4gICAgICAgIGNvbnN0IG1vdXNlWSA9IGV2ZW50LmNsaWVudFkgLSByZWN0LnRvcDtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiB0aGlzLnNlbGVjdGVkUGxhbnRUeXBlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxTaXplID0gdGhpcy5nYW1lRGF0YS5ncmlkLmNlbGxTaXplO1xyXG4gICAgICAgICAgICBjb25zdCBncmlkWCA9IE1hdGguZmxvb3IobW91c2VYIC8gY2VsbFNpemUpO1xyXG4gICAgICAgICAgICBjb25zdCBncmlkWSA9IE1hdGguZmxvb3IobW91c2VZIC8gY2VsbFNpemUpO1xyXG4gICAgICAgICAgICB0aGlzLmhvdmVyZWRHcmlkQ2VsbCA9IHsgeDogZ3JpZFgsIHk6IGdyaWRZIH07XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5ob3ZlcmVkR3JpZENlbGwgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc2V0R2FtZSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnN1bkNvdW50ID0gdGhpcy5nYW1lRGF0YS5pbml0aWFsU3VuO1xyXG4gICAgICAgIHRoaXMucGxhbnRzID0gW107XHJcbiAgICAgICAgdGhpcy56b21iaWVzID0gW107XHJcbiAgICAgICAgdGhpcy5wcm9qZWN0aWxlcyA9IFtdO1xyXG4gICAgICAgIHRoaXMuc3VucyA9IFtdO1xyXG4gICAgICAgIHRoaXMuc2VsZWN0ZWRQbGFudFR5cGUgPSBudWxsO1xyXG4gICAgICAgIHRoaXMuaG92ZXJlZEdyaWRDZWxsID0gbnVsbDtcclxuICAgICAgICB0aGlzLm5leHRab21iaWVTcGF3blRpbWUgPSB0aGlzLmxhc3RUaW1lICsgdGhpcy56b21iaWVTcGF3bkludGVydmFsO1xyXG4gICAgICAgIHRoaXMubGFzdFN1bkRyb3BUaW1lID0gdGhpcy5sYXN0VGltZTtcclxuICAgICAgICB0aGlzLm5leHRTdW5Ecm9wSW50ZXJ2YWwgPSBNYXRoLnJhbmRvbSgpICogKHRoaXMuZ2FtZURhdGEuc3VuRHJvcEludGVydmFsLm1heCAtIHRoaXMuZ2FtZURhdGEuc3VuRHJvcEludGVydmFsLm1pbikgKyB0aGlzLmdhbWVEYXRhLnN1bkRyb3BJbnRlcnZhbC5taW47XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmJhY2tncm91bmRNdXNpYykge1xyXG4gICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5zdG9wU291bmQodGhpcy5iYWNrZ3JvdW5kTXVzaWMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSkge1xyXG4gICAgICAgICAgICB0aGlzLmJhY2tncm91bmRNdXNpYyA9IHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZChcImJnbV90aXRsZVwiLCB0cnVlKTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICB0aGlzLmJhY2tncm91bmRNdXNpYyA9IHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZChcImJnbV9nYW1lXCIsIHRydWUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYWNlUGxhbnQodHlwZTogUGxhbnRUeXBlLCBncmlkWDogbnVtYmVyLCBncmlkWTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgcGxhbnRDb25maWcgPSB0aGlzLmdhbWVEYXRhLnBsYW50U3RhdHNbdHlwZV07XHJcbiAgICAgICAgY29uc3QgY2VsbFNpemUgPSB0aGlzLmdhbWVEYXRhLmdyaWQuY2VsbFNpemU7XHJcbiAgICAgICAgY29uc3QgcGxhbnRXaWR0aCA9IGNlbGxTaXplICogMC44O1xyXG4gICAgICAgIGNvbnN0IHBsYW50SGVpZ2h0ID0gY2VsbFNpemUgKiAwLjg7XHJcbiAgICAgICAgY29uc3Qgb2Zmc2V0WCA9IChjZWxsU2l6ZSAtIHBsYW50V2lkdGgpIC8gMjtcclxuICAgICAgICBjb25zdCBvZmZzZXRZID0gKGNlbGxTaXplIC0gcGxhbnRIZWlnaHQpIC8gMjtcclxuXHJcbiAgICAgICAgY29uc3QgbmV3UGxhbnQ6IFBsYW50ID0ge1xyXG4gICAgICAgICAgICBpZDogYHBsYW50LSR7RGF0ZS5ub3coKX0tJHtNYXRoLnJhbmRvbSgpfWAsXHJcbiAgICAgICAgICAgIHR5cGU6IHR5cGUsXHJcbiAgICAgICAgICAgIHg6IGdyaWRYICogY2VsbFNpemUgKyBvZmZzZXRYLFxyXG4gICAgICAgICAgICB5OiBncmlkWSAqIGNlbGxTaXplICsgb2Zmc2V0WSxcclxuICAgICAgICAgICAgd2lkdGg6IHBsYW50V2lkdGgsXHJcbiAgICAgICAgICAgIGhlaWdodDogcGxhbnRIZWlnaHQsXHJcbiAgICAgICAgICAgIGFzc2V0TmFtZTogcGxhbnRDb25maWcuYXNzZXQsXHJcbiAgICAgICAgICAgIGhlYWx0aDogcGxhbnRDb25maWcuaGVhbHRoLFxyXG4gICAgICAgICAgICBtYXhIZWFsdGg6IHBsYW50Q29uZmlnLmhlYWx0aCxcclxuICAgICAgICAgICAgZ3JpZFg6IGdyaWRYLFxyXG4gICAgICAgICAgICBncmlkWTogZ3JpZFksXHJcbiAgICAgICAgICAgIGxhc3RBY3Rpb25UaW1lOiAwLFxyXG4gICAgICAgICAgICB0YWtlRGFtYWdlOiBmdW5jdGlvbiAoYW1vdW50OiBudW1iZXIpIHsgdGhpcy5oZWFsdGggLT0gYW1vdW50OyB9LFxyXG4gICAgICAgICAgICBpc0FsaXZlOiBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGlzLmhlYWx0aCA+IDA7IH0sXHJcbiAgICAgICAgICAgIHJlbmRlcjogZnVuY3Rpb24gKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlcikge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaW1nID0gYXNzZXRNYW5hZ2VyLmdldEltYWdlKHRoaXMuYXNzZXROYW1lKTtcclxuICAgICAgICAgICAgICAgIGlmIChpbWcpIHtcclxuICAgICAgICAgICAgICAgICAgICBjdHguZHJhd0ltYWdlKGltZywgdGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9ICdncmVlbic7XHJcbiAgICAgICAgICAgICAgICAgICAgY3R4LmZpbGxSZWN0KHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5oZWFsdGggPCB0aGlzLm1heEhlYWx0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhcldpZHRoID0gdGhpcy53aWR0aDtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBiYXJIZWlnaHQgPSA1O1xyXG4gICAgICAgICAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSAncmVkJztcclxuICAgICAgICAgICAgICAgICAgICBjdHguZmlsbFJlY3QodGhpcy54LCB0aGlzLnkgLSBiYXJIZWlnaHQgLSAyLCBiYXJXaWR0aCwgYmFySGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgICAgICBjdHguZmlsbFN0eWxlID0gJ2xpbWUnO1xyXG4gICAgICAgICAgICAgICAgICAgIGN0eC5maWxsUmVjdCh0aGlzLngsIHRoaXMueSAtIGJhckhlaWdodCAtIDIsIGJhcldpZHRoICogKHRoaXMuaGVhbHRoIC8gdGhpcy5tYXhIZWFsdGgpLCBiYXJIZWlnaHQpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgICAgICB0aGlzLnBsYW50cy5wdXNoKG5ld1BsYW50KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNwYXduWm9tYmllKHR5cGU6IFpvbWJpZVR5cGUsIHJvdzogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3Qgem9tYmllQ29uZmlnID0gdGhpcy5nYW1lRGF0YS56b21iaWVTdGF0c1t0eXBlXTtcclxuICAgICAgICBjb25zdCBjZWxsU2l6ZSA9IHRoaXMuZ2FtZURhdGEuZ3JpZC5jZWxsU2l6ZTtcclxuICAgICAgICBjb25zdCB6b21iaWVXaWR0aCA9IGNlbGxTaXplICogMC45O1xyXG4gICAgICAgIGNvbnN0IHpvbWJpZUhlaWdodCA9IGNlbGxTaXplICogMC45O1xyXG4gICAgICAgIGNvbnN0IG9mZnNldFkgPSAoY2VsbFNpemUgLSB6b21iaWVIZWlnaHQpIC8gMjtcclxuXHJcbiAgICAgICAgY29uc3QgbmV3Wm9tYmllOiBab21iaWUgPSB7XHJcbiAgICAgICAgICAgIGlkOiBgem9tYmllLSR7RGF0ZS5ub3coKX0tJHtNYXRoLnJhbmRvbSgpfWAsXHJcbiAgICAgICAgICAgIHR5cGU6IHR5cGUsXHJcbiAgICAgICAgICAgIHg6IHRoaXMuY2FudmFzLndpZHRoLFxyXG4gICAgICAgICAgICB5OiByb3cgKiBjZWxsU2l6ZSArIG9mZnNldFksXHJcbiAgICAgICAgICAgIHdpZHRoOiB6b21iaWVXaWR0aCxcclxuICAgICAgICAgICAgaGVpZ2h0OiB6b21iaWVIZWlnaHQsXHJcbiAgICAgICAgICAgIGFzc2V0TmFtZTogem9tYmllQ29uZmlnLmFzc2V0LFxyXG4gICAgICAgICAgICBoZWFsdGg6IHpvbWJpZUNvbmZpZy5oZWFsdGgsXHJcbiAgICAgICAgICAgIG1heEhlYWx0aDogem9tYmllQ29uZmlnLmhlYWx0aCxcclxuICAgICAgICAgICAgc3BlZWQ6IHpvbWJpZUNvbmZpZy5zcGVlZCxcclxuICAgICAgICAgICAgYXR0YWNrRGFtYWdlOiB6b21iaWVDb25maWcuYXR0YWNrRGFtYWdlLFxyXG4gICAgICAgICAgICBhdHRhY2tTcGVlZDogem9tYmllQ29uZmlnLmF0dGFja1NwZWVkLFxyXG4gICAgICAgICAgICBsYXN0QXR0YWNrVGltZTogMCxcclxuICAgICAgICAgICAgdGFyZ2V0UGxhbnQ6IG51bGwsXHJcbiAgICAgICAgICAgIHJvdzogcm93LFxyXG4gICAgICAgICAgICB0YWtlRGFtYWdlOiBmdW5jdGlvbiAoYW1vdW50OiBudW1iZXIpIHsgdGhpcy5oZWFsdGggLT0gYW1vdW50OyB9LFxyXG4gICAgICAgICAgICBpc0FsaXZlOiBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGlzLmhlYWx0aCA+IDA7IH0sXHJcbiAgICAgICAgICAgIHJlbmRlcjogZnVuY3Rpb24gKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlcikge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaW1nID0gYXNzZXRNYW5hZ2VyLmdldEltYWdlKHRoaXMuYXNzZXROYW1lKTtcclxuICAgICAgICAgICAgICAgIGlmIChpbWcpIHtcclxuICAgICAgICAgICAgICAgICAgICBjdHguZHJhd0ltYWdlKGltZywgdGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9ICdwdXJwbGUnO1xyXG4gICAgICAgICAgICAgICAgICAgIGN0eC5maWxsUmVjdCh0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaGVhbHRoIDwgdGhpcy5tYXhIZWFsdGgpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBiYXJXaWR0aCA9IHRoaXMud2lkdGg7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYmFySGVpZ2h0ID0gNTtcclxuICAgICAgICAgICAgICAgICAgICBjdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgICAgICAgICAgICAgY3R4LmZpbGxSZWN0KHRoaXMueCwgdGhpcy55IC0gYmFySGVpZ2h0IC0gMiwgYmFyV2lkdGgsIGJhckhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9ICdsaW1lJztcclxuICAgICAgICAgICAgICAgICAgICBjdHguZmlsbFJlY3QodGhpcy54LCB0aGlzLnkgLSBiYXJIZWlnaHQgLSAyLCBiYXJXaWR0aCAqICh0aGlzLmhlYWx0aCAvIHRoaXMubWF4SGVhbHRoKSwgYmFySGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgdGhpcy56b21iaWVzLnB1c2gobmV3Wm9tYmllKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNwYXduUHJvamVjdGlsZSh0eXBlOiBQcm9qZWN0aWxlVHlwZSwgeDogbnVtYmVyLCB5OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBwcm9qZWN0aWxlQ29uZmlnID0gdGhpcy5nYW1lRGF0YS5wcm9qZWN0aWxlU3RhdHNbdHlwZV07XHJcbiAgICAgICAgY29uc3QgcHJvamVjdGlsZVdpZHRoID0gMjA7XHJcbiAgICAgICAgY29uc3QgcHJvamVjdGlsZUhlaWdodCA9IDIwO1xyXG5cclxuICAgICAgICBjb25zdCBuZXdQcm9qZWN0aWxlOiBQcm9qZWN0aWxlID0ge1xyXG4gICAgICAgICAgICBpZDogYHByb2plY3RpbGUtJHtEYXRlLm5vdygpfS0ke01hdGgucmFuZG9tKCl9YCxcclxuICAgICAgICAgICAgdHlwZTogdHlwZSxcclxuICAgICAgICAgICAgeDogeCxcclxuICAgICAgICAgICAgeTogeSxcclxuICAgICAgICAgICAgd2lkdGg6IHByb2plY3RpbGVXaWR0aCxcclxuICAgICAgICAgICAgaGVpZ2h0OiBwcm9qZWN0aWxlSGVpZ2h0LFxyXG4gICAgICAgICAgICBhc3NldE5hbWU6IHByb2plY3RpbGVDb25maWcuYXNzZXQsXHJcbiAgICAgICAgICAgIHNwZWVkOiBwcm9qZWN0aWxlQ29uZmlnLnNwZWVkLFxyXG4gICAgICAgICAgICBkYW1hZ2U6IHByb2plY3RpbGVDb25maWcuZGFtYWdlLFxyXG4gICAgICAgICAgICByZW5kZXI6IGZ1bmN0aW9uIChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXIpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGltZyA9IGFzc2V0TWFuYWdlci5nZXRJbWFnZSh0aGlzLmFzc2V0TmFtZSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoaW1nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY3R4LmRyYXdJbWFnZShpbWcsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSAnb3JhbmdlJztcclxuICAgICAgICAgICAgICAgICAgICBjdHguZmlsbFJlY3QodGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgdGhpcy5wcm9qZWN0aWxlcy5wdXNoKG5ld1Byb2plY3RpbGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3Bhd25TdW4oeDogbnVtYmVyLCB5OiBudW1iZXIsIHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBzdW5XaWR0aCA9IDUwO1xyXG4gICAgICAgIGNvbnN0IHN1bkhlaWdodCA9IDUwO1xyXG4gICAgICAgIGNvbnN0IG5ld1N1bjogU3VuID0ge1xyXG4gICAgICAgICAgICBpZDogYHN1bi0ke0RhdGUubm93KCl9LSR7TWF0aC5yYW5kb20oKX1gLFxyXG4gICAgICAgICAgICB4OiB4IC0gc3VuV2lkdGggLyAyLFxyXG4gICAgICAgICAgICB5OiB5IC0gc3VuSGVpZ2h0IC8gMixcclxuICAgICAgICAgICAgd2lkdGg6IHN1bldpZHRoLFxyXG4gICAgICAgICAgICBoZWlnaHQ6IHN1bkhlaWdodCxcclxuICAgICAgICAgICAgYXNzZXROYW1lOiBcInN1bl9pY29uXCIsXHJcbiAgICAgICAgICAgIHZhbHVlOiB2YWx1ZSxcclxuICAgICAgICAgICAgc3Bhd25UaW1lOiB0aGlzLmxhc3RUaW1lLFxyXG4gICAgICAgICAgICBkZXNwYXduRHVyYXRpb246IDEwMDAwLFxyXG4gICAgICAgICAgICByZW5kZXI6IGZ1bmN0aW9uIChjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXIpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGltZyA9IGFzc2V0TWFuYWdlci5nZXRJbWFnZSh0aGlzLmFzc2V0TmFtZSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoaW1nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY3R4LmRyYXdJbWFnZShpbWcsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSAneWVsbG93JztcclxuICAgICAgICAgICAgICAgICAgICBjdHguZmlsbFJlY3QodGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgdGhpcy5zdW5zLnB1c2gobmV3U3VuKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyb3BTdW5Gcm9tU2t5KCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHJhbmRvbUNvbCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIHRoaXMuZ2FtZURhdGEuZ3JpZC5jb2xzKTtcclxuICAgICAgICBjb25zdCByYW5kb21YID0gcmFuZG9tQ29sICogdGhpcy5nYW1lRGF0YS5ncmlkLmNlbGxTaXplICsgdGhpcy5nYW1lRGF0YS5ncmlkLmNlbGxTaXplIC8gMjtcclxuICAgICAgICBjb25zdCByYW5kb21ZID0gTWF0aC5yYW5kb20oKSAqICh0aGlzLmdhbWVEYXRhLmdyaWQucm93cyAqIHRoaXMuZ2FtZURhdGEuZ3JpZC5jZWxsU2l6ZSAqIDAuNSkgKyB0aGlzLmdhbWVEYXRhLmdyaWQuY2VsbFNpemUgKiAwLjE7XHJcbiAgICAgICAgdGhpcy5zcGF3blN1bihyYW5kb21YLCByYW5kb21ZLCB0aGlzLmdhbWVEYXRhLnN1blZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNoZWNrQ29sbGlzaW9uKG9iajE6IEdhbWVPYmplY3QsIG9iajI6IEdhbWVPYmplY3QpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gb2JqMS54IDwgb2JqMi54ICsgb2JqMi53aWR0aCAmJlxyXG4gICAgICAgICAgICBvYmoxLnggKyBvYmoxLndpZHRoID4gb2JqMi54ICYmXHJcbiAgICAgICAgICAgIG9iajEueSA8IG9iajIueSArIG9iajIuaGVpZ2h0ICYmXHJcbiAgICAgICAgICAgIG9iajEueSArIG9iajEuaGVpZ2h0ID4gb2JqMi55O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY2hlY2tDbGljayhjbGlja1g6IG51bWJlciwgY2xpY2tZOiBudW1iZXIsIG9iajogR2FtZU9iamVjdCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiBjbGlja1ggPiBvYmoueCAmJiBjbGlja1ggPCBvYmoueCArIG9iai53aWR0aCAmJlxyXG4gICAgICAgICAgICBjbGlja1kgPiBvYmoueSAmJiBjbGlja1kgPCBvYmoueSArIG9iai5oZWlnaHQ7XHJcbiAgICB9XHJcbn1cclxuXHJcbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgKCkgPT4ge1xyXG4gICAgY29uc3QgZ2FtZSA9IG5ldyBHYW1lKCdnYW1lQ2FudmFzJyk7XHJcbiAgICBnYW1lLmluaXQoKTtcclxufSk7Il0sCiAgIm1hcHBpbmdzIjogIkFBNERBLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUhDLFNBQUFBO0FBQUEsR0FBQTtBQU1MLElBQUssWUFBTCxrQkFBS0MsZUFBTDtBQUNJLEVBQUFBLFdBQUEsa0JBQWU7QUFDZixFQUFBQSxXQUFBLGlCQUFjO0FBRmIsU0FBQUE7QUFBQSxHQUFBO0FBS0wsSUFBSyxhQUFMLGtCQUFLQyxnQkFBTDtBQUNJLEVBQUFBLFlBQUEsa0JBQWU7QUFEZCxTQUFBQTtBQUFBLEdBQUE7QUFJTCxJQUFLLGlCQUFMLGtCQUFLQyxvQkFBTDtBQUNJLEVBQUFBLGdCQUFBLFNBQU07QUFETCxTQUFBQTtBQUFBLEdBQUE7QUFrREwsTUFBTSxhQUFhO0FBQUEsRUFBbkI7QUFDSSxTQUFRLFNBQXdDLG9CQUFJLElBQUk7QUFDeEQsU0FBUSxTQUF3QyxvQkFBSSxJQUFJO0FBQ3hELFNBQVEsY0FBYztBQUN0QixTQUFRLGVBQWU7QUFDdkIsU0FBUSxxQkFBMEQ7QUFDbEUsU0FB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LFFBQ3hEO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFDQSxTQUFLLEtBQUssS0FBSyxNQUFNO0FBQUEsRUFDekI7QUFBQSxFQUVRLGlCQUF1QjtBQUMzQixVQUFNLFlBQVksS0FBSyxNQUFNLEtBQUssT0FBTyxJQUFJLEtBQUssU0FBUyxLQUFLLElBQUk7QUFDcEUsVUFBTSxVQUFVLFlBQVksS0FBSyxTQUFTLEtBQUssV0FBVyxLQUFLLFNBQVMsS0FBSyxXQUFXO0FBQ3hGLFVBQU0sVUFBVSxLQUFLLE9BQU8sS0FBSyxLQUFLLFNBQVMsS0FBSyxPQUFPLEtBQUssU0FBUyxLQUFLLFdBQVcsT0FBTyxLQUFLLFNBQVMsS0FBSyxXQUFXO0FBQzlILFNBQUssU0FBUyxTQUFTLFNBQVMsS0FBSyxTQUFTLFFBQVE7QUFBQSxFQUMxRDtBQUFBLEVBRVEsZUFBZSxNQUFrQixNQUEyQjtBQUNoRSxXQUFPLEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxTQUMxQixLQUFLLElBQUksS0FBSyxRQUFRLEtBQUssS0FDM0IsS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLFVBQ3ZCLEtBQUssSUFBSSxLQUFLLFNBQVMsS0FBSztBQUFBLEVBQ3BDO0FBQUEsRUFFUSxXQUFXLFFBQWdCLFFBQWdCLEtBQTBCO0FBQ3pFLFdBQU8sU0FBUyxJQUFJLEtBQUssU0FBUyxJQUFJLElBQUksSUFBSSxTQUMxQyxTQUFTLElBQUksS0FBSyxTQUFTLElBQUksSUFBSSxJQUFJO0FBQUEsRUFDL0M7QUFDSjtBQUVBLE9BQU8saUJBQWlCLFFBQVEsTUFBTTtBQUNsQyxRQUFNLE9BQU8sSUFBSSxLQUFLLFlBQVk7QUFDbEMsT0FBSyxLQUFLO0FBQ2QsQ0FBQzsiLAogICJuYW1lcyI6IFsiR2FtZVN0YXRlIiwgIlBsYW50VHlwZSIsICJab21iaWVUeXBlIiwgIlByb2plY3RpbGVUeXBlIl0KfQo=
