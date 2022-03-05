package org.chunkystyles.bookitnow.scraper.batch;

import org.springframework.batch.core.*;
import org.springframework.batch.core.launch.JobLauncher;
import org.springframework.batch.core.repository.JobExecutionAlreadyRunningException;
import org.springframework.batch.core.repository.JobInstanceAlreadyCompleteException;
import org.springframework.batch.core.repository.JobRestartException;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@EnableScheduling
public class BatchScheduler {
    private final JobLauncher jobLauncher;
    private final Job job;

    public BatchScheduler(JobLauncher jobLauncher, Job job) {
        this.jobLauncher = jobLauncher;
        this.job = job;
    }

    @Scheduled(cron = "${scraper.cron.expression}")
    public void testBatch(){
        JobParameters jobParameters = new JobParametersBuilder()
                .addLong("time", System.currentTimeMillis()).toJobParameters();
        try {
            JobExecution jobExecution = jobLauncher.run(job, jobParameters);
            System.out.println(jobExecution.getStatus());
        } catch (JobExecutionAlreadyRunningException | JobRestartException | JobInstanceAlreadyCompleteException | JobParametersInvalidException e) {
            e.printStackTrace();
        }
    }
}
