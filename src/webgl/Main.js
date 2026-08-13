import { Renderer } from './core/Renderer.js';
import { MireiaVec3 } from './math/MireiaVec3.js';
import { Camera } from './camera/Camera.js';
import { CameraController } from './camera/CameraController.js';
import { MireiaFBO } from './core/MireiaFBO.js';
import { ScreenRenderer } from './core/ScreenRenderer.js';
import { MireiaMat4 } from './math/MireiaMat4.js';
import { ScreenSpace } from './core/ScreenSpace.js';

const fov = Math.PI / 3;

function createProjectionMatrix(aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);

  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);
}

export class Main {
  #gl;
  #renderer;
  #scenes;
  #camera;
  #cameraController;
  #updateCallbacks;
  #fbo;
  #screenRenderer;
  #lastWidth;
  #lastHeight;
  #lastViewProjection;
  #lastView;
  #lastProjection;
  #displayMode;
  #overlayScenes;

  constructor(canvas) {
    this.#gl = canvas.getContext('webgl2');
    this.#scenes = [];
    this.#overlayScenes = [];
    const initialPitch = -0.3;
    this.#camera = new Camera(
      new MireiaVec3(0, -8, 3),
      new MireiaVec3(0, Math.cos(initialPitch), Math.sin(initialPitch)),
      new MireiaVec3(0, 0, 1),
      1,
      1000
    );
    this.#renderer = new Renderer(this.#gl, this.#camera.getNear(), this.#camera.getFar());
    this.#cameraController = new CameraController(this.#camera, canvas);
    this.#updateCallbacks = [];

    this.#lastWidth = canvas.width;
    this.#lastHeight = canvas.height;
    this.#fbo = new MireiaFBO(this.#gl, canvas.width, canvas.height);
    this.#screenRenderer = new ScreenRenderer(this.#gl);
    this.#lastViewProjection = null;
    this.#lastProjection = null;
    this.#lastView = null;
    this.#displayMode = 'color';
  }

  getGl() { return this.#gl; }
  getRenderer() { return this.#renderer; }
  getScenes() { return this.#scenes; }
  getCamera() { return this.#camera; }
  getCameraController() { return this.#cameraController; }
  getFbo() { return this.#fbo; }

  getDisplayMode() { return this.#displayMode; }
  setDisplayMode(mode) { this.#displayMode = mode; }

  addScene(scene) {
    if (this.#scenes === undefined) {
      this.#scenes = [];
    }
    this.#scenes.push(scene);
    this.#updateCallbacks.push(() => scene.updatePreComputedMat());
  }

  addOverlayScene(scene) {
    if (this.#overlayScenes === undefined) {
      this.#overlayScenes = [];
    }
    this.#overlayScenes.push(scene);
    this.#updateCallbacks.push(() => scene.updatePreComputedMat());
  }

  removeScene(scene) {
    this.#scenes = this.#scenes.filter(s => s !== scene);
    this.#overlayScenes = this.#overlayScenes.filter(s => s !== scene);
  }

  addUpdateCallback(callback) {
    this.#updateCallbacks.push(callback);
  }

  // Converts a clicked screen pixel + its stored depth into a real 3D world position.
  getWorldPositionAt(screenX, screenY) {
    const gl = this.#gl;
    //if (!this.#lastViewProjection) return null;
    //if (!this.#lastProjection || !this.#lastView) return null;
    if (!this.#lastView) return null;

    const normalizedDepth = this.#fbo.readDepthAt(screenX, screenY);
    
    return ScreenSpace.screenToWorld(
      screenX,
      screenY,
      normalizedDepth,
      gl.canvas.width,
      gl.canvas.height,
      this.#camera.getNear(),
      this.#camera.getFar(),
      //this.#lastViewProjection
      //this.#lastProjection, 
      fov,
      this.#lastView,
      this.#camera,
    );
  }

  selectAt(screenX, screenY) {
    const bytes = this.#fbo.readSelectionColorAt(screenX, screenY);
    const object = this.#renderer.pickObjectAt(bytes);
    //console.log('picked bytes:', bytes, 'object:', object);
    this.#renderer.setSelected(object);
    return object;
  }

  // Picks which FBO texture of DISPLAY_MODE
  #getDisplayTexture() {
    switch (this.#displayMode) {
      case 'depth': return this.#fbo.getDepthColorBuffer();
      case 'normal': return this.#fbo.getNormalBuffer();
      case 'selection': return this.#fbo.getSelectionColorBuffer();
      case 'color':
      default: return this.#fbo.getColorBuffer();
    }
  }

  start() {
    const gl = this.#gl;
    let running = true;
    const startTime = performance.now();

    const loop = () => {
      if (!running) return;

      const elapsed = (performance.now() - startTime) / 1000;
      for (const callback of this.#updateCallbacks) {
        callback(elapsed);
      }

      if (gl.canvas.width !== this.#lastWidth || gl.canvas.height !== this.#lastHeight) {
        this.#lastWidth = gl.canvas.width;
        this.#lastHeight = gl.canvas.height;
        this.#fbo.setSize(this.#lastWidth, this.#lastHeight);
      }

      const aspect = gl.canvas.width / gl.canvas.height;
      const projection = createProjectionMatrix(aspect, this.#camera.getNear(), this.#camera.getFar());
      const view = this.#camera.getViewMatrix();
      this.#lastProjection = projection; 
      this.#lastView = view;
      const viewProjection = MireiaMat4.multiplyArrays(projection, view);
      this.#lastViewProjection = viewProjection;

      // PASS 1: render the scene into the FBO
      this.#fbo.bind();
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS); // added
      gl.clearColor(1, 1, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      for (const scene of this.#scenes) {
        this.#renderer.render(scene, viewProjection, this.#camera.getNear(), this.#camera.getFar(), this.#camera.getViewMatrix());
      }

      if (this.#overlayScenes.length > 0) {
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        for (const overlayScene of this.#overlayScenes) {
          this.#renderer.render(overlayScene, viewProjection, this.#camera.getNear(), this.#camera.getFar(), this.#camera.getViewMatrix());
        }
        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
      }

      this.#fbo.unbind();

      // PASS 2: draw the FBO's texture to the screen, using its own dedicated shader
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      gl.disable(gl.DEPTH_TEST);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      this.#screenRenderer.render(this.#getDisplayTexture(),this.#fbo.getNormalBuffer(),this.#fbo.getDepthColorBuffer(),gl.canvas.width, gl.canvas.height);

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    return () => {
      running = false;
      this.#cameraController.destroy();
    };
  }
}