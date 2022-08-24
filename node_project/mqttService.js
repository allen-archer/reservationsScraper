const mqtt = require('mqtt')
const frigate = require('./frigate')
let mqttConfig
let client
let logger
const deviceMap = new Map()
const frigateEventsTopic = 'frigate/events'
let areSnapshotsSnoozed = false

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

async function initialize(_mqttConfig, _secrets, _logger){
    logger = _logger
    mqttConfig = _mqttConfig
    client = mqtt.connect(mqttConfig.address)
    client.on('connect', () => {
        client.subscribe([frigateEventsTopic], () => {
            logger.info(`Subscribed to topic '${frigateEventsTopic}'`)
        })
    })
    client.on('message', (topic, payload) => {
        if (areSnapshotsSnoozed){
            return
        }
        const obj = JSON.parse(payload.toString())
        const before = obj.before
        const after = obj.after
        const type = obj.type
        if (type === 'new'){
            if (before && before.has_snapshot){
                frigate.sendSnapshot(before.camera, before.id)
            } else if (after && after.has_snapshot){
                frigate.sendSnapshot(after.camera, after.id)
            }
        }
    })
    for (let device of await createDeviceList(mqttConfig, _secrets)){
        deviceMap.set(device.name, device)
        await publishMessage(device.registerTopic, JSON.stringify(device.registerMessage))
        await publishMessage(device.registerMessage.availability.topic, device.registerMessage.availability.payload_available)
    }
}

async function createDeviceList(mqttConfig, secrets){
    let newDevices = []
    for (let device of mqttConfig.devices){
        if (device.name === "occupancy roomname"){
            let deviceStr = JSON.stringify(device)
            for (let roomName of Object.values(secrets.roomNameMap)){
                if (Array.isArray(roomName)){
                    logger.info(roomName + ' is array, skipping')
                } else {
                    let newDeviceStr = deviceStr.replaceAll('roomname', roomName)
                    newDevices.push(JSON.parse(newDeviceStr))
                }
            }
        } else {
            newDevices.push(device)
        }
    }
    return newDevices
}

async function snooze(snooze){
    if (snooze === 'on'){
        logger.info('Snapshots are turned off.')
        areSnapshotsSnoozed = true
    } else {
        logger.info('Snapshots are turned on.')
        areSnapshotsSnoozed = false
    }
}

async function publishAttributes(deviceName, attributes){
    const device = deviceMap.get(deviceName)
    await publishMessage(device.registerMessage.json_attributes_topic, JSON.stringify(attributes))
}

module.exports = { initialize, changeDeviceState, snooze, publishAttributes }
