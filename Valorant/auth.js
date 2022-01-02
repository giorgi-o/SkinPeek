import config from "../config.js";
import fs from "fs";

import {fetch, parseSetCookie, stringifyCookies, extractTokensFromUri, tokenExpiry} from "./util.js";

let users;

const saveUserData = () => {
    fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
}

export const getUser = (id) => {
    if(!users) try {
        users = JSON.parse(fs.readFileSync("users.json", 'utf-8'));
        saveUserData();
    } catch(e) {
        users = {};
    }

    return users[id];
}

export const getUserList = () => {
    if(!users) try {
        users = JSON.parse(fs.readFileSync("users.json", 'utf-8'));
        saveUserData();
    } catch(e) {
        users = {};
    }

    return Object.keys(users);
}

export const authUser = async (id) => {
    // doesn't check if token is valid, only checks it hasn't expired
    const user = getUser(id);
    if(!user) return;

    const rsoExpiry = tokenExpiry(user.rso);
    if(rsoExpiry - Date.now() > 10_000) return true;

    return await refreshToken(id);
}

export const redeemUsernamePassword = async (id, username, password) => {
    const user = getUser(id) || {};

    // 1. prepare cookies for auth request
    const req1 = await fetch("https://auth.riotgames.com/api/v1/authorization", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
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

    // 2. get access token
    const req2 = await fetch("https://auth.riotgames.com/api/v1/authorization", {
        method: "PUT",
        headers: {
            'Content-Type': 'application/json',
            'cookie': stringifyCookies(cookies)
        },
        body: JSON.stringify({
            'type': 'auth',
            'username': username,
            'password': password
        })
    });
    console.assert(req2.statusCode === 200, `Auth status code is ${req2.statusCode}!`, req2);

    const json2 = JSON.parse(req2.body);
    if(json2.error === "auth_failure") {
        console.error("Authentication failure!", json2);
        return false;
    }

    users[id] = user;

    // 2.1 extract access token
    const [rso, idt] = extractTokensFromUri(json2.response.parameters.uri);
    user.rso = rso;
    user.idt = idt;

    // 2.2 save either cookies or login/password
    if(config.storePasswords) {
        user.login = username;
        user.password = password; // I should encrypt this
    } else {
        user.cookies = {
            ...cookies,
            ...parseSetCookie(req2.headers['set-cookie'])
        };
    }

    // 3. get user info
    const userInfo = await getUserInfo(id);
    user.puuid = userInfo.puuid;
    user.username = userInfo.username;

    // 4. get entitlements token
    user.ent = await getEntitlements(id);

    // 5. get region
    user.region = await getRegion(id);

    // 6. save data
    saveUserData();
    return true;
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
    if(!config.storePasswords) user.cookies = {
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
    const user = getUser(id);
    if(!user) return;

    let success;
    if(user.login && user.password) success = await redeemUsernamePassword(id, user.login, user.password);
    else if(user.cookies) success = await redeemCookies(id, stringifyCookies(user.cookies));
    else success = false;

    if(!success) deleteUser(id);
    return success;
}

export const deleteUser = (id) => {
    delete users[id];
    saveUserData();
}
