import {
    fetch,
    parseSetCookie,
    stringifyCookies,
    extractTokensFromUri,
    tokenExpiry,
    decodeToken,
    ensureUsersFolder, wait, getProxyManager
} from "../misc/util.js";
import config from "../misc/config.js";
import fs from "fs";
import {client} from "../discord/bot.js";
import {addUser, deleteUser, getAccountWithPuuid, getUserJson, readUserJson, saveUser} from "./accountSwitcher.js";
import {checkRateLimit, isRateLimited} from "../misc/rateLimit.js";
import {queueCookiesLogin, queueUsernamePasswordLogin} from "./authQueue.js";
import {waitForAuthQueueResponse} from "../discord/authManager.js";

export class User {
    constructor({id, puuid, auth, alerts=[], username, region, authFailures, lastFetchedData, lastNoticeSeen, lastSawEasterEgg}) {
        this.id = id;
        this.puuid = puuid;
        this.auth = auth;
        this.alerts = alerts || [];
        this.username = username;
        this.region = region;
        this.authFailures = authFailures || 0;
        this.lastFetchedData = lastFetchedData || 0;
        this.lastNoticeSeen =  lastNoticeSeen || "";
        this.lastSawEasterEgg = lastSawEasterEgg || 0;
    }
}

export const transferUserDataFromOldUsersJson = () => {
    if(!fs.existsSync("data/users.json")) return;
    if(client.shard && client.shard.ids[0] !== 0) return;

    console.log("Transferring user data from users.json to the new format...");
    console.log("(The users.json file will be backed up as users.json.old, just in case)");

    const usersJson = JSON.parse(fs.readFileSync("data/users.json", "utf-8"));

    const alertsArray = fs.existsSync("data/alerts.json") ? JSON.parse(fs.readFileSync("data/alerts.json", "utf-8")) : [];
    const alertsForUser = (id) => alertsArray.filter(a => a.id === id);

    for(const id in usersJson) {
        const userData = usersJson[id];
        const user = new User({
            id: id,
            puuid: userData.puuid,
            auth: {
                rso: userData.rso,
                idt: userData.idt,
                ent: userData.ent,
                cookies: userData.cookies,
            },
            alerts: alertsForUser(id).map(alert => {return {uuid: alert.uuid, channel_id: alert.channel_id}}),
            username: userData.username,
            region: userData.region
        });
        saveUser(user);
    }
    fs.renameSync("data/users.json", "data/users.json.old");
}

export const getUser = (id, account=null) => {
    if(id instanceof User) {
        const user = id;
        const userJson = readUserJson(user.id);
        if(!userJson) return null;

        const userData = userJson.accounts.find(a => a.puuid === user.puuid);
        return userData && new User(userData);
    }

    try {
        const userData = getUserJson(id, account);
        return userData && new User(userData);
    } catch(e) {
        return null;
    }
}

const userFilenameRegex = /\d+\.json/
export const getUserList = () => {
    ensureUsersFolder();
    return fs.readdirSync("data/users").filter(filename => userFilenameRegex.test(filename)).map(filename => filename.replace(".json", ""));
}

export const authUser = async (id, account=null) => {
    // doesn't check if token is valid, only checks it hasn't expired
    const user = getUser(id, account);
    if(!user || !user.auth || !user.auth.rso) return {success: false};

    const rsoExpiry = tokenExpiry(user.auth.rso);
    if(rsoExpiry - Date.now() > 10_000) return {success: true};

    return await refreshToken(id, account);
}

