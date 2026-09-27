import { check } from 'k6';

export function checkResponse(response, name = 'request') {
    return check(response, {
        [`${name} status 200`]: (r) => r.status === 200,
        [`${name} response time OK`]: (r) => r.timings.duration < 2000,
        [`${name} has valid body`]: (r) => r.body.length > 0,
    });
}

export function randomSleep(min = 1, max = 3) {
    return Math.random() * (max - min) + min;
}

export function getRandomItem(array) {
    if (!array || array.length === 0) return null;
    return array[Math.floor(Math.random() * array.length)];
}