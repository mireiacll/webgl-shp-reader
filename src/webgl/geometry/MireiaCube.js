import { MireiaPrimitive } from "./MireiaPrimitive.js";
import { MireiaSurface } from "./MireiaSurface.js";
import { MireiaTriangle } from "./MireiaTriangle.js";
import { MireiaFBO } from "../core/MireiaFBO.js";
import { MireiaMat4 } from "../math/MireiaMat4";
import { MireiaVec3 } from "../math/MireiaVec3";
import { MireiaVertex } from "./MireiaVertex";
import { MireiaVec4 } from "../math/MireiaVec4.js";
import { createFace } from "./geometryUtils.js";
import { MireiaMesh } from "./MireiaMesh.js";
import { MireiaNode } from "./MireiaNode.js";
import { MireiaScene } from "./MireiaScene.js";
import { MireiaColor4 } from "../math/MireiaColor4.js";

export class MireiaCube {
  #primitives;
  #transform;
  #lengthX;
  #lengthY;
  #lengthZ;
  #scene;

  constructor(lengthX = 1, lengthY = 1, lengthZ = 1, color = null, wireframe = false, lighting = true) {

    this.#lengthX=lengthX;
    this.#lengthY=lengthY;
    this.#lengthZ=lengthZ;

    const pos0 = new MireiaVec3(lengthX/2,-lengthY/2,-lengthZ/2);
    const pos1 = new MireiaVec3(lengthX/2,lengthY/2,-lengthZ/2);
    const pos2 = new MireiaVec3(lengthX/2,lengthY/2,lengthZ/2);
    const pos3 = new MireiaVec3(lengthX/2,-lengthY/2,lengthZ/2);
    const pos4 = new MireiaVec3(-lengthX/2,lengthY/2,-lengthZ/2);
    const pos5 = new MireiaVec3(-lengthX/2,-lengthY/2,-lengthZ/2);
    const pos6 = new MireiaVec3(-lengthX/2,-lengthY/2,lengthZ/2);
    const pos7 = new MireiaVec3(-lengthX/2,lengthY/2,lengthZ/2);

    const p1 = new MireiaPrimitive();


    //             Z
    //             ^  right                     
    //       3-----|-----2             
    //       |     |     |           
    //       |     +------------>Y
    //       |           |           
    //       0-----------1          

    // right side
    const cRight  = color ?? new MireiaColor4(1, 0.0, 0.0, 1);
    const v0 = new MireiaVertex(pos0,cRight);
    const v1 = new MireiaVertex(pos1,cRight);
    const v2 = new MireiaVertex(pos2,cRight);
    const v3 = new MireiaVertex(pos3,cRight);
    createFace(v0,v1,v2,v3,p1);

    //             Z
    //             ^  left                     
    //       7-----|-----6             
    //       |     |     |           
    //   Y<--------+     |
    //       |           |           
    //       4-----------5          

    // left side
    const cLeft   = color ?? new MireiaColor4(0.9, 0.2, 0.2, 1);
    const v4 = new MireiaVertex(pos4, cLeft);
    const v5 = new MireiaVertex(pos5, cLeft);
    const v6 = new MireiaVertex(pos6, cLeft);
    const v7 = new MireiaVertex(pos7, cLeft);
    createFace(v4,v5,v6,v7,p1);


    //             Z
    //             ^  front                     
    //    11 6-----|-----3 10            
    //       |     |     |           
    //       |     +------------>X
    //       |           |           
    //     8 5-----------0 9   

    const cFront  = color ?? new MireiaColor4(0.2, 0.9, 0.2, 1);
    const v8 = new MireiaVertex(pos5,cFront);
    const v9 = new MireiaVertex(pos0,cFront);
    const v10 = new MireiaVertex(pos3,cFront);
    const v11 = new MireiaVertex(pos6,cFront);
    createFace(v8,v9,v10,v11,p1);

    //             Z
    //             ^  back                     
    //   15  2-----|-----7 14             
    //       |     |     |           
    //  x <--------+     |
    //       |           |           
    //   12  1-----------4 13  

    const cBack   = color ?? new MireiaColor4(0.2, 0.2, 0.9, 1);
    const v12 = new MireiaVertex(pos1,cBack);
    const v13 = new MireiaVertex(pos4,cBack);
    const v14 = new MireiaVertex(pos7,cBack);
    const v15 = new MireiaVertex(pos2,cBack);
    createFace(v12,v13,v14,v15,p1);


    // //             y
    // //             ^  top                     
    // //   19  7-----|-----2  18           
    // //       |     |     |           
    // //       |     +------------>X
    // //       |           |           
    // //   16  6-----------3  17  

    const cTop    = color ?? new MireiaColor4(0.5, 0.2, 0.9, 1);
    const v16 = new MireiaVertex(pos6,cTop);
    const v17 = new MireiaVertex(pos3,cTop);
    const v18 = new MireiaVertex(pos2,cTop);
    const v19 = new MireiaVertex(pos7,cTop);
    createFace(v16,v17,v18,v19,p1);

    // //             y
    // //             ^  bottom                     
    // //   23  1-----|-----4 22            
    // //       |     |     |           
    // //  x <--------+     |
    // //       |           |           
    // //   20  0-----------5 21   

    const cBottom = color ?? new MireiaColor4(0.2, 0.5, 0.9, 1);
    const v20 = new MireiaVertex(pos0,cBottom);
    const v21 = new MireiaVertex(pos5,cBottom);
    const v22 = new MireiaVertex(pos4,cBottom);
    const v23 = new MireiaVertex(pos1,cBottom);
    createFace(v20,v21,v22,v23,p1);


    this.#primitives = [];
    this.#primitives.push(p1);

    p1.calculateVerticesNormal();

    this.#transform = new MireiaMat4();

    const mesh = new MireiaMesh(this.#primitives);
    const node = new MireiaNode([mesh], this.#transform);
    this.#scene = new MireiaScene(node);

  }


  getTransform() { return this.#transform; }
  setTransform(transform) { this.#transform = transform; }

  getPrimitives() { return this.#primitives; }

  getDrawMode(gl) {
    return gl.TRIANGLES;
  }

  getVertices(){
    var resultVertices = [];

    var primitivesCount = this.#primitives.length;
    for(var i = 0; i<primitivesCount; i++){
      var primitive = this.#primitives[i];
      var currVertices = primitive.getVertices();
      resultVertices = resultVertices.concat(currVertices);
    }

    return resultVertices;
  }

  getIndices(){
    var resultVertices = this.getVertices();
    for (var i=0; i<resultVertices.length;i++){
      var vertex = resultVertices[i];
      vertex.setId(i);
    }

    var resultIndices = [];
    for(var i=0; i<this.#primitives.length;i++){
      var primitive = this.#primitives[i];
      var currIndices = primitive.getIndices();
      resultIndices = resultIndices.concat(currIndices);
    }

    return resultIndices;
  }

  getScene() { return this.#scene;}

}