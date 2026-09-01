"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  LoaderCircle,
  RefreshCw,
  Trash2,
  UploadCloud
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MAX_CONTRACT_PDF_BATCH_FILES,
  MAX_CONTRACT_PDF_BYTES,
  PDF_UPLOAD_ERROR_MESSAGES,
  contractTitleFromPdfFileName,
  validateContractPdf,
  type PdfContractUploadActionResult
} from "@/lib/contracts/pdf-upload";

type UploadStatus =
  | "selected"
  | "uploading"
  | "extracting"
  | "success"
  | "partial"
  | "error";

type UploadItem = {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  retryable: boolean;
  safeMessage: string | null;
  result: Extract<PdfContractUploadActionResult, { ok: true }> | null;
};

type MemberOption = {
  userId: string;
  label: string;
};

type UploadCallbacks = {
  onUploadProgress: (progress: number) => void;
  onExtractionStarted: () => void;
};

function safeUploadFailure(): PdfContractUploadActionResult {
  return {
    ok: false,
    errorCode: "upload_failed",
    safeMessage: "The PDF could not be processed safely. Retry the upload or add the contract manually."
  };
}

export function uploadPdfContract(
  file: File,
  ownerUserId: string,
  callbacks: UploadCallbacks
): Promise<PdfContractUploadActionResult> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    const formData = new FormData();
    formData.set("file", file);
    formData.set("contractTitle", contractTitleFromPdfFileName(file.name));
    if (ownerUserId) formData.set("owner_user_id", ownerUserId);

    request.open("POST", "/api/contracts/pdf-upload");
    request.responseType = "text";
    request.withCredentials = true;
    request.timeout = 3 * 60_000;
    request.setRequestHeader("Accept", "application/json");
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      callbacks.onUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    });
    request.upload.addEventListener("load", callbacks.onExtractionStarted);
    request.addEventListener("error", () => resolve(safeUploadFailure()));
    request.addEventListener("abort", () => resolve(safeUploadFailure()));
    request.addEventListener("timeout", () => resolve({
      ok: false,
      errorCode: "upload_failed",
      safeMessage: "PDF processing timed out. Retry this file or add the contract manually."
    }));
    request.addEventListener("load", () => {
      try {
        const parsed = JSON.parse(request.responseText) as PdfContractUploadActionResult;
        if (typeof parsed !== "object" || parsed === null || !("ok" in parsed)) {
          resolve(safeUploadFailure());
          return;
        }
        resolve(parsed);
      } catch {
        resolve(safeUploadFailure());
      }
    });
    request.send(formData);
  });
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: UploadStatus) {
  switch (status) {
    case "selected":
      return "Ready to upload";
    case "uploading":
      return "Uploading";
    case "extracting":
      return "Extracting renewal fields";
    case "success":
      return "Ready for human review";
    case "partial":
      return "Uploaded; extraction needs attention";
    case "error":
      return "Upload failed";
  }
}

