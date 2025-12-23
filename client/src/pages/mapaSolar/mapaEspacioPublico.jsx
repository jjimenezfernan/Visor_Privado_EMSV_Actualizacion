// newMap.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { 
  Box, 
  Typography, 
  Paper, 
  TextField, 
  Button, 
  Alert, 
  CircularProgress, 
  useTheme, 
  Select, 
  Autocomplete,
  Switch
} from "@mui/material";

import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import * as turf from "@turf/turf";

import { tokens } from "../../data/theme";
import SearchBoxEMSV from "../../components/SearchBoxEMSV"; 
import StaticBuildingsLayer from "../../components/BuildingsLayer";
import AdditionalPanel from "../../components/AdditionalPanel"; 
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import MapLoadingOverlay from "../../components/PantallaCarga"; 
import { useLayoutEffect } from "react";
import { Selections } from "../../constants/MapConstantsParcelas";

import ParcelsLayer from "../../components/ParcelsLayer";
import { DIRECTION, API_BASE } from "../../data/direccion_server";
import SubUpBarColor from "../../global_components/SubUpBarColor";
const EMSV_URL = `${DIRECTION}/api/visor_emsv`;


console.log("DIRECTION =", DIRECTION);
console.log("API_BASE  =", API_BASE);

// ---- leyenda ----
const BINS = [
  { min: 2,  max: 4,  color: "#d1d5db" },
  { min: 4,  max: 6,  color: "#9ca3af" },
  { min: 6,  max: 8,  color: "#6b7280" },
  { min: 8,  max: 10, color: "#4b5563" },
  { min: 10, max: 17, color: "#111827" },
];
const colorForShadowCount = (v) => {
  if (v == null) return "#cccccc";
  for (const b of BINS) if (v >= b.min && v < b.max) return b.color;
  if (v >= BINS[BINS.length - 1].min) return BINS[BINS.length - 1].color;
  return "#cccccc";
};


const SHADOW_BINS = [
  { min: 2,  max: 4,  color: "#d1d5db" },
  { min: 4,  max: 6,  color: "#9ca3af" },
  { min: 6,  max: 8,  color: "#6b7280" },
  { min: 8,  max: 10, color: "#4b5563" },
  { min: 10, max: 17, color: "#111827" },
];

const colorShadow = (v) => {
  if (v == null) return "#cccccc";
  for (const b of SHADOW_BINS)
    if (v >= b.min && v < b.max) return b.color;
  return SHADOW_BINS.at(-1).color;
};

const IRRADIANCE_BINS = [
  { min: 2,  max: 4,  color: "#d32f2f" }, // rojo (poca sombra)
  { min: 4,  max: 6,  color: "#ff7043" }, // naranja
  { min: 6,  max: 8,  color: "#f7e52b" }, // amarillo
  { min: 8,  max: 10, color: "#6ee7b7" }, // verde/menta
  { min: 10, max: 17, color: "#053bd3" }, // azul (mucha sombra)
];






const mapRange = (x, inMin, inMax, outMin, outMax) => {
  if (x == null) return null;
  const t = (x - inMin) / (inMax - inMin);
  const tt = Math.max(0, Math.min(1, t));
  return outMin + tt * (outMax - outMin);
};

const colorIrradiance = (v) => {
  if (v == null) return "#cccccc";
  for (const b of IRRADIANCE_BINS)
    if (v >= b.min && v < b.max) return b.color;
  return IRRADIANCE_BINS.at(-1).color;
};


const colorForValue = (feature, colorMode) => {
  const sc = feature.properties?.shadow_count;
  if (sc == null) return "#cccccc";

  if (colorMode === "irradiancia") {
    // Mismos tramos 2–4, 4–6, 6–8, 8–10, 10–17 pero con colores rojo→azul
    return colorIrradiance(sc);
  }

  return colorShadow(sc);
};




const colorHeatFromShadow = (shadowCount) => {
  // Ajusta rango a tus datos reales:
  const minS = 2;   // poca sombra
  const maxS = 17;  // mucha sombra

  const t = Math.max(0, Math.min(1, (shadowCount - minS) / (maxS - minS)));
  // t=0 (poca sombra) => rojo, t=1 (mucha sombra) => azul
  const r = Math.round(220 * (1 - t) + 30 * t);
  const g = Math.round(40  * (1 - t) + 80 * t);
  const b = Math.round(40  * (1 - t) + 220 * t);

  return `rgb(${r},${g},${b})`;
};


// ---------- helpers (normalización y lookup) ----------
const stripAccents = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (s) =>
  stripAccents(String(s ?? ""))
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();




function BboxWatcher({ onBboxChange }) {
  const map = useMap();
  useEffect(() => {
    let t;
    const DEBOUNCE = 280;
    const update = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const b = map.getBounds();
        onBboxChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      }, DEBOUNCE);
    };
    map.on("moveend", update); // evita "move" para no refetchear durante el arrastre
    update();
    return () => { clearTimeout(t); map.off("moveend", update); };
  }, [map, onBboxChange]);
  return null;
}




