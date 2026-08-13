import { MireiaVec3 } from '../math/MireiaVec3.js';

export class CameraController {
  #camera;
  #canvas;
  #isPanning;
  #isRotating;
  #lastX;
  #lastY;
  #panSpeed;
  #rotateSpeed;
  #zoomSpeed;
  #zoomCurveExponent;
  #orbitTarget;
  #orbitDistance;
  #panAnchorWorldPoint;
  #panAnchorCameraPos;
  #yaw;
  #pitch;
  #onMouseDownBound;
  #onMouseMoveBound;
  #onMouseUpBound;
  #onWheelBound;

  constructor(camera, canvas) {
    this.#camera = camera;
    this.#canvas = canvas;
    this.#isPanning = false;
    this.#isRotating = false;
    this.#lastX = 0;
    this.#lastY = 0;
    this.#panSpeed = 0.007;
    this.#rotateSpeed = 0.005;
    this.#zoomSpeed = 0.05;
    this.#zoomCurveExponent = 2;
    this.#orbitTarget = null;
    this.#orbitDistance = 8;
    this.#panAnchorWorldPoint = null;
    this.#panAnchorCameraPos = null;

    const dir = camera.getForward();
    this.#yaw = Math.atan2(dir.getX(), dir.getY());
    this.#pitch = Math.asin(Math.max(-1, Math.min(1, dir.getZ())));

    this.#attachEvents();
  }

