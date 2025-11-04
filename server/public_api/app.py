# app.py — single FastAPI app, per-request DuckDB connections
from __future__ import annotations
import os, json, duckdb, unicodedata
from typing import List, Tuple

from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from contextlib import contextmanager


import threading
# ============================================================
# SETTINGS
# ============================================================

load_dotenv()

def _resolve_db_path() -> str:
    raw = os.getenv("DUCKDB_PATH", "warehouse.duckdb")
    if not os.path.isabs(raw):
        raw = os.path.abspath(os.path.join(os.path.dirname(__file__), raw))
    print("Resolved DUCKDB_PATH:", raw, "exists:", os.path.exists(raw))
    return raw

DB_PATH = _resolve_db_path()
READ_ONLY = os.getenv("READ_ONLY", "true").lower() == "true"

app = FastAPI(title=f"EMSV API ({'RO' if READ_ONLY else 'RW'})")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- arriba del fichero (cerca de SETTINGS) ----
ALLOWED_SHADOW_TABLES = {"shadows", "puntos_no_parcelas"}  # añade aquí el nombre real de tu tabla

def _shadow_table_or_400(name: str) -> str:
    t = (name or "shadows").strip()
    if t not in ALLOWED_SHADOW_TABLES:
        raise HTTPException(400, f"Tabla no permitida: {t}")
    return t


# ============================================================
# DATABASE CONNECTION HANDLING (per request)
# ============================================================
@contextmanager
def get_db_connection(read_only: bool = True):
    """
    Unified connection factory that ensures consistent configuration.
    
    Args:
        read_only: Whether to open in read-only mode (default True)
    """
    con = None
    try:
        # Open connection with explicit read_only parameter
        con = duckdb.connect(DB_PATH, read_only=read_only)
        con.execute("LOAD spatial;")
        
        # Configure connection
        try:
            con.execute("PRAGMA threads=4;")
            if not read_only:
                con.execute("SET lock_timeout='10s';")
        except duckdb.Error:
            pass
            
        yield con
        
    finally:
        if con:
            try:
                con.close()
            except:
                pass

def _open_conn(read_only: bool):
    # 👇 OJO: NO uses read_only=... en connect (Windows bloquea a veces)
    con = duckdb.connect(DB_PATH)  # <- sin read_only
    con.execute("LOAD spatial;")
    try:
        threads = max(1, (os.cpu_count() or 4) - 1)
        con.execute(f"PRAGMA threads={threads};")
        con.execute("SET lock_timeout='5s';")
        # Si quieres forzar lectura:
        if read_only:
            con.execute("SET access_mode='read_only';")  # <- solo lectura a nivel SQL
            con.execute("BEGIN READ ONLY;")              # <- opcional, asegura R/O
    except duckdb.Error:
        pass
    return con

def get_conn():
    # SOLO LECTURA (seguro para GETs concurrentes)
    con = _open_conn(read_only=True)
    try:
        yield con
    finally:
        con.close()

# Conexiones compartidas (una RW y una RO)
DB_RW = duckdb.connect(DB_PATH)                 # lectura/escritura
DB_RO = duckdb.connect(DB_PATH) # solo lectura

for con in (DB_RW, DB_RO):
    con.execute("LOAD spatial;")
    try:
        threads = max(1, (os.cpu_count() or 4) - 1)
        con.execute(f"PRAGMA threads={threads};")
        con.execute("SET lock_timeout='5s';")
    except duckdb.Error:
        pass

# Si quieres serializar escrituras:
RW_LOCK = threading.RLock()

def get_conn_ro():
    # Con RO no hace falta lock: sólo lecturas
    try:
        yield DB_RO
    finally:
        pass  # no cerrar

def get_conn_rw():
    # Serializamos las operaciones de escritura
    RW_LOCK.acquire()
    try:
        yield DB_RW
    finally:
        RW_LOCK.release()




def q(con: duckdb.DuckDBPyConnection, sql: str, params: list | tuple = ()):
    """Query helper that returns [] on empty and wraps errors."""
    try:
        return con.execute(sql, params).fetchall() or []
    except duckdb.Error as e:
        raise HTTPException(500, f"DuckDB error: {e}") from e

# ============================================================
# HELPERS
# ============================================================

def parse_bbox(bbox: str | None) -> tuple[str, list]:
    if not bbox:
        return "", []
    parts = bbox.split(",")
    if len(parts) != 4:
        raise HTTPException(400, "bbox debe ser 'minx,miny,maxx,maxy'")
    minx, miny, maxx, maxy = map(float, parts)
    return "WHERE ST_Intersects(geom, ST_MakeEnvelope(?, ?, ?, ?))", [minx, miny, maxx, maxy]

