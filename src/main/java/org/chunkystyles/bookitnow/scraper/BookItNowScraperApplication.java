package org.chunkystyles.bookitnow.scraper;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;

@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class})
public class BookItNowScraperApplication {

  public static void main(String[] args) {
    SpringApplication.run(BookItNowScraperApplication.class, args);
  }
}
