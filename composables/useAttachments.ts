import type { Attachment } from "@/types/kanban-types";

import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { copyFile, exists, mkdir, remove } from "@tauri-apps/plugin-fs";

import { generateUniqueID } from "@/utils/idGenerator";
import { projectDir, relativeInside } from "@/utils/projectPaths";

const ATTACHMENT_DIR = "attachments";
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"];

// folder of the project board that is currently open; null means the app data folder is used
const activeProjectDir = ref<string | null>(null);

export const setActiveProjectDir = (dir: string | null) => {
  activeProjectDir.value = dir;
};

export const getActiveProjectDir = () => activeProjectDir.value;

const attachmentsDir = async () =>
  join(activeProjectDir.value ?? (await appDataDir()), ATTACHMENT_DIR);

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
    mode: "copy" | "link" | "folder" = "copy"
  ): Promise<Array<Attachment>> => {
    const selected = await open({
      directory: mode === "folder",
      multiple: true,
    });
    if (!selected) return [];

    const paths = Array.isArray(selected) ? selected : [selected];

    if (mode === "link" || mode === "folder") {
      return paths.map((path) => {
        const fileName = path.split(/[\\/]/).filter(Boolean).pop() ?? "file";
        return {
          directory: mode === "folder" || undefined,
          file: fileName,
          id: generateUniqueID(),
          name: fileName,
          path,
        };
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

  // name of the file inside the attachments folder that an entry points at, if any
  const storedFileName = (attachment: Attachment, dir: string) =>
    attachment.path ? relativeInside(dir, attachment.path) : attachment.file;

  // true when another card in the same storage location still points at the same stored file
  const isStoredFileShared = (attachment: Attachment, dir: string) => {
    const target = storedFileName(attachment, dir)?.toLowerCase();
    if (!target) return false;

    for (const board of useBoardsStore().boards) {
      const boardDir = board.projectPath ? projectDir(board.projectPath) : null;
      if (boardDir !== activeProjectDir.value) continue;

      for (const column of board.columns) {
        for (const card of column.cards) {
          for (const other of card.attachments ?? []) {
            if (other.id === attachment.id) continue;
            if (storedFileName(other, dir)?.toLowerCase() === target) return true;
          }
        }
      }
    }
    return false;
  };

  // call after the entry was removed from its card; the file is only deleted once nothing else uses it
  const deleteAttachmentFile = async (attachment: Attachment) => {
    try {
      const dir = await attachmentsDir();
      const name = storedFileName(attachment, dir);
      // linked originals outside the attachments folder belong to the user and are never deleted
      if (!name || isStoredFileShared(attachment, dir)) return;

      await remove(await join(dir, name));
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

  // opens the file or folder with its default app, or only shows it in the explorer when reveal is set
  const revealAttachment = async (attachment: Attachment, reveal = true) => {
    if (!(await attachmentExists(attachment))) return false;
    if (attachment.path && isAttachmentMissing(attachment)) return true;

    try {
      const path = await resolvePath(attachment);
      if (reveal) await revealItemInDir(path);
      else await openPath(path);
    } catch (e) {
      console.error("Could not open attachment", e);
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
