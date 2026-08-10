import { MireiaVec2 } from '../math/MireiaVec2.js';
import { MireiaPolygon } from '../geometry/MireiaPolygon.js';
import { signedArea, boundingBoxOf, pointInRing} from '../geometry/geometryUtils.js';
import { ShapeType } from './MireiaShapefileReader.js';
import { MireiaGlobe } from '../geo/MireiaGlobe.js';
import proj4 from 'proj4';


export function groupPolygonParts(parts) {
    //console.log(`[groupPolygonParts] called with ${parts.length} ring(s)`);

    const outerRings = [];
    const innerRings = [];

    // in SHP: outer rings have negative signed area, inner rings (holes) have positive signed area
    for (const ring of parts) {
        if (ring.length < 3) {
            //console.log(`[groupPolygonParts] skipping degenerate ring with ${ring.length} points`);
            continue; // degenerate, skip
        }
        const area = signedArea(ring);
        //console.log(`[groupPolygonParts] ring with ${ring.length} points, signedArea=${area.toFixed(8)} -> ${area < 0 ? 'OUTER' : 'HOLE'}`);
        if (area < 0) {
        outerRings.push(ring);
        } else {
        innerRings.push(ring);
        }
    }

    //console.log(`[groupPolygonParts] classified: ${outerRings.length} outer, ${innerRings.length} holes`);

    const groups = outerRings.map((outer) => ({
        outer,
        holes: [],
        bbox: boundingBoxOf(outer),
    }));

    if (groups.length === 0) {
        console.warn(`[groupPolygonParts] ZERO outer rings found in a record with ${parts.length} part(s) — this record will produce nothing. All rings were classified as holes, which usually means the winding-direction assumption (outer=clockwise/negative area) is backwards for this data.`);
    } else if (groups.length === 1) {
        // only one outer ring, all holes belong to it
        //console.log(`[groupPolygonParts] single outer ring — attaching all ${innerRings.length} hole(s) directly (fast path)`);
        groups[0].holes.push(...innerRings);
    } else if (groups.length > 1) {
        // multiple outer rings, assign holes to the correct outer ring
        //console.log(`[groupPolygonParts] ${groups.length} outer rings — assigning ${innerRings.length} hole(s) via point-in-polygon test`);
        for (const hole of innerRings) {
            const holePoint = hole[0]; // take the first point of the hole
            const owner = groups.find((group) => {
                return group.bbox.containsPoint(holePoint) && pointInRing(holePoint, group.outer);
            });
            if (owner) {
                owner.holes.push(hole);
            } else {
                console.warn('[groupPolygonParts] Could not find an outer ring for a hole, skipping it. Hole first point:', holePoint.getX(), holePoint.getY());
            }
        }
    }

    //console.log(`[groupPolygonParts] returning ${groups.length} group(s), hole counts:`, groups.map(g => g.holes.length));
    return groups.map(({ outer, holes }) =>({outer, holes}));
}

// check if its Lat/Lon by seeing if the bounding box is within the valid ranges for lat/lon coordinates
function isLikelyGeographic(bbox) {
    return Math.abs(bbox.minX) <= 180 && Math.abs(bbox.maxX) <= 180 &&
        Math.abs(bbox.minY) <= 90 && Math.abs(bbox.maxY) <= 90;
}

// picks a UTM projection based on the center of the bounding box
function utmProjectionFor(centerLon, centerLat) {
    const zone = Math.floor((centerLon + 180) / 6) + 1;
    const hemisphere = centerLat < 0 ? ' +south' : '';
    const projString = `+proj=utm +zone=${zone}${hemisphere} +datum=WGS84 +units=m +no_defs`;
    return new proj4.Proj(projString);
}

// projects a ring of geographic coordinates (lat/lon) to UTM coordinates
function projectGeographicRing(ring, utmProj, originX, originY) {
    return ring.map((point) => {
        const [x, y] = proj4('EPSG:4326', utmProj, [point.getX(), point.getY()]);
        return new MireiaVec2(x - originX, y - originY);
    });
}

function recenterProjectedRing(ring, offsetX, offsetY) {
    return ring.map((point) => {
        return new MireiaVec2(point.getX() - offsetX, point.getY() - offsetY);
    });
}

export function shapefileToMireiaPolygons(records,globe,color=null) {
    //console.log('[shapefileToMireiaPolygons] called with', records.length, 'record(s), boundingBox:', boundingBox);

    //const globe = new MireiaGlobe(boundingBox);

    const polygons = [];

    for (const record of records) {
        if (record.shapeType !== ShapeType.POLYGON) {
            console.warn(`Skipping record with shapeType ${record.shapeType}`);
            continue;
        }
        const parts = record.geometry; // array of rings (each ring is an array of MireiaVec2)
        const grouped = groupPolygonParts(parts);
        //console.log(`[shapefileToMireiaPolygons] record ${record.recordNumber}: ${parts.length} raw ring(s) -> ${grouped.length} group(s)`);

        for (const { outer, holes } of grouped) {
            const recenteredOuter = globe.recenterRing(outer);
            const recenteredHoles = holes.map((hole) => globe.recenterRing(hole));
            //console.log(`[shapefileToMireiaPolygons] building polygon: outer=${recenteredOuter.length}pts, holes=${recenteredHoles.length} (sizes: ${recenteredHoles.map(h => h.length).join(',')})`);
            const polygon = MireiaPolygon.tryCreate(recenteredOuter, color, recenteredHoles);
            if (polygon === null) {
                console.warn(`[shapefileToMireiaPolygons] record ${record.recordNumber}: MireiaPolygon.tryCreate returned null — polygon skipped`);
            } else {
                polygons.push(polygon);
            }
        }
    }
    //console.log(`[shapefileToMireiaPolygons] built ${polygons.length} polygon(s) from ${records.length} record(s)`);
    return polygons;
}

export function filterRecordsNearPoint(records, centerLon, centerLat, radiusMeters) {
  const metersPerDegreeLat = 111320; // rough, only used to size the filter box, not for actual output coordinates
  const metersPerDegreeLon = metersPerDegreeLat * Math.cos(centerLat * Math.PI / 180);
  const lonRadius = radiusMeters / metersPerDegreeLon;
  const latRadius = radiusMeters / metersPerDegreeLat;
 
  return records.filter((record) => {
    if (record.shapeType !== ShapeType.POLYGON) return false;
    for (const ring of record.geometry) {
      for (const p of ring) {
        if (Math.abs(p.getX() - centerLon) <= lonRadius && Math.abs(p.getY() - centerLat) <= latRadius) {
          return true;
        }
      }
    }
    return false;
  });
}