import { MireiaShapefileReader } from './MireiaShapefileReader.js';
import { MireiaDbfReader } from './MireiaDbfReader.js';
import { shapefileToMireiaPolygons, filterRecordsNearPoint } from './MireiaShapefilePolygonBuilder.js';
import { MireiaModeler } from '../geometry/MireiaModeler.js';
import { MireiaVec4 } from '../math/MireiaVec4.js';
import { MireiaVec2 } from '../math/MireiaVec2.js';
import { MireiaVec3 } from '../math/MireiaVec3.js';
import { MireiaRect2D } from '../geometry/MireiaRect2D.js';
import { MireiaGlobe } from '../geo/MireiaGlobe.js';
import { MireiaGroundPlane } from '../geo/MireiaGroundPlane.js';
import { MireiaSceneMerger } from '../geometry/MireiaSceneMerger.js';
import { centroidOfRings, gridCellIndex } from '../geometry/geometryUtils.js';
import { MireiaColor4 } from "../math/MireiaColor4.js";

const GRID_DIVISIONS = 8;

export async function loadOsmBuildings(main, baseUrl, { color = new MireiaColor4(0.7, 0.7, 0.75, 1), nearPoint = null, // { centerLon, centerLat, radiusMeters }
} = {}) {
    //console.log(`[loadOsmBuildings] fetching ${baseUrl}.shp and ${baseUrl}.dbf`);

    const [shpReader, dbfReader] = await Promise.all([
        MireiaShapefileReader.load(`${baseUrl}.shp`),
        MireiaDbfReader.load(`${baseUrl}.dbf`),
    ]);

    //console.log('[loadOsmBuildings] shp header:', shpReader.getHeader());
    //console.log('[loadOsmBuildings] dbf fields:', dbfReader.getFieldNames());

    const shpRecords = shpReader.parseRecords();
    const dbfRecords = dbfReader.parseRecords();

    //console.log('[SHP] first raw record:', JSON.stringify(shpRecords[0], (k,v) => v instanceof MireiaVec2 ? [v.getX(), v.getY()] : v));

    //console.log(`[loadOsmBuildings] parsed shp records: ${shpRecords.length}, dbf records: ${dbfRecords.length}`);

    if (shpRecords.length !== dbfRecords.length) {
        //console.warn(`[loadOsmBuildings] record count mismatch: shp=${shpRecords.length} dbf=${dbfRecords.length} — geometry/attribute pairing may be off`);
    }

    if (shpRecords.length === 0) {
        return [];
    }

    // dbf records are matched to shp records by array index
    let paired = shpRecords.map((shp, i) => ({ shp, dbf: dbfRecords[i] ?? {} }));

    if (nearPoint) {
        const { centerLon, centerLat, radiusMeters } = nearPoint;
        //console.log(`[loadOsmBuildings] filtering to ${radiusMeters}m around (${centerLon}, ${centerLat})`);
        const kept = new Set(filterRecordsNearPoint(shpRecords, centerLon, centerLat, radiusMeters));
        paired = paired.filter(({ shp }) => kept.has(shp));
        console.log(`[loadOsmBuildings] filtered to ${paired.length} / ${shpRecords.length} buildings within ${radiusMeters}m`);

        if (paired.length === 0) {
            const bbox = shpReader.getHeader().boundingBox;
            // console.warn(
            //     `[loadOsmBuildings] zero buildings survived the near-point filter. ` +
            //     `File's actual bounding box is lon ${bbox.xMin}..${bbox.xMax}, lat ${bbox.yMin}..${bbox.yMax} — ` +
            //     `is (${centerLon}, ${centerLat}) actually inside that range? If not, that's why nothing rendered.`
            // );
        }
    }

    // Recenter on the geometry
    const allPoints = [];
    for (const { shp: record } of paired) {
        if (record.shapeType === 0) continue;
        for (const ring of record.geometry) {
            allPoints.push(...ring);
        }
    }
    if (allPoints.length === 0) {
        console.warn('[loadOsmBuildings] No buildings to load after filtering — nothing to render.');
        return [];
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of allPoints) {
        minX = Math.min(minX, p.getX()); maxX = Math.max(maxX, p.getX());
        minY = Math.min(minY, p.getY()); maxY = Math.max(maxY, p.getY());
    }
    const bbox = new MireiaRect2D(minX, maxX, minY, maxY);;
    // console.log('[DIAGNOSTIC] nearPoint used:', nearPoint);
    // console.log('[DIAGNOSTIC] local bbox actually used for recentering:', bbox);
    // console.log('[DIAGNOSTIC] local bbox center:', { lon: (minX + maxX) / 2, lat: (minY + maxY) / 2 });
    // console.log('[loadOsmBuildings] local bounding box for recentering:', bbox);

    const built = [];
    let skippedNull = 0;
    let skippedInvalid = 0;
    let sceneMinX = Infinity;
    let sceneMaxX = -Infinity;
    let sceneMinY = Infinity;
    let sceneMaxY = -Infinity;
    let sceneMinZ = Infinity;
    let sceneMaxZ = -Infinity;

    const buckets = Array.from({ length: GRID_DIVISIONS * GRID_DIVISIONS }, () => []);
   
    const globe = new MireiaGlobe(bbox);

    for (const { shp: record, dbf: dbfRecord } of paired) {
        if (record.shapeType === 0) {
            skippedNull++;
            continue; //console.log(`[loadOsmBuildings] record ${record.recordNumber} is a NULL shape — skipping`);
        }

        const height = MireiaDbfReader.heightFromRecord(dbfRecord);

        const polygons = shapefileToMireiaPolygons([record], globe, color);
        if (polygons.length === 0) {
            //console.log(`[loadOsmBuildings] record ${record.recordNumber} produced zero valid polygons — skipping`);
            skippedInvalid++;
            continue;
        }

        const centroid = centroidOfRings(record.geometry);
        const cellIndex = centroid
            ? gridCellIndex(centroid.lon, centroid.lat, bbox, GRID_DIVISIONS)
            : 0;

        for (const polygon of polygons) {
            const extruded = MireiaModeler.extrude(polygon, height, color);
            const verts = extruded.getVertices();
            let localMinX = Infinity, localMaxX = -Infinity, localMinY = Infinity, localMaxY = -Infinity, localMinZ = Infinity, localMaxZ = -Infinity;

            if (verts.length === 0) {
                skippedInvalid++;
                console.warn(`[loadOsmBuildings] record ${record.recordNumber} produced extruded geometry with zero vertices — falling back to polygon bounds`);
                const fallbackPoints = polygon.getPoints();
                for (const p of fallbackPoints) {
                    localMinX = Math.min(localMinX, p.getX()); localMaxX = Math.max(localMaxX, p.getX());
                    localMinY = Math.min(localMinY, p.getY()); localMaxY = Math.max(localMaxY, p.getY());
                }
                localMinZ = 0;
                localMaxZ = height;
            } else {
                for (const v of verts) {
                    const p = v.getPosition();
                    localMinX = Math.min(localMinX, p.getX()); localMaxX = Math.max(localMaxX, p.getX());
                    localMinY = Math.min(localMinY, p.getY()); localMaxY = Math.max(localMaxY, p.getY());
                    localMinZ = Math.min(localMinZ, p.getZ()); localMaxZ = Math.max(localMaxZ, p.getZ());
                }
            }

            sceneMinX = Math.min(sceneMinX, localMinX);
            sceneMaxX = Math.max(sceneMaxX, localMaxX);
            sceneMinY = Math.min(sceneMinY, localMinY);
            sceneMaxY = Math.max(sceneMaxY, localMaxY);
            sceneMinZ = Math.min(sceneMinZ, localMinZ);
            sceneMaxZ = Math.max(sceneMaxZ, localMaxZ);

            if (verts.length > 0) {
                buckets[cellIndex].push(extruded.getScene().getRoot());
                built.push(extruded);
            }

            //main.addScene(extruded.getScene());
        }
    }

    let mergedSceneCount = 0;
    for (const bucketNodes of buckets){
        if (bucketNodes.length === 0) continue;
        const mergedScene = MireiaSceneMerger.mergeIntoScene(bucketNodes);
        if (mergedScene){
            main.addScene(mergedScene);
            mergedSceneCount++;
        }
    }

    // mapa al terra
    const TILE_URL_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    try {
        const gl = main.getGl();
        const ground = await MireiaGroundPlane.build(globe, bbox, gl, { urlTemplate: TILE_URL_TEMPLATE });
        main.addScene(ground.getScene());
    } catch (err) {
        console.error('[loadOsmBuildings] failed to build ground plane:', err);
    }

    if (built.length > 0) {
        const sceneCenterX = (sceneMinX + sceneMaxX) / 2;
        const sceneCenterY = (sceneMinY + sceneMaxY) / 2;
        const sceneCenterZ = (sceneMinZ + sceneMaxZ) / 2;

        const spanX = sceneMaxX - sceneMinX;
        const spanY = sceneMaxY - sceneMinY;
        const radius = Math.max(spanX, spanY, 50) / 2;

        const cam = main.getCamera();
        const dist = radius * 2.5; // pull back enough to frame the whole span

        // reposition camera to actually look at the scene center
        cam.setPosition(new MireiaVec3(sceneCenterX, sceneCenterY - dist, sceneCenterZ + dist * 0.4));
        const dir = new MireiaVec3(0, dist, -dist * 0.4).normalize();
        cam.setCamDir(dir);

        const controller = main.getCameraController?.();
        if (controller) {
            controller.setOrbitDistance(dist);
        }

        // now far plane, computed from the NEW position, actually matches what's needed
        const farPlane = dist * 3 + Math.max(spanX, spanY) ;
        cam.setNear(Math.max(0.1, dist * 0.01));
        cam.setFar(farPlane);

        console.log('[loadOsmBuildings] framed camera at', cam.getPosition(), 'far:', farPlane);
    }

    console.log(`[loadOsmBuildings] loaded ${built.length} building volumes (skipped ${skippedNull} null shapes, ${skippedInvalid} invalid polygons)`);
    if (built.length > 0) {
        const first = built[0].getVertices();
        //console.log(`[loadOsmBuildings] first building: ${first.length} vertices, first vertex position:`, first[0]?.getPosition());
    }
    return built;
}