function ObrasLayer({ visible, onSelectObra }) {
  const map = useMap();
  const layerRef = useRef(null);
  const cacheRef = useRef(new Map());

  useEffect(() => {
    if (!map) return;

    const paneName = "obras-pane";
    if (!map.getPane(paneName)) {
      map.createPane(paneName);
      map.getPane(paneName).style.zIndex = 1500;
    }

    // ✅ NUEVO: pane para popups de obras (por encima de los puntos)
    const popupPaneName = "obras-popup-pane";
    if (!map.getPane(popupPaneName)) {
      map.createPane(popupPaneName);
      map.getPane(popupPaneName).style.zIndex = 3000; // > 1500, así siempre queda arriba
      map.getPane(popupPaneName).style.pointerEvents = "auto";
    }

    if (!visible) {
      if (layerRef.current) map.removeLayer(layerRef.current);
      layerRef.current = null;
      return;
    }

    const fg = L.featureGroup([], { pane: paneName }).addTo(map);
    layerRef.current = fg;

    const fetchObras = async () => {
      const res = await fetch(`${API_BASE}/obras?limit=500&offset=0`);
      const data = await res.json();
      const items = data.items || [];
      const cache = cacheRef.current;

      for (const o of items) {
        const key = o.reference || `${o.street_norm}#${o.number_norm}`;
        let feature = cache.get(key);

        if (!feature) {
          const qs = new URLSearchParams({
            street: o.street_norm,
            number: String(o.number_norm ?? ""),
            include_feature: "true",
          });
          const r = await fetch(`${API_BASE}/address/lookup?${qs}`);
          if (!r.ok) continue;
          const d = await r.json();
          feature = d.feature;
          cache.set(key, feature);
        }

        if (!feature?.geometry) continue;

        const c = feature.geometry.type === "Point"
          ? feature.geometry.coordinates
          : turf.centroid(feature).geometry.coordinates;

        const [lng, lat] = c;

        const m = L.circleMarker([lat, lng], {
          pane: paneName,
          radius: 7,
          weight: 2,
          color: "#2563eb",
          fillColor: "#60a5fa",
          fillOpacity: 0.9,
        });

        // ✅ popup al click (EN EL PANE ALTO)
        m.on("click", (e) => {
          // ✅ evita que el click llegue al mapa y cierre el popup
          L.DomEvent.stopPropagation(e);

          onSelectObra?.(o);

         
         
        });


        m.addTo(fg);
      }
    };

    fetchObras();

    return () => {
      if (layerRef.current) map.removeLayer(layerRef.current);
      layerRef.current = null;
    };
  }, [map, visible]);

  return null;
}



function Legend({ colorMode, minZoom = 17, maxZoom = 18 }) {
  const map = useMap();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!map) return;
    const check = () => {
      const z = map.getZoom();
      setVisible(z >= minZoom && z <= maxZoom);
    };
    map.on("zoomend", check);
    check();
    return () => map.off("zoomend", check);
  }, [map, minZoom, maxZoom]);

  if (!visible) return null;

  const bins = colorMode === "irradiancia" ? IRRADIANCE_BINS : SHADOW_BINS;
  const title = colorMode === "irradiancia" ? "Irradiancia (por horas de sombra)" : "Horas de sombra";

  return (
    <div style={{
      position: "absolute", right: 12, bottom: 12, zIndex: 1000,
      background: "white", padding: "8px 10px", borderRadius: 8,
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)", font: "12px system-ui"
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
      {bins.map((b, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", margin: "2px 0" }}>
          <span style={{
            display: "inline-block", width: 12, height: 12, borderRadius: 9999,
            background: b.color, marginRight: 8, border: "1px solid #999"
          }} />
          <span>{b.min} – {b.max} h</span>
        </div>
      ))}
    </div>
  );
}






