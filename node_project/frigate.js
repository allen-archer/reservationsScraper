const Discord = require('discord.js')
const http = require('http')
const fs = require('fs')

let config
let secrets
let logger
let webhook

async function initialize(_config, _secrets, _logger){
    config = _config
    secrets = _secrets
    logger = _logger
    webhook = new Discord.WebhookClient({url: secrets.frigate.webhook})
}

async function sendSnapshot(camera, id, count = 1) {
    const filename = camera + '-' + id + '.jpg'
    const path = config.snapshot.path
    if (fs.existsSync(path + filename)) {
        sendFile(path + filename, filename).then()
        if (count > 1){
            logger.info('File ' + filename + ' found in clips after ' + count + ' tries')
        }
    } else {
        const tempFile = config.snapshot.temp + filename
        const options = {
            hostname: config.frigate.host,
            port: config.frigate.port,
            path: '/api/events/' + id + '/snapshot.jpg?bbox=1&timestamp=1&crop=1&h=480&quality=90'
        }
        http.get(options, res => {
            let data = []
            let size = 0
            res.on('data', d => {
                size += d.length
                data.push(d)
            })
            res.on('end', async d => {
                if (size < 200){
                    if (count <= config.snapshot.retries) {
                        const seconds = config.snapshot.wait
                        logger.info(filename + ' doesn\'t exist, waiting and retrying in ' + seconds + ' seconds.')
                        await delay(seconds * 1000)
                        return sendSnapshot(camera, id, count + 1)
                    } else {
                        logger.error(filename + ' doesn\'t exist but max retries reached after ' + count + ' tries.')
                        return
                    }
                }
                if (count > 1){
                    logger.info('File ' + filename + ' retrieved from Frigate after ' + count + ' tries.')
                }
                const image = Buffer.concat(data, size)
                fs.writeFile(
                    tempFile,
                    image,
                    'binary',
                        error => {
                            if (error){
                                logger.error(error.message)
                            }
                            sendFile(tempFile, filename)
                        }
                )
            })
        }).on('error', error => {
            logger.error(error.message)
        })
    }
}

async function sendFile(filePath, fileName){
    webhook
        .send(
            {
                files: [
                    {
                        attachment: filePath,
                        name: fileName
                    }
                ]
            }
        )
        .catch(error => logger.error(error.message))
}

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

module.exports = { initialize, sendSnapshot }