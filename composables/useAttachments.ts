import type { Attachment } from "@/types/kanban-types";

import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { copyFile, exists, mkdir, remove } from "@tauri-apps/plugin-fs";

import { generateUniqueID } from "@/utils/idGenerator";

const ATTACHMENT_DIR = "attachments";
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"];

const attachmentsDir = async () => join(await appDataDir(), ATTACHMENT_DIR);

export const isGifFile = (file: string) => file.toLowerCase().endsWith(".gif");

export const isImageFile = (file: string) =>
  IMAGE_EXTENSIONS.includes(file.split(".").pop()?.toLowerCase() ?? "");

// ids of linked attachments whose original file could not be found, shared by every component
const missingLinkIds = ref<Record<string, boolean>>({});

export const isAttachmentMissing = (attachment: Attachment) =>
  !!missingLinkIds.value[attachment.id];

export function useAttachments() {
  const urlCache = new Map<string, string>();

  const resolvePath = async (attachment: Attachment) =>
    attachment.path ?? join(await attachmentsDir(), attachment.file);

  // resolves the on-disk file of an attachment to a url the webview can load
  const getAttachmentUrl = async (attachment: Attachment) => {
    const path = await resolvePath(attachment);
    const cached = urlCache.get(path);
    if (cached) return cached;

    const url = convertFileSrc(path);
    urlCache.set(path, url);
    return url;
  };

  const pickAndStoreAttachments = async (
    mode: "copy" | "link" = "copy"
  ): Promise<Array<Attachment>> => {
    const selected = await open({
      multiple: true,
    });
    if (!selected) return [];

    const paths = Array.isArray(selected) ? selected : [selected];

    if (mode === "link") {
      return paths.map((path) => {
        const fileName = path.split(/[\\/]/).pop() ?? "file";
        return { file: fileName, id: generateUniqueID(), name: fileName, path };
      });
    }

    const dir = await attachmentsDir();
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
    }

    const stored: Array<Attachment> = [];
    for (const path of paths) {
      const fileName = path.split(/[\\/]/).pop() ?? "file";
      const id = generateUniqueID();
      // keeping the original name makes the file recognisable when revealed in the explorer
      const file = `${id}_${fileName.replace(/[<>:"/\\|?*]/g, "_")}`;

      try {
        await copyFile(path, await join(dir, file));
        stored.push({ file, id, name: fileName });
      } catch (e) {
        console.error("Failed to copy attachment", e);
      }
    }

    return stored;
  };

  const deleteAttachmentFile = async (attachment: Attachment) => {
    // linked originals belong to the user and are never deleted
    if (attachment.path) return;

    try {
      await remove(await join(await attachmentsDir(), attachment.file));
    } catch (e) {
      console.warn("Could not remove attachment file", e);
    }
  };

  // resolves to false only when a copied file is gone; a missing link is kept and just flagged
  const attachmentExists = async (attachment: Attachment) => {
    try {
      const present = await exists(await resolvePath(attachment));
      if (!attachment.path) return present;

      missingLinkIds.value[attachment.id] = !present;
      return true;
    } catch (e) {
      // an unreadable path must never hide a link
      console.warn("Could not check attachment", e);
      return !!attachment.path;
    }
  };

  const revealAttachment = async (attachment: Attachment) => {
    if (!(await attachmentExists(attachment))) return false;
    if (attachment.path && isAttachmentMissing(attachment)) return true;

    try {
      await revealItemInDir(await resolvePath(attachment));
    } catch (e) {
      console.error("Could not reveal attachment", e);
    }
    return true;
  };

  return {
    attachmentExists,
    deleteAttachmentFile,
    getAttachmentUrl,
    pickAndStoreAttachments,
    revealAttachment,
  };
}
