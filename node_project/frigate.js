const {Webhook} = require("discord-webhook-node");

let config
let secrets
let logger
let webhook

async function initialize(_config, _secrets, _logger){
    config = _config
    secrets = _secrets
    logger = _logger
    webhook = new Webhook(secrets.frigate.webhook)
}

async function sendMessage(message){
    webhook
        .send(message)
        .catch(e => logger.error(e.message))
}

async function sendFile(file){
    webhook
        .sendFile(file)
        .catch(e => logger.error(e.message))
}

module.exports = { initialize, sendMessage, sendFile }