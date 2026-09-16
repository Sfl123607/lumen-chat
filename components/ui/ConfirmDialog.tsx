"use client";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", danger }: Props) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} className="sm:max-w-md">
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}
