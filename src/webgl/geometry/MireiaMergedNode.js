import { MireiaMat4 } from '../math/MireiaMat4.js';

export class MireiaMergedNode {
    #vertices;
    #indices;
    #drawMode;
    #texture;
    #transform;

    constructor(vertices, indices, drawMode = 'TRIANGLES', texture = null) {
        this.#vertices = vertices;
        this.#indices = indices;
        this.#drawMode = drawMode;
        this.#texture = texture;
        this.#transform = new MireiaMat4();
    }

    getVertices() { return this.#vertices; }
    getIndices() { return this.#indices; }
    getDrawMode(gl) { return gl[this.#drawMode]; }
    getTexture() { return this.#texture; }

    getTransform() {
        const matrix = this.#transform.getMatrix();
        return { getMatrix: () => matrix };
    }

    getRenderableNodes() { return [this]; }
    updatePreCumputedtMat() {}
}