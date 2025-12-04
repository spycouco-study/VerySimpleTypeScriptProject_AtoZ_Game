// Minimalistic Math Library (Vec3 and Mat4)
type Vec3 = [number, number, number];
type Mat4 = number[]; // 16 elements

const vec3_lib = {
    create: (x: number, y: number, z: number): Vec3 => [x, y, z],
    add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    len: (a: Vec3): number => Math.sqrt(vec3_lib.dot(a, a)),
    normalize: (a: Vec3): Vec3 => {
        const l = vec3_lib.len(a);
        return l > 0 ? vec3_lib.mul(a, 1 / l) : [0, 0, 0];
    },
};

const mat4_lib = {
    create: (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    identity: (out: Mat4): Mat4 => {
        for (let i = 0; i < 16; i++) out[i] = 0;
        out[0] = out[5] = out[10] = out[15] = 1;
        return out;
    },
    multiply: (out: Mat4, a: Mat4, b: Mat4): Mat4 => {
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

        let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
        out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

        b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
        out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

        b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
        out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

        b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
        out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
        return out;
    },
    translate: (out: Mat4, a: Mat4, v: Vec3): Mat4 => {
        let x = v[0], y = v[1], z = v[2];
        let a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        let a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        let a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        let a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
        if (a === out) {
            out[12] = a00 * x + a10 * y + a20 * z + a30;
            out[13] = a01 * x + a11 * y + a21 * z + a31;
            out[14] = a02 * x + a12 * y + a22 * z + a32;
            out[15] = a03 * x + a13 * y + a23 * z + a33;
        } else {
            out[0] = a00; out[1] = a01; out[2] = a02; out[3] = a03;
            out[4] = a10; out[5] = a11; out[6] = a12; out[7] = a13;
            out[8] = a20; out[9] = a21; out[10] = a22; out[11] = a23;
            out[12] = a00 * x + a10 * y + a20 * z + a30;
            out[13] = a01 * x + a11 * y + a21 * z + a31;
            out[14] = a02 * x + a12 * y + a22 * z + a32;
            out[15] = a03 * x + a13 * y + a23 * z + a33;
        }
        return out;
    },
    perspective: (out: Mat4, fovy: number, aspect: number, near: number, far: number): Mat4 => {
        const f = 1.0 / Math.tan(fovy / 2);
        out[0] = f / aspect;
        out[1] = 0; out[2] = 0; out[3] = 0;
        out[4] = 0;
        out[5] = f;
        out[6] = 0; out[7] = 0;
        out[8] = 0; out[9] = 0;
        out[10] = (near + far) / (near - far);
        out[11] = -1;
        out[12] = 0; out[13] = 0;
        out[14] = (2 * far * near) / (near - far);
        out[15] = 0;
        return out;
    },
    lookAt: (out: Mat4, eye: Vec3, center: Vec3, up: Vec3): Mat4 => {
        let x0, x1, x2, y0, y1, y2, z0, z1, z2, len;
        let eyex = eye[0], eyey = eye[1], eyez = eye[2];
        let upx = up[0], upy = up[1], upz = up[2];
        let centerx = center[0], centery = center[1], centerz = center[2];

        if (eyex === centerx && eyey === centery && eyez === centerz) {
            return mat4_lib.identity(out);
        }

        z0 = eyex - centerx;
        z1 = eyey - centery;
        z2 = eyez - centerz;

        len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
        z0 *= len;
        z1 *= len;
        z2 *= len;

        x0 = upy * z2 - upz * z1;
        x1 = upz * z0 - upx * z2;
        x2 = upx * z1 - upy * z0;
        len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
        if (len === 0) {
            x0 = 0; x1 = 0; x2 = 0;
        } else {
            len = 1 / len;
            x0 *= len;
            x1 *= len;
            x2 *= len;
        }

        y0 = z1 * x2 - z2 * x1;
        y1 = z2 * x0 - z0 * x2;
        y2 = z0 * x1 - z1 * x0;
        len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
        if (len === 0) {
            y0 = 0; y1 = 0; y2 = 0;
        } else {
            len = 1 / len;
            y0 *= len;
            y1 *= len;
            y2 *= len;
        }

        out[0] = x0;
        out[1] = y0;
        out[2] = z0;
        out[3] = 0;
        out[4] = x1;
        out[5] = y1;
        out[6] = z1;
        out[7] = 0;
        out[8] = x2;
        out[9] = y2;
        out[10] = z2;
        out[11] = 0;
        out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
        out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
        out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
        out[15] = 1;

        return out;
    }
};

enum GameState {
    TITLE,
    PLAYING
}

// Inline interfaces for GameConfig and WebGL structures
interface GameConfig {
    gameSettings: {
        canvasWidth: number;
        canvasHeight: number;
        gravity: Vec3;
        groundY: number;
        ballRadius: number;
        ballMass: number;
        elasticity: number;
        frictionCoefficient: number;
        initialLaunchForce: number;
        cameraDistance: number;
        cameraSensitivity: number;
        titleScreenText: string;
        ballColor: [number, number, number, number];
        groundColor: [number, number, number, number];
        lightDirection: Vec3;
        ambientLightColor: Vec3;
        diffuseLightColor: Vec3;
        ballTextureName: string;
        groundTextureName: string;
    };
    assets: {
        images: { name: string; path: string; width: number; height: number; }[];
        sounds: { name: string; path: string; duration_seconds: number; volume: number; }[];
    };
}

interface WebGLProgramInfo {
    program: WebGLProgram;
    attribLocations: {
        vertexPosition: GLint;
        vertexNormal: GLint;
        textureCoord: GLint;
    };
    uniformLocations: {
        projectionMatrix: WebGLUniformLocation | null;
        modelViewMatrix: WebGLUniformLocation | null;
        normalMatrix: WebGLUniformLocation | null;
        objectColor: WebGLUniformLocation | null;
        lightDirection: WebGLUniformLocation | null;
        ambientLightColor: WebGLUniformLocation | null;
        diffuseLightColor: WebGLUniformLocation | null;
        uSampler: WebGLUniformLocation | null;
    };
}

interface Geometry {
    vertexBuffer: WebGLBuffer | null;
    normalBuffer: WebGLBuffer | null;
    textureBuffer: WebGLBuffer | null;
    indexBuffer: WebGLBuffer | null;
    vertexCount: number;
    indexCount: number;
}

interface GameObject {
    position: Vec3;
    velocity: Vec3;
    mass: number;
    radius: number;
    color: [number, number, number, number];
    geometry: Geometry;
    texture: WebGLTexture | null;
}

class Game {
    private gl: WebGLRenderingContext | null = null;
    private canvas: HTMLCanvasElement;
    private config!: GameConfig;
    private programInfo!: WebGLProgramInfo;

    private projectionMatrix: Mat4 = mat4_lib.create();
    private viewMatrix: Mat4 = mat4_lib.create();

    private ball!: GameObject;
    private ground!: GameObject;

    private cameraYaw: number = Math.PI / 4;
    private cameraPitch: number = -Math.PI / 6;
    private isDraggingCamera: boolean = false;
    private lastMouseX: number = 0;
    private lastMouseY: number = 0;

    private assets: {
        images: Map<string, HTMLImageElement>;
        sounds: Map<string, HTMLAudioElement>;
    } = { images: new Map(), sounds: new Map() };

    private textures: Map<string, WebGLTexture> = new Map();

    private audioContext: AudioContext | null = null;
    private gameStartedOnce: boolean = false;

    private lastTime: number = 0;
    private gameState: GameState = GameState.TITLE;

    private keysPressed: Set<string> = new Set();
    private titleScreenDiv: HTMLDivElement | null = null;

    constructor(canvasId: string) {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) {
            throw new Error(`Canvas element with ID '${canvasId}' not found.`);
        }
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl');
        if (!this.gl) {
            throw new Error("Unable to initialize WebGL. Your browser may not support it.");
        }

        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.canvas.addEventListener('mouseup', this.handleMouseUp);
        this.canvas.addEventListener('mousemove', this.handleMouseMove);

        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    async init() {
        await this.loadConfig();
        this.canvas.width = this.config.gameSettings.canvasWidth;
        this.canvas.height = this.config.gameSettings.canvasHeight;
        this.gl!.viewport(0, 0, this.gl!.canvas.width, this.gl!.canvas.height);

        await this.loadAssets();
        this.initWebGL();
        this.initGameObjects();
        this.initTitleScreen();

        requestAnimationFrame(this.gameLoop);
    }

    private async loadConfig() {
        const response = await fetch('data.json');
        this.config = await response.json() as GameConfig;
    }

    private async loadAssets() {
        const gl = this.gl!;

        const imagePromises = this.config.assets.images.map(imgData => {
            return new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    this.assets.images.set(imgData.name, img);
                    const texture = gl.createTexture();
                    gl.bindTexture(gl.TEXTURE_2D, texture);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

                    function isPowerOf2(value: number) {
                        return (value & (value - 1)) === 0;
                    }

                    if (isPowerOf2(img.width) && isPowerOf2(img.height)) {
                        gl.generateMipmap(gl.TEXTURE_2D);
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                    } else {
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                    }
                    this.textures.set(imgData.name, texture!);
                    resolve();
                };
                img.onerror = () => reject(`Failed to load image: ${imgData.path}`);
                img.src = imgData.path;
            });
        });

        const soundPromises = this.config.assets.sounds.map(soundData => {
            return new Promise<void>((resolve, reject) => {
                const audio = new Audio(soundData.path);
                audio.volume = soundData.volume;
                audio.oncanplaythrough = () => {
                    this.assets.sounds.set(soundData.name, audio);
                    resolve();
                };
                audio.onerror = () => reject(`Failed to load sound: ${soundData.path}`);
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
    }

    private playBGM() {
        const bgm = this.assets.sounds.get('bgm');
        if (bgm) {
            bgm.loop = true;
            bgm.play().catch(e => console.error("BGM playback failed (might require user interaction):", e));
        }
    }

    private playSFX(name: string) {
        const sfx = this.assets.sounds.get(name);
        if (sfx) {
            const clone = sfx.cloneNode(true) as HTMLAudioElement;
            clone.volume = sfx.volume;
            clone.play().catch(e => console.warn("SFX playback failed:", e));
        }
    }

    private initWebGL() {
        const gl = this.gl!;

        const vsSource = `
            attribute vec4 aVertexPosition;
            attribute vec3 aVertexNormal;
            attribute vec2 aTextureCoord;

            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;
            uniform mat4 uNormalMatrix;

            uniform vec3 uLightDirection;
            uniform vec3 uAmbientLightColor;
            uniform vec3 uDiffuseLightColor;

            varying lowp vec2 vTextureCoord;
            varying lowp vec3 vLighting;

            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
                vTextureCoord = aTextureCoord;

                vec3 transformedNormal = normalize(mat3(uNormalMatrix) * aVertexNormal);
                float diffuse = max(dot(transformedNormal, -uLightDirection), 0.0);
                vLighting = uAmbientLightColor + uDiffuseLightColor * diffuse;
            }
        `;

        const fsSource = `
            varying lowp vec2 vTextureCoord;
            varying lowp vec3 vLighting;

            uniform sampler2D uSampler;
            uniform lowp vec4 uObjectColor;

            void main() {
                lowp vec4 texelColor = texture2D(uSampler, vTextureCoord);
                gl_FragColor = texelColor * uObjectColor * vec4(vLighting, 1.0);
            }
        `;

        const shaderProgram = this.initShaderProgram(gl, vsSource, fsSource);
        this.programInfo = {
            program: shaderProgram,
            attribLocations: {
                vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
                vertexNormal: gl.getAttribLocation(shaderProgram, 'aVertexNormal'),
                textureCoord: gl.getAttribLocation(shaderProgram, 'aTextureCoord'),
            },
            uniformLocations: {
                projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
                modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
                normalMatrix: gl.getUniformLocation(shaderProgram, 'uNormalMatrix'),
                objectColor: gl.getUniformLocation(shaderProgram, 'uObjectColor'),
                lightDirection: gl.getUniformLocation(shaderProgram, 'uLightDirection'),
                ambientLightColor: gl.getUniformLocation(shaderProgram, 'uAmbientLightColor'),
                diffuseLightColor: gl.getUniformLocation(shaderProgram, 'uDiffuseLightColor'),
                uSampler: gl.getUniformLocation(shaderProgram, 'uSampler'),
            },
        };

        gl.clearColor(0.6, 0.8, 1.0, 1.0);
        gl.clearDepth(1.0);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
    }

    private initShaderProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string): WebGLProgram {
        const vertexShader = this.loadShader(gl, gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

        const shaderProgram = gl.createProgram()!;
        gl.attachShader(shaderProgram, vertexShader);
        gl.attachShader(shaderProgram, fragmentShader);
        gl.linkProgram(shaderProgram);

        if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
            alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
            gl.deleteProgram(shaderProgram);
            return null!;
        }
        return shaderProgram;
    }

    private loadShader(gl: WebGLRenderingContext, type: GLenum, source: string): WebGLShader {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null!;
        }
        return shader;
    }

    private generateSphere(radius: number, segments: number): Geometry {
        const positions: number[] = [];
        const normals: number[] = [];
        const texCoords: number[] = [];
        const indices: number[] = [];

        for (let latNumber = 0; latNumber <= segments; latNumber++) {
            const theta = latNumber * Math.PI / segments;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);

            for (let longNumber = 0; longNumber <= segments; longNumber++) {
                const phi = longNumber * 2 * Math.PI / segments;
                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);

                const x = cosPhi * sinTheta;
                const y = cosTheta;
                const z = sinPhi * sinTheta;

                positions.push(radius * x, radius * y, radius * z);
                normals.push(x, y, z);
                texCoords.push(1 - (longNumber / segments), 1 - (latNumber / segments));
            }
        }

        for (let latNumber = 0; latNumber < segments; latNumber++) {
            for (let longNumber = 0; longNumber < segments; longNumber++) {
                const first = (latNumber * (segments + 1)) + longNumber;
                const second = first + segments + 1;

                indices.push(first, second, first + 1);
                indices.push(second, second + 1, first + 1);
            }
        }

        const gl = this.gl!;
        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        const normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

        const textureBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);

        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

        return {
            vertexBuffer,
            normalBuffer,
            textureBuffer,
            indexBuffer,
            vertexCount: positions.length / 3,
            indexCount: indices.length,
        };
    }

    private generatePlane(size: number): Geometry {
        const positions = [
            -size / 2, 0.0, -size / 2,
            size / 2, 0.0, -size / 2,
            size / 2, 0.0, size / 2,
            -size / 2, 0.0, size / 2,
        ];
        const normals = [
            0.0, 1.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 1.0, 0.0,
        ];
        const texCoords = [
            0.0, 1.0,
            1.0, 1.0,
            1.0, 0.0,
            0.0, 0.0,
        ];
        const indices = [
            0, 1, 2,
            0, 2, 3,
        ];

        const gl = this.gl!;
        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        const normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

        const textureBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);

        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

        return {
            vertexBuffer,
            normalBuffer,
            textureBuffer,
            indexBuffer,
            vertexCount: positions.length / 3,
            indexCount: indices.length,
        };
    }

    private initGameObjects() {
        const { gameSettings } = this.config;

        this.ball = {
            position: vec3_lib.create(0, gameSettings.groundY + gameSettings.ballRadius + 5, 0),
            velocity: vec3_lib.create(0, 0, 0),
            mass: gameSettings.ballMass,
            radius: gameSettings.ballRadius,
            color: gameSettings.ballColor,
            geometry: this.generateSphere(gameSettings.ballRadius, 30),
            texture: this.textures.get(gameSettings.ballTextureName) || null,
        };

        this.ground = {
            position: vec3_lib.create(0, gameSettings.groundY, 0),
            velocity: vec3_lib.create(0, 0, 0),
            mass: Infinity,
            radius: 0,
            color: gameSettings.groundColor,
            geometry: this.generatePlane(50),
            texture: this.textures.get(gameSettings.groundTextureName) || null,
        };
    }

    private initTitleScreen() {
        this.titleScreenDiv = document.createElement('div');
        this.titleScreenDiv.style.position = 'absolute';
        this.titleScreenDiv.style.top = '50%';
        this.titleScreenDiv.style.left = '50%';
        this.titleScreenDiv.style.transform = 'translate(-50%, -50%)';
        this.titleScreenDiv.style.color = 'white';
        this.titleScreenDiv.style.fontSize = '2em';
        this.titleScreenDiv.style.fontFamily = 'sans-serif';
        this.titleScreenDiv.style.textAlign = 'center';
        this.titleScreenDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
        this.titleScreenDiv.style.padding = '20px';
        this.titleScreenDiv.style.borderRadius = '10px';
        this.titleScreenDiv.textContent = this.config.gameSettings.titleScreenText;
        document.body.appendChild(this.titleScreenDiv);
    }

    private gameLoop = (currentTime: DOMHighResTimeStamp) => {
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame(this.gameLoop);
    };

    private update(deltaTime: number) {
        if (this.gameState === GameState.TITLE) {
            if (this.keysPressed.has(' ')) {
                this.gameState = GameState.PLAYING;
                this.titleScreenDiv?.remove();
                this.titleScreenDiv = null;
                this.keysPressed.delete(' ');
                this.resetBall();
                if (!this.gameStartedOnce) {
                    this.playBGM(); 
                    this.gameStartedOnce = true;
                }
            }
            return;
        }

        this.ball.velocity = vec3_lib.add(this.ball.velocity, vec3_lib.mul(this.config.gameSettings.gravity, deltaTime));
        this.ball.position = vec3_lib.add(this.ball.position, vec3_lib.mul(this.ball.velocity, deltaTime));

        const groundLevel = this.config.gameSettings.groundY + this.ball.radius;
        if (this.ball.position[1] < groundLevel) {
            this.ball.position[1] = groundLevel;

            const normal = vec3_lib.create(0, 1, 0);
            const vRel = this.ball.velocity;

            const j = -(1 + this.config.gameSettings.elasticity) * vec3_lib.dot(vRel, normal);
            
            if (j > 0.001) {
                this.ball.velocity = vec3_lib.add(this.ball.velocity, vec3_lib.mul(normal, j));
                this.playSFX('bounce_sfx');
            }
            
            const horizontalVelocity = vec3_lib.create(this.ball.velocity[0], 0, this.ball.velocity[2]);
            const horizLen = vec3_lib.len(horizontalVelocity);

            if (horizLen > 0.001) {
                const frictionDirection = vec3_lib.normalize(vec3_lib.mul(horizontalVelocity, -1));
                const frictionForceMagnitude = this.config.gameSettings.frictionCoefficient * this.ball.mass * vec3_lib.len(vec3_lib.mul(this.config.gameSettings.gravity, -1));
                const frictionImpulse = vec3_lib.mul(frictionDirection, frictionForceMagnitude * deltaTime);
                
                if (vec3_lib.len(frictionImpulse) > horizLen) {
                    this.ball.velocity[0] = 0;
                    this.ball.velocity[2] = 0;
                } else {
                    this.ball.velocity[0] += frictionImpulse[0];
                    this.ball.velocity[2] += frictionImpulse[2];
                }
            } else {
                this.ball.velocity[0] = 0;
                this.ball.velocity[2] = 0;
            }
        }

        this.updateCamera();

        if (this.keysPressed.has('r')) {
            this.resetBall();
            this.keysPressed.delete('r');
        }
        if (this.keysPressed.has(' ')) {
            this.applyInitialForce();
            this.keysPressed.delete(' ');
        }
    }

    private updateCamera() {
        const { cameraDistance } = this.config.gameSettings;
        const target = vec3_lib.create(0, 0, 0);

        const camX = target[0] + cameraDistance * Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch);
        const camY = target[1] + cameraDistance * Math.sin(this.cameraPitch);
        const camZ = target[2] + cameraDistance * Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch);

        mat4_lib.lookAt(this.viewMatrix, vec3_lib.create(camX, camY, camZ), target, vec3_lib.create(0, 1, 0));
    }

    private resetBall() {
        const { groundY, ballRadius } = this.config.gameSettings;
        this.ball.position = vec3_lib.create(0, groundY + ballRadius + 5, 0);
        this.ball.velocity = vec3_lib.create(0, 0, 0);
    }

    private applyInitialForce() {
        const { initialLaunchForce } = this.config.gameSettings;
        const forceX = (Math.random() * 2 - 1) * initialLaunchForce;
        const forceZ = (Math.random() * 2 - 1) * initialLaunchForce;
        const forceY = initialLaunchForce * 0.5;

        this.ball.velocity = vec3_lib.add(this.ball.velocity, vec3_lib.create(forceX, forceY, forceZ));
        this.playSFX('bounce_sfx');
    }

    private draw() {
        const gl = this.gl!;
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(this.programInfo.program);

        const fieldOfView = 45 * Math.PI / 180;
        const aspect = gl.canvas.width / gl.canvas.height;
        const zNear = 0.1;
        const zFar = 100.0;
        mat4_lib.perspective(this.projectionMatrix, fieldOfView, aspect, zNear, zFar);
        gl.uniformMatrix4fv(this.programInfo.uniformLocations.projectionMatrix, false, this.projectionMatrix);
        gl.uniform3fv(this.programInfo.uniformLocations.lightDirection, vec3_lib.normalize(this.config.gameSettings.lightDirection));
        gl.uniform3fv(this.programInfo.uniformLocations.ambientLightColor, this.config.gameSettings.ambientLightColor);
        gl.uniform3fv(this.programInfo.uniformLocations.diffuseLightColor, this.config.gameSettings.diffuseLightColor);

        this.drawObject(this.ground, this.viewMatrix);
        this.drawObject(this.ball, this.viewMatrix);
    }

    private drawObject(obj: GameObject, viewMatrix: Mat4) {
        const gl = this.gl!;
        const programInfo = this.programInfo;

        const modelMatrix = mat4_lib.create();
        mat4_lib.identity(modelMatrix);
        mat4_lib.translate(modelMatrix, modelMatrix, obj.position);

        const modelViewMatrix = mat4_lib.create();
        mat4_lib.multiply(modelViewMatrix, viewMatrix, modelMatrix);
        gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);

        const normalMatrix = mat4_lib.create();
        mat4_lib.identity(normalMatrix); 
        gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

        gl.uniform4fv(programInfo.uniformLocations.objectColor, obj.color);

        gl.bindBuffer(gl.ARRAY_BUFFER, obj.geometry.vertexBuffer);
        gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

        gl.bindBuffer(gl.ARRAY_BUFFER, obj.geometry.normalBuffer);
        gl.vertexAttribPointer(programInfo.attribLocations.vertexNormal, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexNormal);

        gl.bindBuffer(gl.ARRAY_BUFFER, obj.geometry.textureBuffer);
        gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, obj.texture);
        gl.uniform1i(programInfo.uniformLocations.uSampler, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, obj.geometry.indexBuffer);
        gl.drawElements(gl.TRIANGLES, obj.geometry.indexCount, gl.UNSIGNED_SHORT, 0);
    }

    private handleKeyDown = (event: KeyboardEvent) => {
        this.keysPressed.add(event.key.toLowerCase());
    };

    private handleKeyUp = (event: KeyboardEvent) => {
        this.keysPressed.delete(event.key.toLowerCase());
    };

    private handleMouseDown = (event: MouseEvent) => {
        if (event.button === 0) {
            this.isDraggingCamera = true;
            this.lastMouseX = event.clientX;
            this.lastMouseY = event.clientY;
            this.canvas.requestPointerLock();
        }
    };

    private handleMouseUp = (event: MouseEvent) => {
        if (event.button === 0) {
            this.isDraggingCamera = false;
            document.exitPointerLock();
        }
    };

    private handleMouseMove = (event: MouseEvent) => {
        if (this.isDraggingCamera && this.gameState === GameState.PLAYING) {
            const dx = event.movementX || event.clientX - this.lastMouseX;
            const dy = event.movementY || event.clientY - this.lastMouseY;

            this.cameraYaw -= dx * this.config.gameSettings.cameraSensitivity * 0.01;
            this.cameraPitch -= dy * this.config.gameSettings.cameraSensitivity * 0.01;

            this.cameraPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.cameraPitch));

            this.lastMouseX = event.clientX;
            this.lastMouseY = event.clientY;
        }
    };
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        const game = new Game('gameCanvas');
        game.init();
    } catch (e) {
        console.error("Failed to initialize game:", e);
        const errorDiv = document.createElement('div');
        errorDiv.style.position = 'absolute';
        errorDiv.style.top = '50%';
        errorDiv.style.left = '50%';
        errorDiv.style.transform = 'translate(-50%, -50%)';
        errorDiv.style.color = 'red';
        errorDiv.style.fontSize = '1.5em';
        errorDiv.textContent = `Game failed to load: ${e instanceof Error ? e.message : String(e)}`;
        document.body.appendChild(errorDiv);
    }
});