export const redeemUsernamePassword = async (id, login, password) => {

    let rateLimit = isRateLimited("auth.riotgames.com");
    if(rateLimit) return {success: false, rateLimit: rateLimit};

    const proxyManager = getProxyManager();
    const proxy = await proxyManager.getProxy("auth.riotgames.com");
    const agent = await proxy?.createAgent("auth.riotgames.com");

    // prepare cookies for auth request
    const req1 = await fetch("https://auth.riotgames.com/api/v1/authorization", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            'user-agent': await getUserAgent()
        },
        body: JSON.stringify({
            "client_id": "riot-client",
            "code_challenge": "",
            "code_challenge_method": "",
            "acr_values": "",
            "claims": "",
            "nonce": "69420",
            "redirect_uri": "http://localhost/redirect",
            "response_type": "token id_token",
            "scope": "openid link ban lol_region"
        }),
        proxy: agent
    });
    console.assert(req1.statusCode === 200, `Auth Request Cookies status code is ${req1.statusCode}!`, req1);

    rateLimit = checkRateLimit(req1, "auth.riotgames.com");
    if(rateLimit) return {success: false, rateLimit: rateLimit};

    if(detectCloudflareBlock(req1)) return {success: false, rateLimit: "cloudflare"};

    let cookies = parseSetCookie(req1.headers["set-cookie"]);

    // get access token
    const req2 = await fetch("https://auth.riotgames.com/api/v1/authorization", {
        method: "PUT",
        headers: {
            'Content-Type': 'application/json',
            'user-agent': await getUserAgent(),
            'cookie': stringifyCookies(cookies)
        },
        body: JSON.stringify({
            'type': 'auth',
            'username': login,
            'password': password,
            'remember': true
        }),
        proxy: agent
    });
    console.assert(req2.statusCode === 200, `Auth status code is ${req2.statusCode}!`, req2);

    rateLimit = checkRateLimit(req2, "auth.riotgames.com")
    if(rateLimit) return {success: false, rateLimit: rateLimit};

    if(detectCloudflareBlock(req2)) return {success: false, rateLimit: "cloudflare"};

    cookies = {
        ...cookies,
        ...parseSetCookie(req2.headers['set-cookie'])
    };

    const json2 = JSON.parse(req2.body);
    if(json2.type === 'error') {
        if(json2.error === "auth_failure") console.error("Authentication failure!", json2);
        else console.error("Unknown auth error!", JSON.stringify(json2, null, 2));
        return {success: false};
    }

    if(json2.type === 'response') {
        const user = await processAuthResponse(id, {login, password, cookies}, json2.response.parameters.uri);
        addUser(user);
        return {success: true};
    } else if(json2.type === 'multifactor') { // 2FA
        const user = new User({id});
        user.auth = {
            ...user.auth,
            waiting2FA: Date.now(),
            cookies: cookies
        }

        if(config.storePasswords) {
            user.auth.login = login;
            user.auth.password = btoa(password);
        }

        addUser(user);
        return {success: false, mfa: true, method: json2.multifactor.method, email: json2.multifactor.email};
    }

    return {success: false};
}

export const redeem2FACode = async (id, code) => {
    let rateLimit = isRateLimited("auth.riotgames.com");
    if(rateLimit) return {success: false, rateLimit: rateLimit};

    let user = getUser(id);

    const req = await fetch("https://auth.riotgames.com/api/v1/authorization", {
        method: "PUT",
        headers: {
            'Content-Type': 'application/json',
            'user-agent': await getUserAgent(),
            'cookie': stringifyCookies(user.auth.cookies)
        },
        body: JSON.stringify({
            'type': 'multifactor',
            'code': code.toString(),
            'rememberDevice': true
        })
    });
    console.assert(req.statusCode === 200, `2FA status code is ${req.statusCode}!`, req);

    rateLimit = checkRateLimit(req, "auth.riotgames.com")
    if(rateLimit) return {success: false, rateLimit: rateLimit};

    deleteUser(id);

    user.auth = {
        ...user.auth,
        cookies: {
            ...user.auth.cookies,
            ...parseSetCookie(req.headers['set-cookie'])
        }
    };

    const json = JSON.parse(req.body);
    if(json.error === "multifactor_attempt_failed" || json.type === "error") {
        console.error("Authentication failure!", json);
        return {success: false};
    }

    user = await processAuthResponse(id, {login: user.auth.login, password: atob(user.auth.password || ""), cookies: user.auth.cookies}, json.response.parameters.uri, user);

    delete user.auth.waiting2FA;
    addUser(user);

    return {success: true};
}

const processAuthResponse = async (id, authData, redirect, user=null) => {
    if(!user) user = new User({id});
    const [rso, idt] = extractTokensFromUri(redirect);
    if(rso == null) {
        console.error("Riot servers didn't return an RSO token!");
        console.error("Most likely the Cloudflare firewall is blocking your IP address. Try hosting on your home PC and seeing if the issue still happens.");
        throw "Riot servers didn't return an RSO token!";
    }

    user.auth = {
        ...user.auth,
        rso: rso,
        idt: idt,
    }

    // save either cookies or login/password
    if(authData.login && config.storePasswords && !user.auth.waiting2FA) { // don't store login/password for people with 2FA
        user.auth.login = authData.login;
        user.auth.password = btoa(authData.password);
        delete user.auth.cookies;
    } else {
        user.auth.cookies = authData.cookies;
        delete user.auth.login; delete user.auth.password;
    }

    user.puuid = decodeToken(rso).sub;

    const existingAccount = getAccountWithPuuid(id, user.puuid);
    if(existingAccount) {
        user.username = existingAccount.username;
        user.region = existingAccount.region;
        if(existingAccount.auth) user.auth.ent = existingAccount.auth.ent;
    }

    // get username
    const userInfo = await getUserInfo(user);
    user.username = userInfo.username;

    // get entitlements token
    if(!user.auth.ent) user.auth.ent = await getEntitlements(user);

    // get region
    if(!user.region) user.region = await getRegion(user);

    user.lastFetchedData = Date.now();

    user.authFailures = 0;
    return user;
}

