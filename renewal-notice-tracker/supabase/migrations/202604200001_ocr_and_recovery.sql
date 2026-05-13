alter table public.contract_files
  add column if not exists extraction_source text not null default 'native_text',
  add column if not exists ocr_provider text null,
  add column if not exists ocr_status text null,
  add column if not exists ocr_confidence numeric null,
  add column if not exists ocr_detected_needed boolean not null default false;

alter table public.extracted_field_evidence
  add column if not exists source text not null default 'extraction';
