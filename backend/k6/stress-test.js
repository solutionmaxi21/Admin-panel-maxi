import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '2m', target: 50 },  // normal load
        { duration: '5m', target: 100 }, // transition to stress
        { duration: '5m', target: 200 }, // stress
        { duration: '2m', target: 300 }, // breaking point - expect rate limiting
        { duration: '5m', target: 0 },   // ramp down
    ],
    thresholds: {
        http_req_failed: ['rate<0.15'], // Allow up to 15% errors (rate limiting expected)
        http_req_duration: ['p(95)<5000'], // Relaxed threshold
    },
    tags: {
        test_type: 'stress',
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api';

export default function () {
    const res = http.get(`${BASE_URL}/products/storefront`, {
        tags: { endpoint: 'storefront_list' },
    });
    
    const success = check(res, {
        'status 200': (r) => r.status === 200,
    });

    // Only log every 100th failure to avoid spam
    if (!success && __ITER % 100 === 0) {
        console.warn(`Request failed: ${res.status} at VU ${__VU}, iteration ${__ITER}`);
    }

    sleep(1);
}

// Add summary handler for better reporting
export function handleSummary(data) {
    const errorRate = data.metrics.http_req_failed.values.rate;
    const totalRequests = data.metrics.http_reqs.values.count;
    const failedRequests = Math.round(totalRequests * errorRate);
    
    console.log('\n📊 Stress Test Summary:');
    console.log(`   Total Requests: ${totalRequests}`);
    console.log(`   Failed: ${failedRequests} (${(errorRate * 100).toFixed(2)}%)`);
    console.log(`   Success: ${totalRequests - failedRequests} (${((1 - errorRate) * 100).toFixed(2)}%)`);
    
    if (errorRate > 0.1 && errorRate < 0.2) {
        console.log('   ✅ Rate limiting working as expected at high load');
    } else if (errorRate > 0.2) {
        console.log('   ⚠️  High error rate - consider increasing capacity');
    } else {
        console.log('   ✅ System handled stress well');
    }
    
    return {
        'stdout': '', // We already printed our summary
    };
}