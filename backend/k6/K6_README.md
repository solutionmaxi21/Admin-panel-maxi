# k6 Performance Testing for MaxiStore

This directory contains k6 scripts for performance testing the MaxiStore backend and storefront.

## Prerequisites

- [k6](https://k6.io/docs/getting-started/installation/) must be installed on your machine.

## Test Types

1. **Smoke Test**: `npm run test:smoke`
   - Goal: Verify the system is up and responding.
   - Load: 1 VU for 1 minute.
2. **Load Test**: `npm run test:load`
   - Goal: Assess performance under typical expected traffic.
   - Load: Ramps up to 50 VUs over 5 minutes.
3. **Stress Test**: `npm run test:stress`
   - Goal: Find the system's breaking point.
   - Load: Ramps up to 200 VUs.
4. **API Test**: `npm run test:api`
   - Goal: Test specific intensive API endpoints (products, stats).

## Running Tests

From the `backend` directory, run:

```bash
npm run test:smoke
```

## Configuring Base URL

The scripts use `http://localhost:3001/api` by default. You can override this by setting the `BASE_URL` environment variable:

```bash
k6 run -e BASE_URL=https://your-production-url.com/api k6/smoke-test.js
```
