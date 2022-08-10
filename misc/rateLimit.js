import config from "./config.js";

const rateLimits = {};

export const checkRateLimit = (req, url) => {
    if(req.statusCode === 429) {
        const retryAfter = req.headers['retry-after'];
        console.log(`I am ratelimited at ${url} for ${retryAfter} more seconds!`);

        const retryAt = (Date.now() + (retryAfter + 1) * 1000) || Date.now() + config.rateLimitBackoff * 1000;
        rateLimits[url] = retryAt;
        return retryAt;
    }

    try {
        const json = JSON.parse(req.body);
        if(json.error === "rate_limited") {
            console.log(`I am temporarily ratelimited at ${url} (no ETA given, waiting ${config.rateLimitBackoff}s)`);

            rateLimits[url] = Date.now() + config.rateLimitBackoff * 1000;
            return rateLimits[url];
        }
    } catch(e) {}

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

    return retryAt;
}
