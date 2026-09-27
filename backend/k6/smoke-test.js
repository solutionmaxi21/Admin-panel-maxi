import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    vus: 1,
    duration: '1m',
    thresholds: {
        http_req_duration: ['p(99)<1500'], // 99% of requests must complete below 1.5s
        http_req_failed: ['rate<0.01'],
        checks: ['rate>0.95'],
    },
    tags: {
        test_type: 'smoke',
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api';

export default function () {
    const res = http.get(`${BASE_URL}/products/storefront`, {
        tags: { endpoint: 'storefront_list' },
    });
    
    const passed = check(res, {
        'status is 200': (r) => r.status === 200,
        'response time < 1s': (r) => r.timings.duration < 1000,
        'has products': (r) => {
            try {
                const body = JSON.parse(r.body);
                // Check for either 'products' or 'data' key
                const products = body.products || body.data || [];
                return Array.isArray(products) && products.length > 0;
            } catch (e) {
                console.error('Invalid JSON response:', e);
                return false;
            }
        },
        'valid response structure': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.products !== undefined || body.data !== undefined;
            } catch (e) {
                return false;
            }
        },
    });

    if (!passed) {
        console.error(`❌ Check failed at iteration ${__ITER}`);
    }

    sleep(1);
}