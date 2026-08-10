import { Shader } from './Shader.js';
import { MireiaVec3 } from '../math/MireiaVec3.js';

const LIGHT_DIRECTION =  new MireiaVec3(-0.5, 0.3, -1);
const AMBIENT_STRENGTH = 0.25;

export class Renderer {
  #gl;
  #shader;
  #bufferCache;
  #lightDirection;
  #near;
  #far;
  #nextSelectionId;
  #selectionMap;
  #selectedObject;

  constructor(gl,near = 0.1, far = 100) {
    this.#gl = gl;
    this.#shader = new Shader(gl);
    this.#bufferCache = new WeakMap();
    this.#lightDirection = LIGHT_DIRECTION.normalize().toArray();
    this.#near = near;
    this.#far = far;
    this.#nextSelectionId = 1;
    this.#selectionMap = new Map();
    this.#selectedObject = null;
  }

  getGl() { return this.#gl; }
  getShader() { return this.#shader; }

  setSelected(object) { this.#selectedObject = object ?? null; }
  getSelected() { return this.#selectedObject; }

  pickObjectAt(bytes) {
    return this.#selectionMap.get(bytes.join(',')) ?? null;
  }

  #encodeSelectionId(id) {
    const hashed = (id * 2654435761) >>> 0; // Knuth's multiplicative hash
    const rByte = hashed & 0xff;
    const gByte = (hashed >> 8) & 0xff;
    const bByte = (hashed >> 16) & 0xff;
    return {
      bytes: [rByte, gByte, bByte],
      color: [rByte / 255, gByte / 255, bByte / 255, 1.0],
    };
  }

  render(scene, matrix, near, far) {
    // keep renderer's internal near/far in sync with the camera for correct depth encoding
    this.#near = near;
    this.#far = far;
    const nodes = scene.getRenderableNodes();
    for (const node of nodes) {
      this.#renderNode(node, matrix);
    }
  }

  #renderNode(object, matrix) {
    const gl = this.#gl;
    const vertices = object.getVertices();
    const drawMode = object.getDrawMode(gl);
    const texture = typeof object.getTexture === 'function' ? object.getTexture() : null;
    const hasTexture = !!texture;

    let entry = this.#bufferCache.get(object);
    const needsRebuild = !entry || entry.verticesRef !== vertices || entry.drawMode !== drawMode || entry.hasTexture !== hasTexture;

    gl.enable(gl.CULL_FACE);

    if (needsRebuild) {
      if (entry) {
        gl.deleteBuffer(entry.positionVBO);
        gl.deleteBuffer(entry.colorVBO);
        gl.deleteBuffer(entry.texCoordVBO);
        gl.deleteBuffer(entry.normalVBO);
        gl.deleteBuffer(entry.indexBuffer);
        gl.deleteVertexArray(entry.vao);
      }
      entry = this.#createBuffers(object, vertices, drawMode,hasTexture);
      this.#bufferCache.set(object, entry);
    }

    gl.useProgram(this.#shader.getProgram());

    // one call replaces all 4 enableVertexAttribArray/vertexAttribPointer calls —
    // the GPU already remembers that setup from when the VAO was recorded
    gl.bindVertexArray(entry.vao);

    gl.uniformMatrix4fv(this.#shader.getMatrixLoc(), false, matrix);
    gl.uniform3fv(this.#shader.getLightDirectionLoc(), this.#lightDirection);
    gl.uniform1f(this.#shader.getAmbientStrengthLoc(), AMBIENT_STRENGTH);

    gl.uniform1f(this.#shader.getNearLoc(), this.#near);
    gl.uniform1f(this.#shader.getFarLoc(), this.#far);
    gl.uniform4fv(this.#shader.getSelectionColorLoc(), entry.selectionColor);
    //if (object === this.#selectedObject) console.log('rendering as selected, loc=', this.#shader.getIsSelectedLoc());
    gl.uniform1f(this.#shader.getIsSelectedLoc(), object === this.#selectedObject ? 1.0 : 0.0);

    const transform = object.getTransform();
    gl.uniformMatrix4fv(this.#shader.getObjectTMatrixLoc(), false, transform.getMatrix());

    gl.activeTexture(gl.TEXTURE0); // select texture unit 0 as the one we're about to configure
    if (texture) {
      gl.bindTexture(gl.TEXTURE_2D, texture.getTexture()); // bind this object's texture to unit 0
      gl.uniform1i(this.#shader.getTextureLoc(), 0);
      gl.uniform1f(this.#shader.getUseTextureLoc(), 1.0);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, null); // clear any stale binding
      gl.uniform1f(this.#shader.getUseTextureLoc(), 0.0);
    }

    const useLighting = typeof object.getLighting === 'function' ? object.getLighting() : true;
    gl.uniform1f(this.#shader.getUseLightingLoc(), useLighting ? 1.0 : 0.0);

    //gl.drawElements(drawMode, entry.indexCount, gl.UNSIGNED_SHORT, 0);
    gl.drawElements(drawMode, entry.indexCount, gl.UNSIGNED_INT, 0);

    gl.bindVertexArray(null);
  }

  // creates + configures a VAO
  #createBuffers(object, vertices, drawMode, hasTexture) {
    const gl = this.#gl;
    const indices = object.getIndices();

    const positionData = new Float32Array(vertices.flatMap((v) => v.getPosition().toArray()));
    //const colorData = new Float32Array(vertices.flatMap((v) => v.getColor().toArray()));
    console.log(vertices[0].getColor().constructor.name);
    const colorBytes = vertices.flatMap((v) => v.getColor().toBytes());
    const colorData = new Uint8Array(colorBytes);
    const texCoordData = new Float32Array(vertices.flatMap((v) => v.getTexCoord().toArray()));
    //const normalData = new Float32Array(vertices.flatMap((v) => v.getNormal().toArray()));
    const clamp127 = (v) => Math.max(-127, Math.min(127, Math.round(v * 127)));
    const normalBytes = vertices.flatMap((v) => {
      const [nx, ny, nz] = v.getNormal().toArray();
      return [clamp127(nx), clamp127(ny), clamp127(nz), 0]; // pad to 4 for alignment
    });
    const normalData = new Int8Array(normalBytes);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const positionVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionVBO);
    gl.bufferData(gl.ARRAY_BUFFER, positionData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.#shader.getPositionLoc());
    gl.vertexAttribPointer(this.#shader.getPositionLoc(), 3, gl.FLOAT, false, 0, 0);

    const colorVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorVBO);
    gl.bufferData(gl.ARRAY_BUFFER, colorData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.#shader.getColorLoc());
    //gl.vertexAttribPointer(this.#shader.getColorLoc(), 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribPointer(this.#shader.getColorLoc(), 4, gl.UNSIGNED_BYTE, true, 0, 0);

    let texCoordVBO = null;
    if (hasTexture) {
      const texCoordData = new Float32Array(vertices.flatMap((v) => v.getTexCoord().toArray()));
      texCoordVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, texCoordVBO);
      gl.bufferData(gl.ARRAY_BUFFER, texCoordData, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this.#shader.getTexCoordLoc());
      gl.vertexAttribPointer(this.#shader.getTexCoordLoc(), 2, gl.FLOAT, false, 0, 0);
    }
    // const texCoordVBO = gl.createBuffer();
    // gl.bindBuffer(gl.ARRAY_BUFFER, texCoordVBO);
    // gl.bufferData(gl.ARRAY_BUFFER, texCoordData, gl.STATIC_DRAW);
    // gl.enableVertexAttribArray(this.#shader.getTexCoordLoc());
    // gl.vertexAttribPointer(this.#shader.getTexCoordLoc(), 2, gl.FLOAT, false, 0, 0);

    const normalVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalVBO);
    gl.bufferData(gl.ARRAY_BUFFER, normalData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.#shader.getNormalLoc());
    //gl.vertexAttribPointer(this.#shader.getNormalLoc(), 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribPointer(this.#shader.getNormalLoc(), 3, gl.BYTE, true, 4, 0);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    // gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);


    // stop recording into this VAO
    gl.bindVertexArray(null);

    const selectionId = this.#nextSelectionId++;
    const { bytes, color } = this.#encodeSelectionId(selectionId);
    this.#selectionMap.set(bytes.join(','), object);

    return {
      verticesRef: vertices,
      drawMode,
      hasTexture,
      vao,
      positionVBO,
      colorVBO,
      texCoordVBO,
      normalVBO,
      indexBuffer,
      indexCount: indices.length,
      selectionId,
      selectionColor: color,
    };
  }
}