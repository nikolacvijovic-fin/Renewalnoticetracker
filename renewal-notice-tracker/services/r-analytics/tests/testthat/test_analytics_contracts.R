test_that("renewal risk fixture has required columns", {
  fixture <- file.path("services", "r-analytics", "fixtures", "sample_renewal_risk.csv")
  data <- read.csv(fixture, stringsAsFactors = FALSE)
  expect_true(all(c("contract_id", "organization_id", "renewal_month", "annual_spend", "risk_band", "days_until_notice") %in% names(data)))
  expect_true(all(data$annual_spend >= 0))
})

test_that("savings opportunity fixture has required columns", {
  fixture <- file.path("services", "r-analytics", "fixtures", "sample_savings_opportunities.csv")
  data <- read.csv(fixture, stringsAsFactors = FALSE)
  expect_true(all(c("opportunity_id", "organization_id", "vendor", "annual_spend", "estimated_savings", "risk_band", "opportunity_type") %in% names(data)))
  expect_true(all(data$estimated_savings <= data$annual_spend))
})
