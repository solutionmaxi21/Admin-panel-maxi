export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api';

export const commonThresholds = {
    http_req_duration: ['p(95)<2000', 'p(99)<3000'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.95'],
};

export const endpoints = {
    storefront: `${BASE_URL}/products/storefront`,
    productDetail: (id) => `${BASE_URL}/products/storefront/${id}`,
    search: (query) => `${BASE_URL}/products/storefront?search=${query}`,
    category: (id) => `${BASE_URL}/products/storefront?category_id=${id}`,
};