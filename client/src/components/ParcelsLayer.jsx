// ParcelsLayer.jsx
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

function padBBox([w,s,e,n], r=0.10){
  const dx=(e-w)*r, dy=(n-s)*r;
  return [w-dx, s-dy, e+dx, n+dy];
}
function unionBounds(b1, b2) {
  if (!b1) return b2;
  if (!b2) return b1;
  return L.latLngBounds(
    [Math.min(b1.getSouth(), b2.getSouth()), Math.min(b1.getWest(), b2.getWest())],
    [Math.max(b1.getNorth(), b2.getNorth()), Math.max(b1.getEast(), b2.getEast())]
  );
}

export default function ParcelsLayer({ bbox, minZoom=15, maxZoom=19, onParcelClick }) {
  const map = useMap();
  const paneName = "parcels-pane";

  // refs persistentes
  const layerRef = useRef(null);       // L.GeoJSON acumulativa
  const fetchedRef = useRef(null);     // L.LatLngBounds de lo ya cargado
  const abortRef = useRef(null);

  const inRange = () => {
    const z = map?.getZoom?.() ?? 0;
    return z >= minZoom && z <= maxZoom;
  };

  // crear pane
  useEffect(() => {
    if (!map) return;
    if (!map.getPane(paneName)) {
      map.createPane(paneName);
      const p = map.getPane(paneName);
      p.style.zIndex = 430;
      p.style.pointerEvents = "auto"; // ← queremos clics
    }
    // crear capa acumulativa si no existe
    if (!layerRef.current) {
      layerRef.current = L.geoJSON(null, {
        pane: paneName,
        interactive: true,
        style: {
          color: "#ff6969ff",
          weight: 0.5,
          opacity: 0.25,
          fillColor: "#ecb7b7ff",
          fillOpacity: 0.25,
        },
      }).addTo(map);
    }
  }, [map]);

  // fetch incremental solo cuando el bbox nuevo se salga del ya cargado
  useEffect(() => {
    if (!map || !bbox || !inRange()) return;

    // bbox acolchado
    const [w,s,e,n] = padBBox(bbox, 0.10);
    const needBounds = L.latLngBounds([s, w], [n, e]);

    // si ya está cubierto, no pedimos nada
    if (fetchedRef.current && fetchedRef.current.contains(needBounds)) return;

    // cancelar fetch anterior si lo hay
    abortRef.current?.abort?.();
    const ac = new AbortController();
    abortRef.current = ac;

    const params = new URLSearchParams({
      bbox: [w,s,e,n].join(","),
      limit: "500000",  // tu API ya admite alto
      offset: "0",
    });

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/parcels/features?${params}`, { signal: ac.signal });
        if (!res.ok) return;
        const fc = await res.json();
        if (ac.signal.aborted) return;

        // añadir sin borrar lo anterior (capa acumulativa)
        layerRef.current?.addData(fc);

        // ampliar el “extent cargado”
        fetchedRef.current = unionBounds(fetchedRef.current, needBounds);
      } catch (e) {
        if (e.name !== "AbortError") console.error("Parcels fetch error:", e);
      }
    })();

    return () => { ac.abort(); };
  }, [map, bbox, minZoom, maxZoom, onParcelClick]);

  // no desmontamos la capa al hacer zoom: queda persistente
  return null;
}
