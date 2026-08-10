import { useEffect, useRef, useState } from 'react';
import { Main } from './webgl/Main.js';
import { MireiaVec2 } from './webgl/math/MireiaVec2.js';
import { MireiaVec3 } from './webgl/math/MireiaVec3.js';
import { Texture } from './webgl/core/Texture.js';
import { MireiaPolygon } from './webgl/geometry/MireiaPolygon.js';
import { MireiaModeler } from './webgl/geometry/MireiaModeler.js';
import { signedArea } from './webgl/geometry/geometryUtils.js';
import { loadOsmBuildings } from './webgl/shp/loadOsmBuildings.js';

function App() {
  const canvasRef = useRef(null);
  const mainRef = useRef(null);
  const [displayMode, setDisplayMode] = useState('color');

  // removed cube-placing UI

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
    loadOsmBuildings(main, '/public/shp/bcn_buildings')
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
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleModeChange = (e) => {
    const mode = e.target.value;
    setDisplayMode(mode);
    mainRef.current?.setDisplayMode(mode);
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

    {/* Add Cube UI removed */}
    </>
  );
}

export default App;