# Visor_Privado_EMSV_actualizado
Repositorio que contiene el código del visor privado de la EMSV. Actualmente el proyecto ha sido migrado desde la arquitectura original (Node.js + servidor manual) a una arquitectura basada en Docker, FastAPI y DuckDB.
### Índice
- [Organización de los Directorios del Proyecto](#organización-de-los-directorios-del-proyecto)
- [Tecnologías Utilizadas](#Tecnologías-Utilizadas)
- [Ejecución en Local](#Ejecución-en-Local)
- [Despliegue en Producción](#Despliegue-en-Producción)
- [Actualización del Frontend Privado](#Actualización-del-Frontend-Privado)
- [Actualización del Backend DuckDB](#Acceso-a-la-API)

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
Frontend:
- React + MUI
- React-Leaflet
- Nivo Charts

Backend compartido:
- FastAPI + DuckDB
- Consultas espaciales
- API de solo lectura para el público

Infraestructura:
- Docker + Docker Compose
- Nginx como reverse proxy HTTPS

### Ejecución en Local

Frontend
- Desarrollo:
  npm install
  npm run dev
- Generación del build:
  npm run build

La API no se ejecuta desde esta carpeta:
se sirve desde el backend compartido en Docker.

### Despliegue en Producción

1) Compilar frontend:
   npm run build

2) Copiar archivos al servidor:
   visor_privado/visor_privado_emsv_client_actualizado

3) Construir contenedor público:
   docker compose build frontend-privado
   docker compose up -d frontend-privado

### Actualización del Frontend Público

Cada actualización requiere:
1) Generar nuevo build React
2) Subir index.html + assets
3) Reconstruir imagen del contenedor:
   docker compose build frontend-privado
   docker compose up -d frontend-privado

### Acceso a la API

El visor público accede a la API pasando por el gateway:

   /api_2/...

- Las peticiones GET son de solo lectura
- Las operaciones de escritura están bloqueadas
- El backend real reside en backend-privado


### Créditos 
Cordinador del proyecto por Asier Aguilaz [linkedin](https://www.linkedin.com/in/asier-eguilaz/)

Creado por Juan Jiménez Fernández [linkedin](https://www.linkedin.com/in/juan-jimenez-fernandez-b16b99119/)

Creado por Miguel Salas Heras [linkedin](https://www.linkedin.com/in/miguelsalasheras/)

