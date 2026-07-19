fixture <- file.path("services", "r-analytics", "fixtures", "sample_renewal_risk.csv")
data <- read.csv(fixture, stringsAsFactors = FALSE)

required_columns <- c("contract_id", "organization_id", "renewal_month", "annual_spend", "risk_band", "days_until_notice")
missing_columns <- setdiff(required_columns, names(data))
if (length(missing_columns) > 0) {
  stop(paste("Missing required columns:", paste(missing_columns, collapse = ", ")))
}

risk_order <- c("low", "medium", "high", "critical")
data$risk_band <- factor(data$risk_band, levels = risk_order, ordered = TRUE)
summary <- aggregate(contract_id ~ renewal_month + risk_band, data = data, FUN = length)
names(summary) <- c("renewal_month", "risk_band", "contract_count")
print(summary)