export function PdfUploadWorkbench({
  members,
  defaultOwnerUserId,
  canUpload,
  capacityMessage
}: {
  members: MemberOption[];
  defaultOwnerUserId: string;
  canUpload: boolean;
  capacityMessage: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const itemSequence = useRef(0);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [ownerUserId, setOwnerUserId] = useState(defaultOwnerUserId);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const completedCount = items.filter((item) => item.status === "success").length;
  const partialCount = items.filter((item) => item.status === "partial").length;
  const errorCount = items.filter((item) => item.status === "error").length;
  const readyCount = items.filter((item) => item.status === "selected").length;

  function addFiles(files: File[]) {
    setBatchMessage(null);
    const availableSlots = Math.max(0, MAX_CONTRACT_PDF_BATCH_FILES - items.length);
    const acceptedInput = files.slice(0, availableSlots);
    if (files.length > availableSlots) {
      setBatchMessage(PDF_UPLOAD_ERROR_MESSAGES.too_many_files);
    }

    const additions = acceptedInput.map((file): UploadItem => {
      const validation = validateContractPdf(file);
      itemSequence.current += 1;
      return {
        id: `pdf-${itemSequence.current}`,
        file,
        status: validation.ok ? "selected" : "error",
        progress: 0,
        retryable: validation.ok,
        safeMessage: validation.ok ? null : validation.safeMessage,
        result: null
      };
    });
    setItems((current) => [...current, ...additions].slice(0, MAX_CONTRACT_PDF_BATCH_FILES));
  }

  function updateItem(id: string, values: Partial<UploadItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...values } : item))
    );
  }

  async function processItem(item: UploadItem) {
    updateItem(item.id, {
      status: "uploading",
      progress: 0,
      safeMessage: null,
      result: null
    });
    const result = await uploadPdfContract(item.file, ownerUserId, {
      onUploadProgress: (progress) => updateItem(item.id, { progress }),
      onExtractionStarted: () => updateItem(item.id, { status: "extracting", progress: 100 })
    });

    if (!result.ok) {
      updateItem(item.id, {
        status: "error",
        progress: 0,
        retryable: !["invalid_file_type", "empty_file", "file_too_large"].includes(result.errorCode),
        safeMessage: result.safeMessage,
        result: null
      });
      return false;
    }

    updateItem(item.id, {
      status: result.extractionStatus === "extraction_failed" ? "partial" : "success",
      progress: 100,
      retryable: false,
      safeMessage: result.safeMessage,
      result
    });
    return true;
  }

  async function processBatch(selectedItems = items.filter((item) => item.status === "selected")) {
    if (selectedItems.length === 0 || isProcessing) return;
    setIsProcessing(true);
    setBatchMessage(null);
    let anyPersisted = false;
    for (const item of selectedItems) {
      anyPersisted = (await processItem(item)) || anyPersisted;
    }
    setIsProcessing(false);
    if (anyPersisted) router.refresh();
  }

  async function retryItem(item: UploadItem) {
    if (isProcessing || !item.retryable) return;
    setIsProcessing(true);
    const persisted = await processItem(item);
    setIsProcessing(false);
    if (persisted) router.refresh();
  }

  const batchSummary = isProcessing
    ? "Processing selected PDFs one at a time. Keep this page open."
    : completedCount || partialCount || errorCount
      ? `${completedCount} ready for review, ${partialCount} need extraction attention, ${errorCount} failed.`
      : items.length
        ? `${items.length} PDF${items.length === 1 ? "" : "s"} selected.`
        : "No PDFs selected yet.";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div
          role="button"
          tabIndex={canUpload && !isProcessing ? 0 : -1}
          aria-disabled={!canUpload || isProcessing}
          aria-label="Choose contract PDF files"
          onClick={() => canUpload && !isProcessing && inputRef.current?.click()}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && canUpload && !isProcessing) {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (canUpload && !isProcessing) addFiles(Array.from(event.dataTransfer.files));
          }}
          className="group flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-brand-200 bg-brand-50/40 px-6 py-10 text-center outline-none transition hover:border-brand-400 hover:bg-brand-50 focus-visible:ring-4 focus-visible:ring-brand-200 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-700 shadow-sm ring-1 ring-brand-100">
            <UploadCloud className="h-7 w-7" aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-xl font-semibold text-ink">Drop contract PDFs here</h2>
          <p className="mt-2 max-w-lg text-sm text-muted">
            Or press Enter to choose up to {MAX_CONTRACT_PDF_BATCH_FILES} files. Each PDF can be up to {MAX_CONTRACT_PDF_BYTES / (1024 * 1024)} MiB.
          </p>
          <p className="mt-3 text-xs font-medium text-brand-700">
            Extraction creates proposed fields. Human review is required before deadlines become trusted.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            disabled={!canUpload || isProcessing}
            className="sr-only"
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
        </div>

        <aside className="panel h-fit space-y-4 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Upload settings</p>
            <h2 className="mt-2 font-semibold text-ink">Accountable owner</h2>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Owner for this batch
            <select
              value={ownerUserId}
              onChange={(event) => setOwnerUserId(event.target.value)}
              disabled={isProcessing}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              <option value="">Leave unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>{member.label}</option>
              ))}
            </select>
          </label>
          <p className="text-xs leading-5 text-muted">
            Owner choices come only from the active organization. You can change the owner during review.
          </p>
          {!canUpload ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {capacityMessage}
            </div>
          ) : null}
        </aside>
      </div>

      <div aria-live="polite" role="status" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-muted">
        {batchMessage ?? batchSummary}
      </div>

      {items.length > 0 ? (
        <section aria-label="Selected PDF contracts" className="space-y-3">
          {items.map((item) => {
            const active = item.status === "uploading" || item.status === "extracting";
            return (
              <article key={item.id} className="panel overflow-hidden p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      {active ? (
                        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                      ) : item.status === "success" ? (
                        <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
                      ) : item.status === "partial" || item.status === "error" ? (
                        <AlertCircle className="h-5 w-5 text-critical" aria-hidden="true" />
                      ) : (
                        <FileText className="h-5 w-5" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <h3 className="break-all text-sm font-semibold text-ink">{item.file.name}</h3>
                      <p className="mt-1 text-xs text-muted">{formatFileSize(item.file.size)} · {statusLabel(item.status)}</p>
                      {item.safeMessage ? <p className="mt-2 text-sm text-slate-600">{item.safeMessage}</p> : null}
                      {item.result?.reviewReasons.length ? (
                        <p className="mt-2 text-xs text-amber-800">
                          Review flags: {item.result.reviewReasons.join(", ").replaceAll("_", " ")}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {item.result ? (
                      <Button asChild variant="secondary">
                        <Link href={item.result.contractPath}>Review contract</Link>
                      </Button>
                    ) : null}
                    {item.status === "error" && item.retryable ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="gap-2"
                        disabled={isProcessing}
                        onClick={() => retryItem(item)}
                        title={`Retry ${item.file.name}`}
                        aria-label={`Retry ${item.file.name}`}
                      >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        Retry
                      </Button>
                    ) : null}
                    {!active && !item.result ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="gap-2"
                        disabled={isProcessing}
                        onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))}
                        title={`Remove ${item.file.name}`}
                        aria-label={`Remove ${item.file.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>

                {active ? (
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`${statusLabel(item.status)} progress`}>
                    <div
                      className={`h-full rounded-full bg-brand-600 transition-all ${item.status === "extracting" ? "animate-pulse" : ""}`}
                      style={{ width: `${item.status === "extracting" ? 100 : item.progress}%` }}
                    />
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : (
        <div className="panel px-6 py-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <h2 className="mt-3 font-semibold text-ink">Your upload queue is empty</h2>
          <p className="mt-1 text-sm text-muted">Choose one or more contract PDFs to begin.</p>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="ghost" className="w-full sm:w-auto">
          <Link href="/dashboard/saas-opt-out-clock">Back to Opt-Out Clock</Link>
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row">
          {(completedCount > 0 || partialCount > 0) ? (
            <Button asChild variant="secondary" className="w-full sm:w-auto">
              <Link href="/dashboard/saas-opt-out-clock">View updated clock</Link>
            </Button>
          ) : null}
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={!canUpload || isProcessing || readyCount === 0}
            onClick={() => processBatch()}
          >
            {isProcessing ? "Processing PDFs…" : `Upload ${readyCount || "selected"} PDF${readyCount === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
