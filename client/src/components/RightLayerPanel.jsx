// components/RightLayerPanel.jsx
import { useState, useEffect, useRef } from "react";
import { useTheme } from "@mui/material/styles";
import {
  Box, Typography, Paper, Stack, Switch, Button, Divider,IconButton,
} from "@mui/material";
import { tokens } from "../data/theme";
import axios from "axios";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
// If you already have API_BASE defined elsewhere, import that instead.
// Otherwise, keep this line:

// Use env var if available, otherwise default to your FastAPI base

import { DIRECTION, API_BASE } from "../data/direccion_server";
import Tooltip from "@mui/material/Tooltip";

import SearchBoxEMSV from "../components/SearchBoxEMSV";

const isFiniteNum = (v) => Number.isFinite(Number(v));
const fmtPct = (v, d = 0) => (isFiniteNum(v) ? `${Number(v).toFixed(d)}%` : "–");
const fmtInt = (v, suf = "") => (isFiniteNum(v) ? `${Math.round(Number(v))}${suf}` : "–");

function InfoRow({ label, value, unit, description }) {
  return (
    <Box sx={{ py: 0.4 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography
            sx={{ fontSize: 14, fontWeight: 400, lineHeight: 1 }}
          >
            {label}
          </Typography>

          {description && (
            <Tooltip
              title={
                <Typography sx={{ fontSize: "0.8rem", lineHeight: 1.5 }}>
                  {description}
                </Typography>
              }
              arrow
              placement="top"
              enterDelay={200}
              leaveDelay={200}
              componentsProps={{
                tooltip: {
                  sx: {
                    bgcolor: "rgba(0, 0, 0, 0.92)",
                    color: "#fff",
                    fontSize: "1rem",           // fallback size
                    fontWeight: 400,
                    lineHeight: 1.5,
                    maxWidth: 380,
                    p: 1.5,                     // more internal padding = more comfortable
                    borderRadius: 2,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                  },
                },
                arrow: {
                  sx: {
                    color: "rgba(0, 0, 0, 0.92)",
                  },
                },
              }}
            >
              <IconButton size="small" sx={{ p: 0.2 }}>
                <InfoOutlinedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Value + unit */}
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.6 }}>
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 0.9,
              color: "text.primary",
            }}
          >
            {value ?? "–"}
          </Typography>
          {unit && (
            <Typography
              sx={{ fontSize: 13, fontWeight: 700, color: "text.secondary" }}
            >
              {unit}
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  );
}




function Section({ title, children, headerBg, noPaper = false }) {
  return (
    <Box sx={{ backgroundColor: "#f3f4f6", borderRadius: 2, p: 1.5 }}>
      <Box
        sx={{
          background: headerBg,
          borderRadius: "6px",
          px: "0.6rem",
          py: "0.15rem",
          mb: 0.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#fff",
        }}
      >
        {typeof title === "string" ? (
          <Typography variant="h6" fontWeight={600} sx={{ lineHeight: 1.2, fontSize: 16 }}>
            {title}
          </Typography>
        ) : (
          title
        )}
      </Box>

      {noPaper ? (
        <>{children}</>
      ) : (
        <Paper
          elevation={0}
          sx={{
            p: 1,
            borderRadius: 2,
            backgroundColor: "#f8fafc",
            border: "1px solid",
            borderColor: "divider",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          {children}
        </Paper>
      )}
    </Box>
  );
}




// Colores por letra (A = más eficiente, G = menos eficiente)
const energyColorByLetter = {
  A: "#4CAF50", // verde
  B: "#8BC34A",
  C: "#CDDC39",
  D: "#FFEB3B",
  E: "#FFC107",
  F: "#FF9800",
  G: "#F44336", // rojo
};

function EnergyCertificate({ title, rating, isEstimated, date, info }) {
  const letter = (rating || "").toString().toUpperCase();
  const color = energyColorByLetter[letter] || "#BDBDBD";
  const hasLetter = !!energyColorByLetter[letter];

  const fmtDateEs = (s) => {
    if (!s) return "";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString("es-ES");
  };

  const showDate = hasLetter && !isEstimated && !!date;

  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: "text.primary" }}>
          {title}
        </Typography>

        {info && (
          <Tooltip
            title={<Typography sx={{ fontSize: "0.8rem", lineHeight: 1.5 }}>{info}</Typography>}
            arrow
            placement="top"
            enterDelay={200}
            leaveDelay={200}
            componentsProps={{
              tooltip: {
                sx: {
                  bgcolor: "rgba(0, 0, 0, 0.92)",
                  color: "#fff",
                  fontWeight: 400,
                  lineHeight: 1.5,
                  maxWidth: 420,
                  p: 1.5,
                  borderRadius: 2,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                  whiteSpace: "pre-line", // <-- importante para saltos de línea
                },
              },
              arrow: { sx: { color: "rgba(0, 0, 0, 0.92)" } },
            }}
          >
            <IconButton size="small" sx={{ p: 0.2 }}>
              <InfoOutlinedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box
          sx={{
            clipPath: "polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%)",
            px: 1.8,
            py: 0.6,
            minWidth: 52,
            bgcolor: color,
            opacity: isEstimated ? 0.75 : 1,
            borderRadius: 0.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography sx={{ fontSize: 16, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
            {hasLetter ? letter : "–"}
          </Typography>
        </Box>

        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {hasLetter ? `Fuente: ${isEstimated ? "estimado" : "oficial"}` : "Sin información de certificado"}
          {showDate ? ` · Fecha: ${fmtDateEs(date)}` : ""}
        </Typography>
      </Box>
    </Box>
  );
}



export default function RightLayerPanel({
  irradianceOn, celsOn, certificateOn, zoom,
  celsHits = [], celsHitsLoading = false, celsHitsError = "",
  onToggleIrradiance, onToggleCELS, onToggleCertificate, onJumpToIrradianceZoom,
  buildingRef = null, buildingMetrics = null, buildingMetricsLoading = false, buildingMetricsError = "",
  shadowStats = null, shadowLoading = false, shadowError = "",
  searchJsonRef = null, searchLoading = false, searchApiBase = "", onSearchFeature = null, onSearchReset = null,
  onSelectCertificateMode = null, onClearCertificateMode = null, certMode = null,

}) {
  const isCo2Active = certificateOn && certMode === "co2";
  const isNoRenovActive = certificateOn && certMode === "norenov";
  
  
  
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const inIrradianceZoom = zoom >= 17 && zoom <= 18;

  
  const [ctx, setCtx] = useState(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [ctxError, setCtxError] = useState("");



  const ctxReqIdRef = useRef(0);

useEffect(() => {
  const controller = new AbortController();
  const myReqId = ++ctxReqIdRef.current;

  // Siempre resetea al cambiar edificio o al cambiar la capa
  setCtx(null);
  setCtxError("");

  // Si no hay edificio seleccionado o la capa CELS está apagada, no hay nada que calcular
  if (!buildingRef || !celsOn) {
    setCtxLoading(false);
    return () => controller.abort();
  }

  setCtxLoading(true);

  (async () => {
    try {
      const res = await axios.get(`${API_BASE}/cels/building_context`, {
        params: { ref: buildingRef, radius_m: 2000 },
        signal: controller.signal,
      });

      // Si ya hay otra petición más nueva, ignorar esta respuesta
      if (myReqId !== ctxReqIdRef.current) return;

      setCtx(res.data || null);
      setCtxError("");
    } catch (e) {
      if (myReqId !== ctxReqIdRef.current) return;

      if (
        axios.isCancel(e) ||
        e?.name === "CanceledError" ||
        e?.code === "ERR_CANCELED"
      ) return;

      console.error("CELS context error:", e);
      setCtxError(e?.response?.data?.detail || "No se pudo cargar el contexto CELS.");
      setCtx(null);
    } finally {
      if (myReqId === ctxReqIdRef.current) setCtxLoading(false);
    }
  })();

  return () => controller.abort();
}, [buildingRef, celsOn]); // 👈 CLAVE: añadir celsOn



  // ===== Helpers de formato y cálculo =====
  const isNum = (v) => Number.isFinite(Number(v));
  const fmt = (v, d = 1) => (isNum(v) ? Number(v).toFixed(d) : "–");
  const pct = (v, d = 1) => (isNum(v) ? `${Number(v).toFixed(d)}%` : "–");
  const safeDiv = (a, b) => (isNum(a) && isNum(b) && Number(b) !== 0 ? Number(a) / Number(b) : null);
  const safeSub = (a, b) => (isNum(a) && isNum(b) ? Number(a) - Number(b) : null);

  const m = buildingMetrics || {};


  const E = Number(m.energy_total_kWh);
  const Pener = 0.1377; // €/kWh (con impuestos) — si luego lo haces configurable, lo cambias aquí
  const Pexc  = 0.05;   // €/kWh excedente

  const ahorroEstimado1 =
    Number.isFinite(E) ? E * (Pener * 0.5 + Pexc * 0.5) : null;


  const certInfoText = [
    "El certificado energético estimado de cada edificio se calcula en función de cuatro variables clave:",
    "uso del edificio (residencial o no), antigüedad constructiva (según periodos normativos), tipología edificatoria (unifamiliar o bloque) y tamaño medio (categorías de superficie).",
    "Estas variables definen la tipología energética del edificio y permiten asignar una letra típica cuando no existe certificado oficial.",
    "",
  ].join("\n");

  {/*
     "Tipología del edificio consultado:",
    `• Uso: ${m.uso_cat_edificio ?? m.uso_edificio ?? "–"}`,
    `• Antigüedad: ${m.antig_cat_edificio ?? m.antiguedad_edificio ?? "–"}`,
    `• Tipología: ${m.es_unifamiliar_edificio != null ? (Number(m.es_unifamiliar_edificio) === 1 ? "Unifamiliar" : "Bloque") : (m.tipologia_edificio ?? "–")}`,
    `• Tamaño medio: ${m.sup_cat_edificio ?? "–"}${m.sup_media_m2 != null ? ` (≈ ${fmt(m.sup_media_m2, 0)} m²)` : ""}`,
    */}
  const sunDirectAvgFromAPI = shadowStats?.sun_avg;
  const shadowAvg = shadowStats?.avg;
  const assumedDayLength = isNum(shadowStats?.dayLength_h) ? shadowStats.dayLength_h : 12;
  const sunDirectAvgComputed = safeSub(assumedDayLength, shadowStats?.avg);
  const sunDirectToShow = isNum(sunDirectAvgFromAPI) ? sunDirectAvgFromAPI : sunDirectAvgComputed;

  const pctSuperficieUtil =
    safeDiv(m.superficie_util_m2, m.area_m2) != null
      ? safeDiv(m.superficie_util_m2, m.area_m2) * 100
      : null;

  const prodEspecifica = safeDiv(m.energy_total_kWh, m.pot_kWp); // kWh/kWp·año
  const densidadPot = safeDiv(m.pot_kWp, m.superficie_util_m2);  // kWp/m²
  
  const [precioEnergia, setPrecioEnergia] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/precioEnergia`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json(); // { precio: number|string|null }

        const p = Number(json?.precio);
        if (!cancelled) setPrecioEnergia(Number.isFinite(p) ? p : null);
      } catch (e) {
        if (!cancelled) setPrecioEnergia(null);
      }
    })();

    return () => { cancelled = true; };
  }, [API_BASE]);



  const Eanual = Number(m?.energy_total_kWh); // kWh/año
  const ahorroMaximo = (Number.isFinite(Eanual) && Number.isFinite(precioEnergia))
    ? Eanual * precioEnergia
    : null;

  if (process.env.NODE_ENV !== "production") {
    console.log("precioEnergia:", precioEnergia, "Eanual:", m?.energy_total_kWh, "ahorroMaximo:", ahorroMaximo);
  }


  const sunHours24 = isNum(shadowAvg) ? (16 - Number(shadowAvg)) : null;
  
  return (
    <Stack spacing={1.5} sx={{ fontFamily: theme.typography.fontFamily }}>
      <Section headerBg="#DF9A32" title="Buscador de Direcciones" noPaper>
        <SearchBoxEMSV
          jsonRef={searchJsonRef}
          loading={searchLoading}
          apiBase={searchApiBase || API_BASE}
          onFeature={onSearchFeature}
          onReset={onSearchReset}
        />
      </Section>
      {/* ===== IRRADIANCIA ===== */}
      <Section
        headerBg="#DF9A32"
        title={
          <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
            <Typography variant="h6" fontWeight={600} sx={{ fontSize: 16, lineHeight: 1.2 }}>
              Datos energéticos
            </Typography>
            <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,.9)" }}>
                {irradianceOn ? "Ocultar capa" : "Mostrar capa"}
              </Typography>
              <Switch size="small" checked={irradianceOn} onChange={onToggleIrradiance} />
            </Box>
          </Box>
        }
      >
        <Box
          sx={{
            p: 1,
            borderRadius: 1,
            backgroundColor: "#fff",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          {buildingMetricsLoading && (
            <Typography variant="caption">Cargando información…</Typography>
          )}

          {buildingMetricsError && (
            <Typography variant="caption" color="error">
              {buildingMetricsError}
            </Typography>
          )}

          {!buildingMetricsLoading && !buildingMetricsError && (
            <>
              <>
                <InfoRow
                  label="Radiación solar anual (kWh/m²)"
                  value={fmt(m.irr_mean_kWhm2_y ?? m.irr_average, 1)}
                  description="Cantidad media anual de energía solar que incide sobre cada metro cuadrado de la cubierta, considerando la orientación, inclinación y condiciones locales."
                />

                <InfoRow
                  label="Horas de sol directo (h/día)"
                  value={fmt(sunHours24, 2)}
                  description="Promedio diario de horas en las que el edificio recibe radiación solar directa sin estar afectada por sombras de edificios u otros obstáculos."
                />

                <InfoRow
                  label="Edificios dentro del buffer de una CEL"
                  value={ctxLoading ? "…" : (ctx?.cel ? ctx.cel.buildings_in_buffer : "–")}
                  description="Número de edificios situados dentro del área de influencia de una Comunidad Energética Local, potencialmente conectables a la misma."
                />

                <InfoRow
                  label="Número de usuarios del autoconsumo compartido"
                  value={ctxLoading ? "…" : (ctx?.ac ? ctx.ac.num_usuarios : "–")}
                  description="Cantidad de usuarios finales que participan o podrían participar en un sistema de autoconsumo colectivo asociado al entorno del edificio."
                />

                <InfoRow
                  label="Edificios dentro del buffer de un autoconsumo compartido"
                  value={ctxLoading ? "…" : (ctx?.ac ? ctx.ac.buildings_in_buffer : "–")}
                  description="Número de edificios localizados dentro del radio de conexión de una instalación de autoconsumo compartido."
                />


                <InfoRow
                  label="Superficie útil para instalación fotovoltaica (m²)"
                  value={fmt(m.superficie_util_m2, 1)}
                  description="Superficie estimada de la cubierta disponible para la instalación de paneles fotovoltaicos, descontando sombras, obstáculos y retranqueos técnicos."
                />

                <InfoRow
                  label="Porcentaje de superficie útil (%)"
                  value={pct(pctSuperficieUtil, 1)}
                  description="Porcentaje de la superficie total de la cubierta que resulta técnicamente aprovechable para la instalación fotovoltaica."
                />

                <InfoRow
                  label="Potencia fotovoltaica instalable (kWp)"
                  value={fmt(m.pot_kWp, 1)}
                  description="Potencia pico máxima que puede instalarse en la cubierta en función de la superficie útil disponible y la densidad de paneles."
                />

                <InfoRow
                  label="Energía fotovoltaica anual estimada (kWh/año)"
                  value={fmt(m.energy_total_kWh, 0)}
                  description="Producción eléctrica anual estimada de la instalación fotovoltaica, considerando la radiación solar, el rendimiento del sistema y las pérdidas."
                />

                <InfoRow
                  label="Irradiancia media anual (kWh/m²·año)"
                  value={fmt(m.irr_mean_kWhm2_y ?? m.irr_average, 1)}
                  description="Valor medio anual de energía solar recibida por unidad de superficie, utilizado como base para el cálculo de la producción fotovoltaica."
                />

                <InfoRow
                  label="Factor de capacidad (%)"
                  value={fmt(m.factor_capacidad_pct, 1)}
                  description="Relación entre la energía realmente producida y la que se produciría si la instalación funcionara a potencia nominal durante todo el año."
                />

                <InfoRow
                  label="Producción específica (kWh/kWp·año)"
                  value={fmt(prodEspecifica, 1)}
                  description="Energía anual generada por cada kilovatio pico instalado, indicador del rendimiento global de la instalación fotovoltaica."
                />

                <InfoRow
                  label="Densidad de potencia (kWp/m²)"
                  value={fmt(densidadPot, 3)}
                  description="Potencia fotovoltaica instalable por unidad de superficie, dependiente del tipo de paneles y del criterio de ocupación de la cubierta."
                />

                <InfoRow
                  label="Reducción potencial de emisiones (tCO₂/año)"
                  value={fmt(m.reduccion_emisiones, 2)}
                  description="Cantidad estimada de emisiones de CO₂ que se evitarían anualmente al sustituir generación eléctrica convencional por energía fotovoltaica. Factor: 0,231kgCO₂/kWh"
                />
                <InfoRow
                  label="Ahorro económico estimado (€ / año)"
                  value={fmt(ahorroEstimado1, 2)}
                  description={
                    `Ahorro anual estimado con un reparto 50% autoconsumo y 50% excedentes:\n` +
                    `Ahorro anual = E_pro.FV × (P_ener × % autoconsumo + P_exc × % excedentes)\n\n` +
                    `E_pro.FV: energía fotovoltaica anual estimada (kWh/año)\n` +
                    `P_ener: precio del kWh (con impuestos) (por defecto 0,1377 €/kWh)\n` +
                    `P_exc: precio del excedente (por defecto 0,05 €/kWh)\n` +
                    `% autoconsumo = % excedentes = 0,5`
                  }
                />
                <InfoRow
                  label="Máximo ahorro económico estimado (€ / año)"
                  value={fmt(ahorroMaximo, 2)}
                  description="Calculado como Radiación solar anual (kWh/m²) × precio energía (€/kWh) definido en la tabla precioEnergia."
                />

                {/*
                <InfoRow
                  label="Ahorro económico estimado (€ / año)"
                  value={fmt(m.ahorro_eur, 2)}
                  description="Ahorro económico anual máximo estimado en la factura eléctrica derivado del autoconsumo de la energía fotovoltaica generada."
                />
                */}
              </>

              {/*<InfoRow label="Área total (m²)" value={fmt(m.area_m2, 1)}/>*/}
            </>
          )}
        </Box>
      </Section>

      {/* ===== Certificados Energéticos ===== */}
      <Section title="Certificados Energéticos" headerBg="#DF9A32">
        {!buildingMetricsLoading && !buildingMetricsError && (
          <Box>
            <Box
              sx={{
                cursor: "pointer",
                p: 0.5,
                borderRadius: 1,
                outline: isCo2Active ? "2px solid rgba(59,130,246,0.8)" : "2px solid transparent",
              }}
              onClick={() => {
                if (!certificateOn) onToggleCertificate?.();   // enciende capa
                onSelectCertificateMode?.("co2");              // cambia modo
              }}
            >
              <EnergyCertificate
                title="Certificado Emisiones (CO₂)"
                rating={m.certificadoCO2}
                isEstimated={Number(m.certificadoCO2_es_estimado) === 1}
                date={m.certificado_fecha_oficial}
                info={certInfoText}
              />
            </Box>

            <Divider sx={{ my: 1 }} />

            <Box
              sx={{
                cursor: "pointer",
                p: 0.5,
                borderRadius: 1,
                outline: isNoRenovActive ? "2px solid rgba(59,130,246,0.8)" : "2px solid transparent",
              }}
              onClick={() => {
                if (!certificateOn) onToggleCertificate?.();   // enciende capa
                onSelectCertificateMode?.("norenov");              // cambia modo
              }}
            >
              <EnergyCertificate
                title="Certificado de consumo (energía no renovable)"
                rating={m.cal_norenov}
                isEstimated={Number(m.cal_norenov_es_estimado) === 1}
                date={m.certificado_fecha_oficial}
                info={certInfoText}
              />
            </Box>

            {/* botón para apagar el modo */}
            <Typography
              variant="caption"
              sx={{ display: "inline-block", mt: 0.5, cursor: "pointer", textDecoration: "underline" }}
              onClick={() => onClearCertificateMode?.()}
            >
              Quitar coloreado de certificados
            </Typography>
          </Box>
        )}
        {(buildingMetricsLoading || buildingMetricsError) && (
          <Typography
            variant="caption"
            color={buildingMetricsError ? "error" : "text.secondary"}
          >
            {buildingMetricsError || "Cargando certificados…"}
          </Typography>
        )}
      </Section>

      {/* ===== CELS ===== */}
      <Section
        headerBg="#DF9A32"
        title={
          <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
            <Typography variant="h6" fontWeight={600} sx={{ fontSize: 16, lineHeight: 1.2 }}>
              CELS y Autoconsumo
            </Typography>
            <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,.9)" }}>
                {celsOn ? "Ocultar capa" : "Mostrar capa"}
              </Typography>
              <Switch size="small" checked={celsOn} onChange={onToggleCELS} />
            </Box>
          </Box>
        }
      >
        {celsHitsLoading && <Typography variant="caption">Buscando CELS…</Typography>}
        {celsHitsError && (
          <Typography variant="caption" color="error">{celsHitsError}</Typography>
        )}

        {!celsHitsLoading && !celsHitsError && (
          celsHits.length ? (
            <Stack spacing={0.75}>
              {celsHits.map((c) => {
                const props = c?.properties ?? c;
                const num = (v) => {
                  const n = Number(v);
                  return Number.isFinite(n) ? n : null;
                };
                let occ = num(
                  props.por_ocupacion ??
                  props.por_ocupacion_pct ??
                  props.por_ocup ??
                  props.occupancy_pct ??
                  props.occupancy
                );
                if (occ != null && occ > 0 && occ <= 1) occ = occ * 100;

                const dist = num(c.distance_m);
                const street = c.street_norm || c.street || c.calle || "";
                const number = c.number_norm ?? c.numero ?? "";
                const tipo = c.auto_CEL === 1 ? "CEL" : "Autoconsumo Compartido";
                const nusers = props.num_usuarios ?? null;

                if (process.env.NODE_ENV !== "production") {
                  console.log("CEL hit debug:", c);
                }

                return (
                  <Box
                    key={c.id}
                    sx={{
                      p: 1,
                      borderRadius: 1,
                      border: "1px solid",
                      borderColor: "divider",
                      bgcolor: "background.paper",
                    }}
                  >
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.1 }}>
                      {c.nombre || "(sin nombre)"}
                    </Typography>

                    <Typography variant="body1" color="text.secondary" sx={{ display: "block", mt: 0.75, fontSize: "0.9rem" }}>
                      Referencia catastral y calle: <strong>{c.reference || "–"}</strong>
                      {(street || number) && (
                        <>
                          {"  -  "} <strong>{street}{number ? ` ${number}` : ""}</strong>
                        </>
                      )}
                    </Typography>

                    <Typography variant="body1" color="text.secondary" sx={{ display: "block", mt: 0.25, fontSize: "0.9rem" }}>
                      Tipo: <strong>{tipo}</strong>
                      {"  -  "}
                      Ocupación: <strong>{occ != null ? `${occ.toFixed(0)}%` : "–"}</strong>
                      {"  -  "}
                      Distancia: <strong>{dist != null ? `${Math.round(dist)} m` : "–"}</strong>
                      {c.auto_CEL === 2 && (
                        <>
                          {"  -  "}
                          Usuarios: <strong>{nusers != null ? nusers : "–"}</strong>
                        </>
                      )}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          ) : (
            <Typography variant="caption" color="text.secondary">
              Ningún CELS o autoconsumo compartido cubre este edificio.
            </Typography>
          )
        )}
      </Section>
    </Stack>
  );
}
