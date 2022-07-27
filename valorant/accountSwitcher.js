import fs from "fs";
import {removeDupeAlerts} from "../misc/util.js";
import {defaultSettings} from "../misc/settings.js";

/** JSON format:
 * {
 *     accounts: [User objects],
 *     currentAccount: currently selected account, 1 for first account,
 *     settings: dictionary
 * }
 */

export const readUserJson = (id) => {
    try {
        return JSON.parse(fs.readFileSync("data/users/" + id + ".json", "utf-8"));
    } catch(e) {
        return null;
    }
}

export const getUserJson = (id, account=null) => {
    const user = readUserJson(id);
    if(!user) return null;

    if(!user.accounts) {
        const userJson =  {
            accounts: [user],
            currentAccount: 1,
            settings: defaultSettings
        }
        saveUserJson(id, userJson);
        return userJson.accounts[account || 1];
    }

    return user.accounts[(account || user.currentAccount) - 1];
}

export const saveUserJson = (id, json) => {
    if(!fs.existsSync("data/users")) fs.mkdirSync("data/users");
    fs.writeFileSync("data/users/" + id + ".json", JSON.stringify(json, null, 2));
}

export const saveUser = (user, account=null) => {
    if(!fs.existsSync("data/users")) fs.mkdirSync("data/users");

    const userJson = readUserJson(user.id);
    if(!userJson) {
        const objectToWrite = {
            accounts: [user],
            currentAccount: 1,
            settings: defaultSettings
        }
        saveUserJson(user.id, objectToWrite);
    } else {
        if(!account) account = userJson.accounts.findIndex(a => a.puuid === user.puuid) + 1 || userJson.currentAccount;
        if(account > userJson.accounts.length) account = userJson.accounts.length;

        userJson.accounts[(account || userJson.currentAccount) - 1] = user;
        saveUserJson(user.id, userJson);
    }
}

export const addUser = (user) => {
    const userJson = readUserJson(user.id);
    if(userJson) {
        // check for duplicate accounts
        let foundDuplicate = false;
        for(let i = 0; i < userJson.accounts.length; i++) {
            if(userJson.accounts[i].puuid === user.puuid) {
                user.alerts = removeDupeAlerts(user.alerts.concat(userJson.accounts[i].alerts));
                userJson.accounts[i] = user;
                userJson.currentAccount = i + 1;
                foundDuplicate = true;
            }
        }

        if(!foundDuplicate) {
            userJson.accounts.push(user);
            userJson.currentAccount = userJson.accounts.length;
        }

        saveUserJson(user.id, userJson);
    } else {
        const objectToWrite = {
            accounts: [user],
            currentAccount: 1,
            settings: defaultSettings
        }
        saveUserJson(user.id, objectToWrite);
    }
}

export const deleteUser = (id, accountNumber) => {
    const userJson = readUserJson(id);
    if(!userJson) return;

    const indexToDelete = (accountNumber || userJson.currentAccount) - 1;
    const userToDelete = userJson.accounts[indexToDelete];

    userJson.accounts.splice(indexToDelete, 1);
    if(userJson.accounts.length === 0) fs.unlinkSync("data/users/" + id + ".json");
    else if(userJson.currentAccount > userJson.accounts.length) userJson.currentAccount = userJson.accounts.length;

    saveUserJson(id, userJson);

    return userToDelete.username;
}

export const deleteWholeUser = (id) => {
    if(!fs.existsSync("data/users")) return;
    fs.unlinkSync("data/users/" + id + ".json");
}

export const getNumberOfAccounts = (id) => {
    const user = readUserJson(id);
    if(!user) return 0;
    return user.accounts.length;
}

export const switchAccount = (id, accountNumber) => {
    const userJson = readUserJson(id);
    if(!userJson) return;
    userJson.currentAccount = accountNumber;
    saveUserJson(id, userJson);
    return userJson.accounts[accountNumber - 1];
}

