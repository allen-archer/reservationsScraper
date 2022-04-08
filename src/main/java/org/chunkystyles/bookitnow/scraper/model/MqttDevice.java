package org.chunkystyles.bookitnow.scraper.model;

public record MqttDevice(String registerTopic, String registerMessage, String availabilityTopic, String stateTopic) {
}
