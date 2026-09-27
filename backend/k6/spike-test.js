import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '1m', target: 20 },    // Normal traffic
        { duration: '30s', target: 200 },  // SPIKE! (Black Friday scenario)
        { duration: '2m', target: 200 },   // Stay spiked
        { duration: '30s', target: 20 },   // Drop back
        { duration: '1m', target: 20 },    // Recovery
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<3000'], // More lenient during spike
        http_req_failed: ['rate<0.05'],    // Allow 5% errors during spike
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api';

export default function () {
    const res = http.get(`${BASE_URL}/products/storefront`);
    check(res, { 'status 200': (r) => r.status === 200 });
    sleep(1);
}