  getCamera() { return this.#camera; }

  getPanSpeed() { return this.#panSpeed; }
  setPanSpeed(speed) { this.#panSpeed = speed; }

  getRotateSpeed() { return this.#rotateSpeed; }
  setRotateSpeed(speed) { this.#rotateSpeed = speed; }

  getZoomSpeed() { return this.#zoomSpeed; }
  setZoomSpeed(speed) { this.#zoomSpeed = speed; }

  getOrbitDistance() { return this.#orbitDistance; }
  setOrbitDistance(distance) { this.#orbitDistance = distance; }

  #attachEvents() {
    this.#onMouseDownBound = (e) => this.#onMouseDown(e);
    this.#onMouseMoveBound = (e) => this.#onMouseMove(e);
    this.#onMouseUpBound = () => this.#onMouseUp();
    this.#onWheelBound = (e) => this.#onWheel(e);

    this.#canvas.addEventListener('mousedown', this.#onMouseDownBound);
    window.addEventListener('mousemove', this.#onMouseMoveBound);
    window.addEventListener('mouseup', this.#onMouseUpBound);
    this.#canvas.addEventListener('wheel', this.#onWheelBound, { passive: false });
  }

  destroy() {
    this.#canvas.removeEventListener('mousedown', this.#onMouseDownBound);
    window.removeEventListener('mousemove', this.#onMouseMoveBound);
    window.removeEventListener('mouseup', this.#onMouseUpBound);
    this.#canvas.removeEventListener('wheel', this.#onWheelBound);
  }

  #onMouseDown(e) {
    this.#lastX = e.clientX;
    this.#lastY = e.clientY;
    if (e.ctrlKey || e.button === 1) {
      this.#isRotating = true;
      this.#beginOrbit();
    } else {
      this.#isPanning = true;
      this.#beginPan(e.clientX, e.clientY);
    }
  }

  // Figures out the point the camera is currently looking at (on the ground
  // plane, y=0, if it's looking downward) so rotation can pivot around it.
  #beginOrbit() {
    const camera = this.#camera;
    const forward = camera.getForward();
    const pos = camera.getPosition();

    let distance = this.#orbitDistance;
    const epsilon = 0.0001;
    if (forward.getZ() < -epsilon) {
      const t = -pos.getZ() / forward.getZ();
      if (t > 0.5 && t < 500) {
        distance = t;
      }
    }

    this.#orbitDistance = distance;
    this.#orbitTarget = new MireiaVec3(
      pos.getX() + forward.getX() * distance,
      pos.getY() + forward.getY() * distance,
      pos.getZ() + forward.getZ() * distance
    );
  }

  #onMouseMove(e) {
    if (!this.#isPanning && !this.#isRotating) return;
 
    const dx = e.clientX - this.#lastX;
    const dy = e.clientY - this.#lastY;
    this.#lastX = e.clientX;
    this.#lastY = e.clientY;
 
    if (this.#isRotating) {
      this.#rotate(dx, dy);
    } else {
      this.#pan(dx, dy, e.clientX, e.clientY);
    }
  }

  #onMouseUp() {
    this.#isPanning = false;
    this.#isRotating = false;
    this.#orbitTarget = null;
    this.#panAnchorWorldPoint = null;
    this.#panAnchorCameraPos = null;
  }

  // Changes yaw/pitch AND swings the position around #orbitTarget,
  // so the point you started dragging on stays anchored on screen.
  #rotate(dx, dy) {
    this.#yaw += dx * this.#rotateSpeed;
    const limit = Math.PI / 2 - 0.01;
    this.#pitch = Math.max(-limit, Math.min(limit, this.#pitch - dy * this.#rotateSpeed));

    const cosPitch = Math.cos(this.#pitch);
    const newDir = new MireiaVec3(
      Math.sin(this.#yaw) * cosPitch,
      Math.cos(this.#yaw) * cosPitch,
      Math.sin(this.#pitch)
    );
    this.#camera.setCamDir(newDir);

    if (this.#orbitTarget) {
      const forward = this.#camera.getForward();
      const target = this.#orbitTarget;
      const distance = this.#orbitDistance;

      this.#camera.setPosition(new MireiaVec3(
        target.getX() - forward.getX() * distance,
        target.getY() - forward.getY() * distance,
        target.getZ() - forward.getZ() * distance
      ));
    }
}

  #beginPan(screenX, screenY) {
    const pos = this.#camera.getPosition();
    this.#panAnchorCameraPos = new MireiaVec3(pos.getX(), pos.getY(), pos.getZ());
    this.#panAnchorWorldPoint = this.#screenToGroundPlane(screenX, screenY, this.#panAnchorCameraPos);
  }

  #screenToGroundPlane(clientX, clientY, originPos, planeZ = 0) {
    const canvas = this.#canvas;
    const camera = this.#camera;
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
 
    const ndcX = (px / canvas.width) * 2 - 1;
    const ndcY = 1 - (py / canvas.height) * 2;
 
    const fov = Math.PI / 3;
    const aspect = canvas.width / canvas.height;
    const tanHalfFov = Math.tan(fov / 2);
 
    const forward = camera.getForward();
    const right = camera.getRight();
    const up = camera.getUp();
 
    const dirX = forward.getX() + right.getX() * ndcX * tanHalfFov * aspect + up.getX() * ndcY * tanHalfFov;
    const dirY = forward.getY() + right.getY() * ndcX * tanHalfFov * aspect + up.getY() * ndcY * tanHalfFov;
    const dirZ = forward.getZ() + right.getZ() * ndcX * tanHalfFov * aspect + up.getZ() * ndcY * tanHalfFov;
 
    if (Math.abs(dirZ) < 1e-6) return null; // ray parallel to the ground plane
    const t = (planeZ - originPos.getZ()) / dirZ;
    if (t <= 0) return null; // plane is behind the camera
 
    return new MireiaVec3(
      originPos.getX() + dirX * t,
      originPos.getY() + dirY * t,
      originPos.getZ() + dirZ * t
    );
  }

  #pan(dx, dy, screenX, screenY) {
    if (this.#panAnchorWorldPoint && this.#panAnchorCameraPos) {
      const currentGroundPoint = this.#screenToGroundPlane(screenX, screenY, this.#panAnchorCameraPos);
      if (currentGroundPoint) {
        const anchor = this.#panAnchorWorldPoint;
        const basePos = this.#panAnchorCameraPos;
        this.#camera.setPosition(new MireiaVec3(
          basePos.getX() + (anchor.getX() - currentGroundPoint.getX()),
          basePos.getY() + (anchor.getY() - currentGroundPoint.getY()),
          basePos.getZ() // altitude stays fixed during a pan
        ));
        return;
      }
    }
 
    // fallback: old heuristic, only used when ground-plane raycast fails
    const right = this.#camera.getRight();
    const up = this.#camera.getUp();
    const pos = this.#camera.getPosition();
 
    const referenceDistance = Math.max(0.5, this.#orbitDistance);
    const moveRight = -dx * this.#panSpeed * referenceDistance;
    const moveUp = dy * this.#panSpeed * referenceDistance;
 
    pos.setX(pos.getX() + right.getX() * moveRight + up.getX() * moveUp);
    pos.setY(pos.getY() + right.getY() * moveRight + up.getY() * moveUp);
    pos.setZ(pos.getZ() + right.getZ() * moveRight + up.getZ() * moveUp);
  }

//   #onWheel(e) {
//     e.preventDefault();

//     const forward = this.#camera.getForward();
//     const pos = this.#camera.getPosition();

//     const referenceDistance = Math.max(0.1, this.#orbitDistance);
//     const amount = -e.deltaY * this.#zoomSpeed * referenceDistance * 0.2;

//     pos.setX(pos.getX() + forward.getX() * amount);
//     pos.setY(pos.getY() + forward.getY() * amount);
//     pos.setZ(pos.getZ() + forward.getZ() * amount);

//     this.#orbitDistance = Math.max(0.5, this.#orbitDistance - amount);
// }
  #onWheel(e) {
      e.preventDefault();

      const forward = this.#camera.getForward();
      const pos = this.#camera.getPosition();

      const zoomAmount = -e.deltaY * this.#zoomSpeed;

      pos.setX(pos.getX() + forward.getX() * zoomAmount);
      pos.setY(pos.getY() + forward.getY() * zoomAmount);
      pos.setZ(pos.getZ() + forward.getZ() * zoomAmount);

      this.#orbitDistance = Math.max(
          0.5,
          this.#orbitDistance - zoomAmount
      );
  }
}