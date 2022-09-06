import {getAuthQueueItemStatus, Operations, queue2FACodeRedeem, queueUsernamePasswordLogin} from "../valorant/authQueue.js";
import {actionRow, retryAuthButton, wait} from "../misc/util.js";
import {getUser, setUserLocale} from "../valorant/auth.js";
import {authFailureMessage, basicEmbed} from "./embed.js";
import {s} from "../misc/languages.js";
import config from "../misc/config.js";

let failedOperations = [];

export const loginUsernamePassword = async (interaction, username, password, operationIndex=null) => {
    let login = await queueUsernamePasswordLogin(interaction.user.id, username, password);

    while(login.inQueue) {
        const queueStatus = getAuthQueueItemStatus(login.c);
        if(queueStatus.processed) login = queueStatus.result;
        else await wait(150);
    }

    const user = getUser(interaction.user.id);
    if(login.success && user) {
        console.log(`${interaction.user.tag} logged in as ${user.username}`);
        await interaction.followUp({
            embeds: [basicEmbed(s(interaction).info.LOGGED_IN.f({u: user.username}, interaction))],
            ephemeral: true
        });
        setUserLocale(user, interaction.locale);

        if(operationIndex !== null) {
            const index = failedOperations.findIndex(o => o.index === operationIndex);
            if(index > -1) failedOperations.splice(operationIndex, 1);
        }
    } else if(login.error) {
        console.error(`${interaction.user.tag} login error`);
        console.error(login.error);
        const index = operationIndex || generateOperationIndex();
        failedOperations.push({
            c: index,
            operation: Operations.USERNAME_PASSWORD,
            id: interaction.user.id,
            timestamp: Date.now(),
            username, password
        });

        await interaction.followUp({
            embeds: [basicEmbed(s(interaction).error.GENERIC_ERROR.f({e: login.error.message}))],
            components: [actionRow(retryAuthButton(interaction.user.id, index, s(interaction).info.AUTH_ERROR_RETRY))]
        });
    } else {
        console.log(`${interaction.user.tag} login error`);
        await interaction.followUp(authFailureMessage(interaction, login, s(interaction).error.INVALID_PASSWORD, true));
    }
}

export const login2FA = async (interaction, code, operationIndex=null) => {
    let login = await queue2FACodeRedeem(interaction.user.id, code);

    while(login.inQueue) {
        const queueStatus = getAuthQueueItemStatus(login.c);
        if(queueStatus.processed) login = queueStatus.result;
        else await wait(150);
    }

    const user = getUser(interaction.user.id);
    if(login.success && user) {
        console.log(`${interaction.user.tag} logged in as ${user.username} with 2FA code`);
        await interaction.followUp({
            embeds: [basicEmbed(s(interaction).info.LOGGED_IN.f({u: user.username}))]
        });
        setUserLocale(user, interaction.locale);
    } else if(login.error) {
        console.error(`${interaction.user.tag} 2FA error`);
        console.error(login.error);
        const index = operationIndex || generateOperationIndex();
        failedOperations.push({
            c: index,
            operation: Operations.MFA,
            id: interaction.user.id,
            timestamp: Date.now(),
            code
        });

        await interaction.followUp({
            embeds: [basicEmbed(s(interaction).error.GENERIC_ERROR.f({e: login.error.message}))],
            components: [actionRow(retryAuthButton(interaction.user.id, index, s(interaction).info.AUTH_ERROR_RETRY))]
        });
    } else {
        console.log(`${interaction.user.tag} 2FA code failed`);
        await interaction.followUp(authFailureMessage(interaction, login, s(interaction).error.INVALID_2FA, true));
    }
}

export const retryFailedOperation = async (interaction, index) => {
    const operation = failedOperations.find(o => o.c === index);
    if(!operation) return await interaction.followUp({
        embeds: [basicEmbed(s(interaction).error.AUTH_ERROR_RETRY_EXPIRED)],
        ephemeral: true
    });

    switch(operation.operation) {
        case Operations.USERNAME_PASSWORD:
            await loginUsernamePassword(interaction, operation.username, operation.password, operation.c);
            break;
        case Operations.MFA:
            await login2FA(interaction, operation.code, operation.c);
            break;
    }
}

export const cleanupFailedOperations = () => {
    failedOperations = failedOperations.filter(o => Date.now() - o.timestamp < config.loginRetryTimeout);
}

const generateOperationIndex = () => {
    let index = Math.floor(Math.random() * 100000);
    while(failedOperations.find(o => o.c === index)) index = Math.floor(Math.random() * 100000);
    return index;
}
