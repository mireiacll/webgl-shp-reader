import { MireiaVec3 } from "../math/MireiaVec3";

export class Camera {
    #position;
    #camDir;
    #camUp;
    #near;
    #far;

    constructor(
        position = new MireiaVec3(0, -5, 0),
        camDir = new MireiaVec3(0, 1, 0),
        camUp = new MireiaVec3(0, 0, 1),
        near = -0.1,
        far = 100000
    ) {
        this.#position = position;
        this.#camDir = camDir.normalize();
        this.#camUp = camUp.normalize();
        this.#near = near;
        this.#far = far;
    }

    getPosition() { return this.#position; }
    setPosition(position) { this.#position = position; }

    getCamDir() { return this.#camDir; }
    setCamDir(camDir) { this.#camDir = camDir.normalize(); }

    getCamUp() { return this.#camUp; }
    setCamUp(camUp) { this.#camUp = camUp.normalize(); }

    getNear() { return this.#near; }
    setNear(near) { this.#near = near; }

    getFar() { return this.#far; }
    setFar(far) { this.#far = far; }

    //direction the camera is looking
    getForward() {
        return this.#camDir;
    }

    //horizontal axis perpendicular to forward and up
    getRight(){
        return this.#camDir.cross(this.#camUp).normalize();
    }

    // vertical axis perpendicular to both forward and right
    getUp(){
        const r = this.getRight();
        return r.cross(this.#camDir).normalize();
    }

    // builds the view matrix (inverse of camera position/orientation)
    getViewMatrix(){
        const f = this.getForward();
        const r = this.getRight();
        const u = this.getUp();
        const p = this.#position;

        return new Float32Array([
            r.getX(), u.getX(), -f.getX(), 0,
            r.getY(), u.getY(), -f.getY(), 0,
            r.getZ(), u.getZ(), -f.getZ(), 0,
            -r.dot(p),
            -u.dot(p),
            f.dot(p),
            1,
        ]);
    }
}