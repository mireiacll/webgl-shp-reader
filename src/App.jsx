import { useEffect, useRef, useState } from 'react';
import { Main } from './webgl/Main.js';
import { MireiaVec2 } from './webgl/math/MireiaVec2.js';
import { MireiaVec3 } from './webgl/math/MireiaVec3.js';
import { Texture } from './webgl/core/Texture.js';
import { MireiaPolygon } from './webgl/geometry/MireiaPolygon.js';
import { MireiaModeler } from './webgl/geometry/MireiaModeler.js';
import { signedArea, buildShape, segmentSelfIntersects, closingEdgeSelfIntersects } from './webgl/geometry/geometryUtils.js';
import { loadOsmBuildings } from './webgl/shp/loadOsmBuildings.js';
import { MireiaColor4 } from './webgl/math/MireiaColor4.js';
import { MireiaPoints } from './webgl/geometry/MireiaPoints.js';
import { MireiaLines } from './webgl/geometry/MireiaLines.js';
import { MireiaLineStrip } from './webgl/geometry/MireiaLineStrip.js';
import { MireiaLineLoop } from './webgl/geometry/MireiaLineLoop.js';

function App() {
  const canvasRef = useRef(null);
  const mainRef = useRef(null);
  const [displayMode, setDisplayMode] = useState('color');

  const [drawMode, setDrawMode] = useState('none'); // 'none' | 'point' | 'line' | 'lineStrip' | 'lineLoop' | 'polygon'
  const drawModeRef = useRef('none');

  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);

  const drawingPointsRef = useRef([]);
  //const previewSceneRef = useRef(null);
  const previewPointsRef = useRef(null);
  const previewLineRef = useRef(null);
  const [pointCount, setPointCount] = useState(0);

  const [awaitingHeight, setAwaitingHeight] = useState(false);
  const awaitingHeightRef = useRef(false);
  useEffect(() => {
    awaitingHeightRef.current = awaitingHeight;
  }, [awaitingHeight]);

  const [heightValue, setHeightValue] = useState('10');
  const [closeMessage, setCloseMessage] = useState(null);

  const clearPreviewScenes = (main) => {
    if (!main) return;
    if (previewPointsRef.current) {
      main.removeScene(previewPointsRef.current);
      previewPointsRef.current = null;
    }
    if (previewLineRef.current) {
      main.removeScene(previewLineRef.current);
      previewLineRef.current = null;
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const main = new Main(canvas);
    mainRef.current = main;

    const stop = main.start();


    // loadOsmBuildings(main, '/public/shp/gis_osm_buildings_a_07_1', {
    //   nearPoint: { centerLon: 13.7373, centerLat: 51.0504, radiusMeters: 5000 },
    // }).catch((err) => console.error('Failed to load OSM buildings:', err));
    // loadOsmBuildings(main, '/public/shp/gis_osm_buildings_a_07_1')
    // .catch((err) => console.error('Failed to load OSM buildings:', err));
    // loadOsmBuildings(main, '/public/shp/bcn_buildings')
    // .catch((err) => console.error('Failed to load OSM buildings:', err));
    // loadOsmBuildings(main, '/public/shp/gis_osm_buildings_a_07_1', {
    //   nearPoint: { centerLon: 13.7373, centerLat: 51.0504, radiusMeters: 20 },
    // }).catch((err) => console.error('Failed to load OSM buildings:', err));
    loadOsmBuildings(main, '/public/shp/bcn_buildings', { skipBuildings: true })
    .catch((err) => console.error('Failed to load OSM buildings:', err));

    // track whether the mouse actually moved between down and up,
    // so we can tell a real click apart from a drag (pan/orbit) release
    const dragState = { startX: 0, startY: 0, dragged: false };
    const DRAG_THRESHOLD = 5; // pixels of movement before it counts as a drag

    const handleMouseDown = (e) => {
      dragState.startX = e.clientX;
      dragState.startY = e.clientY;
      dragState.dragged = false;
    };

    const handleMouseMove = (e) => {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        dragState.dragged = true;
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);

    const handleClick = (e) => {
      if (dragState.dragged) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (drawModeRef.current !== 'none') {
        if (drawModeRef.current === 'polygon' && awaitingHeightRef.current) return;

        const worldPos = main.getWorldPositionAt(x, y);
        console.log('worldPos:', worldPos);
        if (!worldPos) return; 

        console.log(drawingPointsRef.current.map(p => p?.constructor?.name));
        if (drawModeRef.current === 'polygon' && segmentSelfIntersects(drawingPointsRef.current, worldPos)) {
          setCloseMessage('That point would cross an existing edge — try somewhere else');
          return;
        }
        if (drawModeRef.current === 'polygon' && closingEdgeSelfIntersects([...drawingPointsRef.current, worldPos])) {
          setCloseMessage('That point would make the polygon impossible to close without crossing an edge — try somewhere else');
          return;
        }
 
        drawingPointsRef.current.push(worldPos);
        console.log('points so far:', drawingPointsRef.current.length);
        setPointCount(drawingPointsRef.current.length);
        setCloseMessage(null);
 
        clearPreviewScenes(main);

        if (drawModeRef.current === 'polygon') {
          const pointsShape = new MireiaPoints(drawingPointsRef.current, new MireiaColor4(255, 0, 0, 1));
          previewPointsRef.current = pointsShape.getScene();
          main.addOverlayScene(previewPointsRef.current);

          if (drawingPointsRef.current.length >= 2) {
            const LineClass = drawingPointsRef.current.length >= 3 ? MireiaLineLoop : MireiaLineStrip;
            const lineShape = new LineClass(drawingPointsRef.current, new MireiaColor4(1, 0.55, 0, 1));
            previewLineRef.current = lineShape.getScene();
            main.addOverlayScene(previewLineRef.current);
          }
        } else {
          const previewShape = new MireiaPoints(drawingPointsRef.current, new MireiaColor4(255, 0, 0, 1));
          previewPointsRef.current = previewShape.getScene();
          main.addOverlayScene(previewPointsRef.current);
        }
 
        return; // don't fall through to normal selection below
      }

      // normal click: pick object + log depth/world position

      main.selectAt(x, y);

      const depth = main.getFbo().readDepthAt(x, y);
      const worldPos = main.getWorldPositionAt(x, y);

      if (worldPos) {
        //console.log(
        //  `Clicked at screen (${x.toFixed(0)}, ${y.toFixed(0)}) — depth: ${depth.toFixed(4)} — world position: (${worldPos.getX().toFixed(2)}, ${worldPos.getY().toFixed(2)}, ${worldPos.getZ().toFixed(2)})`
        //);
      } else {
        //console.log('Could not compute world position (matrix not invertible or no frame rendered yet)');
      }
    };
    canvas.addEventListener('click', handleClick);

    const handleContextMenu = (e) => {
      e.preventDefault(); 
 
      if (drawModeRef.current === 'none' || drawingPointsRef.current.length === 0) return;
 
      if (drawModeRef.current === 'polygon') {
        if (awaitingHeightRef.current) return;

        if (drawingPointsRef.current.length < 3) {
          setCloseMessage('Need at least 3 points to close a polygon');
          return;
        }

        if (closingEdgeSelfIntersects(drawingPointsRef.current)) {
          setCloseMessage('Closing edge would cross another edge — move or remove a point');
          return; 
        }
        setCloseMessage(null);
        setAwaitingHeight(true); 
        return;
      }

      clearPreviewScenes(main);
 
      let points = drawingPointsRef.current;
 
      if (drawModeRef.current === 'line' && points.length % 2 !== 0) {
        points = points.slice(0, -1);
      }
 
      if (points.length > 0) {
        const finalShape = buildShape(drawModeRef.current, points);
        if (finalShape) {
          main.addOverlayScene(finalShape.getScene());
        }
      }
 
      drawingPointsRef.current = [];
      setPointCount(0);
    };
    canvas.addEventListener('contextmenu', handleContextMenu);

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      stop();
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleModeChange = (e) => {
    const mode = e.target.value;
    setDisplayMode(mode);
    mainRef.current?.setDisplayMode(mode);
  };

  const handleDrawModeChange = (e) => {
    const mode = e.target.value;
    setDrawMode(mode);
    drawingPointsRef.current = [];
    setPointCount(0);
    setAwaitingHeight(false);
    setCloseMessage(null);
    clearPreviewScenes(mainRef.current);
  };

  const handleExtrudeConfirm = () => {
    const height = parseFloat(heightValue);
    const main = mainRef.current;
    const points = drawingPointsRef.current;
    if (!main || !Number.isFinite(height) || height <= 0 || points.length < 3) return;
 
    clearPreviewScenes(main);
 
    const color = new MireiaColor4(1, 0.55, 0, 1);
    const polygon = MireiaPolygon.tryCreate(points, color);
    if (polygon) {
      const extruded = MireiaModeler.extrude(polygon, height, color);
      main.addScene(extruded.getScene());
    }
 
    drawingPointsRef.current = [];
    setPointCount(0);
    setAwaitingHeight(false);
  };
 
  const handleExtrudeCancel = () => {
    clearPreviewScenes(mainRef.current);
    drawingPointsRef.current = [];
    setPointCount(0);
    setAwaitingHeight(false);
  };


  return (
    <>
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100vw', height: '100vh' }}
    />
    <select
      value={displayMode}
      onChange={handleModeChange}
      style={{position: 'absolute', top: 12, left: 12, padding: '6px 10px', fontSize: 14, zIndex: 10,}}>
      <option value="color">Color</option>
      <option value="depth">Depth</option>
      <option value="normal">Normal</option>
      <option value="selection">Selection</option>
    </select>

    <select
      value={drawMode}
      onChange={handleDrawModeChange}
      style={{ position: 'absolute', top: 52, left: 12, padding: '6px 10px', fontSize: 14, zIndex: 10 }}>
      <option value="none">Select (no drawing)</option>
      <option value="point">Draw Points</option>
      <option value="line">Draw Lines</option>
      <option value="lineStrip">Draw Line Strip</option>
      <option value="lineLoop">Draw Line Loop</option>
      <option value="polygon">Draw Polygon</option>
    </select>  

    {drawMode !== 'none' && !awaitingHeight && (
      <div style={{
        position: 'absolute', top: 92, left: 12, padding: '6px 10px',
        fontSize: 13, zIndex: 10, background: 'rgba(0,0,0,0.6)', color: 'white', borderRadius: 4,
      }}>
        Left-click to add points · Right-click to finish ({pointCount} points so far)
      </div>
    )}

    {closeMessage && !awaitingHeight && (
      <div style={{
        position: 'absolute', top: 130, left: 12, padding: '6px 10px',
        fontSize: 13, zIndex: 10, background: 'rgba(180,40,40,0.85)', color: 'white', borderRadius: 4,
      }}>
        {closeMessage}
      </div>
    )}

    {awaitingHeight && (
      <div style={{
        position: 'absolute', top: 92, left: 12, padding: '6px 10px',
        fontSize: 13, zIndex: 10, background: 'rgba(0,0,0,0.6)', color: 'white', borderRadius: 4,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        Height:
        <input
          type="number"
          value={heightValue}
          onChange={(e) => setHeightValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleExtrudeConfirm(); }}
          style={{ width: 60 }}
          autoFocus
        />
        <button onClick={handleExtrudeConfirm}>Extrude</button>
        <button onClick={handleExtrudeCancel}>Cancel</button>
      </div>
    )}
    </>
  );
}

export default App;