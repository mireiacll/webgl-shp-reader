import { MireiaVec3 } from '../math/MireiaVec3.js';
import { MireiaMat4 } from '../math/MireiaMat4.js';

// Pure screen-space <-> world-space conversion math 
// translate a 2D pixel position into 3D space or vice versa
export class ScreenSpace {
  // Converts a pixel position (origin top-left, Y grows down) into Normalized Device Coordinates (-1..1, Y grows up).
  static screenToNdc(screenX, screenY, width, height) {
    const ndcX = (screenX / width) * 2 - 1;
    const ndcY = 1 - (screenY / height) * 2;
    return { ndcX, ndcY };
  }

  // WebGL's readPixels measures Y from the BOTTOM of the image
  static flipY(y, height) {
    return height - y - 1;
  }

  // Converts a normalized depth (0..1, from the decoded depth texture) back  into the same NDC Z space gl_FragCoord.z originally produced
  static depthToNdcZ(normalizedDepth, near, far) {
    const linearDepth = normalizedDepth * (far - near) + near;
    return (far + near - (2 * near * far) / linearDepth) / (far - near);
  }

  // Transforms an NDC point (x, y, z) back into a real 3D world position
  static unproject(ndcX, ndcY, ndcZ, inverseViewProjection) {
    const m = inverseViewProjection;
    const clipW = 1;

    const worldX = m[0]*ndcX + m[4]*ndcY + m[8]*ndcZ + m[12]*clipW;
    const worldY = m[1]*ndcX + m[5]*ndcY + m[9]*ndcZ + m[13]*clipW;
    const worldZ = m[2]*ndcX + m[6]*ndcY + m[10]*ndcZ + m[14]*clipW;
    const worldW = m[3]*ndcX + m[7]*ndcY + m[11]*ndcZ + m[15]*clipW;

    return new MireiaVec3(worldX / worldW, worldY / worldW, worldZ / worldW);
  }

  // Full convenience pipeline: screen pixel + normalized depth + view-projection
  // matrix -> world position. Returns null if the matrix isn't invertible.
  static screenToWorld(screenX, screenY, normalizedDepth, canvasWidth, canvasHeight, near, far, viewProjection) {
    const { ndcX, ndcY } = ScreenSpace.screenToNdc(screenX, screenY, canvasWidth, canvasHeight);
    const ndcZ = ScreenSpace.depthToNdcZ(normalizedDepth, near, far);

    const inverseVP = MireiaMat4.invertArray(viewProjection);
    if (!inverseVP) return null;

    return ScreenSpace.unproject(ndcX, ndcY, ndcZ, inverseVP);
  }
}