const rateLimits = {};

export const checkRateLimit = (req, url) => {
    if(req.statusCode === 429) {
        const retryAfter = req.headers['retry-after'];
        console.log(`I am ratelimited at ${url} for ${retryAfter} more seconds!`);

        const retryAt = Date.now() + (retryAfter + 1) * 1000;
        rateLimits[url] = retryAt || true;
        return true;
    }

    return false;
}

export const isRateLimited = (url) => {
    const retryAt = rateLimits[url];

    if(!retryAt) return false;

    if(retryAt < Date.now()) {
        delete rateLimits[url];
        return false;
    }

    const retryAfter = (retryAt - Date.now()) / 1000;
    console.log(`I am still ratelimited at ${url} for ${retryAfter} more seconds!`);

    return rateLimits[url];
}
