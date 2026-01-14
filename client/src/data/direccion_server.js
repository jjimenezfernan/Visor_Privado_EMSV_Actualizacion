// Direccion del servidor de la API

let DIRECTION;

if (process.env.NODE_ENV === 'production') {
    DIRECTION = 'https://visorprivadoemsvactualizado.khoraurbanthinkers.es';
} else {
    DIRECTION = 'https://visorprivadoemsvactualizado.khoraurbanthinkers.es';
}

export { DIRECTION };

let API_BASE;

if (process.env.NODE_ENV === 'production') {
    API_BASE = 'https://visorprivadoemsvactualizado.khoraurbanthinkers.es/api_2';
} else {
    API_BASE = 'https://visorprivadoemsvactualizado.khoraurbanthinkers.es/api_2';
}

export { API_BASE };
