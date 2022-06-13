import fs from "fs";

/** JSON format:
 * {
 *     accounts: [User objects],
 *     currentAccount: currently selected account, 1 for first account
 * }
 */

export const readUserJson = (id) => {
    try {
        return JSON.parse(fs.readFileSync("data/users/" + id + ".json", "utf-8"));
    } catch(e) {
        return null;
    }
}

export const getUserJson = (id) => {
    const user = readUserJson(id);
    if(!user) return null;
    return user.accounts[user.currentAccount - 1];
}

const saveUserJson = (id, json) => {
    if(!fs.existsSync("data/users")) fs.mkdirSync("data/users");
    fs.writeFileSync("data/users/" + id + ".json", JSON.stringify(json, null, 2));
}

export const saveUser = (user) => {
    if(!fs.existsSync("data/users")) fs.mkdirSync("data/users");

    const userJson = readUserJson(user.id);
    if(!userJson) {
        const objectToWrite = {
            accounts: [user],
            currentAccount: 1
        }
        saveUserJson(user.id, objectToWrite);
    } else {
        userJson.accounts[userJson.currentAccount - 1] = user;
        saveUserJson(user.id, userJson);
    }
}

export const addUser = (user) => {
    const userJson = readUserJson(user.id);
    if(!userJson) {
        const objectToWrite = {
            accounts: [user],
            currentAccount: 1
        }
        saveUserJson(user.id, objectToWrite);
    } else {
        userJson.accounts.push(user);
        userJson.currentAccount = userJson.accounts.length;
        saveUserJson(user.id, userJson);
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

