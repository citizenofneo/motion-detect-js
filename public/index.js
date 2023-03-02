var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class GridDetect {
    constructor(options) {
        this.size = options.gridSize;
        this.imageSize = options.imageSize;
        this.workingSize = options.workingSize;
        this.cellSize = {
            x: (this.workingSize.x / this.size.x),
            y: (this.workingSize.y / this.size.y),
        };
        this.pixelDiffThreshold = options.pixelDiffThreshold;
        this.movementThreshold = options.movementThreshold;
    }
    detect(frames) {
        const diff = this.frameDiff(frames.prev, frames.curr);
        if (!diff) {
            return;
        }
        ;
        const totalPix = diff.imageData.data.length / 4;
        if (diff.count / totalPix < this.movementThreshold) {
            return false;
        }
        return this.detectGrid(diff.imageData);
    }
    detectGrid(imageData) {
        const pixels = imageData.data;
        const results = new Int32Array(this.size.x * this.size.y);
        let i = 0;
        let j, px, py, gx, gy, exists;
        while (i < pixels.length / 4) {
            px = i % this.workingSize.x;
            py = Math.floor(i / this.workingSize.x);
            gy = Math.floor(px / this.cellSize.x);
            gx = Math.floor(py / this.cellSize.y);
            if (pixels[i * 4] == 255) {
                let ri = gx * this.size.x + gy;
                results[ri] += 1;
            }
            i++;
        }
        return results;
    }
    makeThresh(min) {
        return function (value) {
            return (value ^ (value >> 31)) - (value >> 31) > min ? 255 : 0;
        };
    }
    frameDiff(prev, curr) {
        if (prev == null || curr == null) {
            return false;
        }
        ;
        let avgP, avgC, diff, j, i;
        const p = prev.data;
        const c = curr.data;
        const thresh = this.makeThresh(this.pixelDiffThreshold);
        const pixels = new Uint8ClampedArray(p.length);
        let count = 0;
        i = 0;
        while (i < p.length / 4) {
            j = i * 4;
            avgC = 0.2126 * c[j] + 0.7152 * c[j + 1] + 0.0722 * c[j + 2];
            avgP = 0.2126 * p[j] + 0.7152 * p[j + 1] + 0.0722 * p[j + 2];
            diff = thresh(avgC - avgP);
            pixels[j + 3] = diff;
            if (diff) {
                pixels[j] = diff;
                count++;
            }
            i++;
        }
        return {
            count: count,
            imageData: new ImageData(pixels, this.workingSize.x),
        };
    }
}
class Util {
    static time(f, scope) {
        let start, end;
        return function () {
            start = new Date();
            const res = f.apply(this, arguments);
            end = new Date();
            console.log('time', end - start);
            return res;
        }.bind(scope);
    }
}
class MotionDetect {
    constructor(srcId, options) {
        this.MAX_PIX_VAL = 255;
        this.defaults = {
            fps: 30,
            gridSize: {
                x: 6,
                y: 4
            },
            pixelDiffThreshold: 0.4,
            movementThreshold: 0.001,
            debug: false,
            canvasOutputElem: document.createElement('canvas')
        };
        this.video = document.getElementById(srcId);
        this.fps = options.fps || this.defaults.fps;
        this.canvas = options.canvasOutputElem || this.defaults.canvasOutputElem;
        this.ctx = this.canvas.getContext('2d');
        const shadowCanvas = document.createElement('canvas');
        this.shadow = shadowCanvas.getContext('2d');
        const scratchpad = document.createElement('canvas');
        this.scratch = scratchpad.getContext('2d');
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.ctx.scale(-1, 1);
        this.size = {
            x: window.innerWidth,
            y: window.innerHeight,
        };
        this.workingSize = {
            x: 300,
            y: 300,
        };
        this.gdSize = options.gridSize || this.defaults.gridSize;
        this.resize(this.size.x, this.size.y);
        this.init();
        this.frames = {
            prev: null,
            curr: null,
        };
        this.pixelDiffThreshold = 255 * (options.pixelDiffThreshold || this.defaults.pixelDiffThreshold);
        this.movementThreshold = options.movementThreshold || this.movementThreshold;
        this.spawnGridDetector = Util.time(this.spawnGridDetector, this);
        if (options.debug)
            this.debug();
        this.pause = false;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            const onGetUserMediaSuccess = (stream) => {
                this.video.srcObject = stream;
                this.video.addEventListener('play', () => {
                    this.tick();
                    const videoBounds = this.video.getBoundingClientRect();
                    const heightToWidthRatio = videoBounds.height / videoBounds.width;
                    this.resize(this.size.x, this.size.x * heightToWidthRatio);
                }, false);
            };
            const onGetUserMediaError = (e) => { console.error(e); };
            const options = {
                video: {
                    width: {
                        min: 1024,
                        deal: 1280,
                        max: 1920,
                    },
                    height: {
                        min: 600,
                        ideal: 720,
                        max: 1080,
                    },
                },
            };
            const stream = yield navigator.mediaDevices.getUserMedia(options);
            onGetUserMediaSuccess(stream);
        });
    }
    resize(x, y) {
        this.size = {
            x: Math.floor(x),
            y: Math.floor(y),
        };
        const shadowY = Math.floor(this.size.y / this.size.x * this.workingSize.x);
        this.workingSize = {
            x: this.workingSize.x,
            y: shadowY,
        };
        this.canvas.width = this.size.x;
        this.canvas.height = this.size.y;
        this.shadow.canvas.width = this.workingSize.x;
        this.shadow.canvas.height = this.workingSize.y;
        this.scratch.canvas.width = this.size.x;
        this.scratch.canvas.height = this.size.y;
    }
    tick() {
        if (!this.pause) {
            this.update();
            this.detect();
        }
        setTimeout(() => {
            requestAnimationFrame(this.tick.bind(this));
        }, 1000 / this.fps);
    }
    update() {
        const sw = this.workingSize.x;
        const sh = this.workingSize.y;
        this.shadow.save();
        this.shadow.scale(-1, 1);
        this.shadow.drawImage(this.video, 0, 0, -sw, sh);
        this.shadow.restore();
        this.ctx.save();
        this.ctx.scale(-1, 1);
        this.ctx.drawImage(this.video, 0, 0, -this.size.x, this.size.y);
        this.ctx.restore();
        this.frames.prev = this.frames.curr;
        this.frames.curr = this.shadow.getImageData(0, 0, sw, sh);
    }
    detect() {
        this.spawnGridDetector();
    }
    onDetect(fn) {
        this.onDetectCallback = fn;
    }
    spawnGridDetector() {
        if (!this.frames.prev) {
            return;
        }
        const d = {
            frames: this.frames,
            pixelDiffThreshold: this.pixelDiffThreshold,
            movementThreshold: this.movementThreshold,
            gdSize: this.gdSize,
            imageSize: this.size,
            workingSize: this.workingSize,
        };
        const gd = new GridDetect({
            gridSize: d.gdSize,
            imageSize: d.imageSize,
            workingSize: d.workingSize,
            pixelDiffThreshold: d.pixelDiffThreshold,
            movementThreshold: d.movementThreshold,
        });
        const detected = gd.detect(d.frames);
        let msg = detected ? {
            motions: detected,
            gd: {
                size: gd.size,
                cellSize: gd.cellSize,
                actualCellSizeRatio: gd.imageSize.x / gd.workingSize.x,
            },
        } : false;
        msg && this.onDetectCallback(this.ctx, msg);
    }
    debug() {
        document.addEventListener('keydown', () => {
            console.log('paused');
            this.pause = !this.pause;
        }, false);
    }
}
const options = {
    gridSize: {
        x: 16 * 2,
        y: 12 * 2,
    },
    debug: true,
    pixelDiffThreshold: 0.3,
    movementThreshold: 0.0012,
    fps: 30,
    canvasOutputElem: document.getElementById('dest')
};
var overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
let timeoutClear;
const md = new MotionDetect('src', options);
md.onDetect((other, data) => {
    clearTimeout(timeoutClear);
    const canvas = ctx.canvas;
    canvas.width = other.canvas.width;
    canvas.height = other.canvas.height;
    ctx.save();
    const grid = data.motions;
    const gs = data.gd.size;
    const cs = data.gd.cellSize;
    const csActualRatio = data.gd.actualCellSizeRatio;
    const cellArea = cs.x * cs.y;
    cs.x *= csActualRatio;
    cs.y *= csActualRatio;
    ctx.strokeStyle = 'rgba(0, 80, 200, 0.2)';
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    grid.forEach((cell, i) => {
        const x = i % gs.x;
        const y = Math.floor(i / gs.x);
        let intensity = cell / cellArea;
        ctx.fillStyle = intensity > options.movementThreshold ? `rgba(0, 80, 200, ${0.1 + intensity})` : 'transparent';
        ctx.beginPath();
        ctx.rect(x * cs.x, y * cs.y, cs.x, cs.y);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
    });
    ctx.restore();
    timeoutClear = setTimeout(() => {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }, 1000);
});
//# sourceMappingURL=index.js.map