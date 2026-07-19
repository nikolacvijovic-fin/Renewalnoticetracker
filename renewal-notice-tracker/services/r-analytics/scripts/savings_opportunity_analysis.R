fixture <- file.path("services", "r-analytics", "fixtures", "sample_savings_opportunities.csv")
data <- read.csv(fixture, stringsAsFactors = FALSE)

required_columns <- c("opportunity_id", "organization_id", "vendor", "annual_spend", "estimated_savings", "risk_band", "opportunity_type")
missing_columns <- setdiff(required_columns, names(data))
if (length(missing_columns) > 0) {
  stop(paste("Missing required columns:", paste(missing_columns, collapse = ", ")))
}

summary <- aggregate(cbind(annual_spend, estimated_savings) ~ organization_id + opportunity_type, data = data, FUN = sum)
summary$savings_rate <- round(summary$estimated_savings / summary$annual_spend, 4)
print(summary)
