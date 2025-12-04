import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Type Definitions for data.json for enhanced type safety
interface GameData {
    gameSettings: {
        title: string;
        instructions: string;
        finishMessage: string;
        gravity: number;
        laps: number;
    };
    camera: {
        fov: number;
        near: number;
        far: number;
        offset: { x: number; y: number; z: number };
        lookAtOffset: { x: number; y: number; z: number };
        lerpFactor: number;
    };
    playerKart: {
        chassisSize: { width: number; height: number; depth: number };
        mass: number;
        wheelRadius: number;
        wheelThickness: number;
        engineForce: number;
        brakeForce: number;
        maxSteer: number;
        suspension: {
            stiffness: number;
            restLength: number;
            damping: number;
            compression: number;
        };
        friction: number;
        rollInfluence: number;
    };
    track: {
        groundSize: { width: number; height: number };
        wallHeight: number;
        wallThickness: number;
        finishLinePosition: { x: number; y: number; z: number };
        finishLineSize: { width: number; height: number; depth: number };
    };
    assets: {
        images: { name: string; path: string; }[];
        sounds: { name: string; path: string; volume: number; }[];
    };
}

class KartRacerGame {
    // Core Components
    private data!: GameData;
    private renderer!: THREE.WebGLRenderer;
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private clock = new THREE.Clock();

    // Physics
    private world!: CANNON.World;
    private vehicle!: CANNON.RaycastVehicle;
    private chassisBody!: CANNON.Body;
    private lastCollisionTime = 0;

    // Game State
    private gameState: 'LOADING' | 'TITLE' | 'PLAYING' | 'FINISHED' = 'LOADING';
    private keysPressed: { [key: string]: boolean } = {};
    private lapsCompleted = 0;

    // Assets & Audio
    private textures: Map<string, THREE.Texture> = new Map();
    private sounds: Map<string, THREE.Audio> = new Map();
    private audioListener!: THREE.AudioListener;

    // Game Objects
    private kartMesh!: THREE.Group;
    private wheelMeshes: THREE.Mesh[] = [];

    // UI
    private uiContainer!: HTMLDivElement;

    constructor() {
        this.init();
    }

    private async init() {
        try {
            const response = await fetch('data.json');
            if (!response.ok) throw new Error('Failed to load data.json');
            this.data = await response.json();

            this.setupUI();
            this.showLoadingMessage();

            this.initThree();
            this.initCannon();
            await this.loadAssets();

            this.showTitleScreen();
            this.setupInputListeners();
            this.animate();
        } catch (error) {
            console.error("Initialization failed:", error);
            if (this.uiContainer) {
                this.uiContainer.innerHTML = `<div style="color: red; font-size: 24px;">Error: Could not load game data. Please check console.</div>`;
            }
        }
    }

    private setupUI() {
        this.uiContainer = document.createElement('div');
        this.uiContainer.id = 'ui-container';
        this.uiContainer.style.position = 'absolute';
        this.uiContainer.style.top = '0';
        this.uiContainer.style.left = '0';
        this.uiContainer.style.width = '100%';
        this.uiContainer.style.height = '100%';
        this.uiContainer.style.display = 'flex';
        this.uiContainer.style.justifyContent = 'center';
        this.uiContainer.style.alignItems = 'center';
        this.uiContainer.style.flexDirection = 'column';
        this.uiContainer.style.color = 'white';
        this.uiContainer.style.fontFamily = 'Arial, sans-serif';
        this.uiContainer.style.textShadow = '2px 2px 4px #000000';
        this.uiContainer.style.pointerEvents = 'none';
        document.body.appendChild(this.uiContainer);
    }

    private showLoadingMessage() {
        this.uiContainer.innerHTML = `<h1 style="font-size: 48px;">Loading...</h1>`;
    }

    private showTitleScreen() {
        this.gameState = 'TITLE';
        this.uiContainer.innerHTML = `
            <h1 style="font-size: 48px;">${this.data.gameSettings.title}</h1>
            <p style="font-size: 24px;">${this.data.gameSettings.instructions}</p>
        `;
        this.uiContainer.style.display = 'flex';
    }

