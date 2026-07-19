fixture <- file.path("services", "r-analytics", "fixtures", "sample_renewal_risk.csv")
data <- read.csv(fixture, stringsAsFactors = FALSE)

required_columns <- c("contract_id", "organization_id", "renewal_month", "annual_spend", "risk_band", "days_until_notice")
missing_columns <- setdiff(required_columns, names(data))
if (length(missing_columns) > 0) {
  stop(paste("Missing required columns:", paste(missing_columns, collapse = ", ")))
}

summary <- aggregate(annual_spend ~ renewal_month, data = data, FUN = sum)
names(summary) <- c("renewal_month", "forecast_annual_spend")
print(summary)
