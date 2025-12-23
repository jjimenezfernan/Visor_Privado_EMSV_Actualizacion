// Direccion del servidor de la API

let DIRECTION;

if (process.env.NODE_ENV === 'production') {
    DIRECTION = 'https://visorprivadoemsv.khoraurbanthinkers.es';
} else {
    DIRECTION = 'http://localhost:3050';
}

export { DIRECTION };

let API_BASE;

if (process.env.NODE_ENV === 'production') {
    API_BASE = 'https://visorprivadoemsvactualizado.khoraurbanthinkers.es/api_2';
} else {
    API_BASE = 'http://localhost:8010';
}

export { API_BASE };
