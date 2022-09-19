package org.chunkystyles.reservations.scraper.configuration;

import club.minnced.discord.webhook.WebhookClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
public class WebhookClientBean {

  @Bean
  @Primary
  public WebhookClient primary(Secrets secrets) {
    return WebhookClient.withUrl(secrets.webhookUrl());
  }
}
