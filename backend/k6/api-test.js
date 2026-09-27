import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
    vus: 10,
    duration: '2m',
    thresholds: {
        http_req_duration: ['p(95)<2000'],
        'http_req_duration{endpoint:search}': ['p(95)<1500'],
        'http_req_duration{endpoint:category}': ['p(95)<1500'],
        http_req_failed: ['rate<0.01'],
        checks: ['rate>0.95'],
    },
    tags: {
        test_type: 'api',
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api';

const searchTerms = ['HP', 'CPU', 'GPU', 'RAM', 'SSD', 'Monitor', 'Keyboard'];
const categoryIds = [1, 2, 3, 4, 5, 6];

export default function () {
    group('Search Functionality', () => {
        const searchTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
        const searchRes = http.get(
            `${BASE_URL}/products/storefront?search=${searchTerm}`,
            { tags: { endpoint: 'search' } }
        );
        
        check(searchRes, {
            'search status 200': (r) => r.status === 200,
            'search has results': (r) => {
                try {
                    const body = JSON.parse(r.body);
                    const products = body.products || body.data || [];
                    return Array.isArray(products);
                } catch (e) {
                    console.error('Search response parse error:', e.message);
                    return false;
                }
            },
        });
    });

    sleep(1);

    group('Category Filtering', () => {
        const categoryId = categoryIds[Math.floor(Math.random() * categoryIds.length)];
        const categoryRes = http.get(
            `${BASE_URL}/products/storefront?category_id=${categoryId}`,
            { tags: { endpoint: 'category' } }
        );
        
        check(categoryRes, {
            'category status 200': (r) => r.status === 200,
            'category response valid': (r) => {
                try {
                    const body = JSON.parse(r.body);
                    const products = body.products || body.data || [];
                    return Array.isArray(products);
                } catch (e) {
                    console.error('Category response parse error:', e.message);
                    return false;
                }
            },
        });
    });

    sleep(1);
}