    private showFinishScreen() {
        this.gameState = 'FINISHED';
        this.uiContainer.innerHTML = `
            <h1 style="font-size: 64px;">${this.data.gameSettings.finishMessage}</h1>
            <p style="font-size: 24px;">Press R to Restart</p>
        `;
        this.uiContainer.style.display = 'flex';
    }

    private hideUI() {
        this.uiContainer.style.display = 'none';
    }

    private initThree() {
        const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        if (!canvas) throw new Error('Canvas with id "gameCanvas" not found.');

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x87ceeb); // Sky blue background

        this.scene = new THREE.Scene();

        const camSettings = this.data.camera;
        this.camera = new THREE.PerspectiveCamera(camSettings.fov, window.innerWidth / window.innerHeight, camSettings.near, camSettings.far);
        this.scene.add(this.camera);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(10, 20, 5);
        this.scene.add(directionalLight);

        this.audioListener = new THREE.AudioListener();
        this.camera.add(this.audioListener);
    }

    private initCannon() {
        this.world = new CANNON.World({
            gravity: new CANNON.Vec3(0, this.data.gameSettings.gravity, 0),
        });
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        (this.world.solver as CANNON.GSSolver).iterations = 10;
    }

    private async loadAssets() {
        const textureLoader = new THREE.TextureLoader();
        const audioLoader = new THREE.AudioLoader();

        const imagePromises = this.data.assets.images.map(img =>
            textureLoader.loadAsync(img.path).then(texture => {
                this.textures.set(img.name, texture);
            })
        );

        const soundPromises = this.data.assets.sounds.map(sound =>
            audioLoader.loadAsync(sound.path).then(buffer => {
                const audio = new THREE.Audio(this.audioListener);
                audio.setBuffer(buffer);
                audio.setVolume(sound.volume);
                this.sounds.set(sound.name, audio);
            })
        );

        await Promise.all([...imagePromises, ...soundPromises]);
    }

    private setupGame() {
        this.lapsCompleted = 0;
        this.createTrack();
        this.createPlayerKart();
        this.createFinishLine();
        
        const bgm = this.sounds.get('bgm');
        if (bgm && !bgm.isPlaying) {
            bgm.setLoop(true);
            bgm.play();
        }
        
        const engineIdle = this.sounds.get('engine_idle');
        if (engineIdle) {
            engineIdle.setLoop(true);
            engineIdle.play();
        }
    }
    
    private resetGame() {
        // Stop sounds
        this.sounds.forEach(sound => {
            if (sound.isPlaying) sound.stop();
        });

        // Clear scene and physics world
        while(this.scene.children.length > 0){ 
            const obj = this.scene.children[0];
            // Don't remove camera and lights
            if (!(obj instanceof THREE.Camera) && !(obj instanceof THREE.Light)) {
                 this.scene.remove(obj);
            } else {
                 // To avoid infinite loop, just move to next item
                 if (this.scene.children.length > 1) {
                    this.scene.children.push(this.scene.children.shift()!);
                 } else break;
            }
        }
        this.world.bodies.forEach(body => this.world.removeBody(body));
        this.wheelMeshes = [];

        // Re-setup the game
        this.setupGame();
        this.gameState = 'PLAYING';
        this.hideUI();
    }


    private startGame() {
        if (this.gameState !== 'TITLE') return;
        this.gameState = 'PLAYING';
        this.hideUI();
        this.setupGame();
    }
    
    private createTrack() {
        const trackData = this.data.track;
        const groundMaterial = new CANNON.Material('groundMaterial');
        const groundBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Plane(),
            material: groundMaterial,
        });
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.world.addBody(groundBody);

        const groundTexture = this.textures.get('track');
        if(groundTexture) {
            groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
            groundTexture.repeat.set(trackData.groundSize.width / 20, trackData.groundSize.height / 20);
            const groundMesh = new THREE.Mesh(
                new THREE.PlaneGeometry(trackData.groundSize.width, trackData.groundSize.height),
                new THREE.MeshLambertMaterial({ map: groundTexture })
            );
            groundMesh.rotation.x = -Math.PI / 2;
            this.scene.add(groundMesh);
        }

        // Skybox
        const skyTexture = this.textures.get('sky');
        if(skyTexture) {
            const skybox = new THREE.Mesh(
                new THREE.BoxGeometry(500, 500, 500),
                new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide })
            );
            this.scene.add(skybox);
        }

        const wallMaterial = new CANNON.Material('wallMaterial');
        const createWall = (size: {x: number, y: number, z: number}, position: {x: number, y: number, z: number}) => {
            const wallBody = new CANNON.Body({
                mass: 0,
                shape: new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)),
                material: wallMaterial,
                position: new CANNON.Vec3(position.x, position.y, position.z),
            });
            this.world.addBody(wallBody);

            const wallTexture = this.textures.get('wall');
            if(wallTexture) {
                wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
                wallTexture.repeat.set(Math.max(size.x, size.z) / 4, size.y / 4);
                const wallMesh = new THREE.Mesh(
                    new THREE.BoxGeometry(size.x, size.y, size.z),
                    new THREE.MeshLambertMaterial({ map: wallTexture })
                );
                wallMesh.position.copy(wallBody.position as unknown as THREE.Vector3);
                this.scene.add(wallMesh);
            }
        };

        const w = trackData.groundSize.width / 2;
        const h = trackData.groundSize.height / 2;
        const wh = trackData.wallHeight;
        const wt = trackData.wallThickness;
        createWall({ x: trackData.groundSize.width, y: wh, z: wt }, { x: 0, y: wh / 2, z: -h });
        createWall({ x: trackData.groundSize.width, y: wh, z: wt }, { x: 0, y: wh / 2, z: h });
        createWall({ x: wt, y: wh, z: trackData.groundSize.height }, { x: -w, y: wh / 2, z: 0 });
        createWall({ x: wt, y: wh, z: trackData.groundSize.height }, { x: w, y: wh / 2, z: 0 });

        const contactMaterial = new CANNON.ContactMaterial(groundMaterial, wallMaterial, {
            friction: 0.01,
            restitution: 0.1,
        });
        this.world.addContactMaterial(contactMaterial);
    }

    private createFinishLine() {
        const position = this.data.track.finishLinePosition;
        const size = this.data.track.finishLineSize;
        const finishLineBody = new CANNON.Body({
            isTrigger: true,
            mass: 0,
            position: new CANNON.Vec3(position.x, position.y, position.z),
            shape: new CANNON.Box(new CANNON.Vec3(size.width / 2, size.height / 2, size.depth / 2)),
        });
        this.world.addBody(finishLineBody);

        finishLineBody.addEventListener('collide', (event: any) => {
            if (event.body === this.chassisBody) {
                this.lapsCompleted++;
                if (this.lapsCompleted >= this.data.gameSettings.laps) {
                    this.showFinishScreen();
                }
            }
        });

        const finishTexture = this.textures.get('finish_line');
        if(finishTexture){
            const finishMesh = new THREE.Mesh(
                new THREE.BoxGeometry(size.width, size.height, size.depth),
                new THREE.MeshBasicMaterial({ map: finishTexture, transparent: true })
            );
            finishMesh.position.copy(finishLineBody.position as unknown as THREE.Vector3);
            this.scene.add(finishMesh);
        }
    }

    private createPlayerKart() {
        const p = this.data.playerKart;
        const chassisShape = new CANNON.Box(new CANNON.Vec3(p.chassisSize.width / 2, p.chassisSize.height / 2, p.chassisSize.depth / 2));
        this.chassisBody = new CANNON.Body({ mass: p.mass });
        this.chassisBody.addShape(chassisShape);
        this.chassisBody.position.set(0, 2, -30);
        
        this.chassisBody.addEventListener('collide', (event: any) => {
            const contactNormal = event.contact.ni;
            const impactVelocity = event.contact.getImpactVelocityAlongNormal();
            if (impactVelocity > 1.0) { // Only play for significant impacts
                const now = performance.now();
                if (now - this.lastCollisionTime > 500) { // Cooldown of 500ms
                    this.sounds.get('crash')?.play();
                    this.lastCollisionTime = now;
                }
            }
        });

        this.vehicle = new CANNON.RaycastVehicle({
            chassisBody: this.chassisBody,
            indexRightAxis: 0, // x
            indexUpAxis: 1,    // y
            indexForwardAxis: 2, // z
        });

        const wheelOptions = {
            radius: p.wheelRadius,
            directionLocal: new CANNON.Vec3(0, -1, 0),
            suspensionStiffness: p.suspension.stiffness,
            suspensionRestLength: p.suspension.restLength,
            frictionSlip: p.friction,
            dampingRelaxation: p.suspension.damping,
            dampingCompression: p.suspension.compression,
            maxSuspensionForce: 100000,
            rollInfluence: p.rollInfluence,
            axleLocal: new CANNON.Vec3(-1, 0, 0),
            chassisConnectionPointLocal: new CANNON.Vec3(),
            maxSuspensionTravel: 0.3,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true,
        };

        const w = p.chassisSize.width / 2;
        const d = p.chassisSize.depth / 2;

        wheelOptions.chassisConnectionPointLocal.set(w, 0, d); // Front-Right
        this.vehicle.addWheel(wheelOptions);
        wheelOptions.chassisConnectionPointLocal.set(-w, 0, d); // Front-Left
        this.vehicle.addWheel(wheelOptions);
        wheelOptions.chassisConnectionPointLocal.set(w, 0, -d); // Back-Right
        this.vehicle.addWheel(wheelOptions);
        wheelOptions.chassisConnectionPointLocal.set(-w, 0, -d); // Back-Left
        this.vehicle.addWheel(wheelOptions);

        this.vehicle.addToWorld(this.world);
        
        // Visuals
        this.kartMesh = new THREE.Group();
        const chassisTexture = this.textures.get('kart');
        const chassisMesh = new THREE.Mesh(
            new THREE.BoxGeometry(p.chassisSize.width, p.chassisSize.height, p.chassisSize.depth),
            new THREE.MeshLambertMaterial({ map: chassisTexture })
        );
        this.kartMesh.add(chassisMesh);
        
        const wheelGeo = new THREE.CylinderGeometry(p.wheelRadius, p.wheelRadius, p.wheelThickness, 24);
        wheelGeo.rotateZ(Math.PI / 2);
        const wheelTexture = this.textures.get('wheel');
        const wheelMat = new THREE.MeshLambertMaterial({ map: wheelTexture });
        
        this.vehicle.wheelInfos.forEach(() => {
            const wheelMesh = new THREE.Mesh(wheelGeo, wheelMat);
            this.wheelMeshes.push(wheelMesh);
            this.kartMesh.add(wheelMesh);
        });
        
        this.scene.add(this.kartMesh);
    }
    
    private setupInputListeners() {
        window.addEventListener('keydown', (event) => {
            this.keysPressed[event.key.toLowerCase()] = true;
            if(this.gameState === 'TITLE' && event.key === 'Enter') {
                this.startGame();
            }
            if(this.gameState === 'FINISHED' && event.key.toLowerCase() === 'r') {
                this.resetGame();
            }
        });
        window.addEventListener('keyup', (event) => {
            this.keysPressed[event.key.toLowerCase()] = false;
        });

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    private updateControls() {
        const p = this.data.playerKart;
        const engineForce = p.engineForce;
        const brakeForce = p.brakeForce;
        const maxSteerVal = p.maxSteer;

        let isAccelerating = false;

        // Forward / Backward
        if (this.keysPressed['arrowup'] || this.keysPressed['w']) {
            this.vehicle.applyEngineForce(-engineForce, 2);
            this.vehicle.applyEngineForce(-engineForce, 3);
            isAccelerating = true;
        } else if (this.keysPressed['arrowdown'] || this.keysPressed['s']) {
            this.vehicle.applyEngineForce(engineForce / 2, 2);
            this.vehicle.applyEngineForce(engineForce / 2, 3);
        } else {
            this.vehicle.applyEngineForce(0, 2);
            this.vehicle.applyEngineForce(0, 3);
        }

        // Steering
        if (this.keysPressed['arrowleft'] || this.keysPressed['a']) {
            this.vehicle.setSteeringValue(maxSteerVal, 0);
            this.vehicle.setSteeringValue(maxSteerVal, 1);
        } else if (this.keysPressed['arrowright'] || this.keysPressed['d']) {
            this.vehicle.setSteeringValue(-maxSteerVal, 0);
            this.vehicle.setSteeringValue(-maxSteerVal, 1);
        } else {
            this.vehicle.setSteeringValue(0, 0);
            this.vehicle.setSteeringValue(0, 1);
        }

        // Braking
        if (this.keysPressed[' ']) { // Space bar
            this.vehicle.setBrake(brakeForce, 0);
            this.vehicle.setBrake(brakeForce, 1);
            this.vehicle.setBrake(brakeForce, 2);
            this.vehicle.setBrake(brakeForce, 3);
        } else {
            this.vehicle.setBrake(0, 0);
            this.vehicle.setBrake(0, 1);
            this.vehicle.setBrake(0, 2);
            this.vehicle.setBrake(0, 3);
        }
        
        // Sound management
        const engineIdle = this.sounds.get('engine_idle');
        const engineDriving = this.sounds.get('engine_driving');
        
        if(isAccelerating){
            if(engineIdle?.isPlaying) engineIdle.stop();
            if(!engineDriving?.isPlaying) {
                engineDriving?.setLoop(true);
                engineDriving?.play();
            }
        } else {
            if(engineDriving?.isPlaying) engineDriving.stop();
            if(!engineIdle?.isPlaying) {
                engineIdle?.setLoop(true);
                engineIdle?.play();
            }
        }
    }

    private updateGraphics() {
        if (!this.kartMesh || !this.chassisBody) return;
        
        this.kartMesh.position.copy(this.chassisBody.position as unknown as THREE.Vector3);
        this.kartMesh.quaternion.copy(this.chassisBody.quaternion as unknown as THREE.Quaternion);
        
        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            this.vehicle.updateWheelTransform(i);
            const transform = this.vehicle.wheelInfos[i].worldTransform;
            const wheelMesh = this.wheelMeshes[i];
            wheelMesh.position.copy(transform.position as unknown as THREE.Vector3);
            wheelMesh.quaternion.copy(transform.quaternion as unknown as THREE.Quaternion);
        }
    }

    private updateCamera() {
        if (!this.kartMesh) return;
        const camSettings = this.data.camera;
        
        const offset = new THREE.Vector3(camSettings.offset.x, camSettings.offset.y, camSettings.offset.z);
        offset.applyQuaternion(this.kartMesh.quaternion);
        offset.add(this.kartMesh.position);

        this.camera.position.lerp(offset, camSettings.lerpFactor);
        
        const lookAtTarget = new THREE.Vector3().copy(this.kartMesh.position);
        const lookAtOffset = new THREE.Vector3(camSettings.lookAtOffset.x, camSettings.lookAtOffset.y, camSettings.lookAtOffset.z);
        lookAtTarget.add(lookAtOffset);

        this.camera.lookAt(lookAtTarget);
    }

    private animate = () => {
        requestAnimationFrame(this.animate);
        const deltaTime = this.clock.getDelta();

        if (this.gameState === 'PLAYING') {
            this.world.step(1 / 60, deltaTime, 3);
            this.updateControls();
            this.updateGraphics();
            this.updateCamera();
        }

        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new KartRacerGame();
});