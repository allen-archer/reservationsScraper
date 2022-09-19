package org.chunkystyles.reservations.scraper.model;

public record MqttDevice(String registerTopic, String registerMessage, String availabilityTopic, String stateTopic) {
}
