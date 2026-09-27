import http from 'k6/http';
import { check } from 'k6';

export const options = {
    executor: 'ramping-arrival-rate',
    startRate: 50,
    timeUnit: '1s',
    preAllocatedVUs: 500,
    maxVUs: 1000,
    stages: [
        { duration: '2m', target: 100 },   // 100 req/s
        { duration: '2m', target: 200 },   // 200 req/s
        { duration: '2m', target: 400 },   // 400 req/s
        { duration: '2m', target: 800 },   // 800 req/s
        { duration: '2m', target: 1600 },  // 1600 req/s - Find the break!
    ],
    thresholds: {
        http_req_failed: ['rate<0.3'], // Allow failures, we're finding limits
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api';

export default function () {
    http.get(`${BASE_URL}/products/storefront`);
}