// Indicador de zoom + sugerencia para sombras (versión top-right)
function ZoomStatus({ minZoom = 17, maxZoom = 18 }) {
  const map = useMap();
  const [z, setZ] = useState(() => map?.getZoom?.() ?? 0);

  useEffect(() => {
    if (!map) return;
    const update = () => setZ(map.getZoom());
    map.on("zoomend", update);
    update(); // estado inicial
    return () => map.off("zoomend", update);
  }, [map]);

  const inRange = z >= minZoom && z <= maxZoom;
  const needText =
    z < minZoom
      ? `Acércate ${minZoom - z} nivel${minZoom - z === 1 ? "" : "es"} para ver sombras`
      : z > maxZoom
      ? `Aléjate ${z - maxZoom} nivel${z - maxZoom === 1 ? "" : "es"} para ver sombras`
      : "Sombras activas en este zoom";

  const targetZoom = z < minZoom ? minZoom : z > maxZoom ? maxZoom : z;
  const badgeBg = inRange ? "#10b981" /* verde */ : "#f59e0b" /* ámbar */;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
      }}
    >
      {/* Nivel de zoom actual */}
      <div
        style={{
          background: "white",
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          padding: "6px 10px",
          font: "12px system-ui",
          display: "flex",
          alignItems: "center",
          gap: 8,
          minWidth: 90,
          justifyContent: "flex-end",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            borderRadius: 9999,
            background: badgeBg,
          }}
        />
        <strong>Zoom:</strong> {z}
      </div>

      {/* Mensaje de ayuda */}
      <div
        style={{
          background: "white",
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          padding: "8px 10px",
          font: "12px system-ui",
          textAlign: "right",
          maxWidth: 230,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Sombras</div>
        <div style={{ marginBottom: inRange ? 0 : 6 }}>
          {inRange ? "Sombras activas (niveles 17–18)." : needText}
        </div>
        {!inRange && (
          <button
            onClick={() =>
              map.flyTo(map.getCenter(), targetZoom, { duration: 0.6 })
            }
            style={{
              border: "none",
              background: "#3b82f6",
              color: "white",
              borderRadius: 6,
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            Ir a zoom {targetZoom}
          </button>
        )}
      </div>
    </div>
  );
}




function ShadowsLayer({ bbox, mode, visible = true, minZoom = 16, maxZoom = 19 }) {
  const map = useMap();
  const currentRef = useRef(null);
  const nextRef = useRef(null);
  const abortRef = useRef(null);
  const prevFetchBBoxRef = useRef(null);
  const paneName = "shadows-pane";
  const rendererRef = useRef(null);

  // tuning del progresivo
  const CHUNK_SIZE = 2000;   // nº de features por “oleada”
  const CHUNK_DELAY = 16;    // ms entre oleadas (≈ 1 frame). Sube a 30–50 si va muy denso.
  const PANE_FADE_MS = 220;  // crossfade del pane

  useEffect(() => {
    if (!map) return;

    if (!map.getPane(paneName)) {
      map.createPane(paneName);
      const p = map.getPane(paneName);
      p.style.zIndex = 420; // Below buildings (440)
      p.style.transition = `opacity ${PANE_FADE_MS}ms ease`;
      p.style.mixBlendMode = "multiply";
      p.style.opacity = "1";
      // CRITICAL: This prevents the pane from capturing pointer events
      p.style.pointerEvents = "none"; // ✅ Shadows should NOT capture clicks
    }
    if (!rendererRef.current) {
      rendererRef.current = L.canvas({ padding: 0.5 });
    }
  }, [map]);

  const inRange = () => {
    const z = map?.getZoom?.() ?? 0;
    return z >= minZoom && z <= maxZoom;
  };


  useEffect(() => {
    if (!map) return;
    if (visible) return;
    if (abortRef.current) abortRef.current.abort();
    if (nextRef.current) { map.removeLayer(nextRef.current); nextRef.current = null; }
    if (currentRef.current) { map.removeLayer(currentRef.current); currentRef.current = null; }
    prevFetchBBoxRef.current = null;
  }, [visible, map]);



  const pointRadiusForZoom = (z) => {
    if (z >= 19) return 2.6;   // más grande en 19
    if (z >= 18) return 1.5;   // ligeramente mayor para “cerrar” huecos en 18
    return 1.5;                // por si alguien baja a 17
  };


  const padBBox = ([w, s, e, n], r = 0.12) => {
    const dx = (e - w) * r, dy = (n - s) * r;
    return [w - dx, s - dy, e + dx, n + dy];
  };
  const shouldRefetch = (newB, oldB) => {
    if (!oldB) return true;
    const [w1, s1, e1, n1] = newB; const [w0, s0, e0, n0] = oldB;
    const width = Math.max(1e-9, e0 - w0), height = Math.max(1e-9, n0 - s0);
    return (
      Math.abs(w1 - w0) > width * 0.12 ||
      Math.abs(e1 - e0) > width * 0.12 ||
      Math.abs(s1 - s0) > height * 0.12 ||
      Math.abs(n1 - n0) > height * 0.12
    );
  };

  // render progresivo de un FeatureCollection a una L.geoJSON vacía
  const progressivelyAdd = async (fc, lyr, signal) => {
    const feats = fc.features || [];
    let i = 0;

    const step = () => {
      if (signal.aborted) return;
      const next = feats.slice(i, i + CHUNK_SIZE);
      if (next.length) {
        lyr.addData({ type: "FeatureCollection", features: next });
        i += next.length;
        setTimeout(step, CHUNK_DELAY);
      }
    };
    step();
  };


  useEffect(() => {
    if (!visible || !map || !bbox || !inRange()) {
      if (currentRef.current) { map.removeLayer(currentRef.current); currentRef.current = null; }
      return;
    }

   
    const padded = padBBox(bbox, 0.1);
    if (!shouldRefetch(padded, prevFetchBBoxRef.current)) {
      const r = pointRadiusForZoom(map.getZoom());
      if (currentRef.current) currentRef.current.eachLayer((m) => { if (m.setRadius) m.setRadius(r); });
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const params = new URLSearchParams({ bbox: padded.join(","), limit: "100000", offset: "0" });
    const paneEl = map.getPane(paneName);
    const radius = pointRadiusForZoom(map.getZoom());

    (async () => {
      try {
        params.set("table", "puntos_no_parcelas");   // <— NOMBRE DE TU TABLA
        const res = await fetch(`${API_BASE}/shadows/features?${params}`, { signal: ac.signal });
        
        if (!res.ok) return;
        const fc = await res.json();
        console.log("props ejemplo", fc?.features?.[0]?.properties);

        if (ac.signal.aborted) return;

        // capa "siguiente" vacía, añadimos en chunks
        const lyr = L.geoJSON(null, {
          pane: paneName,
          renderer: rendererRef.current,
          interactive: false,
          style: (f) => {
            const c = colorForValue(f, mode);
            return { color: c, weight: 0, fillColor: c, fillOpacity: 0.9 };
          },
          pointToLayer: (f, latlng) => {
            const c = colorForValue(f, mode);
            return L.circleMarker(latlng, {
              radius,
              stroke: false,
              fillColor: c,
              fillOpacity: 0.9,
              pane: paneName,
              interactive: false,
            });
          },
        });

        // Añade la capa y empieza la “aparición” progresiva
        lyr.addTo(map);
        nextRef.current = lyr;
         try {
           if (rendererRef.current && rendererRef.current._resizeCanvas) {
             rendererRef.current._resizeCanvas();
           }
           if (rendererRef.current && rendererRef.current.redraw) {
             rendererRef.current.redraw();
           }
           map.invalidateSize({ animate: false });
         } catch (_) {}

        // pane a 0 -> llenamos -> swap -> a 1 (crossfade)
        if (paneEl) paneEl.style.opacity = "0";
        await progressivelyAdd(fc, lyr, ac.signal);
        if (ac.signal.aborted) return;

        // swap sin quitar pane (ya está en 0; no hay flash)
        if (currentRef.current) map.removeLayer(currentRef.current);
        currentRef.current = nextRef.current;
        nextRef.current = null;

        // sube opacidad (aparecen “poco a poco” y, además, con fade final)
        if (paneEl) paneEl.style.opacity = "1";

        prevFetchBBoxRef.current = padded;
      } catch (e) {
        if (e.name !== "AbortError") console.error("Shadows fetch error:", e);
      }
    })();

    return () => {
      if (nextRef.current) { map.removeLayer(nextRef.current); nextRef.current = null; }
    };
  }, [map, bbox, minZoom, maxZoom, visible, mode]);



  useEffect(() => {
    if (!currentRef.current) return;

    currentRef.current.eachLayer((layer) => {
      const f = layer.feature;
      const c = colorForValue(f, mode);

      // CircleMarker soporta setStyle
      if (layer.setStyle) {
        layer.setStyle({ color: c, fillColor: c, fillOpacity: 0.9, weight: 0 });
      }
    });

    // fuerza redraw del canvas si aplica
    try {
      rendererRef.current?.redraw?.();
    } catch (_) {}
  }, [mode]);


  useEffect(() => {
    if (!map) return;
    const onResize = () => {
       try {
         rendererRef.current?._resizeCanvas?.();
         rendererRef.current?.redraw?.();
       } catch (_) {}
     };
    map.on("resize", onResize);
    
    const onZoomEnd = () => {
      if (!inRange()) {
        if (currentRef.current) { map.removeLayer(currentRef.current); currentRef.current = null; }
        return;
      }
      const r = pointRadiusForZoom(map.getZoom());
      if (currentRef.current) currentRef.current.eachLayer((m) => { if (m.setRadius) m.setRadius(r); });
    };
    map.on("zoomend", onZoomEnd);
    return () => { map.off("zoomend", onZoomEnd); map.off("resize", onResize); };
  }, [map, minZoom, maxZoom]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (nextRef.current && map) map.removeLayer(nextRef.current);
      if (currentRef.current && map) map.removeLayer(currentRef.current);
      nextRef.current = null;
      currentRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    if (!map.getPane(paneName)) {
      map.createPane(paneName);
      const p = map.getPane(paneName);
      p.style.zIndex = 420; // Below buildings (440)
      p.style.transition = `opacity ${PANE_FADE_MS}ms ease`;
      p.style.mixBlendMode = "multiply";
      p.style.opacity = "1";
      // CRITICAL: This prevents the pane from capturing pointer events
      p.style.pointerEvents = "none"; // ✅ Already in your code - good!
    }
    if (!rendererRef.current) {
      rendererRef.current = L.canvas({ padding: 0.5 });
    }
  }, [map]);

  return null;
}


function ZonalDrawControl({ onStats }) {
  const map = useMap();
  const controlRef = useRef(null);

  useEffect(() => {
    const drawn = new L.FeatureGroup();
    map.addLayer(drawn);

    controlRef.current = new L.Control.Draw({
      edit: { featureGroup: drawn },
      draw: { marker:false, polyline:false, polygon:true, rectangle:true, circle:true, circlemarker:false }
    });

    map.addControl(controlRef.current);

    const onCreated = async (e) => {
      const layer = e.layer;
      drawn.addLayer(layer);

      let gj;
      if (layer instanceof L.Circle) {
        const c = layer.getLatLng();
        const r = layer.getRadius();
        gj = turf.circle([c.lng, c.lat], r, { units:"meters", steps:64 });
      } else {
        gj = layer.toGeoJSON();
      }

      const geometry = gj.type === "Feature" ? gj.geometry : gj;

      // 👇 NUEVO endpoint
      const res = await fetch(`${API_BASE}/shadows/zonal_hours?table=puntos_no_parcelas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geometry })
      });

      const stats = await res.json();
      onStats?.(stats);

      // ❌ sin popup
    };

    map.on(L.Draw.Event.CREATED, onCreated);

    return () => {
      map.off(L.Draw.Event.CREATED, onCreated);
      if (controlRef.current) map.removeControl(controlRef.current);
      map.removeLayer(drawn);
    };
  }, [map, onStats]);

  return null;
}


function padBBox([minx, miny, maxx, maxy], padRatio = 0.2) {
  const dx = maxx - minx;
  const dy = maxy - miny;
  const px = dx * padRatio;
  const py = dy * padRatio;
  return [minx - px, miny - py, maxx + px, maxy + py];
}

function limitForZoom(z) {
  if (z <= 12) return 8000;
  if (z <= 14) return 20000;
  if (z <= 16) return 50000;
  return 100000;
}


function BindMapRef({ mapRef }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    console.log("Leaflet map listo:", map);
  }, [map, mapRef]);
  return null;
}

function SetupLimitPanes() {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane("limits-casing")) {
      map.createPane("limits-casing");
      map.getPane("limits-casing").style.zIndex = 460; // debajo del dash
    }
    if (!map.getPane("limits-dash")) {
      map.createPane("limits-dash");
      map.getPane("limits-dash").style.zIndex = 461; // encima
    }
  }, [map]);
  return null;
}



function CustomZoom({ min=1, max=19, shadowMin=17, shadowMax=18 }) {
  const map = useMap();
  const [z, setZ] = useState(() => map?.getZoom?.() ?? 0);

  useEffect(() => {
    const onZoom = () => setZ(map.getZoom());
    map.on("zoomend", onZoom);
    setZ(map.getZoom());
    return () => map.off("zoomend", onZoom);
  }, [map]);

  const zoomIn  = () => map.setZoom(Math.min(max, (map.getZoom() ?? z) + 1));
  const zoomOut = () => map.setZoom(Math.max(min, (map.getZoom() ?? z) - 1));

  const inRange = z >= shadowMin && z <= shadowMax;
  const badgeBg = inRange ? "#10b981" /* verde */ : "#f59e0b" /* ámbar */;

  return (
    <div style={{
      background: "white",
      borderRadius: 10,
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      padding: 10,
      font: "12px system-ui",
      minWidth: 160
    }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ width:10, height:10, borderRadius:9999, background:badgeBg, display:"inline-block" }} />
          <strong>Nivel de zoom</strong>
        </div>
        <span style={{ fontWeight:600 }}>{z}</span>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button
          onClick={zoomIn}
          title="Acercar"
          style={{ flex:1, border:"none", borderRadius:8, padding:"6px 0", cursor:"pointer", background:"#3b82f6", color:"#fff", fontWeight:600 }}
        >+</button>
        <button
          onClick={zoomOut}
          title="Alejar"
          style={{ flex:1, border:"none", borderRadius:8, padding:"6px 0", cursor:"pointer", background:"#6b7280", color:"#fff", fontWeight:600 }}
        >−</button>
      </div>
    </div>
  );
}

function ControlsColumn({ shadowsVisible, onToggleShadows, shadowMin=17, shadowMax=18 }) {
  const map = useMap();
  const [z, setZ] = useState(() => map?.getZoom?.() ?? 0);

  useEffect(() => {
    const onZoom = () => setZ(map.getZoom());
    map.on("zoomend", onZoom);
    setZ(map.getZoom());
    return () => map.off("zoomend", onZoom);
  }, [map]);

  const inRange = z >= shadowMin && z <= shadowMax;
  const needText =
    z < shadowMin
      ? `Acércate ${shadowMin - z} nivel${shadowMin - z === 1 ? "" : "es"} para ver sombras`
      : z > shadowMax
      ? `Aléjate ${z - shadowMax} nivel${z - shadowMax === 1 ? "" : "es"} para ver sombras`
      : "Sombras activas (niveles 17–18).";
  const targetZoom = z < shadowMin ? shadowMin : z > shadowMax ? shadowMax : z;

  return (
    <div style={{
      position:"absolute", top:12, right:12, zIndex:1000,
      display:"flex", flexDirection:"column", alignItems:"flex-end", gap:10
    }}>
      {/* (1) Botón sombras */}
      <button
        onClick={onToggleShadows}
        style={{
          border:"none",
          background: shadowsVisible ? "#3b82f6" : "#6b7280",
          color:"#fff",
          borderRadius:10,
          padding:"8px 12px",
          cursor:"pointer",
          fontWeight:700,
          display:"flex", alignItems:"center", gap:8,
          boxShadow:"0 2px 8px rgba(0,0,0,0.15)"
        }}
      >
        <span role="img" aria-label="sol">☀️</span>
        {shadowsVisible ? "Ocultar sombras" : "Mostrar sombras"}
      </button>

      {/* (2) Zoom con punto verde/ámbar */}
      <CustomZoom min={14} max={18} shadowMin={shadowMin} shadowMax={shadowMax} />

      {/* (3) Tarjeta Sombras */}
      <div style={{
        background:"white",
        borderRadius:10,
        boxShadow:"0 2px 8px rgba(0,0,0,0.15)",
        padding:"10px 12px",
        font:"12px system-ui",
        minWidth: 240
      }}>
        <div style={{ fontWeight:700, marginBottom:6 }}>Sombras</div>
        <div style={{ marginBottom: inRange ? 0 : 8 }}>
          {needText}
        </div>
        {!inRange && (
          <button
            onClick={() => map.flyTo(map.getCenter(), targetZoom, { duration: 0.6 })}
            style={{
              border:"none",
              background:"#3b82f6",
              color:"#fff",
              borderRadius:8,
              padding:"6px 10px",
              cursor:"pointer",
              fontWeight:600
            }}
          >
            Ir a zoom {targetZoom}
          </button>
        )}
      </div>
    </div>
  );
}

function useFillToBottom(ref, extraBottom = 0) {
  const [h, setH] = useState(400);
  useLayoutEffect(() => {
    const calc = () => {
      if (!ref.current) return;
      const top = ref.current.getBoundingClientRect().top; // distancia desde el viewport
      const height = Math.max(300, window.innerHeight - top - extraBottom);
      setH(height);
    };
    calc();
    window.addEventListener("resize", calc);
    window.addEventListener("orientationchange", calc);
    return () => {
      window.removeEventListener("resize", calc);
      window.removeEventListener("orientationchange", calc);
    };
  }, [ref, extraBottom]);
  return h;
}


function InvalidateOnDeps({ deps = [] }) {
  const map = useMap();
  useEffect(() => {
    // siguiente tick, así Leaflet mide el tamaño real
    const t = setTimeout(() => map.invalidateSize(), 0);
    return () => clearTimeout(t);
  }, [map, ...deps]);
  return null;
}

function AutoInvalidateOnResize({ observeRef }) {
  const map = useMap();
  useEffect(() => {
    if (!observeRef?.current) return;
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(observeRef.current);
    // también al empezar
    map.invalidateSize({ animate: false });
    return () => ro.disconnect();
  }, [map, observeRef]);
  return null;
}




export default function NewMap() {
  
  const [parcelMode, setParcelMode] = useState("normal"); 


  const [geoParcelasAll, setGeoParcelasAll] = useState(null);


  const [shadowsOn, setShadowsOn] = useState(true);



  const [selectedObra, setSelectedObra] = useState(null);
  const [areaStats, setAreaStats] = useState(null);

  const [obrasOn, setObrasOn] = useState(false);
  
  const [colorMode, setColorMode] = useState("sombras"); // "sombras" | "irradiancia"

  const [buildingsLoaded, setBuildingsLoaded] = useState(false);

  const selectionRef = useRef(null);
  const mapRef = useRef(null); 

  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  const mapProps = useMemo(() => ({ center: [40.305637, -3.730671], zoom: 15 }), []);
  const [bbox, setBbox] = useState(null);
  

  // -------- EMSV datasets --------
  const [loadingEmsv, setLoadingEmsv] = useState(true);
  const [errorEmsv, setErrorEmsv] = useState("");
  const [geoLimites, setGeoLimites] = useState(null);
  const [geoConViv, setGeoConViv] = useState(null);
  const [geoSinViv, setGeoSinViv] = useState(null);
  const [jsonRef, setJsonRef] = useState(null); 

  // ---------- finder UI state ----------
  const [street, setStreet] = useState("");
  const [portal, setPortal] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // --- estadísticas del edificio seleccionado ---
  const [bStats, setBStats] = useState(null);
  const [bStatsLoading, setBStatsLoading] = useState(false);
  const [bStatsError, setBStatsError] = useState("");

  async function fetchZonalStats(geometry) {
    const res = await fetch(`${API_BASE}/shadows/zonal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geometry }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  const mapBoxRef = useRef(null);
  const mapHeight = useFillToBottom(mapBoxRef, 8);


  // fetch EMSV on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingEmsv(true);
        setErrorEmsv("");
        
        
        const res = await fetch(EMSV_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        setGeoLimites(data.geo_limites_getafe_emsv ?? null);
        setGeoConViv(data.geo_emsv_parcela_con_vivienda ?? null);
        setGeoSinViv(data.geo_emsv_parcela_sin_vivienda ?? null);
        setJsonRef(data.json_emsv_calle_num_reference ?? null);
      } catch (e) {
        setErrorEmsv("No se pudo cargar el índice de direcciones.");
      } finally {
        if (!cancelled) setLoadingEmsv(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);




  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch(`${DIRECTION}/api/visor-parcelas`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancel) return;
        setGeoParcelasAll(data.geoParcelas); // <-- aquí viene el GeoJSON
      } catch (e) {
        console.error("visor-parcelas error", e);
      }
    })();
    return () => { cancel = true; };
  }, []);



  function ConjHomoLayer({ geojson, visible, onClickFeature }) {
    const map = useMap();
    const ref = useRef(null);

    useEffect(() => {
      if (!map || !visible || !geojson?.features) {
        if (ref.current) { map.removeLayer(ref.current); ref.current = null; }
        return;
      }

      // pane arriba de parcelas/edificios si quieres
      const paneName = "conj-homo-pane";
      if (!map.getPane(paneName)) {
        map.createPane(paneName);
        map.getPane(paneName).style.zIndex = 430;
      }

      // colores sacados del Selections del visor antiguo
      const values = Selections["especif_conj_homo"].legend.values;
      const gradient = Selections["especif_conj_homo"].legend.gradient;

      const colorFor = (v) => {
        if (!v) return "#bababa";
        const idx = values.indexOf(v);
        return idx >= 0 ? gradient[idx] : "#bababa";
      };

      if (!map.getPane(paneName)) {
        map.createPane(paneName);
        const p = map.getPane(paneName);
        p.style.zIndex = 430;
        p.style.pointerEvents = "none";
      }


      const layer = L.geoJSON(geojson, {
        pane: paneName,
        interactive: false,
        style: (f) => {
          const c = colorFor(f?.properties?.especif_conj_homo);
          return {
            color: c,
            weight: 0.7,
            fillColor: c,
            fillOpacity: 0.55,
            interactive: false, 
          };
        },
      }).addTo(map);


      ref.current = layer;

      return () => {
        if (ref.current) { map.removeLayer(ref.current); ref.current = null; }
      };
    }, [map, geojson, visible, onClickFeature]);

    return null;
  }



  function ConjHomoLegend({ visible, minZoom = 14, maxZoom = 19 }) {
    const map = useMap();
    const [show, setShow] = useState(false);

    useEffect(() => {
      if (!map) return;
      const check = () => {
        const z = map.getZoom();
        setShow(!!visible && z >= minZoom && z <= maxZoom);
      };
      map.on("zoomend", check);
      check();
      return () => map.off("zoomend", check);
    }, [map, visible, minZoom, maxZoom]);

    if (!show) return null;

    const legend = Selections["especif_conj_homo"]?.legend;
    const values = legend?.values ?? [];
    const gradient = legend?.gradient ?? [];

    return (
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: 12,
          zIndex: 1000,
          background: "white",
          padding: "8px 10px",
          borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          font: "12px system-ui",
          maxWidth: 260,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Conjuntos homogéneos</div>

        {values.map((v, i) => (
          <div key={v} style={{ display: "flex", alignItems: "center", margin: "2px 0" }}>
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                borderRadius: 4,
                background: gradient[i] ?? "#bababa",
                marginRight: 8,
                border: "1px solid #999",
              }}
            />
            <span style={{ lineHeight: 1.2 }}>{v}</span>
          </div>
        ))}
      </div>
    );
  }

    
  const availableStreets = useMemo(() => {
    if (!jsonRef) return [];
    
    const streets = new Set();
    
    if (typeof jsonRef === 'object' && !Array.isArray(jsonRef)) {
      Object.keys(jsonRef).forEach(calle => streets.add(calle));
    }
    
    return Array.from(streets).sort((a, b) => 
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );
  }, [jsonRef]);

  const availableNumbers = useMemo(() => {
    if (!jsonRef || !street) return [];
    
    const numbers = new Set();
    
    if (typeof jsonRef === 'object' && !Array.isArray(jsonRef)) {
      const calleData = jsonRef[street];
      if (calleData && typeof calleData === 'object') {
        Object.keys(calleData).forEach(num => numbers.add(num));
      }
    }
    
    return Array.from(numbers).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      return numA - numB;
    });
  }, [jsonRef, street]);

  function clearSelection(map) {
    if (map && selectionRef.current) {
      map.removeLayer(selectionRef.current);
      selectionRef.current = null;
    }
  }

  function highlightSelectedFeature(map, feature, popupHtml) {
    if (!map || !feature) return;

    if (!map.getPane("selection")) {
      map.createPane("selection");
      map.getPane("selection").style.zIndex = 500;
    }
    if (selectionRef.current) {
      map.removeLayer(selectionRef.current);
      selectionRef.current = null;
    }

    const lyr = L.geoJSON(feature, {
      pane: "selection",
      style: { color: "#ff564dff", weight: 1, fillColor: "#ff9f0a", fillOpacity: 0.25 },
      pointToLayer: (_f, latlng) =>
        L.circleMarker(latlng, { radius: 8, color: "#ff3b30", weight: 3, fillColor: "#ff9f0a", fillOpacity: 0.6 })
    }).addTo(map);
    selectionRef.current = lyr;

    const g = feature.geometry;
    if (g?.type === "Point" && Array.isArray(g.coordinates)) {
      const [x, y] = g.coordinates;
      map.setView([y, x], 19);
    } else {
      const b = lyr.getBounds?.();
      if (b && b.isValid()) map.fitBounds(b.pad(0.4));
    }

    if (popupHtml) {
      const center =
        (g?.type === "Point" && Array.isArray(g.coordinates))
          ? L.latLng(g.coordinates[1], g.coordinates[0])
          : (lyr.getBounds?.().getCenter?.());
      if (center) L.popup().setLatLng(center).setContent(popupHtml).openOn(map);
    }
  }




  // dentro de NewMap()
  const clearSelectionAndPopup = () => {
    const map = mapRef.current;
    if (!map) return;
    if (selectionRef.current) {
      map.removeLayer(selectionRef.current);
      selectionRef.current = null;
    }
    map.closePopup();
  };



  const handleSearch = async () => {
    setSearchError("");
    const calle = street.trim();
    const numero = portal.trim();
    
    if (!calle || !numero) {
      setSearchError("Introduce calle y número.");
      return;
    }

    setSearching(true);
    try {
      const qs = new URLSearchParams({
        street: calle,
        number: numero,
        include_feature: "true",
      });
      
      const res = await fetch(`${API_BASE}/address/lookup?${qs}`);
      
      if (!res.ok) {
        setSearchError(res.status === 404 ? "Dirección no encontrada." : `Error ${res.status}`);
        return;
      }
      
      const data = await res.json();
      
      if (!data.feature) {
        setSearchError("Referencia encontrada pero sin geometría.");
        return;
      }

      const feature = data.feature;
      const p = feature.properties || {};

      highlightSelectedFeature(mapRef.current, feature)
      
    } catch (e) {
      console.error(e);
      setSearchError("No se pudo buscar la dirección.");
    } finally {
      setSearching(false);
    }
  };

  const handleReset = () => {
    setStreet("");
    setPortal("");
    setSearchError("");
    clearSelection(mapRef.current);
    clearSelectionAndPopup();
  };

  const bounds = [
    [40.279393, -3.766208],
    [40.338090, -3.646864],
  ];

  const handleBuildingClick = async (feature) => {
    // Pintar selección
    highlightSelectedFeature(mapRef.current, feature);

    // Calcular estadísticas de sombras
    try {
      setBStatsError("");
      setBStatsLoading(true);
      setBStats(null);

      let geom = feature?.geometry ?? feature;
      if (geom?.type === "Point" && Array.isArray(geom.coordinates)) {
        const [x, y] = geom.coordinates;
        const circle = turf.circle([x, y], 8, { units: "meters", steps: 48 });
        geom = circle.geometry;
      }
      
      const stats = await fetch(`${API_BASE}/shadows/zonal?table=puntos_no_parcelas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geometry: geom }),
      }).then(r => r.json());

      setBStats(stats);
    } catch (e) {
      console.error(e);
      setBStatsError("No se pudieron calcular las estadísticas de sombras para este edificio.");
    } finally {
      setBStatsLoading(false);
    }
  };
  

  const binsForMode = colorMode === "irradiancia" ? IRRADIANCE_BINS : SHADOW_BINS;
  const titleForMode = colorMode === "irradiancia" ? "Irradiancia (W/m²)" : "Horas de sombra";


  return (
      <>
        <SubUpBarColor
          title={"Visor de Datos del entorno construido"}
          crumbs={[["Inicio", "/"], ["Visor EPIU", "/visor-epiu"]]}
          info={{ title: "Visor de Datos Públicos de Vivienda", description: (<Typography />) }}
          bgColor="#46A05A"
          borderColor="#46A05A"
        />
        <Box m="10px">
          <Grid container spacing={2} alignItems="stretch">
            <Grid item xs={12} md={8}>
              <Box
              ref={mapBoxRef}
              sx={{
                height: mapHeight,
                minHeight: 380,
                bgcolor: "#f9fafb",
                borderRadius: "10px",
                overflow: "hidden",
                position: "relative",
              }}
              > 
                <Box
                  sx={{
                    position: "absolute",
                    top: 12,
                    left: 12,
                    zIndex: 1000,
                  }}
                >
                </Box>
                <MapContainer
                  center={[40.307927, -3.732297]}
                  minZoom={14}
                  maxZoom={19}
                  zoom={mapProps.zoom}
                  maxBounds={bounds}
                  maxBoundsViscosity={1.0}
                  style={{ height: "100%", width: "100%", background: "#f3f4f6" }}
                > 
                <AutoInvalidateOnResize observeRef={mapBoxRef} />
                  
                  <BindMapRef mapRef={mapRef} />
                  <SetupLimitPanes />
                  <BboxWatcher onBboxChange={setBbox} />
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                    subdomains={["a", "b", "c", "d"]}
                    maxZoom={19}
                    opacity={0.8}
                    zIndex={0}
                  />
                  {/* Botón sencillo para mostrar/ocultar parcelas */}
                  <div
                    style={{
                      position: "absolute",
                      top: 12,
                      right: 12,
                      zIndex: 1000,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                  <div
                    style={{
                      background: "rgba(255,255,255,0.92)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                      font: "12px system-ui",
                      minWidth: 240,
                    }}
                  >
                    {/* Conjuntos homogéneos */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontWeight: 800, flex: 1 }}>Conjuntos homogéneos</div>
                      <div style={{ opacity: 0.85 }}>{parcelMode === "conj_homo" ? "ON" : "OFF"}</div>
                      <Switch
                        size="small"
                        checked={parcelMode === "conj_homo"}
                        onChange={(e) => setParcelMode(e.target.checked ? "conj_homo" : "normal")}
                      />
                    </div>
                  </div>

                  </div>



                  <ShadowsLayer bbox={bbox} mode={colorMode} visible={shadowsOn} minZoom={18} maxZoom={19} />
                  <ParcelsLayer
                    bbox={bbox}
                    minZoom={14}
                    maxZoom={19}
                    mode={parcelMode}
                    onParcelClick={(feature) => highlightSelectedFeature(mapRef.current, feature)}
                  />
                  
                  <ConjHomoLayer
                    geojson={geoParcelasAll}
                    visible={parcelMode === "conj_homo"}
                    onClickFeature={(f) => highlightSelectedFeature(mapRef.current, f)}
                  />

                  <ZonalDrawControl onStats={(s) => setAreaStats(s)} />
                  {geoLimites && (
                    <LayerGeoJSON
                      fc={geoLimites}
                      style={{
                        pane: "limits-dash",
                        color: "#c5c5c5ff",
                        weight: 2,
                        opacity: 1,
                        dashArray: "6 6",
                        fillOpacity: 0,
                        interactive: false,
                        lineCap: "butt",
                        lineJoin: "round",
                        smoothFactor: 1.2,
                      }}
                    />
                  )}
                  <ObrasLayer visible={obrasOn} onSelectObra={setSelectedObra} />

                  {shadowsOn && (
                    <Legend colorMode={colorMode} minZoom={18} maxZoom={19} />
                  )}
                  {parcelMode === "conj_homo" && (
                    <ConjHomoLegend visible={true} minZoom={14} maxZoom={19} />
                  )}

                </MapContainer>
              </Box>
            </Grid>
            <Grid item xs={12} md={4}>
              <Stack spacing={2} sx={{ height: "100%" }}>
                


                <AdditionalPanel
                  obra={selectedObra}
                  obrasOn={obrasOn}
                  onToggleObras={(next) => {
                    setObrasOn(next);

                    // cleanup al apagar
                    if (!next) {
                      setSelectedObra(null);
                      mapRef.current?.closePopup?.();
                    }
                  }}
                  areaStats={areaStats}
                  shadowsOn={shadowsOn}
                  onToggleShadows={(next) => setShadowsOn(next)}
                  shadowsInfo="Mapa de sombras calculado para el 21 de junio."
                  colorMode={colorMode}
                  onToggleColorMode={() => setColorMode(m => (m === "sombras" ? "irradiancia" : "sombras"))}
                />



              </Stack>
            </Grid>
          </Grid>
        </Box>
      </>
    );
  }

function LayerGeoJSON({ fc, style }) {
  const map = useMap();
  const ref = useRef(null);
  useEffect(() => {
    if (!fc) return;
    if (ref.current) { map.removeLayer(ref.current); ref.current = null; }
    const lyr = L.geoJSON(fc, { style });
    lyr.addTo(map);
    ref.current = lyr;
    return () => { if (ref.current) map.removeLayer(ref.current); };
  }, [map, fc, style]);
  return null;
}
