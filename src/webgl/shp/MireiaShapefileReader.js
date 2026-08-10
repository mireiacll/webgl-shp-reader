import { MireiaVec2 } from '../math/MireiaVec2.js';
import { MireiaRect2D } from '../geometry/MireiaRect2D.js';

export const ShapeType = {
    NULL: 0,
    POINT: 1,
    POLYLINE: 3,
    POLYGON: 5,
    MULTIPOINT: 8,
    POINTZ: 11,
    POLYLINEZ: 13,
    POLYGONZ: 15,
    MULTIPOINTZ: 18,
    POINTM: 21,
    POLYLINEM: 23,
    POLYGONM: 25,
    MULTIPOINTM: 28,
    MULTIPATCH: 31,
};

export const ShapeTypeName = Object.fromEntries(Object.entries(ShapeType).map(([key, value]) => [value, key]));

export class MireiaShapefileReader{
    #buffer;
    #view;
    #header;

    constructor(buffer){
        this.#buffer = buffer;
        this.#view = new DataView(buffer);
        this.#header = this.#readHeader();
    }

    static async load(url){
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load shapefile: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return new MireiaShapefileReader(arrayBuffer);
    }

    getHeader(){ return this.#header;}

    #readHeader(){
        const view = this.#view;

        const fileCode = view.getInt32(0, false); // should be 9994
        if (fileCode !== 9994) {
            throw new Error(`Invalid shapefile header: expected file code 9994, got ${fileCode}`);
        }
        const fileLength = view.getInt32(24, false); // in 16-bit words
        const fileLengthBytes = fileLength * 2; // convert to bytes
        const version = view.getInt32(28, true); // should be 1000
        if (version !== 1000) {
            throw new Error(`Invalid shapefile header: expected version 1000, got ${version}`);
        }
        const shapeType = view.getInt32(32, true); // shape type
        // const boundingBox = {
        //     xMin: view.getFloat64(36, true),
        //     yMin: view.getFloat64(44, true),
        //     xMax: view.getFloat64(52, true),
        //     yMax: view.getFloat64(60, true),
        // };
        const xMin = view.getFloat64(36, true);
        const yMin = view.getFloat64(44, true);
        const xMax = view.getFloat64(52, true);
        const yMax = view.getFloat64(60, true);

        const boundingBox = new MireiaRect2D(xMin, xMax, yMin, yMax);

        //console.log('[SHP] header bbox:', boundingBox, 'shapeType:', ShapeTypeName[shapeType]);
        return { fileCode, fileLengthBytes, version, shapeType, shapeTypeName: ShapeTypeName[shapeType] ?? `UNKNOWN (${shapeType})`, boundingBox };
    }

    parseRecords(){
        const view = this.#view;
        const totalBytes = this.#header.fileLengthBytes;
        const records = [];
        let offset = 100; // start after the 100-byte header

        while (offset < totalBytes) {
            const recordNumber = view.getInt32(offset, false); // record number (big-endian)
            const contentLengthWords = view.getInt32(offset + 4, false); // content length in 16-bit words (big-endian)
            const contentLengthBytes = contentLengthWords * 2; // content length in bytes (big-endian)
            const contentStart = offset + 8; // start of the record content (after record number and content length)
            const record = this.#parseRecordContent(contentStart); // parse the record content based on shape type
            record.recordNumber = recordNumber; 
            records.push(record);
            offset = contentStart + contentLengthBytes; // move to the next record
        }
        return records;
    }

    #parseRecordContent(offset){
        const view = this.#view;
        const shapeType = view.getInt32(offset, true);
        switch (shapeType) {
            case ShapeType.NULL:
                return { shapeType, geometry: null };
            case ShapeType.POINT:
                return { shapeType, geometry: this.#parsePoint(offset) };
            case ShapeType.MULTIPOINT:
                return { shapeType, geometry: this.#parseMultiPoint(offset) };
            case ShapeType.POLYLINE:
            case ShapeType.POLYGON:
                return { shapeType, geometry: this.#parsePolyStructure(offset) };
            default:
                throw new Error(
                `MireiaShapefileReader: shape type ${shapeType} (${ShapeTypeName[shapeType] ?? 'unrecognized'}) isn't handled yet — add it to #parseRecordContent`
                );
        }
    }

    #parsePoint(offset){
        const view = this.#view;
        const x = view.getFloat64(offset + 4, true);
        const y = view.getFloat64(offset + 12, true);
        return { x, y };
    }

    #parseMultiPoint(offset){
        const view = this.#view;
        const numPoints = view.getInt32(offset + 36, true);
        const points = [];
        let pointOffset = offset + 40;

        for (let i = 0; i < numPoints; i++) {
            const x = view.getFloat64(pointOffset, true);
            const y = view.getFloat64(pointOffset + 8, true);
            points.push(new MireiaVec2(x, y));
            pointOffset += 16;
        }
        return points ;
    }

    #parsePolyStructure(offset){
        const view = this.#view; 
        const numParts = view.getInt32(offset + 36, true); // number of parts (rings)
        const numPoints = view.getInt32(offset + 40, true); // number of points in all parts combined
        const partsStart = offset + 44; // start of the parts array (each part is an int32 index into the points array)
        const pointsStart = partsStart + numParts * 4; // start of the points array (each point is two float64 values: x and y)
    
        const partStartIndices = [];
        for (let i = 0; i < numParts; i++) {
            partStartIndices.push(view.getInt32(partsStart + i * 4, true)); // index of the first point of this part in the points array
        }

        const allPoints = [];
        for (let i = 0; i < numPoints; i++) {
            const x = view.getFloat64(pointsStart + i * 16, true); // x coordinate of the point
            const y = view.getFloat64(pointsStart + i * 16 + 8, true); // y coordinate of the point
            allPoints.push(new MireiaVec2(x, y)); // store the point as a MireiaVec2
        }

        const parts = [];
        for (let i = 0; i < numParts; i++) {
            const startIdx = partStartIndices[i];
            const endIdx = (i + 1 < numParts) ? partStartIndices[i + 1] : numPoints;
            let partPoints = allPoints.slice(startIdx, endIdx);

            // SHP rings are explicitly closed (first point repeated as last) — drop the duplicate
            if (partPoints.length > 1) {
                const first = partPoints[0];
                const last = partPoints[partPoints.length - 1];
                if (first.getX() === last.getX() && first.getY() === last.getY()) {
                    partPoints = partPoints.slice(0, -1);
                }
            }

            parts.push(partPoints);
        }
        // console.log(`[SHP] record parts=${numParts} points=${numPoints}`, 
        //     parts.map(p => ({ len: p.length, first: [p[0]?.getX(), p[0]?.getY()], last: [p[p.length-1]?.getX(), p[p.length-1]?.getY()] })));
        return parts;
    }

    logSummary() {
        const h = this.#header;
        //console.log(`Shapefile: type=${h.shapeTypeName} (${h.shapeType}), bytes=${h.fileLengthBytes}`);
        //console.log('Bounding box:', h.boundingBox);
        const records = this.parseRecords();
        //console.log(`Records: ${records.length}`);
        if (records.length > 0) {
        const first = records[0];
        //console.log('First record:', first);
        }
        return records;
    }
    }
