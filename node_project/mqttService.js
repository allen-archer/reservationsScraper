const mqtt = require('mqtt')
const mqttConfig = require('./mqttConfig.json')
const client = mqtt.connect(mqttConfig.address)
const deviceMap = new Map()
let initialized = false

client.on('connect', async function () {
    for (let device of mqttConfig.devices){
        deviceMap.set(device.name, device)
        await publishMessage(device.registerTopic, JSON.stringify(device.registerMessage))
        await publishMessage(device.registerMessage.availability.topic, device.registerMessage.availability.payload_available)
    }
    initialized = true
})

async function publishMessage(topic, message){
    client.publish(topic, message, { qos: 0, retain: true }, (error) => {
        if (error) {
            console.error(error)
        }
    })
}

async function changeDeviceState(deviceName, state){
    let i = 1
    let maxDelays = 10
    while (!initialized){
        if (i >= maxDelays){
            console.log('Message timed out.')
            return
        }
        console.log('Delaying 1000ms')
        i++
        await delay(1000)
    }
    let device = deviceMap.get(deviceName)
    if (state){
        await publishMessage(device.registerMessage.state_topic, device.registerMessage.state_on)
    } else {
        await publishMessage(device.registerMessage.state_topic, device.registerMessage.state_off)
    }
}

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

module.exports = { changeDeviceState }