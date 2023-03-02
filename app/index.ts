// import MotionDetect from './components/MotionDetect' 
// import 'styles/style.scss' 
class GridDetect{
    size: any;
    imageSize: any;
    workingSize: any;
    cellSize: { x: number; y: number; };
    pixelDiffThreshold: any;
    movementThreshold: any;
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

        // this.frameDiff = Util.time(this.frameDiff, this);
    }

    detect(frames) {
        // diff frames
        const diff = this.frameDiff(frames.prev, frames.curr);

        // if no valid diff
        if (!diff) {return; };

        // total pixels in frame
        const totalPix = diff.imageData.data.length / 4;

        // if not enough movement
        if (diff.count / totalPix < this.movementThreshold) {
            return false;
        }

        // else return movement in grid
        return this.detectGrid(diff.imageData);
    }

    // given pixels of diff, bucket num of pixels diff into cells in grid
    detectGrid(imageData) {

        const pixels = imageData.data;
        const results = new Int32Array(this.size.x * this.size.y);

        // for each pixel, determine which quadrant it belongs to
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

    // bitwise absolute and threshold
    // from https://www.adobe.com/devnet/archive/html5/articles/javascript-motion-detection.html
    makeThresh(min) {
        return function(value) {
            return (value ^ (value >> 31)) - (value >> 31) > min ? 255 : 0;
        };
    }

    // diff two frames, return pixel diff data, boudning box of movement and count
    frameDiff(prev, curr) {
        if (prev == null || curr == null) { return false;};

        let avgP, avgC, diff, j, i;
        const p = prev.data;
        const c = curr.data;
        const thresh = this.makeThresh(this.pixelDiffThreshold);

        // thresholding function
        const pixels = new Uint8ClampedArray(p.length);

        let count = 0;

        // for each pixel, find if average excees thresh
        i = 0;
        while (i < p.length / 4) {
            j = i * 4;

            avgC = 0.2126 * c[j] + 0.7152 * c[j + 1] + 0.0722 * c[j + 2];
            avgP = 0.2126 * p[j] + 0.7152 * p[j + 1] + 0.0722 * p[j + 2];

            diff = thresh(avgC - avgP);

            pixels[j + 3] = diff;

            // if there is a difference, update bounds
            if (diff) {
                pixels[j] = diff;

                // count pix movement
                count++;
            }

            i++;
        }

        return {
            count: count,
            imageData: new ImageData(pixels, this.workingSize.x), };
    }
}


class Util{
    // returns function that times it's execution
    static time(f, scope) {
        let start, end;

        return function() {
            start = new Date();
            const res = f.apply(this, arguments);
            end = new Date();
            console.log('time', end - start);

            return res;
        }.bind(scope);

    }
}


class MotionDetect {
    MAX_PIX_VAL: number;
    defaults: { fps: number; gridSize: { x: number; y: number; }; pixelDiffThreshold: number; movementThreshold: number; debug: boolean; canvasOutputElem: HTMLCanvasElement; };
    video: HTMLVideoElement;
    fps: any;
    canvas: any;
    ctx: any;
    shadow: CanvasRenderingContext2D;
    scratch: CanvasRenderingContext2D;
    size: { x: number; y: number; };
    workingSize: { x: number; y: number; };
    gdSize: any;
    frames: { prev: any; curr: any; };
    pixelDiffThreshold: number;
    movementThreshold: any;
    pause: boolean;
    onDetectCallback: any;

    constructor(srcId, options) {
        // constants
        this.MAX_PIX_VAL = 255;

        // defaults for options
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
        }

        // setup video
        this.video = document.getElementById(srcId) as HTMLVideoElement;
        this.fps = options.fps || this.defaults.fps;

        // setup canvas
        this.canvas = options.canvasOutputElem || this.defaults.canvasOutputElem;
        this.ctx = this.canvas.getContext('2d');

        // shadow canvas to draw video frames before processing
        const shadowCanvas = document.createElement('canvas');
        this.shadow = shadowCanvas.getContext('2d') as CanvasRenderingContext2D;

        // document.body.appendChild(this.shadow.canvas);

        // scratchpad
        const scratchpad = document.createElement('canvas');
        this.scratch = scratchpad.getContext('2d') as CanvasRenderingContext2D;

        // document.body.appendChild(this.scratch.canvas);

        // scale canvas
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.ctx.scale(-1, 1);

        // actual canvas size
        this.size = {
            x: window.innerWidth,
            y: window.innerHeight,
        };

        // size to work with image on (scale down to reduce work)
        this.workingSize = {
            x: 300,
            y: 300,
        };

        // griddetector size
        this.gdSize = options.gridSize || this.defaults.gridSize;

        // size canvas
        this.resize(this.size.x, this.size.y);

        // start yo engines
        this.init();

        this.frames = {
            prev: null,
            curr: null,
        };

        // set difference threshold
        this.pixelDiffThreshold = 255 * (options.pixelDiffThreshold || this.defaults.pixelDiffThreshold);

        // how much of ratio of movement to be not negligible
        this.movementThreshold = options.movementThreshold || this.movementThreshold;

