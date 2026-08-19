"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  generateShareSheet,
  shareSheetToHtml,
  shareSheetToTableHtml,
  springDataSheetFilename,
} from "@/lib/v2/dataSheet";
import type { DataSheetAudience, ShareSheetFormat } from "@/lib/v2/dataSheet";
import type { V2Candidate, V2Material, V2Scenario } from "@/lib/v2/types";

interface Props {
  candidate: V2Candidate;
  scenario: V2Scenario;
  material: V2Material;
  isOpen: boolean;
  onClose: () => void;
}

function downloadText(contents: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function DataSheetModal({ candidate, scenario, material, isOpen, onClose }: Props) {
  const [audience, setAudience] = useState<DataSheetAudience>("mechanism");
  const [format, setFormat] = useState<ShareSheetFormat>("table");
  const [copied, setCopied] = useState(false);
  const plainText = useMemo(
    () => generateShareSheet({ candidate, scenario, material }, audience),
    [candidate, scenario, material, audience],
  );
  const formattedHtml = useMemo(() => shareSheetToHtml(plainText), [plainText]);
  const tableHtml = useMemo(() => shareSheetToTableHtml(plainText), [plainText]);
  const clipboardHtml = format === "table" ? tableHtml : formattedHtml;

  const handleClose = useCallback(() => {
    setCopied(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const copy = async () => {
    if (navigator.clipboard.write && "ClipboardItem" in window) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([plainText], { type: "text/plain" }),
          "text/html": new Blob([clipboardHtml], { type: "text/html" }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(plainText);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="data-sheet-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-zinc-900/10">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-3.5">
          <div>
            <h2 id="data-sheet-modal-title" className="text-base font-semibold text-zinc-900">
              Share Spring Data
            </h2>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
              Choose a concise mechanism summary or a supplier quotation request
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="-mr-1 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="grid gap-2 border-b border-zinc-200 bg-zinc-50 px-5 py-3 sm:grid-cols-2">
          {([
            {
              value: "mechanism" as const,
              title: "Mechanism Summary — Internal Review",
              description: "Inputs, candidate performance, assumptions, and decisions to confirm.",
            },
            {
              value: "vendor" as const,
              title: "Vendor RFQ — Spring Supplier",
              description: "Nominal spring, loads at heights, vendor questions, and quote quantities.",
            },
          ]).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setAudience(option.value);
                setCopied(false);
              }}
              aria-pressed={audience === option.value}
              className={`rounded-lg border p-3 text-left transition-colors ${
                audience === option.value
                  ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                  : "border-zinc-200 bg-white hover:border-zinc-300"
              }`}
            >
              <span className="block text-[12.5px] font-semibold text-zinc-900">{option.title}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500">{option.description}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Format</span>
          <div className="flex overflow-hidden rounded-md border border-zinc-300 text-[11px]">
            {([
              { value: "table" as const, label: "Gmail Table" },
              { value: "text" as const, label: "Formatted Text" },
            ]).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setFormat(option.value);
                  setCopied(false);
                }}
                aria-pressed={format === option.value}
                data-testid={`share-format-${option.value}`}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  format === option.value
                    ? "bg-zinc-800 text-white"
                    : "bg-white text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 p-4">
          <div
            aria-label="Spring engineering data sheet preview"
            className="h-full min-h-[45vh] w-full overflow-y-auto rounded-lg border border-zinc-300 bg-white p-4 text-[12px] leading-relaxed text-zinc-800 [&_p]:mb-2 [&_strong]:font-semibold [&_strong]:text-zinc-950 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:space-y-0.5 [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: clipboardHtml }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-3">
          <span className="text-[11px] text-zinc-500">
            {audience === "mechanism" ? "Ready for internal mechanism review." : "Ready to send as an RFQ starting point."}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadText(plainText, springDataSheetFilename(candidate.key, "txt", audience), "text/plain;charset=utf-8")}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Download .txt
            </button>
            <button
              type="button"
              onClick={copy}
              className="rounded-md bg-emerald-700 px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-emerald-800"
            >
              {copied ? "Copied" : format === "table" ? "Copy Gmail Table" : "Copy Formatted Text"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
