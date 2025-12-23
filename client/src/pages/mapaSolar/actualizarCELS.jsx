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
import { API_BASE } from "../../data/direccion_server";




const EMSV_URL = `${API_BASE}/visor_emsv`;  

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
    radio: "",
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
      radio: "",
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



  // ---- Bloque "Modificar datos" ----
  const [dataSection, setDataSection] = useState("precio");

  // Radio
  const [radioId, setRadioId] = useState(null);
  const [radioValue, setRadioValue] = useState("");

  // Precio energía
  const [precioEnergia, setPrecioEnergia] = useState("");
  const [loadingPrecio, setLoadingPrecio] = useState(false);


  const [precioExcedente, setPrecioExcedente] = useState("");
  const [loadingExcedente, setLoadingExcedente] = useState(false);


  // Obras
  const [obraForm, setObraForm] = useState({
    nombre: "",
    street_norm: "",
    number_norm: "",
    reference: "",
    tipo_obra: "",
  });


  const [obraMode, setObraMode] = useState("crear"); // 'crear' | 'modificar'
  const [obraSearch, setObraSearch] = useState("");
  const [selectedObra, setSelectedObra] = useState(null); // objeto completo


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


  useEffect(() => {
    (async () => {
      try {
        setLoadingPrecio(true);
        const res = await axios.get(`${API_BASE}/precioEnergia`);
        const p = res.data?.precio;
        setPrecioEnergia(p == null ? "" : String(p));
      } catch (e) {
        // no bloquea, solo aviso
        console.error(e);
      } finally {
        setLoadingPrecio(false);
      }
    })();
  }, []);

  const handleSaveRadio = async () => {
    if (!radioId) return setSnack({ open: true, msg: "Selecciona un CELS/AC.", severity: "error" });
    const r = Number(String(radioValue).replace(",", "."));
    if (!Number.isFinite(r) || r < 0) return setSnack({ open: true, msg: "Radio inválido.", severity: "error" });

    try {
      setLoading(true);
      // OJO: como tu PUT /cels/{id} exige payload completo, lo más fácil:
      // 1) busca el CEL en memoria (cels array) y manda todo con radio actualizado
      const cel = cels.find(x => x.id === radioId);
      if (!cel) throw new Error("CELS no encontrado en listado.");

      const payload = {
        nombre: cel.nombre,
        street_norm: cel.street_norm,
        number_norm: Number(cel.number_norm),
        reference: cel.reference,
        auto_CEL: Number(cel.auto_CEL),
        por_ocupacion: cel.por_ocupacion ?? null,
        num_usuarios: cel.num_usuarios ?? 0,
        radio: r,
      };

      await axios.put(`${API_BASE}/cels/${radioId}`, payload);
      setSnack({ open: true, msg: "Radio actualizado.", severity: "success" });
    } catch (e) {
      const msg = e.response?.data?.detail || "Error actualizando radio.";
      setSnack({ open: true, msg, severity: "error" });
    } finally {
      setLoading(false);
    }
  };


  

  const handleSavePrecio = async () => {
    const p = Number(String(precioEnergia).replace(",", "."));
    if (!Number.isFinite(p) || p < 0) return setSnack({ open: true, msg: "Precio inválido.", severity: "error" });

    try {
      setLoading(true);
      await axios.put(`${API_BASE}/precioEnergia`, { precio: p });
      setSnack({ open: true, msg: "Precio de energía actualizado.", severity: "success" });
    } catch (e) {
      const msg = e.response?.data?.detail || "Error guardando precio.";
      setSnack({ open: true, msg, severity: "error" });
    } finally {
      setLoading(false);
    }
  };



  const handleObraChange = (e) => {
  const { name, value } = e.target;
  setObraForm((f) => ({ ...f, [name]: value }));
};

const handleSelectNumberObra = (n) => {
  const refcat = refIndex?.[obraForm.street_norm]?.[String(n)] ?? "";
  setObraForm((f) => ({ ...f, number_norm: n, reference: refcat }));
};

