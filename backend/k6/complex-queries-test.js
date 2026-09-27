import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
    vus: 50,
    duration: '5m',
    thresholds: {
        http_req_duration: ['p(95)<2000'],
        'http_req_duration{query_type:simple}': ['p(95)<500'],
        'http_req_duration{query_type:complex}': ['p(95)<2000'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api';

export default function () {
    group('Simple Queries', () => {
        // Fast, indexed queries
        http.get(`${BASE_URL}/products/storefront?category_id=1`, {
            tags: { query_type: 'simple' }
        });
        sleep(0.5);
    });

    group('Complex Queries', () => {
        // More demanding queries
        const queries = [
            `search=gaming laptop&category_id=1`,
            `search=wireless mouse RGB&min_price=50&max_price=200`,
            `search=mechanical keyboard&sort=price&order=desc`,
        ];
        
        const query = queries[Math.floor(Math.random() * queries.length)];
        http.get(`${BASE_URL}/products/storefront?${query}`, {
            tags: { query_type: 'complex' }
        });
        sleep(1);
    });
}