export const getUserInfo = async (user) => {
    const req = await fetch("https://auth.riotgames.com/userinfo", {
        headers: {
            'Authorization': "Bearer " + user.auth.rso
        }
    });
    console.assert(req.statusCode === 200, `User info status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if(json.acct) return {
        puuid: json.sub,
        username: json.acct.game_name && json.acct.game_name + "#" + json.acct.tag_line
    }
}

const getEntitlements = async (user) => {
    const req = await fetch("https://entitlements.auth.riotgames.com/api/token/v1", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            'Authorization': "Bearer " + user.auth.rso
        }
    });
    console.assert(req.statusCode === 200, `Auth status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    return json.entitlements_token;
}

export const getRegion = async (user) => {
    const req = await fetch("https://riot-geo.pas.si.riotgames.com/pas/v1/product/valorant", {
        method: "PUT",
        headers: {
            'Content-Type': 'application/json',
            'Authorization': "Bearer " + user.auth.rso
        },
        body: JSON.stringify({
            'id_token': user.auth.idt,
        })
    });
    console.assert(req.statusCode === 200, `PAS token status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    return json.affinities.live;
}

export const redeemCookies = async (id, cookies) => {
    let rateLimit = isRateLimited("auth.riotgames.com");
    if(rateLimit) return {success: false, rateLimit: rateLimit};

    const req = await fetch("https://auth.riotgames.com/authorize?redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in&client_id=play-valorant-web-prod&response_type=token%20id_token&scope=account%20openid&nonce=1", {
        headers: {
            'user-agent': await getUserAgent(),
            cookie: cookies
        }
    });
    console.assert(req.statusCode === 303, `Cookie Reauth status code is ${req.statusCode}!`, req);

    rateLimit = checkRateLimit(req, "auth.riotgames.com");
    if(rateLimit) return {success: false, rateLimit: rateLimit};

    if(detectCloudflareBlock(req)) return {success: false, rateLimit: "cloudflare"};

    if(req.headers.location.startsWith("/login")) return {success: false}; // invalid cookies

    cookies = {
        ...parseSetCookie(cookies),
        ...parseSetCookie(req.headers['set-cookie'])
    }

    const user = await processAuthResponse(id, {cookies}, req.headers.location);
    addUser(user);

    return {success: true};
}

export const refreshToken = async (id, account=null) => {
    console.log(`Refreshing token for ${id}...`)
    let response = {success: false}

    let user = getUser(id, account);
    if(!user) return response;

    if(user.auth.cookies) {
        response = await queueCookiesLogin(id, stringifyCookies(user.auth.cookies));
        if(response.inQueue) response = await waitForAuthQueueResponse(response);
    }
    if(!response.success && user.auth.login && user.auth.password) {
        response = await queueUsernamePasswordLogin(id, user.auth.login, atob(user.auth.password));
        if(response.inQueue) response = await waitForAuthQueueResponse(response);
    }

    if(!response.success && !response.mfa && !response.rateLimit) deleteUserAuth(user);

    return response;
}




const getUserAgent = async () => {
    // temporary bypass for Riot adding hCaptcha (see github issue #93)
    return "ShooterGame/13 Windows/10.0.19043.1.256.64bit";
    
    if(!riotClientVersion) await fetchRiotClientVersion();
    return `RiotClient/${riotClientVersion}.1234567 rso-auth (Windows;10;;Professional, x64)`;
}

const detectCloudflareBlock = (req) => {
    const blocked = req.statusCode === 403 && req.headers["x-frame-options"] === "SAMEORIGIN";

    if(blocked) {
        console.error("[ !!! ] Error 1020: Your bot might be rate limited, it's best to check if your IP address/your hosting service is blocked by Riot - try hosting on your own PC to see if it solves the issue?")
    }

    return blocked;
}

export const deleteUserAuth = (user) => {
    user.auth = null;
    saveUser(user);
}
