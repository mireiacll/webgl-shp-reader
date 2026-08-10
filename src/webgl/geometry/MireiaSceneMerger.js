import { MireiaMergedNode } from './MireiaMergedNode.js';
import { MireiaScene } from './MireiaScene.js';

export class MireiaSceneMerger{

     static mergeNodes(nodes, { texture = null, drawMode = 'TRIANGLES' } = {}) {
        if (!nodes || nodes.length === 0) return null;
 
        const mergedVertices = [];
        const mergedIndices = [];
 
        for (const node of nodes) {
            const nodeVertices = node.getVertices();
            const nodeIndices = node.getIndices();
 
            const offset = mergedVertices.length;
            for (const v of nodeVertices) {
                mergedVertices.push(v);
            }
            for (const idx of nodeIndices) {
                mergedIndices.push(idx + offset);
            }
        }
 
        return new MireiaMergedNode(mergedVertices, mergedIndices, drawMode, texture);
    }
 
    static mergeIntoScene(nodes, opts) {
        const node = MireiaSceneMerger.mergeNodes(nodes, opts);
        return node ? new MireiaScene(node) : null;
    }
 
    static mergeScenes(scenes, opts) {
        const nodes = scenes.flatMap((scene) => scene.getRenderableNodes());
        return MireiaSceneMerger.mergeIntoScene(nodes, opts);
    }
}