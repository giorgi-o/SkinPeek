import config from "../misc/config.js";
import fs from "fs";

import {fetch, parseSetCookie, stringifyCookies, extractTokensFromUri, tokenExpiry} from "../misc/util.js";
import {cleanupFailedOperations} from "../discord/authManager.js";
import {removeAlertsFromUser} from "../discord/alerts.js";

let users;

export const loadUserData = () => {
    if(!users) try {
        if (!fs.existsSync("data")) fs.mkdirSync("data");
        users = JSON.parse(fs.readFileSync("data/users.json", 'utf-8'));
        saveUserData();
    } catch(e) {
        users = {};
    }
}

const saveUserData = () => {
    fs.writeFileSync("data/users.json", JSON.stringify(users, null, 2));
}

export const getUser = (id) => {
    loadUserData();
    return users[id];
}

export const getUserList = () => {
    loadUserData();
    return Object.keys(users);
}

export const authUser = async (id) => {
    // doesn't check if token is valid, only checks it hasn't expired
    const user = getUser(id);
    if(!user || !user.rso) return {success: false};

    const rsoExpiry = tokenExpiry(user.rso);
    if(rsoExpiry - Date.now() > 10_000) return {success: true};

    return await refreshToken(id);
}

const userAgent = "RiotClient/43.0.1.4195386.4190634 rso-auth (Windows;10;;Professional, x64)";

export const redeemUsernamePassword = async (id, login, password) => {
    const user = getUser(id) || {};

    // prepare cookies for auth request
    const req1 = await fetch("https://auth.riotgames.com/api/v1/authorization", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            'user-agent': userAgent
        },
        body: JSON.stringify({
            'client_id': 'play-valorant-web-prod',
            'response_type': 'token id_token',
            'redirect_uri': 'https://playvalorant.com/opt_in',
            'scope': 'account openid',
            'nonce': '1',
        })
    });
    console.assert(req1.statusCode === 200, `Auth Request Cookies status code is ${req1.statusCode}!`, req1);
    let cookies = parseSetCookie(req1.headers['set-cookie']);

    // get access token
    const req2 = await fetch("https://auth.riotgames.com/api/v1/authorization", {
        method: "PUT",
        headers: {
            'Content-Type': 'application/json',
            'user-agent': userAgent,
            'cookie': stringifyCookies(cookies)
        },
        body: JSON.stringify({
            'type': 'auth',
            'username': login,
            'password': password,
            'remember': true
        })
    });
    console.assert(req2.statusCode === 200, `Auth status code is ${req2.statusCode}!`, req2);

    if(req2.statusCode === 429) return {success: false, rateLimit: true};

    cookies = {
        ...cookies,
        ...parseSetCookie(req2.headers['set-cookie'])
    };

    const json2 = JSON.parse(req2.body);
    if(json2.type === 'error') {
        if(json2.error === "auth_failure") console.error("Authentication failure!", json2);
        else console.error("Unknown auth error!", json2);
        return {success: false};
    }

    users[id] = user;

    if(json2.type === 'response') {
        await processAuthResponse(id, {login, password, cookies}, json2);
        return {success: true};
    } else if(json2.type === 'multifactor') { // 2FA
        user.waiting2FA = Date.now();

        user.cookies = cookies;
        if(config.storePasswords) {
            user.login = login;
            user.password = password;
        }

        saveUserData();
        return {success: false, mfa: true, method: json2.multifactor.method, email: json2.multifactor.email};
    }

    return {success: false};
}

export const redeem2FACode = async (id, code) => {
    const user = getUser(id) || {};
    let cookies = user.cookies || {};

    const req = await fetch("https://auth.riotgames.com/api/v1/authorization", {
        method: "PUT",
        headers: {
            'Content-Type': 'application/json',
            'user-agent': userAgent,
            'cookie': stringifyCookies(cookies)
        },
        body: JSON.stringify({
            'type': 'multifactor',
            'code': code.toString(),
            'rememberDevice': true
        })
    });
    console.assert(req.statusCode === 200, `2FA status code is ${req.statusCode}!`, req);

    if(req.statusCode === 429) return {success: false, rateLimit: true};

    user.cookies = {
        ...cookies,
        ...parseSetCookie(req.headers['set-cookie'])
    };

    const json = JSON.parse(req.body);
    if(json.error === "multifactor_attempt_failed") {
        console.error("Authentication failure!", json);
        return {success: false};
    }

    await processAuthResponse(id, {login: user.login, password: user.password, cookies: user.cookies}, json);

    delete user.waiting2FA;
    saveUserData();

    return {success: true};
}

