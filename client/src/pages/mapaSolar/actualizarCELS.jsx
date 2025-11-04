import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  useTheme,
  Button,
  Stack,
  TextField,
  Alert,
  Snackbar,
  Paper,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Divider,
  CircularProgress,
  ButtonGroup,
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import axios from "axios";
import { tokens } from "../../theme";
import { motion } from "framer-motion";
import SubUpBar from "../global/SubUpBar";
import { Autocomplete } from "@mui/material";

// para /api/visor_emsv usa DIRECTION (tu Node API: 3041)
import { DIRECTION } from "../../data/direccion_server";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";
const EMSV_URL = `${DIRECTION}/api/visor_emsv`;

function ActualizarCELS() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  // ---- Modo de trabajo ----
  const [mode, setMode] = useState("crear"); // 'crear' | 'modificar'
  const [selectedId, setSelectedId] = useState(null);

  // ---- Formulario ----
  const [form, setForm] = useState({
    nombre: "",
    street_norm: "",
    number_norm: "",
    reference: "",
    auto_CEL: 1,
    por_ocupacion: "",
    num_usuarios: "", 
  });

  const resetForm = () => {
    setForm({
      nombre: "",
      street_norm: "",
      number_norm: "",
      reference: "",
      auto_CEL: 1,
      por_ocupacion: "",
      num_usuarios: "",
    });
    setSelectedId(null);
  };

  // ---- UI state ----
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState({ open: false, msg: "", severity: "success" });
  const onCloseSnack = () => setSnack((s) => ({ ...s, open: false }));

  // ---- Direcciones EMSV (desde Node API) ----
  const [refIndex, setRefIndex] = useState({});
  const [streets, setStreets] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [loadingIdx, setLoadingIdx] = useState(true);

  // ---- CELS existentes ----
  const [search, setSearch] = useState("");
  const [cels, setCels] = useState([]);
  const [loadingCels, setLoadingCels] = useState(false);

  // Cargar dataset de calles/números al montar (desde /api/visor_emsv)
  useEffect(() => {
    (async () => {
      try {
        setLoadingIdx(true);
        const res = await axios.get(EMSV_URL);
        const ref = res.data?.calles_num_ref || {};
        setRefIndex(ref);
        const calleList = Object.keys(ref || {});
        setStreets(calleList.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })));
      } catch (err) {
        console.error("Error cargando calles:", err);
        setRefIndex({});
        setStreets([]);
      } finally {
        setLoadingIdx(false);
      }
    })();
  }, []);

  // Actualizar números cuando cambia la calle seleccionada
  useEffect(() => {
    if (!form.street_norm || !refIndex) {
      setNumbers([]);
      return;
    }
    const nums = Object.keys(refIndex[form.street_norm] || {});
    nums.sort((a, b) => {
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a).localeCompare(String(b), "es", { sensitivity: "base" });
    });
    setNumbers(nums.map(String));
  }, [form.street_norm, refIndex]);

  // Buscar CELS existentes (cuando modo='modificar' o cambia el search)
  useEffect(() => {
    if (mode !== "modificar") return;
    let cancel = false;
    (async () => {
      try {
        setLoadingCels(true);
        const res = await axios.get(`${API_BASE}/cels`, {
          params: { search: search || "", limit: 200 },
        });
        if (cancel) return;
        setCels(res.data.items || []);
      } catch (e) {
        console.error(e);
        setCels([]);
      } finally {
        if (!cancel) setLoadingCels(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [mode, search]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "por_ocupacion") {
      const clean = value.replace(",", ".");
      setForm((f) => ({ ...f, por_ocupacion: clean }));
      return;
    }
    setForm((f) => ({ ...f, [name]: value }));
  };



  const validate = () => {
    if (!form.nombre.trim()) return "El nombre es obligatorio.";
    if (!form.street_norm.trim()) return "La calle (street_norm) es obligatoria.";
    if (!String(form.number_norm).trim() || Number.isNaN(Number(form.number_norm)))
      return "El número (number_norm) debe ser un entero.";
    if (!form.reference.trim()) return "La referencia es obligatoria.";

    if (form.por_ocupacion !== "" && (Number(form.por_ocupacion) < 0 || Number(form.por_ocupacion) > 100))
      return "El porcentaje de ocupación debe estar entre 0 y 100.";

    if (Number(form.auto_CEL) === 2) {
      if (form.por_ocupacion === "" || Number.isNaN(Number(form.por_ocupacion)))
        return "El porcentaje de ocupación es obligatorio para Autoconsumo compartido.";
      if (form.num_usuarios === "" || Number(form.num_usuarios) < 1)
        return "El número de usuarios (>=1) es obligatorio para Autoconsumo compartido.";
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) return setSnack({ open: true, msg: err, severity: "error" });

    try {
      setLoading(true);
      const payload = {
        nombre: form.nombre.trim(),
        street_norm: form.street_norm,
        number_norm: Number(form.number_norm),
        reference: form.reference.trim(),
        auto_CEL: Number(form.auto_CEL),
        ...(form.por_ocupacion === "" || isNaN(Number(form.por_ocupacion))
          ? {}
          : { por_ocupacion: Number(form.por_ocupacion) }),
        ...(form.num_usuarios === "" || isNaN(Number(form.num_usuarios))
          ? {}
          : { num_usuarios: Number(form.num_usuarios) }),         // <— NUEVO
      };

      if (mode === "crear" || !selectedId) {
        await axios.post(`${API_BASE}/cels`, payload);
        setSnack({ open: true, msg: "CEL registrado correctamente.", severity: "success" });
        resetForm();
      } else {
        await axios.put(`${API_BASE}/cels/${selectedId}`, payload);
        setSnack({ open: true, msg: "CEL actualizado correctamente.", severity: "success" });
      }
    } catch (error) {
      let msg = "Error en el servidor.";
      if (error.response?.status === 403) msg = "La API está en modo solo lectura (READ_ONLY).";
      else if (error.response?.status === 409) msg = "Ya existe un registro con esa referencia.";
      else if (error.response?.data?.detail) msg = error.response.data.detail;
      setSnack({ open: true, msg, severity: "error" });
    } finally {
      setLoading(false);
    }
  };


  const handleSelectCEL = async (cel) => {
    if (!cel) {
      resetForm();
      return;
    }
    setSelectedId(cel.id);

    const por =
      typeof cel.por_ocupacion === "number" && !isNaN(cel.por_ocupacion)
        ? Math.min(100, Math.round(cel.por_ocupacion * 100) / 100)
        : "";

    setForm({
      nombre: cel.nombre || "",
      street_norm: cel.street_norm || "",
      number_norm: String(cel.number_norm ?? ""),
      reference: cel.reference || "",
      auto_CEL: Number(cel.auto_CEL ?? 1),
      por_ocupacion: por === "" ? "" : String(por),
      num_usuarios: cel.num_usuarios != null ? String(cel.num_usuarios) : "",
    });
  };

  const celOptions = useMemo(
    () =>
      cels.map((c) => ({
        ...c,
        label: c.nombre
          ? `${c.nombre} • ${c.reference} • ${c.street_norm} ${c.number_norm}`
          : `${c.reference} • ${c.street_norm} ${c.number_norm}`,
      })),
    [cels]
  );

  // cuando eliges número, autofill de la referencia desde refIndex
  const handleSelectNumber = (n) => {
    const refcat = refIndex?.[form.street_norm]?.[String(n)] ?? "";
    setForm((f) => ({ ...f, number_norm: n, reference: refcat }));
  };


  const btnSx = {
    selected: {
      backgroundColor: theme.palette.primary.main,
      color: "#fff",
      "&:hover": { backgroundColor: theme.palette.primary.dark },
    },
    unselected: {
      backgroundColor: colors.gray[800],         // visible en fondo oscuro
      color: colors.gray[100],
      border: `1px solid ${colors.gray[600]}`,
      "&:hover": { backgroundColor: colors.gray[700] },
    },
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
      <SubUpBar
        title="Gestionar CELS"
        crumbs={[
          ["Inicio", "/"],
          ["Actualizar-Modificar CELS y AC", "/cels"],
        ]}
        info={{
          title: "Alta y edición de autoconsumos (CELS)",
          description: (
            <Typography variant="h5" sx={{ color: colors.gray[400] }}>
              Crea nuevos CELS o selecciona uno existente para modificarlo.
            </Typography>
          ),
        }}
      />

      <Box m="10px">
        <Paper elevation={3} sx={{ p: 2.5, backgroundColor: colors.gray[900], borderRadius: 2 }}>
  
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ color: colors.gray[200], fontWeight: 700 }}>
            {mode === "crear"
              ? "Formulario de registro de CEL o autoconsumo compartido"
              : "Formulario para editar CEL o autoconsumo compartido"}
          </Typography>

          <Stack direction="row" spacing={1}>
            <Button
              startIcon={<AddCircleOutlineIcon />}
              onClick={() => {
                setMode("crear");
                resetForm();
              }}
              disableElevation
              sx={{
                px: 2,
                fontWeight: 600,
                borderRadius: 2,
                border: 1,
                borderColor: mode === "crear" ? "transparent" : colors.gray[600],
                backgroundColor: mode === "crear" ? theme.palette.primary.main : colors.gray[800],
                color: mode === "crear" ? "#fff" : colors.gray[100],
                "&:hover": {
                  backgroundColor: mode === "crear"
                    ? theme.palette.primary.dark
                    : colors.gray[700],
                },
              }}
            >
              Crear
            </Button>

            <Button
              startIcon={<EditOutlinedIcon />}
              onClick={() => setMode("modificar")}
              disableElevation
              sx={{
                px: 2,
                fontWeight: 600,
                borderRadius: 2,
                border: 1,
                borderColor: mode === "modificar" ? "transparent" : colors.gray[600],
                backgroundColor: mode === "modificar" ? theme.palette.primary.main : colors.gray[800],
                color: mode === "modificar" ? "#fff" : colors.gray[100],
                "&:hover": {
                  backgroundColor: mode === "modificar"
                    ? theme.palette.primary.dark
                    : colors.gray[700],
                },
              }}
            >
              Modificar
            </Button>
          </Stack>
        </Stack>


          {mode === "modificar" && (
            <>
              <Stack spacing={2} direction={{ xs: "column", sm: "row" }} sx={{ mb: 2 }}>
                <Autocomplete
                  fullWidth
                  options={celOptions}
                  loading={loadingCels}
                  onChange={(_e, val) => handleSelectCEL(val || null)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Seleccionar CELS existente"
                      placeholder={loadingCels ? "Cargando..." : "Escribe para filtrar"}
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {loadingCels ? <CircularProgress size={18} /> : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                />
              </Stack>
              <Divider sx={{ mb: 2, borderColor: colors.gray[700] }} />
            </>
          )}

          {/* --- Nombre --- */}
          <Stack spacing={2} direction={{ xs: "column", sm: "row" }}>
            <TextField fullWidth label="Nombre" name="nombre" value={form.nombre} onChange={handleChange} />
          </Stack>

          {/* --- Calle y número --- */}
          <Stack spacing={2} direction={{ xs: "column", sm: "row" }} sx={{ mt: 2 }}>
            <Autocomplete
              fullWidth
              options={streets}
              value={form.street_norm || null}
              onChange={(_e, newValue) => {
                setForm((f) => ({ ...f, street_norm: newValue || "", number_norm: "", reference: "" }));
              }}
              loading={loadingIdx}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Calle"
                  placeholder={loadingIdx ? "Cargando calles..." : "Escribe para buscar..."}
                  variant="outlined"
                />
              )}
              disableClearable={false}
            />

            <FormControl fullWidth disabled={!form.street_norm || loadingIdx}>
              <InputLabel>Número</InputLabel>
              <Select
                name="number_norm"
                value={form.number_norm}
                label="Número"
                onChange={(e) => handleSelectNumber(e.target.value)}
              >
                {numbers.map((n) => (
                  <MenuItem key={n} value={n}>
                    {n}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {/* --- Referencia y tipo --- */}
          <Stack spacing={2} direction={{ xs: "column", sm: "row" }} sx={{ mt: 2 }}>
            <TextField
              fullWidth
              label="Referencia"
              name="reference"
              value={form.reference}
              onChange={handleChange}
              placeholder="7326410VK3672N"
              helperText="Se autocompleta al elegir número; puedes editarla si lo necesitas."
            />
            <FormControl fullWidth>
              <InputLabel id="auto-cel-label">Tipo de proyecto</InputLabel>
              <Select
                labelId="auto-cel-label"
                name="auto_CEL"
                value={form.auto_CEL}
                label="Tipo de proyecto"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setForm((f) => ({
                    ...f,
                    auto_CEL: v,
                    // si pasa a CEL (1), los opcionales ya no son requeridos; opcional: limpiar
                    por_ocupacion: v === 2 ? f.por_ocupacion : "",
                    num_usuarios: v === 2 ? f.num_usuarios : "",   // <— NUEVO
                  }));
                }}
              >
                <MenuItem value={1}>CEL</MenuItem>
                <MenuItem value={2}>Autoconsumo compartido</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          {/* --- Porcentaje ocupación (0–100) --- */}
          <Stack spacing={2} direction={{ xs: "column", sm: "row" }} sx={{ mt: 2 }}>
            <TextField
              fullWidth
              label="Porcentaje de ocupación (%)"
              name="por_ocupacion"
              value={form.por_ocupacion}
              onChange={handleChange}
              type="number"
              inputProps={{ min: 0, max: 100, step: "0.01" }}
              helperText="Introduce 0–100. Se guardará como 0–100."
            />
          </Stack>
          {/* --- Número de usuarios (solo Autoconsumo compartido) --- */}
          {Number(form.auto_CEL) === 2 && (
            <Stack spacing={2} direction={{ xs: "column", sm: "row" }} sx={{ mt: 2 }}>
              <TextField
                fullWidth
                label="Número de usuarios"
                name="num_usuarios"
                value={form.num_usuarios}
                onChange={handleChange}
                type="number"
                inputProps={{ min: 1, step: 1 }}
                helperText="Obligatorio si es Autoconsumo compartido."
              />
            </Stack>
          )}

          {/* --- Botones --- */}
          <Box mt={3} display="flex" gap={1.5}>
            <Button variant="contained" color="primary" onClick={handleSubmit} disabled={loading}>
              {loading ? "Guardando..." : mode === "crear" || !selectedId ? "Guardar" : "Actualizar"}
            </Button>
            <Button variant="outlined" onClick={resetForm} disabled={loading}>
              Limpiar
            </Button>
          </Box>
        </Paper>
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={onCloseSnack}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert onClose={onCloseSnack} severity={snack.severity} sx={{ width: "100%" }}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </motion.div>
  );
}

export default ActualizarCELS;
