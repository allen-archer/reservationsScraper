package org.chunkystyles.reservations.scraper.service;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.chunkystyles.reservations.scraper.configuration.ArgumentsValues;
import org.chunkystyles.reservations.scraper.model.MqttDevice;
import org.eclipse.paho.client.mqttv3.*;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

@Service
public class MqttService {
  private static final Logger logger = LogManager.getLogger();
  private IMqttClient client;
  private final Map<String, MqttDevice> mqttDeviceMap;

  public MqttService(ArgumentsValues argumentsValues, Map<String, MqttDevice> mqttDeviceMap) {
    this.mqttDeviceMap = mqttDeviceMap;
    try {
      client = new MqttClient("tcp://" + argumentsValues.getMqttBrokerAddress() + ":" + argumentsValues.getMqttBrokerPort(), UUID.randomUUID().toString());
      MqttConnectOptions options = new MqttConnectOptions();
      options.setAutomaticReconnect(true);
      options.setCleanSession(true);
      options.setConnectionTimeout(10);
      client.connect(options);
      for (String name : this.mqttDeviceMap.keySet()){
        logger.info("Registering mqtt device named: {}", name);
        MqttDevice mqttDevice = this.mqttDeviceMap.get(name);
        sendMessage(mqttDevice.registerTopic(), mqttDevice.registerMessage());
        sendMessage(mqttDevice.availabilityTopic(), "ONLINE");
      }
    } catch (MqttException e) {
      logger.error(e.getMessage(), e);
    }
  }

  public void updateState(boolean guestsToday, String name){
    MqttDevice mqttDevice = mqttDeviceMap.get(name);
    if (mqttDevice == null){
      logger.error("Mqtt device named '{}' not found.", name);
      return;
    }
    if (guestsToday){
      sendMessage(mqttDevice.stateTopic(), "ON");
    } else {
      sendMessage(mqttDevice.stateTopic(), "OFF");
    }
  }

  public void sendMessage(String topic, String message){
    try {
      client.publish(topic, message.getBytes(StandardCharsets.UTF_8), 0, true);
    } catch (MqttException e) {
      logger.error(e.getMessage(), e);
    }
  }
}
