import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics to track exactly what's failing
const status200 = new Counter('status_200');
const status429 = new Counter('status_429');
const status500 = new Counter('status_500');
const statusOther = new Counter('status_other');
const responseTime = new Trend('response_time_ms');

export const options = {
    // Slow ramp — 10 VUs every 30 seconds
    // This lets us see EXACTLY where failures begin
    stages: [
        { duration: '30s', target: 10 },
        { duration: '30s', target: 20 },
        { duration: '30s', target: 30 },
        { duration: '30s', target: 40 },
        { duration: '30s', target: 50 },
        { duration: '30s', target: 60 },
        { duration: '30s', target: 70 },
        { duration: '30s', target: 80 },
        { duration: '30s', target: 90 },
        { duration: '30s', target: 100 },
        { duration: '30s', target: 120 },
        { duration: '30s', target: 150 },
        { duration: '30s', target: 200 },
        { duration: '1m', target: 0 },
    ],
    thresholds: {
        // No thresholds — we just want to observe
    },
    tags: { test_type: 'debug' },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api';

export default function () {
    const res = http.get(`${BASE_URL}/products/storefront`, {
        tags: { endpoint: 'storefront_list' },
    });

    responseTime.add(res.timings.duration);

    // Track every status code so we know exactly what's happening
    switch (res.status) {
        case 200:
            status200.add(1);
            break;
        case 429:
            status429.add(1);
            // Log the response body — it might tell us WHO is rate limiting
            if (__ITER % 20 === 0) {
                console.warn(`429 at VU=${__VU} | Body: ${res.body.substring(0, 150)}`);
            }
            break;
        case 500:
            status500.add(1);
            if (__ITER % 20 === 0) {
                console.warn(`500 at VU=${__VU} | Body: ${res.body.substring(0, 150)}`);
            }
            break;
        default:
            statusOther.add(1);
            if (__ITER % 20 === 0) {
                console.warn(`${res.status} at VU=${__VU} | Body: ${res.body.substring(0, 150)}`);
            }
    }

    sleep(1);
}