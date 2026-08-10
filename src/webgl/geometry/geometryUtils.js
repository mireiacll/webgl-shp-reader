import { MireiaTriangle } from './MireiaTriangle.js';
import { MireiaSurface } from './MireiaSurface.js';
import { MireiaRect2D } from './MireiaRect2D.js';

// Builds a flat-shaded quad face from 4 vertices (v1,v2,v3,v4 in winding order)
// and adds it as a new surface on the given primitive.
export function createFace(v1, v2, v3, v4, primitive) {
  const t1 = new MireiaTriangle(v1, v2, v3);
  const t2 = new MireiaTriangle(v1, v3, v4);
  const s = new MireiaSurface();
  s.addTriangle(t1);
  s.addTriangle(t2);
  s.getVertices().push(v1, v2, v3, v4);
  primitive.addSurface(s);
}

// shoelace formula: positive area means counter-clockwise winding, negative area means clockwise winding
export function signedArea(points){
  let sum=0;
  const n=points.length;
  for(let i=0;i<n;i++){
    const a=points[i];
    const b=points[(i+1)%n];
    sum+= a.getX()*b.getY() - b.getX()*a.getY();
  }
  return sum/2;
}

// returns points in requested winding order (true=counter-clockwise, false=clockwise)
export function ensureWinding(points, clockWise){
  const isClockwise = signedArea(points) < 0;
  if(isClockwise === clockWise){
    return points;
  }
  return [...points].reverse();
}


export function boundingBoxOf(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.getX());
    maxX = Math.max(maxX, p.getX());
    minY = Math.min(minY, p.getY());
    maxY = Math.max(maxY, p.getY());
  }
  return new MireiaRect2D(minX, maxX, minY, maxY);
}

export function pointInRing(point, ring) {
    const x = point.getX();
    const y = point.getY();
    let inside = false;

    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = ring[i].getX();
        const yi = ring[i].getY();
        const xj = ring[j].getX();
        const yj = ring[j].getY();

        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// centroid of a set of rings  — averages every point across all rings
export function centroidOfRings(rings) {
    let sumX = 0, sumY = 0, count = 0;
    for (const ring of rings) {
        for (const p of ring) {
            sumX += p.getX();
            sumY += p.getY();
            count++;
        }
    }
    return count > 0 ? { lon: sumX / count, lat: sumY / count } : null;
}

// which flat grid cell index (row-major) a point falls into within bbox, for an NxN grid
export function gridCellIndex(lon, lat, bbox, divisions) {
    const width = bbox.getMaxX() - bbox.getMinX() || 1;
    const height = bbox.getMaxY() - bbox.getMinY() || 1;
    let col = Math.floor(((lon - bbox.getMinX()) / width) * divisions);
    let row = Math.floor(((lat - bbox.getMinY()) / height) * divisions);
    col = Math.min(Math.max(col, 0), divisions - 1);
    row = Math.min(Math.max(row, 0), divisions - 1);
    return row * divisions + col;
}