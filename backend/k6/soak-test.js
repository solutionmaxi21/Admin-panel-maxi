import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
    stages: [
        { duration: '5m', target: 100 },   // Ramp up
        { duration: '30m', target: 100 },  // Stay at load for 30 minutes!
        { duration: '5m', target: 0 },     // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'],
        http_req_failed: ['rate<0.01'],
        checks: ['rate>0.95'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api';

function randomSleep(min = 1, max = 3) {
    return Math.random() * (max - min) + min;
}

export default function () {
    // Realistic e-commerce user journey
    
    group('User Session', () => {
        // 1. Land on homepage, browse products
        group('Browse Homepage', () => {
            const res = http.get(`${BASE_URL}/products/storefront`);
            check(res, { 'homepage loaded': (r) => r.status === 200 });
            sleep(randomSleep(2, 5)); // User reads
        });

        // 2. Search for something
        group('Search Products', () => {
            const searchTerms = ['laptop', 'mouse', 'keyboard', 'monitor', 'CPU'];
            const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];
            const res = http.get(`${BASE_URL}/products/storefront?search=${term}`);
            check(res, { 'search worked': (r) => r.status === 200 });
            sleep(randomSleep(3, 6)); // User reviews results
        });

        // 3. Filter by category
        group('Filter by Category', () => {
            const categoryId = Math.floor(Math.random() * 6) + 1;
            const res = http.get(`${BASE_URL}/products/storefront?category_id=${categoryId}`);
            check(res, { 'filter worked': (r) => r.status === 200 });
            sleep(randomSleep(2, 4));
        });

        // 4. View 2-3 product details
        group('View Product Details', () => {
            const productsToView = Math.floor(Math.random() * 2) + 2;
            for (let i = 0; i < productsToView; i++) {
                const productId = Math.floor(Math.random() * 100) + 1;
                const res = http.get(`${BASE_URL}/products/storefront/${productId}`);
                check(res, { 'product detail loaded': (r) => r.status === 200 || r.status === 404 });
                sleep(randomSleep(5, 10)); // User reads product description
            }
        });

        // 5. Back to browsing
        group('Browse Again', () => {
            const res = http.get(`${BASE_URL}/products/storefront`);
            check(res, { 'browsed again': (r) => r.status === 200 });
            sleep(randomSleep(3, 7));
        });
    });

    // Think time between sessions
    sleep(randomSleep(5, 15));
}