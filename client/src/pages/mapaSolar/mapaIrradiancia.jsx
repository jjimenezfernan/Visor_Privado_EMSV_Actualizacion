import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap, LayersControl, LayerGroup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import SubUpBarColor from "../../global_components/SubUpBarColor";
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Alert,
  CircularProgress,
  useTheme,
  Switch,
  FormControlLabel 
} from "@mui/material";

import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import * as turf from "@turf/turf";

import { tokens } from "../../data/theme";
import StaticBuildingsLayer from "../../components/BuildingsLayer";
import AdditionalPanel from "../../components/AdditionalPanel";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import MapLoadingOverlay from "../../components/PantallaCarga";

import { DIRECTION, API_BASE } from "../../data/direccion_server";
const EMSV_URL = `${API_BASE}/visor_emsv`;


import { useLayoutEffect } from "react";
import RightLayerPanel from "../../components/RightLayerPanel";
import BuildingsCertificateLayer from "../../components/BuildingsCertificateLayer";
import CertificateLegend from "../../components/CertificateLegend";


// ---- leyenda irradiancia ----
// kWh/m²·año (ajusta rangos si tu dataset tiene otros valores)
// ---- leyenda irradiancia (kWh/m²·a) ----
// rangos de tu imagen
const IRR_BINS = [
  { min: 183.78,  max: 1112.49, color: "#053bd3" },
  { min: 1112.49, max: 1491.41, color: "#28b6f6" },
  { min: 1491.41, max: 1735.46, color: "#6ee7b7" },
  { min: 1735.46, max: 1925.95, color: "#f7e52b" },
  { min: 1925.95, max: 2087.72, color: "#ffaa00" },
  { min: 2087.72, max: 2237.07, color: "#ff7043" },
  { min: 2237.07, max: 2663.09, color: "#d32f2f" },
];

const colorForIrr = (v) => {
  if (v == null || Number.isNaN(v)) return "#cccccc";
  for (const b of IRR_BINS) if (v >= b.min && v < b.max) return b.color;
  // si supera el último max, usamos el último color
  return IRR_BINS[IRR_BINS.length - 1].color;
};




function LegendIrr({ minZoom = 17, maxZoom = 19 }) {
  const map = useMap();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!map) return;
    const check = () => setVisible(map.getZoom() >= minZoom && map.getZoom() <= maxZoom);
    map.on("zoomend", check); check();
    return () => map.off("zoomend", check);
  }, [map, minZoom, maxZoom]);

  if (!visible) return null;

  return (
    <div style={{
      position: "absolute", right: 5, bottom: 20, zIndex: 500,
      pointerEvents: "none", background: "white", padding: "8px 10px",
      borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.15)", font: "12px system-ui"
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Irradiancia (kWh/m²·año)</div>
      {IRR_BINS.map((b, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", margin: "2px 0" }}>
          <span style={{
            display: "inline-block", width: 12, height: 12, borderRadius: 9999,
            background: b.color, marginRight: 8, border: "1px solid #999"
          }} />
          <span>{b.min} – {b.max}</span>
        </div>
      ))}
    </div>
  );
}




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



// ---------- helpers ----------