def parse_bbox_for_srid(bbox: str | None, target_srid: int) -> tuple[str, list]:
    if not bbox:
        return "", []
    parts = bbox.split(",")
    if len(parts) != 4:
        raise HTTPException(400, "bbox debe ser 'minx,miny,maxx,maxy'")
    minx, miny, maxx, maxy = map(float, parts)
    where = (
        "WHERE ST_Intersects("
        "  geom,"
        "  ST_Transform("
        "    ST_MakeEnvelope(?, ?, ?, ?),"
        "    'EPSG:4326',"
        f"    'EPSG:{target_srid}',"
        "    TRUE"
        "  )"
        ")"
    )
    return where, [minx, miny, maxx, maxy]

def fc(features: list[dict]) -> dict:
    return {"type": "FeatureCollection", "features": features}

# ============================================================
# MODELS
# ============================================================

class ZonalReq(BaseModel):
    geometry: dict  # GeoJSON Polygon/MultiPolygon/Point/…

class SavePointReq(BaseModel):
    lon: float
    lat: float
    buffer_m: float = 100.0
    user_id: str | None = None

class CelsWithinReq(BaseModel):
    geometry: dict  # GeoJSON geometry

# ============================================================
# BUFFERS
# ============================================================

def _select_buffers(con: duckdb.DuckDBPyConnection, where_sql: str, params: list) -> List[Tuple]:
    sql = f"""
        WITH f AS (
          SELECT id, user_id, buffer_m, geom
          FROM point_buffers
          {where_sql}
        )
        SELECT id, user_id, buffer_m, ST_AsGeoJSON(geom) AS geom_json
        FROM f;
    """
    return q(con, sql, params)


@app.get("/api/visor_emsv")
def visor_health():
    return {
        "ok": True,
        "service": "EMSV API",
        "read_only": READ_ONLY,
        "db_path": DB_PATH
    }



