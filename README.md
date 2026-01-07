# Visor_Privado_EMSV_actualizado
Repositorio que contiene el código del visor privado de la EMSV. Actualmente el proyecto ha sido migrado desde la arquitectura original (Node.js + servidor manual) a una arquitectura basada en Docker, FastAPI y DuckDB.
### Índice
- [Organización de los Directorios del Proyecto](#organización-de-los-directorios-del-proyecto)
- [Tecnologías Utilizadas](#Tecnologías-Utilizadas)
- [Ejecución en Local](#Ejecución-en-Local)
- [Despliegue en Producción](#Despliegue-en-Producción)
- [Actualización del Frontend Privado](#Actualización-del-Frontend-Privado)
- [Actualización del Backend DuckDB](#Actualización-del-Backend-DuckDB)

### Organización de los Directorios del Proyecto
La estructura actual del proyecto es la siguiente:

visor_privado_emsv_actualizacion/
- **visor_privado_emsv_client_actualizado**, build del frontend React.
- **docker_privado**
    - **Dockerfile**,imagen del backend (FastAPI + DuckDB).
    - **server**
        - **app.py**, API principal
        - **requirements.txt**
        - **static/logos/**, recursos de informes PDF
- **Dockerfile.frontend**, imagen del frontend Nginx.
- **nginx_conf_privado**, configuraciones Nginx históricas
- **server**, carpeta heredada (no utilizada)


Repositorio raíz del proyecto:
- **Visor_EMSV_Backend_DuckDB/**
    - **data/**
        - **warehouse.duckdb**, base de datos única del visor
Archivo de orquestación principal:

**docker-compose.yml**, define los servicios:
   - backend-privado (FastAPI + DuckDB)
   - gateway (proxy API interno)
   - frontend-privado (React + Nginx)
   
### Tecnologías Utilizadas
**Frontend:**
- React
- MUI (Material UI)
- React-Leaflet
- Nivo Charts

**Backend:**
- Python 3.13
- FastAPI + Uvicorn
- DuckDB 1.4.1 (con extensión spatial)
- ReportLab / PyMuPDF para generación de PDFs
- httpx (gateway API)

**Infraestructura:**
- Docker + Docker Compose
- Nginx como reverse proxy HTTPS
- Certificados SSL Let's Encry

### Ejecución en Local
**Frontend**
- Se puede desarrollar en local ejecutando:
  npm install
  npm run dev
- El build final se genera mediante:
  npm run build

**Backend**
- Se ejecuta dentro de Docker
- No es necesario lanzar server.js (arquitectura antigua)

### Despliegue en Producción
El visor no se ejecuta copiando archivos al servidor,
sino mediante contenedores Docker.

1) Construir el backend
   docker compose build backend-privado
   docker compose up -d backend-privado

2) Construir el gateway
   docker compose build gateway
   docker compose up -d gateway

3) Construir el frontend privado
   docker compose build frontend-privado

### Actualización del Frontend Público
1) Compilar React en local:
   npm run build
   genera /dist

2) Copiar el build al servidor:
   visor_privado/visor_privado_emsv_client_actualizado

3) Reconstruir imagen del frontend:
   docker compose build frontend-privado
   docker compose up -d frontend-privado

### Actualización del Backend (DuckDB)
La base de datos se encuentra en:
   Visor_EMSV_Backend_DuckDB/data/warehouse.duckdb

Si se sustituye o modifica:
1) Hacer backup del archivo
2) Reiniciar únicamente el backend:
   docker compose restart backend-privado


### Créditos 
Cordinador del proyecto por Asier Aguilaz [linkedin](https://www.linkedin.com/in/asier-eguilaz/)

Creado por Juan Jiménez Fernández [linkedin](https://www.linkedin.com/in/juan-jimenez-fernandez-b16b99119/)

Creado por Miguel Salas Heras [linkedin](https://www.linkedin.com/in/miguelsalasheras/)

