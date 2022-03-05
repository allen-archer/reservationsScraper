package org.chunkystyles.bookitnow.scraper.configuration;

import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.PropertySource;
import org.springframework.stereotype.Component;

@Getter
@Component
@PropertySource("classpath:secrets")
public class Secrets {
    private final String username;
    private final String password;
    private final String scraperUrl;
    private final String webhookUrl;
    private final String roomNumbersToNamesString;

    public Secrets(@Value("${scraperUsername}") String username,
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