@app.get("/buffers")
def get_buffers(
    bbox: str | None = None,
    limit: int = 1000,
    offset: int = 0,
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    where_sql = ""
    params: list = []
    if bbox:
        w, p = parse_bbox(bbox)
        where_sql = f"{w} LIMIT ? OFFSET ?"
        params = p + [limit, offset]
    else:
        where_sql = "LIMIT ? OFFSET ?"
        params = [limit, offset]

    rows = _select_buffers(con, where_sql, params)
    features = [{
        "type": "Feature",
        "geometry": json.loads(gjson) if isinstance(gjson, str) else gjson,
        "properties": {
            "id": rid,
            "user_id": ruser,
            "buffer_m": float(rbuf) if rbuf is not None else None
        }
    } for rid, ruser, rbuf, gjson in rows]
    return fc(features)

# ============================================================
# POINTS
# ============================================================

@app.post("/points")
def save_point(
    req: SavePointReq,
    con: duckdb.DuckDBPyConnection = Depends(get_conn_rw),  # <-- Use write connection
):
    if READ_ONLY:
        raise HTTPException(403, "La API está en modo read-only")

    try:
        con.execute("BEGIN")
        new_id = con.execute("SELECT COALESCE(MAX(id),0)+1 FROM points").fetchone()[0]
        con.execute(
            """
            INSERT INTO points (id, user_id, geom, buffer_m, props)
            VALUES (?, ?, ST_Point(?, ?), ?, {'source':'form'}::JSON)
            """,
            [new_id, req.user_id, req.lon, req.lat, req.buffer_m],
        )
        con.execute("COMMIT")
    except Exception as e:
        con.execute("ROLLBACK")
        raise HTTPException(500, f"Insert failed: {e}")
    return {"ok": True, "id": new_id}



@app.get("/points/count")
def points_count(
    bbox: str | None = None,
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    where, params = parse_bbox(bbox)
    cnt = q(con, f"SELECT COUNT(*) FROM big_points {where};", params)[0][0]
    return {"count": int(cnt)}

@app.get("/points/features")
def points_features(
    bbox: str | None = Query(None),
    limit: int = 2000,
    offset: int = 0,
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    where, params = parse_bbox(bbox)
    rows = q(con, f"""
        WITH f AS (
          SELECT geom, * EXCLUDE (geom)
          FROM big_points
          {where}
          LIMIT ? OFFSET ?
        )
        SELECT ST_AsGeoJSON(geom), to_json(f) FROM f;
    """, params + [limit, offset])

    feats = [
        {"type": "Feature", "geometry": json.loads(g), "properties": json.loads(p) if isinstance(p, str) else {}}
        for g, p in rows
    ]
    return fc(feats)

# ============================================================
# SHADOWS
# ============================================================

@app.get("/shadows/features")
def shadows_features(
    bbox: str | None = Query(None),
    limit: int = 500000,
    offset: int = 0,
    table: str = Query("shadows", description="Nombre de tabla de sombras"),
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    tbl = _shadow_table_or_400(table)
    where, params = parse_bbox(bbox)

    # Asumimos columnas: geom (GEOMETRY) y shadow_count (NUMERIC)
    rows = q(con, f"""
        WITH f AS (
          SELECT geom, shadow_count
          FROM {tbl}
          {where}
          LIMIT ? OFFSET ?
        )
        SELECT ST_AsGeoJSON(geom), shadow_count FROM f;
    """, params + [limit, offset])

    feats = [
        {"type": "Feature", "geometry": json.loads(g),
         "properties": {"shadow_count": float(s) if s is not None else None}}
        for g, s in rows
    ]
    return {"type": "FeatureCollection", "features": feats}

@app.post("/shadows/zonal")
def shadows_zonal(
    req: ZonalReq,
    table: str = Query("shadows", description="Nombre de tabla de sombras"),
    con: duckdb.DuckDBPyConnection = Depends(get_conn)
):
    tbl = _shadow_table_or_400(table)
    geojson = json.dumps(req.geometry)
    rows = q(con, f"""
        WITH zone_raw AS (SELECT ST_GeomFromGeoJSON(?::VARCHAR) AS g),
        zone AS (SELECT CASE WHEN ST_IsValid(g) THEN g ELSE ST_Buffer(g, 0) END AS g FROM zone_raw),
        hits AS (
          SELECT s.shadow_count FROM {tbl} s, zone z
          WHERE ST_Intersects(s.geom, z.g)
        )
        SELECT COALESCE(COUNT(*),0), AVG(shadow_count), MIN(shadow_count), MAX(shadow_count) FROM hits;
    """, [geojson])
    n, avg, mn, mx = rows[0] if rows else (0, None, None, None)
    return {"count": int(n or 0),
            "avg": float(avg) if avg is not None else None,
            "min": float(mn) if mn is not None else None,
            "max": float(mx) if mx is not None else None}

# ============================================================
# IRRADIANCE
# ============================================================

@app.get("/irradiance/features")
def irradiance_features(
    bbox: str | None = Query(None),
    limit: int = Query(5000, ge=1, le=100000),
    offset: int = Query(0, ge=0),
    con: duckdb.DuckDBPyConnection = Depends(get_conn_ro),
):
    # Filtrado en el SRID nativo para acelerar la intersección
    where, params = parse_bbox_for_srid(bbox, 25830)

    rows = q(
        con,
        f"""
        WITH f AS (
          SELECT geom, value
          FROM irr_points
          {where}
          LIMIT ? OFFSET ?
        )
        SELECT
          ST_AsGeoJSON(
            ST_Transform(geom, 'EPSG:25830','EPSG:4326', TRUE)
          ) AS gjson,
          value
        FROM f;
        """,
        params + [limit, offset],
    )

    feats = [
        {
            "type": "Feature",
            "geometry": json.loads(g),
            "properties": {"value": float(v) if v is not None else None},
        }
        for g, v in rows
    ]
    return {"type": "FeatureCollection", "features": feats}

@app.post("/irradiance/zonal")
def irradiance_zonal(req: ZonalReq, con: duckdb.DuckDBPyConnection = Depends(get_conn)):
    geojson = json.dumps(req.geometry)
    rows = q(con, """
        WITH zone AS (
          SELECT ST_Transform(
            ST_GeomFromGeoJSON(?::VARCHAR),
            'EPSG:4326','EPSG:25830', TRUE
          ) AS g
        ),
        zone_ok AS (
          SELECT CASE WHEN ST_IsValid(g) THEN g ELSE ST_Buffer(g,0) END AS g FROM zone
        ),
        hits AS (
          SELECT p.value FROM irr_points p, zone_ok z WHERE ST_Intersects(p.geom, z.g)
        )
        SELECT COALESCE(COUNT(*),0), AVG(value), MIN(value), MAX(value) FROM hits;
    """, [geojson])
    n, avg, mn, mx = rows[0] if rows else (0, None, None, None)
    return {
        "count": int(n or 0),
        "avg": float(avg) if avg is not None else None,
        "min": float(mn) if mn is not None else None,
        "max": float(mx) if mx is not None else None,
    }

# ============================================================
# BUILDINGS + METRICS
# ============================================================

@app.get("/buildings/features")
def buildings_features(
    bbox: str | None = Query(None),
    limit: int = 50000,
    offset: int = 0,
    con: duckdb.DuckDBPyConnection = Depends(get_conn_ro),
):
    where, params = parse_bbox(bbox)
    rows = q(con, f"""
        WITH f AS (
          SELECT geom, * EXCLUDE (geom)
          FROM buildings
          {where}
          LIMIT ? OFFSET ?
        )
        SELECT ST_AsGeoJSON(geom), to_json(f) FROM f;
    """, params + [limit, offset])
    feats = [
        {"type": "Feature", "geometry": json.loads(g), "properties": json.loads(p) if isinstance(p, str) else {}}
        for g, p in rows
    ]
    return fc(feats)

@app.get("/buildings/irradiance")
def buildings_irradiance(
    bbox: str | None = Query(None),
    limit: int = 50000,
    offset: int = 0,
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    where, params = parse_bbox(bbox)
    rows = q(con, f"""
        WITH f AS (
          SELECT b.geom, b.reference, m.irr_mean_kWhm2_y, m.irr_average
          FROM buildings b
          LEFT JOIN edificios_metrics m ON UPPER(b.reference)=UPPER(m.reference)
          {where}
          LIMIT ? OFFSET ?
        )
        SELECT ST_AsGeoJSON(geom), reference, irr_mean_kWhm2_y, irr_average FROM f;
    """, params + [limit, offset])
    feats = []
    for g, ref, irr_mean, irr_avg in rows:
        v = irr_mean if irr_mean is not None else irr_avg
        feats.append({
            "type": "Feature",
            "geometry": json.loads(g),
            "properties": {"reference": ref, "irr_building": float(v) if v is not None else None},
        })
    return fc(feats)

@app.get("/buildings/metrics")
def buildings_metrics(reference: str, con: duckdb.DuckDBPyConnection = Depends(get_conn)):
    ref = reference.strip()
    rows = q(con, """
        SELECT reference,
               irr_average, area_m2, superficie_util_m2, pot_kWp,
               energy_total_kWh, factor_capacidad_pct, irr_mean_kWhm2_y
        FROM edificios_metrics WHERE UPPER(reference)=UPPER(?) LIMIT 1;
    """, [ref])
    if not rows:
        raise HTTPException(404, "No metrics for this reference")
    r = rows[0]
    return {
        "reference": r[0],
        "metrics": {
            "irr_average": float(r[1]) if r[1] is not None else None,
            "area_m2": float(r[2]) if r[2] is not None else None,
            "superficie_util_m2": float(r[3]) if r[3] is not None else None,
            "pot_kWp": float(r[4]) if r[4] is not None else None,
            "energy_total_kWh": float(r[5]) if r[5] is not None else None,
            "factor_capacidad_pct": float(r[6]) if r[6] is not None else None,
            "irr_mean_kWhm2_y": float(r[7]) if r[7] is not None else None,
        },
    }

@app.get("/buildings/by_ref")
def building_by_reference(
    ref: str = Query(..., description="Referencia catastral exacta"),
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    ref_norm = ref.strip()
    rows = q(con, """
        WITH f AS (
          SELECT geom, * EXCLUDE (geom)
          FROM buildings
          WHERE UPPER(reference) = UPPER(?)
          LIMIT 1
        )
        SELECT ST_AsGeoJSON(geom), to_json(f) FROM f;
    """, [ref_norm])

    if not rows:
        raise HTTPException(404, "Referencia no encontrada")

    gjson, props = rows[0]
    return {
        "type": "Feature",
        "geometry": json.loads(gjson),
        "properties": json.loads(props) if isinstance(props, str) else (props or {})
    }

# ============================================================
# ADDRESS LOOKUP
# ============================================================

@app.get("/address/lookup")
def lookup_address(
    street: str,
    number: str,
    include_feature: bool = False,
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    def norm(s: str) -> str:
        s = "" if s is None else s
        s = unicodedata.normalize("NFD", s)
        s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
        s = s.upper().strip()
        for p in ["CALLE ", "CL ", "C/ ", "AVENIDA ", "AV ", "AV.", "PASEO ", "PS ", "PLAZA ", "PZA "]:
            if s.startswith(p):
                s = s[len(p):]
        return " ".join(s.split())

    street_norm = norm(street)
    number_norm = norm(number)

    row = q(con, """
        SELECT reference
        FROM address_index
        WHERE street_norm = ? AND number_norm = ?
        LIMIT 1;
    """, [street_norm, number_norm])

    if not row:
        raise HTTPException(404, "Dirección no encontrada")

    reference = row[0][0]
    if not include_feature:
        return {"reference": reference}

    feat = q(con, """
        SELECT ST_AsGeoJSON(geom), reference
        FROM buildings
        WHERE reference = ?
        LIMIT 1;
    """, [reference])

    feature = None
    if feat:
        gjson_str, ref_val = feat[0]
        feature = {"type": "Feature", "geometry": json.loads(gjson_str), "properties": {"reference": ref_val}}
    return {"reference": reference, "feature": feature}

# ============================================================
# CELS
# ============================================================
@app.get("/cels/features")
def cels_features(
    bbox: str | None = Query(None, description="minx,miny,maxx,maxy (WGS84)"),
    limit: int = 20000,
    offset: int = 0,
    con: duckdb.DuckDBPyConnection = Depends(get_conn),   # <— same as your working API
):
    if not bbox:
        raise HTTPException(400, "bbox es obligatorio en /cels/features")

    limit = max(100, min(int(limit), 20000))
    offset = max(0, int(offset))

    where, params = parse_bbox(bbox)
    rows = q(con, f"""
        WITH j AS (
          SELECT 
            ST_PointOnSurface(b.geom) AS pt,
            c.id, c.nombre, c.street_norm, c.number_norm, c.reference, c.auto_CEL,
            CAST(c.por_ocupacion AS DOUBLE) AS por_ocupacion,
            COALESCE(c.num_usuarios, 0) AS num_usuarios
          FROM buildings b
          JOIN autoconsumos_CELS c
            ON LEFT(UPPER(b.reference), 14) = LEFT(UPPER(c.reference), 14)
          {where.replace("geom", "pt")}
          LIMIT ? OFFSET ?
        )
        SELECT ST_AsGeoJSON(pt), to_json(struct_pack(
            id := id,
            nombre := nombre,
            street_norm := street_norm,
            number_norm := number_norm,
            reference := reference,
            auto_CEL := auto_CEL,
            por_ocupacion := por_ocupacion,
            num_usuarios := num_usuarios
        ))
        FROM j;
    """, params + [limit, offset])

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": json.loads(gjson),
                "properties": json.loads(props) if isinstance(props, str) else (props or {}),
            }
            for gjson, props in rows
        ],
    }




@app.post("/cels/within")
def cels_within_buffer(
    req: CelsWithinReq,
    radius_m: float = Query(500, description="Radio del buffer CELS en metros"),
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    geojson_str = json.dumps(req.geometry)
    # 1 degree lon ~ 85km near Madrid; rough conversion is fine for UI proximity
    radius_deg = radius_m / 85000.0
    rows = q(con, """
        WITH input_geom AS (SELECT ST_GeomFromGeoJSON(?::VARCHAR) AS geom),
        cels_points AS (
        SELECT c.id, c.nombre, c.street_norm, c.number_norm, c.reference AS cels_ref, c.auto_CEL,
                c.por_ocupacion,
                ST_Centroid(b.geom) AS point_geom
        FROM autoconsumos_CELS c
        JOIN buildings b ON LEFT(UPPER(b.reference),14)=LEFT(UPPER(c.reference),14)
        ),
        input_point AS (SELECT ST_Centroid(geom) AS center FROM input_geom)
        SELECT cp.id, cp.nombre, cp.street_norm, cp.number_norm, cp.cels_ref, cp.auto_CEL,
            cp.por_ocupacion,
            ST_Distance(cp.point_geom, ip.center) AS distance_deg
        FROM cels_points cp, input_point ip
        WHERE ST_Distance(cp.point_geom, ip.center) <= ?
        ORDER BY distance_deg;
    """, [geojson_str, radius_deg])

    cels = []
    for row in rows:
        # indices: 0..6 datos, 7 distancia
        dist_m = (float(row[7]) * 85000.0) if row[7] is not None else None
        por_oc = float(row[6]) if row[6] is not None else None
        cels.append({
            "id": row[0],
            "nombre": row[1] or "(sin nombre)",
            "street_norm": row[2],
            "number_norm": row[3],
            "reference": row[4],
            "auto_CEL": int(row[5]) if row[5] is not None else None,
            "por_ocupacion": por_oc,             # ⬅️ devolverlo
            "distance_m": dist_m,
        })
    return {"count": len(cels), "cels": cels, "radius_m": radius_m}


@app.get("/debug/cels/count")
def debug_cels_count(con: duckdb.DuckDBPyConnection = Depends(get_conn)):
    try:
        count_cels = q(con, "SELECT COUNT(*) FROM autoconsumos_CELS")[0][0]
        count_matches = q(con, """
            SELECT COUNT(*)
            FROM buildings b
            JOIN autoconsumos_CELS c
              ON LEFT(UPPER(b.reference), 14) = LEFT(UPPER(c.reference), 14)
        """)[0][0]
        sample = q(con, """
            SELECT c.id, c.nombre, c.reference, c.auto_CEL
            FROM autoconsumos_CELS c
            LIMIT 5
        """)
        return {
            "cels_count": int(count_cels),
            "buildings_with_cels": int(count_matches),
            "sample": [{"id": r[0], "nombre": r[1], "reference": r[2], "auto_CEL": r[3]} for r in sample]
        }
    except Exception as e:
        return {"error": str(e)}

# ============================================================
# CADASTRE
# ============================================================

@app.get("/cadastre/feature")
def cadastre_by_refcat(
    refcat: str = Query(..., description="Referencia catastral"),
    include_feature: bool = Query(False, description="Incluir geometría GeoJSON"),
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    ref_norm = refcat.strip()

    if not include_feature:
        exists = q(con, "SELECT 1 FROM buildings WHERE UPPER(reference)=UPPER(?) LIMIT 1", [ref_norm])
        if not exists:
            raise HTTPException(404, "Referencia catastral no encontrada")
        return {"reference": ref_norm}

    rows = q(con, """
        WITH f AS (
          SELECT geom, * EXCLUDE (geom)
          FROM buildings
          WHERE UPPER(reference)=UPPER(?)
          LIMIT 1
        )
        SELECT ST_AsGeoJSON(geom), to_json(f) FROM f;
    """, [ref_norm])

    if not rows:
        raise HTTPException(404, "Referencia catastral no encontrada")

    gjson, props = rows[0]
    return {
        "reference": ref_norm,
        "feature": {
            "type": "Feature",
            "geometry": json.loads(gjson),
            "properties": json.loads(props) if isinstance(props, str) else (props or {})
        }
    }










from pydantic import  Field, confloat, conint
from pydantic import BaseModel
from fastapi import HTTPException, Query

# ----------------- Pydantic -----------------
Percent_0_100 = confloat(ge=0, le=100)
PositiveInt = conint(ge=1)


class CelsBase(BaseModel):
    nombre: str
    street_norm: str
    number_norm: int
    reference: str
    auto_CEL: int  # 1=CEL, 2=Autoconsumo compartido
    por_ocupacion: Percent_0_100 | None = Field(
        default=None, description="Porcentaje de ocupación 0–100"
    )
    num_usuarios: PositiveInt | None = Field(
        default=None, description="Número de usuarios (>=1) si es Autoconsumo compartido"
    )




class CelsOut(CelsBase):
    id: int







# ---------- CELS create (POST) ----------
@app.post("/cels")
def create_cels(req: CelsBase, con: duckdb.DuckDBPyConnection = Depends(get_conn_rw)):
    if READ_ONLY:
        raise HTTPException(403, "La API está en modo read-only (READ_ONLY)")
    try:
        con.execute("BEGIN")
        dup = q(con, "SELECT 1 FROM autoconsumos_CELS WHERE UPPER(reference) = UPPER(?) LIMIT 1;", [req.reference])
        if dup:
            raise HTTPException(409, "Ya existe un registro con esa referencia.")
        new_id = con.execute("SELECT COALESCE(MAX(id),0)+1 FROM autoconsumos_CELS").fetchone()[0]
        con.execute(
            """
            INSERT INTO autoconsumos_CELS
              (id, nombre, street_norm, number_norm, reference, auto_CEL, por_ocupacion, num_usuarios)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                int(new_id),
                req.nombre,
                req.street_norm,
                int(req.number_norm),
                req.reference,
                int(req.auto_CEL),
                float(req.por_ocupacion) if req.por_ocupacion is not None else None,
                int(req.num_usuarios) if req.num_usuarios is not None else None,
            ],
        )
        con.execute("COMMIT")
        return {"ok": True, "id": int(new_id)}
    except HTTPException:
        con.execute("ROLLBACK")
        raise
    except Exception as e:
        con.execute("ROLLBACK")
        raise HTTPException(500, f"Error creando CELS: {e}")




# ---------- CELS update (PUT) ----------
@app.put("/cels/{cid}")
def update_cels(cid: int, req: CelsBase, con: duckdb.DuckDBPyConnection = Depends(get_conn_rw)):
    if READ_ONLY:
        raise HTTPException(403, "La API está en modo read-only (READ_ONLY)")
    try:
        con.execute("BEGIN")
        cur = q(con, "SELECT 1 FROM autoconsumos_CELS WHERE id = ? LIMIT 1;", [cid])
        if not cur:
            raise HTTPException(404, "CELS no encontrado")
        dup = q(con,
                "SELECT 1 FROM autoconsumos_CELS WHERE UPPER(reference) = UPPER(?) AND id <> ? LIMIT 1;",
                [req.reference, cid])
        if dup:
            raise HTTPException(409, "Ya existe un registro con esa referencia.")
        con.execute(
            """
            UPDATE autoconsumos_CELS
            SET nombre = ?, street_norm = ?, number_norm = ?, reference = ?, auto_CEL = ?,
                por_ocupacion = ?, num_usuarios = ?
            WHERE id = ?
            """,
            [
                req.nombre,
                req.street_norm,
                int(req.number_norm),
                req.reference,
                int(req.auto_CEL),
                float(req.por_ocupacion) if req.por_ocupacion is not None else None,
                int(req.num_usuarios) if req.num_usuarios is not None else None,
                int(cid),
            ],
        )
        con.execute("COMMIT")
        return {"ok": True, "id": int(cid)}
    except HTTPException:
        con.execute("ROLLBACK")
        raise
    except Exception as e:
        con.execute("ROLLBACK")
        raise HTTPException(500, f"Error actualizando CELS: {e}")


@app.delete("/cels/{cid}")
def delete_cel(cid: int, con: duckdb.DuckDBPyConnection = Depends(get_conn_rw)):
    if READ_ONLY:
        raise HTTPException(403, "La API está en modo read-only (READ_ONLY)")
    try:
        con.execute("BEGIN")
        exists = con.execute(
            "SELECT COUNT(*) FROM autoconsumos_CELS WHERE id = ?", [cid]
        ).fetchone()[0]
        if not exists:
            con.execute("ROLLBACK")
            raise HTTPException(404, f"No existe un CEL con id={cid}")

        con.execute("DELETE FROM autoconsumos_CELS WHERE id = ?", [cid])
        con.execute("COMMIT")
        return {"detail": f"CEL con id={cid} eliminado correctamente"}
    except HTTPException:
        raise
    except Exception as e:
        con.execute("ROLLBACK")
        raise HTTPException(500, f"Error eliminando CELS: {e}")



@app.get("/cels/building_context")
def cels_building_context(
    ref: str = Query(..., description="Referencia catastral del edificio pulsado"),
    radius_m: float = Query(500, description="Radio del buffer en metros"),
    con: duckdb.DuckDBPyConnection = Depends(get_conn_ro),  # <-- Uses fixed read-only
):
    """
    Get CELS and Autoconsumo context for a building.
    Returns the nearest CEL and Autoconsumo within radius_m.
    """
    
    radius_deg = radius_m / 85000.0

    # Check if building exists
    found = q(con, "SELECT 1 FROM buildings WHERE UPPER(reference)=UPPER(?) LIMIT 1;", [ref])
    if not found:
        raise HTTPException(404, f"Edificio no encontrado: {ref}")

    def get_context_for_type(auto_val: int):
        """
        Get nearest CELS (auto_val=1) or Autoconsumo (auto_val=2)
        """
        try:
            rows = q(con, """
                WITH target AS (
                  SELECT ST_Centroid(geom) AS center
                  FROM buildings
                  WHERE UPPER(reference)=UPPER(?)
                  LIMIT 1
                ),
                cels_points AS (
                  SELECT
                    c.id, c.nombre, c.reference AS cels_ref,
                    c.auto_CEL, 
                    CAST(c.por_ocupacion AS DOUBLE) AS por_ocupacion,
                    COALESCE(c.num_usuarios, 0) AS num_usuarios,
                    ST_Centroid(b.geom) AS point_geom
                  FROM autoconsumos_CELS c
                  JOIN buildings b
                    ON LEFT(UPPER(b.reference),14)=LEFT(UPPER(c.reference),14)
                  WHERE c.auto_CEL = ?
                ),
                near AS (
                  SELECT cp.*,
                         ST_Distance(cp.point_geom, t.center) AS d
                  FROM cels_points cp, target t
                  WHERE ST_Distance(cp.point_geom, t.center) <= ?
                  ORDER BY d ASC
                  LIMIT 1
                ),
                env AS (
                  SELECT ST_Envelope(ST_Buffer(n.point_geom, ?)) AS e
                  FROM near n
                ),
                candidates AS (
                  SELECT b.geom
                  FROM buildings b, env e
                  WHERE ST_Intersects(b.geom, e.e)
                ),
                bcount AS (
                  SELECT COUNT(*) AS cnt
                  FROM candidates c, near n
                  WHERE ST_Distance(ST_Centroid(c.geom), n.point_geom) <= ?
                )
                SELECT
                  n.id, n.cels_ref, n.auto_CEL, n.por_ocupacion, n.num_usuarios, 
                  n.d AS distance_deg,
                  (SELECT cnt FROM bcount) AS buildings_in_buffer
                FROM near n;
            """, [ref, auto_val, radius_deg, radius_deg, radius_deg])

            if not rows:
                return None

            cid, cref, autoCEL, por_oc, num_users, dist_deg, bcount = rows[0]
            
            return {
                "id": int(cid) if cid is not None else None,
                "reference": cref,
                "auto_CEL": int(autoCEL) if autoCEL is not None else None,
                "por_ocupacion": float(por_oc) if por_oc is not None else None,
                "num_usuarios": int(num_users) if num_users is not None else 0,
                "distance_m": (float(dist_deg) * 85000.0) if dist_deg is not None else None,
                "buildings_in_buffer": int(bcount) if bcount is not None else 0,
            }
        except Exception as e:
            print(f"Error getting context for auto_CEL={auto_val}: {e}")
            return None

    return {
        "ref": ref,
        "radius_m": radius_m,
        "cel": get_context_for_type(1),   # CEL
        "ac": get_context_for_type(2),    # Autoconsumo
    }



# ---------- CELS list (GET) ----------
@app.get("/cels")
def list_cels(
    search: str | None = Query(None, description="Busca en nombre, calle o referencia"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    con: duckdb.DuckDBPyConnection = Depends(get_conn_ro),
):
    where = ""
    params: list = []
    if search:
        s = f"%{search.strip().upper()}%"
        where = """
            WHERE UPPER(nombre) LIKE ?
               OR UPPER(street_norm) LIKE ?
               OR UPPER(reference) LIKE ?
        """
        params = [s, s, s]

    total = q(con, f"SELECT COUNT(*) FROM autoconsumos_CELS {where};", params)[0][0]

    rows = q(con, f"""
        SELECT id, nombre, street_norm, number_norm, reference, auto_CEL, 
               CAST(por_ocupacion AS DOUBLE) AS por_ocupacion,
               COALESCE(num_usuarios, 0) AS num_usuarios
        FROM autoconsumos_CELS
        {where}
        ORDER BY id DESC
        LIMIT ? OFFSET ?;
    """, params + [limit, offset])

    data = [
        {
            "id": int(r[0]),
            "nombre": r[1],
            "street_norm": r[2],
            "number_norm": int(r[3]) if r[3] is not None else None,
            "reference": r[4],
            "auto_CEL": int(r[5]) if r[5] is not None else None,
            "por_ocupacion": float(r[6]) if r[6] is not None else None,
            "num_usuarios": int(r[7]) if r[7] is not None else 0,
        }
        for r in rows
    ]

    return {"total": int(total), "limit": limit, "offset": offset, "items": data}




# ============================================================
# PARCELS
# ============================================================

@app.get("/parcels/features")
def parcels_features(
    bbox: str | None = Query(None, description="minx,miny,maxx,maxy (WGS84)"),
    limit: int = Query(5000000, ge=1, le=10000000000),
    offset: int = Query(0, ge=0),
    con: duckdb.DuckDBPyConnection = Depends(get_conn_ro),
):
    # Si tus geom están en EPSG:4326 no transformes; si están en 25830, usa parse_bbox_for_srid
    where, params = parse_bbox(bbox)

    rows = q(con, f"""
        WITH f AS (
          SELECT geom, id, nationalCadastralReference
          FROM parcels
          {where}
          LIMIT ? OFFSET ?
        )
        SELECT ST_AsGeoJSON(geom), id, nationalCadastralReference FROM f;
    """, params + [limit, offset])

    feats = [{
        "type": "Feature",
        "geometry": (json.loads(gjson) if isinstance(gjson, str) else gjson),
        "properties": {
            "id": pid,
            "nationalCadastralReference": ncr
        }
    } for gjson, pid, ncr in rows]

    return fc(feats)
