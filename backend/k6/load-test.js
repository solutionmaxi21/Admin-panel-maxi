import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
    stages: [
        { duration: '2m', target: 50 },   // Warm up
        { duration: '3m', target: 100 },  // Double your current load
        { duration: '2m', target: 150 },  // Triple load
        { duration: '3m', target: 200 },  // 4x load
        { duration: '2m', target: 100 },  // Cool down
        { duration: '1m', target: 0 },    // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'], // Still reasonable
        'http_req_duration{endpoint:storefront_list}': ['p(95)<1500'],
        'http_req_duration{endpoint:product_detail}': ['p(95)<1000'],
        http_req_failed: ['rate<0.01'],
        checks: ['rate>0.95'],
    },tags: {
        test_type: 'load',
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api';

function randomSleep(min = 1, max = 3) {
    return Math.random() * (max - min) + min;
}

function getRandomItem(array) {
    if (!array || array.length === 0) return null;
    return array[Math.floor(Math.random() * array.length)];
}

export default function () {
    group('Browse Products', () => {
        const productsRes = http.get(`${BASE_URL}/products/storefront`, {
            tags: { endpoint: 'storefront_list' },
        });
        
        check(productsRes, {
            'storefront status 200': (r) => r.status === 200,
            'storefront response time OK': (r) => r.timings.duration < 2000,
        });

        let productData = [];
        try {
            const body = JSON.parse(productsRes.body);
            // Handle both 'products' and 'data' keys
            productData = body.products || body.data || [];
        } catch (e) {
            console.error('Failed to parse products response:', e.message);
            return;
        }

        if (productData.length > 0) {
            sleep(randomSleep(1, 3)); // User reading product list

            group('View Product Detail', () => {
                const randomProduct = getRandomItem(productData);
                if (randomProduct && randomProduct.id) {
                    const detailRes = http.get(
                        `${BASE_URL}/products/storefront/${randomProduct.id}`,
                        { tags: { endpoint: 'product_detail' } }
                    );
                    
                    check(detailRes, {
                        'product detail status 200': (r) => r.status === 200,
                        'product detail response time OK': (r) => r.timings.duration < 1500,
                    });
                }
            });
        }
    });

    sleep(randomSleep(2, 4)); // Think time between iterations
}