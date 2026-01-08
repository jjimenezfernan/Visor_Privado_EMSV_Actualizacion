// AdditionalPanel.jsx
import { Box, Typography, useTheme, Switch, Tooltip, IconButton } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { tokens } from "../data/theme";

const hourLabel = (k) => k.replace("h_", "").slice(0, 2) + ":00";

function HoursTable({ hours }) {
  const entries = Object.entries(hours || {});
  entries.sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>
          <th style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid #e5e7eb" }}>
            Hora
          </th>
          <th style={{ textAlign: "right", padding: "6px 4px", borderBottom: "1px solid #e5e7eb" }}>
            % sombra
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k}>
            <td style={{ padding: "6px 4px", borderBottom: "1px solid #f1f5f9" }}>{hourLabel(k)}</td>
            <td style={{ padding: "6px 4px", borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>
              {Number.isFinite(v) ? `${v.toFixed(1)}%` : "–"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AdditionalPanel({
  obra,
  obrasOn,
  onToggleObras,
  areaStats,
  parcelMode,
  onSetParcelMode,
  shadowsOn,
  onToggleShadows,
  shadowsInfo,
  colorMode,
  onToggleColorMode,
}) {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  return (
    <Box
      sx={{
        backgroundColor: "#f3f4f6",
        borderRadius: "10px",
        p: "0.5rem 1rem 0.75rem 1rem",
        width: "100%",
      }}
    >
      {/* ===== OBRAS ===== */}
      {/* ===== OBRAS (HEADER estilo "Datos energéticos") ===== */}
      <Box
        sx={{
          background:"#438242",
          borderRadius: "6px",
          px: "0.6rem",
          py: "0.35rem",
          mb: 1,
          lineHeight: 1.2,
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <Typography variant="h6" color="#fff" fontWeight={600} sx={{ fontSize: 16 }}>
          Obras
        </Typography>

        <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 0.75 }}>
          <Typography variant="caption" sx={{ color: "rgba(255,255,255,.9)" }}>
            {obrasOn ? "Ocultar capa" : "Mostrar capa"}
          </Typography>
          <Switch
            size="small"
            checked={!!obrasOn}
            onChange={(e) => onToggleObras?.(e.target.checked)}
          />
        </Box>
      </Box>

      

      <Box
        sx={{
          background: "white",
          borderRadius: 2,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          p: "10px 12px",
          fontSize: 13,
          mb: 1.2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
          <Typography fontWeight={700}>Obra seleccionada</Typography>

        </Box>

        {!obra ? (
          <Typography variant="body2" color="text.secondary">
            Pulsa sobre una obra en el mapa para ver su información aquí.
          </Typography>
        ) : (
          <Box sx={{ lineHeight: 1.6 }}>
            <div><b>{obra.nombre ?? "–"}</b></div>
            <div>Tipo: <b>{obra.tipo_obra ?? "–"}</b></div>
            <div>Ref: <b>{obra.reference ?? "–"}</b></div>
            <div>Dirección: <b>{obra.street_norm ?? "–"} {obra.number_norm ?? ""}</b></div>
          </Box>
        )}
      </Box>
      
       
      <Box
          sx={{
            background:"#438242",
            borderRadius: "6px",
            px: "0.6rem",
            py: "0.35rem",
            mb: 1,
            lineHeight: 1.2,
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Typography variant="h6" color="#fff" fontWeight={600} sx={{ fontSize: 16 }}>
            Sombras
          </Typography>

          {/* Info al lado de "Sombras" */}
          {!!shadowsInfo && (
            <Tooltip
              title={
                <Typography sx={{ fontSize: "0.8rem", lineHeight: 1.5 }}>
                  {shadowsInfo}
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
                    fontSize: "1rem",
                    fontWeight: 400,
                    lineHeight: 1.5,
                    maxWidth: 380,
                    p: 1.5,
                    borderRadius: 2,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                  },
                },
                arrow: { sx: { color: "rgba(0, 0, 0, 0.92)" } },
              }}
            >
              <IconButton size="small" sx={{ p: 0.2, color: "rgba(255,255,255,.95)" }}>
                <InfoOutlinedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}

          {/* Toggle mostrar/ocultar capa */}
          <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1 }}>
            {/* Botón cambiar modo de color (a la izquierda del texto) */}
            <Box
              component="button"
              onClick={onToggleColorMode}
              style={{
                border: "none",
                cursor: "pointer",
                borderRadius: 8,
                padding: "6px 10px",
                fontWeight: 800,
                fontSize: 12,
                color: "#fff",
                background: colorMode === "irradiancia" ? "#DF9A32" : "#438242", // calor/naranja vs sombras/verde
                boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
              }}
            >
              {colorMode === "irradiancia" ? "Color: Calor" : "Color: Sombras"}
            </Box>

            {/* Texto + Switch (como antes) */}
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,.9)" }}>
              {shadowsOn ? "Ocultar capa" : "Mostrar capa"}
            </Typography>

            <Switch
              size="small"
              checked={!!shadowsOn}
              onChange={(e) => onToggleShadows?.(e.target.checked)}
            />
          </Box>

        </Box>

      

      <Box
        sx={{
          background: "white",
          borderRadius: 2,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          p: "10px 12px",
          fontSize: 13,
        }}
      >
        <Typography fontWeight={700} sx={{ mb: 0.5 }}>
          Área seleccionada
        </Typography>

        {!areaStats ? (
          <Typography variant="body2" color="text.secondary">
            Dibuja un polígono/rectángulo/círculo en el mapa para ver el % de sombra por hora.
          </Typography>
        ) : (
          <>
            <Box sx={{ lineHeight: 1.6, mb: 1 }}>
              <div>Metros cuadrados: <b>{areaStats.count ?? 0}</b></div>
              <div>
                Media: <b>{areaStats.avg != null ? areaStats.avg.toFixed(2) : "–"} h</b> · Mín:{" "}
                <b>{areaStats.min ?? "–"}</b> · Máx: <b>{areaStats.max ?? "–"}</b>
              </div>
            </Box>
            <HoursTable hours={areaStats.hours} />
          </>
        )}
      </Box>
    </Box>
  );
}
