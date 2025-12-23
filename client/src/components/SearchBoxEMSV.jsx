// components/SearchBoxEMSV.jsx
import { useEffect, useMemo, useState } from "react";
import {
  AppBar, Toolbar, Grid, TextField, Button, Autocomplete,
  CircularProgress, Alert, useTheme, Box
} from "@mui/material";
import { tokens } from "../data/theme";
import axios from "axios";
import { API_BASE } from "../data/direccion_server";

const BACKEND_ROOT = API_BASE.replace(/\/api_2\/?$/, "");


// endpoint para geometría por refcat
const REF_ENDPOINT = (refcat) =>
  `${API_BASE}/cadastre/feature?refcat=${encodeURIComponent(refcat)}&include_feature=true`;

// endpoint PDF
const PDF_URL = `${BACKEND_ROOT}/api/generate_pdf`;

// endpoint índice calles/números
const CALLES_ENDPOINT = `${BACKEND_ROOT}/api/visor_emsv`;



export default function SearchBoxEMSV({
  // jsonRef,                // ⛔️ ya no se usa
  // loading = false,        // ⛔️ el componente gestiona su propio loading
  apiBase = API_BASE,
  onFeature,               // callback(feature, popupHtml)
  collectPdfData,          // opcional: ()=>({ ...propsExtra })  para el PDF
  onReset,
}) {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  // Estado local para el índice { calle: { numero: refcat } } cargado desde API
  const [refIndex, setRefIndex] = useState({});
  const [loadingIdx, setLoadingIdx] = useState(true);
  const [street, setStreet] = useState("");
  const [portal, setPortal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Cargar índice al montar
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingIdx(true);
        const { data } = await axios.get(CALLES_ENDPOINT);
        if (!mounted) return;
        setRefIndex(data?.calles_num_ref || {});
      } catch (e) {
        console.error("Error cargando índice de calles:", e);
        if (mounted) setMsg("No se pudo cargar el índice de calles.");
      } finally {
        if (mounted) setLoadingIdx(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // ---- opciones de autocompletar desde refIndex ----
  const streetOptions = useMemo(() => {
    if (!refIndex || typeof refIndex !== "object") return [];
    return Object.keys(refIndex).sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" })
    );
  }, [refIndex]);

  const numberOptions = useMemo(() => {
    if (!refIndex || !street || !refIndex[street]) return [];
    return Object.keys(refIndex[street])
      .map(String)
      .sort((a, b) => {
        const na = parseInt(a, 10), nb = parseInt(b, 10);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return a.localeCompare(b, "es", { sensitivity: "base" });
      });
  }, [refIndex, street]);

  const reset = () => {
    setStreet("");
    setPortal("");
    setMsg("");
    onReset?.();
  };

  // ---- búsqueda: por refcat y fallback por calle+número ----
  const doSearch = async () => {
    setMsg("");
    if (!street || !portal) {
      setMsg("Selecciona calle y número.");
      return;
    }
    const refcat = refIndex?.[street]?.[String(portal)];
    if (!refcat) {
      setMsg("No hay referencia catastral en el índice para esa dirección.");
      return;
    }

    setBusy(true);
    try {
      let feature = null;

      // 1) intento por refcat
      try {
        const r1 = await fetch(REF_ENDPOINT(refcat));
        if (r1.ok) {
          const d1 = await r1.json();
          feature = d1?.feature ?? null;
        }
      } catch (_) {}

      // 2) fallback por calle+número (si tu backend lo soporta)
      if (!feature) {
        const qs = new URLSearchParams({ street, number: portal, include_feature: "true" });
        const r2 = await fetch(`${apiBase}/address/lookup?${qs}`);
        if (!r2.ok) throw new Error(r2.status === 404 ? "Dirección no encontrada." : `Error ${r2.status}`);
        const d2 = await r2.json();
        feature = d2?.feature;
        if (!feature) throw new Error("Referencia encontrada pero sin geometría.");
      }

      const popupHtml = `
        <div style="font:13px system-ui">
          <div style="font-weight:700;margin-bottom:4px;">${street.toUpperCase()} ${portal}</div>
          <div><b>Ref. catastral:</b> ${refIndex?.[street]?.[String(portal)] ?? "-"}</div>
        </div>
      `;
      onFeature?.(feature, popupHtml);
    } catch (e) {
      console.error(e);
      setMsg(e.message || "No se pudo buscar la dirección.");
    } finally {
      setBusy(false);
    }
  };

  // ---- PDF: misma llamada que el componente original ----
  const handleDownloadPDF = async () => {
    if (!street || !portal) {
      setMsg("Selecciona calle y número antes de descargar el PDF.");
      return;
    }
    const refcat = refIndex?.[street]?.[String(portal)];
    if (!refcat) {
      setMsg("No hay referencia catastral para esa dirección.");
      return;
    }

    const baseDatos = { calle: street, num: portal, ref_catastral: refcat };
    const datos = {
      ...baseDatos,
      ...(typeof collectPdfData === "function" ? collectPdfData({ street, portal, refcat }) : {}),
    };

    try {
      const response = await axios.post(PDF_URL, datos, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "datos_emsv_visor.pdf");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error generando el PDF:", error);
      setMsg("No se pudo generar el PDF.");
    }
  };

  // ---------- UI (igual que tenías) ----------
  return (
    <AppBar position="static" color="default" sx={{ borderRadius: "8px", overflow: "hidden" }}>
      <Toolbar>
        <Grid container spacing={2} alignItems="center">
          {/* Calle */}
          <Grid item xs={12} md={6}>
            <Autocomplete
              options={streetOptions}
              value={street || null}
              onChange={(_, v) => { setStreet(v || ""); setPortal(""); }}
              loading={loadingIdx}
              noOptionsText={loadingIdx ? "Cargando calles…" : "No hay calles disponibles"}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Calle/Avenida/Plaza"
                  variant="outlined"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingIdx ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
          </Grid>

          {/* Número */}
          <Grid item xs={12} md={3}>
            <Autocomplete
              options={numberOptions}
              value={portal || null}
              onChange={(_, v) => setPortal(v || "")}
              noOptionsText={street ? (loadingIdx ? "Cargando…" : "Sin números") : "Seleccione calle primero"}
              disabled={!street || loadingIdx}
              renderInput={(params) => (
                <TextField {...params} label="Número del Portal" variant="outlined" />
              )}
            />
          </Grid>

          {/* Buscar */}
          <Grid item xs={12} md={3}>
            <Button
              variant="contained"
              color="primary"
              onClick={doSearch}
              disabled={!street || !portal || busy || loadingIdx}
              sx={{ fontSize: "15px", padding: "8px 8px", minWidth: "107px" }}
            >
              {busy ? <CircularProgress size={20} sx={{ color: "#fff" }} /> : "Buscar"}
            </Button>
          </Grid>
        </Grid>
      </Toolbar>

      {/* Botonera inferior */}
      <Toolbar sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          color="primary"
          onClick={reset}
          sx={{
            fontSize: "12px",
            padding: "8px 8px",
            minWidth: "107px",
            backgroundColor: "#bbbbbb",
            "&:hover": { backgroundColor: "#8a8a8a" },
          }}
        >
          Restablecer Datos
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleDownloadPDF}
          sx={{ fontSize: "12px", padding: "8px 8px", minWidth: "107px", ml: 1.8, mr: 1 }}
          disabled={loadingIdx || !street || !portal}
        >
          Descargar PDF
        </Button>
      </Toolbar>

      {/* Mensajes */}
      {msg && (
        <Box sx={{ px: 2, pb: 2 }}>
          <Alert severity="warning" sx={{ py: 0 }}>{msg}</Alert>
        </Box>
      )}
    </AppBar>
  );
}
