import mqtt from 'mqtt';

let mqttConfig;
let config;
let client;
let logger;
const deviceMap = new Map();

async function publishMessage(topic, message) {
  client.publish(topic, message, {qos: 0, retain: true}, (error) => {
    if (error) {
      logger.error(error);
    }
  });
}

async function changeDeviceState(deviceName, state) {
  await publishMessage(deviceMap.get(deviceName), state ? 'ON' : 'OFF');
}

async function initialize(_mqttConfig, _config, _secrets, _logger) {
  logger = _logger;
  mqttConfig = _mqttConfig;
  config = _config;
  client = mqtt.connect(mqttConfig.address);
  await createDeviceList(mqttConfig, _secrets);
}

async function createDeviceList(mqttConfig, secrets) {
  for (let device of mqttConfig.devices) {
    if (device.name === "occupancy roomname") {
      for (let roomName of Object.values(secrets.roomNames)) {
        const name = device.name.replaceAll('roomname', roomName);
        const topic = device.topic.replaceAll('roomname', roomName.toLowerCase());
        deviceMap.set(name, topic);
      }
    } else {
      deviceMap.set(device.name, device.topic);
    }
  }
}

async function publishAttributes(deviceName, attributes) {
  await publishMessage(deviceMap.get(deviceName), JSON.stringify(attributes));
}

export {initialize, changeDeviceState, publishAttributes}
