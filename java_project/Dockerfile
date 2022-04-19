FROM maven:3.8.3-openjdk-16 AS build
COPY pom.xml /app/
RUN mvn verify --fail-never
COPY src /app/src
RUN mvn -f /app/pom.xml clean package

FROM openjdk:16
COPY --from=build /app/target/*.jar /app.jar
ENTRYPOINT ["java","-jar","/app.jar"]