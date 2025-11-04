import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

function padBBox([w, s, e, n], r = 0.15) {
  const dx = (e - w) * r;
  const dy = (n - s) * r;
  return [w - dx, s - dy, e + dx, n + dy];
}

function unionBounds(b1, b2) {
  if (!b1) return b2;
  if (!b2) return b1;
  return L.latLngBounds(
    [Math.min(b1.getSouth(), b2.getSouth()), Math.min(b1.getWest(), b2.getWest())],
    [Math.max(b1.getNorth(), b2.getNorth()), Math.max(b1.getEast(), b2.getEast())]
  );
}

export default function ParcelsLayer({ bbox, minZoom = 12, maxZoom = 19, onParcelClick }) {
  const map = useMap();
  const paneName = "parcels-pane";

  const layerRef = useRef(null);
  const fetchedRef = useRef(null);
  const abortRef = useRef(null);
  const [loading, setLoading] = useState(false);

  const inRange = () => {
    const z = map?.getZoom?.() ?? 0;
    return z >= minZoom && z <= maxZoom;
  };

  // Create pane and layer
  useEffect(() => {
    if (!map) return;
    
    if (!map.getPane(paneName)) {
      map.createPane(paneName);
      const p = map.getPane(paneName);
      p.style.zIndex = 430;
      p.style.pointerEvents = "auto";
    }
    
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
        onEachFeature: (feature, layer) => {
          if (onParcelClick) {
            layer.on("click", () => onParcelClick(feature));
          }
        },
      }).addTo(map);
    }
  }, [map, onParcelClick]);

  // Fetch with better coverage logic
  useEffect(() => {
    if (!map || !bbox || !inRange()) {
      // Hide layer when out of zoom range
      if (layerRef.current) {
        layerRef.current.remove();
      }
      return;
    }

    // Show layer when in range
    if (layerRef.current && !map.hasLayer(layerRef.current)) {
      layerRef.current.addTo(map);
    }

    // Padded bbox with MORE padding for better coverage
    const [w, s, e, n] = padBBox(bbox, 0.2); // Increased padding from 0.10 to 0.20
    const needBounds = L.latLngBounds([s, w], [n, e]);

    // Check if we need to fetch
    const needsFetch = !fetchedRef.current || !fetchedRef.current.contains(needBounds);
    
    if (!needsFetch) return;

    // Cancel previous fetch
    abortRef.current?.abort?.();
    const ac = new AbortController();
    abortRef.current = ac;

    const params = new URLSearchParams({
      bbox: [w, s, e, n].join(","),
      limit: "500000",
      offset: "0",
    });

    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/parcels/features?${params}`, {
          signal: ac.signal,
        });
        
        if (!res.ok) {
          console.error(`Parcels fetch error: HTTP ${res.status}`);
          return;
        }
        
        const fc = await res.json();
        if (ac.signal.aborted) return;

        console.log(`Loaded 12 ${fc.features?.length || 0} parcels`);

        // Add data to cumulative layer
        if (layerRef.current && fc.features?.length > 0) {
          layerRef.current.addData(fc);
        }

        // Expand fetched bounds
        fetchedRef.current = unionBounds(fetchedRef.current, needBounds);
      } catch (e) {
        if (e.name !== "AbortError") {
          console.error("Parcels fetch error:", e);
        }
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      ac.abort();
    };
  }, [map, bbox, minZoom, maxZoom]);

  // Clear layer on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort?.();
      if (layerRef.current && map) {
        map.removeLayer(layerRef.current);
      }
    };
  }, [map]);

  return null;
}