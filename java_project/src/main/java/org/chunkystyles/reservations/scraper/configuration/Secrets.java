package org.chunkystyles.reservations.scraper.configuration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.PropertySource;
import org.springframework.stereotype.Component;

@Component
@PropertySource("classpath:secrets")
public record Secrets(
        String username,
        String password,
        String scraperUrl,
        String webhookUrl,
        String roomNumbersToNamesString) {
    public Secrets(
            @Value("${scraperUsername}") String username,
            @Value("${scraperPassword}") String password,
            @Value("${scraperUrl}") String scraperUrl,
            @Value("${webhookUrl}") String webhookUrl,
            @Value("${roomNumbersToNamesString}") String roomNumbersToNamesString) {
        this.username = username;
        this.password = password;
        this.scraperUrl = scraperUrl;
        this.webhookUrl = webhookUrl;
        this.roomNumbersToNamesString = roomNumbersToNamesString;
    }
}
