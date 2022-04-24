const mqtt = require('mqtt')
let mqttConfig
let client
let logger
const deviceMap = new Map()

async function publishMessage(topic, message){
    client.publish(topic, message, { qos: 0, retain: true }, (error) => {
        if (error) {
            logger.error(error)
        }
    })
}

async function changeDeviceState(deviceName, state){
    let device = deviceMap.get(deviceName)
    if (state === true){
        await publishMessage(device.registerMessage.state_topic, device.registerMessage.state_on)
    } else {
        await publishMessage(device.registerMessage.state_topic, device.registerMessage.state_off)
    }
}

async function initialize(config, _logger){
    logger = _logger
    mqttConfig = config
    client = mqtt.connect(mqttConfig.address)
    for (let device of mqttConfig.devices){
        deviceMap.set(device.name, device)
        await publishMessage(device.registerTopic, JSON.stringify(device.registerMessage))
        await publishMessage(device.registerMessage.availability.topic, device.registerMessage.availability.payload_available)
    }
}

module.exports = { initialize, changeDeviceState }