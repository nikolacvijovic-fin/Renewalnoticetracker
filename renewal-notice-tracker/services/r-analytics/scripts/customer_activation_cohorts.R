fixture <- file.path("services", "r-analytics", "fixtures", "sample_renewal_risk.csv")
data <- read.csv(fixture, stringsAsFactors = FALSE)

required_columns <- c("contract_id", "organization_id", "renewal_month", "annual_spend", "risk_band", "days_until_notice")
missing_columns <- setdiff(required_columns, names(data))
if (length(missing_columns) > 0) {
  stop(paste("Missing required columns:", paste(missing_columns, collapse = ", ")))
}

data$activation_cohort <- ifelse(data$days_until_notice <= 30, "urgent_first_value", "standard_first_value")
summary <- aggregate(contract_id ~ organization_id + activation_cohort, data = data, FUN = length)
names(summary) <- c("organization_id", "activation_cohort", "contract_count")
print(summary)