const handleCreateObra = async () => {
    if (!obraForm.nombre.trim()) return setSnack({ open: true, msg: "Nombre de obra obligatorio.", severity: "error" });
    if (!obraForm.street_norm) return setSnack({ open: true, msg: "Calle obligatoria.", severity: "error" });
    if (!obraForm.number_norm) return setSnack({ open: true, msg: "Número obligatorio.", severity: "error" });
    if (!obraForm.reference) return setSnack({ open: true, msg: "Referencia obligatoria.", severity: "error" });
    if (!obraForm.tipo_obra.trim()) return setSnack({ open: true, msg: "Descripción/tipo de obra obligatorio.", severity: "error" });

    try {
      setLoading(true);
      await axios.post(`${API_BASE}/obras`, {
        nombre: obraForm.nombre.trim(),
        street_norm: obraForm.street_norm,
        number_norm: Number(obraForm.number_norm),
        reference: obraForm.reference.trim(),
        tipo_obra: obraForm.tipo_obra.trim(),
      });
      setSnack({ open: true, msg: "Obra creada.", severity: "success" });
      setObraForm({ nombre: "", street_norm: "", number_norm: "", reference: "", tipo_obra: "" });
    } catch (e) {
      const msg = e.response?.data?.detail || "Error creando obra.";
      setSnack({ open: true, msg, severity: "error" });
    } finally {
      setLoading(false);
    }
  };



  
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

  const [numbersObras, setNumbersObras] = useState([]);

  useEffect(() => {
    if (!obraForm.street_norm || !refIndex) {
      setNumbersObras([]);
      return;
    }
    const nums = Object.keys(refIndex[obraForm.street_norm] || {});
    nums.sort((a, b) => (parseInt(a,10) - parseInt(b,10)));
    setNumbersObras(nums.map(String));
  }, [obraForm.street_norm, refIndex]);


  // Buscar CELS existentes (cuando modo='modificar' o cambia el search)
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoadingCels(true);
        const res = await axios.get(`${API_BASE}/cels`, {
          params: { search: search || "", limit: 200 },
        });
        if (!cancel) setCels(res.data.items || []);
      } catch (e) {
        if (!cancel) setCels([]);
      } finally {
        if (!cancel) setLoadingCels(false);
      }
    })();
    return () => { cancel = true; };
  }, [search, mode]);


  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "por_ocupacion") {
      const clean = value.replace(",", ".");
      setForm((f) => ({ ...f, por_ocupacion: clean }));
      return;
    }
    if (name === "radio") {
      const clean = value.replace(",", ".");
      setForm((f) => ({ ...f, radio: clean }));
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
          : { num_usuarios: Number(form.num_usuarios) }),        
        ...(form.radio === "" || isNaN(Number(form.radio)) ? {} : { radio: Number(form.radio) }),
      };

      if (mode === "crear" || !selectedId) {
        await axios.post(`${API_BASE}/cels`, payload);
        setSnack({ open: true, msg: "Registrado correctamente.", severity: "success" });
        resetForm();
      } else {
        await axios.put(`${API_BASE}/cels/by_reference`, payload);
        setSnack({ open: true, msg: "Registro modificado correctamente.", severity: "success" });
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
      radio: cel.radio != null ? String(cel.radio) : "",
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


  const commonBtn = {
    px: 2.2,
    py: 1,
    borderRadius: 2,
    fontWeight: 700,
    textTransform: "uppercase",
    boxShadow: "0 1px 2px rgba(0,0,0,.08)",
    "&.Mui-disabled": {
      opacity: 0.6,              // menos transparente que el default
      color: "#666",
      borderColor: "#ddd",
    },
  };
  

  const [obras, setObras] = useState([]);
  const [loadingObras, setLoadingObras] = useState(false);

  const fetchObras = async (q="") => {
    try {
      setLoadingObras(true);
      const res = await axios.get(`${API_BASE}/obras`, { params: { search: q, limit: 200 }});
      setObras(res.data.items || []);
    } finally {
      setLoadingObras(false);
    }
  };

  useEffect(() => {
    if (dataSection === "obras") fetchObras(obraSearch);
  }, [dataSection, obraSearch]);

  
  const handleSelectObra = (obra) => {
    setSelectedObra(obra || null);
    if (!obra) {
      setObraForm({ nombre:"", street_norm:"", number_norm:"", reference:"", tipo_obra:"" });
      return;
    }
    setObraForm({
      nombre: obra.nombre || "",
      street_norm: obra.street_norm || "",
      number_norm: String(obra.number_norm ?? ""),
      reference: obra.reference || "",
      tipo_obra: obra.tipo_obra || "",
    });
  };


  const validateObra = () => {
    if (!obraForm.nombre.trim()) return "Nombre de obra obligatorio.";
    if (!obraForm.street_norm) return "Calle obligatoria.";
    if (!obraForm.number_norm) return "Número obligatorio.";
    if (!obraForm.reference) return "Referencia obligatoria.";
    if (!obraForm.tipo_obra.trim()) return "Descripción/tipo de obra obligatorio.";
    return null;
  };

  const handleSaveObra = async () => {
    const err = validateObra();
    if (err) return setSnack({ open:true, msg: err, severity:"error" });

    const payload = {
      nombre: obraForm.nombre.trim(),
      street_norm: obraForm.street_norm,
      number_norm: Number(obraForm.number_norm),
      reference: obraForm.reference.trim(),
      tipo_obra: obraForm.tipo_obra.trim(),
    };

    try {
      setLoading(true);
      if (obraMode === "modificar" && selectedObra?.id) {
        await axios.put(`${API_BASE}/obras/${selectedObra.id}`, payload);
        setSnack({ open:true, msg:"Obra actualizada.", severity:"success" });
      } else {
        await axios.post(`${API_BASE}/obras`, payload);
        setSnack({ open:true, msg:"Obra creada.", severity:"success" });
      }

      await fetchObras(obraSearch);
      // opcional: mantener seleccionada la obra o limpiar
      // setSelectedObra(null);
      // setObraForm({ ... });
    } catch (e) {
      const msg =
        e.response?.status === 403 ? "La API está en modo solo lectura (READ_ONLY)." :
        e.response?.data?.detail || "Error guardando obra.";
      setSnack({ open:true, msg, severity:"error" });
    } finally {
      setLoading(false);
    }
  };



  const handleDeleteSelectedObra = async () => {
    if (!selectedObra?.id) return;
    if (!window.confirm(`¿Eliminar obra ${selectedObra.id}?`)) return;
    try {
      setLoading(true);
      await axios.delete(`${API_BASE}/obras/${selectedObra.id}`);
      setSnack({ open:true, msg:"Obra eliminada.", severity:"success" });
      setSelectedObra(null);
      setObraForm({ nombre:"", street_norm:"", number_norm:"", reference:"", tipo_obra:"" });
      await fetchObras(obraSearch);
    } catch (e) {
      setSnack({ open:true, msg: e.response?.data?.detail || "Error eliminando obra.", severity:"error" });
    } finally {
      setLoading(false);
    }
  };




  useEffect(() => {
    (async () => {
      try {
        setLoadingPrecio(true);
        const res = await axios.get(`${API_BASE}/precioEnergia`);
        const p = res.data?.precio;
        setPrecioEnergia(p == null ? "" : String(p));
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingPrecio(false);
      }
    })();

    (async () => {
      try {
        setLoadingExcedente(true);
        const res = await axios.get(`${API_BASE}/precioExcedente`);
        const p = res.data?.precio;
        setPrecioExcedente(p == null ? "" : String(p));
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingExcedente(false);
      }
    })();
  }, []);


  const handleSaveExcedente = async () => {
    const p = Number(String(precioExcedente).replace(",", "."));
    if (!Number.isFinite(p) || p < 0) {
      return setSnack({ open: true, msg: "Precio excedente inválido.", severity: "error" });
    }

    try {
      setLoading(true);
      await axios.put(`${API_BASE}/precioExcedente`, { precio: p });
      setSnack({ open: true, msg: "Precio del excedente actualizado.", severity: "success" });
    } catch (e) {
      const msg = e.response?.data?.detail || "Error guardando precio excedente.";
      setSnack({ open: true, msg, severity: "error" });
    } finally {
      setLoading(false);
    }
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
              ? "Crear CEL o autoconsumo compartido"
              : "Modificar CEL o autoconsumo compartido"}
          </Typography>

          <Stack direction="row" spacing={1}>
            <Button
              startIcon={<AddCircleOutlineIcon />}
              onClick={() => { setMode("crear"); resetForm(); }}
              disableElevation
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderRadius: 2,
                px: 2.5,
                ...(mode === "crear"
                  ? {
                      backgroundColor: colors.gray[700], // ACTIVO → gris oscuro
                      color: "#fff",
                      "&:hover": { backgroundColor: colors.gray[600] },
                    }
                  : {
                      backgroundColor: "#fff",           // INACTIVO → blanco
                      color: colors.gray[800],
                      border: `1px solid ${colors.gray[400]}`,
                      "&:hover": { backgroundColor: colors.gray[200] },
                    }),
              }}
            >
              Crear
            </Button>

            <Button
              startIcon={<EditOutlinedIcon />}
              onClick={() => setMode("modificar")}
              disableElevation
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderRadius: 2,
                px: 2.5,
                ...(mode === "modificar"
                  ? {
                      backgroundColor: colors.gray[700], 
                      color: "#fff",
                      "&:hover": { backgroundColor: colors.gray[600] },
                    }
                  : {
                      backgroundColor: "#fff",           
                      color: colors.gray[800],
                      border: `1px solid ${colors.gray[400]}`,
                      "&:hover": { backgroundColor: colors.gray[500] },
                    }),
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
                  onInputChange={(_e, val) => setSearch(val)} // <-- para filtrar en servidor
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
            <TextField
              fullWidth
              label="Radio (m)"
              name="radio"
              value={form.radio}
              onChange={handleChange}
              type="number"
              inputProps={{ min: 0, step: 1 }}
              helperText="Radio de influencia (en metros) para esta CEL / autoconsumo."
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
              {/* ACTUALIZAR / GUARDAR */}
              <Button
                onClick={handleSubmit}
                disabled={loading}
                variant="contained"
                sx={{
                  ...commonBtn,
                  bgcolor: "#ffffff",
                  color: "#111827",
                  border: "1px solid #e5e7eb",
                  "&:hover": { bgcolor: "#f3f4f6" },
                }}
              >
                {loading ? "Guardando..." : mode === "crear" || !selectedId ? "Guardar" : "Actualizar"}
              </Button>

              {/* LIMPIAR */}
              <Button
                onClick={resetForm}
                disabled={loading}
                variant="contained"
                sx={{
                  ...commonBtn,
                  bgcolor: "#ffffff",
                  color: "#111827",
                  border: "1px solid #e5e7eb",
                  "&:hover": { bgcolor: "#f3f4f6" },
                }}
              >
                Limpiar
              </Button>

              {/* ELIMINAR (menos transparente, foco rojo suave) */}
              {mode === "modificar" && selectedId && (
                <Button
                  onClick={async () => {
                    if (!window.confirm("¿Seguro que deseas eliminar este CEL?")) return;
                    try {
                      setLoading(true);
                      await axios.delete(`${API_BASE}/cels/${selectedId}`);
                      setSnack({ open: true, msg: "Registro eliminado correctamente.", severity: "success" });
                      resetForm();
                      const res = await axios.get(`${API_BASE}/cels`, { params: { limit: 200 } });
                      setCels(res.data.items || []);
                    } catch (error) {
                      let msg = "Error al eliminar.";
                      if (error.response?.status === 403) msg = "La API está en modo solo lectura (READ_ONLY).";
                      else if (error.response?.status === 404) msg = "No se encontró el registro a eliminar.";
                      setSnack({ open: true, msg, severity: "error" });
                    } finally {
                      setLoading(false);
                    }
                  }}
                  variant="outlined"
                  sx={{
                    ...commonBtn,
                    border: "1px solid #ef4444",
                    color: "#b91c1c",
                    bgcolor: "rgba(239,68,68,0.06)",     // rojo muy suave, nada “fantasma”
                    "&:hover": { bgcolor: "rgba(239,68,68,0.12)" },
                    "&.Mui-disabled": {
                      opacity: 0.7,                       // menos desvanecido que default
                      color: "#b91c1c",
                      borderColor: "#ef9a9a",
                      bgcolor: "rgba(239,68,68,0.04)",
                    },
                  }}
                >
                  Eliminar
                </Button>
              )}
          </Box>


        </Paper>
        <Paper elevation={3} sx={{ p: 2.5, mt: 2, backgroundColor: colors.gray[900], borderRadius: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ color: colors.gray[200], fontWeight: 700 }}>
              Modificar datos
            </Typography>

            <ButtonGroup variant="contained" disableElevation>
              <Button
                onClick={() => setDataSection("precio")}
                sx={dataSection === "precio" ? { bgcolor: colors.gray[700] } : { bgcolor: "#fff", color: colors.gray[800] }}
              >
                Precio energía
              </Button>
              <Button
                onClick={() => setDataSection("obras")}
                sx={dataSection === "obras" ? { bgcolor: colors.gray[700] } : { bgcolor: "#fff", color: colors.gray[800] }}
              >
                Obras
              </Button>
            </ButtonGroup>

          </Stack>

          <Divider sx={{ mb: 2, borderColor: colors.gray[700] }} />

          {/* ====== 2) PRECIO ENERGÍA ====== */}
          {dataSection === "precio" && (
            <Stack spacing={2}>
              <TextField
                fullWidth
                label="Precio de energía (€/kWh)"
                value={precioEnergia}
                onChange={(e) => setPrecioEnergia(e.target.value)}
                type="number"
                inputProps={{ min: 0, step: "0.001" }}
                helperText={loadingPrecio ? "Cargando precio..." : "Valor global para cálculos."}
              />

              <Box display="flex" gap={1.5}>
                <Button
                  onClick={handleSavePrecio}
                  disabled={loading}
                  variant="contained"
                  sx={{ bgcolor: "#fff", color: "#111827", border: "1px solid #e5e7eb", "&:hover": { bgcolor: "#f3f4f6" } }}
                >
                  Guardar precio energía
                </Button>
              </Box>
              <TextField
                fullWidth
                label="Precio del excedente energía (€/kWh)"
                value={precioExcedente}
                onChange={(e) => setPrecioExcedente(e.target.value)}
                type="number"
                inputProps={{ min: 0, step: "0.001" }}
                helperText={loadingExcedente ? "Cargando precio..." : "Valor global para cálculos."}
              />

              <Box display="flex" gap={1.5}>
                <Button
                  onClick={handleSaveExcedente}
                  disabled={loading}
                  variant="contained"
                  sx={{ bgcolor: "#fff", color: "#111827", border: "1px solid #e5e7eb", "&:hover": { bgcolor: "#f3f4f6" } }}
                >
                  Guardar precio excedente energía
                </Button>
              </Box>

            </Stack>
            
          )}
          
          {/* ====== 3) OBRAS ====== */}
          {dataSection === "obras" && (
          <Stack spacing={2}>
            {/* ====== MODO OBRAS: CREAR / MODIFICAR ====== */}
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
              <Typography variant="h6" sx={{ color: colors.gray[200], fontWeight: 700 }}>
                {obraMode === "crear" ? "Crear obra" : "Modificar obra"}
              </Typography>

              <ButtonGroup variant="contained" disableElevation>
                <Button
                  onClick={() => {
                    setObraMode("crear");
                    setSelectedObra(null);
                    setObraSearch("");
                    setObraForm({ nombre: "", street_norm: "", number_norm: "", reference: "", tipo_obra: "" });
                  }}
                  sx={obraMode === "crear" ? { bgcolor: colors.gray[700] } : { bgcolor: "#fff", color: colors.gray[800] }}
                >
                  Crear
                </Button>
                <Button
                  onClick={() => setObraMode("modificar")}
                  sx={obraMode === "modificar" ? { bgcolor: colors.gray[700] } : { bgcolor: "#fff", color: colors.gray[800] }}
                >
                  Modificar
                </Button>
              </ButtonGroup>
            </Stack>

            {/* ====== SELECTOR (SOLO MODIFICAR) ====== */}
            {obraMode === "modificar" && (
              <Autocomplete
                fullWidth
                options={obras}
                loading={loadingObras}
                value={selectedObra}
                isOptionEqualToValue={(opt, val) => opt?.id === val?.id}
                getOptionLabel={(o) =>
                  o?.nombre
                    ? `${o.nombre} • ${o.reference} • ${o.street_norm} ${o.number_norm}`
                    : `${o?.reference || ""} • ${o?.street_norm || ""} ${o?.number_norm ?? ""}`
                }
                onChange={(_e, val) => handleSelectObra(val || null)}
                onInputChange={(_e, val) => setObraSearch(val)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Seleccionar obra existente"
                    placeholder={loadingObras ? "Cargando..." : "Escribe para filtrar"}
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {loadingObras ? <CircularProgress size={18} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
            )}

            <Divider sx={{ borderColor: colors.gray[700] }} />

            {/* ====== FORMULARIO ====== */}
            <TextField fullWidth label="Nombre de la obra" name="nombre" value={obraForm.nombre} onChange={handleObraChange} />

            <Stack spacing={2} direction={{ xs: "column", sm: "row" }}>
              <Autocomplete
                fullWidth
                options={streets}
                value={obraForm.street_norm || null}
                onChange={(_e, newValue) => {
                  setObraForm((f) => ({ ...f, street_norm: newValue || "", number_norm: "", reference: "" }));
                  if (obraMode === "modificar") setSelectedObra(null);
                }}
                loading={loadingIdx}
                renderInput={(params) => <TextField {...params} label="Calle" />}
              />

              <FormControl fullWidth disabled={!obraForm.street_norm || loadingIdx}>
                <InputLabel>Número</InputLabel>
                <Select value={obraForm.number_norm} label="Número" onChange={(e) => handleSelectNumberObra(e.target.value)}>
                  {numbersObras.map((n) => (
                    <MenuItem key={n} value={n}>
                      {n}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <TextField
              fullWidth
              label="Referencia"
              name="reference"
              value={obraForm.reference}
              onChange={handleObraChange}
              helperText="Se autocompleta al elegir número; puedes editarla si lo necesitas."
            />

            <TextField
              fullWidth
              label="Descripción / tipo de obra"
              name="tipo_obra"
              value={obraForm.tipo_obra}
              onChange={handleObraChange}
              multiline
              minRows={3}
            />

            {/* ====== BOTONES ====== */}
            <Box display="flex" gap={1.5}>
              <Button
                onClick={handleSaveObra}
                disabled={loading}
                variant="contained"
                sx={{ bgcolor: "#fff", color: "#111827", border: "1px solid #e5e7eb", "&:hover": { bgcolor: "#f3f4f6" } }}
              >
                {loading ? "Guardando..." : obraMode === "modificar" && selectedObra?.id ? "Actualizar obra" : "Crear obra"}
              </Button>

              {obraMode === "modificar" && selectedObra?.id && (
                <Button
                  variant="outlined"
                  disabled={loading}
                  sx={{ borderColor: "#ef4444", color: "#ef4444" }}
                  onClick={handleDeleteSelectedObra}
                >
                  Eliminar
                </Button>
              )}

              <Button
                onClick={() => {
                  setSelectedObra(null);
                  setObraForm({ nombre: "", street_norm: "", number_norm: "", reference: "", tipo_obra: "" });
                }}
                disabled={loading}
                variant="contained"
                sx={{ bgcolor: "#fff", color: "#111827", border: "1px solid #e5e7eb", "&:hover": { bgcolor: "#f3f4f6" } }}
              >
                Limpiar
              </Button>
            </Box>

            <Divider sx={{ my: 2, borderColor: colors.gray[700] }} />

            {/* ====== LISTADO ====== */}
            <Typography variant="h6" sx={{ color: colors.gray[200] }}>
              Obras creadas
            </Typography>

            {loadingObras ? (
              <CircularProgress size={20} />
            ) : (
              <Stack spacing={1} sx={{ mt: 1 }}>
                {obras.map((o) => (
                  <Paper key={o.id} sx={{ p: 1.2, backgroundColor: colors.gray[800] }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography sx={{ color: "#fff", fontWeight: 700 }}>
                          {o.nombre} (id: {o.id})
                        </Typography>
                        <Typography sx={{ color: colors.gray[300] }}>
                          {o.street_norm} {o.number_norm} · {o.reference}
                        </Typography>
                        <Typography sx={{ color: colors.gray[400] }}>{o.tipo_obra}</Typography>
                      </Box>

                      <Stack direction="row" spacing={1}>
                        <Button
                          variant="outlined"
                          sx={{ borderColor: "#93c5fd", color: "#93c5fd" }}
                          onClick={() => {
                            setObraMode("modificar");
                            handleSelectObra(o);
                          }}
                        >
                          Editar
                        </Button>

                        <Button
                          variant="outlined"
                          sx={{ borderColor: "#ef4444", color: "#ef4444" }}
                          onClick={async () => {
                            if (!window.confirm(`¿Eliminar obra ${o.id}?`)) return;
                            try {
                              setLoading(true);
                              await axios.delete(`${API_BASE}/obras/${o.id}`);
                              setSnack({ open: true, msg: "Obra eliminada.", severity: "success" });
                              fetchObras(obraSearch);
                              if (selectedObra?.id === o.id) {
                                setSelectedObra(null);
                                setObraForm({ nombre: "", street_norm: "", number_norm: "", reference: "", tipo_obra: "" });
                              }
                            } catch (e) {
                              setSnack({ open: true, msg: e.response?.data?.detail || "Error eliminando obra.", severity: "error" });
                            } finally {
                              setLoading(false);
                            }
                          }}
                        >
                          Eliminar
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </Stack>
        )}


        </Paper>

      </Box>

      
      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={onCloseSnack}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={onCloseSnack}
          severity={snack.severity}
          sx={{
            width: "100%",
            "& .MuiAlert-message": { fontSize: 16, fontWeight: 600 }, // ← texto más grande
            "& .MuiAlert-icon": { fontSize: 22 },                     // ← icono más grande
          }}
        >
          {snack.msg}
        </Alert>
      </Snackbar>

    </motion.div>
  );
}

export default ActualizarCELS;