async function fetchCELSHitsForGeometry(geom, radiusM = 2000) {
  const resp = await fetch(`${API_BASE}/cels/within?radius_m=${radiusM}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ geometry: geom }),
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => "");
    throw new Error(`CELS HTTP ${resp.status}: ${msg}`);
  }
  const json = await resp.json();
  return json.cels || [];
}


const stripAccents = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (s) => stripAccents(String(s ?? "")).toUpperCase().replace(/\s+/g, " ").trim();

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
    map.on("moveend", update);
    update();
    return () => { clearTimeout(t); map.off("moveend", update); };
  }, [map, onBboxChange]);
  return null;
}



const fetchAllPages = async (signal, onBatch) => {
  let offset = 0;
  while (!signal.aborted) {
    const params = new URLSearchParams(paramsBase);
    params.set("offset", String(offset));
    const res = await fetch(`${API_BASE}/irradiance/features?${params}`, { signal });
    if (!res.ok) break;
    const fc = await res.json();
    const feats = fc?.features || [];
    if (!feats.length) break;
    onBatch(feats);
    offset += feats.length;
    if (feats.length < PAGE_LIMIT) break; // last page
    // yield to main thread
    await new Promise(r => setTimeout(r, CHUNK_DELAY));
  }
};



function IrradianceLayer({ bbox, minZoom = 17, maxZoom = 19 }) {
  const map = useMap();
  const currentRef = useRef(null);
  const nextRef = useRef(null);
  const abortRef = useRef(null);
  const prevFetchBBoxRef = useRef(null);
  const rendererRef = useRef(null);

  const paneName = "irr-pane";
  const CHUNK_SIZE = 2000;
  const CHUNK_DELAY = 16;
  const PANE_FADE_MS = 180;

  // helpers
  const setPaneOpacity = (v) => { const p = map?.getPane?.(paneName); if (p) p.style.opacity = String(v); };
  const inRange = () => {
    const z = map?.getZoom?.() ?? 0;
    return z >= minZoom && z <= maxZoom;
  };
  const pointRadiusForZoom = (z) => Math.max(1.2, Math.min(0.6 + (z - 15) * 0.9, 3.5));
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
  const progressivelyAdd = (fc, lyr, signal) => {
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

  // create pane + renderer once
  useEffect(() => {
    if (!map) return;
    if (!map.getPane(paneName)) {
      const p = map.createPane(paneName);
      p.style.zIndex = 430;
      p.style.transition = `opacity ${PANE_FADE_MS}ms ease`;
      p.style.pointerEvents = "none";
      p.style.mixBlendMode = "multiply";
      p.style.opacity = "1";
    }
    if (!rendererRef.current) rendererRef.current = L.canvas({ padding: 0.5 });
  }, [map]);

  // fetch/swap logic
  useEffect(() => {
    if (!map || !bbox || !inRange()) {
      if (currentRef.current) { map.removeLayer(currentRef.current); currentRef.current = null; }
      // make sure pane is visible if we leave the range
      setPaneOpacity(1);
      return;
    }

    const padded = padBBox(bbox, 0.1);
    if (!shouldRefetch(padded, prevFetchBBoxRef.current)) {
      // only update marker radius on zoom
      const r = pointRadiusForZoom(map.getZoom());
      if (currentRef.current) currentRef.current.eachLayer((m) => m.setRadius?.(r));
      return;
    }

    // abort previous
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const params = new URLSearchParams({ bbox: padded.join(","), limit: "100000", offset: "0" });
    const url = `${API_BASE}/irradiance/features?${params}`;

    // start fade (very small fade so it never “sticks invisible”)
    setPaneOpacity(0.2);

    (async () => {
      try {
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const fc = await res.json();
        if (ac.signal.aborted) return;

        const features = fc?.features || [];
        if (!features.length) {
          // nothing new → keep the current layer, just restore opacity
          prevFetchBBoxRef.current = padded;
          setPaneOpacity(1);
          return;
        }

        const r = pointRadiusForZoom(map.getZoom());
        const lyr = L.geoJSON(null, {
          pane: paneName,
          renderer: rendererRef.current,
          interactive: false,
          pointToLayer: (f, latlng) => {
            const v = f.properties?.value;
            const c = colorForIrr(v);
            return L.circleMarker(latlng, {
              radius: 1.5,
              stroke: false,
              fillColor: c,
              fillOpacity: 1.25,   // keep <= 1
              renderer: rendererRef.current,
              pane: paneName,
            });
          },
          style: (f) => {
            const v = f.properties?.value;
            const c = colorForIrr(v);
            return { color: c, weight: 0, fillColor: c, fillOpacity: 1 };
          },
        });

        lyr.addTo(map);
        nextRef.current = lyr;

        // add progressively
        progressivelyAdd(fc, lyr, ac.signal);
        // swap when done (queue a microtask so the last chunk paints)
        setTimeout(() => {
          if (ac.signal.aborted) return;
          if (currentRef.current) map.removeLayer(currentRef.current);
          currentRef.current = nextRef.current;
          nextRef.current = null;
          prevFetchBBoxRef.current = padded;
          setPaneOpacity(1); // ALWAYS restore
        }, CHUNK_DELAY + 4);
      } catch (e) {
        if (e.name !== "AbortError") console.error("Irradiance fetch error:", e);
        // on error/abort also restore opacity
        setPaneOpacity(1);
      }
    })();

    return () => {
      if (nextRef.current) { map.removeLayer(nextRef.current); nextRef.current = null; }
    };
  }, [map, bbox, minZoom, maxZoom]);

  // keep radii in sync on zoom
  useEffect(() => {
    if (!map) return;
    const onZoomEnd = () => {
      const r = pointRadiusForZoom(map.getZoom());
      if (currentRef.current) currentRef.current.eachLayer((m) => m.setRadius?.(r));
    };
    map.on("zoomend", onZoomEnd);
    return () => map.off("zoomend", onZoomEnd);
  }, [map]);

  // cleanup
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (nextRef.current && map) map.removeLayer(nextRef.current);
      if (currentRef.current && map) map.removeLayer(currentRef.current);
      nextRef.current = null;
      currentRef.current = null;
    };
  }, [map]);

  return null;
}


function useMapZoom() {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map?.getZoom?.() ?? 0);
  useEffect(() => {
    const on = () => setZoom(map.getZoom());
    map.on("zoomend", on);
    on();
    return () => map.off("zoomend", on);
  }, [map]);
  return zoom;
}

function LegendContinuous({ bins, title = "Irradiancia (kWh/m²·año)", visible=true }) {
  if (!visible || !bins?.length) return null;
  return (
    <div style={{
      position: "absolute", right: 5, bottom: 20, zIndex: 500,
      pointerEvents: "none", background: "white", padding: "8px 10px",
      borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.15)", font: "12px system-ui"
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
      {bins.map((b,i)=>(
        <div key={i} style={{ display:"flex", alignItems:"center", margin:"2px 0" }}>
          <span style={{
            display:"inline-block", width:12, height:12, borderRadius:9999,
            background:b.color, marginRight:8, border:"1px solid #999"
          }}/>
          <span>{b.min.toFixed(0)} – {b.max.toFixed(0)}</span>
        </div>
      ))}
    </div>
  );
}


// Creates N equal-interval bins for [min,max]
function makeEqualBins(min, max, n = 7) {
  if (!isFinite(min) || !isFinite(max) || min === max) {
    const v = isFinite(min) ? min : 0;
    return [{ min: v, max: v, color: "#cccccc" }];
  }
  const colors = ["#053bd3","#28b6f6","#6ee7b7","#f7e52b","#ffaa00","#ff7043","#d32f2f"];
  const step = (max - min) / n;
  return new Array(n).fill(0).map((_,i) => ({
    min: min + i*step,
    max: i === n-1 ? max : min + (i+1)*step,
    color: colors[Math.min(i, colors.length-1)]
  }));
}

function makeColorForBins(bins) {
  return (v) => {
    if (v == null || Number.isNaN(v)) return "#cccccc";
    for (const b of bins) if (v >= b.min && v <= b.max) return b.color;
    return bins[bins.length-1].color;
  };
}


function BuildingIrradianceLayer({ bbox, onLegendChange,onBuildingClick  }) {
  const map = useMap();
  const layerRef = useRef(null);
  const abortRef = useRef(null);
  const prevBBoxRef = useRef(null);
  const paneName = "bldg-irr-pane";

  useEffect(() => {
    if (!map) return;
    if (!map.getPane(paneName)) {
      const p = map.createPane(paneName);
      p.style.zIndex = 440;           
    }
  }, [map]);

  const shouldRefetch = (b1, b0) => {
    if (!b0) return true;
    const [w1,s1,e1,n1]=b1, [w0,s0,e0,n0]=b0;
    const W=e0-w0, H=n0-s0;
    return Math.abs(w1-w0)>W*0.12 || Math.abs(e1-e0)>W*0.12 || Math.abs(s1-s0)>H*0.12 || Math.abs(n1-n0)>H*0.12;
  };

  useEffect(() => {
    if (!map || !bbox) return;

    if (!shouldRefetch(bbox, prevBBoxRef.current)) return;

    // abort previous fetch
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const params = new URLSearchParams({ bbox: bbox.join(","), limit: "50000", offset: "0" });
    const url = `${API_BASE}/buildings/irradiance?${params}`;

    (async () => {
      try {
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const fc = await res.json();
        if (ac.signal.aborted) return;

        const feats = (fc?.features||[]).filter(f => f?.geometry);
        // compute bins from visible buildings
        const values = feats.map(f => f.properties?.irr_building).filter(v => typeof v === "number" && isFinite(v));
        const min = Math.min(...values);
        const max = Math.max(...values);
        const bins = makeEqualBins(min, max, 7);
        const colorFor = makeColorForBins(bins);
        onLegendChange?.(bins);

        // build layer
        const lyr = L.geoJSON(feats, {
          pane: paneName,
          interactive: true,
          style: (f) => {
            const v = f.properties?.irr_building;
            const c = colorFor(v);
            return {
              color: "#00000030",
              weight: 0.5,
              fillColor: c,
              fillOpacity: 0.8
            };
          },
          onEachFeature: (feature, layer) => {
            // habilita click directamente sobre el polígono pintado
            layer.on("click", () => {
              // si tienes la feature tal cual del buildings, ya lleva `properties.reference`
              if (typeof onBuildingClick === "function") {
                onBuildingClick(feature);
              }
            });
           }
        });

        // swap layer
        if (layerRef.current) map.removeLayer(layerRef.current);
        lyr.addTo(map);
        layerRef.current = lyr;
        prevBBoxRef.current = bbox;
      } catch (e) {
        if (e.name !== "AbortError") console.error("BuildingIrradianceLayer:", e);
        onLegendChange?.(null);
      }
    })();

    return () => { /* nothing */ };
  }, [map, bbox, onLegendChange, onBuildingClick]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (layerRef.current && map) map.removeLayer(layerRef.current);
    };
  }, [map]);

  return null;
}

/* LEYENDA IDEALISTA
function ZoomAwareIrradiance({ bbox }) {
  const zoom = useMapZoom();
  const [legendBins, setLegendBins] = useState(null);

  const showBldg = zoom >= 17 && zoom <= 18;
  const showPts  = zoom >= 19;

  // helpers para etiquetas
  const minVal = legendBins?.[0]?.min;
  const maxVal = legendBins?.[legendBins.length-1]?.max;
  const colors = legendBins?.map(b => b.color) ?? [];

  return (
    <>
      {showPts && bbox && (
        <>
          <IrradianceLayer bbox={bbox} minZoom={19} maxZoom={19} />
          <LegendIrr minZoom={19} maxZoom={19} />
        </>
      )}

      {showBldg && bbox && (
        <>
          <BuildingIrradianceLayer bbox={bbox} onLegendChange={setLegendBins} />
          

          {legendBins?.length ? (
            <TopCenterLegend
              bins={legendBins}
              colors={colors}                 // explícito (opcional; con bins basta)
              leftLabel={`${minVal?.toFixed(0)} kWh/m²·año`}
              rightLabel={`${maxVal?.toFixed(0)} kWh/m²·año`}
              top={10}                        // ajústalo si tienes una topbar
              width={360}                     // anchura de la barra
              height={12}                     // altura de la barra
            />
          ) : null}
        </>
      )}
    </>
  );
}
*/

function ZoomAwareIrradiance({ bbox, pointsOn=true, onBuildingClick }) {
  const zoom = useMapZoom();
  const [legendBins, setLegendBins] = useState(null);

  return (
    <>
      {zoom >= 19 && bbox && (
        <>
          <IrradianceLayer bbox={bbox} minZoom={19} maxZoom={19} />
          <LegendIrr minZoom={19} maxZoom={19} />
        </>
      )}

      {zoom >= 13 && zoom <= 18 && bbox && (
        <>
          <BuildingIrradianceLayer
            bbox={bbox}
            onLegendChange={setLegendBins}
            onBuildingClick={onBuildingClick}   // <-- añade esto
          />
          <LegendContinuous bins={legendBins} visible />
        </>
      )}
    </>
  );
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
      map.getPane("limits-casing").style.zIndex = 460;
    }
    if (!map.getPane("limits-dash")) {
      map.createPane("limits-dash");
      map.getPane("limits-dash").style.zIndex = 461;
    }
  }, [map]);
  return null;
}

// Zoom custom (si lo usas)
function CustomZoom({ min=1, max=19, shadowMin=17, shadowMax=19 }) {
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
  const badgeBg = inRange ? "#10b981" : "#f59e0b";

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


function useFillToBottom(ref, extraBottom = 0) {
  const [h, setH] = useState(400);
  useLayoutEffect(() => {
    const calc = () => {
      if (!ref.current) return;
      const top = ref.current.getBoundingClientRect().top;
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

function AutoInvalidateOnResize({ observeRef }) {
  const map = useMap();
  useEffect(() => {
    if (!observeRef?.current) return;
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(observeRef.current);
    map.invalidateSize({ animate: false });
    return () => ro.disconnect();
  }, [map, observeRef]);
  return null;
}

function CelsBufferLayer({ radiusMeters = 2000 }) {
  const map = useMap();
  const layerRef = useRef(null);
  const abortRef = useRef(null);
  const paneName = "cels-pane";

  useEffect(() => {
    if (!map) return;
    if (!map.getPane(paneName)) {
      map.createPane(paneName);
      const p = map.getPane(paneName);
      p.style.zIndex = 560;
      p.style.pointerEvents = "none";
    }
  }, [map]);

  useEffect(() => {
    if (!map) return;

    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (abortRef.current) abortRef.current.abort();

    const ac = new AbortController();
    abortRef.current = ac;

    const cityBBox = [-3.766250610351563, 40.279394708323274, -3.685398101806641, 40.32560453181949];
    const params = new URLSearchParams({ bbox: cityBBox.join(","), limit: "20000", offset: "0" });
    const url = `${API_BASE}/cels/features?${params}`;

    (async () => {
      try {
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (ac.signal.aborted) return;

        const group = L.layerGroup([], { pane: paneName });

        (data.features || []).forEach((f) => {
          // centro
          let lat, lng;
          if (f.geometry?.type === "Point") {
            const [x, y] = f.geometry.coordinates;
            lng = x; lat = y;
          } else {
            const center = L.geoJSON(f.geometry).getBounds().getCenter();
            lat = center.lat; lng = center.lng;
          }

          // radio (solo tamaño)
          const radio = Number.isFinite(Number(f.properties?.radio))
            ? Number(f.properties.radio)
            : radiusMeters;

          // ✅ tipo (color)
          const isAC = Number(f.properties?.auto_CEL) === 2;
          const fill = isAC ? "#ef4444" : "#2563eb";   // AC rojo, CEL azul
          const stroke = fill;                         // o "#111827" si quieres borde negro
          const weight = isAC ? 3 : 2;

          const ring = L.circle([lat, lng], {
            radius: radio,
            color: stroke,
            weight,
            fillColor: fill,
            fillOpacity: 0.22,
            pane: paneName,
            interactive: false,
            bubblingMouseEvents: false,
          });

          const dot = L.circleMarker([lat, lng], {
            radius: 4,
            color: stroke,
            weight: 2,
            fillColor: fill,
            fillOpacity: 1,
            pane: paneName,
            interactive: false,
            bubblingMouseEvents: false,
          });

          group.addLayer(ring);
          group.addLayer(dot);
        });

        group.addTo(map);
        layerRef.current = group;
      } catch (e) {
        if (e.name !== "AbortError") console.error("CELS fetch error:", e);
      }
    })();

    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (layerRef.current && map) map.removeLayer(layerRef.current);
      layerRef.current = null;
    };
  }, [map, radiusMeters]);

  return null;
}




export default function NewMap() {

  const [satelliteOn, setSatelliteOn] = useState(false);
  const prevLayersRef = useRef(null);


  const [certMode, setCertMode] = useState(null);


  const bounds = [
    [40.279393, -3.766208],
    [40.338090, -3.646864],
  ];

  async function handleSearchBoxFeature(payload) {
    const feature = payload?.feature ?? payload;     // tolerante
    const popupHtml = payload?.popupHtml ?? null;

    // centrar/seleccionar
    highlightSelectedFeature(mapRef.current, feature, popupHtml);

    // métricas del edificio
    const ref = feature?.properties?.reference;
    setBRef(ref || null);
    setBMetrics(null);
    setBMetricsError("");
    setBMetricsLoading(!!ref);

    if (ref) {
      try {
        const { metrics } = await fetchBuildingMetricsByRef(ref);
        setBMetrics(metrics);
      } catch (e) {
        setBMetricsError(e.message || "No se pudieron cargar las métricas.");
      } finally {
        setBMetricsLoading(false);
      }
    }

    // sombras + CELS (igual que antes)
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

      const stats = await fetch(`${API_BASE}/shadows/zonal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geometry: geom }),
      }).then(r => r.json());

      setBStats(stats);

      try {
        setCelsHitsError("");
        setCelsHitsLoading(true);
        setCelsHits([]);

        const hits = await fetchCELSHitsForGeometry(geom, 2000);
        setCelsHits(hits);
      } catch (e) {
        console.error("Error fetching CELS for building:", e);
        setCelsHitsError("No se pudo determinar qué CELS incluyen este edificio.");
        setCelsHits([]);
      } finally {
        setCelsHitsLoading(false);
      }
    } catch (e) {
      console.error(e);
      setBStatsError("No se pudieron calcular las estadísticas de sombras para este edificio.");
    } finally {
      setBStatsLoading(false);
    }
  }


  function handleSearchBoxReset() {
    clearSelectionAndPopup();
    setBStats(null);
    setBStatsError("");
    setBStatsLoading(false);
    setCelsHits([]);
    setCelsHitsError("");
    setCelsHitsLoading(false);
    setBRef(null);
    setBMetrics(null);
    setBMetricsError("");
    setBMetricsLoading(false);
  }


  const [bRef, setBRef] = useState(null);
  const [bMetrics, setBMetrics] = useState(null);
  const [bMetricsLoading, setBMetricsLoading] = useState(false);
  const [bMetricsError, setBMetricsError] = useState("");

  async function fetchBuildingMetricsByRef(reference) {
    const res = await fetch(`${API_BASE}/buildings/metrics?reference=${encodeURIComponent(reference)}`);
    if (!res.ok) throw new Error(res.status === 404 ? "Sin métricas" : `HTTP ${res.status}`);
    return res.json();
  }


  const [celsHits, setCelsHits] = useState([]);     // CELS that include the selected building
  const [celsHitsLoading, setCelsHitsLoading] = useState(false);
  const [celsHitsError, setCelsHitsError] = useState("");

  const [irradianceVisible, setIrradianceVisible] = useState(true); 
  const [celsVisible, setCelsVisible] = useState(true);
  const [certificateVisible, setCertificateVisible] = useState(false);


  const mapBoxRef = useRef(null);
  const mapHeight = useFillToBottom(mapBoxRef, 8);

  const [shadowsVisible, setShadowsVisible] = useState(false);
  

  const [buildingsLoaded, setBuildingsLoaded] = useState(false);
  const [celsLoaded, setCelsLoaded] = useState(false);

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

  // --- estadísticas del edificio ---
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

  const shadowsGroupRef = useRef(null);
  const celsGroupRef = useRef(null);


  const toggleCertificateMode = (mode) => {
    setCertMode((prev) => (prev === mode ? null : mode));
  };

  useEffect(() => {
    const certOn = Boolean(certMode);

    if (certOn) {
      setIrradianceVisible(false);
      setCelsVisible(false);
      setShadowsVisible(false); // opcional
    } else {
      setIrradianceVisible(true);
      setCelsVisible(true);
    }
  }, [certMode]);

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
        console.log("EMSV keys:", Object.keys(data));
        console.log("calles count:", Object.keys(data.calles_num_ref || {}).length);


        setGeoLimites(data.geo_limites_getafe_emsv ?? null);
        setGeoConViv(data.geo_emsv_parcela_con_vivienda ?? null);
        setGeoSinViv(data.geo_emsv_parcela_sin_vivienda ?? null);
        setJsonRef(data.calles_num_ref ?? data.json_emsv_calle_num_reference ?? null);

      } catch (e) {
        setErrorEmsv("No se pudo cargar el índice de direcciones.");
      } finally {
        if (!cancelled) setLoadingEmsv(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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




  const clearSelectionAndPopup = () => {
    const map = mapRef.current;
    if (!map) return;
    if (selectionRef.current) {
      map.removeLayer(selectionRef.current);
      selectionRef.current = null;
    }
    map.closePopup();
  };


  const handleBuildingClick = async (feature) => {
    highlightSelectedFeature(mapRef.current, feature);
    const reference = feature?.properties?.reference;
    setBRef(reference || null);
    setBMetrics(null);
    setBMetricsError("");
    setBMetricsLoading(!!reference);

    if (reference) {
      try {
        const { metrics } = await fetchBuildingMetricsByRef(reference);
        setBMetrics(metrics);
      } catch (e) {
        setBMetricsError(e.message || "No se pudieron cargar las métricas.");
      } finally {
        setBMetricsLoading(false);
      }
    }

  
    let geom = feature?.geometry ?? feature;
    if (geom?.type === "Point" && Array.isArray(geom.coordinates)) {
      const [x, y] = geom.coordinates;
      const circle = turf.circle([x, y], 8, { units: "meters", steps: 48 });
      geom = circle.geometry;
    }

    // 1) sombras (igual que antes)
    try {
      setBStatsError("");
      setBStatsLoading(true);
      setBStats(null);

      const stats = await fetch(`${API_BASE}/shadows/zonal`, {
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

    // 2) CELS — usa el helper y NO /cels/within-building
    try {
      setCelsHitsError("");
      setCelsHitsLoading(true);
      setCelsHits([]);

      const hits = await fetchCELSHitsForGeometry(geom, 2000);
      setCelsHits(hits);
    } catch (e) {
      console.error("Error fetching CELS for building:", e);
      setCelsHitsError("No se pudo determinar qué CELS incluyen este edificio.");
      setCelsHits([]);
    } finally {
      setCelsHitsLoading(false);
    }
  };


    useEffect(() => {
      const p = mapRef.current?.getPane?.("cels-pane");
      if (p) p.style.opacity = celsVisible ? "1" : "0";
    }, [celsVisible]);


  useEffect(() => {
    if (satelliteOn) {
      prevLayersRef.current = {
        irradianceVisible,
        certificateVisible,
        certMode,
        shadowsVisible,
      };

      // Apaga capas para que el satélite se vea limpio
      setIrradianceVisible(false);
      setCertificateVisible(false);
      setCertMode(null);
      setShadowsVisible(false);

      // 👇 Importante: NO tocamos celsVisible (lo dejas como esté)
    } else {
      const prev = prevLayersRef.current;
      if (prev) {
        setIrradianceVisible(prev.irradianceVisible);
        setCertificateVisible(prev.certificateVisible);
        setCertMode(prev.certMode);
        setShadowsVisible(prev.shadowsVisible);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satelliteOn]);


  return (
    <>
      <SubUpBarColor
        title={"Visor de datos públicos de potencial fotovoltaico y comunidades energéticas"}
        crumbs={[["Inicio", "/"], ["Visor EPIU", "/visor-epiu"]]}
        info={{ title: "Visor de datos públicos de potencial fotovoltaico y comunidades energéticas", description: (<Typography />) }}
        bgColor="#F0BE00"
        borderColor="#F0BE00"
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
              <Paper
                elevation={3}
                sx={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  zIndex: 1000,
                  p: 1,
                  borderRadius: 2,
                  pointerEvents: "auto",
                }}
              >
                <FormControlLabel
                  sx={{ m: 0 }}
                  control={
                    <Switch
                      checked={satelliteOn}
                      onChange={(e) => setSatelliteOn(e.target.checked)}
                      size="small"
                    />
                  }
                  label={<Typography sx={{ fontSize: 12, fontWeight: 600 }}>Satélite</Typography>}
                />
              </Paper>
              <MapContainer
                center={[40.307927, -3.732297]}
                minZoom={14}
                maxZoom={19}
                zoom={mapProps.zoom}
                maxBounds={bounds}
                maxBoundsViscosity={1.0}
                zoomControl={false}
                style={{ height: "100%", width: "100%", background: "#f3f4f6" }}
              >
                <AutoInvalidateOnResize observeRef={mapBoxRef} />
                <MapLoadingOverlay loading={!buildingsLoaded} />
                <StaticBuildingsLayer
                  apiBase={API_BASE}
                  onLoadComplete={() => setBuildingsLoaded(true)}
                  onBuildingClick={handleBuildingClick}
                  clickable={!shadowsVisible && !(certificateVisible && certMode)}
                />
                <BindMapRef mapRef={mapRef} />
                <SetupLimitPanes />
                <BboxWatcher onBboxChange={setBbox} />
                {!satelliteOn ? (
                  <TileLayer
                    key="base-map"
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                    subdomains={["a", "b", "c", "d"]}
                    maxZoom={19}
                    opacity={0.8}
                    zIndex={0}
                  />
                ) : (
                  <TileLayer
                    key="base-sat"
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution="Tiles &copy; Esri"
                    maxZoom={19}
                    opacity={1}
                    zIndex={0}
                  />
                )}
                
                <CertificateLegend visible={certificateVisible && !!certMode} mode={certMode} />

                {/* 
                {irradianceVisible && (
                  <>
                    {bbox && <IrradianceLayer  bbox={bbox} minZoom={17} maxZoom={19} />}
                    <LegendIrr  minZoom={17} maxZoom={19} />
                  </>
                )}
                */}
                {irradianceVisible && <ZoomAwareIrradiance bbox={bbox} onBuildingClick={handleBuildingClick} />}



                {celsVisible && <CelsBufferLayer radiusMeters={2000} />}
                

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
                
                
                
                {certificateVisible && certMode && (
                  <BuildingsCertificateLayer
                    bbox={bbox}
                    mode={certMode}              
                    apiBase={API_BASE}
                    onBuildingClick={handleBuildingClick}
                  />
                )}
                
              </MapContainer>
            </Box>
          </Grid>

          <Grid item xs={12} md={4}>
            <Stack spacing={1} sx={{ height: "100%" }}>
              {/* Panel de capas (Irradiance / CELS / Certificate) */}
              <RightLayerPanel
                irradianceOn={irradianceVisible}
                celsOn={celsVisible}
                certificateOn={certificateVisible}
                certMode={certMode}
                onSelectCertificateMode={(mode) => {
                  if (!certificateVisible) setCertificateVisible(true);
                  setCertMode(mode);
                }}
                onClearCertificateMode={() => setCertMode(null)}
                zoom={mapRef.current?.getZoom?.() ?? 0}
                celsHits={celsHits}
                celsHitsLoading={celsHitsLoading}
                celsHitsError={celsHitsError}
                onToggleIrradiance={() => setIrradianceVisible(v => !v)}
                onToggleCELS={() => setCelsVisible(v => !v)}
                onToggleCertificate={() => {
                  setCertificateVisible(v => {
                    const next = !v;
                    if (next) {
                      setIrradianceVisible(false);
                      setCelsVisible(false);
                      setShadowsVisible(false);
                      // si no hay modo aún, puedes dejar uno por defecto:
                      setCertMode(prev => prev || "co2");
                    } else {
                      setCertMode(null);
                    }
                    return next;
                  });
                }}
                onJumpToIrradianceZoom={() => {
                  const z = mapRef.current?.getZoom?.() ?? 0;
                  const target = z < 17 ? 17 : z > 18 ? 18 : z;
                  mapRef.current?.flyTo(mapRef.current.getCenter(), target, { duration: 0.6 });
                }}
                buildingRef={bRef}
                buildingMetrics={bMetrics}
                buildingMetricsLoading={bMetricsLoading}
                buildingMetricsError={bMetricsError}
                shadowStats={bStats}
                shadowLoading={bStatsLoading}
                shadowError={bStatsError}
                searchJsonRef={jsonRef}
                searchLoading={loadingEmsv}
                searchApiBase={API_BASE}
                onSearchFeature={handleSearchBoxFeature}
                onSearchReset={handleSearchBoxReset}
              />


              {/*
              <AdditionalPanel stats={bStats} loading={bStatsLoading} error={bStatsError} />
              */}
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