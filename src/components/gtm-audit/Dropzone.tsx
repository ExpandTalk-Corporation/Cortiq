import { useRef, useState } from "react";
import { FileJson, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onFile: (file: File) => void;
  busy?: boolean;
}

/** Drop target and file picker for a GTM container export (.json). Reading happens in the parent. */
export function Dropzone({ onFile, busy }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = (files: FileList | null) => { if (!busy && files?.[0]) onFile(files[0]); };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
      className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${over ? "border-primary bg-primary/5" : "border-border"}`}
    >
      <FileJson className="h-10 w-10 text-primary" aria-hidden />
      <p className="font-medium">Drop your GTM container export here</p>
      <p className="text-sm text-muted-foreground">
        In Google Tag Manager: Admin → Export container → choose a version → Export. JSON, up to 5 MB.
      </p>
      <input ref={input} type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <Button onClick={() => input.current?.click()} disabled={busy}>
        <Upload className="mr-2 h-4 w-4" aria-hidden /> {busy ? "Reading…" : "Choose file"}
      </Button>
    </div>
  );
}
