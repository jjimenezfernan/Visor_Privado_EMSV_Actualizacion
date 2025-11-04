// components/RightLayerPanel.jsx
import { useState, useEffect } from "react";
import { useTheme } from "@mui/material/styles";
import {
  Box, Typography, Paper, Stack, Switch, Button,
} from "@mui/material";
import { tokens } from "../data/theme";
import axios from "axios";

// If you already have API_BASE defined elsewhere, import that instead.
// Otherwise, keep this line:

// Use env var if available, otherwise default to your FastAPI base
const API_BASE = import.meta.env?.VITE_API_BASE || "http://127.0.0.1:8000";

const isFiniteNum = (v) => Number.isFinite(Number(v));
const fmtPct = (v, d = 0) => (isFiniteNum(v) ? `${Number(v).toFixed(d)}%` : "–");
const fmtInt = (v, suf = "") => (isFiniteNum(v) ? `${Math.round(Number(v))}${suf}` : "–");

function InfoRow({ label, value, unit }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 0.4 }}>
      <Typography sx={{ fontSize: 15, fontWeight: 400, lineHeight: 0.7 }}>{label}</Typography>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.6 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 0.9, color: "text.primary" }}>
          {value ?? "–"}
        </Typography>
        {unit && (
          <Typography sx={{ fontSize: 13, fontWeight: 500, color: "text.secondary" }}>
            {unit}
          </Typography>
        )}
      </Box>
    </Stack>
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

export default function RightLayerPanel({
  irradianceOn, celsOn, certificateOn, zoom,
  celsHits = [], celsHitsLoading = false, celsHitsError = "",
  onToggleIrradiance, onToggleCELS, onToggleCertificate, onJumpToIrradianceZoom,
  buildingRef = null, buildingMetrics = null, buildingMetricsLoading = false, buildingMetricsError = "",
  shadowStats = null, shadowLoading = false, shadowError = "",
  searchJsonRef = null, searchLoading = false, searchApiBase = "", onSearchFeature = null, onSearchReset = null,
}) {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const inIrradianceZoom = zoom >= 17 && zoom <= 18;

  // ===== New state for /cels/building_context =====
  const [ctx, setCtx] = useState(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [ctxError, setCtxError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    
    const fetchContext = async () => {
      if (!buildingRef) {
        setCtx(null);
        setCtxError("");
        setCtxLoading(false);  // <-- ADD THIS
        return;
      }
      
      try {
        setCtxLoading(true);
        setCtxError("");
        
        const res = await axios.get(`${API_BASE}/cels/building_context`, {
          params: { ref: buildingRef, radius_m: 500 },
          signal: controller.signal,
        });
        
        setCtx(res.data || null);
        setCtxError("");  // <-- Clear error on success
        
      } catch (e) {
        // Don't set error if request was cancelled
        if (axios.isCancel(e) || e?.name === "CanceledError") {
          return;
        }
        console.error("CELS context error:", e);
        setCtxError(e?.response?.data?.detail || "No se pudo cargar el contexto CELS.");
        setCtx(null);  // <-- Clear data on error
        
      } finally {
        setCtxLoading(false);
      }
    };
    
    fetchContext();
    
    return () => controller.abort();
  }, [buildingRef]);



  // ===== Helpers de formato y cálculo =====
  const isNum = (v) => Number.isFinite(Number(v));
  const fmt = (v, d = 1) => (isNum(v) ? Number(v).toFixed(d) : "–");
  const pct = (v, d = 1) => (isNum(v) ? `${Number(v).toFixed(d)}%` : "–");
  const safeDiv = (a, b) => (isNum(a) && isNum(b) && Number(b) !== 0 ? Number(a) / Number(b) : null);
  const safeSub = (a, b) => (isNum(a) && isNum(b) ? Number(a) - Number(b) : null);

  const m = buildingMetrics || {};

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
  
  return (
    <Stack spacing={1.5} sx={{ fontFamily: theme.typography.fontFamily }}>
      {/* ===== IRRADIANCIA ===== */}
      <Section
        headerBg={colors.blueAccent[400]}
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
              <InfoRow label="Radiación solar anual (kWh/m²)" value={fmt(m.irr_mean_kWhm2_y ?? m.irr_average, 1)} />
              <InfoRow label="Horas de sol directo (h/día)" value={fmt(shadowAvg, 2)} />
              <InfoRow
                label="Edificios dentro del buffer de una CEL"
                value={ctxLoading ? "…" : (ctx?.cel?.buildings_in_buffer ?? "–")}
              />
              <InfoRow
                label="Número de usuarios del autoconsumo compartido"
                value={ctxLoading ? "…" : (ctx?.ac?.num_usuarios ?? "–")}
              />
              <InfoRow
                label="Edificios dentro del buffer de un autoconsumo compartido"
                value={ctxLoading ? "…" : (ctx?.ac?.buildings_in_buffer ?? "–")}
              />

              {/* Optional: show the fetch error from /cels/building_context */}
              {ctxError && (
                <Typography variant="caption" color="error">
                   {String(ctxError) || "No se pudo cargar el contexto CELS."}
                </Typography>
              )}

              <InfoRow label="Superficie útil para instalación fotovoltaica (m²)" value={fmt(m.superficie_util_m2, 1)} />
              <InfoRow label="Porcentaje de superficie útil (%)" value={pct(pctSuperficieUtil, 1)} />
              <InfoRow label="Potencia fotovoltaica instalable (kWp)" value={fmt(m.pot_kWp, 1)} />
              <InfoRow label="Energía fotovoltaica anual estimada (kWh/año)" value={fmt(m.energy_total_kWh, 0)} />
              <InfoRow label="Irradiancia media anual (kWh/m²·año)" value={fmt(m.irr_mean_kWhm2_y ?? m.irr_average, 1)} />
              <InfoRow label="Factor de capacidad (%)" value={fmt(m.factor_capacidad_pct, 1)} />
              <InfoRow label="Producción específica (kWh/kWp·año)" value={fmt(prodEspecifica, 1)} />
              <InfoRow label="Densidad de potencia (kWp/m²)" value={fmt(densidadPot, 3)} />
              <InfoRow label="Reducción potencial de emisiones (tCO₂/año)" value="–" />
              <InfoRow label="Ahorro económico estimado (€ / año)" value="–" />
              <InfoRow label="Área total (m²)" value={fmt(m.area_m2, 1)} />
            </>
          )}
        </Box>
      </Section>

      {/* ===== Certificados ===== */}
      <Section title="Certificados Energéticos" headerBg={colors.blueAccent[400]}>
        {!buildingMetricsLoading && !buildingMetricsError && (
          <>
            <InfoRow label="Calificación energética (A–G)" value="–" />
          </>
        )}
      </Section>

      {/* ===== CELS ===== */}
      <Section
        headerBg={colors.blueAccent[400]}
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
