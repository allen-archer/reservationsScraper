const {Webhook} = require("discord-webhook-node");
const fs = require('fs');

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
    let count = 0
    let success = false
    do {
        if (!fs.existsSync(file)){
            logger.error('File ' + file + ' does not exist yet.  Sleeping for ' + config.snapshot.sleep + ' seconds.')
            count++
            await wait(config.snapshot.sleep * 1000)
        } else {
            success = true
        }
    } while (count < config.snapshot.retries && !success)
    if (!success){
        logger.error('File ' + file + ' does not exist')
        return
    } else {
        logger.info('File ' + file + ' exists, sending file')
    }
    webhook
        .sendFile(file)
        .catch(e => logger.error(e.message))
}

const wait = (ms) => new Promise(res => setTimeout(res, ms))

module.exports = { initialize, sendMessage, sendFile }