        this.spawnGridDetector = Util.time(this.spawnGridDetector, this);
        if (options.debug) this.debug();
        this.pause = false;
    }

    async init() {

        // success callback
        const onGetUserMediaSuccess = (stream: MediaStream) => {
            this.video.srcObject = stream;
            this.video.addEventListener('play', () => {
                // start tick
                this.tick();

                // resize canvas to video ratio
                const videoBounds = this.video.getBoundingClientRect();
                const heightToWidthRatio = videoBounds.height / videoBounds.width;
                this.resize(this.size.x, this.size.x * heightToWidthRatio);
            }, false);

        };

        // error callback
        const onGetUserMediaError = (e) => { console.error(e); };

        // configure getusermedia
        // navigator.mediaDevices.getUserMedia = navigator.mediaDevices.getUserMedia
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

        // do it!
       const stream = await navigator.mediaDevices.getUserMedia(options);
       onGetUserMediaSuccess(stream)
    }

    resize(x, y) {
        this.size = {
            x: Math.floor(x),
            y: Math.floor(y),
        };

        // scale working size
        const shadowY = Math.floor(this.size.y / this.size.x * this.workingSize.x);
        this.workingSize = {
            x: this.workingSize.x,
            y: shadowY,
        };

        // resize canvases
        this.canvas.width = this.size.x;
        this.canvas.height = this.size.y;
        this.shadow.canvas.width = this.workingSize.x;
        this.shadow.canvas.height = this.workingSize.y;
        this.scratch.canvas.width = this.size.x;
        this.scratch.canvas.height = this.size.y;
    }

    // main loop
    tick() {
        if (!this.pause) {
            this.update();
            this.detect();
        }

        setTimeout(() => {
            requestAnimationFrame(this.tick.bind(this));
        }, 1000 / this.fps);
    }

    // update and save frame data
    update() {
        // draw frame on shadow and canvas
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

        // update data
        this.frames.prev = this.frames.curr;
        this.frames.curr = this.shadow.getImageData(0, 0, sw, sh);
    }

    // do detection
    detect() {
        this.spawnGridDetector();
    }

    // set callback
    onDetect(fn) {
        this.onDetectCallback = fn;
    }

    // spawn worker thread to do detection
    spawnGridDetector() {
        // do nothing if no prev frame
        if (!this.frames.prev) { return; }

        //     // frames to diff
        const d = {
            frames: this.frames,

            // thresholds
            pixelDiffThreshold: this.pixelDiffThreshold,
            movementThreshold: this.movementThreshold,

            // grid size x cells by y cells
            gdSize: this.gdSize,

            // sizes for math
            imageSize: this.size,
            workingSize: this.workingSize,
        }

        const gd = new GridDetect({
            gridSize: d.gdSize,
            imageSize: d.imageSize,
            workingSize: d.workingSize,
            pixelDiffThreshold: d.pixelDiffThreshold,
            movementThreshold: d.movementThreshold,
        });

        // get result
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

        // const worker = new GridDetectWorker();

        // create worker thread
        // worker.postMessage({
        //     // frames to diff
        //     frames: this.frames,

        //     // thresholds
        //     pixelDiffThreshold: this.pixelDiffThreshold,
        //     movementThreshold: this.movementThreshold,

        //     // grid size x cells by y cells
        //     gdSize: this.gdSize,

        //     // sizes for math
        //     imageSize: this.size,
        //     workingSize: this.workingSize,
        // });

        // worker.onmessage = (e) => {
        //     // if has data to return, fire callback
        //     if (e.data) {
        //         this.onDetectCallback(this.ctx, e.data);
        //     }
        // };
    }

    // activate pausing mechanism
    debug() {
        document.addEventListener('keydown', () => {
            console.log('paused');
            this.pause = !this.pause;
        }, false);
    }

}





const options = {
    gridSize: {
        x: 16*2,
        y: 12*2,
    },
    debug: true,
    pixelDiffThreshold: 0.3,
    movementThreshold: 0.0012,
    fps: 30,
    canvasOutputElem: document.getElementById('dest')
}

var overlay = document.getElementById('overlay') as HTMLCanvasElement;
const ctx = overlay.getContext('2d') as CanvasRenderingContext2D;
let timeoutClear;

const md = new MotionDetect('src', options);

// on motion detected, draw grid
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

    // scale up cell size
    const cellArea = cs.x * cs.y;
    cs.x *= csActualRatio;
    cs.y *= csActualRatio;

    ctx.strokeStyle = 'rgba(0, 80, 200, 0.2)';

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    grid.forEach((cell, i) => {
        const x = i % gs.x;
        const y = Math.floor(i / gs.x);
        let intensity = cell / cellArea;
        // higher opacity for cells with more movement
        ctx.fillStyle = intensity > options.movementThreshold ? `rgba(0, 80, 200, ${0.1 + intensity})` : 'transparent';

        ctx.beginPath();
        ctx.rect(x * cs.x, y * cs.y, cs.x, cs.y);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
    });

    ctx.restore();

    timeoutClear = setTimeout(()=>{
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }, 1000);
    
})