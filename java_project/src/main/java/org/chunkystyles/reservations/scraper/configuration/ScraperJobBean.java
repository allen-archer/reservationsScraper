package org.chunkystyles.reservations.scraper.configuration;

import org.chunkystyles.reservations.scraper.batch.ScraperItemProcessor;
import org.chunkystyles.reservations.scraper.service.ScraperService;
import org.springframework.batch.core.Job;
import org.springframework.batch.core.configuration.annotation.EnableBatchProcessing;
import org.springframework.batch.core.configuration.annotation.JobBuilderFactory;
import org.springframework.batch.core.configuration.annotation.StepBuilderFactory;
import org.springframework.batch.core.launch.support.RunIdIncrementer;
import org.springframework.batch.item.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
@EnableBatchProcessing
public class ScraperJobBean {
  private final JobBuilderFactory jobBuilderFactory;
  private final StepBuilderFactory stepBuilderFactory;
  private final ScraperService scraperService;

  public ScraperJobBean(
      JobBuilderFactory jobBuilderFactory,
      StepBuilderFactory stepBuilderFactory,
      ScraperService scraperService) {
    this.jobBuilderFactory = jobBuilderFactory;
    this.stepBuilderFactory = stepBuilderFactory;
    this.scraperService = scraperService;
  }

  @Bean
  public Job job() {
    return jobBuilderFactory
        .get("scraperJob")
        .incrementer(new RunIdIncrementer())
        .flow(
            stepBuilderFactory
                .get("step1")
                .<String, String>chunk(1)
                .reader(new StringItemReader())
                .processor(new ScraperItemProcessor(scraperService))
                .writer(new ConsoleItemWriter())
                .build())
        .end()
        .build();
  }

  public static class ConsoleItemWriter implements ItemWriter<String> {
    @Override
    public void write(List<? extends String> list) throws Exception {
      // I don't actually want to do anything here.
    }
  }

  public static class StringItemReader implements ItemReader<String> {
    private int runCount;

    public StringItemReader() {
      runCount = 0;
    }

    @Override
    public String read()
        throws Exception, UnexpectedInputException, ParseException, NonTransientResourceException {
      if (runCount++ % 2 == 0) {
        return "Yes, run the job.";
      } else {
        // I just want this to run once
        // So on first run, I return a string
        // On second run I return null to stop the run
        return null;
      }
    }
  }
}