const processAuthResponse = async (id, authData, resp) => {
    const user = getUser(id) || {};
    users[id] = user;

    const [rso, idt] = extractTokensFromUri(resp.response.parameters.uri);
    user.rso = rso;
    user.idt = idt;

    // save either cookies or login/password
    if(config.storePasswords && !user.waiting2FA) { // don't store login/password for people with 2FA
        user.login = authData.login;
        user.password = authData.password; // I should encrypt this
        delete user.cookies;
    } else {
        user.cookies = authData.cookies;
        delete user.login; delete user.password;
    }

    // get user info
    const userInfo = await getUserInfo(id);
    user.puuid = userInfo.puuid;
    user.username = userInfo.username;

    // get entitlements token
    user.ent = await getEntitlements(id);

    // get region
    user.region = await getRegion(id);

    // save data
    saveUserData();
}

const getUserInfo = async (id) => {
    const user = getUser(id);
    const req = await fetch("https://auth.riotgames.com/userinfo", {
        headers: {
            'Authorization': "Bearer " + user.rso
        }
    });
    console.assert(req.statusCode === 200, `User info status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    if(json.acct) return {
        puuid: json.sub,
        username: json.acct.game_name + "#" + json.acct.tag_line
    }
}

const getEntitlements = async (id) => {
    const user = getUser(id);
    const req = await fetch("https://entitlements.auth.riotgames.com/api/token/v1", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            'Authorization': "Bearer " + user.rso
        }
    });
    console.assert(req.statusCode === 200, `Auth status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    return json.entitlements_token;
}

const getRegion = async (id) => {
    const user = getUser(id);
    const req = await fetch("https://riot-geo.pas.si.riotgames.com/pas/v1/product/valorant", {
        method: "PUT",
        headers: {
            'Content-Type': 'application/json',
            'Authorization': "Bearer " + user.rso
        },
        body: JSON.stringify({
            'id_token': user.idt,
        })
    });
    console.assert(req.statusCode === 200, `PAS token status code is ${req.statusCode}!`, req);

    const json = JSON.parse(req.body);
    return json.affinities.live;
}

export const redeemCookies = async (id, cookies) => {
    const user = getUser(id) || {};

    const req = await fetch("https://auth.riotgames.com/authorize?redirect_uri=https%3A%2F%2Fplayvalorant.com%2Fopt_in&client_id=play-valorant-web-prod&response_type=token%20id_token&scope=account%20openid&nonce=1", {
        headers: {
            cookie: cookies
        }
    });
    console.assert(req.statusCode === 303, `Cookie Reauth status code is ${req.statusCode}!`, req);

    if(req.headers.location.startsWith("/login")) return false; // invalid cookies

    users[id] = user;
    if(!user.login || !user.password) user.cookies = {
        ...user.cookies,
        ...parseSetCookie(req.headers['set-cookie'])
    };

    const [rso, idt] = extractTokensFromUri(req.headers.location);
    user.rso = rso;
    user.idt = idt;

    const userInfo = await getUserInfo(id);
    user.puuid = userInfo.puuid;
    user.username = userInfo.username;
    user.ent = await getEntitlements(id);
    user.region = await getRegion(id);

    saveUserData();

    return true;
}

export const refreshToken = async (id) => {
    let response = {success: false}

    const user = getUser(id);
    if(!user) return response;

    if(user.cookies) response.success = await redeemCookies(id, stringifyCookies(user.cookies));
    if(!response.success && user.login && user.password) response = await redeemUsernamePassword(id, user.login, user.password);

    if(!response.success && !response.mfa && !response.rateLimit) deleteUser(id);
    return response;
}

export const cleanupAccounts = () => {
    try {
        for(const [id, user] of Object.entries(users)) {
            if(user.waiting2FA && Date.now() - user.waiting2FA > 10 * 60 * 1000) deleteUser(id);
            else if(!user.cookies && (!user.login || !user.password)) deleteUser(id);
        }

        cleanupFailedOperations();
    } catch(e) {
        console.error("There was an error while trying to cleanup accounts!");
        console.error(e);
    }
}

export const deleteUser = (id, deleteAlerts=false) => {
    delete users[id];
    if(deleteAlerts) removeAlertsFromUser(id);
    saveUserData();
}
