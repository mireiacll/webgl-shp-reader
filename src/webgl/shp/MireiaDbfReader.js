export class MireiaDbfReader {
    #view;
    #fields;
    #recordCount;
    #headerSize;
    #recordSize;

    constructor(arrayBuffer) {
        this.#view = new DataView(arrayBuffer);
        this.#fields = [];
        this.#recordCount = 0;
        this.#headerSize = 0;
        this.#recordSize = 0;
        this.#readHeader();
    }

    static async load(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load DBF file: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return new MireiaDbfReader(arrayBuffer);
    }

    getFields() {return this.#fields;}
    getFieldNames() { return this.#fields.map(f => f.name); }
    getRecordCount() {return this.#recordCount;}

    #readHeader() {
        const view = this.#view;
        this.#recordCount = view.getInt32(4, true);
        this.#headerSize = view.getInt16(8, true);
        this.#recordSize = view.getInt16(10, true);

        const fields = [];
        let offset = 32; // field descriptor array starts at byte 32
        while (view.getUint8(offset) !== 0x0D) { // field descriptor array ends with 0x0D
            const nameBytes = [];
            for (let i = 0; i < 11; i++) {
                const byte = view.getUint8(offset + i);
                if (byte !== 0) nameBytes.push(byte);
            }
            const name = String.fromCharCode(...nameBytes);
            const type = String.fromCharCode(view.getUint8(offset + 11));
            const length = view.getUint8(offset + 16);
            const decimalCount = view.getUint8(offset + 17);
            fields.push({ name, type, length, decimalCount });
            offset += 32; // move to the next field descriptor
        }
        this.#fields = fields;
    }

    parseRecords() {
        const view = this.#view;
        const records = [];
        let offset = this.#headerSize; // start after the header

        for (let i = 0; i < this.#recordCount; i++) {
            const detectionFlag = view.getUint8(offset);
            let fieldOffset = offset + 1; // skip the deletion flag
            const record = { deleted: detectionFlag === 0x2A }; // 0x2A = '*', deleted record
            for (const field of this.#fields) {
                const bytes = new Uint8Array(view.buffer, fieldOffset, field.length);
                const raw = new TextDecoder('ascii').decode(bytes).trim();
                record[field.name] = this.#coerce(raw, field);
                fieldOffset += field.length;
            }
            records.push(record);
            offset += this.#recordSize;
        }
        return records;
    }

    #coerce(raw, field) {
        if (raw === '') return null; // treat empty strings as null
        switch (field.type) {
            case 'N': // Numeric
            case 'F': // Float
                return field.decimalCount > 0 ? parseFloat(raw) : parseInt(raw, 10);
            case 'L': // Logical
                return /[YyTt]/.test(raw)? true : /[NnFf]/.test(raw) ? false : null;
            case 'C': // Character
            default:
                return raw;
        }
    }

    static TYPE_DEFAULT_HEIGHTS = {
        house: 6,
        residential: 9,
        apartments: 15,
        detached: 6,
        terrace: 7,
        bungalow: 4,
        garage: 3,
        garages: 3,
        shed: 3,
        hut: 3,
        greenhouse: 3,
        summer_house: 4,
        roof: 3,
        retail: 6,
        commercial: 8,
        industrial: 9,
        warehouse: 9,
        office: 12,
        school: 10,
        university: 12,
        hospital: 14,
        church: 18,
        cathedral: 30,
        hotel: 16,
        public: 10,
        civic: 10,
        train_station: 12,
        parking: 3,
        construction: 4,
    };
    static DEFAULT_HEIGHT_FALLBACK = 6;

    static heightFromRecord(record, { metersPerLevel = 3 } = {}) {
        const heightFields = ['height', 'HEIGHT', 'Height', 'ELEV', 'elevation'];
        for (const f of heightFields) {
            const v = Number(record[f]);
            if (record[f] != null && !isNaN(v) && v > 0) return v;
        }
        const levelFields = ['levels', 'LEVELS', 'building_levels', 'floors'];
        for (const f of levelFields) {
            const v = Number(record[f]);
            if (record[f] != null && !isNaN(v) && v > 0) return v * metersPerLevel;
        }
        const typeKey = record.type || record.fclass;
        if (typeKey && MireiaDbfReader.TYPE_DEFAULT_HEIGHTS[typeKey] != null) {
            return MireiaDbfReader.TYPE_DEFAULT_HEIGHTS[typeKey];
        }
        return MireiaDbfReader.DEFAULT_HEIGHT_FALLBACK;
    }
}